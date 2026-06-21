# AC Verification — Bid-comparison procurement workspace (renter web)

**Card:** https://github.com/equiptal/moedatech-specs/issues/306
**Audited:** 2026-06-21
**Branch:** web-app/007-bid-comparison
**HEAD:** c13d658 (007 work uncommitted in the working tree)

## Summary
- Met: 31
- Partial: 2 (both backend/data dependencies — can't close on the web alone)
- Not met: 0
- Out of scope: 10 (Agent/judgement ACs deferred per the Q6 scope decision)

_Updated 2026-06-21 after closing the 4 web-closeable partials (AC-12, AC-30, AC-35, AC-37). AC-11 and AC-40 remain Partial — they need backend data (bid-side cost-responsibility fields / `isTrial` on the requests list)._

Scope: this round built the **deterministic web half**. The Agent ACs (Mansour pick/chat/learning/recognition, quote upload, saved preference) were deferred — they audit as **Out of scope (per plan)**, not failures.

Evidence files: `src/lib/contract/comparison.ts` (engine), `src/components/compare/BidComparisonWorkspace.tsx` (workspace), `src/components/requests/RequestsList.tsx` (My-Bids entry), `src/components/AppShell.tsx` (sidebar), `tests/unit/comparison.test.ts`.

## Per-AC findings

### AC-01 — Open from sidebar
**Verdict:** Met — sidebar `compare` nav → `/compare` (`AppShell.tsx` navItems); workspace opens grouped by location with item counts (`BidComparisonWorkspace.tsx` `locations` memo + location tabs).

### AC-02 — Open from My Bids
**Verdict:** Met — "Compare bids" button in the My Bids tab (`RequestsList.tsx`) → `/compare?group=…`; workspace honors `?group` to focus that request's location + first item (`BidComparisonWorkspace.tsx` default-selection effect).

### AC-03 — location → request → item navigation
**Verdict:** Met — location tabs → request header card → per-item tabs (`BidComparisonWorkspace.tsx` render).

### AC-04 — multi-quantity item stays one comparison
**Verdict:** Met — one item tab with `×qty` badge; rental priced for all units (`comparison.ts computeRental` × `numberOfUnits`). Test: `comparison.test.ts` ("× units").

### AC-05 — three-block side-by-side layout
**Verdict:** Met — `Cost` / `Equipment` / `Trust & documents` blocks per column (`BidColumnCard`). Certs fold via `bid.terms.equipment` (operator/eq certs) vs `bid.terms.supplier` (company docs).

### AC-06 — at-a-glance verdict per bid
**Verdict:** Met — header shows `Meets every requirement` (0 conflicts) or `N things to check` (`BidColumnCard` verdict, lines ~77-94).

### AC-07 — collapsible sections
**Verdict:** Met — `Block` component collapses to a one-line summary and re-expands.

### AC-08 — requirement qualification (red/green)
**Verdict:** Met — `QualRow` renders red on conflict / green on match / grey when not declared, from `bid.terms` (`comparison.ts` cost/equipment/trust rows).

### AC-09 — all-in cost from stated data
**Verdict:** Met — `computeRental` (rate normalized to period × duration × units) + stated mob/demob; `All-in · stated only` label; cost bar via `+X% vs lowest` / `lowest`; `Cash upfront` (`computeCashUpfront`). Tests: comparison.test.ts (all-in, per-week, per-job, +X%).

### AC-10 — not-stated split
**Verdict:** Met — `MoneyCell` shows `not stated` for cost figures (never 0/free); cert/cost-responsibility absences read without a "not stated" label (`QualRow` grey / `not provided`).

### AC-11 — cost-responsibility alignment
**Verdict:** Partial — the 5 items render with green/red/grey alignment (`buildCostResponsibilities`), but only **maintenance** has a bid-stated side on the `BidCard` today; fuel/overtime/operator-food/transport show `not provided` (no fabrication). Full alignment needs those bid-side fields on the bids payload.

### AC-12 — renter-entered cost adjusts the total
**Verdict:** Met — "Your expected costs" panel (`BidComparisonWorkspace.tsx`, `renterCosts` state) lets the renter enter a figure per cost-responsibility; the engine adds it to the comparable total **only for bids where that cost lands on the renter** (`comparison.ts` conditional `renterAdj`), and adds nothing where the renter provided no figure. Test: `comparison.test.ts` ("renter-entered cost").

### AC-13 — data-only, no fabricated values
**Verdict:** Met — every cell is stated data or deterministic math (`comparison.ts`); no agent-estimated monetary value is produced.

### AC-14 — supplier selector add/remove
**Verdict:** Met — selector chips toggle a bid in/out (`toggleBid`).

### AC-15 — all bids deselected — empty state
**Verdict:** Met — "No bids selected — add one from the suppliers above" when `displayed.length === 0` and bids exist.

### AC-16 — excluded bid — Negotiate and Bring back
**Verdict:** Met — bids failing every requirement render as excluded chips with `Bring back` (re-adds, still flagged) + `Negotiate` (→ deal room).

### AC-17 — Mansour's pick flagged
**Verdict:** Out of scope (per plan) — Agent recommendation deferred (no scoring endpoint).

### AC-18 — transparent reasons in the Ask-Mansour chat
**Verdict:** Out of scope (per plan) — Agent chat deferred.

### AC-19 — a cost-shift bid is weighed down
**Verdict:** Out of scope (per plan) — Agent ranking deferred.

### AC-20 — preset re-ranks and highlights the best column
**Verdict:** Met (web/deterministic side) — preset bar (`Best overall`/`Lowest cost`/`Newest`/`Most trusted`) re-sorts (`sortByPreset`) and highlights the first column. The agent-weighted "best" is deferred; the deterministic sort + highlight is implemented.

### AC-21 — free-text preference with interpretation echo
**Verdict:** Out of scope (per plan) — Agent free-text deferred.

### AC-22 — preference saved to the profile
**Verdict:** Out of scope (per plan) — saved-preference backend deferred.

### AC-23 — what-if in the chat
**Verdict:** Out of scope (per plan) — Agent chat deferred.

### AC-24 — award-learning nudge
**Verdict:** Out of scope (per plan) — Agent learning + award history deferred.

### AC-25 — supplier recognition across items
**Verdict:** Out of scope (per plan) — award-history/recognition backend deferred.

### AC-26 — upload an off-platform quote
**Verdict:** Out of scope (per plan) — Mansour quote-parse not built.

### AC-27 — upload parse failure
**Verdict:** Out of scope (per plan) — depends on AC-26.

### AC-28 — Award opens the deal room
**Verdict:** Met — `Award` on any column → `goDealRoom` opens that supplier's deal room (`startDealRoom` / `/deal-room/{id}`); the accept happens there.

### AC-29 — Negotiate opens the deal room
**Verdict:** Met — `Negotiate` on a column or an excluded chip → `goDealRoom`.

### AC-30 — per-item awards, marked and recorded
**Verdict:** Met (web side) — items are independently awardable (each item tab is independent); an **awarded banner** shows when a bid is `ACCEPTED`, and once awarded the item's columns are **no longer re-offered** (Award/Negotiate replaced by an "Awarded ✓" / "Item awarded" state — `BidColumnCard` `itemAwarded`). The cross-item **recording** for recognition (AC-25) remains the deferred backend.

### AC-31 — empty — no bids
**Verdict:** Met — "No bids yet" + re-broadcast prompt when the item has no bids.

### AC-32 — single bid (incl. DIRECT)
**Verdict:** Met — `solo` suppresses ranking / `+X% vs lowest` when one bid is shown.

### AC-33 — all bids fail requirements
**Verdict:** Met — "No qualifying bids — relax a rule or re-broadcast" when every bid is excluded.

### AC-34 — request set no requirements
**Verdict:** Met — with no declared requirements, `bid.terms` are grey (no conflicts), so no red framing; bids present by pure ranking.

### AC-35 — missing data handled gracefully
**Verdict:** Met — `MoneyCell` shows `not stated` (never 0/free); open-ended → the rental line shows the **per-unit rate + "set a duration for a full total"** prompt; the Cost block surfaces **`distance unknown`** and **`no expiry`** when those are absent. Listing capacity unknown → the measurement row shows **`needs confirmation`** and the bid isn't auto-excluded on size (AC-36/37). All from stated data — nothing shown as 0/free.

### AC-36 — type / size drift
**Verdict:** Met (display side) — `type/size needs check` flag rendered (`warnings.typeSizeCheck`); never auto-excluded on a raw id mismatch (size grey ≠ conflict). The **confirmed**-mismatch judgement is the deferred Agent side.

### AC-37 — missing-but-required field
**Verdict:** Met — an unstated field renders as **`needs confirmation`** (`QualRow` grey state) and the bid is **not auto-excluded** for it (grey ≠ conflict in the engine).

### AC-38 — multiple rounds from one supplier
**Verdict:** Met — `buildItemComparison` keeps only the latest round per supplier and drops expired/withdrawn. Test: comparison.test.ts ("latest live round per supplier").

### AC-39 — bid on an inactive / deleted listing
**Verdict:** Met — `no longer active` warning on the column (`warnings.listingInactive`).

### AC-40 — trial requests excluded
**Verdict:** Partial — the workspace only shows what the requests list returns; `RequestListItem` carries no `isTrial`, so the workspace can't filter trials itself. Relies on the requests-list endpoint excluding trials. Needs `isTrial` on the list to enforce client-side.

### AC-41 — grouped request
**Verdict:** Met — a fanned-out group is presented as **one request (header card) with a tab per item** (the location→request→item nav inherently regroups it).

### AC-42 — trust / finance display rules
**Verdict:** Met — rating is never a knockout/weight in qualification (used only for the optional "Most trusted" display sort); all-in is pre-VAT (no VAT added in `comparison.ts`); amounts shown in SAR/ر.س.

### AC-43 — English and Arabic (RTL)
**Verdict:** Met — every label is bilingual (inline `L`); Arabic renders RTL via the global `document.documentElement.dir` (i18n provider). Mansour chat reasoning localization is deferred with the chat.
