# Where this stopped — 2026-08-06

> ## ⛔ SUPERSEDED — 2026-08-09. A snapshot of 2026-08-06, not the current state.
>
> Work continued past this pause and the surface was **rescoped**: spec 001 was replaced by
> [`../../specs/004-deal-room-equipment-verification.md`](../../specs/004-deal-room-equipment-verification.md),
> and the T-ticket set by the V-tickets. **For where things actually stand, read
> [`tickets.md`](tickets.md); for why each T-ticket lives or dies, [`replan-v3.md`](replan-v3.md).**
>
> Kept because its **"Two things not to undo by accident"** (`:53-60`) are still load-bearing and are
> stated nowhere else. Its **"Done"** list is not: two of the tickets it reports as done have since been
> **withdrawn from the code** — see the strike at `:18-21`. Counts, branch commit numbers and the "Next,
> in order" list are all out of date.

Paused deliberately at a clean tree so branches can be switched. **Nothing is pushed. No PR exists.**

## Branches

| Repo | Branch | RMAP commits |
|---|---|---|
| `Web-App` | `web/deal-room-rentee-map` | 12 (off `staging`) |
| `Moedatech-App` | `backend/deal-room-rentee-map` | 10 (off `staging`) |

Both trees are clean of RMAP work. In `Web-App`, `docs/web-work-plan.md` (modified) and
`docs/specs/003-supplier-deal-room.md` (untracked) are **someone else's WIP**, untouched by this work —
they will follow you across a branch switch.

## Done — 16 tickets

**Backend, feature-complete:** T1 per-unit location · T2 `unitsOffered` ownership · T3 bid coordinates
+ golden file · T4 ownership documents renter-visible · T5 the supplier-fleet endpoint · T6 the
`rentee_request` card, unread and coalesced notifications · T7 `city` + `contactInfo` projected ·
**T37** per-unit `yardId` ownership (security) · **T44** the trial-request 404.

**Web:** T8 contract types + `supplierCompanyId` grouping · T9 `bid-map.ts` selectors · T10 their tests ·
T11 the list/map toggle · T12 workspace + canvas · T13 bid list · T15 colour key · **T16 machine pins**
(BFF route, `fleet.ts`, client, `computeUnitReadiness`, de-collision) · **T34** the VAT-sum defect ·
**T35** the em-dash rows.

**Checks at the pause:** `Web-App` — tsc clean, **469 passing**, eslint clean. `apps/backend` — typecheck
**89 → 89** (the repo has no clean baseline; 2 suites fail at HEAD, pre-existing and proven so).

## Next, in order

1. **T17** footer — re-host the shipped `DealRoom` bar; two copy changes only; the **no-room** case is
   the common one and selecting a bid must never create a room.
2. **T18–T23 + T33** machine panel, three tabs, composition bar, rail.
3. **T29–T32** off-platform hosting.
4. **T36** remove the shipped 50 km refine (visible change — confirm with product).
5. **T38–T43** the verification gates, per module.

Serialise the web tranches: they all touch `i18n/{en,ar}.ts` and `map-proto.css`, and parallel agents
there produce conflicts neither can see.

## Waiting on you

| | |
|---|---|
| **T41, the visual pass** | The only thing no test can do. Every suite can be green and the UI still wrong |
| **Agent decision lists** | Each tranche resolved ambiguities rather than stalling. Cheap to overturn now, expensive after the panel builds on them |
| **Deal room in a CLOSED state** | Posting a request into one 500s instead of 409ing. Needs a product rule before it can be coded |
| **`ref` uniqueness** | 16 bits, no table, so no constraint. Fine within one conversation; not globally quotable |
| **Push / PR** | Nothing has left the local branches |

## Two things not to undo by accident

- **`_offeredUnitEntries` in `bid_form_bloc.dart:1570` must keep emitting `{itemId, equipmentId}` with
  NO yard.** Adding `yardId` there would turn nearly every bid green on arrival and destroy the map's
  only signal — green means *the supplier came back through readiness for this bid*.
- **Nothing may read the `yardConfirmed` boolean for colour.** Supplier-side it is `yardId != null`, so
  it is true for every readiness-written entry. The colour comes from `locationSource` via
  `unitAvailability`, and both call sites say so.
