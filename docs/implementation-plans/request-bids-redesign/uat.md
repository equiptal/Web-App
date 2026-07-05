# UAT — Requests & Bids redesign

**Surface:** `/requests` (staging) · **Locales:** EN + AR (RTL) · **Tiers:** verified & basic renter
**Build state:** uncommitted (working tree). Requests/Bids files type-check + lint clean.

Status legend: ⬜ not tested · ✅ pass · ❌ fail · 🚧 blocked.
Interactive version (saves results in-browser): published Artifact "uat-requests-bids".

---

## A. My Requests — list & header  _(frontend)_
- **REQ-1** RFQ tabs: one per group, REQ-id + "N items" pill + location; active tab solid navy.
- **REQ-2** Old "My Requests / My Bids" count toggle is gone.
- **REQ-3** Navy header left: title + status pill + 📣 Broadcast, REQ-id·date, "View full request details", share-link row (Share/Copy/Edit), opened/submitted/closes stats.
- **REQ-4** Long location title clamps to ≤2 lines + "…" (hover = full); chips don't shrink/push.
- **REQ-5** Fulfillment panel: total bids, "View all N items" toggle, tiles (white icon box + gold ×N + filled/needed + bar).
- **REQ-6** Bar colour: ≥50% green, >0 amber, 0 red (header tiles + item cards).
- **REQ-7** ≤2 items → 1 tile/row; 3+ → 2-col grid.
- **REQ-8** Header is compact (thinner than before), icon chip legible.
- **REQ-9** "N items in this request" + "View all bids for all items {count}" + 2-col item grid.
- **REQ-10** Item card = bid-card style: orange accent, icon + name + ×qty, basis, filled/qty + bar, "N total bids · REQ-id" strip, divider + View Details / View Bids (N).

## B. Bids — navigation & toolbar  _(frontend)_
- **NAV-1** View Bids (N) → bids scoped to that item; subtitle "N bids from M suppliers · {item}".
- **NAV-2** View all bids → unscoped; picker = "All items".
- **NAV-3** Back arrow in the top bar beside "My Requests" (→ in AR); returns to list. No in-content back button.
- **NAV-4** Supplier tabs (avatar + ✓ + count) filter cards.
- **NAV-5** Item-picker dropdown: white icon chip + count + ▾; menu lists All items + each line (icon/×qty/count).
- **NAV-6** Filter funnel popover opens leftward, fully on-screen (Done button visible).
- **NAV-7** Filters (source / verified / ≤50km) work; funnel shows orange active-count badge.
- **NAV-8** Switching RFQ tab in bids view resets item scope to "All items".

## C. Bid card — on-platform  _(frontend)_
- **ON-1** Header: accent bar, big icon (white box), name (≤2 lines) + ×offered, supplier avatar+name+✓, status pill.
- **ON-2** "Covers X of Y units" + orange bar + ★rating · km.
- **ON-3** Equipment row: cert chips + Details › → equipment modal.
- **ON-4** Terms row: Equipment/Project/Documents x/y chips + View › → Terms modal.
- **ON-5** Rate chevron expands breakdown (Rental/Delivery/Return/Subtotal/VAT + Estimated total) with All/Per-unit toggle.
- **ON-6** CTA: Start negotiation / Open chat / View order → deal room.
- **ON-7** Term/cert chips stay one line + scroll (no wrap, no visible scrollbar).

## D. Bid card — off-platform (shared link)  _(front + back)_
- **OFF-1** Top banner "🔗 Submitted via your request shared link · N days ago"; no status pill / no Off-platform chip.
- **OFF-2** No duplicate "submitted N days ago" line above the button.
- **OFF-3** Red ! on Equipment row → "…acknowledged by the supplier in your shared-link form only — not verified." No "Confirm the documents…", no "CR + VAT captured" chip.
- **OFF-4** Rate total reads "Quoted total".
- **OFF-5** CTA "View bid submission" → read-only viewer; "no deal room" note shown.
- **OFF-6** Chips = certs the supplier ticked; data from the submission.

## E. Card layout & width  _(frontend)_
- **LEN-1** 1–2 bids fill the row (no empty right strip).
- **LEN-2** 3+ bids: third peeks; row scrolls horizontally.
- **LEN-3** Equal height; bottom CTAs aligned across cards.
- **LEN-4** Collapsing sidebar widens content; cards grow.

## F. Modals — Terms & Equipment  _(front + back)_
- **TRM-1** Sections EQUIPMENT/PROJECT/DOCUMENTS with ✓ Matched/Agreed/Verified, – Unverified, ↻ In deal room, ! Conflict.
- **TRM-2** Footer CTA: Negotiate terms (on-platform) / View bid submission (off-platform).
- **EQ-1** Hero + certs, Facility verified, Supplier-provided-details disclaimer + available qty, 2-col spec grid (Distance/Measurement/Quantity offered/Fuel/Year/Rate), certs, Request more details.
- **EQ-2** Make/model/year/measurement/fuel from equipment record; distance & rate from bid.

## G. Select, Compare & Quotations  _(front + back)_
- **SEL-1** Select mode = tap-to-select (badge); resting cards have no checkbox.
- **SEL-2** Compare disabled at 1 ("Pick 2+"), enabled at 2+.
- **SEL-3** Download quotations: verified → language chooser → PDF per supplier; unverified → verify gate.

## H. Global — font, colour, shell  _(frontend)_
- **GLB-1** Nunito app-wide; Arabic = Tajawal.
- **GLB-2** App theme colours only (no leftover prototype hexes).
- **GLB-3** Sidebar collapse persists across pages/reloads.
- **GLB-4** /requests uses full width on wide screens.
- **GLB-5** RTL mirrors correctly (arrow flips, chips on the right).

## I. Backend / data the UI depends on  _(backend — no code changed this session)_
- **BE-1** Each bid has `units_offered` (array); card ×N + "Covers X of Y" use its length.
- **BE-2** Fulfillment = min(Σ offered + off-platform covered units, units needed), computed frontend, capped.
- **BE-3** Bids endpoint returns price/priceUnit, mob/demob (+lead), terms, certs, compliance, equipment{make,model,year}, distanceKm, rating, verified, status, dealRoomId.
- **BE-4** `fetchRequestSubmissions` returns items (requestId, numberOfUnits), CR/VAT numbers, confirmed certs, prices/quotedTotal, agoDays.
- **BE-5** `/api/equipment/{id}` returns category, manufacturer, modelName, year, fuel, measurement, isVerified, photos.
- **BE-6** Share URL resolves; deadline/logo save; Start negotiation opens/creates the deal room.

---

## Blockers & known gaps
- ⛔ **Build red (separate work):** `src/lib/i18n/ar.ts` missing the `survey` block that `en.ts` has → fix before staging push. Requests/Bids files themselves are clean.
- ⚠️ Supplier-tab counts are global, not per selected item.
- ⚠️ Header title = location (no project-name field in the renter app).
- ⚠️ Pre-existing failing unit test: `link-bids · year term` (unrelated).
