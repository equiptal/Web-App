# Tickets — Bid Comparison redesign

Plan: ./plan.md · Scope: Web UI + Contract only (no BFF/backend). Implement top-to-bottom.

## T1 — Contract: period/prices-for display + chip tones + winners
**Scope:** Contract (`comparison.ts`)
- Add a display helper that recomputes a column's rental/total for a chosen **rate period** (Day/Week/Month, via existing `daysPerPeriod`) and **prices-for** (per-unit | all-units), without touching `daysPerPeriod` (Week stays 7).
- Map each cost-responsibility to a **chip tone**: supplier-covered → green, renter-handled ("you") → **blue**, conflict → red. (Recolour vs today's green/red/grey.)
- Per-row **winner** helper: given the visible columns + a metric, flag the leading cell(s); ties → no flag.
**G/W/T:** Given 3 columns, When period=Week & prices-for=All, Then each column's rental = rate/7×days×units; When a term lands on the renter, Then its chip tone is blue; When one column is cheapest, Then only it gets the winner flag.

## T2 — UI: header (RFQ tabs · item icon-dropdown · supplier add/remove chips)
**Scope:** Web UI
- RFQ tabs (standard pill); item-card header: icon + name + spec + "N bidding · N in comparison", an **icon-only item dropdown** (All items + each type + count) on the right, and **supplier add/remove chips** (tap toggles a column).
**G/W/T:** When the renter taps a supplier chip, Then that supplier's column is added/removed; When they pick an item, Then the table rebuilds for it.

## T3 — UI: rank band + supplier column headers + recommended tint
**Scope:** Web UI
- Rank band: **Best / Lowest cost / Newest / Most trusted** preset chips + free-text **Ask-AI** input + **Re-rank** + "● AI · %" (reuse `recommendBids`/`askBids`); "Got it — saved" note.
- Column headers: status top-bar, rank badge (🥇 Recommended / Rank #2…), avatar, name, ★ rating, source (app/shared-link), CR/VAT/Address chips, **×** remove.
- **Recommended column** (rank #1) → faint green tint.
**G/W/T:** When a preset is chosen, Then columns reorder + #1 is tinted; When free text is entered + Re-rank, Then the agent ranks the visible columns and a note shows.

## T4 — UI: COST section
**Scope:** Web UI
- Navy **💵 COST** bar; controls strip: **RATE PERIOD** (Day/Week/Month) + **PRICES FOR** (Per unit/All units) segmented toggles; top note "negotiable … Negotiate in deal room →".
- Rows: **Units fulfilled** (bar, multi-unit only, first), **Rental** (`rate×period×units`), **Mobilization+demob** (`(mob+demob)×units` + km), **Estimated rental by duration** (only if request has duration), **Cost terms** (chips), **Grand total** (+VAT, "Lowest"/"+X%" badge + bar). Per-row **✓ BEST** winners.
**G/W/T:** When prices-for=Per unit, Then figures divide by units; When a column is cheapest total, Then it shows "Lowest" + ✓ BEST and others "+X%".

## T5 — UI: EQUIPMENT section + Award/Negotiate
**Scope:** Web UI
- Navy **🛠 EQUIPMENT** bar; amber note "details for 1 unit … Verify in deal room →".
- Rows: **Year**, **Distance to site**, **only required certs** (TÜV/Istimara), **Operator cert** (only if required), **Decide** row per supplier: **Award** (toggle ✓ Awarded / re-award via `acceptBid`+`awardLearning`) + **Negotiate** (`startDealRoom`).
**G/W/T:** When Award is tapped, Then it accepts the bid and shows ✓ Awarded; tap again re-awards; When Negotiate, Then the deal room opens. Off-platform bids: Negotiate adopts first (no deal room until adopted).

## T6 — UI: term chips + Estimate-your-costs modal + footer
**Scope:** Web UI
- Term chips green/blue/red (no checkmark; colour conveys). On **"you"** (blue) terms an **"Estimate your costs"** button → private modal (SAR fields, "estimates only, never shown to supplier", running total). Saved estimates show on the blue chip + button total; **persist to localStorage**.
- Sticky left label column; table footer **Upload a quote** + **Export PDF**.
**G/W/T:** When the renter saves an estimate, Then it shows on the chip + persists across reloads + never appears in any network payload.

## T7 — i18n + tests + verify
**Scope:** Web UI + Contract
- EN+AR strings for all new labels/notes/modal. Vitest for the T1 helpers (period/prices-for math, chip tone, winners). `tsc` + `eslint` + `next build`.
