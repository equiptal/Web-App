# Backend alignment record — web-spec1 (bid-form attachments)

`/web:link-web` pass, 2026-07-09. Backend truth: `equiptal/Moedatech-App/apps/backend-agents` (commit `de054749`). Mode = web-app, so gaps below are implemented **here** (this repo), not handed off.

## Alignment table
| Endpoint / field | Web (before) | Backend (live) | Action |
|---|---|---|---|
| `POST /api/bid-form/{token}/upload-urls` | route missing | `POST /public/bid-form/{token}/upload-urls` presigns | **T1** — add BFF proxy |
| submit `items[].photos[]` `{key,type,filename?}` | not in payload | accepted; `type` ∈ front_photo/serial_photo/hours_photo | **T2** |
| submit `items[].documents[]` `{key,type,filename?}` | not in payload | accepted; `type` ∈ ownership+equip-cert+operator-cert | **T2** |
| submit `companyDocuments[]` `{key,type,filename?}` | not in payload | accepted; `type` ∈ commercial_registration/vat/national_address | **T2** |
| read `items[].photos/documents` + `companyDocuments` | not parsed | returned as signed URLs | **T2** (mapper) |
| submit BFF passthrough | forwards raw body | accepts new fields | ✅ transparent |

## Backend contract (target)
- Per item: `photos[]` type ∈ `front_photo|serial_photo|hours_photo`; `documents[]` type ∈ `istimara|customs_card|sales_contract|saso_registration|tuv|spsp|saso_inspection|insurance|operator_tuv|operating_license|operator_spsp|operator_id|operator_insurance`.
- Per submission: `companyDocuments[]` type ∈ `commercial_registration|vat|national_address`.
- Gating: equipment-cert + operator-cert sections only when the item requires them (read `GET /public/bid-form/{token}` → `items[].requiredTerms.equipmentCert` / `.operator` / `.operatorCert`). Everything else always shown.
- Upload: `POST /public/bid-form/{token}/upload-urls` body `{files:[{filename,contentType,folder:'photos'|'documents'}]}` → `{uploads:[{filename,key,url,contentType}]}`; PUT bytes with the matching Content-Type; caps 10/call, ≤10MB/file.

## Pending (Moedatech-App — cannot fix from here)
- **Deploy**: backend-agents route + the `company_documents` migration (`20260708000000`) must be deployed to staging before this works end-to-end. Backend deploy runs `prisma migrate deploy`.
