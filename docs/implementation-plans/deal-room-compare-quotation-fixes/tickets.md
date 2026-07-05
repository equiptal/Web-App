# Tickets — Deal-room / Compare / Quotation fixes

One ticket per issue raised (numbered to match). Each: **Problem → Root cause / where → Fix → Scope →
Files → Acceptance → Open questions.** Evidence: staging screenshots 2026-07-05.

---

## T1 — Comparison cost card: wrong rental rate + phantom FAT/operator cost conflicts

**Problem** (screenshot `014433`). In the bid comparison cost card:
- **(a)** *Rental cost* shows **`SAR 4/day`** ("day rate × units"). The rate is wrong — it was correct
  before; the same supplier's real rate is e.g. SAR 200. This also poisons **Grand total** (`SAR 464`).
- **(b)** *Operator food* and *Operator transport & accom* render as **red conflicts**
  (`your choice: you · supplier: supplier`), but these are **not** conflicts in the deal room or on the
  bid. Cost terms shouldn't show a conflict the deal room doesn't.

**Root cause / where.**
- (a) `BidComparisonWorkspace.tsx:1184` renders `dq(c).ratePerPeriod` — the derived-quote rate, not the
  raw `bid.price`. The `4` is produced by the derived-quote helper (`dq()` / `ratePerPeriod`,
  `rentalForPeriod`, `durationRental`) — suspect the **rate-period conversion** (Day/Week/Month toggle)
  and/or the **Per-unit vs All-units-offered** toggle (`unitsOf(c)`), where the per-unit branch is
  dividing/Аdapting the rate wrongly (e.g. showing units where the rate should be, or dividing rate by a
  period factor). Confirm against the deal-room rate (which shows correctly) for the same bid.
- (b) `comparison.ts` `buildCostResponsibilities` colours operator-FAT cost rows from the supplier's
  declared FAT value (`supplier`) vs the request side (`you`). This is the **same stale/legacy `fat`
  declaration** we now drop in the deal room (`deal-room.ts mapDealRoom`) — the comparison still trusts it.

**Fix.**
- (a) Make the comparison rental rate = the real per-period bid rate (with correct Day/Week/Month
  conversion) × units, matching the deal-room card + app `extractQuotationData`. Fix the `dq()` derivation
  so `ratePerPeriod` is the actual rate; recompute `rentalForPeriod`, `durationRental`, Grand total.
- (b) Align the FAT/operator cost rows with the **deal-room-resolved** state: don't flag a FAT cost row as
  a conflict unless it's a live deal-room dispute. Reuse the legacy-`fat` normalization + prefer the split
  `fat_food`/`fat_accommodation_transport` values (and any locked/agreed deal-room value) over a stale
  combined `fat=supplier`.

**Scope:** Web-only.
**Files:** `src/components/compare/BidComparisonWorkspace.tsx` (rate cell + `dq()`), `src/lib/contract/comparison.ts` (`buildCostResponsibilities`), possibly `src/lib/contract/bids.ts` (FAT source values).
**Acceptance:**
- Rental cost shows the true per-period rate (matches the deal-room card for the same bid); "→ × units"
  math and Grand total are arithmetically correct (rental + mob + demob, × units, + 15% VAT).
- Operator food / transport cost rows are **not** red unless the deal room actually disputes them; a
  benign "supplier offered to cover it" no longer shows as a conflict.
- Add a unit test for the rate/units/grand-total math (Day/Week/Month + per-unit/all-units toggles).

**Open questions:** confirm whether the `4` is units leaking into the rate, or a period-division bug —
compare one bid across the comparison vs its deal-room card.

---

## T2 — Deal room: supplier can't accept-first + mob/demob shown as terms

**Problem.**
- **(a)** In the deal room the **supplier can only counter** — when he tries to **accept**, it says
  *"terms unresolved"* even though **all terms are green**. He can only accept **after** the renter
  accepts; he can't accept first.
- **(b)** **Mob/demob** are being treated **as negotiable terms**; they should be settled as **price
  line items** in the counter-offer (Price page), per the app (`mobilization_pricing` /
  `demobilization_pricing` are Priced, always pending — never term cards).

**Root cause / where.**
- (a) This is the **supplier's** experience (supplier mobile app + backend accept-gating). The renter web
  cannot change it. The symptom ("all green but unresolved") points at the backend treating
  `soft_accepted` (or a `pending` mob/demob term) as not-yet-resolved for the supplier's accept, and/or
  the intended lifecycle (renter accepts → `AWAITING_SUPPLIER_CONFIRMATION` → supplier confirms). Needs
  backend/supplier-app investigation.
- (b) Renter web: `DealRoomTerms.tsx:42` `isPriceKey = /mob|demob|pricing|rate/i` renders mob/demob
  **as term cards** with a price editor. `deal-room.ts mapDealRoom` only filters `PRICE`, not
  `mobilization_pricing` / `demobilization_pricing`, so they land in the terms list.

**Fix.**
- (a) **Backend/supplier-app** — investigate the accept-gating: which term states count as "resolved" for
  the supplier's accept, and whether accept-first is intended. Draft the exact backend change; hand off
  separately. **Not in the web PR.**
- (b) Web: drop `mobilization_pricing` / `demobilization_pricing` (and any `*_pricing`) from the deal-room
  **terms** list in `mapDealRoom`; they are already handled by the rate/mob/demob **Price** page of the
  counter flow. Verify the counter-offer price page still carries mob/demob (it does — `mobStr`/`demobStr`).

**Scope:** T2a **Backend/supplier-app** (hand-off) · T2b **Web-only**.
**Files (T2b):** `src/lib/contract/deal-room.ts` (`mapDealRoom` terms filter), `src/components/deal-room/DealRoomTerms.tsx` (drop the price-key term rendering if now dead).
**Acceptance:**
- (b) Mob/demob no longer appear as term cards in the deal room; they appear only as price line items in
  the counter/accept Price page; term counts + "resolved" meter exclude them.
- (a) A written backend finding + proposed diff for the supplier accept-gating (tracked, not silently
  dropped).

**Open questions:** is "supplier accepts first" ever allowed, or is renter-accept-first the intended flow?
Confirm from the app + `deal-room.service.ts`.

---

## T3 — Single-winner award lock + deal-room release/reopen after accept

**Problem.**
- **(a)** After the renter **awards a supplier via the survey**, the bid-comparison UI still lets him
  **award another** supplier. Awarding should lock to a single winner (per request/group).
- **(b)** There is a **release / reopen** feature for an **accepted** deal room (app) — after acceptance
  the renter can release/reopen it.
- **(c)** After that, the **quotation can be updated** (re-issued) following a reopen.

**Root cause / where.**
- (a) Web UI gating: the award/select-winner control (`GroupBids.tsx` / `BidComparisonWorkspace.tsx`)
  doesn't disable other awards once a winner exists (`wonViaSurvey` / `status === "ACCEPTED"`).
- (b/c) Deal-room **reopen/release** of a **CLOSED/ACCEPTED** deal is a lifecycle action — the current
  web reopen path only covers rentee-reopen of a term (→ pending). Releasing a closed deal likely needs a
  backend endpoint; confirm what the app calls.

**Fix.**
- (a) Web: once any bid in the request/group is awarded (survey win or deal-room accept), disable/hide the
  award action on the others and show the current winner state. Mirror the app's single-winner rule.
- (b/c) Investigate the app's "release"/reopen-accepted flow + which backend endpoint it hits; if
  backend-only, draft + hand off. Wire the web action + allow the quotation to re-render/update after a
  reopen.

**Scope:** T3a **Web-only** · T3b/c **Web + Backend** (investigate; backend part handed off).
**Files (T3a):** `src/components/requests/GroupBids.tsx`, `src/components/compare/BidComparisonWorkspace.tsx`, award/survey wiring.
**Acceptance:**
- (a) With a winner already awarded, no other bid can be awarded from the comparison UI; the winner is
  clearly marked; attempting another award is blocked.
- (b/c) Documented app behavior for release/reopen-after-accept + the backend endpoint; web action wired
  (or a tracked backend hand-off if it needs a new endpoint), and the quotation reflects the updated deal.

**Open questions:** exact app semantics of "release" (reopen negotiation vs cancel the award vs unlock
edits) and the backend endpoint it calls.

---

## T4 — Deal-room chat: align allowed media / sharing with the app

**Problem.** The deal-room chat should allow the **same media to send/share as the app** — currently the
web may differ (allowed file types, image/pdf sharing, size limits).

**Root cause / where.** GetStream message-input attachment config in the web deal-room chat vs the app's
message-input (allowed attachment types / upload handling).

**Fix.** Read the app's chat message-input config (allowed file types, image + document sharing, any size
limit) and match it in the web deal-room chat component. Ensure attachments render (image previews / file
links) the same way.

**Scope:** Web-only (verify no backend/GetStream perms are involved).
**Files:** deal-room chat component (GetStream `MessageInput` / attachment config) under `src/components/deal-room/**`.
**Acceptance:** the web deal-room chat allows exactly the media the app allows (types + sharing); sent
attachments render consistently; no type the app forbids is allowed (and vice-versa).

**Open questions:** confirm the app's exact allowed types + any size cap; confirm GetStream app-level
settings don't already gate this server-side.

---

## T5 — One unified quotation template + fix broken bid quotation download

**Problem.**
- **(a)** The deal-room (post-accept) quotation looks **different from the app**, and different from the
  bid-card quotation. There should be **ONE** quotation template used everywhere — bid-card quotation and
  deal-room-accepted quotation — matching the app's single template.
- **(b)** **Cannot download a bid's quotation** — clicking Download does **nothing**.

**Root cause / where.** There are **two** separate quotation renderers in the web:
- Bid-card quotation: `GroupBids.tsx:339 downloadQuotation()` (ported from `prototypes/requests-grouped.html`,
  full formal template), which opens a new window and auto-prints (`GroupBids.tsx:583-587`,
  `window.open("", "_blank")` + `window.print()`).
- Deal-room quotation: `DealRoom.tsx buildQuotationHtml()` (a different, lighter template).
- (b) "Nothing happens" on download is the `window.open("", "_blank")` path being **popup-blocked** or
  losing the user-gesture (async work before `open`), so no tab opens / no print dialog.

**Fix.**
- (a) Extract ONE shared quotation renderer (a single template matching the app's quotation) into a shared
  module and use it for **both** the bid-card quotation and the deal-room-accepted quotation. Retire the
  divergent second template.
- (b) Make download robust: open the window **synchronously in the click handler** (before any await) or
  switch to a Blob + `<a download>` / `data:` URL approach so it isn't popup-blocked; verify the bid-card
  Download button is actually wired to it. Confirm on staging that Download produces the file/print view.

**Scope:** Web-only.
**Files:** new `src/lib/quotation/render.ts` (shared template), `src/components/requests/GroupBids.tsx`
(bid-card download → shared renderer + robust open), `src/components/deal-room/DealRoom.tsx`
(`buildQuotationHtml` → shared renderer), `src/lib/compare/quotation-token.ts` (filename helper reuse).
**Acceptance:**
- A single quotation template renders identically from the bid card and from the deal room after accept,
  matching the app (parties, CR/VAT/National Address, equipment + terms sections, totals with units + VAT).
- Clicking **Download** on a bid's quotation reliably produces the quotation (print view or file) — no
  silent no-op, not popup-blocked.
- Add a smoke test that the shared renderer produces non-empty HTML for a representative bid + a
  representative closed deal.

**Open questions:** which template is the canonical "app" one (bid-card formal template appears closest —
confirm against `live_quotation_document.dart`); does the deal-room quotation need any field the bid-card
template lacks (e.g. contract type)?
