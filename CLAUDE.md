# Web-App — agent notes

## Change log

- **2026-09-06 - The fast lane calls an unplaceable machine no-match, as the full path always did.**
  Owner: *"with project settings it doesn't behave the same as if it's plain text"*. A project routes
  a short line to Tier 0/1 (`decideTier`), and `quickItemsToDraft` built every item from
  `newManualItem`, whose seeded verdict is `needs-validation`. So «jeep truck» with a project drew an
  empty «Needs your OK» row demanding a subtype the catalogue does not have - no name box, no way
  past the gate - while the same sentence WITHOUT a project took the full path, was called
  `no-match` by `deriveVerdict`, and let the renter name the machine. The fast lane now derives the
  same verdict: no subtype id ⇒ `no-match`.
  Files: `src/lib/agent/quick-draft.ts`, `tests/unit/agent-tier.test.ts`.
  Trap: the SUBTYPE is the test, not the whole ref. A resolved subtype with an open size is the
  ordinary «pick a size» state and must keep `needs-validation` - reading the whole ref would have
  turned every size question into an off-catalogue line.
  ⚠️ Same shape as the 2026-08-31 cert bug on this file: *detected without a project, lost with one*.
  When a report says «with a project it behaves differently», look at this lane first - it is the one
  a project turns on, and it reconstructs the draft from a narrower payload than the full path.

- **2026-09-06 - Back on the create flow walks the flow before it leaves it.**
  On the review screen Back was `<PageBack fallback="/">`, so it left the page for wherever the
  renter had been — usually the requests workspace, since that is where a request is started from.
  The review is not a page he arrived at; it is the last step of the one he is standing on. Back now
  walks the store's own three-stop chain: review → canvas → «Your request» → out (to the trail).
  Files: `src/components/create/CreateBack.tsx` (new), `src/app/create/page.tsx`,
  `tests/unit/create-back.test.tsx`.
  ⚠️ **Register ONCE.** The first cut called `usePageBack(null)` and rendered `<PageBack>` beneath it
  for the leave case; child effects run before the parent's, so `PageBack`'s spec landed first and the
  parent's `null` overwrote it — the page drew no Back control at all, silently. Both cases go
  through one hook now, and the value decides which.

- **2026-09-06 - «Next equipment» now refuses on the site, the schedule and the charged days.**
  On a multi-item request the renter could walk from machine to machine without naming the site,
  the dates or acknowledging the billable days, and only met that bar at «Review & send». Those three
  are REQUEST-WIDE - one address, one schedule, one acknowledgement for every machine - so they are
  owed before the second machine, and the second machine's own transport questions are decided by the
  site he has not named yet. Same refusal as review: open the panel, shake it, shake the button.
  Files: `src/components/create/Canvas.tsx`, `tests/unit/canvas-multi-item.test.tsx`.
  ⚠️ Only the request-wide gaps (`where` / `when`) gate the move. Conflating the two bars is what
  deadlocked this flow once before - requiring the WHOLE draft to reach the next machine is a trap,
  because items 2-5 can only be answered by getting past item 1 - and the note above `advance()`
  records it. Another machine's gaps still never block.

- **2026-09-06 - Off-catalogue equipment is ON by default, and its support link is small and plain.**
  The feature shipped behind `NEXT_PUBLIC_CUSTOM_EQUIPMENT=1`, so the deployed app still drew the OLD
  red «it won't be included» card with no name box and no taxonomy selects - which is exactly what the
  owner screenshotted. The backend went live and was verified end to end the same day (absent id keys
  accepted; `null` ids and a partial triple both 422), so the flag flipped to the PUBLIC_WEB_ENABLED
  shape: on unless `=0`. «Message Us On WhatsApp» is «Message us», at `size="sm"` - the route into the
  catalogue, not the way out of the request.
  Files: `src/lib/flags.ts`, `.env.example`, `src/components/create/MachineCard.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/{canvas-no-match,gates,machine-card}.test.*`.
  Trap: three suites encoded the flag-OFF behaviour as if it were the only behaviour.
  `canvas-no-match.test.tsx` is now explicitly the KILL-SWITCH suite (imports its tree after setting
  `=0`), and `gates.test.ts` states the new rule: an unnamed off-catalogue row raises
  `customEquipmentMissing` PLUS the year and certificate gates, because those two answers are posted
  for it and shown to the supplier.
  ⚠️ A flag read at module load cannot be flipped by a test's `beforeEach` - the import has already
  happened. Every case that needs the other state re-imports the tree behind `vi.resetModules()`, and
  the render ones need a 20s timeout because of it.

- **2026-09-06 - Trial requests are hidden on the web, and an off-catalogue row says so in orange.**
  Owner: *"no trial request on the web for now"*, and the no-match row must warn rather than refuse.
  `TRIAL_REQUESTS_ENABLED = false` (a code toggle, not an env var - it is a product decision, not a
  per-environment one) hides the first-request Trial/Real pop-up, the amber trial ribbon, and stops
  `isTrial` reaching the wire. `?mode=trial` is now READ AS REAL rather than honoured, so a bookmarked
  link cannot create a trial, and a persisted draft carrying `isTrial` from before cannot post one.
  The off-catalogue row is a warning (orange, `warning` glyph, «This equipment type isn't available
  yet» + what the renter can still do) instead of the red error, and the edit modal can now change the
  machine's NAME.
  Files: `src/lib/flags.ts`, `src/components/home/CtaBanner.tsx`, `src/app/create/page.tsx`,
  `src/components/CreateSurface.tsx`, `src/lib/store/rfq-store.tsx`,
  `src/components/create/MachineCard.tsx`, `src/components/requests/RequestEditModals.tsx`,
  `src/lib/i18n/{en,ar}.ts`.
  Trap: `step2.noMatch.explainer` was reworded to the new promise and put back. It is the FLAG-OFF
  wording and it is true only there - with `CUSTOM_EQUIPMENT_ENABLED` off the item really is dropped.
  The two states need two sentences; `machineCard.notInCatalogue*` carries the other one.
  Trap: the edit modal built its item patch behind `if (it.categoryId && it.subtypeId &&
  it.capacityId)`, and an off-catalogue line reads those back as the EMPTY STRING - so every equipment
  edit on such a request (quantity, operator, fuel) appeared to save and sent nothing at all. It now
  sends the item with `customEquipmentName` in place of the ids.
  ⚠️ **Backend, unconfirmed**: `PATCH /rentees/me/requests/{id}` accepting an item with
  `customEquipmentName` and no ids has NOT been verified - the deployed contract covered create,
  reads and the bid form only. If it refuses, editing an off-catalogue request 422s visibly in the
  modal rather than failing silently, which is the better of the two.

- **2026-09-06 - Back returns to the VIEW, not just the page; and «offline» stopped meaning two things.**
  (1) The workspace kept its chosen request and open tab in component state alone, so leaving for
  `/bids/<id>/equipment` recorded `/requests` on the trail - which means "whatever this component
  picks by default": the newest request, on Cards. Back from the equipment map therefore landed on a
  different request's cards. The selection is in the URL now (`?r=<itemId>&tab=compare`, written with
  `replaceState` so the browser's own Back still leaves the page rather than walking the rail), the
  entry reader restores the tab, and `AppShell` records `pathname + search` on the trail instead of
  the path alone.
  (2) «Offline» was this app's word for a lost connection AND its label for a bid that came through
  the renter's shared link. Renamed on the BID CARD only, at the owner's second instruction the same
  day (*"for filter keep as before, even offline invite keep it"*): the card - and the dashboard rail
  row, which is one bid - now say «Via your link» / «عبر رابطك», while the source FILTER, the
  comparison's «Offline · invite ↗» supplier line and the details count keep the word the renter has
  been reading for weeks.
  Files: `src/components/workspace/RequestsWorkspace.tsx`, `src/components/AppShell.tsx`,
  `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`, `tests/unit/source-wording.test.ts`.
  Trap: `{offline}` survives as a PLACEHOLDER name inside `bidsSplit` - the guard strips `{…}` before
  judging the sentence, and keeps a control asserting "You appear to be offline" still exists.

- **2026-09-06 - The nav bar wore the wrong navy, and now nothing paints outside the palette.**
  Measured Supplier OS's own header rather than guessing: background `#1c2738` (`--navy-deep`, the
  token file's `ink-deep`), 46px tall, tabs at 12px/500 in white at 70%. This bar was `--navy`
  (`#22384e`) - the INK, one step lighter - with 13px/600 tabs, which is why it still read as another
  product after the palette landed. Bar and type now match; the ACTIVE white pill stays (owner's own
  reference, 2026-08-26) and the height stays 52px, because this row carries a 34px avatar, bell and
  inbox that the OS's does not.
  Files: `src/components/AppShell.tsx`, `src/components/AppNav.tsx`, `tests/unit/palette-drift.test.ts`.
  ⚠️ The OS's tabs are weight 500 and this design system has three weights (400/600/800, lint-
  enforced). The resting tab takes `font-normal` at white/75 rather than inventing a fourth.
  Also: the drift guard now scans every `src/**/*.{ts,tsx,css}` for a raw hex, comments stripped -
  exempt are `globals.css`, `ds-colors.ts`, the staging-only `UiPins` overlay, and two third-party
  marks (WhatsApp `#25d366`, Google Play `#ffcd00`).

- **2026-09-06 - The palette was bound but not USED: 330 raw colours in six stylesheets.**
  `docs/design-tokens.md` is byte-identical to the file the owner handed over, and every hex in it was
  already in `globals.css` (verified: 84 of 86, the two misses being the OS's own legacy `--color-ok`
  alias). The app still did not look like Supplier OS because the prototype stylesheets - map, panel,
  request cards, deal room, requests, comparison - carried their own palette from before the tokens:
  navy `#16304f` against the token's `#22384e`, a blue `#2563eb` the OS palette does not contain, and
  a bluish grey ramp where the OS is neutral. All 330 now read `var(--token)`.
  Files: the six `*-proto.css` / `request-card.css`, `docs/design-tokens.md`,
  `tests/unit/palette-drift.test.ts`, plus seven colour assertions in existing tests that pinned the
  raw hexes and now pin the tokens.
  ⚠️ Exempt on purpose: `#25d366` (WhatsApp's green, on the button that opens WhatsApp) and the
  Google Play mark's `#ffcd00`. Someone else's brand is not one of our states.
  ⚠️ `--action` (#1a7ec8) stays out of the palette and must not fold into `--info`: RM3-AC-33 says the
  ask is blue and never navy, and this palette has no true blue.
  Trap: a token file cannot be the source of truth while a stylesheet holds its own copy of the
  answer, and nothing catches it - no test fails, the screen is merely the wrong colour. The new
  guard reads the stylesheets, not the render.

- **2026-09-06 - A machine the catalogue cannot place can be NAMED by the renter, and posted.**
  A `no-match` line was drawn and then dropped (`postableItems`), so a renter whose only machine is
  off-catalogue could not send a request at all, and the row promised "it won't be included". Now the
  taxonomy trio STAYS on screen (unstarred, so a renter who can find his machine still can) with a
  free-text name under it, seeded from `rawLabel` - his own words from his RFQ, so an untouched line
  is already named - and the line posts carrying `customEquipmentName` and NO taxonomy ids. Reading
  back, every surface branches on the backend's derived `isUndefined` flag, never on the ids.
  Files: `src/lib/flags.ts`, `src/lib/contract/gates.ts` (`isCustomLine`, `customName`),
  `src/lib/contract/draft.ts`, `src/lib/contract/app.ts`, `src/lib/api/app-adapters.ts`,
  `src/components/create/MachineCard.tsx`, `src/components/create/Canvas.tsx`,
  `src/lib/contract/{requests,request-fields,sibling-tabs,inbox,deal-room,bid-map}.ts`,
  `src/lib/draftBidForm.ts`, `src/lib/i18n/{en,ar}.ts`, `tests/unit/custom-equipment.test.ts` (new).
  Contract: `docs/plans/custom-equipment-request/web-app-changes.md`, written by the backend.
  Trap: the three ids are OMITTED from the body, never sent as `null` - they are `.optional()` on the
  backend, not `.nullable()`, so an explicit null 422s where an absent key passes. And ALL THREE go or
  none do: a no-match line can arrive with a category id and no subtype (`deriveVerdict`), and a
  partial triple is refused on purpose. The test asserts `"categoryId" in item === false`, because
  `=== undefined` passes for a key that is present and null.
  Trap: `customName` reads `customEquipment ?? rawLabel`, with `??` and never `||` - clearing the box
  stores `""`, which is an ANSWER ("I have not named it") and must block, not fall back to the seed
  and silently re-name the machine the renter just cleared.
  ⚠️ Behind `NEXT_PUBLIC_CUSTOM_EQUIPMENT` (default OFF) and INERT until the backend is deployed:
  `POST /agents/requests` still 422s an item with no ids. With the flag off every no-match line keeps
  its old behaviour to the letter, which is what `canvas-no-match.test.tsx` still pins.
  ⚠️ Such a request reaches NO supplier by broadcast, and DIRECT is no exception - the share link is
  the only supplier-facing route, which is why the row's copy now names it.

- **2026-09-05 - The compare table's phantom vertical scrollbar, for the second time.**
  The matrix was made to render at full height with the PAGE carrying it (2026-09-04), and a 130px
  scrollbar came back inside it anyway - over a screen with half a page of empty space beneath. Not a
  layout regression: `overflow-x-auto` alone is not "scrolls sideways". CSS computes the OTHER axis
  from `visible` to `auto` as soon as one axis scrolls, so any child overhanging the column strip gave
  it a scroller of its own. The child was the money breakdown («How every cycle after is built»), an
  absolutely-placed 200px panel hanging out of a 144px strip. It is drawn in a PORTAL now, measured
  against its column header and re-placed on scroll (capture: true, so the strip's own sideways
  scrolling counts) and resize; the strip states `overflow-y-clip` beside its `overflow-x-auto`.
  Files: `src/components/workspace/CompareMatrix.tsx`, `tests/unit/compare-matrix.test.tsx`.
  ⚠️ Same CSS trap as the dashboard's bid rail the day before. If a third surface grows a scrollbar
  nobody asked for, look for a single-axis `overflow-*-auto` before looking at heights.
  Also: on the LAST money column that panel was being clipped by the horizontal scroller rather than
  overhanging it - nobody had reported it, and the portal fixes it in the same move.

- **2026-09-05 - The dashboard's notification bubble is one line, and its ✕ survives a new login.**
  It was a 268px card - title row, two clamped lines of body, a «+n more» footer - hanging from a
  sticky header, so four lines reached the hero and covered the Create-request button the page exists
  to offer. Now a single 34px strip (dot · title · «+n more» · age · ✕) with the BODY dropped (the
  bell holds the sentence), hung from the bell's TRAILING edge instead of centred on it, because a
  wide strip centred on the bell grows back across the middle of the hero.
  Files: `src/components/home/HomeNotificationBubble.tsx`, `tests/unit/home-bubble.test.tsx`.
  Trap: ✕ used to write the id to `sessionStorage`, which looks identical on screen and is gone by
  the next sign-in. It marks the notification READ now, through the endpoint the bell's own rows use
  - the only dismissal this product can make stick, since the flag is the renter's and server-side
  and the strip only ever raises unread rows. The local note stays as the fallback for a failed call
  and moved to `localStorage` keyed by ACCOUNT, so a shared browser cannot hide one renter's
  notification behind another's dismissal.

- **2026-09-05 - The dashboard's bid rail shows off-platform bids, the machine asked for, and the price's basis.**
  Three owner notes on one card. (1) The rail read `fetchReceivedBids` only, the app's own projection,
  so a request whose offers all arrived through the renter's shared link said "no bids yet" while the
  workspace listed three. There is no "all my submissions" endpoint on the agents service, so the
  rail fans out `fetchRequestSubmissions` over the renter's groups - one call per GROUP (the endpoint
  resolves the whole fan-out from any of its request ids), capped at 20, and shared with the deadline
  lookup through a memoised `loadSubs` so the extra source costs no extra round trip on a row the
  table was already dating. (2) The machine is the REQUEST's subtype + size ("Crawler excavator · 20
  ton"), not the supplier's listing ("Caterpillar 320") - `InboxBid.equipment` carries it now, off
  `subtypeName`/`capacityName`, which the projection already sent and the mapper dropped. (3) The
  price carries its basis (`/ month`), reusing `t.store.per*`.
  Files: `src/components/home/HomeRequests.tsx`, `src/lib/contract/inbox.ts`,
  `tests/unit/home-bid-rail.test.tsx`.
  Trap: the fan-out effect first guarded on `status === "authed"`, which is stricter than the
  neighbouring received-bids read (`status === "loading"`). `SessionProvider` revalidates over
  `fetch` a tick after mount, so on any surface where that read resolves anon the rail silently
  showed the app's bids and dropped the same renter's link bids. Both guards are the same shape now.

- **2026-09-05 - A document ask on the map names the PAPER, not "safety certificate".**
  `equipmentAskType` sent `tuv` and `spsp` precisely and every other certificate as
  `equipment_safety_certificate`, which the chat card renders as «Safety certificate» - so a renter
  ticking SASO or the equipment insurance asked the supplier for a category. The coarseness was
  correct when written (one unknown type 400s the whole ask, and the catalogue could not be checked
  from this repo) and stopped being correct on 2026-08-12, when the backend began judging an ask
  against the LISTING vocabulary too (`apps/backend/src/services/utils/document-type.ts`,
  `ASKABLE_DOCUMENT_TYPES`). Now: `tuv` · `spsp` · `saso` · `insurance` by name; ownership papers
  already named themselves.
  Files: `src/components/map/panel/machine-panel-model.ts`, `src/lib/contract/rentee-request.ts`,
  `src/lib/contract/request-card.ts`.
  Trap: `aramco` is still sent coarsely ON PURPOSE - a request may require it and the platform can
  file it nowhere (absent from `EQUIPMENT_CERT_TYPES` and from the seeded catalogue), so naming it
  would 400 the renter's most ordinary act. Needs a backend row before the map can carry it.
  Also: `canonicalDocType` now folds the SASO CERTIFICATE's spellings (`saso` / `saso_cert` /
  `saso_inspection` / `saso_technical_inspection`) onto one name, exactly as the backend does, so an
  ask for the certificate can be answered by the certificate. `saso_registration` is ownership and is
  deliberately never folded.

- **2026-09-05 - The dashboard has one gap between its blocks again.**
  `My Suppliers` and `My Projects` each carried `pb-24` on their EMBEDDED root, written back when
  each was the last block on the page. With both stacked, the middle one's 96px landed on top of the
  hub's 28px `gap-7` and the page had a hole between two sections and normal spacing between the
  rest. Rule now: an embedded block owns the space inside it, the page owns the space between and
  after, so `HomeHub` carries the bottom room (chat dock, truncated-looking last row).
  Files: `src/components/home/HomeHub.tsx`, `src/components/projects/ProjectsSurface.tsx`,
  `src/components/suppliers/SuppliersPage.tsx`, `tests/unit/dashboard-spacing.test.ts`.
  Trap: it fails silently - nothing throws and no unit test noticed, it only shows on a screenshot,
  which is why the new test asserts it against the source.

- **2026-09-04 — The bid form reads `"On Supplier"`, not just `"Supplier"`.**
  `GET /public/bid-form/{token}` changed its VALUES on 2026-09-02 (app `c304828a`), not only its
  labels: `deliveryBy`, `returnBy` and `requiredTerms.fuel` gained an `"On "` prefix. Six web readers
  compared the two old words exactly, so the new spelling fell through to the branch meaning *the
  other party* — the pricing row took the delivery input away from the supplier who owns the leg and
  the submit payload sent `amount: 0` for it. One `partyToken()` strips the prefix and nothing else,
  because the draft preview path still emits the bare tokens and both must keep working.
  ⚠️ **It is not only the bid form.** The same commit prefixed the deal room's and the quotation's
  cost-responsibility values (`quotation.service.ts`, `term-matching.ts`: `SUPPLIER` → `On Supplier`,
  and the Arabic → «على المورد»), so `valText`, `bid-quotation`'s `maint` and `DealRoomTerms` needed
  the same treatment. A substring test survives the change; an equality test does not, which is why
  `comparison.ts`'s regex readers were already safe and these three were not.
  Files: `src/lib/contract/labels.ts`, `src/app/bid/[token]/BidFormClient.tsx`,
  `src/lib/bidCardModel.ts`, `src/components/requests/SharedBidSubmissionModal.tsx`,
  `src/lib/contract/deal-room.ts`, `src/lib/quotation/bid-quotation.ts`,
  `src/components/deal-room/DealRoomTerms.ts`.
  ⚠️ It is display text arriving where a token was expected. If the backend can move the "On " to its
  label layer instead, ask for that — the same trap fires on the next rename.

- **2026-09-04 — Overtime is hidden everywhere, and no longer written as `'0'`.**
  Neither side is asked for an overtime rate since the app retired it (`2b095d63`): the supplier's row
  went, `submitBid` made the field optional, and `overtime_rate` joined the T3 keys a bid need not
  declare. The web hid the renter's picker, the review tile, the deal-room row and the edit-modal
  field, keeping the state and the option list so an older request still reads back. It also stopped
  sending the default: `"without"` mapped to the string `'0'`, which is TRUTHY, so it read back as a
  rate — the app's quotation printed "Overtime 0 SAR/hr" and its deal room raised a permanent phantom
  conflict on a term nobody was asked about.
  ⚠️ **Nine surfaces, not four.** The four obvious ones (picker, review tile, deal-room row, edit
  modal) left it rendering on the bid card's contract bucket and the comparison's negotiable set
  (`bids.ts:693/704`), the comparison's cost responsibilities, the workspace compare matrix, the
  offline-bid modal's fallback rows, and — found last, and the worst of them — the QUOTATION's price
  extras (`deal-room.ts:794`), where `'0'` is truthy AND matches the numeric test, so the document
  printed «سعر العمل الإضافي: 0x». Grep for the term; do not reason about where it "should" appear.
  That one NORMALISES rather than hides: a quotation is a historical document, so a request that
  genuinely agreed 1.5x must keep saying so.
  Files: `src/components/create/WhenPanel.tsx`, `src/components/create/ReadyToSend.tsx`,
  `src/components/deal-room/DealRoom.tsx`, `src/components/requests/RequestEditModals.tsx`,
  `src/lib/api/app-adapters.ts`, `src/lib/contract/bids.ts`, `src/lib/contract/comparison.ts`,
  `src/lib/contract/deal-room.ts`,
  `src/components/workspace/CompareMatrix.tsx`,
  `src/components/requests/SharedBidSubmissionModal.tsx`.

- **2026-09-04 — Fuel TYPE is no longer shown to a supplier; fuel RESPONSIBILITY still is.**
  Two different facts under one word. `fuelType` is the renter's `fuelTypePreference`, which the
  system prefills (owner, 2026-09-03, when the same chip left the item pills), so asking a supplier to
  confirm a value nobody chose added a row and settled nothing. Dropped from both forms' `TERM_KEYS`,
  from the bid-quality score (a term never shown cannot count against an answer) and from the review
  table. `fuel`, who pays for it, is untouched, and `fuelTypePreference` is still stored and matched.
  Files: `src/app/bid/[token]/BidFormClient.tsx`,
  `src/components/requests/SharedBidSubmissionModal.tsx`, `src/lib/contract/bid-quality.ts`,
  `src/components/create/ReadyToSend.tsx`.

- **2026-09-04 — Digits are Latin everywhere, Arabic included.**
  Owner, via the app (`1aabf6db`): *"the numbers should be in eng even in arabic"*. Three converters
  stopped converting (`arabicIndicDigits`, `arDigits` in two files, `distanceDigits`, which also lost
  the Arabic decimal separator U+066B), and the Arabic strings that hard-coded «٢٤ ساعة» were swept.
  A `latinDigits()` normalises what is NOT ours to sweep — `t3_platform_defaults.options` and
  `getBidForm`'s `valueAr` are rows in a live database — at the one place they are rendered, which is
  what the app's `latin_digits.dart` does. The same pass started reading `labelAr` / `valueAr`, added
  by `c304828a` and dropped by the web until now, so an Arabic supplier stops reading those rows in
  English.
  Files: `src/lib/contract/bid-map.ts`, `src/lib/contract/labels.ts`, `src/lib/contract/link-bids.ts`,
  `src/components/map/PriceFooter.tsx`, `src/components/map/panel/machine-panel-model.ts`,
  `src/lib/i18n/ar.ts`, `src/lib/pricing/rental.ts`, and 12 more.
  ⚠️ **Character classes are not display text.** The sweep turned `[\d٠-٩]` in `requests.ts`'s
  postcode regex into `[\d0-9]`, which would have stopped stripping postcodes from Arabic addresses.
  Addresses ARRIVE from the backend and may carry either numeral system whatever our own UI prints.

- **2026-09-04 — The login code can be filled by the browser on Android, not only iOS.**
  `autoComplete="one-time-code"` was already on the first box, which is the iOS half. Android needs
  the WebOTP API, so `CodeEntry` now calls `navigator.credentials.get({otp})` behind an
  `"OTPCredential" in window` check, aborted on unmount.
  Files: `src/components/auth/CodeEntry.tsx`.
  ⚠️ **Inert until the SMS carries `@<host> #<code>` as its last line.** Without that binding the
  promise never resolves. Backend work, and it is the same message the app reshaped in `b1fa5297`.

- **2026-09-04 - «View quote» is drawn as the NEW bid form, filled in.**
  The renter's read-only viewer of an off-platform submission mirrored the OLD supplier form
  (`bidpage`/`sec`/`treqgrid` out of `BID_FORM_CSS` + `requests-proto.css`). It now mirrors the form
  the supplier actually fills: three numbered steps (Terms, The price, The supplier's details) and a
  rail carrying The request and The quotation, each step in the state the live form uses once it is
  answered - the terms review list with its progress bar and green/red answers, the price rows with
  their controls frozen, the details grid with the completeness ring. Markup is the app's own tokens
  now, so the two products cannot drift through a stylesheet neither owns.
  Files: `src/components/requests/SharedBidSubmissionModal.tsx`,
  `tests/unit/submission-viewer.test.tsx`.
  Trap: `vatLines` derives VAT as `total - subtotal` (AC-216) so the rows reconcile with what the
  supplier sent, and rounding the three ends independently for DISPLAY undid it - 148,384.6 and
  22,257.7 print as 148,385 and 22,258, a riyal more than the 170,642 beside them. `shownLines`
  takes the tax between the rounded ends instead, and the test adds the printed figures back up.
  Also: the quality ring's `.qring` layout class lives in `BID_FORM_CSS`, which this file no longer
  injects, so its wrapper carries that layout itself.

- **2026-09-04 — A machine the catalogue does not carry is shown again, with the way to ask us for it.**
  The canvas drew `postableItems(draft.items)`, and that filter drops a no-match row along with a
  removed one, so an item the agent could not place vanished off the screen. Type "floating crane
  barge" on its own and the whole machine panel was absent while the page said "add at least one
  machine" about the machine just described, with no control anywhere to add one. `UnavailableCard`,
  written for this state, was unreachable behind a verdict the panel could never receive.
  The canvas now draws `draft.items.filter(i => !i.removed)`; every gate already returned early on a
  no-match verdict, and submit still posts `postableItems`, so nothing about AC-33 moved.
  Files: `src/components/create/Canvas.tsx`, `src/components/create/MachineCard.tsx`,
  `tests/unit/canvas-no-match.test.tsx` (new, 4 cases).
  ⚠️ **An unavailable row is not a complete row.** Because no gate fires on it, `equipmentGaps` is
  empty for a no-match item, which is what paints the panel green — a card reading "we couldn't find
  this in our catalogue" under a green tick. Both dots now check the verdict as well as the gaps.
  ⚠️ **Still a dead end when EVERY row is no-match**: `gate.noItems` blocks the send and the only
  route to adding a machine by hand runs through `advance()`, which bails at the first gap. Not
  fixed here — it needs an «add a machine» control the canvas does not have.

- **2026-09-04 — Back goes where the renter actually was, on every screen.**
  `AppShell` kept the trail in a `useRef`, and it is each PAGE that renders `AppShell`, not the
  layout, so every navigation unmounted the shell and the ref came back `null`: every Back control
  in the app silently fell through to its own `fallback`. The trail is `src/lib/nav-trail.ts` now
  (module scope, `sessionStorage` behind it, recorded during render so a child asking on mount gets
  the answer), and `backTarget` no longer requires the previous page to be one of the NAMED places
  — that rule came from when the control said «Back to browse» and outlived the label.
  Files: `src/lib/nav-trail.ts`, `src/components/AppShell.tsx`, `src/lib/contract/back-nav.ts`.
  ⚠️ Retired routes (`/company`, `/compare`, `/requests/*`) are excluded as back TARGETS — they 308
  elsewhere, so Back would have landed on a redirect, sometimes back where it was pressed.

- **2026-09-04 — My Organization is part of the profile; `/company` is retired.**
  Owner: no nav tab and no page of its own, "just part of user profile below his personal info".
  `CompanyHub` takes an `embedded` flag that drops the page furniture it carried (its own padding,
  its own `dir`, the firm's masthead — a second slab under the renter's) and stacks the papers and
  the roster in the profile's left column. The edge 308s `/company/*` to `/profile`, and
  `notifications.ts` sends every `company.*` row there.
  Files: `src/components/company/CompanyHub.tsx`, `src/components/profile/ProfileView.tsx`,
  `src/middleware.ts`, `src/lib/contract/notifications.ts`, `src/lib/contract/back-nav.ts`,
  `src/components/support/IntercomWidget.tsx`, `src/components/AppShell.tsx`.
  ⚠️ `src/components/company/MyCompanyCard.tsx` is dead code (nothing imports it) and still pushes
  `/company`. Left alone; the redirect covers it, but it is the next thing to delete.

- **2026-09-04 — The nav bar is three places, Dashboard in the middle, and it says «Beta».**
  Browse · Dashboard · Requests, the same order signed in or out — the order used to swap on
  sign-in, which made the middle tab an accident. «Marketplace» is «Requests» again
  (`shell.marketplace` → `shell.requests`). A guest is still LANDED on Browse, but only on a cold
  entry: pressing the Dashboard tab now shows him the shared `SignInPrompt`, because bouncing him
  off a tab he can see reads as the tab doing nothing. Told apart by the nav trail.
  Files: `src/components/AppShell.tsx`, `src/components/home/HomeHub.tsx`, `src/lib/i18n/en.ts`,
  `src/lib/i18n/ar.ts`, `src/lib/uiPins.ts`.

- **2026-09-04 — The dashboard's bid rail stopped scrolling sideways.**
  The column was `overflow-y-auto` and nothing else, and CSS computes the other axis from `visible`
  to `auto` when one axis scrolls — so a 300px rail grew a horizontal scrollbar as soon as a
  supplier name, a price and a site were wider than it. Stated on both axes now; the name and the
  machine truncate, the price never does, and the site is dropped below 260px of RAIL width via a
  container query (a viewport breakpoint would hide it on the phone, where there is most room).
  Files: `src/components/home/HomeRequests.tsx`.

- **2026-09-04 — The palette is the Supplier OS palette, and it lives in the repo.**
  The two products had drifted a shade at a time: navy `#1c2738` here against `#22384e` there,
  orange `#f79009` against `#f97316`, a blue-tinted neutral ramp against a flat grey one. None of
  those was a decision anybody made. `docs/design-tokens.md` is now the source; `globals.css` `:root`
  carries every hex from it under BOTH vocabularies (`--ink` and `--navy`, `--text-secondary` and
  `--muted-dark`), and `ds-colors.ts` mirrors all 113 as literals for the three surfaces that never
  see a stylesheet. Fonts moved with it: Inter (Latin), Almarai (Arabic), JetBrains Mono (data codes
  only, via `.keep-mono`).
  Files: `docs/design-tokens.md`, `src/app/globals.css`, `src/lib/ds-colors.ts`, `src/app/layout.tsx`,
  `src/components/map/map-proto.css`, `src/components/map/panel/panel-proto.css`, `DESIGN.md`.
  ⚠️ **The OS palette has no blue, by design** — its `--info` is a slate that "sits in the ink
  family" — and RM3-AC-33 says the bid map's ask is blue and NEVER navy. So the ask keeps its
  `#1a7ec8` under a new name, `--action`, and every blue on the map surface moved with it (32 uses
  across the two prototype stylesheets). `equipment-card.test.ts` measures the channels and would
  have shipped a navy ask silently otherwise.
  ⚠️ **Two font rulings were overturned deliberately**: the Latin face was the SYSTEM font (owner,
  2026-08-30, to avoid a webfont download) and the Arabic face was IBM Plex Sans Arabic (owner,
  2026-08-19, because the RTL prototype is drawn in it). Almarai has no 500 weight, so `globals.css`
  maps `font-medium` to 700 inside Arabic.
  ⚠️ `--shop-*` and `--gold` are NOT from the token file and say so where they are defined.

- **2026-09-04 — Public bid form: a transport leg that does not exist is no longer priced as the renter's.**
  `deliveryBy` / `returnBy` became nullable on the backend (`null` = self-mobile equipment, so there is no
  leg at all). The pricing table read them through `(it.deliveryBy || "").toLowerCase() === "supplier"`,
  so `null` fell into the else branch; the branch that means "the renter handles it", and an outside
  supplier saw a "Delivery to site, handled by the renter" row for a boom truck that drives itself.
  The row is now gated on `delApplies` / `retApplies` (`!= null`), and the comment above it no longer
  claims the rows are always shown. Totals and the submit payload already excluded a non-supplier leg,
  so neither needed a change.
  Files: `src/app/bid/[token]/BidFormClient.tsx`.
  ⚠️ Use `!= null`, not truthiness: an empty string must still render a row, and an older backend that
  omits the field must keep behaving as before.
