# Implementation Plan — Shared-link bids (web-app/006 expanded)

**Source:** free-form (expanded scope of web-app spec 006 "share for bids")
**Card id:** shared-link-bids
**Generated:** 2026-06-25

## Summary
Turn the 006 shared-link prototype (today a staging-only UI mock) into a real feature. Each submitted
request gets a public, shareable link carrying the renter's name; the link opens a supplier bid form
whose submissions are stored in a NEW independent table (no writes to existing tables). Those
off-platform submissions then surface across the renter's app: in My Bids (labelled + filterable),
in a read-only "view submission" sheet, in the request header's link tracker (real counts), and as
selectable rows in the bid comparison (alongside in-app bids), with a field-by-field review of what
the form can/can't supply for the comparison table.

## Locked decisions
- **Backend host:** agents backend (`apps/backend-agents`) — supports public + service-token routes, shares the Prisma schema.
- **Public form:** real Next route `/bid/[token]` (loads request, validates, posts).
- **Link format:** `/bid/{slug}-{token}` — `slug` = slugified renter/company name (display only), `token` = opaque, dash-free, authoritative for lookup.
- **Parts 3–6 UI:** build on the existing 006 surfaces (`SharedLinkBidCard`, `SharedBidSubmissionModal`, request trackers, comparison) fed by real data.
- **Abuse protection:** opaque unguessable token + server-side rate-limit; no captcha v1.

## Scope boundaries
- **In:** link generation + tracker (real counts), public form read+submit, new `LinkBidSubmission` table, My Bids merge/label/filter, view-submission sheet, comparison integration + field-map review, retiring the `shared-link-bids.ts` mock.
- **Out:** converting a submission into a real `bid` / starting a deal room from it; supplier accounts; editing a submitted bid; file uploads on the form (v1 captures typed values, not doc files).
- **Assumptions:** independent storage (no FK writes into `bids`/`equipment`/profiles); the supplier form needs no login; renter-side reads are authed.

## Architecture & data
### Web UI
- **Part 1:** `Confirmation.tsx` share card → real link `/bid/{slug}-{token}` + copy/WhatsApp/Email/SMS; request trackers in `RequestDetail.tsx` / `RequestsList.tsx` show real opened/submitted counts.
- **Part 2:** new public route `src/app/bid/[token]/page.tsx` — loads the request (items + terms + renter name) and renders the form (per-item Yes/No confirmations + pricing + company details), posts the submission, success screen. Bilingual + RTL.
- **Part 3:** `RequestBids.tsx` / `GroupBids.tsx` merge real submissions with app bids; `SharedLinkBidCard` for the off-platform card + source label; a source filter (app / shared-link / all).
- **Part 4:** `SharedBidSubmissionModal` renders the stored answers (company details + per-item confirmations + pricing) read-only.
- **Part 5:** request-header link tracker (real counts).
- **Part 6:** `BidComparisonWorkspace` includes submissions as columns (mapped to `BidCard`-shape); field-map review (below).

### BFF routes (`src/app/api/*`)
- `GET /api/bid-form/[token]` (public) → agents `GET /public/bid-form/{token}` → request items/terms + renter name.
- `POST /api/bid-form/[token]/submissions` (public) → agents `POST /public/bid-form/{token}/submissions`.
- `GET /api/me/requests/[id]/submissions` (authed) → agents `GET /agents/requests/{id}/bid-submissions?userId=` (service token + renter id).

### Contract / adapters
- `src/lib/contract/link-bids.ts`: `LinkBidSubmission` type + `submissionToBidCard(sub)` mapping to a `BidCard`-compatible shape (`viaSharedLink: true`, source label, company compliance from typed CR/VAT/national, per-item rate/mob/demob, term confirmations → `TermRow` states).
- API client fns in `client.ts`.

### Backend dependency (agents — `apps/backend-agents`)
- **New table `LinkBidSubmission`** (shared `prisma/schema.prisma`): `id, tenantId, requestId, shareToken, createdAt, source='shared_link'`, company (`companyName, crNumber, vatNumber, nationalAddress, contactInfo, notes`), `items` JSON (`[{ requestItemId, confirmations{operator,fuel,year,operatorCert,equipmentCert}, rentalRate, deliveryPrice, returnPrice, total }]`), `grandTotal`. No FKs into `bids`/`equipment`.
- **`shareToken`** on `EquipmentRequest` (opaque, dash-free, `@unique`), generated at request creation (or lazily on first share).
- **Endpoints:** public read + public submit (rate-limited) + authed renter read (guard: request owner).
- **Tracker counts:** `opened` (increment on public read) + `submitted` (count of submissions) per request.

## Data model / migrations
- Migration 1: add `shareToken String? @unique` to `EquipmentRequest`.
- Migration 2: create `LinkBidSubmission` table (+ index on `requestId`, `shareToken`).
- Optional: `linkOpenedCount Int @default(0)` on the request (or a lightweight opens log) for the tracker.

## Comparison field map (Part 6)
Form **supplies** → comparison rows: rental rate (per item), delivery/return (mob/demob), per-item term confirmations (operator/fuel/year/operator-cert/equipment-cert → matched/conflict), company CR/VAT/national (typed → compliance chips). **Gaps** (form can't supply): distance to site (no supplier location on the form), equipment make/model/exact year (form only confirms "meets requested year" Yes/No), verified badge (N/A off-platform), actual doc files (form captures numbers, not uploads). **Form-only** (not yet a comparison row, to review): contact info, free-text notes.

## Risks & dependencies
- **Agents token mismatch on staging** (current, separate) — feature can't go live until realigned.
- Public submit endpoint abuse → opaque token + rate-limit.
- Renter name in a public URL (slug) — cosmetic, token is the secret.
- New migration on the shared schema (both backends regenerate the client).
- Mapping off-platform submissions into `BidCard` without polluting real-bid logic (verified/distance/docs must degrade cleanly).
- Retiring `shared-link-bids.ts` without regressing the staging demo.

## Open questions
- ✅ Backend host → agents. ✅ Form → Next route. ✅ Link → slug+token. ✅ Parts 3–6 → existing surfaces. ✅ Abuse → token+rate-limit.
- 🟡 `opened` tracking fidelity (every GET vs unique) — default: increment per public read, dedupe later if noisy.
- 🟡 Token generation timing (at request creation vs first share) — default: at creation (every request shareable).

## Out of scope
Converting submissions to real bids/deal rooms; supplier auth; form file uploads; editing submissions.
