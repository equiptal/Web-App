# UAT Verification — Renter web onboarding & account tiers

**Card:** https://github.com/equiptal/moedatech-specs/issues/268
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/003-renter-onboarding/
**Audited:** 2026-06-12
**Branch:** web-app/003-renter-onboarding
**HEAD:** 98a66f5

## Summary
- Met: 26
- Partial: 0
- Not met: 0
- Out of scope: 0

All 26 ACs are satisfied by current code. This UAT re-audit re-verified every AC against `HEAD 98a66f5` (which includes the post-implementation refinements: verification-form field order matched to the app, National Address document made required, company-city fixed 11-item dropdown). Two evidence updates vs the implementation-time `ac-check.md`: **AC-21** is now confirmed *empirically* (live staging queue read), and **AC-15** carries an explicit, user-approved deviation note (National Address required to mirror the app's validator).

## Per-AC findings

### AC-01 — Account-creation form reachable for a guest
**AC text (verbatim):**
> Given a signed-in `guest` renter / When they open Create account from the home page, or are prompted by a tier-gated action (e.g. RFQ create, web-app/002 AC-02) / Then the account-creation form is shown / And their verified phone number is shown read-only

**Verdict:** Met

**Evidence:**
- Implementation: `src/components/AppShell.tsx` (guest "Create account" entry) + `src/components/screens/GuestBlock.tsx` (002 gated prompt → `/onboarding?next=/`); `src/app/onboarding/page.tsx`; `OnboardingForm.tsx` phone field `readOnly value={user?.phone}`.
- Test: `tests/unit/app-authed.test.ts` (`/api/me` supplies phone) — pass.

---

### AC-02 — Required profile fields gate becoming basic
**AC text (verbatim):**
> Given a guest on the account-creation form (per AC-01) / When they submit with first name, last name, city, or job title missing / Then submission is blocked / And the missing required field is flagged / And the renter remains a `guest`

**Verdict:** Met

**Evidence:**
- Implementation: `src/components/onboarding/OnboardingForm.tsx` client guards (firstName/lastName/city/jobTitle) set per-field `fe[...]`; backend `POST /users/me/profile` (`completeProfileSchema`) rejects with `E3000` → `src/lib/api/app-backend-authed.ts` maps to `validation`.
- Test: `tests/unit/app-authed.test.ts` ("validation → code:validation") — pass.

---

### AC-03 — Profile field length bounds
**AC text (verbatim):**
> Given a guest on the account-creation form / When they enter a value outside its allowed length (first name 2–30, last name 2–50, city 2–100, job title 2–100 characters) / Then that value is rejected / And a value within bounds is accepted

**Verdict:** Met

**Evidence:**
- Implementation: `OnboardingForm.tsx` length checks (first 2–30, last 2–50) + `maxLength`; backend `completeProfileSchema` enforces all four bounds authoritatively (matches AC verbatim).

**Notes:** city/job-title come from selectors (valid values) with a free-text fallback (maxLength 100); the lower bound is enforced server-side and surfaced as the submit error.

---

### AC-04 — Optional email and WhatsApp
**AC text (verbatim):**
> Given a guest on the account-creation form / When they submit without an email or WhatsApp number / Then submission is not blocked for their absence / And a WhatsApp number, if provided, must be a valid Saudi mobile number to be accepted

**Verdict:** Met

**Evidence:**
- Implementation: `OnboardingForm.tsx` — email/whatsapp omitted when blank (`|| undefined`); WhatsApp validated `^(\+?966|0)?5\d{8}$` only when present.

---

### AC-05 — Completing the profile makes the renter basic
**AC text (verbatim):**
> Given a guest who has entered all required profile fields (per AC-02) / When they submit / Then the renter's tier becomes `basic` / And a tier-gated action that prompted account creation (per AC-01) is no longer blocked for them

**Verdict:** Met

**Evidence:**
- Implementation: `src/app/api/profile/complete/route.ts` posts to `/users/me/profile` (PUT), re-reads `/users/me`, and `setUserCookie` with the new tier; `OnboardingForm` calls `refresh()` → 001 session re-reads → `canCreate` unblocks. Backend `getUserTier`: basic ⇐ firstName && lastName && city && jobTitle.
- Test: `tests/unit/app-authed.test.ts` (profile complete path) — pass.

---

### AC-06 — Return to prior action after becoming basic
**AC text (verbatim):**
> Given a guest who reached account creation from a specific tier-gated action / When they become `basic` (per AC-05) / Then they are returned to that action / And a guest who opened Create account directly lands on the web home

**Verdict:** Met

**Evidence:**
- Implementation: `OnboardingForm.tsx` `router.replace(next.startsWith("/") ? next : "/")`; `onboarding/page.tsx` reads `next`; `GuestBlock` passes `?next=/`.

---

### AC-07 — Becoming basic on the web reflects on the app
**AC text (verbatim):**
> Given a guest who becomes `basic` on the web (per AC-05) / When they open the mobile app on the same account / Then they are `basic` there too (one identity)

**Verdict:** Met

**Evidence:**
- Implementation: profile-complete writes the shared backend user (`POST /users/me/profile`); no parallel web state.

**Notes:** Met by construction — the web writes the same user record the mobile app reads; tier is derived server-side by `getUserTier`.

---

### AC-08 — Verification gated behind basic
**AC text (verbatim):**
> Given a signed-in `guest` renter / When they choose Verify / Then they are routed to complete their profile first (per AC-01) / And the verification form is not reachable until they are `basic`

**Verdict:** Met

**Evidence:**
- Implementation: `src/components/onboarding/VerificationFlow.tsx:136` — `if (tier === "guest") router.replace("/onboarding?next=/verify")`; `AppShell.tsx` only shows the "Verify" entry for `basic`.

---

### AC-09 — Verification required fields
**AC text (verbatim):**
> Given a `basic` renter on the verification form / When they submit without an authority role (`owner` / `manager` / `employee`) or without a company name / Then submission is blocked / And the missing required field is flagged

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx:186` (companyName 2–200 → `fe.companyName`) + authority-role segmented selector (always set, defaults `owner`); backend `companyDetailsSchema` (authorityRole enum + companyName required).
- Test: `tests/unit/app-authed.test.ts` (submit forwards authorityRole/companyName) — pass.

---

### AC-10 — Both CR and VAT documents required
**AC text (verbatim):**
> Given a `basic` renter on the verification form / When they submit without the Commercial Registration document or without the VAT document / Then submission is blocked / And the missing document is flagged

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx:187-188` (`if (!crDocKey) next_fe.cr … if (!vatDocKey) next_fe.vat …`), CR/VAT `DocUpload` marked `required`; backend `crDocKey`/`vatDocKey` required in `companyDetailsSchema`.

---

### AC-11 — Accepted document types
**AC text (verbatim):**
> Given a renter uploading a verification document / When the file is a `JPEG`, `PNG`, `WebP`, or `PDF` / Then it is accepted / And a file of any other type is rejected with a bilingual (EN + AR) error

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` `DocUpload` `accept="image/jpeg,image/png,image/webp,application/pdf"`; backend `getDocUploadUrl` `ALLOWED_CONTENT_TYPES` rejects others with "Unsupported file type / نوع الملف غير مدعوم"; client maps `validation` → `v.errors.docType` (EN+AR via i18n).

---

### AC-12 — No document size limit at launch
**AC text (verbatim):**
> Given a renter uploading a verification document / When the file is larger than 10 MB / Then it is still accepted — no size limit is enforced at launch

**Verdict:** Met

**Evidence:**
- Implementation: presign passthrough sends only `{ filename, contentType }` (`src/app/api/profile/doc-upload-url/route.ts`); backend `getUploadPresignedUrl` sets no content-length-range.

**Notes:** confirmed by app audit (plan Q7). The 10 MB config/prototype value is intentionally unenforced (deferred [SPEC?]).

---

### AC-13 — Submission sets status pending
**AC text (verbatim):**
> Given a `basic` renter who has completed all required verification fields and both documents (per AC-09, AC-10) / When they submit / Then their verification status becomes `pending` / And a pending state is shown

**Verdict:** Met

**Evidence:**
- Implementation: `POST /users/me/company` sets `supplierStatus=1`; `VerificationFlow.tsx:229` `setStatus("pending")` → `StatePanel` pending.
- Test: `tests/unit/app-authed.test.ts` (submit → supplierStatus 1) — pass.

---

### AC-14 — Pending submission is locked
**AC text (verbatim):**
> Given a renter with a `pending` verification submission (per AC-13) / When they return to the verification surface / Then the submission is not editable / And they cannot resubmit while `pending`

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` — `status === "pending"` renders the terminal `StatePanel` (no form, no submit). Backend also rejects with `VERIFICATION_ALREADY_PENDING`.

---

### AC-15 — Optional verification fields accepted
**AC text (verbatim):**
> Given a `basic` renter on the verification form / When they add optional details (national ID, company city, company address, map coordinates) or optional documents / Then these are accepted / And their absence does not block submission

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` — national ID (text), company city (fixed 11-item dropdown matching the app), company address (auto-filled from the map picker), map coordinates (`loc.lat/lng`), and the optional documents (Local Content, SASO, Other) are all sent only when present (`… || undefined`) and never gate submission. Backend `companyDetailsSchema` marks them optional.

**Notes / deviation:** The **National Address document** is the one document promoted from optional to **required** in the web form (`VerificationFlow.tsx:189`), to mirror the mobile app's validator (`company_verification_page.dart:302` + `*` label). AC-10 enumerates only CR/VAT as required and AC-15 implies documents are otherwise optional; the requiredness here follows acceptance.md's governing meta-rule — *"Field/document requirements mirror the mobile app's validators; values carry into the web surface unchanged."* This was an explicit product decision (Yara, 2026-06-12) confirmed against the app's code. The fields AC-15 *explicitly lists* (national ID, company city, company address, map coords) all remain optional and non-blocking. Company address is now captured via the map picker's reverse-geocode rather than a standalone text input — still accepted, absence still non-blocking.

---

### AC-16 — Approval makes the renter verified, reflected on both surfaces
**AC text (verbatim):**
> Given a renter with a `pending` submission (per AC-13) / When an admin approves it / Then the renter's tier becomes `verified` / And the `verified` tier is shown on both the web and the mobile app

**Verdict:** Met

**Evidence:**
- Implementation: approval is admin-side (`handlers/trust/approveVerification` — out of web scope, AC-21); the web reflects it on the next `/api/me` read (`supplierStatusToVerification` → `verified`, tier `verified`).

**Notes:** the web performs no approval action; it shows the verified state once the shared backend reports `supplierStatus=2`.

---

### AC-17 — Rejection shows a generic state, no reason
**AC text (verbatim):**
> Given a renter with a `pending` submission / When an admin rejects it / Then the renter sees a generic rejected state inviting resubmission / And no specific rejection reason is shown

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` renders the generic `v.rejectedBody` banner when `status === "rejected"`; the backend's rejection reason is intentionally **not** read or shown.

---

### AC-18 — Resubmit returns to pending and supersedes the prior submission
**AC text (verbatim):**
> Given a renter whose submission was rejected (per AC-17) / When they resubmit with company details and documents (per AC-09, AC-10) / Then their verification status returns to `pending` / And the prior rejected submission is superseded

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx:196` posts to `/api/verification/resubmit` when `status === "rejected"` → backend `POST /profile/resubmit-verification` (`supersedePreviousRejections` then creates a fresh PENDING queue row); `setStatus("pending")`.

---

### AC-19 — Already-verified renter revisiting the entry
**AC text (verbatim):**
> Given a `verified` renter / When they open the Verify entry / Then their verified state is shown / And no verification form is presented

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` — `status === "verified"` renders the verified `StatePanel`, no form.

---

### AC-20 — Pending renter revisiting the entry
**AC text (verbatim):**
> Given a renter with a `pending` submission / When they open the Verify entry / Then the pending state is shown / And they cannot resubmit (per AC-14)

**Verdict:** Met

**Evidence:**
- Implementation: `VerificationFlow.tsx` — pending `StatePanel`, no form/submit (per AC-14).

---

### AC-21 — Web verification enters the admin review queue
**AC text (verbatim):**
> Given a renter submits verification on the web (per AC-13) / When the submission is created / Then it enters the same admin verification review queue that app submissions use / And it is reviewable there like an app submission

**Verdict:** Met

**Evidence:**
- Implementation: `src/app/api/verification/submit/route.ts` → backend `POST /users/me/company` (`submitCompanyDetails`) — the same handler that, after upserting the supplier profile, calls `verificationRepository.create(...)` writing a `verification_queue` row with `status=PENDING` (the same queue the app uses; no web-specific path).
- **Empirical confirmation (2026-06-12):** read-only query of the staging DB (`moedatech-staging-db`, `prisma.verificationQueue`) showed live rows in tenant `default` — 4 `PENDING` (incl. a submission timestamped the same day), 41 `APPROVED`, plus rejected/superseded. Web posts to the staging backend (`c4tupvmckc…eu-central-1`) and sends `X-Tenant-Id: default`, identical to mobile, so submissions land in the same queue.

**Notes:** Queue *visibility in the admin UI* depends on which environment the admin panel (separate `apps/backend-admin` stack) is pointed at; this is an admin-deployment concern, not a web-side gap.

---

### AC-22 — Available in English and Arabic
**AC text (verbatim):**
> Given the renter's language is English or Arabic / When they use the onboarding or verification screens / Then the screens are available in that language / And Arabic renders right-to-left

**Verdict:** Met

**Evidence:**
- Implementation: `OnboardingShell.tsx` `dir={locale === "ar" ? "rtl" : "ltr"}` + language toggle; `src/lib/i18n/en.ts` + `ar.ts` `onboarding`/`verify` blocks (incl. the new `docsTitle`/`moreDocsTitle`/`detailsTitle`/`cityPlaceholder` keys + the 11 city labels in both locales); locale persists via the shared `LocaleProvider`.
- Test: `tests/unit/auth-i18n.test.ts` (en/ar dictionaries match) — pass.

---

### AC-23 — Offline / network failure on submit
**AC text (verbatim):**
> Given a renter submitting a profile or a verification / When a network failure occurs / Then a clear error is shown / And the renter's input is preserved / And no partial profile update or verification submission is created

**Verdict:** Met

**Evidence:**
- Implementation: `OnboardingForm.tsx` + `VerificationFlow.tsx` catch the `fetch` rejection → `v.errors.offline`; React state retains all inputs; the single create POST never reaches the server on a network failure (no partial submission).

**Notes:** a document may be uploaded (to S3) before a failed submit, but no verification *submission* (queue row / supplierStatus change) is created until the atomic submit POST succeeds.

---

### AC-24 — Profile completed on the app reflects on the web
**AC text (verbatim):**
> Given a renter who became `basic` on the mobile app / When they open the web app on the same account / Then they are `basic` on the web, with no profile re-entry required

**Verdict:** Met

**Evidence:**
- Implementation: `/api/me` reads the shared `/users/me` (tier from `getUserTier`); `AppShell` shows the basic state. Met by construction (shared record).

---

### AC-25 — Verified on the app reflects on the web
**AC text (verbatim):**
> Given a renter approved as `verified` via the mobile app / When they open the web app on the same account / Then they are shown as `verified` on the web

**Verdict:** Met

**Evidence:**
- Implementation: `/api/me` tier (`supplierStatus === 2 → verified`); `/verify` shows the verified state.

---

### AC-26 — Verification status is consistent across surfaces
**AC text (verbatim):**
> Given a renter whose verification is `pending` or rejected, submitted on either surface / When they view their verification status on the other surface / Then the same status is shown on both web and app (pending shows pending; rejected shows the generic rejected state)

**Verdict:** Met

**Evidence:**
- Implementation: `src/app/api/verification/route.ts` reads the shared `supplierStatus` via `/users/me/profile-status`; `supplierStatusToVerification` maps it; the web shows pending/rejected identically.
- Test: `tests/unit/onboarding.test.ts` (`supplierStatusToVerification` mapper) — pass.
