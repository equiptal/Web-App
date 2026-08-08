# Tickets — Deal Room Rentee Map (RMAP)

Scope tags: **`[BE]`** `Moedatech-App/apps/backend` · **`[AG]`** `Moedatech-App/apps/backend-agents` ·
**`[CT]`** web contract/selectors · **`[BFF]`** `src/app/api/*` · **`[UI]`** web components ·
**`[T]`** tests. `⚠ Backend (Moedatech-App)` marks work that cannot ship from this repo.

---

## S1 — Backend · branch `backend/deal-room-rentee-map`, PR → `staging`

### T1 · Per-unit location on `offeredUnitsDetail` `[BE]` ⚠
**Spec** §7.2, §7.3, §7.7 · **AC** 01→07, 10 · **Files** `rentee.service.ts:460-599`

Add `yardId` + `yard{id,name,latitude,longitude,city}` to the `buildOfferedUnitIndex` select
(`:520-531`); carry `entry.yardId` / `entry.yardConfirmed` through `offeredUnitsDetailFor`
(`:588-594`); resolve coordinates by the §7.3 precedence and compute per-unit `distanceKm` with the
same `haversineKm` and `request.projectLat/Lng`. **Keep the dedupe by `equipmentId`** (padding is the
same machine). **Do not** coerce plain-string entries — they carry request *item* ids.

- **Given** a `unitsOffered` entry with a `yardId` **When** the renter fetches bids **Then** the unit
  returns `locationSource:'unit_yard'` with that yard's `lat`/`lng`/`yardName`/`yardCity`.
- **Given** a yard row whose latitude **or** longitude is null **Then** `locationSource:'none'` with
  null coordinates — never a half-resolved point.
- **Given** `yardConfirmed:false` on an entry that has a `yardId` **Then** `false` is returned
  verbatim, never inferred from the yard's presence.

### T2 · `unitsOffered` ownership — write and read `[BE]` ⚠
**Spec** §7.2.1 · **AC** 08b, 183, 184, 185 · **Files** `submitBid.ts:30`, `editBid.ts:28`, `bid.service.ts`, `rentee.service.ts:518-521`

Validate every `equipmentId` in `unitsOffered` against **`ownerScopeWhere(supplierId, supplierCompanyId)`**
— the same scope as the primary check — on **both** endpoints, rejecting with the existing
`EQUIPMENT_OWNERSHIP`. Read side: keep the single batched query and **drop entries at assembly time**
when the resolved listing's owner does not match the referencing bid (no N+1, no per-bid query).

- **Given** a submit or edit naming a machine the caller does not own **Then** `EQUIPMENT_OWNERSHIP`
  and **no bid row is written**.
- **Given** a stored bid already carrying a foreign `equipmentId` **Then** the offered count still
  reads `unitsOffered.length` while that machine contributes **no** model, year, plate, documents,
  photos or yard.
- **Given** a same-company colleague's machine (T7 shared fleet) **Then** it is accepted.

### T3 · Bid-level coordinates `[BE]` ⚠
**Spec** §7.4, §7.10 · **AC** 09 · **Files** `rentee.service.ts:663-680`

Add `lat`, `lng`, `locationSource` to the bid object, resolved by §7.3 levels 2–4. `distanceKm`
unchanged. **Write the golden-file characterization test first** (TC-06).

- **Given** any existing bid **Then** its `distanceKm` is byte-identical to before, and the three new
  fields are additive.

### T4 · Ownership documents reach the renter `[BE]` ⚠
**Spec** §7.14, §7.14.1 · **AC** 101, 102 · **Files** `rentee.service.ts:449-458, 558-571`

Stop filtering `RENTEE_HIDDEN_DOC_TYPES` on the renter path so `documentKeys` includes ownership types
with usable urls, and **delete or rewrite the "must never surface on rentee screens" comment**
(`:449`) — leaving it guarantees someone re-adds the filter as a "regression fix".
`getDealRoomDocuments` needs no change. Ships without notifying suppliers (decided, §7.14.1).

### T5 · Supplier qualifying-fleet endpoint `[BE]` ⚠
**Spec** §7.12 · **AC** 94, 95, 96

For a request the renter owns, list a **bidding** supplier's active equipment matching that request's
item: `equipmentId`, `serialNumber`, `year`, `modelName`, `yardName`, `lat`, `lng`, `distanceKm`,
`yardConfirmed`, `inBid`, document/photo presence. Same subtype/capacity rule as the supplier's own
matched-fleet view. `ownerScopeWhere` for company-shared machines.

- **Given** a supplier who has **not** bid on this request **Then** refused — this must never become a
  way to browse an arbitrary company's fleet.

### T6 · `rentee_request` card — accept, validate, notify `[BE]` ⚠
**Spec** §7.13.2, §7.13.3, §7.13.4, §7.13.5 · **AC** 91→93, 104→112, 205, 182

No new table, no new endpoint shape beyond the existing chat path: a Stream message with structured
`customData`. Backend **mints `ref`** and returns it with `message.id` so a reply can thread via
`parent_id`. Add `rentee_request` to `UNREAD_INFLATING_CARD_TYPES` (`stream.service.ts:38`) — an
explicit decision, not an omission — and dispatch a supplier notification carrying `equipmentId`,
**coalescing** bursts. Validate: `equipmentId` owned by the bidding supplier (403 otherwise, no
message written); `scope`/`equipmentId` mismatch → 400; unknown `docTypes` rejected; **`add_to_offer`
rejected** (retired kind). Existing card vocabulary untouched.

### T7 · Agents `getRequestSubmissions` — `city` + `contact_info` `[AG]` ⚠
**Spec** §6.13.1 · **AC** 193

Add **only** those two to the **agents** handler's `SELECT` — `company_documents` and
`rentee_messages` are already there. `city` is mapped by `link-bids.ts:241` today but never returned,
so that field is null in production until this ships. **Note for the mobile port:** the
`apps/backend` twin is the mirror image and needs its own additions later — out of scope here.

---

## S2 — Web contract + pure selectors (no backend dependency)

### T8 · Extend the unit + bid types `[CT]`
**Spec** §7.2, §7.4 · **Files** `src/lib/contract/bids.ts:76-93, 199-200, 743`

Add `yardId`, `yardName`, `yardCity`, `yardConfirmed`, `lat`, `lng`, `distanceKm`, `locationSource` to
`OfferedUnitDetail`; `lat`/`lng`/`locationSource` to `Bid`. Additive, tolerant of absence (mobile and
older payloads must keep parsing). Fix the `numberOfUnits` comment on `DealRoomView` (**AC-191**) —
comment only, no rename.

**Also map `supplierCompanyId` onto `BidCard` — required by AC-70, missing today.** The column exists on
the `Bid` row (`schema.prisma:1201`) and already reaches the browser (`getBidList` returns `{...bid}`),
but `mapBid` never reads it, so `bidSuppliers()` groups by `supplierId ?? supplierName` (`bids.ts:805`)
and two colleagues of one firm read as **two** counterparties. Backend confirms they are one:
`supplierBidScopeWhere` (`authorization.service.ts:113-117`) scopes bids by company, and
`deal-room.service.ts:954` adds *every active colleague of both firms* to the Stream channel. Make
`supplierCompanyId` the first grouping key, then `supplierId`, then `supplierName`.

### T9 · `bid-map.ts` — every rule as a pure function `[CT]`
**Spec** §6.2, §6.3.2, §6.6, §6.9, §6.11 · **AC** 18→24, 37, 55→59, 146, 167/168

**No React, no DOM, no i18n imports** — this file gets a Dart port when mobile ships. Exports:
`resolveUnitLocation`, `unitCounts` (offered vs identified vs
unidentified), `compositionBuckets` (zero buckets **omitted**; unregistered = hatch; off-platform =
its own state), `sortBids` (price and nearest only — rating retired; nulls last on distance;
measured on the **bid's** `distanceKm`), `fleetPins`,
`decollide` (~74px pixel-space, **not** coordinate equality), `unitIndicators`
(`{readinessBand, yardConfirmed}` independent), `colourKeyModel` (**one** scale), `unitCountLabel`
(one literal Arabic form: `١ وحدة`, `٢ وحدة`, `١١ وحدة`).

**Two corrections made while implementing — both landed in the code, recorded here so the ticket stops
being wrong:**
1. **`unitCounts.offered` is `BidCard.unitsOffered` directly, NOT `.length`.** `mapBid` already reduces
   the wire array to its length (`bids.ts:704`), so the field is a `number` on the contract.
2. **`unitAvailability` returns `absent` ONLY for `unidentified`.** `none` — a registered machine whose
   yard was deleted — is `unconfirmed`: it still holds photos and documents, so its readiness band is
   meaningful, and AC-58 strips indicators only for a unit with no machine behind it. Plottability is a
   separate question, answered by `isPlottable` from coordinates.
3. **`fleetPins` was NOT built** — §7.12's payload type does not exist until T5 ships, so building it
   would mean inventing a type. It belongs to T16.

### T10 · `tests/unit/bid-map.test.ts` `[T]`
Covers TC-10→17, 27, 42→44, 90, 99, 125. Fixtures for each `locationSource` level, a padded array, a
null project site, a zero-machine offer, an off-platform row.

---

## S3 — Map surface

### T11 · The view toggle `[UI]`
**Spec** §5, §6.6 · **AC** 22, 23, 30 · **Files** `GroupBids.tsx:674`, i18n

`[قائمة │ خريطة]` segmented control in the controls cluster before the item selector (`:674`) and
filter (`:707`). `bidMap.view` / `bidMap.listView`. **Given** a single-item RFQ **Then** no item strip
renders inside the map view (the existing selector already covers it).

### T12 · `BidMapWorkspace` + `MapCanvas` `[UI]`
**Spec** §6.2 state 1 · **AC** 21, 29, 72, 98, 99

Opens on the **project pin only**. No supplier pins, ever. Fit to site. ~~rings 30/120/220 km~~ —
**no distance rings**: they belonged to the withdrawn band model (D-C), and colour now means
availability, never distance. Neutral
bands and `—` distances when the request has no `projectLat/Lng` (never 0). RTL: panel on
`insetInlineEnd`, pin content sets `direction:rtl` explicitly.

### T13 · `BidListPanel` — the entry point `[UI]`
**Spec** §6.2, §6.11, §7.5.1 · **AC** 24, 28, 73, 74, 169→173, 190, 229, 230

Scrollable, full height, **cheapest-rate first** by default with the existing sorts; row selection is
row *state* (accent + tick), single, replacing. **Selecting a row must NOT create a deal room** (D-A) —
that would freeze the supplier's offered count. Navigating to a room still uses `dealRoomId` else the
existing create-or-fetch path (`GroupBids.tsx:249`). Freshness = **mount · window focus · post-send** refetch
plus a **manual refresh affordance**; on new data the list **re-sorts** (never appends), the row gets
a `وصل الآن` marker, and the popup's comparison text is **computed from other offers' rates**. No copy
may imply instant updates.

### ~~T14 · Distance band filter~~ — **DROPPED** by product decision, 2026-08-05
§6.10, AC-225→228, AC-204, TC-125 and TC-117 are removed from scope, along with the
`distAll`/`dist50`/`dist100`/`dist200`/`distCount` i18n keys. Distance **text** on rows and pins stays;
the **nearest** sort stays and measures the **bid's** `distanceKm`. Rationale: a bid measuring 180 km can
own a machine 12 km from the site, so a band would hide exactly the machine the renter wanted.

### T15 · Colour key `[UI]`
**Spec** §6.9.2, §6.9.3 · **AC** 131, 132, 167, 168 · **Inside the bid panel**, collapsed behind
`؟ ما معنى الألوان؟` — never floating (it renders behind the panel in RTL). **One** scale. Must carry
the clause that *«غير مؤكّدة» does not mean unavailable*, and the line that off-platform offers carry
no location.

### T16 · Fleet pins on supplier selection `[UI]`
**Spec** §6.2 states 2–3, §6.6 · **AC** 75→82, 100 · Only that supplier's machines. Fill = availability
(green confirmed / red not), outline = in-offer vs owned-not-offered, readiness bar beneath, taxonomy
image with category → generic fallback (never broken), one selection ring. **Claimed units are never
drawn** — the shortfall is stated in the info box. A supplier with no locatable machines gets a stated
reason, not an empty map. Switching supplier clears the machine selection.

### T17 · Footer — re-host the shipped bar `[UI]`
**Spec** §6.1 · **AC** 31→36, 137→139 · The **existing** `DealRoom` bar, unchanged: same hero, same
per-unit toggle (`priceAll ? rate*units : rate`, default per-unit, none at units=1), same breakdown,
same `computeDealTotals` figures, same accept/`submitCounter` paths. **Do not port the prototype's gap
track.** Only change: `تفاوض` → **`اطلب سعراً أقل`**, and `عرضك المُرسل` → `عرضك لدى المورد`. Not
rendered at all with no selection.

**No-room case (D-A).** Most selected bids have `dealRoomId === null`, so `computeDealTotals(room)` has
no input. The footer then renders the **bid's own** rate / mob / demob / VAT with no status line and no
turn prompt; **negotiate** is the action that creates the room. Selecting a bid must never create one.

---

## S4 — Machine panel

### T18 · Panel shell — 3 tabs, sticky identity header `[UI]`
**Spec** §6.3.1, §6.3.4 · **AC** 83, 84, 140 · Thumbnail · `{model} · {spec}` · `{serial} · {year}`
(monospace, `dir="ltr"`) · **filled, saturated** availability chip (`#12904A` / `#C62A2A`, white text)
whose colour **equals that machine's pin**. Sticky across all tabs. Badges count **needs-attention**,
never totals. Company documents are tab 3 (§6.4 keeps the supplier panel for profile only).

### T19 · Offer composition bar `[UI]`
**Spec** §6.3.2 · **AC** 143→146 · Proportional segments with counts printed inside; zero buckets
**omitted**; unregistered is a **hatch** with the footnote that those units carry no serial, documents
or location and appear on neither map nor machine list.

### T20 · Machine chips `[UI]`
**Spec** §6.3.3 · **AC** 147, 148 · Serial (monospace/LTR) + year + availability dot. **Never
`وحدة N`.** No chip for unregistered units. Shown only when >1 registered machine.

### T21 · Availability & fit tab `[UI]`
**Spec** §6.3.5, §6.3.6, §6.9.3 · **AC** 119, 133→136, 141, 142, 149→151 · Photos **first**, then the
spec-match grid **scoped to the selected machine** (year and safety certificate from the *unit*), then
the two requests as **stacked full-width rows** under a lead-in saying both may be sent.
`اطلب تأكيد التوفّر` only when unconfirmed and **exactly once** in the panel; `اطلب معدّة أخرى`
always. **Do not build** the red mismatch banner, the two-tile status card, or the paragraph explainer.

### T22 · Document tabs `[UI]`
**Spec** §6.3.8, §6.7.2, §6.7.5 · **AC** 60, 61, 61b, 103, 116, 120, 152→158, 208→210 · Row = checkbox
· icon+status · name · expiry/meta · **`⤓` when present, `+ طلب` when absent**. Sticky `تحديد الكل`
bar and sticky footer. Selection keyed per tab **and per machine**. Ownership documents are listed and
**openable**. N ticked → **one** card. Already-provided interception with
*request-missing-only / request-all / cancel*, footer standing down while it is open. Multi-download
prompts separate-files vs one PDF — **merge option hidden** until implemented; one document never
prompts. Equipment tab re-scopes on machine change; company tab does not.

### T23 · Offer with no registered machine `[UI]`
**Spec** §6.3.7 · **AC** 178→181 · Explicit empty state naming the cause. **No photo strip and no
spec-match grid.** Company documents and chat still reachable — the **equipment rail button must still
render** or tab 3 is unreachable. One action: an `alternative` request with a null `equipmentId`.

---

## S5 — Requests, derived status, notices, chat

### T24 · Compose `rentee_request` `[CT][BFF][UI]`
**Spec** §6.7.1, §6.7.3, §6.7.4, §7.13.2 · **AC** 89, 90, 113, 116→118, 159, 182

Kinds: `availability` · `alternative` · `document` (`docTypes[]`). **`add_to_offer` is retired** — no
composer emits it, a received one is rejected. Card resolves image/name/serial **from `equipmentId` at
render time**, never from message text. **Draft and sent render through the same component.** The
"another machine" text names the **type**, and contains neither the serial nor `بدل`. Company scope →
null `equipmentId`, rendered under the supplier's identity. `ref` displayed on every card.

### T25 · Derived status — three layers `[CT]`
**Spec** §7.13.4 · **AC** 114, 115, 121→123 · Derivable kinds → **state answers and overrides any
echo**; `alternative` → the echoed `resolution`; neither → open. Recomputed every render, nothing
stored. `document` reads `1/3` from current `documentKeys`.
**W-B applies:** the `declined` path is fixture-tested only until the supplier client sends the echo.

### T26 · Notices `[UI]`
**Spec** §6.8 · **AC** 124→128, 160→166 · Filled bubble on the chat icon (blue; **amber for a
refusal**), `+N`, dismiss-then-reappear on a new arrival, tail pointing at the button. Transient popup
when a panel is open. **The chat button renders when an arrival is pending even with no supplier
selected.** Opening one supplier's chat clears **only his**. Triggered by the **state change**, not by
a message. Nothing fires while the chat panel is visible.

### T27 · Chat panel — one supplier, tabs per item `[UI]`
**Spec** §6.5 · **AC** 66→71 · Group by `supplierCompanyId` → `supplierId` → `supplierName`. **Tab key is
the BID, not the item** — one supplier can hold two bids on one item. Tabs only when >1 bid in the group.
**Switching tab must not move the map or the item selection.**

**A tab whose bid has no room is compose-only** (D-A): it renders an empty thread and the room is created
on **send**, not on open.

**Not "no backend work" — the connection is missing.** The web connects to Stream only at
`DealRoom.tsx:362`; this surface must connect too. Get the token from any bid that already has a
`dealRoomId` (the route is room-scoped, the token is user-scoped); with no rooms on the request there are
no channels to watch, so skip connecting. **`DealRoom.tsx:394`'s `disconnectUser()` must be
reference-counted or removed**, or opening a room and coming back kills this surface's connection.
Per-tab unread (AC-68) and the §6.8 bubble both depend on this.

### T28 · Render the supplier's reply echo `[CT][UI]`
**Spec** §7.13.4 layer 3 · **AC** 112, 127 · Extend the `ChatCard` union with the reply card
(`inReplyTo`, `equipmentId`, `resolution`) so a refusal is representable and colour-keyed the moment
the supplier side ships. Reader only in this slice.

---

## S6 — Off-platform on the new surface (independent of S3–S5)

### T29 · Bid list row `[UI]`
**AC** 194, 203, 204, 206 · «من خارج المنصّة» badge · **`city` where distance goes** (needs T7) · no
ETA/deals/verified tick · cheapest badge from the **rate**, never `grandTotal` · exempt from the band
filter · a converted submission appears **once**, as an ordinary bid.

### T30 · Rail + equipment panel `[UI]`
**AC** 197→199, 211→214 · **Two** buttons (`المعدّة والمستندات`, `عرض العرض المُقدَّم`); no chat, no
machine panel. Cert chips from `confirmations`, unverified callout, six tiles. **Em-dash, never
omit** (distance, fuel type). **Measurement and build year are the renter's own requirement** and must
be labelled so. No availability chip, readiness band, yard tile or spec-match grid — stated in words.

### T31 · Read-only bottom bar `[UI]`
**AC** 202, 215, 216, 222, 223 · Rate `قبل الضريبة`, total `شامل الضريبة`, **`التفاصيل` required** —
the only place mob/demob/VAT appear. **VAT = `total − subtotal`**, never `subtotal × 0.15`. No accept,
no counter — reason stated inline. Note VAT-inclusive via `hasVatInclusiveNote`; always display notes
through `stripVatInclusiveNote`.

### T32 · Wire the existing components, build nothing twice `[UI][T]`
**AC** 200, 217→224 · Host `SharedBidSubmissionModal`, `BidEquipmentModal`, `BidTermsModal`,
`QualityRing`. Score comes from `bid-quality.ts` (`qualityFromSubmission` / `qualityFromSubmissionItem`)
— **no second implementation**, mid band at **50**, company part excludes name and contact, equipment
part is bucket coverage, and it is **never** labelled trust or verification. Extend
`tests/unit/vat-inclusive.test.ts` and `bid-quality.test.ts` rather than starting new suites.

---

## Verification tickets — one per kind of proof

These are not optional polish. Each one answers a different question, and none of them substitutes for
another: unit tests prove the rules, integration proves the wiring, the visual pass proves the UI, the
spec pass proves we built what was agreed, and the regression pass proves we broke nothing.

### T38 · Frontend test coverage `[T]`
**Covers** every `web`-layer TC in §9 · **Where** `tests/unit/*` (vitest)

- Complete the TC list for web ACs: `bid-map.test.ts` (done — 56), plus `deal-room-docs.test.ts`,
  `deal-room-notify.test.ts`, `deal-room-cards.test.ts`, `off-platform.test.ts`, and extensions to the
  existing `vat-inclusive.test.ts` and `bid-quality.test.ts` rather than new suites.
- **This repo has NO component-test harness** — no `@testing-library`, no jsdom. So anything asserted
  automatically must live in a **pure function**. Rendered output is **manual-verify** and belongs to T41.
- **Deliverable includes an explicit manual-verify list** in the PR: every AC that no test can assert,
  named, with why. Adding a component harness is out of scope and would be its own ticket.
- **Given** the full suite **When** it runs **Then** it is green, and every web AC is either covered by a
  named test or appears on the manual-verify list. No AC is silently uncovered.

### T39 · Backend test coverage `[T]` ⚠ *Moedatech-App*
**Covers** every `app-backend` TC in §9 · **Where** `apps/backend/src/tests/...`

- Done in S1: `rentee.bidLocation.test.ts` (27), `rentee.offeredUnitsDetail.test.ts` (23),
  `bid.unitsOfferedOwnership.test.ts` (10), plus the **golden file** pinning bid-level `distanceKm`.
- Still needed: `supplier-fleet.test.ts` (T5 — AC-94/95/96, 232/233/234), `stream-cards.test.ts` (T6 —
  AC-91→93, 104→112, 205), the T37 yard-ownership cases, and `get-request-submissions.test.ts` (T7).
- **`npx tsc --noEmit` is not clean at baseline** — 91 pre-existing errors in `apps/backend`, which is why
  the repo ships `.typecheck-baseline.json` + `scripts/typecheck-ratchet.mjs`. **Prove 91 → 91, none new,
  none moved**, rather than claiming a clean typecheck.
- Two suites fail at baseline (`deal-room-negotiation.test.ts:296`, `profile.service.test.ts`). **Prove
  they are pre-existing** by reverting your files and re-running — do not fix them here.

### T40 · Integration & end-to-end `[T]`
**Depends on** T5 being **deployed to staging** — without it the map has no pins.

- Point the web at the deployed staging backend and walk the real flow: open a request → switch to map →
  select a bid row → fleet pins appear → select a machine → panel opens on the right machine → compose a
  request card → send → **a deal room is created only now** (D-A) → refetch shows the state change.
- Assert the **contract** end to end, not the UI: `locationSource` arrives, per-unit `distanceKm` is
  present, a foreign `equipmentId` contributes no machine (T2), ownership documents carry usable urls
  (T4), `city` reaches an off-platform row (T7), unread counts come from `/api/me/deal-rooms`.
- Use the `smoke-test` skill in `Moedatech-App` for the API sweep (it encodes the verified auth path and
  the gzip/idToken traps); drive the web with a dev server.
- **Given** a real request with a mix of native and off-platform bids **When** the flow is walked **Then**
  no 5xx, no silent nulls where a field is specced, and every figure on screen traces to a payload field.
- **Explicitly expected to FAIL, and that is the correct result:** AC-64, AC-97, AC-114, AC-115 (blocked on
  the deferred mobile gate, O-1) and AC-121 (needs the supplier echo, O-2). Record them as blocked, not
  as passes.

### T41 · UI validation against the prototype, exactly `[UI]`
**Reference** `design.md` (distilled values) + `prototype/*` (the receipts)

- **Side by side, same viewport, same locale.** Open the prototype and the built surface at identical
  widths and screenshot **both** for every surface: bid panel, row states (idle / hover / selected /
  cheapest / just-arrived), pin (in-offer confirmed / in-offer unconfirmed / not-in-offer / selected),
  rail (each presence state), drawer (each of the three tabs, plus maximised), composition bar, colour
  key, chat bubble, toast, empty states.
- **Check the enumerated values**, not the impression: geometry, spacing, radii, shadows, font sizes,
  weights, animation names and durations, z-index order, and the **four**-state match-grid palette
  (`ok`/`bad`/`claim`/`na`).
- **Both directions.** RTL is the default; also confirm the LTR shell does not swap the bid panel and the
  drawer (the prototype uses physical `left`/`right` on an RTL page — see `design.md` §1).
- **Verify the six do-not-copy items are absent**: the prototype's price bar, `rDistFilter`, `ghostIcon`,
  `rUnitPickModal`, the `terms` route, a floating `mapLegend`.
- **Given** every surface **When** both are screenshotted **Then** the pair is attached to the PR and any
  deliberate difference is listed with the AC or decision that authorises it. An unexplained difference is
  a defect, not a variation.

### T42 · Product & spec alignment `[docs]`
**Run once per slice**, and again before the PR.

- Reconcile the spec against what was actually built: anything that shipped differently gets the spec
  **updated or the code changed** — never left disagreeing. Add a §11 changelog row per reconciliation.
- **Open items this ticket must close:** the five UI conflicts in `design.md` §7 (availability hexes, pin
  label wording, the pin's numeric index badge, emoji vs taxonomy image per AC-80, and «المؤجّر» vs
  «المورد»); §7.2's residual `ownershipDocs` field (`:1203`, `:1224`) which §7.14 withdrew at `:1632`;
  whether `contact_info` is projected (a code comment documents the opposite decision); TC-17's `'dist'`
  vs the implemented `'nearest'`; and whether a **converted** bid uses the off-platform composition bucket
  (AC-198 vs AC-203).
- **Re-run the coverage audit** (`coverage.md`): every live AC still maps to exactly one ticket or one
  exclusion, with no orphans introduced by the slices.
- **Given** the spec and the built behaviour **When** they are compared **Then** they agree, or the
  disagreement is a dated, deliberate entry in §11 — not a silent drift.

### T43 · Regression & conflicts with existing code `[T]`
The riskiest ticket, because these changes touch contracts that shipped surfaces already read.

**Web — every consumer of what S2 changed:**
- `bidSuppliers` / the new `bidSupplierKey`: the supplier chips and counts in `GroupBids` (`:619`, `:640`)
  now group by **company**. A firm with two members' bids will show **one** chip where it showed two —
  verify the count matches the rows the filter then yields.
- `mapBid`'s new fields: `BidComparisonWorkspace` (2160 lines), `RequestBids`, `CompareBids`,
  `SharedLinkBidCard`, the quotation builder, and the export templates all read `BidCard`.
- `computeBidReadiness` consumers: `GroupBids:951`, `BidComparisonWorkspace:665`, `RequestBids:374` —
  unchanged behaviour expected, since the per-unit function was only exported, not altered.
- `submissionToBidCard` / `agent-bids` now set `supplierCompanyId: null` — confirm no grouping regressions
  on off-platform and uploaded-quote rows.

**Backend — the payload is shared:**
- **`distanceKm` must not move for any existing bid** — the golden file is the proof (AC-09).
- **Mobile reads the same `getBidList`** (§7.10). Every field is additive; confirm the Flutter client
  tolerates the new keys and that `offeredUnitsDetail` rows losing a foreign machine (T2) degrade
  gracefully in the app's 018 readiness section, which derives `readyCount / total` from that array.
- `getBidDetail` shares the resolver — verify both surfaces, not just the list.
- Run both full suites and prove the ratchet is unchanged.

**Given** the shipped surfaces **When** the full suites and a manual pass over list view, compare,
deal room and inbox run **Then** nothing behaves differently except where an AC required it, and every
intentional behaviour change is named in the PR (notably: fewer identified units on bids that referenced a
foreign machine, and company-grouped supplier chips).

---

## Defects in the shipped web app, found during the audit — fix as their own tickets

### T33 · Rail presence rules `[UI]` — *orphaned AC group, no ticket existed*
**Spec** §6.2, §6.8.3 · **AC** 82, 174, 175, 176, 177

- **No supplier selected and nothing pending → the rail is absent entirely.** No dimmed buttons (AC-174).
- Supplier selected, no machine → **chat only** (AC-175); machine selected → the **equipment** button
  appears (AC-176).
- **Chat is unavailable before a supplier is selected** (AC-82) — there is no counterparty and no room.
- **Switching supplier clears the machine selection** (AC-177) — a choice never carries across fleets.
- For an **off-platform** submission the rail is two different buttons (§6.13.6) — see T30.

Verified against the prototype's `rRail()`, which matches this exactly, including the unread badge on the
chat button.

### T34 · **BUG** — the submission breakdown's VAT can't sum to its own total `[UI]`
**Spec** §6.13.9 · **AC** 216 · **File** `src/components/requests/SharedBidSubmissionModal.tsx:415`

Today: `VAT 15%` is rendered as `sub * 0.15`. The submission stores an **already-rounded** `total`, so a
recomputed VAT line can disagree with it — the breakdown's rows then don't add up to the figure the
supplier actually sent.

- **Given** a submission whose stored `total` is not exactly `subtotal × 1.15`
  **When** the breakdown renders
  **Then** VAT reads **`total − subtotal`**, and `subtotal + VAT === total` for every fixture.
- Extend `tests/unit/vat-inclusive.test.ts` (11 tests already pass) with a rounding fixture.

Independent of RMAP — a renter sees this today. Small enough to ship on its own.

### T37 · **SECURITY** — a per-unit `yardId` is never ownership-checked `[BE]` ⚠ *blocks the S1 merge*
**Spec** §7.2, §7.2.1 · **New** — found while implementing T1/T2

The bid's **own** `yardId` is ownership-checked on submit (`bid.service.ts:198-204`, `YARD_OWNERSHIP`) and
on edit (`:533-539`), with a comment naming the attack exactly: *"a competitor's yard (its name + GPS +
city surface on the rentee's bid card, spoofing location)."*

**`unitsOffered[].yardId` has no such check**, and T1's new read-side lookup is tenant-scoped only:

```ts
prisma.yard.findMany({ where: { id: { in: yardIds }, tenantId }, ... })   // rentee.service.ts:702-704
```

So a supplier can attach a **competitor's yard** to a machine he legitimately owns, and the renter's map
will plot that machine at the competitor's yard — name, city and coordinates — and colour it **green**,
because `unit_yard` is precisely the state that means *confirmed*. T1 turned a bid-card text leak into a
**confirmed pin**, which is strictly worse than the hole the codebase already guards at bid level.

- **Write side:** extend `assertOfferedUnitsOwned` to collect `entry.yardId` too and `count` them with
  `ownerScopeWhere(...) + tenantId`, throwing the existing `YARD_OWNERSHIP`. Both endpoints.
- **Read side:** select the yard's owner columns in the batched query and, at assembly time, **drop a
  foreign yard's `unit_yard` resolution and fall through to the next precedence level** (`bid_pin` →
  `bid_yard` → `listing_yard`) — **not** to `none`. The machine is legitimate; only the claimed yard is not.
- **Given** an entry naming a yard the bidding supplier does not own **When** the renter's payload is built
  **Then** no yard name, city or coordinate from it appears, and that unit resolves one level lower.

### T44 · **BUG** — a renter gets a 404 on their own trial request's fleet `[BE]` ⚠ *Moedatech-App*
**Found while implementing T5** · **Files** `feed.service.ts:249-251`, `supplier-fleet.service.ts:98`

`getMatchedFleet` refuses trial requests outright:

```ts
// mobile/016 (#355) — trial sandbox requests must stay invisible to real
// suppliers; don't expose matched-fleet for a trial request.
if ((request as any).isTrial) throw new AppError(ERROR_CODES.REQUEST_NOT_FOUND);
```

That guard is about **suppliers**. T5's renter-facing fleet endpoint reuses the same matching rule — correctly, so both sides agree on what "qualifying" means — and therefore inherits the guard. So a renter opening the map on **their own trial request** gets a 404, even though trials carry real sample bids and the whole point of a trial is to walk the product.

The renter path has already proven ownership before it gets there: `supplier-fleet.service.ts:90` runs
`canAccessRequest(request, renteeId)`. So the guard is answering a question that path already answered.

- **Fix:** give `getMatchedFleet` an opt-in `{ allowTrial }`, passed **only** from the renter-facing
  caller. Supplier-facing behaviour must stay byte-identical — do not fork or weaken the matching rule.
- **Given** a renter on their own **trial** request **When** the fleet endpoint is called **Then** it
  returns that supplier's qualifying machines instead of 404.
- **Given** a **supplier** calling `getMatchedFleet` for a trial request **Then** it still throws
  `REQUEST_NOT_FOUND` — the sandbox stays invisible to real suppliers (mobile/016 #355).

### T36 · The shipped list view has the defect §6.10 was withdrawn for `[UI]`
**File** `src/components/requests/GroupBids.tsx:628`

```ts
(!(refineActive && fKm) || (b.distanceKm != null && b.distanceKm <= 50))
```

A "within 50 km" refine toggle filtering on the **bid's** distance — the exact reason the distance filter
was dropped (D-C): a bid measuring 180 km can belong to a supplier owning a machine 12 km from the site,
so the toggle hides the offer the renter wanted. It is on the shipped list view, not the map.

**Given** the withdrawal of §6.10 **When** this toggle is reviewed **Then** it is removed with T14 rather
than left as the only surviving distance filter in the product. Confirm with product first — it ships
today, so removing it is a visible change.

### T35 · Absent company fields read as a bare em-dash `[UI]`
**Spec** §6.13.7, §6.13.8 · **AC** 218 · **File** `SharedBidSubmissionModal.tsx:520-527` (`RoField`)

`RoField` renders `value || "—"`. §6.13.7's convention is em-dash **in a tile**, **«— غير مُدخل»** in a
key/value **row** — and the company block is rows (CR, VAT, national address, contact, valid-until).

- **Given** an absent company field **When** the modal renders **Then** the row reads «— غير مُدخل»,
  never a bare dash and never blank.
- Leave tile rendering unchanged; this is the row variant only.
