# Tickets — Renter web sign-in (phone + OTP)

Card: https://github.com/equiptal/moedatech-specs/issues/235
Plan: ./plan.md

Tickets are grouped by scope. Implement in the order listed (top to bottom). All ride the single epic branch `web-app/001-authentication` and ship in one PR into `staging`.

**Cross-cutting config (T1):** `APP_API_URL = https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com` (staging), `TENANT_ID = default`. The web calls `<APP_API_URL>/auth/*`, the same backend the mobile app uses.

---

## Backend — admin

_No tickets in this scope._ (No admin-panel surface — dependencies.md Cross-product impact: Admin = None.)

## Backend — mobile

_No tickets in this scope._ (Mobile app untouched — dependencies.md Cross-product impact: Mobile = None. The web authenticates against the same shared identity.)

## API integration

### T1 — Server-only app-backend client + auth env + error-code mapping  (#14)
**Scope:** api-integration
**ACs:** AC-09, AC-10, AC-11, AC-14, AC-15, AC-24
**Description:**
Add `APP_API_URL` and `TENANT_ID` (default `"default"`) to `src/lib/config/env.ts` `serverEnv`. Create `src/lib/api/app-backend.ts` — a server-only fetch client mirroring `agents-backend.ts` (never imported by client components), targeting `<APP_API_URL>/auth/*`, sending headers `Content-Type: application/json`, `X-Tenant-Id: <TENANT_ID>`, `Accept-Language: <locale>`. Define a typed `AuthError` and map the backend error codes from `apps/backend/docs/auth.md`: `E6000`→`invalid_code`, `E6002`→`locked`, `E6001`→`expired`, `E6003`→`send_failed`, `E3004`→`invalid_phone`; a `fetch` rejection →`offline`. No extra client-side throttle is added (AC-14: only the backend's 5-attempt lockout bounds attempts).

**Given/When/Then:**
- Given the app-backend client receives a backend response with error code `E6002`
- When it parses the response
- Then it throws `AuthError` of kind `locked`
- And given a network/`fetch` failure, it throws kind `offline`
- And no per-request/per-phone throttle is applied beyond surfacing the backend's lockout (AC-14)

### T2 — Auth BFF route handlers + httpOnly token cookies  (#15)
**Scope:** api-integration
**ACs:** AC-01, AC-02, AC-03, AC-04, AC-06, AC-09, AC-10, AC-11, AC-12, AC-15, AC-17, AC-18, AC-19, AC-24
**Description:**
Create route handlers under `src/app/api/auth/`:
- `POST /api/auth/request-code` → backend `POST /auth/login` with `{ phone, countryCode:"+966", otpMethod:"SMS", role:"rentee" }` (unified login auto-registers unknown numbers → AC-06). Returns `{ success, isNewUser, expiresAt }` or a typed error.
- `POST /api/auth/verify` → backend `POST /auth/verify-otp` with `{ phone, code }`. On success, set httpOnly+Secure+SameSite=Lax cookies for `accessToken` (~1h), `refreshToken` (~30-day `Max-Age` → AC-18), `idToken`; return the safe `user` incl. `tier`.
- `POST /api/auth/resend` → backend `POST /auth/resend-otp` (AC-12, no cooldown).
- `POST /api/auth/signout` → backend `POST /auth/logout` with the refresh-token cookie; clear all auth cookies (AC-19).
- `GET /api/auth/session` → if the access-token cookie is valid return `{ user }`; if expired, call backend `POST /auth/refresh` with the refresh-token cookie, re-set cookies, return `{ user }`; else return `null`.

**Given/When/Then:**
- Given a visitor submits a valid phone via `/api/auth/request-code` / When the backend accepts it / Then an OTP is sent and the handler returns success (AC-01/02)
- Given a phone with no existing account verifies a correct code / When `/api/auth/verify` calls `/auth/verify-otp` / Then the unified flow admits a new `guest`-tier rentee with no separate sign-up (AC-06)
- Given a correct code / When verified / Then auth cookies are set and the response carries `user` with the mobile account's `tier` unchanged (AC-03/04)
- Given an incorrect/locked/expired/send-failure backend code / When the handler responds / Then it returns the mapped typed error (AC-09/10/11/15)
- Given a valid refresh-token cookie and an expired access token / When `GET /api/auth/session` runs / Then it refreshes via `/auth/refresh` and returns `{ user }` (AC-17/18)
- Given a signed-in renter calls `/api/auth/signout` / Then the backend refresh token is revoked and cookies are cleared (AC-19)

## Web — session & identity

### T3 — Real session context (replace the auth bypass)  (#16)
**Scope:** web-session
**ACs:** AC-03, AC-04, AC-05, AC-19
**Description:**
Replace the bypassed `src/lib/session/index.tsx` (tier defaulted to `basic` + demo toggle) with a real session: `{ status: "loading"|"authed"|"anon", user: { id, phone, tier } | null, signIn(), signOut() }`, hydrated from `GET /api/auth/session`. Preserve the `RenterTier` type and `canCreate` derivation so 002's guest-block keeps working — but `tier` now comes from the verify-otp `user.tier`, never set by the web (AC-05). Normalise the tier string defensively to `guest`/`basic`/`verified`. Remove (or neutralise to dev-only) the demo tier toggle in `src/components/AppShell.tsx`; show the real signed-in tier. `signOut()` calls `/api/auth/signout` and resets to `anon`.

**Given/When/Then:**
- Given a signed-in renter whose mobile tier is `verified` / When the web session hydrates / Then `useSession().user.tier` is `verified` and the header reflects it (AC-04)
- Given any web sign-in / When it completes / Then the web never mutates the tier — it only reflects what verify-otp returned (AC-05)
- Given a renter triggers sign-out / When `signOut()` runs / Then the session becomes `anon` and cookies are cleared (AC-19)
- Given `canCreate` / Then it is true only for `basic`/`verified`, false for `guest` (preserves 002 guest-block)

## Web — gating & routing

### T4 — Gating middleware + `/login` route + post-sign-in return  (#17)
**Scope:** web-gating
**ACs:** AC-07, AC-08, AC-16, AC-17, AC-20
**Description:**
Add `middleware.ts` that reads the session (refresh-token cookie): unauthenticated requests to any gated URL redirect to `/login?next=<original-path>` and the gated content is not rendered (AC-16/20); a valid session passes through, and hitting `/login` while authed redirects to home (AC-17). Add the `/login` route (`src/app/login/`) hosting the sign-in screens (T6/T7). After a successful sign-in, navigate to the `next` param if present (AC-07) or to the web home if absent (AC-08). The existing single page (`src/app/page.tsx`, the 002 RFQ surface) becomes gated content behind the middleware.

**Given/When/Then:**
- Given a visitor with no valid session / When they open a gated URL / Then they are redirected to `/login` and the gated content is not shown (AC-16)
- Given a renter with a valid session / When they open a gated URL or `/login` itself / Then they reach the content without entering phone/code (AC-17)
- Given a renter was redirected to `/login?next=/some/page` / When they complete sign-in / Then they land on `/some/page` (AC-07)
- Given a renter opened `/login` directly / When they complete sign-in / Then they land on the web home (AC-08)
- Given a renter has signed out / When they open any gated URL / Then they are redirected to `/login` (AC-20)

## Web — sign-in UI & i18n

### T5 — i18n: browser-locale default, RTL on auth, persistence  (#18)
**Scope:** web-i18n
**ACs:** AC-21, AC-22, AC-23
**Description:**
Extend the existing `LocaleProvider`: default the initial locale to the **browser locale** when it is `en`/`ar` (AC-21), still overridable by the stored choice. Enable **RTL for Arabic on the sign-in screens** — set `dir="rtl"` for `ar` on the `/login` layout (build RTL-capable; this turns RTL on for auth specifically without flipping the global `RTL_ENABLED` for the 002 shell, which stays a separate STANDARDS call). The toggle already persists via `localStorage`, so the selection carries across the phone- and code-entry screens (AC-23). Add the EN/AR auth-screen dictionary entries used by T6/T7.

**Given/When/Then:**
- Given a visitor whose browser locale is `ar` and no stored choice / When the sign-in screen renders / Then it shows in Arabic, right-to-left (AC-21)
- Given a visitor on a sign-in screen / When they toggle between `en` and `ar` / Then content switches language and direction switches (LTR for `en`, RTL for `ar`) (AC-22)
- Given a visitor selected `ar` on the phone-entry screen / When they advance to the code-entry screen / Then it is still Arabic (AC-23)

### T6 — Phone-entry screen  (#19)
**Scope:** web-signin-ui
**ACs:** AC-01, AC-02, AC-15, AC-24
**Description:**
Build the phone-entry screen to the prototype (`rentee-login.html`), using the Moedatech logo; dev latitude is colours/visual styling only. `+966` preset country code, a phone input, and a "request code" control. On submit, call `/api/auth/request-code`; on success advance to the code-entry screen (T7) indicating an SMS code was sent to the entered number. Surface `send_failed` (AC-15) and `offline` (AC-24) errors clearly, not silently; the renter can retry.

**Given/When/Then:**
- Given a visitor on the sign-in screen, not signed in / When it renders / Then a phone entry with `+966` preset and a request-code control are shown (AC-01)
- Given a visitor enters a phone and requests a code / When the request succeeds / Then the 4-digit code-entry screen is shown, indicating the SMS was sent to that number (AC-02)
- Given the SMS cannot be sent (backend `E6003`) / When the renter requests a code / Then the failure is communicated and they can request again (AC-15)
- Given no connectivity / When they request a code / Then a clear error is shown, not a silent failure (AC-24)

### T7 — Code-entry screen (verify, resend, edit number, error paths)  (#20)
**Scope:** web-signin-ui
**ACs:** AC-02, AC-09, AC-10, AC-11, AC-12, AC-13, AC-15, AC-24
**Description:**
Build the 4-digit code-entry screen to the prototype. On submit, call `/api/auth/verify`; on success the gating layer (T4) routes the renter onward. Handle the typed errors from T1/T2: `invalid_code` → inline error, allow re-entry (AC-09); `locked` (5th wrong attempt) → tell the renter to request a new code (AC-10); `expired` (>5 min) → prompt a new code (AC-11). Provide a "resend code" control calling `/api/auth/resend` with no cooldown (AC-12) — the prototype's 30-second timer is illustrative only; the AC wins (no cooldown). Provide a "back/edit number" control returning to T6 to submit a corrected number (AC-13). Surface `send_failed`/`offline` clearly (AC-15/24).

**Given/When/Then:**
- Given a renter on the code-entry screen with <5 wrong attempts / When they enter an incorrect code / Then an inline error shows and they can re-enter (AC-09)
- Given 4 prior incorrect attempts / When they enter an incorrect code a 5th time / Then the code is locked and they must request a new one (AC-10)
- Given a code requested >5 minutes ago / When they enter it / Then it is rejected as expired and they are prompted for a new code (AC-11)
- Given a renter on the code-entry screen / When they request a resend / Then a new code is sent immediately with no waiting period (AC-12)
- Given a renter on the code-entry screen / When they choose to go back / Then they return to phone entry and can submit a corrected number (AC-13)
- Given no connectivity during verify / When they submit / Then a clear error is shown, not silent (AC-24)

## API integration (handoff)

### T8 — RFQ submission uses the signed-in user id  (#21)
**Scope:** api-integration
**ACs:** AC-03
**Description:**
In `src/app/api/requests/route.ts`, replace the `AGENTS_TEST_USER_ID` stand-in with the signed-in renter's real `user.id` (read from the session/cookie set at verify) when building the `create_request` payload, so a web submission acts as the same identity the renter has on mobile (AC-03, one identity across surfaces). Keep the existing real/mock submit switch and error surfacing intact; fall back gracefully only when no session is present.

**Given/When/Then:**
- Given a signed-in renter submits an RFQ on the web / When `/api/requests` builds the payload / Then `userId` is the renter's real backend `user.id` from the session, not `AGENTS_TEST_USER_ID` (AC-03)
- Given no valid session / When a submit is attempted / Then it does not submit as the test user (gated by T4 in practice)

## Testing

### T9 — Unit/integration tests for the auth flow  (#22)
**Scope:** testing
**ACs:** AC-03, AC-06, AC-09, AC-10, AC-11, AC-12, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23
**Description:**
Add Vitest coverage mirroring the existing `tests/unit/*` style: (a) app-backend client error-code mapping (E6000/E6001/E6002/E6003 → kinds); (b) BFF handlers — request-code passes `role:"rentee"`/`+966`, verify sets cookies + returns tier, signout clears cookies, session refresh path; (c) session context hydration + `canCreate` per tier; (d) gating middleware redirect/bypass/return-to-`next`; (e) i18n browser-default + RTL direction + persistence across screens. Use the backend `GET /dev/otp?phone=` affordance for any integration test that needs a real code.

**Given/When/Then:**
- Given each AC above / When its test runs / Then the asserted behaviour holds (see per-ticket G/W/T for the exact assertions)
- Given the suite / When `npm test` runs / Then all auth tests pass alongside the existing 002 suite
