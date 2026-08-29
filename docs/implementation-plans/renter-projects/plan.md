# Renter Projects — implementation plan

Spec: `docs/specs/007-renter-projects.md` (key **PROJ**). Prototype: `prototypes/renter-projects-v1.html`.

Three repos: **agents-backend** owns the data, **Normalization-Agent** owns the speed, **Web-App** owns everything the renter touches.

Four phases, each shippable on its own:

| | Ships | Renter gets |
|---|---|---|
| **1** | project + prefill | one place per site; requests start filled |
| **2** | work orders + the chart | the whole site, not only what we sourced |
| **3** | the fast agent | one line, answered in seconds |
| **4** | polish | the post-submit offer, titles, guests, ended ordering |

---

## Phase 0 — before any code

- **P0-1** — agree `operator_applicable` with whoever owns the taxonomy data, and set it for the obvious non-operator categories: generators, compressors, light towers, welding machines, tanks, scaffolding.
- **P0-2** — one open item left in spec §15: whether the overtime term also leaves the **supplier** side. It blocks nothing here; it only decides whether Phase 4 gets a small extra ticket.
- **P0-2b** — **The supplier registry must land before this ships to production.** Agree the date with whoever owns it. If it slips, the typed-name fallback ships and the vendor-registered gate is deferred — no other part of this feature changes, because the name is recorded either way (spec §9.2).
- **P0-3** — **Ruled: reuse the existing document storage.** Confirm the agents-backend's document table can take `supply_line` as an owner type. Only if it genuinely cannot does a dedicated table become the fallback — never a JSON list, because a file needs an id you can presign, delete and audit by.

---

## Phase 1 — the project exists and prefills a request

### 1A · agents-backend

| # | Work |
|---|---|
| A1 | `projects` — `id, company_id, owner_user_id, title, location_label, location_lat, location_lng, defaults jsonb, version, created_at, updated_at`. Index `(company_id, updated_at DESC)`. **No `status` column.** Archive is gone: a project reads as **ended** when the last date under it has passed — derived, never set — and ended projects sort last rather than hiding. Delete exists only for an empty project. `defaults` holds exactly seven fields (spec §5.1) — basis, extendable, start, end, hours/day, payment terms, plus the location columns — and **not** working-days-per-week, which the create flow never asks for — and **never** `estimatedDurationDays` or `urgency`, which the web derives at submit. Location stays in its own columns because it is read on every rail card and its lat/lng will be queried. |
| A2 | `requests.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL` + `requests.project_version int NULL`, indexed on `project_id`. **`SET NULL`, never cascade** — PROJ-AC-23 enforced by the database, not by code someone can forget. |
| A3 | `GET/POST /agents/projects`, `GET/PATCH/DELETE /agents/projects/{id}`. **`DELETE` refuses (409) while anything is filed under the project** — the web offers no delete there either, so the refusal is a backstop, not the user's first news of it. The list returns the roll-up (`requestCount`, `workOrderCount`, `firstStart`, `lastEnd`, `unitsAwarded`) **computed server-side** — if the web computes it, one dashboard load fetches every request of every project. |
| A4 | `PATCH` bumps `version` on any `defaults` change. Body takes `applyToRequests: uuid[]` — **an explicit list, never a boolean**; the renter already saw and approved exactly those. Response returns `applied[]` and `skipped[]` with a reason per skip (PROJ-AC-22). |
| A5 | `POST /agents/requests` accepts `projectId` + `projectVersion` and stamps them on **every fanned-out row**. |
| A8 | `GET /agents/renter-suppliers` — the read the award picker needs (spec §9.2). Writes and the registry itself are the suppliers feature's, not this one's. |
| A6 | `PATCH /agents/requests/{id}` accepts `projectId` for assign/move — filing only, no value changes (PROJ-AC-21). |
| A7 | Taxonomy: `operator_applicable boolean NULL` on subcategory (inherits category), served by `GET /agents/taxonomy`. |

`defaults` is one `jsonb`, not twenty columns: the shape follows `draft.ts`, which moves. Nothing queries "all projects with 30-day payment".

### 1B · Web-App — contract & BFF

| # | Work | Files |
|---|---|---|
| B1 | `Project`, `ProjectDefaults`, `ProjectSummary`. `ProjectDefaults` is assembled from the existing `ProjectDetails` / `Preferences` pieces — **do not** define a parallel shape. | new `src/lib/contract/project.ts`, exported from `contract/index.ts` |
| B2 | `projectId` / `projectVersion` on the request contract and `RfqRequestPayload`. | `contract/draft.ts`, `contract/requests.ts` |
| B3 | `operatorApplicable` on `Subcategory`/`Category` + `operatorApplies(ref, taxonomy)` with the fallback tag list (PROJ-AC-11). | `contract/taxonomy.ts` |
| B4 | BFF: `src/app/api/projects/route.ts`, `src/app/api/projects/[id]/route.ts`. Guarded by `sessionUserId()` with **no `AGENTS_TEST_USER_ID` fallback** — unlike the create route, where the fallback is creator attribution rather than authorization (see the comment at `api/requests/route.ts:31`). Fixture fallback when `useRealApp` is false, as `taxonomy/route.ts` does. | new |
| B5 | Forward `projectId`/`projectVersion` through submit. | `api/requests/route.ts`, `lib/api/app-adapters.ts` |
| B6 | `listProjects`, `createProject`, `updateProject`, `deleteProject`, `assignToProject`. | `lib/api/client.ts` |

### 1C · Web-App — prefill, provenance, the operator rule

| # | Work | Files |
|---|---|---|
| C1 | Add `"project"` to `FieldSource`; precedence `renter > agent > project > default > empty`. | `contract/provenance.ts`, `create/Provenance.tsx` |
| C2 | Store: `projectId`, `projectVersion`, `projectDefaults` (resolved, including pill edits); actions `selectProject`, `clearProject`, `patchProjectOverride`. Persisted with the draft so a reload keeps the selection. | `store/rfq-store.tsx` |
| C3 | **`applyProjectDefaults(draft, defaults, taxonomy)`** — pure. Must not touch any field the agent filled, and must skip the operator block for non-operator subtypes. Unit-tested in isolation; the whole feature's correctness sits here. | new `contract/project-apply.ts` |
| C4 | `OperatorRail` does not render when `operatorApplies()` is false, and `operatorNeeded` is forced `"no"`. **Not** the collapsed 72px strip — there is nothing to reopen. | `create/OperatorRail.tsx`, `Canvas.tsx` |
| C5 | `draftToCreateRequest` omits every operator field for non-operator items (PROJ-AC-09). | `lib/api/app-adapters.ts` |
| C6 | **Hide overtime** — `WhenPanel.tsx:259`, `ReadyToSend.tsx:131`, `RequestEditModals.tsx:227` (+ its patch at `:153`). Comment in place, add `docs/overtime-disabled.md` listing every site, following `docs/surveys-disabled.md`. Data path untouched. | those files, new doc |

### 1D · Web-App — intake

| # | Work | Files |
|---|---|---|
| D1 | `ProjectChips` — active projects, most-recently-used, cap 6, *All projects* beyond; hidden for guests. | new `create/ProjectChips.tsx`, mounted in `screens/Intake.tsx` |
| D2 | `ProjectPills` — five headline pills reusing the canvas's option controls + a sheet for the rest. Every edit is a request-local override; changed pills are marked. | new `create/ProjectPills.tsx` |
| D3 | Conflict detection — compare the agent's `detected_locations` against the project's, in the web. String comparison, no model (PROJ-AC-29). | `create/ProjectPills.tsx` |
| D4 | `/create?project=<id>` preselects. | `app/create/page.tsx` |
| D5 | Equipment-only placeholder examples when a project is selected; Arabic for every new string. | `lib/i18n/en.ts`, `ar.ts` |

### 1E · Web-App — project screens

| # | Work |
|---|---|
| E1 | **One `ProjectForm` for New and for Defaults** (spec §13.3) — two sections: **Where** (map picker → address → title) and **When & terms** (basis · start · end · hours/day · extendable · payment terms). Seven fields, no more. Address required; title optional, falling back to the short site name. **No equipment, no machine terms, no terrain, and none of the other preferences — those are request-level (spec §5.3).** The map is the primary location control and needs a real picker (the existing `WherePanel` map, not the prototype's stand-in). |
| E2 | The edit variant adds the apply list — names every row, pre-ticks only the free ones, states the cost on the ones spending a post-bid edit, gives the reason on the rest. Footer is three actions: Cancel · Project only · Save and apply to the ticked. Sends the explicit id list. |
| E3 | Delete: offered only on an empty project. A project with rows opens an explanation instead — what is filed, that a finished site reads as *ended* on its own, and where *Remove from the project* lives. No destructive action is presented. |
| E4 | Nav entry in `AppShell`. |
| E5 | **Project created** follow-up in the same modal (PROJ-AC-48): *Add a work order* vs *Post a new request*, each described, plus *Not now*. Routes to the work-order form or to `/create?project=<id>`. |

**End of Phase 1:** projects work and requests prefill. Nothing is faster yet — deliberate. The field cut (spec §5) is the expensive thing to change later, so it gets proven against real use before any prompt work leans on it.

---

## Phase 2 — work orders, awards, and the chart

### 2A · agents-backend

```sql
CREATE TABLE work_orders (
  id uuid PRIMARY KEY,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  company_id uuid NULL REFERENCES companies(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  title text NULL,
  -- own "when": NULL means inherit the project. Separate columns, not JSON, because
  -- "did this override the end date?" must have a straight answer — that is the conflict.
  rental_basis text NULL, extendable boolean NULL,
  start_date date NULL, end_date date NULL,
  hours_per_day smallint NULL, working_days_per_week smallint NULL,
  when_conflict_ack boolean NOT NULL DEFAULT false,
  terms jsonb NOT NULL DEFAULT '{}',        -- machine terms, shape follows draft.ts
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_order_items (
  id uuid PRIMARY KEY,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  project_id uuid NULL,                     -- denormalised: the chart is one union query
  -- Off-catalogue machines are legal HERE and nowhere else (spec §5.2.1): a work order
  -- never reaches a supplier, so it needs no id to bid against.
  category_id uuid NULL, subcategory_id uuid NULL, measurement_id uuid NULL,
  raw_label text NULL, raw_size text NULL,
  CONSTRAINT named_or_matched CHECK (
    (category_id IS NOT NULL AND subcategory_id IS NOT NULL AND measurement_id IS NOT NULL)
    OR (raw_label IS NOT NULL AND length(btrim(raw_label)) > 0)),
  quantity integer NOT NULL DEFAULT 1,
  attachment_ids jsonb NOT NULL DEFAULT '[]',
  custom_attachments jsonb NOT NULL DEFAULT '[]',
  item_terms jsonb NOT NULL DEFAULT '{}',   -- per-item overrides of work_orders.terms
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ANOTHER FEATURE'S, and it ships BEFORE this reaches production (spec §9.2). Shown here only
-- because the award picker reads it. This feature builds ONE call against it —
-- GET /agents/renter-suppliers — and no writes, no management UI, no upsert-on-bid-accept.
CREATE TABLE renter_suppliers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  added_by_user_id uuid NOT NULL REFERENCES users(id),
  platform_supplier_id uuid NULL REFERENCES suppliers(id),  -- one of ours
  name text NULL,                                           -- typed in, off-platform
  contact_name text NULL, phone text NULL, email text NULL,
  vendor_registered boolean NOT NULL DEFAULT false,
  registered_at timestamptz NULL, registered_by uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_identity CHECK (
    (platform_supplier_id IS NOT NULL AND name IS NULL) OR
    (platform_supplier_id IS NULL     AND name IS NOT NULL))
);
CREATE UNIQUE INDEX renter_suppliers_platform_uq
  ON renter_suppliers (company_id, platform_supplier_id)
  WHERE platform_supplier_id IS NOT NULL;

-- Named `supply_lines`, not `awards`: "award" already means *accept a bid* in this product, and
-- this row deliberately is not that. One row = one supply line — who supplies how many, for how
-- long. The renter-facing word stays **Award**, which is what procurement calls it.
CREATE TABLE supply_lines (
  id uuid PRIMARY KEY,
  -- SET NULL, not CASCADE: the tracking layer is the renter's own and never disappears with a
  -- marketplace row. A hard-deleted request leaves its supply line standing, marks and papers intact.
  request_id uuid NULL REFERENCES requests(id) ON DELETE SET NULL,
  work_order_item_id uuid NULL REFERENCES work_order_items(id) ON DELETE CASCADE,
  project_id uuid NULL,                     -- denormalised, same reason
  -- Both, always. The link once the registry answers; the name as it stood at award time,
  -- written even after the link exists. A row renders from the name it already holds, so it
  -- survives the registry being unavailable, a supplier being removed, or a match never made.
  renter_supplier_id uuid NULL REFERENCES renter_suppliers(id),
  supplier_name      text NOT NULL,
  platform_supplier_id uuid NULL REFERENCES suppliers(id),   -- known for free on a marketplace award
  units integer NOT NULL CHECK (units > 0),
  rate_amount numeric(12,2) NULL, rate_period text NULL, currency text NOT NULL DEFAULT 'SAR',
  start_date date NULL, end_date date NULL,
  mobilized_at timestamptz NULL, demobilized_at timestamptz NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- One parent at creation. It may later lose a hard-deleted request and stand alone.
  CONSTRAINT one_parent CHECK (NOT (request_id IS NOT NULL AND work_order_item_id IS NOT NULL))
);

-- NO new document table. Papers attach through the document storage the product already has
-- (company documents, bid documents, the generated quotation) with the award as a new owner
-- type, so every file in the product stays one addressable, presignable, deletable thing.
--   documents: + owner_type 'supply_line', + owner_id, + kind 'po'|'contract'|'quotation'

ALTER TABLE requests ADD COLUMN work_order_id uuid NULL REFERENCES work_orders(id);  -- provenance only
```

Endpoints:

```
GET/POST         /agents/projects/{id}/work-orders
GET/PATCH/DELETE /agents/work-orders/{id}
GET              /agents/projects/{id}/chart        -- the union, one call
POST/PATCH/DELETE/agents/supply-lines[/{id}]
POST/DELETE      /agents/supply-lines/{id}/documents[/{docId}]   -- onto the existing document store
GET              /agents/renter-suppliers           -- THE ONLY ONE WE BUILD (spec §9.2)
-- POST / PATCH belong to the suppliers feature, not this one.
```

Two rules the application enforces, not the database:

1. `SUM(units)` per item may not exceed its quantity (a CHECK cannot span rows) — guard in the award handler plus a periodic consistency check.
2. `renter_supplier_id` must be `vendor_registered` at award time.

And one hook: **accepting a bid upserts a linked `renter_suppliers` row** (unregistered), so the list builds itself (PROJ-AC-20).

### 2B · Web-App

| # | Work | Files |
|---|---|---|
| W1 | Contracts: `WorkOrder`, `WorkOrderItem`, `AwardAllocation`, `AllocationDocument`, `RenterSupplier`; `ChartRow` = the union shape the chart renders. | new `contract/work-order.ts`, `contract/award.ts` |
| W2 | BFF relays for every endpoint above. | new `api/work-orders/**`, `api/supply-lines/**`, `api/renter-suppliers/**` |
| W3 | **`ProjectsBoard`** — port the rail, meta bar and chart from `prototypes/renter-projects-v1.html` onto real data, including the **Unassigned** bucket and the ended-last ordering. The design is settled (spec §13); this is a port, not a redesign. | new `components/projects/ProjectsBoard.tsx` |
| W4 | The chart row = **one allocation**. Un-awarded items draw one hatched row. **No legend.** Pins sit on the bar's **top edge**, unlabelled — **green** mobilized, **orange** demobilized, date in the tooltip. Documents render as **orange markers in the row's top corner**, `+N` past three. | `components/projects/ChartRow.tsx` |
| W5 | Row menu by type (spec §8.4), including the generated-quotation link on marketplace rows only. | `components/projects/RowMenu.tsx` |
| W6 | Award dialog — units split across suppliers, unregistered ones disabled with a route to register, over-allocation blocked. Un-awarding is never blocked; its confirm names every document that will be deleted with the allocation (PROJ-AC-38). | `components/projects/AwardDialog.tsx` |
| W7 | Work-order form — **equipment first, supplier second** (spec §13.4): machines with the taxonomy cascade, then shared machine terms (operator block **absent**, not disabled, for non-operator types), then period + per-machine supplier lines. Saving writes the work order, its items **and one allocation per supplier line**. Own period raises a conflict, never a block. | `components/projects/WorkOrderForm.tsx` |
| W8 | Documents dialog; suppliers dialog with the registration toggle; move-to-project; remove-from-project (unfiles, never deletes); un-award confirm naming the documents that go with it. | `components/projects/` |
| W10 | Conflict dialog on a group whose period differs from its project — keep it, or match the project through the ordinary edit rules. | `components/projects/ConflictDialog.tsx` |
| W9 | Templates in intake — the **Start from** dropdown listing work orders *and* past requests, copying machine terms and any `when` override, never the equipment. | `create/ProjectPills.tsx`, `contract/project-apply.ts` |

---

## Phase 3 — the fast agent

### 3A · Normalization-Agent

| # | Work | Files |
|---|---|---|
| N1 | **Reorder the prompt blocks, alone, first.** A = taxonomy, B = scope instructions, C = learned rules + few-shot, each `cache_control`. Eval before and after; full-scope output must be unchanged (PROJ-AC-35). Nothing else in this phase is safe until it is green. | `services/rfq.service.ts:812-828`, `constants/rfq-prompt.ts` |
| N2 | **Tier 0** — `resolveEquipmentLine(text, taxonomy)`: strip a leading quantity, keyword-scan with `extractEquipmentKeywords()`, resolve `number + unit` to a measurement, and **refuse** on any ambiguity or leftover words (spec §12.2). No model, no job row. | new `services/equipment-quick-match.ts` |
| N3 | **Tier 1** — `buildEquipmentOnlyInstructions()`: `line_items` only, no `rfq_header`, no header-level missing fields, no header notes. | `constants/rfq-prompt.ts` |
| N4 | `scope` on the extraction input; branch prompt variant, model, `max_tokens`, few-shot limit. **No project context is accepted or required** (PROJ-AC-32). | `services/rfq.service.ts`, `types/rfq.types.ts` |
| N5 | Config: `MANSOUR_RFQ_EQUIPMENT_MODEL_ID` (default Haiku), `MANSOUR_RFQ_EQUIPMENT_FEWSHOT_LIMIT` (default 5), `max_tokens: 4096` for the scope. | `config/index.ts` |
| N6 | `POST /rfq/quick` — synchronous. Tier 0 first; on refusal, Tier 1. Same `validateItems` / `computeItemVerdict` / persistence as the job path, so corrections and learning still work. Still passes through `rfqExtractionLimiter`. | new `handlers/rfq/quick.handler.ts`, `handlers/rfq/index.ts` |
| N7 | **Fix `hashInput()`** — add `scope` and a context fingerprint (PROJ-AC-36). A live correctness bug the moment one-line messages exist. | `handlers/rfq/jobs.handler.ts:37` |
| N8 | Eval: one-line and short-sentence project-path inputs. Report **Tier 0 hit rate** and **Tier 1 match accuracy vs the full path**, plus p50/p95. Both are gates. | `datasets/`, `docs/eval-runs/` |

### 3B · Web-App

| # | Work | Files |
|---|---|---|
| X1 | `POST /api/agent/quick` → `{MANSOUR_URL}/rfq/quick`; falls back to the job path on non-2xx or timeout. | new `api/agent/quick/route.ts` |
| X2 | `process()` branches on the **text shape**, not on whether a project exists. No project + paragraph stays byte-identical (PROJ-AC-31). | `store/rfq-store.tsx`, `lib/api/client.ts` |
| X3 | Inline result on the intake screen; escalate to `Processing.tsx` only past 8 seconds. | `screens/Intake.tsx`, `CreateSurface.tsx` |
| X4 | Warm the prompt cache when intake mounts with a project selected. Best-effort, never blocking, never surfaced. | `create/ProjectChips.tsx` |

---

## Phase 4 — the rest

| # | Work |
|---|---|
| Y1 | Both post-submit offers — **file it into the project you already have here**, or **create a project from this request** (PROJ-AC-30/46/47): the ask, plus two labelled lists of the renter's own values — *saved as the project* vs *stays with this request*. Permanently dismissible per device. |
| Y2 | Inline title editing at all three levels, with the fallback rules (PROJ-AC-37). |
| Y3 | Guest handling: no chips, no projects, intake otherwise unchanged (PROJ-AC-28). |
| Y5 | *Ended* ordering in the rail and the intake chips, plus the ended tag. |
| Y4 | The one open item in spec §15, if it lands: removing the overtime term from the supplier side too. |

*(Unassigned, move and remove moved into Phase 2 — the chart is unusable without them.)*

---

## Tests

| Layer | What |
|---|---|
| Unit | `applyProjectDefaults` — every project field lands; agent-filled fields survive untouched; the operator block is skipped for non-operator subtypes; a pill override beats the project. |
| Unit | Template copy — every machine term carried, **no** equipment field, **no** budget. |
| Unit | `fieldSource` precedence with the new `project` source. |
| Unit | `operatorApplies`, including the unknown-subtype fallback. |
| Unit | Chart row derivation: an item with two allocations yields two rows; an un-awarded item yields one ghost row. |
| Unit | `projectSpan()` — the axis covers the project's window plus every award and every group-level period under it, including un-awarded ones (PROJ-AC-57). |
| Unit | A bar with no award dates inherits the request's or work order's, then the project's (PROJ-AC-58). |
| Unit | Over-allocation is refused; award with an unregistered supplier is refused. |
| API | Projects CRUD + owner guard (another company's project 404s, not 403s). |
| API | Submit under a project stamps every fanned request. |
| API | Apply-to-existing skips bid-bearing and closed requests and names them in `skipped[]`. |
| API | `DELETE /agents/projects/{id}` 409s while anything is filed under it, and succeeds when empty. |
| API | A work order delete cascades its items and allocations; there is no delete path for a request. |
| Unit | `projectEnded()` — derived from the last date under the project, falling back to its own end date when nothing is filed. |
| Unit | A work-order machine saves free-text with no taxonomy id; the same shape is rejected for a request. |
| Unit | A per-machine override wins over the shared term; clearing it falls back, leaving no stale copy in `item_terms`. |
| API | `PATCH /agents/work-orders/{id}` upserts items by id — an edit that renames a machine keeps every award, mark and document under it. |
| API | Editing a work order's period moves only the awards the renter ticked; the rest keep their dates. |
| API | Accepting a bid upserts a linked `renter_suppliers` row. |
| API | Deleting an allocation removes its documents and pins with it, and is never refused. |
| Unit | `ProjectDefaults` carries exactly the seven fields in spec §5.1 — a test that fails if terrain, working-days-per-week, budget, payment method, maintenance, SLA, supplier filters or bid window creep back onto the project. |
| Unit | `estimatedDurationDays` and `urgency` are still derived at submit, never read from the project. |
| Agent | Full-scope output unchanged after N1. |
| Agent | Tier 0 refuses every ambiguity case in spec §12.2. |
| Agent | Same message, two contexts → two extractions (N7). |
| E2E | Project → chip → template → type one line → submit; the request carries the template's terms and the template is unchanged. |
| E2E | Work order → award split across two suppliers → two chart rows → mobilize one → the other is untouched. |
| E2E | Project defaults → tick a no-bid request → it follows the project; the bid-bearing one left unticked does not, and keeps its own values. |
| E2E | Remove a request from a project → it appears under Unassigned with award, marks and papers intact → move it into another project → not one value changed. |
| E2E | Un-award a row with a PO attached → confirm names the file → the item returns to awaiting an award and the request is untouched. |

---

## Risks

1. **N1 touches the path every request already uses.** It ships alone, behind the eval, before anything depends on it.
2. **Haiku match quality.** If N8 shows a drop, keep the scope and revert the model — the output cut alone is most of the win.
3. **Tier 0 must be strict.** A wrong instant match is worse than a slow right one. Every refusal case in spec §12.2 is a test, not a guideline.
4. **Two rows for one machine** (a work order also posted as a request) is intended, and will read as duplication to some renters. The header counts requests and work orders separately rather than adding them.
5. **The field cut is the expensive thing to change.** Phase 1 ships it before the prompt work leans on it, on purpose.

---

# Appendix A — behaviour inventory

Every scenario the feature has, what happens, and where it lives. `→` is the function or file that
owns it. This is the checklist an engineer works from and a reviewer signs off against.

## A1 · Project

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| P-1 | Create a project | Map pin → address (required) → title (optional) → when & terms. No equipment, no machine terms. Ends by offering a work order or a request. | `ProjectForm` · `dlgProjectCreated` |
| P-2 | Blank title | Renders the location's short name (first address segment, postcode stripped) marked *default*. | `projectTitle()` · `shortSite()` |
| P-3 | Open project defaults | The **same form**, prefilled, plus the propagation section. | `ProjectForm(mode:"edit")` |
| P-4 | Save · project only | Bumps `version`. Nothing filed under it changes. | `PATCH /agents/projects/{id}` |
| P-5 | Save · apply to ticked | Sends the explicit id list. Server re-checks each against the request's own edit rule and answers `applied[] / skipped[]`. | A4 |
| P-6 | A ticked request has bids | Allowed once; spends `renteeEditUsed`. The dialog said so before the tick. | `requestActions()` |
| P-7 | A ticked request already spent it | Refused server-side and returned in `skipped[]` with a reason — never silently dropped. | A4 |
| P-8 | Change the location | Propagates like any other field, under the same gate. The dialog names it as a site move, not a routine edit. | P-5 |
| P-9 | A finished site | Reads as **ended** the moment its last date has passed. Derived, never set. Sorts last in the rail and the chips; never hidden. | `projectEnded()` |
| P-10 | Delete | Offered **only on an empty project**. Otherwise an explanation, no destructive action, and a pointer to *Remove from the project*. | A3 · E3 |
| P-11 | Inline rename | Same fallback rule as P-2. | `ProjectsBoard` |
| P-12 | Roll-up | `requestCount · workOrderCount · firstStart · lastEnd · unitsAwarded` computed **server-side**. Requests and work orders counted separately, never summed. | A3 |
| P-13 | Two members edit at once | `version` mismatch on `PATCH` → **409**, and the web re-reads before retrying. | A4 |
| P-14 | Any member acts | No permission check. `owner_user_id` is displayed, never enforced. | §4.1 |

## A2 · Work order

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| W-1 | Create | Equipment first (cascade: category → subtype → size, each level disabled until its parent), then shared machine terms, then period + supplier lines. | `WorkOrderForm` |
| W-1b | A machine we don't list | Typed in free-text instead of picked. Legal on a work order, never on a request (spec §5.2.1). Reads as operator-applicable. | `machineReady()` · `machineOperatorApplies()` |
| W-2 | Several machines | One card each. Terms are shared at order level and **overridable per machine** — the card carries *Different terms for this machine* and counts how many it holds. Same shape as the request canvas's per-item overrides. | `termsFields()` · `item_terms` |
| W-3 | No machine takes an operator | The operator block is **absent**, not disabled, with one line saying why. | `operatorApplies()` |
| W-4 | Own period differs from the project | Warned in the form, saved anyway, and the group header carries a *differs from the project* chip. Never a block. | `whenDiffers()` |
| W-5 | Save | Writes the work order, its items **and one allocation per supplier line** — awarded the moment it exists. | `saveWorkOrder()` |
| W-6 | Split units at creation | Several supplier lines per machine, capped at its quantity. | W-1 |
| W-7 | Edit | Same form. **Items are upserted by id, never replaced** — replacing them gives new ids and `ON DELETE CASCADE` then silently deletes every award, mark and document under the order. | `PATCH /agents/work-orders/{id}` |
| W-7b | Edit its period | **Move the awards to the new period?** — one row per award, ticked or not. Pre-ticked only where the award still sits on the old period; an award with its own dates is listed unticked, showing them. Same shape as the project's propagation, one scope smaller. | `WorkOrderForm` · `woAwards()` |
| W-8 | Delete | Cascades its items and allocations. Confirm counts both. | `ON DELETE CASCADE` |
| W-9 | Also posted as a request | **Two rows.** `requests.work_order_id` is provenance only and changes no rendering. | §10 |

## A3 · Request

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| R-1 | Intake · project + template | Project fills where/when/preferences, template fills machine terms, the text fills equipment. | `applyProjectDefaults()` |
| R-2 | Intake · project, no template | Machine terms fall to today's defaults and the renter answers them on the canvas. | R-1 |
| R-3 | Intake · no project | Today's flow exactly. After submit: if the stated place **already has a project**, the offer is to file it there (PROJ-AC-52/53); if not, the offer is to create one. | §11.3 · `matchingProjects()` |
| R-4 | Submit | `projectId` + `projectVersion` stamped on **every fanned row**. | A5 |
| R-5 | File an existing request | From Unassigned, or any row's menu. The picker **leads with the projects at that request's own site** — named cards, one click — with the rest in a select. That, not a second entry point, is what makes filing forty old requests survivable. | `projectsAtPlace()` · A6 |
| R-6 | Move between projects | Filing only. Not one value changes, even where the new project differs. Allowed after bids. | A6 |
| R-7 | Remove from a project | Unfiles. Award, marks and papers stay intact. | A6 |
| R-8 | Edit rules | Free with no bids · once after bids · never past that · never when not OPEN/ACTIVE. | `requestActions()` |
| R-9 | Reduce quantity below allocated units | Refused with the reason — un-award first. | award guard |
| R-10 | Request closed/expired while awarded | The tracking row stays. The group header shows the marketplace status; nothing is auto-un-awarded. | `ProjectsBoard` |

## A4 · Award & tracking

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| A-1 | Award an item | Supplier · units · rate · start · end. Not the marketplace accept; reads nothing from the deal room. | `AwardDialog` |
| A-2 | Split across suppliers | Several allocations on one item — **each is its own chart row**, bar, marks and papers. | A-1 |
| A-3 | Over-allocate | Blocked in the UI and guarded server-side (a CHECK cannot span rows). | award guard |
| A-4 | Unregistered supplier | Listed but not selectable, with *Mark as vendor registered* beside it. | `renter_suppliers.vendor_registered` |
| A-5 | Change an award | Same dialog. Marks and papers survive on an allocation that keeps its id. | `saveAward()` |
| A-6 | Un-award | Never blocked. Confirm names every document that goes with it. Item returns to awaiting an award; the request is untouched. | PROJ-AC-38 |
| A-7 | Mobilize / demobilize | Per allocation, both undoable. Green and orange marks on the bar's top edge, no captions. | `togglePin()` |
| A-8 | Un-awarded item | One hatched row over the inherited dates. **No marks, no papers** — there is no allocation to hang them on. | `openRowHtml()` |
| A-9 | Attach a document | PO · contract · supplier quotation · other. Several per allocation, held in the product's existing document storage with the award as owner. | documents (existing) |
| A-10 | Our quotation | A **download** of the backend-generated PDF, marketplace rows only. Never an upload slot. | `GET /api/deal-rooms/{id}/quotation` |
| A-11 | Unassigned row | No project ⇒ no inherited dates ⇒ no bar. The row still lists and can be filed. | `unfiledRowHtml()` |

## A5 · Suppliers

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| S-1 | Read the list | One call, `GET /agents/renter-suppliers`. **The only thing this feature builds against the registry** (spec §9.2). | `listRenterSuppliers()` |
| S-2 | The award picker · endpoint answers | The supplier list, only **vendor-registered** selectable, the rest disabled with *Mark as vendor registered*. This is what production sees. | `AwardDialog` |
| S-3 | The award picker · endpoint not there yet | A text field with autocomplete over names already used on this project. A development condition, not a product mode. | `AwardDialog` |
| S-4 | Either way | `supplier_name` is written on the supply line, so the row renders from a name it holds. | `supply_lines` |
| S-5 | Adding · registering · managing · upsert-on-accept | **Out of scope.** The suppliers feature owns all of it, and ships first. | — |

## A6 · Intake & the agent

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| I-1 | Chips | Active projects, most-recently-used, cap 6, *All projects* beyond. Hidden for guests. | `ProjectChips` |
| I-2 | Pills | Five headline values + a sheet for the rest. Every edit is **request-local**. | `ProjectPills` |
| I-3 | Template dropdown | Work orders **and** past requests in this project. Copies machine terms and any `when` override — never the equipment. | I-2 |
| I-4 | Location conflict | The web compares the agent's `detected_locations` with the project's. Keep it, or use the project's. May stay different. | `detectConflict()` |
| I-5 | Tier 0 | One equipment line → keyword + size match, **no model**, ~50 ms. Refuses on any ambiguity. | `resolveEquipmentLine()` |
| I-6 | Tier 1 | A sentence with a project → small model, `line_items` only, synchronous. | `POST /rfq/quick` |
| I-7 | Tier 2 | Paragraph or file, no project → today's path, byte-identical. | unchanged |
| I-8 | Escalation | Inline on intake; the processing screen only past 8 s. | X3 |
| I-9 | Cache warm | Fired when intake mounts with a project selected. Best-effort, never surfaced. | X4 |
| I-10 | Dedup | `scope` + context fingerprint in the hash, or two renters typing the same line share an answer. | N7 |
| I-11 | Stale draft | A saved draft whose project was deleted drops the selection on rehydrate and says so. | `rfq-store` |
| I-12 | Guest signs in mid-flow | The draft has no project; chips appear from the next visit. No retro-fill. | `rfq-store` |

## A7 · Cross-cutting

| # | Scenario | Behaviour | Owner |
|---|---|---|---|
| X-1 | Provenance | New `project` source; precedence `renter > agent > project > default > empty`. | `provenance.ts` |
| X-2 | Titles | Optional at all three levels; blank falls back and is marked *default*. | PROJ-AC-37 |
| X-3 | Overtime | Hidden on every renter surface, data path untouched. | §5.4 |
| X-4 | Denormalised `project_id` | On `work_order_items` and `supply_lines`. Moving a group updates its items **and their supply lines**, in one handler. | A6 |
| X-5 | Arabic / RTL | Every new string bilingual; the chart, pins and pills are logical-property based. | i18n |
| X-6 | Empty states | No projects · project with nothing filed · Unassigned empty · no suppliers yet. | `ProjectsBoard` |

---

# Appendix B — decisions that still need a call

Found while walking the plan. None block Phase 1.

1. ~~**A second entry point for filing.**~~ **Resolved differently.** Unassigned is already the door;
   a second one on the requests list adds surface without adding capability. The real problem was
   *picking* — so the picker now leads with the projects at the row's own site (PROJ-AC-54), and most
   requests never reach Unassigned at all because they are offered a project at the moment they are
   posted (§11.3).
2. ~~**`supply_lines.request_id ON DELETE CASCADE`.**~~ **Ruled:** the tracking layer is the renter's
   own, so it never disappears with a marketplace row. `ON DELETE SET NULL` — the supply line survives
   as a machine he recorded, with its marks and its papers intact.
3. **Templates from another project.** The dropdown lists only this project's. A renter's first request
   in a new site has nothing to copy, though their last site's terms are usually right. Add a second
   group — *…or from another project* — later, not in v1.
4. **Propagating supplier filters to a live RFQ.** *Verified only* and *bid window* change who can bid
   and for how long. Legal under the edit rule, but the dialog should say that plainly rather than
   treating them as ordinary fields.
5. **A request closed or expired under an award.** The tracking row stays — independence says so — but
   the renter should see it. A quiet marketplace-status marker on the group header, not a correction.
6. **Reducing an item's quantity below its allocated units.** Refuse and say to un-award first (R-9),
   or auto-trim the last allocation? Refusing is honest; auto-trimming is silent.
