# FINDINGS — open fix queue

The working queue for the fixing session that follows a run. Only open entries live here. When a
fix lands, strike the entry through with the commit that closed it rather than deleting it, so a
defect that comes back is visibly a regression and not a new discovery.

---

## Run · 2026-08-30 · renter-projects + create + request · staging

**3 fixes — 2 blocker, 1 major. All three closed.** The two backend ones landed in `f95c1e50` and
are deployed: awarding was verified end to end on staging on 2026-08-31, and the same call that used
to answer `500` now answers `409 UNITS_EXCEED_QUANTITY` — the refusal it should always have given.

---

### ~~FIX-PROJ-1 · Awarding is impossible: every award write answers 500~~ — closed by `f95c1e50`

| | |
|---|---|
| **Case** | PROJ-API-09, PROJ-API-10 |
| **Severity** | **blocker** — the feature's whole purpose is recording who supplies what, and none of it can be saved |
| **Where** | `Moedatech-App/apps/backend-agents/src/handlers/agents/projects/awards/createAward.ts` |
| **Expected** | `201 { award, version }` |
| **Actual** | `500 { code: "INTERNAL_ERROR", message: "Request failed" }` |
| **Cause** | **found.** `mintAwardId` in `project-awards.service.ts` called a bare `crypto.randomUUID()` with no import. Under Node's Lambda runtime `crypto` is not a global, so every award write threw a `ReferenceError` before it reached the transaction — which is exactly why the stale-version probe below threw instead of answering 409. |
| **Fix** | Read the CloudWatch log for the failing invocation. The handler catches through `mapAwardError(err) ?? logHandlerError(...)`, so the trace is recorded; nothing else here can see it. |
| **Risk** | — |
| **Ruling** | none needed; a 500 is never correct |

**What the probes establish.** Zod runs and rejects properly (`{}` without `rentalBasis` → `422 fieldErrors.rentalBasis: ["Required"]`). Everything past validation throws:

| probe | expected | actual |
|---|---|---|
| valid award on a real work-order machine | 201 | **500** |
| award naming a non-existent machine | 422 from `validateAwards` | **500** |
| award with a stale `expectedVersion` | 409 `PROJECT_VERSION_STALE` | **500** |

The stale-version probe is the informative one: the throw happens **before** `mutateAwards` reaches
its `updateMany`, because that path returns a mapped 409 rather than throwing. So the fault sits in
`loadVisibleProject`, `mintAwardId`, `awardsSchema.parse`, or the opening of
`prisma.$transaction(run)` — an interactive transaction, which is the one thing there that behaves
differently on a pooled Lambda connection than on a laptop.

Ruled out by reading: the award object the handler builds matches `awardSchema` field for field,
including `documentIds` and `awardedBy`, so `awardsSchema.parse` has nothing to reject. The `awards`
column exists and reads correctly — `GET /api/projects/{id}` returns `"awards":{"requests":{},"workOrderItems":{}}`.

**Reproduce:**

```
POST /api/projects/{id}/awards
{ "workOrderItemId": "<a real item on that site>", "supplierName": "Zahid Tractor",
  "units": 2, "rentalBasis": "monthly", "rateAmount": 8600, "expectedVersion": <current> }
```

---

### ~~FIX-PROJ-2 · A work order can never be created with its awards~~ — closed by `f95c1e50`

| | |
|---|---|
| **Case** | PROJ-API-06 |
| **Severity** | **blocker** — with FIX-PROJ-1 open, there is no path at all by which an award reaches the database |
| **Where** | `Moedatech-App/apps/backend-agents/src/handlers/agents/work-orders/createWorkOrder.ts:63` |
| **Expected** | `201`, awards written into `project.awards.workOrderItems[itemId]` |
| **Actual** | `422 fieldErrors.items: ["Unrecognized key(s) in object: 'supplyLines'"]` |
| **Cause** | **confirmed.** The schema is `workOrderItemSchema.and(z.object({ supplyLines: … }))`. A zod intersection parses the data against **both** halves, and the left half is `.strict()` — so it rejects `supplyLines` as an unknown key before the right half is ever consulted. The key can never be accepted. |
| **Fix** | Replace the intersection with an extension: `workOrderItemSchema.extend({ supplyLines: z.array(supplyLineSchema).optional() })`, which carries the strictness forward over the wider key set. One line. |
| **Risk** | None known. `.extend()` on a strict object stays strict, so no other unknown key becomes admissible. |
| **Ruling** | none needed |

**Evidence.** The identical request minus `supplyLines` returns `201 {"workOrderGroupId":"531556a4…","itemIds":["e9e3cdd9…"],"version":3}`.

**Web already adapts.** `workOrderPayload(draft, { create })` sends `supplyLines` only on create, so
once this lands the path works with no web change.

**Until then the whole save fails, not just the awards.** `supplyLines` is sent only when the renter
filled at least one supplier line, and the 422 refuses the entire request — so the work order, its
machines and its period are all lost with it. A renter who leaves every supplier blank can still
create the order; a renter who fills one in gets nothing saved.

---

### ~~FIX-PROJ-3 · Deleting a site reports a network failure after succeeding~~ — closed by `e2bc63b`

| | |
|---|---|
| **Case** | PROJ-API-17 |
| **Severity** | major — the action succeeded, so no data was lost, but the renter is told the opposite |
| **Where** | `src/lib/api/agents-relay.ts:86`, `src/lib/api/client.ts:763` |
| **Expected** | `204`, and the site disappears from the list |
| **Actual** | `502 {"code":"upstream_unreachable"}` in 0.33s — far too fast to be the timeout it claims |
| **Cause** | **confirmed.** `deleteProject` answers `204` with an empty body. `NextResponse.json(body, { status: 204 })` throws, because a 204 may not carry one, and the throw was caught by the relay's outer `catch` and reported as a dead upstream. The client had the mirror fault: `res.json()` on an empty body rejects. |
| **Fix** | Return `new NextResponse(null, { status })` for 204/205/304 in the relay; return `undefined` for 204 in `projectFetch`. Done. |
| **Risk** | None known — `deleteProject` is the only endpoint in this feature that answers 204. |

**How it was caught.** A second delete of the same id returned `NOT_FOUND`, proving the first had
worked. No schema check could have found this: the shape was right and the **status** was the
problem, which only a real call has.

---

---

## Run · 2026-08-31 · pricing golden set · unit

**3 fixes — 3 blocker.** Money is wrong on all three, which is the top of the severity scale by
itself. None is in the renter-projects feature; all three were found by the golden pricing set added
alongside it, and all three predate it.

Each has a failing test that names its ruling. The tests are marked `it.fails`, so the suite is green
while the defect stands and **turns red the moment one is fixed** — that is the signal to come back
here and strike the entry, and it is the only encoding that keeps a red suite from hiding a real
regression behind three known ones.

---

### FIX-MONEY-1 · The comparison prorates over calendar days, so the agent ranks bids on numbers the renter never sees

| | |
|---|---|
| **Case** | `agreement-money.test.ts` · *the comparison excludes Fridays, like every other surface* |
| **Severity** | **blocker** — money wrong, and two surfaces state different facts about one bid |
| **Where** | `src/lib/contract/comparison.ts:80` (`computeRental`) |
| **Expected** | `81,000` — the rental every other surface shows for this bid |
| **Actual** | `93,000` — 12,000 SAR higher, 14.8% |
| **Cause** | **confirmed.** `computeRental` takes no start date, so it cannot locate the Fridays and prorates over **calendar** days. `rental.ts` exists to end exactly this: its own header records that the web once had three hand-rolled divisor copies and *none of which excluded Fridays*. This one was half-fixed — `daysPerPeriod` now delegates to `rentalDivisor`, so the 6-vs-7 week error is gone — but it never calls `computeRentalTotal`. |
| **Fix** | Give `computeRental` the request's start date and call `computeRentalTotal`, deleting the divisor arithmetic. `buildItemComparison` already receives `requestStartDate`; it simply does not pass it down. |
| **Risk** | Every comparison number moves, downward, to agree with the card. Any stored recommendation made under the old figures is stale — `recommendBids` reads this, so the ranking itself can change, not just the display. Check nothing snapshots a comparison total. |
| **Ruling** | **R-03b** — open defect, and R-03's decision explicitly does not cover it |

**Why this one is worse than its size.** `buildItemComparison` feeds `recommendBids`. The agent
recommends on 93,000 while the renter reads 81,000 on the card that opened it, so a recommendation
can invert on the arithmetic alone — and nothing on either surface shows the disagreement.

---

### FIX-MONEY-2 · `vatLines` derives VAT from a stored gross, against the settled rule

| | |
|---|---|
| **Case** | `golden-pricing.test.ts` · *multiplies, even where a gross was stored (R-01b, ruled)* |
| **Severity** | **blocker** — a VAT line is a tax figure; wrong is wrong at any size |
| **Where** | `src/lib/contract/vat-inclusive.ts:67–70` |
| **Expected** | VAT `600.00` on a subtotal of `4,000.00` — multiply, per R-01b |
| **Actual** | VAT `600.01`, derived as `storedGross − subtotal` |
| **Cause** | **confirmed.** `const total = storedGross ?? subtotal * (1 + VAT_RATE)` prefers the stored gross and then takes VAT by subtraction, so the supplier's own rounding lands in the tax line. |
| **Fix** | Drop the derived path: always `subtotal × VAT_RATE`. R-01b's words are *“`vatLines` loses its derived path”*. |
| **Risk** | **A test asserts the opposite.** `tests/unit/vat-inclusive.test.ts:121` — *the breakdown must reconcile with the STORED total (RMAP-AC-216)* — pins the current behaviour to an acceptance criterion. R-01b post-dates it and rules the other way, so that spec and its criterion must be retired in the same commit, not deleted quietly. |
| **Ruling** | **R-01b** — *multiply. `subtotal × 0.15`, every surface, stored gross or not.* |

**The collision is the finding.** Two written authorities disagree: RMAP-AC-216 says reconcile with
what the supplier sent, R-01b says one rule across the platform and matches the app. R-01b wins on
date and on the app being the source of truth — but nobody has told RMAP-AC-216, and until somebody
does, whichever way `vatLines` is written contradicts something in writing.

---

### FIX-MONEY-3 · Cycle totals round each component mid-computation, the bug mobile already removed

| | |
|---|---|
| **Case** | `golden-pricing.test.ts` · *carries full precision into the total, rounding only at the end (R-02)* |
| **Severity** | **blocker** by the scale — money wrong; smallest of the three in size |
| **Where** | `src/lib/contract/cycle-totals.ts:88` |
| **Expected** | `38,215.38` — `(16,000 ÷ 26 × 54) × 1.15`, rounded once, at the end |
| **Actual** | `38,215.39` — one halala high |
| **Cause** | **confirmed.** `const subtotal = money(rental + oneOff); const vat = money(subtotal * VAT_RATE)` rounds every component, then sums the rounded parts. |
| **Fix** | Carry the raw product and round only where it prints, matching `vatOn` in the app. |
| **Risk** | Low and broad: every cycle figure can move by a halala. Golden expectations that encode the doubly-rounded value will need updating — update them to the exact figure, do not relax the assertion. |
| **Ruling** | **R-02** — the app is explicit above `vatOn`: *“Deliberately NOT rounded”*, because `deal_room_pricing.dart` rounding here meant *“the same deal could read a riyal apart between the room and the card that opened it”*. The web still does what the app removed. |

---

## Observed once, not reproduced — no fix entry

**A single `403` on the dashboard's first paint** (PROJ-UI-01, first run). Four subsequent runs were
clean, and the browser console gives no URL for it. Recorded here so a second sighting is a pattern
rather than a first discovery; the spec now logs the URL behind any failed request, so the next one
will name itself.
