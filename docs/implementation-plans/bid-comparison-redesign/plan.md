# Implementation Plan — Bid Comparison redesign (/compare)

**Source:** free-form — REQUIREMENTS.md §6 + `Bid Comparison-prototype.html`
**Generated:** 2026-06-30
**Approach:** edit/enhance the existing `BidComparisonWorkspace` in place (re-skin to the prototype + fill §6 gaps). Preserve the existing engine's scope (excluded bids, warnings, cash-upfront stay available). No backend or BFF changes.

## Decisions (Phase-2 answers)
- **Q1 Week = 7 days** — keep `comparison.ts` `daysPerPeriod` (Week 7 / Month 26). RATE-PERIOD toggle only changes the *displayed* normalization; quote engine unchanged (quotation parity intact).
- **Q2 Estimates persist** — `localStorage`, renter-only, never sent to any backend ("saved for next time").
- **Q3 Award** — `acceptBid` (toggle: tap → ✓ Awarded, tap again re-awards) + `awardLearning`; **Negotiate** → `startDealRoom`.
- **Q4** — per-item view now; **"All items"** consolidated (group-by-equipment) is a fast-follow.
- **Q5** — app theme colours (navy `#1c3550`, orange `#f79009`, blue `#1a7ec8`, green `#1daf58`), NOT the prototype's raw `#16263F`/`#F2880E`.

## Architecture
- **Web UI:** all in `src/components/compare/BidComparisonWorkspace.tsx` + `compare-proto.css`; inline-styled to the prototype, themed to the app palette. Sticky left label column; horizontal-scroll table; RTL-safe.
- **Contract (`src/lib/contract/comparison.ts`):** add a display-period override (Day/Week/Month) + prices-for (per-unit/all) feeding `computeBidQuote`; map cost-responsibility → chip tone (supplier=green, you=blue, conflict=red); per-row winner flags. `daysPerPeriod` unchanged.
- **Agents:** rank band reuses `recommendBids`/`askBids` (hands the agent the visible columns — `web-bids-filter-rank-split`). No new routes.
- **Award/Negotiate:** existing `acceptBid` + `awardLearning` + `startDealRoom`.
- **Estimates:** renter-local `localStorage` (key per item+responsibility); shown on the blue "you" chips + the section button running total.

## Risks
- Shared quote math — mitigated by Q1 (no engine change).
- Keeping the existing extra scope (excluded/warnings/cash-upfront) while matching the leaner prototype — hide behind the new layout, don't delete.
- RTL of the sticky-left column (`position: sticky; inset-inline-start: 0`).

## Out of scope
- §1–5 (My Requests / Bids / BidCard) — already shipped this session.
- §3 create-flow changes.
- "All items" consolidated view (fast-follow).
- Any backend/BFF change.
