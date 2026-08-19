# Tickets — Company documents, single-pile submission (web)

Port the mobile app's redesigned company-verification flow to the web: replace the 6-slot labelled
form with one **unlabeled pile** of documents that RelayPanel classifies, and file the result back
onto the profile.

**Source of truth:** `Moedatech-App` / `origin/staging` (re-read 2026-08-18 at `cf7be880`) and
`moedatech-equipment-intake` / `origin/main` (`096db19`). Where a decision is not covered there,
ask — do not invent.

**Repos touched:** `Web-App` · `Moedatech-App` (apps/backend) · `moedatech-equipment-intake`
(Relay) — how much of the last two depends on which lane is chosen in §0.

> **Revision 2 — what changed on staging since this plan was first written.** Eleven commits landed
> on `Moedatech-App/staging` and eleven on Relay's `main`, four of which change this plan
> materially:
>
> 1. **A real company lane now exists and queues itself.** `RELAY_SUPPORTED_DOC_LANES` gained
>    `'company'`; Relay resolves `docLane: 'company'` from a non-`mobile*` source to
>    `company-webapp`, and `relayQueue.processSubmission` branches on `isCompanySource` into
>    `processCompanySubmission` → `runCompanyPresort`. No operator has to press anything. See §0.
> 2. **A new guard: `assertMayVerifyOwnCompany`.** A user who belongs to a company they do not own
>    can no longer submit one — `COMPANY_MEMBER_CANNOT_VERIFY` (`CO1013`, HTTP 409). New ticket T12.
> 3. **The document read opened up.** `getVerificationDocUrls` used to demand `supplierStatus === 2`;
>    it now serves 1, 2 and 3 and refuses only 0 (`VERIFICATION_NOT_SUBMITTED`, `E8017`, 403). The
>    mobile pending card became tappable into a read-only details screen. New ticket T13.
> 4. **The reviewer's rejection reason is now shown to the supplier**, on the profile card and as a
>    banner above the upload screen, and it is cleared when a rejected pile is resubmitted. New
>    ticket T14.
>
> Also noted, not blocking: AWS resources migrated `me-south-1` → `eu-central-1`; a
> `scripts/require-stage.mjs` deploy guard landed; the partner (Supplier OS) lane learned to accept
> pile payloads, which is the closest precedent for the web and is quoted throughout below.

## What changes, in one paragraph

Today the web asks the renter to name each document, uploads each to the marketplace bucket via
`POST /profile/doc-upload-url`, and sends the keys to `POST /users/me/company`. After this change the
renter sends **one batch of unlabeled files** into RelayPanel's ingest lane, and the only fields the
web still collects are the ones no document can answer: authority role (required), national ID, city,
and the company logo. Legal name, CR number, VAT number and expiry dates are read off the documents
by Relay's classifier and written back via `PATCH /admin/users/{id}/supplier-docs`.

## The two-step submit, and why it is two steps

1. **Identity** — `POST /users/me/company` with `authorityRole` plus optional `nationalId`,
   `companyCity`, `companyLogoKey`, and **no document keys at all**. The backend discriminates the two
   payload shapes on the absence of document keys (`profile.schema.ts` → `isPileCompanySubmission`).
   Sets `supplierStatus = 1` and opens the verification queue row.
2. **The pile** — presign → PUT each file → complete.

Step 2 is the fragile one (up to 10 files on a domestic uplink). Step 1 is a single small JSON POST
and is idempotent for the pile shape: `submitCompanyDetails` exempts the pile from the
`VERIFICATION_ALREADY_PENDING` guard (`profile.service.ts`) so a retry after a failed upload is legal.

Sending **one** document key in step 1 flips the payload into the labelled shape, which then demands
CR + VAT + a legal name and rejects the submission. `companyLogoKey` is deliberately not a document
key — a logo is branding, not evidence.

---

## Section 0 — Choose the lane (decide before any code)

There are now two working tracks into RelayPanel, and they are not variants of one thing.

### Option A — mobile's track (`source: mobile_company_submission`)

The pile rides the equipment-shaped row tagged `metadata.origin: "COMPANY_DOCS"`. An operator sees a
purple **Company docs** badge and must press **Run company check**
(`POST /api/review/company-presort/from-submission/:id`, which 409s on any other origin).

To use it from the web:
- Relay: add the web source to **both** `isCompanyDocs` and `isMobile` (`server/src/index.ts:4316-4317`).
  `isCompanyDocs` alone is not enough — `origin` is `!isMobile ? null : …`, so the row would store as
  `supplier-os` with no badge, no company-check action, and the wrong S3 prefix, at HTTP 200.
- app-backend: add `'web_company_submission'` to `RELAY_SOURCES`, keep it **out** of
  `RELAY_RETRY_UNTAGGED_SOURCES`, and widen the role-gate skip at
  `handlers/relay-submissions/presign.ts:49` or `requireSupplierRole` 403s every renter.

Cost: two repos changed, and every web pile still waits for an operator's click.

### Option B — the company lane (`docLane: 'company'`) — **recommended**

Relay already routes this and works it automatically: `COMPANY_SOURCES = ['company-manual',
'company-mobile', 'company-webapp']`, and a `docLane: 'company'` presign from a non-`mobile*` source
resolves to `company-webapp`, which `processSubmission` sends straight to `runCompanyPresort`.

To use it from the web:
- app-backend: add `'web_company_submission'` to `RELAY_SOURCES` (our own Zod enum — Relay never needs
  to know the string, it only cares that it is not `mobile*`), and forward `docLane` from the body in
  `handlers/relay-submissions/presign.ts`, mirroring `handlers/partner/submissions.ts:93-107`
  including its 400 `RELAY_LANE_UNSUPPORTED` guard for an unsupported lane.
- Relay: **nothing** for routing. One small correctness fix is worth doing anyway — see P2.

Cost: one repo, ~10 lines. Benefit: the pile is presorted the moment it lands.

⚠️ Do **not** send `docLane: 'company'` with a mobile source or with no source at all: the handler
defaults to `RELAY_DEFAULT_SOURCE = 'mobile'`, which makes `isMobile` true and resolves the lane to
`company-mobile` — a browser upload filed as a phone upload. Relay's own schema comment says exactly
this and tells us not to harmonise the two tracks.

⚠️ Option B is a deliberate divergence from "follow the app exactly". The app is on Option A because
its flow predates the company lane; Relay's own comments describe the OS/webapp lane as the better of
the two tracks. **Decision needed** before T1.

### P1 — app-backend: source value + docLane pass-through
**Scope:** `Moedatech-App` / `apps/backend` · blocking
**Description:** as listed under the chosen option. Both edits are in
`src/validators/relay-submission.schema.ts` and `src/handlers/relay-submissions/presign.ts`. Keep the
new source out of the untagged-retry set: that fallback re-sends as `source: 'mobile'`, which Relay
maps to `origin: STORE` — a company's CR and VAT filed as equipment documents against their machines.

**Given/When/Then:**
- Given a renter (activeRole 1) with a valid session, When the web presigns, Then it succeeds instead
  of 403 (Option A) / Then the lane is forwarded and the row stores as `company-webapp` (Option B).
- Given `docLane: 'quarry'`, Then 400 `RELAY_LANE_UNSUPPORTED`, not a silent fall-through to equipment.
- Given a Relay 4xx on this source, Then the error surfaces as-is — no untagged retry.
- Given the existing mobile and OS callers, Then their behaviour is byte-identical (regression).

### P2 — Relay: name the company sources in the userRef lookup
**Scope:** `moedatech-equipment-intake` / `server/src/index.ts:4643` · recommended with Option B
**Description:** `NUMERIC_USER_REF_SOURCES = new Set(["mobile", "supplier-os", "operator-webapp",
"operator-mobile"])` — `company-webapp` and `company-mobile` are missing, so a company-lane row gets
no name or phone lookup and the operator sees a bare numeric ref. This is precisely the omission the
set's own comment says has been made four times. Add both.

Note the presign payload carries a name too, but the partner handler resolves it from
`supplierProfile.companyName` alone (no legal-name or person-name fallback, unlike
`relay-submissions/presign.ts`), so a renter who never set a trade name arrives nameless without this.

**Given/When/Then:**
- Given a `company-webapp` row for user 2544, Then the inbox shows their name and phone, not a bare id.

### Deploy order
**Relay (if touched) → app-backend (P1) → web.** Reversed, every browser pile either 400s at the Zod
enum or lands mislabeled, and the fallback that would normally soften that is disabled on purpose.

---

## Section 1 — Web BFF

### T1 — presign proxy
**Scope:** BFF — new `src/app/api/verification/pile/presign/route.ts`
**Description:** `POST`, wrapped in `withAuthedBackend`, forwarding to
`POST /suppliers/me/relay-submissions/presign`. Same shape as
`src/app/api/profile/doc-upload-url/route.ts`.

Client body: `{ files: [{ name, type, size }] }`. **The route injects the source itself** —
`web_company_submission` — and, under Option B, `docLane: "company"`. Never trust a client-supplied
source: it is a claim about who is calling. Response, unwrapped from the backend's `{ data }`
envelope: `{ submissionId, uploads: [{ fileName, key, mode, url }] }`, one per declared file, in
order. Errors keep their status and code — 502 `RELAY_UNAVAILABLE` and 4xx `RELAY_INGEST_ERROR` mean
different things to the user.

**Given/When/Then:**
- Given 3 valid files, Then the response carries a `submissionId` and 3 uploads in the same order.
- Given a client that posts its own `source` or `docLane`, Then both are ignored and the route's own
  values are sent.
- Given the backend returns 502 `RELAY_UNAVAILABLE`, Then the route returns 502 with that code.
- Given an unauthenticated caller, Then `appAuthErrorResponse` handles it with no backend call.

### T2 — complete proxy
**Scope:** BFF — new `src/app/api/verification/pile/[id]/complete/route.ts`
**Description:** forwards `{ files: [{ key, name }] }` to
`POST /suppliers/me/relay-submissions/{id}/complete`.

**409 is success.** A dropped response on a completed submission re-completes and Relay answers 409
"already received"; the app treats that as done (`supplier_store_repository_impl.dart:378-383`).
Mirror it here or in T3 — otherwise a lost response turns a delivered pile into a permanent failure
on screen.

**Given/When/Then:**
- Given every file uploaded, When complete is called, Then the ledger row moves to `received`.
- Given complete is called twice, Then the second call resolves as success.

### T3 — the upload helper
**Scope:** Web lib — new `src/lib/api/company-pile.ts`
**Description:** the TypeScript port of `_uploadPile` (`company_docs_submission_bloc.dart:349`).
`uploadBidFiles` (`src/lib/api/client.ts:557`) is the right shape but not reusable: `Promise.all` plus
throw, all-or-nothing, no session — a partial failure loses every successful PUT.

```ts
export const COMPANY_PILE_MAX_FILES = 10;                 // the app's cap
export const COMPANY_PILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const COMPANY_PILE_MAX_BYTES = 100 * 1024 * 1024;  // Relay's mode:"put" ceiling

export interface PileSession {
  submissionId: string;
  uploads: { fileName: string; key: string; url: string }[];
  presignedNames: string[];      // the file list this session was presigned for
  uploadedIndexes: Set<number>;
}
export async function uploadCompanyPile(
  files: File[],
  prior?: PileSession,
): Promise<{ ok: boolean; session: PileSession; failedIndexes: Set<number> }>;
```

1. **Validate before any round trip** — non-empty, ≤ 100 MB, allowed type; refuse the batch with a
   distinguishable reason (`unsupported_type` / `too_large` / `empty`).
2. **Reuse a prior session** when the file list is unchanged (compare name + size — safer than name
   alone in a browser). Presigned URLs live ~15 minutes.
3. **Presign** otherwise; throw if the target count does not match the file count.
4. **PUT only what is missing**, at most **5 concurrent**, each with an explicit `Content-Type`. A
   failed PUT records an index and must not reject the helper.
5. **Return the session** when files remain, so the next attempt re-PUTs only the failures.
6. **Complete** with every upload's `{ key, name }`.

**Given/When/Then:**
- Given 4 files and 2 dropped PUTs, Then `ok` is false, both indexes are reported, and the session
  holds the submissionId and the 2 successes.
- Given that session and the same files, Then only the 2 failures are re-PUT and complete runs once.
- Given that session and a changed file list, Then a fresh presign is requested.
- Given an 11th file or a 120 MB PDF, Then the batch is refused before any network call.

---

## Section 2 — Web UI

### T4 — identity modal
**Scope:** Web UI — new `src/components/onboarding/CompanyIdentityModal.tsx`
**Description:** mirrors `company_docs_identity_sheet.dart`. Opens **after** Send, before the
confirmation. Dismissing it returns to the populated form and sends nothing.

- **Role** — three equal-size chips, least authority first: *Non-authorized employee* (`employee`),
  *Authorized employee* (`manager`), *Owner* (`owner`). Wire values unchanged; only the labels differ
  from the old form. The one required answer — Continue disabled until one is chosen.
- **National ID / Iqama** — optional, max 20, LTR.
- **City** — the same 11-option dropdown the current form has (`VerificationFlow.tsx:94-108`),
  identical wire values to the app's list.
- **Company logo** — optional; move the existing block (`VerificationFlow.tsx:147-187`) unchanged:
  220px PNG, uploaded on pick via `/api/profile/doc-upload-url`, returns a key. A logo failure
  notifies and never blocks the pile.

No company name, no CR number, no address, no map pin, no company email — the documents answer the
first four and `companyDetailsSchema` has never had a field for the fifth. The app gates the logo on
rentees only; the web session is renter-only by construction, so it always shows, which matches the
app for the same user.

**Given/When/Then:**
- Given the modal opens, Then no role is preselected and Continue is disabled.
- Given a role and nothing else, Then Continue returns `{ role }` with the rest absent, not empty
  strings.
- Given a failed logo upload, Then a notice is shown and Continue still works without a logo.

### T5 — confirm dialog
**Scope:** Web UI — new `src/components/onboarding/CompanyDocsConfirmDialog.tsx`
**Description:** warning triangle, bold centred headline, neutral time pill, divider, two buttons.
App copy: *"Not uploading the required company documents may lead to your registration being
rejected"* / *"We review and get back to you within 24–48 hours"* / *"Confirm and send"*.

⚠️ The 24–48h figure is carried over from the equipment flow and is flagged in the app as an open
question (`company_docs_identity_sheet.dart:463`). Confirm the real SLA before release.

### T6 — the pile screen
**Scope:** Web UI — rewrite `src/components/onboarding/VerificationFlow.tsx`
**Description:** hero → required tiles → **one dropzone** → optional tiles → one send button.

- **Reference tiles**, informational only, never tappable, no checkmarks: required — *Commercial
  Registration*, *National Address*, *VAT*; additional — *Bank details*, *Local Content*,
  *Qualifications*, *SASO certificate*. Nothing is validated per document type in the browser, so a
  checkmark on one tile is a false positive for the rest.
- **Dropzone** — ~~reuse `src/components/bid/FileUploader.tsx`~~. **Corrected during implementation:**
  that component is bolted to the bid-form lane (`uploadBidFiles`, a public `token`, a 10 MB cap) and
  cannot presign against this route, so the screen carries its own drop area — drag-and-drop plus a
  picker, in the same visual language. Cap at 10 with the limit message; adding or removing a file
  **invalidates any held presign session**.
- **Send** — enabled at one file. Order: identity modal → confirm dialog → `POST
  /api/verification/submit` (skipped if identity already accepted this session) → `uploadCompanyPile`.
- **Failure** — stay on the screen with the pile intact, mark the failed files, show the error, let
  the same button retry. **Do not navigate and do not re-fetch `/api/verification`** — a refetch
  renders the pending panel, because identity has already flipped `supplierStatus` to 1, and the
  retry path is gone. See §The pending rule.
- **In-flight guard** — a `beforeunload` warning while an upload is running or half-failed.
- **Sent state** — a terminal panel replacing the form; no route back into a populated form. The app
  uses a full screen rather than a dismissible sheet precisely to make a duplicate submit impossible.
- **Prefill** — keep reading `/api/verification` for role, national ID, city and logo; ignore every
  document key.
- **Rejection banner** — see T14.

**Given/When/Then:**
- Given no files, Then Send is disabled. Given 10 files, Then the 11th is refused with the limit
  message.
- Given a file removed after a failed attempt, Then the next attempt presigns fresh.
- Given identity succeeded and the upload failed, When Send is pressed, Then no second identity POST
  is made and only the failed files are re-PUT.
- Given every file uploads, Then the terminal panel replaces the form and back-navigation cannot
  reach it.
- Given a reload mid-upload, Then the browser warns first.

### T7 — remove the labelled form
**Scope:** Web UI / cleanup
**Description:**
- Delete the six `DocUpload` slots and their validation, and the `DocUpload` component — no other
  caller remains.
- Delete the `status === "rejected" ? "/api/verification/resubmit" : …` branch. The app's rejected CTA
  re-enters the same pile screen and posts to `/users/me/company`. This is now documented on the
  backend too (`handlers/partner/submitVerification.ts`): `resubmitVerification` **cannot run a
  pile** — it calls `verificationRepository.create` rather than `upsertPending`, so a retry stacks a
  second open row and is then refused, it names the queue row from a legal name a pile never
  collects, and it records no `submissionSource`. **Leave the resubmit route file in place** (retiring
  it is a separate decision) but the pile flow must not call it.
- Delete `const LOGO_UPLOAD_ENABLED = true` (`:19`) and its conditional.

**Given/When/Then:**
- Given a rejected renter, When they resubmit, Then the request goes to `/api/verification/submit`.
- Given `tsc --noEmit` and `next lint`, Then no unused import or dead export remains.

### T8 — copy, EN + AR
**Scope:** Web i18n — `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`
**Description:** add a `verify.pile` block, reusing the app's strings verbatim — same product, same
voice, reviewed Arabic. Sources: `apps/mobile/lib/l10n/app_en.arb` / `app_ar.arb`.

| web key (`verify.pile.*`) | app key | EN |
|---|---|---|
| `title` | `companyDocsTitle` | Add company documents |
| `heroTitle` | `companyDocsHeroTitle` | Upload your documents in one go |
| `heroSubtitle` | `companyDocsHeroSubtitle` | Send us everything you have — our team will review it and confirm your request. |
| `requiredSection` | `companyDocsRequiredSection` | Required to continue |
| `reqCr` / `reqNationalAddress` / `reqVat` | `companyDocsReq*` | Commercial Registration / National Address / VAT |
| `optionalSection` | `companyDocsOptionalSection` | Additional documents |
| `optBank` / `optLocalContent` / `optQualifications` / `optSaso` | `companyDocsOpt*` | Bank details / Local Content / Qualifications / SASO certificate |
| `dropzoneTitle` | `companyDocsDropzoneTitle` | Drag or upload your documents here |
| `dropzoneSubtitle` | `companyDocsDropzoneSubtitle` | Commercial registration, national address, tax, and any extra documents — in one batch |
| `limitReached` | `companyDocsLimitReached` | Maximum reached ({count} documents) |
| `submit` | `companyDocsSubmit` | Send documents |
| `identityTitle` | `companyDocsIdentityTitle` | A quick confirmation of your identity |
| `roleLabel` | `companyDocsRoleLabel` | Your role at the company |
| `roleEmployee` / `roleManager` / `roleOwner` | `companyDocsRole*` | Non-authorized employee / Authorized employee / Owner |
| `nationalIdLabel` | `companyDocsNationalIdLabel` | National ID / Iqama number |
| `continue` | `companyDocsContinue` | Continue |
| `confirmHeadline` | `companyDocsConfirmHeadline` | Not uploading the required company documents may lead to your registration being rejected |
| `confirmEstimate` | `companyDocsConfirmEstimate` | We review and get back to you within 24–48 hours |
| `confirmSubmit` | `companyDocsConfirmSubmit` | Confirm and send |
| `sentTitle` | `companyDocsSubmittedTitle` | Documents sent |
| `sentBody` | `companyDocsSubmittedBody` | Our team will review your request within 24 to 48 hours, and we'll let you know if we need anything else. |
| `logoNote` | `companyLogoNote` | Appears on your quotations, your shared request link, and the bid form suppliers open. |

For T13/T14, the app also added: `viewSubmittedDetails` ("Your submitted documents & company info"),
`verificationUnderReviewTitle` ("Under review"), `verificationNoDocsOnFileTitle` ("No documents
received yet"), `verificationNoDocsOnFileBody` and `…BodySettled`. Arabic for every key is in
`app_ar.arb`.

Web-only strings with no app equivalent: the partial-failure message, the per-file retry hint, the
`beforeunload` prompt, and the type/size rejection reasons. Write both languages in the same block.

Retire only the per-document labels (`crDoc`, `vatDoc`, `nationalAddressDoc`, `localContentDoc`,
`sasoDoc`, `otherDoc`, `docsTitle`, `moreDocsTitle`) and their errors (`cr`, `vat`,
`nationalAddress`, `companyLegalName`). The city names and the pending / verified / rejected panels
keep their keys.

**Given/When/Then:**
- Given `locale === "ar"`, Then every string renders in Arabic with no English fallback.
- Given the EN and AR objects, Then their key sets are identical.

### T9 — tests
**Scope:** Web tests — `tests/unit/`, vitest (`npm test`)
**Description:** port the 13 bloc cases from
`apps/mobile/test/features/profile/presentation/bloc/company_docs_submission_bloc_test.dart`, driving
real PUTs against a local stub server rather than mocking the transport.

1. pile cap; 2. file removal; 3. out-of-range removal is a no-op; 4. any pile change invalidates the
session; 5. identity held until submit; 6. refused with no role; 7. refused with no files; 8. happy
path with the session cleared afterwards; 9. **the source is exactly `web_company_submission`** (and,
under Option B, `docLane` is `company`); 10. presign failure → failure state, nothing completed;
11. one PUT fails → session and failed index survive; 12. retry re-PUTs only the failure, does not
re-post identity, completes once; 13. a 409 from complete is success.

Plus, per proxy: the client cannot override `source`/`docLane`, and a backend 502 surfaces as 502.
Plus T12: a 409 `CO1013` renders the member message, not the generic submit error.

---

## Section 3 — New since revision 1

### T12 — the company-member guard
**Scope:** BFF error mapping + Web UI + i18n
**Description:** `assertMayVerifyOwnCompany` (`company.service.ts:105`) now runs inside
`submitCompanyDetails` and `resubmitVerification`, **after** the pending/approved guards and before
any write. A user with a `companyMember` row for a company they do not own gets
`COMPANY_MEMBER_CANNOT_VERIFY` — `CO1013`, **HTTP 409**:

> You belong to a company you do not own. Only its owner submits it for verification — leave it
> first to submit a company of your own.

The backend already carries EN + AR text, so surface its message rather than inventing one; add a web
string only for the fallback. Better still, do not let them reach the form: the web already knows
membership through `/api/me/company` (join / members / leave routes exist), so the verify entry point
should read "your company is verified through its owner" for a non-owner member. A member inherits the
company's verified standing and keeps `supplierStatus === 0`.

**Given/When/Then:**
- Given a non-owner member, When they submit, Then the 409 message is shown and no pending row is
  created.
- Given a non-owner member, When they open the verification entry point, Then the form is not offered.
- Given a solo renter with no membership, Then nothing changes.

### T13 — pending and rejected can read what they sent
**Scope:** BFF + Web UI
**Description:** `getVerificationDocUrls` no longer requires approval — it serves `supplierStatus` 1,
2 and 3, and refuses only 0 with `VERIFICATION_NOT_SUBMITTED` (`E8017`, 403). The rationale in the
service is worth quoting: *"Approval is not what makes a supplier's own papers readable to them;
submitting them is."*

Two changes follow:
- `src/app/api/verification/docs/route.ts` — the header comment still says verified-only; update it,
  and stop treating a non-200 as "return nulls" for statuses that now legitimately answer. **As built:**
  the route answers `{ submitted: boolean, …urls }`, mapping the backend's `E8017`
  ("never submitted") to `submitted: false` with null URLs rather than a 403, so the screen can ask on
  every load without logging an error for a renter who simply has not applied. Any other failure still
  surfaces.
- The pending panel gains a read-only view of the documents on file, mirroring the app's now-tappable
  pending card → details screen. Where nothing has landed yet, use the app's own copy: *"No documents
  received yet"*.

**Given/When/Then:**
- Given a pending renter whose pile completed, Then the panel lists the documents on file with working
  presigned links.
- Given a pending renter whose upload never completed, Then the panel says no documents were received
  yet — not an error, and not an empty box.
- Given `supplierStatus === 0`, Then the route returns nulls and the panel is not shown.

### T14 — the rejection reason
**Scope:** BFF + Web UI + i18n
**Description:** `GET /users/me/profile-status` returns `verificationRejectionReason`
(`profile.service.ts:360`), and the app now shows it in two places: on the profile card, and as a
danger-tinted banner **above the hero** on the upload screen, read once on mount (`supplierStatus ===
3` and a non-empty reason only). Read once on purpose: submitting flips the profile to pending, so a
live subscription would pull the banner out from under the user mid-upload.

`src/app/api/verification/route.ts` does not project the field today — add it. Then render the banner
above the form for a rejected renter, replacing the current generic "wasn't approved" line when a
reason exists.

Note the backend now **clears** the reason when a rejected pile is resubmitted through
`submitCompanyDetails`, so a stale complaint no longer travels with a pending row.

**Given/When/Then:**
- Given a rejected renter with a reason on file, Then the banner shows the reviewer's words above the
  form, and the generic line is not shown.
- Given a rejected renter with no reason recorded, Then the existing generic line is shown.
- Given they resubmit, Then the reason is gone from the next status read, and the banner does not
  reappear mid-upload.

---

## Section 4 — Optional parity

### T15 — "N under review" banner
**Scope:** BFF + UI
**Description:** the app counts in-flight submissions from
`GET /suppliers/me/relay-submissions/pending-count`. Relay now excludes company piles from that count
by **either** signal (`metadata.origin === "COMPANY_DOCS"` or a source in `COMPANY_SOURCES`), so the
number is about equipment only — do not reuse it as a verification indicator.

### T16 — analytics
**Scope:** Web · decision needed
**Description:** the app fires `company_docs_upload_started` (first file — the funnel denominator),
`_submitted` (doc count, role, whether a national ID was given, seconds in flow) and `_failed` (count,
reason, whether partial). **The web has no analytics SDK at all.** Wire one up for this screen, or
accept that web conversion cannot be compared with the app's.

---

## The pending rule

Identity flips `supplierStatus` to 1 **before** any document is uploaded. On the app, status 1 has no
route back into the upload screen — and as of this revision that is explicit product intent, not an
oversight: *"a supplier under review can look at what they submitted but must not send it a second
time; sending again is what stacks a duplicate for the reviewer."* The pending card now opens the
read-only details screen instead of doing nothing, and the document read was opened to pending
precisely so that screen has something to show.

What remains: a user whose upload failed and who then left the screen is pending with nothing on file
and cannot send anything until an operator moves them. The app names that state (*"No documents
received yet"*) rather than resolving it.

The web inherits the same rule. Two things are therefore load-bearing, not optional: T6's rule that a
failure never navigates and never refetches status, and T13's read-only view so a pending renter can
at least see whether their documents arrived.

## Open decisions

1. **The lane (§0)** — Option B (`docLane: 'company'`, auto-presorted, one repo touched) or Option A
   (mobile's track, operator clicks, two repos touched)? Recommended: B.
2. **P2** — fix Relay's `NUMERIC_USER_REF_SOURCES` so company-lane rows get a name and phone?
3. **The 24–48h SLA** in the confirm dialog and sent panel — confirm the real turnaround, or ship the
   app's carried-over figure?
4. **Legal name** — drop the field as the app did, or keep it on the web? Keeping it is legal in the
   pile shape and helps: the write-back is fill-only-when-empty, so a human-entered name beats a
   model's read of a scan. `/api/verification` returns only `companyName`, never `companyLegalName`,
   so today's prefill silently falls back to the display name — pre-existing, moot if the field goes.
5. **T16 analytics** — wire up an SDK or accept the gap?

## Verification before release

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all clean.
- End to end against staging with a clean user (`0502165558` / id 2544 is on the OTP-bypass list, code
  `1234`, starts at `supplierStatus: 0`): identity 200 → `supplierStatus 0 → 1` → presign 3 targets →
  3 PUTs → complete `{ok:true,fileCount:3}`.
- Check the ledger row matches the chosen lane: Option A → `source=mobile`,
  `metadata.origin=COMPANY_DOCS`; Option B → `source=company-webapp`, and the presort **ran by
  itself** (no operator click), with the verdict visible in RelayPanel.
- Confirm the operator sees a named supplier, not a bare numeric ref (P2).
- Kill the uplink mid-upload: the screen stays, failed files are marked, Send re-PUTs only those and
  completes.
- Reject the submission from the reviewer side with a typed reason, and confirm the web shows that
  reason above the form (T14) and clears it on resubmit.
- As a non-owner company member, confirm the form is not offered and a forced submit returns 409
  (T12).
- **Restore staging afterwards** — delete the `verificationQueue` row, set `supplierStatus` back to 0,
  verify 0 rows / status 0 against the pre-run snapshot.
- No test piles into live RelayPanel. Staging is not an exemption.
- Note infrastructure moved to `eu-central-1`; confirm any bucket or region assumption in web config
  and in the staging Relay base URL before testing.
