# Tickets — Screen 1: My Requests (fulfillment + RFQ tabs)

## T1 — Contract/adapter: expose each bid's offered units  · scope: Contract
Add `unitsOffered: number` to `BidCard` (supplier's chosen quantity), distinct from `numberOfUnits` (units the request needs). Map it in `mapBid` (`raw.unitsOffered?.length ?? numberOfUnits`) and `submissionToBidCard` (off-platform = item's `numberOfUnits`).
- **G/W/T:** Given a bid offering 3 of 10 units, When mapped, Then `card.unitsOffered === 3` and `card.numberOfUnits === 10`.

## T2 — Fulfillment compute for the active RFQ  · scope: Web UI (+ client)
In `RequestsList`, when an RFQ is active, fetch its items' bids + the group's submissions and compute `filledByItem[itemId] = min(unitsNeeded, Σ offered units on/off-platform)`.
- **G/W/T:** Given item needs 10, two app bids offer 2 and 3, When computed, Then filled = 5; Given a 1-unit item with one bid, Then filled = 1.

## T3 — UI: RFQ tabs + color-coded fulfillment grid + i18n  · scope: Web UI
Relabel location chips → **RFQ** tabs (id + location). Add the fulfillment grid (tile per equipment line: `filled/total` + progress bar; red `<50%` / amber partial / green full) to the request header. Keep share-link block + off-platform counts; "View all items" expand; "View all bids" entry. Bilingual EN+AR, RTL-safe.
- **G/W/T:** Given an active RFQ, When the header renders, Then each equipment line shows a colored `filled/total` bar and tabs read "RFQ · <location> · REQ-…".

## T4 — Tests  · scope: Tests
`tests/unit` for the offered-units mapping (T1) and the fulfillment cap math (T2).
