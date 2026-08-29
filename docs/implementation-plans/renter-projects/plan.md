# Renter Projects — implementation plan

Spec: `docs/specs/007-renter-projects.md` (key **PROJ**).
Three repos: **agents-backend** (owns the data), **Normalization-Agent** (the fast path),
**Web-App** (everything the renter touches).

Everything below is ordered so each phase is shippable and useful on its own. Phase 1 gives a
working project with prefill and no speed win; Phase 2 gives the speed; Phase 3 gives the dashboard.

---

## Phase 0 — Rulings to close first

None of these block writing code, all of them block merging it.

- **P0-1** — Confirm agents-backend owns the entity (spec §11.1). If it does not, everything under
  "agents-backend" below moves, and the web needs its own persistence shim.
- **P0-2** — Confirm company-wide scope and owner-only edit (§11.2).
- **P0-3** — Agree the `operatorApplicable` flag with whoever owns the taxonomy data, and get the
  initial values set for the obvious non-operator categories (generators, compressors, light towers,
  welding machines, tanks, scaffolding).

---

## Phase 1 — The project exists and prefills a request

### 1A · agents-backend

| # | Work |
|---|---|
| A1 | `projects` table per spec §5.1: `id, company_id, owner_user_id, title, status, location_label, location_lat, location_lng, defaults jsonb, version, created_at, updated_at`. `defaults` as JSON, not 18 columns — the shape follows `draft.ts` and will move with it. |
| A2 | `requests.project_id uuid null` + `requests.project_version int null`, indexed on `project_id`. |
| A3 | CRUD: `GET/POST /agents/projects`, `GET/PATCH/DELETE /agents/projects/{id}`. List returns the derived roll-up (`requestCount`, `firstStart`, `lastEnd`, `unitsAwarded`) so the web never computes it from a full request fetch. |
| A4 | `PATCH` bumps `version` on any `defaults` change. Body takes `applyToOpenRequests: boolean`; when true, apply only to requests with **zero bids** and status open, and return the list of ids changed **and** the list skipped with a reason (PROJ-AC-22). |
| A5 | `DELETE` nulls `project_id` on its requests. Never cascades (PROJ-AC-23). |
| A6 | `POST /agents/requests` accepts `projectId` + `projectVersion` and stamps them on **every fanned-out row** (PROJ-AC-25). |
| A7 | `PATCH /agents/requests/{id}` accepts `projectId` for move/assign — filing only, no value changes (PROJ-AC-21). |
| A8 | Taxonomy: `operator_applicable boolean` on subcategory (nullable, inherits category), served by `GET /agents/taxonomy`. |

### 1B · Web-App — contract & BFF

| # | Work | Files |
|---|---|---|
| B1 | `Project`, `ProjectDefaults`, `ProjectSummary` types + adapters. `ProjectDefaults` is assembled from the existing `ProjectDetails` / `Preferences` / `OperatorDetails` pieces — **do not** define a parallel shape. | new `src/lib/contract/project.ts`, export from `src/lib/contract/index.ts` |
| B2 | `projectId` / `projectVersion` on the request contract and on `RfqRequestPayload`. | `src/lib/contract/draft.ts`, `src/lib/contract/requests.ts` |
| B3 | `operatorApplicable` on `Subcategory`/`Category`, plus `operatorApplies(ref, taxonomy)` with the fallback tag list (PROJ-AC-17). | `src/lib/contract/taxonomy.ts` |
| B4 | BFF relays: `src/app/api/projects/route.ts` (GET list, POST create), `src/app/api/projects/[id]/route.ts` (GET/PATCH/DELETE). Owner-guarded via `sessionUserId()` — **no `AGENTS_TEST_USER_ID` fallback here**; these are authorization decisions, unlike the create route's creator attribution (see the comment at `src/app/api/requests/route.ts:31`). Fixture fallback when `useRealApp` is false, matching the pattern in `taxonomy/route.ts`. | new |
| B5 | `projectId`/`projectVersion` forwarded through submit. | `src/app/api/requests/route.ts`, `src/lib/api/app-adapters.ts` (`draftToCreateRequest`) |
| B6 | Client functions: `listProjects`, `createProject`, `updateProject`, `deleteProject`, `assignRequestToProject`. | `src/lib/api/client.ts` |

### 1C · Web-App — prefill and provenance

| # | Work | Files |
|---|---|---|
| C1 | Add `"project"` to `FieldSource` and teach `fieldSource()` to return it: a value equal to the selected project's default, on a path the renter has not touched and the agent did not fill. Order of precedence: `renter` > `agent` > `project` > `default` > `empty`. | `src/lib/contract/provenance.ts`, `src/components/create/Provenance.tsx` |
| C2 | Store: `projectId`, `projectVersion`, `projectDefaults` (the resolved snapshot, including pill edits) on `RfqState`; actions `selectProject`, `clearProject`, `patchProjectOverride`. Persist with the draft (`rfq-draft-v2`) so a reload keeps the selection. | `src/lib/store/rfq-store.tsx` |
| C3 | `applyProjectDefaults(draft, defaults, taxonomy)` — a pure function that merges project values into a fresh draft. It must **not** touch any item field the agent filled, and must skip the operator block for non-operator subtypes (§7). Unit-tested in isolation; this is the function the whole feature's correctness sits on. | new `src/lib/contract/project-apply.ts` |
| C4 | Canvas prefill: `WherePanel`, `WhenPanel` and the preferences fields read the merged draft as they already do — no change beyond the new provenance mark. | `src/components/create/*` |
| C5 | `OperatorRail` does not render when `operatorApplies()` is false, and `operatorNeeded` is forced to `"no"` for those items in `applyProjectDefaults` and in `newManualItem`'s consumers. The collapsed 72px strip is **not** the answer here — there is nothing to reopen. | `src/components/create/OperatorRail.tsx`, `Canvas.tsx` |
| C6 | `draftToCreateRequest` omits every operator field for non-operator items (PROJ-AC-15). | `src/lib/api/app-adapters.ts` |

### 1D · Web-App — intake chips and pills

| # | Work | Files |
|---|---|---|
| D1 | `ProjectChips` — the chip row under the textarea. Active projects, most-recently-used first, cap 6, "All projects" picker beyond that. Hidden for guests (`status === "anon"`). | new `src/components/create/ProjectChips.tsx`, mounted in `src/components/screens/Intake.tsx` |
| D2 | `ProjectPills` — the selected state. Five headline pills (project · basis · dates · hours/day · operator), each a dropdown reusing the canvas's existing option controls, plus "+ N more settings" opening a compact sheet with the rest. Every edit writes a **request-local override** (`patchProjectOverride`); the project is never written (PROJ-AC-04). A changed pill is visibly marked. | new `src/components/create/ProjectPills.tsx` |
| D3 | Placeholder swap when a project is selected — equipment-only examples (PROJ-AC-07). | `src/lib/i18n/en.ts`, `ar.ts` |
| D4 | `/create?project=<id>` preselects (PROJ-AC-14). | `src/app/create/page.tsx` |
| D5 | Arabic strings for every new label. | `src/lib/i18n/*` |

### 1E · Web-App — project CRUD screens

| # | Work | Files |
|---|---|---|
| E1 | `/projects` list + `New project` form. One form, the same controls as the canvas, **no equipment field** (PROJ-AC-01), location required (PROJ-AC-02), title defaults to the location's short name via the prototype's `shortSite()` rule (PROJ-AC-03). | new `src/app/projects/page.tsx`, `src/components/projects/*` |
| E2 | Edit dialog with the *next requests only* / *apply to existing too* choice, listing what will change and what is excluded and why, before applying (§9). | new |
| E3 | Delete confirm stating the count of requests that will move to Unassigned. | new |
| E4 | Nav entry in `AppShell`. | `src/components/AppShell.tsx` |

### 1F · Web-App — the offer after a projectless submit

| # | Work | Files |
|---|---|---|
| F1 | Confirmation-screen card: "Save these settings as a project?" Appears only when no project matched that location; permanently dismissible per device (PROJ-AC-11); declining changes nothing (PROJ-AC-12). Creates the project from the submitted §5.2 fields and links the just-submitted request at version 1. | `src/components/screens/Confirmation.tsx` |

**End of Phase 1:** projects work, requests prefill, nothing is faster yet — the full agent still runs
on both paths. This is a deliberate checkpoint: it proves the field cut (§5.2) against real use
before any prompt work depends on it.

---

## Phase 2 — The fast path

### 2A · Normalization-Agent

| # | Work | Files |
|---|---|---|
| N1 | **Reorder the prompt blocks first, on its own, and prove it.** Block A = taxonomy, Block B = instructions, Block C = learned rules + few-shot, each with `cache_control`. Run the eval suite before and after; the full-scope output must be unchanged (PROJ-AC-18). Nothing else in Phase 2 is safe until this is green. | `src/services/rfq.service.ts:812-828`, `src/constants/rfq-prompt.ts` |
| N2 | `buildEquipmentOnlyInstructions()` — a second Block B variant. Emits `line_items` only: no `rfq_header`, no header-level `missing_required_fields`, no header field notes. Carries the project `context` as stated facts so the model never asks for them back. | `src/constants/rfq-prompt.ts` |
| N3 | `scope` + `context` on the extraction input; `normalizeRfq()` branches on scope for prompt variant, model, `max_tokens` and few-shot limit. | `src/services/rfq.service.ts`, `src/types/rfq.types.ts` |
| N4 | Config: `MANSOUR_RFQ_EQUIPMENT_MODEL_ID` (default Haiku), `MANSOUR_RFQ_EQUIPMENT_FEWSHOT_LIMIT` (default 5), `max_tokens: 4096` for the scope. | `src/config/index.ts` |
| N5 | `POST /rfq/quick` — synchronous handler for `scope: "equipment_only"`. Same validation, same taxonomy validation and verdict computation as the job path (`validateItems`, `computeItemVerdict`), same persistence of the RFQ row so corrections and learning still work. Returns the result directly. Still passes through `rfqExtractionLimiter`. | new `src/handlers/rfq/quick.handler.ts`, `src/handlers/rfq/index.ts` |
| N6 | **Fix the dedup hash** — add `scope` and a `context` fingerprint to `hashInput()` (PROJ-AC-19). This is a live correctness bug the moment one-line messages exist. | `src/handlers/rfq/jobs.handler.ts:37` |
| N7 | Eval: a scoped set of one-line project-path inputs, measuring taxonomy-match accuracy against the full path and p50/p95 latency. The scope is only worth shipping if match accuracy holds. | `datasets/`, `docs/eval-runs/` |

### 2B · Web-App

| # | Work | Files |
|---|---|---|
| W1 | `POST /api/agent/quick` BFF relay → `{MANSOUR_URL}/rfq/quick`, forwarding the resolved project context. Falls back to the existing job path on non-2xx or timeout. | new `src/app/api/agent/quick/route.ts` |
| W2 | `process()` branches on `state.projectId`: project → quick path, none → today's `/api/agent/process` byte-identical (PROJ-AC-10). | `src/lib/store/rfq-store.tsx`, `src/lib/api/client.ts` |
| W3 | Inline result: with a project, stay on intake with a small inline spinner and go straight to the canvas; escalate to `Processing.tsx` only past 8 seconds (PROJ-AC-20). | `src/components/screens/Intake.tsx`, `src/components/CreateSurface.tsx` |
| W4 | Cache warming: fire a cheap warm call when intake mounts with a project selected. Best-effort, never blocking, never surfaced. | `src/components/create/ProjectChips.tsx` |
| W5 | Location-conflict pill state (PROJ-AC-24) — the agent still reports a detected location on the quick path; when it disagrees with the project's, the pill asks which wins. | `src/components/create/ProjectPills.tsx` |

---

## Phase 3 — The dashboard

| # | Work | Files |
|---|---|---|
| G1 | Port `renderProjects()` from `prototypes/renter-dashboard-v2.html:863` into React on real data: rail, meta bar, derived first-start/last-end, request count, **Assign new request**, the gantt, the state legend, the per-row action sheet. The prototype is the design; this is a port, not a redesign. | new `src/components/projects/ProjectsBoard.tsx` |
| G2 | The gantt's bar state comes from the existing request/bid state machine, not a new one — reuse whatever `RequestsList`/`workspace` already derives. | `src/components/requests/*`, `src/components/workspace/*` |
| G3 | **Unassigned** bucket + assign/move from it (PROJ-AC-13). | same |
| G4 | Inline title edit, archive toggle. | same |

---

## Tests

| Layer | What |
|---|---|
| Unit | `applyProjectDefaults` — every field in §5.2 lands; agent-filled item fields survive untouched; the operator block is skipped for non-operator subtypes; a pill override beats the project value. |
| Unit | `fieldSource` precedence with the new `project` source (`renter > agent > project > default > empty`). |
| Unit | `operatorApplies` including the unknown-subtype fallback. |
| Unit | `draftToCreateRequest` emits `projectId`/`projectVersion` and omits operator fields for non-operator items. |
| API | `/api/projects` CRUD, owner guard (another user's project 404s, not 403s). |
| API | Submit under a project stamps every fanned request. |
| API | Edit-with-apply skips bid-bearing requests and reports them as skipped. |
| Agent | Full-scope output unchanged after the block reorder (N1). |
| Agent | Same message + two different contexts = two extractions (N6). |
| E2E | Create project → intake chip → pill edit → submit → the submitted request carries the pill's value, and the project still holds the original. |
| E2E | Delete project → requests survive as unassigned. |

## Risks

1. **The block reorder (N1) touches the path every request already uses.** It ships alone, behind the
   eval suite, before anything depends on it.
2. **Haiku match quality.** If the eval (N7) shows a taxonomy-accuracy drop, the fallback is the same
   scope on the current model — still much faster than today, because the output shrank.
3. **Cold prompt cache** makes the first call of a quiet period slow. Warming (W4) reduces it;
   the 8-second escalation (W3) makes it honest when it doesn't.
4. **The field cut (§5.2) is the one thing that is expensive to change later**, because it decides
   what a stored project holds. Phase 1 ships it before any prompt work leans on it, on purpose.
