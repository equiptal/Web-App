# Request / Bids UI redesign — implementation plan

Source: spec handoff `IMPLEMENTATION.md` + `RentalPlatform-prototype.html` (renter request/bids redesign).
Approach: implement into real Web-App components, **screen by screen**, deploy to staging. This plan = **Screen 1: My Requests**.

## Locked decisions (from planning)
- **Fulfillment per equipment line = sum of each bid's offered units, capped at units needed** → e.g. `5/10`; a 1-unit line with one bid = `1/1`. Color: `<50%` red · partial amber · full (≥100%) green.
- **Computed on the frontend.** Each bid carries `unitsOffered` (array; count = `.length`) — confirmed returned by the bid-list (`bid.repository`/`rentee.service`). On-platform bids use that count; off-platform (shared-link) submissions currently cover the full quantity (no partial-units picker on the form yet). No backend data change.
- **RFQ tab** shows the `REQ-…` id **and** the location.

## Architecture & data (Screen 1)
- **Contract** (`src/lib/contract/bids.ts`): add `unitsOffered: number` to `BidCard` (supplier's chosen count; today `numberOfUnits` = the *request's* units = units needed). Map in `mapBid` (`raw.unitsOffered?.length`) and `link-bids.ts` `submissionToBidCard` (off-platform = its priced `numberOfUnits`).
- **Compute** (`RequestsList.tsx`): for the **active RFQ only**, fetch each item's bids (`fetchBids`) + the group's off-platform submissions (already fetched for `linkByRequest`); build `filledByItem[itemId] = min(needed, Σ unitsOffered)`.
- **UI** (`RequestsList.tsx` + `requests-proto.css`): relabel location chips → **RFQ tabs** (id + location); add a **color-coded fulfillment grid** (one tile per equipment line: `filled/total` + bar) to the request header; keep the existing share-link block + off-platform bid counts; "View all items" expand; "View all bids" entry. i18n EN+AR.
- **BFF / backend:** none. Uses existing `/api/me/requests/[id]/bids` + `/api/me/requests/[id]/submissions`.

## Risks
- Per-active-RFQ bid fetches add a few requests on selection (bounded to the active group's items). Acceptable; could add a backend aggregate later for efficiency (not required).
- Off-platform bids count as full-quantity coverage until the shared-link form gets a units picker (separate change). Capping at "needed" keeps the bar sane.
- RTL for the tabs + grid.
