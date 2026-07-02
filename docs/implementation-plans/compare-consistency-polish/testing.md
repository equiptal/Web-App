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
