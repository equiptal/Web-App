# Web-App — change log archive

**The whole log, newest first.** Every entry, including the newest — `CLAUDE.md` keeps none
of them and points here instead, because it is re-read into the system prompt on every turn of
every session and this file is not.

Read the entries that touch the surface you are changing. Nearly every one records a trap, a
reversal, or the reason an odd-looking line is load-bearing.

- **2026-09-26 - ACTUAL root cause of the anonymous web chats: Intercom's Messenger API was switched
  OFF.** Intercom → Settings → Channels → Messenger → Install → «For users with logins» → «Enable the
  Messenger API». Off, the web Messenger accepts anonymous visitors only and answers EVERY identified
  boot `403 forbidden` on `/messenger/web/ping`, signed or not, with any key (proved by a probe page on
  the web.moedatech.net origin with a fake user: anonymous 200; unsigned, `user_hash` and JWT all 403
  with two different keys; all 200 once the owner switched it on). The ping reply itself said
  `identity_verification_ready: false`, `messenger_security_enabled: false`. The app was unaffected
  (mobile SDK). ⚠️ The entry below, the Supplier OS 2026-09-03 note it relied on, and the «trusted
  domains» idea were all WRONG: verification is not enforced, and the trusted-domains list was blank.
  The secret in Amplify is harmless and accepted; the email split and the anonymous fallback stay as
  hardening. ⚠️ Identity verification is still OFF for web, so a page can claim any user_id; turning
  it on is safe now (the web already signs), but Supplier OS must set its key first.

- **2026-09-24 - (WRONG, see above) ROOT CAUSE of the anonymous web chats: the workspace enforces Intercom identity
  verification for WEB, and this build never signed.** Supplier OS measured it on 2026-09-03
  (`intercom-messenger.tsx`: an identified boot without `user_hash` is 403'd on the ping, for ANY
  user_id; anonymous 200s). The «Messenger Security: Off» panel is Intercom's NEWER setting and does
  not govern it; the older HMAC verification does, signed with the workspace's Unified Secret. The web
  already signs (`/api/support/intercom`, HMAC-SHA256 hex of the user id, the same as OS) but
  `INTERCOM_IDENTITY_SECRET` was never set, AND `amplify.yml` did not copy it into `.env.production`, so
  even a secret set in Amplify would not have reached the server. Fixed the copy; the secret must be
  added in Amplify (branch `main`) and a build run. Files: `amplify.yml`, `.env.example`. ⚠️ The two
  entries below diagnosed the cause wrongly (the email; «verification is off»): the email split and the
  anonymous fallback stay as harmless hardening, not as the fix.

- **2026-09-24 - The identifying Intercom boot no longer carries the email; it follows in its own
  `update`, as the app does.** Measured on prod: the boot with `user_id` + `email` got `403 forbidden`
  on `/messenger/web/ping` (`error.list`, code `forbidden`), with Messenger Security OFF for web and NO
  `user_hash` sent (Amplify has no `INTERCOM_IDENTITY_SECRET`, and `amplify.yml` would not copy one
  into `.env.production` anyway). The app never hit it: `loginIdentifiedUser` sends the user id alone
  and `updateUser` sends the email after. ⚠️ The cause is NOT confirmed: most likely the email already
  belongs to a different Intercom contact, which an unsigned request may not claim. If the 403 stays
  with the email gone, the email was not it. Files: `src/components/support/IntercomWidget.tsx`,
  `tests/unit/intercom-widget.test.tsx`.

- **2026-09-24 - The bubble always opens: a press not followed by Intercom's `onShow` within 2 s falls
  back to an anonymous messenger and shows it.** After #106/#107 booted signed-in renters identified
  from the start, a press still opened nothing on prod. Leading cause, NOT confirmed: identity
  verification switched on for WEB in Intercom (it is per platform; the app's unsigned logins show
  names, so it is off for iOS/Android), and this build signs nothing (`INTERCOM_IDENTITY_SECRET` unset
  in Amplify). A refused boot fires no callback, so the press is the first thing that can notice.
  Files: `src/components/support/IntercomWidget.tsx`, `tests/unit/intercom-widget.test.tsx`.
  ⚠️ While verification stays on for web, every signed-in renter falls back to ANONYMOUS: the real fix
  is the dashboard setting or the secret, not this code.

- **2026-09-24 - The support bubble did nothing for a signed-in renter (regression of the entry below).**
  The identity fetch was cancelled by its effect's cleanup whenever the session handed over a new
  `user` object for the same person, and the re-run returned early (same id, already asked). The
  answer was dropped; with the first boot now WAITING on it, Intercom was never booted and `show` had
  nothing to open. Before, the same dropped answer only left the messenger anonymous, which hid it.
  Now the answer is kept unless `serverFor` moved to another user. Reproduced first in a test (no
  boot at all), which now passes. Files: `src/components/support/IntercomWidget.tsx`,
  `tests/unit/intercom-widget.test.tsx`. ⚠️ A boot that WAITS must never depend on an answer a
  cleanup can drop.

- **2026-09-24 - Signed-in renters reached support as an anonymous lead; the messenger now waits for the
  identity and boots once.** The widget booted anonymous at once, then `shutdown` + `boot` when
  `/api/support/intercom` answered. Measured on prod: the identity landed at 1102 ms, Intercom's script
  at 1160 ms, so all three calls sat in the snippet's queue and the real client kept the anonymous boot.
  The route itself was fine (200, user 46, name). Support saw «Grey Joystick», a Lead with no phone, and
  no error fired anywhere; it predates the context ticket. Now a signed-in renter's FIRST boot is held
  until the identity request finishes (answered or failed); visitors and a sign-in mid-page keep the old
  path. Files: `src/components/support/IntercomWidget.tsx`, `tests/unit/intercom-widget.test.tsx`.
  ⚠️ Why the old order looked right: in tests and on a slow network the script loads first, and the
  swap works. It fails exactly when the identity is FAST.

- **2026-09-24 - Web side of the Intercom context ticket: support sees who, what and where.** Adds
  `platform: "web-rentee"` (anonymous boot too), `side`, `is_guest`, `company_id` / `company_role` and
  Intercom's company record, `registered_at`, `requests_total` / `requests_open` and the newest
  non-trial request's id, status and offers, plus `last_screen` / `last_object_type` / `last_object_id`
  sent right before the messenger opens. Four owner calls against the ticket: ids go as TEXT (a company
  id is a UUID, a request id a code, not the numbers the ticket assumed); `company_role` is the product's
  `owner | member`, not `staff`; `last_request_status` is the backend's own value (`ACCEPTED`), not the
  ticket's unmapped words; `side` is sent BESIDE `user_type`, which mobile still sends. Anything the
  server could not answer is omitted, never null or 0. Files: `src/app/api/support/intercom/route.ts`,
  `src/lib/support/intercom.ts`, `src/components/support/IntercomWidget.tsx`, `tests/unit/intercom*.ts*`.
  ⚠️ Intercom fixes an attribute's type on its first write, so the mobile app must send these ids as
  text too. ⚠️ One person is one Intercom contact, so `platform` is only right if BOTH clients write it:
  the mobile app sends `mobile-ios` / `mobile-android` from its build of the same day, and an older app
  build leaves `web-rentee` on a renter who once used the web. ⚠️ Request counts are
  COMPANY-WIDE for a member (that is what `my-requests` returns). `last_error` is a request post the
  backend refused (`post_request: E8009`) within the last minute: the web has no profile gate like the
  app's `action_blocked_by_profile`, so the refused post is its equivalent (`rfq-store.tsx`).
  `registered_at` and `test_account` come from `profile-status` (`/users/me` was never confirmed to carry
  `createdAt`), `last_request_notified` from the backend's new `suppliersNotified` on each `my-requests`
  row, and the company card's `created_at` from the new `company.createdAt`: all three are backend
  additions on Moedatech-App `staging` the same day, and each is OMITTED while the backend lacks it.

- **2026-09-23 - Browse's category pills lead with the categories that have the most stores.**
  Owner: *"what is this warehouse category from where? i want the stores categoris to show the ones
  that have greatest number of stores at begiiing"*. The pills were the backend taxonomy in its own
  order, and its first entry, «Warehouse Equipment», had 0 stores in production (119 stores counted).
  The taxonomy carries no count, so `/api/stores/taxonomy?sort=stores` reads the store directory
  (100 a page, 10 pages max) and orders by how many stores list each top-level category
  (`sortByStoreCount`). Ties keep the backend order; empty categories go LAST, not hidden (no ruling
  asked for hiding).
  Files: `src/app/api/stores/taxonomy/route.ts`, `src/lib/contract/stores.ts`,
  `src/components/stores/BrowseSurface.tsx`, `tests/unit/stores.test.ts`.
  ⚠️ OPT-IN on purpose: the intake rail, the processing screen and the store page read the same route
  only to find icons by id, and must not pay for a directory read.
  ⚠️ Costs 2 backend calls per Browse load today, growing with the directory. The clean fix is a
  `storeCount` on `/public/equipment/taxonomy`, which is BACKEND work and not done.
  ⚠️ A failed directory read returns the tree unsorted rather than failing the pills.

- **2026-09-23 - `/?signin=1` opens the sign-in modal for a guest; the home bounce to Browse kept only the path.**
  Found by the production smoke test after the beta promotion. The marketing site links `/?signin=1`.
  A cold guest on `/` is replaced to `/browse`, and `router.replace("/browse")` dropped the query: the
  auth gate had opened the modal on `/`, and the page change unmounted it. `/browse?signin=1` and
  `/create?signin=1` always worked, which is why the unit-level reasoning looked right.
  Fix: the bounce carries `window.location.search`. HomeHub's effect runs before the auth gate's
  (child before parent), so the parameter is still there when it is read.
  Files: `src/components/home/HomeHub.tsx`. Verified in a real browser against a production build:
  `/?signin=1` lands on `/browse` with the modal open, and a plain `/` is unchanged.
  ⚠️ Every query on a cold `/` now rides to Browse, including `city`, `category` and `search`, which
  Browse reads. That is intended.

- **2026-09-23 - Beta is production: `main` now serves the beta build, and the old `main` is `archive/main-2026-09`.**
  PR #103 (`promote/beta-to-main`, merge `06e98626`, Amplify main job 60). The merge used
  `git merge -s ours origin/main` on a branch cut from beta, so `main` fast-forwarded to a tree
  byte-identical to beta: no force push, and history is kept. Rejected: resetting `main` to beta and force
  pushing, which rewrites shared history. `staging`, `beta` and `main` all sat on the same tree after this.
  ⚠️ `main`'s one commit beta lacked (`4c242520`, larger-size bids) changed `GroupBids`/`RequestBids`,
  which beta only has commented out; the requests workspace has the feature. It lives on in the archive.
  ⚠️ `AGENTS_API_URL` differs between the main and beta Amplify branches only in name: the beta one is a
  custom domain mapped to the same API Gateway. Not a different backend.
  Rollback: revert to `archive/main-2026-09`.

- **2026-09-23 - The quotation's renter gap moves ONTO THE RENTER'S SIDE, and the banner across the sheet is deleted.**
  Owner, on an amber band reading «Your company has no logo on file»: *"this is not how the app design
  it, check the qoutation in the app and let the web follow it ecxactly, this banner at bottom is
  signed by moedtaech not renetr logo, renter logo or verifixation will be on the renter side like
  the app"*.
  **Read off `quotation_document.dart` before anything was written**, and the app has NO banner. It
  answers both gaps IN PLACE, inside `_PartyBox`:
   — **`_AddLogoSlot`** stands in the mark's own slot — a small red chip, *"RED, and it says what it
     wants … a missing piece of the firm's own paperwork, and the sheet goes to a customer without
     it"*.
   — **`_VerifyChip`** sits exactly where the verification TICK would be, and its own note says why:
     *"the reader looks at one spot to learn whether this party is verified, and finds either the
     answer or the way to fix it"*.
  🔴 **`QuotationParty.asks` already carried both** and the web's `partyHtml` already drew them — so
  the banner was a SECOND answer to a question the party box was answering, across the top of a
  document that goes to a customer. The deal-room path simply never filled `asks`: it built
  `ownerPrompt` instead and the renter's mark was never passed to his own box at all.
  **What changed**: the deal room now puts `logoUrl`, `verified` and `asks` on the rentee party, and
  `ownerPrompt` is deleted — the field, the markup, its four CSS rules and its slot in the template.
  🔴 **A MARK ONLY EXISTS BEHIND A VERIFIED COMPANY**, the app's rule verbatim: *"how can a user have
  a logo but not verified … otherwise no logo will be shown and it will take him to company
  verification"*. A profile CAN carry `companyLogoUrl` while its firm is unverified (one set before a
  rejection, or inherited), and printing it would put a company's brand beside a party nobody has
  checked. Break-checked — the gate removed, one case went red.
  ⚠️ **Unverified outranks «no mark», and only ONE ask is ever offered**: there is no point asking for
  a logo from an account with no company to put one on.
  ⚠️ **Screen only.** The print stylesheet drops `.q-addlogo` and `.q-verify`, which is the app's own
  rule: *"drawn ONLY where a tap can do something about it … it never reaches the PDF"*. A sheet
  handed to a customer must not carry the renter's own to-do list.
  ⚠️ **The navy FOOTER was already right and is untouched**: the SUPPLIER's mark or nothing at all.
  Checked rather than assumed — the app's `_PlatformFooter` says *"why the footer show moedatech logo,
  here is logo of supplier and if he doesn't have just don't show anything"*, and Moedatech lives on
  the SIGNATURE STRIP above it with the support address. The web does both already.
  🔴 **A STALE COMMENT in the app nearly sent this the wrong way.** `supplierLogoUrl`'s own doc says
  *"Null falls back to the Moedatech mark, so the footer is never a hole"* — and the code twenty
  lines down does the opposite, under a struck-through note recording the owner's reversal. The
  struck version won; the doc above it was never updated. Reported, not fixed: it is the app's file.
  Files: `src/components/deal-room/DealRoom.tsx`, `src/lib/contract/deal-room.ts`,
  `src/lib/quotation/render.ts`, `tests/unit/deal-room-quotation.test.ts` (the banner's block
  rewritten to the removal, 6 cases; 29 passing).
  ⚠️ Verified: typecheck clean of this work, lint 0 errors, **77 passing across the three quotation
  suites**, and the verified gate break-checked.
  🔴 **NOT seen rendered**: the sheet needs a signed-in renter with a live room, and the browser
  extension is still disconnected. What wants a look is the red chip's weight inside the party box at
  the real size.

- **2026-09-23 - The negotiation sheet becomes beta's QUOTATION PAPER: a letterhead, a navy table and the amount in words on a zoomable desk, with staging's terms walk folded onto it, no step rail, and the header's arithmetic behind a chevron.**
  Owner, after a side-by-side of the two deployed sheets: *"i want the same as beta ui, only for terms
  use the staging one but folded in the beta sheet style"*, *"remove the process bar"*, *"header show
  the price and the counters ... with details breakdonw that expand it like the details in the price
  footer of the map"*, *"i want the term name to appear at middle of the card too not on the left ...
  even the values of the term when user click another show them all centered"*, and *"make it zoomed
  at 100% on open, so follow beta here too"*.
  🔴 **The body is a DESK holding PAPER, not a column of cards.** ~~`.ng-body` + `.ng-inner`, a
  940px column of white cards on grey.~~ What this sheet is FOR is a quotation, and beta drew one: an
  800px document per step with a letterhead (`qhead()`), a navy table head, the green price pill and
  the amount in words, lying on a grey desk with a zoom rail. Asked to choose between the two he
  picked that one whole, so it is restored whole - and each of the three steps is now a sheet of the
  same document rather than a document, a list and a document.
  ⚠️ **Tokens, not beta's aliases.** beta declared `--line`, `--paper-2`, `--success`,
  `--rentee` and `--warning` on its own shell and painted through them. Every rule here is written on
  the real tokens instead, because a local remap of `--action` is exactly the drift RM3-AC-33 and
  `palette-drift` exist to stop. A case pins that none of the three aliases came back.
  ⚠️ **The room's short code IS the quotation number.** There is no quotation id in the deal
  room payload and none is invented. The header still leaves the code out of its sub-line (note 7 of
  2026-09-22); on a letterhead it is the thing a reader looks for, beside the name it belongs to.
  ⚠️ **The Arabic date carries Latin digits** (`ar-u-ca-gregory-nu-latn`): beta printed
  Arabic-Indic, and a Latin quotation number beside an Arabic-Indic date is two systems on one line.
  🔴 **NO STEP RAIL, again.** ~~① Price ── ② Terms ── ③ Review, restored from beta on
  2026-09-22 as *"the one device that makes three pages read as three SHEETS"*.~~ Its own design note
  admits it is `aria-hidden` and unpressable, so it spent a band of the sheet on decoration - and the
  argument for it is answered by the paper, because each step now IS a sheet. The footer keeps naming
  where the press goes.
  🔴 **The header's arithmetic FOLDS.** ~~A permanent 9.5px caption printing `10,000x2
  +200x2` under the figure.~~ It sat in the one band that has to stay short, on every screen of every
  round, and it gave a formula to a reader who wanted the whole sum. It is 48.2's device now: a
  chevron on the figure, and a panel under the WHOLE header so nothing in the row moves when it opens.
  ⚠️ **One `totalRows()` feeds both** the panel and the paper, so the header and the document
  can never print different totals. A case counts the two call sites.
  🔴 **The terms step keeps staging's walk on beta's paper** (*"only for terms use the staging
  one"*). beta printed terms as document rows with a match badge: readable, and impossible to
  negotiate from. The sections, the one-open-card rule, the two positions and the two acts survive
  unchanged; only the surface under them is new.
  **The term card reads down ONE axis**: the name is centred to join the positions, the acts and the
  options, which were already centred. A start-aligned name over a start-aligned picker left the card
  disagreeing with itself about where its middle was.
  ⚠️ **The caret fix is kept.** `PriceCell` and `Qty` stay at module scope: beta's sheet
  predates the 2026-09-22 hoist, and a straight revert would have brought back *"i cant write into
  price box it takes me out after each character"*. `PriceCell` now renders the pill, still at module
  scope, and a case still pins the position rather than the name.
  ⚠️ **Dead stylesheet deleted, not left behind**: `.ng-thead`, `.ng-row`, `.ng-rm`,
  `.ng-price`, `.ng-sum`, `.ng-net-box`, `.ng-overall`, `.ng-exvat`, `.ng-pad`, `.ng-card`, `.ng-body`
  and the rail's own rules went with the markup that used them.
  Files: `src/components/deal-room/DealRoom.tsx`, `src/components/deal-room/deal-room-proto.css`,
  `src/lib/uiPins.ts`, `docs/ui-pins.md`, `docs/ui-surface-map.md`,
  `tests/unit/negotiation-sheet.test.ts`. New pins: 55.9 the breakdown chevron, 55.10 the breakdown
  panel, 55.11 the zoom rail.
  ⚠️ Five cases moved to the new rulings rather than being weakened: the rail case now
  asserts its ABSENCE, the desk case reads `.qp-desk` / `.qp-paper`, the band count is 3, and the two
  price-skin cases read the pill. 53 pass in that file, 206 across the deal-room suites.
  ⚠️ Not changed, and worth knowing: the FOOTER is staging's, already reshaped to the live
  one on 2026-09-23, so its primary stays navy where beta's is orange. Say so if the orange was part
  of what you picked.

- **2026-09-23 - The term card is read off the app BEHAVIOUR FIRST: the two positions get their own line, the panel carries the colour, the menu replaces the acts, and every settled row can be re-opened.**
  Owner, on a card reading «Fuel Responsibility  Your choice: not set · Supplier: 24 hours»: *"even
  these make it middle and more visible + add borders to the buttons and make the red or the gree on
  the panel iteslf like the app"*, then *"follow the app behavioru when u finish one term the other
  then opend and u can open it by yourself but now i clciked on conflict it doesnt open"*, *"also
  allow edit on the terms like the app too. so check if we dont differ on anything in behaviour from
  the app"*, *"for log use it proper modal not very small. show it like real modal"*, and *"also the
  buttons language of keep mine, choose another etc, they have some conditions"*.
  Read against `counter_offer_flow/{term_cards,negotiate_tones,counter_offer_terms_page}.dart`.
  **FOUR of the nine are BEHAVIOUR**, and they are the ones worth reading.
  (1) 🔴 **PRESSING A SECTION OPENED AN EMPTY BODY, which is his «i clicked on conflict it doesnt
  open».** A section draws ONLY the active card, and the active card is the first unanswered row of
  the WALK - so a conflict that was not next in the walk rendered nothing at all, and its header
  expanded onto white. The app never meets this because its walk reaches conflicts after the pending
  rows and the reader arrives at an open one. `openSection(rows)` sets `forcedTerm` to that
  section's own first unanswered term. ⚠️ **The SAME lever a press on a settled row uses**, never a
  second one: `activeKey` still falls back to the first unanswered row, so the walk carries on by
  itself once the forced term is answered.
  (2) 🔴 **THE OPTIONS REPLACE THE TWO ACTS; they were standing beside them.** The app is an
  `if/else` (`if (!optionsOpen) _ActionRow(...) else _OptionsPanel(...)`). Drawn together, the
  button that just opened the menu stands there inviting a second press and «Accept» sits beside a
  list of values as if it were one of them.
  (3) 🔴 **THE PICKER PRE-TICKED THE SUPPLIER'S VALUE**, which the app forbids in its own words:
  the panel opens because the reader wants a DIFFERENT value, so ticking the one on file *"answered
  the question before they had"* - and a tick meaning «what you have now» sat a row under a tick
  meaning «agreed». ⚠️ **`myVal` is NOT the right value either, and that is the trap.** Re-opening
  clears the resolution, after which `myVal` falls back to `renteePreference` - what she asked for on
  the REQUEST, not the answer she gave on this card. `reopenedVals` remembers the cleared answer (the
  app's `_reopenedValues`) and `pickedVal` reads that or the standing resolution, nothing else.
  (4) 🔴 **A TERM THE SERVER SETTLED HAD NO WAY BACK** (*"allow edit on the terms like the app
  too"*). The ↻ button was drawn only where the renter had a resolution of her OWN, so an agreed
  term was final on the web and re-openable in the app. It is a **pencil glyph** now, on every
  editable settled row, and the WHOLE ROW is the target - the app's own note: *"the pencil IS the
  reopen affordance … a settled term a reader cannot re-open is a decision they cannot take back"*.
  ⚠️ `onReopenLocal` runs BEFORE `setForcedTerm`: forcing a term that still carries its answer
  opens the card with the answer already given, which is the state she is trying to leave.
  **THE SKIN, sampled rather than eyeballed:**
  (5) **The two positions take their own centred line.** ~~At the end of the NAME's row, so the
  longer the term's name the smaller its two answers, and the values ellipsised before the label
  did.~~ 12.5px with values at 14px/800. The app moved the same line for the same reason
  (`NegSidesLine`); the CENTRING is where this departs from it, on his word.
  (6) **The panel carries the colour and the button keeps its own**, which are NOT the same value.
  ~~The clash card wore `--danger-soft` flat, the exact fill «Choose another» wears, so the button
  vanished into its own card.~~ The app's note says why it keeps two: *"the ground is PALER than
  kNegRedBg on purpose - the «تغيير» button IS #FDECEC, and a button the same colour as the card it
  sits on stops looking like a button."*
  ⚠️ **The percentages are SAMPLED from the app's hexes over white**, not chosen: `kNegRedTint`
  (#FEF8F7) is the danger token at ~4% and `kNegRedBorder` (#F6D2CE) at ~26%; `kNegBlueBg`
  (#EAF2FB) is ~10% with `kNegBlueBorder` (#CFE1F5) at ~20%. A pending card is a full BG where a
  conflict card is a TINT - the app's own asymmetry, because pending holds no open menu to stay
  readable over.
  (7) 🔴 **A PENDING CARD TURNS RED WHILE ITS OPTIONS ARE OPEN**, which restores the app's rule and
  ~~withdraws this log's own of 2026-09-22 («`.picking` follows whichever state the card is in
  rather than forcing red»)~~. Opening the menu IS choosing to disagree.
  (8) **A SETTLED ROW IS GREEN, and RED when she countered** (`differs ? kNegRedBg : kNegGreenBg`).
  The ✓ and the ✎ at 11.5px were the only thing separating «I took his value» from «I refused it»,
  so a page of answered terms said nothing about which way any of them went. ⚠️ The FULL soft fill
  here, not the pale tint the live cards wear: a settled row holds no button to stay readable.
  (9) **The buttons take the app's `btn()` metrics**: a real `BorderSide`, radius 10, 8px vertical,
  14px/700 centred, each half `flex: 1`. ⚠️ The border is what lets them sit on a tinted card at
  all. The option pills take theirs too (12/7, full round, 13px/700).
  (10) **The log is a real modal**: ~~460px and only as tall as its content~~, now 760 x
  `min(78vh, 700px)`. ⚠️ A stated HEIGHT, not a cap - `max-height` alone lets a short log collapse
  under its own tabs, and the empty state then has no panel to be centred in.
  ⚠️ **The button LABELS were checked and are already right**, which is the answer to *"they have
  some conditions"*: the app's three flags are `changeIsChooseAnother` (pending - nothing of mine
  stated), `changeIsKeepMine` (`_twoValued`, a conflict whose menu holds only the two values on the
  card) and neither (a real menu). The web's `changeLabel` is the same three tests. Nothing changed;
  said out loud rather than silently skipped.
  Files: `src/components/deal-room/DealRoom.tsx`, `src/components/deal-room/deal-room-proto.css`,
  `tests/unit/negotiation-sheet.test.ts` (8 new cases, 2 re-pointed; 37 passing).
  ⚠️ Verified: typecheck clean, lint 0 errors, 37 passing in the sheet's own suite and 130 across
  the five deal-room / chat / pin suites, and four rulings break-checked one at a time (the picking
  red removed, the centring removed, the acts drawn beside the menu, the supplier's value pre-ticked
  again) - each went red alone.
  🔴 **`sed -i` STRIPPED EVERY CR FROM `DealRoom.tsx`**, converting 2,812 lines to LF in one
  command - the fourth time this repo has logged that trap and the first time inside `src/`.
  Caught and restored before the gate. **Use the file tools or a Python rewrite that opens with
  `newline=""`; `sed` on this machine is not safe on a CRLF file.**
  🔴 **NOT SEEN RENDERED.** Every one of these needs a signed-in renter with a live deal room and a
  supplier's standing round, so the colours are argued from the app's own sampled hexes and the
  behaviours are pinned by cases rather than watched. The first thing to look at is the tinted card
  with its two bordered buttons on it: the whole of ruling (6) is that those three tones stay apart.

- **2026-09-23 - PENDING terms are the SLATE, not the mustard, and the pair they replace never passed AA.**
  Owner: *"pending terms in the terms modal must be grey or light blue not this yellow"*.
  ~~`--warn` on `--warn-soft`.~~ **`--info` on `--info-soft`** in `BidTermsModal`'s `TONE` map, which
  is read by the bucket header, its dot, its count, the progress bar's segment and the summary chip —
  so one line moves all five and they cannot drift.
  🔴 **The old pair FAILED contrast, and nobody had measured it.** `--warn` (#b98a1d) on
  `--warn-soft` (#f7edd8) is **2.69:1**, under the 4.5 a normal-size label needs; `--info` on
  `--info-soft` is **6.46:1**. So this was an accessibility fix wearing a colour change's clothes.
  ⚠️ **Two reasons beyond the instruction**, and both are ones this repo has already written down:
  `--warn` in this palette is a MUSTARD rather than the amber the app draws — the same mismatch
  corrected on the canvas's provenance ring (2026-09-08) and the off-catalogue box (2026-09-12) —
  and it is a FILL token, where `--warn-deep` is the one that may carry text. And **pending is not a
  WARNING**: it is the ABSENCE of a verdict, and painted the colour of caution it read as a problem
  beside the red bucket directly above it.
  ⚠️ **`--info` is this palette's slate, in the ink family.** It has no true blue by design
  (2026-09-06), and the COMPARISON's terms band already uses it (2026-09-13) — so a term awaiting an
  answer is one colour across the two surfaces that count them.
  ⚠️ The other two buckets are untouched: red still means a clash, green still means settled.
  Files: `src/components/requests/BidTermsModal.tsx`,
  `tests/unit/bid-terms-panel.test.ts` (3 new cases; 22 passing).
  ⚠️ **The contrast case COMPUTES from the tokens** rather than asserting a number in prose, so
  re-tinting either token re-runs the sum instead of leaving a stale claim behind. It also pins that
  the replaced pair was below the bar, as the record of why.
  ⚠️ Verified: typecheck clean of this work, 158 passing across the panel, palette and ds-colour
  suites, and break-checked — the mustard put back, one case went red.
  🔴 **NOT seen rendered**: the modal needs a signed-in renter with a bid, and the browser extension
  is still disconnected. The tones are tokens and the contrast is arithmetic, so what wants a look is
  only whether the slate reads as «light blue» to him or as grey.
  🔴 **Another session's breakage, unchanged and NOT mine**: `DealRoom.tsx:1546` (`nothingSent`
  unused) now joins `ProfileView` / `CompanyHub`'s `onViewDetails` and the unparseable
  `tests/unit/bid-cards-rail.test.ts`.

- **2026-09-23 - A link to a conversation now OPENS it, the request strip leaves every chat, and the price bar takes its place under the header.**
  Owner, with a staging URL that showed nothing: *"https://webstaging.moedatech.net/inbox?bid=… doesnt show chat in inbox"*, then, on the
  strip naming the request: *"for the price header of the chat make it in place of [it] — this one
  can be removed from any chat surface and here in the inbox replace it with price header and make
  the show details beside it not below the number"*.
  (1) 🔴 **`/inbox?bid=<id>` opened nothing, and there were TWO causes — either alone enough.**
  The pane was keyed on a row found in the received-bids feed this screen holds, so a bid off that
  page had no pane at all; and the card behind it was read with `fetchBids(requestId)`, **which
  answers EXACT-SIZE bids only** (`sizeMatch` defaults to exact, 2026-09-08), so a bid on a larger
  machine could never be in the answer and the pane waited on a card that would not arrive. A
  permanent spinner, from a link.
  **`fetchBidDetail(openBidId)`** now reads the bid by the id the URL carries — whatever its size,
  wherever it sits in the feed. That is what makes a pasted link, a notification and a Back from the
  equipment map all land on the conversation.
  ⚠️ **It hands back the REQUEST too**, so the price bar is priced without the list having to load
  first. `openRow` survives for the LIST's highlight alone and nothing the pane draws depends on it.
  ⚠️ **`RequestRecord` carries the RAW `estimatedDurationDays`**, never `RequestListItem`'s derived
  `durationDays` — which typecheck caught as `{} | null`. The fallback is `durationDaysBetween`,
  the same helper the list mapper uses at its own call, because two derivations of one window is how
  a bid comes to read as two totals on two surfaces.
  ⚠️ **A failed read SAYS so.** A bid that is gone or a dropped request used to spin for ever.
  (2) 🔴 **`.bm-chat-req` is REMOVED from every chat surface** — the `assignment` chip carrying the
  request's short code, its machine and its site. On the MAP it restated the panel beside it, which
  is the request's own surface; in the INBOX the row that opened the conversation names the same
  machine under the same RFQ code, one column to the left. A band that repeats its neighbour costs
  height on the one element with none to spare. Markup and rules both, rather than left inert.
  (3) **The price bar moved INTO the slot it vacated.** It was above the whole dock, which put it
  over the counterparty's own name; it now sits directly under the identity band, where the renter
  reads it before the conversation.
  ⚠️ **A SLOT (`belowHeader?: ReactNode`), not a prop the dock interprets.** The dock neither prices
  a bid nor knows what a counter is; handing it a node keeps the money with `PriceFooter`, which owns
  the `?act=` hand-off into the negotiation sheet, and leaves the dock responsible only for where it
  sits. The map passes nothing and draws nothing there.
  (4) **«Show details» sits BESIDE the figure** in the slim bar. The full-height bar stacks the rate
  over its link because it has 58px to do it in; at 46 that second line is what made the slab feel
  tall. `.bm-foot-figs` is a baseline ROW under `.is-slim`.
  Files: `src/components/inbox/InboxView.tsx`, `src/components/map/ChatDock.tsx`,
  `src/components/map/map-proto.css`, `tests/unit/inbox-two-pane.test.ts` (3 cases re-pointed,
  5 new; 33 passing).
  ⚠️ **`reqTerms` was swept rather than left**: the price bar reads the detail's own request now, so
  the map it was building had no reader. Lint caught it.
  ⚠️ Verified: typecheck clean OF THIS WORK, lint 0 errors, **387 passing across eight inbox, dock,
  map and palette suites**.
  🔴 **NOT seen rendered**, which is the gap that matters here: the bug was reported FROM staging
  and the fix is argued from the two call signatures rather than watched. The browser extension has
  been disconnected since the previous batch.
  🔴 **ANOTHER SESSION IS COMMITTING THIS TREE.** `08114c92` carries my inbox work, pushed by them
  — which is how a staging URL for it existed at all. `npm run typecheck` currently reports their
  `onViewDetails` across `ProfileView` / `CompanyHub`, and `tests/unit/bid-cards-rail.test.ts` does
  not PARSE: a regex literal opened at line 139 runs across a line break. Reported, NOT fixed.

- **2026-09-23 - The company logo is matched to the app: it is the mark on the company card, and it can be changed and removed.**
  Owner: *"now users can upload a logo to their companies right?"*, then *"match it"* once the answer
  turned out to be only half yes. Read off `company_logo_editor.dart` and `company_page.dart:765`.
  🔴 **The web could SET a logo once and never touch it again.** `PUT /api/me/profile` wrote the
  key behind `if (str(body.companyLogoKey))`, which drops an EMPTY string, and an empty key is the
  backend's own clear (`input.companyLogoKey || null`, exactly what the app sends from
  `_save(kind, key: '')`). So remove could not be built at all, and the only two links to the logo
  dialog (`?logo=1`, from the quotation and the deal room) both carry `!companyLogoUrl` - they vanish
  once a mark exists. A renter with a logo had no door anywhere in the web. Three states now: absent
  leaves it alone, empty removes it, a key sets it.
  🔴 **The mark is the company card's avatar**, which is where the app puts it. The generic
  `business_center` disc said «a company» on a row that already names which one, while the logo the
  renter uploads was printed on his quotations, his shared link and the bid form suppliers open and
  was invisible to him. Owner taps it to add, change or remove; initials while there is none.
  ⚠️ **Owner-gated, and withheld rather than disabled** (`CompanyLogoEditor.isOwner`). A member
  sees the same mark with no press and no dashed edge: an «add» affordance a member cannot use reads
  as a fault, not as a rule.
  ⚠️ **A half-filled profile is told, not refused.** `updateProfileSchema` extends
  `completeProfileSchema` and makes all four names `min(2)`, and there is no logo-only PUT, so the
  four ride every call including the clear. Without the app's `_blockedReason` a renter who verified
  a company before finishing his profile taps an ordinary-looking control and gets a raw 422.
  ⚠️ **Remove asks first, in the same box.** It takes the mark off three documents at once,
  and the app confirms too. One dialog, two states, never a second layer.
  Files: `src/app/api/me/profile/route.ts`, `src/components/company/CompanyLogoModal.tsx`,
  `src/components/company/CompanyHub.tsx`, `src/components/profile/ProfileView.tsx`,
  `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`, `tests/unit/company-logo.test.ts`,
  `tests/unit/profile-company.test.tsx`. Copy is the app's own, string for string.
  ⚠️ Still divergent, reported not fixed: the app's control is role-aware and edits the STORE
  logo for an active supplier (`PUT /suppliers/me/store`), deliberately giving a supplier no separate
  company logo. The web is renter-side only, so it keeps `companyLogoKey` and has no store to hang a
  mark on. `CompanyDetails` still maps `logoUrl` and never draws it; the card is where the app shows it.

- **2026-09-23 - The profile shows every field the form collects, and the company's papers have a door again.**
  Owner, with a screenshot: *"first i must view all fields here, why the company name not shown, also
  for company entity in the app he can view its details and edit, use the same endpoints here"*.
  🔴 **The read-only grid was hiding a field the form DEMANDS.** `{!firmName && ...}` dropped the
  COMPANY row whenever a firm existed - the 2026-09-07 answer to *"yesr test and EQ Rental, 2 names?
  which one"*. That reasoning expired on 2026-09-21, when `profile.companyName` became the fourth rung
  of `counterpartyDisplayName` and the field became required on the complete pass. A field the form
  makes mandatory and the grid refuses to print reads as a field that failed to save. Both names are
  drawn now, each once, told apart by their labels: his display name under COMPANY, the firm in its own
  row below. `firmName` and its orphaned comment are gone.
  🔴 **The particulars are readable again, on the app's own condition.** `CompanyDetails` was
  removed from the page on 2026-09-07 (*"even in the company details don't show it"*) and that ruling
  stands - stacked under his own details it made the profile a filing cabinet. What was wrong is that
  it then had nowhere to be read AT ALL. It is a `Dialog` now, opened by a Details press on the company
  card. It self-fetches the two endpoints the app reads: `/api/verification` for the submission and
  `/api/verification/docs` for the presigned papers.
  ⚠️ **View and edit answer to DIFFERENT conditions, and that is the app's rule, not a taste**
  (`company_profile_card._verificationSection`, on `supplierStatus` 0 none / 1 pending / 2 verified /
  3 rejected). Anything submitted can be READ - 1, 2 and 3. The FORM is offered only on 0 and 3: a
  submission under review must not be sent twice, because that stacks a duplicate for the reviewer. The
  web already gated its form that way; only the read half was missing. A rejected submission gets both.
  ⚠️ **The press is drawn on the no-company card too.** Verification is what CREATES the firm,
  so between sending the papers and a reviewer approving them there is no company row to hang it on, and
  his own submission is the one thing he can still look at.
  Files: `src/components/profile/ProfileView.tsx`, `src/components/company/CompanyHub.tsx`,
  `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`, `tests/unit/profile-company.test.tsx`.
  ⚠️ Still divergent, reported not fixed: the web cannot CLEAR a stored company name
  (`updateProfileSchema` has no partial clear) while the app allows it.

- **2026-09-23 - The negotiation sheet, fifteen notes: the price box keeps the caret, the step rail goes, the header names the MACHINE, and the terms are read off the app.**
  Owner, a batch with two screenshots - the original Arabic sheet and the current English step ①.
  🔴 **THE ONE THAT WAS A DEFECT, and its cause is worth the entry on its own** (*"there is a bug
  that i cant write into price box it takes me out after each character"*). `PriceCell` and `Qty` were
  declared INSIDE `CounterFlow`'s render body. A component defined in a render body is a NEW function
  identity on every render, and React compares element types by IDENTITY - so every keystroke
  unmounted the subtree and mounted a fresh `<input>`, taking the caret with the old node.
  ⚠️ **Nothing downstream can fix it**: memoising the parent, the value or the handler does not
  make two function objects the same type. Hoisting is the fix. `changedFrom` and `numOf` moved out
  with them, so there is still ONE comparator deciding whether a figure has left the supplier's.
  ⚠️ **A case pins the POSITION**, because that is the whole of the bug - and the first three test
  edits did NOT pin it: renaming the hoisted component left them all green. Proved by doing it.
  **The other fourteen, in his order:**
  (1,2) **The sheet is ONE WHITE SURFACE.** ~~A white paper centred on a grey desk~~ - the prototype's
  own shape, and three greys on a screen holding one document. The paper COLUMN survives at 940px: it
  is the measurement, not the colour.
  (5) **The factors sit BESIDE the name** (*"put the formula beside the title not below it"*).
  `flex-direction: column` made every summary row two lines tall; the formula is a gloss on the name.
  ⚠️ `flex-wrap`, so a long name plus a three-factor formula drops rather than pushing the figure
  off its column.
  (6) 🔴 **NO STEP RAIL.** ~~① Price —— ② Terms —— ③ Review, argued the previous morning as «what
  makes three pages read as three SHEETS».~~ It was `aria-hidden` and unpressable - a band of the
  sheet spent on decoration. Asked what would say which sheet he was on, he chose **the footer button
  alone**: it names where the press GOES, and nothing names where he IS. His trade, taken explicitly.
  🔴 **Its CSS went with it and an ORPHAN rule was left behind on the first cut** - `.ng-steps
  .bar.done`, one line past the block I removed. That is the exact fault that broke the staging build
  for a day on 2026-09-19. The suite caught it; `next build` would have been the only other thing that
  could.
  (7) **The header names the FIRM and the MACHINE** (*"dont mention request id"*). 🔴 This reverses
  the previous morning's «the short code is restored under the name». Inside a sheet opened FROM the
  request the code answers nothing, and on a multi-item room it cannot say which line is being
  negotiated. The machine and its size can; the code is still on the log, the quotation and the room.
  (8) **BEFORE → AFTER on the header's figure**, his pick of three placements. It starts as the
  supplier's standing rate and stays that until the renter moves it; from then the original is struck
  through beside his own. ⚠️ `counterRate` is null until `changedFrom` says something moved - the
  same comparator the price cells paint with, so the bar and the cell cannot disagree.
  (9) **«supplier's declaration» is gone from a pending card.** It repeated, in grey under the term's
  name, the half of «Your choice: X · Supplier: Y» sitting one line below. ⚠️ The other two
  survive and are NOT the same fact: «from your request» and «platform default» name a value with no
  party behind it, which the side row cannot say.
  (10,11) The values run 12/13px over the 12.5px label, so the figures being argued over outweigh the
  term's name; the two acts are **centred** under the question rather than pinned to one edge.
  (12) **Read off the APP, exactly** (his answer when asked how far to go). The green button is
  `dealRoomAccept` = **«Accept» / «قبول»**, not «Take theirs» - and the Arabic here was ALREADY
  «قبول», so the two locales had been naming one button differently. The three red labels already
  matched. 🔴 **A CONFLICT is red and a PENDING term is BLUE**, which is the app's own 2026-09-17
  ruling (*"grey read as chrome on a grey page"*): both wore `--danger-soft` here, so the state that
  needs an answer looked like the one that has gone wrong.
  ⚠️ **«Even the colors» could not be taken literally, and the APP says why.** Its
  `negotiate_tones.dart` carries the prototype's own greys with a note that they are *"private to the
  negotiate flow"* and *"nothing else in the app should import this file"*; `palette-drift` forbids a
  raw hex in `src/` at all. So each is the nearest house token - `--info` for the pending blue, a
  slate in the ink family where the app is a shade cooler. The same trade every ported prototype in
  this repo has made since 2026-09-06, and it is recorded at the rule rather than left to be noticed.
  (13) **The options are always drawn, and they run ACROSS.** ~~A hidden column, revealed by pressing
  «Choose another».~~ A press that reveals three chips buys nothing, and a column made a two-option
  term as tall as its own card. ⚠️ Still withheld on «Keep my choice», which has no menu by
  construction: the only alternative there is the value she already holds.
  (14) **The quotation sits beside the history, on EVERY step.** It was a link at the foot of step ③,
  so a renter pricing step ① had to walk forward twice to read what he was changing. They are the
  footer's REFERENCE pair - what has happened, and what it adds up to.
  (15) **The review's terms open by default.** A summary that hides what it summarises asks for a
  press to do the one thing the step exists for.
  🔴 **PINS: the sheet had ONE (`55`) and no parts**, so all fifteen notes had to be resolved by
  quoting visible text - which is the round trip pins exist to save, and this is the surface he sends
  the most notes about. **55.1 … 55.8** now: the sheet, the header, the three steps, the summary, the
  open term card and the footer.
  Files: `src/components/deal-room/DealRoom.tsx`, `deal-room-proto.css`, `src/lib/uiPins.ts`,
  `docs/ui-{pins,surface-map}.md` (regenerated), `tests/unit/negotiation-sheet.test.ts` (5 cases
  re-pointed to the reversals, 3 new; 28 passing).
  ⚠️ **Five cases pinned rulings this batch withdrew and NONE was weakened**: the short code, the
  step rail, the answers column, the paper's grey desk and the band count (4 → 3, because a band went).
  Each is rewritten to the new rule in his words.
  🔴 **An assertion failed on its own explanation for the NINTH time**, twice here: the deletion
  note names `.ng-steps` while saying it is gone. The suite reads a comment-stripped copy of the
  stylesheet now (`CSS_CODE`), which is the fix the component suites already use.
  🔴 **The `FLOW` slice had to move and now ASSERTS ITS OWN ANCHOR.** It sliced from
  `function CounterFlow(`, and the hoisted components sit above that line; a bare `indexOf` returning
  -1 would have sliced from the END of the file and left every `not.toMatch` passing vacuously - the
  trap logged for `cancel-confirmation` and the intake's class-string anchor.
  ⚠️ Verified: typecheck clean, lint 0 errors, **308 passing** across the seven sheet, pin,
  term-state, chat, palette and token suites. The hoist break-checked by putting `PriceCell` back in
  the render body - it went red alone.
  🔴 **NOT SEEN RENDERED.** The sheet needs a signed-in renter with a live deal room and a
  supplier's standing round. Per item, the one thing to look at: the price box taking a whole number
  without losing focus; the header reading «Gulf Co · Crawler Excavator · 20 ton» with the struck
  original beside the total once he edits; the terms page with a blue pending card and a red conflict
  one; and the options wrapping rather than overflowing on a term with six.
  🔴 **`deal-room-quotation` is RED and it is NOT this batch**: proved by stashing
  `src/lib/quotation/` - another session's in-flight edits to `render.ts` and `bid-quotation.ts` - and
  watching the suite go green at 26 passing. Reported, not touched.

- **2026-09-23 - The bid map, five notes: the verified tick was BLACK, two images did not fit their frames, the two document controls were two shapes, and the ask card named a machine with a tractor.**
  Owner, one batch of five screenshots: *"make it green"*, *"make sure the images fti the circule or
  the side rectangle"*, *"make the equipment documents the same style as company documents (same
  corner rounding- and with >)"*, and on the ask card *"it is trash and the euqipment must show the
  image or the fallback image used on the equipemtn card not this selly icon and the card must be
  clean and organized"*.
  **Four of the five were DEFECTS with a traceable cause, not preferences**, which is the only
  interesting thing about this batch.
  (1) 🔴 **`--verified` was never DECLARED.** The theme block mirrored `--color-verified` and
  `VerifiedMark` filled its rosette with `var(--verified)`, but no `:root` ever defined the token —
  so the whole chain resolved to an invalid value, `fill` fell back to its initial **BLACK**, and the
  badge rendered as a dark blob on every surface that draws it. `#2f9e5c`, the value `--shop-ok`
  already carried under the comment *"the verified tick"*, so the storefront's tick and this one are
  one green.
  ⚠️ **NOT `--ok`.** That is the app's «this went well», and `VerifiedMark`'s own header says a badge
  drifting with a status colour stops being a badge.
  🔴 **A comment cost 46 colours.** `ds-colors.test.ts` reads `:root` by slicing to the FIRST
  occurrence of the theme directive's name — and the note explaining the fix mentioned it, which
  truncated the block and made every token after it read as undefined. 76 cases went red on prose.
  The comment now says so where the next person will meet it.
  (2) 🔴 **`contain` fits a drawing to the BOUNDING SQUARE, and the marker is a CIRCLE.** A wide
  excavator therefore touched the left and right edges exactly where the curve cuts in, and the rim
  sliced its tracks and its boom off. The largest square inside a circle of diameter D has a side of
  D/√2, which at 66px is 46.7: the drawing is inset **9px a side** and now sits within the curve
  whatever its aspect. `center` replaces `center bottom`, an anchor that belonged to the
  free-standing object this used to be and which pushed the drawing onto the rim.
  ⚠️ The PHOTO arm keeps `inset: 0` and `cover`: a photograph has no transparent ground, so filling
  the disc is what makes it read as a picture rather than a stamp in a ring. Same split as `fitOf`.
  (3) 🔴 **A SURFACE RULE beat a COMPONENT's own invariant, and this is the second time in one
  batch.** `.mp-viewer img { object-fit: cover }` is specificity 0-1-1; `PhotoPlaceholder`'s
  `object-contain` utility is 0-1-0 — so the panel cropped the platform's own «No Equipment Photo
  Available» artwork and cut its words off, which is precisely the broken-photograph look that
  component's comment exists to prevent. Its fit is INLINE now, asserted once where the artwork is
  rather than in each frame that holds it.
  (4) **«Equipment documents» takes `.bm-docsentry`'s shape**: `--radius-lg` in place of
  `--radius-sm`, and a chevron. The header one band up opens the FIRM's papers and this opens the
  MACHINE's; they were a rounded pill with a `›` and a square tile without one, a row apart, for one
  act. ⚠️ The chevron flips with the LOCALE rather than by a transform, which would mirror its
  weight with it.
  ⚠️ **The element in the screenshot was the SELECTED state** (`.bm-eq.on .bm-eq-open`, navy on
  navy), which is why it read as a dark rectangle and not as the grey tile the resting card draws.
  Worth writing down: the first search for it went to `.mp-tab` and would have restyled the wrong
  control.
  (5) **The ask card draws `MachineGlyph`**, the drawn side-on excavator every other no-artwork
  surface falls back to. ~~`equipmentIcon(view.title)`.~~ That map takes a machine FAMILY to a glyph
  NAME, and for anything it cannot place the answer is a tractor or the factory arm this product
  retired — so the one surface that quotes a machine back to a supplier named it with a mark from
  another industry. It joins the glyph's call-site contract; a case pins that it left the name-based
  map's callers.
  ⚠️ **The MAP's markers still take that map and must**: a `divIcon` is an HTML string, where a
  React component cannot go. The split is recorded in both places.
  **And the card's layout**, which is the «clean and organized» half: the title is clamped to TWO
  lines instead of cut mid-word — «Case PC · Crawler Exc…» named a make with no machine after it,
  inside a 240px column that also holds a 40px tile and a chevron. ⚠️ Clamped at two and never
  uncapped: the column sits beside the ask's own sentence and the card takes the taller of the two.
  ⚠️ **`-webkit-line-clamp` is inert without all three of `display: -webkit-box`, `-webkit-box-orient`
  and `overflow: hidden`** — and inert here means an unclamped title growing the card, which is
  worse than the clip it replaces.
  ⚠️ The chevron is pinned to the column's TRAILING EDGE. It chased the ellipsis, so it read as part
  of the truncated word rather than as the way into the machine.
  Files: `src/app/globals.css` (`--verified`), `src/lib/ds-colors.ts`,
  `src/components/map/map-proto.css`, `src/components/map/request-card.css`,
  `src/components/map/RequestCard.tsx`, `src/components/map/EquipmentList.tsx`,
  `src/components/Photo.tsx`, `tests/unit/machine-glyph.test.ts` (the ask card added to the
  contract, 1 new case; 13 passing).
  ⚠️ Verified: typecheck clean OF THIS WORK, lint 0 errors, **317 passing across eight map, glyph,
  card and palette suites**.
  🔴 **NOT SEEN RENDERED, and it should have been.** A specimen carrying the real `map-proto.css`
  and `request-card.css` was built and served for exactly this — the ask card, both document
  controls in all three states, the marker with a drawing and with the glyph, and the tick — and the
  browser extension DISCONNECTED before the first screenshot. It is at
  `scratchpad/mapbits.html`. The four causes above are each proved by reading (a missing token, a
  specificity pair, the inscribed-square arithmetic, a glyph map's own fallback); the two-line title
  and the 9px inset are the two that most want a look.
  🔴 **ANOTHER SESSION IS WRITING TO THIS TREE, still.** `DealRoom.tsx` changed at 23:56 and
  `ProfileView.tsx` at 00:06, and `git log` moved to `08114c92` mid-batch. `npm run typecheck`
  currently reports three `onViewDetails` errors across `ProfileView.tsx` and `CompanyHub.tsx` —
  their half-landed change, reported and NOT touched.

- **2026-09-22 - An OFF-PLATFORM bid carries no «Counter this price», because it never could.**
  Owner, on a picture of one that did: *"how offline bids has counter this pruce, remove"*.
  🔴 **It was not merely wrong to OFFER — the press could not work, and said nothing when it
  failed.** `openCounter` calls `ensureDealRoom(card.id)`, and an off-platform card's id is
  `link-<submissionId>`: a `LinkBidSubmission`, which is **not a `Bid` row**, so the call 404s and
  that function's `catch` swallows it by design (*"a failure leaves the renter where he is rather
  than dumping him in a room he did not ask for"*). The renter pressed a full-width orange bar and
  nothing happened, with nothing on screen saying why.
  ⚠️ **And the band had nothing to say on such an offer anyway.** Every state it carries — «new
  message», «awaiting the supplier», «offer updated», the counter itself — is a fact about a DEAL
  ROOM, and an off-platform supplier has no account, no Stream channel and no room.
  ⚠️ **The whole BUTTON is withheld rather than drawn dead.** `bandDead` is the terminal state of a
  LIVE negotiation («Deal closed»), so a grey bar saying that over an offer nobody ever negotiated
  would be a claim about a conversation that never happened.
  ⚠️ **What the card keeps is what is real for him**: «View quote», and «Invite to Moedatech» —
  which is the route by which this supplier could one day be countered at all, so the removal must
  not take the way ONTO the platform with it. A case pins that.
  ⚠️ **TWO enforcement points, the argument `bid-equipment-access.ts` already makes for the same
  shape**: the band is not drawn, and `openCounter` refuses an off-platform bid anyway. An entry
  point is not a boundary — the terms modal reaches that function too, and a later caller would
  otherwise inherit a call that 404s in silence.
  Files: `src/components/workspace/BidCards.tsx`,
  `tests/unit/offline-bid-no-counter.test.ts` (new, 6).
  🔴 **A POSITIVE CONTROL caught a vacuous slice while the suite was being written**, which is the
  whole argument for having one: `CARD.indexOf("ensureDealRoom")` matched the file's own IMPORT, so
  the slice ran backwards and gave an empty string that every assertion under it passed against. It
  searches from the function's own offset now.
  🔴 **And the first break-check came back GREEN, which is how the case got stronger.**
  `{!offline && (` appears TWICE in this file — a header chip takes the same condition — so a
  `toContain` on the bare guard survived the band's guard being deleted. The case anchors on the
  band's own button now, and the re-run went red with the guard removed and green with it back.
  ⚠️ Verified: typecheck clean, lint 0 errors, **133 passing across seven bid-card, inbox and
  season suites**.
  🔴 **NOT seen rendered.** The card needs a signed-in renter holding an off-platform submission,
  and the change is the removal of one element from a card that has shipped for weeks otherwise
  unchanged — so what is pinned is which element exists, by the cases above.

- **2026-09-22 - Send Code stays in its disabled skin until the phone number has exactly 9 digits.**
  Owner, on the sign-in modal: *"make the button orange only when the number is allowed to send"*.
  The gate was `!digits.trim()`, so one keystroke lit it orange and the backend refused the short
  number afterwards. Rule copied from the mobile app (`login_page.dart` `_canSubmit`: length == 9),
  counted on digits only so spaces typed in the field do not count.
  Files: `src/components/auth/PhoneEntry.tsx`.
  ⚠️ `0501234567` (10 digits, leading zero) is refused, as it is in the app. Reaches the auth modal
  AND the legacy `/login` page, which share `PhoneEntry`.

- **2026-09-22 - The season says NOTHING in words on the bar, and every one of its greens goes a step darker.**
  Owner, with a picture of the mark: *"remove this and can u make the all greens color of the national
  day theme more darker? a little bit"*.
  (1) 🔴 **`.nd-mark` is REMOVED from the header** — the outlined ordinal, the gold hairline and
  «National Day» beside the wordmark. **That is the FOURTH answer to one caption in six days**: the
  kit's gold PILL landed on the bar on 2026-09-16, the dashboard band's MARK replaced it on
  2026-09-17 (*"remove the 96 from the cta and just make this style instead of the 96 pill on
  header"*), and now the bar carries neither.
  ⚠️ **The division that survives is the one that was always better.** The bar still wears every
  seasonal piece that is not WORDS — the three-stop gradient, the 20px dot lattice, the four-palm
  grove and the rank of gold Najdi triangles along its bottom edge. A caption is the one piece that
  has to be READ rather than merely seen, and the bar is the product's own chrome.
  ⚠️ **Deleted, never left inert**: the markup, the four `.nd-mark*` rules, the `seasonOrdinal`
  import and the specimen's copy. Same ruling the dune sweep took on 2026-09-17 — an unused seasonal
  rule is one edit away from coming back by accident, and a strike-through carries the reasoning
  without carrying the code. `seasonOrdinal` itself SURVIVES: the guest wall's head strip still
  draws it.
  🔴 **Pin 2.5 is RETIRED, not renumbered**, which is the `CarryForwardModal` rule of 2026-09-09: a
  number that has been quoted in a note must not come back meaning something else.
  ⚠️ **Two traps were lifted out of the deleted block before it went**, because both outlive it:
  a width rule on a seasonal host belongs in the STYLESHEET and never as a `max-sm:hidden` on the
  element (Tailwind emits its utilities inside `@layer utilities`, the seasonal block is unlayered,
  and unlayered CSS beats layered CSS outright at every width); and `-webkit-text-stroke` is the only
  way to outline text, so an outlined figure always needs a filled fallback under an `@supports`. The
  phone-rule case is re-pointed at the RULE rather than at the element, so the next host added to
  this bar is covered by it.
  (2) **Every National Day green is at 85% of the kit's own value**, channel by channel, so the HUE
  is untouched and only the depth moves:
   — `--nd-ground` #00542a → **#004724** (the bar's ground)
   — `--nd-deep`   #05351f → **#042d1a** (the gradient's dark corner)
   — `--nd-mid`    #0a7a3e → **#096835** (the gradient's light corner)
   — `--nd-green`  #006c35 → **#005c2d** (the flag's green — the solid chip, the corner ribbon)
   — `--nd-ink`    #0d5c3e → **#0b4e35** (the pale chip's ink)
  ⚠️ **`--nd-mint` (#e8f2ea) is deliberately NOT moved.** It is the pale chip's ground on a LIGHT
  surface, near-white by design; darkening it would turn the one quiet weight in the kit into a
  second solid chip.
  ⚠️ **Every value moved is a GROUND under white text, so this is strictly safer.** Measured rather
  than assumed: white on the ground goes **9.12:1 → 10.90:1** and on the gradient's lightest corner
  **5.43:1 → 6.90:1**. The gold seam and the hairline gain contrast with it.
  ⚠️ **`ds-colors.ts` moved in the same edit**, because `ds-colors.test.ts` requires every colour
  `:root` defines to be named in both places — so a darkening applied to one and not the other fails
  there rather than on a screen nobody is looking at.
  Files: `src/app/globals.css` (5 tokens, the `.nd-mark*` block deleted), `src/lib/ds-colors.ts`,
  `src/components/AppShell.tsx`, `src/app/dev/preview/specimens.tsx`, `src/lib/uiPins.ts` (2.5
  retired), `docs/ui-{pins,surface-map}.md` (regenerated),
  `tests/unit/national-day-season.test.ts` (3 cases rewritten to the removal, 1 new for the greens;
  33 passing).
  ⚠️ Verified: typecheck clean, lint 0 errors, **268 passing across ten season / shell / palette /
  pin / inbox suites**.
  ⚠️ **SEEN RENDERED**, which is the only way «a little bit» could be judged: the bar on the new
  greens photographed directly above the same bar on the old ones, plus both swatch rows, and the
  computed gradient read out of the page rather than eyeballed. The mark is absent from the picture.
  🔴 **NOT seen on the real signed-in bar**, which needs a session — what was looked at is the
  season's own block over the header's real class names, never the decoration sitting behind the
  logo, the three nav tabs and the 34px avatar, bell and inbox.

- **2026-09-22 - The INBOX is a chat inbox: the conversations on the left, the one being read on the right, and a thin price bar over it.**
  Owner: *"can u check the inbox changes on the app and align thr web with, i want it like the chats
  inbox look that open each chat beside it so maybe like the chat pannel in the map but instead of
  equipemtns on the lefr, the chat inbox will be on the left and on right the chats"*, then, with a
  screenshot of the map's price footer: *"can we show him a thin price bar with the counter this price
  on top of the chat when he open it from the inbox as he will not see this one ... i want to have
  another entry point for the negotiate"*. Asked three questions, he chose **today's web grouping**,
  **read the last message from Stream**, **the row opens the chat and the chat links to the map**, and
  on the bar **the map's own, thinner**.
  **The app was read first** (`features/inbox/`, seven commits since the web last looked). What it has
  and the web did not: the row QUOTES the last message with a «You:» prefix, a sent/read tick and a
  time stamp, and carries a RED unread pill. All four are the app's rules, ported rather than
  re-invented.
  (1) **`contract/inbox-chat.ts`** (new) mirrors `inbox_row_text.dart` plus the action-message regex
  out of `deal_chat_controller.dart`. 🔴 **The backend bakes term events into the channel as fixed
  ARABIC text**, so without that regex an English renter reads untranslated Arabic attributed to the
  counterparty. Such a line is nobody's message: no prefix, no tick, and the row says «Update in the
  deal room» instead.
  ⚠️ **`every`, not `some`, on the read receipt.** A company-shared room has colleagues on the far
  side, and claiming «read» while one of them has not opened it would be a lie the renter acts on.
  Checked against the MEMBER list rather than the read states that happen to exist, or an absent state
  would let `every` claim read over an empty set. Break-checked: flipped to `some`, one case went red.
  (2) **`chat/inbox-chat-summary.ts`** (new) reads the last line of every room out of Stream.
  🔴 **CHUNKED at 30, which is Stream's own ceiling on a channel query and not a tuning knob.** The
  inbox loads every received bid; without slicing, rooms 31 and after keep the pre-chat subtitle for
  ever. The app shipped the single-query version first and records the same trap.
  ⚠️ **It never throws, and the list paints before it.** A Stream outage leaves every row on its
  `equipment — REQ-xxxxx` subtitle, which is exactly the pre-chat row. The chat line is decoration
  over a list that already works.
  (3) **The two panes.** The list is 360px and scrolls on its own; the conversation fills the rest.
  Below `lg` there is ONE column: the list IS the page until a row is pressed, and the dock's ✕ comes
  back to it. The page went `fullBleed`, so the composer sits on the floor of its pane rather than
  under the fold.
  🔴 **The conversation is the MAP'S DOCK, embedded — not a second chat.** It already holds the Stream
  connection, the message list, the custom cards, the composer with its attachments and voice notes and
  the contact guard; a second implementation of any of it would drift the day one surface learns
  something the other does not. Four pieces of floating chrome stand down (`embedded`): the dock
  BUTTON, the arrival BUBBLE, the PLACEMENT control and the ✕ unless the page hands one in. The TAB
  STRIP is kept — a supplier bidding on three items has three rooms, and the row that opened this one
  names a single bid.
  ⚠️ **`.bidmap` is the wrapper on purpose.** Some three hundred selectors are scoped under it, so a
  differently-named host would need all of them copied; the class itself is a plain flex container,
  which is what a chat column wants. One new placement, `.bm-chat.is-inbox`, fills whatever box the
  page gives it.
  (4) **The thin price bar is `PriceFooter` with `slim`**, never a copy. 🔴 What matters there is the
  HAND-OFF: `?act=counter` / `?act=accept` seeds the deal room's own `openFlow` with its own guards
  intact, and that file's header is explicit that re-implementing the flow would put two negotiation
  surfaces over one room. Only the geometry and the edge move — 58px → **46**, the figure 21 → 17, and
  `border-top` becomes `border-bottom`, because the slab is now the ceiling of what is under it rather
  than the floor of what is above it.
  🔴 **ONE negotiation logic, verified in both products rather than assumed** (owner: *"check the
  counter price-accept always follow one logic which is the same as deal room negotiate in the app
  right"*). `openFlow(mode)` has exactly three callers: the room's own two buttons and the `?act=` deep
  link. Every outside entry point — the map footer, the bid card, and now this bar — is a push. The app
  does the same (`bid_map_negotiation_scope.dart`: ensure room → `showNegotiationSheet`).
  ⚠️ **And the web is STRICTER than the app on the binding warning.** The app puts it in the CALLER
  (`_accept` → `showAcceptBindingWarnSheet` → `_counter`), so every new entry point has to remember it;
  the web puts it inside the sheet — `bindingOk` starts `mode === "counter"` — so entering on accept
  draws it whatever opened it. The inbox's new Accept therefore cannot skip it, and not because anybody
  remembered.
  (5) **The list polls at 45s**, the dock's own number and for its reason: this is a badge and a preview
  line, not a conversation the renter is staring at. The app reloads on an FCM `DealRoomDataChanged` and
  on every tab revisit; **the web has no push here**, so without a cadence the counts go stale the
  moment the tab is left open. A HIDDEN tab is not polled, and a failed poll leaves the list alone —
  `setBids([])` belongs to the first read, where there is nothing on screen to protect.
  ⚠️ **Only the BIDS re-read.** The site, the RFQ code and the two price fields do not move while a
  renter reads his messages, so polling them would triple the traffic to refresh the third that changes.
  🔴 **NO BACKEND, and that is the app's own design.** Every call already existed: received-bids,
  my-requests, the per-request bids, the stream token. The last-message line goes to Stream DIRECTLY,
  because the backend stores no message — the channel IS the record — so putting `lastMessageText` on the
  feed would make the API re-read Stream on every list load. The channel id is derived, not fetched.
  Files: `src/lib/contract/inbox-chat.ts` (new), `src/lib/chat/inbox-chat-summary.ts` (new),
  `src/components/inbox/InboxView.tsx` (rewritten), `src/app/inbox/page.tsx`,
  `src/components/map/{ChatDock,PriceFooter}.tsx`, `src/components/map/map-proto.css`,
  `src/lib/uiPins.ts` (**60.1—60.4**, new), `docs/ui-{pins,surface-map}.md` (regenerated),
  `tests/unit/{inbox-chat,inbox-two-pane}.test.ts` (new, 49), and three suites re-pointed.
  🔴 **A FAULT FOUND BY LOOKING, and invisible to every other gate.** The price bar was mounted
  OUTSIDE the `.bidmap` wrapper, so none of its `.bm-foot*` rules applied: it rendered as a white row of
  default buttons — no navy slab, no hero figure, no CTAs — on a specimen carrying the real stylesheet.
  It typechecks, it lints, and no case reads a computed style. A case pins the wrapper now.
  ⚠️ **Three suites re-pointed, not weakened**: `chat-dock`'s two cases (the dock button's condition
  gained `!embedded`; the ✕'s close is now the page's when embedded) and `rentee-map-surface`'s RM3-AC-49
  callback contract, which gained `onClose` and `onOpenEquipment` with the reason each is still a report
  or an act and hands out no map state.
  🔴 **A `not.toContain` failed on its own explanation for the EIGHTH time in this repo.** The note
  beside the ✕ explains that `setOpen(false)` is the wrong close for an embedded dock, so the sweep
  forbidding `setOpen` in the placement control's region matched the comment. It strips comments now.
  ⚠️ Verified: typecheck clean, lint 0 errors, **404 passing across ten suites**, and two rulings
  break-checked (the read receipt flipped to `some`, `is-slim` removed) — each went red alone.
  ⚠️ **SEEN RENDERED at 1920**, from a throwaway specimen carrying the REAL `map-proto.css` and the
  real class names, and MEASURED rather than eyeballed: list 360px, pane 1560px, the bar **48px** on
  `--navy-deep` with the figure at 17px and Accept on `--ok`, the conversation starting at y=48 and its
  composer on the floor at y=869.
  🔴 **NOT seen on the real page**, which needs a signed-in renter with bids. The OUTER two columns
  are Tailwind utilities and the specimen wrote their equivalents by hand, because the compiled
  stylesheet on disk predates these classes and `next build` was too slow to be worth it; everything
  INSIDE the two panes is the real stylesheet. The dock's tab strip draws from `deal-room-proto.css`,
  which the specimen does not load, so its chips are the one thing in the picture that is not final.
  🔴 **Reported, NOT fixed — `requestGroupId` is still absent from received-bids.** The web
  cross-references `my-requests` to group the fan-out siblings, which is a whole extra read per visit.
  Putting it on the feed deletes that round trip; pre-existing and already logged.
  ⚠️ **Off-platform submissions are deliberately NOT here.** They arrive through the renter's own
  shared link and have no Stream channel, so there is nothing to open beside the list. They live
  per-request, as the empty state says.

- **2026-09-23 - Intake: the project panel's machines are 24px circles; processing: the machine circle is 184px with a halo ring.**
  Owner: *"show the equipment images as circles not squares and make them a little bit bigger"* and
  *"make the circle of image bigger and more visible and catchy"*. `MachineArt` (the panel rows and the
  floor chips) went from an 18px `rounded-sm` square to a 24px bordered circle, same 1.34 fill; the
  glyph fallback sits in the same circle. Processing: 144/134 to 184/172, a 4px ring, a pale brand ring
  10px outside it, Mansour 72 to 92 and his corner 38 to 46. ⚠️ A RING, not a shadow (shadows were taken
  off the product on 2026-08-26). Tests updated to the new sizes in his words.
  Files: `src/components/create/RequestsRail.tsx`, `src/components/screens/Processing.tsx`,
  `tests/unit/{intake-rail.test.ts,mansour.test.tsx}`.
- **2026-09-23 - The bid map is white, opens close on the project and its machines, and every machine picture fills its circle and its card cell.**
  Owner: *"the map looks weird, can't it be white and more zoomed in… make the equipment image full fit
  in the circle like the requests strip and even the image in the equipment card"*.
  The opening fit was capped at `SITE_ZOOM` (11), the right view of a site alone, so a machine 7.5 km
  out sat in a whole-city view; `FIT_MAX_ZOOM` 15 now (`fitBounds` still widens for a far machine).
  Google gets a white style (`WHITE_MAP`, palette literals from `ds-colors`); the Esri fallback is its
  Light Grey canvas plus labels, ~~World Street Map~~ whose tan relief read as desert.
  🔴 The 9px inscribed-square inset for catalogue drawings (2026-09-22) is withdrawn: every picture is
  `cover`, which is the requests strip's own ×1.34 fit stated directly. ⚠️ A wide machine's tracks can
  be clipped at the rim; that is the trade the owner chose. The card cell is `cover` too, and a machine
  with no photo shows the request's catalogue picture instead of the grey placeholder, the same
  fallback its circle takes.
  Files: `src/components/map/{MapCanvas,EquipmentList,BidMapWorkspace}.tsx`, `src/components/map/map-proto.css`.
- **2026-09-23 - Negotiation parity with the app: read receipts, accept sends the live figures, full history, the reopen warning, the unit-change check.**
  Owner, after an app-vs-web audit: *"fix them here to match the app"*.
  🔴 **Unread never cleared from the web.** The badges are Stream's read state (`getUnreadCounts`), and
  no web code called `markRead`; the app does on connect and on each new message. `ChatDock` now marks
  the shown tab read while OPEN (a shut dock still watches the anchor's channel; that is not reading).
  🔴 **Accept sent the last agreement, not the live position.** `doAccept` sent
  `room.agreedUnits ?? room.numberOfUnits` and no leg fields while the price bar priced the latest
  round, so accepting a counter of 2 units with delivery removed could record 3 with delivery on. It
  now sends the live round's units, leg counts and exclusions, as the app's `_accept` sends its draft;
  an excluded leg sends no count.
  **Full history**: `loadFullHistory` pages back up to 5 pages (the app's `_ensureRoundsLoaded` cap)
  before the rounds are built; `watch()` returns only the newest page.
  **Reopen** now says it frees the equipment and reopens the request (the app's `dealReleaseMessage`,
  and what the backend's `releaseDeal` does). **Units**: the first change of any of the three counts
  asks once, showing 3 → 2, in the app's words.
  ⚠️ Not seen running; reasoned from both codebases and pinned by the existing 964 cases only.
  Files: `src/components/map/ChatDock.tsx`, `src/components/deal-room/DealRoom.tsx`,
  `src/lib/chat/stream-connection.ts`.
- **2026-09-23 - The bid map draws GOOGLE's map through the Maps JavaScript API; the Map Tiles attempt is withdrawn.**
  Owner: *"why we cant use this"*. 🔴 ~~Map Tiles API (`createSession` + `2dtiles`)~~, the entry below:
  every Google key we hold refuses it (web key and two app keys `API_KEY_SERVICE_BLOCKED`, the fourth
  `SERVICE_DISABLED`), and enabling it is a Google Cloud change nobody here can make. The app is not a
  counter-example: it uses the Maps SDK for phones, a different service web pages cannot use.
  Now `GoogleBase` loads the Maps JavaScript API with the web key (the service that already draws the
  location picker, reusing its `gmaps-js` script tag) and `leaflet.gridlayer.googlemutant` (new
  dependency, 0.16.0, Beerware licence) renders it under Leaflet, so markers, routes and chips are
  unchanged. Esri stays until Google is ready, and comes back on `gm_authFailure` or a load error.
  ⚠️ Not seen running: this machine has no key and the key is restricted to our domains, so the check
  is on staging after deploy (Google map under the pins = working; Esri = refused).
  Files: `src/components/map/MapCanvas.tsx`, `src/types/leaflet-googlemutant.d.ts` (new),
  `package.json`, `package-lock.json`.
- **2026-09-23 - A web logo uploader: the quotation's «Add a logo» opens it on the profile, and «Verify your company» opens verification.**
  Owner: *"yes add"*. The app uploads from its quotation (`renter_record_cta.dart`); the web's quotation
  is a separate tab, so its asks link to `/profile?logo=1` / `?verify=1` and `ProfileView` opens
  `CompanyLogoModal` / `VerifyModal`, then drops the param so a reload does not reopen it. Unverified
  renters asking for `?logo=1` get verification instead, the app's order. The deal room's prompt links
  the same two places now.
  ⚠️ **`PUT /profile/me` requires the four names** (`updateProfileSchema` extends `completeProfileSchema`),
  so the dialog sends the renter's current values with the key; the web proxy passes `companyLogoKey`
  only when sent. The downscale/upload moved into `src/lib/company-logo.ts` and `CompanyIdentityModal`
  uses it too, so there is one copy. Pin 73.
  Files: `src/lib/company-logo.ts` (new), `src/components/company/CompanyLogoModal.tsx` (new),
  `src/components/profile/ProfileView.tsx`, `src/components/onboarding/CompanyIdentityModal.tsx`,
  `src/app/api/me/profile/route.ts`, `src/components/workspace/RequestsWorkspace.tsx`,
  `src/components/deal-room/DealRoom.tsx`, `src/lib/i18n/{en,ar}.ts`, `src/lib/uiPins.ts`.
- **2026-09-23 - The workspace quotation: the supplier's logo loads, the renter is asked for his logo or his verification, and the page has Download PDF and Share.**
  Owner: *"why logo not shown, also it doesnt show option to download or share + in the app a
  quotation will ask a renter to add his logo in the empty logo slot or ask him to verify his company"*.
  🔴 **The broken logo was an UNSIGNED link.** The bid projection carries the supplier's mark as a bare
  storage key; `mediaUrl` joins it to the private bucket and S3 answers 403. The dashboard's avatar
  loads because the received-bids list carries it SIGNED. The workspace now keeps those signed links
  (`logoByBid`) and hands them in, and `bid-quotation.ts` lets the caller's link win over the bid's.
  A mark that still fails is removed (`onerror`), never drawn broken. The stale "BidCard carries no
  logo" note is corrected in place.
  **The app's asks** (`renter_record_cta.dart`): unverified, a red «Verify your company» where the tick
  goes; verified with no mark, a red «Add a logo» in the empty slot; the renter's own mark printed only
  when verified. Screen only, dropped by `@media print`. ⚠️ Both link to `/profile`, as the deal room's
  prompt does: the web has NO logo uploader for a verified renter (the app uploads in place, and
  `PUT /profile/me` accepts `companyLogoKey`). That uploader is the follow-up.
  **Download / Share**: `wrapQuotationPage({ tools })` draws both above the paper; Download is
  print-to-PDF, Share passes the page as an .html file to the system share sheet and is shown only
  where `navigator.canShare` accepts files. The workspace no longer auto-prints.
  Files: `src/lib/quotation/{render,bid-quotation}.ts`, `src/components/workspace/RequestsWorkspace.tsx`,
  `tests/unit/deal-room-quotation.test.ts`.
- **2026-09-23 - The bid map's basemap is GOOGLE's roadmap, the app's map, with Esri as the fallback.**
  Owner: *"check the map on the app what does it use and use it"*. The app uses `google_maps_flutter`.
  The web keeps Leaflet and asks Google's Map Tiles API (`createSession`, then `2dtiles`) for the same
  roadmap, in Arabic when the page is Arabic, with the key the web already ships
  (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, from `amplify.yml`). ⚠️ Scraped `mt*.google.com` tile URLs were
  rejected: against Google's terms. ⚠️ **Needs the Map Tiles API enabled on that key** in Google Cloud;
  until it is, or with no key (this machine has none, so it is UNTESTED against Google), `createSession`
  fails and the map draws Esri, never blank. ⚠️ `main` "working" was the browser's cache: CARTO sends
  tiles with a 180-day lifetime, and a fresh fetch with the production site as referer is watermarked too.
  Files: `src/components/map/MapCanvas.tsx` (`useGoogleTiles`).
- **2026-09-22 - The bid map's basemap is Esri World Street Map: CARTO's keyless tiles now carry an «API KEY REQUIRED» watermark.**
  Owner, on staging and beta: *"critical issue that api key required"*. Not our deploy: a tile fetched
  straight from `a.basemaps.cartocdn.com/rastertiles/voyager/...` comes back with the watermark in the
  image, so every environment broke at once and no rollback would fix it.
  🔴 ~~CARTO voyager~~. ⚠️ **OpenStreetMap standard was tried first and rejected**: its servers answered
  the check with an «Access blocked» tile and their policy is for light use; the web's other two maps
  (`MapLocationPicker`, `EquipmentLocationMap`) still load OSM and carry that risk. Esri is keyless,
  labelled in Arabic and English over Riyadh, and pale enough for the canvas colours judged on voyager.
  ⚠️ Esri's terms expect an ArcGIS account for production; the durable fix is a KEYED provider (CARTO,
  Esri or Google Maps, which the app uses) and is an account decision. One `TileLayer` line to change.
  Files: `src/components/map/MapCanvas.tsx`.
- **2026-09-22 - The bid map page, one batch: photo fits the card, three weights, footer priced like the bid card, chat events as the app's grey pills, round photo markers, a white «Other bids» bar.**
  Owner, with three screenshots of `/bids/[id]/equipment`. What changed and the traps:
  🔴 **The footer mispriced the breakdown.** `BidMapWorkspace` never passed the request's START DATE to
  `PriceFooter`, and the shared rental maths returns the bare rate without one, so the breakdown's
  rental, VAT and totals were not the bid card's for the same bid while the headline rate matched,
  which is why it looked right. It now gets the start date and the bid card's duration fallback
  (dates when `estimatedDurationDays` is empty), and its rows are the card's: «Rental · N days»,
  «Delivery to site» / «Return from site» through `legDisplay`, «Grand total · incl. VAT».
  🔴 **RM3-AC-67 withdrawn on the web**, owner: *"check the app"*. The app dropped it on 2026-08-14
  (APP-RDR-25): the footer now prices on `liveRentalUnits`, the bid card's own count. ⚠️ The deal room
  page (`mapDealRoom`) still prices on `agreedUnits ?? offered`: not changed in this batch.
  🔴 **RM3-AC-48 reversed in the map's chat only**: negotiation events are the app's `DealSystemEvent`
  pill (`.bm-chat-pill`). ⚠️ The line is `chatEventLine` of the card VIEW, never `message.text`, which
  is what kept Arabic and the counter's two values; the deal room keeps its cards (Accept/Counter).
  🔴 **Markers**: the machine's own photo (`pin.card.photo`, the card's `heroPhotoUrl`) in a 66px circle,
  reversing the 2026-08-08 free-standing object and AC-80's taxonomy-first image.
  The fleet card photo is `position: absolute` in its cell: in flow, `height: 100%` against a stretched
  cell resolved to nothing and a portrait photo made its card 225px tall. Weights on `map-proto.css`
  and `panel-proto.css` follow the 400/600/800 scale (title or 14px+ is 800, else 600); figures left
  JetBrains Mono. «1 of 2» gone; the filter is `EquipmentFilterButton` at the end of the pills' row,
  its open state now the workspace's. Verified tick alone; «Company documents»; «Equipment documents»
  as words. The back bar is white and 40px on this page through the shell's new `page-back-bar` hook.
  Pins 45.3 and 57.6 added. ⚠️ Not seen on screen: typecheck, lint and tests only.
  Files: `src/components/map/{BidMapWorkspace,EquipmentList,MapCanvas,ChatDock,OtherOffers,PriceFooter}.tsx`,
  `src/components/map/map-proto.css`, `src/components/map/panel/panel-proto.css`,
  `src/lib/contract/{price-footer,deal-rounds}.ts`, `src/components/AppShell.tsx`, `src/lib/i18n/{en,ar}.ts`,
  `src/lib/uiPins.ts`, `tests/unit/{price-footer,rentee-map-surface,map-no-quality-score}.test.ts`.
- **2026-09-22 - FOUR dialogs had no styles at all, and they are the design system's `Dialog` now.**
  Owner, on the choice put to him: *"use existing popup design system"*.
  🔴 **The fault: ten of the fifteen `dl-*` classes those components used were declared NOWHERE.**
  Every `dl-modal*` one — the overlay, the card, the head, the icon disc, the title, the corner
  close, the body, the message, the acknowledgement row, the footer — plus `dl-err`. `.dl-mbtn`
  existed only as `.dlproto .dl-mbtn.danger`, which needs an ancestor a PORTALLED dialog does not
  have. So the contact guard, the deal room's «Reopen this deal?», its binding-commitment
  warning and the cancel-reasons footer all rendered as **bare text and unstyled buttons in the page
  flow**: no overlay, no scrim, no card, no centring.
  ⚠️ **Pre-existing and true at `HEAD`**, so it is not a regression from the contact guard —
  the guard simply inherited a shell that was never written. Found by grep across every `.css` and
  `.ts` in `src/`, after the guard was checked against the app and found otherwise correct.
  **The repair is the app's own `Dialog`, not the missing CSS**, and that was the choice: one shell
  for every layer in the product, with the scrim, the focus trap, the corner close, Escape and the
  body-only scroll already in it, against forty lines of new stylesheet that would be a second
  answer to a question this design system answers.
   · `ChatDock` — the contact guard.
   · `DealRoom` — «Reopen this deal?» and «This is a binding commitment».
   · `CancelReasonsModal` — it was ALREADY a `Dialog`, and its two acts were hand-rolled `dl-mbtn`
     buttons inside the body. They are `DialogButton`s in the footer now.
  🔴 **~~`tone="danger"`~~ on the contact guard's escape hatch, deliberately.** That tone is a
  SOLID red fill, and making the loudest control on a privacy warning the one that ignores it is the
  exact fault the app corrected on 2026-09-20. It is a ghost button wearing the soft red; the
  DISMISSAL is the primary. A case pins both, and the order.
  ⚠️ **`dismissible` replaces three hand-written guards.** The reopen dialog gated its scrim and
  its Escape on `!releasing` and its corner close on `disabled`; the cancel modal passed
  `onClose={busy ? () => {} : onClose}`. One flag says it once, and says it in the place the next
  reader looks.
  ⚠️ **The acknowledgement CHECKBOX moved into the body rather than under it.** It is what
  unlocks «Continue», so it is the point of that layer, not small print.
  ⚠️ **`.dlproto .dl-mbtn.danger` is SWEPT**, not left: with its last caller gone it was a button
  skin competing with `DialogButton`, and a dead rule is how the hand-rolled shell comes back.
  Files: `src/components/map/ChatDock.tsx`, `src/components/deal-room/DealRoom.tsx`,
  `src/components/deal-room/CancelReasonsModal.tsx`,
  `src/components/deal-room/deal-room-proto.css`,
  `tests/unit/contact-guard.test.ts` (1 case re-pointed, 1 new; 12 passing).
  🔴 **A `not.toContain` failed on its own explanation for the EIGHTH time in this repo**, in the
  very case written about it: the component's note names `tone="danger"` while saying it must not be
  used. The case strips JSX comments before asserting.
  ⚠️ Verified: typecheck clean, lint 0 errors, **3795 passing / 7 skipped** serially. The 1
  failure is the PRE-EXISTING `cancel-confirmation` CRLF vacuous-slice trap this log already records
  as somebody's to fix deliberately.
  🔴 **NOT seen rendered** — all four need a signed-in renter with a live deal room. What is
  argued rather than photographed is only that they now draw the SAME shell as every other dialog in
  the product, which has been.

- **2026-09-22 - The COMPANY NAME is back on the profile form and REQUIRED, on the complete pass only.**
  Owner, naming two app behaviours: *"chat blocking to send phone numbers"* and *"company is required
  in the profile form ... they are in app so align"*. Both were CHECKED against the app first; only
  the second was a gap.
  🔴 **The rule is the app's, split exactly as the app splits it.**
  `profile_form_page._companyNameIsValid` is `!_isComplete || text.trim().length >= 2`: the COMPLETE
  pass refuses a blank, an EDIT does not — *"a user who came to change their phone must not be
  blocked by a field that was optional the day they signed up"*. So the web requires it in
  `OnboardingForm` (which is always the complete pass) and in `EditProfileForm` **only when
  `isFirstSave`**.
  🔴 **This REVERSES 2026-09-07** (*"remove it from the form UI now"*), and the reasoning that
  justified the removal has since stopped being true. That entry argued the typed name *"had no
  reader left"* because the FIRM a renter later verifies carries its own. On **2026-09-21** the one
  naming rule landed (`counterparty-name.ts`, mirroring the backend's `identity-select.ts` and the
  app's `counterparty_name.dart`) and made `profile.companyName` the FOURTH rung: it is what every
  surface shows a renter by when no verified firm stands behind him. Left blank, he is listed among
  firms under his personal name — which is the app's own stated reason for making it required.
  ⚠️ **Required on the FORM, never in the database.** `completeProfileSchema` keeps it optional
  and nothing backfills, so the accounts that predate the rule keep working and are asked the next
  time they open a profile form. The app says this in the same words.
  ⚠️ **Two characters, not one and not three** — `_companyNameIsValid`'s own floor.
  ⚠️ **BOTH submit paths carry it**, and that is the half a change like this loses: this form
  posts to `/api/auth/complete-signup` on the email-first route and `/api/profile/complete`
  otherwise. A case counts the two. **Nothing on the wire changed**: both routes had gone on
  forwarding `companyName` for the fortnight the field was absent from the UI.
  Files: `src/components/onboarding/OnboardingForm.tsx`, `src/components/profile/EditProfileForm.tsx`,
  `src/lib/i18n/{en,ar}.ts` (`onboarding.errors.companyName`),
  `tests/unit/onboarding-gate.test.tsx` (3 new; 12 passing),
  `tests/unit/profile-first-save.test.tsx` (2 new, the fixture named; 8 passing).
  ⚠️ **The fixture now carries a company**, which is not a weakening: those four cases are about
  which ENDPOINT a save goes to, and a first save without a company is a state that no longer
  reaches an endpoint at all. The refusal has a case of its own.
  ⚠️ **The error string keeps its full stop**, against the house rule, because the six beside it
  in that block all have one and a single bare line reads as a typo.
  🔴 **REPORTED, NOT CHANGED — the web refuses to CLEAR a stored company; the app allows it.**
  `updateProfileSchema` has no partial clear, so the BFF drops an empty value and the backend keeps
  what it had: blanking the field would save «successfully» while the old name survived. The
  app can allow the clear because its own save writes it. The web's guard is therefore honest and
  the drift is the BACKEND's; a case pins the edit half either way.
  **ITEM 1, checked and already correct — no change.** The app's contact guard is ASYMMETRIC
  (`deal_room_page._confirmContactShare`): a SUPPLIER who types a phone number is **blocked**
  outright, a RENTER is **warned and may proceed**. This app is the renter's client, so the renter
  half is the whole of its share, and it was ported on 2026-09-22 — same digit-run rules, same
  strings, same red icon and red body, same button order with the SAFE action primary. The web's
  only live chat composer is the dock's (the deal room's own thread was retired), so the one wiring
  point covers it.
  🔴 **BUT THE DIALOG IT OPENS HAS NO STYLES, and neither has the deal room's.** Of the fifteen
  `dl-*` classes those two components use, **ten are declared in no stylesheet in this repo** —
  every `dl-modal*` one, plus `dl-err`; `.dl-mbtn` exists only as `.dlproto .dl-mbtn.danger`, which
  needs an ancestor the dock does not have. Grepped across every `.css` and `.ts`, and true at `HEAD`
  as well, so it is PRE-EXISTING and reaches the deal room's own «Reopen this deal?» dialog
  too: no fixed overlay, no scrim, no card, no centring. Reported rather than fixed — the repair is
  a design decision (write the shell, or move both onto this app's own `Dialog`), not a line.
  ⚠️ **Still owed, and the app's own file says so**: the guard is client-side, so it is a nudge
  and not enforcement. The half that covers old builds is the same rule in Stream's pre-send hook.
  ⚠️ Verified: typecheck clean, lint 0 errors, **127 passing** across the eight profile,
  onboarding, guard, dock and wording suites, and both halves of the new rule break-checked one at a
  time (the `isFirstSave` guard widened to every save — the EDIT case went red; the line removed
  — the first-save case went red).
  🔴 **NOT seen rendered.** Both forms need a session, so the starred field and its refusal are
  pinned by cases rather than photographed.

- **2026-09-22 - A DIRECT request is ASKED who it goes to before it posts, and «Broadcast instead» is one of the answers.**
  Owner: *"check the app when i wanted a direct request, it asks me are u sure direct or broadcast.
  check it in the app and add it on the web direct request before posting"*.
  **The app was read before anything was written.** `submit_confirmation_sheet.dart`, opened from
  `create_request_page._handleSubmit` on the Review step's Submit and ONLY when `state.isDirect`: a
  bottom sheet with two cards - «Send to {store}» carrying a «YOUR PICK» pill and «They'll be the only
  supplier who can bid», then «Broadcast instead» with «Reach all matching suppliers in your area and
  compare bids». **No Cancel**: dismissal posts nothing. A broadcast press fires
  `CreateRequestSwitchedToBroadcast`, which nulls `supplierId`/`supplierName`, flips the type and runs
  the same submit - and the app's own event doc says the switch is ONE-WAY.
  🔴 **The web asked NOTHING on the ordinary path.** Its confirmation has stood in front of an
  E-MAIL send since 2026-09-07 and in front of nothing else, so a request started from a store - which
  is normally posted with no channel at all - went to one firm on a single press, with no question and
  nothing to call off. The one thing the dialog did carry (the store's own block, 2026-09-13) was only
  reachable by first picking Outlook or Gmail.
  **Asked INSIDE the confirmation, not in front of it** (his pick, offered against an app-parity sheet
  of its own): a «Who receives it» pair at the head of the same dialog, the store pre-selected, the
  channel blocks under it. One press, one layer - the destinations it already lists are the same
  reading.
  🔴 **`GO_BROADCAST` is a NEW action and must never be `setDirect(null)`.** That case DROPS the
  draft on purpose (a request written for one firm must not be re-addressed behind the renter's back),
  and here the draft is exactly what he keeps: same machine, same site, same dates, one recipient
  fewer. Reaching for the existing action would have wiped the request he is standing on, one press
  before it posts. A case pins it.
  🔴 **The answer is PASSED to `submit`, never dispatched and read back**, and that is the trap worth
  reading. `submit` reads the store through `stateRef.current`, which is written during RENDER - so a
  caller that dispatched `GO_BROADCAST` and called `submit()` in the same handler would still read the
  old `direct` and post the request to the firm the renter had just declined. `submit({ asBroadcast })`
  builds the payload from its argument; the dispatch beside it is for the SCREEN alone (the ribbon
  above the review stops naming a firm that is not receiving it).
  ⚠️ **One-way, as in the app**, and the cost is stated: a post that FAILS after «Broadcast instead»
  leaves the draft with no recipient. That is app parity and it is the honest reading of the press -
  he chose the market - but nothing offers the store back.
  ⚠️ **`post` mode and an unposted request only.** A live request's type is on the row, and `share`
  mode is a second share of something already addressed, so the chooser would offer a change nothing
  can make. A case pins both.
  ⚠️ **The pick RESETS on every open**, the rule `skipEmail` already follows: an answer given on a
  press he cancelled must not ride into the next one, or a renter who picked broadcast, thought better
  of it and pressed Send again would broadcast a request he had just decided to keep direct.
  ⚠️ **A CHOICE is drawn as one.** `RecipientOption` (new, beside `Destination`) carries a radio and
  rings the selected card; two `Destination` blocks side by side would have said both were happening.
  The pick is NAVY and deliberately neither green nor orange - this file's own three tones are
  load-bearing (2026-09-13): green means «it happened» and is earned by the tick alone, orange means
  «pay attention, this will not work the way you expect».
  ⚠️ **The copy is the app's, word for word**, English and Arabic both, including
  `destDirectLine` being re-pointed at the app's «They will be the only supplier who can bid». One
  question asked at one moment in two products must not be phrased two ways.
  ⚠️ **Two titles were WRONG and are corrected in passing.** `confirmPostTitle` («Post this request
  and e-mail it?») was drawn on the one arm where NO mail leaves - Moedatech alone, or an Outlook that
  is not connected - so it promised the very thing the block beneath it was explaining would not
  happen; that arm reads «Post this request?» now. And the button said «Post to Moedatech» over a card
  reading «nobody else sees it», which is the dialog arguing with itself; while the WHO is open it
  names the act («Post the request») and the subtitle asks the question instead of stating an answer
  he has not given.
  Files: `src/lib/store/rfq-store.tsx` (`GO_BROADCAST`, `goBroadcast`, `submit({ asBroadcast })`),
  `src/components/share/ShareRequestPanel.tsx` (`askRecipient`, `recipient`, `RecipientOption`),
  `src/components/create/ShareOnPost.tsx`, `src/lib/i18n/{en,ar}.ts` (5 new keys, 1 reworded),
  `src/app/dev/preview/specimens.tsx` (`recipient-choice`, new),
  `tests/unit/direct-broadcast-choice.test.tsx` (new, 12).
  ⚠️ Verified: typecheck clean, lint 0 errors, 144 passing across the choice and share suites, and
  three rulings break-checked one at a time (the gate narrowed back to e-mail, the choice cut out of
  the post call, `GO_BROADCAST` made to drop the draft) - each went red alone.
  🔴 **NOT SEEN RENDERED.** The dialog needs a draft, a store and a signed-in renter; the specimen
  above exists for exactly that and was not photographed this session, so the two cards and the radio
  are pinned by cases rather than looked at.
  🔴 **Another session is writing to this tree, again.** `git checkout` on `rfq-store.tsx` during a
  break-check reverted this change's own edits to it (they were re-applied); and `BidCard` lost
  `dealRoomStatus` mid-run, which briefly failed typecheck in five files this change does not touch.

- **2026-09-22 - The change log leaves `CLAUDE.md` ENTIRELY, and the rule that kept dragging it back is re-pointed.**
  Owner, on the file being archived for the second time in four days: *"why we long in claude.md not
  in a change md seperate? arent we loading alot"*.
  🔴 **`CLAUDE.md` is re-read into the system prompt on EVERY turn of every session; this file is
  not.** Measured before answering: the project file was **81,600 bytes**, roughly **20,000 tokens**
  paid on every question whatever it was about - and `grep "^## " CLAUDE.md` returned exactly ONE
  heading, `## Change log`. There were no project rules in it at all. It was 100% history.
  🔴 **The 2026-09-22 split did not hold, and the reason is the RULE rather than the file.** That
  split cut 537 KB to 58 KB by leaving the ten newest behind; four days and three sessions later it
  was back to 81 KB with sixteen. It regrew because the global rule said *"gets a short entry in the
  project's `CLAUDE.md`, under a `## Change log` heading"*, so every session dutifully wrote there.
  Archiving without re-pointing the rule only buys days.
  **So: every entry lives here, `CLAUDE.md` holds a pointer, and the global rule names this file.**
  ⚠️ **The rule's own REASONING is untouched and is why a pointer suffices**: *"the next agent
  opens one file and understands the history"*. One file, still - it is simply read when a task needs
  it rather than prepended to every question. The global rule now says so in as many words, with the
  537 KB figure, so the next reader meets the cost as a fact rather than re-discovering it.
  🔴 **THE COST, stated and accepted.** An agent that does not open this file loses the traps for
  free. Before, it got the last ten or fifteen whether or not they were about its surface - and on the
  session that made this change those fifteen were about the quotation, Mansour and operator
  nationality, none of which the task touched. It is a coin flip, priced at 20,000 tokens a turn.
  ⚠️ **Nothing was reworded, dropped or summarised**, and it was verified rather than assumed: the
  sorted set of entry HEADLINES across both files is byte-identical before and after
  (`diff` on the two, 180 entries). Both files keep the repo's CRLF.
  ⚠️ **`sed` on this machine STRIPS the CR** - the trap the first split already recorded, after it
  silently rewrote 531 KB from CRLF to LF. `head -n` / `tail -n +` preserve it, and the scripts here
  read bytes and write back in whatever ending the file already used.
  🔴 **`brand-spelling` WAS RED and this is what makes it green**, which is the eighth time the
  log has recorded an assertion failing on its own explanation. That guard walks `docs/`, and the
  archive's 2026-09-08 and 2026-09-10 entries quote all three forbidden spellings in strike-through
  while recording that they were removed. It has been failing since the archive appeared (another
  session's, untracked) and this change makes that file permanent, so `CHANGELOG.md` joins the
  decoded prototypes as EXEMPT BY PATH - the same reason read the other way round: a record of what
  was corrected cannot be corrected without ceasing to be a record.
  ⚠️ **By path, never by widening the pattern.** A rule that ignored the words wherever they sit
  beside a «~~» would stop catching them in a dictionary string, which is the one place they matter.
  Break-checked: `معداتك` swapped for the transliteration in `ar.ts` - two cases went red.
  Files: `CLAUDE.md` (reduced to a pointer, 81,600 -> **1,015 bytes**), `docs/CHANGELOG.md` (the
  sixteen newest entries prepended; its own header rewritten, since it no longer holds «entries older
  than the ten kept in CLAUDE.md»), `~/.claude/CLAUDE.md` (the global rule), `tests/unit/brand-spelling.test.ts` (the exemption).
  ⚠️ **`CertSelect.tsx:93` still points at «the note in CLAUDE.md»** for the production orange.
  That pointer was already stale after the first split and is staler now; it wants re-pointing at this
  file's 2026-09-08 entry. Reported, not fixed - it is a comment in a file this change does not touch.

- **2026-09-22 - The bid card's TERMS PANEL is the app's terms page: three stacked groups, and every row names BOTH sides.**
  Owner: *"for terms panel ui from the terms in bid card, can u check how it is structured in the app
  and align, like structure and language"*. Read against
  `features/marketplace/presentation/widgets/terms_modal.dart` (`TermsModalPage`, `_TermsByStatus`,
  `_TermsLegendHeader`, `_TermsStatusSection`, `buildBidTermsArgs`) and
  `core/widgets/term_attribution_block.dart`.
  (1) 🔴 **THE TABS ARE GONE, and that is the structural change.** ~~Three buttons, one bucket on
  screen at a time, opening on the first non-empty one.~~ The app stacks all three: a summary card,
  then one colour-headed section per non-empty state, **Conflict — Pending review — Matched**, each a
  tinted band carrying a dot, the state and its count, with its rows inside the same card. The question
  this page exists for — what is still open on this offer — is read by looking DOWN the three groups,
  and a tab hid two thirds of the answer behind a press.
  (2) **The summary header is the app's**: a segmented proportion bar over three stat pills (the count
  large, then a dot and the state). All three are drawn whatever the counts, a zero pill greyed, so the
  row keeps one shape across every bid rather than changing size with the news.
  (3) 🔴 **EVERY ROW NAMES BOTH SIDES.** ~~The renter's value alone in red, with the supplier's
  added only when he had offered something else.~~ That rule (2026-09-06) was written for the
  COMPARISON's one-line cells, where a second half only restated the colour the cell was already painted
  in; this page has the width, and the app's own row carries two chips — «Renter» over her ask,
  «Supplier» over his — with the standing side filled, a locked pair green with a tick, and a side
  that has answered nothing reading «Not selected yet» in italic. **The rule is reversed for THIS page
  only**; the comparison is untouched.
  ⚠️ **Only a LOCK reads as a green pair.** An equal but un-negotiated pair is the supplier's offer
  STANDING, not an agreement — the app says so in as many words, and painting it green would report a
  deal nobody struck.
  ⚠️ **The per-row verdict WORD is gone with the tabs.** The band above says the state once, for
  every row under it; repeating it beside each value was the tab strip's job done twice.
  (4) **Under the chips, one muted line saying who moved the value and when**: «Agreed in deal room
  · 12 Sep», «Updated by Supplier · 12 Sep», or «Supplier hasn't responded».
  (5) 🔴 **`side`, `occurredAt` and `lockedAt` are ON THE WIRE and `mapBid` was dropping all three.**
  The app reads them (`BidCounter.side` / `.occurredAt`, `BidLockedTerm.lockedAt`) and they are what lets
  a row say WHO moved it rather than only what it now says. `TermRow` carries `counterSide` and
  `updatedAt` now. Fourth parse gap found on this projection in two days.
  (6) 🔴 **A BUG, and it is the one worth reading: a renter's OWN counter was reported as the
  supplier's offer, and turned the row GREEN.** `counters` carries the latest counter on a term
  WHICHEVER side wrote it, and `overlayLocked` wrote it into `value` — the column every surface reads as
  the supplier's. Worse than a mislabel: that value equals the renter's own ask by construction, so
  `normVal(cv) === normVal(r.renteeValue)` matched and the term went **green, as though the supplier had
  agreed to something he has never seen**. The app filters the same map to `c.side == 'supplier'` and
  says why. **This is a SHARED fix**: the bid card's tally, the comparison table and the quotation's
  value ladder all read these rows.
  ⚠️ **Only an EXPLICIT `rentee` is dropped.** An older payload carries no side at all, and reading
  that silence as hers would retire the whole overlay on every bid predating the field.
  (7) **The words are the app's ARB, both locales**: `Conflict` / «تعارض», `Matched` /
  «مطابق», and `Pending review` / «قيد المراجعة» — the web had «بانتظار المراجعة», a
  second Arabic spelling of one state across two clients. Plus `Renter` / `Supplier`, `Not determined`,
  `Not selected yet`, `Agreed in deal room`, `Updated by {role}`, `Supplier hasn't responded`, `Held`,
  `{n} requested`, `No certificates requested`.
  ⚠️ **The row LABELS are the app's `termsItemLabelFor`, ported as the panel's own map** —
  `Payment Terms`, `Breakdown Response SLA`, `Equipment Certifications`, `Fuel Responsibility`,
  `Operator`. The app keeps TWO term vocabularies (this map for its terms page, `termLabel*` for the deal
  room), so porting it is parity rather than drift — and keying it on `COUNTED_TERM_GROUP` rather than
  on the row key is what lets either of the two rows that can fill a group carry the group's name.
  🔴 **The shared `TermRow.labelEn` / `labelAr` are deliberately NOT renamed**, and that is the
  smaller blast radius: the COMPARISON reads those for its column heads, so renaming them would move a
  table the owner did not name. One map, in the panel, is the cost.
  (8) **The two collapsible rows** (app: `_CertParentTile`, `_OperatorFlatTile`): certificates open to
  the codes the renter REQUESTED, each marked «Held» where the platform tracks that the supplier
  holds it; the operator row opens to his certification ask and the FAT split. Both are informational —
  a requested cert never gates a bid — and both need nothing new on the wire: `requiredCerts`,
  `heldCertCodes`, `operatorCertReq` and `requestResponsibilities` are already on `BidCard`.
  ⚠️ **The FOOTER is the web's and stays.** The app's terms page is a route with its own back
  control; this is a dialog opened from the bid card, and the button under it is the renter's way from
  reading the terms to acting on them.
  ⚠️ **The buckets are NOT re-derived.** `bucketBidTerms` is the same call the bid card's own tally
  makes, so this page can never report a count the card disagrees with.
  Files: `src/components/requests/BidTermsModal.tsx` (rewritten), `src/lib/contract/bids.ts`
  (`counterSide` / `updatedAt` on `TermRow`; `side` / `occurredAt` / `lockedAt` parsed; `hisCounters`;
  `COUNTED_TERM_GROUP` exported), `src/components/workspace/BidCards.tsx` (the `ask` prop),
  `tests/unit/bid-terms-panel.test.ts` (new, 19), `tests/unit/bids.test.ts` (5 new cases; 52 passing),
  `tests/unit/other-offers.test.tsx` (1 case re-pointed — see below).
  ⚠️ **`other-offers` was RED against the naming rule and is now re-pointed, not weakened.** Its
  «an unverified company row is an ops draft, not an identity» case describes the verification gate
  that the 2026-09-21 product decision removed; it asserts the opposite now, and keeps the person as the
  answer when no column names a firm.
  🔴 **I EMPTIED `src/lib/contract/bids.ts` MID-SESSION**, for the fourth time this repo has recorded
  that trap: `io.open(path, "w")` truncates at the OS level BEFORE anything is written, and my script then
  threw on a `\ud83d\udd34` escape, which Python holds as two lone surrogates that UTF-8 cannot encode.
  1,409 lines to 0 bytes, with the session's uncommitted work in it. Rebuilt from `HEAD` plus the suites
  that pin each ruling — the naming rule, the price rule, `dealRoomStatus`, the nationality removal —
  and proved back by those cases going green one at a time. **Write the new text, assert it, and only
  then open for writing**; better, write to `path + ".tmp"` and `os.replace`, which is what every script
  after it did. And build a non-ASCII marker with `chr()`, never with an escape a layer can mangle.
  🔴 **ANOTHER SESSION IS WRITING TO THIS TREE, and it REVERTED my files mid-run.** `bids.ts` and
  `tests/unit/other-offers.test.tsx` both went back to `HEAD` between a green test run and the next edit,
  without my touching them; the changes had to be applied twice. The tree also carries that session's work
  across `ShareOnPost.tsx`, `ShareRequestPanel.tsx`, `rfq-store.tsx`, `RequestsWorkspace.tsx`,
  `deal-room-proto.css`, `EquipmentList.tsx` and `specimens.tsx`, so the counts below were taken against a
  tree holding both.
  ⚠️ Verified: typecheck clean, lint 0 errors, **3739 passing / 7 skipped** serially, and the
  supplier-counter filter break-checked («his counters» widened back to all — the case went red
  alone). **The 2 failures are NOT mine**: `cancel-confirmation` is the pre-existing CRLF vacuous-slice
  trap this log records, and `rentee-map-surface` fails on `EquipmentList.tsx`, which that other session
  has open and I have not touched.
  ⚠️ **SEEN RENDERED at 1568px, EN and AR**, as static markup carrying the real class names and the
  compiled stylesheet: the three stacked groups, the proportion bar and its pills, the two chips per row
  with the standing side filled, the green locked pair with its tick, the two collapsible rows open, and
  the RTL mirror, where the groups and the chips reverse with no rule of their own.
  🔴 **NOT seen on a real bid**, which needs a signed-in renter with a live deal room, so the
  provenance caption and the «Held» badge are pinned by cases rather than watched.
  🔴 **Owed, and NOT built**: the app's cert child row OPENS the supplier's uploaded certificate
  (`bid.equipment.certDocUrls`), and that map is not on `BidCard` — these rows carry the badge and no
  press. The app also lists the NUMBER of operators, which is on neither bid projection.

- **2026-09-22 - The negotiation sheet is THREE SHEETS again: a numbered rail, a paper column on the desk, and the terms read at a monitor's distance.**
  Owner: *"for deal room , i want the previosu 3 sheets style layout but inisde each sheet use the app
  structure but keep it as 3 sheets style as it was i mean for the frame and general layout, for terms
  use same structure and same languag eand same behaviour but on sizes suitable foe web inside the 2
  style sheets"*. Asked which frame he meant and how far the terms should move, he answered **"like the
  one in main or beta"** and **"Only the sizes"**.
  **Read off `origin/beta` before anything was written**, and the change is smaller than it sounds:
  the grey desk and the white cards already existed. What beta's `.qp-*` frame had and the current
  `.ng-*` one did not is a NUMBERED RAIL and a PAPER COLUMN, and that is the whole of this.
  (1) 🔴 **The step rail is back**: ① Price —— ② Terms —— ③ Review, each badge filling as it is
  passed and the rule behind it turning green. Without it the only thing naming the step was the
  FOOTER's own button, and that says where you are GOING, never where you are - so a renter on the
  terms page had nothing on screen telling him a review still followed.
  ⚠️ **It cannot be pressed, and is `aria-hidden`.** The footer walks the steps and refuses on a gap
  (`canNext`); a rail that jumped a renter past an unanswered price would be a second route with none
  of the gates. The footer also already names the next step in words, so reading out «one, Price, two,
  Terms» before every screen is three labels for one fact.
  ⚠️ **Tokens direct - `--brand` for the step you are on, `--ok` for one you have finished.** beta
  remapped `--action` and `--rentee` locally inside the sheet to reach those two colours; a local remap
  of `--action` is exactly the drift `palette-drift` and RM3-AC-33 exist to stop, because that token is
  the bid map's ask and means one thing in this product.
  (2) 🔴 **`--ng-paper: 940px`, and this REVERSES 2026-09-19's no-cap ruling** - which was itself a
  withdrawal of a 760px cap: ~~*"centralize the parent cards across the screen so it has equal margin
  on right and on left"*~~. That ruling is not wrong about margins and still holds: the gutter is one
  number and the two edges are equal. What it cannot give is what he is asking for now - **a sheet
  reads as a sheet only when it has an EDGE**, and content running a 1900px monitor has none. The desk
  (`.ng-body`'s grey) is what the margin becomes.
  ⚠️ **940, and the number is not a taste.** `.ng-cmp` was capped at 940 and `.ng-grow` at 820 on
  2026-09-22, so at this width nothing ALREADY capped changes size and everything uncapped comes in to
  meet them. beta's own 800 would have shrunk the compare card that was measured at 940 that morning.
  🔴 **The body's gutter had to move onto the BAND, and that fault was found by measuring.** It sat
  on `.ng-inner`, so that one column measured 940 of CONTENT while the head, the rail and the foot
  measured 940 INCLUDING their padding - the body's cards stood 40px inside the header's own
  verticals, on the one sheet whose entire point is that the bands line up. **1020 against 940 before,
  940 across all four after**, at a 1920 window.
  (3) **The terms step is re-scaled and NOTHING else about it moved** (his *"Only the sizes"*): the
  section band 12.5 → 13.5px with 13/16 padding, its chevron 13 → 15px, a settled row 12 → 13px with
  10/14 padding. The app's six sections, their order, the three Change labels, the open/collapse rule
  and the queue are untouched - they were read off `counter_offer_terms_page.dart` earlier the same day
  and he says they are right.
  ⚠️ **The row's own 820px cap is GONE**, because the paper is 940 and already caps it. Two caps on
  one row is how a row ends up narrower than the card holding it for a reason nobody can find.
  ⚠️ **Three judgement calls, each cheap to overturn**: the ZOOM RAIL is not restored (it magnified a
  quotation document, and the content is the app's cards now); the FOOTER keeps its current contents
  (log, Back, Accept and an explicit Next - his own instruction of 2026-09-19); and the header keeps
  the RATE rather than the net incl. VAT (his instruction of 2026-09-20).
  Files: `src/components/deal-room/deal-room-proto.css` (`--ng-paper`, `.ng-inner`, the `.ng-steps`
  block, the body's gutter, six type sizes), `src/components/deal-room/DealRoom.tsx` (the rail's
  markup), `tests/unit/negotiation-sheet.test.ts` (the no-cap case rewritten to the reversal, 2 new;
  25 passing).
  ⚠️ Verified: typecheck clean, lint 0 errors, 343 passing across the fourteen sheet / term / glyph /
  rail / bid suites, and all four rulings break-checked one at a time (the cap removed, the rail made
  pressable, the terms put back at phone sizes, the gutter put back on `.ng-inner`) - each went red
  alone.
  ⚠️ **SEEN RENDERED at 1920**, as static markup carrying the real class names and the real compiled
  stylesheet: the rail with Price done in green, Terms on in orange and Review idle, and the four
  bands MEASURED rather than eyeballed - head, rail, body and foot all 490 → 1430, which is 940 centred
  to the pixel. The narrow case (under 940, where the gutter alone holds the paper off the edge) is
  arithmetic rather than observed: a `max-width` inside a band carrying `padding-inline` cannot exceed
  the viewport less two gutters.
  🔴 **NOT seen on a real room**, which needs a signed-in renter with a live deal room, so the three
  steps in place are pinned by cases and by the specimen.
  🔴 **MY WHOLE SESSION'S WORK WAS WIPED FROM THIS TREE MID-RUN, and recovered from a stash.** At
  19:34:18 something outside this session reset the tree: five new files gone, every edit reverted,
  `CLAUDE.md` rewritten. `git reflog` shows `reset: moving to HEAD` and `git stash list` shows
  `stash@{0}: On staging: Teleport auto-stash` holding all 63 paths - **both sessions' work**, mine and
  the one editing `bids.ts` beside me. Recovered by checking 60 of those paths out of the stash and
  hand-merging the three that collided.
  🔴 **`bids.ts` needed a real three-way merge, and `git merge-file` called the WHOLE FILE one
  conflict until the CR was stripped.** All three sides are CRLF on disk; normalised to LF the same
  merge is **clean, 0 conflicts**, and it was written back as CRLF. The result carries both sides:
  their `dealRoomStatus`, `counterSide` / `updatedAt`, `hisCounters` and `counterpartyDisplayName`, and
  my `isHiddenTermKey` filter with the nationality rows struck. `other-offers.test.tsx` was left as
  THEIRS - the two versions differ by one word of prose. `CLAUDE.md` was NOT restored from the stash,
  because the tree's copy is their changelog SPLIT; my four entries were re-inserted into it instead.
  ⚠️ The lesson is the one this log keeps recording: **a shared tree can lose an hour of work with no
  error and no diff**. `git stash list` and `git reflog` are the first two things to run when files
  vanish - not a rebuild.

- **2026-09-22 - EVERY rail circle carries a ×: it CANCELS a live request and HIDES a closed one, and the circle finally agrees with the navy bar about which it is.**
  Owner, on a screenshot of a coloured circle drawing a SHARE badge under a context bar reading
  CLOSED: *"can u check how the navy section show closed while the circule strip doesnt show, also
  what is the beheaviour of x on the circule? i want it to be on all circules instead of the share
  even if active and clicking it for active will cancel it with confirm popup same used when i cancel
  froom the request details and if it is closed then will remove it from the fleet only"*.
  (1) 🔴 **TWO PREDICATES FOR ONE WORD, and they were opposite shapes.** The bar reads
  `groupBiddingClosed` → `isBiddingClosed`, an ALLOWLIST of the LIVE statuses
  ({OPEN, ACTIVE, PARTIALLY_ACCEPTED}); the rail read `isClosedGroup` → `isClosedRequest`, a
  DENYLIST ({CLOSED, HUB_CLOSED, EXPIRED, FORCE_EXPIRED}). So `CANCELLED`, `ABANDONED` and
  `ACCEPTED` were shut to the bar and LIVE to the circle above it: full colour, no «Closed»
  caption, and a share badge inviting bids the request can no longer take. `railTiles` reads the
  bar's own answer now and the denylist is DELETED rather than left standing beside it.
  ⚠️ **The two agree on the four the denylist named**, which is why this stood for a month: an
  EXPIRED request reads the same either way, and it is a CANCELLATION that parts them. His screenshot
  is a cancelled request.
  🔴 **This also makes the 2026-08-31 ruling true for the first time.** That entry added
  `!tile.closed` to the share badge so a shut request could not offer to be shared «where the rule
  is stated» - and it was only ever enforced for four statuses, because it was reading the wrong
  predicate.
  (2) **The SHARE badge is gone from the rail entirely** (his instruction; asked where it would live
  he answered *"yes fine will see it in the details"*). It is in the request's own drawer, which also
  holds the expiry, the link's logo and the recipients - a 20px circle was the poorest of the doors
  onto it.
  ⚠️ **ONE badge slot now, which ends a collision rather than merely tidying one.** Share and the
  × both sat at `-end-1 -top-1` on a stated rule that they «could never both apply»; a tile that
  was active AND closed drew share OVER the ×, which is the 2026-08-31 screenshot.
  (3) **The × is on EVERY circle, and the tile's state decides only what it MEANS**: a live request
  is CANCELLED behind the confirmation, a closed one is HIDDEN from this device's rail as before. The
  label follows («Cancel this request» / «Hide this request»), read off the same `closed` the
  greyscale and the caption are drawn from - so the word and the act cannot describe different things.
  🔴 **The rail decides NEITHER itself.** It reports the press through one `onDismiss(key)` and
  the workspace answers it, because only the workspace holds the group the confirmation has to NAME
  and the items it has to cancel. Two callbacks (`onCancel` / `onHide`) would put the live/closed test
  in two places, and the day they disagreed the rail would offer to cancel a request its own caption
  calls closed.
  (4) **The cancellation is the DASHBOARD's, scope and wording both**: `cancellableItems(g.items)`,
  one `DELETE` each through `Promise.all`, `ConfirmCancelModal` at `kind: "all"` - which collapses
  itself to the single-request wording at one item. A circle stands for the WHOLE request and a
  fanned-out RFQ is several requests behind it, so the drawer's per-ITEM scope would cancel one line
  of a multi-item request and leave the rest live under a circle that had just been pressed to cancel.
  ⚠️ **`done` carries the reload, never the success itself** (2026-09-17's own rule): the rail has
  to re-read to grey the circle and put «Closed» under it, and until the tick has been read there is
  nothing to reload FOR. The circle then STAYS on the rail, greyed, and a second × hides it - his
  choice when it was put to him.
  🔴 **A LIVE group with nothing cancellable SAYS WHY, and is never hidden.** `isCancellable`
  is `OPEN || ACTIVE` while `groupBiddingClosed` also admits `PARTIALLY_ACCEPTED`, so a group whose
  live items are all partially accepted reads LIVE and has no item the backend would take
  (`REQUEST_CANCEL_NOT_ALLOWED`). ~~It hid the circle.~~ **That was wrong, and it broke a standing
  rule to do it**: `hidden-requests.ts` says in as many words *"only a closed group can be hidden …
  a live request that vanished from the rail would be a request the renter cannot get back to, and
  this store has no undo"* - and such a request is still taking bids on its siblings. Drawing no ×
  was the other candidate and is nearly as bad: one circle in a row of them with no control and no
  reason.
  🔴 **The product had ALREADY answered this, and the answer was one grep away.**
  `cancelBlockedReason` exists for precisely this case, and its own note prescribes the behaviour:
  *"shown inline when the renter taps its disabled ×, so a greyed-out control always explains
  itself (a tooltip wouldn't, on touch)"*. The press raises it on the workspace's existing toast.
  ⚠️ **The reason is read off a LIVE item, never off the group.** A group has no status of its
  own, and a terminal sibling is not what refused the press - one holding an EXPIRED item and a
  PARTIALLY_ACCEPTED one would otherwise report the expiry, which the renter can do nothing about
  and which is not why the × declined.
  ⚠️ **A partly-accepted group cancels only what it can**, so «All N items» counts the
  CANCELLABLE ones - 2 of 3 on a group with one accepted line. That is the dashboard's existing
  behaviour and the word «All» slightly overstates it; reported rather than reworded in a change
  about a badge.
  ⚠️ **No new strings**: `workspace.cancelRequest` and `workspace.hideRequest` both already exist
  in both locales, written for the drawer and for the old closed-only ×.
  Files: `src/lib/contract/workspace.ts` (`railTiles`; `CLOSED_STATUSES`, `isClosedRequest` and
  `isClosedGroup` deleted), `src/components/workspace/RequestRail.tsx` (`onShare` / `onHide` →
  `onDismiss`), `src/components/workspace/RequestsWorkspace.tsx` (`dismissTile`, `doCancel`, the
  confirmation), `tests/unit/rail-dismiss.test.ts` (new, 15), `tests/unit/workspace.test.ts` (the two
  denylist describes rewritten to ONE that asserts the ALIGNMENT).
  ⚠️ **The rewritten cases compare the two ANSWERS rather than listing statuses.** A list would
  have to be edited in step with `isBiddingClosed` by hand, which is the drift this replaces; the
  comparison cannot go stale. One case names CANCELLED explicitly, because that is the one they used
  to disagree on.
  🔴 **An assertion failed on its own explanation, for the SEVENTH time in this repo** - twice in
  this change, in my own edit scripts and in the new suite. The comments NAME `isClosedGroup`,
  `onShare` and `ios_share` while saying they are gone. Both strip comments before asserting, and the
  new suite carries one `code()` helper that does it for every negative case.
  ⚠️ Verified: typecheck clean (the one error is another session's - see below), lint 0 errors,
  59 passing across the four rail and workspace suites plus the new 13, and all three rulings
  break-checked one at a time - the predicate reverted to the denylist, the × put back to
  closed-only, the nothing-cancellable guard removed. Each went red alone.
  🔴 **NOT SEEN RENDERED.** The rail needs a signed-in renter with requests, so the × on a live
  circle, the confirmation it opens and the greyed circle it leaves behind are pinned by cases rather
  than watched. The first thing to look at is a CANCELLED request's circle: it should now be
  greyscale with «Closed» under it, which is the whole of the owner's report.
  🔴 **`src/components/share/ShareRequestPanel.tsx` does not typecheck, and it is NOT mine**:
  `Cannot find name 'askRecipient'`. That file was absent from this session's opening `git status`
  and carries 76 uncommitted insertions from another session writing to this tree - which this log has
  now recorded on four consecutive days. Reported, not touched.

- **2026-09-22 - OPERATOR NATIONALITY is off every renter-facing surface, by ONE rule read out of the app.**
  Owner: *"operator nationality is removed in the app, check it there and align web to it"*.
  **The app was read before anything was written**, and its shape is the design:
  `kHiddenTermKeys = {'operator_nationality'}` in `core/constants/term_options.dart`, one
  case-insensitive `isHiddenTermKey`, applied at the PARSE where it can be
  (`marketplace_models.dart` filters the deviations before any reader sees them) and at each display
  loop otherwise (`bid_form_bloc`, `bid_list_page`, `supplier_request_detail_page`, `equipment_step`).
  🔴 **DISPLAY ONLY, and the app says so in three separate places.** The field is still stored on
  the request item, still declared on the bid payload and still rendered by the admin panel. A
  request created before the term was hidden KEEPS its value and editing it PRESERVES that value; a
  new request simply leaves it null, because nothing draws the control any more. Two cases assert
  the field is still parsed and still carried, because a "cleanup" that dropped it would clear real
  data on the next save, silently, where the renter cannot see it to restore.
  **`src/lib/contract/term-visibility.ts`** (new) mirrors the app's file, set and predicate both.
  **TEN live surfaces**, resolved by sweep rather than guessed:
  the create flow's OPERATOR RAIL (a live dropdown and its free-text list), the intake floor's
  nationality PILL, the projects board's TERMS FORM, the REQUEST DETAILS rows on both sides, the DEAL
  ROOM's details card, the bid card and the COMPARISON (one term row), the PUBLIC BID FORM (a term
  the supplier was asked to confirm), the off-platform SUBMISSION VIEWER, that submission's own
  PARSE, and the BID-QUALITY score.
  🔴 **The deal room's own wider set now SPREADS the global one** rather than restating it.
  `HIDDEN_DEAL_ROOM_TERM_KEYS` has carried `operator_nationality` since 2026-09-18, so the moment the
  term left every other surface there were two lists saying one thing - which is how one of them
  comes to be edited alone, and nothing fails when it happens.
  🔴 **The bid's DEVIATION is dropped at the parse, and that one edit is what matters.** Three
  separate readings in `bids.ts` asked `deviationKeys` whether the lumped operator row conflicts and
  what its detail line says. Filtering at each reader would have been three edits and a fourth one
  missed; filtering once at the source means a retired term can no longer paint a row red over a
  question nobody was asked. `deviationKeys.has("operator_nationality")` is struck in both places it
  appeared, because a dead clause that reads as live is how the term returns by accident.
  🔴 **The operator rail could have been left permanently INCOMPLETE, and that is the one real trap
  here.** Its `complete` test read `op.nationality`; with the control hidden that field can never be
  answered on a new request, so the panel would have shown an amber dot for ever with nothing left
  to fill. A display-only change is not supposed to be able to create a dead state - a case pins it.
  ⚠️ **The bid-quality score drops it too**, the ruling `fuelType` took on 2026-09-04: a term the
  supplier is never shown cannot count against his answer.
  ⚠️ **The compiler named the orphans**, which is the argument for the typed key union: removing
  `nationality` from the two forms' `TERM_KEYS` failed the build on their label and icon maps.
  `NATIONALITY_OPTS`, `opNat` and `opNatDeclared` were swept rather than left computed.
  Files: `src/lib/contract/term-visibility.ts` (new), `deal-room.ts`, `bids.ts`, `link-bids.ts`,
  `request-fields.ts`, `bid-quality.ts`, `src/components/create/{OperatorRail,ProjectPills}.tsx`,
  `src/components/projects/TermsFields.tsx`, `src/components/deal-room/DealRoom.tsx`,
  `src/components/requests/SharedBidSubmissionModal.tsx`, `src/app/bid/[token]/BidFormClient.tsx`,
  `tests/unit/hidden-term-keys.test.ts` (new, 16), and four suites re-pointed to the withdrawal.
  🔴 **MREQ-AC-28 is WITHDRAWN on the operator rail**, not broken: its two cases described a
  control nobody can reach. They are replaced by the two rules that fail SILENTLY - the state
  survives an edit, and the panel can still read complete.
  ⚠️ **`submission-viewer` counts 5 / 5 where it counted 5 / 6**, and its «an unanswered term reads
  as neither Yes nor No» case lost its subject: nationality was the one term that fixture left
  unanswered. The rule is untouched and has nothing else to be shown on, so the case now asserts the
  retired term draws no row.
  ⚠️ Verified: typecheck clean, lint 0 errors, **217 files / 3686 passing, 7 skipped** serially, and
  three rulings break-checked one at a time (the set emptied, the parse filter removed, nationality
  put back in the rail's complete test) - each went red alone.
  🔴 **NOT seen rendered.** Every one of the ten surfaces needs a signed-in renter, a live bid or a
  real deal room, so this is pinned by cases and by the app's own source rather than photographed.
  🔴 **TWO failures are NOT mine, and both belong to another session writing to this tree.**
  `cancel-confirmation` is the pre-existing CRLF vacuous-slice trap. `other-offers` fails on
  `readSupplierDisplayName` returning «Placeholder» where it expects the person - that function sits
  in `bids.ts` and its surrounding comment was rewritten by that session mid-run, in a region this
  change does not touch.
  🔴 **`src/lib/quotation/render.ts` does not PARSE, and it is theirs too**: a comment inside
  `QUOTATION_STYLE` quotes `` `@media print` `` in backticks, which closes the template literal.
  **Third time this repo has logged that exact trap** (2026-09-18, 2026-09-22). Reported, not fixed.

- **2026-09-22 - The no-artwork fallback is a DRAWN EXCAVATOR, not Material's robot arm.**
  Owner, on a rail tile whose group has no catalogue picture: *"use nice icons not this"*. Asked
  which of the tile's three icons and what should replace it, he named the grey machine glyph and
  chose **a custom drawn SVG** over another glyph from the icon font.
  🔴 **`precision_manufacturing` is a FACTORY ARM, and this product rents earthmoving plant.** The
  repo had already said so once and done nothing about it: `RequestCard.tsx` has carried the note
  *"a robot arm on an excavator"* since 2026-08-11, when that card stopped using it. It survived on
  six other surfaces.
  **`src/components/MachineGlyph.tsx`** (new): a side-on excavator - tracks, house, cab, boom,
  bucket - on a 24 grid, painted with `currentColor`.
  ⚠️ **It stands in for a TAXONOMY DRAWING, so it is drawn like one.** Those assets are flat,
  SIDE-ON renders; a three-quarter view or a badge in a box would read as a different product the
  moment one row has a picture and the row under it does not.
  ⚠️ **Filled shapes plus two thick strokes, never a thin line drawing.** It is asked for at 14px
  (the item tier), 16px (the machine card's row), 20px (the details modal, and inside the rail's
  52px disc) and 64px (the zoomed view). A 1px-stroke drawing survives the last and turns to mush at
  the first, so nothing is under **2.2 units**, which is 1.3px at the smallest call. A case asserts
  the floor rather than the drawing.
  ⚠️ **`currentColor`, never a token and never a hex.** The two callers use two different greys
  (`text-muted`, `text-muted-light`); a colour named here would be one `palette-drift` has to be
  told about and one no caller could override.
  🔴 **TWO faults were found by looking and could not have been found by reading.** At 6x the boom
  did not touch the house and the bucket floated clear of the dipper, so the machine read as three
  separate marks. The boom now starts INSIDE the house and the bucket overlaps the dipper's round
  cap. Three candidates were rendered side by side at every call size and in the real disc at 1x, 3x
  and 6x before choosing.
  **Six call sites**: `RequestRail` (the zoomed view, 64), `CircleArt` (the disc, size x 0.38),
  `RequestDetailsModal` (20), `ItemTier` (14), `MachineCard` (16), `create/RequestsRail` (14).
  🔴 **`equipmentIcon` is deliberately NOT swept, and the robot arm survives there.** That map
  picks a glyph per machine FAMILY, and it must return a NAME because `MapCanvas` renders it into a
  Leaflet `divIcon`'s HTML string, where a React component cannot go - so a CRANE still draws the
  arm on the map and on the public bid form. Reported, not fixed: it needs either a per-family
  drawing set or a different Material glyph, and it is a decision about the map. A case pins that it
  is untouched, so the next reader meets it as a decision.
  Files: `src/components/MachineGlyph.tsx` (new), the six call sites above,
  `tests/unit/machine-glyph.test.ts` (new, 12), `tests/unit/{intake-rail,rail-circle-art,
  request-context-art,request-rail-fit}.test.*` (re-pointed at the component, not weakened).
  ⚠️ **`Icon` became an unused import in two files** and was swept rather than left - `CircleArt`
  and `ItemTier` now draw no icon-font glyph at all.
  ⚠️ **The new suite strips COMMENTS before its `not.toContain`.** Three of the six files explain
  the robot arm they replaced, so a bare assertion fails on its own explanation. Sixth time in this
  repo.
  ⚠️ Verified: typecheck clean, lint 0 errors, **215 files / 3643 passing, 7 skipped** serially,
  and two rulings break-checked (the arm put back on the rail, a hex put into the glyph) - each went
  red alone. The 1 failure is the PRE-EXISTING `cancel-confirmation` CRLF vacuous-slice trap.
  ⚠️ **SEEN RENDERED**, which is how the two faults above were found: the glyph at 14 / 16 / 20 /
  24 / 64 and inside the real 52px disc at 1x, 3x and 6x, three candidates side by side.
  🔴 **NOT seen inside the real TILE**, beside the share badge and the count - which is the
  composition his screenshot shows. The browser reported a **0px viewport** and every screenshot
  after that point failed, the same fault this log recorded on 2026-09-20. The glyph itself was
  photographed; the tile around it was not.
  🔴 **Another session is writing to this tree, again.** `src/lib/contract/bid-band-state.ts`
  appeared untracked mid-run with two type errors of its own (`bid-changed` / `bid-withdrawn` not
  comparable to `BidLiveStatusKind`), and they were gone by the next run without my touching it.

- **2026-09-22 - The blinking bar comes BACK, and Mansour stands beside it.**
  Owner, hours after choosing the opposite: *"i want it both the agent icon and the cursor beside
  each other"*.
  🔴 **This REVERSES the same morning's «hide the bar - he IS the caret»**, which was his own pick
  from two options put to him. What that entry recorded as THE COST is exactly what he is answering:
  with the bar hidden he was the only insertion point, and **a 22px mark cannot stand in a 4px word
  gap** - so mid-sentence he covered the letter beside him and nothing on screen said where the next
  character would land. ~~`caret-transparent`.~~ `caret-navy`.
  **The two now split the job**: the BAR is the precise point, HE is the agent standing at it.
  ⚠️ **No new geometry - `gap` already did this.** It is half his width plus a letter of air, and
  the native caret is drawn at exactly the point he is measured against, so the one number that kept
  him off the character keeps him off the bar. One constant, because they stand in one place.
  ⚠️ **The blink comes back with it**, which was the other thing the morning's entry named: it is
  the only mark that says the box is focused, and an empty box has an insertion point again.
  Files: `src/components/screens/Intake.tsx` (one class, two comments),
  `tests/unit/mansour.test.tsx` (the case rewritten to the reversal; 25 passing).
  🔴 **A `not.toMatch` failed on its own explanation, for the SIXTH time in this repo.** The
  strike-through in the new case names `caret-transparent` while saying it must not be there. It
  reads the class ATTRIBUTE now, sliced, rather than the file.
  ⚠️ Verified: typecheck clean, lint 0 errors, 65 passing across the four intake and canvas suites,
  and the ruling break-checked (`caret-transparent` put back - the case went red).
  🔴 **NOT seen rendered.** The morning's version was photographed at 1568px; this is one class
  different and the placement is unchanged, so what wants a look is only whether a 2px bar and his
  head at 11px apart read as crowded at the real size.

- **2026-09-22 - The montage is a SHARED component, and the navy bar stands for the REQUEST rather than for the line being read.**
  Owner: *"for multi item , make sure all mutli items requests are designed in this way and can show
  up to 3 equipments in the same background"*, then, asked where it should reach: *"mak it also show
  the items name in the navy card"*.
  **The sweep first, because the answer was mostly «there is nowhere else».** Every live consumer of
  a request's machine art was resolved before an edit: `publicTaxonomyUrl` / `imageUrl` /
  `RailTile.machines` have exactly four callers, and six more candidates turned out to be RETIRED
  (`RequestsList`, `GroupBids`, `RequestDetail`, `RequestGroupDetail`, `CompareBids`,
  `BidComparisonWorkspace` - all commented out, imported by nothing). Of the four: the rail already
  drew the montage, the details modal is one row PER MACHINE and correct by construction, the bid
  map is per bid item, and only the **context bar** stood for a whole request while drawing one
  machine. The dashboard's requests table carries no artwork at all and never has, so giving it one
  would be a feature, not a sweep - said out loud rather than done.
  (1) 🔴 **`CircleArt` left `RequestRail.tsx` and became `src/components/workspace/CircleArt.tsx`.**
  It was private, and the rail had stopped being the only thing that stands for a whole request. A
  COPY in the bar would look right in review and drift silently: the two discs sit one row apart, so
  a disagreement about which fit a drawing takes, how far the pictures overlap or how many a circle
  admits is visible on screen and fails no test. `SPREAD`, `OVERLAP`, `CELL_MASK`, `fitOf` and
  `MAX_IN_CIRCLE` moved with it, unchanged.
  ⚠️ **The DIAMETER is the only thing a caller decides** (`size`, default 52). The montage's own
  widths are percentages, so they follow it; a case asserts the props carry no second lever.
  ⚠️ The `52px` literals became `style={{ height: size, width: size }}`, and the glyph fallback
  `Math.round(size * 0.38)` - the rail's own 20/52 ratio, because a 20px icon in a 32px circle fills
  it to the rim and reads as a button.
  (2) 🔴 **The context bar draws the GROUP: the montage at 32px, and the machines NAMED beside it.**
  ~~The active item's one picture and its name alone.~~ A multi-item request had two portraits a row
  apart - three machines in the rail circle, one of them in the bar under it - and which line is
  being READ is the ITEMS strip's own job, which marks it with `aria-current`. Up to three names,
  each with its count («2 x Crawler Excavator»), then a bare «+N».
  ⚠️ **Three names, because three is what the circle draws.** A name for a machine the disc had no
  room for would be the row disagreeing with itself.
  ⚠️ **A ONE-machine request is byte-identical to before**: `itemLabel` and the `x n` pill. Joining
  a list of one would drop the pill for nothing.
  🔴 **THE COST, stated: a 32px disc holding three machines gives each ~12px.** That reads as a
  montage rather than as three machines, and it is the price of putting the request in the bar
  rather than one of its lines. The lever is the DISC, one number at that call site - never a second
  cap inside `CircleArt`, which the rail reads too.
  (3) 🔴 **`railMachines(group, ar)` is lifted out of `railTiles`**, and the bar calls it. Two
  derivations of «which machines does this request hold» is how the tile and the bar under it come
  to name different machines for one request, and NOTHING fails when they do.
  (4) 🔴 **The details modal cropped every taxonomy DRAWING**, `object-cover` on both kinds in a
  56x44 box - so on a multi-item request it cut the machine once per row, against the rail's own
  ruling of 2026-09-12 and 2026-09-14. It reads `imageIsPhoto` now.
  ⚠️ **No scale there, unlike the circle.** The 1.34 exists to fill a ROUND hole whose curve shows
  a drawing's letterbox edge; that box is a rectangle of very nearly the artwork's own 1.34:1, so
  `contain` already fills it and a scale would crop again.
  Files: `src/components/workspace/CircleArt.tsx` (new), `src/components/workspace/RequestRail.tsx`,
  `src/components/workspace/RequestContextBar.tsx`,
  `src/components/workspace/RequestDetailsModal.tsx`, `src/lib/contract/workspace.ts`
  (`railMachines`), `src/lib/uiPins.ts` (**26.4**, **26.5**, **27.1**, new; 27 relabelled),
  `docs/ui-{pins,surface-map}.md` (regenerated),
  `tests/unit/rail-circle-art.test.ts` (re-pointed at both files, 3 new cases; 17 passing),
  `tests/unit/request-context-art.test.ts` (rewritten to the new ruling; 15 passing),
  `tests/unit/request-rail-fit.test.ts` (re-pointed; 4 passing).
  ⚠️ **The rail's own doc comment would have been ORPHANED above `CircleZoom`** by the extraction -
  the fault this log recorded on 2026-09-22 for three other comments in the same file. Moved down to
  `export function RequestRail` in the same pass.
  ⚠️ **A `not.toContain("<img")` failed on its own explanation**, for the fifth time in this repo:
  the bar's prose NAMES `<img>` while saying there must not be one. That case reads the code with
  comments stripped.
  ⚠️ The zoomed view still lists EVERY machine and takes no cap - it exists to show the ones the
  circle had no room for, which is the opposite question.
  ⚠️ Verified: typecheck clean, lint 0 errors, **214 files / 3634 passing, 7 skipped** serially,
  and all three new rulings break-checked one at a time (the bar's names reverted to the active
  item, the details fit reverted to `cover`, the shared derivation emptied) - each went red alone.
  The 1 failure is the PRE-EXISTING `cancel-confirmation` CRLF vacuous-slice trap.
  🔴 **NOT SEEN RENDERED.** The bar needs a signed-in renter with a multi-item request, so the
  32px montage and the three names beside it are pinned by cases and argued from the rail's own
  measurements rather than photographed. The ~12px-per-machine figure above is arithmetic
  (32 x 1.16 / 3), not an observation, and it is the first thing to look at on the next deploy.

- **2026-09-22 - The change log moved to `docs/CHANGELOG.md`; this file keeps the recent entries only.**
  `CLAUDE.md` had grown to **537 KB / 173 entries**, and a project `CLAUDE.md` is re-read into the
  system prompt on EVERY turn - about 145,000 tokens of history paid for on every question, whether
  or not any of it was relevant. That is the single largest cost in a session here.
  Split: the ten newest entries stay, the other 163 go to `docs/CHANGELOG.md` unchanged. **58 KB now.**
  Files: `CLAUDE.md`, `docs/CHANGELOG.md` (new).
  ⚠️ **The split is byte-identical and was verified so**, entry counts and all: nothing was
  reworded, dropped or summarised. Both files keep the repo’s CRLF line endings.
  ⚠️ **`sed` on this machine STRIPS the CR**, which is how the first attempt silently rewrote
  531 KB from CRLF to LF. `head -n` / `tail -n +` preserve it. Same family as the CRLF traps this
  log already records for `cancel-confirmation` and `ui-pins`.
  ⚠️ `CertSelect.tsx:93` points at "the note in CLAUDE.md" for the production orange; that
  entry (2026-09-08) is in the archive now.

- **2026-09-22 - MANSOUR IS THE CARET: he rides the insertion point in the intake box, and the blinking bar is gone.**
  Owner, with a picture of the box reading «5 dump trucks in NEOM for 6 weeks» and his gear head sitting
  just after the last word: *"can u show this mansour icon as our cursor when typing in the text bix"*.
  Asked WHEN and whether the bar stays, he chose **whenever there is text** (the renter's own words as
  much as the agent's) and **hide the bar - he IS the caret**.
  🔴 **This REVERSES 2026-09-13's «A PERCH, not a caret»**, and the half of that ruling which blocked
  it was simply WRONG about this file: *"this field is a mirrored textarea whose glyphs are transparent
  - there is no element to measure against"*. `Intake.tsx` has rendered a MIRROR since 2026-08-31 - the
  full text, `whitespace-pre-wrap break-words`, sharing one `FIELD_TEXT` string with the textarea so the
  two cannot drift - which is exactly the element to measure against. **Checked before building rather
  than taken on trust**, which is the only reason this was a half-hour's work instead of a refusal.
  ⚠️ **The kit's own warning is respected rather than ignored.** It says a FIXED spot, *"his original
  complaint was that he drifted while you typed"*. Drift is LAG: there is no transition on his position
  and the measurement runs in a **layout** effect, so he is painted in the same frame as the character
  that moved him. A case pins both.
  🔴 **Measured with a `Range`, never with a span injected into the mirror.** The usual trick is a
  zero-width marker at the caret offset, and it is wrong here: the mirror wraps on `break-words`, an
  inline-block is an ATOMIC INLINE, and one dropped between two letters is a break opportunity the
  textarea does not have - so the two copies of the text would wrap differently, which is the
  double-vision this whole technique fails as and the one risk the block already warned about.
  🔴 **He stands BESIDE the character, never on it** - half his width plus a letter of air. Centred on
  the insertion point his disc covered the character just typed, which is the one the renter is looking
  at. Seen rendered, not reasoned about.
  🔴 **The side is decided by the RUN, not by the page**, and the first cut got this wrong in the way
  that only a picture finds. ~~`getComputedStyle(box).direction`.~~ An English sentence typed into the
  ARABIC build is an LTR run inside an RTL box, and signing the gap by the box put him straight back on
  top of «tankers» - the same overlap, arrived at from the other side. A neutral character (a space, a
  digit, punctuation) carries no direction of its own, and that is the ONE case the container answers.
  ⚠️ **A caret that follows a SPACE is measured against the character AFTER it**, so he stands in the
  gap between two words rather than on one - and that is also what makes a SOFT WRAP land correctly:
  the caret at the start of a wrapped line follows the space that ended the line above, and anchoring
  to it would strand him at the end of the previous row.
  ⚠️ **An EMPTY box draws nothing.** The placeholder types a real request through its examples, and
  him standing on its first letter would read as him writing the example.
  🔴 **THE COST, and it is his to overturn in one line.** With the bar hidden he is the only insertion
  point, so **mid-sentence he covers a letter or two** - a 22px mark cannot stand in a 4px word gap, and
  no placement fixes that. At the END of the text, which is the picture and the overwhelmingly common
  case, there is room and he is clear. If it grates: keep `caret-navy` while the caret is not at the
  end, and he appears only when appending. One condition, in one class string.
  ⚠️ **MIXED SCRIPT in one box is NOT solved**, and was not before either: English typed into the
  Arabic build is bidi-reordered by the browser (the leading `5` jumps to the far end), so the visual
  caret position is genuinely ambiguous and he follows the reordering. Both single-script cases are
  correct, which is what a renter actually types.
  Files: `src/components/screens/Intake.tsx` (`place`, `MANSOUR_CARET`, the caret state),
  `src/lib/uiPins.ts` (**15.5**, new), `docs/ui-{pins,surface-map}.md` (regenerated),
  `tests/unit/mansour.test.tsx` (the two perch cases rewritten, 6 new; 25 passing).
  ⚠️ **One `MANSOUR_CARET`, read by the element AND by the gap that keeps him off the letter** - a
  second copy is how he comes to sit half a character into the word the day somebody resizes him.
  ⚠️ `onSelect` is what catches a caret MOVE - an arrow key, a click into the middle of a word - and
  not only a selection, despite its name. Without it he follows typing and then stays behind the moment
  the renter goes back to fix a word. Pinned, because it reads like a redundant handler.
  🔴 **My own edit script wrote `\u26A0` into the test file as LITERAL TEXT** rather than as the
  character, for the fourth time this repo has logged that family. Repaired, and the rule stands: an
  escape that passes through a script layer is an escape that arrives as prose.
  ⚠️ The four cases that slice `place`'s body now share ONE helper that asserts its own anchors, so a
  rename cannot silently slice nothing and pass four assertions vacuously.
  🔴 **A DECORATION TOOK THE SCREEN DOWN, and only the full suite found it.** jsdom implements
  `Range` WITHOUT `getBoundingClientRect`, so the measurement threw inside a LAYOUT effect and the
  whole intake failed to render - two `canvas-history` cases went red on a change that only moves an
  icon. Guarded: anywhere with no layout engine gets no rider, which is the honest answer there. The
  rule is the general one, not the jsdom one - a mark that follows the caret must never be able to
  stop a renter typing.
  ⚠️ Verified: typecheck clean, lint 0 errors, 82 passing across the six intake, pin and palette
  suites, and **214 files / 3625 passing, 7 skipped** serially once the guard landed. The one
  remaining failure is `cancel-confirmation`, PRE-EXISTING and another session’s to fix (its CRLF
  vacuous-slice anchor, logged 2026-09-20); `ui-pins` went GREEN with this batch, because registering
  15.5 regenerated the two tables it had been failing on as stale.
  ⚠️ **SEEN RENDERED on a real dev build at 1568px**, which is how BOTH faults above were found: the
  reference sentence in English with daylight after «weeks»; a caret moved by arrow keys, which he
  follows; a wrapped two-line request, where he lands on the second row; the Arabic sentence in the
  Arabic build, where he sits to the LEFT of the run; and the English-in-Arabic case that caught the
  container-direction bug.

- **2026-09-22 - The deal room is read off the APP again: the sheet's header, its footer, its terms page and its compare card, plus a contact guard on the chat and TWO term predicates that were silently wrong.**
  Owner: *"can u check the deal room in the app, it has some changes in the ui - in behaviours - terms
  etc can u follow it exactly and align here"*, then, on the scope question, **"all but with web
  desktop ui screen"**. Read against `c9af28a3` (the app's own deal-room commit),
  `docs/plans/deal-room-negotiate-redesign.md` and the current Dart; the web ported this sheet on
  2026-09-18 and the app has moved a long way since.
  🔴 **TWO of these are BEHAVIOUR, not styling, and they are the ones worth reading.**
  `isConflictingTerm` and `isSettledByValues` (new, `contract/deal-room.ts`, app parity
  `TermModel`): **the server stamps `disputed` exactly ONCE**, in `buildTermsArray`, comparing the
  request against the bid at room creation — every later move writes `pending`
  (`deal-room.service.ts:2304`). So a clash raised in round TWO arrived here as `pending`, `decide()`
  called it «Not set» with two contradictory values sitting on the card, and **the accept gate let it
  through**. Its mirror: a counter that lands ON the supplier's value ALSO writes `pending`, so two
  identical values were reported as an open question and held the gate shut for good. Both fold case
  and whitespace, because `NET_30` from the request and `net_30` from the bid are one schedule.
  ⚠️ **Behavioural cases, deliberately** (`deal-term-state.test.ts`, 11): the sheet's own suite reads
  the SOURCE, and a source test cannot tell a right predicate from a wrong one — proved by mutating
  the rule and watching `negotiation-sheet.test.ts` stay green. Both mutations kill the new file.
  **The sheet, item by item:**
  (1) **The header is the RATE with its period, not the net incl. VAT** (app, 2026-09-20: *"show the
  price at top header without VAT/duration/units so it shows the same number as in the bid card
  exactly"*). Both figures were right and they were different quantities, so the room said «50/day»
  and the sheet said «58» over one deal. The request's **short code is restored under the name** —
  the redesign dropped the block carrying it and left no reference anywhere in the sheet.
  🔴 **The «🔔 New offer» eyebrow and the «Total» caption are BOTH withdrawn**, following the app's
  own removal of 2026-09-19. The turn cue survives where a renter meets it first: the room's price
  bar still draws «🔔 New reply».
  (2) 🔴 **The footer is rebuilt and the `‹ step ›` switcher is gone** (app, 2026-09-19: *"in the
  footer can't we get back to the live one, which has a next button explicitly, with log and accept
  if it is allowed"*). `🕘 · Back · ✓ Accept · [Next: Terms / Review & send / Send to the supplier]`.
  The chevron never said where it went, and on the last step it fired the one irreversible act in the
  sheet drawn as navigation. **The send greys when nothing has moved** (*"I sent the same bid 4 times
  in a row, no changes"*) and stays PRESSABLE, so the press says why.
  ⚠️ **Unanswered terms are NOT a gate, and never were one in the app** — checked against
  `negotiation_sheet.dart` rather than assumed: `onAllReviewedChanged` is an empty callback and
  `_next()` is an unconditional `setState`. The server accepts a reply with terms still `pending`.
  ~~`page === 1 ? unresolvedCount === 0 : true`.~~
  (3) **The price step**: the «All prices below are before VAT» caption ABOVE the table (read before
  the typing rather than under it, after); **per-unit rows with the count applied once at the end**
  when all three counts agree, which is the bid card's own shape; the factors under each leg
  («2,000 × 12»); and an excluded leg struck in **RED at 2px**, where a grey rule on faded text read
  as disabled rather than dropped.
  ⚠️ **Per-unit ONLY when the counts agree.** The room negotiates rental, delivery and return counts
  INDEPENDENTLY — 2 machines, 1 delivery, 2 returns is legal — and one multiplier at the end cannot
  describe that. A bid card never faces this; it carries one count.
  (4) **The compare card is the app's 2026-09-21 mock**: white, the gap pill riding the TOP EDGE, the
  two totals across a VERTICAL hairline with THEIRS leading in navy, and the per-leg rows **always
  open** — the «gap, line by line» expander is deleted, with the «did he move since his last round»
  line restored under each. ⚠️ It is drawn only when there are TWO positions (`supRound && myRound`);
  ~~`lastCounterBy === "supplier"`~~ asked who moved last, not whether there is anything to compare,
  and drawing it early echoes his own numbers back under «Your total».
  (5) **The terms page is the app's six sections**: `Pending · not specified by you` → `Conflict` →
  `Agreed ✓` → `Pending · not specified by the supplier` → `Acknowledged 🔒` **last**, each a header
  band carrying `(resolved/total)` with its rows inside the same card. **Only the OPEN card is
  drawn**; the dashed «waiting for the one above» placeholder is deleted from the markup AND the
  stylesheet. The Change button has **three labels** (`Choose another` / `Keep my choice` / `Change`),
  because they answer three different situations.
  (6) **The review guide is flat**, behind one collapsed «Matched» toggle with a status WORD per row,
  its header one line, its legend gone and its bar **four segments** — matched, differs, pending,
  needs-confirm. ~~Grouped by category with badge pills.~~ That grouping was a web-only layer.
  (7) **The room's CTA never says «Negotiate»** (app, 2026-08-17, restated 2026-09-20): it is
  «Edit your counter-offer» once the renter has countered and «Counter this price» / «اطلب سعراً أقل»
  before. The word named neither the act nor whose it was.
  (8) **The activity log is grouped by ROUND**, with «Round N» bands. The rounds were derived,
  collapsed and then FLATTENED, so ten entries read as ten unrelated events.
  (9) 🔴 **A CONTACT GUARD on the chat composer** (`contract/contact-guard.ts`, ported VERBATIM from
  the app's `contact_guard.dart`). A message carrying a Saudi mobile raises a red warning: the renter
  is **warned, never blocked**, because she already has the supplier's number and sharing hers early
  is her call. ⚠️ **Client-side, so it is a nudge and not enforcement** — the half covering old builds
  is the same rule in Stream's pre-send hook, which is owed and NOT built. The app's own file says so.
  ⚠️ **A WRAPPER (`sendTyped`), not a branch inside `send`.** `send` is one of the three senders
  RM3-AC-47 pins to the single `deliver` seam, so the guard sits in front of it and the seam keeps
  exactly its three callers. And «Share anyway» calls `send` directly: `contactWarned` is read off the
  closure, so coming back through the wrapper would re-ask the question it just answered.
  ⚠️ **The fixture list IS the contract** (`contact-guard.test.ts`, 11). The rule is now written
  twice; a case added here must be added to the app's `contact_guard_test.dart`.
  ⚠️ **`(053) 757 6005` does NOT match, in both clients**: `)` then a space is two separators in a
  row, which ends the run. Written down rather than "fixed", because the obvious fix diverges the two.
  **THE DESKTOP HALF, which is where this departs from the app on purpose** (his instruction). The
  app draws all of this in a phone column; run across a 1500px sheet, `space-between` puts related
  facts a screen apart. So the compare card is **capped at 940px and centred**, and the term card's
  header, the settled rows and the guide rows at **820px**. ⚠️ That is a cap on ANSWERS and one
  summary card — **not** the column cap this sheet withdrew on 2026-09-19; the bands, the table, the
  sections and the footer still run the width.
  Files: `src/lib/contract/contact-guard.ts` (new), `src/lib/quotation/bid-quotation.ts`,
  `src/lib/contract/deal-room.ts`
  (`bothSidesDiffer` / `bothSidesAgree` / `isConflictingTerm` / `isSettledByValues`),
  `src/components/deal-room/DealRoom.tsx`, `src/components/deal-room/deal-room-proto.css`,
  `src/components/map/ChatDock.tsx`, `tests/unit/{contact-guard,deal-term-state}.test.ts` (new, 22),
  `tests/unit/negotiation-sheet.test.ts` (6 cases rewritten to the reversals, 3 new; 23 passing),
  `tests/unit/chat-dock.test.ts` (RM3-AC-47's call-site case re-shaped, not weakened),
  `tests/unit/deal-room-quotation.test.ts` (1 new case for the operator clause; 20 passing).
  🔴 **A `not.toContain` failed on its own explanation for the FIFTH time in this repo.** The case
  pinning the eyebrow's removal read `not.toContain("theirsIsLatest")`, and the note recording the
  removal names it. It asserts the DECLARATION now.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean (a stylesheet fault is invisible to typecheck,
  lint and jsdom — this log's own rule of 2026-09-19), typecheck clean, lint 0 errors, **385 passing**
  across the ten sheet / chat / compare / guard suites, and the full suite serially at **3617 passing,
  7 skipped**. The 2 failures are the same PRE-EXISTING pair this log already records
  (`cancel-confirmation`'s CRLF vacuous-slice trap, `ui-pins`'s CRLF staleness); neither file was
  touched. Both new predicates break-checked — dropping the pending arm kills 1 case, un-folding the
  comparison kills 3.
  ⚠️ **SEEN RENDERED at 1568px**, all three steps plus the RTL review, as static markup carrying the
  real class names and the COMPILED stylesheet — which is how the desktop stranding was found and how
  the caps were judged. Measured rather than eyeballed: the card at 940px, the pill centred to the
  pixel in BOTH directions (945/945 ltr, 960/960 rtl) and overhanging the top edge by half its height,
  the vertical rule 1px `--border-hair`, and «theirs» on the reading-start side under `rtl`.
  ⚠️ **A false bug was nearly reported**: the conflict tint measured white because `getComputedStyle`
  was read mid-`transition`. With transitions disabled it is `#f7e3e3` on a 25% danger border. Measure
  a transitioned property with transitions OFF.
  🔴 **NOT seen on a real room**, which needs a signed-in renter with a live deal room and a
  supplier's standing round, so the three steps are pinned by cases and by the specimen rather than
  watched in place.
  (10) 🔴 **`operator_nationality` leaves the QUOTATION too, by its SECOND route** (app,
  `kHiddenTermKeys`, 2026-09-21; owner: *"remove operator nationality from all surfaces now, in
  request, bid, deal room"*). `HIDDEN_DEAL_ROOM_TERM_KEYS` strips the term ROW out of the sweep and
  had done since 2026-09-18 — but the nationality ALSO arrived as `details.operatorNationality` and
  was joined into the operator clause's own detail line, which that filter never touched. So the web
  went on printing «Saudi · TÜV» on the paper after the app had stopped. **Nothing pinned it**, which
  is why a case now does, break-checked by putting the value back.
  ⚠️ **Both builders, in one change.** The bid quotation and the deal-room one are two functions, and
  the app forbids exactly that drift (*"two rentee routes to «the quotation» must not land on two
  different documents"*). The CERTIFICATE still prints; a supplier who declared neither gets the bare
  «operator included» sentence rather than a specification he never gave, which was already the
  fallback. `operatorNationality` stays on the view and is still parsed — display only, as the app's
  own note says.
  ⚠️ Done after the other session left the tree; `nationalityLabel` went with it rather than being
  left imported and unread.
  ⚠️ **NOT changed, and it is already satisfied**: the app appends «per unit» to the price bar's rate
  above one unit. The web's bar carries an All / Per-unit segmented control plus a caption saying
  which, which is strictly more; removing it to match would be a regression nobody asked for.
  🔴 **ANOTHER SESSION IS WRITING TO THIS TREE.** `git status` was clean at session start and now
  carries an in-flight quotation alignment across `bid-quotation.ts`, `clauses.ts`, `render.ts`,
  `bids.ts`, `link-bids.ts`, `agent-bids.ts`, `golden.ts` and six test files — plus its own edits to
  `deal-room.ts`, which this change also touches. The two do not overlap textually and both survived,
  but the counts above were taken against a tree holding both.
  🔴 **APP DEFECT, reported not copied**: `negotiation_review_step.dart:277` calls
  `l10n.dealGuideReady(total, matched)` against `dealGuideReady(int done, int total)`, so the app's
  guide header prints «8/3 ready» where it means «3/8». The web prints it the right way round.

- **2026-09-22 - The quotation is read off the APP again, line by line: the party rows, the marks, the reference strip, the signature strip and every word on them.**
  Owner: *"check the logic - entry point - ui - structure and everything in the qoutation of the app and
  use it exacly"*. Read against `quotation_document.dart` (2,558 lines), `live_quotation_document.dart`,
  `bid_quotation_page.dart` and the deal room's own `quotation_button.dart`; ten things had drifted since
  the 2026-09-18 port and each is named below.
  🔴 **THE ENTRY POINT, checked first and the most interesting finding.** The app's deal-room link has
  TWO destinations - `onViewSigned` on a CLOSED room, `onPreviewDraft` before - and **both push
  `RouteNames.bidQuotation` with the bid id**. Its own comment says why: *"Two rentee routes to «the
  quotation» must not land on two different documents."* The web has two BUILDERS
  (`buildBidQuotationDoc` and `buildDealRoomQuotationDoc`), which is the split the app forbids, and the
  two had drifted apart exactly where nobody looks.
  ⚠️ **The two builders are KEPT and made to agree**, rather than collapsed. The deal-room document is
  priced off the ROOM (`computeQuoteTotals` over the negotiated rounds) and the bid one off the BID; one
  builder would mean the deal room reading its figures back out of a bid payload that does not carry the
  counter, which is a pricing change wearing a layout change's clothes. What is now identical is
  everything a reader sees: the clauses, the legal list, the refs, the strip and the wording.
  (1) 🔴 **The «✓ Agreed» mark is DELETED**, which reverses 2026-09-18 on the app's own reversal. The
  app added it that day and removed it the next: *"a quotation is a legal document, and a clause
  annotated with its negotiation state is not how one is written"*. `isAgreedTerm` survives and still
  ORDERS the sweep - settled terms first - so nothing about which terms print, or in what order, moved.
  (2) **A party row is ONE RUN, `label: value`.** ~~The label on the start edge and the value pushed to
  the end by `justify-between`.~~ A value long enough to wrap then broke into its own narrow column with
  its label stranded opposite it; the app sets the pair as a single `Text.rich` so they wrap together.
  (3) **The party's MARK is 48px, at the box's trailing edge, and only behind a VERIFIED party.**
  ~~28px on a tile, before the name, drawn whenever a URL was present.~~ Three faults in one element:
  above-the-text reserves its height whether or not anything follows (the band of white the app's owner
  reported), a tile paints an empty white rectangle when the image 403s, and a logo can outlive the
  verification it was uploaded under - printing it puts a firm's brand beside a party nobody checked.
  (4) 🔴 **The REQUEST number leaves the reference strip for the SIGNATURE strip**, with the support
  address beside it. That strip is the one band on the sheet that speaks for the PLATFORM; the navy
  footer speaks for the supplier, and `footer.supportLine` is deleted because a platform line in the
  supplier's own footer credits the wrong party (the app's own 2026-09-16 ruling, which the web had
  carried only half of).
  (5) **Five reference pairs, in the app's order and its own casing**: `QUOTATION REF` (Latin in both
  locales - it is the app's string), `Issue date`, `Valid until`, `Work site`, `Currency`. The CSS
  `text-transform: uppercase` on the label went with them: the app's labels are already cased, and
  shouting all five at a reader who quotes one was the web adding emphasis the design does not have.
  (6) **The grand total prints NO currency word.** The app states the currency once, in the strip - and
  repeating it here is what pushed `219,075.00 SAR` past its own column on 2026-09-18.
  (7) **The deal-room document prints THE SAME FIVE LEGAL CLAUSES.** ~~A two-sentence disclaimer, on the
  reasoning that this document is the shorter one.~~ `_TermsList` appends `quotationTcValidity` …
  `quotationTcESignature` on every surface that opens it; a sheet whose terms depend on which button
  opened it is two sheets. ⚠️ The DRAFT sentence stays ahead of them and is web-only, because the app has
  no preview/final split on this paper and a badge does not survive being read aloud down the phone.
  (8) **Every string re-read off the ARB**, both locales: `Unit` not `Units`, `Duration` not `Period`,
  `Subtotal before tax`, `Total · incl. VAT` / `الإجمالي · شامل الضريبة`, `المبلغ كتابةً` (the web had
  dropped the tanwin), `Terms and Conditions`, `CR #` / `VAT #`, `الهاتف` not `الجوال`, `Rentee` /
  `المُستأجِر`, and the five legal clauses WITHOUT the trailing full stops the web had added.
  (9) **An empty description cell prints `—`**, and so does an empty duration. A blank reads as a column
  that failed to render rather than as a machine with nothing recorded against it.
  (10) **The amount in words takes its own value.** On an OPEN-ENDED bid it spells the recurring rental
  rather than the grand total: the line is framed as an estimate for one period and the total folds in a
  mobilisation fee paid once, so spelling it there states a per-period figure that is not one. That is
  the app's `amountInWordsValue` exactly.
  Files: `src/lib/quotation/render.ts` (the template; `requestRef`, `supportEmail` and
  `amountWordsValue` are new, `QuotationFooter.supportLine` and `QuotationClause.agreed` are gone),
  `src/lib/quotation/clauses.ts`, `src/lib/quotation/bid-quotation.ts` (`SUPPORT_EMAIL`,
  `supplierLogoUrl`), `src/lib/contract/deal-room.ts`,
  `tests/unit/{quotation-render,quotation-unified,deal-room-quotation}.test.ts`.
  (11) 🔴 **The supplier's MARK reaches the sheet at last, and it was never backend work.** Owner,
  on the first report of this: *"i didnt underant , it didnt render the supplier logo?"* — and he is
  right to ask, because the template drew it in the specimen and nothing drew it on a real bid.
  ~~Reported here as owed backend work.~~ **Wrong, and checked rather than assumed**: the app reads
  `bid.supplier.store.logoKey` — off the BID PAYLOAD itself, nested under the supplier — so the field
  is on the wire and `mapBid` was dropping it. `BidCard.supplierLogoUrl` reads it now, TOLERANTLY
  across the spellings the two services might land on (`supplierLogoUrl`, `storeLogoUrl`,
  `supplier.store.logoUrl`, `supplier.store.logoKey`, `supplier.logoUrl`) and through `mediaUrl`,
  which passes a signed http URL through and builds the public one for a bare key — the app's own
  `S3Url.from`.
  ⚠️ **ONE logo, TWO slots**: the party box and the navy footer take the same value, so a sheet
  cannot name one firm with two different marks.
  🔴 **The STORE's logo, never the profile's `companyLogoKey`.** That key lives under the private
  documents prefix, so a public URL built from it answers 403 — and an `<img>` absorbs that as «this
  firm has no mark», which is a failure nobody can see. The app states the same rule where it fills
  the field.
  ⚠️ **An off-platform submission is `null` EXPLICITLY**, at both construction sites: it was typed
  into the renter's own supplier list, so there is no account behind it and no store to have a mark.
  Same ruling the dashboard's bid rail took on 2026-09-19.
  🔴 **NOT observed against a live bid** — this machine has no session, so the read is proved by
  cases and by the app's own source rather than by a payload. If the slots are still empty on the next
  deploy, that is the projection and not the sheet.
  🔴 **A backtick inside the CSS template literal ended the string AGAIN**, four days after this log
  recorded it. Three comments I wrote into `QUOTATION_STYLE` quoted class and API names in backticks and
  the compiler then read the stylesheet after them as expressions. **A template literal holding a
  stylesheet may contain neither a backtick nor a `${`** - there is no third rule to learn, and this is
  the second time.
  ⚠️ **A `not.toMatch` in the deal-room suite went VACUOUS the moment the legal clauses landed.** It
  asserted the retired `safety_certifications` term never prints, by matching the WORDS - and the
  platform's own third clause reads *"… satisfying mandated safety certifications"*, so it would have
  passed on a document that printed the term as well. It matches the clause's own bold title now.
  ⚠️ **Nothing about the money moved.** Same `computeRentalTotal` / `computeQuoteTotals`, same three
  money-cell states, same halalas rule, same unit arithmetic, same VAT. A test block pins each, because a
  wording sweep is exactly when a figure changes unnoticed.
  ⚠️ Verified: **`NODE_OPTIONS= npx next build` clean**, typecheck clean, lint 0 errors,
  **212 files / 3587 passing, 7 skipped** serially, 212 passing across the seven suites this change
  reaches, and the logo path break-checked (the bid's own value cut out of the chain — one case went
  red).
  ⚠️ **The 6 failures are in THREE files and NONE is from this change**, each proved rather than
  assumed: `cancel-confirmation` and `ui-pins` are the pre-existing CRLF pair (stashed this work and
  they still failed), and `negotiation-sheet`'s four are **another session's work in flight** — it
  removed `theirsIsLatest` and reworked the term queue in `DealRoom.tsx` today, following the app's own
  removal, and has not updated that suite yet. Reported, not touched: mending somebody's half-finished
  change silently is how it ships broken.
  ⚠️ **Something outside this session is writing to this tree**, which this log has recorded before:
  `src/lib/contract/contact-guard.ts` is untracked and not mine, and `DealRoom.tsx` changed under me
  mid-run.
  ⚠️ **SEEN RENDERED**, EN and AR, from a throwaway specimen carrying the real builder and the compiled
  tokens: the party rows as single runs, the mark at the trailing edge in both scripts, the five refs,
  the strip reading «… · Q-2026-00321-1693 · Request # REQ-00042 · 9 Sept 2026 · support@moedatech.com»
  with the seal at its end, and a supplier-only footer.
  🔴 **NOT seen on a real bid or a real room**: both surfaces need a signed-in renter, so the figures
  are pinned by cases and the layout by the specimen.

- **2026-09-22 - The circle's machines are bigger and overlap; the zoomed view is named by them and drawn on their own ground.**
  Owner, on the montage and on the dialog it opens: *"u can make them a little bigger and closer and
  when openin them show their names at top instead of the rfq and the images must show like in the
  circule with the merged background"*.
  (1) **`SPREAD` 132 and `OVERLAP` 16, and they are ONE decision.** Each machine is drawn at
  `SPREAD / n` of the width and every one after the first pulled back by `OVERLAP / (n - 1)`, so the
  row is `SPREAD - OVERLAP` = **116%** wide at any count: two at 66% overlapping 16, three at 44%
  overlapping 8. The row therefore oversails the disc by the same 8% a side whatever the group holds,
  which the round clip takes and the mask has already faded.
  ⚠️ **Why an even share read small**: each asset is shot with its own margin either side, so half a
  circle of PICTURE is appreciably less than half a circle of MACHINE. The boost eats the margin and
  the pull-back closes the gap where two margins met.
  🔴 **`flex-none` on each picture is load-bearing.** The row is deliberately wider than the disc,
  and a flex item that may shrink is shrunk straight back to fit - which would undo the whole of
  this, silently, and look like the boost never applied.
  ⚠️ `marginInlineStart`, never `marginLeft`: the rail mirrors whole under `dir="rtl"`.
  ⚠️ **Chosen at the real 52px magnified 6x**, against an even share and against 72/22: the wider
  pair pushes the outer machines into the rim and the deeper overlap eats the excavator's bucket.
  (2) **The dialog is titled by the MACHINES.** ~~The RFQ code.~~ He opened it by pressing a
  picture, so the reference answered a question he had not asked. `CircleZoom` takes `machines`
  alone now and builds the title itself - leaving `title` on the props and merely not rendering it
  is how a dialog quietly goes back to showing the code.
  ⚠️ The separator is «، » in Arabic: a Latin comma between two Arabic names inside an RTL block
  reorders at the join.
  (3) 🔴 **The zoomed tile IS the picture, on `--photo-ground`.** ~~A square `surface2` tile with
  the picture `object-contain`ed inside it.~~ That drew grey bands above and below every machine and
  a hard edge where the picture's own beige met them: the circle's own fault of yesterday, on a
  bigger canvas. No fit and no scale either - both exist to fill a 52px ROUND hole, and a box that
  takes the picture's own height has nothing to fit.
  ⚠️ **`aspect-square` survives on the GLYPH arm alone.** A fallback has no picture to take its
  height from, and a 1px-tall grey box is not a tile.
  Files: `src/components/workspace/RequestRail.tsx` (`SPREAD`, `OVERLAP`, `CircleArt`,
  `CircleZoom`), `tests/unit/rail-circle-art.test.ts` (3 cases re-pointed, 3 new; 14 passing).
  ⚠️ Verified: typecheck clean, lint 0 errors, the suite, and the boost break-checked by dropping
  `flex-none` - the row collapsed back to an even share, and the case went red.
  ⚠️ **SEEN RENDERED** at the real 52px and at 6x, two machines and three, and the zoomed pair
  photographed BESIDE the old square tile - which is how the grey bands were judged rather than
  argued.
  🔴 **NOT seen on the real rail**, which needs a signed-in renter with a multi-item request, so
  the dialog's title and its grid are pinned by cases rather than watched.

- **2026-09-22 - The montage's pictures lose their own EDGES, and the first attempt at it masked nothing.**
  Owner, twice: *"cant we merge them in one background? not shown as 2 seperate imeages"*, then, on
  the first fix shipped and deployed, *"still in the images the same"*.
  🔴 **Yesterday's entry claimed the merge was seamless on the ground colour alone. It was not, and
  the reason took two goes to find.** The twelve samples behind `--photo-ground` were taken at the
  CORNERS of two assets and agreed to 4/255 - true, and it hid the thing that matters: the studio
  sweep is not FLAT. Measured on `taxonomy-icons/spider-lift`: corners **#d8d4cd**, mid-edge
  **#e6e1da**, centre **#ddd9d2**, against a disc of **#e3ded7**. `object-contain` draws the whole
  file, so each machine arrived inside a rectangle whose middle is paler than the disc around it,
  and two of those read as two pasted pictures.
  🔴 **THE FIRST MASK DID NOTHING TO THE TOP AND BOTTOM, and that is the trap worth naming.** A
  CSS mask is sized to the ELEMENT BOX, never to the picture inside it. With `h-full` the box was
  **26x52** while `contain` drew the picture **26x19.4** - measured in the browser - so an
  `ellipse 62% 62%` put its solid core at +/-17.9px vertically while the picture spanned only
  +/-9.7px. Every pixel of it sat inside the solid part; its horizontal edges were never touched.
  It shipped, it deployed, and it changed nothing, which is exactly what he reported.
  **The element must BE the picture.** `h-auto` makes the box 26x19.4, and `closest-side` then puts
  the gradient's end on the picture's own edges whatever its aspect. `object-fit` goes with it: at
  its own aspect there is nothing to fit.
  ⚠️ **68% solid was chosen against 40 and 55 at the real size, magnified 9x.** All three remove
  the rectangle; the lower two also fade the crawler's counterweight and the spider lift's
  outriggers for nothing.
  ⚠️ **Compared against the two alternatives at 14x** before reaching for a mask at all:
  `object-cover` fills each half so has no rectangle, at the cost of a **2.7x crop** that leaves a
  fragment of each machine and a hard vertical seam where the two meet; a top-and-bottom fade
  closes the horizontal edges and leaves the vertical ones standing.
  ⚠️ Per CELL, never on the disc: the disc's own edge is the circle, already a clean shape, and
  fading that greys the rim. A case pins both halves.
  ⚠️ `black` rather than a hex - a mask reads ALPHA and never hue, so the colour is arbitrary,
  and a hex here would be a paint value to `palette-drift` that paints nothing.
  ⚠️ The SINGLE-picture path is untouched: `contain` at 1.34 fills the circle, so that asset's
  edge becomes the disc's own and there is no rectangle to dissolve.
  Files: `src/components/workspace/RequestRail.tsx` (`CELL_MASK`, `h-auto`),
  `tests/unit/rail-circle-art.test.ts` (1 new case, 1 rewritten; 11 passing).
  ⚠️ **Three doc comments had been orphaned by two days of successive insertions** - `fitOf`'s
  note sat above `MAX_IN_CIRCLE`, and `CircleArt`'s above `CELL_MASK`. Re-attached. A comment one
  declaration away from its subject describes the wrong thing.
  ⚠️ Verified: `.next` deleted, `NODE_OPTIONS= npx next build` clean from scratch, the mask
  present in the built chunk, typecheck clean, lint 0 errors, **212 files / 3585 passing, 7
  skipped** serially, and the box-is-the-picture rule break-checked (`h-full object-contain` put
  back - one case went red). The 2 failures are the same PRE-EXISTING pair
  (`cancel-confirmation`'s CRLF vacuous-slice trap, `ui-pins`'s CRLF staleness).
  ⚠️ **SEEN RENDERED at 9x and 14x**, which is the only way any of this could be judged: the
  shipped-and-wrong version beside `cover`, beside the corrected geometry, on the two assets whose
  sweeps differ most. The DOM was also measured rather than eyeballed - the 26x52 box against the
  26x19.4 picture is what identified the fault.
  🔴 **AWS is reachable from this machine, under the `moedatech` PROFILE.** `aws sts
  get-caller-identity` alone answers `NoCredentials` because there is no DEFAULT profile, which is
  what the 2026-09-19 entry recorded as "no credentials". `--profile moedatech` (eu-central-1,
  `user/fadwaali`) reads Amplify: `aws amplify list-jobs --app-id dgdtg4fmrwwfn --branch-name
  staging`. That is how this session proved jobs **782** and **783** SUCCEEDED and that the branch's
  active job was the commit in question - so «it looks unchanged» could be traced to the code rather
  than blamed on a build nobody could see.

- **2026-09-21 - The chat keeps the caret after a send, so the next message does not need a click first.**
  Owner, forwarding a client on the web app: *"When the client is using the chat on the WebApp he
  should press on the text panel every time he wants to send a message"*.
  🔴 **TWO causes, and closing either one alone leaves the complaint standing.**
  (1) **The FIELD was gated on the flight.** `disabled={busy || uploading || !active}` - and a
  disabled control cannot hold focus, so the browser BLURRED the input the instant `busy` went
  true. That is every send, for the whole round trip, and `deliver` can create the deal room inside
  it. The field came back enabled and empty with the caret nowhere: focus had fallen to `<body>`.
  (2) **Pressing SEND moves focus to the send button**, which then disables itself the moment the
  text is cleared - so even with (1) fixed, a click-send strands focus on a dead button and then on
  `<body>`.
  **MEASURED in a browser, both paths, before and after**, rather than argued from the source:
   · OLD, Enter-send  -> focus on **BODY**        · NEW -> focus on the **input**
   · OLD, click-send  -> focus on the **button**  · NEW -> focus on the **input**
  **The fix.** The three things that ACT keep both flight gates - the attach button, the recorder
  and the send button - and the Enter key now asks the same question (`if (!busy && !uploading)`),
  so nothing can be sent twice. The FIELD keeps `!active` and nothing else, and `focusComposer()`
  puts the caret back after a typed send and after an attachment.
  ⚠️ **`!active` stays on the field.** That is «there is no conversation here», not a flight:
  nothing typed into it could go anywhere, and the placeholder is all the row has to say.
  ⚠️ **`focusComposer` is guarded on the element still being focusable** (`!el.disabled &&
  el.isConnected`). A send can resolve after the dock is closed or the room goes inactive, and
  focusing a detached or disabled input scrolls the page to it.
  🔴 **The clear had to change with it, and this is the trap the old `disabled` was hiding.** With
  the field live a renter can type WHILE the line before it is on the wire, and `setText("")` would
  then wipe those keystrokes as the answer to an earlier message. Both doors clear only what
  actually went: `prev.trim() === body` for the typed line, `prev === caption` for an attachment's.
  ⚠️ The VOICE note does not refocus. Its text never came from this field, and popping the keyboard
  up at the end of a recording is not what the renter asked for.
  Files: `src/components/map/ChatDock.tsx`, `tests/unit/chat-dock.test.ts` (1 case rewritten, 3 new;
  77 passing).
  ⚠️ **ONE composer in the product**, checked rather than assumed: `ChatDock` is the only thing that
  calls `sendMessage({ text })`, and `BidMapWorkspace` is its only mount. The deal room renders the
  log and shares this dock's composer rather than keeping a second one.
  🔴 **My own comment broke the test that counts the gates, and it is the FIFTH time in this repo.**
  The rewritten case reads `disabled={...}` out of the composer's source, and the JSX note I wrote
  above the input quoted the retired gate verbatim - so the count came back 5 instead of 4 and the
  case failed on its own explanation. The prose names the tokens now («gated on `busy`, `uploading`
  and `!active` alike») and never the attribute. `basis-[34rem]`, `object-contain`, the CTA halo and
  `-z-10` were the other four.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, **201 files /
  3414 passing, 6 skipped** serially, and both halves break-checked one at a time (the field
  re-gated on the flight, then the refocus deleted from the typed send) - each went red alone. The
  3 failures are PRE-EXISTING on a clean beta tree, confirmed by stashing earlier today:
  `live-bids`, `share-request-email` and `ui-pins`.
  ⚠️ **SEEN BEHAVING**, which is the only way this could be judged - jsdom has no focus model worth
  the name: both composers built side by side in a real browser, the old one and the new, driven
  through an Enter-send, a click-send and a mid-flight keystroke, with `document.activeElement`
  read after each. The table above is that run.
  🔴 **NOT seen on the real dock**: it needs a signed-in renter with a live bid, so what has been
  exercised is the mechanism in isolation rather than the dock itself.
  ⚠️ **`src/components/map/ChatDock.tsx` is byte-identical on `origin/staging`**, so this fix wants
  porting there as-is rather than re-deriving - checked, not assumed.

- **2026-09-21 - A multi-item circle stands its machines on ONE ground, three at most, and a double press opens them big.**
  Owner, on a rail tile whose group holds a Spider Lift and a Crawler Excavator but drew only the
  first: *"for multi item requests we put the image of first item in the request in the top circule,
  but cant we make the multi item take multi equipmet images small in this circule? and clicking
  double on the circule open the circule image big on the screen (still take me to the request
  clicked) but we will see the zoomed in image"*, then, on the first cut: *"cant u merge their
  backgorudn like they sit on one background and zoom them out? show 3 items at most in the
  circule"*.
  🔴 **The first cut was a GRID OF CELLS** - halves, then quarters, each on its own grey tile
  with a hairline between them, and a «+N» cell past four. He is right about it and the reason is
  worth keeping: four framed thumbnails in a 52px circle read as four broken pictures, not as one
  request holding four machines. **Withdrawn the same hour.**
  **What ships**: the machines stand SIDE BY SIDE on one continuous ground, each `object-contain`
  at its share of the width - which is what «zoom them out» asks for, and what leaves each one
  whole. No cells, no hairline, no grid.
  🔴 **`--photo-ground` under them is what makes the merge SEAMLESS rather than merely tidy.**
  These renders are all shot on one beige studio sweep - measured earlier the same day across two
  assets, twelve samples, every one within 4/255 of #e3ded7 - so pictures laid edge to edge on a
  disc painted that colour have no boundary at all. On `surface3` they draw a visible rectangular
  beige band across a grey circle, which is the state this replaces. **Both were photographed at
  9x before choosing**, and at that magnification there is no seam to find.
  ⚠️ **The disc takes the beige only when it holds a PICTURE.** Behind the glyph fallback a beige
  disc carrying a grey drawing reads as a photograph that failed, which is the state it would be
  imitating - that keeps `surface3`. The same ruling the machine card took hours earlier.
  **THREE at most** (his number). A fourth machine is 13px wide, which is a mark rather than a
  machine, and the count badge already states how many lines the request really holds - so there is
  no «+N» inside the circle, which would say it twice.
  🔴 **A cell takes NO scale, where the single picture still takes 1.34.** Looked at both ways at
  the real size before choosing: the 1.34 exists to hide one drawing's letterbox band against the
  circle's CURVE, and in a row the neighbours ARE the rest of the band. Scaled, each machine is
  cropped to its middle third for nothing.
  **The zoom**: a double press opens every machine large, each named and with its unit count, and
  still picks the request. `onClick` has already fired twice by then and picking the same request
  twice changes nothing, so the selection stays the single press's job and the double press only
  adds the view. Withheld when the group has no artwork at all: a dialog of grey glyphs is not a
  zoomed picture.
  ⚠️ **The zoomed view lists a machine whose picture never loaded**, named, with the glyph. That
  line is still part of the request, and a view holding fewer machines than the ITEMS tabs would
  repeat the circle's own compromise where there is room not to. It is `object-contain` with no
  scale either: the crop and the 1.34 both exist to fill a 52px ROUND hole.
  🔴 **`broken` is keyed by URL now, not by tile.** Its old note argued for by-tile *"because the
  same subtype can appear on several rows and they fail together"* - true while a tile held ONE
  picture, and wrong the moment it holds three: one 403 would blank every machine in the group. By
  URL the same subtype failing on five rows still costs only that subtype, which is what the old
  note was actually after. **Not the edge case**: of three assets pulled by hand today,
  `mobile-crane-all-terrain` answered 403 and two answered 200.
  Files: `src/lib/contract/workspace.ts` (`RailMachine`, `RailTile.machines`; `railTiles` takes the
  locale), `src/components/workspace/RequestRail.tsx` (`MAX_IN_CIRCLE`, `fitOf`, `CircleArt`,
  `CircleZoom`), `src/components/workspace/RequestsWorkspace.tsx`,
  `tests/unit/workspace.test.ts` (3 new cases), `tests/unit/rail-circle-art.test.ts` (new, 10),
  `tests/unit/request-rail-fit.test.ts`.
  ⚠️ **`imageUrl` is KEPT beside `machines`** and both are derived in one pass. A one-machine
  request is the ordinary case and drawing it through the montage code would be a row of one; the
  single pass is what stops the two describing different machines.
  ⚠️ **`request-rail-fit.test.ts` was re-pointed, not weakened.** It read the tile's inline
  `imageIsPhoto` ternary, which is now `fitOf`; the RULE is unchanged and the expression moved,
  because a rail that draws several pictures must not hold two answers to one question.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, the full
  suite serially, and four rulings break-checked one at a time across the two cuts (the cell scaled
  like the whole circle, the montage threshold moved, the grey disc restored, the cap raised to 4) -
  each went red alone. The 2 remaining failures are PRE-EXISTING: `cancel-confirmation` (the CRLF
  vacuous-slice trap reported on 2026-09-20) and `ui-pins` (the CRLF staleness - re-running the
  generator produces NO content diff, only line endings, so the docs were left alone).
  ⚠️ **SEEN RENDERED** at the real 52px in a rail strip - one, two, three, a five-machine group
  capped at three, a closed one and one with no artwork - and again at 5x and 9x, which is how the
  seam was judged and how the first cut was rejected.
  🔴 **NOT seen on the real rail**, which needs a signed-in renter with a multi-item request, so
  the double press and the dialog are pinned by cases rather than watched.

- **2026-09-21 - The bid strip is NOT centred: withdrawn two days after it landed.**
  Owner, on a 1920 screenshot of one bid card floating in the middle of the panel: *"why this
  cewntered? revert it back"*.
  🔴 **This withdraws 2026-09-19's `justify-center-safe`**, which was his own pick from four options
  put to him at the time. The card sits at the READING START again, which is where every other band
  on the page begins, and a lone bid on a wide screen simply has white after it.
  ⚠️ **The measurement behind the withdrawn version is kept, in the component and in the test**,
  because it is what will be reached for again: the gutters WERE equal and were measured so - 37px
  of grey on the leading edge, 39px on the trailing - and what was unequal was the CONTENT, a 344px
  card with ~1480px of white after it, because `PAGE_MAX` became `max-w-none` the same morning and
  this container went 1360 -> 1840 while the card did not grow with it.
  🔴 **If it is ever centred again it must be `center-safe`, and the test now says so as an
  assertion rather than as prose.** This is an `overflow-x-auto` scroller: plain centring overflows
  at BOTH ends, and the overflow past the start edge cannot be scrolled to, so on a request with six
  bids the FIRST one becomes unreachable. That is the whole reason the withdrawn version carried the
  suffix.
  Files: `src/components/workspace/BidCards.tsx`, `tests/unit/bid-cards-rail.test.ts` (1 case
  rewritten to the withdrawal).
  ⚠️ Verified: typecheck clean, lint 0 errors, 6 passing in the strip's own suite. Not photographed:
  it is the removal of one utility, and the state it restores is the one that shipped for weeks.

- **2026-09-20 - A cancellation SAYS what it did, and a request already cancelled stops being reported as a failure.**
  Owner, forwarding a renter on beta stuck on «لم يتمّ الإجراء. حاول مجددًا» over RFQ-00190: *"it is
  cancelled in backend but no succuess message or failed mesage shown or anything so he just keep
  trying and says fail cause already cancelled so make sure the state is clear"*.
  🔴 **THREE faults, and the loop needs all three.**
  (1) **The drawer's catch CLOSED THE DIALOG AND SET NOTHING.** `RequestDetailsModal.doCancel` ended
  `catch { setBusy(false); setConfirmCancel(false); }` - the one call site of `ConfirmCancelModal`
  that never passed its `error` prop. So a refused cancel said *nothing whatsoever* and looked
  exactly like a press that had not registered.
  (2) **Its success was silent too**: `onChanged(); onClose();` dismissed every layer, on the one act
  the backend has no inverse for.
  (3) 🔴 **A refused DELETE was read as «the request is still live», and it is not.** It means the
  backend would not do it AGAIN, and the commonest cause of that is that it already did - so the
  screen said the opposite of the truth and the renter pressed again, which refused for the same
  reason. Every refusal is now settled by RE-READING the request (`cancelRequests` in `client.ts`):
  status CANCELLED/ABANDONED ⇒ the success note, whichever press put it there.
  **The reference is the APP's own request-detail page** (`request_detail_page.dart`): a loading
  overlay, then a success snackbar and a jump back to My Requests, or an error snackbar carrying the
  BACKEND's own sentence through `localizedError(message, messageAr)`. The web threw that sentence
  away - `cancelRequest` built `new ApiError("unknown", "HTTP 409")` and dropped the body - so «a
  request can only be cancelled while it is open or active» arrived as «that didn't go through». It
  is parsed and carried now (`backendCode`, `detail`, `messageAr`), and printed when nothing better
  can be read.
  ⚠️ **`Promise.allSettled`, never `all`.** On a fanned-out RFQ `all` rejects at the first refusal and
  throws away what the other items answered: five cancelled lines and one accepted one reported as a
  total failure, and the retry then re-sent the five, which the backend refused in turn. A partial
  now says «3 of 4 were cancelled» AND reloads the table behind the open dialog, so the retry aims
  only at what is genuinely still open.
  🔴 **A refusal no retry can move draws NO «Try again»** (`canRetry`). «Already accepted», «already
  cancelled» and «expired» are states a second press cannot change, and a live retry over one of them
  is the loop rebuilt one press later. One button, «Close», brand-filled.
  ⚠️ **The success note is the 2026-09-17 ruling, ported to beta**, which did not have it: one box,
  two states, a tick where the question was asked, and Done carries the reload. `busy` is not the
  guard there - the confirm button is simply not rendered in the done state.
  ⚠️ `cancelBlockedReason` gained a `noun`: the drawer cancels one REQUEST and the dashboard row the
  items of a group, and calling a whole request «this item» reads as a statement about something else
  on the screen. It had no live caller before this (both its old ones are commented out).
  Files: `src/lib/api/client.ts` (`cancelRequest` rewritten, `cancelRequests` new),
  `src/lib/contract/requests.ts` (`CancelReport`, `isCancelledStatus`, `cancelFailureLine`,
  `cancelRetryWorthIt`; `cancelBlockedReason` gained `noun`),
  `src/components/requests/RequestEditModals.tsx` (`done`, `canRetry`),
  `src/components/workspace/RequestDetailsModal.tsx`, `src/components/home/HomeRequests.tsx`,
  `tests/unit/cancel-outcome.test.ts` (new, 18 cases).
  ⚠️ **The BACKEND already fixed its half and it may not be deployed.** `c9cc3946` (on `main` and
  `staging` of `Moedatech-App`) makes a duplicate cancel a no-op instead of a 409, for this exact
  reason, and its own comment records the same measurement on staging in September. The web no longer
  depends on it either way, which is the point.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, **201 files /
  3411 passing, 6 skipped** serially, and three rulings break-checked one at a time (`isCancelledStatus`
  forced false, the drawer's error line replaced by the old silent close, `canRetry` forced on) - each
  went red alone. The 3 failures (`live-bids`, `share-request-email`, `ui-pins`) are PRE-EXISTING,
  confirmed by stashing this work and re-running the three files on a clean tree.
  ⚠️ **SEEN RENDERED**: all five states (ask, done, dead refusal, movable refusal, partial) in RTL plus
  the LTR mirror, as static markup carrying the real class names and the compiled stylesheet - the
  dialog needs a signed-in renter with a live request, which this machine has no session for.
  🔴 **NOT seen on a real request**, and NOT reproduced against the live backend: the mechanism is read
  off both services' source and the owner's screenshot of RFQ-00190.
  🔴 **This is on `beta`, and `staging` has the same drawer fault.** Its `doCancel` still ends
  `catch { setBusy(false); setConfirmCancel(false); }` with no `error` prop, so a refused cancel is
  silent there too; and staging's own `if (done)` block will conflict with this one on the next merge.
  Port it, do not re-derive it.

- **2026-09-20 - The machine panel's empty part is painted the photographs' OWN ground, so the picture reads as filling it.**
  Owner, on a crop of the panel's foot showing a beige block, then a pale strip with the «Diesel» and
  «2024» chips sitting on it: *"why the image doesnt exist for margins and padding, keep it 100%
  fit"*.
  🔴 **The image was there, and reading the screenshot as a missing image is the mistake to avoid
  repeating.** The beige IS the photograph - these renders are shot on a beige studio sweep - and
  the paler strip under it was this panel's own `surface2` showing through where `contain` had
  nothing left to draw. A band with two chips floating on it does look like a picture that failed.
  🔴 **No fit closes that gap, and this file has now said so three times.** `cover`, `contain` and
  `scale` all clip from one **1.34** source into one **0.81** box and only move WHERE the loss
  lands: `cover` at 366x450 takes 39% of the width, which is the bucket and the counterweight, and
  is the complaint of 2026-09-15. So the FIT is untouched - `contain` at 1.2, unchanged - and what
  changed is the COLOUR of the part it does not reach.
  **`--photo-ground: #e3ded7`, and it is MEASURED rather than picked.** The two assets that are
  publicly readable (`crawler-excavator`, `wheel-loader`, both 2400x1792) were downloaded, decoded
  and read pixel by pixel at four corners and two edge midpoints each: all twelve samples land
  between `#e1dcd5` and `#e6dfd7`, a spread of **4/255 per channel**. This is their mean, and at
  that spread the join is not visible.
  ⚠️ **It is a fact about the RENDER BATCH, not a colour of this design system**, and the token's
  own note says so: the whole set shares one filename stamp and one sweep. Re-shoot them on another
  ground and this must be re-measured or deleted. It sits beside `--gold` and the `--shop-*` values,
  which are already recorded as outside the OS palette.
  ⚠️ **Applied ONLY under a real photograph.** Behind the glyph fallback a beige panel carrying a
  grey drawing reads as exactly the failure it would be imitating, so that state keeps `surface2`.
  A case pins the ternary rather than the class alone.
  ⚠️ **Mirrored into `ds-colors.ts`, which is the only reason it is there**: `ds-colors.test.ts`
  requires every colour `:root` defines to be named in both places. No standalone document (the
  quotation, the printed comparison, the pasted cards) has any use for it.
  Files: `src/app/globals.css` (`--photo-ground` + its `@theme` mirror),
  `src/lib/ds-colors.ts`, `src/components/create/MachineCard.tsx`,
  `tests/unit/machine-card.test.tsx` (2 new cases; 35 passing).
  🔴 **CONTENT, still the real fix and still owed, third time of asking**: masters cut **4:5** for
  this box, or shot on transparency. Either retires this token AND the `scale-[1.2]` beside it, and
  stops every surface choosing between a band and a crop. **78 of the taxonomy's subtypes now carry
  a photograph** (it was 1 on 2026-09-13), so the cost of re-cutting has gone up and will keep going
  up.
  ⚠️ **The S3 objects are still not all public-read**: `mobile-crane-all-terrain` answers **403**
  where the other two answer 200, which is exactly why `onError` on this `<img>` is load-bearing and
  not defensive. Unchanged by this, and worth a look on the bucket policy.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, **211 files /
  3572 passing, 7 skipped** serially, the ground break-checked (reverted to `bg-surface2` - the new
  case went red), and the compiled utility confirmed to exist and resolve
  (`.bg-photo-ground{background-color:var(--photo-ground)}` -> `rgb(227,222,215)` measured in the
  page, so the token is not one `@theme` failed to publish).
  ⚠️ **SEEN RENDERED** at the panel's real 366x450 and at its 620px ceiling, both assets, beside the
  untreated panel for comparison: the ground reaches all four edges, the whole machine survives and
  the four chips sit on the photograph rather than on a strip.
  🔴 **NOT seen on the real card**: the canvas needs a session. The photograph above was taken with
  the hex written by hand; the compiled class was then confirmed to resolve to the same value by
  measurement rather than by a second picture, because the browser window on this machine reported
  a 0px viewport for the rest of the session and every screenshot after that point failed.

- **2026-09-20 - The escape row's question is CUT to fit, because that row clips and a sentence too long for it disappears.**
  Owner, on a shot of it reading «Can't find the equipment you ...»: *"always keep it not the
  equipment you want unless no taxonamy detected say it cant find your equipment? so it fit not
  clipped or stripped"*.
  🔴 **The rule he is protecting is his own of 2026-09-15** (*"dont ever wrap this not in the
  equipment card"*), and this is what it costs: the row is `whitespace-nowrap` + `truncate` at a
  fixed height, so a sentence that outgrows its cell does not get smaller, it goes missing. The COPY
  is therefore a layout constraint rather than a free choice.
  ~~«Can't find the equipment you want?»~~ -> **«Can't find your equipment?»** / «لا تجد معدتك؟».
  ⚠️ **MEASURED at the row's narrowest** - the three columns at their `minmax` minima, 454px, on the
  compiled stylesheet at `text-label` semibold:
   · «Not the equipment you want?»           **149px in a 150px box** - fits, and always did, which
     is why he only ever saw the other one cut;
   · «Can't find your equipment?»             **135px** - fits, with 14px more headroom than the above;
   · ~~«Can't find the equipment you want?»~~ **178px in a 150px box - 28px clipped**, which is his
     screenshot exactly;
   · Arabic **65px**, never close.
  ⚠️ **The BRANCH is unchanged and is what he asked for**: `item.ref.subcategoryId` picks the matched
  question, its absence the other. That is the same test `isCustomLine` reads, so the row and the
  line's own off-catalogue state cannot disagree about which question is being asked.
  Files: `src/lib/i18n/{en,ar}.ts` (`machineCard.hatchNoMatch`), `src/lib/uiPins.ts` (17.8's label
  quoted the retired sentence), `docs/ui-{pins,surface-map}.md` (regenerated),
  `tests/unit/custom-equipment-canvas.test.tsx` (3 queries re-pointed, 1 new case).
  🔴 **Three test queries broke on the rename and a `grep` for the string did not find them**: they
  read `/find the equipment you want/i` - lower case, no apostrophe - so searching for
  `hatchNoMatch` or for the sentence as written in the dictionary came back empty and the suite went
  red on the next run. **Grep the FRAGMENT, not the string.**
  ⚠️ **The new case pins the RULE, not a pixel budget**: the no-match question may never be longer
  than the matched one, which is the one already proven to fit. jsdom lays nothing out, and a width
  copied into a test would go stale the first time the face or the padding moved. Break-checked by
  lengthening the sentence - it went red.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, 11 passing in
  the card's own suite and 89 across the nine card / rail / dashboard / wording / pins suites.
  **SEEN RENDERED**: all three sentences side by side at 454px and at 700px, plus the Arabic, as
  static markup carrying the real class names and the compiled tokens - which is how the 28px
  overflow was measured rather than estimated.

- **2026-09-20 - The dashboard's bid rail is TWO LINES again: who and how much, then what for.**
  Owner, on the one-line rail: *"show the name and price in one row then below it in small font is
  it offline or via app - unit* equipment name and size"*.
  🔴 **This PARTLY reverses 2026-09-19**, which cut the row to *"supplier name and price nothing
  more"* and deleted the machine along with the site. What comes back is the MACHINE, now carrying
  its unit count; what stays gone is the SITE. That split is the whole of the judgement: the
  deletion was right about the site - the renter knows where his own job is, and the table beside
  this rail names it - and wrong about the machine on an account with several requests open, where
  «28,900 / month» says nothing until you know what it is for.
  ⚠️ **The SOURCE pill moved DOWN with it**, and line one is now exactly two things. That is what
  puts the price on the same vertical down the whole rail; the pill is a small grey qualifier on the
  offer, not a fact ranked beside the firm's name. It is still drawn on EVERY row (2026-09-19's own
  rule) and still takes the SOURCE FILTER's two words, so the rail and the tab above the bid cards
  cannot drift apart.
  🔴 **The machine and the count come from the REQUEST for BOTH sources, not from the offer**, and
  that is the only reason the count exists at all: `numberOfUnits` is on NEITHER bid projection. An
  app bid carries the subtype and size on its own payload; an off-platform submission carries only
  the label its form showed the supplier. The renter's own request list holds all three
  (`item.name` / `item.qty`), it is already loaded for the table beside this rail, and reading it
  means two rows answering one request can never describe it differently. **No new fetch, no
  backend change.**
  ⚠️ **The count is on every row, ONE included**, which is the intake rail's ruling of 2026-09-17:
  a column of counts that skips some of its rows is harder to scan than one that repeats a 1,
  because the eye reads down the number rather than down the presence of it.
  ⚠️ **Null until `groups` lands, and the row then draws no machine rather than a placeholder.** The
  bids read resolves before the requests read on a cold load, and «—» under every row for a beat
  reads as an account with nothing in it.
  ⚠️ The loading skeleton grew its second bar in the same pass: a skeleton drawing one line where
  the real row draws two is a layout that jumps the moment the read lands.
  Files: `src/components/home/HomeRequests.tsx` (`machineWords` restored, `requestLine` new,
  `RailBid.machine` / `.units`), `tests/unit/home-bid-rail.test.tsx` (2 cases rewritten, 1 new).
  ⚠️ **A test anchored on `span.truncate` had to be re-anchored**: the machine line carries that
  class too now, so `querySelector` would silently have read whichever came first. It takes
  `span.font-extrabold.truncate`.
  ⚠️ Verified: `NODE_OPTIONS= npx next build` clean, typecheck clean, lint 0 errors, **211 files /
  3567 passing, 7 skipped** serially, and two rulings break-checked one at a time (the count hidden
  at 1, then the units dropped from the request lookup) - each went red alone. The 2 remaining
  failures are PRE-EXISTING on a clean staging tree, confirmed by stashing: `ui-pins` (the CRLF
  staleness, and now green again because this change regenerated those docs) and
  `cancel-confirmation` - see below. Two canvas suites timed out in the serial run and passed alone;
  that is the contention this log already records for them.
  ⚠️ **SEEN RENDERED**: the rail at 300px (its width beside the table on a desktop) and at 380px
  (full width on a phone), plus the Arabic mirror, as static markup carrying the real class names
  and the compiled stylesheet. The RTL order was MEASURED rather than eyeballed - the count's box
  sits at the machine span's trailing edge, so it reads «pill · 2 × حفارة زاحفة» right to left with
  no bidi fault and no rule of its own.
  🔴 **NOT seen on the real dashboard**: the rail needs a signed-in renter with bids, which this
  machine has no session for.
  🔴 **Reported, NOT fixed - `tests/unit/cancel-confirmation.test.ts` is RED on a clean staging tree
  and it is a VACUOUS-SLICE trap.** It slices on
  `modal.indexOf("return (\\n    <Dialog open onClose={onClose}")` while `RequestEditModals.tsx` is
  **CRLF on disk**, so that `indexOf` returns -1, `slice(start, -1)` runs to the end of the file, and
  the assertion then reads the whole component. It is one anchor, and it is somebody's to fix
  deliberately rather than smuggled into a copy change.
- **2026-09-19 - The negotiation sheet has NO column cap: its cards run the screen inside one gutter, equal on both sides.**
  Owner, on the capped build: *"undo what did u centralize? i mean centralize the parent cards across
  the screen so it has equal margin on right and on left"*.
  🔴 **This WITHDRAWS the 760px centred column taken hours earlier**, and the argument for it
  (*"the design's proportions are a phone column's"*) loses to the product's own ruling of the same
  morning: **every page is FLUID, the 1440 cap is gone**, so a sheet keeping a private cap would be
  the one surface in the app that did not follow it.
  **ONE gutter, declared once**: `--ng-gutter: clamp(16px, 3vw, 40px)` on `.ng-shell`, answered by the
  header's padding, the footer's padding and the body column's alike. That is what makes the margin
  identical on the leading and trailing edge at any width - three bands each carrying their own number
  is how two of them drift apart.
  ⚠️ **The white card gained a 10px radius and a 12px gap to the next one.** On a phone it is a
  full-bleed band and the screen's edges do the separating; across 1900px a band that reaches both
  edges stops reading as one object among others.
  🔴 **Three controls are capped instead, because they are ANSWERS and not layout.** The money
  input (150px, pinned to its column's end), the term card's «Change / Take theirs» pair and its option
  list (320px, at the reading start). Stretched across the screen each read as the card's main event
  rather than as the reply to the line above it - the same fault the column cap was hiding, met one
  element at a time and answered where it actually lives.
  Files: `src/components/deal-room/deal-room-proto.css`,
  `tests/unit/negotiation-sheet.test.ts` (the cap's case rewritten to the gutter, 1 new case for the
  three answer controls; 20 passing).
  ⚠️ **Nothing moved but the geometry**: same three steps, same header, same footer acts, same
  pricing, same gating, same log, and the block that pins «what the rebuild did NOT change» is
  untouched.
  ⚠️ Verified: **`NODE_OPTIONS= npx next build` clean** - the rule this log set this morning,
  because a stylesheet fault is invisible to typecheck, lint and jsdom - plus typecheck, lint 0 errors,
  **211 files / 3568 passing, 7 skipped** serially, and the no-cap ruling break-checked by putting
  `max-width: 760px` back, which went red alone. The 3 unhandled errors are `intercom-widget`'s two
  and `suppliers-remove-and-pick`'s one, both pre-existing.
  ⚠️ **One serial run reported a file failing and the re-run did not reproduce it.** The cause is
  mine and worth naming: an edit script rewrote `deal-room-proto.css` WHILE that run was in flight,
  and `negotiation-sheet.test.ts` reads that file off disk at import. Do not edit a file a running
  suite reads; the second run is the honest one.
  ⚠️ **SEEN RENDERED at 1568px**: all three steps, RTL, as static markup carrying the real class
  names and the compiled tokens - which is how the two remaining full-width faults were found, the
  money field running the table's whole last column and the option rows running the card.
  🔴 **I EMPTIED `tests/unit/negotiation-sheet.test.ts` mid-session**, for the third time this repo
  has recorded the same trap: `io.open(path, "w")` truncates at the OS level BEFORE anything is
  written, and the script then threw on a surrogate in an escape a shell heredoc had mangled. Restored
  from `HEAD`; nothing was lost. **Write the edit script with the file tool, never through a heredoc**
  - this repo has now logged the heredoc mangling apostrophes (2026-09-16) and backslashes (today).

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
  ⚠️ ~~**The CONTENT is capped at 760px and centred; the header and footer BARS run the full
  width.**~~ **WITHDRAWN the same evening - see the entry above.** The three `.ng-inner` wrappers stay;
  only the cap on them went.
  ⚠️ **The footer's switcher centres on the COLUMN, not on the bar.** It is absolutely placed inside
  `.ng-inner`, so it sits over the steps it walks rather than in the middle of a wide screen with the
  accept button stranded at the far edge.
  ⚠️ **The term card's «Change / Take theirs» pair is capped at 320px and sits at the reading end.**
  At the phone's width they are two `flex:1` buttons; widened, they became two slabs reading as the
  card's main event instead of as the two answers to the line above them.
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

- **2026-09-17 - A bid that lands while he is on the screen is ON the screen, and the bench stops deleting cards.**
  Owner: *"bids doesnt appear directly in the bid cards, they apear in the compare but not in bid
  cards, only after refresh"*, then *"i want all bids recieved in real time directly in cards and in
  compare and in the bids list on home page all must load in real time"*.
  Two faults, and the first is the one that made the two tabs disagree.
  (1) 🔴 **The bench was a COMPARE control deleting a CARD.** ✕ on a compare column adds the bid to
  `benched`; the cards rail was drawn from `shown`, which is the source filter MINUS the bench. So a
  bid set aside while comparing vanished off a tab that has no bench strip, no ✕ and no way back, and
  only a reload brought it back, because `benched` is component state. The rail takes `shownAll` now.
  The bench still narrows the COMPARISON, its printed sheet and the assistant, which is what the
  2026-08-25 ruling was protecting: *"a sheet that printed a bid he had just removed from the table in
  front of him is a sheet that disagrees with its own screen"*.
  (2) **Nothing re-read its bids, anywhere.** `/requests` fetched per item and never again; the
  dashboard rail read `fetchReceivedBids` once per session; and its off-platform half sat in
  `subsOnce`, a per-request memo kept for the life of the mount and **never invalidated** - so a
  reload was the only thing in the product that could show a new off-platform bid.
  `src/lib/live/useLiveTick.ts` (new) is the house's own polling pattern with the three rules written
  once instead of four times badly: nothing runs while the tab is hidden, coming BACK is itself a read
  when the interval has elapsed, and a return INSIDE the interval reads nothing (`focus` fires on
  every click into the window).
  Files: `src/lib/live/useLiveTick.ts` (new), `src/components/workspace/RequestsWorkspace.tsx`,
  `src/components/home/HomeRequests.tsx`, `tests/unit/live-bids.test.tsx` (new, 14 cases).
  ⚠️ **Two clocks, because the two reads cost very different amounts.** 15s for the open item's bids
  (two calls) and for the dashboard's app bids (one); **60s** for the dashboard's off-platform
  fan-out, which is ONE CALL PER GROUP capped at `LINK_FANOUT_MAX` - at 15s a renter with twenty live
  requests would be making twenty requests every fifteen seconds to keep a five-row card current.
  ⚠️ **A tick must not EMPTY what it is refreshing.** The workspace effect cleared `bids` on entry;
  on a poll that would flash «No bids yet» on the cards and fold the table to nothing every 15
  seconds. `loadedFor` tells an item change (empty first) from a refresh (replace in place), and the
  dashboard's refresh is a SECOND effect for the same reason - its mount effect sets the rail to
  `null` on purpose and must keep doing so when the ACCOUNT changes.
  ⚠️ The size filter is part of that identity: `showLarger` changes which bids the backend answers
  with, so switching it empties first. A refresh does not.
  🔴 **This is POLLING, not push, and it is a deliberate choice of the owner's** (offered, and he
  took it): there is no bid event on the wire. Stream is wired for chat only and its token is minted
  per deal room, so a true push would be backend work - a `bid.created` event on a user channel, or SSE.
  Until then a bid is at worst one interval late, and the tab regaining focus is what shortens that
  in the case the renter actually notices.
  ⚠️ Verified: typecheck, lint (0 errors), 14 new cases, and the full suite serially (3393 passing).
  The two failures are both PRE-EXISTING and were reproduced on a stashed tree: `ui-pins` (CRLF
  staleness) and `share-request-email`'s `recipientEmails`. Break-checked by forcing the dashboard's
  refresh effect off and the fan-out's cache invalidation off - two cases went red.
  🔴 **NOT seen rendered.** Every surface here needs a signed-in renter with live bids, so the
  refresh is pinned by a render test with a fake clock rather than watched on a real one.

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

- **2026-09-16 - A session-less submit on a REAL backend answers 401 now, instead of filing the
  request as `AGENTS_TEST_USER_ID`.** The route's own comment carried this as an open question;
  it was decided when the Supplier OS public share pages' new Direct Request button started
  funnelling anonymous visitors at `/create` (plan:
  `Moedatech-App/docs/plans/direct-request-from-public-pages.md`). BUILT on branch `beta`, NOT
  committed, NOT deployed.
  Files: `src/app/api/requests/route.ts`; stale-reference sweep in the same change:
  `tests/unit/project-routes.test.ts` (its guard rationale cited the fallback as current),
  `src/lib/api/app-adapters.ts:182`, `docs/request-create-flow.md`,
  `docs/request-experience-flow.md` (open-question item marked resolved), and
  `tests/unit/submit-error.test.tsx` gains a case pinning `{ status: 401 }` alone → `auth`
  (this route's 401 arrives on ApiError's `status`, not `backendStatus` - nothing pinned that
  coalesce arm before).
  ⚠️ The 401 lives INSIDE the real-backend condition - mock mode still answers without a
  session, on purpose, and a SESSION-LESS real submit can no longer fall into the mock's
  fabricated 201 (a signed-in POST whose body failed to parse still can, via `"items" in body` -
  pre-existing, untouched). The client maps 401 to the designed `auth` submit-error state
  (`contract/submit-error.ts:178`, threaded via ApiError's `status`), and the actual guest gate
  is ShareOnPost's `tier === "guest"` check opening AccountModal BEFORE `submit()` - NOT
  AuthGate/requireAuth, which the create flow never uses - so the 401 is the
  expired/cleared-session backstop. Known, accepted: a transient backend outage during submit
  (BOTH `/users/me` and `/auth/refresh` failing in `sessionUserId()`) reads as 401 → the auth
  card instead of the offline card; house pattern on every `sessionUserId()` route, second press
  recovers.
  ⚠️ `serverEnv` import dropped with the fallback - `agentsTestUserId` no longer reaches this
  route at all.
  Verified: `tsc` clean; vitest 582 failed / 2799 passed BOTH with and without the change - all
  582 are pre-existing on `beta`, none touch this route.

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
