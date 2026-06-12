# AC Verification — Renter web home & stores browse

**Card:** https://github.com/equiptal/moedatech-specs/issues/270
**Audited:** 2026-06-12
**Branch:** web-app/004-renter-home
**HEAD:** b213c70

## Summary
- Met: 26
- Partial: 0
- Not met: 0
- Out of scope: 0

All 26 ACs are implemented. Frontend follows the prototype's structure with the AC-driven deltas (no dashboard counts, no rating/deals/tags, docs as labels-only, search added). Supplier/store/equipment/taxonomy data is read-only from the shared app backend (`Moedatech-App/apps/backend`); the inclusion + featured rules (AC-14/15) and search semantics (AC-12) are enforced server-side and consumed unchanged.

## Per-AC findings

### AC-01 — Signed-in renter lands on the home inside the app shell
**Verdict:** Met
**Evidence:** `src/app/page.tsx` renders `<AppShell><HomeHub/></AppShell>`; `src/components/AppShell.tsx` provides the sidebar + top bar.

### AC-02 — Shell navigation is Home, Profile, and a Request action
**Verdict:** Met
**Evidence:** `AppShell.tsx:30` `navItems` = Home + Profile only; the Request action is the sidebar button → `/create`. No Requests/Jobs/notifications rendered (AC-25).

### AC-03 — Top bar shows tier, language toggle, and account menu
**Verdict:** Met
**Evidence:** `AppShell.tsx` top bar: tier badge, EN/AR toggle, and the account-menu button (`account_circle`, `:100`) opening a dropdown.

### AC-04 — Home offers a create-request entry
**Verdict:** Met
**Evidence:** `HomeHub.tsx` request banner → `Create request` button (`:47`) routes to `/create`.

### AC-05 — Home shows a limited verified-suppliers preview
**Verdict:** Met
**Evidence:** `HomeHub.tsx:27` fetches `/api/stores?verified=true&limit=6`, renders `StoreCard` grid, with a View-all entry (`:69`).

### AC-06 — Home onboarding nudge is tier-aware
**Verdict:** Met
**Evidence:** `HomeHub.tsx` `TierNudge` (`:99`): `guest` → complete-profile, `basic` → get-verified, `verified` → verified state with no nudge.

### AC-07 — Create a request opens the RFQ flow
**Verdict:** Met
**Evidence:** Create-request → `/create` (`src/app/create/page.tsx` → `CreateSurface`). For a `guest`, `CreateSurface` renders `GuestBlock` (canCreate false) whose CTA → `/onboarding?next=/create` (`GuestBlock.tsx:22`) — the account-creation prompt first (002 AC-02).

### AC-08 — Onboarding entry routes by tier
**Verdict:** Met
**Evidence:** `HomeHub.tsx` `TierNudge.onGo` → `/onboarding` (guest) / `/verify` (basic); `verified` renders state with no action.

### AC-09 — Sign out from the account menu
**Verdict:** Met
**Evidence:** `AppShell.tsx:122` account-menu Sign out → `handleSignOut` (`:24`) → `signOut()` then `/login`.

### AC-10 — View all opens the stores browse
**Verdict:** Met
**Evidence:** `HomeHub.tsx:69` View all → `/browse`; `src/app/browse/page.tsx`.

### AC-11 — Browse filters by city, category, subcategory, and measurement
**Verdict:** Met
**Evidence:** `BrowseSurface.tsx` selects; dependent options `subcategories` = children of category (`:72`), `measurements` = children of subcategory (`:77`); taxonomy from `/api/stores/taxonomy`.

### AC-12 — Free-text search matches store name and equipment make/model
**Verdict:** Met
**Evidence:** `BrowseSurface.tsx` debounced `search` (`:81`) → `/api/stores?search=…`; backend `browseStores` matches store name OR equipment manufacturer/model (audited).

### AC-13 — Verified-only toggle
**Verdict:** Met
**Evidence:** `BrowseSurface.tsx:34` `verifiedOnly` → `verified=true`; `StoreCard.tsx` renders a `New` label when `!isVerified`, else the verified badge.

### AC-14 — Browse inclusion rule
**Verdict:** Met
**Evidence:** Enforced server-side in `browseStores` (visible + active supplier + ≥1 active equipment); the web consumes the result via `/api/stores` (`src/app/api/stores/route.ts`). No web re-implementation needed.

### AC-15 — Featured stores bypass the verified filter
**Verdict:** Met
**Evidence:** Server-side `Store.sortOrder` ordering; pinned stores bypass the `verified` filter in `browseStores`. The web forwards `verified` and renders the returned list.

### AC-16 — Supplier card content
**Verdict:** Met
**Evidence:** `StoreCard.tsx` shows name, logo (when present), verified state, active-equipment count, city (when present). No rating/deals/tags (mapper `mapStoreCard` exposes only those fields — `stores.test.ts` asserts it).

### AC-17 — Empty browse state
**Verdict:** Met
**Evidence:** `BrowseSurface.tsx` renders the empty state when `stores.length === 0`.

### AC-18 — Store detail content
**Verdict:** Met
**Evidence:** `StoreDetailSurface.tsx` banner (name, equipment count, city, view count), description when present; verified badge only when `isVerified` (`:76`); operators tile rendered coming-soon (`:126`).

### AC-19 — Store documents are shown as labels with a verified status
**Verdict:** Met
**Evidence:** `StoreDetailSurface.tsx:114` lists `Commercial Registration`, `VAT`, `National Address`, each with verified/pending status from `detail.isVerified`. No doc keys/contents are exposed by the backend or rendered.

### AC-20 — Equipment listing card
**Verdict:** Met
**Evidence:** `StoreDetailSurface.tsx` `EquipmentTile`: renders present fields (category/subcategory/measurement/make/model/year/fuel); price + unit, or `priceOnRequest` (`:186`) when price is null; verification tick only when `eq.isVerified` (`verificationStatus === 'VERIFIED'`, `:176`). `stores.test.ts` covers price-on-request + tick.

### AC-21 — Signed-out visitor is gated
**Verdict:** Met
**Evidence:** `src/middleware.ts` matcher `/((?!api|_next/...|.*\..*).*)` redirects unauthenticated visitors to `/login?next=…`; covers `/`, `/browse`, `/stores/[id]`, `/create`, `/profile`.

### AC-22 — Available in English and Arabic
**Verdict:** Met
**Evidence:** `en.ts`/`ar.ts` `shell`/`home`/`browse`/`store` blocks (parity asserted in `stores.test.ts`); `LocaleProvider` sets `document.documentElement.dir` (RTL) and persists the selection; new surfaces use logical CSS (no physical left/right).

### AC-23 — Offline / load failure
**Verdict:** Met
**Evidence:** `HomeHub.tsx` (suppliers preview) and `BrowseSurface.tsx` show a clear error with a Retry button on load failure (and `StoreDetailSurface.tsx` likewise), rather than a silent blank.

### AC-24 — Web supplier data mirrors the app (shared, read-only)
**Verdict:** Met
**Evidence:** All surfaces read the shared backend `GET /stores`, `GET /stores/{id}`, `GET /equipment/taxonomy` via `withAuthedBackend` (`src/app/api/stores/*`); the web defines no data. Browse filter taxonomy comes from `/equipment/taxonomy` (the same source the records are tagged with).

### AC-25 — No bid, deal, or activity surfaces on the home
**Verdict:** Met
**Evidence:** `HomeHub.tsx` omits the mock's dashboard counts; `AppShell.tsx` sidebar has no Requests/Jobs and the top bar has no notifications bell.
