# UI pins

> **Staging branch only — do not merge to `main`.** This is a developer instrument, not part of the product. The overlay also refuses to render on the production host, but that guard is the belt, not the plan.

The number every surface answers to on staging. Toggle the overlay with `Ctrl+Shift+U`, or the small `#` button at the bottom-left.

Three levels, and the panel switches between them.

| Level | Button | What is numbered | Where the number comes from |
| --- | --- | --- | --- |
| 1 | `surfaces` | whole components — `17` is the machine card | this registry, fixed |
| 2 | `parts` | named parts — `17.1` is its head row | this registry, fixed |
| 3 | `all` | every button, field, heading and box inside the **selected** pin — `17.1.4` | found by walking the DOM |

Level 3 is scoped to a selection on purpose: numbering a whole page at that grain draws hundreds of badges over each other. Click the surface you are working on, press `all`, and its insides are numbered.

A level-3 number is a position, not a name — it holds while the surface keeps its shape and no longer. Say it while it is on screen ("the third button in #17.1"), or use `copy` to send the list. A number worth keeping belongs in the table below.

The registry is `src/lib/uiPins.ts` — it is the authority for levels 1 and 2, and this table is generated from it.

| # | What | File |
| --- | --- | --- |
| **1** | App frame | `src/components/AppShell.tsx` |
| **2** | Header bar (navy) | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**2.1** | Header — logo | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**2.2** | Header — centred nav slot | `src/components/AppShell.tsx` |
| **3** | Nav tabs — desktop | `src/components/AppNav.tsx` |
| &nbsp;&nbsp;**3.1** | Nav tab — one link | `src/components/AppNav.tsx` |
| **4** | Nav tabs — mobile | `src/components/AppNav.tsx` |
| **5** | Account menu + locale toggle | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.1** | Header — EN/AR toggle | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.2** | Header — inbox + bell pair | `src/components/AppShell.tsx` |
| &nbsp;&nbsp;**5.3** | Header — avatar | `src/components/AppShell.tsx` |
| **6** | Notifications bell | `src/components/NotificationsBell.tsx` |
| **7** | Page body (gutters live here) | `src/components/AppShell.tsx` |
| **8** | Back arrow | `src/components/AppShell.tsx` |
| **9** | Page section | `src/components/PageSection.tsx` |
| **10** | Home | `src/components/home/HomeHub.tsx` |
| &nbsp;&nbsp;**10.1** | Home — hero band | `src/components/home/HomeHub.tsx` |
| &nbsp;&nbsp;**10.2** | Home — hero action column | `src/components/home/HomeHub.tsx` |
| &nbsp;&nbsp;**10.3** | Home — activity tiles | `src/components/home/HomeHub.tsx` |
| **11** | Start-your-request modal | `src/components/home/StartYourRequestModal.tsx` |
| **15** | Create — intake screen | `src/components/screens/Intake.tsx` |
| **16** | Create canvas (3 columns) | `src/components/create/Canvas.tsx` |
| **17** | Machine card | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.1** | Machine card — head row | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.2** | Machine card — body grid | `src/components/create/MachineCard.tsx` |
| &nbsp;&nbsp;**17.3** | Machine card — image well | `src/components/create/MachineCard.tsx` |
| **18** | Operator rail | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.1** | Operator rail — head row | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.2** | Operator rail — options grid | `src/components/create/OperatorRail.tsx` |
| &nbsp;&nbsp;**18.3** | Operator rail — note block | `src/components/create/OperatorRail.tsx` |
| **19** | When panel (dates) | `src/components/create/WhenPanel.tsx` |
| &nbsp;&nbsp;**19.1** | When panel — head button | `src/components/create/WhenPanel.tsx` |
| &nbsp;&nbsp;**19.2** | When panel — open body | `src/components/create/WhenPanel.tsx` |
| **20** | Where panel (site) | `src/components/create/WherePanel.tsx` |
| &nbsp;&nbsp;**20.1** | Where panel — head button | `src/components/create/WherePanel.tsx` |
| &nbsp;&nbsp;**20.2** | Where panel — open body | `src/components/create/WherePanel.tsx` |
| **21** | Ready-to-send bar | `src/components/create/ReadyToSend.tsx` |
| **22** | Create — confirmation screen | `src/components/screens/Confirmation.tsx` |
| **23** | Carry-forward modal | `src/components/create/CarryForwardModal.tsx` |
| **24** | Create — processing screen | `src/components/screens/Processing.tsx` |
| **25** | Requests workspace | `src/components/workspace/RequestsWorkspace.tsx` |
| **26** | Requests rail (full-bleed band) | `src/components/workspace/RequestRail.tsx` |
| &nbsp;&nbsp;**26.1** | Rail — create tile | `src/components/workspace/RequestRail.tsx` |
| &nbsp;&nbsp;**26.2** | Rail — request tiles | `src/components/workspace/RequestRail.tsx` |
| **27** | Request strip | `src/components/workspace/RequestStrip.tsx` |
| &nbsp;&nbsp;**27.1** | Strip — card | `src/components/workspace/RequestStrip.tsx` |
| &nbsp;&nbsp;**27.2** | Strip — navy ref block | `src/components/workspace/RequestStrip.tsx` |
| **28** | Request drawer — masthead | `src/components/workspace/RequestDrawer.tsx` |
| **29** | Bid cards | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.1** | Bid card — one tile | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.2** | Bid card — header | `src/components/workspace/BidCards.tsx` |
| &nbsp;&nbsp;**29.3** | Bid card — bottom row | `src/components/workspace/BidCards.tsx` |
| **30** | Compare matrix | `src/components/workspace/CompareMatrix.tsx` |
| &nbsp;&nbsp;**30.1** | Matrix — horizontal scroller | `src/components/workspace/CompareMatrix.tsx` |
| &nbsp;&nbsp;**30.2** | Matrix — supplier column | `src/components/workspace/CompareMatrix.tsx` |
| **36** | Terms panel | `src/components/requests/TermsPanel.tsx` |
| **37** | Bid readiness | `src/components/requests/BidReadiness.tsx` |
| **38** | Share-for-bids sheet | `src/components/requests/ShareForBidsSheet.tsx` |
| **45** | Bid map workspace | `src/components/map/BidMapWorkspace.tsx` |
| &nbsp;&nbsp;**45.1** | Bid map — canvas side | `src/components/map/BidMapWorkspace.tsx` |
| &nbsp;&nbsp;**45.2** | Bid map — side panel | `src/components/map/BidMapWorkspace.tsx` |
| **46** | Map canvas | `src/components/map/MapCanvas.tsx` |
| **48** | Price footer | `src/components/map/PriceFooter.tsx` |
| **49** | Map request card | `src/components/map/RequestCard.tsx` |
| **51** | Supplier panel | `src/components/map/panel/CompanyPanel.tsx` |
| **52** | Equipment detail panel | `src/components/map/panel/EquipmentDetail.tsx` |
| **55** | Deal room | `src/components/deal-room/DealRoom.tsx` |
| **56** | Chat card | `src/components/deal-room/ChatCard.tsx` |
| **60** | Inbox | `src/components/inbox/InboxView.tsx` |
| **61** | Browse stores | `src/components/stores/BrowseSurface.tsx` |
| **62** | Store detail | `src/components/stores/StoreDetailSurface.tsx` |
| **63** | Store card | `src/components/stores/StoreCard.tsx` |
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
| **92** | Search select | `src/components/create/SearchSelect.tsx` |

## Adding one

1. Add an entry to `PIN_REGISTRY` in `src/lib/uiPins.ts` with the next free number in its block.
2. Spread `pin("<id>")` onto that element: `<div {...pin("machine-card-head")} className={…}>`.

Never renumber an existing entry — notes and tickets refer to it. Retire one by deleting it and leaving the number unused.

## Not pinned

A component whose root is a fragment has no element to carry the attribute: `ChatDock`, `EquipmentList`, `CreateSurface`. Pin a real child of one when it is worth naming. The line-commented `/requests` and `/compare` modules are left out until they come back (see `docs/requests-workspace-disabled.md`).
