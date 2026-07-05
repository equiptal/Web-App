# Tickets — Comparison table ↔ terms-journey alignment

Plan: ./plan.md · Implement top-to-bottom.

## T1 — Identity shows verified + company documents (UI move)
**Scope:** Web UI · **Files:** `BidComparisonWorkspace.tsx`
Render a Verified/Not-verified pill + the company-docs chips (CR · VAT · National address · LC · SASO registration, real `compliance` fields, show-if-present / red-if-required-missing) in the **column identity header**. Extract the doc-list into a shared helper. Remove the duplicate rows from the Trust section.
- **Given** a verified supplier with CR+VAT, **When** I open the comparison, **Then** its identity header shows "Verified" + CR + VAT chips and the Trust section no longer repeats them.

## T2 — Rental cost = rate × duration × quantity (verify + lock)
**Scope:** Contract/cost · **Files:** `comparison.ts` (`computeRental`), `tests/unit/comparison.test.ts`
Confirm rate is normalised by price unit (day/week/month), multiplied by `estimatedDurationDays` (when the bid has no duration) and by `numberOfUnits`. Add fixtures.
- **Given** a 200 SAR/day bid, 10-day duration, 2 units, **Then** rental = 4000; **Given** a weekly/monthly rate, **Then** it normalises correctly.

## T3 — Mob/demob × quantity when on supplier
**Scope:** Web UI/cost · **Files:** `BidComparisonWorkspace.tsx` (Mob+demob row) / `comparison.ts`
When mob/demob is on the supplier, multiply each by `numberOfUnits` (not duration); update the sub-label ("× N units"). Leave on-rentee / not-priced handling.
- **Given** mob 500 + demob 300 on supplier, 3 units, **Then** the row shows 2400 (× 3), with the unit breakdown.

## T4 — "Who handles the costs" — add-cost gating + deal-room conflict
**Scope:** Contract/cost + UI · **Files:** `comparison.ts` (`buildCostResponsibilities`), `BidComparisonWorkspace.tsx`
"+ add cost" only when the **request** assigns the cost to the **rentee**; none when assigned to the supplier. Colour a chip **red** when the **deal-room** value conflicts with the request — specifically `fat_food` / `fat_accommodation_transport`.
- **Given** the request puts fuel on the rentee, **Then** the fuel chip offers "+ add cost"; **Given** FAT-food on supplier in the request but rentee in the deal room, **Then** the operator-food chip is red.

## T5 — "Acknowledged — confirm with supplier" note + deal-room link
**Scope:** Web UI · **Files:** `BidComparisonWorkspace.tsx`
Add a seamless muted caption on the equipment-terms/operator-cert area: "Acknowledged from your request — confirm with the supplier" + a subtle "verify in deal room →" link to `/deal-room/{dealRoomId}` (only when a deal room exists).
- **Given** a bid with a deal room, **Then** the equipment-terms area shows the note + a working link; **Given** no deal room, **Then** no link.

## T6-A — Equipment safety certs + ownership + operator cert (Acknowledge phase)
**Scope:** Web UI · **Files:** `BidComparisonWorkspace.tsx`, `bids.ts`
Show these as the **request's requirement** marked "acknowledged", alongside the supplier's **held docs** (`equipmentCertCodes` / `ownershipDocs`) as on-file evidence, with the T5 link. No red conflict yet (no declared value).
- **Given** today's acknowledge-only state, **Then** the row shows required certs (acknowledged) + held docs + the deal-room link, no false conflict.

## T6-B — Source from deal-room terms (Negotiable phase) — ⚠ Backend (Moedatech-App)
**Scope:** Contract + UI + **backend-dependency** · carry via `/web:link-backend`
When `operator_included` / `operator_certification` / equipment-safety-certs become **Negotiable**, read the supplier's **declared value + deal-room state** (`soft_accepted`→green, `disputed`→red) like `payment_terms`/`fat_*`. Needs the backend to expose the declared term + state in the bid/deal-room payload.
- **Given** the backend declares the value + state, **Then** the cert row shows the supplier's value coloured by match/conflict.
