# Deal-room / compare / bids / quotation — bug fixes

Five issues from Yara's 2026-07-04 review (screenshots). Source of truth for behavior = the mobile app.
Each ticket = problem · likely cause · impl approach · files · app-parity/investigation.

---

## B1 — Bid-card terms count (Conflict N · Matched N) ≠ Terms modal count
**Problem** (Screenshot 190723): the bid card's Terms row shows "Conflict 1 · Matched 1", but opening the
Terms modal lists **3**. The summary tally and the modal disagree.

**Likely cause:** two different sources. The card tally is `termTally` (`GroupBids.tsx:~800`, "tally the
negotiable terms into Matched / Conflict / …"); the Terms modal renders the full term list (a different
set — e.g. includes per-item duplicates, or a different bucket, or the modal counts terms the tally
skips). One counts a subset of the other.

**Impl approach:** make both read ONE derived list. Compute the tally from the exact same term array the
modal renders (same filter/dedupe), so "Conflict N · Matched N" always equals the modal's counts. Verify
which terms each currently includes (negotiable vs all, per-item vs deduped).

**Files:** `src/components/requests/GroupBids.tsx` (`termTally` ~800 + the Terms modal list), possibly
`src/lib/contract/bids.ts` (matchCount/conflictCount if the modal uses those).

**AC:** the card's Conflict/Matched numbers equal the count shown when the modal is opened, for every bid.

---

## B2 — Compare shows a term green ("on you") when it's a CONFLICT in the deal room
**Problem** (Screenshot 191929): a term (e.g. Operator FAT) is **Conflict** in the deal room, yet the bid
comparison shows it **green "on you"** (as if resolved/agreed). The comparison doesn't reflect the
unresolved conflict.

**Likely cause:** `buildCostResponsibilities` (`comparison.ts:151`) resolves the responsible side from the
term's settled/agreed value or the request-side default, and colors green when a side is derivable — but
when the deal-room term is **disputed/unresolved** it should NOT read as green-agreed. It's falling back
to the request side (→ "on you", green) instead of showing the conflict.

**Impl approach:** gate the green state on the term actually being resolved. When the underlying deal-room
term state is `disputed`/`pending` (unresolved), render the cost-responsibility as **conflict (red)** or
unknown (grey), not green. Only show the settled side (green/"on you"/"on supplier") when the term is
`agreed`/`soft_accepted`/`fixed`. Use the deal-room term state as the gate, consistent with B1's source.

**Files:** `src/lib/contract/comparison.ts` (`buildCostResponsibilities` ~151-170), and wherever the
comparison receives term state.

**AC:** a term that is Conflict/Pending in the deal room shows as a conflict (not green) in the comparison;
a settled term shows its agreed side.

**Status — PARTIAL (shipped) + follow-up B2b needed.** The gate is in: `buildCostResponsibilities` no
longer force-greens (maintenance only greens at the request side when no negotiable term exists; an
existing-but-unresolved term stays grey; conflict→red, agreed→resolve). **But the screenshot case isn't
fully fixed:** the comparison derives term state from the **bid-list qualification data** (bid-vs-request
matching), **not** the live **deal-room** term state — so a term that's "matched" in the bid data yet
"conflict" in the deal room still can't read as a conflict here.
**B2b (follow-up):** thread the live deal-room term states (or settled values) into the comparison
pipeline so the compare reflects the *deal-room* truth, not just bid-vs-request matching. Larger change;
likely needs the deal-room term states available where the comparison is built.

---

## B3 — Deal-room terms: locked / turn-gating + conflict display vs the app
**Problem** (Screenshot 192410): the term action buttons (Keep mine / Counter / Accept supplier's) appear
**locked/disabled**; "in the app all terms shown have conflict on the supplier side and he cannot accept or
do anything." Need the web's turn-gating + locked/conflict presentation to match the app exactly.

**Likely cause:** web disables the buttons via `busy || !room.myTurn` (`DealRoom.tsx:317`). When it's the
supplier's turn the renter can't act (correct in principle), but the *presentation* (greyed actionable
buttons) may differ from the app, which likely shows the terms read-only / hides the actions when it's not
the renter's turn.

**Impl approach:** confirm the app's exact behavior when it's NOT the renter's turn (does it hide the
action buttons, show a read-only/awaiting state, or disable?), then match it. Likely: when
`!room.myTurn`, render terms read-only (no greyed buttons) with an "awaiting supplier" affordance. This
overlaps the pending batched-negotiation rework — fold it in there.

**Files:** `src/components/deal-room/DealRoom.tsx`, `src/components/deal-room/DealRoomTerms.tsx`.
**Investigation:** read the mobile `term_card.dart` / `terms_review` for the not-your-turn presentation.
**AC:** when it's the supplier's turn, terms match the app's read-only/locked presentation (no misleading
enabled-looking actions).

---

## B4 — "Select bids" → "Compare bids" + selection UX polish
**Problem** (Screenshot 190449): (a) the top-right **"Select bids"** button should read **"Compare bids"**;
(b) selection UI feels off — cards "float" when selecting; (c) clicking **outside** should exit selection
mode (currently only a Cancel button does).

**Impl approach:**
- Rename the button label "Select bids" → "Compare bids" (EN + AR), where the selection mode is toggled.
- Selection visual: replace the "floating" effect (likely a large `translate`/shadow on selected cards)
  with a flat selected treatment (border/checkbox + subtle background), no lift/scale.
- Add a click-outside (backdrop / container `onClick`) that exits selection mode; keep Escape too. The
  explicit Cancel button can stay or be removed per the app.

**Files:** the requests list / selection component (`src/components/requests/RequestsList.tsx` and/or the
selection-mode component), plus its CSS; i18n `en.ts`/`ar.ts` for the button label.
**Investigation:** locate the "Select bids" toggle + the selected-card styling.
**AC:** button reads "Compare bids"; selected cards look flat (no float); clicking outside exits selection.

---

## B5 — Web quotation values differ from the app's downloaded quotation
**Problem:** the quotation downloaded from the **app** shows different values than the **web** quotation —
likely the **deal-room negotiated updates aren't reflected** in the web quotation.

**Likely cause:** two different quotation surfaces. The **app** (and the web deal-room "Download
quotation") use the **backend-generated PDF** built from the agreed deal-room values. The web's **My
Requests** per-supplier quotation is a **client-side HTML** doc (`GroupBids.tsx renderSection`) that
recomputes from bid-list values (`b.price` = live rate, its own rate÷period×duration×units math, mob/demob
× units) — so negotiated terms/mob/demob and the backend's rounding/rules may not match the PDF.

**Impl approach:** decide the source of truth and align:
- **Preferred:** make the web's per-supplier quotation use the **backend PDF** (same as the app / deal-room
  download) so values are identical by construction — no client recompute.
- **Or:** if the HTML quotation stays, feed it the **agreed deal-room values** (negotiated rate + mob +
  demob + settled terms) and mirror the backend's total math exactly.
First, diff a real example: app PDF vs web HTML for the same deal — capture which fields differ (rate?
mob/demob? VAT rounding? terms?).

**Files:** `src/components/requests/GroupBids.tsx` (renderSection quotation), `src/lib/api/client.ts`
(fetchQuotation), the deal-room download path for reference.
**Investigation:** compare the backend `quotation.service.ts` math/values vs GroupBids' math.
**AC:** the web quotation values match the app's downloaded quotation for the same deal (incl. negotiated
deal-room rate/mob/demob and totals).

---

### Notes
- B1 + B2 share a root theme: the **term state** must be the single source for both the card tally and the
  comparison coloring — fix them together.
- B3 folds into the in-flight `deal-room-negotiation-parity` rework (batched flow).
- B5 is the highest-risk (quotation correctness) — settle the source-of-truth decision first.
