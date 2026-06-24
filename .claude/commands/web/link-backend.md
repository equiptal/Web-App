---
description: Align the web's app-backend touchpoints — verify contracts/projections, flag gaps, propose backend changes
argument-hint: <feature/area, e.g. "deal room" | "verification" | "bid list docs">
---

# /web:link-backend — Align with the app backend

Verifies the web app's dependency on the **app backend** (`equiptal/Moedatech-App` → `apps/backend`, branch `staging`) and proposes backend changes when the web needs one. Same shape as `/web:link-agents`, but for the authenticated app-backend the web proxies via `withAuthedBackend`.

## What the web uses from the app backend
Profile + verification, deal room (terms / rate-proposal / accept / documents / quotation), bids (`getBidList`), equipment + attachments, master-data (cities / job-titles). Web touchpoints:
- BFF routes under `src/app/api/profile/*`, `src/app/api/verification/*`, `src/app/api/me/deal-rooms/**`, `src/app/api/me/bids/*`, `src/app/api/equipment/*`, `src/app/api/master-data/*`.
- Contracts/mappers in `src/lib/contract/{bids,deal-room,onboarding,app,stores}.ts`.

## Procedure
1. **Scope** — list the app-backend endpoints + web routes + contracts in play for the argument.
2. **Pull the backend truth** (read-only, `?ref=staging`):
   - the handler under `apps/backend/src/handlers/**` and its service (e.g. `services/marketplace/rentee.service.ts`, `services/deal-room/*`, `services/master-data.service.ts`),
   - the **Prisma projection** that decides what fields reach the web (e.g. `repositories/bid.repository.ts` `bidIncludeSupplierProfile.select`, `prisma/schema.prisma`),
   - validation schemas + `docs/api-docs/*`.
3. **Diff** web vs backend into a table: **field/endpoint · web expects · backend returns/accepts · ✅/⚠/❌**. Pay special attention to **projection gaps** — fields that exist in the DB but the bid-list/deal-room `select` omits (this has bitten us before, e.g. supplier doc keys, term declared values/states).
4. **Classify each gap:** *web-fixable* (mapping/route) vs *backend change needed* (add a field to a `select`, a new endpoint, a new term/enum). For backend changes, draft the exact diff (e.g. add keys to `bidIncludeSupplierProfile.select`), show it, and on approval open a PR / post `[SPEC?]` with `spec-input-needed`. **Never edit Moedatech-App without explicit confirmation.**
5. **Report**: alignment table + punch list (*Web changes* / *App-backend changes (PR/ticket)*). When run by `/web:feature`, feed web changes into its tickets and backend changes into `**⚠ Backend**` tickets so they're tracked, not lost.

Known live alignment notes worth re-checking each run: bid-list omits supplier `crDocKey`/`vatDocKey` (numbers/address parts are sent); deal-room terms are `fixed/soft_accepted/disputed/pending/agreed`; some terms are slated to move Acknowledge→Negotiable (operator_included, operator_certification, equipment safety certs).
