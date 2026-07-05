# Deal-room / compare / bids / quotation fixes — plan

**Source:** Yara review 2026-07-04 (screenshots). **Truth:** mobile app. Tickets in `tickets.md`.

## The 5 issues
| # | Area | One-liner |
|---|---|---|
| B1 | Bids (card) | Terms "Conflict N · Matched N" count ≠ the Terms modal count |
| B2 | Compare | A term that's a *conflict* in the deal room shows green "on you" in the comparison |
| B3 | Deal room | Terms locked/turn-gating + conflict presentation must match the app (not-your-turn read-only) |
| B4 | Requests | "Select bids" → "Compare bids"; flatten the "floating" selected cards; click-outside exits selection |
| B5 | Quotation | Web quotation values differ from the app's downloaded PDF (deal-room updates not reflected) |

## Themes / sequencing
- **Term-state single source (B1 + B2):** both the bid-card tally and the comparison cost-responsibility
  coloring must derive from the *same* term list + state. Fix together — this is the root of both.
- **B3** folds into the in-flight `deal-room-negotiation-parity` batched-flow rework; confirm the app's
  not-your-turn presentation and match it there.
- **B4** is self-contained UI (label + selection styling + click-outside) — quick win.
- **B5** is correctness-sensitive: first diff a real app-PDF vs web-HTML quotation to see which fields
  drift, then decide source of truth (prefer reusing the backend PDF over client recompute).

## Recommended order
1. **B4** (quick, isolated) → 2. **B1+B2** (shared term-state fix) → 3. **B3** (with the negotiation rework)
   → 4. **B5** (after diffing the values; may touch the backend quotation math).

## Risk / dependency notes
- B2/B1 depend on the deal-room term **state** being available where the comparison + bid card compute
  (it is — `BidCard`/comparison already carry term states).
- B5 may reveal a **backend** difference (the PDF's math/agreed values) → could need `/web:link-backend`
  if the web must mirror backend totals or if a field the PDF uses isn't exposed.
- B3 must not regress the batched-negotiation rework (uncommitted).
