# Tickets — Renter web onboarding & account tiers

Card: https://github.com/equiptal/moedatech-specs/issues/268
Plan: ./plan.md

Tickets are grouped by scope. Implement in the order listed (top to bottom). All ride the single epic branch `web-app/003-renter-onboarding` and ship in one PR into `staging`.

**Cross-cutting:** all backend calls are **authenticated** — the BFF forwards the web-app/001 session's Cognito access token (`mt_access` cookie) as `Authorization: Bearer`, refreshing via `/auth/refresh` on 401 (T1). Backend = Moedatech-App `apps/backend` at `APP_API_URL` (staging). **Fields = app/AC; design/style = prototype** (`rentee-account-creation.html`, `rentee-verification.html`); city & job title are selectors fed by master-data.

## Backend — admin

_No tickets in this scope._ Web verification submissions enter the existing admin review queue unchanged (AC-21); no admin UI change.

## Backend — mobile

_No tickets in this scope._ Mobile UI untouched; profile/tier/verification state is shared (AC-07/16/24/25/26).

## API integration

### T1 — Authenticated app-backend client (Bearer + refresh)  (#26)
**Scope:** api-integration
**ACs:** underpins AC-05, AC-07, AC-09, AC-13, AC-24, AC-25, AC-26
**Description:**
Extend `src/lib/api/app-backend.ts` with an **authenticated** variant (`authedGet`/`authedPost`) for BFF routes: read `mt_access` from the 001 session cookie (`auth-server.ts` helpers), send `Authorization: Bearer <accessToken>` + `X-Tenant-Id` + `Accept-Language`. On `E2000`/`E2001` (401) refresh once via backend `POST /auth/refresh` using `mt_refresh`, re-set the access cookie, and retry; if refresh fails, return 401 so the client re-logs-in. Map `E2004` (forbidden), `E3000`/`E3004` (validation → field errors), `E4001` (not found) to typed errors; `fetch` rejection → `offline` (AC-23).

**Given/When/Then:**
- Given a signed-in renter / When an authed BFF call runs / Then it carries the user's `Bearer` access token
- Given an expired access token and a valid refresh token / When an authed call returns 401 / Then the client refreshes via `/auth/refresh`, retries, and succeeds
- Given refresh also fails / Then a 401 is returned and the renter is sent to re-login

### T2 — Profile + status + master-data BFF routes  (#27)
**Scope:** api-integration
**ACs:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-24, AC-25, AC-26
**Description:**
BFF routes under `src/app/api/`:
- `GET /api/me` → backend `GET /users/me` (+ `GET /users/me/profile-status`) → `{ user: { id, phone, firstName, lastName, city, jobTitle, email, whatsapp, tier }, verification: { status } }`. Single source for tier + verification status (cross-surface reflection — AC-07/24/25/26).
- `POST /api/profile/complete` → backend `POST /users/me/profile` (`completeProfileSchema`: firstName/lastName/city/jobTitle required + email?/whatsapp?) → updated user (tier `basic`).
- `GET /api/master-data/cities` → backend `GET /master-data/cities`; `GET /api/master-data/job-titles` → backend `GET /master-data/job-titles` (for the selectors).

**Given/When/Then:**
- Given a guest submits a complete profile (all required fields) / When `/api/profile/complete` posts to `/users/me/profile` / Then the backend recomputes tier to `basic` and returns it (AC-05)
- Given a missing/too-short field / Then the backend `E3000` validation maps to a flagged field, renter stays `guest` (AC-02/03)
- Given the renter opens the web after becoming `basic` on the app / When `/api/me` reads `/users/me` / Then tier is `basic` (AC-24)

### T3 — Verification BFF routes + document presign  (#28)
**Scope:** api-integration
**ACs:** AC-09, AC-10, AC-11, AC-12, AC-13, AC-15, AC-17, AC-18, AC-21
**Description:**
- `POST /api/profile/doc-upload-url` → backend `POST /profile/doc-upload-url` `{ filename, contentType }` → `{ url, key }`. The client PUTs the file **directly** to the presigned `url`, then holds the `key`. Backend allowlists `image/jpeg`/`image/png`/`image/webp`/`application/pdf` (bilingual reject, AC-11) and enforces no size limit (AC-12).
- `POST /api/verification/submit` → backend `POST /users/me/company` (`companyDetailsSchema`: authorityRole enum + companyName + crDocKey + vatDocKey required; optional nationalId/companyCity/extra doc keys) → `{ supplierStatus }` (pending). Enters the existing admin queue (AC-21).
- `POST /api/verification/resubmit` → backend `POST /profile/resubmit-verification` (same schema) → `{ supplierStatus }` (AC-18).
- `GET /api/verification` (status + existing docs) → `GET /users/me/profile-status` (+ `/users/me/verification-docs`) for the pending/rejected/verified states and resubmit prefill.

**Given/When/Then:**
- Given a basic renter with authority role + company name + CR + VAT docs / When they submit / Then `supplierStatus` becomes pending (AC-09/10/13)
- Given a file outside JPEG/PNG/WebP/PDF / When requesting a presign / Then the backend rejects it with a bilingual error (AC-11)
- Given a rejected renter / When they resubmit / Then status returns to pending, superseding the prior submission (AC-18)

## Web — session & gating

### T4 — Session reads tier + status; unblock create; entry points  (#29)
**Scope:** web-session
**ACs:** AC-05, AC-06, AC-08, AC-19, AC-20
**Description:**
Extend the session/profile layer to read `/api/me` (tier + verification status). After `/api/profile/complete` succeeds, refresh the session so tier `guest`→`basic` and 002's `canCreate` unblocks (AC-05). Add home-shell entry points: **Create account** (guest) and **Verify** (basic) in `AppShell`, and wire web-app/002's gated prompt (`GuestBlock`/`CreateSurface`) to `/onboarding` with a `next` back to the gated action (AC-01/06). A guest choosing **Verify** is routed to `/onboarding` first (verification gated behind `basic`, AC-08). Verified renter → verified state; pending → pending state (AC-19/20).

**Given/When/Then:**
- Given a guest who becomes basic from the RFQ gated prompt / When they finish / Then they return to the RFQ create action, now unblocked (AC-05/06)
- Given a guest who taps Verify / Then they are routed to complete their profile first (AC-08)
- Given a verified or pending renter opening Verify / Then the verified / pending state is shown, no editable form (AC-19/20)

## Web — onboarding & verification UI

### T5 — Account-creation screen + route (Flow 1)  (#30)
**Scope:** web-onboarding-ui
**ACs:** AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-22, AC-23
**Description:**
`/onboarding` route + form built to the **prototype design** (topbar + Moedatech mark, stepline `1 Create account → 2 Verify`, card head/body/foot, EN/ع, RTL) with **app/AC fields**: first name, last name, **city selector** + **job-title selector** (from master-data), optional email, optional WhatsApp (+966); phone shown read-only with a "Verified" badge. Client guards mirror the bounds (first 2–30, last 2–50, city 2–100, jobTitle 2–100; WhatsApp Saudi format if present — AC-03/04), with server validation authoritative. Submit → `POST /api/profile/complete`; on success return to the `next` action or web home (AC-06). **Drop** the prototype's Full-name field, Account-type toggle, and consent checkbox. Offline/validation error preserves input, no partial submit (AC-23).

**Given/When/Then:**
- Given a signed-in guest / When they open Create account / Then the form shows with phone read-only (AC-01)
- Given a missing required field / When they submit / Then it's blocked and flagged, renter stays guest (AC-02)
- Given all required fields valid / When they submit / Then they become basic and return to the prior action or home (AC-05/06)
- Given a network failure on submit / Then a clear error shows, input preserved, no partial update (AC-23)

### T6 — Verification screen + route + states (Flow 2/3)  (#31)
**Scope:** web-verification-ui
**ACs:** AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-22, AC-23
**Description:**
`/verify` route + form to the **prototype design** with **app/AC fields**: authority-role selector (`owner`/`manager`/`employee`), company name (required), **CR document** + **VAT document** uploads (both required) via the presign flow (request url+key → PUT file → hold key), plus optional national ID, company city, extra docs (AC-15). File picker `accept` = jpeg/png/webp/pdf; unsupported → bilingual error from the backend (AC-11); no size limit (AC-12). Submit → `POST /api/verification/submit` → **pending** state (AC-13), locked/not-editable (AC-14). Revisit states from `/api/me`: **verified** (no form, AC-19), **pending** (locked, AC-20), **rejected** (generic, no reason → resubmit via `/api/verification/resubmit`, AC-17/18). Guest → routed to `/onboarding` first (AC-08). **Drop** the prototype's contact-name field, VAT-optional, and Save-for-later. EN/AR + RTL (AC-22); offline preserves input, no partial submit (AC-23). Approval (AC-16) is admin-side; the web reflects it on next `/api/me` read.

**Given/When/Then:**
- Given a basic renter missing authority role/company name or a required doc / When they submit / Then it's blocked and the missing item flagged (AC-09/10)
- Given a complete submission / When submitted / Then status is pending and shown (AC-13); revisiting shows the locked pending state (AC-14/20)
- Given a rejected renter / Then a generic rejected state invites resubmit (no reason), and resubmitting returns to pending (AC-17/18)
- Given a verified renter opening Verify / Then the verified state shows with no form (AC-19)

## Web — i18n

### T7 — EN/AR strings + RTL for onboarding & verification  (#32)
**Scope:** web-i18n
**ACs:** AC-22
**Description:**
Add the onboarding + verification dictionary entries to `en.ts`/`ar.ts` and apply RTL on the `/onboarding` and `/verify` routes (reuse web-app/001's `dir`-scoped approach + the shared `LocaleProvider`, so the selection persists across the forms). Bilingual validation/error messages (mirroring the backend's EN/AR messages).

**Given/When/Then:**
- Given the renter's language is `ar` / When they use onboarding or verification / Then the screens render in Arabic, right-to-left (AC-22)
- Given they switch language mid-form / Then content and direction switch and the selection persists

## Testing

### T8 — Unit/integration tests for onboarding & verification  (#33)
**Scope:** testing
**ACs:** AC-02, AC-03, AC-04, AC-09, AC-10, AC-11, AC-13, AC-14, AC-18, AC-22
**Description:**
Vitest coverage mirroring `tests/unit/*`: (a) authed app-backend client — Bearer forwarding, refresh-on-401 + retry, error mapping (E2004/E3000/E3004/E4001/offline); (b) BFF routes — profile-complete payload + validation mapping, verification submit/resubmit payload (authorityRole/companyName/crDocKey/vatDocKey), presign passthrough + type allowlist; (c) status-driven states (pending lock / verified / rejected → resubmit); (d) i18n RTL + persistence. Use a signed-in fixture session (mt_* cookies) for authed-route tests.

**Given/When/Then:**
- Given each AC above / When its test runs / Then the asserted behaviour holds
- Given the suite / When `npm test` runs / Then all 003 tests pass alongside the existing suites
