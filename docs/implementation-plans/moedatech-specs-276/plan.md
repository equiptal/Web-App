# Implementation Plan — Renter web manual & direct-from-store request creation

**Card:** https://github.com/equiptal/moedatech-specs/issues/276
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/005-manual-direct-request-creation/
**Card id:** moedatech-specs-276
**Generated:** 2026-06-13

## Summary
Brings two mobile create-request capabilities to the renter web app, on top of web-app/002 (create surface + 4-step wizard) and web-app/004 (store page): (1) a **Manual** create path — build a request by hand by picking equipment from the taxonomy (category → subcategory → measurement) across the same 4 steps (Project → Equipment → Preferences → Preview), posted as a **broadcast**, no agent; and (2) a **Direct request from a store** — a `Request this equipment` CTA on a verified supplier's store equipment card starts a request bound to that one supplier, with a submit-time send-choice (**Send to `<store>`** / **Broadcast instead**, one-way clear) mirroring mobile/007, and store-scoped Step-2 equipment management mirroring mobile/008. Multi-item in both modes. Guests are blocked at entry (reuses 002 AC-02). Cross-surface ACs assert web-created requests are viewed/tracked on the **mobile app** (web has no request-viewing).

## Acceptance criteria covered
- **AC-01:** Given a renter signed in as `basic`/`verified` / When they open the create surface and select the `Manual` tab (RFQ is default, 002) / Then the manual request builder is shown, starting at Step 1 — Project details
- **AC-02:** Given a `guest` / When they attempt to start a manual request (home entry or Manual tab) / Then an account-creation prompt is shown (reuses 002 AC-02) / And manual intake is not reachable until `basic`/`verified`
- **AC-03:** Given a `guest` viewing a store / When they tap `Request this equipment` / Then an account-creation prompt is shown / And direct intake is not reachable until `basic`/`verified`
- **AC-04:** Given basic/verified on Step 1 / When they advance without a confirmed location or chosen rental basis / Then advancing is blocked (gate inherited from 002; start date optional) / And once location confirmed + rental basis chosen they can advance
- **AC-05:** Given a renter on Step 2 / When they select a `category` → `subcategory` → `measurement` / Then the item is added / And only a taxonomy-valid combination is accepted
- **AC-06:** Given Step 2 / When they add two or more items / Then all are carried in the single request
- **AC-07:** Given Step 2 with ≥1 item / When they remove an item via `✕` / Then a confirmation is required / And on confirming, it is removed
- **AC-08:** Given editing an item on Step 2 / When they set per-item options / Then quantity (default `1`), operator, fuel type (default `diesel`), and additional notes are editable per item (002's per-item structure)
- **AC-09:** Given Step 3 — Preferences / When it renders / Then Core Terms and Optional Extras are reviewable/editable (002's Step 3)
- **AC-10:** Given Step 4 — Preview with a complete manual request / When they post / Then the request is created as `broadcast` / And a confirmation is shown on the web / And the renter stays on the web
- **AC-11:** Given posting a manual (broadcast) request / When they submit / Then no `Send to <store>` / `Broadcast instead` modal is shown / And it posts directly as `broadcast`
- **AC-12:** Given basic/verified viewing a store / When they tap `Request this equipment` on a card / Then a request starts in `direct` mode bound to that one supplier / And the wizard opens at Step 1
- **AC-13:** Given a direct request started from a store card / When they reach Step 2 / Then the selected listing's equipment is present as an item, with its `measurement` taken from the listing
- **AC-14:** Given Step 4 — Preview of a direct request / When it renders / Then the chosen supplier/store is shown
- **AC-15:** Given building a direct request / When they add further items (per AC-22) / Then the request carries multiple items, all bound to the same supplier
- **AC-16:** Given Step 4 — Preview of a direct request / When they submit / Then a modal `How do you want to send this?` opens with `Send to <store>` and `Broadcast instead`
- **AC-17:** Given the send-choice modal open / When they choose `Send to <store>` / Then posted as `direct` / And only the chosen supplier is invited to bid
- **AC-18:** Given the send-choice modal open / When they choose `Broadcast instead` / Then posted as `broadcast` / And the original supplier reference is permanently cleared / And the switch is one-way
- **AC-19:** Given a direct→broadcast switch at submit / When the request is later viewed (on the app) / Then no supplier-specific UI is shown for it on any later surface
- **AC-20:** Given the send-choice modal open / When dismissed (backdrop/`Esc`/close) / Then nothing is posted / And the renter returns to Step 4 with Submit re-enabled
- **AC-21:** Given submitting / When in progress / Then a direct submit's feedback names the chosen store and a broadcast's indicates reaching matching suppliers
- **AC-22:** Given Step 2 of a direct request / When they add equipment by returning to the store and tapping `Request this equipment` on another card / Then the new item is appended / And Step 1 + Step 3 data are preserved
- **AC-23:** Given Step 2 of a direct request / When they re-pick the active item from the store / Then the new item replaces the previous active item / And Step 1 + Step 3 preserved
- **AC-24:** Given Step 2 of a direct request with exactly one item / When they remove it via `✕` / Then they re-pick from the store via `Request this equipment` / And the re-picked item becomes the single item; Step 1 + Step 3 preserved
- **AC-25:** Given Step 2 of a direct request with ≥2 items / When they remove a non-last item via `✕` / Then it is removed inline with no store redirect / And the request stays `direct` and multi-item
- **AC-26:** Given a broadcast request posted on the web Manual tab / When they view requests on the mobile app / Then the request is present (web has no request-viewing) / And all of its items are shown
- **AC-27:** Given a direct request posted on the web / When viewed on the app / Then shown as `direct` / And only the chosen supplier is invited to bid
- **AC-28:** Given a web direct→broadcast switch at submit / When viewed on the app / Then shown as `broadcast` / And carries no supplier reference (per AC-19)
- **AC-29:** Given a multi-item request posted on the web / When viewed on the app / Then every item added on the web is present
- **AC-30:** Given a request created on the web / When suppliers bid and a deal proceeds / Then bidding and deals proceed identically to an app-created request
- **AC-31:** Given a request created on the web (broadcast or direct) / When an operator views requests in admin / Then it appears and renders the `direct`/`broadcast` distinction the same as an app-created request
- **AC-32:** Given the renter's language is English or Arabic / When they use the manual/direct surfaces / Then the surfaces are shown in that language
- **AC-33:** Given Arabic / When they use the manual/direct surfaces / Then they render right-to-left *(tentative — STANDARDS § RTL TBD)*
- **AC-34:** Given posting a request (manual broadcast or direct) / When a network failure occurs / Then a clear error is shown / And the renter's input is preserved / And no partial request is created
- **AC-35:** Given a renter on a store / When they tap `Request this equipment` on a listing no longer available / Then the renter is informed and no direct request is started/seeded *(tentative — behavior to settle)*

## Architecture overview
All work is in the **web app** over the existing wizard + submit (web-app/002) and store page (web-app/004). The shared request model, taxonomy, and downstream (bids/deals/admin) are unchanged.

**Reuse (already exists):** the 4-step `Wizard` + `Step1Project`/`Step2Equipment`/`Step3Preferences`/`Step4Preview`, the **taxonomy picker in `ItemRow`** (category→subcategory→measurement from `state.taxonomy`), `addItem()`/`removeItem()`/`patchItem()`, the Step-1/Step-2 gates, `submit()` → `/api/requests` → `draftToCreateRequest` → agents backend `/agents/requests`, and the guest block (`GuestBlock`, 002 AC-02). The `CreateRequestPayload.type` already supports `"BROADCAST" | "DIRECT"`.

**Manual mode (Flows 1):** the create surface's **Fill Manually** card (currently coming-soon) becomes active — a new `enterManualWizard()` action enters the wizard at Step 1 with an **empty draft** (no `processing` phase, no agent) carrying one blank item. The renter picks taxonomy + per-item options via the existing `ItemRow`, advances through the 4 steps, and posts as `broadcast` (existing submit path, no modal — AC-10/11).

**Direct mode (Flows 2/3/4):** add a `channel: "broadcast" | "direct"` + `supplier: { id, name } | null` to the RFQ store. `Request this equipment` on a store card (web-app/004's `EquipmentDetailModal`) starts a **direct** request bound to the store (`storeId` from the `/stores/[id]` route + store name), seeds one item from the listing (AC-12/13), opens the wizard at Step 1. Step 4 Preview shows the supplier (AC-14). **Submit opens a send-choice modal** (`Send to <store>` / `Broadcast instead`, AC-16): Send → post `direct` with the supplier (AC-17); Broadcast instead → clear supplier permanently + post `broadcast` (AC-18, one-way); dismiss → no post (AC-20). Channel-aware feedback (AC-21). Step-2 store-scoped management (AC-22–25): add/replace/single via returning to the store (state persisted across the round-trip), inline remove for non-last.

**Submit changes:** `draftToCreateRequest` sets `type` from the channel and includes the supplier reference for direct (payload + backend field — see Open questions Q1). Network-failure handling reuses 002's error path (AC-34).

## Backend — admin
_No tickets in this scope._ (Admin already renders direct/broadcast from mobile; web uses the shared model — AC-31, confirmed in brief.)

## Backend — mobile
_No tickets in this scope._ (Direct/broadcast submit (mobile/007), store-scoped nav (mobile/008), and multi-item (mobile/017) are shipped on the app and reused — AC-19/27/28/30.)

## Web (BFF + frontend)
- RFQ store: `channel` + `supplier` state; `enterManualWizard()`; direct-mode item management (append/replace/single/inline-remove) preserving Step 1 + Step 3.
- Create surface: activate the **Fill Manually** card → manual wizard.
- Store: wire `Request this equipment` to start a direct request (seed item + supplier), with the guest block (AC-03).
- Send-choice modal at direct submit (AC-16–21).
- Submit adapter + `/api/requests` carry channel + supplier; preview shows supplier (AC-14).
- i18n EN/AR for all new strings (AC-32/33).

## API integration  (RESOLVED by app-repo audit — mirror the app)
**Decision:** 005 posts to the **app backend** (the shared model), like the mobile app — NOT the Mansour `/agents/requests` path 002's RFQ uses. This is required for the cross-surface ACs (web requests viewed on app + admin — AC-26–31).

- **Endpoint:** `POST /rentees/me/requests` (app backend, Cognito ID-token authed via the existing `withAuthedBackend`). New BFF route, e.g. `POST /api/create-request` (keep 002's `/api/requests`→Mansour untouched).
- **Payload** (`apps/backend/src/validators/request.schema.ts`): `type: 'BROADCAST'|'DIRECT'`; **`supplierId` (number) REQUIRED iff `type==='DIRECT'`, must be ABSENT for `BROADCAST`**; `rentalType`, `projectLat/Lng` (Saudi bounds), `projectAddressLabel`, `startDate`(ISO+offset)/`endDate`, `urgency` (ASAP/SOON/FAR_FUTURE — derive from start date, [[web002-urgency-derived]]), timing fields; `equipmentItems[]` each `{categoryId, subtypeId, capacityId, numberOfUnits, operatorIncluded, mobilizationByRentee, demobilizationByRentee, fuelTypePreference, …}`; **`fulfillmentType` (SINGLE_SUPPLIER|MULTIPLE_SUPPLIERS) REQUIRED when ≥2 items**; optional preferences (paymentTerms, verifiedSuppliersOnly, breakdownResponseSla, budgetCeiling, additionalNotes, …).
- **Taxonomy (aligned):** use the **app `/equipment/taxonomy`** (already proxied at `/api/stores/taxonomy`, `mapTaxonomy` → `{id,name,nameAr,iconUrl,children}`) for the manual equipment picker AND posting — the listing's `subtypeId`/`capacityId` come from the same tree, so direct seeding (AC-13) is consistent. **No agent taxonomy.**
- **Category/subcategory icons:** each taxonomy node's `iconUrl` (server-computed from `imageKey`) — the picker renders these (the app does the same). Already mapped in `mapTaxonomy`.
- **Direct supplier id:** `supplierId` is the supplier's **numeric user id** — exposed on the equipment listing as `userId` (add it to `mapEquipmentDetail`/`/api/equipment/[id]`).

## Data model / migrations
None. Shared request model; web is a new producer of the same `CreateRequestPayload` (already has `type` + `equipmentItems[]`).

## Risks & dependencies
- **web-app/002 & 004 shipped** (both merged to staging) — the wizard, submit, store page exist. **Prerequisite met.**
- **mobile/007 (direct submit), mobile/008 (store nav), mobile/017 (multi-item)** — shipped on the app; the web surfaces/reuses the shared behavior. Need the backend to accept a direct request from the web (Q1).
- **Taxonomy alignment** (Q2) is the main technical risk for direct seeding.
- **Split-at-review risk** — the spec flags this epic spans 3 surfaces (Awab's bite-size preference); may be split at PR review.

## Open questions
- ✅ **Q1 (AC-12/16/17/27) — Direct supplier field (RESOLVED by app-repo audit).** Create-request = `POST /rentees/me/requests`; `type: 'BROADCAST'|'DIRECT'`; **`supplierId` (number) required for DIRECT, absent for BROADCAST** (`request.schema.ts`). Web posts to this shared endpoint (not Mansour).
- ✅ **Q2 (AC-13) — Taxonomy alignment (RESOLVED).** The app's create picker uses the **same `/equipment/taxonomy`** the store browse uses; the listing's `subtypeId`/`capacityId` are from that tree. 005 uses the app taxonomy throughout (already proxied at `/api/stores/taxonomy`) — no agent-taxonomy mismatch.
- ✅ **Q3 (AC-12) — Supplier id (RESOLVED).** `supplierId` = the supplier's numeric `userId`, present on the equipment listing (`e.userId`); add it to `mapEquipmentDetail` + `/api/equipment/[id]` so the direct request can bind it.
- ✅ **Q5 (AC-22/23/24) — Direct Step-2 management (RESOLVED by audit).** The app uses a stash (intent single/replace/append + snapshot) and returns to `/store/{id}` to re-pick. Web mirror: in direct Step 2, "Add equipment" / re-pick navigates to the store, and `Request this equipment` appends/replaces into the in-progress direct request (state persisted via a stash); inline `✕` for a non-last item. Exact triggers follow the app.
- ✅ **Q4 (AC-01, brief) — Manual placement (DECISION).** The create surface's **Fill Manually** card (currently coming-soon, from the 004 intake restyle) becomes active → opens the manual wizard. Home "create a request" opens the create surface (RFQ/Upload default). Will confirm copy with PM but proceed.
- 🟡 **Q6 (AC-33) — RTL on web.** Tentative (STANDARDS § RTL TBD), carried from 002. Strings translate (AC-32); full RTL layout to confirm — accept and proceed.
- 🟡 **Q7 (AC-35) — Store listing unavailable.** Tentative ("behavior to settle"). Working assumption: if the listing is gone/unavailable when `Request this equipment` is tapped, show an error and don't start/seed — confirm with PM.
- 🟡 **Q8 (process) — EN/AR strings.** `(tentative — PM-confirm)` copy (`Request this equipment`; send-choice modal `How do you want to send this?` / `Send to <store>` / `Broadcast instead`; channel feedback) needs confirmed EN+AR before launch.
- 🟡 **Q9 (process) — Board state.** Epic #276 at **Specced** (spec PR #277 merged, didn't auto-advance — same gap as #268/#270). Flag for the UAT move.
- 🟡 **Q6 (AC-33) — RTL on web.** Tentative (STANDARDS § RTL TBD), carried from 002. Strings translate (AC-32); full RTL layout to confirm.
- 🟡 **Q7 (AC-35) — Store listing unavailable.** Behavior when `Request this equipment` is tapped on an unavailable listing is tentative ("behavior to settle"). PM-confirm.
- 🟡 **Q8 (process) — EN/AR strings.** The `(tentative — PM-confirm)` strings (`Request this equipment`; send-choice modal `How do you want to send this?` / `Send to <store>` / `Broadcast instead`; channel-aware feedback) need confirmed copy before launch.
- 🟡 **Q9 (process) — Board state.** Epic #276 is at **Specced** (spec PR #277 merged but the epic didn't auto-advance to Implementing — same automation gap as #268/#270). Doesn't block building; flag so it's moved correctly for UAT.

## Out of scope
Per `brief.md` Non-goals:
- Agent-assisted creation / RFQ parsing (that's web-app/002; manual tab has no agent/fan-out).
- Broadcast → direct reverse switch (matches mobile/007).
- Changing 004's stores-browse/store-detail UI beyond adding the Direct Request entry point.
- Viewing / tracking / editing / managing requests, bids, or deals on web (future epic; web has no request-viewing).
- The guest → basic profile-completion form on web (separate epic; guests are blocked + prompted only).
- Building the shared multi-item or direct/broadcast behavior (those are mobile/017, mobile/007 — reused, not built).
- Trial / fake requests on the web.
