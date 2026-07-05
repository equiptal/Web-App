# Deal-room / Compare / Quotation fixes — implementation plan

Batch of 5 issues raised from staging screenshots (2026-07-05). Renter **Web-App** only.
Guiding constraints (unchanged): **align the web to the app EXACTLY; the app + backend code is the
source of truth (not the spec doc); avoid backend changes** — where a fix genuinely needs the backend,
the ticket says so explicitly and stays out of the web PR.

Context already in flight (uncommitted on `staging`, verified green — do NOT lose): operator-conflict
detail, overtime/payment/SLA → Pending review, legacy-`fat` phantom-conflict drop in the deal room,
deal-room price × supplier's offered units. Several tickets below extend those same files, so land this
batch on top of that work.

## Tickets at a glance

| # | Title | Scope | Risk |
|---|-------|-------|------|
| T1 | Comparison cost card: wrong rental rate (`SAR 4/day`) + phantom FAT/operator cost conflicts | **Web** | Med (money math) |
| T2 | Deal room: supplier can't accept-first (gating) + mob/demob shown as terms not price | **T2a Backend/supplier-app · T2b Web** | Med |
| T3 | Single-winner award lock + deal-room release/reopen after accept + quotation update | **T3a Web · T3b/c Web+Backend** | Med |
| T4 | Deal-room chat: align allowed media / sharing with the app | **Web** (verify) | Low |
| T5 | One unified quotation template (bid card == deal room == app) + fix broken bid quotation download | **Web** | Med |

## Sequencing

1. **T5** (download bug is user-blocking + the unified template is a dependency for T1/T3 money display) →
2. **T1** (cost card math + FAT consistency, reuses the deal-room FAT normalization) →
3. **T2b** + **T4** (small, self-contained deal-room web fixes) →
4. **T3a** (award lock, web-only UI) →
5. **T2a / T3b-c** (backend/supplier-app items — investigate + hand off separately, not in the web PR).

## Source-of-truth references (read the app/backend CODE, `?ref=staging`)

- App bid-card quotation: `apps/mobile/**/live_quotation_document.dart` (mob/demob × offeredUnits, +15% VAT).
- App deal-room quotation page: `apps/mobile/**/deal_room/**/quotation_page.dart`.
- Backend quotation math: `apps/backend/src/services/deal-room/quotation.service.ts` `extractQuotationData`.
- Deal-room term states + accept gating: `apps/backend/src/services/deal-room/deal-room.service.ts`.
- App deal-room chat/media config: GetStream message-input allowed attachment types.

## Testing

Per-ticket acceptance criteria below. Global gate before push: `tsc --noEmit` clean · `next lint` clean ·
`vitest run` green · `next build` exit 0 · manual pass on staging **in incognito** (CDN caches).
Add/extend unit tests for the money math (T1) and the unified quotation builder (T5).
