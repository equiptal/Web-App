---
description: Align the web's agents-backend touchpoints (Mansour) — verify contracts, flag mismatches, propose backend changes
argument-hint: <feature/area, e.g. "create request" | "bid comparison" | "recommend">
---

# /web:link-agents — Align with the agents backend (Mansour)

Verifies that the web app's dependency on the **agents backend** (`equiptal/Moedatech-App` → `apps/backend-agents`, branch `staging`) is correct and aligned, and proposes the backend changes when the web needs one. Works for **free-form** work or a **dev-flow/GitHub** ticket — it's about the contract, not the source.

## What the web uses from the agents backend
The agents endpoints (Mansour) back the **RFQ create + matching + recommend** path. Web touchpoints:
- BFF routes under `src/app/api/agent/*`, `src/app/api/requests`, `src/app/api/taxonomy`, `src/app/api/me/bids/recommend`, etc.
- Contracts in `src/lib/contract/app.ts` (`CreateRequestPayload`, `TaxonomyNode`), `agent.ts`, `agent-bids.ts`; mapping in `src/lib/api/app-adapters.ts` + `agent-adapters.ts`.

## Procedure
1. **Scope** — from the argument, list the agents endpoints + web routes + contract types in play. If none, ask which feature.
2. **Pull the backend truth** (read-only via gh, always `?ref=staging` — the default branch is stale):
   - `apps/backend-agents/src/validators/*.schema.ts` (e.g. `request.schema.ts` — the create input shape, enums, defaults),
   - `apps/backend-agents/src/handlers/agents/**` (the handler that the web route hits),
   - `apps/backend-agents/agents-backend-endpoints.md` + `ALIGNMENT-web-app-002.md` (the I/O contract + integration rules).
3. **Diff** the web's request/response shape (the BFF route body + the contract type + the adapter mapping) against the backend schema/handler. Build a table: **field · web sends/expects · backend accepts/returns · ✅ match / ⚠ mismatch / ❌ missing**. Cover enums, casing (camel vs snake), required-vs-optional, defaults, and dropped/ignored fields.
4. **Classify each gap:**
   - **Web-fixable** (wrong field name, missing map, casing) → fix in `app-adapters`/contract; note the ticket.
   - **Backend change needed** (the web needs a new field/endpoint/enum the backend doesn't expose) → draft the change for `apps/backend-agents` (schema/handler), show it, and on approval open a PR or post a `[SPEC?]` on the relevant Moedatech-App issue with `spec-input-needed`. **Do not edit Moedatech-App without explicit confirmation.**
5. **Report**: the alignment table + a punch list split into *Web changes* and *Agents-backend changes (PR/ticket)*. If invoked by `/web:feature`, fold the web changes into its tickets and the backend changes into `**⚠ Backend**` tickets.
6. **Hand off to Moedatech-App — only when I say so.** Every run must END by offering the handoff for any *Agents-backend change* found. If I approve (e.g. "hand it off", "open the PR", "do the backend change"), carry it into the other repo yourself — don't just describe it:
   - **Locate the repo** — prefer an `equiptal/Moedatech-App` checkout already on disk (check the additional working dirs); else clone or `git worktree`. Work off **`staging`**, never `main`.
   - **Branch + apply** the drafted schema/handler change on a new branch `web-align/<slug>`.
   - **Commit** referencing the web driver (which web route/contract needs it), then **push** and **open a PR** with `gh pr create --base staging`. PR body = the alignment-table row(s) + why the web needs it + the exact fields/enums; end with the standard Claude Code trailer.
   - Report the **PR URL** back here so it rides alongside the web changes.
   - **Alternative if I don't want a PR:** post a `[SPEC?]` comment on the relevant Moedatech-App issue with the `spec-input-needed` label, or just hand me the diff.

**Guardrails:** never edit, push, or PR **either** repo without my explicit go-ahead; the cross-repo handoff (Step 6) fires **only when I ask**. Never target `main` — PRs go to `staging`. Always confirm before each push.
