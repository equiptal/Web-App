# Implementation Plan — Bid-form attachments (equipment photos + documents)

**Source:** context-driven (/web:feature) — no GitHub spec
**Mode:** web-app · **Repo:** equiptal/Web-App
**Inputs:** user prompt + WhatsApp taxonomy image + `Moedatech-App/docs/implementation-plans/bid-form-attachments/web-handoff.md`
**Plan id:** web-spec1
**Generated:** 2026-07-09

## Summary
Let an off-platform supplier attach files on the public shared-link bid form (`/bid/{token}`): classified equipment photos, proof-of-ownership docs, request-gated equipment/operator certificates, and (once per submission) company-verification docs. Backend is live in `Moedatech-App/apps/backend-agents` (commit `de054749`); this is the web-side wiring + UI.

## Acceptance criteria (derived + confirmed)
- **AC-01** — Given a supplier on an open bid link, when they add a file, then the client presigns via `POST /api/bid-form/{token}/upload-urls` and PUTs the bytes to S3, keeping the returned `key`.
- **AC-02** — Given files added, when the supplier submits, then each item carries `photos[]{key,type,filename?}` / `documents[]{key,type,filename?}` and submission carries `companyDocuments[]{key,type,filename?}`.
- **AC-03** — Given equipment photos, then the supplier adds many and classifies each via dropdown (`front_photo`/`serial_photo`/`hours_photo`); proof-of-ownership always shown, each classified.
- **AC-04** — Given the request item requires an equipment cert (`requiredTerms.equipmentCert`) or operator (`requiredTerms.operator`/`operatorCert`), then the equipment-cert / operator-cert upload sections show for that item; otherwise hidden.
- **AC-05** — Given the last (company) section, then the supplier can upload commercial-registration / VAT / national-address docs (submission-level).
- **AC-06** — Given client-side, then each file is pre-validated for type (JPEG/PNG/WebP/PDF) + size (≤10 MB) before upload, with progress + remove.

## Architecture overview
`/bid/[token]/page.tsx` gains attachment state per item + a company section. New `uploadBidFiles()` client helper wraps presign→PUT. `link-bids.ts` extends the submit payload + read mappers. A reusable `<FileUploader>` component handles pick → validate → presign → PUT → list/remove.

## Frontend / UI
- `src/components/bid/FileUploader.tsx` (new) — classified multi-file uploader (dropdown per file).
- `src/app/bid/[token]/page.tsx` — per-item Photos + Ownership (always) + Equipment cert + Operator cert (gated) sections; a Company-verification section before submit; include keys in the payload.
- `src/components/bid/bidFormStyles.ts` — styles for the uploader.

## BFF / API integration
- NEW `src/app/api/bid-form/[token]/upload-urls/route.ts` — proxies agents `POST /public/bid-form/{token}/upload-urls`.
- `src/lib/api/client.ts` — `uploadBidFiles(token, files)` (presign + PUT); extend `submitBidForm` payload typing.
- `src/lib/contract/link-bids.ts` — attachment types + `SubmitBidFormPayload` fields + `mapLinkSubmissions` parse.

## Data model / persistence
None (web). Backend column `company_documents` already migrated in Moedatech-App.

## Downstream dependency — bid comparison (T8)
The renter compares off-platform submissions in `BidComparisonWorkspace.tsx`, which turns each
submission into a `BidCard` via `submissionToBidCard` (`link-bids.ts`). Today that mapper derives doc
coverage from **text flags + Yes/No confirmations only** (`compliance.activityLicense = has(crNumber)`,
cert chips from `confirmations`, `ownershipDocs: []`) and **ignores** the new `photos` / `documents` /
`companyDocuments`. Two concrete gaps this feature creates:
1. **Doc-coverage chips are blind to real uploads.** The comparison's company-doc chips + equipment-cert
   chips + in-app viewer fetch from `/api/me/bids/:id/documents` — which the code notes **off-platform
   bids do not have** (`BidComparisonWorkspace.tsx` ~L436, L548-564). So a supplier who actually uploaded
   a TÜV / CR / ownership file shows the same as one who only ticked "Yes", and the renter can't open the file.
2. **Quality ring absent in comparison** — it's the natural place for the renter to weigh bids, but the
   ring only renders on the form + the single-submission modal so far.

Fix (T8): `submissionToBidCard` maps the submission's signed attachment URLs into the card (company docs
→ CR/VAT/National-Address chips green from a real file; equipment/operator cert docs → held certs +
openable files; ownership + photos carried); the comparison's chip/viewer path reads those URLs for
`link-*` ids instead of the missing endpoint; and each column shows the `QualityRing`
(`qualityFromSubmission`). May add optional carrier fields on `BidCard` (`bids.ts`).

## Risks & dependencies
- **Backend deploy**: the `company_documents` migration + backend-agents route must be deployed before this works end-to-end (Moedatech-App).
- Presigned PUT `Content-Type` must equal the declared type or S3 rejects.
- **Bid comparison** consumes submissions via `submissionToBidCard` — must be updated (T8) or the new docs/quality won't surface where the renter actually decides.

## Open questions
- ✅ Doc taxonomy — confirmed from the image.
- ✅ Per-item vs submission-level — equipment/ownership/certs per item; company docs submission-level.

## Out of scope
Backend (done), admin view (done in c-hub), S3 lifecycle cleanup (ops).
