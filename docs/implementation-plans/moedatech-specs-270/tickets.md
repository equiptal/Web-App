# Tickets — Renter web home & stores browse

Card: https://github.com/equiptal/moedatech-specs/issues/270
Plan: ./plan.md

Tickets are grouped by scope. Implement in the order listed (top to bottom). Backend = the app repo (`Moedatech-App/apps/backend`), consumed read-only. Frontend = match `rentee-home.html` layout/structure/components; where the prototype diverges from the AC, **the AC wins** (deltas called out per ticket).

## Backend — admin
_No tickets in this scope._ (Admin featured-store control already exists; renters consume it read-only.)

## Backend — mobile
_No tickets in this scope._ (No mobile change; web reads the same records read-only, AC-24.)

## Web BFF (server routes)

### T1 — Stores BFF routes (browse + detail + taxonomy) over the authed app backend  (#36)
**Scope:** web-bff
**ACs:** AC-05, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-19, AC-20, AC-24
**Description:**
Add three server routes using the existing `withAuthedBackend` client (`src/lib/api/app-backend-authed.ts` — forwards the `mt_id` Cognito ID token, refreshes on 401):
- `GET /api/stores` → app backend `GET /stores` (passthrough of `page,limit,search,category,city,measurement,verified`). Map each store to a stable web shape: `{ id, name, logoUrl, isVerified, activeEquipmentCount, city }` (drop banner/createdAt unless needed). The backend already enforces the visibility rule (visible + active supplier + ≥1 active equipment) and featured/pinned ordering (`sortOrder`, pinned bypass `verified`) — the web does **not** re-implement these (AC-14/15 satisfied server-side).
- `GET /api/stores/[id]` → app backend `GET /stores/{storeId}` (with equipment `page,limit` + optional taxonomy filters). Map to `{ store:{ id,name,description,logoUrl,bannerUrl,viewCount,isVerified,supplierName }, city (from yards[0].city), equipment:[…], equipmentTotal }`.
- `GET /api/stores/taxonomy` → app backend `GET /equipment/taxonomy` (the category→subcategory→measurement tree for browse filters; the IDs must match `/stores` filter params — do NOT reuse `/api/taxonomy`, which is the agents service).
Add `src/lib/contract/stores.ts` with the mapper types (`StoreCard`, `StoreDetail`, `EquipmentCard`, `TaxonomyNode`) + pure map functions. Errors map via `appAuthErrorResponse`.

**Given/When/Then:**
- Given a signed-in renter / When the web calls `GET /api/stores?verified=true` / Then it forwards the ID token and returns the mapped verified-supplier cards (id, name, logoUrl, isVerified, activeEquipmentCount, city).
- Given a store id / When the web calls `GET /api/stores/{id}` / Then it returns the mapped store detail + embedded equipment, and the backend increments the store's view count.
- Given the browse filters / When the web calls `GET /api/stores/taxonomy` / Then it returns the category→subcategory→measurement tree from the app backend's `/equipment/taxonomy`.

## Web frontend

### T2 — App shell: sidebar + top bar with account menu (tier, language, sign-out)  (#37)
**Scope:** web-frontend
**ACs:** AC-01, AC-02, AC-03, AC-09, AC-25
**Description:**
Restructure `src/components/AppShell.tsx` to the prototype's shell: a left **sidebar** with exactly **Home, Profile, and a Request action** (drop the mock's Requests/Jobs — AC-02/25) and a **top bar** with the page title, the renter's **tier** badge (`guest`/`basic`/`verified`), the **EN/AR language toggle**, and an **account menu** that contains **Sign out** (move the current inline sign-out into the menu; sign-out calls the 001 `signOut()` → `/login`). No notifications bell, no bid/deal counts anywhere (AC-25). Keep the Moedatech logo as the brand mark.

**Given/When/Then:**
- Given a signed-in renter opens the web app / When the shell renders / Then a sidebar (Home, Profile, Request) and a top bar are shown, with no Requests/Jobs/notifications surfaces.
- Given the top bar / When it renders / Then it shows the current tier, an EN/AR toggle, and an account menu.
- Given the account menu is open / When the renter chooses Sign out / Then the web session ends and they return to sign-in.

### T3 — Home hub (create-request entry, suppliers preview, tier-aware nudge)  (#38)
**Scope:** web-frontend
**ACs:** AC-04, AC-05, AC-06, AC-07, AC-08, AC-10, AC-25
**Description:**
Replace the `/` content (currently the RFQ `CreateSurface`) with a `HomeHub` surface matching the prototype's `view-home`, minus the AC-excluded parts:
- **Request banner** ("Order your next equipment") with a primary **Create request** entry → opens the RFQ flow (002); a `guest` is taken through the account-creation prompt first (002 AC-02). (AC-04/07)
- **Verified-suppliers preview** — a limited set of store cards (reuse the T4 card) from `GET /api/stores?verified=true&limit=N` with a **View all** entry → `/browse`. (AC-05/10)
- **Tier-aware onboarding nudge**: `guest` → complete-profile nudge (→ `/onboarding`), `basic` → get-verified nudge (→ `/verify`), `verified` → verified state, no nudge. (AC-06/08)
- **Drop** the mock's dashboard counts (Your Requests / Price Bids / Completed Deals) entirely (AC-25). The RFQ `CreateSurface` becomes a destination opened via the Request action, not the home body.

**Given/When/Then:**
- Given the renter is on the home / When it renders / Then a create-request entry and a limited verified-suppliers preview with View-all are shown, and no bid/deal counts.
- Given a `guest`/`basic`/`verified` renter / When the home renders / Then they see a complete-profile nudge / get-verified nudge / verified state respectively.
- Given the renter selects create-request / When followed / Then the RFQ flow opens (a `guest` hits the account-creation prompt first).
- Given the renter selects View all / When followed / Then `/browse` opens.

### T4 — Stores browse surface (`/browse`): filters, search, cards, empty + error states  (#39)
**Scope:** web-frontend
**ACs:** AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-23
**Description:**
New gated route `/browse` matching the prototype's filter bar + stores grid:
- **Filter bar**: City (from `/api/master-data/cities`), dependent **Category → Subcategory → Measurement** (from `/api/stores/taxonomy`; subcategory options = children of the chosen category, measurement = children of the chosen subcategory — AC-11), a **Verified-only** toggle (AC-13), and a **free-text search** input (AC-12 — add even though the mock omits it). Applying any filter/search re-queries `GET /api/stores` and updates the list.
- **Supplier cards**: store name, logo (when present), verified badge **or `New`** label when unverified (AC-13), active-equipment count, city (when present). **No rating, completed-deals, or category tags** (AC-16). Featured/unverified handling is server-side (AC-14/15) — the web just renders what `/api/stores` returns.
- **Empty state** when nothing matches (AC-17); **loading + error-with-retry** on load failure (AC-23).

**Given/When/Then:**
- Given the browse / When a city/category/subcategory/measurement filter is applied / Then the list updates, with subcategory/measurement options scoped to the parent selection.
- Given a search term / When entered / Then the list matches store name and equipment make/model.
- Given verified-only off then on / Then unverified (`New`) suppliers show then hide; featured pinned stores remain.
- Given no match / Then an empty state is shown. Given a load failure / Then a clear error with retry is shown.

### T5 — Store detail surface (`/stores/[id]`): info, trust docs, equipment listing  (#40)
**Scope:** web-frontend
**ACs:** AC-18, AC-19, AC-20, AC-23, AC-24
**Description:**
New gated route `/stores/[id]` matching the prototype's `view-store`:
- **Banner**: logo, store name, **verified badge only when `isVerified`** (AC-18); back/share controls.
- **Meta**: active-equipment count, city, view count (AC-18). **Description** when present.
- **Trust documents** (AC-19): the three labels **Commercial Registration**, **VAT**, **National Address**, each with a **verified/pending** status derived from the supplier's `isVerified` (verified → verified, else pending). Contents are never shown/downloadable. **Operators** section rendered as **coming-soon** (AC-18).
- **Equipment cards** (AC-20): show whichever of category, subcategory, measurement, make (`manufacturer`), model (`modelName`), year, fuel (`fuelType`) are present; **price per day** from `price`+`priceUnit`, or **price-on-request** when `price` is null; **verification tick only when `verificationStatus === 'VERIFIED'`**.
- Loading + error-with-retry (AC-23). Data mirrors the app by construction (same endpoint, AC-24).

**Given/When/Then:**
- Given a store is opened / When the detail renders / Then name, city, active-equipment count, view count, and (when present) description are shown; verified badge only when verified; operators shown as coming-soon.
- Given the documents area / Then CR, VAT, and National Address labels are listed with a verified/pending status and no viewable contents.
- Given an equipment listing / Then present fields render, price-per-day or price-on-request shows, and a verification tick appears only when that equipment is verified.

### T6 — Gating for the new routes  (#41)
**Scope:** web-frontend
**ACs:** AC-21
**Description:**
Confirm/extend `src/middleware.ts` so `/`, `/browse`, and `/stores/*` redirect an unauthenticated visitor to `/login?next=…` (the existing matcher already covers non-API, non-asset routes — verify `/browse` and `/stores/[id]` are gated; add coverage if any gap).

**Given/When/Then:**
- Given a visitor with no valid session / When they open any home, browse, or store URL / Then they are redirected to sign-in.

### T7 — EN/AR strings + RTL for home, browse, and store surfaces  (#42)
**Scope:** web-frontend
**ACs:** AC-22
**Description:**
Add `home`/`browse`/`store` blocks to `src/lib/i18n/en.ts` + `ar.ts` (Dictionary parity), covering all new copy (nav labels, nudges, filter labels, card/detail labels, document labels, empty/error/retry, coming-soon). Direction follows the existing `dir` machinery; the EN/AR selection persists across the shell and all views.

**Given/When/Then:**
- Given the renter's language is English or Arabic / When they use the home/browse/store surfaces / Then content is shown in that language, the selection persists across the shell and views, and Arabic renders right-to-left.

### T8 — Unit tests for the BFF mappers and surface logic  (#43)
**Scope:** web-frontend
**ACs:** AC-05, AC-11, AC-13, AC-16, AC-18, AC-19, AC-20, AC-22, AC-24
**Description:**
Vitest unit tests: (a) `stores` mappers — store-card map (fields incl. `New` vs verified), store-detail map (city from yards, viewCount, isVerified→doc status), equipment map (price vs price-on-request, verification tick rule), taxonomy tree → dependent options; (b) en/ar dictionary parity for the new blocks. Mock fetch/next-headers/env as in the existing `app-authed.test.ts`/`onboarding.test.ts`.

**Given/When/Then:**
- Given a backend store payload / When mapped / Then the web card exposes name/logo/verified/count/city and no rating/deals/tags.
- Given an equipment with no price / Then the map yields price-on-request; given `verificationStatus !== 'VERIFIED'` / Then no tick.
- Given the en and ar dictionaries / Then the new home/browse/store keys match.

## API integration
Covered by T1 — read-only consumer of the app backend via the 003 authed client; no contract changes. Browse-filter taxonomy uses `/equipment/taxonomy` (app backend), distinct from the agents `/api/taxonomy`.
