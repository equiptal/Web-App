# Deal Room Negotiation — Implementation Plan (Tickets)

Spec: ./deal-negotiation.md · Prototype: `Deal Room - Desktop.dc.html` · Rules: `Moedatech-App/docs/deal-room-rules.md` + `terms-catalog-and-buckets.md`

**Scope tags:** `WEB-UI` · `BFF` (`src/app/api/*`) · `CONTRACT` (`src/lib/contract/*`) · **`⚠ BACKEND`** (Moedatech‑App handoff — you own).
**Sequencing:** Phase 1 foundations → Phase 2 single‑item redesign (ships first) → Phase 3 accepted‑qty → Phase 4 activity log → Phase 5 multi‑item group → Phase 6 dependency polish. Each phase is shippable behind the existing deal‑room surface.

Legend mirrors the spec: `[WEB]` web‑only · `[GAP]` needs backend.

---

## Phase 1 — Contract foundations & correctness fixes

### T1 — Map the fields the negotiation already has but drops `CONTRACT`
- Map onto `DealRoomView`/`DealTerm`: `lastCounterAt`; each term's **`history[]`** (`{action, by, value, at}`); `groupRef`/`requestGroupId` (from the room's request); supplier **`supplierStatus`** if present.
- **G/W/T:** Given a room payload with term `history`, When mapped, Then `DealTerm.history` is populated; Given a room with `lastProposedRate` + `lastCounterAt`, Then both surface.

### T2 — Deal‑room "Verified" badge uses the canonical signal `WEB` (+ `⚠ BACKEND` for the field)
- Web: badge = `supplierStatus === 2` (fall back to `isVerified` only if `supplierStatus` absent, flagged).
- **⚠ BACKEND:** include `supplierStatus` on the deal‑room supplier object (spec H‑A3 / Part G #3).
- **G/W/T:** Given `supplierStatus===2`, Then the ✓ shows; Given `supplierStatus` 1/3/null, Then no ✓ even if legacy `isVerified` is true.

---

## Phase 2 — Single‑item price & terms negotiation redesign (ships first)

### T3 — Rate card + turn control (4 scenarios) `WEB-UI`
- Restyle the price card + bottom‑bar turn control to the prototype: `دورك` / `في انتظار المورد` / `تم القبول / معتمد`; buttons per state (spec B2, B6, F). Keep the real `myTurn` formula.
- **G/W/T:** Given `myTurn`, Then Counter + Accept; Given `lastCounterBy==='rentee'`, Then "waiting for supplier"; Given supplier countered, Then a pulsing "تفاوض".

### T4 — Negotiation bottom sheet — 3 steps `WEB-UI`
- Steps: **السعر والدفع** (editable rate/mob/demob per unit + config mode/duration/billing + payment‑terms/method term cards), **الشروط** (negotiable terms; accept/counter per term; "قبول الكل"; legend), **المراجعة** (single column: price summary + negotiated terms + acknowledged read‑only).
- Reuse the existing local `resolutions` batching (`batchUpdateTerms` + `proposeRate` / `acceptDeal({termResolutions})`).
- **G/W/T:** Given a disputed term, When the rentee counters it locally + sends, Then it batches with the price counter in one move.

### T5 — Per‑term history display `WEB-UI`
- Show each term's round log (who · value · at) from `DealTerm.history` (T1). Inline expander per term.
- **G/W/T:** Given a term countered twice, Then both rounds show with actor + time.

### T6 — Two‑stage close (real) + withdraw `WEB-UI` + `BFF`
- Accept‑all → show **`AWAITING_SUPPLIER_CONFIRMATION`** state ("waiting for the supplier to confirm") + **↩ withdraw acceptance** (`releaseDeal`). Poll/refresh to `CLOSED`.
- **Download appears only at `CLOSED`.** Reopen after CLOSED via `releaseDeal`.
- **G/W/T:** Given rentee accepts‑all, Then status → awaiting + no download + withdraw shown; Given supplier confirms (CLOSED), Then accepted banner + download; Given withdraw, Then → negotiating.

---

## Phase 3 — Accepted quantity ("X of Y")

### T7 — ⚠ BACKEND: separate accepted quantity
- Add rentee‑editable **`acceptedQty` (≤ offered)**, carried on the counter (`proposeRate`), accept (`acceptAllTerms`), and the **quotation** total; keep `offerQty` locked. (Spec D1 / Part G #1.)
- **G/W/T:** Given offered=3, When acceptedQty=2 sent, Then quotation totals use 2; Given acceptedQty>offered, Then rejected.

### T8 — Quantity card + availability indicator `WEB-UI` + `BFF`
- Quotation step gains a **quantity card**: "يوفّرها المورد" box (offer + **متاح X** badge + **📍 من N يارد مختار**) + **تعتمد الآن** stepper; carry `acceptedQty` on counter/accept.
- **Stepper caps at `availableQty`**, falling back to `offerQty` until yard availability lands (spec E4 / T15). Read‑only **"⚠ متاح ٣ من ٥"** chip on the negotiation tab; carried through review + agreement summaries (spec B3, D1).
- Quotation totals + comparison fulfillment math consume `acceptedQty` (spec E1, E2).
- **G/W/T:** Given available 3 of offered 5, Then the negotiation shows "⚠ متاح ٣ من ٥" read‑only and the stepper caps at 3; Given availability not yet wired, Then the stepper caps at offered and the badge is hidden.

### T15 — ⚠ BACKEND (app dependency, later): yard availability
- Source `availableQty` + the "N selected yards" from **app‑side yard inventory** on the deal‑room payload (spec E4 / Part G #7). Not web‑derivable. Web degrades to offered until this lands.
- **G/W/T:** Given the payload carries availableQty=3 across 2 yards, Then the badge shows "متاح ٣ · 📍 من ٢ يارد" and the stepper caps at 3.

---

## Phase 4 — Activity log (consolidated) `WEB-UI` (+ `⚠ BACKEND` for full price rounds)

### T9 — Activity log view
- One drawer/tab, newest‑first: **term changes** (from `history[]`, T1), **price changes** (latest now; full rounds later), **lifecycle events** (accepted/awaiting/confirmed/withdrawn/declined/reopened). Filter per item in a group.
- **⚠ BACKEND (gap 2):** per‑price‑counter history via **Stream events** (preferred) or a `counter_offers` table, so price rounds are real not just the latest.
- **G/W/T:** Given several term + price changes, Then the log lists them chronologically with actor/old→now/time; Given only latest price is known, Then it shows the latest with a note until rounds land.

---

## Phase 5 — Multi‑item group view

### T10 — Group assembly (reuse the inbox) `WEB-UI` + `CONTRACT`
- Resolve the current room's **group** via the inbox mechanism (`requestGroupId` + `groupRef` from `my-requests`/`fetchRequestSubmissions`, spec E3) and find **sibling per‑item rooms for the same supplier**. **No new endpoint.**
- **G/W/T:** Given a room in a 3‑item RFQ where the supplier bid on all 3, Then the view resolves 3 sibling rooms + the `RFQ‑` code.

### T11 — Item strip + per‑item state `WEB-UI`
- Tab strip (one per item); switching swaps that item's price/terms/scenario. Group id on the header (not repeated in the strip); tabs carry equipment/status/units·price; group shows per‑item progress ("2 of 3 agreed"). **Close is per item** (no "approve all").
- **G/W/T:** Given item A agreed + item B negotiating, Then the strip shows A ✓ / B in‑progress and switching tabs preserves each item's state.

### T12 — Inbox ↔ grouped room wiring `WEB-UI`
- Inbox opens the **grouped** view with the clicked item pre‑selected; label/code rule + unread stay identical to the inbox (spec E3).
- **G/W/T:** Given the inbox row for item B in a group, When opened, Then the group view shows with item B active.

### T13 — ⚠ BACKEND: per‑supplier shared chat
- One chat channel per **supplier across the group's items** (today it's one per room). (Spec D2 / Part G #4.) Web renders the single thread with the pinned group summary.
- **G/W/T:** Given a supplier on 3 group items, Then one chat thread spans all 3.

---

## Phase 6 — Dependency polish

### T14 — Comparison: live price refresh `WEB-UI`
- Consume the silent `rate_change` push (or re‑fetch on focus) so a negotiated price change updates the compared card's `currentPrice` (spec H‑A6, E1). Term overlay + Awarded already work.
- **G/W/T:** Given a counter changes the price, Then the comparison card's price updates without a manual reload.

---

## Backend handoffs (you own — spec Part G)
| # | Ticket | Backend change |
|---|---|---|
| 1 | T7 | `acceptedQty` (≤ offered) on counter / accept / quotation |
| 2 | T9 | per‑price‑counter history (Stream events or `counter_offers`) |
| 3 | T2 | `supplierStatus` on the deal‑room supplier object |
| 4 | T13 | one shared chat channel per supplier across a group |
| 5 | T8 | (optional) first‑class fulfillment field to harden offer‑vs‑request (web derives meanwhile) |
| 6 | T15 | yard availability (`availableQty` + N selected yards) — app‑level dependency, later; caps the accepted stepper |

## Ship order
1. **P1 + P2** — correctness + the single‑item negotiation redesign (usable on its own).
2. **P3** — accepted quantity (needs T7 backend).
3. **P4** — activity log (term history immediately; price rounds when T9 backend lands).
4. **P5** — multi‑item group view (T10–T12 web now; T13 chat when backend lands).
5. **P6** — comparison live price.
