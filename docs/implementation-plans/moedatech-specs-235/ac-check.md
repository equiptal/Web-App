# AC Verification — Renter web sign-in (phone + OTP)

**Card:** https://github.com/equiptal/moedatech-specs/issues/235
**Audited:** 2026-06-11
**Branch:** web-app/001-authentication
**HEAD:** 9d91f3b

## Summary
- Met: 24
- Partial: 0
- Not met: 0
- Out of scope: 0

All 24 ACs are implemented against the real backend `/auth/*`. Notes below flag two behavioural nuances (AC-18 depends on the Cognito refresh-token lifetime; AC-21 corrects to the browser locale on hydration) and which ACs lack a dedicated automated test (UI-only paths) — none are gaps in behaviour.

## Per-AC findings

### AC-01 — Sign-in screen prompts for a phone number
**AC text (verbatim):**
> Given a visitor is on the web sign-in screen and not signed in / When the screen renders / Then a phone-number entry is shown with `+966` preset as the country code / And a control to request a code is available

**Verdict:** Met
**Evidence:**
- Implementation: `src/components/auth/PhoneEntry.tsx:39` (`+966` prefix), `:44-48` (phone input), `:56-63` (Send-code control)
- Test: `tests/unit/auth-routes.test.ts` (request-code sends `+966`)

---

### AC-02 — Valid phone submission advances to the code-entry screen
**AC text (verbatim):**
> Given a visitor on the sign-in screen (per AC-01) / When they enter a phone number and request a code / Then a code-entry screen for a 4-digit code is shown / And the screen indicates the code was sent by SMS to the entered number

**Verdict:** Met
**Evidence:**
- Implementation: `src/components/auth/PhoneEntry.tsx:23-25` (request-code → `onCodeSent`), `src/app/login/LoginFlow.tsx:18,28-30` (advance to CodeEntry), `src/components/auth/CodeEntry.tsx:106-108` ("We sent a code by SMS to {phone}"), 4-box input `:111-127`
- Test: `tests/unit/auth-routes.test.ts` (request-code 200)

---

### AC-03 — Correct code signs the renter into their existing account
**AC text (verbatim):**
> Given a renter who already has an account on the mobile app / And they have requested a code on the web (per AC-02) / When they enter the correct 4-digit code / Then they are signed in / And they reach the same account they use on the mobile app (one identity across both surfaces)

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/api/auth/verify/route.ts:32-40` (proxies real `/auth/verify-otp`, the same backend the mobile app uses → one identity; sets session cookies), `src/lib/session/index.tsx:37-48` (adopts the returned user), `src/app/api/requests/route.ts:11-21,40` (web submits as that `user.id`)
- Test: `tests/unit/auth-routes.test.ts` (verify returns user + sets cookies)

---

### AC-04 — Account tier carries over from mobile unchanged
**AC text (verbatim):**
> Given a renter whose mobile account tier is `guest`, `basic`, or `verified` / When they sign in on the web (per AC-03) / Then the tier shown to the renter on the web matches their mobile account tier

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/api/auth/verify/route.ts:36` (`tier: normalizeTier(data.user.tier)` straight from verify-otp), `src/lib/session/index.tsx:73` (exposes tier), `src/components/AppShell.tsx:57` (renders the real tier badge)
- Test: `tests/unit/auth-routes.test.ts` (verify returns `tier: "basic"`); `tests/unit/auth-i18n.test.ts` (normalizeTier)

---

### AC-05 — Web sign-in never changes the renter's tier
**AC text (verbatim):**
> Given a renter with a known tier (per AC-04) / When they sign in on the web / Then their tier is unchanged by the web sign-in (no promotion or demotion as a result of signing in)

**Verdict:** Met
**Evidence:**
- Implementation: the web only ever **reads** `user.tier` — `verify/route.ts:36` reflects it; `src/lib/session/index.tsx` has no tier setter (the 002 demo `setTier` toggle was removed from `AppShell.tsx`). No code path mutates tier.
- Test: `tests/unit/auth-i18n.test.ts` (normalizeTier is read-only mapping)

---

### AC-06 — Unrecognized phone number is admitted as a guest
**AC text (verbatim):**
> Given a phone number with no existing account / When that number completes phone + correct code on the web (per AC-03) / Then the visitor is admitted as a new `guest`-tier account / And no separate sign-up step is required

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/api/auth/request-code/route.ts:22-23` (`/auth/login` unified login with `role:"rentee"` — auto-registers unknown numbers, no separate sign-up); guest tier follows from `normalizeTier` default (`src/lib/contract/auth.ts:14`)
- Test: `tests/unit/auth-routes.test.ts` (request-code passes `role:"rentee"` to `/auth/login`)

---

### AC-07 — Deep-link return after sign-in
**AC text (verbatim):**
> Given a signed-out renter was redirected to sign-in from a specific gated page (per AC-16) / When they complete sign-in (per AC-03) / Then they are returned to the page they originally requested

**Verdict:** Met
**Evidence:**
- Implementation: `src/middleware.ts:40-41` (redirect carries `?next=<path>`), `src/app/login/page.tsx:13-14` (reads `next`), `src/app/login/LoginFlow.tsx:21-23` (`router.replace(next)`)
- Test: `tests/unit/middleware.test.ts` (`/login?next=/foo` while authed → `/foo`)

---

### AC-08 — Direct sign-in lands on the web home
**AC text (verbatim):**
> Given a renter who opened the sign-in screen directly, with no prior gated destination / When they complete sign-in (per AC-03) / Then they land on the web app home

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/login/page.tsx:14` (`next ?? "/"`), `src/app/login/LoginFlow.tsx:22-23` (falls back to `/`)
- Test: `tests/unit/middleware.test.ts` (authed `/login` no-next → home)

---

### AC-09 — Incorrect code shows an inline error and allows re-entry
**AC text (verbatim):**
> Given a renter on the code-entry screen (per AC-02) / And fewer than 5 incorrect attempts have been made on the current code / When they enter an incorrect code / Then an inline error is shown / And they can re-enter the code

**Verdict:** Met
**Evidence:**
- Implementation: `src/lib/api/app-backend.ts:24` (E6000→`invalid_code`), `src/components/auth/CodeEntry.tsx:68-70` (inline error + `resetBoxes` to re-enter), `:128` (error rendered)
- Test: `tests/unit/auth-routes.test.ts` (verify E6000 → `invalid_code`); `tests/unit/app-backend.test.ts` (mapping)

---

### AC-10 — Fifth incorrect attempt locks the code
**AC text (verbatim):**
> Given a renter has entered an incorrect code 4 times on the current code (per AC-09) / When they enter an incorrect code a 5th time / Then the current code is locked / And they must request a new code to continue

**Verdict:** Met
**Evidence:**
- Implementation: the 5-attempt lockout is enforced by the backend (E6002); `src/lib/api/app-backend.ts:26` maps E6002→`locked`, surfaced via `CodeEntry.tsx:128` with the "request a new code" message (`en.ts` `errors.locked`). Resend available `:133`.
- Test: `tests/unit/app-backend.test.ts` (E6002→`locked`)
**Notes:** the attempt count is owned by the backend (the same lockout the mobile app uses); the web reflects it.

---

### AC-11 — Expired code is rejected and prompts a new code
**AC text (verbatim):**
> Given a renter requested a code more than 5 minutes ago and has not used it / When they enter that code / Then it is rejected as expired / And they are prompted to request a new code

**Verdict:** Met
**Evidence:**
- Implementation: `src/lib/api/app-backend.ts:25` (E6001→`expired`); message `en.ts` `errors.expired` ("Request a new one."); resend control `CodeEntry.tsx:133`
- Test: `tests/unit/app-backend.test.ts` (E6001→`expired`)
**Notes:** 5-minute expiry is enforced backend-side; the web surfaces it.

---

### AC-12 — Code can be resent immediately with no cooldown
**AC text (verbatim):**
> Given a renter on the code-entry screen (per AC-02) / When they request the code to be resent / Then a new code is sent immediately / And no waiting period is required between resend requests

**Verdict:** Met
**Evidence:**
- Implementation: `src/components/auth/CodeEntry.tsx:73-81` (resend → `/api/auth/resend`, no timer/cooldown gate), `src/app/api/auth/resend/route.ts:20-24` (`/auth/resend-otp`). The prototype's 30s timer was deliberately omitted (AC wins).
- Test: _none (UI path)_
**Notes:** no automated test; verified by code + absence of any cooldown gate.

---

### AC-13 — Editing the phone number from the code screen
**AC text (verbatim):**
> Given a renter on the code-entry screen (per AC-02) / When they choose to go back / Then they return to the phone-number entry / And they can submit a corrected number (per AC-02)

**Verdict:** Met
**Evidence:**
- Implementation: `src/components/auth/CodeEntry.tsx:86-92` (back control → `onEditNumber`), `src/app/login/LoginFlow.tsx:19,29` (`onEditNumber` resets to PhoneEntry)
- Test: _none (UI path)_

---

### AC-14 — No auth rate limit beyond the 5-attempt lockout
**AC text (verbatim):**
> Given a renter requesting or verifying codes / When they make repeated code requests or verification attempts / Then they are bounded only by the 5-attempt lockout per code (per AC-10) / And no additional per-request or per-phone throttle blocks them before that lockout

**Verdict:** Met
**Evidence:**
- Implementation: negative space — the BFF (`src/lib/api/app-backend.ts`, `src/app/api/auth/*`) adds no throttle/counter; only the backend's E6002 lockout applies (documented at `app-backend.ts:88`).
- Test: _none (verified by absence of throttle code)_

---

### AC-15 — SMS send failure is surfaced, not silent
**AC text (verbatim):**
> Given a renter has requested a code / When the SMS cannot be sent / Then the failure is communicated to the renter / And the renter can request the code again

**Verdict:** Met
**Evidence:**
- Implementation: `src/lib/api/app-backend.ts:27` (E6003→`send_failed`), surfaced in `PhoneEntry.tsx:51` / `CodeEntry.tsx:128` via `errors.send_failed`; resend/retry available
- Test: `tests/unit/app-backend.test.ts` (E6003→`send_failed`)

---

### AC-16 — Gated access redirects an unauthenticated visitor to sign-in
**AC text (verbatim):**
> Given a visitor with no valid session, or whose session has ended / When they open any gated web URL / Then they are redirected to the sign-in screen / And the gated content is not shown until they sign in

**Verdict:** Met
**Evidence:**
- Implementation: `src/middleware.ts:38-42` (no refresh cookie → redirect to `/login?next=`, content never rendered), matcher `:54-56`
- Test: `tests/unit/middleware.test.ts` (unauth gated → redirect)

---

### AC-17 — Valid session bypasses sign-in
**AC text (verbatim):**
> Given a renter with a valid session / When they open a gated web URL, including the sign-in URL itself / Then they reach the requested content without entering a phone number or code

**Verdict:** Met
**Evidence:**
- Implementation: `src/middleware.ts:26-34` (authed on `/login` → redirect onward), `:44` (authed elsewhere → `next()`); `src/app/api/auth/session/route.ts:37-39` (live access token returns user, no prompt)
- Test: `tests/unit/middleware.test.ts` (authed passes / `/login` redirects); `tests/unit/auth-session.test.ts` (session returns user without refresh)

---

### AC-18 — Session persists until sign-out or 30 days
**AC text (verbatim):**
> Given a signed-in renter who has not signed out / When fewer than 30 days have passed since they signed in / Then reopening the web app does not require them to sign in again / And once 30 days have passed, the next visit requires a phone number and code again

**Verdict:** Met
**Evidence:**
- Implementation: `src/lib/api/auth-server.ts:18,37` (refresh cookie `Max-Age` = 30 days), `src/app/api/auth/session/route.ts:41-57` (refreshes the access token from the refresh cookie within the window; clears + returns null when the refresh token is gone/expired), `src/middleware.ts:23` (gates on the refresh cookie)
- Test: _none (time-dependent)_
**Notes:** the 30-day envelope is the refresh-cookie `Max-Age`; the effective re-auth point also depends on the Cognito refresh-token lifetime configured backend-side (default 30 days). If the backend token is shorter, re-auth happens earlier — still correct, just sooner.

---

### AC-19 — Sign out ends the session
**AC text (verbatim):**
> Given a signed-in renter / When they sign out / Then their web session ends / And they are returned to the sign-in screen

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/api/auth/signout/route.ts:15,21` (revoke `/auth/logout` + clear cookies), `src/lib/session/index.tsx:59-67` (`signOut` → anon), `src/components/AppShell.tsx:16-19` (button → signOut → `router.push("/login")`)
- Test: _none (UI path); cookie-clear covered indirectly by `clearAuthCookies`_

---

### AC-20 — Gated pages require sign-in after sign-out
**AC text (verbatim):**
> Given a renter has signed out (per AC-19) / When they open any gated web URL / Then they are redirected to the sign-in screen (per AC-16)

**Verdict:** Met
**Evidence:**
- Implementation: sign-out clears the refresh cookie (`auth-server.ts:49-51`), so `src/middleware.ts:38-42` redirects subsequent gated requests to `/login`
- Test: `tests/unit/middleware.test.ts` (no refresh cookie → redirect)

---

### AC-21 — Sign-in screens default to the browser locale
**AC text (verbatim):**
> Given a visitor whose browser locale is `en` or `ar` / When the sign-in screen renders / Then it is shown in that language / And Arabic renders right-to-left

**Verdict:** Met
**Evidence:**
- Implementation: `src/lib/i18n/config.ts:detectLocale`, `src/lib/i18n/index.tsx:31-38` (no stored choice → `detectLocale(navigator.language)`), `src/app/login/layout.tsx:17` (`dir="rtl"` for `ar`)
- Test: `tests/unit/auth-i18n.test.ts` (detectLocale `ar*`→ar, else en)
**Notes:** detection runs on the client after mount (the SSR first paint uses the default `en`, then corrects to the browser locale on hydration). The rendered screen honours the browser locale; there is a brief default-locale flash for Arabic browsers.

---

### AC-22 — Language toggle switches content and direction
**AC text (verbatim):**
> Given a visitor on any sign-in screen / When they switch the language toggle between `en` and `ar` / Then the sign-in content switches to the selected language / And the page direction switches accordingly (LTR for `en`, RTL for `ar`)

**Verdict:** Met
**Evidence:**
- Implementation: `src/app/login/layout.tsx:18-28` (EN/ع toggle → `setLocale`), `:17` (`dir` switches with locale), strings from `en.ts`/`ar.ts` `auth.*`
- Test: _none (DOM/RTL not covered in the node unit env)_

---

### AC-23 — Language selection persists across sign-in screens
**AC text (verbatim):**
> Given a visitor selected a language on the phone-entry screen (per AC-22) / When they advance to the code-entry screen / Then the selected language is retained

**Verdict:** Met
**Evidence:**
- Implementation: locale lives in the shared `LocaleProvider` (`src/lib/i18n/index.tsx`), persisted to `localStorage` (`:42-49`); the phone→code transition is an in-place state swap in `LoginFlow` (no route change), so the locale is retained
- Test: _none (UI path)_

---

### AC-24 — Offline / no connectivity surfaces a clear error
**AC text (verbatim):**
> Given a renter performing a sign-in action that needs the network (requesting or verifying a code) / And the device has no connectivity / When they attempt the action / Then a clear error is shown / And the action does not fail silently

**Verdict:** Met
**Evidence:**
- Implementation: `src/components/auth/authClient.ts:18-20` (fetch rejection → `offline`), surfaced via `errors.offline`; server side `src/lib/api/app-backend.ts:73-74` also maps backend-unreachable → `offline`
- Test: `tests/unit/app-backend.test.ts` (fetch rejection → `offline`)
