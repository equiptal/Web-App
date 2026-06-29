# Integration test ticket — Requests & Bids redesign

Tests the **wiring**, not the pixels: web UI → BFF proxy routes (`src/app/api/*`) → backend, auth forwarding, response→UI mapping, round-trips, and error/empty/loading states.

**Env:** staging (web `dgdtg4fmrwwfn`) signed in as a renter. **Tools:** browser DevTools → Network tab.
Status: ⬜ not tested · ✅ pass · ❌ fail · 🚧 blocked.

> **The flow spans BOTH backends** (verified in the route handlers):
>
> | BFF route | Backend | Auth | Upstream path |
> |---|---|---|---|
> | `GET /api/me/requests` · `…/{id}/bids` | **app-backend** | renter token (`withAuthedBackend`) | `/marketplace/requests…/bids` |
> | `POST /api/me/deal-rooms` | **app-backend** | renter token | `/api/deal-rooms` |
> | `GET /api/equipment/{id}` | **app-backend** | renter token | `/equipment/{id}` |
> | `GET /api/me` | **app-backend** | renter token | `/users/me` (+ profile-status) |
> | `GET /api/me/requests/{id}/submissions` | **agents** (`apps/backend-agents`) | service token + `?userId=` owner guard | `/agents/requests/{id}/bid-submissions` |
> | `PUT /api/me/requests/{id}/share-link` | **agents** | service token + `?userId=` | `/agents/requests/{id}/share-link` |
>
> So the **off-platform / shared-link** feature (submissions + share-link deadline/logo) is an **agents-backend** integration with a service token, *not* the renter auth token. `bidShareUrl` is pure client-side (no request).

---

## 1. Auth & proxy plumbing
- **INT-1** **app-backend token forwarding** — load `/requests`; the app-backend calls (`/bids`, `/deal-rooms`, `/equipment`, `/me`) carry the renter's auth (`withAuthedBackend`) and return 200. _Expected:_ no 401s while signed in.
- **INT-1b** **agents service-token + owner guard** — the `submissions` and `share-link` calls go to the **agents** backend with a service token and `?userId={renterId}`. _Expected:_ 200 with the renter's data; if agents env is unset the route returns **503 `not_configured`** (handled gracefully, count stays 0).
- **INT-2** **Unauthenticated guard** — hit `/requests` signed out. _Expected:_ middleware redirects to `/login`; the public `/bid/{token}` page is exempt (loads without auth).
- **INT-3** **Error envelope** — force a backend failure (offline, or a bad id). _Expected:_ UI shows the friendly state ("Couldn't load…"), not a crash/white screen; bilingual message.

## 2. Requests list
- **INT-4** `GET /api/me/requests` — open `/requests`. _Expected:_ one network call; groups render as RFQ tabs; `requestGroupId` clustering correct; counts/locations match the data.
- **INT-5** **Submissions fan-out** — on load, for each broadcast group a `GET /api/me/requests/{groupId}/submissions` fires (best-effort). _Expected:_ a failure on one group leaves its count at 0 without breaking the page.

## 3. Bids — per-item fan-out & fulfillment  _(core of the redesign)_
- **INT-6** **Per-item bids** — open a request; in Network see a `GET /api/me/requests/{itemId}/bids` **per item** in the group. _Expected:_ each returns that item's bids.
- **INT-7** **`units_offered` present** — inspect a bid response. _Expected:_ `units_offered` is an array; the card's ×N badge and "Covers X of Y" use its `.length`. If absent → contributes 0 (no crash).
- **INT-8** **Fulfillment maths end-to-end** — for one item: `filled = min(Σ bids.units_offered + Σ off-platform covered units, units needed)`. _Expected:_ the header tile, item-card bar, and "X/Y" all show this same capped number.
- **INT-9** **Response → card mapping** — pick a bid. _Expected:_ price/priceUnit, mob/demob (+lead time), terms (equipment/contract/supplier), certs, compliance (CR/VAT/national address), equipment{make,model,year}, distanceKm, rating, verified, status, dealRoomId all land in the card/modal correctly.
- **INT-10** **Item switch refetch** — change the item picker / open a different item's bids. _Expected:_ list reflects the selected item; no stale bids from the previous item; subtitle item name matches.

## 4. Off-platform (shared-link) round-trip  _(agents backend)_
- **INT-11** `GET …/submissions` mapping — open a group with shared-link bids. _Expected:_ off-platform card renders from the submission (banner, certs the supplier ticked, CR/VAT presence, quotedTotal, agoDays); header opened/submitted/closes come from the **same** payload.
- **INT-12** **Full round-trip** — submit a bid through the public `/bid/{token}` form, then reload `/requests`. _Expected:_ the new submission appears as an off-platform card **and** its covered units raise that item's fulfillment.
- **INT-13** **View submission viewer** — click "View bid submission". _Expected:_ the read-only modal shows the real submitted answers for that submission id.

## 5. Equipment detail
- **INT-14** `GET /api/equipment/{id}` — click **Details ›** on a card. _Expected:_ one call; modal fills category/manufacturer/model/year/fuel/measurement/isVerified/photos; distance & rate come from the bid (not the equipment call).
- **INT-15** **Missing equipment** — a bid with no `equipment.id` or a 404. _Expected:_ Details hidden or modal degrades gracefully (no crash).

## 6. Deal room
- **INT-16** **Create/open** — click **Start negotiation** → `POST /api/me/deal-rooms {bidId}`. _Expected:_ returns `{id}`; app navigates to `/deal-room/{id}`.
- **INT-17** **Existing room short-circuit** — a bid that already has `dealRoomId`. _Expected:_ navigates straight to it (no duplicate POST).

## 7. Share link  _(agents backend, service token)_
- **INT-18** **Persist deadline** — Edit → set a deadline → `PUT …/share-link {deadline}`. _Expected:_ 200; reopening shows the saved deadline; the header "Closes" stat reflects it.
- **INT-19** **Persist logo** — set/clear logo → `PUT …/share-link {logoUrl}`. _Expected:_ persists; the public `/bid/{token}` form shows the logo.
- **INT-20** **Share URL build** — Copy/Share. _Expected:_ `bidShareUrl` yields `…/bid/{name-slug}-{uuid}`; opening it loads the public form (token = trailing UUID); no auth gate.

## 8. Identity & gating
- **INT-21** `GET /api/me` — _Expected:_ returns firstName/lastName/companyName/tier; drives the top-bar greeting, the quotation issuer name, and the verify gate (unverified → gate before Download quotations).

## 9. Quotations (client-side)
- **INT-22** **No backend call** — Download quotations. _Expected:_ the PDF is generated **client-side** from already-loaded bid data (no extra network request); numbers match the cards.

---

## Backend dependency notes (for the backend reviewer)
- Source of truth for `units_offered` is `apps/backend` Bid model (`units_offered Json @map`). Confirm it's populated on real supplier bids — fulfillment silently reads 0 if null.
- No contract/endpoint changes were made this session; this ticket is a **regression/contract check** that the existing app-backend responses still carry every field the redesigned UI consumes (§3 INT-9).
- If any field is missing/renamed backend-side, it surfaces as a blank/zero in the card — capture it here as a ❌ with the route + payload.
