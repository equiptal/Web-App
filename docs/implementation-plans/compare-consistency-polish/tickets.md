# Tickets — Bid‑comparison consistency & polish

Scope tags: **Web UI** · **Contract/Adapter** · **BFF** · **⚠ Backend (Moedatech‑App)**. Reference surfaces: My Requests (`RequestsList` / `.rproto`) for spacing; bid cards (`GroupBids` / `SharedLinkBidCard` banners) for source labels.

---

## T1 — More margin between cards and the page edge / sidebar
**Scope:** Web UI (`RequestsList.tsx`, `requests-proto.css`, maybe `AppShell.tsx`).
Add a small, consistent gutter so the request cards + fulfilment panel don't sit flush against the page edge and the sidebar.
- **AC1:** On My Requests, there's a small (≈8–16px) breathing gap between the card row / navy panel and both the page edge and the sidebar.
- **AC2:** The gap is small ("very little", per Yara) — not a large indent.
- **AC3:** No horizontal scroll or content shift introduced at any breakpoint.
- **Given** I'm on My Requests **when** the page renders **then** cards have a small even gutter from the sidebar and the right edge.

## T2 — Consistent page margins + comparison group‑id tabs match the request screen
**Scope:** Web UI (`AppShell.tsx:246`, `BidComparisonWorkspace.tsx:705‑722`, `requests-proto.css`).
**Decision:** standard width = **My Requests (wide, ~1440px)** applied to every page.
Standardise the page container margin across all pages using My Requests as the reference, and make the comparison RFQ tabs read exactly like the request‑screen tabs (RFQ‑NNNNN prominent).
- **AC1:** Bid Comparison uses the same max‑width + horizontal padding as My Requests.
- **AC2:** The comparison "REQUESTS FOR QUOTE" tabs show the **RFQ‑NNNNN** group code with the same pill styling/spacing as the My Requests tabs.
- **AC3:** A spot‑check of create / deal‑room / inbox / profile shows the same page gutter (no page visibly wider/narrower than the others).
- **Given** I open Bid Comparison **when** I compare tabs to My Requests **then** the group code, pill style, and page margins match.

## T3 — Download icon in the comparison doc viewer
**Scope:** Web UI (comparison doc‑viewer modal in `BidComparisonWorkspace.tsx`).
Anything the renter can **view** they must be able to **download**. Add a download control beside the existing "open in new tab" in the file‑preview modal (VAT/CR/national address/equipment docs).
- **AC1:** The doc‑viewer modal shows a **download** icon/button.
- **AC2:** Clicking it downloads the exact file being viewed (reuses the presigned URL; correct filename/extension).
- **AC3:** Works for both image and PDF docs, in‑app and shared‑link where a file exists.
- **Given** I open a document to view **when** I click download **then** the file saves locally.

## T4 — Source labels match the bid‑card UI
**Scope:** Web UI (`BidComparisonWorkspace.tsx:950‑952`).
**Decision:** render a **small colored chip** (card colors + icon + exact wording) in the current header spot — not the full banner strip.
The column source label ("shared link" / "Moedatech app") must use the **same styling + wording** as the bid‑card banners for consistency.
- **AC1:** In‑app columns show the blue "Via Moedatech app" treatment; shared‑link columns show the orange "Off‑platform · via your request link" treatment (icon + colour + wording matching the cards).
- **AC2:** No other column header layout regressions (rank pill, verified chip, CR/VAT/address chips unchanged).
- **Given** I compare bids **when** I read a column header **then** its source label looks identical to that bid's card banner.

## T5 — Derive maintenance for shared‑link bids (not "—")
**Scope:** Contract/Adapter (`link-bids.ts`), Web UI (`BidComparisonWorkspace.tsx` cost‑terms row).
**Answer (T5 question):** in‑app bids show `Maintenance · supplier` because the value comes from the bid's declared cost responsibility (t3 declaration / deal‑room term). Shared‑link bids show `—` because the public form never asks maintenance.
**Decision:** derive the link bid's maintenance responsibility from the **request assignment** so it mirrors the app instead of blank.
- **AC1:** A shared‑link bid's Maintenance chip shows the request's assigned party (e.g. "supplier"/"you"), not "—", when the request specified one.
- **AC2:** If the request didn't assign maintenance, it stays "—" (no invented value).
- **AC3:** Colour/tone follows the same responsibility‑tone rules as in‑app.
- **Given** a request assigns maintenance to the supplier **when** I view a shared‑link bid's cost terms **then** it shows "Maintenance · supplier".

## T6 — "Not met" / conflict cell always red
**Scope:** Web UI (`BidComparisonWorkspace.tsx` `Td` / year row).
A conflict/not‑met cell must render clearly **red even when its column is the green "Recommended" column**.
- **AC1:** The Year "Not met" cell shows a red background/text regardless of the column's recommended tint.
- **AC2:** Applies to any `fail` cell (year, certs, terms), not just year.
- **AC3:** Matched cells stay green; neutral stay neutral.
- **Given** the recommended bid fails the min‑year **when** I view its Year cell **then** it's red "Not met".

## T7 — Explain the equipment‑cert logic for app bids (doc/answer)
**Scope:** Answer + optional code comment (`bids.ts`).
**Answer (T7 question):** for in‑app bids, `equipmentCertCodes` are read from the equipment listing's uploaded `documentKeys` typed as safety certs (`tuv/spsp/saso/saso_technical_inspection`). The **required** cert(s) come from the request's `requiredCerts`. The cell compares them: held → ✓ green, not held → ✗ red (the red TÜV = required TÜV, supplier's equipment has no TÜV doc on file). Shared‑link bids derive the same from the supplier's Yes/No confirmation.
- **AC1:** Written explanation delivered to Yara (this ticket documents it).
- **AC2 (optional):** Add a one‑line source comment above `equipmentCertCodes` derivation in `bids.ts`.

## T8 — Merge the two Equipment‑section banners into one (multi‑unit aware)
**Scope:** Web UI (`BidComparisonWorkspace.tsx:1172‑1195` — the two full‑width banners above the equipment rows).
Merge the two stacked notes at the top of the Equipment section into **one** well‑worded banner:
- Banner A (⚠ warning_amber): "These are acknowledged by the supplier — for in‑app bids, verify each one in the deal room."
- Banner B (🛡 shield, only when `units > 1`): "Details shown are for 1 unit only — each of the N units is verified individually in the deal room before approval."
- **AC1:** One combined banner replaces the two; single icon, single row.
- **AC2:** The multi‑unit clause ("shown for one unit; each of the N verified individually") appears **only when the item has >1 unit**; single‑unit shows just the acknowledged/verify sentence.
- **AC3:** Bilingual EN/AR; "for in‑app bids" scoping retained (off‑platform has no deal room).
- **Copy (final):** single‑unit → "Supplier‑acknowledged, not verified — verify in the deal room (in‑app bids)."; multi‑unit → "Supplier‑acknowledged, not verified; shown for 1 of N units — verify each in the deal room (in‑app bids)."
- **Given** a multi‑unit item **when** I view the equipment section **then** I see one banner covering both the "acknowledged → verify in deal room" and the "per‑unit verification" points; **given** a single‑unit item **then** the per‑unit clause is absent.

## T9 — Shared‑link conflict term missing from the terms table
**Scope:** Contract/Adapter (`link-bids.ts` `submissionToBidCard`) + comparison term filter; **verify ⚠ Backend** (`submitBidForm` confirmations).
A shared‑link supplier answered **No** to "Accommodation & transport" (a conflict), but the term doesn't appear in the comparison terms table. Investigate and surface it.
- **AC1:** Confirm the chain: form captures `fatTransport` No → `submitBidForm` persists the confirmation → `getRequestSubmissions` returns it → `submissionToBidCard` builds a `fat_transport` conflict row → the comparison shows it.
- **AC2:** The conflicting `fat_transport` (and `fat_food`) term appears in the terms table/modal for the link bid, coloured as a conflict.
- **AC3:** If the gap is backend (confirmation not persisted), open a `/web:link-agents` handoff; otherwise fix the web mapping/filter.
- **Given** a link supplier declined Accommodation & transport **when** I open the terms **then** that conflict is listed.

## T10 — Reconcile the "X bids" count across surfaces
**Scope:** Web UI (`RequestsList.tsx` fulfilment header + per‑item; `BidComparisonWorkspace.tsx` tab count), product decision.
Fulfilment shows **2 bids** while the comparison tab + per‑item show **3** for the same request. Cause: fulfilment counts **distinct submissions** (`link.submittedCount`), while per‑item/tab count **submission‑items** (one link submission spanning 2 items counts twice). Pick one definition and apply consistently.
**Decision:** **distinct bids** — one submission counts once, even across multiple items.
- **AC1:** The fulfilment header, the "View all bids" pill, the comparison tab "N bids", and per‑item "N total bids" all count **distinct bids** and agree for the same request. A shared‑link submission spanning 2 items counts as **1**.
- **AC2:** Both in‑app and shared‑link bids are included in the total.
- **AC3:** Per‑item "total bids" still reflects how many distinct bids touched that item (so an item may show fewer than the request total), but no single bid is counted twice within one number.
- **Given** a request has 1 in‑app (Forklift) + 1 link submission spanning both items **when** I read the fulfilment header / tab / "view all bids" **then** they all show **2**.

---

### Suggested order (batch 1)
1. **Phase 1 (visual):** T1, T2, T4 — margins, tabs, labels.
2. **Phase 2 (correctness):** T5, T6, T9 — maintenance, red conflict, missing conflict term.
3. **Phase 3 (affordance/wording):** T3, T8 — download, merged note.
4. **Phase 4 (semantics/docs):** T10 (after the a/b decision) + T7 answer.

---

# Batch 2 — source & colour model + price sync

**The 3‑colour rule (applies to every comparison cert/term/cost cell):**
- 🟢 **Green** = the value **matches what the request required** (met) — including a term on **YOU (renter)** when it matches (not blue anymore).
- 🔵 **Blue** = **shown for information but NOT required** by the request (an extra the supplier offers/holds).
- 🔴 **Red** = **required but not met** (conflict / missing).
- Grey/`—` = not applicable / nothing to show.

**The 3 source layers (each row reads from its own source):**
| Layer | Rows | Source |
|---|---|---|
| Company | CR / VAT / National address (top of table) | **Company verification** documents |
| Equipment | Equipment safety cert · Proof of ownership | **Equipment documents** (`documentKeys`) — what the equipment physically carries |
| Terms | Operator certificate · Equipment certificate (required) · cost terms | **Negotiable deal‑room terms** — update in real time as the deal room / bid changes |

## T11 — Colour semantics: green = matches request, blue = extra, red = required‑unmet
**Scope:** Web UI (`BidComparisonWorkspace.tsx` cost‑terms + cert cells), maybe `comparison.ts` (`responsibilityTone`).
Apply the 3‑colour rule uniformly. Today "on you" shows **blue** even when it matches the request — it should be **green** (matched). Blue is reserved for not‑required extras (T12/T13).
- **AC1:** A cost term / cert that **matches the request** is green, whether the responsible side is the supplier **or** you.
- **AC2:** Blue is used **only** for values shown that the request didn't require (see T12/T13).
- **AC3:** Red remains for required‑but‑unmet / conflict.
- **AC4:** `responsibilityTone` (comparison.ts) updated so `state === "green"` (bidSide === requestSide) → green regardless of side; remove the "requestSide==='me' → blue" rule for matched terms.
- **Given** the request assigns fuel to you and the supplier agrees **when** I view the cell **then** it's green "matched", not blue.

## T12 — Safety cert row: held‑but‑not‑required certs shown in blue
**Scope:** Web UI (`BidComparisonWorkspace.tsx` equipment‑cert row), Contract (`bids.ts`/`link-bids.ts` held certs).
**Decision (locked):** the row is **term + held extras** — the **required** cert is driven by the negotiable deal‑room **term** (green when agreed/met, red when not, live per T15); **plus** any **held‑but‑not‑required** cert (e.g. supplier has SPSP, request wanted TÜV) shown as a **blue** extra chip.
- **AC1:** Required cert (the term) met/agreed → green ✓; required cert not met → red ✗ — reflecting the live term state.
- **AC2:** A held cert **not** in the request's required set shows as a **blue** chip ("extra") in the same row.
- **AC3:** Applies to in‑app (held certs from equipment docs) and shared‑link (held/confirmed certs).
- **Given** request requires TÜV and the supplier holds SPSP only **when** I view the cert row **then** TÜV is red and SPSP is blue.

## T13 — Proof of ownership: show any equipment ownership doc, in blue
**Scope:** Web UI (`BidComparisonWorkspace.tsx` proof‑of‑ownership row).
Source = **equipment documents**. Proof of ownership is **never required** by the request, so show **any** ownership doc the equipment carries (Istimara / customs / sale contract / SASO registration) as **blue** informational chips; show `—` when none. **Never red** (supersedes the earlier ✓/`—` treatment).
- **AC1:** Each ownership doc the equipment has → a **blue** chip; no doc → `—`.
- **AC2:** No red state on this row (it's informational, not a requirement).
- **AC3:** Off‑platform bids (no equipment docs) → `—`.
- **Given** a supplier's equipment carries a sale contract **when** I view Proof of ownership **then** it shows a blue "Sale contract" chip.

## T14 — Per‑row source correctness (company vs equipment vs terms)
**Scope:** Web UI + Contract (`BidComparisonWorkspace.tsx`, `bids.ts`, `link-bids.ts`).
Make each row read from its declared source (table above) and document it inline so the three layers don't get conflated.
- **AC1:** Company rows (CR/VAT/national address) read from company‑verification docs (presigned once a deal room / verification exists) — unchanged behaviour, documented.
- **AC2:** Equipment rows (safety cert, proof of ownership) read from the equipment's `documentKeys`.
- **AC3:** Operator/equipment‑cert **term** rows read from the negotiable deal‑room terms.
- **AC4:** A short source comment sits above each row group.

## T15 — Operator/equipment‑cert term rows update in real time
**Scope:** Web UI (`BidComparisonWorkspace.tsx`), verify polling/refresh.
The operator‑certificate and equipment‑certificate **term** rows are negotiable — they must reflect the **current deal‑room state** and update in real time (the workspace already polls + re‑syncs on focus; ensure these rows are driven by the live term state, not a stale snapshot).
- **AC1:** When a term is agreed/changed in the deal room (or the bid is edited), the comparison cert/term rows reflect the new state on the next poll/refresh without a manual reload.
- **AC2:** The 3‑colour rule (T11) is re‑evaluated from the live term state.
- **Given** the operator‑cert term flips to agreed in the deal room **when** the comparison next syncs **then** its cell turns green.

## T16 — ⚠ Prices don't sync from the deal room (comparison + bid card)
**Scope:** Contract (`bids.ts` price mapping); **verify** the per‑request bid‑list returns the live rate (backend confirmed to project `dealRoom.lastProposedRate`).
The comparison and the bid card show the **locked‑or‑original** rate (`negRate ?? priceAmount`) and deliberately ignore the live deal‑room rate — so a negotiated price never updates, unlike the mobile app which shows the current rate.
- **AC1:** The headline price in the comparison **and** the bid card reflects the **current deal‑room rate** (`currentPrice` = `lastProposedRate`) when a deal room is active, falling back to the original offer otherwise — matching the app.
- **AC2:** Confirmed check: the per‑request bid‑list (`/marketplace/requests/{id}/bids`) actually returns `currentPrice`; if it doesn't (only `received-bids` does), raise a `⚠ Backend` handoff to add it. Backend already projects `dealRoom.lastProposedRate` in `findByRequest`, so this is expected to be **web‑fixable** in `bids.ts`.
- **AC3:** All derived totals (grand total, per‑unit, breakdown) recompute from the updated rate.
- **Decision (locked):** show the rate **accepted by BOTH parties** (agreed/locked) — NOT a pending counter. This is what the current mapping *intends* (`negRate = lockedVal("price")`), so the real work is **finding why the agreed rate isn't reflecting**: verify the per‑request bid‑list returns the locked/agreed price terms (or `currentPrice` only becomes the agreed rate once locked), and fix the mapping/field so an agreed rate shows in the comparison + card.
- **Given** both parties accept a new rate in the deal room **when** I open the comparison / bid card **then** the price shows that agreed rate (a still‑pending counter does NOT change it).

## T17 — Reflect the "decided" state in the comparison — THREE cases
**Scope:** Web UI (`BidComparisonWorkspace.tsx`), Contract (`bids.ts`, `survey.ts`), possibly BFF (fetch outcome).
There are **three distinct ways a request becomes decided**, each with a different level of truth/finality. All three **mark the winning column** and show a closed banner; per the locked decision, **losing columns are NOT dimmed or hidden — they stay as‑is** (only the winner is badged + banner shown + further awarding disabled).

**Case A — Accepted in the deal room (on‑platform, finalized truth).**
- Detected from the **backend** bid state (`status === "ACCEPTED"` / deal‑room accepted), not `localStorage`.
- Winner column badge: **"Accepted"** (finalized); banner "Accepted — {supplier}, request closed"; primary action → "View deal room / order".

**Case B — Awarded in the UI only (comparison intent, not finalized).**
- The renter clicked **Award** in the comparison but hasn't finalized in the deal room (today: `awardedIds` in `localStorage`).
- Winner column badge: **"Awarded · finalize in deal room"** (soft/pending); banner nudges to finalize; still reversible (un‑award).
- This is intent, not truth — it must not masquerade as Case A.

**Case C — Awarded via the Outcome Survey (reported outcome).**
- From the survey: **bidder won** (`confirm` + `winnerSupplierId`/`bidId`) → badge that bid **"Rented from"**; **won elsewhere** → banner "Rented off‑platform — request closed" (no winner column); **no winner** → "Closed — no supplier selected".

- **AC1:** Each case marks/labels correctly per above; **losing columns unchanged** (no dim/hide).
- **AC2:** Precedence when several apply: **A (deal‑room accepted) > C (survey) > B (UI‑only)** — the most authoritative wins the badge/banner.
- **AC3:** Cases A & C survive reload (backend/survey truth); B is local intent only.
- **AC4:** Once decided by A or C, further **Award actions are disabled** (can't award a second bid); B stays reversible.
- **AC5 (data):** verify the feed exposes what's needed — bid `status`/closed + winner id (Case A) and the survey outcome per request/group (Case C). Likely a small BFF read or `⚠ Backend` field for the survey outcome + group‑level closed status.
- **Given** a bid is accepted in the deal room **then** its column reads "Accepted" + closed banner; **given** I only clicked Award **then** it reads "Awarded · finalize in deal room" (reversible); **given** I reported a bidder in the survey **then** that column reads "Rented from" + closed banner.

### Suggested order (batch 2)
5. **Phase 5 (colour+source):** T11 → T12 → T13 → T14 (shared colour rule first, then per‑row sources).
6. **Phase 6 (live data):** T15 (real‑time terms) + T16 (price sync — agreed‑by‑both).
7. **Phase 7 (decided state):** T17 — the three decided cases (A deal‑room accepted · B UI‑only award · C survey), shared "mark‑winner + closed banner" treatment (losers unchanged).

---

# Batch 3 — quick polish + terms accuracy

**Done (shipped alongside):** unit pill → subtle grey (bid form); request‑group tabs ordered by **date (latest first)**; post‑submit redirect → **group** detail (`RequestGroupDetail` resolves the group from a member request id); bid **cards show no equipment chips** (in‑app + link) — all detail in the Details modal; link equipment modal title uses the item name (was "—"); link terms modal **hides the "Pending review" tab** (no deal room); page **gutter increased** a bit more (px‑6 / sm:px‑10 / lg:px‑12).

## T18 — Terms modal accuracy = mobile‑app parity (in‑app bids)
**Scope:** Contract (`bids.ts` `buildBidTerms`), Web UI (`BidTermsModal`, callers). **Reference:** `apps/mobile/.../terms_modal.dart`.
The in‑app terms modal shows a vague lumped **"Certificates"** conflict and an inflated **"Pending review"** count, because the modal only receives `terms.{equipment,contract,supplier}` — **not** `negotiableTerms`, where the specific rows live (`safety_certifications` = "Equipment safety certificates", `operator_certification` = "Operator certification"). Placeholder always‑grey rows (measurement, attachments, mob/demob pricing) also inflate "pending".
- **AC1:** The modal shows the **specific** cert/operator terms (Equipment safety certificate, Operator certificate) — a conflict names exactly which term, matching the app.
- **AC2:** "Pending review" reflects **real un‑converged requirements** (renter asked, not yet agreed) — the app's `pending` semantics — not always‑grey placeholders; drop placeholder/no‑requirement rows.
- **AC3:** Do NOT break **link** bids — for link submissions, `"certs"` IS the real equipment cert row (not lumped); only in‑app conflates it. Handle both term models.
- **AC4:** Match the app's state rule: a contract/declaration row is `matched` only when both sides converged; a set‑but‑un‑negotiated requirement is `pending`, not matched.
- **Given** an in‑app bid conflicts on the equipment safety cert **when** I open Terms → Conflict **then** it lists "Equipment safety certificate", not a vague "Certificates".

## T19 — ⚠ Backend: return the RFQ group code on EVERY request (bid‑less too)
**Scope:** **⚠ Backend** (agents `getRequestSubmissions` and/or app‑backend `my-requests`). Web needs no change — it already renders `groupRef ?? displayId`.
**Live‑verified (REQ‑00209 / 00762689):** `GET /agents/requests/{id}/bid-submissions` returns the code **only per submission** — `submissions[0].groupRef = "RFQ-00010"`; the **top‑level `groupRef` is `undefined`**. So a request WITH a submission shows `RFQ-` on both the requests page + comparison (works today); a request with **zero submissions** returns no `groupRef` anywhere → the web correctly falls back to `REQ-`.
- **AC1:** The endpoint returns the group code (`RFQ-NNNNN`) for a request even with **zero bids/submissions**.
- **AC2:** Preferred: **hoist it to the response top level** in `getRequestSubmissions` (the code is already derived there per submission — compute it from the group up‑front and return `groupRef` regardless of `submissions.length`). Alternatively add it to `my-requests` per group.
- **AC3:** No web change — the web already surfaces `groupRef` when present.
