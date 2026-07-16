
# Deal Room Negotiation — Full Spec (Rentee / Web)

**Surface:** primary = the deal‑room negotiation (`src/components/deal-room/DealRoom.tsx`); dependencies = comparison table, quotation, requests.
**Sources:** desktop prototype `Deal Room - Desktop.dc.html`; `deal-room-negotiation-spec.md`; app rulebook `docs/deal-room-rules.md` + `docs/terms-catalog-and-buckets.md` (verified vs `origin/main`); current web code.

> **Legend:** `[REAL]` already true · `[PROTO]` prototype only · `[WEB]` web‑only change · **`⚠ BACKEND`** = **requires a Moedatech‑App backend change**. `[GAP]` (backend not built) is **always also `⚠ BACKEND`**. **Every backend‑change item is collected in §13 (master list).**

---

## 0. Locked decisions (this spec is written to these)

1. **Close = real two‑stage.** Rentee **Accept** = *accept‑all* → `AWAITING_SUPPLIER_CONFIRMATION`; the **supplier** confirms → `CLOSED`. The rentee never closes unilaterally. **Quotation/download appears only at `CLOSED`.** The prototype's "approve → download" maps to **CLOSED**, not the rentee's click.
2. **Accepted quantity is a separate, rentee‑editable field**, capped at the supplier's offered units (`accepted ≤ offered`), carried on the counter + quotation. `[GAP]` (backend field) + `[WEB]`.
3. **Multi‑item = one group (RFQ) view; per‑item negotiation; one chat per supplier across the group.** Terms **and** price are negotiated **per item**; the chat channel is shared per supplier across that supplier's items within the group.
4. **History:** per‑**term** rounds already persist (backend term `history[]`) → surface on web `[WEB]`; per‑**price** rounds are latest‑only today → round history is `[GAP]` (Stream events or a `counter_offers` table).

---

## 1. The quantities (four layers)

| Quantity | Meaning | Editable by |
|---|---|---|
| **reqQty** (request) | What the RFQ asked (anchor for all bids). | Nobody (changing it invalidates bids). |
| **offerQty** (`numberOfUnits`) | Units the supplier offers to fulfill in the bid (e.g. 5 of 5). | Nobody. |
| **availQty** (availability) | Of the offered units, how many are **available now** — derived from the **yards the supplier assigned** to the item. Surfaced as "offer 5 · available 3". | Supplier, indirectly via his yard selection; **not** the rentee. |
| **acceptedQty** | Units the rentee finalizes on **this** offer (`≤ availQty`). | **Rentee only.** |

- Invariant: `reqQty ≥ offerQty ≥ availQty ≥ acceptedQty ≥ 1`.
- Pricing is per‑unit on the **accepted** qty: `total = (rate·periods + mob + demob) × acceptedQty`, then **+15% VAT**. mob/demob are per‑unit `[REAL]`.
- **Availability is yard‑driven `[GAP]`:** the supplier picks yards for each item; the sum of those yards' on‑hand units = `availQty`. Reflected **read‑only** in the negotiation surface **and** the quotation quantity card as an availability indicator ("يوفّر ٥ · متاح ٣ · من N يارد").
- Negotiation surface shows `availQty of offerQty` **read‑only** (amber "⚠ متاح 3 من 5"). Quantity is **not** editable there.
- **Only the quotation step** sets `acceptedQty` (stepper **capped at `availQty`**, not offered).
- **Current reality `[REAL]`:** one `numberOfUnits` (= offered) reused by room + quotation; no availability field; `proposeRate` sends no units; `acceptDeal` has `agreedUnits` but web omits it. → **split `offerQty` (locked) + `availQty` (yard‑derived, locked) + rentee‑editable `acceptedQty`** `[GAP]/[WEB]`.

---

## 2. Statuses & lifecycle (rentee lens)

`OPEN → NEGOTIATING → AWAITING_SUPPLIER_CONFIRMATION → CLOSED` (terminal), or `→ ABANDONED` (terminal, 7‑day inactivity).

- **OPEN ⟺ rentee hasn't entered.** The rentee's GET flips `OPEN → NEGOTIATING`. (Rentee always arrives via their own GET, so the rentee effectively never *sees* OPEN.)
- **NEGOTIATING** — the working state; price + terms are negotiated.
- **AWAITING_SUPPLIER_CONFIRMATION** — rentee accepted‑all; **waiting on the supplier**. Rentee may **withdraw** (→ NEGOTIATING); rentee may **not reopen terms** here.
- **CLOSED** — supplier confirmed; quotation generated; chat frozen; **download available**.
- **ABANDONED** — inactivity; bid → PENDING; room read‑only "cancelled."

Rentee‑visible states map to the prototype's four scenarios (§7).

---

## 3. Turn model

- `myTurn` `[REAL]` = `(status===OPEN || NEGOTIATING) && lastCounterBy !== 'rentee'`.
- Labels: your turn = **دورك** · waiting = **في انتظار رد المورد** · accepted/closed = **تم القبول / معتمد**.
- **Bottom‑bar turn control** `[PROTO]` — single primary button whose inset tag + action + destination change by state:
  - `CLOSED` → **⬇ تنزيل عرض السعر** (+ **↻ إعادة فتح** where allowed).
  - `AWAITING_SUPPLIER_CONFIRMATION` (rentee accepted) → **في انتظار المورد** + **↩ سحب القبول** (withdraw).
  - all matched, rentee's turn → green **✓ قبول واعتماد** (opens the review/accept‑all).
  - supplier countered → **تفاوض** (pulsing).
  - fresh / waiting → **تفاوض** / **عرض العرض**.

---

## 4. Price negotiation

- **Rate card** = three per‑unit lines the rentee edits: **base rental** (`rate` × periods), **mobilization** (`mob`, one trip), **demobilization** (`demob`, one trip). mob/demob may be **charged**, **included**, or **by rentee** (responsibility is a request flag — see §6; only the *price* is negotiated) `[REAL]`.
- **Config that drives price:** mode `fixed`|`open`; billing daily/weekly/monthly; duration (fixed mode). Changing **quantity / operator inclusion / scope reopens the price** (clears agreed; rentee must re‑send).
- **Counter** = rentee edits a line → `proposeRate({proposedRate, priceUnit, mobPrice, demobPrice})` `[REAL]`, **plus `acceptedQty`** once split `[GAP]`. Supplier counters back or accepts. `price.agreed` only on an explicit accept.
- **PRICE is a synthetic term** mirrored to `last_proposed_*` columns; `proposeRate`/`updateTerm(PRICE)` stay in sync. Silent `marketplace.rate_change` FCM refreshes both parties' cards ~5s (no banner) `[REAL]`.
- **Price terms (`PRICE`, `mobilization_pricing`, `demobilization_pricing`) are exempt from the close‑term gate** — resolved on the price page.
- **History:** latest counter only in `deal_rooms`. Round‑by‑round price history `[GAP]`.

---

## 5. Terms negotiation

**Buckets** (from the catalog — the constant a term belongs to decides behavior):

| Bucket | Deal‑room behavior | Keys (examples) |
|---|---|---|
| **Negotiable** (`CONFLICT_ELIGIBLE`) | supplier declares; can conflict; negotiated | payment_terms, breakdown_response_sla, overtime_rate, fuel_responsibility, operator_included, operator_nationality, operator_certification, safety_certifications, fat_food, fat_accommodation_transport, mobilization_lead_time |
| **Priced** (`ALWAYS_NEGOTIATE`) | rate card, always active (never auto‑accepted) | PRICE, mobilization_pricing, demobilization_pricing |
| **Acknowledge** (`ACKNOWLEDGE`) | `fixed`, read‑only, non‑actionable (rentee's request value wins) | maintenance_responsibility, night_shift, required_attachments, fulfillment_type, working_days, working_hours, crosshire/subletting, local_content, equipment_attachment |
| **Informational** (`BID_PHASE_ONLY`) | **stripped** from the room | offer_duration |

**Per‑term state** (`buildTermsArray`): `fixed | soft_accepted | disputed | pending | agreed`.
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
- Every action appends `history{action, by, value, at}` `[REAL, web to surface]` and posts a system chat message.

**Web resolution model `[REAL]`:** the rentee resolves disputed/countered terms **locally** (`resolutions` map), then batches them with the counter (`batchUpdateTerms` + `proposeRate`) or with accept (`acceptDeal({termResolutions})`).

**Term history `[WEB]`:** map the backend term `history[]` (already persisted) into `DealTerm` and show a per‑term round log (who/value/at). No backend change.

**Stripping (already applied by the backend on read):** bid‑phase‑only (`offer_duration`); rentee‑handled mob/demob → `*_pricing` + `mobilization_lead_time` stripped; no‑operator line → FAT + operator_nationality + operator_certification stripped. Web additionally drops PRICE + `*_pricing` from the term list (rate card owns them) `[REAL]`.


---

## 6. Mobilization / demobilization responsibility

- "Who mobilizes" is a **request item flag** (`mobilizationByRentee` / `demobilizationByRentee`), set at request creation — **not a deal‑room term** and **not changeable in the room**.
- The flag governs whether the `*_pricing` term appears (supplier handles → priced term shows; rentee handles → stripped).
- The room negotiates only the **price** of mob/demob. The quotation **always states** mob/demob, incl. **"By rentee"** when applicable `[REAL, done]`.

---

## 7. The four rentee scenarios

| # | Label | Real state | Rentee sees |
|---|---|---|---|
| 1 | التفاوض (fresh) | NEGOTIATING, rentee's turn, no counter yet | about to open price/terms, send round 1 |
| 2 | بانتظار المورد | NEGOTIATING, `lastCounterBy==='rentee'` | their counter; waiting for supplier |
| 3 | ردّ المورد وصل | NEGOTIATING, supplier countered (`lastCounterBy==='supplier'`) | supplier's reply per line/term; accept vs counter |
| 4 | متفق ومعتمد | `AWAITING_SUPPLIER_CONFIRMATION` (accepted, awaiting) → `CLOSED` (confirmed) | after accept: "waiting for supplier to confirm"; after CLOSED: accepted banner + **download** |

**Critical:** `price.agreed` (numbers agreed) ≠ **CLOSED** (deal final). The rentee's accept → **awaiting** (not closed). Download is **CLOSED‑only**.

---

## 8. Accept → confirm → close (two‑stage, real)

- **Stage 1 — rentee Accept‑all** (`acceptDeal`): must be NEGOTIATING; **blocked if any `disputed` term is unresolved** (resolve via `termResolutions`: accept→agreed / counter→pending). Promotes non‑`fixed` (pending/soft_accepted) → `agreed`. Sets `acceptedQty` `[GAP]`. → `AWAITING_SUPPLIER_CONFIRMATION`, reserves units, bid → ACCEPTED, notifies supplier.
- **Stage 2 — supplier confirms** (`confirmDeal`, supplier side): gate = every non‑price term `agreed`/`fixed`; unit‑coverage cap; → `CLOSED` + quotation + chat frozen. **Rentee side is passive here** — it polls/refreshes to `CLOSED`.
- **Withdraw acceptance** (`withdrawAcceptance` / web `releaseDeal`): rentee, only from AWAITING → NEGOTIATING, `agreedUnits→null`, bid → OPEN_FOR_NEGOTIATION.
- **Decline / renegotiate** (`declineDeal`): supplier‑only (+reason; 3rd → ops flag) → NEGOTIATING. Rentee sees "renegotiation requested."
- **Reopen after CLOSED** (`releaseDeal`): reopens negotiation. **Known backend wrinkle `[REAL]` `⚠ BACKEND`:** reopen→re‑confirm inserts a 2nd quotation row + `findFirst` has no `orderBy` → stale quotation; **backend‑only fix**; web already aligned.
- **Download** = CLOSED only (banner + footer + bottom bar). Never on accept alone.

---

## 9. Multi‑item / group (RFQ) model

- **One group view** keyed by **`RFQ‑NNNNN`** (`groupRef`); each item is a child **`REQ‑NNNNN`**. **Grouping is web‑derivable today `[WEB]`, NOT a backend gap** — the **inbox already does it** (`InboxView`): join **received‑bids** → **my‑requests `requestGroupId`**, then the `RFQ` code via `fetchRequestSubmissions(...).groupRef`. The deal‑room group view **reuses this exact mechanism** (see §11b) to find the sibling per‑item rooms for a supplier in a group.
- **Item strip** of tabs — one per equipment item; switching tabs swaps the active item's **price + terms** state.
- **Negotiation is per item** — price and terms are countered/accepted per item (each item can be at a different scenario/state).
- **Chat is one per supplier across the group** — a single channel spanning that supplier's items within the group; the pinned summary lists the group's items.
- **Group ID stays on the header**, not repeated in the item strip. Item tabs carry per‑item context (equipment, status, units·price).
- **Shape A vs B `[REAL backend]`:** Shape B = request has >1 item **AND** `fulfillment_type=SINGLE_SUPPLIER` → per‑item terms replicated/grouped; Shape A = first item drives resolution.
- **Close is per item** (each item's accept‑all/confirm is independent); the group view aggregates progress ("2 of 3 items agreed").
- **Current web `[REAL]`:** one room per bid (per item). The item strip + group view are **new UI**, but the **grouping data already exists** (inbox mechanism, §11b) — so only the **per‑supplier shared chat** is a genuine backend `[GAP]` (channels are per‑room today; one channel per supplier across the group needs backend). The tabs + per‑item state are pure `[WEB]`.

---

## 10. Dependency — comparison table

- **Term overlay `[REAL]`:** the comparison overlays live deal‑room term states per `dealRoomId` onto the bid cards — negotiated states reflect there. Keep.
- **Awarded `[REAL]`:** a bid at `ACCEPTED` (or won‑via‑survey) shows **"Awarded"** + a link into the deal room. Keep; extend to reflect `AWAITING`/`CLOSED` distinctly if useful.
- **Live price refresh `[GAP/WEB]`:** the card's `currentPrice` is **not** refreshed from the `rate_change` push, so a negotiated price change may not reflect live on the comparison. Spec: consume the push (or re‑fetch on focus) so the compared price tracks the room.
- **Accepted‑qty reflection:** when a bid is accepted for `acceptedQty < offerQty`, the comparison/fulfillment math ("units covered") must use `acceptedQty` `[GAP]`.

## 11. Dependency — quotation

- Already aligned to the app (logo, price + always mob/demob incl. "by rentee", rental & equipment details, terms via agreed/fixed, short disclaimer) `[REAL, done]`.
- **Must consume `acceptedQty`** for the priced total once split (today it uses offered units) `[GAP]`.
- Reopen→stale‑quotation wrinkle is backend‑only `[REAL]`.

---

## 12. UI structure (prototype)

- **Price card** (top): rate + est. total, breakdown, turn chip, Counter/Accept — matches current web `[REAL]`, restyled per prototype `[PROTO]`.
- **Negotiation bottom sheet** — 3‑step wizard `[PROTO]`:
  1. **السعر والدفع** — editable rate/mob/demob (per unit) + config (mode/duration/billing) + **quantity card** (reqQty / offerQty stat boxes + **acceptedQty** stepper capped at offered) + payment‑terms & payment‑method term cards.
  2. **الشروط** — negotiable terms; accept supplier value or counter per term; "قبول الكل" shortcut; legend (awaiting you / matches supplier / differs).
  3. **المراجعة** — single column: price summary (accepted‑qty line + supplier vs yours + match/differ chip), negotiated terms (agreed ✓ / counter · yours), acknowledged read‑only terms.
- **Bottom price bar:** total + breakdown chips (old→now on delta) + meta chips (round, duration, accepted qty, **availability ⚠ X of Y**, operator, excluded trips) + terms progress + turn control.
- **Accept entry points (both → CLOSED only after supplier confirm):** (a) bottom‑bar green **✓ قبول واعتماد** when all matched; (b) in‑sheet **✓ قبول العرض** beside the nav button on all 3 steps when `allMatched()`.

---

## 11b. Dependency — inbox (deal‑room list) `[REAL, reuse]`

The **inbox** (`src/components/inbox/InboxView.tsx`) already groups a renter's bids/deal‑rooms **by RFQ group, entirely web‑side**:
- `fetchReceivedBids()` + `fetchMyRequests()` → build `groupMap: requestId → requestGroupId`.
- Group key = `requestGroupId ?? request.groupId ?? request.id ?? bidId`; RFQ short code via `fetchRequestSubmissions(rep).groupRef` (falls back to the `REQ‑` code).
- Two‑level: **Level 1 = RFQ group**, **Level 2 = per request/item**; each row carries `dealRoomId` + `dealRoomStatus` + unread.

**Reuse contract for the deal‑room group view:**
- Use the **same source** (`requestGroupId` + `groupRef`) to resolve the current room's **group** and its **sibling per‑item rooms for the same supplier** → drives the item strip. **No new backend endpoint.**
- The inbox **links into** the room (`/deal-room/{dealRoomId}`); after this change it should open the **grouped** view (item strip pre‑selected to the clicked item).
- Keep the inbox's group **label/code rule** (`groupRef ?? REQ‑code`) identical so the two surfaces never disagree.
- Unread: the room's activity should keep feeding the inbox's per‑group unread the same way.

---

## 12a. Activity log — consolidated change history `[WEB + partial GAP]`

One view (drawer or tab in the room) listing **every** negotiation change, **newest first**, so the rentee sees the whole story in one place instead of hunting per‑line:
- **Term changes** — from each term's `history[]` (who · action accept/counter/reopen/propose · value · at). Data already persisted `[REAL]`; web to surface `[WEB]`.
- **Price changes** — each rate / mob / demob counter (who · old→now · at). Latest is `[REAL]`; full rounds need Stream events `[GAP]`.
- **Lifecycle events** — accepted → awaiting → confirmed/closed, withdrawn, declined (+reason), reopened, abandoned (from status transitions + notifications).
- **Multi‑item:** grouped/filterable per item. Replaces the prototype's scattered per‑price/per‑term logs.
- **Prototype `[PROTO]`:** implemented as a **«📜 السجل»** button on the price bar opening a modal with tabs **الكل / السعر / الشروط** — a **price timeline** (opening + each round, who · total · moves, latest highlighted) and **per‑term** cards (each term's log as who→value chips with ✓/↩). This is the reference for the web build.

---

## 13. Backend contract — reality & gaps · `⚠ BACKEND` MASTER LIST

_Every backend change this spec needs is here. Items tagged `⚠ BACKEND` anywhere else in the doc map to a row below._

**True today `[REAL]` (no change):** latest‑counter fields only; `proposeRate` w/o units; single `numberOfUnits`=offered; group `RFQ‑NNNNN` / per‑request `REQ‑NNNNN`; per‑**term** `history[]` persisted.

**Backend changes required `⚠ BACKEND`:**
1. `⚠ BACKEND` **Separate `acceptedQty`** (≤ offered) on counter + accept + quotation. *(T7)*
2. `⚠ BACKEND` **Per‑price‑counter history** (Stream events or a `counter_offers` table) — for the activity log's price rounds. *(T9)*
3. `⚠ BACKEND` **Deal‑room verified badge** — send `supplierStatus` on the room's supplier so the web can use `supplierStatus===2` (today the room only carries `isVerified`). *(T2)*
4. `⚠ BACKEND` **Per‑supplier group chat** — one chat channel per supplier across the group's items (today one channel per room). *(T13)*
5. `⚠ BACKEND` **Reopen → stale quotation fix** — reopen→re‑confirm inserts a 2nd quotation row + `findFirst` has no `orderBy`; add `orderBy`/dedupe. *(§8; backend‑only, web already aligned)*
6. `⚠ BACKEND` **Yard‑driven availability** — per‑item `availQty` computed from the **yards the supplier assigned** (offer 5 / available 3), returned on the room + carried so the accepted‑qty stepper caps at *available* (not offered). Supersedes the "derive 3‑of‑5 from offered‑vs‑requested" stopgap. *(T8)*

**NOT a backend change (web‑only):** group assembly / item strip — web‑derivable via the inbox mechanism (§11b: `requestGroupId` + `groupRef`); per‑term history display — data already persisted; two‑stage close, turn control, activity‑log term rows — existing endpoints/data.

---

## 14. Existing‑web audit (fix list)

| # | Finding | Type | Action |
|---|---|---|---|
| A1 | Single `numberOfUnits`; no accepted‑qty; `proposeRate` sends no units | GAP+WEB | split offered vs accepted; add stepper + carry qty |
| A2 | Two‑stage close incomplete (no AWAITING handling/withdraw UI; download gate ok) | WEB | add awaiting state + withdraw; download at CLOSED |
| A3 | Deal‑room verified uses `isVerified` not `supplierStatus===2` | WEB(+GAP) | read canonical signal (needs it in payload) |
| A4 | No multi‑item group view / item strip | WEB | build group view per §9, **reusing the inbox grouping** (§11b) — only the per‑supplier shared chat is a backend GAP |
| A5 | Per‑term history not surfaced (backend has it) | WEB | map term `history[]`, show rounds |
| A6 | Comparison doesn't refresh price from `rate_change` | WEB | consume push / re‑fetch |
| A7 | Term stripping / Ack‑fixed / mob‑demob responsibility / `myTurn` | — | ✅ already correct |

---

## 15. Decisions confirmed (interview)

1. **Price history** — read the price rounds from **Stream events** if feasible `[GAP]`. **NEW requirement:** a **consolidated "Activity log" view** (§12a) showing **all** negotiation changes — price **and** every term — in **one place**, chronological, instead of the prototype's scattered per‑price / per‑term logs.
2. **Availability "offer 5 / available 3"** — a **distinct quantity between offered and accepted**, driven by the **yards the supplier assigns** to each item (sum of yard on‑hand = availability). The accepted‑qty stepper caps at **availability**, not offered. Stopgap: derive from offered‑vs‑requested; target: real yard‑availability field `[GAP]` (§13.6).
3. **Group close** — **per item only** (current behaviour); **no "approve all."** The group view shows per‑item progress ("2 of 3 items agreed").
