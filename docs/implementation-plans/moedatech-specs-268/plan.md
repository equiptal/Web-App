# Implementation Plan — Renter web onboarding & account tiers

**Card:** https://github.com/equiptal/moedatech-specs/issues/268
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/003-renter-onboarding/
**Card id:** moedatech-specs-268
**Generated:** 2026-06-12

## Summary
Give the renter web a path to **progress their account tier**, mirroring the mobile app. Today web-app/001 signs renters in and reflects their tier but offers no way to advance it — a `guest` dead-ends at any tier-gated action (e.g. the RFQ create prompt, web-app/002 AC-02). This epic adds two flows on the web, over the same single identity/state the mobile app uses: (1) **complete profile** (`guest` → `basic`) — first name, last name, city, job title (required), optional email/WhatsApp; and (2) **submit company verification** (`basic` → `verified`) — authority role + company name + the CR and VAT documents, entering the existing admin review queue; plus the pending/rejected/resubmit lifecycle and the already-verified/pending revisit states. Onboarding is reachable from a standalone web entry and from the 002 gated prompt, is bilingual EN/AR (RTL), and reflects bidirectionally with the mobile app. Built as a **thin BFF over the real Moedatech-App backend**, called **as the signed-in renter** (forwarding the web-app/001 session's Cognito access token) — no new fields, validators, storage, or admin flow are introduced.

## Acceptance criteria covered
- **AC-01** — Account-creation form reachable for a guest: Given a signed-in `guest` / When they open Create account or are prompted by a tier-gated action / Then the form is shown / And their verified phone is read-only
- **AC-02** — Required profile fields gate becoming basic: Given a guest on the form / When they submit with first name, last name, city, or job title missing / Then submission is blocked / And the missing field is flagged / And they remain `guest`
- **AC-03** — Profile field length bounds: first name 2–30, last name 2–50, city 2–100, job title 2–100; out-of-bounds rejected, in-bounds accepted
- **AC-04** — Optional email and WhatsApp: absence doesn't block; a WhatsApp number, if provided, must be a valid Saudi mobile number
- **AC-05** — Completing the profile makes the renter `basic`: tier becomes `basic` / the prompting tier-gated action is no longer blocked
- **AC-06** — Return to prior action after becoming basic: returned to the originating action; direct entry lands on web home
- **AC-07** — Becoming basic on the web reflects on the app: `basic` there too (one identity)
- **AC-08** — Verification gated behind basic: a guest who chooses Verify is routed to complete their profile first; the verification form isn't reachable until `basic`
- **AC-09** — Verification required fields: authority role (`owner`/`manager`/`employee`) + company name; missing → blocked + flagged
- **AC-10** — Both CR and VAT documents required: missing either → blocked + flagged
- **AC-11** — Accepted document types: `JPEG`/`PNG`/`WebP`/`PDF` accepted; any other type rejected with a bilingual (EN+AR) error
- **AC-12** — No document size limit at launch: a file >10 MB is still accepted (no size limit enforced)
- **AC-13** — Submission sets status pending: status becomes `pending`; a pending state is shown
- **AC-14** — Pending submission is locked: not editable; cannot resubmit while `pending`
- **AC-15** — Optional verification fields accepted: national ID, company city/address, map coords, optional docs accepted; absence doesn't block
- **AC-16** — Approval makes the renter verified, reflected on both surfaces
- **AC-17** — Rejection shows a generic state, no reason
- **AC-18** — Resubmit returns to pending and supersedes the prior submission
- **AC-19** — Already-verified renter revisiting the entry: verified state shown, no form
- **AC-20** — Pending renter revisiting the entry: pending state shown, cannot resubmit
- **AC-21** — Web verification enters the admin review queue (same queue as app submissions)
- **AC-22** — Available in English and Arabic; Arabic renders right-to-left
- **AC-23** — Offline / network failure on submit: clear error, input preserved, no partial submission
- **AC-24** — Profile completed on the app reflects on the web (`basic`, no re-entry)
- **AC-25** — Verified on the app reflects on the web
- **AC-26** — Verification status consistent across surfaces (pending/rejected shown the same on both)

## Architecture overview
All renter-web (frontend + Next.js BFF), over the **same Moedatech-App backend** the mobile app uses — but, unlike 001/002, calling **authenticated** endpoints as the signed-in renter. Parts:

1. **Authenticated app-backend client** — extend `src/lib/api/app-backend.ts` (001) so BFF routes can call the backend with `Authorization: Bearer <accessToken>` read from the web-app/001 session cookie (`mt_access`), refreshing via `/auth/refresh` (the `mt_refresh` cookie) on a 401 — reusing 001's session machinery. Headers: `X-Tenant-Id`, `Accept-Language`.
2. **Onboarding BFF routes** (`src/app/api/onboarding/*` or `/api/me`, `/api/verification/*`) — server-side proxies forwarding the user token:
   - profile read → backend `GET /users/me` (tier + profile + verification status)
   - profile complete (guest→basic) → backend profile-update endpoint (`PUT /users/{id}` or a dedicated profile endpoint — see Q1) with first/last name, city, job title (+ optional email/WhatsApp)
   - verification submit/resubmit → backend verification endpoint (see Q2) with authority role, company name, document references + optional fields
   - document upload → backend presigned-upload flow (see Q3): request a presigned URL, PUT the file to storage, submit the reference
3. **Onboarding + verification screens** — `/onboarding` (account-creation form, Flow 1) and `/verify` (verification form + pending/rejected/verified states, Flows 2/3), built to the prototypes (`rentee-account-creation.html`, `rentee-verification.html`) with the Moedatech logo; **the AC win over the prototype** (first+last name & job title, authority-role enum, both CR+VAT docs; no Account-type toggle / consent / Save-for-later). Bilingual EN/AR, reuse 001's `/login`-style RTL approach.
4. **Session + gating integration** — after profile-complete the session re-reads tier (`guest`→`basic`) so 002's `canCreate` unblocks; entries reachable from the home shell (`Create account` / `Verify`) and the 002 RFQ gated prompt (AC-01/06). Verification submit → `pending` state; revisit shows pending/verified/rejected (AC-19/20).

Data flow (authenticated): screen → `fetch('/api/onboarding/...')` → BFF reads `mt_access` cookie → backend call with `Bearer` → on success re-reads `/users/me` (updated tier/status) → client reflects. No new identity/state — the backend recomputes tier from the shared user (001's `getUserTier`: `basic ⇐ firstName && lastName && city && jobTitle`).

## Backend — admin
_No admin-panel UI in this epic._ Web verification submissions enter the **existing** admin review queue unchanged (AC-21); reviewers act on them exactly like app submissions. Distinguishing web- vs app-sourced submissions is a deferred non-goal (no source indicator).

## Backend — mobile
_No mobile UI change._ Profile/tier/verification state is **shared** — a profile completed or verification submitted/approved on the web reflects in the app and vice versa (AC-07/24/25/26). The web introduces no new backend behavior; it submits against the app's existing validators, endpoints, and storage.

## API integration
Backend = Moedatech-App `apps/backend` (same host as 001 `APP_API_URL`, staging `c4tupvmckc…`). All **authenticated** (`Authorization: Bearer <accessToken>` from the 001 session). Contract confirmed from `apps/backend/src/handlers/profile/*` + `validators/profile.schema.ts`:

| 003 need | Endpoint | Payload / response | AC |
|---|---|---|---|
| Profile read (tier + fields) | `GET /users/me` | → `{ id, firstName, lastName, email, city, jobTitle, whatsapp, tier, … }` (tier = `getUserTier`) | AC-01/05/24/25 |
| Verification status | `GET /users/me/profile-status` | → verification/`supplierStatus` state | AC-13/14/19/20/26 |
| Complete profile (guest→basic) | `POST /users/me/profile` | `completeProfileSchema`: `firstName`(2–30), `lastName`(2–50), `city`(2–100), `jobTitle`(2–100) **required** + `email?`, `whatsapp?` | AC-02/03/04/05 |
| Submit verification | `POST /users/me/company` | `companyDetailsSchema` (below) → `{ supplierStatus }` (pending) | AC-09/10/13/15 |
| Resubmit verification | `POST /profile/resubmit-verification` | same `companyDetailsSchema` → `{ supplierStatus }` | AC-17/18 |
| Document presign | `POST /profile/doc-upload-url` | `{ filename, contentType }` → `{ url, key }`; PUT file to `url`, reference `key` | AC-10/11/12/15 |

`companyDetailsSchema`: `authorityRole` enum `owner`/`manager`/`employee` **(required)**, `companyName` 2–200 **(required)**, `crDocKey` + `vatDocKey` **(required, the presign `key`s)**; optional `nationalId`, `companyCity`, `localContentDocKey`, `sasoHeavyEquipDocKey`, `otherDocKeys[]` (+ company address / map coords per AC-15). Bilingual EN/AR validator messages already in the schema.

**Verification status = the user's `supplierStatus`** (int): `getUserTier` → `verified` when `supplierStatus===2`; `resubmitVerification` handles rejected (`status=3`); `pending` in between. The web reads it via `/users/me` / `profile-status` for the pending-lock + revisit states (AC-13/14/19/20). Approval/rejection happen admin-side (`handlers/trust/*` — out of web scope, AC-21).

Error codes (users.md/auth.md): `E2000`/`E2001` unauthorized/expired → refresh or re-login; `E2004` forbidden; `E3000`/`E3004` validation → field errors; `E4001` not found. Offline = `fetch` rejection (AC-23) — surface clearly, preserve input, no partial submit.

## Data model / migrations
None on the web. State is the shared backend user/verification record. The web adds no DB/migrations and no new storage; it reuses the app's profile fields, verification record, document storage, and admin queue. Session cookies from 001 are reused (the `mt_access` token is forwarded to authenticated calls).

## Risks & dependencies
From `dependencies.md`:
- **Hard prerequisite: web-app/001** (identity model, tiers, session) — now merged to `staging`. 003 reuses its session/cookies + `app-backend.ts`.
- **Shared identity/profile/verification state + validators** (AC-05/07/16/24/25/26, AC-02/03/09/10/11) — the web exposes the app's existing fields/validators; if they change, web+app move together.
- **Existing document upload/storage + admin review queue** (AC-10/11/15/21) — reused as-is; no new storage, no admin UI change.
- **EN/AR localization** (AC-22) — reuse 001's RTL approach.
- **002 gated prompt** (AC-01/05/06) — an entry source (002 merged), not a hard prereq; 003 also offers a standalone entry.
- **Risk — first authenticated backend calls from the web:** the BFF must forward the user's Cognito access token and handle refresh/401 (new pattern vs 001's unauthenticated `/auth/*` and 002's service-token `/agents/*`). See Q5.
- **Risk — verification + upload contract not yet in `docs/`:** must be located in backend source (Q2/Q3).

## Open questions
- ✅ **Q1 (AC-02/03/05) — Profile-completion (RESOLVED by repo audit).** `POST /users/me/profile` (`completeProfile.handler`), `completeProfileSchema`: `firstName`(2–30), `lastName`(2–50), `city`(2–100), `jobTitle`(2–100) required + `email?`/`whatsapp?` — the length bounds **exactly match AC-03**. Completing flips `guest`→`basic` via `getUserTier` (basic ⇐ firstName && lastName && city && jobTitle). (`users.md`'s `PUT /users/{id}`/`fullName` was the generic update — the profile-complete endpoint is the dedicated one above.)
- ✅ **Q2 (AC-09/10/13/14/18) — Verification submit/resubmit (RESOLVED).** `POST /users/me/company` (`submitCompanyDetails`) + `POST /profile/resubmit-verification` (`resubmitVerification`), both `companyDetailsSchema` (authorityRole enum, companyName, crDocKey, vatDocKey required + optional fields) → `{ supplierStatus }`. Status model = `supplierStatus` int (`2`=verified, `3`=rejected, pending between).
- ✅ **Q3 (AC-10/11/12/15) — Document presign (RESOLVED).** `POST /profile/doc-upload-url` `{ filename, contentType }` → `{ url, key }` (S3 presigned PUT via `s3Service`); the verification payload references docs by `key`. (Confirm AC-11 type-allowlist enforcement + AC-12 no-size-limit detail in the presign during build — see Q7.)
- ✅ **Q4 (AC-05/08/13/19/20/24/25/26) — `/users/me` shape (RESOLVED).** `getMe.handler` returns `firstName/lastName/email/city/jobTitle/whatsapp/tier` (tier from `getUserTier`); `GET /users/me/profile-status` returns the verification/`supplierStatus` state. Gating + revisit states read from these.
- 🟡 **Q5 (all authenticated ACs) — BFF forwards the user access token + refresh (design, resolvable in code).** BFF reads `mt_access` from the 001 session cookie → `Authorization: Bearer`; on `E2000/E2001` (401) refresh via `/auth/refresh` (`mt_refresh`) and retry; if refresh fails, surface re-login. Extend `app-backend.ts` with an authed variant reusing 001's `auth-server.ts` cookie helpers. (Carried into tickets, not blocking.)
- ✅ **Q6 (build reference) — Fields follow the app/AC; design & style follow the prototype (Yara, 2026-06-12).** Confirmed against the **mobile app screens** (`profile_form_page.dart`, `company_verification_page.dart`): the app aligns with the AC, the prototype diverges. So:
  - **Fields/behavior = app/AC.** Account form: first name + last name + city + job title (required) + optional email/WhatsApp; phone read-only. Verification form: authority-role enum (`owner`/`manager`/`employee`), company name, CR + VAT docs (required) + optional national ID / company city / extra docs; resubmit prefills. **Drop** the prototype's Full-name, Account-type toggle, consent checkbox, contact-name field, VAT-optional, and Save-for-later.
  - **Design/style = prototype** (`rentee-account-creation.html`, `rentee-verification.html`): topbar + Moedatech mark, stepline (`1 Create account → 2 Verify`), card head/body/foot, `seg2`, langtog EN/ع, RTL — dev latitude colors/styling only.
  - **City & job title = selectors** (matching the app's fetched-list pickers), not free text.
- ✅ **Q7 (AC-11/12) — Presign type allowlist + no size limit (RESOLVED by app audit).** `getDocUploadUrl` enforces `ALLOWED_CONTENT_TYPES = ['image/jpeg','image/png','image/webp','application/pdf']` with a bilingual reject ("Unsupported file type / نوع الملف غير مدعوم") — server-side (AC-11). `getUploadPresignedUrl(key, { contentType })` sets no content-length-range → no size limit (AC-12, >10 MB accepted). The web sets the file `accept` filter to match for UX; the backend is the contract.
- 🟡 **Q7 (AC-12) — 10 MB limit deferred `[SPEC?]`.** No size limit at launch (the 10 MB config/prototype value is intentionally unenforced). No action unless the team later wants it (presign content-length-range). No blocker.

## Out of scope
Per `brief.md` Non-goals + `dependencies.md`:
- The admin review/approval workflow itself (reused unchanged; web only routes submissions into the existing queue).
- A web-vs-app source indicator in the admin panel (deferred to a later change).
- Defining any new profile fields or verification requirements (web mirrors the app's existing set).
- Sign-in / OTP (web-app/001).
- Supplier-specific onboarding beyond the shared verification path (renters only).
- What each tier unlocks elsewhere on the web (other epics).
- The prototype's `Account type` toggle, consent checkbox, and `Save for later` draft (not specced — AC win).
- Enforcing a document size limit (AC-12: none at launch).
