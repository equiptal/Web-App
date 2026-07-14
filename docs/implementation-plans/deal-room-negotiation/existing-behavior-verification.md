# Deal Room — Existing-Behavior Verification Checklist

Everything below was read from **`equiptal/Moedatech-App` @ `staging`** (the repo's default branch is stale — always verify with `?ref=staging`) and the Flutter app under `apps/mobile/`. Use this to confirm each finding against the live Moedatech app before it's treated as fact in the spec. Tick items you've confirmed; strike/annotate anything that's wrong.

> Legend: 🟢 = backend/logic fact · 📱 = app UI behavior · ⚠️ = divergence / gap worth attention

---

## 1. Statuses & lifecycle
- [ ] 🟢 **Deal Room has exactly 5 statuses**: `OPEN`, `NEGOTIATING`, `AWAITING_SUPPLIER_CONFIRMATION`, `CLOSED`, `ABANDONED`. *(prisma/schema.prisma)*
- [ ] 🟢 `OPEN` ⟺ the rentee hasn't entered yet; it auto-moves `OPEN → NEGOTIATING` when the rentee opens the room or takes the first action.
- [ ] 🟢 **Bid** has its own statuses: `PENDING, OPEN_FOR_NEGOTIATION, COUNTER_OFFERED, ACCEPTED, WITHDRAWN, EXPIRED, SUPERSEDED`, plus an **`isWinner`** flag.
- [ ] 🟢 **Request** statuses: `OPEN, ACTIVE, PARTIALLY_ACCEPTED, ACCEPTED, EXPIRED, FORCE_EXPIRED, HUB_CLOSED, CLOSED`.

## 2. Two-stage close & reverse paths
- [ ] 🟢 **Stage 1** — rentee "Accept all" (`acceptAllTerms`): `NEGOTIATING → AWAITING_SUPPLIER_CONFIRMATION`. Rejected if any term is still `disputed`; promotes non-fixed terms to `agreed`; flips the bid to `ACCEPTED`.
- [ ] 🟢 **Stage 2** — `confirmDeal` (callable by **either** party): `→ CLOSED`, sets `bid.isWinner = true`, records `agreedUnits`, and **creates the Quotation**. Can also close **directly from `NEGOTIATING`** (shortcut when all matched).
- [ ] 🟢 **Supplier decline** (`declineDeal`): `AWAITING → NEGOTIATING`; increments `supplierDeclineCount`; **3rd decline raises a `SupplierDeclineFlag`** for ops.
- [ ] 🟢 **Rentee withdraw acceptance** (`withdrawAcceptance`): `AWAITING → NEGOTIATING`; releases reserved units; bid back to `OPEN_FOR_NEGOTIATION`.
- [x] 🟢 **Release** (`releaseDeal`, either party): `CLOSED → NEGOTIATING`; clears `isWinner`; reopens request coverage; **terms JSON kept intact (resumes the same round, not fresh)**. *(Note: code sets bid → `OPEN_FOR_NEGOTIATION` although its own comment says `WITHDRAWN` — a code/comment mismatch, not a checklist error.)*
- [ ] 🟢 **Manual close** (`manualClose`, either party): `→ ABANDONED`.
- [x] 🟢 On win, `confirmDeal` **auto-abandons sibling deal rooms** of the same request (`OPEN/NEGOTIATING → ABANDONED`) — **caveat (Yara):** only when the win makes the request **fully covered**; a **partial-coverage** win does **not** abandon siblings.

## 3. Units / fulfillment
- [ ] 🟢 Accepting **fewer units than requested** → request goes `PARTIALLY_ACCEPTED`, and that request is then **protected from expiry**; the remaining units can be covered by other suppliers.
- [ ] 🟢 Agreed quantity is stored as `agreedUnits` at confirm.

## 4. Pricing
- [ ] 🟢 **Total = `(rentalTotal + mobPrice + demobPrice) × units`**; `rentalTotal` scales by `priceUnit` (`PER_DAY / PER_WEEK / PER_MONTH / PER_JOB`). *(quotation.service.ts)*
- [ ] 🟢 **No VAT, no platform commission, no service fee** anywhere in the backend total. Quotation model has **no tax/fee columns** (`agreedRate Decimal(12,2)`, `priceUnit`, `contractType`, phones/emails, `pdfUrl`, `pdfStatus`).
- [ ] 📱 The **quotation document** (client-rendered) **adds 15% VAT** ("VAT at 15% per Saudi tax law"). So: bar/room total = pre-tax; quotation paper = +VAT.
- [x] 🟢 **Counter-price validation**: rate must be **> 0** (0 and negative rejected); **no maximum**; mob/demob may be `0`; DB stores **2 decimals**. **Either party can counter up or down** (no "must be lower" rule). *(deal-room.schema.ts)* **Caveat (Yara):** the `> 0` rule is enforced only on `proposeRate`/`respondToRate`; the `updateTerm`/`batchUpdateTerms` **PRICE path uses `z.any()`** and **bypasses** it.
- [ ] 🟢 **Duration / start & end dates come from the request and are NOT editable in the room** (no handler mutates them).

## 5. Mob / Demob (التعبئة / الإرجاع)
- [ ] 🟢 **Who does each leg is fixed at request time** — `MobDemob` enum (`SUPPLIER / MOEDATECH / NOT_REQUIRED`) + `mobilizationByRentee` / `demobilizationByRentee` booleans.
- [ ] 🟢 Mob/demob **pricing** are **always-negotiable line-item terms** (`mobilization_pricing`, `demobilization_pricing`) — always forced to `pending`, can become `disputed`. Proposed via `proposeRate` (`lastProposedMobPrice` / `lastProposedDemobPrice`).
- [ ] 🟢 If the **rentee owns a leg**, that leg's pricing term is **removed** (nothing for the supplier to price).
- [ ] ⚠️ There is **no "cancel free → paid" toggle** feature — "free vs paid" is just leg-ownership + a price value.

## 6. Terms
- [ ] 🟢 Term states: `fixed | soft_accepted | disputed | pending | agreed`.
- [ ] 🟢 **بنود ثابتة = `fixed` (source `rentee_fixed`)** — the ACKNOWLEDGE keys: `working_days, working_hours, maintenance_responsibility, equipment_attachment, night_shift, required_attachments, crosshire, local_content, saso_registration, fulfillment_type`, **plus anything the rentee fixed at request time**. These are **immutable** (editing throws `DEAL_ROOM_TERM_FIXED`) and are distinct from mutually-`agreed` terms.
- [ ] 🟢 **A matched (`agreed`) term is NOT permanently locked**: the **rentee** can `reopen`/`counter` it back to `pending` (except once in `AWAITING`); the **supplier cannot touch** an agreed term (`DEAL_ROOM_TERM_LOCKED`). **No auto-reopen** on unit/scope change.

## 7. Calling / phone (app)
- [x] 📱 The **phone number is shown only inside "Company Details," and only after the deal is CLOSED** — symmetric for both roles. **Caveat (Yara):** true for the **deal-room page**; the **quotation document does render phone rows** regardless.
- [ ] 📱 The **call button is greyed/locked until CLOSED**; once unlocked it does a real `tel:` dial (`url_launcher`). *(deal_room_contact_bar.dart)*
- [ ] 📱 A "number hidden until accepted" modal (`phone_lock_modal`) exists but is currently **unreachable** (the locked button is disabled).
- [ ] 🟢 The backend **`getDealRoom` returns both parties' phone at every status** (gated only by "you're a party") — so the app's hiding is **UI-side**, not backend.

## 8. Verified badge
- [x] ✅ **CORRECTED (Yara, against app):** the bid-card badge **IS canonical**. On `BidSupplierInfo`: `bool get isVerified => supplierStatus == 2;` (`marketplace_models.dart:1064`) — so the badge is driven by `supplierStatus === 2`. Equipment tick uses `verificationStatus === 'VERIFIED'` (correct).
- [x] ✅ **CORRECTED:** the mobile **quotation DOES show** a `✓ موثَّق` pill (`quotation_document.dart:740-752`, `quotationChipVerified`), gated on `isVerified` (= `supplierStatus == 2`).
- [x] ✅ **No divergence** on the bid card / quotation — both resolve to `supplierStatus === 2`. Any "divergence" must be re-observed on the specific surface where it was seen before it's claimed; not asserted here.

## 9. Release & the stale-quotation bug
- [ ] 🟢 On `releaseDeal` the **Quotation row is left stale** (never deleted/updated); there's **no server PDF** (client renders it; server generation is commented out).
- [ ] ⚠️ `Quotation.dealRoomId` is now **`@unique`**, so a **re-confirm after release** would likely hit a unique-constraint error (block the re-confirm) rather than insert a 2nd row — either way the pre-release quotation persists stale. **Backend fix needed** (upsert/replace by `dealRoomId` on re-confirm).

## 10. Expiry
- [x] 🟢 **Deal-room inactivity → `ABANDONED`** (default `abandonment_timeout_days = 7`); freezes chat + notifies both. **CORRECTED (Yara):** the bid/request revert is a **no-op in the normal case** — `revertBidAndRequest` only fires when the bid is `ACCEPTED` / request is `ACCEPTED|CLOSED`, which never holds for the `OPEN/NEGOTIATING/AWAITING` rooms the sweep targets. So on inactivity the bid is **not** forced to `PENDING` and the request is **not** forced to `OPEN`. *(abandonment.service.ts)*
- [ ] 🟢 **Request deadline → `EXPIRED`** (daily cron; only `OPEN/ACTIVE`; **`PARTIALLY_ACCEPTED` excluded**).
- [ ] 🟢 **Bid `validUntil` → `EXPIRED`** (cron every ~5 min). This is the "سريان العرض" countdown.
- [ ] 🟢 **No per-counter / per-offer expiry.** Request expiry does **not** itself close a deal room.

## 11. Decline / cancel & read-only (app)
- [ ] 📱 The only "end negotiation" control is a **⋮ menu item**: rentee **"إلغاء الصفقة"** / supplier **"رفض الصفقة"** — **both call `manualClose`** → `ABANDONED`. Shown when `!isReadOnly`. Opens a **cancel-reasons modal** (radio reasons + free text for "أخرى").
- [ ] 📱 **Release ✕** (red, app-bar) appears **only when CLOSED** → `releaseDeal`.
- [ ] 📱 **Withdraw acceptance** appears **rentee-only**, in the `AWAITING` state (multi-supplier assembly) → `withdrawAcceptance`.
- [ ] ⚠️ The supplier `/decline` endpoint (`declineDeal`) is **NOT wired to any mobile UI** — the menu "رفض الصفقة" is actually a `manualClose`.
- [x] 📱 **ABANDONED / CLOSED rooms are read-only** (`isReadOnly = closed || abandoned`); ABANDONED shows a **red cancelled banner**. **Caveats (Yara):** "stay in the list" **depends on the getter** — **`activeRooms` filters them out**; and the Stream **freeze is backend** (`freezeChannel`), the app itself only **disables the input bar** (history stays readable).

## 12. Notifications (existing — reuse as-is)
**In-app / push** (`notificationDeliveryService`): `deal.created`, `deal.term_updated`, `bid.countered`, `deal.rate_proposed`, `deal.rate_response`, `deal.awaiting_confirmation`, `deal.acceptance_withdrawn`, `deal.closed`, `request.fully_covered`, `deal.renegotiation_requested` (decline; API-only), `deal.released`, `deal.abandoned` (manual + inactivity), `marketplace.rate_change` (silent).
- [ ] 📱🟢 Confirm this event set is what the app actually fires/shows.

**In-chat system messages** (Stream): `request_summary`, `term_accepted`, `counter`, `term_reopened`, `term_updated`, `rate_proposal`, `rate_response`, `awaiting_confirmation`, `acceptance_withdrawn`, `deal_closed`, `decline_reason`+`deal_declined`, `release_reason`+`deal_released`, `close_reason`+`deal_manual_close`, `deal_abandoned`.
- [ ] 📱 Confirm the chat still posts these system messages (the client re-localizes them into role-colored chips).

## 13. Status label & permissions
- [ ] 📱 The mobile **deal-room header is a static title ("غرفة التفاوض") — it prints NO status**; state shows via turn strips/banners derived from `DealRoomStatus`. (The **bid card**, separately, does show status/turn — "عرض جديد / قيد التفاوض / مقبول / دورك".)
- [ ] 🟢 A deal room is accessible **only to its owning rentee + the bidding supplier** (`verifyParty`).

## 14. Term status derivation (conflict / match / pending review)
Backend term states: `fixed | soft_accepted | disputed | pending | agreed`. Client collapses them to the 3 visible buckets + acknowledged. Source: `term-matching.ts`, `deal-room.service.ts` (`buildTermsArray`, `updateTerm`, `batchUpdateTerms`, `acceptAllTerms`, `confirmDeal`).

**At open (`buildTermsArray`), per term (your request value vs supplier's bid value):**
- [ ] 🟢 **Acknowledged (`fixed`)** = an ACKNOWLEDGE key (`working_days, working_hours, maintenance_responsibility, equipment_attachment, night_shift, required_attachments, crosshire, local_content, saso_registration, fulfillment_type`) that you set, **or** any term you fixed at request time. Reference-only, non-actionable.
- [ ] 🟢 **Conflict (`disputed`)** = a CONFLICT_ELIGIBLE key where the supplier declared a value **and** `String(you) !== String(supplier)` (and your value isn't null).
- [ ] 🟢 **Pending review (`pending`)** = ALWAYS_NEGOTIATE keys (`mobilization_pricing`, `demobilization_pricing`) — always, even if values match — plus the synthetic `PRICE` term.
- [ ] 🟢 **Match (`soft_accepted`)** = a negotiable term whose values are equal, or a platform-default/supplier-only term that isn't a conflict.
- [ ] 🟢 **There is NO `agreed` at open** — an initial value-match is `soft_accepted`, not `agreed`. `agreed` (locked) is only ever reached by an explicit accept action. (So the zero-round "all matched" case still needs one Accept-all to lock.)

**Client label mapping:** conflict = `disputed` · pending review = `pending` · match/accepted = `{soft_accepted, agreed, fixed}` · acknowledged = the `fixed` subset.

**"Match" comparison:** strict `String(a) === String(b)` at compare time — no case/trim/normalization there; normalization is done **upstream** (cert lists sorted+uppercased+joined; `payment_terms`/`maintenance_responsibility`/`breakdown_response_sla` mapped to canonical forms; `operator_included` uppercased; `fuel_responsibility` derived). Null rentee value ⇒ never a conflict.

**Transitions:**
- [ ] 🟢 **Rentee**: `accept`→`agreed` · `counter`→`pending` · `reopen`(agreed→`pending`, blocked while `AWAITING_SUPPLIER_CONFIRMATION`). Supplier actions on rentee terms rejected.
- [x] 🟢 **Supplier**: `propose_update`→`pending` · `soft_accept`→`soft_accepted` (batch only). Cannot act on an `agreed` term (`DEAL_ROOM_TERM_LOCKED`) or a `fixed` term (`DEAL_ROOM_TERM_FIXED`). **Caveat (Yara):** these throws are **single-term `updateTerm` only**; `batchUpdateTerms` **lacks the agreed guard** and **silently skips** fixed terms.
- [ ] 🟢 **Accept-all** (`acceptAllTerms`): throws if **any `disputed` remains**; otherwise promotes all non-`fixed`/non-`agreed` terms (incl. `pending` + `soft_accepted`) → `agreed` in one sweep.

**Price is NOT a conflict/match term:**
- [ ] 🟢 Base rate = a synthetic `PRICE` term, `pending → agreed` only (never `disputed`); mirrored to/from the legacy `proposeRate`/`respondToRate` pipeline (`lastProposedRate`).
- [ ] 🟢 On close, `PRICE`, `mobilization_pricing`, `demobilization_pricing` are **exempt** from the "no unresolved (`pending`/`disputed`) terms" gate — they can stay `pending` and are settled as price line-items.
