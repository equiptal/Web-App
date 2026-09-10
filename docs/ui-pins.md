# UI pins

> **Staging branch only — do not merge to `main`.** This is a developer instrument, not part of the product. The overlay also refuses to render on the production host, but that guard is the belt, not the plan.

The number every surface answers to on staging. Three ways in:

- the **`# PINS`** button at the bottom-left of every page
- `Ctrl+Shift+U`
- `?pins=1` on any URL — and `?pins=0` to switch it off again

⚠️ **The two staging hosts are commented out of `PIN_HOSTS` right now** (owner, 2026-09-10: *"can u remove the pins toggle from staging just temporarily just hide it"*), so the overlay answers on **localhost and `127.0.0.1` only**, and `/dev/preview` says "not here" on staging too. Uncomment the two lines in `src/lib/uiPins.ts` to bring it back — nothing else was changed.

If none of those show anything, the host is not on the list in `uiPinsAllowed()` — beta and production are deliberately absent, and staging is out temporarily. The console says `[ui-pins] ready` where it is live.

Three levels, and the panel switches between them.

| Level | Button | What is numbered | Where the number comes from |
| --- | --- | --- | --- |
| 1 | `surfaces` | whole components — `17` is the machine card | this registry, fixed |
| 2 | `parts` | named parts — `17.1` is its head row | this registry, fixed |
| 3 | `all` | every button, field, heading and box inside the **selected** pin — `17.1.4` | found by walking the DOM |

Level 3 is scoped to a selection on purpose: numbering a whole page at that grain draws hundreds of badges over each other. Click the surface you are working on, press `all`, and its insides are numbered.

A level-3 number is a position, not a name — it holds while the surface keeps its shape and no longer. Say it while it is on screen ("the third button in #17.1"), or use `copy` to send the list. A number worth keeping belongs in the table below.

The registry is `src/lib/uiPins.ts` — it is the authority for levels 1 and 2, and this table is generated from it by `node scripts/ui-pins-doc.mjs`. Do not edit the table by hand; `ui-pins.test.ts` fails when it is stale, and the same script writes `docs/ui-surface-map.md`, which is the file → pins index `/web:change` reads.

<!-- pins:start -->
| # | What | File |
| --- | --- | --- |
| **1** | App frame | `src/components/AppShell.tsx` |
| **2** | Header bar (navy) | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**2.1** | Header — logo | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**2.2** | Header — centred nav slot | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**2.3** | Header — beta mark | `src/components/AppShell.tsx` |
| **3** | Nav tabs — desktop | `src/components/AppNav.tsx` |
| &nbsp;&nbsp;**3.1** | Nav tab — one link | `src/components/AppNav.tsx` |
| **4** | Nav tabs — mobile | `src/components/AppNav.tsx` |
| **5** | Account menu + locale toggle | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.1** | Header — EN/AR toggle | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.2** | Header — inbox + bell pair | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.3** | Header — avatar | `src/components/AppShell.tsx` |
| **6** | Notifications bell | `src/components/NotificationsBell.tsx` |
| &nbsp;&nbsp;**6.1** | Help manual modal | `src/components/help/HelpManual.tsx` |
| **7** | Page body (gutters live here) | `src/components/AppShell.tsx` |
| **8** | Back arrow | `src/components/AppShell.tsx` |
| **9** | Page section | `src/components/PageSection.tsx` |
| &nbsp;&nbsp;**9.5** | Guest wall — blurred page + sign-in card | `src/components/common/GuestWall.tsx` |
| **10** | Home | `src/components/home/HomeHub.tsx` |
| &nbsp;&nbsp;**10.1** | Home — hero band | `src/components/home/CtaBanner.tsx` |
| &nbsp;&nbsp;**10.2** | Home — hero action column | `src/components/home/CtaBanner.tsx` |
| &nbsp;&nbsp;**10.4** | Home — requests + bids rail | `src/components/home/HomeRequests.tsx` |
| &nbsp;&nbsp;**10.5** | Browse — banner + supplier directory | `src/components/stores/BrowsePage.tsx` |
| &nbsp;&nbsp;**10.6** | My Suppliers — the list | `src/components/suppliers/SuppliersPage.tsx` |
| &nbsp;&nbsp;**10.7** | Home — notification bubble | `src/components/home/HomeNotificationBubble.tsx` |
| **11** | Start-your-request modal | `src/components/home/StartYourRequestModal.tsx` |
| **15** | Create — intake screen | `src/components/screens/Intake.tsx` |
| **16** | Create canvas (3 columns) | `src/components/create/Canvas.tsx` |
| &nbsp;&nbsp;**16.1** | Create — «leave this request?» confirm | `src/components/create/CreateBack.tsx` |
| &nbsp;&nbsp;**16.2** | Create — site + schedule locked strip (with «Change») | `src/components/create/Canvas.tsx` |
| **17** | Machine card | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.1** | Machine card — head row | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.2** | Machine card — body grid | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.3** | Machine card — image well | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.4** | Equipment tabs — the strip | `src/components/create/EquipmentTabs.tsx` |
| &nbsp;&nbsp;**17.5** | Equipment tabs — one equipment | `src/components/create/EquipmentTabs.tsx` |
| &nbsp;&nbsp;**17.6** | Equipment tabs — the + that adds one | `src/components/create/EquipmentTabs.tsx` |
| &nbsp;&nbsp;**17.7** | Equipment tabs — the ✕ that removes one | `src/components/create/EquipmentTabs.tsx` |
| **18** | Operator rail | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.1** | Operator rail — head row | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.2** | Operator rail — options grid | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.3** | Operator rail — note block | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.4** | Operator rail — closed strip (72px) | `src/components/create/OperatorRail.tsx` |
| **19** | When panel (dates) | `src/components/create/WhenPanel.tsx` |
| &nbsp;&nbsp;**19.1** | When panel — head button | `src/components/create/WhenPanel.tsx` |
| &nbsp;&nbsp;**19.2** | When panel — open body | `src/components/create/WhenPanel.tsx` |
| **20** | Where panel (site) | `src/components/create/WherePanel.tsx` |
| &nbsp;&nbsp;**20.1** | Where panel — head button | `src/components/create/WherePanel.tsx` |
| &nbsp;&nbsp;**20.2** | Where panel — open body | `src/components/create/WherePanel.tsx` |
| **21** | Create — review & send screen | `src/components/create/ReadyToSend.tsx` |
| **22** | Create — confirmation screen | `src/components/screens/Confirmation.tsx` |
| **24** | Create — processing screen | `src/components/screens/Processing.tsx` |
| **25** | Requests workspace | `src/components/workspace/RequestsWorkspace.tsx` |
| **26** | Requests rail (full-bleed band) | `src/components/workspace/RequestRail.tsx` |
| &nbsp;&nbsp;**26.1** | Rail — create tile | `src/components/workspace/RequestRail.tsx` |
| &nbsp;&nbsp;**26.2** | Rail — request tiles | `src/components/workspace/RequestRail.tsx` |
| &nbsp;&nbsp;**26.3** | Item tier — one chip per machine | `src/components/workspace/ItemTier.tsx` |
| **27** | Request context bar (location + item) | `src/components/workspace/RequestContextBar.tsx` |
| **28** | Request details modal | `src/components/workspace/RequestDetailsModal.tsx` |
| &nbsp;&nbsp;**28.5** | Bid size filter — include larger equipment | `src/components/workspace/BidSizeFilter.tsx` |
| **29** | Bid cards | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.1** | Bid card — one tile | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.2** | Bid card — header | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.3** | Bid card — bottom row | `src/components/workspace/BidCards.tsx` |
| **30** | Compare matrix | `src/components/workspace/CompareMatrix.tsx` |
| &nbsp;&nbsp;**30.1** | Matrix — horizontal scroller | `src/components/workspace/CompareMatrix.tsx` |
| &nbsp;&nbsp;**30.2** | Matrix — supplier column | `src/components/workspace/CompareMatrix.tsx` |
| &nbsp;&nbsp;**30.9** | Compare — the assistant under the table | `src/components/workspace/AiRankPanel.tsx` |
| **36** | Terms panel | `src/components/requests/TermsPanel.tsx` |
| **37** | Bid readiness | `src/components/requests/BidReadiness.tsx` |
| **38** | Share-for-bids sheet | `src/components/requests/ShareForBidsSheet.tsx` |
| **45** | Bid map workspace | `src/components/map/BidMapWorkspace.tsx` |
| &nbsp;&nbsp;**45.1** | Bid map — canvas side | `src/components/map/BidMapWorkspace.tsx` |
| &nbsp;&nbsp;**45.2** | Bid map — side panel | `src/components/map/BidMapWorkspace.tsx` |
| **46** | Map canvas | `src/components/map/MapCanvas.tsx` |
| &nbsp;&nbsp;**46.1** | Map — one machine's marker | `src/components/map/MapCanvas.tsx` |
| **47** | Fleet card (equipment list) | `src/components/map/EquipmentList.tsx` |
| &nbsp;&nbsp;**47.1** | Fleet card — photo cell | `src/components/map/EquipmentList.tsx` |
| &nbsp;&nbsp;**47.2** | Fleet card — readiness + file icon | `src/components/map/EquipmentList.tsx` |
| &nbsp;&nbsp;**47.3** | Fleet card — yard card (distance + availability) | `src/components/map/EquipmentList.tsx` |
| &nbsp;&nbsp;**47.5** | Fleet list — filter bar | `src/components/map/EquipmentList.tsx` |
| &nbsp;&nbsp;**47.6** | Fleet list — filter panel | `src/components/map/EquipmentList.tsx` |
| **48** | Price footer | `src/components/map/PriceFooter.tsx` |
| &nbsp;&nbsp;**48.1** | Price footer — the rate | `src/components/map/PriceFooter.tsx` |
| &nbsp;&nbsp;**48.2** | Price footer — «Show details» link | `src/components/map/PriceFooter.tsx` |
| &nbsp;&nbsp;**48.3** | Price footer — «Counter this price» | `src/components/map/PriceFooter.tsx` |
| &nbsp;&nbsp;**48.4** | Price footer — the breakdown | `src/components/map/PriceFooter.tsx` |
| &nbsp;&nbsp;**48.5** | Price footer — «Approve» (only when nothing is left to settle) | `src/components/map/PriceFooter.tsx` |
| **49** | Map request card | `src/components/map/RequestCard.tsx` |
| &nbsp;&nbsp;**49.1** | Request card — identity strip (firm / machine) | `src/components/map/RequestCard.tsx` |
| &nbsp;&nbsp;**49.2** | Request card — photo or company mark | `src/components/map/RequestCard.tsx` |
| &nbsp;&nbsp;**49.3** | Request card — the ask | `src/components/map/RequestCard.tsx` |
| &nbsp;&nbsp;**49.4** | Request card — status row | `src/components/map/RequestCard.tsx` |
| &nbsp;&nbsp;**49.5** | Request card — draft's Cancel / Send | `src/components/map/RequestCard.tsx` |
| **50** | Yard explainer modal (red distance) | `src/components/map/YardExplainDialog.tsx` |
| &nbsp;&nbsp;**50.1** | Yard explainer — red → green specimens | `src/components/map/YardExplainDialog.tsx` |
| &nbsp;&nbsp;**50.2** | Yard explainer — the two lines | `src/components/map/YardExplainDialog.tsx` |
| &nbsp;&nbsp;**50.3** | Yard explainer — «Ask the supplier» | `src/components/map/YardExplainDialog.tsx` |
| **51** | Supplier panel | `src/components/map/panel/CompanyPanel.tsx` |
| **52** | Equipment detail panel | `src/components/map/panel/EquipmentDetail.tsx` |
| &nbsp;&nbsp;**52.1** | Equipment detail — the viewer (photo / paper) | `src/components/map/panel/EquipmentDetail.tsx` |
| &nbsp;&nbsp;**52.2** | Equipment detail — tab strip | `src/components/map/panel/EquipmentDetail.tsx` |
| &nbsp;&nbsp;**52.3** | Equipment detail — yard card | `src/components/map/panel/EquipmentDetail.tsx` |
| &nbsp;&nbsp;**52.4** | Equipment detail — match grid | `src/components/map/panel/EquipmentDetail.tsx` |
| **53** | Equipment documents tab | `src/components/map/panel/EquipmentDocuments.tsx` |
| &nbsp;&nbsp;**53.1** | Documents tab — Download / Ask footer | `src/components/map/panel/EquipmentDocuments.tsx` |
| &nbsp;&nbsp;**53.2** | Document row | `src/components/map/panel/DocRowList.tsx` |
| **55** | Deal room | `src/components/deal-room/DealRoom.tsx` |
| **56** | Chat card | `src/components/deal-room/ChatCard.tsx` |
| **57** | Chat drawer (map) | `src/components/map/ChatDock.tsx` |
| &nbsp;&nbsp;**57.1** | Chat drawer — identity + phase + kebab | `src/components/map/ChatDock.tsx` |
| &nbsp;&nbsp;**57.2** | Chat drawer — supplier tabs | `src/components/map/ChatDock.tsx` |
| &nbsp;&nbsp;**57.3** | Chat drawer — the thread | `src/components/map/ChatDock.tsx` |
| &nbsp;&nbsp;**57.4** | Chat drawer — composer | `src/components/map/ChatDock.tsx` |
| &nbsp;&nbsp;**57.5** | Chat drawer — staged request card | `src/components/map/ChatDock.tsx` |
| **60** | Inbox | `src/components/inbox/InboxView.tsx` |
| **61** | Browse stores | `src/components/stores/BrowseSurface.tsx` |
| **62** | Store detail | `src/components/stores/StoreDetailSurface.tsx` |
| **63** | Store card | `src/components/stores/StoreCard.tsx` |
| **64** | Store card (category) | `src/components/stores/StoreCard.tsx` |
| **65** | Equipment sheet | `src/components/stores/EquipmentDetailSurface.tsx` |
| **66** | Store equipment card | `src/components/stores/StoreDetailSurface.tsx` |
| **70** | Profile | `src/components/profile/ProfileView.tsx` |
| **71** | Edit profile form | `src/components/profile/EditProfileForm.tsx` |
| **72** | Company hub | `src/components/company/CompanyHub.tsx` |
| **74** | My company card | `src/components/company/MyCompanyCard.tsx` |
| **75** | Onboarding shell | `src/components/onboarding/OnboardingShell.tsx` |
| **76** | Onboarding form | `src/components/onboarding/OnboardingForm.tsx` |
| **77** | Verification flow | `src/components/onboarding/VerificationFlow.tsx` |
| **78** | Sign-in / register modal | `src/components/onboarding/AccountModal.tsx` |
| **79** | Sign-in prompt | `src/components/common/SignInPrompt.tsx` |
| **90** | Dialog | `src/components/Dialog.tsx` |
| &nbsp;&nbsp;**90.1** | Dialog — panel | `src/components/Dialog.tsx` |
| &nbsp;&nbsp;**90.2** | Dialog — header row | `src/components/Dialog.tsx` |
| **92** | Search select | `src/components/Dropdown.tsx` |
<!-- pins:end -->

## Adding one

1. Add an entry to `PIN_REGISTRY` in `src/lib/uiPins.ts` with the next free number in its block.
2. Spread `pin("<id>")` onto that element: `<div {...pin("machine-card-head")} className={…}>`.

Never renumber an existing entry — notes and tickets refer to it. Retire one by deleting it and leaving the number unused.

## Not pinned

A component whose root is a fragment has no element to carry the attribute: `ChatDock`, `EquipmentList`, `CreateSurface`. Pin a real child of one when it is worth naming — which is what happened on 2026-09-08: the chat DRAWER (`57`) and the fleet CARD (`47`) are pinned with their parts, so both surfaces are addressable by number even though their components are not. The map's marker (`46.1`) writes `data-pin` by hand, because a Leaflet `divIcon` is an HTML string with no element to spread onto. The line-commented `/requests` and `/compare` modules are left out until they come back (see `docs/requests-workspace-disabled.md`).
