# Tickets — Shared-link bids (web-app/006 expanded)

Plan: ./plan.md
Repos: `Moedatech-App` (`apps/backend-agents`, branch `marketplace/supplier-docs-view` or a new `marketplace/shared-link-bids`) + `Web-App`.
Implement top-to-bottom. Backend tickets gate the web tickets that consume them.

## Backend — agents (Moedatech-App / apps/backend-agents)

### ⚠ Backend T1 — `shareToken` on the request + token generation
**Scope:** backend-agents (shared prisma)
**ACs:** every submitted request is shareable via a unique opaque token.
**Description:** Add `shareToken String? @unique` (dash-free, ~16 base62) to `EquipmentRequest`; generate it at request creation (backfill lazily on first read if null). Optionally `linkOpenedCount Int @default(0)`.
**G/W/T:** Given a request, When it's created, Then it has a unique `shareToken`. Given two requests, Then their tokens differ.

### ⚠ Backend T2 — `LinkBidSubmission` table
**Scope:** backend-agents (shared prisma)
**ACs:** independent storage of off-platform bid submissions; no writes to existing tables.
**Description:** Create `LinkBidSubmission` (fields per plan: company block, `items` JSON, `grandTotal`, `requestId`, `shareToken`, `source`, `createdAt`). Index `requestId`, `shareToken`. No FKs into `bids`/`equipment`.
**G/W/T:** Given a submission, When stored, Then only `LinkBidSubmission` is written (bids/equipment untouched).

### ⚠ Backend T3 — public read: `GET /public/bid-form/{token}`
**Scope:** backend-agents (public route, no authorizer)
**ACs:** the form can render the request's items + terms + renter name from the token.
**Description:** Resolve request by `shareToken`; return renter/company name, equipment items, required terms (operator/fuel/year/operator-cert/equipment-cert), rental basis. Increment `opened`. 404 on unknown token.
**G/W/T:** Given a valid token, Then items + terms + renter name return. Given a bad token, Then 404.

### ⚠ Backend T4 — public submit: `POST /public/bid-form/{token}/submissions`
**Scope:** backend-agents (public route, rate-limited)
**ACs:** a supplier (no login) submits a bid; it's stored independently.
**Description:** Validate body (company block + per-item confirmations/pricing); resolve request by token; insert `LinkBidSubmission`. Server-side rate-limit per token/IP. 404 on bad token, 422 on invalid body.
**G/W/T:** Given a valid token + complete form, When posted, Then a row is created and a success id returns. Given a flood of posts, Then rate-limited.

### ⚠ Backend T5 — authed read: `GET /agents/requests/{id}/bid-submissions`
**Scope:** backend-agents (service token + `?userId=`)
**ACs:** the renter sees their request's submissions for My Bids + comparison + tracker.
**Description:** Service-token authed; guard `userId` == request `renteeId`. Return submissions + `submittedCount` + `openedCount`.
**G/W/T:** Given the request owner, Then submissions return. Given a non-owner userId, Then 403.

## Contract / API client (Web-App)

### T6 — `LinkBidSubmission` contract + mapper
**Scope:** Contract
**Description:** `src/lib/contract/link-bids.ts`: `LinkBidSubmission` type + `submissionToBidCard()` → `BidCard`-shape (`viaSharedLink:true`, source label, compliance from typed CR/VAT/national, per-item rate/mob/demob, confirmations → `TermRow` states, `verified:false`, `distanceKm:null`). Unit-tested.
**G/W/T:** Given a submission with operator=No, Then the operator term maps to `conflict`. Given CR+VAT present, Then those compliance chips are true; `verified` is false.

### T7 — BFF routes + client fns
**Scope:** BFF
**Description:** `src/app/api/bid-form/[token]/route.ts` (GET public) + `.../submissions/route.ts` (POST public) → agents public endpoints; `src/app/api/me/requests/[id]/submissions/route.ts` (GET authed) → agents authed endpoint (renter `userId`). Client fns in `client.ts`.
**G/W/T:** Given a token, When the form page loads, Then the BFF returns request data. Given the renter, When My Bids loads, Then submissions return.

## Web UI

### T8 — Part 1: real share link + share actions
**Scope:** Web UI
**ACs:** after submission, a unique link per request (with renter name) can be copied/shared.
**Description:** `Confirmation.tsx` builds `/bid/{slug}-{token}` from the request; copy + WhatsApp/Email/SMS/native share. (Replaces the prototype's static URL.)
**G/W/T:** Given a submitted request, Then a `/bid/{slug}-{token}` link is shown and copyable.

### T9 — Part 2: public bid form route `/bid/[token]`
**Scope:** Web UI
**ACs:** the link opens a form that loads the request and submits a bid to independent storage.
**Description:** `src/app/bid/[token]/page.tsx` — parse `token` (`split('-').pop()`), fetch request via BFF, render per-item confirmations + pricing + company details (mirror `supplier-bid-v2.html`), validate, POST, success screen. Bilingual + RTL. Public (no auth).
**G/W/T:** Given a valid link, Then the form renders the request's items/terms. When submitted complete, Then a success screen shows and the submission is stored.

### T10 — Part 5: request-header link tracker (real)
**Scope:** Web UI
**Description:** `RequestDetail.tsx` / `RequestsList.tsx` trackers show real opened/submitted counts from T5 (replace `sharedLinkStatsFor` mock) + copy-link.
**G/W/T:** Given submissions exist, Then the header shows the real submitted count.

### T11 — Part 3: My Bids merge + source label + filter
**Scope:** Web UI
**Description:** `RequestBids.tsx` / `GroupBids.tsx` merge mapped submissions with app bids; `SharedLinkBidCard` + "via shared link" label; source filter (all / app / shared-link).
**G/W/T:** Given a request with 1 app bid + 1 submission, Then both cards show, the submission is labelled, and the filter narrows by source.

### T12 — Part 4: view-submission sheet (real answers)
**Scope:** Web UI
**Description:** `SharedBidSubmissionModal` renders the stored submission read-only (company block + per-item confirmations + pricing) instead of the iframe mock.
**G/W/T:** Given a submission, When "View bid submission" is clicked, Then its actual answers render read-only.

### T13 — Part 6: comparison integration + field map
**Scope:** Web UI
**Description:** `BidComparisonWorkspace` accepts submissions as selectable columns (via `submissionToBidCard`); apply the plan's field map (rate/mob-demob/term confirmations/company chips supplied; distance/verified/make-model/docs degrade cleanly). Add any form-supplied field missing from the table (contact, notes) per review.
**G/W/T:** Given a submission selected with an app bid, Then both compare; supplied fields populate, gaps render "—"/N/A without breaking sort or totals.

### T14 — retire the mock
**Scope:** Web UI
**Description:** Remove/guard `src/lib/mock/shared-link-bids.ts` once real data flows; keep nothing that injects fake counts/bids on staging.
**G/W/T:** Given real submissions, Then no mock data is injected anywhere.

## Pending decisions
- 🟡 `opened` counting fidelity (per-GET vs unique) — default per-read.
- 🟡 Token generation timing — default at request creation.
