# Deal Room Negotiation — Full Spec (Rentee / Web)

**Primary surface:** the deal‑room negotiation (`src/components/deal-room/DealRoom.tsx`). **Dependencies:** comparison table, quotation, inbox, requests.
**Sources:** desktop prototype `Deal Room - Desktop.dc.html`; `deal-room-negotiation-spec.md`; app rulebook `docs/deal-room-rules.md` + `docs/terms-catalog-and-buckets.md` (verified vs `origin/main`); current web code.

> **Legend:** `[REAL]` already true · `[PROTO]` prototype only · `[WEB]` web‑only change · **`⚠ BACKEND`** = **requires a Moedatech‑App backend change**. `[GAP]` (backend not built) is **always also `⚠ BACKEND`**. **Every backend‑change item is collected in Part G (master list).**

**Organization:** A. Decisions · B. **Rules** · C. **Terms** · D. **Features** · E. **Dependencies** · F. **UI** · G. **Backend (⚠)** · H. Audit · I. Open items.

---

## A. Locked decisions (this spec is written to these)

1. **Close = real two‑stage.** Rentee **Accept** = *accept‑all* → `AWAITING_SUPPLIER_CONFIRMATION`; the **supplier** confirms → `CLOSED`. The rentee never closes unilaterally. **Quotation/download appears only at `CLOSED`.** The prototype's "approve → download" maps to **CLOSED**, not the rentee's click.
2. **Accepted quantity is a separate, rentee‑editable field**, capped at **yard availability** (`accepted ≤ available ≤ offered`), carried on the counter + quotation. `⚠ BACKEND` (backend field) + `[WEB]`. Availability itself is an **app‑level dependency, later** (Part G #7); until then the cap falls back to offered.
3. **Multi‑item = one group (RFQ) view; per‑item negotiation; one chat per supplier across the group.** Terms **and** price are negotiated **per item**; the chat channel is shared per supplier across that supplier's items within the group.
4. **History:** per‑**term** rounds already persist (backend term `history[]`) → surface on web `[WEB]`; per‑**price** rounds are latest‑only today → round history is `⚠ BACKEND` (Stream events or a `counter_offers` table). Both feed one **Activity log** (D3).

---

# B. RULES (the negotiation model)

## B1. Statuses & lifecycle (rentee lens)

`OPEN → NEGOTIATING → AWAITING_SUPPLIER_CONFIRMATION → CLOSED` (terminal), or `→ ABANDONED` (terminal, 7‑day inactivity).

- **OPEN ⟺ rentee hasn't entered.** The rentee's GET flips `OPEN → NEGOTIATING`. (The rentee always arrives via their own GET, so they effectively never *see* OPEN.)
- **NEGOTIATING** — the working state; price + terms are negotiated.
- **AWAITING_SUPPLIER_CONFIRMATION** — rentee accepted‑all; **waiting on the supplier**. Rentee may **withdraw** (→ NEGOTIATING); may **not reopen terms** here.
- **CLOSED** — supplier confirmed; quotation generated; chat frozen; **download available**.
- **ABANDONED** — inactivity; bid → PENDING; room read‑only "cancelled."
- **Invariant:** opening a room mutates nothing; only accept‑all (→ bid ACCEPTED) and confirm (→ CLOSED + quotation) change bid/request state.

## B2. Turn model

- `myTurn` `[REAL]` = `(status===OPEN || NEGOTIATING) && lastCounterBy !== 'rentee'`.
- Labels: your turn = **دورك** · waiting = **في انتظار رد المورد** · accepted/closed = **تم القبول / معتمد**.

## B3. The four quantities

| Quantity | Meaning | Editable by |
|---|---|---|
| **reqQty** (request) | What the RFQ asked (anchor for all bids). | Nobody (changing it invalidates bids). |
| **offerQty** (`numberOfUnits`) | Units the supplier committed in the bid (e.g. 5 of 5). | Nobody. |
| **availableQty** (يوفّرها المورد → متاح) | Units actually available **right now**, yard‑driven, from the supplier's selected yards. | Nobody (app supplies it). |
| **acceptedQty** (تعتمد الآن) | Units the rentee finalizes on **this** offer. | **Rentee only.** |

- Invariant: `reqQty ≥ offerQty ≥ availableQty ≥ acceptedQty ≥ 1`. Available is a **subset of offered** (a yard can't surface more than was committed).
- **The accepted‑qty stepper caps at `availableQty`** (not offered) — you can only finalize what's on hand.
- Pricing is per‑unit on the **accepted** qty: `total = (rate·periods + mob + demob) × acceptedQty`, then **+15% VAT**. mob/demob are per‑unit `[REAL]`.
- Negotiation surface shows a read‑only availability chip **"⚠ متاح ٣ من ٥"** (available of offered). Quantity is editable **only** in the quotation step (see D1).
- **`availableQty` is an app‑level dependency, implemented later `[PROTO now]` `⚠ BACKEND`:** the yard‑availability number + "من N يارد مختار" is **not web‑derivable and not built today** — it depends on app‑side yard inventory (Part G #7). Until it lands, the stepper falls back to capping at offered.
- **Current reality `[REAL]`:** one `numberOfUnits` (= offered) reused by room + quotation; `proposeRate` sends no units; `acceptDeal` has `agreedUnits` but web omits it → see Feature D1 + `⚠ BACKEND` (Part G #1).

## B4. Price negotiation

- **Rate card** = three per‑unit lines the rentee edits: **base rental** (`rate` × periods), **mobilization** (`mob`, one trip), **demobilization** (`demob`, one trip). Each may be **charged**, **included**, or **by rentee** (responsibility is a request flag — see C5; only the *price* is negotiated) `[REAL]`.
- **Config that drives price:** mode `fixed`|`open`; billing daily/weekly/monthly; duration (fixed mode). Changing **quantity / operator inclusion / scope reopens the price** (clears agreed; rentee must re‑send).
- **Counter** = rentee edits a line → `proposeRate({proposedRate, priceUnit, mobPrice, demobPrice})` `[REAL]`, **plus `acceptedQty`** once split `⚠ BACKEND`. Supplier counters back or accepts; `price.agreed` only on explicit accept.
- **PRICE is a synthetic term** mirrored to `last_proposed_*` columns; `proposeRate`/`updateTerm(PRICE)` stay in sync. Silent `marketplace.rate_change` FCM refreshes both parties' cards ~5s (no banner) `[REAL]`.
- **Price terms (`PRICE`, `mobilization_pricing`, `demobilization_pricing`) are exempt from the close‑term gate** — resolved on the price page.
- **History:** latest counter only in `deal_rooms`. Round‑by‑round price history `⚠ BACKEND` (Part G #2).

## B5. Accept → confirm → close (two‑stage, real)

- **Stage 1 — rentee Accept‑all** (`acceptDeal`): must be NEGOTIATING; **blocked if any `disputed` term is unresolved** (resolve via `termResolutions`: accept→agreed / counter→pending). Promotes non‑`fixed` (pending/soft_accepted) → `agreed`. Sets `acceptedQty` `⚠ BACKEND`. → `AWAITING_SUPPLIER_CONFIRMATION`, reserves units, bid → ACCEPTED, notifies supplier.
- **Stage 2 — supplier confirms** (`confirmDeal`, supplier side): gate = every non‑price term `agreed`/`fixed`; unit‑coverage cap; → `CLOSED` + quotation + chat frozen. **Rentee side is passive** — it polls/refreshes to `CLOSED`.
- **Withdraw acceptance** (`withdrawAcceptance` / web `releaseDeal`): rentee, only from AWAITING → NEGOTIATING, `agreedUnits→null`, bid → OPEN_FOR_NEGOTIATION.
- **Decline / renegotiate** (`declineDeal`): supplier‑only (+reason; 3rd → ops flag) → NEGOTIATING. Rentee sees "renegotiation requested."
- **Reopen after CLOSED** (`releaseDeal`): reopens negotiation. **Known wrinkle `⚠ BACKEND`:** reopen→re‑confirm inserts a 2nd quotation row + `findFirst` has no `orderBy` → stale quotation; **backend‑only fix** (Part G #5); web already aligned.
- **Download** = CLOSED only (banner + footer + bottom bar). Never on accept alone.

## B6. The four rentee scenarios

| # | Label | Real state | Rentee sees |
|---|---|---|---|
| 1 | التفاوض (fresh) | NEGOTIATING, rentee's turn, no counter yet | about to open price/terms, send round 1 |
| 2 | بانتظار المورد | NEGOTIATING, `lastCounterBy==='rentee'` | their counter; waiting for supplier |
| 3 | ردّ المورد وصل | NEGOTIATING, supplier countered (`lastCounterBy==='supplier'`) | supplier's reply per line/term; accept vs counter |
| 4 | متفق ومعتمد | `AWAITING` (accepted, awaiting) → `CLOSED` (confirmed) | after accept: "waiting for supplier to confirm"; after CLOSED: accepted banner + **download** |

**Critical:** `price.agreed` (numbers agreed) ≠ **CLOSED** (deal final). The rentee's accept → **awaiting** (not closed). Download is **CLOSED‑only**.

---

# C. TERMS

## C1. Buckets & catalog (the constant a term belongs to decides behavior)

| Bucket | Deal‑room behavior | Keys (examples) |
|---|---|---|
| **Negotiable** (`CONFLICT_ELIGIBLE`) | supplier declares; can conflict; negotiated | payment_terms, breakdown_response_sla, overtime_rate, fuel_responsibility, operator_included, operator_nationality, operator_certification, safety_certifications, fat_food, fat_accommodation_transport, mobilization_lead_time |
| **Priced** (`ALWAYS_NEGOTIATE`) | rate card, always active (never auto‑accepted) | PRICE, mobilization_pricing, demobilization_pricing |
| **Acknowledge** (`ACKNOWLEDGE`) | `fixed`, read‑only, non‑actionable (rentee's request value wins) | maintenance_responsibility, night_shift, required_attachments, fulfillment_type, working_days, working_hours, crosshire/subletting, local_content, equipment_attachment |
| **Informational** (`BID_PHASE_ONLY`) | **stripped** from the room | offer_duration |

## C2. Per‑term states & permissions

**State assignment** (`buildTermsArray`): `fixed | soft_accepted | disputed | pending | agreed`.
- Acknowledge → `fixed` **only if the rentee actually set it** on the request (never from catalog default).
- supplier‑declared + conflict‑eligible + mismatch → `disputed` (+ `conflicts[]`).
- always‑negotiate (`*_pricing`) → `pending` even on a match.
- matched negotiable / platform default → `soft_accepted`.
- Sort: `disputed → pending → soft_accepted → agreed → fixed`; cost‑affecting first.

**Actions & permissions** (room `NEGOTIATING`/`OPEN`):
- `fixed` → never actionable (`DEAL_ROOM_TERM_FIXED`).
- `agreed` + supplier `propose_update` → rejected (`DEAL_ROOM_TERM_LOCKED`).
- **Rentee:** `accept`→agreed · `counter`→pending · `reopen`→pending (blocked while AWAITING).
- **Supplier:** `propose_update`→pending only; `soft_accept` (batch)→soft_accepted.
- **Reopening an agreed term is the only re‑negotiation path, rentee‑only.**

## C3. Negotiation & local resolution `[REAL]`

The rentee resolves disputed/countered terms **locally** (`resolutions` map), then batches them with the counter (`batchUpdateTerms` + `proposeRate`) or with accept (`acceptDeal({termResolutions})`). `allMatched()` = `!priceDiff` AND every negotiable term agreed → gates the in‑sheet accept.

## C4. Term history `[REAL data · WEB to surface]`

Every action appends `history{action, by, value, at}` and posts a system chat message. Data already persisted → map the backend term `history[]` into `DealTerm` and show a per‑term round log (who/value/at). Also feeds the Activity log (D3). **No backend change.**

## C5. Mobilization / demobilization responsibility

- "Who mobilizes" is a **request item flag** (`mobilizationByRentee` / `demobilizationByRentee`), set at request creation — **not a deal‑room term** and **not changeable in the room**.
- The flag governs whether the `*_pricing` term appears (supplier handles → priced term shows; rentee handles → stripped).
- The room negotiates only the **price** of mob/demob. The quotation **always states** mob/demob, incl. **"By rentee"** when applicable `[REAL, done]`.

## C6. Stripping (applied by the backend on read) `[REAL]`

bid‑phase‑only (`offer_duration`); rentee‑handled mob/demob → `*_pricing` + `mobilization_lead_time` stripped; no‑operator line → FAT + operator_nationality + operator_certification stripped. Web additionally drops PRICE + `*_pricing` from the term list (the rate card owns them).

---

# D. FEATURES (what this spec builds)

## D1. Accepted quantity — "تعتمد الآن X" `[WEB + ⚠ BACKEND]`

- Split `offerQty` (locked, supplier's committed) from a rentee‑editable **`acceptedQty`**; carry it on the counter (`proposeRate`), accept (`acceptDeal`), and the quotation total `⚠ BACKEND` (Part G #1).
- Quotation step gains a **quantity card**: the **"يوفّرها المورد" box** shows the offer with an inline **"متاح X" availability badge** + **"📍 من N يارد مختار"**; the **"تعتمد الآن" stepper caps at `availableQty`** (see E4 — falls back to offered until availability lands). reqQty / offerQty also shown as context.
- Totals + comparison fulfillment math consume `acceptedQty`.
- Read‑only **"⚠ متاح ٣ من ٥" chip** on the negotiation tab; the accepted qty is **carried through the review + agreement summaries**.

## D2. Multi‑item / group (RFQ) view `[WEB, reuses inbox]`

- **One group view** keyed by **`RFQ‑NNNNN`** (`groupRef`); each item a child **`REQ‑NNNNN`**. **Grouping is web‑derivable — NOT a backend gap:** the inbox already does it (E3), and this view **reuses that exact mechanism** to resolve the current room's group + sibling per‑item rooms for a supplier.
- **Item strip** of tabs (one per equipment item); switching swaps that item's price + terms + scenario. Group ID on the header (not repeated in the strip); tabs carry per‑item context (equipment, status, units·price).
- **Negotiation is per item** (each item at its own scenario). **Close is per item** — no "approve all"; the group aggregates progress ("2 of 3 items agreed").
- **Chat = one per supplier across the group's items** `⚠ BACKEND` (channels are per‑room today — Part G #4). The tabs + per‑item state are pure `[WEB]`.
- **Shape A vs B `[REAL backend]`:** Shape B = >1 item **AND** `fulfillment_type=SINGLE_SUPPLIER` → per‑item terms replicated/grouped; Shape A = first item drives resolution.

## D3. Activity log — consolidated change history `[WEB + partial ⚠ BACKEND]`

One view (drawer/tab), **newest first**, listing **every** negotiation change so the rentee sees the whole story in one place (replaces the prototype's scattered per‑price/per‑term logs):
- **Term changes** — from each term's `history[]` (who · action · value · at). Data persisted `[REAL]`; web to surface `[WEB]`.
- **Price changes** — each rate/mob/demob counter (who · old→now · at). Latest is `[REAL]`; full rounds need Stream events `⚠ BACKEND` (Part G #2).
- **Lifecycle events** — accepted → awaiting → confirmed/closed, withdrawn, declined (+reason), reopened, abandoned.
- **Multi‑item:** grouped/filterable per item.

---

# E. DEPENDENCIES

## E1. Comparison table

- **Term overlay `[REAL]`** — live deal‑room term states per `dealRoomId` overlaid onto the bid cards. Keep.
- **Awarded `[REAL]`** — bid at ACCEPTED (or won‑via‑survey) shows **"Awarded"** + a link into the room. Keep; may reflect AWAITING/CLOSED distinctly.
- **Live price refresh `[WEB]`** — the card's `currentPrice` isn't refreshed from the `rate_change` push; consume the push (or re‑fetch on focus) so the compared price tracks the room (audit A6).
- **Accepted‑qty** — the fulfillment "units covered" math must use `acceptedQty` (needs Part G #1).

## E2. Quotation

- Already aligned to the app (logo, price + always mob/demob incl. "by rentee", rental & equipment details, terms via agreed/fixed, short disclaimer) `[REAL, done]`.
- **Must consume `acceptedQty`** for the priced total once split (today it uses offered units) `⚠ BACKEND` (Part G #1).
- Reopen→stale‑quotation wrinkle is backend‑only (Part G #5).

## E3. Inbox (deal‑room list) `[REAL, reuse]`

`InboxView` already groups a renter's bids/rooms **by RFQ group, entirely web‑side**:
- `fetchReceivedBids()` + `fetchMyRequests()` → `groupMap: requestId → requestGroupId`.
- Group key = `requestGroupId ?? request.groupId ?? request.id ?? bidId`; RFQ code via `fetchRequestSubmissions(rep).groupRef` (falls back to the `REQ‑` code).
- Two‑level: Level 1 = RFQ group, Level 2 = per request/item; each row carries `dealRoomId` + `dealRoomStatus` + unread.

**Reuse contract for the group view (D2):** same source resolves the current room's group + sibling per‑item rooms for the same supplier → drives the item strip (**no new endpoint**). The inbox links into the room and should open the **grouped** view (clicked item pre‑selected). Keep the label/code rule (`groupRef ?? REQ‑code`) + unread identical so the surfaces never disagree.

## E4. Yard availability — `availableQty` + selected yards `[PROTO now · app‑level dependency, later]`

- **What the prototype shows:** the "يوفّرها المورد" box carries a **"متاح X"** badge + **"📍 من N يارد مختار"**; the accepted stepper caps at **available**; a read‑only **"⚠ متاح ٣ من ٥"** chip on the negotiation tab; carried through review + agreement summaries.
- **Source is an app‑level dependency, NOT built today `⚠ BACKEND` (Part G #7):** the available count + the "N selected yards" come from **app‑side yard inventory** — not web‑derivable. Web can't compute "how many units are on hand across the supplier's chosen yards."
- **Fallback until it lands:** the stepper caps at `offerQty` and the availability badge/chip are hidden (or show offered). No web behavior blocks on this — it degrades cleanly.
- Ordering it enforces once live: `offerQty ≥ availableQty ≥ acceptedQty` (B3).

---

# F. UI (prototype)

- **Price card** (top): rate + est. total, breakdown, turn chip, Counter/Accept — matches current web `[REAL]`, restyled `[PROTO]`.
- **Negotiation bottom sheet** — 3‑step wizard `[PROTO]`:
  1. **السعر والدفع** — editable rate/mob/demob (per unit) + config (mode/duration/billing) + **quantity card** (يوفّرها المورد box with **متاح X** badge + **📍 من N يارد مختار**; **تعتمد الآن** stepper capped at available — offered until E4 lands) + payment‑terms & payment‑method term cards.
  2. **الشروط** — negotiable terms; accept supplier value or counter per term; "قبول الكل" shortcut; legend (awaiting you / matches / differs).
  3. **المراجعة** — single column: price summary (accepted‑qty line + supplier vs yours + match/differ chip), negotiated terms (agreed ✓ / counter · yours), acknowledged read‑only terms.
- **Bottom price bar / turn control** `[PROTO]`: total + breakdown chips (old→now on delta) + meta chips (round, duration, accepted qty, **availability ⚠ متاح X من Y**, operator, excluded trips) + terms progress + turn control:
  - `CLOSED` → **⬇ تنزيل عرض السعر** (+ **↻ إعادة فتح** where allowed).
  - `AWAITING` (rentee accepted) → **في انتظار المورد** + **↩ سحب القبول** (withdraw).
  - all matched, rentee's turn → green **✓ قبول واعتماد**.
  - supplier countered → **تفاوض** (pulsing); fresh/waiting → **تفاوض** / **عرض العرض**.
- **Accept entry points** (both → CLOSED only after supplier confirm): (a) bottom‑bar green **✓ قبول واعتماد** when all matched; (b) in‑sheet **✓ قبول العرض** beside the nav button on all 3 steps when `allMatched()`.

---

# G. BACKEND — `⚠ BACKEND` MASTER LIST

_Every backend change this spec needs is here. Tags elsewhere map to a row below._

**True today `[REAL]` (no change):** latest‑counter fields only; `proposeRate` w/o units; single `numberOfUnits`=offered; group `RFQ‑NNNNN` / per‑request `REQ‑NNNNN`; per‑**term** `history[]` persisted.

**Backend changes required:**
1. `⚠ BACKEND` **Separate `acceptedQty`** (≤ offered) on counter + accept + quotation. *(D1 / T7)*
2. `⚠ BACKEND` **Per‑price‑counter history** (Stream events or a `counter_offers` table) — activity‑log price rounds. *(B4 / D3 / T9)*
3. `⚠ BACKEND` **`supplierStatus` on the deal‑room supplier** so the verified badge uses `supplierStatus===2` (the room only carries `isVerified` today). *(H‑A3 / T2)*
4. `⚠ BACKEND` **Per‑supplier group chat** — one channel per supplier across the group's items (one per room today). *(D2 / T13)*
5. `⚠ BACKEND` **Reopen → stale‑quotation fix** — add `orderBy`/dedupe. *(B5; backend‑only, web already aligned)*
6. `⚠ BACKEND` *(optional)* **First‑class fulfillment field** for offer‑vs‑request — web derives it meanwhile. *(D1 / T8)*
7. `⚠ BACKEND` **Yard availability** (`availableQty` + N selected yards) — app‑level dependency, **later**; drives the "متاح X" badge + stepper cap. Prototype‑present, not built; degrades to offered. *(B3 / E4)*

**NOT a backend change (web‑only):** group assembly / item strip (reuses inbox E3); per‑term history display (C4, data persisted); two‑stage close (B5); turn control; activity‑log term rows.

---

# H. Existing‑web audit (fix list vs the rules)

| # | Finding | Type | Action |
|---|---|---|---|
| A1 | Single `numberOfUnits`; no accepted‑qty; no yard availability; `proposeRate` sends no units | ⚠ BACKEND + WEB | D1 + E4 |
| A2 | Two‑stage close incomplete (no AWAITING handling/withdraw UI) | WEB | B5 |
| A3 | Deal‑room verified uses `isVerified` not `supplierStatus===2` | WEB + ⚠ BACKEND | G #3 |
| A4 | No multi‑item group view / item strip | WEB | D2 (reuse inbox E3; only per‑supplier chat is ⚠ BACKEND) |
| A5 | Per‑term history not surfaced (backend has it) | WEB | C4 |
| A6 | Comparison doesn't refresh price from `rate_change` | WEB | E1 |
| A7 | Term stripping / Ack‑fixed / mob‑demob responsibility / `myTurn` | — | ✅ already correct |

---

# I. Open items (still to confirm)

1. **Price round‑history source** — Stream events vs a `counter_offers` table (cost/latency). *Assumption: Stream first.*
2. **Two availability notions, don't conflate:** *offer‑vs‑request* ("supplier offered 3 of requested 5") is **web‑derivable now** (optional hardening = Part G #6); *yard availability* ("متاح ٣", from N selected yards) is an **app‑level dependency, later** (Part G #7) and caps the accepted stepper once live. The "⚠ متاح ٣ من ٥" chip is the yard notion.
3. **Group close** — per item only; no "approve all." *Confirmed: per item; group shows progress.*
