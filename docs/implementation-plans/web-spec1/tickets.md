# Tickets — web-spec1 (bid-form attachments)

Branch: `web/web-spec1` → one PR into `staging`.

## T1 — upload-urls BFF route
**AC:** AC-01 · **Files:** `src/app/api/bid-form/[token]/upload-urls/route.ts` (new)
Given the client needs a presigned URL, when it POSTs a file manifest, then the route proxies agents `POST /public/bid-form/{token}/upload-urls` and returns `{uploads:[{filename,key,url,contentType}]}`. Mirror the sibling `submissions/route.ts`.
**Done-when:** typecheck passes; route returns 200 with uploads; upstream 4xx surfaced.

## T2 — link-bids contract
**AC:** AC-02, AC-03 · **Files:** `src/lib/contract/link-bids.ts`
Given the submit payload + read mappers, when attachments exist, then `SubmitBidFormPayload.items[]` accepts `photos[]{key,type,filename?}` + `documents[]{key,type,filename?}`, the payload accepts top-level `companyDocuments[]{key,type,filename?}`, and `LinkBidItem` + `LinkBidSubmission` expose them (parsed by `mapLinkSubmissions`). Add the attachment-kind unions.
**Done-when:** typecheck passes; types match the backend contract.

## T3 — uploadBidFiles client helper
**AC:** AC-01, AC-06 · **Files:** `src/lib/api/client.ts`
Given files to upload, when called, then presign (BFF) → PUT each to S3 with the matching `Content-Type` → return `{key,filename,type}[]`. Pre-validate type + size.
**Done-when:** typecheck; a failed PUT rejects with a usable error.

## T4 — FileUploader component
**AC:** AC-03, AC-06 · **Files:** `src/components/bid/FileUploader.tsx` (new), `bidFormStyles.ts`
Given an allowed kind list, then the user picks files, classifies each via dropdown, sees progress + remove; emits the uploaded `{key,type,filename}[]`. Reusable for photos / ownership / certs / company docs.
**Done-when:** typecheck; add/remove/classify works; disabled while uploading.

## T5 — wire sections into the bid form page
**AC:** AC-03, AC-04, AC-05 · **Files:** `src/app/bid/[token]/page.tsx`
Per item: Equipment photos + Proof of ownership (always); Equipment cert + Operator cert (only when `requiredTerms.equipmentCert` / `.operator`/`.operatorCert`). Before submit: Company verification section. Thread all keys into the submit payload.
**Done-when:** typecheck; sections render/gate correctly; submit includes keys.

## T7 — bid-quality ring (match/docs/completeness)
**AC:** AC-07 · **Files:** `src/lib/contract/bid-quality.ts` (new), `src/components/bid/QualityRing.tsx` (new), `page.tsx`, `SharedBidSubmissionModal.tsx`, `bidFormStyles.ts`
Given a bid, then a 0–100 quality ring shows how well it matches the renter's request + how complete its docs are (Balanced: terms 40% · docs 40% · completeness 20%). Shown LIVE on the supplier form (updates as they fill) and on the renter's read-only viewer. Client-side, no backend.
**Done-when:** tsc + lint clean; ring updates live; band colors (low/mid/high).

## T8 — surface attachments + quality in the bid comparison (dependency)
**AC:** AC-03, AC-07 · **Files:** `src/lib/contract/link-bids.ts` (`submissionToBidCard`), `src/components/compare/BidComparisonWorkspace.tsx`, `src/lib/contract/bids.ts` (optional carrier fields)
Given the renter compares off-platform bids, then each column reflects the supplier's ACTUAL uploads (not just text/confirmations): company-doc chips (CR/VAT/National Address) green from a real file + openable; equipment/operator cert chips from uploaded cert files; ownership + photos available; and a `QualityRing` per column. For `link-*` bids the chip/viewer reads the submission's signed attachment URLs (the `/api/me/bids/:id/documents` endpoint doesn't exist for them).
**Done-when:** tsc + lint clean; a submission with uploads shows green/openable doc chips + its quality ring in the comparison; text-only submissions still render (graceful fallback).
**Note:** depends on the backend returning signed `photos`/`documents`/`companyDocuments` on `getRequestSubmissions` (done) — so this ships with the same backend deploy.

## T6 — labels + i18n + validation polish
**AC:** AC-06 · **Files:** `page.tsx` / `bidFormStyles.ts`
Bilingual kind labels (EN/AR), client size/type errors, empty/optional handling.
**Done-when:** build passes; AR + RTL intact.
