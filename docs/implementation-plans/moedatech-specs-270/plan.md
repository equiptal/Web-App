# Implementation Plan — Renter web home & stores browse

**Card:** https://github.com/equiptal/moedatech-specs/issues/270
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/004-renter-home/
**Card id:** moedatech-specs-270
**Generated:** 2026-06-12

## Summary
web-app/004 gives the signed-in renter a defined landing surface: a **web home hub** inside an **app shell** (sidebar + top bar) that gathers their entry points (create a request → 002, complete profile / get verified → 003, sign out → 001) and shows their tier, plus a **read-only stores-browse** surface (filter + search verified suppliers) and **store detail** (store info, trust-doc labels, equipment listing). All supplier/store/equipment data is read-only and mirrors the mobile app via the shared backend (`GET /stores`, `GET /stores/{id}`, `GET /equipment/taxonomy`) using the same Cognito-ID-token authed path the 003 client already established. No new data is defined; the web is an additional read-only surface. Explicitly **out**: bid/deal tracking, requests/jobs lists, notifications, profile editing (future epics).

## Acceptance criteria covered
- **AC-01:** Given a signed-in renter / When they open the web app / Then the home is shown inside an app shell with a sidebar and a top bar
- **AC-02:** Given the app shell / When the sidebar renders / Then it shows Home, Profile, and a Request action / And no Requests, Jobs, or notifications surfaces are present
- **AC-03:** Given the app shell / When the top bar renders / Then it shows the renter's current tier (`guest`/`basic`/`verified`), a language toggle (`en`/`ar`), and an account menu
- **AC-04:** Given the renter is on the home / When the home renders / Then a primary entry to create a request is shown
- **AC-05:** Given the renter is on the home / When the home renders / Then a limited preview of suppliers is shown with a View-all entry to the full browse (per AC-10)
- **AC-06:** Given the renter is on the home / When the home renders / Then a `guest` is shown a complete-your-profile nudge, a `basic` renter a get-verified nudge, and a `verified` renter their verified state with no nudge
- **AC-07:** Given the renter is on the home / When they select the create-request entry / Then the RFQ flow opens (web-app/002) / And a `guest` is taken through the account-creation prompt first (web-app/002 AC-02)
- **AC-08:** Given the renter selects the onboarding nudge / When the entry is followed / Then a `guest` opens profile completion and a `basic` renter opens verification (web-app/003) / And a `verified` renter has no onboarding action
- **AC-09:** Given the account menu is open / When the renter chooses Sign out / Then the web session ends (web-app/001)
- **AC-10:** Given the home's suppliers preview / When the renter selects View all / Then the stores browse surface opens
- **AC-11:** Given the renter is on the stores browse / When they apply a city, category, subcategory, or measurement filter / Then the supplier list updates to match / And subcategory options are the children of the chosen category, and measurement options the children of the chosen subcategory
- **AC-12:** Given the renter is on the stores browse / When they enter a search term / Then the list matches against supplier store name and equipment manufacturer / model
- **AC-13:** Given the renter is on the stores browse / When verified-only is off / Then unverified suppliers (labelled `New`) are shown alongside verified ones / And when verified-only is on, only verified suppliers are shown
- **AC-14:** Given the stores browse / When the list renders / Then a store appears only if it is visible, its supplier account is active, and it has at least one active equipment listing / And a store with no active equipment is not listed
- **AC-15:** Given a featured (pinned) store that is visible and has active equipment / When verified-only is on / Then the featured store is still shown / And it is still subject to the visibility and active-equipment rules (per AC-14)
- **AC-16:** Given a supplier appears in the browse or preview / When its card renders / Then it shows the store name, logo (when present), verified state, active-equipment count, and city (when present) / And no rating, completed-deals count, or category tags are shown
- **AC-17:** Given the renter is on the stores browse / When no store matches the active filters or search / Then an empty state is shown
- **AC-18:** Given the renter opens a supplier's store / When the store detail renders / Then it shows the store name, city, active-equipment count, a view count, and a description when one is present / And a verified badge is shown only when the supplier is verified / And an operators section is shown as coming-soon
- **AC-19:** Given the renter is on a store detail / When the documents area renders / Then it lists the document labels `Commercial Registration`, `VAT`, and `National Address` with a verified / pending status derived from the supplier's verified state / And the document contents are not viewable or downloadable by the renter
- **AC-20:** Given the renter is on a store detail / When an equipment listing renders / Then it shows whichever of category, subcategory, measurement, make, model, year, and fuel are present / And it shows a price per day, or a price-on-request state when no price is set / And a verification tick is shown only when that equipment is verified
- **AC-21:** Given a visitor with no valid session / When they open any home, browse, or store URL / Then they are redirected to sign-in (web-app/001)
- **AC-22:** Given the renter's language is English or Arabic / When they use the home, browse, or store surfaces / Then the surfaces are shown in that language, the selection persists across the shell and views, and Arabic renders right-to-left
- **AC-23:** Given the renter is loading the home or the stores browse / When the load fails or there is no connectivity / Then a clear error with a retry is shown, rather than a silent blank surface
- **AC-24:** Given a supplier store and its active equipment exist in the mobile app / When the renter views that store on the web / Then the store's verified state, active-equipment count, and equipment listing match what the app shows / And the browse's category / subcategory / measurement options come from the same equipment taxonomy used across the app
- **AC-25:** Given the renter is anywhere in this epic's surfaces / When the home and shell render / Then no bid or deal counts, no My-Requests / My-Bids / Jobs surfaces, and no notifications surface are shown (deferred to future epics)

## Architecture overview
A thin BFF over the shared app backend (same Cognito-ID-token path as 003) plus net-new renter-facing surfaces, all inside a restructured app shell.

**Data flow:** browser → web BFF route (`/api/stores*`, `/api/stores/taxonomy`) → `withAuthedBackend` (forwards `mt_id` ID token, refresh-on-401) → app backend (`GET /stores`, `GET /stores/{id}`, `GET /equipment/taxonomy`) → mapped to a stable web contract → React surfaces.

**Backend endpoints (audited — all Cognito-ID-token authed):**
- `GET /stores` — browse. Params: `page,limit,search,category,city,measurement,verified`. Card fields: `id,name,logoUrl,bannerUrl,activeEquipmentCount,isVerified,city,createdAt`. Visibility rule (visible + active supplier + ≥1 active equipment) and **featured/pinned** ordering (`Store.sortOrder`, pinned bypass the verified filter) are enforced **server-side** — the web passes filters through and renders the result (covers AC-14/15 for free).
- `GET /stores/{storeId}` — detail. `store{id,name,description,logoUrl,bannerUrl,minRentalDuration,viewCount,supplierName,isVerified}`, `yards[]{id,name,city}`, `equipment[]`, `equipmentMeta{total,...}`. **View count is incremented server-side** on this call.
- `GET /stores/{storeId}/equipment` — paginated equipment (same shape as embedded `equipment[]`): `subcategoryName(/Ar), categoryName(/Ar), measurementName(/Ar), manufacturer, modelName, year, fuelType, photoKeys[], price, priceUnit, verificationStatus, yardCity, …`.
- `GET /equipment/taxonomy` — category → subcategory → measurement tree (`id,name,nameAr,level,parentId,children[]`) for the dependent filter dropdowns.
- Cities: reuse the existing `/api/master-data/cities` proxy (002/003) for the city filter.

**Frontend:**
- **App shell restructure** (`AppShell.tsx`): add a left **sidebar** (Home, Profile, Request action — and nothing else, AC-02/25) and keep/extend the **top bar** (tier badge, EN/AR toggle, **account menu** containing Sign out — moving the current inline sign-out into the menu, AC-03/09). The existing tier-progression entries fold into the home's tier-aware nudge.
- **Home hub** (new `HomeHub` surface, replaces `CreateSurface` as the `/` content): create-request entry (AC-04/07), limited verified-suppliers preview + View-all (AC-05/10), tier-aware onboarding nudge (AC-06/08). The RFQ `CreateSurface` becomes a destination opened via the Request action, not the home itself.
- **Stores browse** (`/browse`): filter bar (city, dependent category→subcategory→measurement, verified-only toggle, search), supplier-card grid, empty state (AC-17), loading + error/retry (AC-23).
- **Store detail** (`/stores/[id]`): banner/logo, name, city, active-equipment count, view count, description, verified badge, operators coming-soon (AC-18); trust-doc labels + verified/pending derived from `isVerified` (AC-19); equipment cards (AC-20).
- **Gating:** existing middleware already redirects unauthenticated users off non-public routes → covers AC-21 for `/`, `/browse`, `/stores/*` with no new work.
- **i18n:** new `home`/`browse`/`store` blocks in `en.ts`/`ar.ts`, RTL via existing `dir` machinery (AC-22).

## Backend — admin
_No tickets in this scope._ (Admin featured-store control already exists — `/admin/stores/featured*`; renters consume the result read-only.)

## Backend — mobile
_No tickets in this scope._ (No mobile change; the web reads the same records read-only, AC-24.)

## Web BFF (server routes) & frontend
- New authed BFF routes: `GET /api/stores` (browse passthrough + map), `GET /api/stores/[id]` (detail + embedded equipment, map), `GET /api/stores/taxonomy` (→ `/equipment/taxonomy`, for browse filters). All via `withAuthedBackend` (reuse 003's client).
- App-shell restructure (sidebar + account menu), home hub, stores-browse surface, store-detail surface, i18n, error/retry, gating verification. (Detailed per-ticket breakdown in `tickets.md`.)

## API integration
- Reuses the 003 authenticated client (`src/lib/api/app-backend-authed.ts`) verbatim — ID-token forward + refresh-on-401 + error mapping. No contract changes to the backend (read-only consumer).
- **Browse-filter taxonomy uses the app backend's `/equipment/taxonomy`, not the existing `/api/taxonomy`** (which proxies the agents/Mansour service for RFQ creation). The IDs from `/equipment/taxonomy` are what `GET /stores` filters by, so they must be the same source (AC-11/24).
- Image keys are returned pre-signed (`logoUrl`/`bannerUrl`/`photoKeys`) — render directly, no extra presign round-trip.

## Data model / migrations
None. Read-only consumer of existing `Store` / `Equipment` / taxonomy / user-`supplierStatus` data.

## Risks & dependencies
- **Depends on web-app/001** (gating + identity + sign-out) — shipped. **Links to 002** (RFQ, merged) and **003** (onboarding, merged to staging) as action destinations.
- **Featured stores (AC-15):** behavior is server-side (`Store.sortOrder`); correctness on staging depends on whether any store is actually pinned there (data, not code).
- **Shared data contract:** the `/stores` response shape is shared with mobile; if it changes, web + mobile move together (no web-side schema ownership).
- **Shell restructure touches the existing `/` route** (currently the RFQ create surface) — must preserve the 002 create flow as a destination, not regress it.

## Open questions
- ✅ **Q1 (AC-05/10/11/12/13/14/15/16/18/19/20/24) — Backend contract (RESOLVED by code audit of apps/backend).** Endpoints + exact fields confirmed: `GET /stores` (browse, with server-side visibility + featured rules), `GET /stores/{id}` (detail, server-increments viewCount), `GET /stores/{id}/equipment`, `GET /equipment/taxonomy`. Field maps embedded in Architecture above. All require the Cognito **ID token** (same as 003).
- ✅ **Q2 (AC-11/24) — Browse-filter taxonomy source.** Use the **app backend `/equipment/taxonomy`** (new authed proxy `/api/stores/taxonomy`), NOT the existing `/api/taxonomy` (agents/Mansour service, used by 002 RFQ creation). Rationale: `GET /stores` filters by taxonomy IDs that come from `/equipment/taxonomy`; the filter source must match the data source.
- ✅ **Q3 (AC-16/18) — Store "city".** Browse card `city` is provided directly by `GET /stores` (derived server-side from `equipment[0].yard.city`); store-detail city comes from `yards[].city`. Render the provided value; show nothing when absent ("when present", per AC-16/18).
- ✅ **Q4 (AC-19) — Trust documents.** The store-detail response intentionally exposes **no document keys/contents** — only `isVerified`. The web renders the three fixed labels (CR, VAT, National Address) with status = verified when `isVerified`, else pending. This satisfies AC-19 ("contents not viewable/downloadable") by construction.
- ✅ **Q5 (AC-20) — Equipment verification tick.** Show the tick only when `verificationStatus === 'VERIFIED'`. (The audit noted a former WIZARD-source gate from shared/004 #149 that was later removed per #197; the current rule is the plain `VERIFIED` check.)
- 🟡 **Q6 (scope) — One epic or split?** `brief.md` notes "home + app shell **and** stores browse may be split into two epics at PR review." Epic tracker #270 is a single tracker covering AC-01–25 → plan treats it as **one epic, one ship PR**. PM (Awab) to confirm if a split is still wanted. Doesn't block tickets.
- 🟡 **Q7 (process) — Board state.** Epic #270 is at **"Drafting"** (not "Implementing") and **unassigned** on project 3 — the spec-PR-merge automation didn't advance/assign it (same as #268). Doesn't block building; flag so the epic is moved to Implementing/UAT correctly (the merge→UAT automation may also need a manual nudge, as #268 did).
- 🟡 **Q8 (process) — Release placement.** Tracked under release #332 (web-app current), alongside 001/002/003. Confirm at ship time.

## Out of scope
Per `brief.md` Non-goals + `dependencies.md` + AC-25:
- Bid & deal tracking on the web (Price-Bids / My-Bids / Jobs; home dashboard counts) — future epic.
- The renter's own requests list / request management — future epic.
- The destination flows themselves (sign-in 001, RFQ 002, onboarding/verification 003) — specced in their own epics; this epic only links to them.
- Notifications, profile editing, rewards, full settings — shown as future in the mock, not specced.
- Supplier-side store management — renters only; browse is read-only discovery.
- A public / signed-out landing — the home is the signed-in hub.
- The mock's supplier rating, completed-deals count, and category tags — not in the data (AC-16); net-new if ever wanted.
- Viewing/downloading trust-document contents — labels + status only (AC-19).
