# Implementation Plan — Renter web sign-in (phone + OTP)

**Card:** https://github.com/equiptal/moedatech-specs/issues/235
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/001-authentication/
**Card id:** moedatech-specs-235
**Generated:** 2026-06-11

## Summary
We're adding the first authentication surface to the renter web app (`moedatech-renter-web`, Next.js 15 / React 19 / Tailwind 4). A renter signs in with a phone number (`+966` preset) and a 4‑digit SMS one‑time code, reusing the mobile app's identity — one account across web + mobile, with the existing tier (`guest` / `basic` / `verified`) carried over unchanged and never mutated by web sign‑in. Unknown numbers are admitted as new `guest` accounts (same login feature as the app, no separate sign‑up). The whole web app becomes **gated**: an unauthenticated visitor is redirected to the sign‑in screen and returned to their originally requested page after signing in; a valid session bypasses sign‑in; sign‑out ends the session. Screens are bilingual EN/AR with RTL, defaulting to browser locale. This epic **replaces the auth bypass** that `web-app/002-rfq-creation` left in `src/lib/session/index.tsx` (its own comment: *"Replace this with the real web-app/001 session when it lands"*) and is the prerequisite gate in front of 002's RFQ content (per `dependencies.md` Sequencing).

**Implementation directive (Yara, 2026-06-11):** the web uses the **exact same auth the mobile app uses** — the real `/auth/*` endpoints on the Moedatech-App backend (`equiptal/Moedatech-App/apps/backend`). No new auth mechanism and **no mock auth engine** is invented: the web is a thin BFF client over the same Cognito-backed phone+OTP flow the Flutter app already calls.

## Acceptance criteria covered
- **AC-01** — Sign-in screen prompts for a phone number: Given a visitor is on the web sign-in screen and not signed in / When the screen renders / Then a phone-number entry is shown with `+966` preset as the country code / And a control to request a code is available
- **AC-02** — Valid phone submission advances to the code-entry screen: Given a visitor on the sign-in screen (per AC-01) / When they enter a phone number and request a code / Then a code-entry screen for a 4-digit code is shown / And the screen indicates the code was sent by SMS to the entered number
- **AC-03** — Correct code signs the renter into their existing account: Given a renter who already has an account on the mobile app / And they have requested a code on the web (per AC-02) / When they enter the correct 4-digit code / Then they are signed in / And they reach the same account they use on the mobile app (one identity across both surfaces)
- **AC-04** — Account tier carries over from mobile unchanged: Given a renter whose mobile account tier is `guest`, `basic`, or `verified` / When they sign in on the web (per AC-03) / Then the tier shown to the renter on the web matches their mobile account tier
- **AC-05** — Web sign-in never changes the renter's tier: Given a renter with a known tier (per AC-04) / When they sign in on the web / Then their tier is unchanged by the web sign-in (no promotion or demotion as a result of signing in)
- **AC-06** — Unrecognized phone number is admitted as a guest: Given a phone number with no existing account / When that number completes phone + correct code on the web (per AC-03) / Then the visitor is admitted as a new `guest`-tier account / And no separate sign-up step is required
- **AC-07** — Deep-link return after sign-in: Given a signed-out renter was redirected to sign-in from a specific gated page (per AC-16) / When they complete sign-in (per AC-03) / Then they are returned to the page they originally requested
- **AC-08** — Direct sign-in lands on the web home: Given a renter who opened the sign-in screen directly, with no prior gated destination / When they complete sign-in (per AC-03) / Then they land on the web app home
- **AC-09** — Incorrect code shows an inline error and allows re-entry: Given a renter on the code-entry screen (per AC-02) / And fewer than 5 incorrect attempts have been made on the current code / When they enter an incorrect code / Then an inline error is shown / And they can re-enter the code
- **AC-10** — Fifth incorrect attempt locks the code: Given a renter has entered an incorrect code 4 times on the current code (per AC-09) / When they enter an incorrect code a 5th time / Then the current code is locked / And they must request a new code to continue
- **AC-11** — Expired code is rejected and prompts a new code: Given a renter requested a code more than 5 minutes ago and has not used it / When they enter that code / Then it is rejected as expired / And they are prompted to request a new code
- **AC-12** — Code can be resent immediately with no cooldown: Given a renter on the code-entry screen (per AC-02) / When they request the code to be resent / Then a new code is sent immediately / And no waiting period is required between resend requests
- **AC-13** — Editing the phone number from the code screen: Given a renter on the code-entry screen (per AC-02) / When they choose to go back / Then they return to the phone-number entry / And they can submit a corrected number (per AC-02)
- **AC-14** — No auth rate limit beyond the 5-attempt lockout: Given a renter requesting or verifying codes / When they make repeated code requests or verification attempts / Then they are bounded only by the 5-attempt lockout per code (per AC-10) / And no additional per-request or per-phone throttle blocks them before that lockout
- **AC-15** — SMS send failure is surfaced, not silent: Given a renter has requested a code / When the SMS cannot be sent / Then the failure is communicated to the renter / And the renter can request the code again
- **AC-16** — Gated access redirects an unauthenticated visitor to sign-in: Given a visitor with no valid session, or whose session has ended / When they open any gated web URL / Then they are redirected to the sign-in screen / And the gated content is not shown until they sign in
- **AC-17** — Valid session bypasses sign-in: Given a renter with a valid session / When they open a gated web URL, including the sign-in URL itself / Then they reach the requested content without entering a phone number or code
- **AC-18** — Session persists until sign-out or 30 days: Given a signed-in renter who has not signed out / When fewer than 30 days have passed since they signed in / Then reopening the web app does not require them to sign in again / And once 30 days have passed, the next visit requires a phone number and code again
- **AC-19** — Sign out ends the session: Given a signed-in renter / When they sign out / Then their web session ends / And they are returned to the sign-in screen
- **AC-20** — Gated pages require sign-in after sign-out: Given a renter has signed out (per AC-19) / When they open any gated web URL / Then they are redirected to the sign-in screen (per AC-16)
- **AC-21** — Sign-in screens default to the browser locale: Given a visitor whose browser locale is `en` or `ar` / When the sign-in screen renders / Then it is shown in that language / And Arabic renders right-to-left
- **AC-22** — Language toggle switches content and direction: Given a visitor on any sign-in screen / When they switch the language toggle between `en` and `ar` / Then the sign-in content switches to the selected language / And the page direction switches accordingly (LTR for `en`, RTL for `ar`)
- **AC-23** — Language selection persists across sign-in screens: Given a visitor selected a language on the phone-entry screen (per AC-22) / When they advance to the code-entry screen / Then the selected language is retained
- **AC-24** — Offline / no connectivity surfaces a clear error: Given a renter performing a sign-in action that needs the network (requesting or verifying a code) / And the device has no connectivity / When they attempt the action / Then a clear error is shown / And the action does not fail silently

## Architecture overview
The work is **all renter-web (frontend + Next.js BFF route handlers)** — no admin or mobile surface (`dependencies.md` Cross-product impact: both `None`). The web is a **thin BFF over the real backend `/auth/*` endpoints** (the same Cognito-backed flow the mobile app uses). Four moving parts:

1. **Auth BFF route handlers** (`src/app/api/auth/*`) — server-side proxies to the backend, so the Cognito tokens are set as **httpOnly cookies** and never live in client JS:
   - `POST /api/auth/request-code` → backend `POST /auth/login` (unified login: auto-registers new numbers, sends OTP). Web passes `role: "rentee"`.
   - `POST /api/auth/verify` → backend `POST /auth/verify-otp` → on success, set httpOnly cookies (access/refresh/id tokens) and return the safe `user` (incl. `tier`).
   - `POST /api/auth/resend` → backend `POST /auth/resend-otp` (AC-12).
   - `POST /api/auth/signout` → backend `POST /auth/logout` (revoke refresh token) + clear cookies (AC-19).
   - `GET /api/auth/session` → if the access-token cookie is valid return `{ user }`; if expired, call backend `POST /auth/refresh` with the refresh-token cookie to mint a new access token (within the 30-day window) and re-set cookies; if refresh fails/expired return `null`.

   These call a small **server-only backend client** (new `src/lib/api/app-backend.ts`, mirroring `agents-backend.ts`) against `APP_API_URL`, sending `X-Tenant-Id` (from `TENANT_ID`, default `"default"`) and `Accept-Language`. The real/mock switch is dropped for auth — there is **no mock auth engine** (per the directive); local dev points at the dev backend (which exposes `GET /dev/otp` for the code).
2. **Real session** (`src/lib/session/index.tsx`) — replace the bypassed tier-only context with a session exposing `{ status, user: { id, phone, tier } | null, signIn, signOut }`, hydrated from `GET /api/auth/session`. `RenterTier` and `canCreate` are preserved so 002's guest-block keeps working; **tier comes straight from the verify-otp response** (`user.tier`), not the demo toggle (which is removed/neutralised).
3. **Gating** — a Next.js `middleware.ts` reading the session cookie redirects unauthenticated requests to `/login?next=<path>` and lets valid sessions through (including the `/login` URL itself → home). The current single page (`src/app/page.tsx`, the 002 RFQ surface) becomes the gated content; a new `/login` route hosts the sign-in screens.
4. **Sign-in screens + i18n** — phone-entry and 4-digit code-entry screens built to the prototype (`rentee-login.html`), bilingual EN/AR with RTL. Reuse the mature `LocaleProvider`; add **browser-locale default** (AC-21) and **enable RTL for the auth screens** (AC-22 — currently `RTL_ENABLED=false`).

Data flow: screen → `fetch('/api/auth/request-code')` → BFF → backend `/auth/login` → screen shows code entry → `fetch('/api/auth/verify')` → BFF → backend `/auth/verify-otp` → BFF sets httpOnly token cookies + returns `{ user }` → client navigates to `next` or home. Session reads/refreshes happen server-side so the access token (1h) is refreshed within the refresh token's 30-day window (AC-18); see Q4.

## Backend — admin
_N/A — no admin-panel surface (dependencies.md Cross-product impact: Admin = None)._

## Backend — mobile
_N/A — no mobile surface; the mobile app's sign-in, identity model and tiers are untouched (dependencies.md Cross-product impact: Mobile = None). The web authenticates against the same shared identity but changes nothing a mobile user observes._

## API integration
New BFF route handlers under `src/app/api/auth/`, each a thin proxy to the backend (`equiptal/Moedatech-App/apps/backend`, contract in `apps/backend/docs/auth.md` + the `handlers/auth/*` source). Backend headers: `Content-Type: application/json`, `X-Tenant-Id` (default), `Accept-Language` (`en`/`ar`).

| Web route | Backend endpoint | Request | Response (success) | AC |
|---|---|---|---|---|
| `POST /api/auth/request-code` | `POST /auth/login` | `{ phone, countryCode:"+966", otpMethod:"SMS", role:"rentee" }` | `{ success, userId, isNewUser, expiresAt }` | AC-01/02/06/15 |
| `POST /api/auth/verify` | `POST /auth/verify-otp` | `{ phone, code }` | `{ user{ id, phone, tier, language, activeRole, verifiedAt, isNewUser, hasCompletedOnboarding }, accessToken, idToken, refreshToken, expiresIn:3600 }` | AC-03/04/05/06/09/10/11 |
| `POST /api/auth/resend` | `POST /auth/resend-otp` | `{ phone, countryCode:"+966", otpMethod:"SMS" }` | `{ success, expiresAt }` | AC-12 |
| `POST /api/auth/signout` | `POST /auth/logout` | `{ refreshToken }` (read from cookie) | `{ success }` + cookies cleared | AC-19/20 |
| `GET /api/auth/session` | `POST /auth/refresh` (only if access token expired) | `{ refreshToken }` (from cookie) | `{ user } \| null` | AC-16/17/18 |

`POST /auth/refresh` → `{ accessToken, idToken, expiresIn:3600 }` mints a fresh access token from the refresh-token cookie server-side (the mobile app does the same via a proactive token-refresh manager). The web refreshes lazily on session read — no Cognito SDK in the web.

`POST /auth/login` is **`authService.unifiedLogin`** — auto-registers an unknown number and sends the OTP in one call (so AC-06 needs no separate sign-up/register). `POST /auth/verify-otp` returns **`user.tier`** computed by `profileService.getUserTier` — the web *reflects* it (AC-04) and never sets it (AC-05).

**Backend error-code → AC mapping** (codes from `auth.md`): `E6000` invalid OTP → inline error + re-entry (AC-09); `E6002` max attempts exceeded → code locked, request new (AC-10); `E6001` expired → prompt new code (AC-11); `E6003` failed to send → surfaced, can resend (AC-15); `E3004` invalid phone format (AC-01). The BFF maps these to a typed `AuthError` kind; `fetch` rejection = offline (AC-24), surfaced not silent. **AC-14:** the backend bounds attempts only by the 5-attempt lockout (E6002) — the web adds no extra throttle.

**Submission user id (AC-03 / 002 handoff):** the verify response's `user.id` is the real backend user id. It replaces `AGENTS_TEST_USER_ID` as the `create_request` `userId` in `/api/requests` — read from the session/cookie instead of the env stand-in (see Q6).

**Dev/testing affordance:** the backend exposes `GET /dev/otp?phone=` (never in prod) returning the active code — used by manual UAT and integration tests to fetch the OTP without a real SMS.

## Data model / migrations
None on the web (it's a client of the shared Cognito identity). No DB, no migrations. State introduced — **httpOnly cookies** set by the verify handler:
- `accessToken` (Cognito JWT, ~1h / `expiresIn:3600`) — the active-session token.
- `refreshToken` (Cognito, ~30 days) — the "remembered" envelope; cookie `Max-Age` ≈ 30 days drives AC-18.
- `idToken` (optional, identity claims).

All `httpOnly`, `Secure`, `SameSite=Lax`. No client-readable token. No mock OTP state (no mock auth engine).

## Risks & dependencies
From `dependencies.md` + the resolved contract:
- **Reuses the mobile app's exact phone + SMS-OTP login** (AC-01/02/03) — same backend `/auth/*`, Cognito-backed; SMS delivery is the existing app capability, reused not provisioned. **Contract is now known** (`apps/backend/docs/auth.md` + handlers).
- **Single shared identity + tiers** (AC-03/04/05/06) — verify-otp returns the shared user + `tier`; the web reads, never creates a parallel identity or mutates tier.
- **EN+AR localization infra** (AC-21/22/23) — exists; we extend it (browser default + RTL on auth).
- **A gated web surface to sign into** (AC-08/16/17/20) — that surface is 002's RFQ content; 001 is its gate. **Sequencing: 001 must ship before/with 002** or 002's content is unreachable. Both ride the same `staging` integration branch.
- **Connectivity detection** (AC-24) — browser `fetch` failure is the signal; no new infra.
- **Token refresh** — backend exposes `POST /auth/refresh` (confirmed in `handlers/auth/refreshToken.ts` + route list), so the web refreshes server-side with no Cognito SDK. The 30-day refresh-token cookie is the AC-18 envelope (Q4 resolved).
- **Backend base URL/env not yet wired** in this repo (only `agentsApiUrl`/`mansourUrl` exist); auth needs `APP_API_URL` (→ **staging** `https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com`) + `TENANT_ID` (default `default`) (see Q5). Both net-new here; values known — neither blocks tickets.

## Open questions
- ✅ **Q1 — Real wiring vs mock (RESOLVED).** Per Yara's directive (2026-06-11), the web wires to the **real backend `/auth/*` endpoints, exactly as the mobile app does** — no mock auth engine. Ticket scope is the BFF proxy + session + gating against the real contract.
- ✅ **Q2 — OTP endpoint contract (RESOLVED by repo audit).** Documented in `equiptal/Moedatech-App/apps/backend/docs/auth.md` and the `handlers/auth/*` source: `login` (unified, auto-registers → AC-06), `verify-otp` (returns `user.tier` + Cognito tokens → AC-03/04/05), `resend-otp` (AC-12), `logout` (AC-19), `dev/otp` (testing). Error codes E6000/E6001/E6002/E6003/E3004 map to AC-09/10/11/15/01. Embedded in API integration above.
- ✅ **Q3 (AC-21/22) — RTL (RESOLVED, Yara 2026-06-11: "enable it").** Enable RTL for Arabic on the sign-in screens — build the auth layout RTL-capable and turn it on (`dir="rtl"` for `ar`). To avoid silently changing 002's deliberately-gated shell, RTL is turned on for the `/login` route specifically; the global `RTL_ENABLED` flip across the 002 shell remains a separate STANDARDS call.
- ✅ **Q4 (AC-17/18) — Token refresh (RESOLVED by repo audit).** The backend **does** expose `POST /auth/refresh` (`handlers/auth/refreshToken.ts` + route list `POST /AUTH/REFRESH`) → `{ accessToken, idToken, expiresIn }`. The web BFF refreshes the 1h access token server-side from the refresh-token cookie on session read — no Cognito SDK in the web. The 30-day refresh-token cookie is the AC-18 envelope. (`auth.md`'s "no HTTP endpoint" note was stale.)
- ✅ **Q5 (all real-path ACs) — Backend base URL + tenant env (RESOLVED).** Confirmed by repo audit: auth routes are `/auth/*` on the **main backend** (`/agents/*` is not in this backend's route list — a distinct base from `AGENTS_API_URL`). Work: add **`APP_API_URL`** + a tenant var to `serverEnv`.
  - **Tenant:** reuse the backend's existing var name **`TENANT_ID`** (not a new `APP_TENANT_ID`, to avoid name drift), defaulting to `"default"`. Tenant is `"default"` everywhere today — backend `tenant.config.ts` (`env.TENANT_ID || 'default'`), agents `createRequest.ts` (`process.env.TENANT_ID || 'default'`), and mobile hardcodes `'default'` (`app_constants.dart`). The `X-Tenant-Id` header is a multi-tenancy hook nothing sets to a non-default value, so this needs **no ops input**.
  - **Base URL — decided: STAGING** (Yara, 2026-06-11). `APP_API_URL = https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com` (the mobile app's `_stagingBaseUrl` in `app_constants.dart`); the web calls `<APP_API_URL>/auth/*`. (For reference: dev = `ee4b7vsl36…`, prod = `g0a44yhbki…`.) Value is set via env so it can be swapped per deploy without a code change.
  - **No residual** — environment chosen (staging), value known. Q5 fully resolved.
- ✅ **Q6 (AC-03 / 002 handoff) — Signed-in user id → submissions (RESOLVED).** Verify-otp returns the real `user.id`; it replaces `AGENTS_TEST_USER_ID` as the `create_request` `userId`, read from the session. In scope as far as the session exposing `user.id` and `/api/requests` reading it.
- ✅ **Q7 (AC-04/05) — `tier` strings (RESOLVED by repo audit).** `profileService.getUserTier` returns exactly `guest` | `basic` | `verified`: `verified` ⇐ `supplierStatus===2`; `basic` ⇐ `firstName && lastName && city && jobTitle`; else `guest`. Matches the web's `RenterTier` 1:1 — the web reads `user.tier` from verify-otp and normalises defensively at the BFF boundary.

## Out of scope
Per `brief.md` Non-goals and `dependencies.md`:
- Profile completion (guest → basic) on the web — later epic.
- Changing/managing the admin-verified tier from the web (beyond reflecting it) — later epic.
- Creating/viewing/managing requests or RFQ documents on the web — that's 002 and later epics; 001 only gates them.
- A new web-specific consent / T&C gate — web sign-in matches the app; no new consent.
- Supplier authentication on the web — renters only.
- Email/password or social login — phone + OTP only.
- Provisioning SMS delivery — reused existing app capability, not built here.
