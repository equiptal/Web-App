# Web-App — agent notes

## Change log

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
  `tests/unit/bid-cards-wrap.test.ts` (new).
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
