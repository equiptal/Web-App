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

## Risks & dependencies
- **Backend deploy**: the `company_documents` migration + backend-agents route must be deployed before this works end-to-end (Moedatech-App).
- Presigned PUT `Content-Type` must equal the declared type or S3 rejects.

## Open questions
- ✅ Doc taxonomy — confirmed from the image.
- ✅ Per-item vs submission-level — equipment/ownership/certs per item; company docs submission-level.

## Out of scope
Backend (done), admin view (done in c-hub), S3 lifecycle cleanup (ops).
