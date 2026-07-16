# Deal Room Negotiation — Web (renter web) Handoff

**For:** the renter-web work in `src/components/deal-room/DealRoom.tsx` + `DealRoomTerms.tsx` + the BFF/API client.
**Backend:** the **shared** `apps/backend` (Moedatech-App, branch `deal-room/negotiation`, PR #481) — **already implemented + tested (34 tests), NOT deployed, migration NOT applied.** This doc is the widened contract the web builds against; it's identical to what the Flutter app consumes.
**Design source:** the prototype `Deal Room - Chat.dc.html` + `spec-final.md` (both in this folder).

> **UI redesign of the EXISTING web deal room — not a rebuild.** Reuse everything unless noted. Today the web uses a **single unit count** (`units = room.numberOfUnits`, mob/demob × units) and a Terms→Price→Summary flow; the work is to adopt per-type units + the new fields.

---

## A. Backend contract (what the API now gives/takes) — shipped, additive/optional

### A1. `getDealRoom` payload — new fields
- `agreedUnits: number|null` — matched **rental** count (the only count that drives coverage). `null` = single-supplier/single-unit "full request".
- `mobUnits: number|null`, `demobUnits: number|null` — matched mob/demob counts (each ≤ `agreedUnits`).
- `mobExcluded: boolean`, `demobExcluded: boolean` — persisted leg exclusion (both-sided). Render the excluded state from **these**, not local UI state.
- `request.shortCode` — **REQ-NNNNN** header label. *(No RFQ- group code — not wired.)*
- **Phone (server-gated):** `supplier.phone` **always** present; `rentee.phone` present **only when `status === 'CLOSED'`**. No `validUntil`/سريان.

### A2. `proposeRate` (counter) — new optional body fields
`rentalUnits?`, `mobUnits?`, `demobUnits?` (pending per-type counts — **ride the `rate_proposal` chat message, not persisted** until accept), `mobExcluded?`, `demobExcluded?` (persisted immediately; `true` also nulls the stale proposed price; `false` restores + send the price).

### A3. `acceptDeal` / `acceptAllTerms` — new optional body fields
`mobUnits?`, `demobUnits?`, `mobExcluded?`, `demobExcluded?` (+ existing `agreedUnits?` = matched rental). Accept cap is now `min(requested, remaining)` (step-up above offered allowed). `mob/demob ≤ rental` validated. `agreedUnits` persists only for `MULTIPLE_SUPPLIERS` multi-unit (else stays null); mob/demob persist for all deals.

### A4. `rate_proposal` chat message — enriched
Carries `mobPrice`, `demobPrice`, `rentalUnits`, `mobUnits`, `demobUnits`, `mobExcluded`, `demobExcluded` (+ existing `proposedRate`/`priceUnit`/`status`/`proposedByRole`). **Source for per-round history / deltas / activity log — no `counter_offers` table.**

### A5. Quotation billing — prorated ÷26 (done)
Backend rental line = **monthly `rate÷26×days`, weekly `rate÷7×days`, daily `rate×days`** (was `rate×ceil(days/30)`). The web's live in-room total must match: `FREQ_DAYS = {daily:1, weekly:7, monthly:26}`, prorated.

### A6. Retired terms — do NOT render
`operator_nationality`, `operator_certification`, `safety_certifications`, `mobilization_lead_time` are stripped from the deal room by the backend.

---

## B. Web tickets (build against the above)

1. **Contract adoption (client + types):** add the new payload fields (`agreedUnits`/`mobUnits`/`demobUnits`/`mobExcluded`/`demobExcluded`/`request.shortCode`, gated `rentee.phone`) to the `DealRoomView` type + `@/lib/api/client`; extend `proposeRate`/`acceptDeal` params with the new optional fields.
2. **Per-type unit steppers (العدد):** symmetric stepper for rental/mob/demob (cap = requested; mob/demob ≤ rental); a change is a counter (send via `proposeRate` unit params); other side's pill = orange/pending or green/matched; accept-or-match. **Close gate: all three matched** (client-enforced). Pending value reads from the latest `rate_proposal` message; matched from `agreedUnits`/`mobUnits`/`demobUnits`.
3. **Mob/demob leg exclusion:** ✕ cancel / + restore on mob/demob rows → send `mobExcluded`/`demobExcluded` (not a bare `mobPrice: null`); render the persisted excluded state ("غير مشمول") for both roles from the flags.
4. **Price math (÷26 prorated) + per-type totals:** rental = `(rate ÷ FREQ_DAYS[unit]) × duration × rentalUnits` (open mode: `rate × units`); mob = `mobPrice × mobUnits`, demob = `demobPrice × demobUnits` (0 when excluded); subtotal + **15% VAT** (client). Total always multiplies by the **current** unit counts (live). *(Quotation PDF recompute is Fadwa's; the web renders live from the fields.)*
5. **Role-aware call lock:** rentee unlocked from start (`supplier.phone` always present); supplier locked until CLOSED (`rentee.phone` absent until then). Not a single symmetric flag.
6. **Header code:** `request.shortCode` (REQ-NNNNN).
7. **Terms — KEEP the existing classification/display** (3 tiers: `disputed`/`pending`+`soft_accepted`/`agreed`; `fixed`/acknowledged read-only reference). `soft_accepted` = pending/review (NOT matched). Retired 4 terms (A6) not rendered. `payment_terms` = when-payment-is-due (negotiable); `payment_method` deprecated → method selector display-only or omit.
8. **Activity log + counter-comparison card:** derive per-round data from the enriched `rate_proposal` messages (A4).
9. **First-run tour** (prototype) — web-only, no backend.

**Deferred (Fadwa, Moedatech-App):** quotation per-type total math + reopen→re-confirm upsert. **Not wired:** RFQ group code.

---

## C. Current web deal room (starting point)
- `DealRoom.tsx` (~1013 lines): `submitCounter` → `proposeRate(id, {proposedRate, priceUnit, mobPrice, demobPrice})`; breakdown uses `units = room.numberOfUnits`, mob/demob × units (single count). Flow sheet: page 0 Terms → 1 Price → 2 Summary (`rateStr`/`mobStr`/`demobStr`/`contractType`).
- Adopt per-type units + the new fields here. Match existing conventions (the file's own patterns, `@/lib/api/client`, i18n `L(en, ar)`).

*Full behaviour/UX (price bar, 3-step chat-view sheet, scenarios, edge cases) is in `spec-final.md` + the prototype. This doc is the backend contract + web task list.*
