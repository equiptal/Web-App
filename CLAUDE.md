# Web-App — agent notes

## Change log

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
  `taxonomyName ?? customEquipmentName`.
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
