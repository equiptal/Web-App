# One-page requests workspace — plan

Three surfaces become one page. `/requests` (the list and its Requests/Bids/Deals tabs),
`/requests/[id]` + `/requests/group/[groupId]` (request detail and its bid list), and `/compare`
(the comparison matrix) are replaced by a single workspace at `/requests`. The old code is not
deleted — it is line-commented in place and documented, the way the Outcome Survey was switched
off in `docs/surveys-disabled.md`.

Source of truth for layout: the owner's five mockup screenshots of 2026-08-11 (the Cards tab, the
Compare tab in three states, the per-supplier strip, the three "how it is built" popovers, and the
request drawer). This document records what each element wires to and in what order it is built.

## The decisions this plan is built on

Taken from the owner, 2026-08-11:

| Question | Decision |
|---|---|
| The chrome | The bottom dock replaces AppShell's navy sidebar **globally**, on every page |
| The route | The new page **reuses `/requests`**; the other three routes redirect to it |
| Multi-item requests | Item chips **inside the dark strip**; picking one reloads cards and compare |
| Rail badges | Keep the **units** badge only; the second badge is dropped |
| Compare's "pick one" | **Focus only** — it re-renders the dark strip for that supplier. It does not award |
| Awarding | **In the deal room only.** This page never calls `acceptBid` |
| Compare's bench chips | Bids **on this request that are not yet columns**; `+` adds one |
| The 180-days column | The **request's own duration**, not a fixed benchmark |
| Location ↗ and REQ id | Both open the **request drawer** |
| Deals | **Dropped from this page.** Inbox owns deal rooms; HomeHub's card repoints there |
| Cancel request | In the drawer, **quiet placement** — a text link away from the three buttons |
| Certificates | **Map to the `CertCode` enum**; anything outside it is dropped |
| Invite to Moedatech, the locked EQUIPMENT column | **Delayed** — drawn as mocked, press does nothing |
| Editing a request | **Mirror the mobile app** (see below) — its post-bid edit rule is live in production, on `main` and `staging` since 2026-08-05 |
| The card's price | **The current price only.** The mockup's `80,210 → 76,440` counter arrow is dropped (2026-08-12) |
| The dock's centre button | **Home** (`/`) |
| How the old code goes away | **Comment out in place** plus a `docs/*-disabled.md` |

## What the page is made of

Top to bottom, with what each element reads and what pressing it does.

### The top bar

`EN / ع` is the existing `useLocale().setLocale`. The avatar, name and company chip is the existing
AppShell account menu. The title is static.

### The request rail

A horizontal strip of circles, one per request, fed by `fetchAllMyRequests` + `groupRequests`
(`contract/requests.ts`). The `+ New` tile goes to `/create`. Each circle carries the request's
first item photo, its REQ id, and a units badge; a closed request renders grey and captioned
`CLOSED`. The active tile carries the share control, which opens the existing `ShareForBidsSheet`.
A chevron scrolls the rail.

### The dark strip

Two halves. The left half names the request: site, the underlined REQ id, the bid count, the date.
Both the site's ↗ and the REQ id open the request drawer.

The right half is **per selected supplier bid** and re-renders whenever the selection changes —
from a card in the Cards tab or a row in Compare. It shows the item photo with its availability
band, the item as the request describes it (`Crawler Excavator · 30 ton`), then what *this* supplier
offers against it (`Murad alabdullah offers CAT 330 GC · 2021`), a state chip, and two controls:
`Review equipment`, which goes to `/bids/[bidId]/equipment` — the rentee-map page, which survives
this change — and `View documents`, from `fetchBidDocuments(bidId)`.

The strip's chips are derived, not stored: availability from `unitAvailability`, `Offered another
machine` when the offered equipment is not what the request asked for, and `Off-platform · no
contract cover` for a submission that arrived outside the app.

On a multi-item request the strip also carries a row of item chips; picking one swaps the item and
reloads both tabs beneath.

### Cards and Compare

Two tabs, plus `Download ↓`, which opens the existing `ExportTemplateDialog` with
`buildExportPayload`. Beneath them a source filter — `All · Via app · Offline` — which switches
between `fetchBids` (bids placed through the app) and `fetchRequestSubmissions` +
`submissionToBidCard` (link and offline submissions). Both feeds are already wired in `GroupBids`.

**A bid card** carries its source and timestamp, the supplier's avatar, name and city, a chat
control that opens `/deal-room/[id]` (with an unread dot), and a `Terms` row opening
`BidTermsModal`. The dial beside `Terms` reads **how much of the terms this supplier answered** —
not bid quality, so it is not `QualityRing`. One slice per `TermRow.state` across
`terms.equipment`, `terms.contract` and `terms.supplier`: `matched` and `agreed` are met,
`conflict` is against, `grey` is unanswered. Then the price block: monthly rental with the `26 working days/month` basis — 26 is already the
month's working-day count in `contract/comparison.ts:14` — then delivery, return, subtotal before
VAT, VAT at 15%, and the grand total. Every label in that block already exists verbatim in
`i18n priceFooter.*`. The figures are the live ones: `BidCard.price` already resolves to the deal
room's last proposed rate where one exists. The footer is `Counter this price`, which deep-links to
`/deal-room/[id]?act=counter`. The mockup's `Counter 80,210 → 76,440 SAR` variant is **not built** —
one price on the card, the current one. An offline card swaps that footer for `Invite to Moedatech`
(delayed, inert) and `Edit quote`, which runs `transformBid` → `BidVerifyModal` → `commitBid`.

**The compare matrix** lists suppliers down the left with their state (`★ Recommended` from
`recommendBids`, `awaiting reply`, `offline · invite ↗`) and an `×` that removes the column.
Columns are grouped into collapsible rails: PER CYCLE (monthly, delivery, return, each sortable),
GRAND TOTAL, COST, TERMS, and the delayed EQUIPMENT rail. `buildItemComparison`, `sortByPreset`,
`rowWinners` and `responsibilityTone` already supply the data and the cell tones — green for the
winning figure, red for a cost falling on the renter, grey for `Didn't say`, and a merged cell when
every supplier answered the same. TERMS separates what the renter asked for from what suppliers
volunteered, with `✦ Rank with AI` calling `recommendBids`. Below the matrix sit chips for bids not
yet shown as columns, and an `✦ AI suggestion` line from `askBids`.

**The three totals** are new arithmetic and get their own pure module with its own unit tests. Each
column header opens a "how it is built" popover:

| Column | Built from |
|---|---|
| First cycle | rental + delivery + return, then VAT |
| Every cycle after | rental only — the one-off legs are marked *paid once, cycle 1* — then VAT |
| The duration column | rental × cycles in the request's duration + the one-off legs once, then VAT |

The mockup calls the same 1,500 figure "Return from site" in the first popover and "Mobilization" in
the third. It is one leg and it gets one name, taken from `i18n priceFooter` (`Delivery` /
`Return`).

### The request drawer

Opened from the strip. A navy header with the REQ id, the site and a close control; then
`Share request` (the existing `ShareForBidsSheet`) and `Edit request`. The mockup drew a third
button, `Duplicate`; it was dropped by the owner on 2026-08-12 and is not built. Below: the
item card, then the request's facts — starts, duration, site, requested, and bids in, split as
`4 · 2 via the app, 2 added offline` — then the required-certificate chips, mapped to `CertCode`
(TÜV → `TUV`, SPSP → `SPSP`, Saudi Aramco pass → `ARAMCO`). A requirement outside the enum is not
rendered. Cancelling the request is a quiet text link at the foot of the drawer, kept away from the
three buttons, and calls the existing `cancelRequest`.

**Edit request mirrors the mobile app**, which web currently contradicts. Today web hides Edit the
moment a bid arrives. The app (`request_detail_page.dart:165-174`, `638-674`) instead:

- shows Edit whenever the request is `OPEN` or `ACTIVE`;
- with no bids, opens the form directly, as often as the renter likes;
- with bids, first confirms — *"One-time edit — You can edit this request only once after a bid has
  been placed."* — and then opens the form;
- once that edit is spent (`bidCount > 0 && renteeEditUsed`), disables the button and explains:
  *"You've already used your one edit for this request"*;
- and in every case navigates to the **create wizard, prefilled** rather than to a second form.

`renteeEditUsed` does not exist anywhere in the web codebase. It is a contract gap — see below.

### The dock

`Dashboard` → `/dashboard`, `Requests` → this page, the centre brand button → `/`, `Inbox` →
`/inbox` with its badge from `fetchDealRoomUnread`, `Profile` → `/profile`.

## Gaps

Four things the page needs that today's web code does not draw. Checked against the app-backend and
the mobile app on 2026-08-12: **none of them needs backend work.** Two are already served by data the
web receives and ignores, one is a field the contract drops, and one is deliberately delayed.

1. **`renteeEditUsed` — ours, not the backend's.** The column exists (`schema.prisma:1358`,
   `rentee_edit_used`) and the cap is already enforced server-side: `request.service.ts:830` updates
   conditionally on `bidCount > 0 && renteeEditUsed === false` and sets it true, so a second post-bid
   edit is rejected whatever the client believes. `getMyRequests` returns `{ ...request }`
   (`rentee.service.ts:389`), spreading the whole row — which is how the mobile model reads
   `json['renteeEditUsed']`. The web drops it: `RequestListItem` does not declare it and
   `mapRequestListItem` does not read it. **Add the field to the contract and the mapper.** Escalate
   to the backend only if a live `/marketplace/my-requests` response turns out not to carry it.
   Until it is read, the renter can press Edit, fill the form, and only then be refused at save.
2. **The price on a bid card — nothing to build.** The mockup drew `Counter 80,210 → 76,440 SAR`,
   the arrow standing for the latest counter made in that bid's deal room. **The arrow is dropped**
   (owner, 2026-08-12): the card shows the current price, full stop. It already does — the backend
   computes `currentPrice = dealRoom.lastProposedRate ?? priceAmount` and `contract/bids.ts:897`
   reads it as `BidCard.price`, so a bid negotiated down already renders at its live rate and falls
   back to the opening offer when there is no room. No extra call, no new field.
3. **Per-bid chat unread — one call we already make.** `GET /marketplace/received-bids` returns
   `bidId` + `unreadCount` for every bid (`bid.service.ts:866`, read out of Stream's `byChannelId`),
   and the web already calls it as `fetchReceivedBids()` for the Inbox. Join it on `bidId` and the
   card gets its dot — the same route `contract/chat-dock.ts` already takes. `fetchDealRoomUnread`
   is the wrong tool: it returns one global total for the Inbox badge. `BidCard.unreadTerms` is a
   third thing again — term keys with an unseen counter, not messages.
4. **The delayed pair.** `Invite to Moedatech` has no action anywhere today, and the locked
   EQUIPMENT rail has no source. Both are drawn and inert until they do.

## Build order

Each phase leaves the app working and is independently reviewable.

**Phase 0 — the chrome.** Bottom dock replaces the sidebar in `AppShell`, on every page. Nothing
else changes; this lands and ships on its own so a regression here is never confused with a
workspace bug.

**Phase 1 — the shell of the page.** `/requests` becomes the workspace: rail, dark strip with item
chips, the two tabs, the source filter. Selection state (request → item → supplier bid) lives in one
place and drives everything below it.

**Phase 2 — the Cards tab.** The bid card, both sources, the price block against `priceFooter`, the
counter deep-link, the offline pair.

**Phase 3 — the Compare tab.** The matrix, the collapsible rails, sorting and winners, the three
totals module with its tests, the popovers, the bench chips, `Rank with AI` and the AI suggestion.

**Phase 4 — the request drawer.** The facts, the certificate chips, share, the quiet
cancel, and the app-mirrored edit rule — including reading `renteeEditUsed` through the contract, so
the spent-cap state explains itself instead of failing at save.

**Phase 5 — switching the old surfaces off.** `RequestsList`, `RequestDetail`, `RequestBids`,
`RequestGroupDetail`, `GroupBids` and `BidComparisonWorkspace` are line-commented in place; the four
old routes redirect to `/requests`; `docs/requests-workspace-disabled.md` records what was disabled,
what was deliberately left alone, and how to put it back.

**Phase 6 — the seams.** Every entry point repointed: `AppShell` nav (the Compare item goes),
`HomeHub`'s three activity cards (`?tab=bids` and `?tab=deals`), `Confirmation.tsx:92`,
`notifications.ts:82`'s `/compare` deep link, and the back link in
`bids/[bidId]/equipment/page.tsx:195`. Then `npm run typecheck && npm run lint && npm test &&
npm run build`.

## The signed-out visitor

There is nothing to draw — a guest has no requests, so no rail, no strip, no cards. The page renders
its chrome and a **sign-in call to action** in the body, which opens the auth modal through the
existing `useAuthGate().openAuth()`; there is no `/login` page under `PUBLIC_WEB_ENABLED`. The
`SignInPrompt` component already does exactly this (it calls `openAuth()` when given no `ctaHref`),
so the guest state is a matter of pointing it at the new copy rather than new machinery.
