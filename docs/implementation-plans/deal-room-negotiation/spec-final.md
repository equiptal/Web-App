# Deal Room Negotiation — Final Spec (Chat‑View Prototype)

**Status:** supersedes `spec.md` + `deal-negotiation.md` for **UI / flows / scenarios / user behaviour**. The backend has now been **verified against `Moedatech-App @ staging`** — confirmed facts + Yara's corrections live in **`existing-behavior-verification.md`**; remaining `[VERIFY‑IMPL]` items are re‑confirmed at code level during the implementation plan.

**Primary surface:** the deal‑room negotiation (`src/components/deal-room/DealRoom.tsx` + `DealRoomTerms.tsx` + `deal-room-proto.css`).
**Design source:** the final **chat‑view** prototype `Deal Room - Chat.dc.html` (RTL Arabic). **Model source:** `spec.md` / `deal-negotiation.md` (four quantities, statuses, buckets, two‑stage close, gap list).

> **⚠ This is a UI redesign of the EXISTING Deal Room — NOT a rebuild.** The backend (endpoints, `DealRoomStatus` lifecycle, term model, pricing math, two‑stage close, expiry, notifications, chat) stays **exactly as today**. Everything is **reuse‑as‑is unless a line is explicitly tagged as a change.** Silence here = "use existing"; this spec overrides existing behaviour **only** where tagged `[UPDATE]` / `[GAP]` / `[NEW UI]`. On any untagged tension, **existing behaviour is authoritative** and this spec should be corrected. The verified baseline + open corrections live in **`existing-behavior-verification.md`**.
>
> **Legend:** `[EXISTING]` reuse current backend/behaviour unchanged (the default) · `[NEW UI]` new frontend only, no backend change · `[UPDATE]` a change to existing backend behaviour · `[GAP]` new backend work (not built today) · `[VERIFY‑IMPL]` re‑confirm against code in the implementation plan. *(Legacy tags still below map as: `[REAL]`≈`[EXISTING]`, `[PROTO]`≈`[NEW UI]`, `[WEB]`=web build, `⚠ BACKEND`≈`[UPDATE]`/`[GAP]`.)*

---

## 0. Locked decisions (this spec is written to these)

1. **One shared UI, two roles.** Rentee and supplier use the **same** deal‑room UI (the rentee prototype). The surface, layout, negotiation sheet, terms table, and price bar are **identical**; only **behaviour & rules differ by role** (§13). The prototype's "supplier‑view" simulation is that same UI rendered with `viewAs='supplier'` — it is an **unpolished demo (ignore its styling)**; the canonical shared UI is defined by the **rentee view**.
2. **Close = real two‑stage.** Rentee **Accept‑all** → `AWAITING_SUPPLIER_CONFIRMATION`; the **supplier confirms** → `CLOSED`. Neither side closes unilaterally. **Quotation download appears only at `CLOSED`.** The prototype's "approve → download" maps to **CLOSED**. [VERIFY‑IMPL]
3. **Canonical terms view = the classic quotation table** (`termsView=3`). The tabbed‑cards and paper‑sections variants in the prototype are **alternate demos, out of scope**; this spec describes the classic table only (§6.3).
4. **Unit count is a symmetric, matchable term** (all three: rental/mob/demob). **Both** sides use the **same stepper**, capped at the **original requested** count; the supplier's offered/fulfilled count is a **reference, not a cap** — he may step **up** to the requested count. A changed count is a counter the other side must **accept or match**, and **all three unit values must be matched before close** (§9). These are deal‑room‑specific "**quotation units**" that do **not** overwrite the request or the bid. `[VERIFY‑IMPL]` backend field (`agreedUnits`); yard availability, if enforced, is a **confirm‑time** backend check, **not** the UI cap.
5. **A unit change is a counter, not a unilateral edit — symmetric.** Whichever side moves the stepper puts that unit into a *pending / orange* state, and the **other side must accept it or match it** before it counts as agreed (§9). Identical for both roles.
6. **Multi‑item = per‑item negotiation, no behaviour change from existing.** Each item is negotiated in its **own deal room (one per bid), exactly as today** — even when different suppliers bid on different items in the same group. There is **no** group‑level aggregation, shared chat, or cross‑item close. The **only** addition is a **display label**: an item that belongs to a multi‑item group shows the **group short code (RFQ‑NNNNN)** in the header; a single‑item request shows its **request short code (REQ‑NNNNN)**. [EXISTING] for all behaviour; group‑code display = [NEW UI].

---

## 1. Roles & the shared‑UI principle

**Roles (fixed):** the **rentee (المستأجر)** is the *requester* — he creates the RFQ and sets how many units he wants. The **supplier (المورد)** is the *provider/fulfiller* — he bids and offers how many units he can supply; **the supplier never "requests" anything**. The only demand in the system is the rentee's request; the supplier only ever *offers / fulfils / confirms*.

The deal room is a **two‑party negotiation** (rentee ⇄ supplier) rendered in **one** component. The role is a prop/flag (prototype: `viewAs ∈ {rentee, supplier}`; `isSup()`). Everything visual is shared; the differences are:

| Concern | Rentee | Supplier |
|---|---|---|
| **Price lines (rate/mob/demob)** | edits freely, sends counter | edits freely, sends counter |
| **Unit count** (rental/mob/demob) | same stepper (↑/↓, ≤ requested) → a counter the supplier must accept or match | **same stepper** (↑/↓, ≤ requested) → a counter the rentee must accept or match; **not** limited to "accept / offer‑fewer" | 
| **Terms** | `accept` / `counter` / `reopen` (agreed) | `propose_update` / `soft_accept` only; cannot reopen an agreed term |
| **Close stage** | **Accept‑all** → AWAITING; **withdraw** | **Confirm** → CLOSED; **decline/renegotiate** (+reason) |
| **Chat composer** | full | full (frozen for both at CLOSED) |
| **Entry framing** | "عرض المورد" is the *other* side | "عرض المستأجر" is the *other* side (labels mirror) |

**Spec approach:** §5–§12 describe the shared UI and the **rentee** default flow; §13 is the **role‑difference matrix** stating exactly where the supplier's allowed actions/labels/gates diverge. Any behaviour not called out as role‑specific is identical for both.

---

## 2. Lifecycle & statuses  *(carried from model docs — [VERIFY‑IMPL])*

`OPEN → NEGOTIATING → AWAITING_SUPPLIER_CONFIRMATION → CLOSED` (terminal) · or `→ ABANDONED` (terminal, 7‑day inactivity).

- **OPEN** — room exists, the party hasn't entered; the first GET flips OPEN→NEGOTIATING. Neither party effectively *sees* OPEN.
- **NEGOTIATING** — working state; price + terms + units are negotiated.
- **AWAITING_SUPPLIER_CONFIRMATION** — rentee accepted‑all; waiting on supplier. Rentee may **withdraw** (→NEGOTIATING); may **not** reopen terms here.
- **CLOSED** — supplier confirmed; quotation generated; **chat frozen**; **download available**; may be **reopened** (→NEGOTIATING) where allowed.
- **ABANDONED** — 7‑day inactivity **or** manual close; room read‑only "ملغاة", chat frozen, both notified. **[CORRECTED]** inactivity does **not** revert the bid/request in the normal case (the revert only fires for `ACCEPTED` bids / `ACCEPTED|CLOSED` requests — which the swept `OPEN/NEGOTIATING/AWAITING` rooms never are).

**Invariant:** opening a room mutates nothing. Only **accept‑all** (bid→ACCEPTED, units reserved) and **confirm** (→CLOSED + quotation) change bid/request state.

**Prototype demo mapping (not product states):** the prototype's scenario switcher (`neg / sent / reply / agreed`) and role switch are **demo controls only** — they seed a state; they are **not** product features and are excluded from the build.

---

## 3. Turn model

- `myTurn` = `(status===OPEN || NEGOTIATING) && lastCounterBy !== me`. [REAL]
- **Labels:** your turn = **دورك** · waiting = **بانتظار المورد** (mirror: **بانتظار المستأجر**) · accepted/awaiting = **بانتظار التأكيد** · closed = **متّفق ومعتمد**.
- The turn drives the **price‑bar turn control** (§5.3) and the sheet **stepper alerts** (§6.1): a fresh supplier reply flags the affected step with **🔔 ردّ جديد**.

---

## 4. Quantities & units — verified against the backend

**What exists today [EXISTING]:**

| Field | Model | Type | Meaning | Set by |
|---|---|---|---|---|
| requested units | `RequestEquipmentItem.numberOfUnits` | `Int` | the count the RFQ asked — **the cap** | rentee at request (no min/max) |
| offered units | `Bid.unitsOffered` | `Json` (array; **length = count**) | units the supplier committed | supplier at bid |
| agreed units | `DealRoom.agreedUnits` | `Int?` | negotiated/closed count; **NULL** for single‑supplier or single‑unit deals | rentee at accept (multi‑supplier only), re‑capped at confirm |
| (quotation) | `Quotation` | — | **no unit field** — units read live from dealroom/bid/request at render |

- **One unit count, not per‑type.** The same number applies to rental **and** mob **and** demob. There is **no** separate mob/demob unit or trip count in the backend.
- **Mob/demob — units vs trips.** *Today `[EXISTING]`:* `Bid.mobPrice`/`demobPrice` are **per‑unit** charges × the single unit count: `total = (rate·periods + mobPrice + demobPrice) × units`. *In the (A) model (§9) `[GAP]`:* rental is counted in **equipment units**, while **mob/demob are counted in *trips*** — a **distinct duration/logistics measure, not equipment units** — each independently negotiated, line total = per‑trip price × trip count. Then **+15% VAT** (client‑rendered).
- **Cap = requested units.** Availability is **not a stored field**; it's computed live: `remaining = requested − Σ agreedUnits` (of the request's `AWAITING`+`CLOSED` rooms). Accept/confirm gate on `remaining` (`UNITS_EXCEED_REMAINING`). *(Per your instruction, availability is dropped from the user‑facing model — the visible cap is simply the requested count.)*
- **Units are NOT a negotiated term today.** No `qtyPending`, no unit counter/match history. `agreedUnits` is chosen **once** by the rentee at accept (only when `MULTIPLE_SUPPLIERS` & requested > 1) and capped at confirm; reset to `null` on release/abandon.

> ⚠️ **Your unit model (§9) is genuinely NEW backend work — now confirmed.** You already flagged "quotation units" as a new concept; the backend verifies it *is* entirely new. On top of the above, your model adds:
> - **per‑type quotation units** — independent rental / mob / demob counts, where the backend has **one** count `[GAP]`;
> - **mob/demob with their own *trip* counts** (a duration/logistics measure, distinct from equipment units) — backend today multiplies mob/demob by the single rental count `[GAP]`;
> - **units as a symmetric, matchable, countered term** (stepper both sides · pending/orange pill · accept‑or‑match), where the backend has **no** unit counter/match at all — the rentee simply picks a number at accept `[GAP]`.
> **DECIDED (A) — build it as new backend work.** The full §9 unit model (per‑type quotation units + a symmetric unit counter/match mechanism) is **in scope** and tagged `[GAP]` throughout. This is the **single largest backend addition** in the feature; everything else is `[EXISTING]`.

---

## 5. The deal‑room chat view (the room shell)

The room is a full‑height card inside the app chrome: **left app sidebar** (collapsible) · **main deal card**.

### 5.1 Deal card layout (top → bottom)
1. **Top header** (§5.2) — supplier + equipment + phase.
2. **Price bar** (§5.3) — navy, pinned under the header; the negotiation entry point.
3. **Chat stream** (§5.4) — fills the rest; composer at the bottom.
4. **Negotiation sheet** (§6) — slides over the whole card when opened.



### 5.2 Top header `[PROTO]`
- **Supplier chip** (right): avatar + name + **✓ verified badge** + rating/deals/commitment line; click → the profile sheet (below). **[CORRECTED]** the verified badge = the existing **`isVerified`** signal, which on the bid card/quotation resolves to **`supplierStatus === 2`** (canonical — no divergence there). Reuse as‑is `[EXISTING]`; `[VERIFY‑IMPL]` only that the **deal‑room payload's** `isVerified` is already that canonical value (the deal‑room party model reads a raw `isVerified` bool).
- **Other‑side profile & documents `[EXISTING]` — reuse the app (item 2):** the chip opens the app's **company‑details sheet** (`_showCompanyDetails`) — name/brand, role chip, verified label, **City**, and (supplier) Store Name / Company Name / Role in Company / Company Location; (rentee) Company Name — **plus a company‑documents group** (Commercial Register / Insurance Certificate / Municipal License). The **documents sheet** (`getDealRoomDocuments` → `companyDocuments` + `equipmentDocuments`) opens from the docs button: **rentee sees supplier company + equipment docs; supplier sees rentee company docs**. **Company documents are NOT status‑gated** (both parties, any status). **Contact Number + Email rows are post‑accept (CLOSED) only.** (No CR‑number / VAT / national‑address / rating rows exist in this sheet today.)
- **Equipment chip:** REQ/RFQ code pill + spec + qty + "مع عامل" if operator + location/duration subtitle; click → equipment details.
- **Status label (top‑right of the bar) `[NEW UI]` placement — `[prototype update]`:** a status chip reusing the **existing `DealRoomStatus` labels verified in the app** — **مفتوح** (OPEN) · **قيد التفاوض** (NEGOTIATING) · **بانتظار / بانتظار التأكيد** (AWAITING_SUPPLIER_CONFIRMATION) · **مغلق** (CLOSED = accepted/finalized) · **متروك** (ABANDONED). The app shows these on the **deals‑list tile**, not the deal‑room header — so this is new *placement*, existing *labels*. **"Awarded" is NOT a deal‑room status** (the app has no "تم الترسية" label); the nearest concept is the survey **"الفائز" (Winner) chip** driven by `bid.wonViaSurvey` (Outcome Survey) — if an "awarded" mark is wanted, show it as that winner chip **on top of** CLOSED, not as a status. *(The prototype's own `phaseChip` labels are demo‑only; relabel to the above.)*
- **Icon actions:** 📷 share media · 📞 **call**. **App behaviour `[EXISTING]`:** the call button is **locked until CLOSED** for both sides, then does a real `tel:` dial (the number lives in the company‑details sheet's post‑accept rows). **Our divergence `[UPDATE UI]` (§17 #6):** the **rentee can see the supplier's number and call from the start**; the **supplier still sees the rentee's number only after CLOSED**. (Drop the prototype's simulated "in‑app recorded call" wording — no such feature exists.)

### 5.3 Price bar (turn control + price focus) `[PROTO]`
The single most important control. Three zones on a navy bar (RTL): **CTA (left) · price (center) · [breakdown popover]**.

**Center price** — the **rental rate per unit per rental period** (NOT the whole‑duration total):
- Label row: status dot + source label = **متفق عليه** (agreed) / **عرض المورد المقابل** (supplier countered) / **عرض المورد الافتتاحي** (opening) + per‑unit vs total hint when `qty>1`.
- **Big number = the base rate per unit per period, with the period suffix** — e.g. `٣٬٠٠٠ ر.س/يوم` (`rate × (mode==='all'?qty:1)`; suffix = `daily/weekly/monthly` → /يوم·/أسبوع·/شهر). Mob/demob and the whole‑duration grand total are **not** in the hero — they live in **التفاصيل**.
- When the supplier has countered and the rentee has a prior offer, the rentee's previous **rate** renders **struck‑through** beside the new one.
- **Unit/all toggle** (only when `qty>1`): segmented **للوحدة / للكل (N)** — multiplies the rate by the unit count. `[PROTO]`
- **التفاصيل** button → **breakdown popover** (below the bar): each line shows its **explicit factors**, then subtotal → VAT → estimated total, e.g. **الإيجار (٣٬٠٠٠ × ١٤ × ٣)** · **التعبئة — موب (١٬٥٠٠ × ٣)** · **الإرجاع — ديموب (١٬٠٠٠ × ٣)** · **المجموع قبل الضريبة** · **ضريبة القيمة المضافة ١٥٪** · **الإجمالي التقديري**. Rules: the **× duration** factor shows only when a duration exists (fixed); the **× N units** factor shows only in **للكل** mode (in **للوحدة** it's just `rate × duration`); an **excluded** leg drops its factors and shows **مستبعد**. The popover header states للوحدة vs لكل N. Dismiss by **✕** or the backdrop. `[PROTO]`

**CTA / turn control** (state‑driven, mirrors the app turn chip):
| State | Control |
|---|---|
| `CLOSED` | **⬇ تنزيل عرض السعر** + **↻ إعادة فتح** (where allowed) |
| `AWAITING` (I accepted) | **بانتظار المورد** + **↩ سحب القبول** (withdraw) |
| all matched, my turn | green **✓ قبول** + **تفاوض** |
| supplier countered | **تفاوض** (amber, pulsing, inset **🔔 ردّ جديد**) |
| waiting on other side | **عرض العرض** (passive) |
| fresh / my turn | **تفاوض** (blue) |

**Bar sizing note (from chat):** row is tall enough to contain the centered price (no overflow); price is centered in normal flow, CTA absolutely pinned to the start.

### 5.4 Chat stream `[EXISTING]` — unchanged from the existing deal‑room chat
- **The chat does not change.** Same Stream channel, same composer, same **system messages** the deal room already posts (`request_summary`, `term_accepted`, `counter`, `term_reopened`, `rate_proposal`, `rate_response`, `awaiting_confirmation`, `acceptance_withdrawn`, `deal_closed`, `deal_declined`, `deal_released`, `deal_abandoned` — the client re‑localizes them into role‑colored chips; §12). **No new chat behaviour is introduced by this feature.**
- **Message kinds:** `me` bubble · `media` card (doc/image/driver‑card) · **system narration** (centered, role‑tinted — the existing messages that record each negotiation action).
- **Composer:** attach · voice · text · send. **Frozen at CLOSED / ABANDONED** (existing read‑only behaviour: "المحادثة مقفلة…").

> **Prototype‑only, out of scope:** the **AI "mediator" card**, the **mediator/middleware nudge rules** (phone/price/extend), and the pre‑type **suggestion row** are **prototype demo devices only**. There is **no mediator in the backend** and the chat is **unchanged from existing** — none of this is part of the spec or the build.

---

## 6. The negotiation sheet (3‑step wizard)

Opens over the deal card (`تفاوض`). Wizard: **① السعر → ② الشروط → ③ المراجعة**.

### 6.1 Sheet shell `[PROTO]`
- **Two‑row header:**
  - **Row 1:** equipment title (`spec — N وحدات`) + subtitle (**غرفة التفاوض · REQ‑NNNNN · الجولة N**) · **total** (`إجمالي عرضك · ر.س N`, incl. VAT; on the agreed/closed side shows the **⬇ download** action instead) · **✕ close**.
  - **Row 2:** the **stepper** on a light‑blue band — **السعر / الشروط / المراجعة**. Colouring: **active = blue** (fill + underline + badge), **done = green** (badge ✓). Circles/labels are enlarged for legibility. A step the user hasn't reached that has a **fresh supplier reply** shows a **🔔 ردّ جديد** / **✓ طابقه المورد** alert bubble above its badge; the stepper reserves top headroom so the bubble isn't clipped.
- **Body:** the active step. السعر & المراجعة (and classic terms) render on a **quotation "paper"** (white document on a grey desk) with **zoom controls** (a **+ / ٪ / −** vertical pill centred in the right margin between the paper and the sheet edge). `[PROTO]`
- **Footer:** back (**رجوع / إغلاق**) · **✓ قبول العرض** (only when `allMatched()`, on every step) · primary (context: **التالي: الشروط ← / مراجعة وإرسال ← / إرسال الرد ✓**) · **📜 السجل** (activity log, pinned to the end). A **gate tooltip** can appear above the footer ("بند بحاجة لقرارك: …" / "احسم شروط الدفع").
- **Step transitions:** page‑flip animation between steps; footer primary is **gated** — a blocked "مراجعة وإرسال" scrolls to the next undecided term/payment instead of advancing.
- **First‑run guided tour `[NEW UI]` (kept):** a coach‑mark tour auto‑runs **once** the first time each step opens (`priceTourSeen` / `termsTourSeen`; skipped for supplier / agreed / closed). It anchors to **current sections only** — price (3 steps): price table → the العدد unit cell → footer; terms (2 steps): the operating‑terms doc header → footer. *(Stale anchors to the old tabbed‑terms UI were removed.)*

### 6.2 Step ① السعر — the price quotation `[PROTO]`
Rendered as a real quotation document:
- **Counter‑comparison card (`priceCompareNavy`) `[NEW UI]`** — shown at the **top of step ①** once you've sent a round and the price isn't yet agreed. Contains: **dual totals** — `إجمالي عرض المورد` (with a `🔔 جديد` badge + a **delta‑from‑his‑previous‑counter** line, `▼/▲ N عن عرضه السابق`) vs `إجمالي عرضك`; a **convergence bar** `المورد ——[ الفرق N / تطابق ✓ / ⏳ بانتظار الرد ]—— أنت`; and an expandable **`📊 تفاصيل تغييرات السعر`** → a **per‑line delta table** showing **two deltas per line — vs *your* offer AND vs the *supplier's previous* counter** — that are **inclusion‑aware** (`✓ وافق على إلغائك` · `⛔ ألغاه المورد — قرارك` · `↩ لم يقبل إلغاءك` · `✓ جعله مجانياً` · `✓ مساوٍ لعرضك`). A **`📜 سجل السعر`** shortcut opens the activity log on the price tab (§11).
- **Quotation head:** `QUOTATION № GX‑EQTN‑…`, issue date, `Ref: RFQ‑…`, supplier company block (CR/VAT/city), city/address boxes.
- **Price table** — columns **البند · المدة · العدد · السعر (عدّل) · الإجمالي**. The 2nd column is labelled **«المدة»** (relabeled from «الوحدة» — always), and its **value shows only when the rental basis has a start/end (fixed duration); otherwise "—"** (open mode). `[NEW UI]`
  - **الإيجار الأساسي** row: unit (duration·frequency), **العدد** cell = the unit‑count control (§9), **السعر** = a single **editable price box** (`editInput`) with a **المورد: X** reference beneath (amber when changed), الإجمالي = `rateLineTotal`.
  - **التعبئة (موب)** & **الإرجاع (ديموب)** rows (`qtTripRow`): each has a **trip‑count stepper** in العدد, an editable price box + المورد reference, a **✕ cancel / + restore** toggle (cancel → confirmation modal warning the trip becomes the rentee's responsibility), and shows **"ألغاه المورد" / "مستبعد"** when excluded.
- **Config that drives price:** mode `fixed|open`, billing `daily|weekly|monthly`, duration (fixed). *(In the final prototype this config lives with the paper; it must remain editable and must **reopen price** when scope changes — §7.)*
- **Footer:** totals card (**المجموع قبل الضريبة / ضريبة ١٥٪ / الصافي**) · **AMOUNT IN WORDS** · **payment card** (`schedule` + `method` selects, each showing **✓ يطابق المورد / ✕ يختلف** and the supplier's value; conflict/match count badges).
- **Editing any price line** marks the round dirty → sends as a counter (§7).

### 6.3 Step ② الشروط — the classic terms table *(canonical, `termsView=3`)* `[PROTO]`
Quotation‑style table of the **operating** terms (categories **المشغّل / المعدّة / العمل**; the **price** and **pay** categories are handled in step ① and its footer, so they're excluded here).

- **Head:** quotation head (company + `OPERATING TERMS · شروط التشغيل · Annex`).
- **Table columns:** **البند · عرض المورد · قرارك · الحالة**.
- **Row types:**
  - **Negotiable (`neg`):** `قرارك` = a **dropdown** of `[supplier value, …alternatives]`. Choosing the supplier's value → **مطابق** (green); choosing another → **يختلف** (red conflict); nothing chosen → **لم تحدّد** (blue pending). Status badge in the الحالة column. A **matched‑by‑agreement** row shows the value inline + a **↻ reopen** button (green) instead of the dropdown.
  - **Locked (`ack`):** rendered inline as a **🔒** row spanning عرض المورد+قرارك, value shown, **✓ مثبّت** in الحالة — **not negotiable**, read‑only. (Rentee's request value wins; supplier can't change.)
- **Grouping/ordering:** pending negotiable terms first, grouped by category under **navy section rows**; then a green **"البنود المحسومة والمقرّرة"** section collects matched negotiable + locked terms (matched first). If nothing is pending → a single green "كل البنود المحسومة" row.
- **دليل البنود reference:** the live status index (see §6.4) is **not** shown on this step in the classic table (it's a reference for the review step); the table itself is the working surface here.

### 6.4 Step ③ المراجعة — the summary (quotation paper) `[PROTO]`
A single quotation document summarising the whole deal (no re‑editing):
- **Quotation head.**
- **Right column — price/terms summary:**
  - **ملخص عرض السعر** card: `الكمية` (accepted · "المورد يؤكّد N" when fewer · "طلبتَ M"), `الإيجار الأساسي`, `التعبئة`, `الإرجاع` (each "غير مشمولة/غير مشمول" when excluded), then `المجموع قبل الضريبة / الضريبة ١٥٪ / **الصافي شامل الضريبة**`, and a compare badge (**✓ مطابق لعرض المورد** / **⚡ يختلف عن عرض المورد (N)** / agreed‑mode ✓).
  - **شروط الدفع** card: الجدولة + الطريقة (conflict‑coloured).
- **دليل البنود (terms reference)** — the collapsible per‑category status index of every operating term (مطابق/يختلف/معلّق/مقَر), with a progress bar and "N/M جاهز". On the review it sits as a side/stacked panel. Category headers are **light** (light‑blue default, light‑green when a category is all‑matched) — **not** solid navy — and are **collapsible**; conflict/pending rows keep a **static** colour highlight (no pulsing animation) so they read as row‑states distinct from the section headers.

---

## 7. Price negotiation — logic

**Price computation (how the total is built) — `[EXISTING]` math:**
- **Rental line:** `perDay = rate ÷ FREQ_DAYS[basis]` where `FREQ_DAYS = { daily: 1, weekly: 7, monthly: 26 }`; then `rentalLine = perDay × duration(days) × units`. (A monthly/weekly rate is normalized to a **per‑day** basis before × duration. **A month = 26 working days** — not 30 calendar days — and a week = 7.) In **open** mode (no fixed duration): `rentalLine = rate × units`.
- **Mob/demob line:** `= price × count`. **Today** `count = the single unit count`; **in the (A) model** `count = the leg's own trip count` (§9). An **excluded** leg contributes **0**.
- **Subtotal (pre‑tax)** = `rentalLine + mobLine + demobLine`. **VAT** = `round(subtotal × 15%)` (client‑rendered). **Total** = `subtotal + VAT`.

**How each surface displays it:**
- **Price‑bar hero (§5.3):** the **rate per unit per period only** (e.g. `٣٬٠٠٠ ر.س/يوم`; × units in **للكل**) — **not** the grand total.
- **التفاصيل breakdown (§5.3):** each line's **explicit factors** (`الإيجار ٣٬٠٠٠ × ١٤ × ٣` · `التعبئة ١٬٥٠٠ × ٣` · `الإرجاع ١٬٠٠٠ × ٣`) → **المجموع قبل الضريبة → ضريبة ١٥٪ → الإجمالي التقديري**. `× duration` shows only when a duration exists; `× N` only in **للكل**.
- **Price table (§6.2):** per row → **المدة** · **العدد** · **السعر** (editable rate/price) · **الإجمالي** (= `rateLineTotal` for the line); footer totals card = subtotal / VAT / net.
- **Review summary (§6.4):** ملخص عرض السعر repeats subtotal / VAT / **الصافي شامل الضريبة**.

- **Counter:** rentee edits any of rate / mob / demob (or toggles a trip's inclusion, or changes config) → on send, `proposeRate({proposedRate, priceUnit, mobPrice, demobPrice})` **+ acceptedQty once split** → round recorded; `price.turn='supplier'`. [REAL] + `[GAP]` for qty. [VERIFY‑IMPL]
- **Accept price:** taking the other side's numbers as‑is → `price.agreed`. Only an explicit accept sets agreed.
- **Mob/demob leg cancellation `[GAP]` — correction: this needs new backend work (not `[EXISTING]`).** Either side may **✕ cancel** (or **+ restore**) a mob/demob leg (confirmation modal). Cancel = the leg is **dropped from the supplier's coverage → becomes the rentee's responsibility**, and its price is removed from the offer + quotation (`غير مشمول` / `ألغاه المورد`). It is **symmetric and negotiated** — the exclusion **rides the existing price round** (PRICE pipeline + `lastCounterBy` turn, **no new turn machinery**): the other side sees "excluded" and can **accept** the drop **or counter** (re‑add a price); on accept/close the agreed exclusion is honored in the quotation. **Why it's a GAP (not existing):** today the exclusion is thrown away — `proposeRate` drops a null price, the payload doesn't expose it, and line reconstruction falls back to the old price so it **reappears**. Needs persisted `mobExcluded`/`demobExcluded` + payload exposure + quotation math + both‑sided render — **full requirements in §17 #2.** Pairs with §9 (an excluded leg ⇒ its trip count → 0) — build together.
- **PRICE is a synthetic term** mirrored to `last_proposed_*`; silent `marketplace.rate_change` FCM refreshes both cards (~5s, no banner). Price terms (`PRICE`, `mobilization_pricing`, `demobilization_pricing`) are **exempt from the terms close‑gate** (resolved on step ①). [REAL] [VERIFY‑IMPL]
- **Scope reset:** **[CORRECTED]** a **unit‑count change does NOT reset the price** — price is negotiated **per unit**, so the count only re‑multiplies the displayed total (the prototype no longer wipes price on unit change). Only a change to the **per‑unit basis** — operator inclusion / a trip's inclusion / equipment swap — clears `price.agreed`/rounds and requires a re‑send (`resetPriceOnScope`).
- **Edit‑while‑waiting (`editSentOffer`) `[NEW UI]`:** while it's the supplier's turn, the footer shows **`✎ تعديل العرض المقابل`**, which reloads your last sent position into the draft; **re‑sending replaces your previous round in place** (splices it out) rather than adding a new round — so the supplier only ever sees your **latest** offer. [VERIFY‑IMPL] backend supersede semantics (aligns with the "edit while waiting → latest only + re‑fire notification" rule).
- **Per‑round price history** is a `[GAP]` (latest‑only today) → feeds the activity log (§11). [VERIFY‑IMPL]

---

## 8. Terms negotiation — logic  *(model carried; [VERIFY‑IMPL])*

**The four UI statuses (per term)** — this is the canonical behaviour:

| UI status | Colour | Backend state | Meaning |
|---|---|---|---|
| **تعارض / Conflict** | red | `disputed` | on a negotiable term, supplier's value ≠ your value |
| **قيد المراجعة / Pending review** | blue, **no value** | `pending` | not resolved yet — you haven't chosen, or someone countered |
| **مطابق / Match** | green | `soft_accepted` **or** `agreed` | both sides on the same value (`soft_accepted` = auto‑matched at open; `agreed` = explicitly accepted/locked) |
| **مثبّت / Acknowledged** | grey, **locked at bottom** | `fixed` | non‑negotiable reference terms (rentee's request value wins); read‑only for both |

- **Derivation, comparison & transitions** are fully verified in **`existing-behavior-verification.md` §14** — summary: match = strict `String(a)===String(b)` after upstream normalization; **rentee** `accept→agreed` / `counter→pending` / `reopen`(agreed→pending); **supplier** `propose_update→pending` / `soft_accept`; **fixed never actionable**; **Accept‑all is blocked while any `disputed` remains**. There are **no free‑text terms** (all enum); **no new terms** added mid‑negotiation.
- **Round rules `[EXISTING]`:** **Round 1 — every *pending‑review* term must be resolved** (→ match or conflict) before continuing, **payment included**. **Round 2+ — terms matched in the prior round move to the locked "البنود المحسومة والمقرّرة" section at the bottom**; only unresolved/changed terms stay active at the top. A term's price line and price never re‑open on a *unit* change (§7).
- **Local resolution:** the rentee resolves conflicts/counters locally, then batches with the counter (`batchUpdateTerms` + `proposeRate`) or with accept (`acceptAllTerms({termResolutions})`). `allMatched()` = `!priceDiff` && every negotiable term matched **&& all 3 unit counts matched (§9)** → gates the in‑sheet **✓ قبول العرض**.
- **Price is NOT a conflict/match term** — `PRICE` + `mobilization_pricing` + `demobilization_pricing` are negotiated on step ① and **exempt from the terms close‑gate**.
- **History:** every action appends `history{action,by,value,at}` + a system chat line (data persisted `[REAL]`; web surfaces).

**Behaviour types (`TTYPE`) — distinct from the 4 statuses above:**
- **`neg` — قابل للتفاوض** — negotiable; a dropdown of options; resolves to conflict/match/pending.
- **`ack` — للإقرار · قراءة فقط** — acknowledged; locked reference value; sits at the bottom of the page.
- **`priced` — مُسعّر · خطوة السعر** — negotiated as a **price line on step ①**, not a term card (PRICE/mob/demob).

**Term classification — 5 categories × types (authoritative from the prototype; `[VERIFY‑IMPL]` the backend key↔category/options mapping):**

| Category | Term (name · key) | Type | Supplier default | Options (neg) |
|---|---|---|---|---|
| 🚚 **السعر واللوجستيات** *(step ①)* | السعر · `PRICE` | priced | ٣٬٠٠٠ ر.س/يوم | — |
| | التعبئة موب · `mobilization_pricing` | priced | ١٬٥٠٠ | — |
| | الإرجاع ديموب · `demobilization_pricing` | priced | ١٬٠٠٠ | — |
| 👷 **المشغّل** | شمول المشغّل · `operator_included` | neg | مشمول | بدون مشغّل |
| | إعاشة — الطعام · `fat_food` | neg | على المستأجر | على المورد · بدل نقدي |
| | إعاشة — السكن والتنقّل · `fat_accommodation_transport` | neg | على المستأجر | على المورد · مناصفة |
| 🏗️ **المعدّة** | مسؤولية الوقود · `fuel_responsibility` | neg | على المستأجر | على المورد · مناصفة |
| | مسؤولية الصيانة · `maintenance_responsibility` | ack | على المورد | — |
| | زمن الاستجابة للأعطال · `breakdown_response_sla` | neg | ٢٤ ساعة | ١٢ · ٨ · ٤٨ ساعة |
| 🗓️ **العمل** | الساعات الإضافية · `overtime_multiplier` | neg | ١٫٥× | بدون · ٢× |
| | أيام العمل · `working_days` | ack | الأحد–الخميس | — |
| | ساعات العمل · `working_hours` | ack | ٧ص–٣م · ٨ ساعات | — |
| | الوردية الليلية · `night_shift` | ack | متاح | — |
| | التأجير من الباطن · `crosshire` | ack | غير مسموح دون موافقة كتابية | — |
| | المحتوى المحلي · `local_content` | ack | ≥ ٤٠٪ | — |
| 💳 **الدفع والتجاري** *(step ① footer)* | شروط الدفع · `payment_terms` | neg | مقدّم ١٠٠٪ | نصف عند التسليم والإرجاع · دفعات شهرية |
| | طريقة الدفع · `payment_method` | neg | تحويل بنكي | شيك · ضمان بنكي |
| | نوع التوريد · `fulfillment_type` | ack | توريد كامل | — |

- **Payment options (`PAY_SCHEDULES` / `PAY_METHODS`):** schedule ∈ {مقدّم ١٠٠٪ · نصف عند التسليم ونصف عند الإرجاع · دفعات شهرية}; method ∈ {تحويل بنكي · شيك · ضمان بنكي}. **Supplier reference (`SUP_PAY`):** schedule = مقدّم ١٠٠٪, method = تحويل بنكي.
- **Where each appears:** السعر واللوجستيات → step ① price table · الدفع → step ① footer payment card · المشغّل/المعدّة/العمل → step ② operating‑terms table (`ack` locked at bottom).
- `[VERIFY‑IMPL]`: category grouping + option enums above are the **prototype's** (Yara's design) — confirm the **backend** term keys, real option enums, and grouping match. Backend `ACKNOWLEDGE_KEYS` also carries `equipment_attachment`, `saso_registration`, `required_attachments` (not surfaced in the prototype) — decide whether to show them.

---

## 9. Unit‑count negotiation (inline in the العدد cell) — **symmetric; a unit is a matchable term**

The unit count is negotiated **inside each price‑table row's العدد cell** and behaves **like a term that must match before the deal can be accepted**. It is **symmetric** — **both** rentee and supplier use the **same stepper** and the **same accept‑pill** control; there is no "one side steps, the other only accepts." It applies **independently to all three counts**, but note the measure differs: **rental is counted in equipment *units*; التعبئة (موب) and الإرجاع (ديموب) are counted in *trips*** (a distinct duration/logistics measure, **not** equipment units).

**Cell layout (top→bottom):** **خيارك** label · **[− N +] stepper** (your current count) · **the other side's unit pill** (their count).

**Original values:** the **rentee's** original units come from **his request**; the **supplier's** original units come from the **fulfilled units in his bid**. These are "**quotation units**" — deal‑room‑specific, used only for the quotation/deal room; they do **not** overwrite the request or the bid.

**1 — First open (no negotiation yet).** Each row shows your stepper at your original count, and below it the other side's original count as a pill:
- both equal → **green** pill (matched), like the current UI;
- different → **orange** pill (not matched yet).

**2 — One side changes the units.** They move the stepper **up or down**, but **never above the original requested units**. A **confirmation popup appears only on the *first* stepper change** of the negotiation — **not** on every increment/decrement. The other side's pill **stays visible** and turns **orange** (it no longer matches the new stepped value). *(Prototype: the pill now stays instead of "⏳ بانتظار المورد" — **done**; the popup shows only on the first change — **done**.)*

**3 — The other side receives the counter** as a **pill with an accept option** — the **same control as the "عرض مقابل بعدد أقل" case**. They can either **✓ accept** the other side's count, **or set their own stepper to match** it. Either way, once the two values are equal the unit is **matched** (just a different UI path to the same result).

**4 — Matched state.** Whenever both sides' units are equal — matched from the outset **or** reached through negotiation — the cell shows the **"وافق على العدد"** matched state (green).

**Rules that govern all of the above:**
- **Cap = original requested units**, for **both** sides. The supplier's offered/fulfilled count is a **reference, not a cap** — he can step **up** to the requested count if willing.
- The three counts are **independent**. Rental = equipment **units**; mob/demob = **trips**. **[VERIFY]** whether trip counts are bounded by the rental unit count (the prototype currently caps a trip stepper at the rental units) or are fully independent — confirm in the plan.
- A unit change **never resets the price** — price is per‑unit; the count only re‑multiplies the view (§7).
- **Close gate:** all three unit values must be **matched** (like any term) before either side can accept/close.

**Backend `[GAP]` — DECIDED (A), build it:** per‑type "quotation units" (independent rental/mob/demob counts) **+ a symmetric unit counter/match mechanism** (pending → accept‑or‑match, per round), stored as deal‑room‑specific fields that **do not overwrite** the request/bid originals. Today the backend has one `agreedUnits` set once at accept and **no unit negotiation at all** — so this entire section is new work. Yard availability (if ever enforced) is a confirm‑time check, not the UI cap.

---

## 10. Accept → confirm → close (two‑stage)  *(carried; [VERIFY‑IMPL])*

- **Stage 1 — rentee Accept‑all** (`acceptAllTerms`): must be NEGOTIATING; **blocked while any disputed term is unresolved**. Promotes non‑fixed terms → agreed, sets **`agreedUnits`** (today only for multi‑supplier multi‑unit; the §9 per‑type units are `[GAP]`), → **AWAITING**, bid→ACCEPTED, notifies supplier. Entry points: price‑bar **✓ قبول** (when all matched) and in‑sheet **✓ قبول العرض** (when `allMatched()`).
- **Stage 2 — supplier Confirm** (`confirmDeal`): gate = every non‑price term agreed/fixed + unit‑coverage cap → **CLOSED** + quotation + chat frozen. Rentee side is passive (polls/refreshes to CLOSED).
- **Withdraw** (rentee, AWAITING→NEGOTIATING; `releaseDeal`/`withdrawAcceptance`): `agreedUnits→null`, bid→OPEN_FOR_NEGOTIATION.
- **Decline / renegotiate** (supplier‑only, +reason; 3rd → ops flag) → NEGOTIATING; rentee sees "renegotiation requested."
- **Reopen after CLOSED** (`releaseDeal`, either party): → NEGOTIATING, **terms/prices kept intact** (resumes the same round), `agreedUnits`→null, bid→`OPEN_FOR_NEGOTIATION`. **Known wrinkle `[UPDATE]`:** the pre‑release `Quotation` is left **stale**; `Quotation.dealRoomId` is now `@unique`, so a re‑confirm would likely **error (P2002)** rather than duplicate — either way a **backend‑only fix** (upsert/replace by `dealRoomId`). Web reads whatever the backend returns.
- **Download / view** = CLOSED only (banner + footer + price bar); never on accept alone. **Both parties view the *same* quotation** — `getQuotation` does a membership check (`verifyParty`) only, **no role branching, same PDF/data**. There is **no separate supplier document/contract**: the supplier's post‑close CTA reads **"Issue Quotation"** (`onIssueContract`, a **coming‑soon stub**) + **View Quotation**, but it opens the **same** quotation. Post‑close role differences are cosmetic only — theme, labels, and which party's docs each sees (rentee → supplier's equipment docs, supplier → rentee's company docs). `[EXISTING]`

---

## 11. Activity log `[PROTO]` `[WEB + partial ⚠ BACKEND]`

One consolidated view (the **📜 السجل** button, sheet footer + navy price‑compare card) — a modal with tabs **الكل / السعر / الشروط**, **newest‑first**, replacing the prototype's scattered per‑line logs:
- **Price rounds** — opening + each counter (who · total · what moved). Latest is `[REAL]`; full rounds need Stream events / a `counter_offers` table `[GAP]`. [VERIFY‑IMPL]
- **Term changes** — each term's `history[]` (who · accept/counter/reopen/propose · value · at). Data persisted `[REAL]`; web surfaces.
- **Lifecycle events** — accepted→awaiting→confirmed/closed, withdrawn, declined(+reason), reopened, abandoned.
- **Multi‑item:** filterable per item.

---

## 12. Multi‑item / RFQ group  *(carried — [WEB], reuses inbox)*

**Per‑item, no behaviour change from existing** (§0 #6). Each item is its **own deal room (one per bid)**, negotiated and closed independently — **exactly as today**, even when different suppliers bid on different items of one group. There is **no** group‑level aggregation, **no** shared/per‑supplier chat, and **no** cross‑item close. The **only** addition is a **display label** `[NEW UI]`: an item in a multi‑item group shows the **group short code (RFQ‑NNNNN)** in the header; a single‑item request shows **REQ‑NNNNN**. The code comes from the existing `groupRef` / `requestGroupId` — **no new endpoint**.

---

## 13. Role‑difference matrix (rentee vs supplier)

Same UI; behaviour/rules differ. `me` = whoever is viewing.

| Area | Rentee behaviour | Supplier behaviour |
|---|---|---|
| **Price lines** | edit + counter; accept supplier numbers | edit + counter; accept rentee numbers |
| **Unit count (العدد)** | same stepper (↑/↓, ≤ requested) → a counter the supplier must accept or match | **same stepper** (↑/↓, ≤ requested) → a counter the rentee must accept or match — **symmetric**, not "accept/offer‑fewer only" |
| **Term: accept** | supplier value → agreed | rentee value → agreed (via soft_accept batch) |
| **Term: counter** | counter → pending | propose_update → pending |
| **Term: reopen agreed** | ✅ rentee‑only | ❌ blocked (`DEAL_ROOM_TERM_LOCKED`) |
| **Locked (`fixed`) term** | read‑only | read‑only |
| **Close** | **Accept‑all → AWAITING**; **withdraw** | **Confirm → CLOSED**; **decline/renegotiate (+reason)** |
| **Post‑close quotation** | **⬇ download / view** at CLOSED | **"Issue Quotation"** (`onIssueContract` — a **coming‑soon stub**, unwired) + **View** — **same document**, only the CTA label differs |
| **Chat** | full; frozen at CLOSED | full; frozen at CLOSED |
| **"Other side" labels** | عرض المورد / بانتظار المورد | عرض المستأجر / بانتظار المستأجر |
| **Turn control CTA** | تفاوض / قبول / سحب القبول / تنزيل | تفاوض / تأكيد / رفض / تنزيل |

*(Terms buckets, states, and gates are identical for both — only the **verbs** each role may invoke differ, per the rows above.)*

---

## 14. Scenario catalogue (rentee lens; supplier mirrors)

| # | Room state | Turn | Price bar | Sheet allows | Notes |
|---|---|---|---|---|---|
| S1 | NEGOTIATING, no counter yet | mine | **تفاوض** (blue) | edit price/terms/qty, send round 1 | fresh |
| S2 | NEGOTIATING, I countered | theirs | **عرض العرض** (passive) | **✎ تعديل العرض المقابل** re‑opens the offer and **replaces** your last round in place (supplier sees only the latest) | "بانتظار المورد" |
| S3 | NEGOTIATING, supplier countered | mine | **تفاوض** (amber, 🔔) | per‑line/term accept vs counter; stepper alerts on changed steps | scenario "ردّ المورد وصل" |
| S4a | AWAITING (I accepted) | — | **بانتظار المورد** + **↩ سحب القبول** | read‑only summary; withdraw | no reopen here |
| S4b | CLOSED (supplier confirmed) | — | **⬇ تنزيل** (+ **↻ إعادة فتح**) | download; reopen where allowed | accepted banner |
| S5 | Unit countered (pending) | theirs | as S2 | العدد cell: the other side's pill turns **orange** (not "بانتظار المورد") | §9 |
| S6 | Other side offers a different count | mine | as S3 | العدد cell = other‑side pill **N + ✓ اقبل** + your stepper to match | §9 |
| S7 | ABANDONED | — | read‑only "ملغاة" | none | 7‑day inactivity or manual close |
| S8 | Partial fulfillment accepted | — | as S4a | accept N < requested → request `PARTIALLY_ACCEPTED`; remaining units stay open for other suppliers | `[EXISTING]` |
| S9 | Supplier can't provide any (0) | — | dead‑end | clear "المورد لا يستطيع التوفير" end‑state; rentee picks another supplier | §9 |
| S10 | Rentee withdraws acceptance | mine | back to NEGOTIATING | from AWAITING via **↩ سحب القبول** | §10 |
| S11 | Supplier declines 3× | mine | back to NEGOTIATING | ops flagged **silently** (no party‑facing signal) | §10 |
| S12 | Release → renegotiate → re‑confirm | mine | reopened, terms intact | the stale‑quotation `[UPDATE]` applies | §10 |
| S13 | Bid/request expires mid‑negotiation | — | "العرض/الطلب منتهي" + block | bid `validUntil` / request deadline lapses; room reaction = `[GAP]` | §2 |
| S14 | Turn violation (act out of turn) | — | blocked by turn gate | UI makes "whose turn" unambiguous | §3 |
| S15 | Zero‑round (all matched at open) | mine | **✓ قبول** available immediately | accept now, or keep negotiating on price | §8 |
| S16 | Read‑only (CLOSED / ABANDONED) | — | download / "ملغاة" | sheet + chat read‑only (`isReadOnly`) | §15 |

---

## 15. Edge cases & invariants

- **Price agreed ≠ deal closed.** `price.agreed` and matched terms only unlock **Accept**; the deal is not final until the supplier **confirms**. Download is CLOSED‑only. (Common misread — call out in UI copy.)
- **Scope change re‑opens price — but NOT a unit‑count change.** A unit change **keeps** the per‑unit price (count only re‑multiplies the view). Only **operator / trip‑inclusion / equipment** changes wipe `price.agreed` + rounds and require a re‑send.
- **Accept blocked by unresolved conflicts.** Accept‑all is gated until every disputed negotiable term is resolved; the footer routes to the next undecided term/payment rather than failing silently.
- **Unit count can't exceed the requested count** (both sides — that's the cap). The supplier's offered count is a **reference, not a cap**. Availability is **not** a UI cap (dropped — §4).
- **Fixed/locked terms never negotiable** by either side; a supplier `propose_update` on an agreed/fixed term is rejected.
- **Withdraw is only from AWAITING**, reopen only from CLOSED (where allowed); neither reopens terms while AWAITING.
- **Reopen→re‑confirm quotation staleness** is a known backend wrinkle (fix backend‑only). Web must read the **latest** quotation.
- **Both roles freeze chat at CLOSED**; composer swaps to the locked/reopen affordance.
- **Multi‑item:** each item is an independent negotiation/close in its own room (one per bid); no group aggregation or shared chat — only the group‑code label differs (§12).
- **Sibling auto‑abandon on win** happens **only when the request becomes fully covered**; a **partial‑coverage** win leaves sibling rooms open. **Inactivity abandonment** does **not** revert the bid/request in the normal case (§2).
- **Live price push (`rate_change`)** must refresh **both** the room card **and** the comparison table's `currentPrice` (today the comparison doesn't consume it — audit A6).
- **Calling `[UPDATE UI]`:** the **rentee sees the supplier's phone from the start** (+ dial); the **supplier sees the rentee's phone only after CLOSED**. This diverges from the app (which hides both until CLOSED). The backend already returns the numbers, so it's UI‑gated — but the supplier‑side pre‑close hiding must be enforced. Follow existing app call behaviour otherwise.

---

## 16. Dependencies

- **Comparison table** — term‑state overlay [REAL]; "Awarded" link into the room [REAL]; **consume `rate_change`** for live price [WEB]; fulfillment "units covered" must use **acceptedQty** [GAP].
- **Quotation** — aligned to the app already [REAL]; must consume **acceptedQty** once split [GAP]; reopen‑stale fix backend‑only.
- **Inbox** — group view reuses `requestGroupId + groupRef`; links open the **grouped** room with the clicked item pre‑selected; keep label/unread rules identical.

---

## 17. Backend contract & gaps — **deferred to the implementation plan**

This feature is mostly `[EXISTING]` reuse. The real backend work, verified against `staging`:
1. **`[GAP]` — the §9 unit model (biggest item; DECIDED (A), build it).** Per‑type "quotation units" (independent rental *units* / mob+demob *trips*) **and** a **symmetric unit counter/match** mechanism (pending → accept‑or‑match, per round). Today: one `agreedUnits`, set once at accept, **no unit negotiation**.
2. **`[GAP]` — mob/demob leg exclusion ("cancel"); pairs with #1, build together.** Small‑to‑medium: one migration (2 booleans) + validator/service + payload + quotation math + 2 frontend read/writes.
   - **Persist the exclusion as its own state:** add `mobExcluded` / `demobExcluded` Boolean on `DealRoom` (migration). **Don't overload price = 0/null** (0 = a legit free leg; null = "not countered" and gets dropped today) — a dedicated flag is unambiguous.
   - **`proposeRate` accepts + stores it** (`deal-room.schema.ts` + `deal-room.service.ts`): add `mobExcluded?`/`demobExcluded?` to the validator; **fix the guard** (`mobPrice != null ? {update} : {}` at ~`:1771`, which throws the exclusion away) → on exclude set flag `true`; on restore set `false` + write the price.
   - **Expose the flags in `getDealRoom`** so **both** parties render the excluded state (fixes "the other side doesn't see it").
   - **Fix line reconstruction** (`counter_line_item.dart` ~`:221`, `dr.lastProposedMobPrice ?? bid.mobPrice ?? 0`): check the flag **first** → excluded shows "غير مشمول", not the old price (that fallback is why the price reappears).
   - **Quotation drops the leg** (`quotation.service.ts` `extractQuotationData`): an excluded leg counts as **0 / "غير مشمول"** in the total and on the quote paper.
   - **Symmetric + negotiated:** the exclusion rides the existing PRICE round + `lastCounterBy` turn (no new turn machinery) — other side **accepts** (agree the drop) or **counters** (re‑add a price); honored at accept/close.
   - **Frontend (app + web):** send `mobExcluded: true` instead of bare `mobPrice: null` (`counter_offer_flow_sheet.dart` ~`:877`); render the persisted badge for both sides (currently local‑only); **restore** = `mobExcluded: false` + price.
3. **`[UPDATE]` — reopen→stale‑quotation fix.** On release→re‑confirm the old `Quotation` persists stale; with `dealRoomId @unique` a re‑confirm may **error** — fix = upsert/replace by `dealRoomId`.
4. **`[GAP]` — per‑price‑round history** (Stream events or a `counter_offers` table) for the activity‑log price rounds. **Latest‑only today, confirmed staying latest‑only unless we build this.**
5. **`[VERIFY‑IMPL]` — verified badge in the deal‑room payload.** Reuse the existing `isVerified` (= `supplierStatus===2` on the bid card/quotation); confirm the **deal‑room party payload's** `isVerified` is that canonical value.
6. **`[UPDATE UI]` — calling.** Rentee sees the supplier's number **from the start** (app hides it until CLOSED); the read already returns it, so the change is to **stop hiding it for the rentee** while still hiding the rentee's number from the supplier until CLOSED.
7. **`[NEW UI]` — decline/cancel + abandoned read‑only + group‑code label** (frontend; the backend `manualClose`/`releaseDeal`/`withdrawAcceptance` already exist).

**Dropped from scope:** yard availability as a UI cap (cap = requested); per‑supplier group chat (chat unchanged, per‑room); mediator middleware (prototype‑only, no backend).

**Implementation‑plan step:** work from **`existing-behavior-verification.md`** (confirmed baseline + Yara's corrections) and read the deal‑room code on **`staging`** (`apps/backend/src/{handlers,services}/deal-room/*`, `apps/backend/prisma/schema.prisma`, Flutter `apps/mobile/lib/features/deal_room/*`); then design the §9 unit‑model schema/handlers.

---

## 18. Open questions (to resolve in the plan)

1. ~~Supplier‑first unit‑counter wording~~ **Resolved:** the العدد cell is always rentee‑facing — **"طلبتَ M" / "المورد يوفّر N فقط"**. The supplier only *provides/fulfils*, never *requests*, so there is no alternate wording (§9).
2. ~~Mediator layer in v1?~~ **Resolved:** no mediator — it's a prototype‑only device; the chat is **unchanged from existing** (§5.4).
3. **Config editability location** — the fixed/open/duration/billing config in step ① — keep on the paper or fold into a compact control (prototype has it inline; confirm final placement).
4. **Price‑round history source** — Stream events vs `counter_offers` table (cost/latency).
5. **Reference panel on step ②?** — currently reference lives on review only; confirm whether the classic terms step also needs the live دليل البنود index or the table alone suffices.
