# Implementation Plan — Renter web RFQ creation (agent-assisted)

**Card:** https://github.com/equiptal/moedatech-specs/issues/245 (Epic: web-app/002-rfq-creation)
**Spec:** https://github.com/equiptal/moedatech-specs/tree/web-app/002-rfq-creation/products/web-app/epics/002-rfq-creation/ (PR #244 — **unmerged** at time of writing)
**Card id:** moedatech-specs-245
**Generated:** 2026-06-09

## Summary

A signed-in renter pastes/uploads a written RFQ; the normalization agent ("Mansour") drafts a
structured, multi-item **broadcast** request, and the renter resolves anything flagged across a
four-step wizard (Project → Equipment → Preferences → Preview) before posting. This repo builds the
**renter web frontend** for that flow. One request covers many items and one location.

## Scope decisions (confirmed with Yara, 2026-06-09)

- **Frontend-only repo.** This Web-App repo is greenfield (Next.js scaffolded here). No backend.
- **Auth bypassed for now.** web-app/001 (sign-in) is not built here yet. We assume a signed-in
  **basic/verified** renter. The guest-block flow (AC-02, AC-03) is implemented but gated behind a
  dev flag (`renterTier`) so it can be exercised, with no real session enforcement.
- **[Mansour] is out of scope — implemented elsewhere.** The agent's *production* of values (parse
  text/files, extract fields, taxonomy mapping + confidence verdicts, Arabic parsing,
  nearest-measurement + unit conversion, conflict detection, pre-population) is the normalization
  agent's job. This repo builds the **web UI that consumes that output** against a typed agent↔web
  contract, served today by a **mock API** that returns fixture drafts. Swappable for the real
  agent endpoint with no UI change.
- **App data is external.** Taxonomy and request submission are consumed via API; mocked today.
- **Hard prereqs treated as done** (per Yara): `Moedatech-App#168` multi-item and the agent
  capability. Multi-item is the native shape of our draft model; no stub needed beyond the contract.
- **RTL (AC-46) gated.** EN+AR strings wired; layout is RTL-capable (logical CSS + `dir`), but the
  Arabic visual mirror is behind a flag until STANDARDS resolves RTL.

## Architecture overview

- **Next.js 15.3 (App Router) + TypeScript + Tailwind v4.** React 19.
- `src/lib/contract/` — the agent↔web contract types (verdict vocabulary, `AgentDraft`, request
  payload) + the equipment taxonomy types. The load-bearing boundary.
- `src/lib/taxonomy/` — taxonomy fixture (category → subcategory → measurement) + helpers.
- `src/lib/api/` — typed client + mock fetchers; backed by route handlers in `src/app/api/`.
- `src/lib/i18n/` — typed EN/AR dictionaries, `LocaleProvider`, `useT`, `dir` resolution.
- `src/lib/store/` — wizard reducer/context holding the draft + step + gate state.
- `src/components/` — shared UI (cards, fields, item rows, verdict badges, modals).
- `src/app/(rfq)/` — intake → processing → 4 steps → confirmation, driven by the store.

## Backend — admin

None. Operators don't touch the renter web RFQ flow (dependencies.md → Admin: `None`).

## Backend — mobile

None in this repo. The web **consumes** the shared request model + multi-item capability
(`Moedatech-App#168`) and the agent endpoint. Both are external; mocked behind the contract here.

## API integration (the contract — mocked today)

- `POST /api/agent/process` — body: `{ text?, files[] }`. Returns an `AgentDraft`:
  project fields (each with a confidence + optional conflict), items[] (each with verdict
  `confident|needs-validation|no-match`, taxonomy match, nearest-measurement/unit-conversion
  suggestion, extracted per-item fields, quantity, notes), detected locations, and summary counts.
  **This is the Mansour boundary.** Mock returns a deterministic fixture draft.
- `GET /api/taxonomy` — category → subcategory → measurement tree (fixture).
- `POST /api/requests` — submit the assembled broadcast; returns a confirmation id.

## Data model / migrations

None (no DB in this repo). Contract types are the data model; request payload mirrors the shared
app request shape (operator, delivery/return, fuel, certificates, site access, preferences, items).

## Risks & dependencies

- **Unmerged spec (PR #244)** — building ahead of merge; spec/contract may shift → rework.
- **Agent↔web contract is unratified** — our verdict vocabulary + draft shape are the spec's stated
  contract; if the real agent diverges, the mock + types are the single place to reconcile.
- **RTL TBD (AC-46)** — gated behind a flag; no rework expected.
- **Real session/tier (web-app/001)** — bypassed; guest-block is flag-driven until auth lands.

## Open questions

- 🟡 Q1 (AC-46) — Full RTL mirror for Arabic is TBD in STANDARDS. **Working assumption:** build
  RTL-capable, gate the visual mirror behind a flag. Doesn't block tickets; revisit before launch.
- 🟡 Q2 (brief) — Taxonomy scope may exceed STANDARDS' 37 categories (Haulage/Power). **Working
  assumption:** fixture taxonomy covers the prototype's categories; reconcile with STANDARDS later.
- 🟡 Q3 — Several strings are `(tentative — PM-confirm)` (tab labels, no-match actions, error copy,
  rental-basis note). **Working assumption:** assert the literals from acceptance.md as the EN
  strings now; flip in place if the PM changes them.
- ✅ Q4 — File-intake limits: none at launch (resolved in brief, 2026-06-09).
- 🟡 Q5 — **Real agent wiring deferred.** The web stays on the stand-in mock until Mansour's
  contract freezes (Yara is actively editing the Mansour/labeling side in `Normalization-Agent`).
  The real contract was captured for later: `POST /rfq/normalize` → `RFQAgentOutput`
  (`rfq_header` + `line_items` + `missing_required_fields`), types in
  `Normalization-Agent/src/types/rfq.types.ts`; topology = web → relay → Mansour (parse) +
  agents-backend `GET /agents/taxonomy` & `POST /agents/requests` (catalogue + submit), token held
  server-side. **Verdict derivation** (when we wire): Matched ⇐ category/subtype/capacity `exact`;
  Needs-OK ⇐ `capacity_match ∈ snapped/converted/range/not_specified`, `fuel_type_match: defaulted`,
  or field in `missing_required_fields`; Not-available ⇐ `category/subtype_match: new` / no resolved id.
- 🟡 Q6 — **Web spec ↔ app schema divergences to reconcile** (app schema is source of truth per
  agent `ALIGNMENT.md`; raise `[SPEC?]` on the epic): taxonomy levels subcategory/measurement →
  **subtype/capacity**; fuel drop **hybrid** (DIESEL/PETROL/ELECTRIC); rental +**PER_JOB/LONG_TERM**;
  SLA 4/8/24/custom → **4/8/24/48/72hr**; equipment-year → **max_equipment_age** (number);
  delivery/return me/supplier → **mobilization/demobilization_by_rentee** (bool); safety certs →
  **SPSP/TUV_INSPECTION/SASO**. The UI currently uses the web-spec model; mapping happens at the
  relay/adapter when wiring (Q5).

## Out of scope

- All **[Mansour]** internal logic (parsing/extraction/verdict computation/Arabic NLP/unit
  conversion/conflict detection/pre-population) — normalization agent, separate repos.
- web-app/001 auth/session + guest→basic profile-completion form.
- Direct-mode requests, trial/fake requests, multiple locations per request.
- Downstream bid/deal viewing & effects (over-budget warnings, bid-window countdown).
- Fulfillment-type banner; minimum-supplier-rating; add-to-taxonomy intake + operator approval.
- The `Manual` create tab (sibling to RFQ) — tab shown, content out of scope.
