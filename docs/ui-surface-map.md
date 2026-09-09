# UI surface map — file → pins

Generated from `src/lib/uiPins.ts` by `node scripts/ui-pins-doc.mjs`. **Do not edit the table**;
`tests/unit/ui-pins.test.ts` fails when it is stale.

This is the index `/web:change` reads. `docs/ui-pins.md` answers *"what is #47.3"* — a renter's note
or a screenshot arrives with a number and it names the surface. This file answers the other
direction: *"I am about to change this file — what else on it is addressable, and what am I standing
next to?"* Grouped by file, so a batch of notes that lands in one file is one edit rather than four.

Two things it does not hold, on purpose:

- **the stylesheet** that dresses each pin. A component and its rules are named together in
  `docs/ui-change-playbooks.md`, where the recurring change types live.
- **level-3 numbers** (`47.3.2`). Those are found by walking the DOM at read time and are a position
  rather than a name — see `docs/ui-pins.md`.

<!-- pins:start -->
| File | Pins |
| --- | --- |
| `src/components/AppNav.tsx` | 3 Nav tabs — desktop (`app-nav`) · 3.1 Nav tab — one link (`nav-tab`) · 4 Nav tabs — mobile (`app-nav-mobile`) |
| `src/components/AppShell.tsx` | 1 App frame (`app-shell`) · 2 Header bar (navy) (`app-header`) · 2.1 Header — logo (`header-logo`) · 2.2 Header — centred nav slot (`header-nav-slot`) · 2.3 Header — beta mark (`header-beta`) · 5 Account menu + locale toggle (`header-account`) · 5.1 Header — EN/AR toggle (`header-locale`) · 5.2 Header — inbox + bell pair (`header-icons`) · 5.3 Header — avatar (`header-avatar`) · 7 Page body (gutters live here) (`page-main`) · 8 Back arrow (`page-back`) |
| `src/components/common/GuestWall.tsx` | 9.5 Guest wall — blurred page + sign-in card (`guest-wall`) |
| `src/components/common/SignInPrompt.tsx` | 79 Sign-in prompt (`sign-in-prompt`) |
| `src/components/company/CompanyHub.tsx` | 72 Company hub (`company-hub`) |
| `src/components/company/MyCompanyCard.tsx` | 74 My company card (`my-company-card`) |
| `src/components/create/Canvas.tsx` | 16 Create canvas (3 columns) (`create-canvas`) · 16.2 Create — site + schedule locked strip (with «Change») (`locked-for-request`) |
| `src/components/create/CreateBack.tsx` | 16.1 Create — «leave this request?» confirm (`create-leave-confirm`) |
| `src/components/create/EquipmentTabs.tsx` | 17.4 Equipment tabs — the strip (`equipment-tabs`) · 17.5 Equipment tabs — one equipment (`equipment-tab`) · 17.6 Equipment tabs — the + that adds one (`equipment-tabs-add`) · 17.7 Equipment tabs — the ✕ that removes one (`equipment-tab-remove`) |
| `src/components/create/MachineCard.tsx` | 17 Machine card (`machine-card`) · 17.1 Machine card — head row (`machine-card-head`) · 17.2 Machine card — body grid (`machine-card-body`) · 17.3 Machine card — image well (`machine-card-image`) |
| `src/components/create/OperatorRail.tsx` | 18 Operator rail (`operator-rail`) · 18.1 Operator rail — head row (`operator-rail-head`) · 18.2 Operator rail — options grid (`operator-rail-options`) · 18.3 Operator rail — note block (`operator-rail-note`) · 18.4 Operator rail — closed strip (72px) (`operator-rail-closed`) |
| `src/components/create/ReadyToSend.tsx` | 21 Create — review & send screen (`ready-to-send`) |
| `src/components/create/WhenPanel.tsx` | 19 When panel (dates) (`when-panel`) · 19.1 When panel — head button (`when-panel-head`) · 19.2 When panel — open body (`when-panel-body`) |
| `src/components/create/WherePanel.tsx` | 20 Where panel (site) (`where-panel`) · 20.1 Where panel — head button (`where-panel-head`) · 20.2 Where panel — open body (`where-panel-body`) |
| `src/components/deal-room/ChatCard.tsx` | 56 Chat card (`chat-card`) |
| `src/components/deal-room/DealRoom.tsx` | 55 Deal room (`deal-room`) |
| `src/components/Dialog.tsx` | 90 Dialog (`dialog`) · 90.1 Dialog — panel (`dialog-panel`) · 90.2 Dialog — header row (`dialog-header`) |
| `src/components/Dropdown.tsx` | 92 Search select (`search-select`) |
| `src/components/help/HelpManual.tsx` | 6.1 Help manual modal (`help-manual`) |
| `src/components/home/CtaBanner.tsx` | 10.1 Home — hero band (`home-hero`) · 10.2 Home — hero action column (`home-hero-actions`) |
| `src/components/home/HomeHub.tsx` | 10 Home (`home-hub`) |
| `src/components/home/HomeNotificationBubble.tsx` | 10.7 Home — notification bubble (`home-bubble`) |
| `src/components/home/HomeRequests.tsx` | 10.4 Home — requests + bids rail (`home-requests`) |
| `src/components/home/StartYourRequestModal.tsx` | 11 Start-your-request modal (`start-request-modal`) |
| `src/components/inbox/InboxView.tsx` | 60 Inbox (`inbox-view`) |
| `src/components/map/BidMapWorkspace.tsx` | 45 Bid map workspace (`bid-map-workspace`) · 45.1 Bid map — canvas side (`bidmap-canvas`) · 45.2 Bid map — side panel (`bidmap-panel`) |
| `src/components/map/ChatDock.tsx` | 57 Chat drawer (map) (`chat-dock`) · 57.1 Chat drawer — identity + phase + kebab (`chat-dock-head`) · 57.2 Chat drawer — supplier tabs (`chat-dock-tabs`) · 57.3 Chat drawer — the thread (`chat-dock-thread`) · 57.4 Chat drawer — composer (`chat-dock-composer`) · 57.5 Chat drawer — staged request card (`chat-dock-draft`) |
| `src/components/map/EquipmentList.tsx` | 47 Fleet card (equipment list) (`equipment-card`) · 47.1 Fleet card — photo cell (`equipment-card-photo`) · 47.2 Fleet card — readiness + file icon (`equipment-card-head`) · 47.3 Fleet card — yard card (distance + availability) (`equipment-card-yard`) · 47.5 Fleet list — filter bar (`equipment-filter`) · 47.6 Fleet list — filter panel (`equipment-filter-panel`) |
| `src/components/map/MapCanvas.tsx` | 46 Map canvas (`map-canvas`) · 46.1 Map — one machine's marker (`map-pin`) |
| `src/components/map/panel/CompanyPanel.tsx` | 51 Supplier panel (`company-panel`) |
| `src/components/map/panel/DocRowList.tsx` | 53.2 Document row (`doc-row`) |
| `src/components/map/panel/EquipmentDetail.tsx` | 52 Equipment detail panel (`equipment-detail`) · 52.1 Equipment detail — the viewer (photo / paper) (`equipment-detail-viewer`) · 52.2 Equipment detail — tab strip (`equipment-detail-tabs`) · 52.3 Equipment detail — yard card (`equipment-detail-yard`) · 52.4 Equipment detail — match grid (`equipment-detail-grid`) |
| `src/components/map/panel/EquipmentDocuments.tsx` | 53 Equipment documents tab (`equipment-documents`) · 53.1 Documents tab — Download / Ask footer (`equipment-documents-foot`) |
| `src/components/map/PriceFooter.tsx` | 48 Price footer (`price-footer`) · 48.1 Price footer — the rate (`price-footer-rate`) · 48.2 Price footer — «Show details» link (`price-footer-details`) · 48.3 Price footer — «Counter this price» (`price-footer-counter`) · 48.4 Price footer — the breakdown (`price-footer-break`) · 48.5 Price footer — «Approve» (only when nothing is left to settle) (`price-footer-approve`) |
| `src/components/map/RequestCard.tsx` | 49 Map request card (`map-request-card`) · 49.1 Request card — identity strip (firm / machine) (`request-card-id`) · 49.2 Request card — photo or company mark (`request-card-tile`) · 49.3 Request card — the ask (`request-card-body`) · 49.4 Request card — status row (`request-card-state`) · 49.5 Request card — draft's Cancel / Send (`request-card-acts`) |
| `src/components/map/YardExplainDialog.tsx` | 50 Yard explainer modal (red distance) (`yard-explain`) · 50.1 Yard explainer — red → green specimens (`yard-explain-demo`) · 50.2 Yard explainer — the two lines (`yard-explain-lines`) · 50.3 Yard explainer — «Ask the supplier» (`yard-explain-cta`) |
| `src/components/NotificationsBell.tsx` | 6 Notifications bell (`notifications-bell`) |
| `src/components/onboarding/AccountModal.tsx` | 78 Sign-in / register modal (`auth-gate`) |
| `src/components/onboarding/OnboardingForm.tsx` | 76 Onboarding form (`onboarding-form`) |
| `src/components/onboarding/OnboardingShell.tsx` | 75 Onboarding shell (`onboarding-shell`) |
| `src/components/onboarding/VerificationFlow.tsx` | 77 Verification flow (`verification-flow`) |
| `src/components/PageSection.tsx` | 9 Page section (`page-section`) |
| `src/components/profile/EditProfileForm.tsx` | 71 Edit profile form (`edit-profile-form`) |
| `src/components/profile/ProfileView.tsx` | 70 Profile (`profile-view`) |
| `src/components/requests/BidReadiness.tsx` | 37 Bid readiness (`bid-readiness`) |
| `src/components/requests/ShareForBidsSheet.tsx` | 38 Share-for-bids sheet (`share-for-bids`) |
| `src/components/requests/TermsPanel.tsx` | 36 Terms panel (`terms-panel`) |
| `src/components/screens/Confirmation.tsx` | 22 Create — confirmation screen (`create-confirmation`) |
| `src/components/screens/Intake.tsx` | 15 Create — intake screen (`create-intake`) |
| `src/components/screens/Processing.tsx` | 24 Create — processing screen (`create-processing`) |
| `src/components/stores/BrowsePage.tsx` | 10.5 Browse — banner + supplier directory (`browse-page`) |
| `src/components/stores/BrowseSurface.tsx` | 61 Browse stores (`browse-surface`) |
| `src/components/stores/EquipmentDetailSurface.tsx` | 65 Equipment sheet (`equipment-sheet`) |
| `src/components/stores/StoreCard.tsx` | 63 Store card (`store-card`) · 64 Store card (category) (`store-card-equipment`) |
| `src/components/stores/StoreDetailSurface.tsx` | 62 Store detail (`store-detail`) · 66 Store equipment card (`store-equipment-card`) |
| `src/components/suppliers/SuppliersPage.tsx` | 10.6 My Suppliers — the list (`suppliers-list`) |
| `src/components/workspace/AiRankPanel.tsx` | 30.9 Compare — the assistant under the table (`ai-rank-panel`) |
| `src/components/workspace/BidCards.tsx` | 29 Bid cards (`workspace-bid-cards`) · 29.1 Bid card — one tile (`bid-card`) · 29.2 Bid card — header (`bid-card-header`) · 29.3 Bid card — bottom row (`bid-card-footer`) |
| `src/components/workspace/BidSizeFilter.tsx` | 28.5 Bid size filter — include larger equipment (`bid-size-filter`) |
| `src/components/workspace/CompareMatrix.tsx` | 30 Compare matrix (`compare-matrix`) · 30.1 Matrix — horizontal scroller (`matrix-scroller`) · 30.2 Matrix — supplier column (`matrix-supplier-col`) |
| `src/components/workspace/ItemTier.tsx` | 26.3 Item tier — one chip per machine (`item-tier`) |
| `src/components/workspace/RequestContextBar.tsx` | 27 Request context bar (location + item) (`request-context`) |
| `src/components/workspace/RequestDetailsModal.tsx` | 28 Request details modal (`request-details`) |
| `src/components/workspace/RequestRail.tsx` | 26 Requests rail (full-bleed band) (`request-rail`) · 26.1 Rail — create tile (`rail-create-tile`) · 26.2 Rail — request tiles (`rail-tiles`) |
| `src/components/workspace/RequestsWorkspace.tsx` | 25 Requests workspace (`requests-workspace`) |
<!-- pins:end -->
