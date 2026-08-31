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

---

## Run · 2026-08-31 · renter projects, board + intake · staging, browser

**3 fixes — 1 major, 2 minor. All three closed in this session.** Kept as struck entries rather than
deleted, so any of them coming back reads as a regression.

---

### ~~FIX-PROJ-4 · The row menu's last two entries were rendered, focusable, and invisible~~ — closed by `1a51baf`

| | |
|---|---|
| **Case** | UAT F1; blocks E7 and *Change the award* |
| **Severity** | major — a renter could not reach a documented action, including the destructive one |
| **Where** | `src/components/projects/RowMenu.tsx` |
| **Expected** | six entries reachable, the red *Remove from the project* last |
| **Actual** | four visible; *Change the award* at 725px and *Remove from the project* at 756px, inside a container ending at **702px** |
| **Cause** | **confirmed.** The chart body is `max-h-[64vh] overflow-y-auto`. The menu was `absolute`, so that box clipped it, while the flip logic measured `window.innerHeight` — the wrong ruler. Flipping could not have saved it either: a 207px list fits on neither side of a box leaving ~155px below the row and ~81px above. |
| **Fix** | `position: fixed`, placed from the trigger's rect, clamped to the viewport, inline-end aligned and mirrored for Arabic; re-placed on scroll (capture) and resize. |
| **Risk** | `fixed` resolves against a transformed ancestor instead of the viewport. Checked on staging before writing it: nothing above the trigger sets `transform`, `filter`, `perspective`, `contain` or `will-change`. |
| **Ruling** | none needed — the entries were asked for by name |

**Why no test caught it.** The entries were in the DOM and had accessible names, so every existing
assertion passed. Only geometry could see it. The new tests pin the layer as `fixed` and not
`absolute`, which is the property that made the difference.

---

### ~~FIX-PROJ-5 · The award dialog could not record mobilization or demobilization~~ — closed by `d615634`

| | |
|---|---|
| **Case** | UAT F2, D2 |
| **Severity** | minor by the scale — no wrong number is shown; money simply cannot be entered |
| **Where** | `src/components/projects/AwardDialog.tsx` |
| **Expected** | the work order's three money boxes: rate, mobilization, demobilization, and a line total |
| **Actual** | rate only |
| **Cause** | **confirmed.** The dialog was written before the work order's supplier row gained the haulage fields and was never brought level. |
| **Fix** | Both boxes plus the line total, importing `lineTotal` from `WorkOrderForm` rather than re-deriving `(rate + mob + demob) × units`. Amounts omitted when blank, never sent as 0. |
| **Risk** | None known. The deployed backend already accepts and stores both — probed before the UI was written: `201`, read back `mobAmt=1200 demobAmt=800`. |
| **Ruling** | the owner's own words: the award should open *"the supplier section that exists in the work modal"* |

---

### ~~FIX-PROJ-6 · A work-order template said "terms copied" and copied nothing~~ — closed by `6511153`

| | |
|---|---|
| **Case** | UAT A6 |
| **Severity** | minor by the scale, and the most dishonest of the three: it stated that it had done the thing it had not done |
| **Where** | `src/lib/api/client.ts` — `listWorkOrders`, `fetchTemplateTerms` |
| **Expected** | the generator's own answers: delivery **Me**, year **2022**, operator **No** |
| **Actual** | four empty pills under a label reading *terms copied*, and OPERATOR showing **Yes** |
| **Cause** | **confirmed, two bugs in a row.** (1) `listWorkOrders` handed the backend's already-grouped `{ workOrders: [...] }` to `groupWorkOrderItems`, which expects a flat array — every group id came back `undefined`, the lookup matched nothing, and `null` was returned, so no terms were ever copied. (2) Fixing that exposed a double conversion: `listWorkOrders` maps the blob into `MachineTerms` and `fetchTemplateTerms` ran `termsFromWire` over the result, reading wire keys off app-shaped data and answering a fully blank object. |
| **Fix** | Read the real payload shape; return `row.terms` without converting twice. |
| **Risk** | The same lookup feeds `startEditOrder`, which is why the refusal-to-open surfaced it at all. Both paths re-verified on staging. |
| **Ruling** | none needed |

**The second bug was mine, introduced by the first fix.** Worth recording as such: the blank object it
produced was *worse* than the `null` it replaced, because `null` renders no pills and claims nothing
while a blank renders four empty answers under a label saying they were copied. The tests added with
it assert values rather than shape, and were confirmed to fail against the double conversion before
being committed.

## Observed once, not reproduced — no fix entry

**A single `403` on the dashboard's first paint** (PROJ-UI-01, first run). Four subsequent runs were
clean, and the browser console gives no URL for it. Recorded here so a second sighting is a pattern
rather than a first discovery; the spec now logs the URL behind any failed request, so the next one
will name itself.
