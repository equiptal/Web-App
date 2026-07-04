# Testing ticket — Bid‑comparison consistency & polish (T1–T16)

Covers everything shipped in this epic: **Batch 1** (T1–T10) and **Batch 2** (T11–T16). T17 (decided‑state, 3 cases) is **not yet built** — excluded here, add when implemented.

Legend: **[FE]** frontend (web) · **[BE]** backend (`Moedatech-App`, verify only — no changes owned here) · **[INT]** front↔back integration / end‑to‑end.

---

## A. Frontend — automated (vitest / tsc / eslint)
Run: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <touched>`. All must stay green.

- **[FE] spec‑sheet** (`spec-sheet.test.ts` — add if missing): `buildSpecRows` emits `operatorCert` / `fatFood` / `fatTransport` only when operator required; `certificate` = equipment **safety** cert (not operator); empty → `—`.
- **[FE] comparison colour** (`comparison.test.ts`): `responsibilityTone` — matched (bidSide===requestSide) → **green** incl. `me`/`me`; state `red` → **red**; else **grey** (the T11 case is already updated & passing).
- **[FE] link cost responsibilities** (`comparison.test.ts` / `link-bids.test.ts`): a link bid derives `requestResponsibilities` from required terms; `buildCostResponsibilities` maps a link decline (`fat_transport` conflict) to a red state; maintenance mirrors the request (T5/T9).
- **[FE] distinct counts** (`requests`/comparison unit): a link submission spanning 2 items counts **once** in the group total; per‑item still counts per item (T10).
- **[FE] price mapping** (`bids.test.ts` — add cases): `price` = locked "price" term when present → else `currentPrice` when bid `ACCEPTED` → else `priceAmount`; a non‑accepted bid with only a pending `currentPrice` keeps `priceAmount` (T16).
- **[FE] offeredUnits** (`link-bids.test.ts`): `mapLinkSubmissions` reads `offeredUnits`, falls back to `numberOfUnits`; submit payload sends `offeredUnits` for multi‑unit.

## B. Frontend — manual / visual (per ticket, on staging)
- **T1/T2** — every page (create, requests, inbox, profile, compare, deal‑room) shares the 1440px width + gutter; no page flush to the sidebar/edge; **no horizontal scroll**; forms not awkwardly wide.
- **T2 tabs** — comparison "REQUESTS FOR QUOTE" tabs lead with the **RFQ group code** (bold), items chip + location, matching My Requests.
- **T3** — doc viewer shows **download**; it saves the actual file (image + PDF; in‑app + link where a value/file exists); new‑tab fallback works.
- **T4** — comparison source chips match the card banners (orange "Off‑platform · via your request link" / blue "Via Moedatech app" / neutral "Uploaded file").
- **T5** — a shared‑link bid shows `Maintenance · <party>` from the request, not `—`.
- **T6** — a "Not met" / conflict cell is clearly **red** even in the green Recommended column.
- **T8** — one merged equipment banner; single‑unit vs multi‑unit copy; "verify in deal room" link present when a room exists.
- **T9** — a link supplier's "No" on Accommodation & transport shows a red conflict chip in Cost terms **and** in the terms modal Conflict tab.
- **T10** — fulfilment header / "View all bids" pill / comparison tab all show the **same** number for one request.
- **T11** — "Fuel · you" (matches request) reads **green**; owner label still says "you".
- **T12** — required cert green/red; a held‑not‑required cert (SPSP vs required TÜV) shows a **blue** extra chip.
- **T13** — proof of ownership = **blue** clickable chip per doc; `—` when none; **never** red/green.
- **T15** — change a term / accept a rate in the deal room → the comparison reflects it within ~20s or on tab‑refocus.
- **T16** — accept a rate in the deal room → the comparison **and** the bid card show the agreed rate; a still‑pending counter does not change it.
- Terms modal — 3 state tabs (Conflict / Pending review / Matched); link card equipment "Details" modal shows year/cert + the self‑declared note.

## C. Backend — verify the contracts these rely on ([BE], read‑only)
- **[BE] per‑request bid‑list** (`GET /marketplace/requests/{id}/bids`): returns `lockedTerms` (with `termKey:"price"` + `lockedValue`), `currentPrice`, and bid `status` — the fields T16 reads. Confirm an **accepted** bid returns the agreed rate in `currentPrice` and/or a locked price term.
- **[BE] received‑bids** (`/marketplace/received-bids`): `requestGroupId` now in the request select (inbox grouping) — confirm present.
- **[BE] getRequestSubmissions** (agents): returns `offeredUnits` per item + `groupRef` (RFQ‑NNNNN) for the group.
- **[BE] submitBidForm** (agents): persists + prices on `offeredUnits` (1..requested).
- **[BE] request cost sides**: `maintenanceResponsibility` / `fatAccommodationTransport` etc. present on the request so `requestResponsibilities` populates (T5/T9).
- **[BE] survey outcome** (for T17 later): confirm the request/group exposes the reported winner — flagged, not needed until T17.

## D. Integration / end‑to‑end ([INT])
Reference flow from the earlier test case (create → link bid + app bid → compare):
1. **Partial off‑platform bid** — create a multi‑unit request; place a link bid for 1 of N via the stepper → the submission stores `offeredUnits=1` → comparison shows "offered 1 of N", fulfilment counts the offered unit, counts stay consistent (T10).
2. **Price sync** — start a deal room on an in‑app bid, negotiate + **both accept** a new rate → reopen the comparison **and** the My‑Bids card → both show the **agreed** rate (not the original, not a pending counter) (T16/T15).
3. **Term conflict live** — decline a term in the deal room → within ~20s / on refocus the comparison term cell reflects it (T15); a link supplier's decline shows red in Cost terms (T9).
4. **Maintenance parity** — request assigns maintenance to supplier → both an in‑app and a link bid show `Maintenance · supplier` (T5).
5. **Docs** — open a supplier CR/VAT (in‑app, deal‑room‑gated) and an equipment ownership doc → view **and** download both (T3); ownership shows blue (T13).
6. **Cross‑surface counts** — one request with 1 in‑app + 1 link submission spanning 2 items → fulfilment, pill, tab all read **2** (T10).

## E. Regression watch
- Width change (max‑w‑6xl → 1440) touched **all** pages via `AppShell` — re‑check each page renders without overflow.
- `responsibilityTone` change — re‑check every cost‑term chip colour across in‑app + link bids.
- Off‑platform source chip length — confirm it doesn't stretch a comparison column.

## Exit criteria
- A + automated green (tsc / vitest / eslint).
- B + C + D executed on staging with results recorded; any [BE] gap (esp. T16 accepted‑rate, survey outcome) raised as a `⚠ Backend` handoff.

---

# Full manual test checklist — everything shipped this epic (run on staging)

**One setup that exercises most of it:** create a BROADCAST request with **2 items**, one **multi‑unit** (Forklift ×3); operator required, operator cert = **SPSP**, equipment safety cert = **TÜV**; **delivery = supplier, return = me**; maintenance =
 supplier; **start+end dates** (a duration); FAT accom/transport = me. Place **1 in‑app bid** (declares TÜV, FAT accom on supplier) + **1 off‑platform link bid** (offer a partial count; say No to Accommodation & transport).

## Layout & navigation
- [ ] Every page (requests, compare, inbox, profile, create, deal‑room) shares the same **1440 width + gutter**; nothing flush to the sidebar/edge; no horizontal scroll.
- [ ] Post‑submit "View request & bids" → the **group detail** with ALL items (not a single‑item page).
- [ ] Request tabs ordered by **date, newest first**.

## Create / spec sheet
- [ ] Safety cert set in "Settings for all" appears on **each item** (per‑item, overridable).
- [ ] Review step shows an **Operator details** block (only for items needing an operator).
- [ ] Export/Excel spec sheet has **Safety cert** + **Operator cert / Food / Accom. & transport** columns.

## Bid form (public link)
- [ ] Multi‑unit item shows a **−/+ stepper**; lowering it updates the Qty column + totals (partial bid).
- [ ] VAT toggle at the price box works; unit pill is **subtle grey**.

## Bid cards (in‑app + link)
- [ ] **No cert/term chips** on the Equipment row — only "Equipment … Details ›".
- [ ] Off‑platform card: **"Valid until"** on the top row; **Details** modal opens with the **item name** title + year/cert + self‑declared note.
- [ ] Expand price on one card → **others stay collapsed**; price breakdown opens **Per unit** by default.
- [ ] Status pill reflects **Accepted** (deal‑room accept) or **Awarded** (survey win).

## Bid comparison — layout
- [ ] Tabs lead with the **RFQ group code** (like the requests screen).
- [ ] Column **source chips** match the card banners (orange off‑platform / blue in‑app).
- [ ] **Distinct bid counts** agree across fulfilment / "View all bids" / tab / per‑item (a link submission spanning 2 items counts once).
- [ ] Doc viewer has a **download** button (view + download any CR/VAT/ownership file).
- [ ] Terms modal → **3 tabs** (Conflict / Pending review / Matched); conflict names the **specific** cert; off‑platform bids have **no Pending tab**.

## Bid comparison — correctness (the big one)
- [ ] **Cost terms** coloured by truth: matches request → **green** (incl. "Fuel · you"); deviates → **red**; extras → blue. In‑app terms are no longer grey.
- [ ] **Operator cert**: required SPSP + supplier declared TÜV → **red** (green only if it satisfies the requirement or the deal room agreed it).
- [ ] **Equipment cert**: required green/red **+ held‑but‑not‑required** cert shown as a **blue** extra.
- [ ] **Proof of ownership**: any equipment doc → **blue** clickable chip; none → **`—`**; never red.
- [ ] **Year**: confirmed → green `≥ 2022`; declined → **red "Not met"**, visible even in the green Recommended column.
- [ ] **Maintenance** on a shared‑link bid shows the request's party (e.g. `· supplier`), not `—`.
- [ ] **Mob/demob = one row**: supplier‑borne total headline + breakdown "Delivery: … · Return: …" (renter part = "on you", supplier part = price).
- [ ] **Estimated rental** = a smaller **blue** sub under Rental cost (not its own row).
- [ ] Notes read "…in the deal room **for bids in app**"; equipment banner is **one** merged line (multi‑unit variant shows "1 of N units").
- [ ] **PRICES FOR** defaults to **Per unit**.

## Deal‑room / survey dependent
- [ ] Negotiate a rate in the deal room → comparison **and** card show the **live rate** (~20s / refocus).
- [ ] **Accept** a bid → "Accepted — request closed" banner + winner badge + others' Award disabled; survives reload.
- [ ] Report a **bidder** winner in the Outcome Survey → shows **"Awarded"** (`wonViaSurvey`).

## RFQ code (gated on backend `getMyMarketplaceRequests` returning `groupRef`)
- [ ] Once deployed: requests tabs / strip / comparison show **`RFQ-…`** for every request incl. bid‑less. Until then, `REQ-…` (no regression).

## Arabic / RTL (quick pass)
- [ ] Switch to AR on comparison + cards → labels translated, layout mirrored, chips/banners RTL.

**Known backend‑gated:** RFQ code on bid‑less requests (needs `groupRef` in `my-requests`). Everything else is web‑complete + live once deployed.
