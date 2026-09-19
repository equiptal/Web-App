# Web-App — agent notes

## Change log

- **2026-09-19 - The gutters were EQUAL and the content was not: the bid strip centres what it holds, and the intake sits at the top in a box a third shorter.**
  Owner: *"why margin from left not equal to right"*, on a 1920 screenshot of `/requests`, then
  *"all like this"*; and, on two shots of the intake, *"make it more to the top like this size and
  placement"*.
  🔴 **MEASURED before anything was changed, off his own screenshot, and the complaint was not what it
  said.** Every gutter on that page is symmetric: the green header's ink runs 25px in from the left
  and 29px from the right, the request rail's content 37 / 39, the white bids panel 37 / 39. (The 2px
  is the shot being 1916px wide for a 1920 window, not the layout.) `PAGE_X` is `px-4 sm:px-6 lg:px-8
  xl:px-10` and renders exactly that on both sides.
  **What was unequal is the CONTENT inside the equal gutters.** One bid card occupied x 50-390 and
  then ~1480px of empty white ran to the panel's edge. That is the 2026-09-19 fluid change landing:
  `PAGE_MAX` became `max-w-none`, so the container went 1360 -> 1840 and a 344px card did not grow
  with it. Offered the four ways out (centre / cap the content / stretch the card / restore the cap),
  he took **centre**.
  (1) **The bid strip is `justify-center-safe`.**
  ⚠️ **`-safe`, and the suffix is the whole licence for putting `justify-content` on a SCROLLER.**
  Plain centring overflows at BOTH ends, and overflow past the START edge cannot be scrolled to - on
  a request with six bids the FIRST one becomes unreachable. `safe` falls back to `flex-start` the
  moment it would overflow. Verified in a browser at the real 1840px: one card centres at 747 / 747,
  six cards (2188px of content) sit flush at 12px with `scrollLeft: 0` reaching the first.
  ⚠️ **`CompareMatrix` was looked at and deliberately NOT changed**: its terms strip is
  `flex-[1_0_auto]`, so it grows to fill and there is no free space for `justify-content` to
  distribute. A utility that can never fire reads as a rule.
  ⚠️ **The REQUEST RAIL is deliberately NOT centred**, though it has the same 1460px of air. Its
  «New» circle is aligned to the panel's own left edge, which is the half of the 2026-08-30 ruling
  that 2026-09-12 kept when it made the rail a band. Centring the tiles takes that alignment away.
  Worth one word from him; it is one class if he wants it.
  (2) **The intake: `justify-center` -> `justify-start`, and the typing area `min-h-[188px]` ->
  `min-h-[96px]`.** Read off his reference shot at 1:1, the box is **142px** where staging draws
  **235**; measured after the change, 144. The column runs the window's height (the rail sets
  `100dvh-52`), so `justify-center` was parking the whole block at mid-screen.
  (3) 🔴 **The two round controls had drifted to the row's LEADING edge, and that is a regression the
  reference caught.** `ms-auto` was removed on 2026-09-16 with the chip strip, on the reasoning that
  *"the pill's own group is `flex-1` now, so it pushes the controls to the trailing edge by taking the
  room itself"*. False on the first screen every renter meets: `ProjectFloorChips` renders **nothing**
  until a project is picked - not an empty `flex-1` box - so with no pill there is nothing to do the
  pushing. `ms-auto` is back, it holds in both states, and the standing rule of 2026-09-12 (the
  controls sit on the side the renter reads TO) holds with it.
  Files: `src/components/workspace/BidCards.tsx`, `src/components/screens/Intake.tsx`,
  `tests/unit/bid-cards-rail.test.ts` (1 new case), `tests/unit/intake-floor.test.ts` (1 new case, the
  `ms-auto` note corrected).
  🔴 **A test was anchored on the exact class string it was checking, and that is a VACUOUS-PASS
  trap.** `intake.slice(intake.indexOf('<span className="flex flex-none items-center gap-2">'))` - add
  one utility to that element and `indexOf` returns -1, `slice(-1)` returns the file's LAST CHARACTER,
  and every assertion below it then runs against a one-character haystack. Here it went red, which is
  luck: three of the four assertions in that block are `not.toMatch`, and those would have passed. It
  anchors on `aria-label={t.intake.uploadRfq}` now.
  ⚠️ Verified: `next build` clean, typecheck clean, lint 0 errors, **211 files / 3567 passing, 7
  skipped** serially, and both new cases break-checked one at a time (the centring removed, then
  `ms-auto` removed) - each went red alone. The 3 unhandled errors are `intercom-widget`'s two and
  `suppliers-remove-and-pick`'s one, both pre-existing.
  ⚠️ **SEEN RENDERED**: the intake photographed on a local production build at 1920 (block at the top,
  box 144px, controls on the trailing edge), and the bid strip's two arms measured on a throwaway page
  carrying the compiled stylesheet and the real class names - the cards tab needs a signed-in renter
  with bids, which this machine has no session for.
  🔴 **NOT seen on the real cards tab**, so the centred strip is argued from the measurement and pinned
  by a case rather than photographed in place.

- **2026-09-19 - The negotiation sheet TAKES THE SCREEN again: the same three steps and the new design, with the content in a column rather than in a floating card.**
  Owner, on yesterday's build: *"for deal room negoatiation it will sit in the existing 3 styles sheet
  but with the new design not as a popup page!!"*.
  🔴 **The rebuild had turned a PLACE into a dialog.** The prototype is drawn on a phone, so the port
  took it literally: a 460px card centred on the scrim, with the page showing round it. That reads as
  an aside — something opened over the room to be glanced at and dismissed — and a negotiation is the
  room's whole business. The wizard it replaced was `position: fixed; inset: 0`, the app's own is a
  ROUTE, and this is now a full-screen sheet again: `.ng-shell` is fixed to the viewport, square
  cornered, sliding up rather than fading in.
  ⚠️ **The CONTENT is capped at 760px and centred; the header and footer BARS run the full width.**
  The design's proportions are a phone column's — stretching a four-column price table across 1900px
  would throw them away for no reader's gain, and letting the bars stop at 760 would leave the sheet
  looking like the card it just stopped being. One `.ng-inner` wrapper in each of the three bands.
  ⚠️ **The footer's switcher centres on the COLUMN, not on the bar.** It is absolutely placed inside
  `.ng-inner`, so it sits over the steps it walks rather than in the middle of a wide screen with the
  accept button stranded at the far edge.
  ⚠️ **The term card's «Change / Take theirs» pair is capped at 320px and sits at the reading end.**
  At the phone's width they are two `flex:1` buttons; on a 760px column they became two 350px slabs
  and read as the card's main event instead of as the two answers to the line above them.
  Files: `src/components/deal-room/deal-room-proto.css`,
  `src/components/deal-room/DealRoom.tsx` (the three `.ng-inner` wrappers),
  `tests/unit/negotiation-sheet.test.ts` (2 new cases; 19 passing).
  ⚠️ **Nothing else moved**: same three steps, same order, same header, same footer acts, same
  pricing, same gating, same log. The test block that pins «what the rebuild did NOT change» is
  untouched and still green.
  ⚠️ `@keyframes dpModal` was referenced by the card and **exists nowhere in this repo** - the
  animation had never run. The sheet names its own `ngSheetUp` now.
  ⚠️ Verified: **`NODE_OPTIONS= npx next build` clean (31 routes)** - the rule this log set this
  morning, because a stylesheet fault is invisible to typecheck, lint and jsdom - plus typecheck,
  lint 0 errors, and **211 files / 3567 passing, 7 skipped**
  serially. The unhandled errors are DOWN to 2 from the 3 this log has recorded for a fortnight,
  which is not this change's doing and is not diagnosed - it is `intercom-widget`'s pair and
  `suppliers-remove-and-pick`'s one, and one of the three did not fire on this run.
  ⚠️ **SEEN RENDERED at 1568px**: all three steps as a takeover, RTL, built as static markup carrying
  the real class names and the compiled tokens. The footer is pinned to the foot of the window and
  the body scrolls between the two bars, which is the half a card could not do.
  🔴 **NOT seen on a real room**, so the two things to look at first are a long supplier name in the
  header beside the total, and the sheet on a phone, where the column cap never binds and the design
  is at its own scale.

- **2026-09-19 - STAGING HAD NOT DEPLOYED SINCE THE 18th: `97046ef6` left an orphaned CSS declaration and every build after it failed.**
  Owner: *"is the last commit and push deployed? i didnt see the changes"*, then *"i am looking to staging check it to build and deploy"*.
  The push was fine - `5474e470` is on `origin/staging`, 0 ahead / 0 behind. **The BUILD was broken**, so
  Amplify went on serving the build from `dd435fcf` (18 Sept). Fingerprinted rather than assumed: the
  deployed `/browse` still carries `max-w-[1440px]` (so the fluid-layout commit is absent) while carrying
  `data-season="nd"` and no `nd-dune` (so the 17th's work is present).
  🔴 **The fault: a selector was deleted and its CONTINUATION LINE was left behind.** `deal-room-proto.css`
  had `.qp-sheet {` opening a rule whose declarations ran onto the next line; the negotiation-sheet rewrite
  in `97046ef6` deleted the opener (the wizard became `.ng-*`, and the log grew its own `.qp-sheet` further
  down) and left `  display: flex; ... }` standing alone under a comment. PostCSS: `Unexpected } (623:251)`.
  Deleted, along with the four-line comment above it that still described the wizard this file no longer
  holds.
  ⚠️ **It is invisible to every gate this repo runs.** `typecheck`, `lint` and all 211 test files were GREEN
  across the 19th's three commits - a stylesheet is not typed, not linted here, and jsdom parses no CSS. The
  only thing that catches it is `next build`, and `npm run build` **cannot run on this machine**:
  `NODE_OPTIONS=--no-experimental-webstorage` is refused by the local Node 20 (`is not allowed in
  NODE_OPTIONS`), which is the same breakage already logged for `npm run dev`. So three commits shipped on a
  build nobody could run. **Run `NODE_OPTIONS= npx next build` before pushing anything that touches a `.css`
  file**, or fix the script.
  ⚠️ The orphan line is present in `git show` as far back as `7b9d37d8` and was HARMLESS there - line 399 was
  its selector. Searching for the line's first appearance points at the wrong commit; the breakage is where
  the OPENER went, which is `git show 97046ef6 -- <file> | grep '^-.*qp-sheet {'`.
  Files: `src/components/deal-room/deal-room-proto.css` (5 lines removed).
  ⚠️ Verified: `next build` clean (31 routes), typecheck clean, lint 0 errors, **211 files / 3563 passing,
  7 skipped** serially. The 3 unhandled errors are `intercom-widget`'s two and `suppliers-remove-and-pick`'s
  one, both pre-existing and unchanged in count.
  🔴 **NOT deployed by this change.** The fix is in the working tree, uncommitted. Staging will not move until
  it is pushed, and the Amplify build log was NOT read - there are no AWS credentials on this machine
  (`aws sts get-caller-identity` -> `NoCredentials`), so «the build failed» is proved by reproducing the
  failure locally rather than by reading the console.
  ⚠️ **`origin/beta` is 22 commits behind `origin/staging`** and has none of the September work. If the beta
  host is what is being looked at, that is a separate, larger gap.

- **2026-09-19 - The intake panel starts at the header and the Back control moves INTO the column; the rail's drawings come back.**
  Owner, on a screenshot of `/create` at desktop width: *"the panel must fit the whole page from the
  header till the end and dont overlap it with the back button also why the equipemtn images / icons
  not shown"*.
  (1) 🔴 **The panel and the shell's Back row were fighting over one band, and the fluid page made
  it fatal.** The shell draws Back as the first thing in `<main>`, across the page's own gutter; the
  intake row breaks out to the window (`mx-[calc(50%-50vw)] w-screen`) and pulls up through the main
  pad. The pull-up cancels 28px of padding and the back row is ~32px, so the panel started BELOW the
  header by that much and covered the control's left end - which is the clipped arrow in his
  screenshot. While the page was capped at 1440 the word «Back« sat just clear of the panel's edge
  by luck; with the cap gone that morning it would have vanished under the panel entirely.
  **So on the INTAKE the shell registers nothing and the work column draws its own control**
  (`IntakeBack`), which is also where a reader looks for it: beside the thing it leaves. The row is
  then main's first child, and **measured after: its top is 52 - the header's own height** - so
  `lg:top-[52px] lg:h-[calc(100dvh-52px)]` on the rail now means what it always said.
  ⚠ **It is the shell's markup to the pixel** - same arrow, same word, same tone, same mirror rule -
  because there is one Back control in this product (owner, 2026-09-03) and it must not read as two.
  ⚠ **This is NOT the 2026-09-09 trap read backwards.** That failure was two components registering,
  the child's effect landing first and the parent's `null` overwriting it. Here ONE component
  registers and its value depends on the phase; the inline control registers nothing at all, which a
  case pins by reading the source.
  ⚠ Canvas and review are untouched: the rail is an intake-only surface, so the shell still draws
  their Back, and the leave-confirmation still belongs to the canvas step.
  (2) 🔴 **The missing drawings were a RACE, and the fix is to look the picture up when the row is
  READ.** `imageUrl` was baked in inside `listTemplates`'s `.then`, off the `named` array that
  closure captured - and since 2026-09-17 every project is opened on arrival, so the template reads
  and the taxonomy read are fired in the same effect and the templates usually answer first. `named`
  was therefore `[]` for every row that was ever built, and the tree landing a moment later
  re-created `load` without re-creating the rows it had already cached: the glyph was permanent, on
  every row, for everybody. The cache holds a `CachedRow` with no URL now and `rowsOf` resolves it
  against whatever the tree holds at that render.
  ⚠ **The catalogue was checked before the code was**: `/api/stores/taxonomy` answers 428 nodes with
  94 drawings, «Crawler Excavator» among them, and the S3 object returns **200** - so neither a thin
  tree nor the staging 403 explains his screenshot, which is what pointed at the closure.
  ⚠ `named` is no longer a dependency of `load`. While it was one it looked like a dependency doing
  its job, and it was the bug: a new callback, the same stale rows.
  Files: `src/components/create/CreateBack.tsx` (`IntakeBack`, new), `src/components/screens/Intake.tsx`,
  `src/components/create/RequestsRail.tsx`, `tests/unit/create-back.test.tsx` (1 new case, the
  harness now draws the inline control on the intake alone), `tests/unit/intake-rail.test.ts`
  (1 new case, 1 rewritten).
  ⚠ Verified: typecheck clean, lint 0 errors, 46 passing across the back, rail, floor and pins
  suites plus 31 across mansour, the template line, the canvas render and the review reload.
  **SEEN RENDERED at 1920**: `/create` signed out - one Back control, at the column's own edge, and
  the intake row's top measured at exactly 52.
  🔴 **NOT seen with the rail on screen**: it needs a signed-in renter with projects, so the panel
  running the full height beside the control, and the drawings arriving on the second paint, are
  argued from the measurement and pinned by cases rather than photographed.

- **2026-09-19 - The dashboard's bid rail is a NAME, a PILL and a PRICE, and the circle holds the firm's mark.**
  Owner, on a screenshot of the rail: *"here only show supplier name and price nothing more with one
  small pill for offline, via app and the initials of the supplier must be the supplier logo in this
  circle"*.
  🔴 **The second line is deleted, which REVERSES 2026-09-04 and 2026-09-05** (*"the bids in home
  page must show bidder name, equipment name of the request with price, location if there is enough
  space"*, then *"show equipment subtype and size, not model and year"*). Both rulings were about
  WHICH machine name to print, and the machine itself is what goes: the rail stands beside the TABLE
  of requests that names the machine and the site, and a renter scanning incoming bids is reading who
  offered and how much. `machineWords` went with it, and `LinkRailBid` lost `machine` / `location`
  rather than being left computing two facts nothing draws.
  **The SOURCE is one small pill, on EVERY row.** ~~«Offline · via your link» under the name, and
  nothing at all on an app bid.~~ A mark that appears on some rows reads as a warning about those
  rows, where the question it answers - did this come through an account or through my own link - is
  asked of every bid. It takes `workspace.sourceApp` / `sourceOffline`, which is the SOURCE FILTER's
  own pair, so the rail and the tab above the bid cards cannot drift apart.
  ⚠ **That is a third spelling of one fact, deliberately.** The BID CARD says «Via your link»
  (2026-09-06) because a card is one bid read on its own; this row is scanned in a column of five
  beside a filter that says «Offline», and a 52px row has width for one word.
  **The circle draws `supplierLogoUrl`**, which the received-bids projection has carried all along
  and this rail read none of.
  ⚠ **The initial is a STATE, not a fallback for tidiness.** An off-platform row cannot have a mark
  - the firm was typed into the renter's own supplier list, so there is no account behind it - and
  `onError` is load-bearing rather than defensive: the storage objects are not public-read on
  staging, so a well-formed URL answers 403 and an `<img>` absorbs that as «no artwork», drawing a
  broken-image glyph where the firm should be. Remembered BY URL (`badLogos`), or one firm's failure
  would follow the next one down the rail - the same ruling the workspace's context bar took on
  2026-09-15.
  Files: `src/components/home/HomeRequests.tsx`, `tests/unit/home-bid-rail.test.tsx` (4 cases
  rewritten, 3 new, 2 retired with the facts they pinned; 12 passing).
  ⚠ Verified: typecheck clean, lint 0 errors, 34 passing across the rail, bubble, dashboard and
  source-wording suites, and the pill's «every row» rule break-checked - the app arm forced to null,
  one case went red.
  🔴 **NOT seen rendered.** The rail needs a signed-in renter with bids and has no specimen, so
  the logo, its 403 fallback and the new row are pinned by cases only. Worth one look on the next
  deploy: a wide logo in a 28px circle is `object-cover`, so a lockup will be cropped to its middle.

- **2026-09-19 - Every page is FLUID: the 1440 cap is gone, and only the legal document caps itself.**
  Owner, on the dashboard at desktop width: *"can u make the web resposive to fit any screen size
  like now i am opening it on desktop it is too small and margins are big"*. Asked to choose between
  a fluid page, a raised cap and fluid-with-wider-gutters, he took **fluid, no cap**.
  🔴 **`PAGE_MAX` is `max-w-none`.** At 1440 a 1920 monitor spent 240px of background on each
  side and a 2560 one spent 560 - the page read as a tablet layout parked in the middle of a desktop.
  The width is the window less `PAGE_X` now, at every size. Measured after: the stores column went
  1360 → **1905** at a 1920 window, and the guest wall's bid grid fills the row.
  ⚠️ **The constant is KEPT rather than deleted from its ~30 call sites.** The rule it carries is
  still «one width rule, one place to change it», which is what the 2026-08-26 unification was for:
  reinstating a cap is this one line, while a `max-w` per page is how two pages drifted 88px apart in
  the first place.
  **Four hand-written caps went with it**, because a page-level cap that only some pages obey is the
  same complaint by another road: the workspace's LOADING rail (`max-w-[1440px]`, written by hand
  where the live rail already has none), `SHOP_PAGE`'s 1360, My Suppliers' standalone 1560, and the
  route skeleton's `max-w-6xl`.
  🔴 **The legal document caps its own CONTENT, and it is the only page that does.** Measured at
  1920 before the cap: a paragraph ran **1798px**, about 250 characters a line. That is the case
  `PAGE_MAX`'s own note reserves - a cap on the PROSE rather than a gutter that also moves every band
  and full-width card on the page. `max-w-[86ch]`, in `ch` so it follows the reader's type size.
  Files: `src/lib/ds.ts`, `src/components/workspace/RequestsWorkspace.tsx`,
  `src/components/stores/shop.tsx`, `src/components/suppliers/SuppliersPage.tsx`,
  `src/app/loading.tsx`, `src/app/legal/[key]/page.tsx`.
  ⚠️ **Nothing below 1360px changed, by construction**: the gutters are untouched and a cap does not
  bind at a width narrower than itself, so every phone and tablet layout is byte-identical. Worth
  saying because the browser tool's `resize` would not take on this machine (logged before, on
  2026-09-13), so the phone width was NOT re-measured - it is argued, not observed.
  🔴 **Reported, NOT fixed: the FORM surfaces now stretch too.** `Canvas`, `ReadyToSend`,
  `ProfileView` and `ProjectsSurface` carry no content cap of their own, so on a 1920 screen their
  field grids run ~1830px. That is what «fluid» means and it was the owner's pick; if a stretched
  form reads badly on his monitor, the fix is a content cap on those four, one line each, and it is
  a decision about each page's content rather than a return of the page cap.
  ⚠️ Verified: typecheck clean, 120 passing across twelve layout, shell and design-guard suites (the
  one unhandled error is `suppliers-remove-and-pick`'s, pre-existing). **SEEN RENDERED at 1920**:
  browse (five store cards a row, the category rail across the window), the requests guest wall, the
  intake (its own box cap unaffected) and the legal page before and after its content cap.
  🔴 **NOT seen on the real signed-in dashboard, the canvas or the compare table** - all three need
  a session, and the compare table's fixed column widths are the next thing to look at with the extra
  room.

- **2026-09-18 - The negotiation sheet is the prototype's THREE SHEETS: a phone column with the running total in its header, a `‹ step ›` switcher in its footer, and a labelled «Send to the supplier» on the last one.**
  Owner: *"there are chanfes in deal room the 3 negotiation sheets style, check them in app"*, then, asked
  how far to follow it, **«Restyle all three steps to the app»**.
  🔴 **The source is `Negotiate Price Sheet Standalone.html`**, the owner's own prototype, which the app
  builds `counter_offer_flow/` from (*"match it exactly with prototype for the 2 pages terms and price
  including footer, header, spacing, alignment and all"*). The web had never seen it: its sheet was a
  QUOTATION PAPER on a grey desk, with a zoom rail, an invoice table, a step rail across the top and a
  two-column review. ~~All of it.~~
  (1) **The shell**: a 460px column that fills a phone. One white header carrying the running total on
  the leading edge and the counterparty on the trailing one; a scrolling body; a white footer.
  (2) 🔴 **«🔔 New offer from the supplier», and only then** (the app's own change of today). DERIVED
  from who posted the latest round — there is no seen/unseen bit on a round, and inventing one this
  sheet could not clear would leave the eyebrow lit for good. With no new offer the header keeps the
  bare caption, because one that is always there names what the bar's only number obviously is.
  (3) **Step ① the price**: the four-column table on the prototype's own weights, a `✕` that strikes a
  transport leg out, an 18px count stepper, and the money input whose COLOURS are the state — green
  while the figure still matches the supplier's, amber the moment it is edited, with the «Supplier: N»
  line under it turning with them. Then the summary band and the net in its own navy-bordered box.
  ⚠️ **The CHARGED DAYS moved into the duration cell** (`12 days` over `14 days, Fridays out`). q3's
  table has no quantity column for them, and without it the one figure that explains the total is
  nowhere on the sheet.
  (4) **Step ② the terms is a QUEUE**, one at a time: settled rows collapse to a strip that says HOW
  they settled (`✓` took theirs, `✎` countered), the current one opens as a card with «Change» and
  «Take theirs», and the rest wait, dashed and dimmed. Under them the two collapsed groups —
  «Acknowledged 🔒» and «Agreed ✓». ~~A four-column table of every term at once, each row a dropdown.~~
  ⚠️ **The provenance and history lines are KEPT**, which the prototype has no slot for: a renter
  reading «24 hours» otherwise cannot tell his own ask from the supplier's declaration from the
  platform's default.
  (5) **Step ③ the review**: two cards under navy headers of the same shape — the price he is about to
  send, then the terms index with its progress bar — and the quotation link the app puts there.
  (6) 🔴 **The last step NAMES its act** (the app's other change today): «Send to the supplier», navy,
  with a small `‹` on the leading edge. There is nothing to walk forward to on a review, so a bare
  chevron would submit the whole negotiation — the one irreversible press on the sheet — drawn as
  navigation. Steps ① and ② keep the centred `‹ step ›`.
  ⚠️ **Accept stands BESIDE it when everything matches**, and it hands back to the room
  (`setFlowMode("accept")`) rather than calling accept here: that press must land on the
  binding-commitment warning, and a button that skipped it would be the sheet deciding he had read it.
  (7) **The compare card is the prototype's navy block**: the two totals as the two ends of ONE
  measurement, with the gap on the rule between them, amber when they differ and **green «✓ Matched»
  when they agree** — the matched case used to draw nothing, which read as unfinished.
  Files: `src/components/deal-room/DealRoom.tsx` (`CounterFlow` re-rendered; `onAcceptInstead` and
  `onOpenQuotation` are new), `src/components/deal-room/deal-room-proto.css` (the `.qp-*` wizard block
  replaced by `.ng-*`; the LOG keeps its own rules), `tests/unit/negotiation-sheet.test.ts` (new, 17).
  ⚠️ **NOTHING about the deal moved.** Every figure still goes through `computeRentalTotal` /
  `computeQuoteTotals`, the seeds still come off the reconstructed rounds, the unit caps, the leg
  exclusion and its confirmation, the term resolutions, the gating (`rate > 0`, then every term
  answered), the submit payload, the settled read-only room and the log are all untouched. A test
  block pins each, because a restyle is exactly when a behaviour goes missing unnoticed.
  🔴 **The prototype's palette could not come with it.** It ships its own greys (`#EEF0F3`, `#F9FAFB`,
  `#111827`…) and the APP keeps them privately, on the stated reasoning that mixing two near-identical
  palettes is what makes a screen look almost-right. `palette-drift` forbids a raw hex in `src/`, so
  each is mapped to its nearest house token — the same trade every ported prototype in this repo has
  made since the 2026-09-06 sweep.
  ⚠️ **The `✕` sits on the row's START edge.** The prototype's `right:12px` reads as the END edge under
  our logical properties, which put a 16px circle on top of the price field — a control that eats the
  first tap meant for the number. Seen in the picture, not in the source.
  🔴 **`&#10003;` is a COLOUR to `palette-drift`.** The footer's ticks were written as HTML entities and
  the guard read `#10003` as a hex literal. They are the glyphs themselves now. Cheap, and it would
  have been baffling to anyone who met it in a week.
  ⚠️ Verified: typecheck clean, lint 0 errors, **211 files / 3560 passing, 7 skipped** serially, and two
  rulings break-checked (the labelled send reverted to «Send reply», the eyebrow forced true) - each
  went red alone. The 3 unhandled errors are `intercom-widget`'s two and `suppliers-remove-and-pick`'s
  one, both pre-existing and unchanged in count.
  ⚠️ **SEEN RENDERED**: all three sheets plus the LTR mirror, built as static markup carrying the real
  class names and the compiled tokens, served from a throwaway local server — the same method the
  National Day skin was judged by, because `/dev/preview` does not hydrate on this machine and the sheet
  needs a signed-in renter with a live room.
  🔴 **NOT seen on a real room**, so three things want one look on a deployed build: the queue with a
  term that has options (the fixture's list is hand-written), the footer at 402px with a long supplier
  name in the header, and the accept-mode sheet, whose binding gate this change did not touch.

- **2026-09-18 - The quotation is the app's `q3` sheet: EIGHT columns with delivery and return among them, ONE numbered terms list, and a navy supplier footer.**
  Owner: *"can u check the new qoutation in the app and use it as our template here too"*, then, mid-build,
  *"i changed some on app staging so follow it now"*.
  🔴 **The app shipped this on 2026-09-16 and recorded the web half as owed**, in as many words:
  *"WEB IS NOT DONE, and it is a separate renderer"*. The design is the owner's own `q3.pdf` /
  `Moedatech Quotation - Standalone.html`, handed to the app with *"this is the quotation template u
  must follow in the preview and in the pdf for all web and app"*. Ported from
  `Moedatech-App/apps/mobile/.../quotation_document.dart` + `live_quotation_document.dart`, including the
  changes sitting UNCOMMITTED on that repo's staging tree this morning (the `agreed` mark, the terminal
  stamp, the sweep).
  ~~A navy gradient header, avatar circles, a three-column meta strip, a "listed equipment" chip block,
  a six-column table with the two transport legs as indented `↳` SUB-ROWS, a boxed amount in words, and
  the terms as key/value cards.~~ Every one of those is gone:
  (1) **A white title bar**: «Quotation» / «عرض سعر» and one strip of `LABEL` over value (NO. · REQUEST ·
  DATE · VALID UNTIL · WORK SITE · CURRENCY), over a 2px navy rule. The navy lives on the footer and this
  rule - a second navy band competes with the one that matters.
  (2) **Two bordered party boxes**, bilingual eyebrow (`SUPPLIER / المورد`), the name with a green tick
  beside it, then ONE FIELD PER LINE. 🔴 **The "✓ Verified" PILL is gone**: it stood where a registration
  number belongs, so a firm with a checked C.R. that simply is not on the payload read identically to one
  with no C.R. at all. The tick says it once, beside the name; an absent row is not drawn.
  (3) 🔴 **ONE ROW PER MACHINE**, `Equipment · Description · Units · Period · Rental/unit ·
  Delivery/unit · Return/unit · Total`. On a single-machine bid both shapes print the same figures; on a
  multi-item one this reads as a quotation and the old one read as a list of charges.
  ⚠️ **THREE money cell states, and the difference is the point**: a FIGURE is a price, `–` is a leg that
  is not the supplier's (struck out in the room, or assigned to the renter by the request), and
  «Not priced» is a leg nobody put a number on. Collapsing the last two tells a renter a price is still
  coming when it never was, and a `0` would say the trip is free.
  🔴 **The CHARGED DAYS moved into a note under the total**, because q3 has no quantity column: `المدة` is
  the billing period as an ADJECTIVE and `الوحدة` is the machine count. Without it the one figure that
  explains the total - 9 billable days, not the window's 10 - would be nowhere on the paper.
  (4) **The totals sit in the table's own last column**, grand row on a navy rule and a pale band.
  (5) **ONE numbered list**: the term sentences, a hairline, then the five legal clauses.
  🔴 **The VALUE ladder is the app's own** (`_clausesForBid`): deal-room LOCKED value → latest counter →
  the supplier's T3 declaration → the request's own side. A clause can therefore never state a term the
  room contradicts. `BidCard` gained `counters` and `t3Declarations` for it - the mapper has always built
  them and threw them away.
  🔴 **«✓ Agreed» marks a SETTLED term, inline** (owner, on the app, today). `lockedTerms` and nothing
  else: the room's SOFT-ACCEPTED set means "nobody may act on this", never "both sides agreed", and this
  is a document a customer keeps.
  🔴 **NO TERM MAY BE MISSING** (owner, on the app, today: *"just make sure agreed and all terms of deal
  room is mentioned, we will not miss anything"*). After the eight written sentences, every other key the
  room holds prints as `label: value`, agreed ones first, then by key so two renders cannot disagree.
  ⚠️ **This REVERSES 2026-08-19's "no FIXED term reaches the paper"**, on that entry's own reasoning:
  *"a fixed term IS part of the contract, it was accepted by the act of bidding, and a quotation that
  omits it states less than the deal contains"*. It was right and it was outvoted; now it is the rule.
  (6) **A navy footer** carrying the SUPPLIER's mark, name, address and registration, plus the support
  line. A platform mark in the supplier's own footer credits the wrong party.
  (7) **A terminal stamp beside the title** (`Accepted` / `Cancelled`), and NOTHING on a live one - a
  sheet that stamps its own normal state teaches the reader to ignore the stamp.
  Files: `src/lib/quotation/render.ts` (the template, rewritten), `src/lib/quotation/clauses.ts` (new -
  the ladder, the eight sentences and the sweep, shared by both documents),
  `src/lib/quotation/bid-quotation.ts`, `src/lib/contract/deal-room.ts` (`buildDealRoomQuotationDoc`
  rewritten; `COST_TERM_KEYS` + `DETAILS_OWNED_TERM_KEYS` deleted), `src/lib/contract/bids.ts`
  (`counters`, `t3Declarations`), `src/lib/contract/labels.ts` (three new value maps),
  `src/components/workspace/RequestsWorkspace.tsx`, `tests/unit/{quotation-render,quotation-unified,
  deal-room-quotation,labels}.test.ts`.
  🔴 **`overtime_rate` joined `HIDDEN_DEAL_ROOM_TERM_KEYS`**, matching the app's `kHiddenDealRoomTermKeys`,
  which has held it since the rentee stopped being asked for one. The web hid it on every SURFACE on
  2026-09-04 and never at the PARSE - so the new sweep printed «Overtime Rate: 0x» the first time it ran,
  which is the same `'0'` sentinel that once reached the app's own quotation. It is a SHARED filter: that
  row is now dropped from every deal-room term surface, as it is in the app.
  ⚠️ **`crosshire` is relabelled to «Subletting»** in the deal-room document. It IS the request's
  `subletting` column, the renter answered it under his own word, and the old "one fact, one row" rule
  survives the loss of the details card that used to own it.
  ⚠️ **Three new VALUE maps, because the sweep prints keys nobody had rendered before**: `payment_terms`
  («NET_90» → «Net 90 days» / «صافي 90 يومًا»), `operator_nationality` (the app's own «Arab» / «Non-Arab»),
  and `insurance` (a party assignment, so it reads «Supplier» rather than a lower-case code). The bid
  builder's private copy of the payment map went with them - one spelling, two documents.
  ⚠️ **Dates are LATIN in both locales.** `ar-SA` formats with Arabic-Indic digits and BOTH builders were
  printing them; the product-wide rule is 2026-09-04's. Seen on the first render, not reasoned about.
  ⚠️ **Halalas print only when there are any.** `219,075.00 SAR` is wider than the column the fixed table
  layout gives the grand cell, and it was clipped to «219,075.00 s.» at the sheet's own width. A whole-riyal
  total prints whole, which is also how the app draws it.
  ⚠️ **The DRAFT marking is kept, and it is web-only** - q3 has no slot for it. A pre-confirmation
  quotation is not a document anyone may rely on: the supplier can still counter.
  🔴 **A backtick inside the CSS template literal ended the string.** `` `/unit` `` in a comment inside
  `QUOTATION_STYLE` closed it, and the compiler then read the CSS after it as expressions - two errors
  pointing at lines that looked innocent. Same family as the `${}` trap: a template literal holding a
  stylesheet may contain neither.
  ⚠️ Verified: typecheck clean, lint 0 errors, **210 files / 3543 passing, 7 skipped** serially, and two
  rulings break-checked (the leg's «not the supplier's» arm removed, the term sweep emptied) - each went
  red alone. The 3 unhandled errors are `intercom-widget`'s two and `suppliers-remove-and-pick`'s one,
  both pre-existing.
  ⚠️ **SEEN RENDERED**, which is how the digits, the clipped total, the raw `NET_90` and the raw
  nationality were all found: all four documents (the bid quotation and the deal-room one, EN and AR)
  built from fixtures, written to disk and served over a throwaway local server, since `/dev/preview` does
  not hydrate on this machine and both real surfaces need a signed-in renter.
  🔴 **NOT seen on a real request or a real room**, and the two things to look at first are a bid whose
  supplier has a LOGO (the footer tile is drawn only when there is a mark) and a multi-item RFQ, where the
  eight columns are at their narrowest.
  🔴 **BACKEND, theirs not ours, and unchanged here:** `apps/backend/src/services/deal-room/
  quotation.service.ts` still builds the STORED deal-room PDF (`pdfUrl` / `pdfStatus`) on the old
  template. The web renders its own HTML and never opens that file, so nothing on this side reads it -
  but a renter who receives it from the app gets the old sheet. The app's own change log already carries
  this as owed work.

- **2026-09-18 - The dashboard's tabs are boxed again: a glyph, a count pill and an orange foot under the open one.**
  Owner, handing over a screenshot of another product's tab strip: *"use like these tabs design in
  the dashboard"*.
  🔴 **This OVERTURNS yesterday's ruling** (2026-09-17, *"the tabs doesnt feel ui consistency
  with the header tabs"*), which had made this row `AppNav`'s lozenge inverted. It goes back to a
  BORDERED BOX per tab - the section's glyph, its name, the count in a small pill - with the open tab
  filled navy and a 3px brand-orange rule along its foot. His reference, his call.
  ⚠ **What the withdrawn ruling was protecting is worth keeping in view**: `AppNav`'s own note says
  *"a row of four icon-plus-label pairs reads as a toolbar rather than as the top of a site"*. It is
  affordable here because this row is NOT the top of the site - the navy bar two bands above it is,
  and it still wears the plain lozenges. A page-level tab strip may look like a control.
  ⚠ **The foot rule is on EVERY tab**, orange when open and the ordinary border when not, so the row
  does not shift by a pixel when the open tab changes - the one device of the header's pill that
  survives. Measured: all three tabs 41px, same top.
  ⚠ **The count pill is NOT the reference's red.** Red is `--danger` in this palette, and a count of
  the renter's own sites is not an alarm. Grey on the resting tab, the navy tab's own ground inverted
  on the open one. It is still a dash until the block answers.
  Files: `src/components/home/HomeHub.tsx` (`VIEW_ICON` back, `DashboardTabs`).
  🔴 **A stale `.next` told a lie for half an hour, and it is the trap worth recording.** A dev
  server running across the edit went on serving a `layout.css` that contained NONE of the new
  utilities - `border-b-[3px]`, `border-b-brand`, `bg-surface/20` all absent from the compiled sheet
  on disk - so the orange foot measured 1px navy and the obvious conclusion («the shorthand `border`
  beats the side `border-b-[3px]`») was drawn, and the markup was rewritten around it. On a clean
  build the side wins outright, measured at 3px #f97316, and the rewrite was reverted.
  **A new utility that appears to do NOTHING is a build that has not re-scanned the file**; delete
  `.next` before rewriting markup around what the browser reports.
  ⚠ Verified: typecheck clean, lint 0 errors, 34 passing across the two dashboard suites plus the
  pins, palette and shell-nav guards - they pin the RULES (mounted not unmounted, the count reported
  up, the dash, the URL), none of which the skin touches. **SEEN RENDERED** through the
  `dashboard-tabs` specimen in EN and AR - the Arabic mirror needs no rule of its own, the flex row
  reverses.
  🔴 **NOT seen on the real dashboard**: that needs a signed-in renter with all three lists.

- **2026-09-17 - The dashboard band's bottom edge is a straight line again, and the dune sweep is deleted.**
  Owner: *"make the cta of ai straight line as it was"*.
  🔴 **TWO treatments were tried on that one edge in two days and both are now withdrawn** - the
  gold Najdi seam (2026-09-16), then the kit's dune sweep the same day, on the argument that an edge
  gets one finish. The edge gets none.
  ⚠️ **The reason is worth keeping, because the kit still ships the motif and somebody will reach
  for it again.** The dune is the one piece in the kit that changes a SILHOUETTE rather than adding
  a mark inside a box, and this band's bottom edge is a structural join: the dashboard's first band
  meeting the page under it. A curve there reads as the layout having moved, not as a season. The
  dune's own note argued that it *"changes the silhouette of whatever sits below it"*, which turned
  out to be the objection rather than the case for it.
  **The band still wears the season, on the INSIDE**: the eight-palm tree line and the dot field,
  both on `.nd-band`, both untouched. Its navy, its photograph, its one orange word and its orange
  button are unchanged, as they have been throughout.
  ⚠️ **Deleted rather than left inert** - the class off the element, the `.nd-dune` rules out of
  `globals.css`, and `public/nd96-dune.svg` with them. An unused seasonal rule is one edit away from
  coming back by accident, and the strike-through in both files carries the reasoning without
  carrying the code.
  🔴 **Seven of the kit's eleven motifs are now placed**, down from nine: the dune joins the confetti
  and the corner ribbon on the list of pieces deliberately not carried, and a case records each.
  Files: `src/components/home/CtaBanner.tsx`, `src/app/globals.css`,
  `public/nd96-dune.svg` (deleted), `src/app/dev/preview/specimens.tsx`,
  `tests/unit/national-day-season.test.ts` (2 cases rewritten; 32 passing).
  ⚠️ The case that pins it reads the STYLESHEET as well as the component (`.nd-dune` must not be
  declared at all), so restoring the class alone cannot bring the curve back quietly.
  ⚠️ Verified: typecheck clean, lint 0 errors, 32 in the season's suite and 46 across the CTA,
  palette, pins and guest-wall guards. **SEEN RENDERED**: the band in season with the tree line and
  the dots inside it and a straight bottom edge, beside the same markup out of season.

- **2026-09-17 - The intake panel runs the window's height under the header, opens every project, and counts every row.**
  Owner, on a screenshot of the rail ending mid-page with grey under it: *"make it for this the
  default width and by default make them opened, then for height make it along the page excpet the
  header and for 1 unit still show 1 [icon] then name"*.
  (1) 🔴 **The height was the COLUMN's, and that is what made it a card again.** The panel stretched
  to the row, and the row is as tall as the content beside it - so a short intake gave it a short
  panel with page ground under it, which is exactly what he photographed. It is
  `sticky top-[52px] h-[calc(100dvh-52px)]` now: the bar is `sticky top-0 h-[52px] z-30`, so 52 is
  where this starts and `100dvh - 52` is precisely the room left under it.
  ⚠️ `dvh`, never `vh`: on a phone the address bar eats `vh`, and a panel told it is taller than the
  screen cannot be scrolled to its own foot.
  (2) **Every project is OPEN when the rail arrives**, and the set records what is SHUT rather than
  what is open - which is what makes «all open» the state a fresh visit lands in without seeding it
  from a project list that has not arrived yet.
  🔴 **The cost, stated: one `fetchChart` PER PROJECT on mount**, where it used to be one per project
  he chose to open. A renter with twelve projects pays twelve reads when the intake mounts. They are
  cached and fired once each, and a failure on any of them leaves that project listed and pressable.
  ⚠️ **The chosen project no longer forces itself open.** That override was needed while the default
  was shut - the floor draws its machines and the rail would have hidden them - and with every group
  open it only overrules the renter: he shuts one, presses its head, and it springs back.
  (3) 🔴 **The count is on EVERY row, one included**, reversing the same day (*"for 1 unit still show
  1 [icon] then name"*). ~~Drawn only above one, because a column of «1» is noise.~~ A column of
  counts that skips some of its rows is harder to scan than one that repeats a 1: the eye reads down
  the number, not down the presence of it.
  ⚠️ **The `×` is kept on every row**, so the shape is one thing - «2 ×», «1 ×». His two notes spell
  it both ways (*"put the unit 2 x icon"*, then *"1 [icon] then name"*), and one format for one row
  is the reading that survives. Cheap to change if he meant the bare number.
  (4) **The width is unchanged at 208px** - the default he was looking at, and what *"make it for
  this the default width"* asks for. The grip and its 164-380 range are untouched.
  Files: `src/components/create/RequestsRail.tsx`, `src/components/screens/Intake.tsx` (the row
  stops setting a height - the panel sets its own), `tests/unit/intake-rail.test.ts`.
  ⚠️ Verified: typecheck, lint (0 errors), **210 files / 3533 passing, 7 skipped** serially.
  🔴 **NOT seen rendered.** The rail needs a signed-in renter, so `/dev/preview` draws nothing and
  the sticky height, the open groups and the new counts all want one look on a dev build.

- **2026-09-17 - The season's ordinal mark leaves the dashboard band and takes the pill's place on the bar.**
  Owner, on the first cut of the National Day skin: *"remove the 96 from the cta and just make this
  style instead of the 96 pill on header"*.
  🔴 **Two changes, and the second is the one with an argument behind it.** The band's ordinal mark
  is deleted; the header's gold OUTLINED PILL is replaced by that same mark - the outlined figure,
  the gold hairline, the small caption - laid out as a ROW for a 52px bar.
  ⚠️ **The stack itself could not come.** The band drew the figure at 58px inside 160px of height;
  the bar is 52px including its own padding. So the column becomes a row and the 92x1 rule turns on
  its side to 1x14. Everything that made it a mark rather than a heading survives - no fill, no
  ground, no border - and only the axis changed. The stroke went 2px → **1.2px** with it: a stroke
  is an ABSOLUTE width, so the weight that read as an outline at 58px reads as a solid slab at 19px.
  ⚠️ **It reads better as well as being the instruction.** «Beta» sits beside it and is an outlined
  pill; a second outlined pill a hand's width away read as a pair of controls rather than as a note
  on the wordmark. The mark has no border and no ground, so it cannot. A case pins that `.nd-chip`
  must never return to this bar.
  ⚠️ **The band now says NOTHING in words**, and keeps only the three motifs that do not speak: the
  eight-palm tree line, the dot field and the dune sweep. That is the better division rather than
  merely the instruction - the band exists to say ONE sentence, and a second piece of copy at the
  far end of it was competing with that sentence for the same 160px.
  ⚠️ **`aria-hidden`, which the pill was NOT.** A behaviour change, and deliberate: the pill made a
  screen reader say «96 National Day» in the first breath of every page in the product, for a
  fortnight, about something nobody can act on.
  Files: `src/app/globals.css` (the mark re-cut for the bar; `.nd-chip` reduced to the pale weight),
  `src/components/AppShell.tsx`, `src/components/home/CtaBanner.tsx` (the mark and the now-unused
  `seasonOrdinal` import removed), `src/lib/uiPins.ts` (2.5 relabelled; **10.3 retired**),
  `src/app/dev/preview/specimens.tsx`, `tests/unit/national-day-season.test.ts` (3 cases rewritten,
  1 new; 32 passing).
  ⚠️ **`.nd-chip`'s base skin is kept rather than folded into `.nd-chip.is-pale`.** The kit ships
  the chip in two weights and the solid one is still the right answer the day a light card needs a
  louder mark; what it must not be again is a second outlined pill on this bar.
  ⚠️ **The width rule stayed in the stylesheet across the swap**, and the case that pins it now says
  why: the unlayered-beats-layered trap belongs to the BLOCK, not to whichever element is standing
  in it. A `max-sm:hidden` on the mark would lose at every width exactly as it lost on the pill.
  ⚠️ **10.3 is retired, not renumbered** - the `CarryForwardModal` rule of 2026-09-09: a number that
  has been quoted in a note must not come back meaning something else.
  ⚠️ Verified: typecheck clean, lint 0 errors, 32 in the season's own suite and 60 across the pins,
  palette, shell-nav, verify-pill, CTA and guest-wall guards. **SEEN RENDERED**: the bar with the
  mark in EN and AR, the band silent, the OFF state, and a real 392px viewport where the mark stands
  down. 🔴 Still not seen on the real signed-in bar or the real dashboard band - the band has a
  photograph behind it that the harness does not.

- **2026-09-17 - A cancellation SAYS it happened, and the request it shut says so afterwards.**
  Owner: *"if a request is cancelled add the closed lable to it and show confimration on cancellation
  with concaclled successfuly note"*.
  (1) 🔴 **The press used to say nothing at all.** `doCancel` ran `onChanged(); onClose();` - every
  layer dismissed, the renter back on the page he started from with one circle greyed somewhere
  behind him. On the ONE act the backend has no inverse for, a silent success reads exactly like a
  silent failure, and this dialog is the only surface that knows which of the two it was.
  `ConfirmCancelModal` gained `done`: the same box swaps to a tick, «Request cancelled», and what
  CHANGED - *"it is closed now, and suppliers can no longer bid on it"* - over one button.
  ⚠️ **ONE box, two states, never a second dialog.** A tick that arrives where the question was asked
  reads as the answer to it; a new layer over the old one is a second thing to close.
  ⚠️ **The caller does NOT dismiss on success.** Closing is the renter pressing Done, and that press
  is what carries the reload - the rail has to re-read to grey the circle and put «Closed» under it.
  ⚠️ **`busy` is deliberately left raised** on the success path. The act is over, and a confirm
  button that comes back to life under a tick invites a second cancellation of a request that has
  none left. A case pins that the only `setBusy(false)` is the catch's.
  ⚠️ **BOTH doors, one modal.** The drawer and the dashboard table each cancel through
  `ConfirmCancelModal`, so the note lands on both - a confirmation on one and silence on the other is
  exactly the drift this repo keeps finding between two doors onto one act.
  (2) **The workspace's context bar carries CLOSED.** The rail has said it under the circle since
  2026-08-30 and the drawer says it in its title; between those two sits the bar naming the request
  the whole page is about, and it said nothing. A renter who cancelled one and stayed on it read a
  live-looking subject over a table of bids that can no longer change.
  ⚠️ **`groupBiddingClosed`, never a status of its own.** A group is shut only when EVERY item in it
  is: a fanned-out RFQ with one line cancelled and one still open is still taking bids, and labelling
  it closed would be a lie about the half that is not. It is the same predicate the rail greys its
  circle with, so the two can never disagree.
  Files: `src/components/requests/RequestEditModals.tsx` (`done`),
  `src/components/workspace/RequestDetailsModal.tsx`, `src/components/home/HomeRequests.tsx`,
  `src/components/workspace/RequestContextBar.tsx`,
  `tests/unit/cancel-confirmation.test.ts` (new, 8 cases).
  ⚠️ **No new strings.** The success note is written inline in both locales beside the dialog's other
  sentences, which is how every line in this component is already carried; `t.workspace.closed` is the
  rail's own word, reused rather than a second spelling of the same fact.
  ⚠️ Verified: typecheck, lint (0 errors), 8 new cases, and **3522 passing / 7 skipped** serially. The
  success state was break-checked by renaming its guard - three cases went red. The 3 unhandled errors
  are `intercom-widget`'s two and `suppliers-remove-and-pick`'s one, both pre-existing.
  🔴 **NOT seen rendered**: cancelling needs a signed-in renter with a live request, and it is not a
  thing to try against prod. The states are pinned by the cases and by the predicate's own tests.

- **2026-09-17 - The halo behind Mansour is deleted, and NO SHADOW is a standing rule.**
  Owner, on a screenshot of the CTA band: *"why mansout is not clear? not hd also never use shadow in
  design remove it around him"*.
  🔴 **The halo was the softness.** An orange radial glow was put behind him yesterday and argued as
  figure-and-ground - he is grey by the kit's own rule (*"grey on purpose so he sits on any brand
  colour"*) and the band is navy, so something had to separate them. What it did was bleed `--brand`
  at 30% across his outline, so the thing meant to lift him off the ink was sitting ON him. Deleted.
  The separation is the BAND's job: he stands on the darkest end of its gradient (94% navy), which is
  where the headline already relies on the same contrast.
  ⚠️ **It is a rule now, not one element**: no glow, no drop-shadow, no ring behind a figure. This
  design system already spends none - `IntercomWidget` clears the whole `--shadow-*` namespace and
  says why - and nothing in the intake rail or its floor carries one.
  Files: `src/components/home/CtaBanner.tsx`, `tests/unit/cta-banner.test.ts` (the halo's case
  rewritten to its removal, and widened to shadow and blur).
  🔴 **«Not HD» is TWO different things, and only one of them was ours.**
   · **He is inline SVG** and therefore resolution-free at any size - `mansour.test.tsx` has pinned
     «inline SVG, never an `<img>`» since he landed. Nothing about him is rasterised, so what read as
     soft was the orange bleed and nothing else.
   · **The PHOTOGRAPH behind the band genuinely is upscaled.** `public/home-cta-site.webp` measures
     **1584x672** - read out of the file's own VP8 header, not assumed. The band is full-window and
     160px tall, so `cover` scales by WIDTH: 1.21x at a 1920 window, 1.62x at 2560. No CSS removes
     that. **CONTENT, owed and already logged on 2026-09-16: a re-crop at 3200px or wider**, in the
     band's own ~10:1 shape rather than 2.36:1, so `cover` stops throwing away two thirds of the
     frame's height as well.
  ⚠️ What was NOT changed: his four greys. They are the kit's, shared with moedatech.net, and they
  only mean anything together - recolouring one to gain contrast here would make this app's agent a
  different character from the marketing site's, with nothing saying so. If he still reads dull on
  the next look, that is the lever, and it is a decision rather than a fix.
  ⚠️ Verified: typecheck, lint (0 errors), 32 passing across the CTA and Mansour suites, and
  **209 files / 3522 passing, 7 skipped** serially. The 3 unhandled errors are `intercom-widget`'s
  two and `suppliers-remove-and-pick`'s one, both pre-existing.
  🔴 NOT seen rendered after the removal - the band needs the dashboard, and the screenshot that
  prompted this is of the state BEFORE it.

- **2026-09-17 - The intake panel takes the screen's edge, wears the catalogue's own drawings, and a picked machine collapses the row to ONE pill.**
  Owner, on the first build: *"it must be the same as side panel in the prototype as side panel on
  the edge of the screen and feels like read panel not a card, also fix the padding between the titel
  text and text box also use the taxonamy image not this fallback icon and put the unit 2 x icon .
  equipment name like this and clicking on a request in the project will show one single pill show
  the project-request equipment"*.
  (1) **The rail is a BAND of the screen.** `AppShell` caps its main at `PAGE_MAX` and gutters it,
  which is right for a page and wrong for a panel: inside that column the rail floated with page
  ground either side of it and read as a card. The row breaks out with `mx-[calc(50%-50vw)]
  w-screen`, symmetric so it needs no mirror rule, and pulls up through the main pad so the panel
  starts at the top. The gutter it gave up comes back on the COLUMN, so the box keeps its margin
  while the panel keeps the edge. Same argument the requests rail settled on 2026-09-12: a band takes
  ONE edge, not four.
  (2) **Room under the question.** The heading takes `mb-7`; deleting `intake.subheading` yesterday
  took the gap with it and the box sat against the title.
  (3) 🔴 **The pictures are the CATALOGUE's, and the first cut was matching the wrong thing.**
  ~~The artwork was looked up among his own requests by name.~~ It missed nearly every time, which is
  why he was seeing the grey glyph: `itemName` joins the subtype and the size with a middot while the
  chart runs the category in front of both, so the two strings are never equal. The app taxonomy TREE
  is matched instead, on TOKEN CONTAINMENT - a node matches when every word of its name appears in
  the line, and the longest such node wins, so «Excavator» never beats «Crawler Excavator» for a
  crawler. One-directional on purpose: the line may say more than the node, never less, or «Crane»
  would answer for «Tower Crane». It also covers a WORK ORDER, which has no request to borrow a
  picture from.
  ⚠️ **One kind of asset now, so one fit.** This tree carries the flat DRAWING, so it is
  `object-contain scale-[1.34]` and never `object-cover` - cropping a drawing enlarges its own
  transparent margin rather than the machine. `imageIsPhoto` went with `my-requests`.
  (4) **«2 ×» leads the row**, his own spelling, then the picture, then the name. Drawn only above
  one.
  (5) **A picked machine collapses the floor to ONE pill**, «project · machine», with the ✕. The
  chips are how he CHOOSES; the pill is what he chose, and leaving the rest beside it would make the
  row state the question and the answer at once. Only a project picked still draws the project chip
  and its machines.
  Files: `src/lib/contract/taxonomy-icons.ts` (`namedIcons` / `iconForName`, new),
  `src/components/create/RequestsRail.tsx`, `src/components/screens/Intake.tsx`,
  `tests/unit/{intake-rail,intake-floor}.test.ts`.
  ⚠️ **A `not.toContain` failed on its own explanation, for the fourth time in this repo.** The note
  above the `<img>` names `object-cover` while saying it must never be used, so the case now slices
  the CLASS attribute rather than reading the file. `basis-[34rem]`, `object-contain` and the CTA
  halo were the other three.
  ⚠️ Verified: typecheck, lint (0 errors), **209 files / 3522 passing, 7 skipped** serially. The 3
  unhandled errors are `intercom-widget`'s two and `suppliers-remove-and-pick`'s one, both
  pre-existing. One earlier run of the same tree reported two timeout failures that a re-run did not
  reproduce - contention on this machine, which this log already records for the canvas suites.
  🔴 **STILL NOT SEEN RENDERED**, and it cannot be from `/dev/preview`: the rail is gated on a real
  session, so a specimen draws nothing. `npx next dev`, sign in, `/create`. The full-bleed breakout,
  the Arabic mirror and the phone sheet are all measured facts that want one look.

- **2026-09-17 - The dashboard's tabs are the HEADER's pill, inverted.**
  Owner, on yesterday's row: *"the tabs doesnt feel ui consistency with the header tabs i dont know
  but i dont like them"*.
  ~~A bordered box per tab, each carrying a 30px navy plate with the section's glyph, the name at
  `text-body` extrabold, and the count in a filled chip.~~ Three devices this product's own tabs do
  not use - and `AppNav`'s own note had named the fault before it was made: *"a row of four
  icon-plus-label pairs reads as a toolbar rather than as the top of a site"*. Beside a header of
  plain words in lozenges it read as another product's chrome, which is what he was looking at.
  **It is `AppNav`'s recipe to the pixel now** - `rounded-full px-4 py-1.5 text-meta`, no border, no
  glyph - with the fill INVERTED, because this row sits on the page rather than on the navy bar: the
  header draws the place you are on as a WHITE lozenge on navy, this draws it as a NAVY lozenge on
  white, and the resting tab is plain `navy-mid` text with a `surface2` hover.
  ⚠️ **The count rides INSIDE the label's run**, `ms-1.5 tabular-nums`, never a chip: the header's
  tabs carry no badge, and a filled pill inside a pill was half of what made the row read as a
  toolbar. It is still a dash until the block answers.
  ⚠️ Same padding in both states, which is the rule the header's pill was written to keep - the row
  must not shift by a pixel when the open tab changes.
  ⚠️ `VIEW_ICON` and the `Icon` import went with the plates rather than being left unused.
  Files: `src/components/home/HomeHub.tsx` (`DashboardTabs`).
  ⚠️ Verified: typecheck clean, lint 0 errors, 10 passing across the two dashboard suites - they pin
  the RULES (mounted not unmounted, the count reported up, the dash, the URL), none of which the skin
  touches. **SEEN RENDERED** through the `dashboard-tabs` specimen, which is how the old row was
  judged and how this one was.
  ⚠️ The browser tool's `zoom` returned blank frames and its screenshots timed out repeatedly on this
  machine; the picture that settled it was a plain full-frame screenshot on a second attempt.

- **2026-09-16 - A National Day SEASON: nine of the kit's motifs across four surfaces, behind one attribute, gone by itself on 1 October, and the brand orange does not move.**
  Owner: *"can i do a national day version that stay until 1-10 and it is another design theme not
  replacing ours so maybe just a flag"*, handing over the Flutter decor kit and a screenshot of the
  app's own green header. Asked where it should reach and whether the orange goes with it, he
  answered *"header and some decorations across screens and elements"*, *"orange stays"*, today to
  1 October date-gated with a kill switch, and both locales with the Arabic wording kept.
  🔴 **The whole design is that NOTHING is redefined.** `layout.tsx` writes `data-season="nd"` on
  `<html>` and a block at the foot of `globals.css` is scoped under it. Not one token changes value
  while it runs, and a case reads the stylesheet and fails on any `--x:` assignment inside that
  block. The reason is not caution: this app already spends green on `--ok` («it happened» - the
  posted tick, the met term, the paper on file), so a celebration borrowing it would give one colour
  two meanings on one screen, and repainting `--brand` would move every CTA in the product for a
  fortnight. The seven seasonal tokens are ADDITIVE (`--nd-*`): a surface opts into one, no surface
  loses one.
  **Where each motif went, and it is the MAPPING that is the decision** (owner, on the first cut:
  *"use more elements and decorations from the prototype i gave u"*). The kit names the surface each
  piece is for, and nine of its eleven are now placed:
  (1) **The bar**, on every route: the three-stop gradient, a 20px dot lattice at 10% white, the
  four-palm GROVE at 16%, and one rank of gold Najdi triangles (6px at a 12px pitch) along the
  bottom edge. That is the app's own screenshot, drawn with the app's own numbers. Beside the
  wordmark, the season CHIP in its outlined gold weight - «96 National Day» / «96 اليوم الوطني» -
  which is the treatment «Beta» next to it already takes.
  (2) **The dashboard band** takes the eight-palm TREE LINE and the dot field, the ordinal MARK on
  its trailing edge (96 outlined over a gold hairline, the kit's own reason kept: *"solid white
  makes it a heading - it is a mark"*), and the DUNE SWEEP cutting its bottom edge into the page's
  own colour. The kit is explicit that eight palms *"need room to work - it is for a splash or a
  role gate, not a 66 dp bar"*, which is why the bar keeps four cut-off trees and this 160px
  full-window band gets the line.
  (3) **The guest wall's head strip** - the app's own role gate - takes the gradient, the dots and
  the INTERLOCKING Najdi band (the woven rank rather than the single row of spikes), with the chip's
  PALE weight on it, which is the kit's own light-surface pairing. Its body takes one oversized
  CORNER PALM at 10% of the flag's green.
  (4) **The intake card** takes the quiet seam on its bottom edge, and nothing else: it is the first
  screen a renter meets and the box under it is where he types.
  🔴 **TWO of the eleven are deliberately NOT carried**, and a case records each so the next reader
  meets them as decisions. **Confetti** would fire over the dashboard's own «your request is
  posted» tick, which is the one moment in this product that is allowed to celebrate something.
  **The corner ribbon** marks *"one item as part of the campaign"* - nothing here is part of a
  campaign, so on a request tile or a bid card it would be a claim about the offer.
  ⚠️ The band's navy, the photograph behind it, its one orange word and its orange button are all
  unchanged, and so is every card the skin does not name.
  Files: `src/lib/season.ts` (new), `src/lib/flags.ts` (`NATIONAL_DAY_ENABLED`),
  `src/app/globals.css` (7 tokens + the seasonal block), `src/lib/ds-colors.ts`,
  `src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/home/CtaBanner.tsx`,
  `src/components/common/GuestWall.tsx`, `src/components/screens/Intake.tsx`,
  `public/nd96-{palms,treeline,corner-palm,dune}.svg` (new), `src/lib/i18n/{en,ar}.ts`
  (`season.nationalDay`), `src/lib/uiPins.ts` (2.4 / 2.5 / 9.6 / 10.3, new),
  `src/app/dev/preview/specimens.tsx` (`national-day`, new), `tests/e2e/ui-shots.spec.ts`,
  `tests/unit/national-day-season.test.ts` (new, 31).
  🔴 **`max-sm:hidden` on the chip CANNOT WORK, and it was in the first cut before the compiled
  sheet said so.** Tailwind emits its utilities inside `@layer utilities`; the seasonal block is
  UNLAYERED, and unlayered CSS beats layered CSS outright whatever the specificity - so
  `[data-season="nd"] .nd-chip { display: inline-flex }` won at every width and the chip would have
  ridden the phone bar all fortnight. It typechecks, it lints, and it looks right on a laptop. The
  width is one `@media (width >= 40rem)` inside the seasonal block now, and the element carries no
  display utility at all. Found by reading `/_next/static/css/app/layout.css`, not by reasoning.
  Same family as `hidden md:grid` (2026-09-16) and `<Skeleton className="rounded-full">`
  (2026-09-12): two rules for one property, and the loser decided somewhere the call site cannot see.
  ⚠️ **The window is judged on RIYADH's clock**, UTC+3 with no daylight saving. A Lambda runs in UTC,
  so «until 1 October» read there takes the theme down at 03:00 Riyadh on the 1st and puts it up
  three hours late on the 16th. Two cases pin the pair of instants either side of that boundary.
  ⚠️ **It is the DATE that turns it on, not the flag.** `NATIONAL_DAY_ENABLED` is the kill switch
  OVER the window, for taking it down early or holding it off one environment. And the window
  RECURS - the dates carry no year - so next September it returns by itself and the mark reads 97.
  ⚠️ **The ordinal is derived, and its offset will drift.** 96 is a HIJRI count, so it cannot come
  from the 1932 unification (that gap is 94). It is `year - 1930`, checked against the 95th in 2025
  and the 96th in 2026. The Hijri year is shorter, so the two calendars will eventually slip a year
  past each other; a case pins today's answer so the correction arrives as a failing test.
  ⚠️ **Latin digits in both locales**, which is where the web departs from the Flutter kit's «٩٦».
  The rule is this app's, product-wide, since 2026-09-04.
  ⚠️ **The hosts carry their classes ALL YEAR and the date is read only in `layout.tsx`.** A
  component branching on the clock is either a hydration mismatch or a navy bar that flips green a
  frame after every cold load, for a fortnight. A case asserts `AppShell.tsx` never mentions
  `seasonAt`.
  ⚠️ **The backdrop is a SPAN, not a `::before`.** The header is `sticky z-30` and therefore opens a
  stacking context: a positioned pseudo-element paints over the logo and the tabs, and at
  `z-index: -1` it drops behind the header's own background and disappears. A sibling first in
  source needs no z-index at all.
  ⚠️ **The seam's colour is a token and only its SHAPE is a data URI.** A gold triangle baked into
  an encoded SVG is a colour no token can reach and no sweep can find - exactly the drift
  `palette-drift` exists to catch. The mask carries black because a mask reads alpha, never hue.
  🔴 **The band's seasonal layer must be declared AFTER its photograph, its two gradients and its
  multiply.** All four are at exactly `-z-10`, and among equals the last one painted wins - so above
  them the tree line is perfectly present in the DOM and invisible on screen. That is the CTA halo's
  own bug of 2026-09-16, in the same file, at the same depth, met a second time and caught by a case.
  🔴 **The corner palm shipped one pass at 220x190 and read as a pale smudge.** A palm taller than
  its host shows the middle of its own trunk and none of its crown, and the card body it sits in is
  about 100px. It is 142x124 now, with negative insets so the tree is CUT by the card's edge rather
  than standing politely inside it - the kit's word is «bleeding», and a palm with air on both sides
  of it is a sticker. Seen in a browser; from the source «oversized» is exactly what the kit asks for.
  ⚠️ **An edge gets ONE finish.** The band carried the seam in the first cut and took the dune sweep
  in this one; a cut and a rank of triangles an inch apart is two treatments of one line. The seam
  closes the bar, the role gate's strip and the intake card; the band is where the silhouette changes.
  ⚠️ **The role gate's ink is an arbitrary VARIANT on the element, never `color` in the seasonal
  block.** A colour set there would be unlayered and would beat `text-muted-dark` all year - the
  same trap that caught the header chip's `max-sm:hidden`, read the other way round.
  ⚠️ **Three of the four artworks are MASKS, not pictures** - the corner palm, the dune and both
  Najdi ranks are drawn black and painted with a token at the call site. A gold triangle baked into
  an encoded SVG is a colour no token can reach and no sweep can find, and the same mask marks a
  white card in green and a navy one in white.
  ⚠️ **`edit()` scripts must write a file in its OWN line endings.** `CtaBanner.tsx` and
  `GuestWall.tsx` are CRLF on disk and `Intake.tsx` is LF; a literal written with `\n` matches
  nothing in the first two, and a replace that did succeed would leave LF islands inside a CRLF file
  - which is the staleness `ui-pins.test.ts` has been failing on. `globals.css` had 160 of them
  before this was noticed, and was normalised.
  ⚠️ **The palms are a FILE, `public/nd96-palms.svg`, generated from the kit's own
  `_HeaderDecorPainter` maths** (the ANGLES table, `frond()`, `palm()`), so the two products draw
  the same tree. The kit forbids assets because a Shorebird patch carries none and a new `Icons.*`
  glyph is tree-shaken out of the release font; the web has neither constraint, and 6.3 kB of path
  data inlined into `globals.css` would be paid for by every reader all year. Out of season the
  selector never matches and it is never fetched.
  ⚠️ Verified: typecheck clean, lint 0 errors, the full suite serially, and three rulings
  break-checked one at a time - a token assigned inside the block, the attribute dropped from a
  selector, and `max-sm:hidden` put back on the chip; each went red alone. The 3 unhandled errors
  are `intercom-widget`'s two and `suppliers-remove-and-pick`'s one, all pre-existing.
  ⚠️ The guard that fails on an unscoped rule asks a QUESTION rather than holding a list: a rule is
  inert when its only declaration is `display: none`. The first version kept a list of class names,
  and a list that has to be edited every time a motif is added is a list that will one day be
  edited wrongly.
  **SEEN RENDERED**, which is how three of the faults above were found: all four surfaces, on and
  off, in EN and AR, and at a real 392px viewport where the chip and the mark both stand down.
  🔴 **`/dev/preview` does not hydrate on this machine and the specimen was NOT photographed through
  it.** A render-blocking Google Fonts `<link>` in `layout.tsx`'s `<head>` stalls Next's bootstrap
  scripts, so the page renders null and every specimen is a blank frame - `readyState` sticks at
  `interactive`. The pictures above were taken from a throwaway static page served out of `public/`
  carrying the compiled `layout.css` and the real class names, which is the whole of what the skin
  is; it has been deleted. The specimen is registered in `ui-shots.spec.ts` and wants one run on a
  machine where that page works.
  🔴 **NOT seen on the real signed-in bar**, which needs a session: what has been looked at is the
  skin against the header's own classes, never the decoration sitting behind the logo, the three
  nav tabs and the 34px avatar, bell and inbox.

- **2026-09-16 - The intake grows a side panel of his past requests; the chip strip moves INTO the selection, and the panel opens behind a toggle on a phone.**
  Owner, handing over `prototypes/intake-side-panel-v1.html`: *"can we remove the pills and show a
  side panel of his requests like his previous chats, grouped by a project - show only equipment
  names on the request"*, and *"add equipment image or icon with the unit before the name like this
  2 [ICON] EXCAVATOR 20 TON"*. Then, on the first cut, three corrections in one message.
  (1) **`RequestsRail`**, new: his projects, each opening to the machines already requested or
  ordered there. A row is `qty - picture - name`, in that order, which is his own shape. The grip
  resizes it (164-380px, remembered, `setPointerCapture`), and the drag reverses under `dir="rtl"`
  because the grip is on the TRAILING edge.
  (2) 🔴 **THE BEHAVIOUR IS THE OLD ONE, and the first cut got this wrong** (owner: *"what do u mean?
  the behaviour will not change from existing pills just ui"*). ~~Rows from `my-requests`, matched to
  a template by NAME.~~ The rows ARE the templates - `listTemplates`, the same list the chip's
  "start from" dropdown read - and a press hands `fetchTemplateTerms` the option itself. Nothing is
  matched, so nothing can miss. This is `ProjectChips.applyTemplate`, moved rather than rewritten.
  ⚠️ **The PICTURE is now the only thing looked up, and so the only thing that can fail.** A template
  carries no image, so the artwork is found by name among his own requests and falls back to a glyph.
  That is the right way round: a missing icon costs a small drawing, where a missed template cost the
  machine's stored terms and said nothing about it.
  (3) **The floor draws the chips ON A SELECTION** (owner: *"the row of project chips on the floor
  but i want it on a project selection to appear"*). Nothing until a project is picked; from then on
  its own chip with the X, and a chip per machine filed under it, so he moves between them without
  going back to the rail. ~~A single pill.~~
  (4) **On a phone the rail is a SHEET behind a toggle**, the way Claude and ChatGPT draw theirs
  (owner: *"make it like claude or gpt it opend the pannel through --- in mobile"*). 🔴 That closes a
  hole the first cut left open: with the rail merely `hidden` below `lg` and the strip deleted, a
  phone renter had no way to pick a project at all. Scrim, X and Escape, because a layer over the
  page with no way out is a trap.
  (5) 🔴 **`ProjectChips.tsx` is DELETED**, 634 lines, with its suite and three strings
  (`projects.chips.{pick,all,fewer}`). Not a taste call: `create-canvas-wiring` refuses a canvas
  component nothing imports, and it was right - this floor was its only caller. `label` and `ended`
  stay, read by the projects board and the move dialog.
  (6) 🔴 **`intake.subheading` is deleted** in both dictionaries. The box placeholder already types a
  real request through its example; the sentence was the same lesson a second time, and it had become
  a layout constraint of its own (one line, `sm:whitespace-nowrap`) for a line nobody read twice.
  Files: `src/components/create/RequestsRail.tsx` (new - `useRequestRail`, `RequestsRail`,
  `ProjectFloorChips`), `src/components/screens/Intake.tsx`,
  `src/components/create/ProjectChips.tsx` (deleted), `src/lib/i18n/{en,ar}.ts`,
  `src/lib/uiPins.ts` (15.1 / 15.2 / 15.3 / 15.4, new), `tests/unit/intake-rail.test.ts` (new, 19),
  `tests/unit/intake-floor.test.ts` (rewritten), `tests/unit/project-template-line.test.tsx`
  (re-pointed at the rail), `tests/unit/mansour.test.tsx`,
  `tests/unit/project-chips-rows.test.tsx` (deleted).
  ⚠️ **ONE hook for both surfaces.** `useRequestRail` is called once by `Intake` and handed to the
  rail and to the floor. Two copies would be two fetches and, worse, two answers to "which machine is
  chosen" - and they would disagree the first time either was pressed.
  ⚠️ **A project's machines load LAZILY, and are cached.** `listTemplates` is a `fetchChart` per
  project, so loading every project on mount would put one request per project in front of the first
  screen a renter meets, for a list most of which he will never open. The chosen project loads
  anyway, because the floor draws it.
  ⚠️ **A machine the catalogue never named LISTS by its reference and is never TYPED.** A template's
  `machine` is `ChartItem.label`, absent for an off-catalogue line; the row needs a label to be
  pressed by, and the box must not receive one. Typing it would be the "12 x null" bug of 2026-09-12
  in a different costume. The terms still apply - they are keyed on the item, not on its name.
  ⚠️ **The FIT is the request rail's ruling, copied deliberately** - a photograph takes
  `object-cover`, a taxonomy drawing `object-contain scale-[1.34]`, because cropping a drawing
  enlarges its own transparent margin rather than the machine. `onError` falls back to the glyph: the
  taxonomy objects are not public-read on staging, so a well-formed URL answers 403.
  ⚠️ The rail is withheld entirely for a guest and for a renter with no projects - no caption, no
  empty state, no band of chrome on the first screen anybody meets.
  ⚠️ Verified: typecheck, lint (0 errors), **208 files / 3483 passing, 7 skipped** serially, and two
  rulings break-checked on the first cut (the row order reversed, the two fits collapsed into one) -
  each went red. The 3 unhandled errors are `intercom-widget`'s two (jsdom has no pointer capture)
  and `suppliers-remove-and-pick`'s one, all pre-existing.
  🔴 **NOT SEEN RENDERED, and it cannot be from `/dev/preview`**: the rail is gated on a real session,
  so a specimen would draw nothing. `npx next dev`, sign in, `/create` - the two-column layout, the
  Arabic mirror, the phone sheet and the grip all want that look.
  ⚠️ **A scripting trap, met three times in this session.** A `python - <<'PY'` heredoc whose body
  contains an ODD number of apostrophes (ordinary prose - "the owner's call") dies with
  «unexpected EOF while looking for matching `'`», because the command is itself wrapped in single
  quotes before bash sees it. Write the script to a FILE and run that file; do not pass prose through
  a shell heredoc.

- **2026-09-16 - The dashboard is THREE TABS: requests, suppliers, projects, one at a time.**
  Owner: *"for dashboard can we have subtabs to show requests-suppliers-projects or how do u suggest
  we can show them without scrolling in one page"*, then his pick of the three-tab shape over the
  two alternatives put to him.
  🔴 **The cause of the scrolling was NOT the number of blocks.** Both embedded surfaces render
  their WHOLE contents - `SuppliersPage embedded` draws every supplier row, `ProjectsSurface
  embedded` every site - and neither caps itself, so the page grew with the account. The
  alternative offered (requests full width, suppliers and projects side by side, each capped at a
  few rows behind a «See all») fixes that cause and was REJECTED in favour of the tabs.
  ⚠️ **The cost, stated at the time and taken anyway**: two of the three states are now behind a
  press, and this rebuilds - as subtabs - the very tabs that were deleted when suppliers and
  projects were moved ONTO this page, on the reasoning still written in `HomeHub.tsx`: *"a tab that
  has to be remembered is a tab that is not used"* (2026-09-01 / 2026-08-30). Those two comments are
  left in place: the reasoning did not stop being true, it was outvoted.
  🔴 **Every block stays MOUNTED and the closed two are `hidden`,** never conditionally rendered,
  and the three consequences are the whole design: the COUNTS on all three tabs are real rather than
  only the open one's; the three reads happen exactly as they did before this change; and a renter's
  search box, his filters and his half-made supplier group survive a trip to another tab.
  **The tabs ARE the section headings**, so the three blocks drop their own header (`hideHeading`) -
  otherwise the page said «My Suppliers · 42» twice, one row apart, which is the duplication the
  owner has already objected to once (2026-09-02). ~~Each tab carried the section's 38px navy plate
  and glyph.~~ Corrected the next day; see the entry above it.
  ⚠️ **A count is REPORTED UP (`onCount`), never fetched again here.** Each block is the only thing
  that holds its list. `null` until the read lands, and the tab draws «–»: a 0 on a list still
  loading is a wrong statement rather than a pending one.
  ⚠️ **The open tab is in the URL (`?view=`), written with `replaceState`** - the workspace's own
  ruling (2026-09-06), for the same reasons: a reload and a Back from a supplier profile land on the
  tab the renter left, and the browser's own Back still leaves the page instead of walking three
  tabs. The default is not written, so a bare `/` is the requests tab.
  ⚠️ **`HomeRequests` renders NOTHING on an account with no requests** (`if (groups && !groups.length)
  return null`), which behind a tab is a blank pane rather than a block that simply is not there. The
  pane draws one line, `home.noRequestsYet`, naming the intake band already on screen above it rather
  than adding a second door.
  Files: `src/components/home/HomeHub.tsx` (`DashboardTabs`, new and exported),
  `src/components/home/HomeRequests.tsx`, `src/components/suppliers/SuppliersPage.tsx`,
  `src/components/projects/ProjectsSurface.tsx` (`hideHeading` + `onCount` on all three),
  `src/lib/i18n/{en,ar}.ts` (`home.noRequestsYet`, new), `src/lib/uiPins.ts` (10.8, new),
  `src/app/dev/preview/specimens.tsx` (`dashboard-tabs`, new),
  `tests/unit/dashboard-tabs.test.ts` (new, 7 cases), `tests/unit/dashboard-spacing.test.ts`.
  ⚠️ `DashboardTabs` is exported for `dev/preview` and holds NO state of its own: the dashboard needs
  a signed-in renter with requests, suppliers and sites, so the row could not otherwise be looked at
  while it was being built.
  ⚠️ Checked before relying on it: nothing inside the three blocks measures itself at mount
  (`ResizeObserver` / `offsetWidth` appear only in `RowMenu`, which measures when the renter opens
  it), so a block laid out at 0px while hidden is not a hazard here. A block that starts measuring
  would need `hidden` reconsidered.
  ⚠️ Verified: typecheck clean, lint 0 errors, 69 passing across nine suites (tabs, spacing, bid
  rail, bubble, suppliers, shell-nav, pins, palette, font), and the mounted-not-unmounted rule
  break-checked - one case went red. The one unhandled error in `suppliers-remove-and-pick` is
  pre-existing (2026-09-09). **SEEN RENDERED**, EN and AR, through the new specimen - the Arabic
  mirror needs no rule of its own, the flex row reverses.
  🔴 **NOT seen on the real dashboard**: that needs a signed-in renter with all three lists, so what
  has been looked at is the tab row, and the blocks under it are pinned by tests only.

- **2026-09-16 - The comparison's sorted money head stops spilling over the row beneath it, and the table finally has a specimen.**
  Owner, on a screenshot of the table with both money groups open: *"the ui crash if we opened them
  together"*.
  **Reproduced and MEASURED before anything was changed.** With «Per cycle» pressed - which opens the
  grand total beside it (`OPENS_WITH.cycle`), so six money columns share the width - the sorted
  DELIVERED COST head wanted **85px at 1366 and 57px at 1700** inside a band that is a fixed **48px**.
  Nothing clips it, so the caption «rental + mobilization + demobilization - one cycle» drew straight
  over its own `border-b` and across the first row of figures. That is the slicing in his screenshot.
  🔴 **The cause was the caption sharing a ROW with the two controls.** It sat inside the sort
  button, whose flex row also carries the i and the »; the caption was therefore laid out in what
  those left over - about 123px of a 165px column - and needed three lines. As a full-width sibling
  under the name row it takes two. Measured after: every head has **20-34px of spare**, at 1366, 1440
  and 1700, in BOTH locales. Before: +37px of overflow.
  ⚠️ **Raising 48 is not available.** `HEAD`'s own note says this number and the supplier column's
  96px are ONE geometry (96 is two of these bands), so growing the head slides every figure out of
  line with the supplier beside it. The content had to fit; the box could not grow.
  ⚠️ The cost, stated: the caption is no longer part of the sort target. The NAME still is, which
  is what that rule was always about.
  Files: `src/components/workspace/CompareMatrix.tsx` (`MoneyHead`),
  `src/app/dev/preview/specimens.tsx` (`compare-matrix`, new), `tests/e2e/ui-shots.spec.ts`.
  🔴 **A SPECIMEN, at last, and it is the real point of this entry.** This table has produced
  FIVE layout faults - the phantom vertical scrollbar twice, the terms strip drawing through the
  equipment rail, the strip ending short of its container, and now this - and not one of them could
  be looked at without a signed-in renter holding bids, so every one was found on a screenshot of
  production. `/dev/preview?s=compare-matrix` draws six offers and nine terms, which is the shape the
  faults appear at; a two-bid fixture fits any width and proves nothing.
  ⚠️ It is deliberately NOT in `ui-shots.spec.ts`'s list: it does not render inside that runner's
  392px clip, and a runner that is red for everyone is a runner nobody runs. **The table's phone
  width is a real open question and this does not answer it.**
  🔴 **Reported, NOT fixed - at 1024 and 1440 the EQUIPMENT rail and the last term column fall
  outside the scroller.** Measured with the terms open at 1024: the strip is 1482px inside a 976px
  box, so 506px of it - the whole equipment door included - is reachable only by scrolling sideways,
  with nothing on screen saying so. It is the same family as the four above and it wants its own pass.
  🔴 **I EMPTIED `CompareMatrix.tsx` mid-session and restored it from `HEAD`.** `io.open(path,
  "w")` truncates at the OS level BEFORE anything is written, and my script then threw on an encoding
  error - so 1575 lines became 0 bytes and no write happened. **This repo already recorded this exact
  trap on 2026-09-14** and I hit it anyway. The rule, again: build the new text, assert it, and only
  then open for writing - or write through a file the tool wrote, never through a shell heredoc.
  Nothing was lost (the file was unmodified at `HEAD`), which is luck, not method.
  ⚠️ Verified: typecheck clean, lint 0 errors, 66 passing across `compare-matrix` and
  `compare-sheet`, and the fix measured in a real browser at three widths and two locales - which is
  how the fault was found and the only way it could be judged, since jsdom lays out nothing.
  🔴 **NOT photographed after the fix.** The throwaway probe that took the measurements went
  flaky on its last run and saved a blank frame; the numbers above are the evidence, not a picture.
  The both-groups-open state wants one look.
  ⚠️ Found while running the gate and NOT mine: `/browse` crashed on `pin("browse-controls")`, an
  id another session added to `BrowseSurface.tsx` without registering it, and `uiPins.ts` briefly
  failed typecheck on a `parent` field its own type does not carry. Both were resolved by that
  session while this work was in flight.

- **2026-09-16 - Browse stores: the heading shares the row with its two controls, the «All» pill names what it restores, and the directory is 20 to a page behind two arrows.**
  Owner, one batch: *"Most popular suppliers will have the search bar and all cities as sections in the
  same row, make the search bar and filter with same size and height. then the all pill call it all
  stores and then show 20 per page then second page will be by <> and the horizantal scroller of the
  tabs make it thinner and nicer"*.
  (1) **ONE row.** ~~A title band, then a control band under it.~~ Two bands spent a third of the page
  above the first card. `flex-wrap`, never a bare row: below `sm` a `text-shop-h1` heading plus a
  search field plus a city cannot share a line, and forcing it pushes the DOCUMENT wider than the
  phone - the fault audited out of three surfaces on 2026-09-08. **Seen wrapped at 392 in both
  scripts.**
  (2) **The two controls share ONE skin**, `CONTROL_SKIN`, so they cannot drift apart in height again.
  The city used to fall through to `Dropdown`'s `field` tone - house tokens, `py-2` - so it stood 8px
  shorter than the input beside it and in a different grey. `triggerClass` is a per-call override and
  reaches no other dropdown in the product.
  (3) **«All» → «All stores»** / «كل المتاجر». It is the leading pill on a rail of real category
  names, and one bare word did not say what pressing it restores.
  (4) 🔴 **20 a page, `‹ ›`, and the page REPLACES.** This reverses 2026-09-03's *"appending rather
  than replacing, because a renter who has scrolled to the bottom of sixty cards is not asking to be
  sent back to the top"*. At sixty that was right; at twenty the grid is one screen, so a page is a
  page. The dedup branch went with the append.
  (5) **The rail is thinner**: the pill from ~34px to ~28px, and `.shop-rail` in `globals.css` gives
  the scroller a 6px bar on a transparent track instead of the browser's ~15px of chrome.
  Files: `src/components/stores/BrowseSurface.tsx`, `src/app/globals.css` (`.shop-rail`),
  `src/lib/i18n/{en,ar}.ts` (`allCategories` reworded, `prevPage`/`nextPage` new, `showMore` and
  `storesAcross` deleted), `src/lib/uiPins.ts` (61.1 / 61.2 / 61.3, new),
  `src/app/dev/preview/specimens.tsx` (`browse-directory`, new), `tests/e2e/ui-shots.spec.ts`,
  `src/app/dev/preview/page.tsx`.
  🔴 **The count beside the title is GONE**, at the owner's call. It read `stores.length`, which with a
  pager is the PAGE's count - «20 stores across Saudi Arabia» on every page, a FALSE statement about
  the market rather than a stale one. The true total cannot reach this screen: both call helpers unwrap
  the envelope to `.data` before the BFF sees `meta.totalPages`, which is the same reason `more` is a
  heuristic (a full page probably has another behind it). That is also why the pager states no
  «of N» - it would be a number we do not have, and why «Next» can be live on the last page and
  correct itself on arrival.
  ⚠️ **Page one can come back LONGER than it asked for** - the directory merges the featured suppliers
  into it - so «20 per page» is 20 from page two on and may be a card or two more on page one. The
  backend's own behaviour, unchanged by this.
  ⚠️ The pager is withheld inside a preview and when page one is the whole directory: two dead arrows
  say only that there is nothing to press. `previewCount` has no caller today, so that arm is unexercised.
  🔴 **A harness bug found by the pictures, and fixed: EVERY phone-width specimen shot was a lie.**
  `/dev/preview`'s `main` is a flex COLUMN, so its `data-shot` child is a flex ITEM with
  `min-width: auto` - it grew to its own MIN-CONTENT rather than to the viewport, so a full-width
  surface photographed at 392 laid itself out at **791px** and came back with rows that had not wrapped
  and a column of cards sliced off under `dir="rtl"`. That reads as a layout bug in the surface and was
  a bug in the preview page. `minWidth: 0, maxWidth: "100%"` unless an explicit `?w=` asks for one
  width. **Measured: 819 → 392 at a 392 viewport, both scripts.** Every earlier «seen rendered at
  392» in this log was taken through that fault.
  ⚠️ The browse specimen bends the specimen rules and says so: `BrowseSurface` takes no data props, so
  the fixture answers its three fetches locally, in the component's own render body, scoped to those
  paths. Still no network. It also needs the WHOLE `StoreCard` shape - the card reads
  `categories.length`, and a short fixture threw a client-side exception and rendered nothing at all.
  ⚠️ Verified: typecheck, lint (0 errors), the full suite serially (**3465 passing, 7 skipped, 207
  files**; the 3 unhandled errors are `suppliers-remove-and-pick`'s, pre-existing since 2026-09-09),
  and 57 across the pins, palette, font, stores and wording guards. **SEEN RENDERED**: all four
  pictures - EN and AR at 392 and 1024 - and the Arabic mirror is what caught the harness fault.
  ⚠️ The Playwright shot lane times out on the FIRST (cold-compile) shot of a specimen on this
  machine; a warm re-run passes. The four pictures above were captured directly against the same
  preview server.

- **2026-09-16 - The CTA band drops its paragraph, and Mansour SPEAKS the headline.**
  Owner: *"can u redesign the cta and remove its subtext and use this kit as mansour ai agent
  design, make the cta professional catchy and hd"*.
  (1) **`home.ctaSubtitle` is deleted from both dictionaries.** *"Describe what you need in plain
  words. Our AI assistant matches you with the right suppliers"* restated the headline in smaller
  type, and it was the only thing between the copy and the 160px band's own edges.
  (2) **The agent stands in front of the sentence.** The band has coloured one word - AI - since the
  comp landed, with nothing behind it but a photograph of a site. He is this product's face for that
  word (he writes the equipment line on the intake, he holds the processing ring), so the pattern is
  the intake's own: *"put mansour before the question"* (2026-09-13). 104px, `pose="viewer"`.
  (3) **`Mansour` learned the kit's four gaze POSES**, `mansour-poses.json` verbatim - the README's
  third way of using him. A pose is an inline STYLE plus `animation: none`, never a swapped
  `transform` attribute: the attribute is the rest pose the keyframes are written against, and
  without the `animation` half the idle wander overrides the transform on its next frame and he
  twitches back out of the pose once every nine seconds.
  Files: `src/components/Mansour.tsx` (`POSES`, `MansourPose`, the `pose` prop),
  `src/components/home/CtaBanner.tsx`, `src/lib/i18n/{en,ar}.ts` (`ctaSubtitle` deleted),
  `tests/unit/cta-banner.test.ts` (new, 14 cases).
  🔴 **`pose="send"` is the obvious choice and is WRONG.** It looks down at a button; the button is
  across the band, and that row mirrors in Arabic while the pose matrices do not - he would meet it
  in English and stare into the margin in Arabic. `viewer` is direction-neutral.
  🔴 **FOUR faults that read correctly in the source and rendered wrong.** All four were found by
  measuring the element in a browser, and each has a case:
   · **`hidden md:grid` drew NOTHING at any width.** Both are the `display` property, a media query
     adds no specificity, and Tailwind emits `hidden` last - so the base class won everywhere. The
     band shipped one pass with no agent on it. `max-sm:hidden` over a plain block has no ordering
     to lose.
   · **The halo was `-z-10` and invisible.** The band draws its two gradients and its multiply at
     exactly that depth, so it painted UNDER them. Nothing needs a z-index: the halo is absolute and
     he follows it in source order.
   · **`grid place-items-center` collapsed the halo to 0x0.** That property sets `justify-self` /
     `align-self` on every grid child INCLUDING an absolutely-positioned one, which shrinks it to
     its own content - and a decorative span has none.
   · **`-inset-6` generated no rule at all**, measured: `top/right/bottom/left` came back as the
     static position and the span was 0x0 a second time. It is `inset-0 scale-[1.6]`.
  ⚠️ **The halo is figure-and-ground, not decoration.** He is grey by the kit's own rule (*"grey on
  purpose so he sits on any brand colour"*), which on a navy band leaves nothing separating him from
  the ink. It is `--brand` at 30%, the same orange as the word beside him and the button opposite,
  so the band carries ONE accent in three places rather than three colours.
  ⚠️ **Nothing may clip him**: the kit keeps `overflow: visible` on the svg because the sway rotates
  the body and the gear teeth leave the 120x120 box, so he sits inside the band's reading gutter and
  never against its edge, where the band's own `overflow-hidden` would take the teeth off.
  🔴 **«HD» is NOT delivered, and cannot be from this repo.** `public/home-cta-site.webp` is
  **1584x672**, measured. The band is full-window and 160px tall, so `cover` scales by WIDTH: 1.21x
  upscale at a 1920 window, 1.62x at 2560. That is the softness, and no CSS removes it.
  **CONTENT, owed: a re-crop at 3200px wide or more**, in the band's own 10:1 shape rather than
  2.36:1, so `cover` stops throwing away two thirds of the frame's height as well.
  🔴 **A `` written through an edit script landed as a literal BACKSPACE in the new test**, and
  two assertions were VACUOUS for one pass - they passed on a band drawing no agent at all. Same
  trap as 2026-09-12 (three source files). The suite now scans ITSELF for control characters, with
  the scan written on `charCodeAt` and no escape sequences: writing the range as a unicode escape in
  a regex literal is how the second copy got in, because the tools that put the file on disk expand
  those escapes into the very characters being hunted.
  ⚠️ A case strips JSX COMMENTS before asserting: the note above the halo names `-z-10` three times
  while saying it must never be used, so `not.toMatch` failed on its own explanation. Third time in
  this repo (`basis-[34rem]`, `object-contain`).
  ⚠️ Verified: lint 0 errors, 74 passing across the seven CTA / agent / guard suites, and both new
  rulings break-checked (the `animation: none` removed, `pose="send"` forced); each went red.
  **SEEN RENDERED** at 1568px on a local dev build - which is how all four layout faults were found.
  🔴 **NOT seen in Arabic**, and that is where `viewer` earns its place; it wants one look.
  🔴 **`npm run typecheck` is RED on a tree I did not touch**: three errors in `src/lib/uiPins.ts`
  (`'parent' does not exist in type 'PinEntry'`), from another session editing that file during
  this work. `/browse` also crashed mid-session on `pin("browse-controls")` before that same session
  registered the id. Reported, not fixed - it is somebody's half-finished change.
  ⚠️ `npm run dev` is still broken here (`--no-experimental-webstorage is not allowed in
  NODE_OPTIONS`) and the flag is in the SCRIPT, not in Next: `npx next dev` runs fine. Worth fixing
  in `package.json`, and not fixed here.

- **2026-09-15 - The demo is over: a request with no bids is back on the `/requests` rail.**
  Owner: *"i made a recent change here for demo purposes where requests are not visible in his requests
  feet if no bids arrive, undo this"*.
  `HIDE_BIDLESS_REQUESTS` is `false`. That is the whole undo, which is what the flag was shaped for
  yesterday (*"Set it `false` and the rail is exactly what it was - there is nothing else to undo"*) -
  the two guards and the filter stay in place, inert, and the reason the behaviour must not be kept is
  still stated where it belongs.
  Files: `src/lib/flags.ts`.
  ⚠️ **One case goes QUIET, not red.** `it.runIf(HIDE_BIDLESS_REQUESTS)` describes the demo itself, so
  the suite reports 6 passing and 1 skipped rather than failing. The two GUARD cases - the landing
  fallback and the never-empty rail - hold either way, which is the half worth keeping.
  ⚠️ The blind spot logged with it is now moot while the flag is off: nothing reads `totalBids` to
  hide anything, so a request whose offers all arrived through the renter's own shared link is on the
  rail like any other. It comes back the day the flag does.
  ⚠️ Verified: typecheck, lint (0 errors, warnings pre-existing), 7 in the flag's own suite (6 passing,
  1 skipped by design) and 59 across the workspace, rail-fit, rail-bleed and request-label suites. NOT
  seen rendered - `/requests` needs a signed-in renter, and this restores the behaviour that shipped for
  weeks before yesterday.

- **2026-09-15 - The machine panel shows the WHOLE machine again: `cover` was chosen on a measurement taken in the wrong box.**
  Owner: *"the equipment in the machine panel are so zoomed in that make the equipment not all
  appear"*.
  🔴 **My own error, and worth naming precisely.** `object-cover` was adopted on 2026-09-14 after a
  side-by-side probe that looked right - but the probe was built at **585x450** and the panel is
  **366x450**. At 585 the crop is 29% and the machine survives; at 366 it is **39%** and the bucket
  and the counterweight are both cut off. A later `scale-[1.18]` on top of `cover` took it to ~48%,
  which is the state he reported. The lesson is the one this repo already records for the rail: the
  fit is a property of the BOX, so the probe has to be the box.
  **Re-measured at the real 366x450 on the live asset**, five fits side by side:
   · `contain`             whole machine, 177px of band
   · `contain` **x1.2**    whole machine, 122px of band  ← ships
   · `contain` x1.3        whole machine, 95px, nothing to spare
   · `contain` x1.4 / x1.5 the counterweight clips
   · `cover` (x1.65)       bucket and counterweight both gone
  1.3 is the ceiling for THIS render, so 1.2 ships: it eats the empty margin these photographs are
  shot with and leaves headroom for a machine drawn wider than an excavator. A case pins the ceiling.
  Files: `src/components/create/MachineCard.tsx`,
  `tests/unit/machine-card.test.tsx` (the fit block rewritten, 5 cases).
  ⚠️ **The band is what a 1.34 landscape costs in a 0.81 portrait box, and no CSS removes it.**
  `cover`, `contain` and `scale` all clip from the same source ratio; they only move WHERE the loss
  lands. Every value between «no band» and «no crop» is a point on one line, and this picks the point
  nearest «no crop» that still spends the margin.
  🔴 **CONTENT, still owed, and it is the only real fix**: a SQUARE master. Measured across the three
  surfaces - card 366x450, rail circle 52x52, processing ring 134x134 - a square source crops 19% /
  0% / 0% against today's 39% / 25% / 25%, and two of the three boxes are circles, which are square
  by definition. **1200x1200.** It also retires this scale entirely.
  ⚠️ If the square master ships, `RequestRail`'s `scale-[1.34]` must become **1** in the same
  deploy - it was derived as 52 ÷ 28 for a letterbox and is right today only by coincidence.
  ⚠️ The zoom is safe only because the panel is `overflow-hidden rounded-md`; without that clip it
  would spill over the four chips on the corners. A case pins it.
  ⚠️ Verified: typecheck, lint (0 errors), 33 passing in the card suite, the ceiling break-checked at
  1.45 - the new case went red. **SEEN RENDERED**: the five fits photographed at the panel's real
  size, which is what settled it.

- **2026-09-15 - On his own words the two lists stay LIVE and turn green, the chooser has ONE list view, and the escape row stops wrapping.**
  Owner, on two shots of the equipment card: *"if he confirms to use his own words the changes will be
  as follow: the type - size will stay be dropdown in case user want to select but still shown green
  ... also no need for saved as your own equipemtn etc just remove it and keep the equipment name
  field look green"*, then *"dont keep the search as another path just show equipment of same
  category and search bar with place holder search all equipment instead of text redirect ... with
  small show all in the end of the shown catelogie of the same type that will show all taxonamy
  too"*, and as a standing rule *"dont ever wrap this not in the equipment card"*.
  (1) 🔴 **The two flat green statements are gone and the CONTROLS wear the green.**
  ~~«Your own equipment» and «As described» replaced TYPE and SIZE on an off-catalogue line.~~ That
  was the prototype's shape and it closed the one door a renter on his own words might still want:
  reaching into the catalogue from the card without opening the panel. Both are real `SearchSelect`s
  again, skinned `border-ok/40 bg-ok-soft text-ok-deep`, and picking a type flips the line back to
  matched through the reducer that already did so.
  (2) 🔴 **The «Saved as your own equipment - X» strip is deleted**, with its two strings. It
  restated, in a full-width band, the name standing two rows above it - which is green now and says
  the same thing where his words actually are.
  (3) **ONE list view in the chooser.** ~~A «Search all equipment» LINK on the heading row, which
  swapped the heading, revealed the search box and widened the list in one press.~~ Three acts behind
  one word, and it read as a door to somewhere else. The box is simply always there with «Search all
  equipment» as its PLACEHOLDER, the list under it is the line's own family, and «Show all equipment»
  sits at the FOOT of that family, in place. `searchAny` is retired with the view it belonged to.
  (4) 🔴 **The escape row is one line again and CLIPS**, reversing 2026-09-14 (*"it WRAPS rather than
  clips"*, on the argument that a truncated question stops being a question). He looked at the
  two-line row and took the clip: a control that changes height rearranges the card under his eyes.
  The whole sentence is on `title`, one hover away.
  Files: `src/components/create/MachineCard.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`showAllTypes` new; `savedOwn`, `ownType`, `ownSize`, `searchAny` deleted), `src/lib/uiPins.ts`
  (17.8 / 17.9 / 17.10, new), `tests/unit/custom-equipment-canvas.test.tsx` (3 new cases).
  ⚠️ **The search box reads `rows`, never the family.** It says «all» and it means it: typing is
  asking for more, so a query reaches past the family without his having to widen anything first.
  The heading follows the query as well as the widening, or a search across the catalogue would sit
  under «Crawler types in our catalogue».
  ⚠️ **The green skin is APPENDED to `INPUT` and to the dropdown's field skin, never substituted**,
  and that only works because `--color-ok-*` is declared AFTER `--color-surface` and `--color-border`
  in `globals.css` - Tailwind emits it later, so it wins. Same mechanism `INPUT_ERROR` has always
  relied on. Class order in the attribute decides nothing, which is the `Skeleton` trap of
  2026-09-12 read the other way round.
  ⚠️ **SIZE is disabled on his own words and is green ANYWAY.** No type means no sizes, so the
  dropdown disables itself, and the base skin's `disabled:` rules would paint it the ordinary grey
  beside a green TYPE. `disabled:bg-ok-soft` and its two siblings are on the trigger for that reason
  alone, and a case pins it.
  ⚠️ **He CHANGED HIS MIND mid-batch on two of these.** Asked whether «Can't find the equipment you
  want?» should disappear in the own-words state, he answered *"i changed my mind keep it"* - so the
  escape row and the orange «won't reach Moedatech suppliers» note both stand, and the way to EDIT
  his words is still that row's «Keep my own words» door. The name box therefore stays READ-ONLY,
  which is the only reason the green is safe: one writer at a time.
  ⚠️ **The «Not matched» pill was NOT turned green.** He named the field, not the pill, and the pill
  is the one thing on that row still saying the catalogue came up empty.
  ⚠️ The «Show all» press is withheld while a query is running (the search already spans everything)
  and when the family IS the catalogue - otherwise it is a control that reveals nothing.
  ⚠️ Verified: typecheck, lint (0 errors), 88 passing across the eight canvas / card / guard suites,
  and all three new rulings break-checked one at a time - the green skin removed, `whitespace-nowrap`
  removed, the foot press forced off; each went red alone. 🔴 **NOT seen rendered**: the machine card
  has no specimen, the canvas needs a session, and `npm run dev` is still broken on this machine
  (`--no-experimental-webstorage is not allowed in NODE_OPTIONS`). The green is argued from the
  token declaration order rather than looked at; the clip and the foot press want one look on the
  next deploy.

- **2026-09-15 - The workspace's context bar leads with the machine's own picture.**
  Owner, on the navy bar reading «Riyadh — Al Olaya» over «Crawler Excavator · 20 ton ×2»: *"can u
  have the equipment image as circle on the left of this card"*.
  A 32px circle on the LEADING edge of the 44px control, so it mirrors with the reading direction by
  being first in the flex row rather than by a rule of its own.
  **No new data and no new request**: `RequestListItem.item` has carried `imageUrl` (already resolved
  through `publicTaxonomyUrl`) and `imageIsPhoto` since the rail was built, and this bar was already
  handed that item.
  Files: `src/components/workspace/RequestContextBar.tsx`,
  `tests/unit/request-context-art.test.ts` (new, 9 cases).
  ⚠️ **The FIT is the rail's ruling, copied deliberately** - same asset, same shape of hole. A
  photograph reaches its own edges and takes `object-cover`; a taxonomy DRAWING carries its own
  transparent margin, so cropping one enlarges the margin rather than the machine, and it takes
  `object-contain` scaled to the circle's diameter. `object-cover` for the drawings was tried on the
  live rail and rejected on 2026-09-12; it is not re-litigated here.
  ⚠️ **1.34 is arithmetic, not taste**: `contain` draws the catalogue's 1.34:1 artwork 32 × 23.9 in
  this box, and 32 ÷ 23.9 = 1.34. It survives a change of BOX size and would not survive a re-cut of
  the assets to another aspect (at a square source it is 1). A case pins that the rail carries the
  same number, so the two can never drift.
  ⚠️ Scaling past the box is safe only because the circle is `overflow-hidden rounded-full` - without
  it the drawing spills over its own edge and the bar's corner. A case pins the clip.
  ⚠️ `onError` is load-bearing, not defensive: the taxonomy's objects are not public-read on staging,
  so a well-formed URL answers 403 and an `<img>` absorbs that as «no artwork» - drawing a
  broken-image glyph, which is worse than the icon it replaced. Remembered by URL rather than as a
  bare flag, or one machine's failure would follow the next one onto the bar.
  ⚠️ The ground is `surface3`, the rail's own, and NOT the navy behind it: a drawing with a
  transparent margin needs something light behind it or the margin swallows the machine.
  ⚠️ Verified: typecheck, lint (0 errors), 54 passing across the three workspace suites, and the fit
  and the clip break-checked (the scale dropped, then `overflow-hidden` removed) - three cases went
  red. **NOT seen rendered**: jsdom lays out no images, and the bar needs a signed-in renter with a
  request, so the circle wants one look on the next deploy.

- **2026-09-14 - The photo panel matches the column beside it, between a floor and a ceiling - and the catalogue's real dimensions were MEASURED, correcting a figure two files had been repeating.**
  Owner: *"make the equipment image card same height as its neighbour card"*, plus *"what is the best
  image dimension to fit and what is currently"*.
  (1) **`items-start` → `items-stretch`, and the panel takes `max-h-[640px]` beside its
  `min-h-[450px]`.** Two of his rulings meet on that one line, hours apart, and neither is wrong:
  *"keep it fixed at its card height"* (the catalogue panel adds ~300px to the right column and a
  stretched photograph followed it to 800) against *"same height as its neighbour"* (at a flat 450 it
  ended short of an ordinary fields column and left a gap under it). A floor and a CEILING satisfy
  both - it follows the column, and refuses to follow the catalogue.
  🔴 **The ceiling is load-bearing for the FIT**: the taller the panel, the more `object-cover`
  throws away. Raising it without re-measuring that crop is how the «three wheels» of 2026-09-13
  comes back. A case pins both bounds.
  (2) 🔴 **The figures this repo has been quoting were STALE, in two files.** Measured against the
  live tree on beta with the real card on screen rather than computed from class names:
   · **Every illustrated taxonomy node is now `2400x1792`, ratio 1.339** - all 94 of them, one size.
     `MachineCard` said «1408x768, ratio 1.83» and `RequestRail` said «1024×559, 1.83:1, the same
     shape as the photographs», and the rail's whole «a photograph and a drawing are two different
     kinds» premise rests on a distinction the catalogue no longer makes.
   · **The card panel is `366x450`** (ratio 0.813) at a 1536 viewport - a `2fr_3fr` grid inside a
     936px card interior - not the «660x610» the old note used.
  So `contain` draws the photo 366x273 and leaves **177px of grey**, which is the band he reported,
  and `cover` crops **39% of the width**.
  ⚠️ **The rail's `scale-[1.34]` survives by coincidence and is still exactly right**: `contain`
  draws a 1.34:1 picture 52x38.8 in a 52px box, and 52 ÷ 38.8 = 1.34. It was DERIVED as 52 ÷ 28 for a
  1.83:1 letterbox. Anyone re-cutting the assets must recompute it - at a square source it is 1.
  **The dimensions he asked for, from the measurement:**
   · Card panel - box 366 wide x 450-640 tall. Ideal source **4:5 portrait, 800x1000** (2x of
     366x450). Today's 1.34:1 landscape is the worst possible shape for it.
   · Rail circle - box 52x52. Ideal source **square, 104x104** (2x). Today's asset is ~2,100x the
     pixels that tile can show.
  Files: `src/components/create/MachineCard.tsx`, `src/components/workspace/RequestRail.tsx` (the
  stale note corrected, no behaviour change), `tests/unit/machine-card.test.tsx` (the height case
  rewritten to the floor-and-ceiling rule).
  🔴 **CONTENT, owed, and it is the real fix**: re-cut the taxonomy assets per surface - a 4:5
  portrait for the card, a square for the rail. While one 1.34:1 file serves both, every surface is
  choosing between a band and a crop, and the card is downloading 4.3 megapixels to show 0.16.
  ⚠️ Verified: typecheck, lint (0 errors), 36 passing across the card and rail suites, and the
  ceiling break-checked by deleting it - the new case went red. The dimensions were read off the live
  page and the live taxonomy, not derived. NOT seen rendered after the change: beta still serves the
  pre-`cover` build, so the stretch and the new crop want one look once it deploys.

- **2026-09-14 - Editing a request can move the SITE and change the SIZE; the category and the type are the only locked fields.**
  Owner: *"why i cant edit a location of a request?"*, then, on the answer, *"follow the app, all
  fields editable except taxonomy right"*.
  🔴 **The lock was OURS, and it was wider than the app's.** Nothing refused it downstream:
  `updateRequestSchema` has accepted `projectLat` / `projectLng` / `projectAddressLabel` all along,
  our PATCH route is a bare pass-through, and the app's edit mode reuses the whole create wizard and
  sends those three itself. The web simply printed the address as a paragraph with a sentence saying
  it could not be changed here.
  **The app's line, read off its source rather than assumed** (`bug/post-bid-request-editing.md`,
  pin 3): `equipment_step.dart` refuses the category picker, the ✕ on the only tab and the +, and
  `_onEquipmentItemUpdated` copies the OLD `categoryId` and `subtypeId` back over any incoming item
  as the backstop - whose own comment adds *"every other field on the item … stays freely
  editable"*. So:
  · **SIZE is editable.** `capacityId` is NOT in that backstop, and the capacity chooser renders on
  `caps.length >= 2 && !isDirect` with no edit-mode condition at all. The same condition is used
  here, and the list is scoped to the locked subtype's own measurements - offering the whole
  catalogue would be a control whose picks the save must refuse.
  · **The SITE is editable**, through `GoogleMapLocationPicker` - the create flow's own, which takes
  no store and needed nothing new.
  · Adding or removing an equipment is still not offered, which is also the app.
  Files: `src/components/requests/RequestEditModals.tsx`,
  `tests/unit/request-edit-fields.test.ts` (new, 14 cases).
  🔴 **The old ruling was right about a TEXT BOX and wrong to conclude read-only.** *"A text box here
  would edit the words while leaving the coordinates - which every distance, every map pin and every
  supplier match is computed from - pointing at the old place."* True, and the answer is the picker:
  one guard writes the point and the label together, and the label assignment sits INSIDE the
  coordinate test, so the two can never part. A case pins that ordering.
  ⚠️ **The Saudi bounds are tested on THIS side** (16 … 32.5, 34.5 … 56, the backend's own
  `saudiProjectLat` / `saudiProjectLng`). Save is disabled and the save function returns early, and
  the renter is told which way to move the pin. Necessary rather than tidy: this form's save ends in
  a bare `catch` that only clears the busy flag, so a 422 would look exactly like a save that worked.
  🔴 **Reported, NOT fixed: that silent `catch` covers every other failure too.** A refused edit -
  the one-time post-bid cap spent (`REQUEST_EDIT_ALREADY_USED`), a dropped connection - closes
  nothing and says nothing. It is pre-existing and wants its own pass, with the reason code beside
  the sentence the way `AddSuppliersDialog` does it.
  ⚠️ A moved pin draws a line saying what it changes (which suppliers match, every distance). It
  states the consequence and does not ask: this is an edit form, and the renter moving the pin is
  answering the question.
  ⚠️ The cases read the SOURCE. The modal pulls a `Dialog`, six `Dropdown`s, a `next/dynamic` Google
  Maps picker and two fetches; a render test would mock five things to assert one ruling about which
  fields exist.
  ⚠️ Verified: typecheck, lint (0 errors), 73 passing across the three touched suites, and both new
  rulings break-checked one at a time - the capacity forced back to the stored id, then the bounds
  guard removed from the save; two cases went red. **NOT seen rendered**: the drawer needs a
  signed-in renter with an editable request, so the picker inside this dialog wants one look.

- **2026-09-14 - On the ready strip only the machine's NOTE gives way; the name, the place, the dates and the payment all hold.**
  Owner, refining the one-row rule taken an hour earlier: *"make the equipment name always full
  appear, not stripped - but details after it like operator, cert might be stripped, but other fields
  no"*.
  ~~The machine name and its note both carried `truncate`, and the address did too.~~ So the first
  thing to clip on a tight row was «Crawler Excavator 20 t…» - the one fact on the strip that says
  WHAT he is renting - and «King Khalid International…», where half a place name is a different
  place.
  **The note is now the ONLY shrinkable element on the card.** It is a restatement: the operator and
  the certificate are each stated in full in the section below, so half of it costs nothing. The
  name, the place, the dates and the payment term are `flex-none whitespace-nowrap`.
  Files: `src/components/create/ReadyToSend.tsx`, `tests/unit/ready-to-send.test.tsx` (4 new cases,
  one rewritten).
  🔴 **The card takes `overflow-hidden`, and it is load-bearing now.** With almost nothing able to
  shrink, a row that genuinely cannot fit has to end at the card's own edge - without it the strip
  would push the whole DOCUMENT wider than the screen, which is the fault audited out of three
  surfaces on 2026-09-08.
  ⚠️ **Safe only because `Dropdown` PORTALS its list** (`createPortal`, `z-[70]`). An
  `overflow-hidden` ancestor would otherwise clip the payment menu the moment it opened - checked
  before adding it, not after.
  ⚠️ `shortSite` has already cut the address to the text before its first comma, so what the place
  fact holds is the site's own name rather than a full postal line; that is why refusing to truncate
  it is affordable.
  ⚠️ Verified: typecheck, lint (0 errors), 69 passing across the four touched suites, and BOTH new
  rulings break-checked one at a time - the name forced back to `truncate`, then the clip removed;
  each went red alone. NOT seen rendered: jsdom lays out no flexbox, so what is pinned is the rule
  that decides the row, never the row itself - the strip wants one look on the next deploy.

- **2026-09-14 - The ready strip is ONE row: «Details» is one word, and the facts give way instead of the button.**
  Owner, on the review screen: *"make the button details only so it is smaller, and always in one row
  even if request details beside it stripped - but this card must have the details with the button in
  one row"*.
  With four facts and the payment dropdown the card was `flex-wrap`, so the button group wrapped onto
  a line of its own and «عرض كل التفاصيل» and the pen sat UNDER the card they belong to.
  (1) **«View all details» → «Details»** / «عرض كل التفاصيل» → «التفاصيل». Its width is now a layout
  constraint rather than a free choice: it shares a row with four facts that must not be pushed onto
  a second line, and the old label is 3.4x this one. The pen beside it says «edit»; this one only has
  to say what it opens.
  (2) **`sm:flex-nowrap` on the card**, and the facts shrink rather than the row growing.
  `StripFact` gained `tight`, which marks the ones that may NOT shrink - a date range or a payment
  term clipped mid-word is not a shorter fact, it is a wrong one. The two that CAN give way, the
  address and the machine, keep `min-w-0` and already truncate.
  Files: `src/components/create/ReadyToSend.tsx`, `src/lib/i18n/{en,ar}.ts` (`create.ready.viewAll`),
  `tests/unit/ready-to-send.test.tsx` (4 new cases; three existing ones renamed to the new label).
  ⚠️ **It still WRAPS below `sm`.** Four facts and two controls on one line of a phone is not a row,
  and forcing it would push the whole DOCUMENT wider than the screen - the fault audited out of three
  surfaces on 2026-09-08. One row where there is room, wrapped where there is not.
  ⚠️ `whitespace-nowrap` on the button itself as well as `flex-none` on its group: the group holding
  its width does not stop a two-word label breaking inside it and taking the card's height with it.
  ⚠️ **The new cases anchor on the `<div` that OPENS the card, not on `basis-[34rem]`** - that string
  appears in the comment above the element too, and the first match is the prose. A slice that takes
  in an explanation of the rule instead of the rule is the trap this repo has hit twice before.
  ⚠️ Verified: typecheck, lint (0 errors), 36 passing across the four touched suites, and the row
  rule break-checked by deleting `sm:flex-nowrap` - one case went red. NOT seen rendered: the review
  screen needs a drafted request, and jsdom lays out no flexbox - what the cases pin is the rule that
  decides the row, never the row itself.

- **2026-09-14 - Requests with no bids are off the `/requests` rail, behind a flag, FOR A DEMO.**
  Owner: *"i want no bids to be hidden from requests list in requests, just for demo purpose"*.
  `HIDE_BIDLESS_REQUESTS` in `src/lib/flags.ts`, a code toggle for the reason
  `TRIAL_REQUESTS_ENABLED` is one: a product decision, not a per-environment one. Set it `false` and
  the rail is exactly what it was - there is nothing else to undo.
  🔴 **It is NOT a behaviour to keep, and the flag says so.** A live request with no offers yet is
  precisely when the renter still has things to do with it - share the link, chase a supplier, edit
  the terms, cancel it - and the rail is his only route to all four. The ✕ dismissal this app
  already has is deliberately gated on CLOSED for that reason (`hidden-requests.ts`: *"a live request
  that vanished from the rail would be a request the renter cannot get back to"*), so this goes
  AROUND that rule rather than changing it and the rule stays stated where it belongs.
  **TWO guards, and both are the difference between a demo and a broken page:**
   · **The landing.** `resolveSelection` falls back to `groups[0]`, the NEWEST request, and a tile
     that is the page's own subject is kept on the rail whatever else says otherwise - so without
     this the demo would land on a bidless request and draw the very circle the flag exists to
     remove. With the flag on, the fallback chooses among the requests that HAVE bids. Only when
     nothing is wanted: a group named by the URL or by a press still resolves against the whole list,
     so a deliberate visit to a bidless request works and shows its tile.
   · **The empty rail.** If NO request has a bid the filter stands down and every circle is drawn.
     Otherwise the rail empties and the page falls through to «create your first request» - the
     new-account empty state - over an account that has several.
  Files: `src/lib/flags.ts`, `src/components/workspace/RequestsWorkspace.tsx`,
  `tests/unit/hide-bidless-requests.test.ts` (new, 7 cases).
  ⚠️ **It reads `totalBids`, which counts APP bids only.** A request whose offers all arrived through
  the renter's own shared link has `bidCount: 0` on every item and is hidden by this flag even though
  it has offers - the same blind spot the dashboard rail was fixed for on 2026-09-05. Counting them
  needs one `fetchRequestSubmissions` per group, which is not a thing to add for a demo; it is
  written down instead. **If the demo shows off-platform bids, this will hide the wrong requests.**
  ⚠️ One case is `it.runIf(HIDE_BIDLESS_REQUESTS)` - the one that describes the demo itself, so the
  suite goes quiet rather than red the day the flag goes back off. Verified both ways: 7 passing with
  it on, 6 passing and 1 skipped with it off. The two GUARD cases hold either way, which is the half
  worth keeping afterwards.
  ⚠️ Verified: typecheck, lint (0 errors), 57 passing across the four rail/workspace suites. NOT seen
  rendered - `/requests` needs a signed-in renter with requests, and this browser has no session.

- **2026-09-14 - The machine card's photograph fills the panel, and the chips float on the machine rather than on grey.**
  Owner: *"equipment image must match the card height too, even in the back of the tuv-year etc"*.
  `contain` fits the WIDTH, so a 1408x768 photograph (1.83:1) in a panel taller than it is wide drew
  a grey band above and below - and the four controls float on the panel's corners, so the
  certificate pill, the quantity stepper, the year and the fuel all sat on that grey instead of on
  the machine they belong to. `object-cover` now.
  🔴 **This REVERSES 2026-09-13** (*"three wheels and nothing else"*), and what changed is the PANEL,
  not the opinion. `cover` was refused while the panel still carried `h-full` and stretched to the
  right column - about 660x610 in that shot - so it needed 610x1.83 = 1116px of width against 660
  and threw away **41%**. The panel has been FIXED at 450px since earlier the same day (*"keep it
  fixed at its card height"*), which makes the same crop 450x1.83 = 823 against ~585: **29%,
  centred, so 14.5% a side.**
  🔴 **Measured in a browser before changing it**, both fits side by side at the real 585x450 with
  the catalogue's own excavator: the whole machine survives - boom, cab, tracks, bucket teeth - and
  what goes is empty floor and wall, because these photographs are shot with wide margins. The
  earlier rejection was correct for the box it was made in and stopped being correct when the box
  changed.
  Files: `src/components/create/MachineCard.tsx`, `tests/unit/machine-card.test.tsx` (the fit block
  rewritten, 4 cases).
  ⚠️ **The fixed height is LOAD-BEARING for this fit**, and a case pins it: restore `h-full` and the
  panel follows the right column again - the catalogue panel alone adds 300px - and the crop is back
  to the 41% that was rejected. Anyone widening this panel has to re-measure.
  ⚠️ **The ROW THUMBNAIL keeps `object-contain p-0.5`** and must: the 36x52 box on a type/size row
  holds a flat drawing, which is the requests rail's case, not this one. The old cases asserted
  `contain` over the WHOLE FILE, so they would have passed for the wrong image; both are scoped to
  their own element now, with a case each.
  ⚠️ **The request rail reached the opposite answer for its 52px circle on 2026-09-12, and both are
  right.** The fit is a property of the BOX, not of the picture. Recorded in both places so the next
  reader does not re-run the experiment in the wrong one.
  ⚠️ Verified: typecheck, lint (0 errors), 59 passing across the four canvas suites, break-checked by
  restoring `contain` - two cases went red. **SEEN RENDERED**: the two fits photographed side by side
  at the panel's real size, which is what settled it; the card itself needs a session and was not
  re-photographed after the change.

- **2026-09-14 - The intake's last row is the control row, packed to the maximum, and a chip never wraps.**
  Owner, stating it as a standing rule: *"the last row of the input text box is one row with select
  project in small font, then the project pills, then + without circle, then the arrow in a circle -
  this is the order ALWAYS - and put the number of pills in this row dynamically depending on the max
  fit; more than fits is shown in the row ABOVE, and that row fits the whole text box as it has no
  buttons or text"*, then *"why only 2 pills in last row, it must fit the third one"* and *"this is
  also not allowed, never wrap it"*.
  🔴 **The overflow runs UPWARD, which no CSS wrap mode gives you.** `wrap-reverse` stacks lines
  upward but puts the LAST items on the TOP line, so the `+` and the arrow would float above the
  sites. The split is measured: `ProjectChips` renders every chip on the control row while the count
  is unknown, reads which of them landed on the first LINE, and moves the rest to a full-width strip
  above with «All projects» leading it.
  **Two separate bugs made the row come up one chip short, and both are fixed:**
  · 🔴 **The count was arithmetic** - available width, minus each `offsetWidth`, minus a gap
  constant - and all three inputs erred the same way: `offsetWidth` rounds UP, the constant was a
  second copy of `gap-2` that nothing kept in step, and the width was read before the locale's face
  had settled. It reads `offsetTop` now: the browser has already done that layout, and the chips on
  the first line ARE the ones that fit. A 2px tolerance, because `items-center` can leave two chips
  on one line a pixel apart.
  · 🔴 **A `null` in the array.** The chosen-site pill is a conditional, so with nothing chosen its
  slot held `null` - an entry that takes a place and draws nothing. `slice(0, 3)` on `[null, a, b, c]`
  is `[null, a, b]`: TWO chips on a row the measurement had correctly said held three. That is the
  owner's screenshot exactly - 3 projects, 1 above, 2 below. `chipNodes.filter(Boolean)` fixes it.
  **And the chips stopped wrapping their own names**: `whitespace-nowrap` on all three kinds, with
  `flex-none` beside it - without that the row shrinks chips to squeeze another in, which is the same
  wrap by another route. A name too wide is CLIPPED by the row instead.
  Also: the `+` lost its circle (the arrow keeps its - only one of them is the act the screen exists
  for), and the units chip dropped its `×` and now HIDES the `−` at one unit rather than disabling
  it: a pale disabled skin on a dark chip made the one dead control the brightest thing in it.
  Files: `src/components/create/ProjectChips.tsx`, `src/components/create/MachineCard.tsx`,
  `src/components/screens/Intake.tsx`, `tests/unit/project-chips-rows.test.tsx`,
  `tests/unit/machine-card.test.tsx`.
  ⚠️ **`trailing` is a slot, like `lead`.** The two controls are passed IN because this component is
  the only thing that knows how many chips fit beside them - and unlike `lead` they are drawn even
  when the renter has NO sites: a guest still needs the way to hand us a file and the way to send.
  ⚠️ **The fallback SHOWS, never hides.** While the count is unknown the control row wraps instead
  of clipping, so a browser with no `ResizeObserver` - or the frame before first layout - keeps every
  site on screen. Untidy for a frame, and it loses nothing.
  🔴 **jsdom cannot exercise the split at all**: it reports every element 0px wide, so the component
  takes that fallback and there is no overflow strip. The cases pin the RULES against the source -
  the row's order, the toggle living in the overflow strip, nowrap on every chip, the measurement
  reading `offsetTop` rather than widths. The packing itself is a browser fact and is NOT verified
  here; `npm run dev` is broken on this machine (`--no-experimental-webstorage is not allowed in
  NODE_OPTIONS`) and staging serves the deployed build, so it wants one look after the next deploy.

- **2026-09-14 — A TRIAL request made in the app stops arriving on the web dressed as a real one.**
  Found in a full audit, not reported: the database is SHARED with the mobile app, and the app still
  offers the 60-minute trial. `TRIAL_REQUESTS_ENABLED = false` only stops this app CREATING one, so a
  renter who tried it on his phone opened the web and saw an ordinary request — no ribbon, no
  caption, sample bids from the DEMO supplier reading as real offers, and the whole row gone an hour
  later when the TTL expired. `isTrial` was on `RequestRecord` and read by NOTHING in `src/`.
  Files: `src/app/api/me/requests/route.ts`, `tests/unit/my-requests-trial-filter.test.ts` (new, 4).
  🔴 **Dropped at the BFF, never on a surface.** The workspace, the request rail, the dashboard and
  every bid count read that one route, so a filter in any one of them would leave a trial COUNTED
  where it is not drawn — worse than showing it.
  ⚠️ `=== true`, never truthy. `undefined` means an older backend does not send the field, and the
  opposite guess empties the workspace on that build. A case pins each edge.
  ⚠️ Hiding is right only while the web has no way to SAY what a trial is. If trials come to the web,
  this filter goes and the app's ribbon comes with it.
  ⚠️ Verified: typecheck, lint, 4 new cases, 15 passing across the touched suites, and
  break-checked — the filter removed, two cases went red.

- **2026-09-14 - The equipment card gets ONE escape and one panel behind it, and the name box stops being a box he can type in.**
  Planned against the supervisor's own prototype (`Equipment Detection States`), then cut down from
  it over a long exchange. Owner: *"despite we see them as 4 cases, user see them in 2 (he found what
  he want, he didnt)"*, *"the cta instead of describe so he dont feel he is writing again"*, *"many
  extra text everywhere no need"*, *"dont ever wrap the text"*, and *"if he tries to write then shake
  the question note - i actually want it read so he understands its use by confirming that he is
  using his own words"*.
  (1) **Four states became two.** An exact hit, an alias hit, an unsure guess and a HIDDEN node all
  draw the same card: the renter cannot tell them apart and does not care. The only division he sees
  is whether the line has a taxonomy or his words.
  (2) **One escape, and it stays on screen.** ~~A dashed row that went off-catalogue in a single
  press.~~ It opens a panel UNDER itself, arrow flipping, and the row remains - the prototype's own
  behaviour. Its sentence is the state's: «Not the equipment you want?» / «Can't find the equipment
  you want?», sized to the sentence (`w-max`, `whitespace-nowrap`) and never to its column.
  (3) **Two doors, not three.** «Search our catalogue» opens the line's own family with the taxonomy's
  PICTURES and a «Use this» on each; «Search all equipment» widens it to the whole catalogue with a
  search box. Browse and search were one list at two scopes, which is the owner's own merge.
  (4) **A pick asks for the SIZE on the row.** Sizes differ per type, so applying the first one is
  exactly the wrong auto-fill the panel exists to avoid.
  (5) 🔴 **«Describe it yourself» became a CONFIRMATION.** *"i dont want the user to write anything
  more here as he already described it in his input before"*. The panel reads «THE REQUEST WILL SAY
  …» over his own words with one button, «Keep equipment name in my own words», and contains no input
  at all.
  (6) 🔴 **The name box is READ-ONLY, reversing 2026-09-12** (*"it is now the user input of the
  equipment name"*). It holds the agent's output until he rejects the match. A keystroke in it is
  refused and SHAKES the escape row instead - a field that does nothing teaches nothing, and arriving
  at his own words through the confirmation is the point: he is choosing them over ours, not filling
  a box. What it buys: one writer at a time, so the name can never quietly contradict the type beside
  it. What it costs, stated: he cannot label a matched line, and his words stop arriving as free
  aliases for the next renter.
  (7) **His words now ride on EVERY line, not only an off-catalogue one** (owner, 2026-09-14: *"let
  what [is] detected in your own words [be] stored as the custom always, regardless [of whether the]
  user change[s] it or not"*). `EQUIPMENT_NAME_ON_EVERY_LINE` flips from default-OFF to the kill-switch
  shape, because the thing it was waiting for has landed: **B1 is in `Moedatech-App@342ab77f`**, and
  better than specified - `hasCustomEquipment` is derived from the undefined predicate with `every`
  rather than `some`, so a link loses its QR only when NOTHING in it can be answered in the app.
  🔴 **It needs that backend DEPLOYED, not merely committed.** Against an older `agents` every bid
  link in the product loses its QR and «Go To App», and the preview is cached for 300s, so the
  mistake outlives its own rollback by five minutes.
  ⚠️ What is sent is **his** words (`customEquipment ?? rawLabel`), never the catalogue name the box
  shows on a line he added by hand: storing our own name back into his column would be circular.
  ⚠️ `undefined` is untouched by all of this - still `no subtype, or a hidden one`.
    Files: `src/components/create/MachineCard.tsx` (`EquipmentChooser`, new), `src/lib/i18n/{en,ar}.ts`
  (22 strings), `tests/unit/custom-equipment-canvas.test.tsx` (4 cases rewritten),
  `tests/unit/off-catalogue-from-type.test.tsx`, `src/lib/flags.ts`,
  `tests/unit/{equipment-name-every-line,custom-equipment}.test.ts`.
  ⚠️ **No backend, and no new data.** The payload is unchanged - three ids or a name, one of them -
  and the pictures come from `Subcategory.equipmentImageUrl`, which `/api/taxonomy` already returns.
  ⚠️ **A prototype of the two cards is published** as an artifact, in the supervisor's own skin
  (values lifted from his bundle), so the two can be compared without guessing at colours.
  🔴 **A write-once rule for scripted edits, learned the hard way.** `io.open(path, "w")` truncates
  at the OS level BEFORE the `newline` argument is validated, so a script that fails on that argument
  leaves an EMPTY file and no write. It emptied `off-catalogue-from-type.test.tsx` (219 lines) and I
  read it as another session's doing before finding my own script in the traceback. Read, replace,
  assert, and only then open for writing.
  ⚠️ Verified: typecheck, lint, 169 passing across the thirteen canvas, card, wire and design-guard suites.
  NOT seen rendered - the panel, the pictures and the shake are all things jsdom cannot judge.

- **2026-09-13 - The details drawer keeps STATUS and drops the rest of its pill row; a DIRECT request names the firm instead of promising a marketplace.**
  Owner, two screenshots: *"i want to remove these pills, just keep the open or status of request at
  top in the title header. but in case it is a direct request, instead of these pills will show the
  store logo and the name, «direct to Sigma store (logo)» for example"*, and on the send
  confirmation *"in direct, language must change - it is not to all suppliers, i will show here the
  store logo instead of Moedatech"*.
  (1) **Four pills became one chip, in the TITLE.** Two of the four repeated what was already on
  screen - the reference IS the header's subtitle, and the bid count sits above the cards the reader
  is scrolling to - and the row spent a band of the dialog saying it. The status is the one fact
  only that row carried, so it rides the title where it is read WITH the request.
  (2) **A DIRECT request gets a chip of its own**: the store's logo and «Direct to {name}». Reach on
  such a request is not a category, it is a firm.
  (3) **The send confirmation stops claiming the marketplace.** That block said *"your request goes
  live on Moedatech, where every supplier there can bid on it"* over a request that reaches exactly
  one firm - on the last screen before it leaves. It is the STORE's block now: its logo where the
  wordmark was, its name as the title, and «goes to this supplier only, and nobody else sees it».
  Files: `src/lib/contract/requests.ts` (`directTarget`),
  `src/components/workspace/RequestDetailsModal.tsx`, `src/components/share/ShareRequestPanel.tsx`,
  `src/components/create/ShareOnPost.tsx`, `src/components/home/HomeRequests.tsx`,
  `src/components/workspace/RequestsWorkspace.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`postShare.destDirect{Fallback,Line,Posted}`),
  `tests/unit/direct-request-identity.test.ts` (new, 11 cases).
  🔴 **HALF of (2) IS NOT BUILDABLE YET, and the drawer says «Direct request» without a name.**
  Checked before building rather than assumed: `GET /rentees/me/requests/{id}` spreads the request
  row, so `supplierId` (an integer) arrives and NOTHING else; `getMyRequests` selects no supplier at
  all. The store cannot be resolved from that id either - `/api/stores/:id` is keyed on the STORE and
  the list takes no supplier filter. `directTarget` therefore reads the name and the logo
  TOLERANTLY, across every spelling the two services might land on, so the chip fills itself the day
  the field arrives with no second web change - the `DirectorySupplier.equipmentCount` pattern of
  2026-09-08.
  🔴 **BACKEND, owed:** put the target firm on the request projections - `supplierName` at minimum,
  plus `storeId` / `storeName` / `storeLogoUrl` for the mark. BOTH `getMyRequests` and
  `getRequestDetail`: the drawer reads one and the rail the other.
  ⚠️ **The CREATE flow is fully built**, because the draft knows what a posted request does not:
  `DirectTarget` carries `supplierName` and `storeId`, so the confirmation names the firm and fetches
  its logo. A failed fetch is silent and falls back to the `storefront` glyph - the block's job is to
  say WHERE the request goes, and it says that in words whether or not a picture loads.
  ⚠️ **The drawer no longer takes `bids` at all**, and that swept a round trip: `HomeRequests`
  fetched them only to feed the count pill, so opening a request from the dashboard is one call
  lighter. Both call sites updated; `workspace.bidsSplit` keeps its other readers and the SOURCE
  filter above the cards still states the split, which is where a reader acts on it.
  ⚠️ Verified: typecheck, lint (0 errors), 216 passing across the five touched suites, and the direct
  branch break-checked - the chip forced to null, one case went red. NOT seen rendered: the drawer
  needs a signed-in renter with a request, and the direct confirmation needs a draft started from a
  store.

- **2026-09-13 - «Basic» and «may post a request» are TWO backend facts, and a renter was stuck between them.**
  Owner, forwarding `+966566493886` blocked on «حسابك لا يسمح بهذا بعد · أكمل ملفك الشخصي لنشر
  الطلبات» while his badge read basic: *"is having this issue on beta despite he is basic so what??"*
  🔴 **The gate is not the tier, and nothing on either side says so.**
   · `getUserTier` (`apps/backend/src/services/profile.service.ts:163`) answers `basic` off
     `firstName && lastName && city && jobTitle`, and never reads the flag below.
   · `createRequest` (`apps/backend-agents/.../createRequest.ts:378`) refuses with
     `GUEST_CANNOT_POST_REQUESTS` / **E10001** on `!owner.hasCompletedOnboarding`, and never reads
     the tier.
  Only `completeProfile` (`PUT /users/me/profile`) writes that flag. `updateProfile`
  (`PUT /profile/me`) does not - verified line by line. So a renter whose four identity fields were
  filled by any other route reads as basic, is therefore sent to the EDIT endpoint by
  `EditProfileForm`, and **can never clear the thing blocking him**: basic enough to be denied the
  fix, not onboarded enough to post. Saving his profile again changes nothing, forever.
  `isFirstSave` now asks the flag the GATE asks: `tier === "guest" || hasCompletedOnboarding ===
  false`. The flag was already on `GET /users/me` and the web read it NOWHERE; it is carried through
  `/api/me` onto `RenterProfile`.
  Files: `src/lib/contract/onboarding.ts`, `src/app/api/me/route.ts`,
  `src/components/profile/EditProfileForm.tsx`, `tests/unit/profile-first-save.test.tsx` (new, 6).
  🔴 **The SAME ACCOUNT as the 2026-09-10 fix, caught by the other half of the same trap.** That
  entry swapped the endpoint for a GUEST and keyed on the tier - correct for a guest, and silently
  wrong for him the moment his tier moved without the flag moving with it. The guest arm is kept, so
  that fix is untouched.
  ⚠️ **`=== false`, never falsy.** `undefined` means an older backend did not send the field, and a
  complete account is the ordinary case; guessing the other way would push every healthy renter
  through the first-save endpoint. The BFF passes it through undefaulted for the same reason - a
  `?? false` there would erase the distinction the form depends on. A case pins each.
  ⚠️ **HOW he got into this state is NOT established.** `updateProfile` needs `requireTier('basic')`
  to be called at all, so he was already basic before it; the four fields were filled by some route
  that does not complete onboarding (an admin write, a direct edit, an older client). Worth finding,
  because anyone else it happened to is stuck the same way and this fix only rescues them once they
  open their profile and press save.
  🔴 **BACKEND, the durable fix:** `updateProfile` should set `hasCompletedOnboarding: true` when the
  four identity fields are present, the way `partner/updateProfile` already does with its
  `firstSave` branch. Until then the two columns can drift apart again on any surface that writes
  one without the other.
  ⚠️ Verified: typecheck, lint (0 errors), 29 passing across the four profile/onboarding suites, and
  break-checked by keying `isFirstSave` back on the tier alone - two cases went red. NOT reproduced
  against his account: the database is behind a permission block here, so the mechanism is read off
  both services' source and the E10001 code in his screenshot.

- **2026-09-13 - The processing line is back, and it is INDETERMINATE.**
  Owner, on the reading screen: *"show process line anyways too"*.
  🔴 **This reverses the removal of 2026-09-12**, and the reason it went is still true: `processRfq`
  is ONE request, the server answers once, and the old bar was a percentage moving on a timer - it
  lied in the renter's favour right up until it stalled. So what comes back is the honest form of
  «anyway»: a 30% segment travelling a 180px track, saying WORKING and claiming nothing. On a match
  it stops and the track fills, which is the same news the ring closing and the machine landing are
  giving at that moment.
  Files: `src/app/globals.css` (`proc-slide`, `.proc-seg`),
  `src/components/screens/Processing.tsx`, `tests/unit/processing-screen.test.tsx` (2 new cases).
  ⚠️ **180px and 3px, under the line rather than across the page.** A full-width bar would be the
  loudest thing on a screen whose subject is the machine in the circle.
  ⚠️ `aria-hidden`. The title above says what is happening in words, and a progress bar with no
  value announces nothing a screen reader can use.
  ⚠️ Reduced motion stops the segment and leaves it at the start of the track. A bar that is there
  and still is the honest version for a reader who asked for no movement; removing it would take
  away the one thing on the screen that says a request is in flight.
  ⚠️ The case that pinned «one moving thing» was RENAMED rather than left: there are two now, and a
  test whose name states a premise that is no longer true is worse than none. What it actually
  guards - no `transition-[width]` anywhere, which is what a creeping percentage needs - is
  unchanged and is the half worth keeping.
  ⚠️ Verified: typecheck, lint (0 errors), 16 passing in the processing suite, break-checked by
  removing `.proc-seg` (the new case went red), and **SEEN RENDERED** in both states.

- **2026-09-13 - The processing disc fits the whole drawing, and a matched machine ARRIVES instead of appearing.**
  Owner: *"make the processing circle fit the image fully, and when the image is found show it
  appear to the screen like winner"*.
  (1) 🔴 **The scale is gone and the DISC grew instead** (118px → 134px, five pixels inside the
  ring). This is the third fit tried in this slot and the first that cannot cut anything:
  `object-cover` was right while the slot held a photograph; `contain` + `scale-[1.25]` answered a
  tile that read as empty; both CLIP a catalogue drawing. Measured rather than argued - the rail's
  own note has `spider-crane.png` at 1024×559 drawn 52×28 in a 52px box, edge to edge, so `contain`
  already fills the WIDTH and there is no horizontal margin to eat. At 1.5 that crane lost both
  outriggers, seen in the browser.
  **The geometry, for the next person who reaches for a scale:** a w×h picture fits inside a circle
  of diameter D when `w·√(1+(h/w)²) ≤ D`. At 1.83:1 that is `w ≤ 0.87D`, and `contain` gives
  `w = D` - so 1.0 is the ceiling, not a starting point. The machine is big because the disc is,
  which is the only lever that cannot clip.
  (2) **`found` closes the ring and pops the machine**, on one timeline. While reading, the ring is a
  quarter of brand turning through a pale circle - the catalogue being searched. On a match it
  becomes a CLOSED brand circle and stops, and the drawing overshoots to 1.12 and settles. Landing
  had no moment before this: the drawing simply swapped, and a renter watching the reel could not
  tell the answer from one more candidate.
  Files: `src/app/globals.css` (`found-pop`, `found-ring`), `src/components/screens/Processing.tsx`,
  `src/app/dev/preview/specimens.tsx`, `tests/unit/processing-screen.test.tsx` (2 new cases, the fit
  case rewritten).
  ⚠️ **`key` on the ring's state.** A CSS animation on a KEPT node does not re-run, so without the
  key the ring would close with no flourish while the drawing beside it popped - two halves of one
  moment, out of step.
  ⚠️ The pop is on the IMAGE, not on the disc: the disc is `overflow-hidden`, and animating it would
  clip the overshoot to a circle that is itself growing.
  ⚠️ Reduced motion keeps both RESULTS - full-size machine, closed ring - and drops only the
  overshoot, which is the decoration. Same rule the tick disc has followed since it was written.
  🔴 **A drawing's own transparent margin is NOT fixable here.** `spider-crane.png` fills the disc;
  `scissor-lift.png` carries margin on every side and sits small inside it. `contain` cannot tell the
  difference between a machine and the emptiness around it, and a scale big enough to help the second
  clips the first. **CONTENT, owed: trim the transparent margin on the taxonomy icons** - the same
  family of asset problem as the `.jpg` icons that cannot be keyed out (2026-09-08).
  ⚠️ Verified: typecheck, lint (0 errors), 39 passing across the touched suites, and the full suite
  serially (3376 passing). Three failures, none from this change: `ui-pins` (pre-existing CRLF),
  `share-request-email`'s `recipientEmails` (uncommitted work absent from `HEAD`), and
  `dropdown-scroll`, which passes alone.
  ⚠️ **SEEN RENDERED**, both states, and the clipping found that way rather than in the source.
  🔴 The POP itself was not watched - a still frame cannot show it, and the flow it belongs to needs
  a session.

- **2026-09-13 - A dropdown opens as tall as the room it has, instead of six rows on every screen.**
  Owner, on the TYPE list: *"the dropdown must always show all taxonomy types, not necessarily the
  same category as the selected one"*, then *"show all even without search"*.
  🔴 **The list was ALREADY every subtype across every category** - `MachineCard` passes
  `tax.allSubtypes`, which flattens the whole catalogue, and the filter is a plain substring match
  with no cap. What was wrong was how much of it a renter could SEE: the options box was `max-h-56`,
  a flat 224px, six rows, whatever the screen. On a real catalogue that is a sliver, so he had to
  TYPE before he could see what was in there - which is the opposite of what a list is for, and why
  «show me everything» read as «it only shows a few». Everything was rendered; almost none of it was
  visible.
  The cap is the space between the trigger and the window's edge now, less a margin and less the
  search row where one is drawn, with a FLOOR of 200px (a two-row list is worse than a scrolling one)
  and a CEILING of 420px (a list is a list, not the page).
  Files: `src/components/Dropdown.tsx`, `tests/unit/dropdown-scroll.test.tsx` (3 new cases).
  ⚠️ **The flip measurement had to move with it.** `ESTIMATED_LIST_HEIGHT` still decides WHICH
  side has more room, but a list that flips up is now positioned against the height it will really
  take - with the old constant, a taller list opened with its top off the screen.
  ⚠️ `searchable` was hoisted above `openList`, which now reads it. A `const` declared below the
  function that uses it is safe only by call order, and that is what a later edit breaks silently.
  ⚠️ **jsdom lays out nothing**, so the measurement falls to its floor in tests. That is the half
  worth pinning anyway: the floor must be a readable list, and the height must come from the
  measurement rather than from a class nobody can vary. Break-checked by restoring `max-h-56` - both
  cases went red.
  🔴 **And the list could not be SCROLLED to its foot** (owner, same exchange: *"it contains
  all, but when I search I find - not by scrolling"*). A `position: fixed` layer that extends past
  the viewport cannot be scrolled into view: the page scrolls and the layer does not move with it, so
  the rows below the fold were reachable by SEARCH alone. It happens whenever the height floor is
  taller than the room - near the foot of a page, or in a short window where flipping up cannot save
  it either, where the old arithmetic could even place the top at a NEGATIVE offset. The height stays
  at the floor there, because a sliver is worse; the POSITION gives instead, and the whole layer is
  pushed until it sits inside the window with 8px to spare.
  ⚠️ The case that pins it needs a window where NEITHER side fits (300px tall, the trigger in the
  middle). A trigger near the bottom of a tall window does not exercise it - the flip already handles
  that one, which is why the first version of this test passed against the broken code.
  🔴 **Reported, NOT fixed - the catalogue can fail silently.** `/api/taxonomy` falls back to a
  built-in stand-in of 6 categories / 17 subtypes on ANY error from the agents service, and says
  nothing. A thin catalogue and a failed fetch look identical on this dropdown, which is the other
  reading of the owner's report and cannot be told apart from the screen.

- **2026-09-13 - The off-catalogue note may take two lines, the offer takes the owner's own words, and TYPE's placeholder matches SIZE's.**
  Owner, an hour after asking for one line: *"the note beside the equipment name is wrapped so make
  it 2 lines fine, and for the notes on the type-size make «not in our list? use your custom name»,
  and for the placeholder of the type dropdown make it «select type» same as «select size»"*.
  (1) 🔴 **`sm:truncate` is GONE from the note, reversing this morning's one-line rule.** Clipping is
  the one thing a warning must never do, and that was the price of the rule; he looked at it wrapped
  and took the wrap. The sentence stays short - two lines is the ceiling now, not the target - and
  the glyph moved back to `items-start` so it sits on the first line rather than against the middle
  of a two-line block.
  (2) **«Not in our list? Use your custom name»**, his wording, replacing «Not listed? Use your own
  name». «custom name» is the NAME BOX's own vocabulary, which is what the press fills.
  (3) **«Select equipment type from our list» → «Select type».** The two boxes sit side by side and
  said different kinds of thing: a four-word instruction naming the catalogue, beside two words.
  «from our list» is the escape row's job now, one cell along.
  Files: `src/components/create/MachineCard.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/custom-equipment-canvas.test.tsx`.
  ⚠️ Measured at `text-label`: the new offer is **186px** English, 182px Arabic. Its column is
  ~297px of text room at the card's ordinary width, and ~189px just above the `sm` breakpoint - so
  it fits everywhere by measurement, and by 3px at the narrowest. It is a button with `leading-snug`
  and no `nowrap`, so the worst case there is two lines, not an overflow.
  ⚠️ **A corrupted comment beside `sizePlaceholder` was repaired in passing** - `26a0Fe0f` and a run
  of raw code points where a ⚠️ and an Arabic quotation should have been. Same class of scripting
  accident as the `RED` note of 2026-09-12. Said out loud because it is not part of the asked-for
  change; an unreadable comment is worse than none.
  ⚠️ Verified: typecheck, lint (0 errors), 74 passing across the five card suites. NOT seen
  rendered: the canvas needs a session (a guest hits «You've reached your limit» on this backend),
  so the widths are measured in the page rather than looked at in the card.

- **2026-09-13 - The off-catalogue offer moves under the two lists it is about, and both of its sentences are cut to fit one line.**
  Owner, on the dashed row: *"i want this note inlined with the size-type row so make it shorter, use
  same meaning but shorter, even for the notes above ... i want it to fit in one line not wrapped so
  make sure use shorter sentences to fit"*.
  (1) **ONE control again, in row two.** The two offers were split apart earlier the same day - the
  way OUT beside the NAME box it fills, the way BACK under the LISTS it opens - and both are about
  the same two lists, so both now live in the third column beneath TYPE and SIZE. One cell, one
  skin, a ternary for the label and another for the press.
  (2) **Both sentences cut, and MEASURED rather than guessed** at `text-label`, which is what the
  card draws them in:
   · «Doesn't match what you want? Send it with your custom equipment name above» **391px → 152px**
     («Not listed? Use your own name»). Its column is `minmax(200px, …)` less the button's 24px of
     padding, so it clears even at the column's floor.
   · «This one does not go to Moedatech suppliers, but you can still post the request and share it
     with your suppliers offline» **573px → 317px** («This one won't reach Moedatech suppliers.
     Share the link yourself»). It spans columns two and three, ~340px at the 640px breakpoint and
     ~490px at the card's ordinary width.
  Arabic came out narrower on both (153px and 213px), as it usually does here.
  Files: `src/components/create/MachineCard.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`machineCard.useMyOwnName`, `notInCatalogueNote`),
  `tests/unit/custom-equipment-canvas.test.tsx` (3 cases rewritten).
  ⚠️ **The note is `sm:truncate`, so its LENGTH is now a layout constraint** - a longer sentence
  does not wrap, it disappears. Both dictionaries carry a note saying so. Below `sm` the class is
  absent and it wraps, because no sentence of this kind fits one line on a phone and forcing it
  would push the card sideways.
  ⚠️ **On a MATCHED line row one's second cell is now EMPTY.** That is the cost of the move and it
  is the owner's call: the offer belongs beside the two lists that failed him, not beside the box it
  fills.
  🔴 **This REVERSES «one control, two homes» from earlier today**, which had just reversed «one
  control with a ternary label». What survives across all three is the rule underneath: one SKIN, in
  one constant, so the two labels can never drift into two different-looking rows. The test that
  pinned two `ESCAPE_ROW` call sites now pins one.
  ⚠️ Verified: typecheck, lint (0 errors), 63 passing across the four card suites, and the full
  suite serially (3371 passing). The two failures are both KNOWN and neither is from this change:
  `ui-pins` (pre-existing CRLF staleness) and `share-request-email`'s `recipientEmails`, which is
  uncommitted work that exists nowhere in `HEAD`.
  🔴 **NOT seen rendered.** The canvas needs a session - a guest hits «You've reached your limit» on
  this backend - so the two strings were measured in the page rather than looked at in the card, and
  the measurement ran against the SYSTEM font stack because the local page had not applied Inter.
  Inter is a little wider, so the English note's ~20px of headroom at the narrowest `sm` layout may
  not be there; `sm:truncate` is what catches it. The card wants one look on a deployed build.

- **2026-09-13 - The site strip uses the whole card: the two round controls stop reserving width on every row.**
  Owner, on a screenshot of the intake floor: *"more project pill can fit in the row so make the max
  per row"*.
  🔴 **The chips were wrapping as if the card were 110px narrower than it is.** The strip sat in a
  `flex-1` group with the `+` and the arrow beside it, so those two held their own width on EVERY
  line of the wrap - and they only ever occupy ONE. His first row ended with about 200px of white
  after it and the next chip had gone to a second line that did not need to exist.
  `basis-full` on the group sends the controls to a line of their own and gives the strip the card.
  Files: `src/components/screens/Intake.tsx`, `src/components/create/ProjectChips.tsx`,
  `tests/unit/intake-floor.test.ts` (the «controls on the last row» case reversed).
  🔴 **This REVERSES a ruling from earlier the same day** - *"the wrapper keeps the controls on the
  LAST row"*, which had been checked against twelve sites in the live DOM. It was not wrong about
  what it measured; it was answering a different question. The cost of the reversal, stated: the
  floor is one row taller than it was.
  ⚠️ **`items-end` STAYS.** It is still what keeps the controls level with the bottom of whatever
  sits above them, and it is the half of that mechanism which was never the problem.
  ⚠️ The strip inside `ProjectChips` took `flex-1` in the same pass, so it fills the line after the
  lead rather than sizing to its own contents - which is the same fault one level down.
  ⚠️ **NOT changed: the chip LABELS.** He also said they look *"clipped or i dont know but
  stripped"*. They are `projectTitle` - the renter's own title, else `shortSite(location.label)`,
  which is the text before the first comma with runs of 4+ digits removed (a postcode rule). The
  names in his shot are Google PLUS CODES («PMGJ+PH», «RHOA», «RGRA»), which is what the geocoder
  returned for sites he never titled, not something this strip cut. Worth a look at the data before
  changing a shared helper that six surfaces read.
  ⚠️ Verified: typecheck, lint, 54 passing across the five touched suites, and the width
  break-checked (the group returned to `flex-1`) - two cases went red. NOT seen rendered.

- **2026-09-13 - Mansour asks the question from the front of it, and the line under it stops wrapping.**
  Owner, on the intake: *"put mansour before the question and make the text below as one line dont
  wrap it"*.
  (1) ~~A 52px rig on its own line above the heading.~~ There he was a mark floating over a page.
  He is INSIDE the `<h1>` now at 44px, still `is-waiting` - the kit's own «waiting for the user»
  lean-in - so the pair centres as one object and he reads as the one asking rather than as
  decoration over it. `flex-wrap` on the heading so the question can drop under him on a phone, and
  `flex-none` on him so he never squeezes when it does.
  ⚠️ **Arabic needs no branch.** «Before» is the LEADING edge, and a flex row reverses under
  `dir="rtl"` on its own: he lands on the right of «كيف تريد إنشاء طلبك؟» with no mirror rule.
  Verified in the browser in both directions.
  (2) **The sentence is one line, and its LENGTH is now a layout constraint.** The cap was
  `max-w-[640px]`, which broke it in two and hung «fill themselves in.» alone under the middle of the
  page. The cap is gone - and the copy was SHORTENED, because at 880px the old 120-character
  sentence could not be made to fit without shrinking the type, which is a worse answer to «don't
  wrap it». Both dictionaries carry a note saying so.
  ⚠️ `sm:whitespace-nowrap`, never bare. Below 640px no sentence of this kind fits on one line, and
  forcing it would push the whole DOCUMENT wider than the phone - the fault audited out of three
  surfaces on 2026-09-08. One line where there is room; wrapped where there is not.
  ⚠️ The trailing full stop went with the rewrite, which is the house rule for UI strings and which
  the old sentence had been breaking.
  Files: `src/components/screens/Intake.tsx`, `src/lib/i18n/{en,ar}.ts` (`intake.subheading`),
  `tests/unit/mansour.test.tsx` (1 case).
  ⚠️ Verified: typecheck, lint (0 errors), 38 passing across the intake/brand/wording suites, the
  placement break-checked (the rig and the nowrap both removed - the new case went red), and **SEEN
  RENDERED in both locales**: he sits before the question and the line holds at one row.
  🔴 NOT seen at phone width: the resize did not take on this browser, so the `sm:` fallback is the
  standard guard rather than an observed one.

- **2026-09-13 - `NO_SENDER_ADDRESS` can only reach this panel through a FAILED MAILBOX, so the connection is re-read and both routes out are on screen.**
  Owner, meeting that sentence a second time: *"didnt we fix this???"*
  **We fixed the wording, never the cause, and the cause is not the profile.** Traced end to end
  before touching anything:
   · `ShareRequestPanel` calls `share-email` from ONE place, and only when `willSend` - which needs
     `live.connected`. Gmail returns through its own branch and never reaches it. Not-connected
     takes the Moedatech-only branch and does not call it at all.
   · So the backend answering at all means `accessTokenFor(userId)` returned `ok: false`, and the
     handler then falls into its SES branch, where the check is the profile e-mail.
   · `accessTokenFor` already knows WHICH failure it was - `NOT_CONFIGURED`, `NOT_CONNECTED` or
     `RECONNECT_REQUIRED`, the last set after Microsoft rejects the refresh and the stored token is
     deleted - and `shareEmail.ts` throws that reason away.
  🔴 **BACKEND, the real fix, one branch:** in
  `apps/backend-agents/src/handlers/agents/requests/shareEmail.ts`, report `access.reason` when
  `access.ok === false` and it is `RECONNECT_REQUIRED`, BEFORE the `NO_SENDER_ADDRESS` guard. A
  renter whose consent has just lapsed is currently told to add an e-mail address, which cannot help
  him: Graph sends from the mailbox he consented with and reads no profile e-mail at all.
  🔴 **BACKEND, still owed since 2026-09-12: redeploy `agents-partners`.** `629db61f` (2026-09-09,
  on `main`) is what narrowed the guard to the SES path.
  **Web half, and it is deliberately not a guess.** Which remedy is the true one depends on WHICH
  Lambda is deployed, and this screen cannot know: on the build the owner tested on 2026-09-12,
  adding the address really did work, because the old guard ran before the token check. So both
  routes are offered and neither is claimed - the sentence keeps the one-field fix and its profile
  link, and `send` now RE-READS the connection on `NO_SENDER_ADDRESS` as well as on
  `RECONNECT_REQUIRED`, which is what makes the Reconnect offer appear when the token is the cause.
  The bracketed reason code is what tells us which it was on the next screenshot.
  Files: `src/components/share/ShareRequestPanel.tsx`,
  `tests/unit/share-request-panel.test.tsx` (1 new case; the stub counts status reads).
  ⚠️ **The narrower cut was written and rejected.** Withholding the profile remedy whenever the
  panel believes it is connected is right against the CURRENT source and wrong against a stale
  Lambda - it would have taken away the one remedy that has actually been observed to work, on the
  strength of a deploy nobody has confirmed.
  ⚠️ The Reconnect offer is gated on `!connect.connected`, which is why the re-read is the whole
  mechanism: without it the panel goes on believing a connection the server has already dropped.
  ⚠️ Verified: typecheck, lint, 132 passing in the panel suite, and the re-read break-checked by
  narrowing it back to `RECONNECT_REQUIRED` alone - the new case went red. NOT reproduced against a
  live mailbox: it needs a connected renter whose consent has lapsed.

- **2026-09-13 - The envelope names the MAILBOX, the body can be copied before the post, «تنزيل» for both files, and Mansour asks the question on the intake.**
  Owner, on the Arabic envelope preview: *"why i cant copy the body? also why it shows the supplier
  name in the bcc it must be the email, and for export call it تنزيل, + can u use mansour icon
  more in the chat intake somewhere, i want it to be attractive"*.
  (1) 🔴 **The Bcc chip shows the ADDRESS**, reversing *"the NAME leads, the address is the
  tooltip"*. That rule was borrowed from what a mail client draws for a header the renter WROTE;
  this one is addressed FOR him off his own supplier list, and the question he is answering is not
  «who is this» but «is that the right mailbox». «Al Faisal Rentals» cannot tell him whether the
  message goes to the branch address or to a salesman's, and a mistyped address in his own list is
  invisible behind the label he gave it. The name is the `title`, one hover away, and the initial
  disc still carries its first letter.
  ⚠️ **The confirmation dialog took this exact decision on 2026-09-09 and the two had quietly
  disagreed ever since** - that entry claimed *"the envelope preview already draws the address with
  the name beside it"*. It did not; it drew the name alone. One surface, one rule, at last.
  (2) 🔴 **The body copy is no longer LOCKED before the post**, reversing 2026-09-07. The rule was
  that the message ends with a URL that does not exist yet - true, and it answered a question nobody
  had asked: a greyed button beside a message he can read says «no» and never «not yet, and here is
  why». The caveat moved onto the control (`copyBodyPending` on `title`), and the clipboard gets
  exactly what is on screen: the message without a link, because there is no link.
  ⚠️ **Before the post it writes the PLAIN flavour only.** The rich one wraps the card in
  `<a href="…">`, and an empty href resolves to whatever page the message is pasted into - a card
  that looks like a link and goes nowhere is worse than no card.
  (3) **«تصدير المقارنة» → «تنزيل المقارنة».** Both presses on that row produce a FILE the renter
  keeps and the other already said تنزيل; one word for one act. English is untouched - «Export
  comparison» and «Download quotation» are both ordinary there.
  (4) **Mansour asks the question.** A 52px rig above the intake's heading, `is-waiting` - the kit's
  own state for this moment, *"waiting for the user"*. The heading IS his question, so he is not
  decoration beside it. Above and centred rather than to one side, so he holds the same axis as the
  heading and the box.
  Files: `src/components/share/mail-chrome.tsx`, `src/components/share/ShareRequestPanel.tsx`
  (`CopyBit` gained `title`), `src/components/screens/Intake.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`postShare.copyBodyPending`; `workspace.exportComparison` reworded),
  `tests/unit/share-request-panel.test.tsx` (4 cases rewritten to the two reversals).
  ⚠️ **«نسخة مخفية» is CORRECT and was left alone**, checked against Microsoft's own Arabic
  documentation rather than assumed: their Outlook-for-Windows page is titled *«إظهار حقل نسخة
  مخفية (نسخة كربونية عمياء)»*. «من» / «إلى» / «الموضوع» match their field names too.
  ⚠️ The chip is `dir="ltr"` unconditionally now. An address is always an ltr run whatever the page
  is: a domain reordered by the Arabic around it is a different address.
  ⚠️ One rewritten case was passing for the WRONG reason - «they are NAMED, every one of them»
  counted the firm's name twice, once in the supplier list and once in the envelope chip behind the
  dialog. With the envelope on addresses the name appears once, and the case now asks what it meant.
  🔴 **THREE tests are red in the full suite and NONE of them is from this change.**
  `share-request-email` and two `share-request-panel` cases fail on a `recipientEmails` field that
  exists in the working tree (`src/lib/api/client.ts`, `ShareRequestPanel.tsx`) and **nowhere in
  `HEAD`** - uncommitted work whose tests were never updated. It was green in two full runs earlier
  tonight and red in the third, and `client.ts` has a modification time inside this session that no
  edit of mine accounts for: **something outside this session is writing to this tree.** Reported
  rather than fixed - it is somebody's half-finished change and mending it silently would hide it.
  ⚠️ Verified: typecheck, lint (0 errors), and 75 passing across the six suites this work owns.
  **SEEN RENDERED**: the intake with Mansour over the heading. NOT seen rendered: the envelope chips
  and the copy control, which need a draft and a picked supplier.

- **2026-09-13 - «Copy addresses» moves onto the Bcc row, and the tick names the suppliers it reached.**
  Owner, on the control floating over the preview heading: *"what this copy? make it copy emails on
  the bcc field, not here"*, and *"in the success message when a request is posted and sent to email,
  show to who it was sent, like their emails; if so much addresses then show first 5"*.
  (1) **The copy sits on the field it copies.** It was a toolbar button beside «the message they
  receive», with nothing saying which addresses it meant - which is exactly the question he asked. On
  the Bcc row it needs no explaining, and it is the rule the subject and the body have followed since
  2026-09-07 (*"one on the title as copy title and one on the body as copy body"*). `MailField`
  already had the `action` slot; this is the third thing in it.
  🔴 **It is still drawn ONLY when there is something to paste**, and the first cut got that
  wrong: offering it on every Bcc row with an address in it is refused by two pinned cases («Given
  nothing was sent yet», «Given WE sent it - the message carried them»). A server-side send puts the
  recipients on the message; a paste offered there says the send needs one. The control exists for
  one fault only - Outlook's deeplink drops `bcc` silently, so the window it opened was addressed to
  nobody.
  (2) **The tick says WHICH suppliers, five of them, then a count.** The line said «sent from X to 4
  suppliers» and nothing answered «which» - and a mistyped address in the renter's own supplier list
  is invisible behind a number, on the last screen that could have shown it to him.
  ⚠️ **The ADDRESS, never the firm's name**, the same ruling the send confirmation took on
  2026-09-09: a name cannot tell him whether this went to the branch mailbox or to one salesman's
  personal one. Each chip is `dir="ltr"`, or an address inside an Arabic block reorders.
  🔴 **Whose list is it?** The backend DERIVES the recipients off the renter's supplier rows, so
  our own `reachable` is what we ASKED for, not what went out. The server's list wins whenever it
  gives one (`bcc` / `recipientEmails` on the sent response, neither of which the parser read
  before); ours is the fallback **only when `skipped === 0`**, where the two sets are the same size
  and naming ours cannot name somebody the server dropped. With a skip and no list, the tick says the
  count alone, exactly as it did.
  Files: `src/lib/api/client.ts` (`recipientEmails` on the sent result),
  `src/components/share/ShareRequestPanel.tsx`, `src/components/create/ShareOnPost.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`postShare.mailSentTo`),
  `tests/unit/posted-confirmation.test.tsx` (3 new cases), `tests/unit/share-request-panel.test.tsx`.
  ⚠️ **Both readers of the new field are defensive on purpose** (`outcome.recipientEmails?.length`,
  `mail.emails?.length`) although the parser always fills it. Both run AFTER the request is posted:
  a throw in `send` loses the share on a request that is already live, and a throw in the tick hides
  the only confirmation the renter gets for a send that really happened. An unrecognised shape must
  degrade to «we were not told», never to an exception - and the stubs in both suites are the proof
  that partial payloads reach these lines.
  ⚠️ Verified: typecheck, lint, 146 passing across the two share suites. NOT seen rendered.

- **2026-09-13 - The processing screen shows the CATALOGUE: the drawings were on the other taxonomy endpoint all along.**
  Owner, on a shot of a lone spinner over «نقرأ طلبك»: *"didnt we say it must show equipment he is
  trying to map, the ui is so dull"*.
  🔴 **My own diagnosis the day before was wrong, and this is the correction.** I reported that
  *"the catalogue has ONE picture"* and built the screen around a glyph because of it. True of the
  field I looked at; false about the product. There are TWO taxonomy endpoints and only one carries
  artwork, and I had measured the wrong one:
   · `/api/taxonomy` - the AGENTS service, what the create flow's dropdowns are built from. One
     image field, `equipment_image_url`, a PHOTOGRAPH, on **1 row of 413**.
   · `/api/stores/taxonomy` - the APP backend's tree, behind the browse filters since web-app/004.
     `imageUrl` / `imageKey`, the flat DRAWING, on **92 of 412**.
  **The ids are the same in both**, which is what makes it work and was worth checking rather than
  assuming: all 37 agent categories and all 58 agent subtypes resolve in the app tree, and every one
  of those 58 ends with a drawing - 55 of their own, 3 inherited from a category. The drawings the
  requests rail has always shown come from that same tree by way of the REQUEST projection, which is
  the clue I walked past.
  So: **READING** flicks through the catalogue, a drawing every 380ms, with NOTHING named; the
  moment the answer lands the reel stops and each matched machine gets its own drawing, its name and
  «Matched from our catalogue». The ring went 104px → 144px and the type a step up, because the
  screen holds three things and a viewport of air.
  Files: `src/lib/contract/taxonomy-icons.ts` (new), `src/components/screens/Processing.tsx`,
  `src/app/dev/preview/specimens.tsx` (`processing-no-art` added; the other two re-pointed at real
  catalogue icons), `tests/unit/taxonomy-icons.test.ts` (new, 9 cases),
  `tests/unit/{processing-screen,mansour,project-template-line}.test.*`.
  ⚠️ **The reel is NEVER captioned, and that is the whole licence for it.** A picture on this screen
  means «this is what the agent matched you to»; unnamed and moving, a reel reads as the catalogue
  being searched, which is what is happening. On 2026-09-12 I refused to show anything during the
  wait for exactly that risk - the answer was not «show nothing», it was «show them without a name».
  🔴 **The FIT changed sides, twice, and both were looked at in a browser.** `object-cover` was
  right while the slot held a photograph (1.83:1; contain drew a band across a round hole). It is a
  DRAWING now, carrying its own transparent margin, so cropping enlarges the margin rather than the
  machine - the requests rail's note of 2026-08-31. Plain `contain` then filled under half the
  circle and the tile read as empty, so it is `contain` PLUS `scale-[1.25]`, which is the same
  answer the rail reached. Safe only because the disc is `overflow-hidden rounded-full`; a case
  pins that.
  ⚠️ **A second request, deliberately.** The store already holds the agents taxonomy, and it is not
  the one with the pictures. `/api/stores/taxonomy` is what the browse filters fetch, it is cheap,
  and its public twin serves the same ids - which this flow needs, because a guest can run the whole
  of it. A failure is swallowed: no drawings, Mansour holds the ring, and the request the renter is
  waiting on is untouched.
  ⚠️ Mansour is the FALLBACK now rather than the default - an off-catalogue line, or a tree that
  failed to load. He keeps the corner mark whenever the ring holds a machine.
  ⚠️ `key={imageUrl}` on the `<img>`: without it the browser keeps the old pixels until the next
  decode and the reel stutters instead of flicking.
  🔴 **A test leak, fixed properly rather than retried.** `project-template-line`'s new case read
  `not.toHaveBeenCalled()` on `setAgentTyping`, and the typewriter holds that flag for 900ms after
  its last character - so an earlier case's `finally` lands past this file's `mockClear` and the
  blunt assertion failed on the leak rather than on the rule. It asserts the RAISE now
  (`not.toHaveBeenCalledWith(true)`).
  ⚠️ Verified: typecheck, lint, the full suite serially (3359 passing; the one failure is
  `ui-pins.test.ts`, pre-existing CRLF staleness). Both new rulings break-checked (the fit forced
  back to cover, the category fallback deleted); two cases went red. **SEEN RENDERED**: all three
  specimens, and the coverage numbers above measured against the two live services rather than
  reasoned about.
  🔴 **The reel itself was NOT seen moving in the real flow** - the screen is up for a few seconds
  behind a session and a live agent, and the browser tool times out inside that window. The
  specimens show one frame each.

- **2026-09-13 - The comparison's equipment rail opens on a bid the map can draw, and each band wears its own light tone.**
  Owner, on the compare table: *"the orange equipment must take to the map if at least one bid is in
  app, and in the map it will show other bids anyway"*, and *"can u make a light color for each
  section like the orange, maybe light blue for terms and light grey for prices as it is now"*.
  (1) 🔴 **The door pointed at rows that cannot open.** `equipmentTarget` was `rows[0]`, whatever
  it was, and `/bids/{id}/equipment` reads a supplier's REGISTERED machines, their papers and the
  yard he confirmed - none of which an off-platform submission has. That is what
  `mayOpenEquipmentSurface` has existed to say since the surface shipped, and this rail never asked
  it. On a request whose top row came in through the renter's own shared link - the ordinary case,
  and the one in his screenshot - the orange rail led nowhere. The target is now the first OPENABLE
  row, with the agent's recommendation winning only if it is one.
  (2) **One tone per section.** Three of the four bands were the same grey, so the only thing telling
  a rate from a certificate was the heading over it. `BAND` holds the two skins: money keeps its grey
  (the table's default reading), terms take the slate, and equipment keeps its orange.
  Files: `src/components/workspace/CompareMatrix.tsx`,
  `tests/unit/compare-matrix.test.tsx` (7 new cases, 57 passing).
  ⚠️ **`info`, never `action`.** This palette has no true blue by design - `--info` is a slate in
  the ink family - and `--action` (#1a7ec8) is reserved for the bid map's ask by RM3-AC-33, pinned by
  `palette-drift` and guarded by `rentee-map-surface`. Spreading it to a terms band would give one
  colour two meanings in one product. The printed comparison has used `--info` for this same band
  since it was written, so the two renderers agree.
  ⚠️ **The terms band keeps its tone OPEN as well as folded.** A colour that shows only while the
  section is shut means something in the half the renter reads least.
  ⚠️ **Landing on any in-app bid is enough**, which is the owner's own reasoning: the map carries
  every other offer on the request in its header, so the row it opens on is a starting point rather
  than a choice made for him.
  ⚠️ Verified: typecheck, lint, 277 passing across the six touched suites, and both halves
  break-checked (the door returned to `rows[0]`, the terms tone returned to grey) - two cases went
  red. NOT seen rendered.

- **2026-09-13 - The operator rail OPENS when it refuses, and it only refuses «Next equipment».**
  Owner: *"can u let the operator open and shake when user try to click next without opening, not
  from the review and send but from the next of the equipment"*.
  (1) **It opens.** ~~The closed 72px strip shook and stayed shut.~~ That asked the renter to work
  out that the shaking thing was a button and then press it - on the one panel the whole pass exists
  because he has never pressed it. Opening it IS the look being demanded, so the refusal performs it
  and the shake says which panel just moved. `shaking` turns into `setExpanded(true)` inside the
  rail, and the shake class moved onto the OPEN panel as well.
  (2) **«Review & send» no longer holds.** 2026-09-09 put the pass on both ways out of a machine;
  what that missed is where each press LEAVES the renter. «Next equipment» keeps him on this canvas,
  so opening the rail puts the panel in front of him and the next press carries on. «Review & send»
  is the last press of the whole request, and refusing it to open a panel nothing is MISSING from
  reads as a broken button rather than as an invitation.
  Files: `src/components/create/OperatorRail.tsx`, `src/components/create/Canvas.tsx`,
  `tests/unit/operator-rail-unseen.test.tsx` (two cases rewritten to the new rulings).
  🔴 **The cost, stated: a ONE-equipment request no longer forces the rail open at all.** Such a
  request has no «Next equipment», so that renter can finish having never seen the panel - the exact
  hole 2026-09-09 was written to close, re-opened for the single-item case at the owner's word. The
  operator's food, accommodation, nationality and certificate are all priced off it by the supplier.
  A case pins that hole deliberately, so the next reader meets it as a decision and not a regression.
  ⚠️ **The rail still owns `expanded`.** The canvas raises `shaking`; the rail turns that into a
  state change. A `forceOpen` prop would have been a second source of truth for one fact, and the
  canvas cannot derive the rail's state anyway - which is why `onOpenState` exists.
  ⚠️ **No `else` on that effect.** It must not CLOSE when the shake ends, or the panel would snap
  shut under a renter who has started reading it.
  ⚠️ The shake had to move to the open panel: it lived only on the closed strip, and that is the
  one element that stops existing the moment the refusal opens the rail - so the gesture would have
  fired on a node being unmounted.
  ⚠️ Verified: typecheck, lint, 96 passing across the nine canvas suites, and the opening
  break-checked (the effect forced off) - one case went red. NOT seen rendered.

- **2026-09-13 - Signing in and creating the account are ONE act: the second modal cannot be walked away from, and leaving it signs you out.**
  Owner: *"after the sign up or login modal it must open the create account for new users directly
  right? like a user cant be guest after login"*, then *"make the login and create account as one
  step but 2 modals, cant be done as 1 step only, check the prod main and align the logic"*.
  🔴 **A user COULD be a guest after login.** `guest` is a real backend state - `getUserTier`
  (`Moedatech-App/apps/backend/src/services/profile.service.ts:163`) returns it until `firstName &&
  lastName && city && jobTitle` ALL exist - and Modal 2 was an ordinary dismissible dialog with a ✕,
  a scrim and Escape. Verify a code, press any of the three, and the renter holds a session, a phone
  and nothing else: every tier-gated action refuses him and his badge reads «زائر». That is the
  account forwarded on 2026-09-10 (`+966566493886`), stuck on «مستوى حسابك لا يسمح بهذا الإجراء».
  Now the profile step is COMMITTED: `Dialog` gained `dismissible`, `AccountFlow` reports which
  phase it is on, and while the form is up the dialog has no way out of its own. The way out lives
  in the form and is named for what it does - «Leave and sign out» / «المغادرة وتسجيل الخروج» - a
  quiet underlined line under the act, never a second button beside it.
  ⚠️ **It really signs out, and that is the half that stops the guest.** A phone-first renter
  already holds a session by the time that form is on screen; closing without the sign-out is
  exactly what stranded people. An email-first one has no account at all - only the onboarding token
  `AuthGate` keeps for the «Finish your signup» banner - so the call is harmless there.
  🔴 **`origin/main` was checked first, as asked, and it is the SAME CODE.** `afterVerified` reads
  the authoritative tier off `/api/me` and routes anything below basic to `setPhase("profile")`,
  line for line, on both; the entire main↔beta difference in this flow is the design-system pass
  (`btn()`, `Dialog`, the tokens, the navy panel) plus the dropped `companyName` field, and beta is
  AHEAD of main there with no main-only commits. **Prod has the identical hole**, so «align with
  main» would have changed nothing. The routing was never the fault - being able to leave was.
  Files: `src/components/Dialog.tsx` (`dismissible`), `src/components/onboarding/AccountModal.tsx`,
  `src/components/onboarding/OnboardingForm.tsx` (`onAbandon`), `src/lib/i18n/{en,ar}.ts`
  (`onboarding.leave`), `src/app/dev/preview/specimens.tsx` (`onboarding-form`),
  `tests/unit/onboarding-gate.test.tsx` (new, 9 cases).
  ⚠️ **`dismissible={false}` is for this one dialog and must stay that way.** Every layer in this app
  has a way out; a dialog without one is a trap. It is allowed here only because leaving is not
  «close the dialog» but «abandon a signup», a different act with a different consequence, and the
  body carries it explicitly. A case pins that `AccountModal` is the only caller.
  ⚠️ The focus TRAP is untouched - `useDialogKeys` still runs and only its Escape half is neutered.
  An undismissable dialog needs the trap more than an ordinary one, not less.
  ⚠️ The keep/switch question is deliberately NOT committed: that account is already complete and
  both its buttons are answers, so there is nothing to trap anybody into.
  🔴 **This does nothing for the guests who already exist**, and there are some in production. A
  returning guest who presses «Sign in» does resume at Modal 2 (`hasGuestSession`) and now cannot
  leave it without finishing or signing out, which covers him the moment he comes back - but nothing
  goes looking for him. The «Finish your signup» banner is still email-first only
  (`persistOnboarding` is called from one place, the `needsSignup` branch of `CodeEntry`); extending
  it to phone-first guests is the backstop, and it is NOT done here.
  ⚠️ Verified: typecheck, lint, the full suite serially (3345 passing; the one failure is
  `ui-pins.test.ts`, pre-existing CRLF staleness). Break-checked both halves (the gate removed, the
  sign-out removed); two cases went red. **SEEN RENDERED** through the new `onboarding-form`
  specimen.
  🔴 **NOT reproduced end to end.** Neither the old fault nor the fix was exercised against a real
  OTP: this machine cannot receive one. The routing, the tier rule and the three exits were read off
  the source and the backend's own `getUserTier`, and the gate is pinned by tests and a picture.

- **2026-09-13 - The guest wall centres on the SCREEN, and its page reaches the fold.**
  Owner, on a shot of `/requests` signed out: *"the background and popup not centered, make it like
  the dashboard center, also for both can u show more from the background like read dashboard and
  read requests but blurr"*.
  (1) **The centring was a HEIGHT fault.** The card layer is `absolute inset-0`, so it centres inside
  the wall's own box - and that box was sized by the preview alone. On requests the parent is a
  `flex-1` column the height of the viewport while the preview is about 570px, so the card landed
  near the top with half a screen of white under it. The dashboard only looked right because its
  preview happens to be about as tall as its page. The root takes `h-full` plus a
  `min-h-[calc(100dvh-8rem)]` floor, and the backdrop floats (`absolute inset-0 overflow-hidden`) so
  it can no longer decide the height - and so a backdrop longer than the fold does not grow the page
  a scrollbar for something nobody can read or reach.
  (2) **Both previews reach the fold.** Requests gains the comparison strip under the bid cards (a
  supplier column and six term cells over five rows); the dashboard gains its supplier TABLE (a head
  row of five column stubs, then six rows with a mark, two runs and a pill).
  Files: `src/components/common/GuestWall.tsx`,
  `tests/unit/guest-wall-backdrop.test.tsx` (6 new cases, 16 passing).
  🔴 **The 2026-09-06 ruling STANDS and this does not reverse it**: the backdrop is the page's own
  SKELETON and never invented data, because *"rendering plausible-looking rows of somebody's business
  behind a blur would be inventing a dashboard he does not have"*. What is added is FURNITURE - more
  bands, more rows, more cells - and a case asserts both previews render no text at all.
  ⚠️ **The blur stays at 3px and the opacity at 92%.** «Show more» was answered with more PAGE, not
  with a sharper one: raising either would start making a placeholder look like data, which is the
  fault the tone was tuned against on 2026-09-12.
  ⚠️ **`h-full` and the floor are both needed.** `h-full` takes the height where a parent offers
  one (requests, inside its flex column) and resolves to `auto` where none does (the dashboard, in
  ordinary page flow) - and with the backdrop now absolute, the floor is the only thing giving that
  page height. The old flat `min-h-[420px]` is shorter than the fold, which is the same fault again.
  ⚠️ **A comment claimed a mechanism nobody wrote.** It said *"`sticky` inside the absolute layer
  keeps it in the middle of the VIEWPORT"*; there is no `sticky` in the file and there never was,
  which is most of why this went unnoticed. Kept struck through as the record, with a case reading
  the CODE rather than the prose.
  ⚠️ Verified: typecheck, lint, 156 passing across the five touched suites, and both halves
  break-checked (the flat floor restored, the backdrop put back in flow) - two cases went red each
  time. NOT seen rendered: the centring is a measured fact and jsdom lays out nothing, so both walls
  want one look signed out.

- **2026-09-13 - MANSOUR is in the product: he is what the processing screen shows, and he is the one writing the template's machine into the box.**
  Owner, handing over `Mansour Kit`: *"can u use this mansour kit that represent the agent, use it
  in the processing and use it here for typing when u select a project and it auto fills the
  equipment name, make it like this mansour is writing it"*.
  (1) **He is VENDORED, not redrawn.** `src/components/mansour.css` is the kit's `mansour.css` byte
  for byte and `Mansour.tsx` carries its `mansour look.svg` path unchanged; the component is only
  the wrapper the stylesheet expects, a size, and which of the three states he is in
  (`live` / `waiting` / `aiming`). The kit is what runs on moedatech.net, so an edit here would make
  this app's agent a different character from the marketing site's, and nothing would say so.
  (2) **The processing screen draws HIM.** ~~`precision_manufacturing`.~~ A generic equipment glyph
  on the one screen whose subject is the AGENT: it said «equipment» where the honest word was
  «him». He is 56px inside the 84px well, `is-live`, with the ring turning around him; once a
  machine has a picture the picture takes the well and he keeps the trailing-bottom corner at 26px
  on a 34px disc of the page's own ground - the slot the old screen's green «it is running» dot
  held, now saying WHO as well as whether.
  (3) **He writes the template's machine.** Picking a template has typed its machine into the
  intake a character at a time since 2026-08-31 (*"like someone is really typing this item"*); that
  answered HOW and left WHO unsaid, so the line still arrived from nowhere. `agentTyping` is raised
  for the length of the run and the intake perches him on the box's trailing-top corner while it is
  up, then he goes.
  Files: `src/components/Mansour.tsx` (new), `src/components/mansour.css` (new, vendored),
  `src/components/screens/{Processing,Intake}.tsx`, `src/components/create/ProjectChips.tsx`,
  `src/lib/store/rfq-store.tsx` (`agentTyping`, `AGENT_TYPING`, `setAgentTyping`),
  `src/app/dev/preview/specimens.tsx` (`mansour`), `tests/unit/mansour.test.tsx` (new, 13 cases),
  `tests/unit/{processing-screen,project-template-line,palette-drift}.test.*`.
  ⚠️ **A PERCH, not a caret.** The kit's own note says he leaves the box and watches from a FIXED
  spot on its rim while somebody else's words go in - *"his original complaint was that he drifted
  while you typed"*. Being the caret needs a measured x per character, and this field is a mirrored
  textarea whose own glyphs are transparent: there is no element to measure against.
  ⚠️ `pointer-events-none` on the perch. He stands over a field the renter may be typing in, and a
  decoration that swallows a click on the text is worse than no decoration. A case pins it.
  ⚠️ **The flag is lowered in a `finally`,** and it outlives the last character by 900ms so he is
  seen reading it back - «Grader» is six characters, 84ms, and would otherwise flash.
  🔴 **`project-template-line.test.tsx` broke, and the way it broke is the trap.** Its store is a
  hand-written mock and `applyTemplate` ends in a bare `catch {}` - so a missing `setAgentTyping`
  was not a `TypeError` in the report: the whole template silently did nothing and TWO unrelated
  cases failed with «0 calls». That mock must carry every action the component calls; its head now
  says so.
  ⚠️ **His four colours are exempt by FILE** in `palette-drift` and in the lint rule, like the
  Outlook/Gmail compose chrome: #9AA3AE, #6B737E, #6E7075, #f3efea are the kit's, and the kit's
  README says he is *"grey on purpose so he sits on any brand colour"*. He is a drawing - the values
  only mean anything together - so tokenising any one of them recolours the character.
  ⚠️ The rig's silent-breakage rules are pinned rather than trusted to comments: inline SVG never an
  `<img>`, the `v4m-` prefix unrenamed, `overflow: visible`, BOTH `transform-box` lines, and the two
  rest-pose matrices matching the gaze keyframes' first and last stops (change one and he jumps at
  the loop point, once every nine seconds).
  ⚠️ Verified: typecheck, lint, the full suite serially (3328 passing; the one failure is
  `ui-pins.test.ts`, pre-existing CRLF staleness). Three rulings break-checked (the glyph put back,
  the pointer guard removed, a `transform-box` line deleted); four cases went red.
  **SEEN RENDERED**: the two processing states and the new `mansour` specimen, and the intake perch
  photographed on the real box by forcing `agentTyping` in the store and reverting it.
  🔴 **The typing was NOT exercised end to end**: it needs a signed-in renter with a project that
  has templates, and this machine has no session. The flag's two edges are pinned by tests and the
  perch by a picture; the two halves have not been seen meeting.

- **2026-09-13 - The canvas's «YOU WROTE» card is withheld when he wrote nothing, and it wears the ribbon's orange.**
  Owner, on a screenshot of a direct request showing the card over a bare em dash: *"remove the
  below one when direct request as no input, and also use the above color in the intake card below
  in case of broadcast"*.
  (1) **Withheld.** A direct request is seeded from the machine he PRESSED in a store, so
  `state.text` is empty: the card drew «YOU WROTE» over a dash, which is a heading for a quote that
  does not exist, beside an «Edit» whose whole job is to walk back to the typing box. The one thing
  this card is for - letting him check what we read against what he wrote - has no content there.
  (2) **The tone is the direct ribbon's.** It was `--warn`, and this palette serves that as a
  MUSTARD (#b98a1d) rather than an orange - the same mismatch the canvas's provenance ring was
  corrected for on 2026-09-08. One orange on the screen now, whatever sits above it.
  Files: `src/components/create/Canvas.tsx`,
  `tests/unit/canvas-you-wrote.test.ts` (new, 6 cases).
  🔴 **«Start over» goes with the card on that path, and it is the canvas's ONLY one.** Deliberate
  and NOT replaced: Back still walks the flow out, the ✕ on a direct tab is a trip to the store, and
  `SET_DIRECT` drops the draft the moment he presses a different machine - so it is not a dead end.
  Said out loud because it is a control disappearing rather than a decoration, and because the next
  reader will otherwise restore the card to get it back.
  ⚠️ **The test is the WORDS, not the mode.** `?prefill=` can seed a direct request's text, and
  then there IS something to check - gating on `state.direct` alone would hide the card exactly when
  it starts being useful. A case pins that.
  ⚠️ The label and the «Edit» link take `brand-deep` (#c2570f) and never `brand`: orange TEXT on a
  light ground has to be the dark one to pass AA, while the tile and the border keep `brand` because
  those are a fill and an edge. Same ruling as 2026-09-08, and a case pins it.
  ⚠️ Verified: typecheck, lint, 215 passing across the ten touched suites, and both halves
  break-checked (the gate forced open, the mustard restored) - four cases went red. NOT seen
  rendered: the direct path needs a signed-in renter and a real store, so it wants one look.

- **2026-09-13 - The agent at work is one ring, one picture and one line; the stage rail, the feed, the bar and the percentage are gone.**
  Owner: *"make it very simple processing icon that is aligned with our design system and no need
  for steps and many complicated text he is doing, i want something simple and the taxonomy he is
  thinking of and processing so images of taxonomy in our db will be shown in processing according
  to what the agent is matching"*.
  ~~Four numbered stages with a filling rule between them, a four-line «LIVE ACTIVITY» feed, a
  progress bar, a percentage pill, an «AGENT WORKING» caption and a counts line.~~ Six devices
  narrating a request the server answers in ONE shot, on a screen that is up for about four seconds.
  What is left is the thing the renter is waiting to learn: WHICH MACHINE the agent decided he
  meant, as the catalogue's own photograph of it with its catalogue name under it.
  Two states, and only one of them names anything: IN FLIGHT draws the glyph and «Reading your
  request», because nothing has been matched yet; MATCHED steps through the items the agent
  returned, in the canvas's own order, each with its picture and «Matched from our catalogue».
  Files: `src/components/screens/Processing.tsx` (`ProcessingView` split out),
  `src/lib/i18n/{en,ar}.ts` (the `processing` block: 21 keys → 3),
  `src/app/dev/preview/specimens.tsx` (`processing-reading`, `processing-matched`),
  `tests/unit/processing-screen.test.tsx` (new, 9 cases).
  🔴 **The pictures are `equipmentImageUrl`, and the catalogue has ONE.** Measured against the live
  agents taxonomy before building: `GET /agents/taxonomy` returns 413 nodes carrying exactly one
  image field, `equipment_image_url`, and **1 of 413 rows has a value** (Crawler Excavator). So the
  slot draws the glyph for nearly every machine today and fills itself, with no further web change,
  as the admin panel fills that column. **CONTENT/BACKEND, owed**: either populate
  `equipment_image_url`, or put the taxonomy's flat ICON on that payload - the drawings the requests
  rail shows come from the REQUEST projection (`subtypeImageUrl` / `categoryImageUrl`), which does
  not exist before the request does and therefore cannot be read on this screen.
  ⚠️ **Nothing is invented to fill the wait.** Cycling catalogue pictures while the request is in
  flight was considered and refused: a picture here means «this is what the agent matched you to»,
  and machines it has not chosen would make the one honest use of the slot unreadable. Same reason
  the caption is only drawn under a name - a machine name alone on a loading screen reads as the
  thing being waited for rather than as a finding.
  ⚠️ **The ring reports no POSITION, deliberately.** `processRfq` is one request and the server
  answers once; the old bar was anchored to stages rather than to a clock, which was the honest
  version of a dishonest device. A spinner says «working» and claims nothing.
  🔴 **`object-contain` was tried on the picture and rejected in the browser**: `equipment_image_url`
  is 1.83:1, so contain drew a 76x41 band across a round hole with empty crescents. A photograph
  reaches its own edges and takes the crop - the requests rail measured the same thing on
  2026-08-31. The rail's OTHER rule, the 1.34 scale, belongs to taxonomy DRAWINGS and is not copied,
  because no drawing can reach this screen.
  ⚠️ **`ProcessingView` is exported for `dev/preview`**, and `Processing` renders it and nothing
  else. The screen is up for four seconds inside a flow needing a session, a project and a live
  agent; it could not be looked at while being changed, which is what that page exists for.
  ⚠️ The ERROR dialog is untouched - it still tells a 429 from a 402/403 from a dropped connection,
  and a case pins that.
  ⚠️ Found while measuring, NOT acted on: **`tag_ar` is now on the taxonomy wire** (37 of 413 rows).
  `taxonomy.ts`'s hand-written `TAG_AR` map exists only because it was not, and its own note asks
  for exactly this field. Reading it would retire that map.
  ⚠️ Verified: typecheck, lint, 9 new cases, the full suite serially (3300 passing; the one failure
  is `ui-pins.test.ts`, pre-existing CRLF staleness). Both new rulings break-checked (the crop
  reverted to contain, a swept key put back); each went red. **SEEN RENDERED** through the two
  specimens, and the live flow run end to end at `/create` - the reveal hands over to the canvas.
  🔴 **The transient screen was NOT photographed in the live flow**: the browser tool timed out on
  every capture inside its four-second window. The specimens are what was looked at.

- **2026-09-12 - The card has ONE orange, and the off-catalogue note stops claiming we do not stock the machine.**
  Owner, on a shot of the equipment box: *"use unified font colour for missing fields, some have dark
  orange like return and site and some have orange like size, so unify"*, *"make the sentence fit in
  one line"*, and *"change its wording, it is not clear - I am thinking of the case the user found his
  custom name more suitable and didn't know the request will not be sent to our suppliers, so even the
  note must be clear, and it is not the case always that this equipment is not available like what the
  note says"*.
  (1) **Two oranges for two states, a hand's width apart.** `CanvasField`'s label read
  `missing ? text-brand : isSystemChosen ? text-brand-deep`, so «SIZE» (unanswered) drew #f97316 and
  «RETURN» / «SITE» (filled for him) drew #c2570f on the same card. The brighter one was also
  breaking this file's OWN rule, written on 2026-09-08: orange TEXT on a light ground must be the deep
  one to pass AA, and `brand` is a FILL. Both states take `brand-deep` now, and `RequiredDot` with
  them - it was `brand`, so the ● and the word it follows were two oranges an inch apart.
  ⚠️ **Nothing is lost by merging the inks**, which is why this was safe: the ● is still drawn for
  `missing` alone and the ring round the control for `isSystemChosen` alone. What the renter reads
  the STATE off is per-state; only the shade was doing two jobs badly.
  (2) **The action is a full-width ROW carrying the owner's whole sentence**, «Didn't match your
  equipment? Send it with your own equipment name above».
  🔴 **The COLUMN was choosing the words, and it kept choosing badly.** Four wordings died in the
  freed CATEGORY slot before the slot was questioned: ~~«Doesn't match what I want? Use my own name
  of equipment»~~ (three lines, and «what I want» asked about his PREFERENCE - *"i am thinking of
  case user found his custom name more suitable and didnt know the request will not be sent to our
  suppliers"* - so a renter who merely liked his own wording had every reason to press it);
  ~~«My machine is not listed»~~ (a statement: when to press, never what pressing does);
  ~~«Name it myself»~~ (an act with no object, on a card whose name box is already filled);
  ~~«Send it with the name above»~~ (points at the box at last, and still *"must be clear"*).
  ~160px of text cannot hold a sentence that names BOTH the condition and the act, so every candidate
  dropped one of the two. Moving the control under the two lists gives it the card's whole width and
  the question answers itself.
  ⚠️ **This reverses the owner's own first placement** (*"the freed column carries an action"*,
  2026-09-12) on his own later evidence. TYPE and SIZE keep the widths they had - the grid is back to
  `1.5fr/0.9fr/1fr` - and the third cell is simply empty space beside SIZE.
  ⚠️ `sm:whitespace-nowrap`, never a bare `whitespace-nowrap`: one line where he is looking, and a
  WRAP on a phone, where the grid is one column and an ellipsis through a sentence would be worse
  than two lines of it.
  ⚠️ **The row is ONE control with two labels**, so the two doors cannot drift apart: on a matched
  line it takes the taxonomy off, and on an off-catalogue line it is the way back in - «Select from
  our list» (owner, 2026-09-13: *"if it is clicked then in its place, with no taxonomy selected, we
  will write «select from our list»"*). It OPENS the type list rather than naming it, because the
  lists are still on screen above the row and something that only points at them is a caption.
  ⚠️ It opens by REMOUNTING the control with `defaultOpen`, keyed on a press counter - which is what
  that prop's own note prescribes: it is read once at mount so a list can be closed and stay closed,
  and a caller wanting it open again remounts with a `key`. Flipping a boolean without the key would
  do nothing at all, silently.
  ⚠️ **The press POINTS at what it changed** (owner, 2026-09-13: *"clicking it will highlight with
  animation … the equipment [name] with the note below it"*). It changes three things at once - the
  taxonomy empties, the name box gains its star, a warning note appears - and every one of them is
  ABOVE the row he pressed, so without this the card rearranges itself behind his eyes. `.attn-pulse`
  outlines the name FIELD, which encloses the box and its note: the pair the press created.
  ⚠️ **A pulse and never a shake.** `shake-error` is this canvas's word for a REFUSAL, and nothing
  was refused - the line moved to a state he chose. Under `prefers-reduced-motion` the outline stands
  with no animation, the same trade `.shake-error` and `.carried-mark` already make.
  ⚠️ It is cleared on a TIMER, not on the animation ending: that event never fires under reduced
  motion, so the outline would stay on the card for the rest of the session.
    (3) **The note is the owner's own sentence**: «This one does not go to Moedatech suppliers, but you
  can still post the request and share it with your suppliers offline».
  ~~«This equipment type is not available, but you can still post and share the link with your
  suppliers».~~ It made a claim about our CATALOGUE, and since the renter can now take a line
  off-catalogue himself that claim is false half the time - the type he rejected is sitting in the
  list directly above the sentence. Two replacements of mine were rejected in turn as unclear
  (*"both sentences not clear"*), the first at 180 characters whose opening clause described our
  MATCHING rather than his outcome.
  ⚠️ **«This one», never «this request».** One line of a five-line request can be off-catalogue while
  the other four go out to everybody who stocks them.
  ⚠️ **«offline» carries a SECOND meaning in this dictionary** - «you appear to be offline», the lost
  connection, in four strings. Kept deliberately: it is also the word the source filter and the
  comparison have shown him for weeks («Offline · invite»), so it is the product's own name for a
  supplier reached outside Moedatech.
    (4) **The off-catalogue box wears the OPERATOR RAIL's light orange**, and its sentence the ink that
  goes with it. Owner: *"it is not yellow and not orange, use colours in our design system and used in
  other places for warning"*, then *"can we use another colour? we might use the same operator light
  orange colour"*.
  🔴 Two faults, one after the other. The hint's ink was `text-warn` = #b98a1d, and
  `globals.css` says in as many words that `--warn` is a **FILL** and `--warn-deep` (#8a6412) is the
  one that may carry TEXT — at 2.97:1 on that pale ground the sentence came out khaki. Moving it to
  `warn-deep` fixed the contrast and left the real problem: `bg-warn-soft` (#f7edd8) is a sandy cream,
  and against the orange this card now speaks everywhere else (the labels, the dot, the pulse) it read
  as a third colour nobody chose. ~~`border-warn/40 bg-warn-soft`~~ → `border-brand-light
  bg-brand-soft`, which is the COLLAPSED OPERATOR RAIL's own pair, one panel to the right of this box,
  with `text-brand-deep` on the sentence and `--brand` on the pulse.
  ⚠️ **It was never DRIFT** - the old pair is exactly `NOTICE_TONE.warn`, the recipe every other
  warning in the app wears. It is a deliberate departure on one box, because this card carries four
  orange marks of its own and a fifth colour beside them reads as a mistake. `UnavailableCard`'s copy
  of the note moved with it (`tone="warn"` → `tone="brand"`), so the two cannot disagree.
  ⚠️ **Reported, NOT fixed - three more `text-warn`-on-words** on this flow: `Canvas.tsx`
  («YOU WROTE» and its link), `WherePanel` and `WhenPanel`. The identical violation, and they want one
  sweep rather than four edits smuggled into a copy change.
  (5) **The box is TWO rows, and nothing in it is wide and useless** (owner, 2026-09-13: *"i want the
  equipment [name] to be in the same row as the note below it because the field is so wide and
  useless, and for the type-size also must be on the same row as the note below, so totally 2 rows
  here"*).
  ~~Name (full width) · note · TYPE + SIZE · the offer.~~ Four rows, and the name box alone took the
  card's whole width to hold «Spider Lift». Now: **row one** is the name beside the sentence that
  state owes — the warning note off-catalogue, the way OUT of the catalogue when matched; **row two**
  is the two lists and, off-catalogue, the way back in.
  ⚠️ **The offer changed HOME, not identity.** Each label now sits beside the thing it acts on: the
  way out next to the NAME box it points at, «Select from our list» next to the LISTS it opens. They
  share one `ESCAPE_ROW` constant, so the skins cannot drift; the test that used to pin one ternary
  now pins two uses of that constant.
  ⚠️ Row one repeats `TRIO_COLS` rather than splitting 1fr/2fr of its own, so the name box lines up
  EXACTLY with TYPE beneath it. A ratio of its own is off by the gap, which shows as a step down the
  left edge of the box.
  ⚠️ This also retires the one-line problem that cost four wordings: the long sentence now has two
  thirds of the card's width in row one, so it fits on one line without being shortened again.
  (6) **An empty TYPE or SIZE asks for an answer instead of repeating its own label** (owner,
  2026-09-13: *"here if no selected show «select equipment type from our list» and «select size»,
  this exact wording"*). The placeholder was the label again — «TYPE» over a box reading «Type» —
  and a noun repeated under itself says nothing twice. His wording, taken as given; the card's other
  empty controls have asked since 2026-09-08 («Pick min year», «Pick certificate») and these two were
  the last that did not.
  ⚠️ The trigger `truncate`s, so a placeholder wider than its column is CUT with an ellipsis rather
  than overflowing. «Select equipment type from our list» is ~35 characters in a ~236px column: it
  should just fit, and it has not been seen rendered.
  ⚠️ **Two near-identical sentences now stand on an off-catalogue line** — this placeholder and the
  dashed «Select from our list» row added hours earlier, two lines apart. Reported, NOT removed: he
  asked for that row by name. It may now be redundant, since the TYPE control says the same thing and
  is the same single press.
  (7) 🔴 **Hidden taxonomy in the renter's dropdown: built, and held OFF.** Owner, on a TYPE search
  for a hidden machine returning «—»: *"why is the hidden taxonomy not shown in the dropdown? it must
  be matched from the agent and must appear in the dropdown anyway"*.
  The web's catalogue is `GET /agents/taxonomy?tenant=default`, and that endpoint excludes HIDDEN
  unless the caller says `includeHidden=true` — so the dropdown has never held one. The flag is the
  whole of the web change and it is now wired, behind `TAXONOMY_INCLUDE_HIDDEN` in `src/lib/flags.ts`.
  **It must not be turned on before the app backend's B2.** `assertRequestable`
  (`taxonomy-normalization.service.ts:176`) REFUSES a hidden subtype at create, so a renter who picked
  one out of the list would fill in the whole card and be 422'd at «Review & send» with nothing on
  screen he could fix — worse than not offering it. The AGENT's own `includeHidden` (built,
  uncommitted, `Normalization-Agent`) is blocked on the same B2, for the same reason.
  ⚠️ A CODE toggle, not a `NEXT_PUBLIC_*` env var, on the `TRIAL_REQUESTS_ENABLED` precedent: it is
  a product decision that lands in one deploy, not a per-environment setting.
  (8) **THREE tints, three meanings, on the card and on the share surfaces alike** (owner,
  2026-09-13, on the share panel beside the posted tick: *"can u unify the colours and their
  meanings"*).
  🔴 They had drifted into five: a cream `warn` block for the off-catalogue caution, a peach
  `brand` block for a destination that WOULD receive the request, a green one for a destination that
  HAD, a peach one again for the project it was filed under, and grey for a destination that would
  not. Two of those peaches meant different things, and the cream said what the create card had just
  started saying in orange.
  · **ORANGE** `bg-brand-soft border-brand-light text-brand-deep` — «pay attention», this will not
  work the way you expect. One per screen, ideally.
  · **GREEN** `bg-ok-soft border-ok/40 text-ok-deep` — «it happened». Never a promise about the
  future.
  · **GREY** `bg-surface2` · `border-border` or `border-border-strong` — a plain statement with no
  verdict: a destination listed, a project named.
  ⚠️ **`on` and `off` are both GREY**, deliberately. One is «this will receive it» and the other
  «this will not», and neither is a verdict on the request; they are told apart by the border's
  weight, the greyed mark and the words, which is where that difference actually lives. Painting
  «will receive it» green would promise a send that has not happened.
  ⚠️ The PROJECT block lost its peach for the same reason: on a dialog that can show both at once
  it was competing with the caution for the one colour that means «pay attention».
  Files: `src/components/create/Provenance.tsx`, `src/components/create/MachineCard.tsx`,
  `src/app/globals.css` (`.attn-pulse`), `src/lib/flags.ts`, `src/app/api/taxonomy/route.ts`,
  `src/components/share/ShareRequestPanel.tsx` (`DestinationBlock`),
  `src/components/create/ShareOnPost.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/canvas-provenance.test.tsx` (4 new cases), `tests/unit/custom-equipment-canvas.test.tsx`
  (3 new cases), `tests/unit/canvas-multi-item.test.tsx`.
  ⚠️ **Two suites counted `.text-brand` to prove the required dot was drawn**, and that class stopped
  existing. They read the ●'s own glyph now - moving them to `.text-brand-deep` would have made them
  VACUOUS, because a chosen-for-you label wears that class with no dot on screen.
  ⚠️ Verified: typecheck, lint, 126 passing across the ten canvas / copy suites, and the unified ink
  break-checked by restoring the old ternary - two cases went red. **NOT seen rendered**: the one-line
  fit is arithmetic and the tone is a measured value, and jsdom lays out and composites nothing, so
  the row wants one look.
  ⚠️ `npm run typecheck` also reports two errors under `.next-gw2/`, which is a probe build another
  session left in the tree along with two `tsconfig.json` include lines. Not from this change, and
  neither the folder nor that file belongs in a commit.

- **2026-09-12 - The guest wall's backdrop is a PAGE behind glass, and a round skeleton stopped being a square.**
  Owner, on `/requests` signed out: *"show the backgroudn state too, it is totally blank now"*. The
  card in front has never been in doubt; the whole argument of this wall is the shape of the page
  behind it, and there was nothing there to see.
  Three causes, and no one of them alone explains it.
  (1) **The glass was opaque enough to erase the page.** `opacity-60` under a 3px blur, over a
  skeleton that is already pale. It is `opacity-[0.92]`; the blur is UNCHANGED, because the blur is
  what says «not yours yet» and raising it would put the emptiness back by another route.
  (2) 🔴 **`Skeleton` paints `--surface2` (#f4f4f4), which is 11 levels off white.** On the page it
  is a placeholder inside a card the reader is already looking at; under a blur behind a card he is
  NOT looking at, it is invisible. The glass carries `[&_.bg-surface2]:bg-surface3` - one step down
  the same ramp, still unmistakably a placeholder, and a shape you can see. A VARIANT on the backdrop
  rather than 30 edited `Skeleton` calls: the tone belongs to this surface, not to the previews.
  (3) **The previews were three shapes.** `GuestRequestsPreview` was five circles, one bar and four
  blank rectangles. It draws the page's real bands now - the 96px rail with a captioned tile per
  request, the Cards/Compare strip with the export opposite it, and bid cards at the card's own
  344px carrying their source strip, the supplier with his price, three term rows and the two acts.
  `GuestDashboardPreview`'s two flat slabs (the CTA band, the three cards) got their furniture in the
  same pass. What a card looks like INSIDE is most of what makes a page recognisable.
  Files: `src/components/common/GuestWall.tsx`, `src/components/Skeleton.tsx`,
  `src/app/dev/preview/specimens.tsx` (`guest-wall-requests`, `guest-wall-dashboard`),
  `tests/unit/guest-wall-backdrop.test.tsx` (new, 10 cases).
  🔴 **SHARED, and a real bug found on the way: `<Skeleton className="rounded-full">` drew a SQUARE,
  everywhere in the product.** Tailwind emits `.rounded-sm` AFTER `.rounded-full` and both are one
  class of specificity, so the component's own base radius always beat its caller's - class order in
  the attribute decides nothing, only the sheet's order does. `Skeleton` withholds its default when
  the caller names a radius now. Two files pass one (this one, and
  `RequestsWorkspace.tsx:669`, whose loading rail was drawing six rounded squares); every other
  `Skeleton` in the app is byte-identical.
  ⚠️ **This REFINES the 2026-09-06 ruling, it does not reverse it.** *"Rendering plausible-looking
  rows of somebody's business behind a blur would be inventing a dashboard he does not have"* still
  stands: every element is a `Skeleton`, and two cases pin it - the backdrop's `textContent` is
  empty, and every leaf of it carries the pulse class. Density changed; honesty did not.
  ⚠️ The dashboard's CTA band is grounded `surface` and NOT `surface2`: the glass darkens every
  `surface2` to `surface3`, so a band painted in it comes out the same tone as its own contents,
  which is the flat slab this replaces with different markup. Same reason the bid card's source
  strip lost its tint.
  ⚠️ Verified: typecheck, lint, the 10 new cases, and the full suite serially (3286 passing; the one
  failure is `ui-pins.test.ts`, pre-existing CRLF staleness confirmed on a clean tree on 2026-09-10).
  **SEEN RENDERED**, which is the only way this could be judged - both specimens photographed at
  1100px, and the square-circle fault was found in the picture, not in the source.

- **2026-09-12 - ONE card asks whether he has a company, and it holds both answers.**
  Owner, on the profile: *"why ui is trash here, keep the create as part of the company but show it
  nice and without ui bugs"*.
  Three faults, and the first two were bugs rather than taste:
  (1) 🔴 **A button inside a button.** The «Add your own company» slab was a `<button>` carrying a
  fake CTA `<span>` styled as a second one - two affordances for a single press, and the orange pill
  only LOOKED pressable.
  (2) 🔴 **The company topic in two places.** The slab's own sentence read *"…or join an existing
  company with an invite code below"* and pointed three hundred pixels down at the card owning the
  other half, so a renter met one errand twice and had to reconcile the two himself.
  (3) A full-width band above a two-column grid - the shape this page keeps for the masthead alone.
  Now `NoCompanyCard` (was `JoinForm`) is headed by the QUESTION rather than by one of its answers:
  «Your company», a sentence naming both routes, then CREATE as the primary act and the invite code
  under it with a SECONDARY «Join». Two full-width brand buttons in one block would weight the two
  routes equally and let neither read as the one to press.
  Files: `src/components/company/CompanyHub.tsx` (`onCreateCompany` → `NoCompanyCard`),
  `src/components/profile/ProfileView.tsx` (the banner deleted), `src/lib/i18n/{en,ar}.ts`
  (`company.noneTitle`, `noneBody`), `src/app/dev/preview/specimens.tsx` (2 new),
  `tests/unit/profile-company.test.tsx` (rewritten to the new ruling, 8 passing).
  🔴 **This REVERSES the move made earlier the same day** (*"make one CTA for the verify"*, which
  sent this card's content UP to the banner). What that ruling protected survives untouched: there is
  still exactly ONE place to press. What it produced did not.
  ⚠️ **`onCreateCompany` is withheld once he is verified or pending.** Verification is what CREATES a
  company, so offering to make a second one is a press with nowhere to go - and with the prop absent
  the card falls back to the join-only shape it had before, head and all. A specimen draws each.
  ⚠️ **`items-start` on the head**, not `items-center`: the body wraps to two lines at this column's
  width, and centring on the taller block floats the 44px tile off the title it belongs to.
  ⚠️ Swept with the banner: the `btn` import, the `hasCompany` state that only it read, and its own
  justification comment - a premise that stopped being true the moment the block went.
  ⚠️ `NoCompanyCard` is EXPORTED for `dev/preview` only. The profile is behind a session and a
  backend, so this card could not be looked at before it shipped; that page exists for exactly this
  and its rule 1 says a specimen renders the real component.
  ⚠️ **«Create Your Company» is Title Case**, from `capitalize` inside `btn()`. Left alone: it is
  product-wide and deliberate, and was reported and not changed earlier today on the nested dialog.
  ⚠️ Verified: typecheck, lint, 19 cases across `profile-company`, `brand-spelling` and `auth-i18n`,
  and **SEEN RENDERED** through the new specimen.

- **2026-09-12 - The intake's two controls are a CHIP tall, they ride the last row, and the row offers «a» project.**
  Owner, on a screenshot of the floor: *"make the buttons on the same size of the project pills and
  keep it select a project not your project, also consider if many projects exist, how the ui will
  be? the buttons must be on the last row always"*.
  (1) **26px, measured rather than chosen.** A chip is `px-3 py-1 text-label` inside a hairline:
  a 16.5px line box (11px × the body's 1.5) + 8px of padding + 1.6px of border = **26.1px**, and it
  comes to the same in Arabic because that line box is a RATIO of the font size, not of the face -
  checked in a browser at both locales before the number was written down. The circles were 40px,
  half again as tall as the row they sit on. The glyphs went 20 → 15: a 20px icon in a 26px circle
  leaves three pixels a side and reads as a glyph in a collar.
  (2) **The last row is `items-end`,** which was already on the wrapper and is what makes the rule
  hold as the strip grows: the chips wrap inside their own `min-w-0 flex-1` group, the group gets
  taller, and the two controls stay pinned to its bottom edge rather than climbing back beside the
  first row. `flex-none` beside that group is what stops them being pushed onto a row of their own
  while there is still width. **Verified by patching twelve sites into the live DOM**: three rows of
  chips, both controls on the third, their bottom edge level with the group's to the pixel.
  (3) **«Select a project», not «your project».** The row is a CHOICE among his sites, and the
  possessive claimed one of them was already the answer. Arabic followed: «اختر مشروعك» →
  «اختر مشروعاً».
  Files: `src/components/screens/Intake.tsx`, `src/lib/i18n/{en,ar}.ts` (`projects.chips.pick`),
  `tests/unit/intake-floor.test.ts` (5 new cases, 12 passing).
  🔴 **The cost, on the record: 26px is under the house's 44px target.** This row now has two
  controls well below it - the same fault logged against a dozen icon-only controls on 2026-09-08.
  It is what «the same size as the pills» means and it is the owner's call; the alternative is the
  40px circle beside a 26px chip that he reported.
  ⚠️ The `ms-auto` ruling is untouched - the controls still sit on the side the renter reads TO, so
  they mirror in Arabic with everything else.
  ⚠️ Verified: typecheck, lint, 50 cases across the five touched suites, SEEN RENDERED at both the
  one-chip and the twelve-chip shapes, and break-checked by restoring `h-10 w-10` - two cases went
  red.

- **2026-09-12 - The share row: the link shrinks and swallows its Copy, the expiry leads it, and three channels wear their own marks.**
  Owner, on a screenshot of the row: *"the link placeholder field must be smaller without this
  «Your shareable link is generated the moment you post your request», and the copy button is part
  of the link placeholder so just copy icon inside the placeholder, and clicking it will open small
  clear popup saying post the request first so the link is generated and u can share the link. So
  now the expiry date is more dominant, make it the main cta in this row and actually make it on the
  right and the link copy placeholder on the left"*, then *"add icons of outlook-gmail-whatsapp to
  any place mention them so use it as global ui element"*.
  (1) **The widest object on the row was the least useful.** The field held the masked link AND
  `linkHint`, a full sentence about when the real one arrives, so the placeholder had to be wide
  enough for a line of prose. The sentence is deleted in both locales and the field is capped at
  380px, which fits a real bid URL.
  (2) **Copy moved INSIDE the field and stopped being disabled.** It was a bordered 34px
  `btn("secondary")` standing after the field, so it read as a fourth control rather than as part of
  the thing it acts on, and before the post it was a dead grey button beside a dead grey field with
  nothing on screen saying what either was waiting for. It is a 30px hit area inside the field now,
  always pressable, and with no link it opens a `sm` dialog: «Post the request first». The sentence
  was not moved so much as re-timed - it now answers at the one moment he has the question.
  (3) **The expiry leads the row, on the trailing edge.** It is the only thing there a renter
  DECIDES; the link is minted for him and the copy acts on it. Brand ground, brand edge, the label
  in `brand-deep`, `ms-auto`.
  (4) **`ChannelMark`** (new, global): Outlook, Gmail, WhatsApp. Outlook keeps `/outlook-logo.webp`;
  the other two are inline SVG.
  Files: `src/components/ChannelMark.tsx` (new),
  `src/components/share/ShareRequestPanel.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`postShare.linkLocked{Title,Body}`; `linkHint` deleted),
  `tests/unit/share-link-row.test.ts` (new, 11 cases),
  `tests/unit/share-request-panel.test.tsx` (the disabled-Copy case rewritten).
  ⚠️ **Two chips were drawing the same picture.** Outlook took `mail` and Gmail `alternate_email`
  - both grey envelopes - on the one row where the whole decision is WHICH account sends; WhatsApp
  had `chat`, which is every chat app there is. The confirmation dialog had the same split: Outlook
  wore its logo and Gmail fell through to the glyph, so one dialog named one destination and
  categorised the other.
  ⚠️ **A brand mark keeps its colours on the navy chip.** Everything else in that chip inverts
  when picked. A mark that recolours is not that brand's mark, and the colour is most of how it is
  recognised at 15px.
  ⚠️ **`logo` and `mark` are two props on `Destination`, deliberately.** `logo` is a wordmark with
  its own geometry (Moedatech's is a wide lockup drawn to a height); `mark` is one of three known
  channels drawn to a square. One prop taking both would carry the sizing at every call site, which
  is what it was already doing.
  ⚠️ The Gmail hexes are allowed BY VALUE in `palette-drift`'s `BRANDS`, not by exempting the
  file, so a house colour smuggled in there still fails. The file also carries an
  `eslint-disable no-restricted-syntax` with its reason, the same way `mail-chrome.tsx` does.
  ⚠️ Verified: typecheck, lint, 296 passing across the eight touched suites. Three of the new pins
  break-checked (the cap widened, the expiry's brand tone reverted, a chip's mark removed); each
  went red. NOT seen rendered - the row is a measured layout fact and jsdom lays out nothing, so it
  wants one look.

- **2026-09-12 - The palette guard's component sweep had been DEAD since `5a428e61`, and two more `\b` corruptions are still in the tree.**
  Found while verifying the share-row change above: a deliberate `#ff00ff` in a new component did
  not fail `palette-drift.test.ts`.
  🔴 **The regex was `/#[0-9a-fA-F]{3,8}<BACKSPACE>/g`.** A literal `0x08` character stood where
  `\b` was meant, so it matched NOTHING and every file came back clean. From that commit until today
  the case «no component names a colour either» passed on any colour in any component, and every
  «palette-drift green» in this log is vacuous FOR COMPONENTS over that window. The stylesheet
  sweep is a separate matcher and was always live.
  Repaired, and it immediately found six pre-existing hits - none of them drift, which is the
  argument for the repair rather than against it:
  · `mail-chrome.tsx`, 22 Microsoft and Google values imitating a compose window. EXEMPT by file:
  its own header already says they must never reach `ds-colors.ts`, and 22 greys in a value
  allowlist would start matching ours by coincidence.
  · five blacks, now in a `NOT_PAINT` set with the reason each: two inside a `mask-image` gradient
  (where the value is an ALPHA channel and never renders), one ending a scrim ramp whose other four
  stops are `rgba(0,0,0,...)` and invisible to this regex anyway, and the Google Play badge.
  Files: `tests/unit/palette-drift.test.ts`.
  🔴 **TWO MORE of the same corruption are in the tree and are NOT fixed here** (reported, owner's
  call):
  · `src/components/workspace/RequestDetailsModal.tsx:191` -
  `.replace(/<BACKSPACE>\w/g, c => c.toUpperCase())` where `/\b\w/g` was meant. It is a title-caser
  that title-cases nothing, so a label built by that helper renders fully lower case. **A live UI
  fault**, not just a dead test.
  · `tests/unit/rentee-map-surface.test.ts:597` -
  `expect(src).not.toMatch(/t\.bidMap\.shortfall<BACKSPACE>/)`. A `.not.toMatch` on a pattern that
  can never match is an assertion that can never fail: it has been vacuous since it was written.
  ⚠️ **Same class as the `RED` → 🔴 trap this log already records**: an escape written by an
  edit SCRIPT through a layer that interpreted it, landing as a control character that is invisible
  in every diff, in every editor and in `grep` output (a backspace erases the character before it on
  a terminal). A repo-wide sweep for control characters under `0x20` outside tab/LF/CR found exactly
  these three source files; everything else was binary assets.
  ⚠️ Break-checked both ways: with the repair, a `#ff00ff` in a component goes red; restored, the
  suite is green (9 cases).

- **2026-09-12 - «Verify» stops falling under the avatar and being cut in half by the bar.**
  Owner, on a shot of the orange pill hanging below his initials with its bottom sliced off: *"what
  is this ugly ui"*.
  🔴 **A LAYOUT fault, not a taste one.** The avatar and the «Verify» press are siblings in one
  wrapper, and that wrapper was `relative flex-none` - a BLOCK. Both children are block-level (the
  avatar button is itself `display:flex`), so they stacked: the pill dropped onto a second line under
  the 34px circle and the 52px bar clipped it. The component's own comment beside it had promised
  *"it sits BESIDE the avatar, not on it"* since the day the button was split out; the box holding
  the two never agreed. One word - `flex` - and they share a line.
  The second half is the shouting: `uppercase` + `tracking-[0.05em]` on a solid brand ground, at
  11px, on a navy bar where every other mark is white at reduced strength. Sentence case says the
  same word without reading as an alarm, and `h-[22px]` keeps it clear of the bar's own edges.
  Files: `src/components/AppShell.tsx`, `tests/unit/header-verify-pill.test.ts` (new, 5 cases).
  ⚠️ **The brand FILL stays.** This is an ACTION - it opens the verification form, which the
  2026-09-12 ruling above made its own press - and the outlined-white treatment belongs to the marks
  beside the wordmark, which state a fact and are never pressed. Demoting it would hide the only
  route to that form.
  ⚠️ **`relative` is kept on the wrapper** and must be: the verified tick is `absolute -end-0.5
  -bottom-0.5` against it, and without a positioned ancestor it escapes to the header. A case pins it.
  ⚠️ The test slices the quoted `className` VALUE, not the element - the comment above that line
  names `uppercase` and `tracking-[0.05em]` as what it removed, so a wider slice would fail on its
  own explanation. Any source-slicing test is one comment away from that.
  ⚠️ Verified: typecheck, lint, 18 cases across `header-verify-pill`, `shell-nav` and
  `request-rail-bleed`, and break-checked by putting the block wrapper back - it went red.
  🔴 **NOT seen rendered.** The bar needs a signed-in renter at a tier below verified, so the row is
  pinned against the SOURCE only.

- **2026-09-12 - The request rail is a band OF the screen, not a card ON it.**
  Owner, on a screenshot of it: *"can we make this header fit the whole screen no margin so like it
  is part of the screen not a card"*.
  The grey strip carried the page's 1440 cap, its gutter, a radius and an all-round border, so it
  drew a slab floating over the page with a margin on every side.
  🔴 **This REVERSES half of 2026-08-30** (*"make the bar same width and margin as the requests parent
  card so all aligned"*), and which half matters:
  · GONE - the card: `max-w-[1440px]`, `mx-auto`, the outer gutter, `rounded-lg`, and `border` on all
    four sides. The ground reaches both window edges now.
  · KEPT - the ALIGNMENT, which is what that ruling was actually protecting. `PAGE_X` moved INSIDE
    the band, so the «New» circle still starts on the same vertical as the panel below it.
  The pre-08-30 fault was a full-bleed ground whose CONTENT sat somewhere else entirely; this is not
  that, and the test says so in as many words.
  Files: `src/components/workspace/RequestRail.tsx`,
  `tests/unit/request-rail-bleed.test.ts` (new, 5 cases).
  ⚠️ **`border-b` is what stops it becoming a grey area with no edge.** A card was edged on four
  sides; a band of chrome needs one line, where the page begins. Removing it too would leave the
  strip and the page dissolving into each other.
  ⚠️ Three nested elements became two. The middle wrapper existed ONLY to cap and gutter the card, so
  leaving it in place would have put the outer margin back one layer down - which is why a case pins
  that nothing above the band carries a `max-w`.
  ⚠️ The ground tone is untouched (`bg-surface3/60`) and so is the 96px height, whose arithmetic the
  component works out in a comment above this block. Only the SHAPE changed; a new tone here would be
  a second decision nobody asked for.
  ⚠️ Verified: typecheck, lint, 50 cases across `request-rail-bleed`, `request-rail-fit` and
  `workspace`, and break-checked by putting `rounded-lg border` back - two cases went red.
  🔴 **NOT seen rendered.** `/requests` draws the GuestWall without a signed-in renter, so the rail
  does not mount at all locally - confirmed by looking for it in the DOM and finding nothing. The
  shape is pinned against the SOURCE only, and it wants one look on a deployed build.

- **2026-09-12 - A dialog opened over a dialog draws a ground of its own, so it reads as a layer.**
  Owner, on a shot of *Add suppliers* standing over *Share for bids*: *"fix the ui, how can i open 2
  modals above each other?"*
  🔴 **The nested layer was `fixed inset-0 z-[60]` and nothing else**, a transparent click-catcher.
  This design system spends no shadows, so with no tone behind it the second panel had nothing
  separating it from the first: the share panel's header, its supplier rows and its buttons went on
  reading at full strength above and below the new dialog, which is why it looked like an inline
  block pasted into the page rather than something on top of it.
  It takes `bg-black/25` now. Under the first scrim's `black/55` that composites to about 66%, a
  visible step down from 55% and short of the ~70% mud the nesting rule was written to avoid in the
  first place (two `navy/45` scrims, 2026-08-31, which made the dialog underneath unreadable).
  Files: `src/components/Dialog.tsx` (`NESTED_SCRIM`),
  `tests/unit/nested-dialog-scrim.test.tsx` (new, 4 cases).
  ⚠️ **The STACK itself is deliberate and untouched.** `ShareRequestPanel` opens the add dialog
  over the share panel rather than replacing it, because the list reloads on success and the firm he
  has just typed in arrives with the picks he had already made still ticked. Only the layering was
  broken.
  ⚠️ **No second blur, and the z-index stays at 60.** A `backdrop-blur` here would soften the
  dialog underneath as well as the page and repaint the viewport on every keystroke in the nested
  form. And `Dropdown` portals its list at `z-[70]` on the stated promise of clearing this shell, so
  raising the nested dialog would put it over its own dropdowns; being a DESCENDANT of the dialog
  that opened it is what already paints it on top.
  🔴 **Two dialogs opened in the SAME commit still decide it backwards**, and this does not fix
  that: a child's effect runs before its parent's, so the inner one increments the counter first and
  reads itself as the first dialog. Unreachable today (a nested dialog is always opened by a later
  press), and left alone rather than guessed at.
  ⚠️ Verified: typecheck, lint, 170 passing across `nested-dialog-scrim`, `share-request-panel`,
  `add-suppliers-error`, `suppliers-remove-and-pick`, `posted-confirmation` and `palette-drift`, and
  the scrim break-checked by stripping the tone again - two cases went red. NOT seen rendered: the
  tone is a measured fact and jsdom composites nothing, so the pair wants one look.
  ⚠️ Reported and NOT changed: the same screenshot shows Title Case on «Share For Bids», «Add
  Suppliers», «Upload A Sheet Instead» and «Send To Moedatech». That is `TITLE_CASE` on the dialog
  heading and `capitalize` inside `btn()`, both deliberate and product-wide - a separate decision,
  not a fault in this dialog.

- **2026-09-12 - The missing profile e-mail names its own remedy, and every send gets its own tick.**
  Owner, having found the cause himself: *"it is because the user doesnt have email in his profile
  but once i added it worked"*, and *"the other issue that no success modal for sending to outlook
  only shown on first post"*, then *"i want to fix both"*.
  (1) **`NO_SENDER_ADDRESS` is the ONE refusal the renter can clear himself**, so it stops printing
  the generic «it did not go out» and says what to do: «Your profile has no e-mail address … Add one,
  then send again», with «Open your profile» beside it as a NEW TAB. `resolveSender` reads
  `users.email`, and this product registers people by PHONE, so a blank profile is the ordinary case -
  and the generic sentence sent him to a compose window over something one field fixes.
  (2) **The tick re-arms on dismissal.** `announced` was a ref set on the first `onShared` and never
  cleared, so «Keep sharing» - whose whole purpose is to send him back to reach another supplier -
  led to a send that said nothing at all.
  Files: `src/components/share/ShareRequestPanel.tsx`, `src/components/create/ShareOnPost.tsx`
  (`closeTick`), `src/lib/i18n/{en,ar}.ts` (`postShare.mailNoSender`, `mailNoSenderAction`),
  `tests/unit/share-request-panel.test.tsx` (1 case), `tests/unit/posted-confirmation.test.tsx`
  (the 2026-09-10 case rewritten, 1 new).
  🔴 **This OVERTURNS «a second channel is not a second request» (2026-09-10)**, and the evidence is
  that the case it protected cannot occur: `ShareRequestPanel` calls `onShared` from exactly ONE
  place, at the end of `send()`, after every channel that press touched. A second call is a second
  PRESS. What the rule actually suppressed was the report of the next send. The half that survives is
  pinned by its own case: two calls with no dismissal in between still announce once.
  ⚠️ **`NO_SENDER_ADDRESS` should be unreachable on a CONNECTED mailbox.** That guard was narrowed to
  the SES path on 2026-09-09 (`629db61f`, agents backend) because it was refusing connected renters
  over a field the Graph path never reads. The line is drawn for both paths anyway: **the deployed
  Lambda is older than that commit**, which is why the owner hit it at all, and the sentence is true
  either way.
  🔴 **BACKEND, owed: redeploy `agents-partners`.** Nothing to change in the source - `629db61f` is on
  `main` and has been since 2026-09-09. Until it ships, a connected renter with no profile e-mail is
  refused, and now at least he is told why.
  ⚠️ The English drops the brand («Your profile», not «Your Moedatech profile»): `brand-spelling`
  walks the two dictionaries IN STEP and fails when an English string names the brand and its Arabic
  twin does not. Adding «معداتك» to the Arabic would have worked equally; the shorter sentence is
  better copy and the profile is unambiguous inside this product.
  ⚠️ The profile link is `target="_blank"`. The request is posted by then, but the panel still holds
  his picks, his message and the link, and a navigation would drop all of it.
  ⚠️ Verified: typecheck, lint, 159 cases across the five touched suites. Both fixes break-checked
  (the re-arm removed, the remedy sentence forced back to the generic one); each went red.

- **2026-09-12 - A connected Outlook stopped being switched off by one dropped request, and a send that did not happen now SAYS so.**
  Owner: *"outlook is connected but the success modal that it is sent not shown and i didnt find it
  sent from my outlook"*. Two faults behind that one sentence, and either alone produces it.
  (1) **`mailConnectStatus` invented a disconnection.** It answered a fabricated
  `{ connected: false }` for EVERY failure, and `ShareRequestPanel` asks it once, on mount, and never
  again. So one blip - a cold Lambda, a dropped request - turned a working connection off for the
  whole page: `emailWillGo` went false, the send took the «not connected» branch, `share-email` was
  never called, and nothing reached the supplier or his Sent folder. It returns `null` now, which
  means «we could not find out», and the send RE-READS it before deciding - only when the panel
  believes it is not connected, so a connected renter pays no extra round trip.
  (2) **Only the SUCCESS was ever reported.** «Sent from X to N suppliers» was the single outcome
  this panel stated; every refusal (`NO_RECIPIENTS`, `SEND_REJECTED`, `RECONNECT_REQUIRED`, the three
  SES domain ones) changed a button's LABEL at most. So «nothing sent» and «nothing pressed» looked
  identical and the renter had to open his Sent folder to find out. A `sent: false` now draws a red
  line naming what happened, with the reason code beside it.
  Files: `src/lib/api/client.ts` (`mailConnectStatus` → `MailConnectStatus | null`),
  `src/components/share/ShareRequestPanel.tsx`, `src/lib/i18n/{en,ar}.ts` (`postShare.mailNotSent`),
  `tests/unit/share-request-panel.test.tsx` (2 cases, 130 passing).
  ⚠️ **The reason code is NOT translated**, same ruling as the add-supplier dialog earlier today: it
  is the part that makes a screenshot of the line diagnostic.
  ⚠️ The consent POLL also learned the difference: a `null` mid-poll no longer overwrites what the
  panel already knows, and counts as denied only for that one answer.
  ⚠️ `PREVIEW` cannot reach the new line - `setMailer` already refuses it, so the type does not admit
  it and there is no second guard. A dead comparison reads as a live rule.
  ⚠️ `emailWillGo` still drives the CONFIRM dialog's wording; the send now decides on `willSend`,
  which is the same expression over the re-read status. They agree except in the window this fixes.
  🔴 **NOT reproduced against a live mailbox.** Both halves are pinned by tests and break-checked
  (the re-read forced off, the line's condition inverted); neither was seen against real Graph. If
  the owner's case was in fact a refusal rather than a lost status, the new line is what will name it.

- **2026-09-12 - The intake's floor is his sites and two round controls; «Continue» and the labelled upload are gone.**
  Owner, on a screenshot of the intake: *"remove the continue button, remove upload, remove this «Add
  a description or a file». Instead I want a circle icon for + which will be for upload and beside it
  a circle arrow to send, all on the right; and on the left on the same row the project pills with the
  sentence «select your project» beside them."*
  ~~Two rows for two presses~~: the box's floor carried «Upload RFQ» opposite the site chips, and
  under it a row of its own holding a full-width «Continue» with «Add a description or a file» at the
  far end of it. One row now: the chips are led by `projects.chips.pick` («Select your project» /
  «اختر مشروعك»), and a 40px `+` and a 40px brand arrow sit against the trailing edge.
  ⚠️ **The sentence that used to stand beside Continue is the arrow's `title` and `aria-label`.** A
  disabled button with nothing near it reads as broken, and a round control has no room for a line of
  text - so the reason is on the control itself: `intake.addSomething` while the box is empty, and
  «Continue» / «Re-analyse» once it is not. Both attributes are set, so the hovering renter and the
  screen reader are told the same thing.
  ⚠️ `intake.reading` is no longer READ - the busy state is the hourglass glyph alone, with the label
  frozen at whatever the press would have said. Left in the dictionary rather than swept.
  ⚠️ The arrow keeps `rtl:scale-x-[-1]`, and only while it is an arrow: the hourglass must not mirror.
  Files: `src/components/screens/Intake.tsx`, `src/lib/i18n/{en,ar}.ts` (`projects.chips.pick`),
  `tests/unit/intake-floor.test.ts` (new).
  ⚠️ The cases read the SOURCE, not a render: `Intake` pulls the rfq store, the session, the project
  list and a file input, and what is under test is a layout ruling - which controls exist and where.
  ⚠️ Verified: typecheck, lint, and the full suite serially (3242 passing; the one failure is
  `ui-pins.test.ts`, pre-existing CRLF staleness confirmed on a clean tree on 2026-09-10). NOT seen
  rendered, and NOT break-checked.

- **2026-09-12 - «Add a supplier» says what the SERVER said, instead of «try again» for five different failures.**
  Owner, forwarding a beta user (+966 53 586 9745) stuck on «لم يُحفظ. صفوفك ما زالت هنا: حاول مرة
  أخرى» while the same act worked from his own account.
  `AddSuppliersDialog`'s save ended in a bare `catch {}` that printed one sentence for every non-2xx.
  FIVE different failures reach it and the screen could not tell them apart: the relay's **401** (no
  session id), the handler's **404** («المستخدم غير موجود» - the user row is not in the tenant that
  Lambda reads), a **422** from the schema, a **500** from the unguarded `createMany`, and a dropped
  connection. A day went into guessing between them from source, and the one screen that had been
  TOLD the answer had thrown it away.
  (1) `projectFetch` now carries the backend's own `message` / `messageAr` / `details` into
  `ApiError`, which has always had fields for them. **Both envelopes**, because two reach it: the
  agents relay forwards `{ success:false, error:{ code, message, messageAr, details } }` verbatim,
  while this app's own routes answer a flat `{ code, detail, messageAr }`.
  (2) The dialog prints that sentence in the reader's language, with **`CODE · HTTP n` beside it**.
  That suffix is not prose and is deliberately untranslated: it is the part that makes a screenshot
  of this dialog diagnostic.
  Files: `src/lib/api/client.ts` (`projectFetch`),
  `src/components/suppliers/AddSuppliersDialog.tsx`,
  `tests/unit/add-suppliers-error.test.tsx` (new, 5 cases).
  ⚠️ **A per-row refusal is untouched.** The endpoint answers 200 with `rejected[]`, and
  `refusalLine` still names each row and its reason. Only a THROWN request reaches the new branch.
  ⚠️ A body with no reason at all (a dropped connection, an unreadable upstream) still falls back to
  `addFailed`, which is the sentence that tells the renter his typing is safe. A case pins it.
  ⚠️ `projectFetch` is SHARED - every project, work-order, award and renter-supplier call throws
  through it. The change only ADDS fields to the error; nothing reads them yet but this dialog.
  ⚠️ `LocaleProvider` overrides `initialLocale` on mount, so the Arabic case sets
  `localStorage["moedatech.locale"]` the way `tests/setup/canvas.tsx` does. `initialLocale` alone
  silently renders English and the assertion passes for the wrong reason.
  🔴 **This does not fix the user's problem; it makes the next report carry its own diagnosis.**
  Still unknown which of the five he hit - the response body was never captured and the database is
  behind a permission block here.
  🔴 **BACKEND, two tickets, neither touched (different repo):**
  · `bulkRenterSuppliers.ts:233` - `prisma.renterSupplier.createMany` has NO try/catch, so one
  constraint failure falls to the outer catch and 500s a partial-success endpoint, losing every good
  row. That file's own header says this must never happen.
  · `apps/backend/serverless.yml:272` declares
  `TENANT_ID: ${env:TENANT_ID, ssm:/moedatech/${stage}/tenant/id, 'default'}`, while
  `apps/backend-agents/serverless.yml` declares **no `TENANT_ID` at all** - so the service that
  CREATES users can be stamped from SSM while the service that WRITES suppliers is pinned to
  `'default'` by omission, and every agents handler that filters on tenant would refuse those
  accounts. Verify the SSM value before acting: if it is `default`, this is harmless today.

- **2026-09-12 - The suppliers table lines up in Arabic, and the vendor column says what it is.**
  Owner, on the RTL table: *"fix this ui, the order is different in columns + vendor registered is
  not clear in arabic تسجيل المُورِّد or like this"*.
  (1) **One attribute in the wrong place, two columns out of line.** «الجوال» and «البريد» sat
  against the RIGHT edge of their columns while their values sat against the LEFT. Both cells put
  `dir="ltr"` on the BLOCK, and `text-align: start` resolves against the element's OWN direction - so
  an ltr block inside an rtl table starts on the left while its `text-start` header starts on the
  right. The direction is genuinely needed: a `+966…` number must not be reordered by the Arabic
  around it. It moves to a `<bdi>`, which is the element for exactly this - it isolates the run's
  direction and leaves the block's alignment to the page.
  (2) **«اعتماد المورّد» → «تسجيل المورّد».** «اعتماد» reads as an approval somebody grants, and he
  could not tell what the column was for. The English has always been «Vendor registration»: the
  RENTER's own record that he has registered this firm, which is what the tick on the row sets. His
  own wording, taken as given.
  Files: `src/components/suppliers/SuppliersPage.tsx`, `src/lib/i18n/ar.ts`,
  `tests/unit/suppliers-rtl-columns.test.ts` (new, 6 cases).
  ⚠️ **Deleting the `dir` would "fix" the alignment and break the number** - `+966535869745` in an
  RTL run without isolation can render with the `+` adrift. A case pins that the direction survives.
  ⚠️ The other four columns were never misaligned: they carry Arabic or a dash, so they inherit the
  table's direction and land on the same edge as their headers. Only the two ltr runs drifted, which
  is why it read as «the order is different» rather than as a broken table.
  ⚠️ `vendorShort` («مورّد معتمد»), `registeredVendors` and the toast strings are NOT changed - he
  named the COLUMN. If «معتمد» is wrong there too it is a second pass, and one worth asking about
  rather than assuming.
  ⚠️ jsdom resolves no bidi and no `text-align: start`, so the cases read the SOURCE: the alignment
  is a rendered fact they cannot measure, and what they pin is the rule that decides it.
  ⚠️ Verified: typecheck, lint, 6 new cases plus the suppliers suite (10 passing), and the alignment
  pin break-checked by putting `dir` back on the block - two cases went red. The suite's one
  unhandled error is PRE-EXISTING (confirmed against a stashed tree on 2026-09-09).

- **2026-09-12 - Every request tile fills its circle: the taxonomy drawing stops being a letterbox.**
  Owner: *"make sure all photos fit well in the circle as some have squared edges and some fit well"*.
  **Measured on staging before touching anything**, and the measurement is what settled it. The rail
  draws THREE kinds of tile, and two of them are the same SHAPE while taking different fits:
   · a photograph - `.jpeg`, 1408×768, **ratio 1.83** - on `object-cover`: scaled to 95px wide inside
     the 52px circle, sides cropped, machine filling the mask. This is the one that «fits well».
   · a taxonomy drawing - `spider-crane.png`, 1024×559, **ratio 1.83, the same shape** - on
     `object-contain p-1`: drawn **52×28**, a letterbox whose own straight top and bottom edge shows
     through a round hole. THAT is the «squared edge», and `p-1` shrank the box before `contain` even
     had its say.
   · no artwork - the `precision_manufacturing` icon (5 of 39 tiles on his account). A different
     state, deliberately left alone.
  The padding is gone and the drawing takes `scale-[1.34]` - 52 ÷ 28, the exact factor that turns
  that letterbox into a filled round tile.
  🔴 **`object-cover` for the drawings was TRIED on the live rail and rejected.** Injected it, looked
  at it: the crop cut the machine into an unreadable jumble, exactly as the component's own 2026-08-31
  note predicted («cropping one enlarges the margin rather than the machine»). `contain` keeps the
  whole machine; the scale gives it the circle. Both candidates are recorded in the test so the next
  reader does not re-run the experiment.
  Files: `src/components/workspace/RequestRail.tsx`, `tests/unit/request-rail-fit.test.ts` (new, 4).
  ⚠️ Scaling PAST the box is only safe because the parent is `overflow-hidden rounded-full`; without
  that clip the drawing would spill over the tile's border and its own count badge. A case pins it.
  ⚠️ jsdom lays out no images, so the cases read the SOURCE. The fit is a rendered fact and the live
  rail is what judged it - what is assertable here is that the two rules are the ones that test chose.
  ⚠️ Verified: typecheck, lint, 50 passing across `request-rail-fit`, `workspace` and `request-label`,
  and the fit pin break-checked by restoring `object-contain p-1` - two cases went red.
  ⚠️ The suite crashed once with «Worker exited unexpectedly» - the machine was low on memory, not a
  code fault. `--no-file-parallelism` is the honest gate on this machine, as on 2026-09-09.

- **2026-09-12 - The renter's own words ride EVERY line, the card leads with them, and CATEGORY is gone.**
  Owner, on the create flow: *"i want the custom type field to be always at top... it is now the user
  input of the equipment name not only the ones that don't exist in our taxonomy"*, *"for the
  category-type-size i wanna have them type-size only"*, *"if taxonomy is sent then always read the
  taxonomy, if null then the custom"*, *"no custom type is required, it can be null, but one of the
  custom field or the taxonomy must be sent"*, and *"hidden or free text, both are undefined"*.
  **The field changed MEANING**, which is what makes the rest follow: it was «the name of a machine we
  do not carry» and is now «what the renter calls this machine». So it is the first thing on the card
  on every line, starred only when there is no taxonomy behind it, and it reads:
  what he typed → the words his RFQ used → the pick itself («Crawler excavator 20 ton»), so a line
  added BY HAND fills its own name instead of asking him to retype what he just chose from two lists.
  Two rules, and they are different questions:
  · **READ** — the taxonomy whenever the line has one, HIDDEN included; his words only when it has
    none. Six readers moved: `requests.itemName`, `request-fields.itemDisplayName`, `inbox`,
    `sibling-tabs`, `bid-map.requestTypeWord`, `BidMapWorkspace`, and `deal-room` (which read the name
    FIRST - harmless while the two could never coexist, and wrong from the day they can).
  · **SEND** — whatever the line holds; the backend asks only that ONE of them is present
    (`hasValidEquipmentIdentity`) and stores them in separate columns.
  CATEGORY left the card (it is derived from the TYPE and still sent), and its column now holds
  «Doesn't match what I want? Use my own name of equipment» - one press clears the taxonomy, turns the
  line off-catalogue and raises the orange note under the name box.
  Files: `src/components/create/MachineCard.tsx`, `src/components/create/hooks.ts` (`pickedName`),
  `src/lib/store/rfq-store.tsx`, `src/lib/contract/{requests,request-fields,inbox,sibling-tabs,bid-map,deal-room,gates}.ts`,
  `src/components/map/BidMapWorkspace.tsx`, `src/lib/api/app-adapters.ts`, `src/lib/flags.ts`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/equipment-name-every-line.test.ts` (new, 10 cases),
  `tests/unit/{off-catalogue-from-type,custom-equipment-canvas,machine-card,canvas-gating}.test.*`.
  Plan: `docs/plans/equipment-name-always/plan.md`.
  Trap: **`isUndefined` is about BEHAVIOUR, never about display.** A hidden line is undefined - no
  dispatch, no deal room, no QR - and still has a catalogue name the renter must read it by. Every
  reader keyed on that flag printed his words for such a line; they ask «is there a taxonomy name»
  now, which is also the owner's rule verbatim.
  Trap: 🔴 **picking a type no longer clears the name** (reversing 2026-09-06's «all three move
  together»). His words are not made untrue by a match; the taxonomy simply wins for reading.
  🔴 **«Add a custom equipment type» in the TYPE search is REMOVED** (added 2026-09-09). It opened a
  box that only existed on an off-catalogue line; the box is on the card at all times now, so the row
  was a second door into a room he is already standing in.
  ⚠️ **The WIRE half is held behind `NEXT_PUBLIC_EQUIPMENT_NAME_EVERY_LINE` (default OFF)** and must
  not be thrown before backend-agents ships B1. `getBidFormPreview.hasCustomEquipment` is «any line
  carries a name», and the Supplier OS suppresses its ENTIRE app handoff on it - so the day every line
  carries a name, every bid link in the product loses its QR and «Go To App», for 300s longer than the
  rollback. Everything else here is live and safe because none of it touches the wire.
  ⚠️ **Backend, owed, in this order**: (B1) re-derive `hasCustomEquipment` from the undefined
  predicate; (B2) `isUndefinedEquipment` gains the HIDDEN test so dispatch skips a hidden line the way
  it skips a nameless one - until B2, a hidden id on a request notifies exactly the suppliers the flag
  exists to protect, so the AGENT's `includeHidden` must not ship first either; then the projections
  keeping a hidden node's names and image, and `getBidForm`'s label becoming
  `taxonomyName ?? customEquipmentName`. Handoff: `docs/plans/equipment-name-always/app-backend-changes.md`.
  🔴 **B2 takes NO migration** (owner, 2026-09-12, answering *"why migration?"*): the visibility is
  resolved from the catalogue at read, never stamped on the request row. The cost he accepted is that
  hiding a node is RETROACTIVE - every request already made on it leaves the feeds and stops accepting
  bids at once, an open deal room included. The hazard of that route is a call site nobody changed,
  which is SILENT (the feed hides the line while the bid gate still takes bids), so the predicate's
  own SIGNATURE gains the hidden set rather than a second function being added beside it - that is
  what makes the compiler name all eight sites.
  ⚠️ Found while planning, NOT fixed: `browseEquipment` filters HIDDEN only when a category filter is
  supplied, so an admin-created listing under a hidden node is browsable and its store press can put a
  hidden subtype on a request today. Suppliers cannot self-list there (both pickers read the
  renter-visible tree), so it needs RelayPanel to have made one.

- **2026-09-12 - A DIRECT request's machine is the LISTING's: the taxonomy is locked, and changing it is a trip to that supplier's store and back.**
  Owner: *"in direct request he cant change the taxonamy right? it is filled from equipment he
  selected so if he want to change will be bacl to store"*, then *"match the app"*. He was describing
  the APP; the web had no direct-mode branch at all - `MachineCard`, `Canvas` and `EquipmentTabs`
  contained the word «direct» exactly zero times.
  (1) **The lock (Epic 008 AC-01).** TYPE and SIZE are `disabled` when `state.direct` is set, and the
  off-catalogue escape (`emptyAction`, «Add a custom equipment type») is withheld with them. The app
  hides its size-edit badge and its «need a different type» section for the reason its own comment
  gives: *"direct-mode rentees are tied to one supplier; offering siblings under the same parent
  category could route them to a subcategory the supplier doesn't carry"*. Before this a renter could
  turn the 35-ton excavator he tapped into a forklift while the orange ribbon above went on promising
  the request went to that firm alone.
  (2) **The errand (AC-02 / AC-04).** The ✕ on the ONLY tab and the + both stash the draft and push
  `/stores/{storeId}`; the machine picked there comes back as that line (`single`) or beside it
  (`append`). On a direct request the ✕ is drawn on the only tab, which it never is on a broadcast -
  it swaps rather than removes, so it cannot leave a request with no equipment - and it says «Change
  {name}, at the store» rather than «Remove».
  (3) **`direct-stash.ts`** (new) holds the whole restorable slice in `sessionStorage`, keyed to the
  supplier and good for 30 minutes. `RESUME_DIRECT` puts it back.
  Files: `src/lib/agent/direct-stash.ts` (new), `src/lib/agent/direct-draft.ts`
  (`directRequestItem` split out), `src/lib/store/rfq-store.tsx` (`RESUME_DIRECT`, `resumeDirect`),
  `src/app/create/page.tsx`, `src/components/create/{Canvas,MachineCard,EquipmentTabs}.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`create.changeEquipment`),
  `tests/unit/direct-store-errand.test.ts` (new, 6 cases),
  `tests/unit/direct-taxonomy-lock.test.tsx` (new, 4 cases).
  🔴 **The stash exists because `/create` REFUSES to rehydrate into a direct request.** That is the
  2026-09-10 fix and it must stay: the stored INTAKE phase was overwriting the machine the renter had
  just pressed. Without a stash the store round trip would therefore drop the site, the dates and
  every other machine, which is worse than the problem it solves.
  ⚠️ **`RESUME_DIRECT` is not `HYDRATE` and not `PROCESS_SUCCESS`,** and each for its own reason.
  `HYDRATE` raises the continue/start-over prompt, which here would ask the renter about his own last
  two presses. `PROCESS_SUCCESS` re-applies the project's defaults and the template's terms over the
  whole draft and RESETS `touchedFields` - and «no certificate» is stored as absent, so the gate would
  ask again for a certificate he had already declined.
  ⚠️ **`SET_DIRECT` drops the draft when the target changes**, deliberately (*"the draft in hand
  belongs to the other request"*). Coming back from the errand the supplier is the SAME, so nothing is
  dropped; on a cold return the store is empty anyway and `RESUME_DIRECT` follows in the same effect.
  A test fixture that names the supplier after the draft has landed sees an empty canvas, which is why
  `direct-taxonomy-lock.test.tsx` puts the draft straight back.
  ⚠️ With TWO or more equipment the ✕ is an ordinary remove in either mode. The errand answers «I want
  a DIFFERENT machine», not «I want one fewer».
  ⚠️ An appended line takes a `d…` id, so it can never collide with `ADD_ITEM`'s `m{seq}` or the first
  line's `i1`.
  ⚠️ **A RELOAD of a direct request still keeps only the machine.** That is the rehydrate guard, not
  this change: the stash covers the errand and nothing else. If the reload case ever needs answering,
  it needs its own decision, not a wider stash.
  ⚠️ Verified: typecheck, lint, 81 cases across the eight suites that touch the direct flow and the
  machine card. Both halves break-checked (the lock forced false, the ✕ made an ordinary remove); each
  went red. NOT seen rendered as a round trip - that needs a signed-in renter, a real store and a
  deployed build, so the store press and the return are pinned by tests only.

- **2026-09-12 - A template's YEAR came back empty because it was read off the field the backend never sends, and the two terms a request cannot go out without now draw empty.**
  Owner: *"the year is not stored or shown from the request why? all terms of request must be shown as
  pills in the request intake"*, then *"keep it unless term is required in request to be sent also
  dont mention fuel type"*.
  (1) **The read.** `machineTermsOfRequestItem` set `equipmentYear` from `item.maxEquipmentAge`
  alone. That is the DEPRECATED alias the web POSTS under and the backend coalesces on write
  (`minimumEquipmentYear ?? maxEquipmentAge`); it is never sent BACK. So a past request used as a
  project template carried `equipmentYear: null` every time, and the strip's year pill - guarded on
  having a value - drew nothing. It reads `requestedMinYear` now, which is the one reader that exists
  for exactly this.
  (2) **The strip.** The model year and the equipment certificate are the two terms `itemWebGaps`
  refuses a send without (`gate.yearMissing` / `gate.certMissing`). Both were drawn only when
  already answered, and both sat INSIDE the `{terms && …}` group - so a renter who picked a site and
  no template had neither control on screen while «Review & send» refused over them. They moved out
  beside delivery / return / fuel responsibility, which left that group on 2026-09-01 for the same
  reason, and they draw empty and `missing` when nobody has answered.
  Files: `src/lib/contract/project-apply.ts`, `src/components/create/ProjectPills.tsx`,
  `tests/unit/project-apply.test.ts` (3 cases), `tests/unit/project-pills-visibility.test.tsx`
  (rewritten to the new rule, 5 cases).
  ⚠️ **The YEAR changed sides; the RULE did not.** 2026-09-02 named the year as an example of an
  optional term that must stay hidden until filled, and it was one then. It became required on
  2026-09-09, when the cert/year gate learned to read the request-level answer. The test head quotes
  both rulings; if the gate is ever lifted, both pills go back to `shown()`.
  ⚠️ **FOURTH reader of that field pair.** `requestedMinYear`'s own note in `bids.ts` lists the
  other three (`mapBid` 2026-08-10, `itemDetailRows` 2026-09-01, the terms modal). Anything that
  wants a request's year goes through it; reading either field alone is the bug, both times.
  ⚠️ **No fuel-type pill**, at the owner's word in the same message. It was deliberately removed on
  2026-09-03 (*"it is always prefilled by us in the system"*) and the comment recording that stays.
  ⚠️ A WORK-ORDER template was never affected: `listWorkOrders` returns terms from the stored
  `WireTerms.year`, a different path.
  ⚠️ Verified: typecheck, lint, and 63 cases across the five touched suites. The year fix was
  break-checked (the reader reverted to the alias, the new case went red). NOT seen rendered - the
  strip needs a signed-in renter with a project, so the pills are pinned by the component test
  rather than by a picture.

- **2026-09-12 - The ocean machine, finished without the backend: the sentinel dies at the parser, and an unplaceable yard stops naming itself.**
  Owner: *"if i didnt fix backend cant it be fixed?"* and *"i want u to test case of yard is also
  unspecified but shown as outside the requests city and shown as equipment swimming on the ocean"*.
  Yes - and the earlier guard was only a third of it.
  🔴 **`resolveUnitLocation` is called by `isPlottable` and almost nothing else.** The fleet CARD, the
  equipment DETAIL, the distance SORT and the distance BANDS all read `m.distanceKm` and `m.lat`
  STRAIGHT off the row. So guarding `(0, 0)` inside that function took the machine off the map and
  left «5720.8 km from your project» printed on the card beside it - one fact with two answers, which
  is the exact shape every disagreement on this surface has arrived in. The sentinel is voided in
  `mapFleet` now, so a `FleetMachine` cannot carry it and no consumer has to remember the rule.
  Three lies came out of that one pair of zeros, and each is pinned: the MAP drew a pin in the Gulf
  of Guinea; the CARD printed a confident distance; and `isOutOfCity` was TRUE, so the panel also
  said the yard is outside the request's city - an inference stacked on the bad number, and the worst
  of the three, because it reads as something somebody established rather than as arithmetic on a
  placeholder.
  **The yard NAME was the last backend dependency, and it is closed.** `EquipmentDetail` printed
  `machine.yardName` verbatim, which is why «Unspecified yard» - the backend's own placeholder row -
  reached the screen. The web cannot tell a placeholder name from a real one, but it can tell that
  this yard resolved to nothing at all, and a yard nothing can place has nothing to say about where
  the machine is. The name is withheld and the cell says «Location not specified» alone.
  Files: `src/lib/contract/fleet.ts`, `src/components/map/panel/EquipmentDetail.tsx`,
  `tests/unit/fleet.test.ts` (7 cases), `docs/todo.json`.
  🔴 **Only the SENTINEL is voided, never `resolveUnitLocation` wholesale.** The first cut spread the
  whole resolved object at the parser, and that function voids the DISTANCE whenever there are no
  coordinates - right for a pin, wrong for the card, because the platform can know how far a yard is
  without publishing where it is. `yard-card.test.tsx` has fixed a machine at 12.4 km with no point
  since it was written, and the wholesale spread silently blanked it. Two of its cases caught that.
  ⚠️ For the same reason «placeable» on the detail is **a point OR a distance**, not a point alone.
  ⚠️ **An unrecognised `locationSource` still parses to `undefined`** and must. `reportedLocationSource`
  applies the documented default at read time; writing a level in the parser would put a second
  default where nobody would look for it. The first cut broke that too - the spread always wrote one -
  and `fleet.test.ts`'s own case caught it.
  ⚠️ Distance-without-a-point is UNTOUCHED, and so is a genuinely distant machine: 870 km still plots
  and still reads out-of-city. Far is not the same as unplaced, and two cases say so.
  ⚠️ Verified: typecheck, lint, **401 passing across the eight map/fleet suites**, and the parser void
  break-checked by deleting the line - three cases went red. NOT seen rendered.

- **2026-09-12 - A yard at `(0, 0)` is no yard: the machine leaves the map and the card says so.**
  Owner, on the «unspecified yard» todo: *"some equipment might not have yard at all, how is this
  handled"*, then *"can we solve it without backend? like if no yard then show no equipment in map
  and show unspecified location"*. Yes - the whole fix is in the web.
  🔴 **The sentinel was being read as a place.** A yard row with no coordinates arrives carrying ZERO
  for both, and `resolveUnitLocation`'s half-point rule guarded `null` only - its own comment already
  said *"a point at `(lat, 0)` is somewhere in the Gulf of Guinea, which is worse than no point"*,
  and then tested for absence rather than for zero. So the point passed through as valid: the machine
  was PLOTTED in the Atlantic, and its card printed «5720.8 km from your project». That figure is the
  great-circle distance from Riyadh to Null Island - 5720.2 km computed, which is what identified the
  mechanism. The renter read a real yard 5,700 km away where the truth is a yard nobody has located.
  Now `(0, 0)` resolves to `locationSource: "none"`, and everything the app already does for that
  state follows with no further change: **no pin** (`isPlottable` false), **no distance**, and the
  machine **stays in the fleet list** red and unconfirmed - it exists, it is simply not placed.
  The cell's words moved with the meaning: ~~«Distance not known»~~ → **«Location not specified»** /
  «الموقع غير محدّد». `km` is null only when there is no resolvable location at all, so saying
  «distance» invited the reading that the yard is known and the arithmetic failed.
  Files: `src/lib/contract/bid-map.ts`, `src/lib/i18n/{en,ar}.ts` (`bidMap.eqNoDistance`),
  `src/components/map/panel/EquipmentDetail.tsx`, `tests/unit/bid-map.test.ts` (5 cases),
  `docs/todo.json` (the item annotated, not ticked).
  ⚠️ **EXACT zeros only.** `0.0001°` is 11 m off the equator and is a real if unlikely point; widening
  this to a tolerance would start discarding places instead of sentinels. A case pins that a zero on
  ONE side survives - the equator and the prime meridian are places.
  ⚠️ **The DISTANCE goes with the point.** The backend computed 5720.8 from those coordinates, so it
  is exactly as wrong as they are; keeping it would print a confident figure beside «Location not
  specified», which is the two halves of the bug disagreeing on one card.
  ⚠️ `none`, never `absent`. `absent` means there is no machine at all and `listedMachines` drops it
  off the fleet list entirely - this machine has photos, papers and a readiness score, and the renter
  needs to see it in order to ask where it is.
  🔴 **Backend, still owed, and this only hides it**: the projection should send NULL coordinates
  rather than `(0, 0)`, and should not name a placeholder yard «Unspecified yard» - `EquipmentDetail`
  prints `machine.yardName` verbatim, so that phrase in the owner's screenshot is DATA, not a string
  in this repo (grepped: it appears nowhere in `src/`). The web can decline to believe the
  coordinates; it cannot know that a yard NAME is a placeholder.
  ⚠️ Verified: typecheck, lint, 282 passing across the five map suites, and the guard break-checked by
  deleting the line - three cases went red. NOT seen rendered.

- **2026-09-12 - «12 × null» stops being typed into the renter's own request.**
  Owner, on the intake with a site chip picked: *"still why the equipment name doesnt appear here why
  showing null"*.
  🔴 **It was not a label. It was the REQUEST TEXT.** Picking a template types its machine into the
  box as if the renter had written it, and that text is what goes to the agent - so the request said
  «12 × null», twice, and would have been read as a machine by that name.
  The chain, and the lie at the end of it: the chart's projection names a REQUEST's item from its
  taxonomy pair alone, so an off-catalogue line has no label; `chartItemName` can only fill it when
  the row carries a typed name, which that branch still does not select (raised 2026-09-08, OPEN);
  so `label` is null. `ChartRow` had always handled that - «Equipment (not named)» - and **nothing
  else knew it was possible**, because `ChartItem.label` was typed `string` and the
  `as unknown as ChartGroup` cast in `fetchChart` laundered the null straight past the compiler.
  `listTemplates` copied it into `TemplateOption.machine`; `ProjectChips` interpolated it; `${null}`
  is the four characters «null»; and `.trim()` reported them as a perfectly good line.
  **The type is honest now** (`label: string | null`), and the compiler named all three readers that
  had been getting away with it:
   · `listTemplates` → `machine: string | null`;
   · `ProjectsSurface`'s work-order form → an unnamed machine edits as an EMPTY name, so the renter
     types his own rather than saving a placeholder as the name;
   · `siteLevelAward` → says «Equipment (not named)» rather than drawing an empty subtitle.
  And `applyTemplate` builds its line from a real name or writes nothing at all.
  Files: `src/lib/contract/award.ts`, `src/lib/contract/project-apply.ts`, `src/lib/api/client.ts`,
  `src/components/create/ProjectChips.tsx`, `src/components/projects/ProjectsSurface.tsx`,
  `tests/unit/project-template-line.test.tsx` (new, 4 cases), `tests/unit/chart-item-name.test.ts`
  (3 new cases).
  ⚠️ **The TERMS still apply when the name is missing.** They are what a template is FOR and they are
  keyed on the item, not on its name; only the sentence is withheld. Skipping the whole template
  would have taken the renter's shortcut away over a display fault.
  ⚠️ The PICKER read correctly all along - it labels a row `tpl.machine || tpl.ref`, so an unnamed
  machine falls back to the request's code there. That is why the dropdown in his screenshot looked
  right while the line it typed did not, and why the test picks a row by whichever label the case
  produces.
  🔴 **BACKEND, still owed and now costing more than a blank row**: `getChart.ts` must select
  `customEquipmentName` on the `equipmentItems` request branch and label it
  `taxonomy → customEquipmentName → null`, the way the work-order branch already reads. Until it
  does, these machines have NO name to show anywhere - the web can only decline to invent one.
  ⚠️ Verified: typecheck, lint, 57 passing across the five project/canvas suites, and the typed-line
  pin break-checked by restoring the old interpolation - it went red.

- **2026-09-12 - «Required» stops resizing the field it marks.**
  Owner, on a shot of «FUEL RESPONSIBILITY» broken over two lines with a stranded red star above the
  word: *"fix the ui when required appear to not change the size of card box and dont affect the text
  wrapping, put the required text small"*.
  Three faults out of one line in `CanvasField`. The marker was a flex SIBLING of the label at the
  label's OWN metrics - 11px, uppercase, extrabold, inheriting the row's `tracking-[0.05em]` - and
  the string it drew was `requiredMark`, «* Required», star included.
  (1) **It took its width off the label.** A rigid flex item beside a label that has to fit: the
  label wrapped, the panel grew a second line, and the fuel box stood taller than the delivery and
  return boxes next to it.
  (2) **It split in half.** No `whitespace-nowrap`, so «* Required» broke at its own space and left
  the star at the end of one line with «REQUIRED» under it - which is the star the screenshot shows
  floating above the word.
  (3) **It read as a second title**, being the same size and weight as the field's name.
  Now: INLINE with the label's text, so it flows with the words instead of competing with them;
  `normal-case` + `tracking-normal` + `font-semibold`, which is roughly half the width it was; and
  `whitespace-nowrap` so it can never break again. It draws `create.requiredWord` («Required» /
  «مطلوب»), a new bare key - `requiredMark` keeps its star for the photo chips, which are one opaque
  strip and were never the problem.
  Files: `src/components/create/Provenance.tsx`, `src/lib/i18n/{en,ar}.ts` (`create.requiredWord`),
  `tests/unit/canvas-provenance.test.tsx` (3 new cases), `tests/unit/canvas-gating.test.tsx`.
  ⚠️ **The standing star is no longer SUPPRESSED when the word appears.** It used to be - the word
  carried a star of its own - and that is exactly the star that broke across the line. One star, on
  the label, in both states, so the label's width does not change when a field is refused. That
  reverses half of the 2026-09-03 note *"the word replaces the star rather than joining it"*: the
  word still replaces the DOT, but no longer the star.
  ⚠️ **There are now TWO required markers with different shapes**, and a test reading only the literal
  «* Required» would pass on a photo chip while a field said nothing - and every
  `queryByText("* Required")).toBeNull()` in `canvas-gating` would have gone VACUOUS for a field.
  One `requiredMarks()` helper counts both spellings, in one place.
  ⚠️ Verified: typecheck, lint, 88 passing across the five canvas suites, and the field-level pin
  break-checked by deleting the marker - it went red. NOT seen rendered: the wrap this fixes is a
  measured layout fact and jsdom lays out nothing, so the fuel panel wants one look.

- **2026-09-12 - Connecting Outlook is its own act, and the confirmation names every destination it reaches.**
  Owner: *"users are confused when their request is sent with the Outlook at same click, so i want to
  separate the connect as a separate action from the create, so the create is done to Outlook once it
  is connected"*, then *"if they didn't connect the Outlook the confirmation will be on Moedatech
  only"*, *"in case it is already connected also confirm to send to both with a small option to
  disconnect Outlook"*, and *"make the confirmation modals clear and dominant... even when sent, the
  successful modal must be clear"*.
  (1) **Send no longer connects.** One press used to post the request, open a blank pop-up (to beat
  the pop-up blocker), aim it at Microsoft, wait for it to close, re-read the status and then send.
  Five acts, none announced, and when the window shut the renter could not tell which had happened.
  The consent is a button on the channel row now, drawn the moment Outlook is picked and not
  connected. `send` does the post and the mail, and nothing else.
  (2) **Not connected means Moedatech only.** The endpoint is not called at all, and no compose
  window opens. `emailWillGo` is the single reading of *will a message actually leave?* - Gmail
  always (its own window IS the send), Outlook only when connected and not skipped.
  (3) **The confirmation states DESTINATIONS, not sentences.** `xl`, one bordered block per place the
  request is about to reach, each drawn only when it will really receive it: Moedatech, then Outlook
  or Gmail, with the addresses inside the mail block. The not-connected case draws the Outlook block
  greyed, saying nothing is e-mailed, with the Connect button inside it.
  (4) **«Don't send by Outlook this time»** greys the mail block and switches the button to «Post to
  Moedatech». `skipEmail` is cleared on every open of the dialog.
  (5) **The tick mirrors it**: `md`, a short title again, and the same rows ticked back.
  Files: `src/components/share/ShareRequestPanel.tsx`, `src/components/create/ShareOnPost.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/{share-request-panel,posted-confirmation}.test.tsx`.
  🔴 **The SES path is REMOVED from the product** (owner: *"we will not communicate with the IT of
  company, so remove this scenario, it will be from the Outlook connection"*). Our server could also
  send as the renter's own domain once somebody with DNS access proved we may; the panel carried a
  records table and a «your IT adds these once» line. Nobody was going to do it. The panel no longer
  draws any of it, and `DOMAIN_NOT_VERIFIED` / `PERSONAL_DOMAIN` / `NO_SENDER_ADDRESS` read as
  ordinary refusals. They are also unreachable now, because the web only calls that endpoint with a
  connected mailbox and `shareEmail.ts` reaches all three on its SES branch only.
  🔴 **A dropped token left the panel believing it was connected.** `connect` is read once on
  mount, so when Microsoft revokes consent the backend answers `RECONNECT_REQUI🔴`, forgets the
  token, and this screen went on saying «Sending from ...» over a refusal with no Reconnect offer -
  that offer is gated on `!connected`. The status is re-read on that reason now. Found while
  rewriting the tests, not reported.
  ⚠️ **The compose window is a PRESS, never an outcome.** Nothing opens by itself on any Outlook
  path. «Open your e-mail» and «Copy addresses» are staged and offered under the status line,
  including on the Moedatech-only path, so a renter who wants to write by hand still can.
  ⚠️ **This reverses the placement of 2026-09-05**, which moved the connect offer OFF the tick
  because it *"put a paragraph about Microsoft consent in front of a renter who had not asked to send
  anything yet"*. The half of that ruling that survives is the paragraph: this is one line and a
  button. What replaced it was worse, which is the report above.
  ⚠️ **`mailConnectedNow` lost «press Send again».** True only while connecting happened inside
  Send.
  🔴 **Scripting trap, hit TWICE in one session and once ON THE REMOTE.** These edits are applied by
  Python scripts that expand a `🔴` placeholder into the 🔴 marker. `🔴` is a substring of
  `RECONNECT_REQUI🔴`, `🔴IRECT`, `OFFE🔴` and `DECLA🔴`, so the expansion silently corrupted
  each of them - including a string COMPARISON (`outcome.reason === "RECONNECT_REQUI🔴"`) that
  typechecked and could never match. `🔴IRECT` was corrupted inside a comment in commit `0597a6d8`
  and is on `origin/beta` now. Use a placeholder that cannot appear in code.

- **2026-09-10 - The Arabic brand has ONE spelling, «معداتك», and the guard now catches all three ways it broke.**
  Owner, on «انضم إلى مؤجّرتك»: *"make sure all moedatech word in english is معداتك in arabic, fix it
  and add it to localization or whatever"*.
  Three faults, and only the first was the one he could see:
  (1) **TRANSLATED.** `guestWall.join` read «انضم إلى مؤجّرتك» - «join your LESSOR». The brand was
  translated instead of written. One string.
  (2) 🔴 **DIACRITISED, 32 times.** «مُعِدّاتك» across the dictionary and `inviteCardHtml.ts`. Same six
  letters, so it passes a glance - but the vowels change the word (مُعِدّات reads «preparers», not
  «equipment»), and **a search for «معداتك» does not find it**, which is why the 2026-09-08 sweep for
  «مويداتك» walked straight past every one of them.
  (3) **The LATIN name inside Arabic copy.** Two WhatsApp bodies opened «مرحبًا Moedatech».
  And one string had simply DROPPED the brand: `suppliers.couldNotReadBody` lost the whole clause
  about matching a supplier to a Moedatech account, so the Arabic reader was told the value was kept
  and never told what it costs him.
  **Registered**, which is the half that lasts: `tests/unit/brand-spelling.test.ts` grew from one rule
  to six. Beside the existing «مويداتك» check it now forbids the translated form, forbids ANY
  diacritic inside the brand's six letters, and - the rule he actually asked for - walks `en` and `ar`
  IN STEP and fails when an English string names Moedatech and its Arabic twin does not, or when
  Arabic copy carries the Latin name.
  Files: `src/lib/i18n/ar.ts` (32 strings), `src/lib/inviteCardHtml.ts`,
  `tests/unit/brand-spelling.test.ts`.
  ⚠️ **«المؤجّر» is NOT swept.** It is the ordinary word for the supplier and is correct in dozens of
  strings; the rule is narrowed to the possessive shape «مؤجّرتك» that stands where the brand belongs.
  A blanket sweep here would have renamed the supplier throughout the product.
  ⚠️ The Latin name stays in KEY NAMES - `onMoedatech`, `verifiedByMoedatech`, `postMoedatechOnly`,
  `sendMoedatechOnly` - which no reader sees. The parity rule reads VALUES only.
  ⚠️ **The decoded prototypes under `docs/implementation-plans/**\/prototype*` are exempt**, by path,
  with the reason in the file: they are a captured copy of somebody else's build, and correcting them
  would make the reference disagree with the artefact it records. Our own plan documents are not
  exempt and were fixed on 2026-09-08.
  ⚠️ Verified: typecheck, lint, 14 passing across `brand-spelling`, `auth-i18n` and `source-wording`.
  All four new rules break-checked by re-introducing one fault each; each went red.
  🔴 **Outside this repo, STILL WRONG and now two faults**: `Moedatech-App`'s
  `app_ar.arb` / `app_localizations_ar.dart` carried «مويداتك» (raised 2026-09-08, still open) and
  have never been checked for the diacritised spelling. The same guard would port.
- **2026-09-10 - The company panel drops its initials tile and its boxed blue arrow, and a paper the machine DOES hold stops painting its alternatives red.**
  Owner, on a screenshot of the company documents panel: *"for ui put small arrow to open, not this
  bold blue one folded in a card, make it only a small arrow"*, *"use the verified badge style and
  icon used in other surfaces"*, *"remove this capital icon"*, and earlier the same day *"if at least
  one document from proof of ownership or the front image at least, then don't show missing proof and
  missing images as red"*.
  (1) **`.mp-doc` is a bare arrow.** It was a 30px outlined tile with a tinted fill on a row that
  already carries a bordered card, a framed thumbnail and a checkbox: boxed beside the paper's own
  thumbnail it read as a second document rather than as the way to open the first. The 30px HIT AREA
  stays (a 14px glyph is not a target on a phone); the border, the fill and the weight go.
  (2) **The verified chip is the product's badge.** The hand-drawn stroked check became
  `Icon name="verified"`, the rosette the profile block, the Moedatech picker and the request-details
  chips all draw, and the chip took those chips' colours: `--ok` on `--ok-soft` inside a hairline of
  `--ok` at 30%, where it had been white-on-45% and read as a sticker on the navy header.
  (3) **`.mp-initials` is deleted**, markup and CSS. «AC» in front of «Al-Faisal Contracting Est.»
  abbreviated the name standing beside it, on the one header whose job is to say whose papers these
  are.
  (4) **The FRONT shot alone answers the photos key.** `REQUIRED_PHOTO_SLOTS` and
  `computeUnitReadiness`'s `photosPresent` both dropped `plate`, so a machine photographed from the
  front no longer reads red on the bid card and «Missing plate / serial» on the map.
  (5) **An ownership row whose sibling is on file is not a gap.** The four proof rows are ways of
  answering ONE question - `attentionCount` has counted them as one since 2026-08-12 - but each row
  still painted itself, so a machine proven by an istimara drew three red rows saying «missing».
  `DocRow.answeredElsewhere` marks the empty siblings and `DocRowList` withholds the red skin.
  Files: `src/components/map/panel/{CompanyPanel.tsx,DocRowList.tsx,EquipmentDocuments.tsx,machine-panel-model.ts,panel-proto.css}`,
  `src/lib/contract/bid-readiness.ts`, `tests/unit/machine-panel.test.ts` (11 cases rewritten).
  ⚠️ **`answeredElsewhere` changes the PAINT and nothing else.** The row keeps `status: "missing"`
  and `requestable: true`, so «select all missing» still reaches it and a renter who wants the customs
  card as well as the istimara can still ask for it. Making the row not-required instead was the first
  cut and it was wrong twice over: a held paper's status flipped to `on_file`, and the absent siblings
  would have stopped rendering, against the 2026-08-12 rule that a renter cannot choose a proof the
  surface has hidden.
  ⚠️ **An absent OPTIONAL photo slot is not a row**, which is why the plate shot simply disappears
  from the group rather than going grey - the same rule the meter and the side shots have always
  followed. It is also why `machine-panel.test.ts`'s selection block had to swap its pair round: the
  front shot is now the only photo row that can read `missing`.
  ⚠️ `companyInitials` is NOT dead - `RequestCard` draws the counterparty's mark from it. `.bm-verified`
  (the map's light twin of the chip) keeps its own values: it sits on white, where `--ok-soft` is
  already the ground.

- **2026-09-10 - The map panel's shortfall alert is withdrawn: it contradicted the pill above it.**
  Owner, on a panel reading «2 Crawler Excavators 20 ton registered» · «2 in this offer» with
  «1 in this offer with no registered equipment» under them: *"from where this note is shown"*, then
  *"but he has 2 registered so remove it"*.
  🔴 **Two counts, one word.** Both say «registered» and neither means the other:
    · the PILL is `counts.owned` = `fleet.length` - every machine the lessor holds for this request;
    · the ALERT is `counts.claimed` = `offered − registered`, where `registered` counts ONLY fleet
      rows carrying `inBid === true`, the ones committed to THIS bid.
  Two owned, two offered, one flagged `inBid` therefore printed «1 unbacked» directly under a pill
  saying he has two. Read together they contradict each other; read apart, each is true. The alert
  is the half that goes, because it is the one whose number the renter cannot check.
  Files: `src/components/map/BidMapWorkspace.tsx`, `tests/unit/rentee-map-surface.test.ts`
  (the RM3-AC-05 block rewritten to the removal, 3 cases, break-checked).
  🔴 **This does NOT fix `inBid`, and the alert was not necessarily wrong.** Either the lessor really
  attached one machine of the two, or the projection under-reports `in_bid`. That is a BACKEND
  question and it is still open - worth asking, because the same flag drives the map's own list
  (`listedMachines` filters `inBid === true`), so an under-reported flag hides pins too, silently.
  ⚠️ **The ASK survives.** «Ask him to add it» and the list-foot's «Ask for different equipment» were
  always ONE ask (`composeShortfallRequest`, an `alternative` naming no machine), so the route is one
  press behind the list and nothing is stranded. `shortfallPending` still reads at the list foot,
  which is how the test proves it.
  ⚠️ **The MODEL is untouched** - `shortfallAlert`, `countCase`, `SHORTFALL_COLOUR`, and
  `bid-map.test.ts` with them. RM3-AC-05/06 are a contract this app shares with the mobile app, and
  the model is what a corrected `inBid` would light up again. Only the render went.
  ⚠️ `unitCountLabel` and the `shortfallAlert` import went with the render rather than being left
  unused; `SHORTFALL_COLOUR` stays, because `rentee-map-surface.test.ts` still binds the stylesheet's
  `.bm-short` orange to it and that rule is still in `map-proto.css`.
  ⚠️ This is the SECOND «units with no machine behind them» line removed in two days - the bid card's
  `countClaimed` went on 2026-09-10 as well. Same underlying fact, two surfaces, two separate owner
  calls. Nothing now states it in words anywhere; `unitCounts` still computes it.

- **2026-09-10 - The pin overlay is off on staging (temporarily), and the bid card drops the «no named machine» note.**
  Two owner notes.
  (1) *"can u remove the pins toggle from staging just temporarily just hide it"*. The two staging
  hosts are COMMENTED OUT of `PIN_HOSTS` rather than deleted, with the quote beside them, so bringing
  it back is uncommenting two lines. `localhost` and `127.0.0.1` keep the overlay, so nothing about
  developing locally changes, and the registry, the shortcut and `?pins=1` are all untouched.
  ⚠️ `uiPinsAllowed` also gates **`/dev/preview`**, so that page answers «not here» on staging for as
  long as this stands. Said out loud because it is a second surface going dark for a one-line edit
  aimed at the first.
  (2) *"«1 من هذه الوحدات بلا معدّة مسمّاة: أُدرجت 1 معدّة.» remove this note from the bid card"*.
  It fired on `claimedUnits > 0` - units offered with no named machine behind them - which is the
  ORDINARY shape of an off-platform bid, so it printed in orange on most cards and told the renter
  nothing he acts on there.
  Files: `src/lib/uiPins.ts`, `docs/ui-pins.md`, `src/components/workspace/BidCards.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`workspace.countClaimed` deleted).
  ⚠️ **Only the NOTE went.** `unitCountNotes` still computes `hasClaimedNote`, `claimedUnits` and
  `machinesNamed`, and `bid-card-rules.test.ts` still pins them: it is the app's own rule, and the
  equipment map is where a unit with no machine behind it actually matters.
  ⚠️ The box's condition moved from `!countNotes.isEmpty` to `hasPricedNote`. Left as it was, a bid
  carrying ONLY the claimed note would have drawn an empty bordered strip under the total.
  ⚠️ The comment above the two surviving strings described the removed line in both locales and was
  rewritten. A comment stating a premise that is no longer true is worse than none.
  ⚠️ `docs/ui-pins.md` is GENERATED outside its `pins:start/end` block too - a hand-edit to the prose
  makes `ui-pins.test.ts` fail as «stale» until `node scripts/ui-pins-doc.mjs` is re-run, which then
  keeps the edit. Re-run it after touching that file.
  ⚠️ That same test was ALREADY failing before this change, on a clean tree: the committed docs are
  CRLF on disk here and the generator writes LF. Verified by stashing. Re-running the generator
  settles it and produces no content diff.

- **2026-09-10 - The Latin face is INTER at last, and a guard now stops the type drifting the way the colour once did.**
  Owner, on `docs/design-tokens.md`: *"is the font style and size in this md applied to web in all
  screens?"*, then *"apply it, and make sure to register it as part of the web design system so any
  further changes will follow and use it"*.
  🔴 **It was not applied, and had not been since the file landed.** The token file named Inter on
  2026-09-04, `layout.tsx` began DOWNLOADING it that day, and `globals.css` bound
  `--font-sans: var(--font-inter), …` — but **nothing read `--font-sans`**. Its only other mention in
  `src/` was inside a comment. `body` went on declaring `"Segoe UI", system-ui, -apple-system,
  Roboto, sans-serif`, and a declaration on `body` beats anything preflight puts on `html`, so for
  six days the app paid for the webfont on every load and rendered in the system face anyway - the
  worst of the two options it was choosing between. The ARABIC half was wired correctly the same day
  (`:lang(ar) body` → Almarai), which is why only English screens drifted and nobody saw it.
  (1) `body` is `font-family: var(--font-sans)`. **This repaints every Latin screen.**
  (2) **37 stray `font-family` declarations swept** out of five prototype stylesheets and the public
  bid form's style blob: `"Segoe UI", …` → `var(--font-sans)`, `"IBM Plex Sans Arabic", …` →
  `var(--font-arabic)`, `"IBM Plex Sans", monospace` → `var(--font-mono)` (a TEXT face, the token
  file's own decision - figures align on `tabular-nums`, not on a monospaced face), and raw
  `ui-monospace, monospace` → `var(--font-mono-data)`. `font-family: inherit` is left alone: it
  inherits the body's face, which is now the token's.
  (3) **Registered**: `DESIGN.md` gains a «The faces» table above the size scale, the linter table
  gains a row, and `tests/unit/font-drift.test.ts` (new, 5 cases) fails on any `font-family` in
  `src/` that is not one of the four tokens.
  Files: `src/app/globals.css`, `src/components/bid/bidFormStyles.ts`,
  `src/components/{map/map-proto,map/panel/panel-proto,map/request-card,deal-room/deal-room-proto,requests/requests-proto,compare/compare-proto}.css`,
  `DESIGN.md`, `tests/unit/font-drift.test.ts`.
  ⚠️ **The md defines NO sizes.** It is titled «Colors & Fonts» and holds three families with their
  weights plus ~113 colours - no scale, no line-heights. The six-step `--text-*` scale is this app's
  own and predates it, which `DESIGN.md` now says out loud so the next reader does not go looking.
  ⚠️ **Five files are exempt, and must stay exempt**: the quotation, the printed comparison, and the
  three cards pasted into Gmail / Outlook / Word. They render where this app's `:root` does not
  exist, so `var(--font-sans)` resolves to nothing there and a `next/font` face is not available at
  all. The guard requires each to name a real system STACK rather than one family, and adding a
  sixth means adding it to that list with a reason.
  ⚠️ **Oswald (`--font-hero`) is the one face this app loads that the token file does not name.**
  Left as it is - it is the CTA banner headline and the owner chose it - but it is a deviation, and
  `DESIGN.md` says so rather than leaving it to be discovered.
  ⚠️ Verified: typecheck, lint, and the five design guards green (240) - `font-drift`,
  `palette-drift`, `ds-colors`, `rentee-map-surface`, `equipment-card`. The new guard was
  break-checked both ways (body reverted to Segoe UI, and a Comic Sans rule added to a prototype
  stylesheet); each went red. **NOT seen rendered**: the repaint has not been looked at in a browser,
  and Inter and Segoe UI have different metrics - the places to check first are the ones with fixed
  widths, the compare matrix's 132px term columns and the map's numeric chips.

- **2026-09-09 - The exported comparison is the WHOLE table: two money bands, every term, the verdicts in colour, and the brand at the top.**
  Owner: *"i wanna the export template for compare table to be as full table with all but grouped by
  section price or terms but showing moedatech logo at top and showing green and red too"*.
  ~~Four columns - supplier, rate, transport, grand total.~~ A renter who had spent the afternoon
  reading eight term columns exported a sheet with none of them on it, and the verdicts he was
  choosing BY (this one meets the certificate, that one refuses it) printed nowhere at all.
  `src/lib/export/compare-sheet.ts` draws the screen's own shape: a two-deck head (the band
  «PER CYCLE / GRAND TOTAL / TERMS», then the columns under it, the supplier cell spanning both), a
  row per bid naming its source, the money with the cheapest marked, and every term cell in the
  green or the red the screen paints it, with the ✗ on a refusal.
  🔴 **ONE derivation, two renderers.** The sheet calls `buildTermColumns` and `readTerm` - the
  matrix's own, extracted to module scope and exported for this - and the money is the same
  `computeCycleTotals` call with the same inputs. A sheet that decides its own columns prints a term
  the screen dropped, and NOTHING fails when it does; it just quietly disagrees with the screen it
  claims to be a copy of.
  Files: `src/lib/export/compare-sheet.ts` (new), `src/components/workspace/RequestsWorkspace.tsx`
  (`printComparison` rewritten), `src/components/workspace/CompareMatrix.tsx` (`buildTermColumns`
  extracted; it and `readTerm` / `docForTerm` exported), `src/lib/i18n/{en,ar}.ts`
  (`workspace.exportLegend`), `tests/unit/compare-sheet.test.ts` (new, 9 cases).
  ⚠️ **The old sheet was never branded, and could not have been.** It wrote `color:var(--navy)` and
  `border:1px solid var(--border)` into `window.open("", "_blank")` - a document that inherits no
  stylesheet from this app - so every one of those resolved to nothing and it printed in the
  browser's defaults. The sheet carries `DS_ROOT_CSS` in its own `<head>` now, which is what the
  QUOTATION has always done for the same reason. A test asserts `:root{` and the two soft tones are
  in the output.
  ⚠️ The logo URL is ABSOLUTE (`${window.location.origin}/moedatech-logo.svg`). A relative path in an
  `about:blank` document resolves to nothing and prints a broken image where the brand should be.
  ⚠️ A leg the RENTER moves prints as «Didn't say», never as 0 SAR - on paper a zero reads as free
  delivery. Same rule as the matrix's `onRentee` column.
  ⚠️ The ✗ is drawn as well as the colour, because a sheet gets photocopied and the colour is the
  first thing to go.
  ⚠️ `workspaceExportTotals` is no longer imported by the workspace. It is still used by the CARDS
  export payload; do not delete it on the strength of this one call site going away.
  ⚠️ Verified: typecheck, lint, 9 new cases plus `compare-matrix`, `palette-drift` and `ds-colors`
  green (178). NOT seen as a picture: the sheet was rendered to HTML and served locally, but the
  browser tool timed out on every screenshot attempt, so the LAYOUT (column widths on A4 landscape
  with eight terms, and the print colours) has not been looked at. That is the next thing to check.

- **2026-09-09 - The comparison's supplier column is one line and names the SOURCE, and the terms strip reaches the orange rail.**
  Owner, three notes on one screenshot: *"make the supplier name in 1 row"*, *"call it via app instead
  of waiting reply etc"*, *"fix the equipment orange stripe place"*.
  (1) **One line, and the column widened to hold it.** The name was `line-clamp-2 break-words` in a
  220px column, so «Nesma Heavy Equipment Co.» took two rows of a 52px cell. It is `truncate` again
  and the column is 280px, which fits a real firm name whole beside the 28px avatar and the ✕ - both
  rulings stay alive, because the wrap was itself an answer (2026-09-07: *"the supplier names on the
  left must show the name fully"*, after 185px + `truncate` cut «Al Faisal Heavy Equipment Est.»).
  Anything longer truncates with the whole of it on `title`.
  (2) **The line under the name says where the offer CAME FROM.** ~~«Awaiting reply» / «In
  negotiation».~~ Both are facts about the conversation, and this column is the row's identity: on a
  table of six they said different things about the same kind of offer, while the one distinction
  that changes how a renter reads a row - through Moedatech, or through his own shared link - was
  stated only on the offline half. It reuses `sourceApp` / `offlineInvite`, the SAME two words the
  SOURCE filter above the table uses, so the row and the tab cannot drift. No new string.
  (3) **`flex-[1_0_auto] min-w-min` on the terms strip**, and its columns are `flex-1` with a
  `minWidth` floor instead of a fixed `width`. Earlier the same day the strip was `flex-[9_1_0]
  min-w-0`, so it shrank below its content while each column kept its floor: the columns overflowed
  and drew through the «Equipment» rail. That was answered with `flex-none`, which fixed the overlap
  and produced the opposite fault - with few terms the table ended short of its container and the
  orange rail floated mid-card with white after it. Grow, never shrink, is both answers at once.
  Files: `src/components/workspace/CompareMatrix.tsx`,
  `tests/unit/compare-matrix.test.tsx` (5 cases, 51 passing).
  ⚠️ The agent's ★ still wins that slot over the source. A recommendation is not a provenance, and
  the row can only say one thing on one line.
  ⚠️ **«In negotiation» is no longer said ON THIS TABLE.** An open deal room is still visible on the
  bid card and in the deal room itself; the comparison is for choosing between offers, not for
  tracking where each conversation stands. Say so rather than assuming nobody misses it.
  ⚠️ The two strip cases pin the DECLARATION, not the render: jsdom lays out no flexbox, so neither
  the overlap nor the gap can be measured in a unit test - only that the rules deciding them are the
  intended ones. Both faults were found on a screenshot and need one.
  ⚠️ Verified: typecheck, lint, 51 passing, and all five new cases break-checked (each source change
  reverted in turn, each went red). NOT seen rendered - `/requests` needs a signed-in renter with
  bids on a deployed build, so the third item especially wants a look.

- **2026-09-10 - A direct request from a store answers the machine that was PRESSED, and stops landing on the intake.**
  Owner: *"we have an issue in direct request, why does it take him to the intake UI"*. Reproduced in
  a browser against staging (local build, demo renter, Arabian Cranes Co.), which is what separated
  the two faults hiding behind one symptom. Both were guards written to stop `DirectRequestGate`
  re-dispatching on every render, and both stopped the SEED as well.
  (1) **The second press on the same supplier landed on the INTAKE, with an empty box.** The effect
  began `if (direct?.supplierId === supplierId) return;` — and after the first press `state.direct`
  already named that supplier, so the seed never ran. The `prefill` fallback sits after the same
  return, so the box was not even filled with the machine's name: «How would you like to create your
  request?» under a ribbon reading «This request goes to Arabian Cranes Co. only».
  (2) **A press with a draft open kept the OLD machine.** `if (!supplierId || draft || seeded.current)
  return;` — the URL said `capId=183d…` (500 ton) and the canvas showed the 220 ton from the press
  before it, silently.
  (3) **`HYDRATE` overwrote the seed.** A child's effect runs before its parent's, so the page seeded
  and the store's restore effect replaced it a tick later — with the stored draft, or with the stored
  INTAKE phase. `RfqState.direct`'s own comment has always claimed the opposite (*"a direct run also
  starts from a CLEAN draft: the mobile flow refuses to restore a stored draft into a direct
  request"*); now the code obeys it and skips the restore while the URL carries `supplierId`.
  The guard is the MACHINE now: the URL's `cat/sub/cap` triple against the one already on the draft.
  A re-render or reload carries the same key and seeds nothing; a different machine seeds and
  replaces, which is the only reading of the press that can be right.
  Files: `src/app/create/page.tsx` (`DirectRequestGate`), `src/lib/store/rfq-store.tsx` (the restore
  effect), `tests/unit/direct-from-store.test.ts` (2 cases).
  ⚠️ **Verified in the browser, not only in tests**: press 220 ton → canvas 220 ton; «Start over» →
  press 500 ton → canvas 500 ton (was the intake); with that draft open, press 100 ton → canvas 100
  ton (was 500). The reducer cases pin the store half; jsdom cannot exercise `useSearchParams` plus
  the provider's effect ordering, which is where these bugs actually lived.
  ⚠️ **The stored draft is LEFT in storage** when a direct request skips the restore, so an abandoned
  direct press does not destroy a broadcast in progress. It is not protected from the persist effect
  once the direct request is edited — one key holds one draft — so that promise is only good until he
  answers something.
  ⚠️ **Found and NOT fixed**: a bare `/create` does not restore a stored draft at all — no canvas, no
  «Continue your request?» prompt, on a hard reload with the owner's id matching and the row intact
  in `localStorage`. Confirmed pre-existing by disabling the new guard and reproducing it unchanged.
  It needs its own pass; the cause is not diagnosed and is not guessed at here.

- **2026-09-10 - «All projects» was a dead button, and the site strip caps itself at TWO ROWS now.**
  Owner, on a screenshot of the intake: *"it has more projects and when I click All it doesn't open
  them, I want the projects to be shown 2 rows max then All will open them below it as other rows"*.
  Two faults in one control.
  (1) **The press did nothing.** The chip called `onBrowseAll`, which is an OPTIONAL prop, and
  `Intake` renders `<ProjectChips />` with no handler - so on the first screen a renter meets, «All
  projects (5)» was a control whose `onClick` was `undefined`. Nothing threw and nothing moved.
  (2) **`VISIBLE = 6` was a guess at how many chips fit.** At the card's own width six wrapped onto
  two rows and the seventh onto a third, so the cap that existed to hold the strip to a couple of
  rows let it grow anyway.
  Now the cap is the SHAPE it was always described as: every site renders, the strip is clamped to
  two rows of whatever a chip actually measures (`ResizeObserver` on the strip, `offsetHeight` of the
  first chip × 2 + the 8px `gap-2`), and the toggle - drawn only when there IS more - unclamps it in
  place and becomes «Show fewer». The rest arrive as further rows under the two.
  Files: `src/components/create/ProjectChips.tsx`, `src/lib/i18n/{en,ar}.ts`
  (`projects.chips.fewer`), `tests/unit/project-chips-rows.test.tsx` (new, 4 cases).
  ⚠️ **The height is MEASURED, never a constant.** A chip is `py-1 text-label` and what that comes to
  depends on the face the locale loads - Almarai's line box is not the Latin one - so a pixel
  constant would clamp two rows in English and one and a half in Arabic.
  ⚠️ **Unmeasured renders UNCLAMPED.** `twoRowsPx` starts null, and a browser with no
  `ResizeObserver` keeps it null: showing every site is a smaller fault than hiding some of them with
  no way to reach them, which is the bug this entry is about.
  ⚠️ `overflow-hidden` is applied ONLY while clamped. Expanded it would cut off the chosen site's
  template dropdown, which draws outside the strip's box.
  ⚠️ `onBrowseAll` is KEPT and still wins when a caller passes one - a surface that wants a full
  picker can have it - so the in-place expansion is the default rather than a second thing to wire.
  ⚠️ **jsdom has no layout**, so the clamp itself is not asserted: the new suite stubs
  `offsetHeight` / `scrollHeight` and `ResizeObserver` to get the component past its measurement, and
  pins what was broken - every site rendering, the toggle appearing, and the press opening the rest
  rather than calling nothing.

- **2026-09-10 - A GUEST could not save his own profile: the form posted to the basic-only endpoint,
  so the server answered "complete your profile" to the request that was completing it.**
  Owner sent a prod screenshot of `+966566493886` (user 3581) stuck on that error with the زائر badge
  still showing. Files: `src/components/profile/EditProfileForm.tsx`, `src/lib/api/profile-client.ts`.
  ⚠️ 🔴 **There are TWO backend endpoints and they are not interchangeable.** `PUT /profile/me`
  (`/api/me/profile`) is an EDIT and is gated on `requireTier(basic)`; `PUT /users/me/profile`
  (`/api/profile/complete`) is the guest→basic transition and has no tier gate. `EditProfileForm`
  always used the first, and `ProfileView.tsx:237` renders that form for every signed-in user with no
  tier condition - so a guest was shown a form he was not allowed to submit. The 403 is `E8007`
  TIER_INSUFFICIENT, whose Arabic text is «مستوى حسابك لا يسمح بهذا الإجراء. يرجى إكمال ملفك الشخصي»,
  which reads as a validation complaint about the form and is not: it is about his tier.
  ⚠️ **The payloads are IDENTICAL** (firstName, lastName, city, jobTitle, email?, whatsapp?,
  companyName?), so this is an endpoint swap, not a form change. Nothing about the fields moved.
  ⚠️ 🔴 **The refresh is half the fix, not a nicety.** `/api/profile/complete` re-reads `/users/me`
  and re-stamps the `mt_user` cookie, but the client still has to call `session.refresh()` or the
  page keeps the stale tier: badge still «Guest», every basic-only action still blocked, over a
  profile that just saved successfully. `OnboardingForm.tsx` already did this after its own submit;
  the profile tab did not. Landing only the endpoint swap would look fixed and still be broken.
  ⚠️ **The backend split is deliberate - do NOT "simplify" it by dropping the gate on
  `PUT /profile/me`.** Mobile honours the same two paths (`profile_bloc.dart:66` completeProfile,
  `:180` updateProfile), so loosening the gate is a contract change reaching the app for no gain.
  ⚠️ **The can't-clear guards do not fire for a guest** (`profile.email` etc. are empty, so there is
  nothing to protect), which is why the first save needs no special-casing beyond the endpoint.
  Verified: `npm run typecheck` clean. 🔴 **Tests NOT run** - a guard hook refuses `npm test` in this
  environment - and 🔴 **not exercised in a browser against a real guest account.** The endpoint,
  its method and its payload were read off `src/app/api/profile/complete/route.ts` and the backend's
  `completeProfileSchema`, not observed.

- **2026-09-09 - «Didn't say» was OURS, not the supplier's: a bid's own declarations are now the term's value.**
  Owner: *"how can someone not say? it must say yes or no in the form, even in bid he must choose"*.
  He is right about the form and the blank was on our side. The bid form makes every T3 term a
  required choice and the answers arrive on the bid (`t3Declarations`: `payment_terms: "net_60"`,
  `breakdown_response_sla: "FORTY_EIGHT_HR"`, `maintenance_responsibility: "supplier"`, the
  nationality, both certificates, the fuel side) - verified against the two seeded staging bids,
  which declared all thirteen keys. But `rPayment`, `rSla`, `rMaint` and the three operator/fuel rows
  were built with a STATE and the RENTER's `renteeValue` and no supplier value at all, and the
  comparison prints the supplier's answer with «Didn't say» as its fallback. So a bid that answered
  everything reported silence on half of it.
  Files: `src/lib/contract/bids.ts`, `tests/unit/bids.test.ts` (3 cases).
  ⚠️ **The STATE is untouched.** An un-negotiated declaration stays `grey` («pending review», app
  parity with `terms_modal.dart`) and only a backend-flagged deviation is a conflict. This adds the
  value that state was always about, so the cell can be read without the deal room.
  ⚠️ **`''` is silence, not an answer.** `submitBid` fills any required key the client omitted with
  the empty string, so a bid from an older build carries the key holding nothing; `s()` returns null
  for a blank, which is what keeps «Didn't say» honest in that case. A test pins it.
  🔴 **The operator's FOOD and ACCOMMODATION/TRANSPORT are still unanswerable by an in-app bid.** The
  T3 vocabulary has no `fat_food` / `fat_accommodation_transport` key (staging
  `GET /marketplace/t3-defaults` lists thirteen terms, neither of them), so the app never puts the
  question to the supplier while the request states it. Those two columns read the REQUEST's own side
  when nothing deviates, and «Didn't say» when the request left them unset. Backend + app work.
  🔴 **The shared-link form can omit a term.** `bidFormSubmitSchema.items[].confirmations` is
  `z.record(z.boolean()).optional()` and every key inside it is optional, so a submission that skips
  a term is accepted and a missing key maps to `null` - which is the other real «Didn't say». If the
  form must force a yes/no, the schema is where it gets enforced.

- **2026-09-09 - The compare table draws only the terms the REQUEST set.**
  Owner: *"make it only what is set in the request these what user care about"*, answering my own
  report that the table was not renter-only. A column earned its place two ways since 2026-09-07
  (`asked || answered`), so a supplier could earn one by volunteering a term - his mobilisation lead
  time, his own attachments - and it drew a question the renter never asked, mostly «Didn't say»,
  sitting between the two he did. Such a column could not carry a verdict either: green and red are
  a judgement against the request, and every `matched` in both mappers is gated on a renter value
  (`contractState` returns grey without one, `negContractState` never returns matched at all), so a
  volunteered column was navy on every row whatever the supplier wrote. The filter is `c.asked`, and
  the table is the request's own checklist.
  Files: `src/components/workspace/CompareMatrix.tsx`, `tests/unit/compare-matrix.test.tsx`.
  ⚠️ **A term the request SET and nobody answered still draws**, as a column of «Didn't say». That is
  the renter's own question going unanswered, which is the thing he came to the table to see - the
  opposite case from a term nobody asked.
  ⚠️ The «renter's first» sort key went with it (`Number(b.asked) - Number(a.asked)`): every column
  is his now, so it could only ever compare equal. `TERM_ORDER` alone carries the reading order.
  ⚠️ `answered` is DELETED from the column map rather than left computed. Two ways to earn a column
  is exactly how the volunteered ones arrived; a flag that no longer decides anything is the next
  agent's invitation to bring them back.
  ⚠️ An off-platform submission carries the renter's side in the DETAIL line («Renter: X · Supplier:
  Y»), never in `renteeValue` - `link-bids.ts` never sets that field. `termSides` parses it, which is
  the only reason link bids draw any term column at all under this rule. Do not "simplify" `asked` to
  a bare `renteeValue != null`.

- **2026-09-09 - The compare table names the operator's food and his accommodation plainly, drops two default terms, stops drawing under the rail, and reads a file as an answer.**
  Owner, four notes on one screenshot of the terms strip: *"call it operator food only and operator
  accommodation and transport for the other one"*, *"make sure the table can show all fields without
  clipping"*, *"fix the overlay also"*, *"for this data i want to remove the breakdown and the
  maintenance from the table, it is too crowded"*, and *"how come some have «didn't say» but have a
  document option to view"*.
  (1) **The names.** «Operator FAT — Food» / «Operator FAT — Accommodation/Transport» became
  «Operator food» / «Operator accommodation and transport», Arabic «طعام المشغّل» / «إقامة ونقل
  المشغّل». F.A.T is trade shorthand for a thing the renter is being asked to pay for, and the em
  dash split spent a third of a 118px head on punctuation.
  (2) **Nothing clips.** `HEAD` is 48px (was 36) and the supplier column's own header 96px with it,
  which is the one geometry that keeps a name in line with its figures; every head WRAPS instead of
  truncating, and a term column is 132px.
  (3) **The overlay.** The terms strip was `flex-[9_1_0] min-w-0`, so with eight terms open its
  columns - each carrying its own `minWidth` - overflowed the box and drew straight through the
  «Equipment» rail beside it: a head read «OPERATOR» with the rest behind the rail and two columns
  reappeared on its far side. The strip is `flex-none` and each column a fixed width now, so the
  table scrolls sideways, which is what the scroller around it is for.
  (4) **`maintenance` and `breakdown` join `TERM_HIDDEN`.** Both are platform defaults nearly every
  bid answers the same way, so they spent two columns saying «On supplier» down four rows while the
  terms that differ were pushed off the strip.
  (5) **A FILE is an answer.** The value came off the bid's term row and the eye off the bid's
  documents, so a supplier who uploaded his TÜV certificate and left the term itself blank was
  reported as having said NOTHING beside the paper that says it. Such a cell reads «Sent the
  document» in navy, with the eye that opens it.
  Files: `src/components/workspace/CompareMatrix.tsx`, `src/lib/contract/bids.ts`,
  `src/lib/contract/deal-rounds.ts`, `src/lib/i18n/{en,ar}.ts` (`workspace.docAttached`),
  `tests/unit/compare-matrix.test.tsx` (2 new cases, 45 passing).
  ⚠️ **Off the TABLE, not retired.** The bid card, the request-details modal and the deal room still
  state maintenance and the breakdown SLA; this is a comparison of four offers, not a reading of one.
  ⚠️ The rename covers the compare strip and the deal-room chat labels (one file pair). The SAME two
  facts are still spelled «Food (F.A.T)» in `contract/bid-form.ts`, `link-bids.ts`'s `termRow` and
  `SharedBidSubmissionModal`, and «الإعاشة» in `bidCardModel`. Not touched here: they are the
  supplier-facing form and the card, and the owner named the table. One word per fact would be the
  next pass.
  ⚠️ `night_shift` is NOT a party term, so its refusal prints a bare «Supplier» rather than «On
  supplier» - which is why the tint case uses `fuel_responsibility`. A test swapped onto the wrong
  key looks like a wording regression and is not one.

- **2026-09-09 - A term cell wears its verdict as a light ground, and the offline supplier's certificate is one press away.**
  Owner: *"in the compare make sure if document exist in the submission offline to view it by eye icon
  make sure this exsit also make the green and red as light highlight for the cells not text only"*.
  (1) **The tint.** The verdict was ink alone (2026-09-06, *"if conflict just in red"*, when the fill
  was dropped for painting whole bands of the table). A coloured WORD is read one cell at a time; the
  question a renter actually asks on this table is read down a column - who met this term and who did
  not - and four green words scattered among four red ones do not answer it at a glance. The cell now
  carries `bg-ok-soft/70` when the answer is met and `bg-danger-soft/70` when it goes against the
  request, with the text colours unchanged. The merged "same from all N" cell takes the green ground
  too. This REVERSES the fill half of 09-06 deliberately; what survives is the weight, a 70% wash of
  the OS's own `success-bg` / `danger-bg` rather than the solid block that was removed.
  (2) **The eye.** Verified rather than built: `submissions` reaches `CompareMatrix` from the
  workspace, `submissionToBidDocuments` reads the form's attachments off it, `docForTerm` matches on
  the document's TYPE (`tuv` / `spsp` / `saso` / `operator_*`), and the cell draws the link. Nothing
  was missing; nothing pinned it either, so three cases now do.
  Files: `src/components/workspace/CompareMatrix.tsx`, `tests/unit/compare-matrix.test.tsx` (4 cases).
  ⚠️ **"Didn't say" is never tinted.** An absent answer is not a verdict, and a grey ground under it
  would read as one; only `met` and `against` paint.
  ⚠️ A conflict cell can never MERGE - `merged` requires `!a.against` on every row - so the red ground
  is always per-supplier and the green one is the only tint the merged cell can take.
  ⚠️ The eye's match is the document's type, not "he uploaded something": a front photo on a bid whose
  cert column is empty draws no eye. A case pins that.
  ⚠️ Verified by typecheck, lint and the unit suite (3105 passing, serially). Both new pins were
  break-checked - the tint reverted and `docFor` forced to null - and both went red. NOT seen
  rendered: the compare tab needs a signed-in renter with an off-platform submission carrying a
  certificate file, which is a deployed build.

- **2026-09-09 - The send confirmation lists the ADDRESSES the mail goes to, not the firms' names.**
  Owner: *"when user want to send an outlook email in the confirm modal he must show the suppliers
  emails that he is sending to not the supplier or company name"*. The Bcc chips printed
  `supplier.name` with the address hidden in the `title`, so the last screen before a request leaves
  for other firms confirmed WHO and never WHAT: «Al Faisal Rentals» cannot tell a renter whether the
  message is going to the branch mailbox or to a salesman's personal one, and a mistyped address in
  his own supplier list is invisible behind the label he gave it. The chip is the address now and the
  name is its `title`, so the firm is one hover away.
  Files: `src/components/share/ShareRequestPanel.tsx`,
  `tests/unit/share-request-panel.test.tsx` (1 case).
  ⚠️ Only the CONFIRMATION. The envelope preview on the panel (`MailChips`) already draws the
  address with the name beside it, and the picking list still shows names, which is what a renter
  chooses by.
  ⚠️ Every chip in that block has an address by construction (`reachable = chosen.filter(canBeEmailed)`),
  so nothing can render blank; the addressless picks are named separately by `envSkipped`.
  ⚠️ Verified the new case FAILS on the old chip - swapped the two fields back and watched it go
  red - so it pins the ruling rather than the render.

- **2026-09-09 - An equipment tab carries an ✕, and it asks before it takes the answers with it.**
  Owner: *"in the equipment tabs must have x button to remove it also the x is always visible on the
  left"*. The canvas had NO way to take an equipment off a request - `REMOVE_ITEM` existed in the
  store and nothing called it, so a renter who had added one by mistake, or whose agent read a machine
  he did not want, could only start the request again. The ✕ sits inside each tab on the LEADING edge
  (`start-0`, left in English and mirrored in Arabic), drawn always rather than on hover: a hover-only
  control on a touch screen is a control that does not exist.
  It ASKS first, one line: «Remove this equipment from the request?» with «Remove» and «Keep it». The
  answers on that card go with it - the machine, its year, its certificate, its operator, its
  transport - and `REMOVE_ITEM` is a one-way flag, which is the same bar «Start over» and the
  Back-to-intake confirm already clear.
  Files: `src/components/create/EquipmentTabs.tsx` (`onRemove`), `src/components/create/Canvas.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`create.removeEquipment`), `src/lib/uiPins.ts` (17.7),
  `tests/unit/canvas-multi-item.test.tsx` (3 cases).
  ⚠️ **No ✕ on the only equipment.** `gate.noItems` refuses a request with none, so the press would
  lead nowhere but a refusal. The TAB stays - one equipment is still the request's equipment.
  ⚠️ Where it lands is worked out BEFORE the removal, because `live` excludes removed items and the
  list shrinks under the index: removing one before the open card shifts it down by one, removing the
  open card keeps the index (which lands on the next equipment, or on the new last one).
  ⚠️ The tab and its ✕ are SIBLINGS in a wrapper, never nested: a button inside a button is invalid
  markup and no browser agrees on what it does. The tab takes `ps-8` so a long label cannot run under
  the ✕.

- **2026-09-09 - A TYPE search that finds nothing is where off-catalogue BEGINS.**
  Owner: *"what if i want to add an equipment that is not in the taxonamy, like custom equipment type
  but user didnt write it in the text, he wanted to add it or to edit his chosice of existing one,
  there is no path for it if he isnt on the intake"*, then *"maybe if he searched in the type and
  didnt find it we show for him something here that will open the field of custom type and the
  alert"*.
  The canvas could only ARRIVE off-catalogue: the agent read a machine it could not place and
  `deriveVerdict` called it `no-match`. A renter who wanted to name one himself - or who had picked
  the wrong type and then found the catalogue held nothing for him - had to go back to «Your request»
  and retype the whole request.
  Now the failure carries the way out. `Dropdown` takes an `emptyAction`, drawn UNDER the «—» when a
  search matches nothing and only while there IS a query: **«Add a custom equipment type»**, one line
  and nothing else (owner's third pass: *"add a custom equipment type only"* - the second line said
  what the state MEANS, which the orange note on the card says the moment the box opens). The press
  dispatches `SET_ITEM_OFF_CATALOGUE`, the exact mirror of `SET_ITEM_SUBCATEGORY`: the ids clear and
  the verdict becomes `no-match`, so the card opens the EQUIPMENT NAME box with the orange «not in our
  catalogue yet» note under it.
  🔴 **The row is GENERAL and the box opens EMPTY** (owner, same day, second pass: *"make it general,
  add custom equipment type but show something that is not on moedatech etc"*). ~~It quoted the search
  text and seeded the name with it.~~ Quoting read as a promise about that text, and a search FRAGMENT
  is not a machine's name - «wat» would have gone out to suppliers as the answer. The name is asked
  for in the box, which carries the star like every other required answer on the card. The typed text
  is still handed to `onPick`; nothing uses it today.
  Files: `src/components/Dropdown.tsx` (`emptyAction`: `label`, `onPick`),
  `src/lib/store/rfq-store.tsx` (`SET_ITEM_OFF_CATALOGUE`, `setItemOffCatalogue`),
  `src/components/create/MachineCard.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`machineCard.addCustomType`),
  `tests/unit/off-catalogue-from-type.test.tsx` (new, 7 cases).
  ⚠️ **All THREE things that say «off-catalogue» move in the one branch** - the verdict, the ids
  `isCustomLine` reads, and the typed name - which is the 2026-09-06 trap read backwards. The SIZE
  goes with the type, because a size is a size OF something. A test drives the round trip both ways
  and asserts the reverse is lossless.
  ⚠️ The row is offered only while `CUSTOM_EQUIPMENT_ENABLED`. With the flag off `isCustomLine` is
  false whatever the verdict says, so the press would clear the trio and open nothing.
  ⚠️ **Only when he has typed something.** An empty list with an empty search box means «there is
  nothing here to pick at all» - a taxonomy that failed to load, or a size list waiting on a type -
  which is a different fault with a different answer. A case pins that, and another pins whitespace.
  ⚠️ The reducer still ACCEPTS a name, and the canvas passes `""`. Keeping the parameter is what lets
  a future caller (an edit modal, a work order) open the box already answered without a second action;
  the canvas does not, for the fragment reason above.
  ⚠️ Offered on TYPE only, not on CATEGORY or SIZE. The type is where the catalogue actually fails;
  a category with nothing under it is a taxonomy fault, and a size list is empty until a type exists.

- **2026-09-09 - A certificate answered at REQUEST level stops shaking: the gate reads what the pill shows.**
  Owner: *"the certiticate is shaking as required while it is selected, so whenever there is a value
  for cert dont shake it, it is navy blue and filled and allow moving on"*.
  Both of these answers live at TWO levels - the item's own override, else the request-wide one - and
  the card has always resolved them that way (`useItemOverrides`: `item.safetyCertsOverride ??
  project.certificates.safety`). `itemWebGaps` read the OVERRIDE alone. So a certificate set at
  request level (by the agent, or by a project template) filled the chip, painted it navy, and still
  counted as missing: the chip shook, «* Required» appeared over a field with an answer in it, and
  «Review & send» refused with nothing on screen to fix. One resolution, two readers now - the gate
  asks the question the pill answers.
  Files: `src/lib/contract/gates.ts` (`itemWebGaps`, `itemGaps`, `gateEquipment` take the draft's
  `project` too), `tests/unit/gates.test.ts` (3 new cases), `tests/unit/cert-year-pills.test.tsx`.
  ⚠️ **The YEAR had the identical hole, one line away, and is fixed in the same pass.** `equipmentYear`
  resolves `item.equipmentYear ?? project.advanced.equipmentYear` on the card and was gated on the item
  alone. Not asked for; left alone it would have been the next report, in the same words.
  ⚠️ `null` and `[]` on the item still mean different things: `null` is «follow the request», `[]` is
  «no certificate HERE» - which is an answer only once the control has been touched. Conflating them
  would make clearing a cert on one machine silently inherit the request's again. A test pins it.
  ⚠️ `gateEquipment` already took `project` as its own argument and now passes it through on the draft
  shape (`{ ...draft, project }`). It is the same object either way; the two parameters are not two
  sources.

- **2026-09-09 - «Back to review» is gone from the intake: one Back per screen.**
  Owner, on a screenshot of it: *"remove this"*. It was drawn on the intake whenever a draft existed,
  and it was a SECOND back control on a screen that already has one - pointing the other way. The
  page's own control leaves the flow there (`CreateBack`, `{ fallback: "/" }` on the intake); this one
  went FORWARD into the drafted request, so a renter who had just answered «Leave» on the canvas's
  confirm was met by a button offering to undo it.
  The draft is not stranded: the browser's own Back resumes it (`rfq-store`'s `popstate` →
  `RESUME_WIZARD`), a returning visit raises the draft prompt whose «Continue» resumes it, and
  «Re-analyse» on the same screen rebuilds it from the words on it. `intake.backToReview` is deleted
  in both locales.
  Files: `src/components/screens/Intake.tsx`, `src/lib/i18n/{en,ar}.ts`.
  ⚠️ `resumeWizard` is NOT dead - the store's own `popstate` handler is its other caller. Deleting it
  would take the browser Back's resume with it.
  ⚠️ «Add something to continue» keeps the row's leading edge (`me-auto`), which the removed button
  used to hold: without it the hint sat against the Continue button rather than opposite it.

- **2026-09-09 - The bid cards travel sideways again, and the PAGE carries their height.**
  Owner, correcting yesterday: *"no the bids card must be scrolled horizantally to show all of them
  but i meant we might need vertical scrolling to show the height of the card in some cases only"*.
  The 09-08 fix read «no page scrolling is shown» as «the cards must wrap» and answered the wrong
  half: it got the vertical scroll by deleting the sideways travel, so four bids became four rows of
  one card. The strip is a `flex … overflow-x-auto` rail again with each card back at
  `w-[344px] flex-none`, and what survives from 09-08 is the part he was actually pointing at - the
  workspace COLUMN is the one vertical scroller (`overflow-y-auto` on the pinned root, neither tab
  pane clipping), so a card taller than the viewport is read by scrolling the page and never by a bar
  inside the white card.
  Files: `src/components/workspace/BidCards.tsx`,
  `tests/unit/bid-cards-rail.test.ts` (renamed from `bid-cards-wrap.test.ts`, rewritten to the new
  ruling with both rulings quoted in its head).
  ⚠️ `items-stretch` is what keeps the 2026-08-30 ruling alive in a flex row: every card takes the
  height of the tallest, so the «Counter this price» buttons still line up and a shorter card's slack
  sits above its footer rather than under its button.
  ⚠️ BOTH overflow axes are stated on the strip (`overflow-x-auto overflow-y-clip`). CSS computes the
  unstated one from `visible` to `auto` the moment the other scrolls - the fourth time this repo has
  met that, after the bid rail, the compare matrix and the suppliers table.
  ⚠️ NOT re-introduced: a scroller on the tab pane. `overflow-hidden` there would cut a tall card off
  with no way to see the rest, and `overflow-y-auto` would put the bar back inside the card, which is
  what he reported on 09-08.

- **2026-09-09 - The create flow says «equipment» and «request», its equipment are TABS, the site and schedule lock on the answer, and the carry-forward modal is gone.**
  Owner, four notes: *"90.2 use request not job and use equipment not machine anywhere in the create
  request not only this modal"*, *"if there is multi itme in the request i will show each equipment
  type with size here as tabs below 16 inside the machine and operator with same style as this, with
  + at first card and it adds an equipment"*, *"20.1 and 19.1 will be locked once they are selected in
  any of an equipment"*, and *"remove the modal that say equipment 2 once u click next equipmetn ...
  remove this modal no need. make the add and the next whether from the new tabs style or exisying one
  smoother without it"*.
  (1) **The words.** «job» and «machine» swept out of everything the create flow reads - the `create`
  block and the three `gate.*` strings it shows - in BOTH locales: «The equipment & operator», «Add
  another equipment», «Anything else on this request?», «Add at least one equipment to continue», «Set
  where the equipment goes», «Name this equipment». Arabic followed: «الآلة» → «المعدّة», «لهذا العمل»
  → «لهذا الطلب». Deliberately NOT touched: `perJob` (a pricing basis), `end-of-job` (a schedule
  option), `selectJobTitle` (a person's job title), and every surface outside the create flow.
  (2) **`EquipmentTabs`** - one tab per equipment reading `type · size`, dotted green/amber by that
  equipment's OWN gaps (`itemGaps` + `transportGaps` per item, never `requiredGaps`, which answers for
  the whole draft and would mark every tab amber for one unset site), in the workspace's «Cards /
  Compare» recipe (`control-lg`, `rounded-t-md`, `-mb-px` so the active tab eats the rule under it).
  The **+ is first**, and it is withheld while THIS equipment owes an answer - the press would refuse
  and shake, and a control that is going to refuse is better absent.
  (3) **The lock moved from WHICH equipment to WHETHER answered.** `isFirstItem ? panels : strip`
  became `!locked`, where `locked = whereOk && whenOk && !unlocked` - the two panels belong to no
  single equipment, so they lock the moment both are answered. **«Change for the request»** and the
  two lines themselves reopen them (owner's choice over a hard lock): a typo in a date on a
  one-equipment request would otherwise have no way back but Back to «Your request».
  (4) **`CarryForwardModal` is deleted**, with its four strings, its `carryTo` staging and pin 23
  (retired, never renumbered). «Next equipment», the + and «Add another equipment» now append, travel
  and open the panel in one press. What the modal said is on the screen instead: the locked strip
  states the site and the schedule, and the copied details ARE the card the renter lands on.
  Files: `src/components/create/EquipmentTabs.tsx` (new), `src/components/create/Canvas.tsx`,
  `src/components/create/CarryForwardModal.tsx` (deleted), `src/lib/i18n/{en,ar}.ts`,
  `src/lib/uiPins.ts` (17.4/17.5/17.6, 16.2; 23 retired), `scripts/ui-pins-doc.mjs`,
  `tests/unit/canvas-multi-item.test.tsx` (rewritten around the modal's removal),
  `tests/unit/{canvas-gating,canvas-history,canvas-no-match,canvas-provenance,canvas-render,custom-equipment-canvas,review-reload,project-apply,machine-panel,operator-rail-unseen,palette-drift}.test.*`.
  ⚠️ **The tabs do NOT replace «Next equipment».** That control is still the way FORWARD and the one
  that refuses on this equipment's gaps; the tabs are the way BACK to one already passed. Two routes,
  one `addMachine` and one `goItem`, so they cannot diverge on what moving means.
  ⚠️ `unlocked` is per VISIT and not persisted. The lock exists so the request-wide panels are not
  edited by accident while the renter thinks he is answering one equipment; a renter who has just
  pressed «Change» is not doing that, and leaving the canvas locks them again.
  ⚠️ **`locked` needs BOTH answered, not either.** A strip stating a confirmed site beside an empty
  schedule would lock a panel that still owes an answer, and the gates would then refuse a press with
  nothing on screen to fix.
  ⚠️ `palette-drift.test.ts` died with `ENOENT` on the deleted file: it sweeps `git ls-files`, which
  reads the INDEX, so a working-tree deletion is still listed until it is staged. It skips what is not
  on disk now, and the deletion is staged either way.
  ⚠️ The full suite is green SERIALLY (3082). Run in parallel on this machine it produces 5s-timeout
  failures in unrelated files (share panel, submission viewer) that pass alone - contention, not
  breakage, and the canvas renders got heavier with the tab strip. `npx vitest run
  --no-file-parallelism` is the honest gate here.

- **2026-09-09 - The create flow: an unopened operator rail shakes, Back asks before it drops the request, and the review lands at the top.**
  Owner, three notes: *"18. if it is not open at all at least once and user try to move to next step
  the closed pannel will shake too"*, *"8. if clicked while user is on the request page and back
  taking him to the intake again then show short simple confirm modal asking do you want to leave
  this request? ... just very simple one line question"*, and *"the review and sumamry screen must
  open at top so the back is shown at top when landing"*.
  (1) **The operator rail is the one panel that could be walked past without a mark.** It collapses
  to a 72px strip, `operatorNeeded` defaults to «no», so nothing in it is required and NO GAP names
  it - a renter finishes a machine having never seen it, and the operator's food, accommodation,
  nationality and certificate are all priced off that panel by the supplier. `advance` now holds one
  pass on it, on BOTH ways out of a machine («Review & send» and «Next equipment»): the strip shakes
  (`shake-error`, the canvas's own refusal), the press does not go through, and the next press does.
  The rail's `expanded` is local and opens off the item's own answer, so it REPORTS its state
  (`onOpenState`) and the canvas remembers it per machine (`railSeen`, keyed by item id).
  (2) **Back on the canvas asks.** That press replaces the whole drafted request with the typing box,
  which is the only step of the chain worth a question: the title IS the question and there is no
  body, with «Leave» primary and «Stay» beside it. `review → canvas` and `intake → out` are untouched.
  (3) **The review screen scrolls to 0 on mount.** It replaces the canvas IN PLACE - same route, no
  navigation - so it inherited the canvas's scroll and a renter who pressed the button at the foot of
  a long canvas arrived under the fold with the Back control off screen.
  Files: `src/components/create/{OperatorRail,Canvas,CreateBack,ReadyToSend}.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`create.leaveRequest`), `src/lib/uiPins.ts` (18.4, 16.1, and 21 relabelled),
  `tests/unit/operator-rail-unseen.test.tsx` (new, 4 cases),
  `tests/unit/{create-back,ready-to-send,chat-dock}.test.*`.
  ⚠️ **An item whose agent already asked for an operator never shakes**, because the rail opens on
  mount for it and is therefore seen. That is also why every other canvas suite is untouched: the
  shared fixture (`makeItem`) sets `operatorNeeded: "yes"`.
  ⚠️ The rail's pass runs LAST in `advance`, after every gap and after the unseen where/when pass. It
  is a look, not a missing answer, and putting it in front of a real gap would answer the wrong
  question first. The shake marks it seen, so it can never become a dead end.
  ⚠️ `onRailOpenState` reads the machine's id through a REF, not a dependency: it must sit above the
  `if (!draft) return null` early return (`rules-of-hooks`) and `itemId` is derived below it. A stable
  identity also matters - the rail uses it as an effect dependency.
  ⚠️ **The BROWSER's own Back still walks canvas → intake with no question.** It moves the store's
  history chain rather than pressing this control, and intercepting it needs a history entry of its
  own; the in-app control is what the owner named. Say so rather than implying both are guarded.
  ⚠️ `chat-dock.test.ts` sliced the composer's source from the literal `<div className="bm-chat-compose">`,
  which stopped matching the moment that tag took a pin - and an empty slice made three assertions
  VACUOUS rather than failing. It matches on the class now. Any source-slicing test is one prop away
  from the same hole.

- **2026-09-08 - The bid cards wrap, and the PAGE scrolls instead of the box they sit in.**
  Owner: *"UI bug: when the browser is 100% or more the bid cards are not responsive, no page
  scrolling is shown. Make the page scrollable, not the container of the cards."* The cards were one
  flex line of fixed 344px tiles in `overflow-x-auto`, and every band above them was `flex-none` with
  the tab panel taking what was left - the 2026-08-25 ruling (*"i dont want scroll inside the cards
  even"*, bids as a row you travel sideways). At 100% zoom on a 1440 screen that hung the fourth bid
  off the edge behind a scrollbar at the foot of a container, while the page itself had no scrollbar
  at all. Now: `grid-cols-[repeat(auto-fill,minmax(min(100%,320px),344px))]` so the bids wrap at the
  card's own width (one column on a phone), and the workspace COLUMN is the scroller
  (`overflow-y-auto` on the pinned root) with both tabs rendering whole.
  Files: `src/components/workspace/BidCards.tsx`, `src/components/workspace/RequestsWorkspace.tsx`,
  `tests/unit/bid-cards-wrap.test.ts` (new; renamed `bid-cards-rail.test.ts` on 2026-09-09).
  🔴 **HALF WITHDRAWN the next day** (see the 2026-09-09 entry at the top): the missing scroll he
  reported was the VERTICAL one, and wrapping the cards took the sideways travel away to get it. The
  grid is gone; the column's `overflow-y-auto` — the part he actually asked for — stays.
  Trap: the height ruling of 2026-08-30 survives, in grid's terms - a grid row stretches its items to
  the tallest of THAT ROW, so the «Counter this price» buttons still line up across each line and a
  short card's slack still sits above its footer. The card lost `w-[344px]` and `flex-none` with it:
  a card stating its own width overflows the single column a phone gives it.
  ⚠️ This REVERSES 2026-08-25 for the cards tab. The shell keeps `fullBleed`, so the scroller is the
  viewport under the header rather than the document - the nav and the header stay put, and there is
  one bar on screen instead of two. The comparison tab lost its own `overflow-y-auto` in the same
  move and keeps only its sideways strip.
  ⚠️ Verified by typecheck, lint and the unit suite (3061 passing) plus a source guard. NOT yet seen
  rendered: `/requests` needs a signed-in renter with bids, which is a deployed build.

- **2026-09-08 - The yard card is the same object in the list and in the detail, and the layer behind it is one.**
  Owner, over five screenshots: *"show it red yard and distance similar to how it appears in the fleets
  cards so no need to avaialbility not confirmed and no need for avaialibity differentiation just the
  red card of the distance and yard with maybe small badge on the card saying not confirmed"*, then
  *"remove these 2, one is already in the fleet to add another one and for availibity let it like the
  fleet card as ? on the yard card that we will add also clicking it whether from the detaisl or from
  the feet will open this"*, then on the modal *"remove the model year box at top just keep the red to
  green and below it one sentance clear ... remove not now from the modal, make the ask button orange
  as our design system ... make the card wider to fit the red and green in one line"*.
  (1) **The detail said one fact three times.** A 20px distance, a tinted «Availability not confirmed
  yet» chip on the far corner, and a titled paragraph under it explaining that red is not a refusal -
  on the surface the renter reaches BY pressing the red card. It now draws `EquipmentList`'s own
  `.bm-eq-yard`: distance, yard, a small «Not confirmed» badge, the `?` / clock / tick, and the press.
  The rules are SHARED in `map-proto.css` (`.bidmap .mp .bm-eq-yard, .bidmap .bm-eq .bm-eq-yard`), not
  copied - one state may not have two looks. `.mp-line`, `.mp-km`, `.mp-band`, `.mp-chip` and the
  `.mp-sect` family are gone with the markup.
  (2) **The layer moved UP to the workspace.** The detail is a takeover (`.bm-takeover` replaces the
  column, list included), so a modal owned by `EquipmentList` could not be opened from the detail at
  all. `YardExplainDialog` is its own component now, `BidMapWorkspace` owns `yardExplain` and the
  explain-once rule, and both mounts call the same `onYardPress`.
  (3) **The detail's 76px footer is deleted.** «Ask him to confirm availability» is the yard card, and
  «Ask for different equipment» is the fleet list's dashed control one press behind the panel.
  (4) The modal: the machine box went (the press it came from named that machine), the specimens are
  `nowrap` in a 520px card, three lines became two (the fact and the act, then what his answer does to
  the colour), «Not now» went (the head has an X) and the CTA is `var(--brand)`.
  (5) **Back lands on the request, not on the list of them.** `/bids/[bidId]/equipment` fell through to
  a bare `/requests` for every entry that is not the workspace itself; the fallback is
  `/requests?r=<requestId>` now, held by the PAGE (one `usePageBack` registration, the `create-back`
  trap) and fed by the bid's own request.
  (6) Thinner, and unbolded where the owner named it: `PAGE_BACK` (`mb-2`/`gap-3`, `pt-2` full-bleed),
  the documents footer (76 -> 56px, weight 600), the price footer (min-height 76 -> 58px, «Show
  details» 700 -> 500, both acts 800 -> 600, the rate 24 -> 21px).
  (7) The request card is HORIZONTAL: the identity strip is the leading column (`border-inline-end`,
  wrapping back to a stack under a 430px CONTAINER query, not a viewport one), the firm wears its
  initials on `var(--ok)` like every other counterparty mark, `ctx.companyName` prints the real name
  instead of «The company», «Not sent yet - review it, then send» is deleted, and nothing but the
  title is bold. Hosts widened 376 -> 520px in the dock and the deal room.
  Files: `src/components/map/YardExplainDialog.tsx` (new), `src/components/map/EquipmentList.tsx`,
  `src/components/map/BidMapWorkspace.tsx`, `src/components/map/panel/EquipmentDetail.tsx`,
  `src/components/map/panel/panel-proto.css`, `src/components/map/map-proto.css`,
  `src/components/map/{RequestCard.tsx,request-card.css,ChatDock.tsx}`,
  `src/components/deal-room/deal-room-proto.css`, `src/lib/contract/request-card.ts`,
  `src/lib/ds.ts`, `src/components/AppShell.tsx`, `src/app/bids/[bidId]/equipment/page.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/{yard-card,request-card-render}.test.tsx` (new, 8 cases),
  `tests/unit/{rentee-map-surface,availability-chip,request-card,page-back}.test.*`.
  🔴 **RM3-AC-33 is HALF withdrawn, deliberately.** The ask's CTA is no longer blue (`--action`); it is
  the brand orange. The half that survives is the half the AC protects - it is not navy, so beside a
  red explanation it cannot read as switched off - and `rentee-map-surface.test.ts` now pins the orange
  and still forbids every navy token.
  ⚠️ The shared yard rules name `.bm-eq` LAST in each selector list on purpose:
  `rentee-map-surface.test.ts` reads those blocks by `indexOf(".bidmap .bm-eq .bm-eq-yard… {")`, so the
  anchor has to be the line the brace sits on.
  ⚠️ `RequestCardTone` lost `"draft"` and `.bm-rq-state.is-draft` went with it. A draft's status is
  ABSENT now, not a sixth tone; the rule it protected (an unsent ask must never say the supplier owes
  an answer) is still pinned, against `status === null`.
  ⚠️ `distanceBandLabel` has **no caller** and is kept with a note at its head: it is the only
  definition of «قريب / متوسط / بعيد» and its thresholds are the prototype's. Delete it with its four
  tests if the band never returns.
  ⚠️ **The equipment images on the map are still white where the taxonomy asset is a `.jpg`** (13 of
  the seeded 44, e.g. `vacuum-robot.jpg`). Measured: the `.png` assets carry real alpha, the `.jpg`
  ones cannot, and CSS cannot key it out - Leaflet's `translate3d` isolates the marker, so a blend mode
  never reaches the tiles. The owner set this aside for now; the fix is either transparent PNGs in
  `moedatech-eu-storage/default/equipment-taxonomy` (which fixes the app too) or proxying the image
  through our own origin and keying it on a canvas (S3 CORS does not allow the beta origin, which is
  why a plain client fetch is not enough).

- **2026-09-08 - «Counter» always opens the 3-styles sheet, and a chat tab is per ITEM, with its size.**
  Two owner reports on the deal room. (1) *"This view must be retired ... the counter offer must
  always show the 3 styles sheet, and if the deal room is cancelled show that note in the sheet's
  header"*: `flowGate.counter` was `live`, so `?act=counter` on a CANCELLED, CLOSED or AWAITING room
  fell through and dropped the renter on the retired room view - masthead, price hero, two lines
  saying it was cancelled - which is the screen retired on 2026-09-07, reached through the one link
  that is meant to open the sheet. Counter now opens the sheet at every status; a settled room draws
  a `qp-hnote` under the room's line in the sheet header (cancelled · agreed and closed · awaiting the
  supplier), and sends nothing: `editable` is false, `canSubmit` is false, the accept shortcut is
  withheld and the final button reads «Closed». (2) *"how are 2 equipments shown in the chat while the
  request is one item"*: `dockTabs` pushed a tab per BID, so a supplier holding two bids on the same
  item - a re-bid, or two colleagues of one firm, which this dock already treats as ONE counterparty -
  drew two identical «Crawler Excavator» tabs for one conversation. A tab is keyed on the ITEM (the
  fanned-out request id) now, the anchor's bid keeps the slot, and the unread counts add up.
  Files: `src/components/deal-room/DealRoom.tsx`, `src/components/deal-room/deal-room-proto.css`,
  `src/lib/contract/chat-dock.ts`, `tests/unit/chat-dock.test.ts`.
  Also: a tab is named «subtype · size» (`equipment.subtype` / `equipment.size`), because the case the
  strip exists for is two lines of ONE subtype, and the subtype alone cannot tell them apart.
  Trap: the dock's own fixtures gave every sibling `request.id: "r1"` and differed only by
  `equipmentType.name` - a shape the fan-out never produces (one item IS one request). They carry
  distinct request ids now, and a new case pins the reported bug: two bids, one request, one tab.

- **2026-09-08 - My Suppliers: one picking mode for two jobs, and «vendor» stops being ticked for him.**
  Four owner notes on one screen.
  (1) **Stored phones are normalised on the way OUT, not only on the way in** (*"some numbers in
  Excel still show weird values, not normalized"*). The import preview normalises what it POSTS,
  which fixed everything sent after it and nothing already stored: `phone` on an `own` row is what
  the renter typed, so `0503372850`, `966503372850` and `+966 50-337-2850` all printed verbatim in a
  column he scans down. The cell now runs `phoneE164` - the same parser the preview uses - and falls
  back to the raw text when it cannot read it, because an unparseable phone is still the only thing
  he has.
  (2) **«Share a request» is gone from this screen**, and «Remove» takes its place. Removing rows is
  the same act as grouping them, so it enters the SAME picking mode: `picking: boolean` became
  `pickFor: "group" | "remove" | null`. While picking, a press ANYWHERE on the row selects it (a
  14px checkbox in a 44px row was six small aims for six suppliers, and the row's own click opened
  the profile over the list he was picking from). The dark bar moved from ABOVE the table to
  `sticky bottom-0` under it, at `text-body font-extrabold`, and the header tick now says «All»
  beside it.
  (3, 4) **The vendor flag starts OFF everywhere** - typed, imported and picked off Moedatech
  (*"any add supplier, whether by hand or Excel, doesn't default to vendor registered, but he will
  mark it"*). It is a claim about a procurement relationship, and adding a contact is not the moment
  it becomes true; ticked for him it ended up on everybody and stopped meaning anything. The two
  hints were reworded to name the press that ⚠️S rather than the press that undoes it.
  Also in (4): the directory's **Prev / Next pager became «Show all»**. Seventy-five pages is a
  filing cabinet, not a picker, and the ordering meant nothing across a boundary he had to click
  through. One request with `limit = total`, sorted by the same rule.
  Files: `src/components/suppliers/{SuppliersPage,AddSuppliersDialog,SupplierImportPanel,AddFromMoedatechDialog}.tsx`,
  `src/lib/api/client.ts`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/suppliers-remove-and-pick.test.tsx` (new, 10 cases),
  `tests/unit/add-from-moedatech.test.tsx`.
  🔴 **BACKEND, still owed: the equipment count.** *"Show the verified ones on Moedatech with the
  highest number of equipment"* cannot be answered here and was already raised on 2026-09-03
  (`docs/supplier-directory-ranking.md`). `/agents/suppliers` answers
  `{ id, name, company_name, city, is_verified, has_store }` and nothing about equipment, so there
  is nothing to sort on. `DirectorySupplier.equipmentCount` is READ and sorted on now (verified →
  equipment count → store), so the ordering starts working the day the field arrives with no second
  web change. Until then that clause compares 0 with 0.
  ⚠️ `removeRenterSupplier` is called through `Promise.allSettled`, not `Promise.all`: the latter
  rejects on the first failure and throws away what the others answered, so a batch where one row
  404s would say «that did not save» about nine removals that did.
  ⚠️ The removal takes a confirmation naming every row. A delete has no undo, and what it removes
  is the renter's LINK - their account, their store and the bids they already sent stay.
  ⚠️ Dead keys swept with the controls they belonged to: `shareARequest`, `sharedOne`,
  `sharedMany`, `dirPage`, `prev`, `next`. `ShareRequestModal` itself is untouched and still mounted
  by every request surface.

- **2026-09-08 - The catalogue note takes the hint's place, and «chosen for you» is ORANGE.**
  Owner: *"«This name is what your supplier will see on the bid form» — remove this and put the note
  in its place"*, and *"for the auto selected color use like this token — it lives in prod"* with a
  screenshot of production's Timing & Hours: an ORANGE label and one thin ORANGE line round the box.
  (1) The off-catalogue field carried three pieces of text: a hint about what a supplier sees, the
  «not available yet» note pinned to the LABEL (its placement earlier the same day), and a second
  copy of that note under the field for phones. The hint is gone - the string with it - and the note
  is the field's single hint line at every width. The label is the field's name again.
  (2) The provenance mark was `bg-warn/[0.07] ring-1 ring-warn/45 ring-offset-2`. Two things were
  wrong against production: `--warn` in this palette is a MUSTARD (#b98a1d), not an orange; and the
  offset ring floated two pixels off the control with a tint behind it where prod draws one line on
  the edge. It is `ring-1 ring-brand` now, and the field's LABEL turns `brand-deep` too, which is
  the half we never had.
  Files: `src/components/create/Provenance.tsx`, `src/components/create/MachineCard.tsx`,
  `src/components/create/CertSelect.tsx`, `src/components/Dropdown.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/{canvas-provenance,custom-equipment-canvas,cert-year-pills}.test.tsx`.
  ⚠️ The mark is canvas-WIDE: every prefilled field on the create flow moves with it, which is the
  point - one mark, one colour, the same as the product he compares it against.
  ⚠️ The LABEL takes `brand-deep` (#c2570f) and never `brand`: orange text on a light ground has to
  be the dark one to pass AA, and the brand orange is a FILL. The ring is a border, so it keeps
  `brand`.
  ⚠️ `custom-equipment-canvas.test.tsx` pinned the note's placement TWICE in one day (a block, then
  the label, now the hint). It asserts DOM ORDER and a single copy; if the note moves again, that
  test is the one that says so.

- **2026-09-08 - An unfinished Outlook consent no longer hangs the send in silence.**
  Owner: *"what if the user clicks Outlook and send and didn't complete his connection with Outlook?
  It is showing like nothing happened, even the modal of confirming the post on Moedatech didn't
  appear"*. Two independent silences, and the request is already POSTED before either of them, so
  the one screen that could have told him said nothing at all.
  (1) **The consent poll watched one thing, `window.closed`.** A renter who leaves the account
  chooser open and comes back to this tab never closes it, so `startConnect`'s promise never
  settled: `await startConnect(...)` inside `send` never returned, nothing after it ran (no mail, no
  compose window, no tick), and the button sat on «Posting…». It settles three ways now: the window
  closes (the status decides, as before), the STATUS says connected (the callback landed, so the
  consent is done whether or not the little window has closed itself, and we close it), or a 120 s
  deadline passes (answer «not connected», which sends him down the compose path with everything on
  screen intact). `mailConnectUrl` is also `.catch`ed, since a throw there rejected the whole send.
  (2) **A blocked compose window reports success.** `openEmailCompose` opens with `noopener`, and a
  window opened that way returns NO handle - so a pop-up the browser silently refused is
  indistinguishable from one that opened, and the panel reports `handedOff: true` either way.
  `ShareOnPost` then waited for a `focus` / `visibilitychange` that could never come. There is a
  2.5 s floor under the wait now: it calls the SAME `tell`, which still refuses while this tab is
  hidden, so it fires only when nothing actually took the screen.
  Files: `src/components/share/ShareRequestPanel.tsx` (`startConnect`, `CONNECT_WAIT_MS`),
  `src/components/create/ShareOnPost.tsx` (`TELL_ANYWAY_MS`),
  `tests/unit/{share-request-panel,posted-confirmation}.test.tsx` (5 cases).
  🔴 **The window is NOT closed on the deadline.** He may still be typing a password into it, and
  shutting it under him is worse than the wait. It closes itself when consent lands
  (`/mail-connected`); until then it is his.
  ⚠️ The deadline sets NO note. «Denied» would be a claim about a decision he has not made, with
  the window still open in front of him.
  ⚠️ The floor is not a race with the compose tab: a window that really opened takes focus long
  before 2.5 s, and `tell` refuses while this tab is hidden. Verified the deadline test is real by
  raising `CONNECT_WAIT_MS` and watching it fail with the original hang.

- **2026-09-08 - One dialog after a post, and a moved pin gets a project of its own.**
  Owner: *"if he changed the location more than 100 m then a new project, if he kept it it will be
  filed under the existing one, and always a modal is shown"*, then *"but we have now 2 competing
  modals, one for the post request success and one for the project, i dont know how to show the 2
  modals without distracting or overwhelming him"*, then *"reduce the text, remove the «sent to» etc,
  just keep the title"*.
  Two faults and one design answer.
  (1) **The gate read the wrong thing.** `CreateSurface` drew `ProjectFiled` on
  `!state.draft.projectId`, and the draft KEEPS the site's id after the renter moves the pin off it -
  `filingFor` is what drops it AT THE WIRE, on `leftTheSite`. So a renter who started at one site and
  moved the pin 400 km posted a request belonging to nothing, and nothing mounted to say so or to
  give him the project at the new place. The gate now asks the same helper the submit asks
  (`filingFor(state.project, state.draft).projectId`), so the dialog appears exactly when the request
  left unfiled, whatever the reason.
  (2) **Two dialogs for one press.** `ProjectFiled` is HEADLESS now: it does the write on mount,
  hands the site up through `onFiled`, and renders null. `ShareOnPost` draws it as a two-line block
  inside the post tick, with «View the project» as the secondary button above «Keep sharing».
  (3) **The tick lost three lines.** «It is live on Moedatech now, and shared with 1 supplier»,
  «Sent from ... to N suppliers» and «A copy is in your Sent folder» all went: the title states both
  facts, and the rest was the same news in smaller type. `postedLive*` survives for a channel we did
  not send through, where nothing else says anything.
  Files: `src/components/CreateSurface.tsx`, `src/components/create/ProjectFiled.tsx`,
  `src/components/create/ShareOnPost.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/{posted-confirmation,project-filed-hold,project-filed-placement}.test.*`.
  🔴 **`ProjectFiled` must stay mounted OUTSIDE the tick.** The filing happens on mount and the tick
  opens a moment later, when the share has been handed off, so moving the write inside the dialog
  would mean a renter who closes the tab in between ends up with a request filed under nothing -
  which is the silent bug that component exists to fix. That is why it renders null rather than
  simply moving. `hold` / `onAnnouncing` / `minted` / `toldHim` are gone with the queue they served.
  ⚠️ **The block can arrive AFTER the tick is open.** Filing is two round trips. That is the trade
  for one dialog instead of two, and it is the right way round: the tick answers the button he
  pressed, the project is the consequence.
  ⚠️ **The pen went with the dialog.** Editing the site's name, dates and terms is the ordinary
  project form on the project's own page, one press away through «View the project». A form opened
  over the top of the tick would be a dialog over a dialog.
  ⚠️ `wherePanel.unfiledNote` was reworded. ~~"...so this request will not be part of it. Move the
  pin back to file it there."~~ read as «otherwise it is filed under nothing», which stopped being
  true: it now says the request gets a project of its own.

- **2026-09-08 - A request with no catalogue match stops naming a marketplace that cannot see it.**
  Owner: *"for requests that have undefined taxonomy (custom equipment type) we will remove
  Moedatech from the confirmation, we will remove it from the icons list in the share, we will
  remove it from the confirmation question and will tell the opposite, since we will not have it
  available and no supplier, and any other surface that says it is sent to Moedatech will also be
  removed in this case"*. Such a request has reached NO supplier by broadcast since the feature
  shipped (2026-09-06) - the share link is the only supplier-facing route - and three surfaces said
  otherwise: the locked green Moedatech chip in the channel row, the «Post to Moedatech» button, and
  the confirm dialog's «Your request goes live on Moedatech, where every supplier there can bid on
  it». The tick after the post said it twice more.
  `BidCardModel.offCatalogue` is the one answer, derived where the card already is, so it reads the
  same before and after the post: `draftBidForm` sets `isUndefined` from `isCustomLine`, the
  bid-form mapper reads the backend's own derived flag, and `bidCardModel` folds them into a
  whole-request boolean. Every surface branches on that and prints `offCatalogueLine` instead.
  Files: `src/lib/contract/link-bids.ts`, `src/lib/draftBidForm.ts`, `src/lib/bidCardModel.ts`,
  `src/components/share/ShareRequestPanel.tsx`, `src/components/create/ShareOnPost.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/{bid-card-model,share-request-panel}.test.*`.
  🔴 **EVERY machine, not one of them.** A request with one catalogue line and one custom line
  still goes to every supplier who stocks the first, so muting the marketplace there would be a lie
  in the other direction. Two tests pin the mixed case.
  ⚠️ In `share` mode with no channel picked, an off-catalogue request's Send button is now
  DISABLED and says «Pick a way to share». The press genuinely had nothing left to do: the request
  exists, no channel is chosen, and the marketplace reaches nobody. In `post` mode it stays live and
  says «Post the request», because that press still creates the request and mints the link.
  ⚠️ The flag is false until the card loads (`share` mode fetches it), so the chip can appear for
  one frame on a request that then mutes it. Judged acceptable against plumbing the raw form through
  a second path; if it shows in use, pass `draftForm`'s answer down instead of waiting.

- **2026-09-08 - The posted tick says the send in its TITLE, and the filed dialog drops what nobody set.**
  Owner, on the tick: *"the title is «your request is posted into Moedatech and shared from
  yara@outlook.co», then below it «sent from ... to 1 supplier, a copy is in your sent folder in
  Outlook», then below «you can still...»"*. It was four lines for two facts: a title that said only
  the post, a line that said the post AGAIN with the supplier count, the send third, and the Sent
  folder fourth - so the address a server send actually left from, which is the one thing that
  channel cannot prove any other way, was buried third. Now the title carries it, the send line
  carries the count with the Sent-folder copy as a CLAUSE, and `postedLive*` is drawn only when
  there was no server send at all.
  And on the project dialog: *"show project title then site, then any values not set don't show it,
  and «view the project» must be on the right not left, and remove this «close», we already have
  an X"*. «Dates —» and «Payment terms —» took two of six rows to say nothing.
  Files: `src/components/create/ShareOnPost.tsx`, `src/components/create/ProjectFiled.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/{posted-confirmation,project-filed-hold}.test.tsx`.
  ⚠️ The title lost its `capitalize` class. It now contains an e-mail address, and that class
  title-cases every word of one.
  ⚠️ «Extendable: No» is KEPT while «Dates —» goes. One is an answer, the other is a blank; a rule
  that dropped falsey values would tell a renter the project holds nothing on a point where it holds
  a decision.
  ⚠️ `NotNow` is deleted from `ProjectFiled`, not left unused. It had one caller.

- **2026-09-07 - The confirmation stands in front of the POST, not only the e-mail.**
  Owner: *"i want the send confirmation of Outlook to be with the post on Moedatech not only the
  send, so it will not automatically send to Moedatech... also we have a case where he confirmed then
  came back to share with another one on Outlook, then also we will have another confirm just for the
  send not the post since it is already posted"*. `send()` minted the request FIRST and the dialog
  asked only about the mail, so a renter who pressed Send to read what it said had already published
  his request, and Cancel could call off only the half that had not happened. `send(override?,
  confirmed = false)` now returns early on e-mail until the confirm press, which does both in one
  gesture - and being one gesture is what keeps `window.open` inside a live user activation.
  The dialog says one of two things: «Post this request and e-mail it?» with «Post and send», or
  «E-mail this request?» with «Send» and «It is already live on Moedatech» when the request exists.
  In the same pass, `Copy message` became `Copy subject` and `Copy body`, each drawn on the field it
  fills (owner: *"one on the title as copy title and one on the body as copy body"*).
  Files: `src/components/share/ShareRequestPanel.tsx`, `src/components/share/mail-chrome.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/share-request-panel.test.tsx`.
  🔴 **The server dry run is GONE.** It drew the envelope the backend said it would send, and it
  needed a request that EXISTS - which stopped being true the moment the confirmation moved in front
  of the post. The envelope is drawn from the ticks and the connected mailbox instead. The cost,
  stated: a supplier row whose address resolves from its linked Moedatech account is shown by NAME
  rather than by that address. He is confirming WHO, and the who is right.
  ⚠️ `Cancel` no longer announces anything. It used to have to raise the «your request is posted»
  pop-up, because the request was live whatever he chose. Nothing happens before the confirm now, so
  Cancel is a cancel.
  ⚠️ The «a copy is in your Sent folder» line left the envelope card with the dry run. That promise
  is still made, by the status line after the send, which knows what actually happened.
  ⚠️ The SUBJECT copy is not locked before the post and the BODY is. The body ends with a link that
  does not exist yet; the subject names the machine and is true either way.

- **2026-09-08 - The certificate and the year pills have three states, and the middle one now shows.**
  Owner: *"if not set at all then show them orange with pick certificate and pick min year in warning
  orange and not captilized, then if any value is selected by user or by the agent fine will be
  filled and not will be shaked when user try to move, and in case the cert or year is selected by
  agent will show another orange borders around the box to indicate it is preselected same indicator
  uses in other field requests"*.
  (1) **Unanswered**: the words were «CERTIFICATE» / «MINIMUM YEAR» - shouted, and a NOUN, which
  reads as a label for a value that is already there on a control whose point is that nothing is.
  They are «Pick certificate» / «Pick min year», sentence case, with the field's own noun kept as the
  `aria-label` (`certName` / `minYearName`) so a screen reader still hears a label.
  (2) **Answered, by either hand**: nothing to do - `itemWebGaps` has always accepted a value the
  agent extracted (`item.equipmentYear != null || isTouched(…)`), so an agent-filled pill never
  shook. Now pinned by a test rather than only by a comment.
  (3) **Answered FOR him**: `CertSelect` and `Dropdown` take `preselected`, which draws the canvas's
  own provenance ring - the same `ring-warn` mark `CanvasField` puts on every other prefilled field -
  so he can see at a glance which answers are his.
  (4) **The tone**: the unanswered skin was `bg-brand-press` (#bd5711), the PRESSED shade, nearly a
  brown, and it read as a filled answer. It is `bg-brand` now, the palette's orange and the closest
  thing in it to what production serves.
  Files: `src/components/create/CertSelect.tsx`, `src/components/Dropdown.tsx`,
  `src/components/create/MachineCard.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/cert-year-pills.test.tsx` (new), `tests/unit/{machine-card,canvas-provenance}.test.tsx`.
  ⚠️ **The exact production orange is a PALETTE change, not a component one.** Production serves
  `--brand:#f79009` / `--warn:#d4780a`; this palette (the Supplier OS tokens, 2026-09-04) serves
  `--brand:#f97316` / `--warn:#b98a1d`. They are one hue step apart and `bg-brand` is as close as a
  component may get without naming its own colour, which `palette-drift.test.ts` forbids. Changing
  `--brand` itself would move every button in the product; it needs `globals.css`, `ds-colors.ts` and
  `docs/design-tokens.md` together, and a decision that the OS palette is no longer the source.
  ⚠️ The ring's `ring-offset` is TRANSPARENT here, not `surface2` as in `CanvasField`: these two
  pills sit over the machine photo, and an opaque offset would draw a grey gap around them.
  ⚠️ Both tests that address these pills read them by their accessible NAME, which is deliberately
  the field's noun and not the visible text - so the copy can change again without touching them.

- **2026-09-08 - A project row draws the machine's name even when the catalogue has none.**
  Owner: *"some requests items doesnt shown in the project if they were undefined so let it read
  from equipemtn taxonamy of request or the new solumn custom type as free text"*. The backend's
  chart projection labels a REQUEST's item from its taxonomy pair alone
  (`getChart.ts:156`, `label(subtypeId, capacityId)`), and an off-catalogue line has NEITHER id - so
  `label` arrives `null`, the row drew an empty name, and the request's code was the only thing on
  it. The SAME handler already falls back to `rawLabel`/`rawSize` for a work order's machines
  (`getChart.ts:202`); only the request branch never did, and it does not even select the free-text
  column.
  Web half, done here: `fetchChart` now MAPS its groups instead of passing them through, filling a
  missing name from `customEquipmentName` / `custom_equipment_name` / `rawLabel + rawSize`, and
  `ChartRow` says «Equipment (not named)» rather than drawing a blank.
  Files: `src/lib/api/client.ts` (`chartItemName`), `src/components/projects/ChartRow.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/chart-item-name.test.ts`.
  ⚠️ **Backend still owes the real fix**: `getChart.ts` must select `customEquipmentName` on
  `equipmentItems` and label it `taxonomy → customEquipmentName → null`, the way the work-order
  branch already reads. Until then the web has nothing to show for those rows and prints the
  placeholder - the mapping here is what makes the fix land with no second web change.
  ⚠️ **The two halves of the chart disagree in Arabic, by design in the projection** (found by the
  backend author, 2026-09-08): the request branch falls back to the typed name in both languages,
  the work-order branch fills `labelAr` from the catalogue only — so an off-catalogue work order
  arrives named in `label` with `null` beside it. `chartItemName` returns `labelAr ?? label` so no
  consumer has to remember; `FileRequestDialog` had already written that fallback by hand.
  ⚠️ There is NO `isUndefined` column - RequestEquipmentItem holds three NOT NULL taxonomy strings
  and the `''` sentinel, read through `isUndefinedEquipment`. The web still reads a DERIVED
  `isUndefined` flag on other projections (`contract/inbox.ts`), which is a different thing and must
  keep working; the chart payload simply does not carry one, and does not need one.
  ⚠️ `labelAr` falls back to the SAME free text. The renter typed his machine in one language and
  there is no translation of it to prefer; printing English in an Arabic row is better than printing
  nothing.
  ⚠️ `fetchChart` used to pass `raw.groups` straight through, which is why nothing could be fixed
  in the web before. Anything added to a chart item now goes through `chartItemName`'s spread - keep
  it a pure rename of fields, never a filter, or a field the backend adds will vanish here.

- **2026-09-08 - Auto-filing asks whether it is the same PLACE, not the same first line of an address.**
  Owner: *"for project auto creation why some requests created and some not? while in different
  locations"*. `ProjectFiled` matched an existing site with `shortSite(label)` string equality, and
  `shortSite` is *the text before the first comma with 4+ digit runs stripped* - so a map pin that
  reverse-geocodes to «Riyadh, Saudi Arabia» matched every other request in Riyadh. The second one
  was filed under the FIRST project and no new project appeared: different locations, no project,
  which is exactly the report. It now asks `leftTheSite` - this app's own comparator, written for the
  draft's «you have moved off the site» warning: COORDINATES first with ~110 m of tolerance, the
  full normalised label only when one side has none.
  Files: `src/components/create/ProjectFiled.tsx`, `tests/unit/project-filed-hold.test.tsx`.
  ⚠️ Expect MORE projects than before. That is the fix, not a side effect - and existing projects
  that already swallowed two sites stay as they are; nothing splits retroactively.
  ⚠️ The OTHER reasons a request ends up unfiled are unchanged and all silent by design: the draft
  already carried a `projectId`; the location has no LABEL at all (the effect returns before any
  read, so no project and no dialog); or the write failed, which says nothing because the request is
  already posted and safe. The label case is pinned in the test, since it looks identical to this bug
  from outside.
  ⚠️ One notion of «same place» per feature. A coarse rule here and a careful one in the draft
  warning is how a renter gets told he moved off a site the filing thinks he never left.

- **2026-09-08 - The post (with its e-mail) is announced first; the project modal follows it.**
  Owner: *"i want the same post to moedatech modal to show the email too so they are together, then
  the project modal after them"*. `ShareOnPost`'s tick and `ProjectFiled`'s dialog both mount on the
  same phase flip (`CreateSurface`), so they RACED for the screen and the renter met whichever won -
  usually the project one, in front of the tick that answers the button he pressed. There is a queue
  now: `ShareOnPost` reports `onAnnouncing(owed)`, true from the moment ITS post mints a request
  until the tick has been read, and `CreateSurface` passes that to `ProjectFiled` as `hold`.
  The e-mail line inside the same tick landed earlier the same day (see the entry below).
  Files: `src/components/create/ShareOnPost.tsx`, `src/components/create/ProjectFiled.tsx`,
  `src/components/CreateSurface.tsx`, `tests/unit/posted-confirmation.test.tsx`,
  `tests/unit/project-filed-hold.test.tsx`.
  ⚠️ **`hold` holds the DIALOG and never the write.** The filing happens on mount, and queueing it
  too would mean a renter who closes the tab before reading the tick ends up with a request filed
  under nothing - which is the silent bug `ProjectFiled` exists to fix. The test asserts the assign
  call happens while held, and that lifting the hold does not file a second time.
  ⚠️ The claim starts at the POST, not at the tick: the send lands a tick later, and a project
  dialog opening in that gap would stand in front of a tick that had not appeared yet.
  ⚠️ It cannot deadlock: the only early return after the post is «nothing was posted» (so nothing
  was claimed), and `shareRequestEmail` never throws - it answers a refusal, so `onShared` always
  runs. Both ways out of the tick (its button and the dialog's own close) release the queue.

- **2026-09-08 - A send the SERVER performed is announced at once, and it says the mail went.**
  Owner: *"when i sent a request through outlook and moedatech it must show sent successfully with
  the post request confirmation in the same modal and immediately after post and send the outlook
  email"*. It did not, and the cause was a rule that was right for the wrong reason: `ShareOnPost`
  held its «Your request is posted» dialog until this tab was visible again (owner, 2026-09-03,
  because a compose tab steals focus and the tick was being buried behind it). A CONNECTED Outlook
  opens NOTHING - the message leaves the server through Graph and the renter never leaves the page -
  so `visibilitychange` / `focus` could not arrive and the press that did the most looked like the
  press that did nothing.
  `onShared` now carries the outcome: `handedOff` (did a tab, a pop-up or the device sheet take
  over?) and, for a server send, `mail` (`from`, `recipients`, `inSentFolder`). Nothing handed off
  ⇒ announce immediately; and the dialog draws the e-mail line - «Sent from … to N suppliers» plus
  the copy in his Sent folder - because that channel has no window of its own to prove it happened.
  Files: `src/components/share/ShareRequestPanel.tsx`, `src/components/create/ShareOnPost.tsx`,
  `tests/unit/posted-confirmation.test.tsx`, `tests/unit/share-request-panel.test.tsx`.
  ⚠️ `handedOff` is set where a WINDOW is actually opened: the Gmail compose, the Outlook fallback
  compose, WhatsApp, and a successful `navigator.share`. A consent pop-up does not count - it closes
  itself and focus returns here, which the announcement would then read as «he came back».
  ⚠️ The waiting rule STAYS for every channel that does open something. It was not a mistake; it
  was a rule applied to a case it never anticipated. Do not "simplify" it away.

- **2026-09-08 - A bid offering a BIGGER machine can be asked for, and «no bids» says when it is hiding one.**
  Owner: *"some bids of larger size of the request doesn't appear in the bids view of a request in the
  web, it is by default filtered out in the app but we must have a filter to show larger sizes"*. The
  backend has hidden them since 2026-08-31: `GET /marketplace/requests/{id}/bids` answers `exact`
  unless the call says `sizeMatch=exact_or_larger`, and it reports what it held back in
  `sizeCounts.larger` for exactly this reason - dispatch still notifies the renter about such a bid,
  so without the count he opens the item and reads that nothing arrived. The web sent no flag and
  dropped the counts, so the number had nowhere to be said. Now: the route passes the flag through
  and returns `bidSizeCounts(raw)`; `fetchBids(id, showLarger)` is the widened request (a REFETCH,
  never a filter over what is on screen); `BidSizeFilter` is the `tune` button beside the export,
  carrying the app's own toggle plus the held count; and the empty cards tab names the held bid with
  the one control that reaches it. The export itself dropped from `control-lg` to `control-md`, at
  the owner's word, so the tabs are the only 44px thing on that row.
  Files: `src/app/api/me/requests/[id]/bids/route.ts`, `src/lib/contract/bids.ts`,
  `src/lib/api/client.ts`, `src/components/workspace/BidSizeFilter.tsx` (new),
  `src/components/workspace/{RequestsWorkspace,BidCards}.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `src/lib/uiPins.ts`, `tests/unit/bid-size-larger.test.tsx` (new, 10 cases).
  Trap: `sizeCounts` is counted BEFORE the filter runs and on both sides of it, so `larger` is the
  same number whether or not those bids are showing. Deriving it from the returned bids instead would
  print «0 hidden» in the only state where the sentence matters.
  Trap: the empty state says nothing once `showLarger` is on. Then the item really is empty, and a
  note about larger bids would send the renter to press a control already pressed.
  ⚠️ The MOBILE app was changed in the same pass (`Moedatech-App`, not this repo): its per-request
  bid list had no size control at all - the toggle existed only on the My Offers filter sheet, over a
  different bloc - so `BidListBloc` gained `sizeMatch` / `sizeCountLarger`, the list's own filter
  sheet gained the switch, and `AppEmptyState` there carries the same count and action.
  ⚠️ NOT covered: the dashboard's bid rail (`HomeRequests`) and the deal room read `fetchBids` with
  no flag, so both still show the exact-size list. That is today's behaviour, unchanged. The COMPARE
  tab's own «no bids» state is also untouched - the filter button sits on the row above it either
  way, dotted when bids are being held.

- **2026-09-08 - One add rule for both doors, and a short row says so before the press.**
  Owner: *"why doesn't it import a missing company or email or phone while adding them manually
  allows it, no sense"*. He was right and the inconsistency was MINE, introduced the same day: the
  import began asking whether a phone can actually be READ, while the typed form went on accepting
  any non-empty string - so `9.66503E+11` or «call the office» was a contact when typed and not one
  when imported. Both doors post to the same endpoint, which normalises the phone and refuses a row
  with no reachable key, so the looser side was never more permissive: it moved the refusal to AFTER
  the press. `contactable(row, phoneOk)` now lives in `sheet-paste.ts` and both dialogs call it, with
  the real normaliser injected.
  And the typed form no longer drops a short row in silence: the reason sits under the row, in the
  import's own words (no company / no contact / the phone was shortened by Excel / the phone couldn't
  be read), and an untouched empty row says nothing because it is the next line, not a mistake. The
  typed phone is posted in E.164 too, so one supplier typed in two places produces one key.
  Files: `src/lib/contract/sheet-paste.ts`, `src/components/suppliers/AddSuppliersDialog.tsx`,
  `src/components/suppliers/SupplierImportPanel.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/add-suppliers-rule.test.tsx`, `tests/unit/sheet-paste.test.ts`.
  ⚠️ `importable` is GONE rather than deprecated: two spellings of the add rule is exactly how the
  two doors came to disagree. `contactable` takes the phone test as a parameter so `sheet-paste.ts`
  keeps its promise of depending on nothing.
  ⚠️ The rule cannot be loosened to «import it anyway». `bulkRenterSuppliers.ts` rejects
  `MISSING_CONTACT` after normalising, and `createRenterSupplier.ts` answers *"An email or a phone
  number is required"* - a row with no reachable key is refused server-side whatever the web does.

- **2026-09-08 - `/en` and `/ar` are the page they name, not a 404.**
  Owner: *"fix the /en 404 on beta"*. It was never a beta regression: this app has no locale SEGMENT
  (the language is a stored choice, `moedatech.locale`, and the routes are bare), so `/en` 404ed on
  beta, staging AND production - verified on all three before touching anything. It is asked for
  anyway, because **Supplier OS puts the locale in the path** (`/en/bid/…`) and that shape gets
  copied here. The edge now 308s `/en/x` → `/x?lang=en` (query preserved), and `LocaleProvider`
  reads `?lang` once, persists it as a choice, and strips it from the URL.
  Files: `src/middleware.ts` (`localePrefix`), `src/lib/i18n/index.tsx`,
  `tests/unit/middleware.test.ts`, `tests/unit/locale-from-url.test.tsx`.
  ⚠️ The match is a whole SEGMENT (`/^\/(en|ar)(\/.*)?$/`), never `startsWith("/en")`, which would
  swallow `/enterprise`. A language we do not have (`/fr/…`) is left to 404: it is not a language,
  it is a typo, and redirecting it would hide that.
  ⚠️ `?lang` is STRIPPED after it is read. Left in the URL it rides into every link the renter
  copies and it out-ranks the language switcher on the next reload - press «عربي» on a page still
  carrying `?lang=en` and it reverts.

- **2026-09-08 - A truncated phone names the remedy the renter already has.**
  Owner, on a CSV row still reading `9.66503E+11` and skipped: *"it must normalize it as we
  discussed, why it is not imported?"* It cannot be normalised and that is arithmetic, not a defect:
  `9.66503E+11` IS 966,503,000,000, and the six digits that made it `966503372850` were never
  written to the CSV. The warning now says the sum out loud and points at the two things that do
  work - type it into the table (every cell is editable) or upload the `.xlsx`, where the number is
  intact. That row also carried no e-mail, so it has no reachable contact at all, which is the
  second half of why it is skipped.
  Files: `src/lib/i18n/{en,ar}.ts`, `tests/unit/xlsx-import.test.ts`.
  ⚠️ **Converting the broken CSV to `.xlsx` does NOT undo the damage, and hides it.** Excel parses
  `9.66503E+11` into the rounded NUMBER, so the workbook holds `966503000000`, which normalises to
  `+966503000000` - nine digits, starts with a 5, indistinguishable from a real Saudi mobile and not
  the supplier's. Nothing can detect it; only the ORIGINAL workbook is trustworthy. The test pins
  the hazard rather than asserting a refusal that is impossible.

- **2026-09-08 - The Arabic brand is «معداتك», and «مويداتك» is gone from the repo.**
  Owner: *"do a check for any مويداتك word, it must be معداتك"*. «مويداتك» is the LATIN name
  (Moeda-tech) transliterated back into Arabic, and it had reached 45 places: **12 shipped strings**
  in `ar.ts` (« على مويداتك», «موثّق من مويداتك», the deal-room no-account line, the invite body, the
  web-coming-soon note, the suggested-supplier labels), 29 in the renter-suppliers prototype and 4 in
  two plan documents. Replaced stem-wise, so prefixed forms («لمويداتك») came out right.
  Files: `src/lib/i18n/ar.ts`, `prototypes/renter-suppliers-v1.html`,
  `docs/implementation-plans/renter-suppliers/plan.md`,
  `docs/plans/custom-equipment-request/web-app-changes.md`,
  `tests/unit/brand-spelling.test.ts` (new).
  Trap: nothing catches this by itself - it looks like a word, it renders cleanly, and only a reader
  who knows the company sees it. Hence a TEST that walks `src/`, `prototypes/` and `docs/` rather
  than a one-off sweep, plus a second case asserting the correct spelling is still present at all, so
  a future rename cannot empty the dictionary silently.
  Checked and already correct: every surface that prints the brand outside the dictionary - the
  public bid form's three notices, the quotation's footer and legal lines (`quotation/render.ts`,
  `deal-room.ts`), `bid-quotation.ts`, the confirmation screen, `layout.tsx`'s title/keywords, the
  compare screens - and the OG card, the share card HTML and the WhatsApp templates carry no Arabic
  brand word at all.
  ⚠️ **Outside this repo, still wrong**: `Moedatech-App/apps/mobile/lib/l10n/app_ar.arb:3002`
  (`customEquipmentNotice`) and its generated `app_localizations_ar.dart:7728`. It came from the same
  plan text this repo carried, so the typo travelled into the app's shipped strings; it needs the
  fix plus a localizations regen there.

- **2026-09-08 - An empty supplier list on the share panel offers the way out of itself.**
  Owner: *"make option to add suppliers here when empty"*. «Add» lives in the SEARCH row, and that
  row is drawn only when there is something to search (`{!!rows?.length && …}`) - so a renter with no
  suppliers read «No suppliers on your list yet» beside a «0 selected» count, on the one screen where
  he is choosing recipients, with nothing to press. The empty state is now a dashed block carrying a
  sentence about what the list is FOR and an «Add a supplier» button that opens
  `AddSuppliersDialog`, the same dialog My Suppliers uses; its `onAdded` already reloads the list, so
  the row appears behind the closing dialog and the search row arrives with it.
  Files: `src/components/share/ShareRequestPanel.tsx`, `src/lib/i18n/{en,ar}.ts` (`noSuppliersYet`),
  `tests/unit/share-request-panel.test.tsx` (3 cases).
  Trap: the old string stays. `postShare.noSuppliers` («No suppliers on your list yet») is still used
  where there is no room for a control; the empty BLOCK gets its own sentence, because a sentence
  that only reports a lack reads as a dead end next to a button.
  ⚠️ Sharing never needed the list: the link, WhatsApp and «More» work with zero suppliers, which is
  why this is an offer and not a gate. A test pins that the link half is untouched.

- **2026-09-08 - My Suppliers imports a WORKBOOK, and the phone column is normalised on screen.**
  Owner, on a screenshot of a phone column reading `9.66503E+11` above `503372850`: *"can't we add
  xlsx?"* and *"normalize the numbers"*. One change, because they are one bug: the import took CSV
  only, so a renter had to save his workbook as CSV first, and **that step is what destroys the phone
  numbers** - Excel stores `966503372850` as a NUMBER, displays it as `9.66503E+11` and writes the
  DISPLAYED text to CSV. The panel then drew that text without comment, the backend's
  `normalizePhoneE164` could not parse it and stored NULL (correctly: a raw string in `phone_e164` is
  a key that can never match), and the row was refused for having no contact after the screen had
  promised it would import.
  Now: (1) `.xlsx` / `.xlsm` are read directly - `src/lib/contract/xlsx-sheet.ts`, **no dependency**:
  the ZIP central directory is walked by hand and entries inflate through the platform's own
  `DecompressionStream("deflate-raw")`, with four XML tags read by regex. (2) Every phone is
  normalised to E.164 IN THE PREVIEW (`src/lib/contract/phone-normalize.ts`, a mirror of the
  backend's rules), so the renter reads what will be saved. (3) A cell Excel already truncated is
  called truncated and names the cure, and the row counts as unreachable - which is what the backend
  does with it.
  Files: `src/lib/contract/xlsx-sheet.ts`, `src/lib/contract/phone-normalize.ts`,
  `src/components/suppliers/SupplierImportPanel.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `tests/unit/xlsx-import.test.ts`, `tests/unit/supplier-import-panel.test.tsx`.
  ⚠️ **A truncated number is NOT expanded.** `9.66503E+11` really is 966,503,000,000 - the last six
  digits were never in the file - so `readScientific` returns `"truncated"` and refuses. It expands
  only notation that kept all its significant digits (`9.66503372850E+11`). Guessing here would store
  a plausible wrong phone number, which is worse than a refusal nobody can act on.
  ⚠️ `importable` (shared with the typed add form) still counts any non-empty phone string, which is
  right there and wrong for a sheet: «call the office» is non-empty. The panel uses its own
  `contactable`, which asks whether the phone actually PARSES. If a third surface imports a sheet,
  reach for that rule, not `importable`.
  ⚠️ The worksheet is the first by FILE ORDER (`sheet1.xml`), not by tab order - resolving tab order
  means following `r:id` through `xl/_rels/workbook.xml.rels`, and the two agree in everything Excel
  writes. A multi-tab workbook read on the wrong tab is visible in the preview, which is why it can
  stay this way.
  ⚠️ Number FORMATS are ignored, so a date column arrives as Excel's serial (`45912`). No supplier
  list keeps a date in a mapped column; such a column rides along under `extra` as the number it is.

- **2026-09-08 - The workbook reader worked in every test and failed on every real upload.**
  Owner, on a file this repo had generated itself: *"That file couldn't be read as an Excel
  workbook."* `readEntry` handed `DecompressionStream("deflate-raw")` everything from the entry to
  the end of the buffer, on the reasoning that inflate stops by itself at the end of the deflate
  stream. **Node's implementation does; Chrome's errors the stream** - and in a zip something always
  follows an entry (the next one, then the central directory), so the read threw and the panel
  reported "not a workbook". Measured in Chrome before fixing: the exact compressed bytes inflate,
  the same bytes plus fifty trailing ones throw. It now slices exactly the compressed length off the
  CENTRAL DIRECTORY, with a `limit` (the next header, else the directory) for a streamed zip whose
  sizes are 0.
  Files: `src/lib/contract/xlsx-sheet.ts`, `tests/unit/xlsx-import.test.ts`.
  ⚠️ **The platform difference is the trap, and vitest cannot see it.** The new test replaces
  `DecompressionStream` with a stub as strict as the browser; verified it FAILS on the old slicing
  and passes on the new. Any future byte-level work here must keep that test, or the same class of
  bug ships green again.
  Also verified in real Chrome against the owner's own test workbook: 14 rows, headers intact, the
  12-digit phone read as `966503372850` rather than `9.66503E+11`.

- **2026-09-08 - Nothing is chosen for the renter: an unanswered required field waits, in red.**
  Owner: *"the agent now might send null values for many fields, so make sure web allows a
  non-selected option, no need for auto select for everything, even if required then just show it in
  red with «required» if user tried to go next"*. `defaultProjectDetails` seeded «me» on all three
  party fields, so the agent's silence became three priced commitments nobody made - the renter
  collects the machine, returns it, and buys the fuel - and the gates written for them
  (`gate.deliveryMissing`, `gate.returnMissing`) could never fire, because the fields were full from
  the first render. All three start null now.
  Files: `src/lib/contract/draft.ts`, `src/lib/contract/gates.ts`,
  `src/components/create/MachineCard.tsx`, `src/components/create/ReadyToSend.tsx`,
  `src/lib/export/spec-sheet.ts`, `src/lib/i18n/{en,ar}.ts`, `tests/unit/gates.test.ts`,
  `tests/setup/canvas.tsx`.
  Trap: **fuel responsibility had no gate**, because it could not be empty. Removing the seed made it
  possible, and `draftToCreateRequest` falls back to «me» when it computes `dieselIncluded` - so
  without a new gap («gate.fuelPartyMissing») an unanswered field would have posted as «the renter
  pays» in silence, which is the exact failure the seeds were removed to stop.
  Trap: two test helpers named `confirmedProject` (in `gates.test.ts` and `tests/setup/canvas.tsx`)
  mean «nothing is missing at request level», and both were relying on the seeds - 25 tests failed
  across five files, every one of them describing the old auto-select rather than a regression. Both
  helpers now answer the three fields themselves.
  ⚠️ Deliberately NOT changed, and each for a stated reason: `fuelType` keeps its diesel default
  (owner, 2026-08-31: the system fills fuel type, the agent should not spend tokens on it);
  `operatorNeeded` keeps «no» for an agent line that says nothing (the cheaper wrong answer, and the
  agents repo now fills it from its own map anyway - `d97a15e`); `quantity` keeps 1 (the backend
  backstops it and the stepper's floor is 1); hours/day, days/week and the maintenance side are the
  APP's defaults, not the agent's fields.
  ⚠️ `spec-sheet.ts` and the review table print «—» for an unanswered side now. They used to read
  `?? "me"`, which would have printed a decision into an exported document that nobody had made.


- **2026-09-08 - A refused term is SAID, not tinted; and «Ask» is a drawer, not a one-line box.**
  Owner: *"How can TÜV be a conflict and a match at the same time? If he says no, show it like ✗ TUV.
  And if it has an opposite value - not «on rentee», so it will be «on supplier» - show that."* The
  compare table printed the term's value and coloured it by the row's state, so a supplier who
  ACCEPTED «TÜV» and one who REFUSED it both read «TÜV» - one green, one red - and the only thing
  telling them apart was a colour the reader has to compare across rows to notice. Now `readTerm`
  returns `refused`, and a conflict with no counter-offer splits two ways: a term that IS a party
  assignment (`TERM_PARTY`: fuel, maintenance, the operator's food, transport) flips to the OTHER
  party through `oppositeParty`, because «on supplier» and «on rentee» are the whole vocabulary, so
  refusing one IS the other; everything else (a certificate, a year, a payment term) keeps the
  requirement and takes a `✗` in front of it. The agent's pick also carries the row tint and a green
  edge rather than a star and a word, and `rankAsk` («Ask the assistant») opens `AiChatDrawer` with
  the turn count on the button.
  Files: `src/components/workspace/CompareMatrix.tsx`, `src/components/workspace/AiRankPanel.tsx`,
  `src/lib/i18n/{en,ar}.ts`, `tests/unit/compare-matrix.test.tsx`,
  `tests/unit/ai-rank-panel.test.tsx` (new).
  Trap: `oppositeParty` returns null for anything the party map cannot read, and the caller falls
  through to marking the requirement refused - never to a guess at the other side.

- **2026-09-08 - The dashboard, My Suppliers and the share panel stop dragging the page sideways on a phone.**
  Audited the deployed staging build at a 372px layout viewport, LTR and RTL, over ten routes. Three
  surfaces made the whole DOCUMENT wider than the screen, which moves the nav, the hero and every
  card with it: `/suppliers` (906px) and the dashboard that embeds it (890px), both from the
  eight-column supplier table, and the share step (902px) from a grid column nobody had stated.
  Fixes: the table lives in an `overflow-x-auto overflow-y-clip` box with `min-w-[620px]`, so the
  COLUMNS scroll and the page does not; the share panel's three grids state
  `grid-cols-[minmax(0,1fr)]`, and the masked link lost its `flex-none`.
  Files: `src/components/suppliers/SuppliersPage.tsx`, `src/components/share/ShareRequestPanel.tsx`.
  Trap: **an implicit grid column is `auto`, which means MAX-CONTENT.** One nowrap run inside - a
  supplier's e-mail, the share link, «Send to my suppliers · 0 selected» - grew a 340px card's column
  to 566px, and every `truncate` in that subtree was inert for the same reason: text cannot be
  truncated to fit a parent that grows to fit the text. `lg:grid-cols-[…]` alone does not help, since
  below `lg` the column is the implicit one.
  Trap: both overflow axes are stated on the table box. CSS computes the other axis from `visible` to
  `auto` as soon as one scrolls - the third time this repo has met that (the bid rail, the compare
  matrix, now this).
  Clean at 372px, both directions: `/browse`, `/requests`, `/profile`, `/inbox`, `/legal/*`,
  `/stores/{id}`, `/bid/{token}`.
  ⚠️ Verified by patching the live DOM and re-measuring, not on a deployed build of the fix - the fix
  itself is unshipped. Re-measure after the next deploy.
  ⚠️ NOT covered: the deal room and the bid map (no id reachable from the phone-width list), the
  compare workspace, and tap-target sizes - a dozen icon-only controls are 20-28px against the 44px
  guideline (`ios_share`, `close`, `chevron_right`, the bell's count, «+12 more», ✕ on the
  notification strip). Both are their own passes.

- **2026-09-07 - A request started from a store opens on the FORM, not on «describe your request».**
  Owner: *"i don't want the direct request from a store take him to the same flow, check in the app
  how the direct behave and mimick it"*. The web pushed the machine's NAME into the intake box
  (`?prefill=`) and had the agent parse it - so the renter was asked to write down, in prose, the row
  he had just tapped, and then wait while we guessed which catalogue row he meant. The guess misses:
  «Tuv Certfied Service Jeep» is a real answer for a real listing. The app never had that step
  (`public_equipment_detail_sheet.dart` → `EquipmentPrefill` + `WizardPrefill.forDirectRequest`): it
  opens its wizard with the equipment ALREADY CHOSEN, by id. The store link now carries
  `catId/subId/capId` (+ the listing's `fuel` and `year`), and `/create` seeds a one-item draft
  through `PROCESS_SUCCESS`, landing the renter on the canvas with the machine answered.
  Files: `src/lib/agent/direct-draft.ts` (new), `src/components/stores/EquipmentDetailSurface.tsx`,
  `src/app/create/page.tsx`, `src/lib/store/rfq-store.tsx` (`seedDraft`),
  `tests/unit/direct-from-store.test.ts` (new, 7 cases).
  Trap: ALL THREE ids or none. The backend refuses a partial triple (one or two ids is a 422 by
  design), so `canSeedDirect` requires the whole triple and a listing missing one falls back to the
  typed path - today's behaviour, nothing lost. `?prefill=` therefore stays: it is the «YOU WROTE»
  label and the fallback, not dead weight.
  Trap: it reuses `PROCESS_SUCCESS` rather than adding a reducer branch, so the project's defaults,
  the template's terms, the origin snapshot and the empty `touchedFields` behave identically to a
  parsed draft. A second branch meaning «the same thing but without the model» would have drifted.
  ⚠️ Deliberately NOT copied from the listing: price, make and model. A request states what the
  renter needs, not what one supplier stocks - a make on the request narrows the question he is
  asking, and the price is the supplier's to offer. Identity travels as taxonomy; the make survives
  only as display text in `rawLabel`.

- **2026-09-07 - The pin overlay is off on beta, because «an Amplify host is staging» stopped being true.**
  `uiPinsAllowed()` was an allowlist of three hosts OR a blanket `host.endsWith(".amplifyapp.com")`,
  written when every generated Amplify host really was a preview branch. The `beta` branch broke that
  premise: `beta.dgdtg4fmrwwfn.amplifyapp.com` serves a renter-facing build against the PRODUCTION
  backends, so the developer overlay - numbered boxes over every surface - was drawn over it. The
  blanket rule is gone and the one Amplify host that may show pins is named
  (`staging.dgdtg4fmrwwfn.amplifyapp.com`).
  Files: `src/lib/uiPins.ts`, `docs/ui-pins.md`.
  ⚠️ `main.dgdtg4fmrwwfn.amplifyapp.com` is PRODUCTION and was inside the blanket too - the
  overlay was one URL away from a renter on the live build, and the file's own «a new domain arrives
  with pins off» rule had been quietly broken by the OR beside it.
  ⚠️ A branch preview that is genuinely for restyling now arrives with pins OFF and must be
  added to `PIN_HOSTS` by name. That is the direction this file argues for, but it is a change of
  behaviour for anyone who relied on the blanket.

- **2026-09-07 - The step is in the URL, so Back restores it; and the map's offers stopped looping.**
  Owner: *"back … must take the user back to the STEP he was in, not only the page screen — he was on
  home, opened a modal, clicked a row inside it that took him somewhere else, so back must be home
  WITH the modal"*, and *"I have a loop of back in the map view: in viewing offers, back just takes me
  to the other offer in a loop"*.
  (1) `src/lib/nav/useUrlOverlay.ts` (new) puts an overlay's identity in a search parameter: open is
  ONE `pushState`, a re-open `replaceState`s (so a renter never presses Back twice to leave), close is
  `history.back()` when we own the entry and a param strip when we arrived on a link. `HomeRequests`
  (`?req=<groupId>`) and the requests drawer (`?open=details|share|cancel`) are through it.
  (2) The map's sibling-offer press was `router.push`, so each switch stacked an entry and Back walked
  A → B → A forever. It is `router.replace` — reading another supplier's offer on the same request is
  a lateral move across one surface.
  Files: `src/lib/nav/useUrlOverlay.ts`, `src/components/home/HomeRequests.tsx`,
  `src/components/workspace/RequestsWorkspace.tsx`, `src/components/map/OtherOffers.tsx`,
  `tests/unit/url-overlay.test.tsx`.
  ⚠️ Not `router.push` and not `useSearchParams` for an overlay: the first refetches the route tree to
  draw a modal over content already on screen, the second is BLIND to a bare `pushState`. The hook
  reads `location.search` and listens for `popstate` itself.
  ⚠️ Still component state, on purpose or not yet done: the My Suppliers dialogs, the map's machine
  detail panel, and the home modal's SHARE door (which sheet to enter by is not which record is open).

- **2026-09-07 - «Other offers» lists the other SUPPLIERS, in the back header, under the firm's name.**
  Owner: *"this must show other offers' suppliers on this request, not other offers from this
  supplier … and these tabs must be in the back header, not on the company header"*. Three faults in
  one strip. (1) It listed BIDS: a firm answering a multi-item request submits one per line, so the
  same supplier appeared twice and read as his own other offers. `otherOffers()`
  (`src/lib/contract/other-offers.ts`) collapses by `bidSupplierKey` (company → member → name), keeps
  the bid ON SCREEN as its supplier's chip and otherwise travels to that supplier's cheapest.
  (2) It printed the bidding MEMBER while the panel header above it printed the FIRM — two
  derivations of one counterparty's name. `readSupplierDisplayName` is now shared, with `mapBid`'s
  precedence (own profile company name → verified firm's brand → backend's resolved name → person).
  (3) It moved out of the panel's identity band into the page's back bar: `AppShell` hands pages the
  bar's trailing element (`useBackBarSlot`) and the route portals `OtherOffers` into it.
  Files: `src/lib/contract/other-offers.ts`, `src/components/map/OtherOffers.tsx`,
  `src/app/bids/[bidId]/equipment/page.tsx`, `src/components/AppShell.tsx`, `src/lib/ds.ts`,
  `src/components/map/BidMapWorkspace.tsx`, `src/components/map/map-proto.css`,
  `src/lib/contract/{bids,inbox}.ts`, `tests/unit/other-offers.test.tsx`.
  ⚠️ **`readSupplierDisplayName` is a SHARED change**: every received-bids reader renames with it —
  the inbox rows, the chat dock's tabs, the dashboard's bid rail. All of them now say the firm, which
  is the point, but it is not only the map.
  ⚠️ A DOM node through context, not a registered React node: a node re-created each render would
  re-render the shell forever. `PAGE_BACK` went from `inline-flex` to a full-width `flex` row so the
  slot has somewhere to sit; the control itself did not move.
  ⚠️ `.bm-sibs*` is no longer scoped under `.bidmap` — the strip renders outside that surface now.

- **2026-09-07 - The typed company name is gone, and the profile's firm block is the firm plus its people.**
  Owner: *"remove it from the form UI now, and even in the company details don't show it - just show
  profile, company, and the code with team members. And even if the document is empty in one slot,
  don't show view."* So: (1) the optional «Company name» field is out of the create-account form and
  is no longer posted - the backend's naming chain simply falls through the middle step
  (`submission.companyName → profile.companyName → companyLegalName → 'My Company'`); (2) the profile
  no longer renders `CompanyDetails` (legal name, authority role, national id, city, address, the
  three papers) - a read-only copy of a form he filled once, which turned his profile into a filing
  cabinet; what is left is the firm's identity row, the invite code, the roster and the way out;
  (3) `DocPill` draws nothing for a slot with no file, and its «Documents» heading goes with the last
  of them - «Verified» on an unopenable row was a claim about a paper nobody can see.
  Files: `src/components/onboarding/OnboardingForm.tsx`, `src/components/company/CompanyHub.tsx`,
  `src/components/company/CompanyDetails.tsx`, `src/components/PageSection.tsx`,
  `tests/unit/profile-company.test.tsx`.
  ⚠️ `CompanyDetails` is now rendered by NOTHING. Kept rather than deleted: it is the only rendering
  of those particulars, and where they go if the firm is given a page again. Delete it if that never
  happens.

- **2026-09-07 - The legal pages printed their own markup; the profile printed two company names.**
  (1) `/legal/[key]` rendered the document with `{body}`, so a renter opening the terms read `<h2>`
  and `<p>`. The MOBILE app has always rendered it (`legal_content_page.dart` hands the same field to
  `HtmlWidget`). The web renders it now through an allow-list (`src/lib/contract/legal-html.ts`) with
  a `.legal-doc` block in `globals.css` carrying the same few rules the app styles - headings,
  paragraphs, lists, links. Plain-text documents still print as text, so their line breaks survive.
  (2) The profile drew `profile.companyName` - free text typed at signup - beside the firm block that
  names the COMPANY the account belongs to. The row now draws only when there is no firm.
  (3) The settings card no longer stretches: `grow` is gone, reversing the 2026-08-30 both-columns-
  end-level ruling, which stopped being right when the firm moved onto this page and made the left
  column much taller.
  Files: `src/app/legal/[key]/page.tsx`, `src/lib/contract/legal-html.ts`, `src/app/globals.css`,
  `src/components/profile/ProfileView.tsx`, `src/components/company/CompanyHub.tsx`,
  `tests/unit/legal-html.test.ts`, `tests/unit/profile-company.test.tsx`.
  ⚠️ No sanitiser DEPENDENCY: the allow-list is ~40 lines because a legal document's vocabulary is
  small. If a third surface ever renders authored HTML, reach for DOMPurify then.
  ⚠️ Support «doesn't work» on web.moedatech.net because that build has **no Intercom at all** -
  verified in the browser: `window.Intercom` undefined, no snippet, and none of the five scripts on
  the page mentions `widget.intercom.io`. Same host is still serving the pre-token palette. It is a
  DEPLOY, not code.

- **2026-09-06 - A guest meets the page behind glass, not a prompt in an empty column.**
  Owner sent Supplier OS's guarded pages as the reference: the surface renders blurred and inert with
  a small card centred on it («Join Moedatech», what the page is, one line of what it holds, one
  button). `GuestWall` does that for the dashboard and the requests workspace, opening this app's own
  auth modal. The backdrop is the page's own SKELETON, deliberately: a guest has no requests, no bids
  and no suppliers, and rendering plausible rows of somebody's business behind a blur would be
  inventing a dashboard he does not have.
  Files: `src/components/common/GuestWall.tsx` (new), `src/components/home/HomeHub.tsx`,
  `src/components/workspace/RequestsWorkspace.tsx`, `src/lib/i18n/*`, `src/lib/uiPins.ts`,
  `tests/unit/shell-nav.test.tsx`.
  ⚠️ The workspace's EMPTY state (a signed-in renter with no requests) keeps its `SignInPrompt` - it
  is a different question with a different answer («create your first request»), and the wall would
  argue for an account he already has.

- **2026-09-06 - Request details follows the app's order, and «created at» moved to the top.**
  Owner sent the app's own request screen as the reference: status, then EQUIPMENT DETAILS, then
  PROJECT LOCATION (the site, with the rental basis and the hours beside «extendable»), then PROJECT
  DETAILS (everything else the request states, working days / week included). The web had the same
  spine under different names, with the basis and hours filed as «terms» and the created-at date
  buried among the job's own dates - a different clock: those say when the machine is needed, that
  one says when he put the request out, which is what he counts the silence from.
  Files: `src/components/workspace/RequestDetailsModal.tsx`.
  ⚠️ `requestDetailRows` already emits «Working days / week»; it is dropped when the value is null,
  which is the ordinary case for a request that never set one - so if it is missing on a given
  request, that is the DATA, not the layout.

- **2026-09-06 - Picking a subtype on an off-catalogue row no longer makes the row vanish.**
  Owner: *"when i try to click a subtype from existing taxonomy it is vanished"*. `isCustomLine` reads
  the SUBTYPE (a partial triple is a 422, so a half-picked line must not post ids), and the pick
  cleared it while `verdict` stayed `no-match` - so the card fell back to the branch that swaps the
  taxonomy trio for the red «not available» panel, hiding the control the renter had just used, and
  `postableItems` still dropped the line. `SET_ITEM_SUBCATEGORY` now moves the verdict too:
  `no-match` becomes `needs-validation`, which is what this app calls a line whose machine is known
  and whose size is not.
  Files: `src/lib/store/rfq-store.tsx`, `tests/unit/custom-equipment-canvas.test.tsx`.
  Trap: three different things say «off-catalogue» - the verdict, `isCustomLine`, and the presence of
  the free-text name - and they have to move together. The reducer clears the name in the same
  branch; the test asserts all three plus «it posts now» and «it asks for the size».

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
