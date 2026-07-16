# Web UI handoff — shared-link bid: cap offered units at *remaining*

**Repo:** `equiptal/Web-App` · **Driver (backend):** `equiptal/Moedatech-App` PR #484 (`submitBidForm`)

## Context

Multi-unit / partial-fulfillment request (e.g. renter needs **5**). When other suppliers already
hold units via **accepted (AWAITING_SUPPLIER_CONFIRMATION) + confirmed (CLOSED)** deals, a shared-link
supplier must only be able to offer the **remaining** count (e.g. 2), not the full 5.

- **Backend enforcement — DONE** (PR #484, `apps/backend-agents/submitBidForm`): rejects an offer above
  `remaining` (`400 — "Offer between 1 and 2 units — 3 of 5 are already covered by other suppliers"`)
  and a fully-covered item (`409`). Mirrors the app's `getUnitCoverage`.
- **Gap:** the public bid form still shows the **requested** count as the max, so the supplier only
  finds out on submit (rejection). This handoff makes the form show + cap at `remaining`.

`remaining = numberOfUnits − Σ agreedUnits(AWAITING+CLOSED deals)` (clamped ≥ 0). Only applies to
`MULTIPLE_SUPPLIERS` multi-unit items; single-supplier / single-unit lines are unchanged.

---

## Backend prerequisite (agents — NOT web; must ship first)

`GET /agents/requests/{token}/bid-form` must return `remainingUnits` per item.

- File: `apps/backend-agents/src/handlers/agents/bid-form/getBidForm.ts` (item map ~L107-115, beside
  `numberOfUnits`). Compute reserved per assembled request with the **same raw query** `submitBidForm`
  now uses (`SELECT COALESCE(SUM(COALESCE(agreed_units, <requested>)),0) … WHERE status IN
  ('AWAITING_SUPPLIER_CONFIRMATION','CLOSED')`), then `remainingUnits = max(0, numberOfUnits − reserved)`.
  Non-assembled items: `remainingUnits = numberOfUnits`.
- New per-item response field: **`remainingUnits: number`** (0..numberOfUnits).

> Status: not yet implemented. The Moedatech-App owner can add it (backend repo). Until it ships, the
> web falls back to `numberOfUnits` (today's behaviour) — so the web change is safe to deploy first.

---

## Web changes (Web-App)

### 1. `src/lib/contract/link-bids.ts`
- `BidFormItem`: add `remainingUnits?: number;` (optional — **fallback to `numberOfUnits` when absent**,
  for back-compat with the pre-deploy backend).
- Mapper: parse `remainingUnits` from the raw item (numeric).

### 2. `src/app/bid/[token]/page.tsx`
Per item, derive `const remaining = it.remainingUnits ?? it.numberOfUnits;` and use it as the cap:
- **`offeredQty`** (L245): clamp to `1..remaining` (not `numberOfUnits`).
- **Default** offered (init at L221/L270): `String(remaining)` instead of `String(numberOfUnits || 1)`.
- **Stepper** (L604-608): upper `disabled={oq >= remaining}`; the “×N units” chip + pricing `Qty` follow `offeredQty`.
- **Multi-unit note** (L598): reword to surface coverage, e.g.
  *"The renter needs {numberOfUnits}; {covered} already covered by other suppliers — you can supply up to {remaining}."* (`covered = numberOfUnits − remaining`; only mention when `covered > 0`).
- **Fully covered** (`remaining === 0`): mark the item **unavailable** — disable its price inputs, show a
  "Fully covered" badge, and **exclude it from the submit payload** (treat like the existing per-item
  skip/opt-out). If *every* item is fully covered, block submit with a clear message.

### 3. Submit error handling
The backend now returns `400`/`409` with the EN/AR messages above. Surface them inline / as the existing
submit-error toast (map `error.message` through) so a race (someone accepts while the form is open) reads
cleanly instead of a generic failure.

---

## Acceptance
- 3 of 5 accepted → form shows "up to 2", stepper max 2, default 2; entering 3+ is impossible in-UI and
  rejected server-side.
- Item with 0 remaining → not priceable/submittable, shown as fully covered.
- Single-unit / single-supplier items: unchanged.
- `remainingUnits` absent (pre-deploy backend) → falls back to `numberOfUnits` (no regression).
- AR + RTL parity for the new copy.
