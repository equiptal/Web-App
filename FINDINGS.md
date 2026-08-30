# FINDINGS — open fix queue

The working queue for the fixing session that follows a run. Only open entries live here. When a
fix lands, strike the entry through with the commit that closed it rather than deleting it, so a
defect that comes back is visibly a regression and not a new discovery.

---

## Run · 2026-08-30 · renter-projects + create + request · staging

**3 fixes — 2 blocker, 1 major.** Two are in the backend and cannot be fixed from this repo.

---

### FIX-PROJ-1 · Awarding is impossible: every award write answers 500

| | |
|---|---|
| **Case** | PROJ-API-09, PROJ-API-10 |
| **Severity** | **blocker** — the feature's whole purpose is recording who supplies what, and none of it can be saved |
| **Where** | `Moedatech-App/apps/backend-agents/src/handlers/agents/projects/awards/createAward.ts` |
| **Expected** | `201 { award, version }` |
| **Actual** | `500 { code: "INTERNAL_ERROR", message: "Request failed" }` |
| **Cause** | **unknown.** Narrowed, not guessed — see below. |
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

### FIX-PROJ-2 · A work order can never be created with its awards

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
once this lands the path works with no web change. Until then, awards entered in the work-order form
are silently dropped — the order saves, the suppliers do not.

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

## Observed once, not reproduced — no fix entry

**A single `403` on the dashboard's first paint** (PROJ-UI-01, first run). Four subsequent runs were
clean, and the browser console gives no URL for it. Recorded here so a second sighting is a pattern
rather than a first discovery; the spec now logs the URL behind any failed request, so the next one
will name itself.
