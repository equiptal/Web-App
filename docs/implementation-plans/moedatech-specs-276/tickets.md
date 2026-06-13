# Tickets — Renter web manual & direct-from-store request creation

Card: https://github.com/equiptal/moedatech-specs/issues/276
Plan: ./plan.md

Mirrors the mobile app: posts to the **app backend** `POST /rentees/me/requests` (shared model) using the **app equipment taxonomy** (`/equipment/taxonomy`, with category/subcategory icons), reusing web-app/002's wizard shell + web-app/004's store page. Implement top-to-bottom.

## Backend — admin
_No tickets in this scope._ (Admin renders direct/broadcast from the shared model unchanged — AC-31.)

## Backend — mobile
_No tickets in this scope._ (Direct submit (mobile/007), store-scoped nav (mobile/008), multi-item (mobile/017) shipped on the app; reused — AC-19/27/28/30.)

## Web BFF (server routes)

### T1 — Create-request BFF route + payload mapper (app backend)  (#48)
**Scope:** web-bff
**ACs:** AC-10, AC-17, AC-18, AC-26, AC-27, AC-28, AC-29, AC-30, AC-31, AC-34
**Description:**
Add `POST /api/create-request` via `withAuthedBackend` → app backend `POST /rentees/me/requests` (leave 002's `/api/requests`→Mansour untouched). Add `src/lib/contract/create-request.ts`: a `buildCreateRequest(draft)` mapper producing the app schema — `type` (`BROADCAST`/`DIRECT`), `supplierId` (only when direct), `rentalType`, `projectLat/Lng`/`projectAddressLabel`, `startDate`/`endDate` (ISO+offset), `urgency` (derive from start date), `equipmentItems[]` (`categoryId,subtypeId,capacityId,numberOfUnits,operatorIncluded,mobilizationByRentee,demobilizationByRentee,fuelTypePreference,…`), `fulfillmentType` when ≥2 items, optional preferences. Map backend errors via `appAuthErrorResponse`; preserve input + no partial create on failure (AC-34).

**Given/When/Then:**
- Given a complete broadcast draft / When POST /api/create-request / Then app receives `type:BROADCAST`, no `supplierId`, all items.
- Given a direct draft with a supplier / When posted as direct / Then `type:DIRECT` + `supplierId`; broadcast-instead omits `supplierId`.
- Given ≥2 items / Then `fulfillmentType` is set. Given a network failure / Then a clear error, input preserved, nothing created.

### T2 — Expose supplier id + listing availability on equipment  (#49)
**Scope:** web-bff
**ACs:** AC-12, AC-13, AC-17, AC-35
**Description:**
Add `supplierId` (numeric `userId`) to `mapEquipmentDetail` + `/api/equipment/[id]` (and `StoreCard`/listing where needed) so a direct request can bind the supplier. Surface enough to detect an unavailable listing (AC-35 working assumption: error, no seed).

**Given/When/Then:**
- Given an equipment detail / When fetched / Then it includes the supplier's numeric id for direct binding.
- Given a tapped listing no longer available / Then the renter is informed and no direct request is seeded.

## Web frontend

### T3 — Manual create entry + flow state (channel/supplier/draft)  (#50)
**Scope:** web-frontend
**ACs:** AC-01, AC-02
**Description:**
Activate the create surface's **Fill Manually** card → enter the manual wizard at Step 1 with an empty draft (no agent/Mansour). Add create-flow state carrying `channel` (`broadcast`/`direct`), `supplier {id,name}|null`, project, items, preferences. Guest block reuses 002 AC-02 (GuestBlock) at entry.

**Given/When/Then:**
- Given basic/verified / When they pick Fill Manually / Then the manual builder opens at Step 1.
- Given a guest / When they try to start manual / Then the account-creation prompt shows; intake not reachable until basic/verified.

### T4 — Equipment step: app-taxonomy icon picker + multi-item  (#51)
**Scope:** web-frontend
**ACs:** AC-05, AC-06, AC-07, AC-08, AC-13
**Description:**
Step 2 equipment picker using the app taxonomy (`/api/stores/taxonomy`): category → subcategory → measurement, **rendering each node's icon** (`iconUrl`), like the app. Only taxonomy-valid combos accepted. Multi-item add; per-item options (quantity default 1, operator, fuel default diesel, notes); remove via `✕` with confirmation. Direct entry seeds one item from the listing (measurement from the listing).

**Given/When/Then:**
- Given Step 2 / When category→subcategory→measurement chosen / Then the item is added (icons shown); only valid combos accepted.
- Given ≥2 items added / Then all carried. Given remove `✕` / Then confirm required, then removed.
- Given a direct entry / Then the seeded listing item is present with its measurement.

### T5 — Wizard steps: Project gate, Preferences, Preview (supplier for direct)  (#52)
**Scope:** web-frontend
**ACs:** AC-04, AC-09, AC-14
**Description:**
Reuse/adapt 002's Step 1 (location confirm + rental basis gate; start date optional), Step 3 (Core Terms + Optional Extras → app preferences fields), and Step 4 Preview (multi-item summary). On a direct request, Preview shows the chosen supplier/store.

**Given/When/Then:**
- Given Step 1 / When advancing without confirmed location or rental basis / Then blocked; once both set, advance.
- Given Step 3 / Then preferences reviewable/editable. Given direct Preview / Then the supplier is shown.

### T6 — Direct entry from a store (Request this equipment)  (#53)
**Scope:** web-frontend
**ACs:** AC-03, AC-12, AC-13, AC-15
**Description:**
Wire `Request this equipment` (EquipmentDetailModal / store card) to start a `direct` request bound to the supplier (`supplierId` from T2), seed the item, open the wizard at Step 1. Guest → account-creation prompt (AC-03).

**Given/When/Then:**
- Given basic/verified on a store / When Request this equipment / Then a direct request starts bound to that supplier, wizard at Step 1, item seeded.
- Given a guest / Then the account-creation prompt; direct intake not reachable until basic/verified.

### T7 — Direct submit: send-choice modal (Send to store / Broadcast instead)  (#54)
**Scope:** web-frontend
**ACs:** AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-11
**Description:**
On direct Preview submit, open `How do you want to send this?` modal with **Send to `<store>`** (post `direct` + supplierId) and **Broadcast instead** (post `broadcast`, permanently clear supplier — one-way). Dismiss (backdrop/Esc/close) → no post, Submit re-enabled. Channel-aware feedback (names store / reaching suppliers). Manual broadcast submit shows **no** modal (AC-11).

**Given/When/Then:**
- Given direct Preview / When submit / Then the modal opens with the two choices.
- Send to store → direct, only that supplier invited. Broadcast instead → broadcast, supplier cleared one-way. Dismiss → nothing posted, returns to Preview.
- Given a manual broadcast submit / Then no modal; posts broadcast directly.

### T8 — Direct Step-2 store-scoped management (add/replace/single + inline remove)  (#55)
**Scope:** web-frontend
**ACs:** AC-22, AC-23, AC-24, AC-25
**Description:**
Mirror mobile/008 on web: a stash persists the in-progress direct request across a return-to-store. Add equipment → return to the store, `Request this equipment` appends; re-pick the active item → replaces; remove the only item → re-pick from store becomes the single item; remove a non-last item → inline, no redirect. Step 1 + Step 3 preserved throughout.

**Given/When/Then:**
- Given direct Step 2 / When add via store / Then appended; Step1/Step3 preserved. When re-pick active / Then replaced. When remove only item / Then re-pick→single. When remove non-last / Then inline, stays direct multi-item.

### T9 — EN/AR strings + RTL for the new surfaces  (#56)
**Scope:** web-frontend
**ACs:** AC-32, AC-33
**Description:**
Add EN + AR strings (Dictionary parity) for the manual builder, the equipment picker, the send-choice modal, the direct/store entry, and channel feedback. RTL via the existing `dir` machinery (tentative — Q6).

**Given/When/Then:**
- Given EN or AR / Then the manual/direct surfaces show in that language; Arabic renders RTL.

### T10 — Unit tests  (#57)
**Scope:** web-frontend
**ACs:** AC-10, AC-17, AC-18, AC-06, AC-13, AC-32
**Description:**
Vitest: `buildCreateRequest` mapper (broadcast omits supplierId; direct sets type+supplierId; broadcast-instead clears it; ≥2 items sets fulfillmentType; urgency derivation; item field mapping), taxonomy/icon mapping for the picker, en/ar parity for the new blocks.

**Given/When/Then:**
- Given a direct draft / When mapped / Then type=DIRECT + supplierId. Given broadcast-instead / Then no supplierId. Given ≥2 items / Then fulfillmentType set.

## API integration
Covered by T1/T2 — app-backend `POST /rentees/me/requests` (shared model) via the authed client; app `/equipment/taxonomy` (icons) for the picker; `supplierId` from the listing. Distinct from 002's Mansour `/api/requests`.
