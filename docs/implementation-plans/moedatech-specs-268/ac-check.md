# AC Verification — Renter web onboarding & account tiers

**Card:** https://github.com/equiptal/moedatech-specs/issues/268
**Audited:** 2026-06-12
**Branch:** web-app/003-renter-onboarding
**HEAD:** 8fc8764

## Summary
- Met: 26
- Partial: 0
- Not met: 0
- Out of scope: 0

All 26 ACs are implemented. Fields/behaviour follow the app/AC; design follows the prototype. Notes flag where an AC is satisfied by construction (cross-surface reflection via the shared backend read) or enforced server-side (validation, type allowlist, pending-lock).

## Per-AC findings

### AC-01 — Account-creation form reachable for a guest
> Given a signed-in `guest` renter / When they open Create account from the home page, or are prompted by a tier-gated action / Then the account-creation form is shown / And their verified phone number is shown read-only

**Verdict:** Met
**Evidence:** `src/components/AppShell.tsx` (guest "Create account" entry) + `src/components/screens/GuestBlock.tsx` (002 gated prompt → `/onboarding?next=/`); `src/app/onboarding/page.tsx`; `OnboardingForm.tsx` phone field `readOnly value={user?.phone}`. Test: `app-authed.test.ts` (/api/me supplies phone).

### AC-02 — Required profile fields gate becoming basic
> …submit with first name, last name, city, or job title missing / Then submission is blocked / And the missing required field is flagged / And the renter remains a `guest`

**Verdict:** Met
**Evidence:** `OnboardingForm.tsx` client guards (firstName/lastName/city/jobTitle) set per-field `fe[...]`; backend `POST /users/me/profile` (completeProfileSchema) rejects with `E3000` → `app-backend-authed.ts` maps to `validation`. Test: `app-authed.test.ts` ("validation → code:validation").

### AC-03 — Profile field length bounds
> …a value outside its allowed length (first name 2–30, last name 2–50, city 2–100, job title 2–100) / Then that value is rejected / And a value within bounds is accepted

**Verdict:** Met
**Evidence:** `OnboardingForm.tsx` length checks (first 2–30, last 2–50) + `maxLength`; backend `completeProfileSchema` enforces all four bounds authoritatively (matches AC verbatim). **Notes:** city/job-title come from master-data selectors (valid values) with a free-text fallback (maxLength 100); the lower bound is enforced server-side and surfaced as the submit error.

### AC-04 — Optional email and WhatsApp
> …submit without an email or WhatsApp / Then submission is not blocked / And a WhatsApp number, if provided, must be a valid Saudi mobile number

**Verdict:** Met
**Evidence:** `OnboardingForm.tsx` — email/whatsapp omitted when blank (`|| undefined`); WhatsApp validated `^(\+?966|0)?5\d{8}$` only when present.

### AC-05 — Completing the profile makes the renter basic
> …all required profile fields … Then the renter's tier becomes `basic` / And a tier-gated action that prompted account creation is no longer blocked

**Verdict:** Met
**Evidence:** `src/app/api/profile/complete/route.ts:32-41` posts to `/users/me/profile`, re-reads `/users/me`, and `setUserCookie` with the new tier; `OnboardingForm` calls `refresh()` → 001 session re-reads → `canCreate` unblocks (tier `basic`). Backend `getUserTier`: basic ⇐ firstName && lastName && city && jobTitle.

### AC-06 — Return to prior action after becoming basic
> …reached account creation from a specific tier-gated action … Then they are returned to that action / And a guest who opened Create account directly lands on the web home

**Verdict:** Met
**Evidence:** `OnboardingForm.tsx` `router.replace(next.startsWith("/")? next : "/")`; `page.tsx` reads `next`; GuestBlock passes `?next=/`.

### AC-07 — Becoming basic on the web reflects on the app
> …becomes `basic` on the web … Then they are `basic` there too (one identity)

**Verdict:** Met
**Evidence:** profile-complete writes the shared backend user (`POST /users/me/profile`); no parallel state. **Notes:** verified by construction — the same record the mobile app reads; nothing web-specific.

### AC-08 — Verification gated behind basic
> …a guest … chooses Verify / Then they are routed to complete their profile first / And the verification form is not reachable until they are `basic`

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:109` — `if (tier === "guest") router.replace("/onboarding?next=/verify")`; AppShell only shows the "Verify" entry for `basic`.

### AC-09 — Verification required fields
> …submit without an authority role … or without a company name / Then submission is blocked / And the missing required field is flagged

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:143` (companyName 2–200) + authority-role selector (always set); backend `companyDetailsSchema` (authorityRole enum + companyName required). Test: `app-authed.test.ts` (submit forwards authorityRole/companyName).

### AC-10 — Both CR and VAT documents required
> …submit without the CR document or without the VAT document / Then submission is blocked / And the missing document is flagged

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:144-145` (`if (!crDocKey) … if (!vatDocKey) …`) + backend `crDocKey`/`vatDocKey` required.

### AC-11 — Accepted document types
> …`JPEG`/`PNG`/`WebP`/`PDF` … accepted / And a file of any other type is rejected with a bilingual (EN+AR) error

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx` DocUpload `accept="image/jpeg,image/png,image/webp,application/pdf"`; backend `getDocUploadUrl` `ALLOWED_CONTENT_TYPES` rejects others with "Unsupported file type / نوع الملف غير مدعوم"; client maps `validation` → `errors.docType`.

### AC-12 — No document size limit at launch
> …file larger than 10 MB / Then it is still accepted — no size limit

**Verdict:** Met
**Evidence:** presign passthrough only sends `{ filename, contentType }`; backend `getUploadPresignedUrl` sets no content-length-range. **Notes:** verified via app audit (plan Q7).

### AC-13 — Submission sets status pending
> …submit / Then their verification status becomes `pending` / And a pending state is shown

**Verdict:** Met
**Evidence:** `POST /users/me/company` sets `supplierStatus=1`; `VerificationFlow.tsx:178` `setStatus("pending")` → `StatePanel` pending. Test: `app-authed.test.ts` (submit → supplierStatus 1).

### AC-14 — Pending submission is locked
> …return to the verification surface / Then the submission is not editable / And they cannot resubmit while `pending`

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:191-193` — `status === "pending"` renders the terminal `StatePanel` (no form, no submit). Backend also rejects (`VERIFICATION_ALREADY_PENDING`).

### AC-15 — Optional verification fields accepted
> …optional details (national ID, company city, …) or optional documents / Then these are accepted / And their absence does not block

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx` optional `nationalId`/`companyCity` sent only when present; backend `companyDetailsSchema` optional fields. (Map coords / extra docs are optional in the schema; not surfaced in the UI — absence never blocks.)

### AC-16 — Approval makes the renter verified, reflected on both surfaces
> …an admin approves it / Then the renter's tier becomes `verified` / And shown on both web and mobile

**Verdict:** Met
**Evidence:** approval is admin-side (`handlers/trust/approveVerification` — out of web scope, AC-21); the web reflects it on the next `/api/me` read (`supplierStatusToVerification` → `verified`, tier `verified`). **Notes:** the web performs no approval action; it shows the verified state once the shared backend reports it.

### AC-17 — Rejection shows a generic state, no reason
> …an admin rejects it / Then the renter sees a generic rejected state inviting resubmission / And no specific rejection reason is shown

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:208-211` renders `v.rejectedBody` (generic) when `status === "rejected"`; the backend's `verificationRejectionReason` is intentionally **not** read/shown.

### AC-18 — Resubmit returns to pending and supersedes the prior submission
> …resubmit with company details and documents / Then status returns to `pending` / And the prior rejected submission is superseded

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:152` posts to `/api/verification/resubmit` when `status === "rejected"` → backend `POST /profile/resubmit-verification` (supersedes); `setStatus("pending")`.

### AC-19 — Already-verified renter revisiting the entry
> …a `verified` renter … opens the Verify entry / Then their verified state is shown / And no verification form is presented

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:186-189` — `status === "verified"` renders the verified `StatePanel`, no form.

### AC-20 — Pending renter revisiting the entry
> …a `pending` submission … opens the Verify entry / Then the pending state is shown / And they cannot resubmit

**Verdict:** Met
**Evidence:** `VerificationFlow.tsx:191-193` — pending `StatePanel`, no form/submit (per AC-14).

### AC-21 — Web verification enters the admin review queue
> …submits verification on the web / Then it enters the same admin verification review queue that app submissions use / And is reviewable there like an app submission

**Verdict:** Met
**Evidence:** `/api/verification/submit` → backend `POST /users/me/company` (`submitCompanyDetails`) — the same handler/queue the app uses; no web-specific path.

### AC-22 — Available in English and Arabic
> …language is English or Arabic … Then the screens are available in that language / And Arabic renders right-to-left

**Verdict:** Met
**Evidence:** `OnboardingShell.tsx` `dir={locale==="ar"?"rtl":"ltr"}` + langtog; `i18n/en.ts`+`ar.ts` `onboarding`/`verify` blocks; locale persists via the shared `LocaleProvider`.

### AC-23 — Offline / network failure on submit
> …a network failure occurs / Then a clear error is shown / And the renter's input is preserved / And no partial profile update or verification submission is created

**Verdict:** Met
**Evidence:** `OnboardingForm.tsx` + `VerificationFlow.tsx` catch the `fetch` rejection → `errors.offline`; React state retains all inputs; the single create POST never reaches the server (no partial submission). **Notes:** a doc may be uploaded before a failed submit, but no verification *submission* is created until the (atomic) submit succeeds.

### AC-24 — Profile completed on the app reflects on the web
> …became `basic` on the mobile app / When they open the web app / Then they are `basic` on the web, no profile re-entry

**Verdict:** Met
**Evidence:** `/api/me` reads the shared `/users/me` (tier from `getUserTier`); AppShell shows the basic state. Verified by construction (shared record).

### AC-25 — Verified on the app reflects on the web
> …approved as `verified` via the mobile app / When they open the web / Then shown as `verified`

**Verdict:** Met
**Evidence:** `/api/me` tier (`supplierStatus===2 → verified`); `/verify` shows the verified state.

### AC-26 — Verification status is consistent across surfaces
> …`pending` or rejected, submitted on either surface / Then the same status is shown on both web and app

**Verdict:** Met
**Evidence:** `/api/verification` reads the shared `supplierStatus` via `/users/me/profile-status`; `supplierStatusToVerification` maps it; the web shows pending/rejected identically. Test: `onboarding.test.ts` (mapper).
