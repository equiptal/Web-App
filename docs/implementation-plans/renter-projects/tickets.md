# Tickets — Renter Projects, Work Orders & Site Tracking (web)

| | |
|---|---|
| **Key** | PROJ |
| **Branch** | `web-app/renter-projects` off `staging` |
| **Spec** | `docs/specs/007-renter-projects.md` |
| **Plan** | `docs/implementation-plans/renter-projects/plan.md` |
| **Prototype** | `prototypes/renter-projects-v1.html` — the design is settled; these are ports, not redesigns |
| **Depends on** | `Moedatech-App` MA-T1…T13 · `Normalization-Agent` NA-T1…T9 |

Three levels: a **project** (the site), **work orders** (machines that never came from our marketplace), and **requests** (the RFQ we already build). All three land on one chart. Creating a request becomes one line of typing.

## The rules every ticket below is written against

- **Nothing propagates downward after creation** — except on the renter's explicit tick, and then only through the request's own edit rule (`requestActions()`, `contract/workspace.ts:213`).
- **A request stores its own copy at submit and never reads its project again.**
- **The agent never sees a project value.** The web merges.
- **The award is private.** Not the marketplace accept.

---

## Phase 1 — the project exists and prefills a request

### W-T1 — Contracts
**Scope:** contract
**Files:** new `src/lib/contract/project.ts`, `contract/work-order.ts`, `contract/supply-line.ts`; edit `contract/draft.ts`, `contract/requests.ts`, `contract/taxonomy.ts`, `contract/index.ts`

- `Project` · `ProjectDefaults` · `ProjectSummary`. **Assemble `ProjectDefaults` from the existing `ProjectDetails` / `Preferences` pieces — never retype the fields**, or it drifts from `draft.ts`.
- `WorkOrder` · `WorkOrderItem` · `MachineTerms` · `SupplyLine` · `ChartRow`.
- `projectId` / `projectVersion` on the request contract and `RfqRequestPayload`.
- `operatorApplicable` on `Subcategory` / `Category`.

**Given/When/Then**
- Given `ProjectDefaults` / Then it carries exactly the seven fields in spec §5.1 — a test that fails if terrain, days-per-week, budget, payment method, maintenance, SLA, supplier filters or bid window creep back on.

### W-T2 — BFF routes
**Scope:** api-integration
**Files:** new `src/app/api/projects/**`, `api/work-orders/**`, `api/supply-lines/**`, `api/renter-suppliers/route.ts`; edit `api/requests/route.ts`

Guarded by `sessionUserId()` with **no `AGENTS_TEST_USER_ID` fallback** — the create route keeps one because there `userId` is *creator attribution*; here it is *authorization*, and a fallback would hand one company's projects to a session-less caller (see the comment at `api/requests/route.ts:31`). Fixture fallback when `useRealApp` is false, as `taxonomy/route.ts` does.

### W-T3 — Client functions
**Scope:** api-integration
**Files:** `src/lib/api/client.ts`, `lib/api/app-adapters.ts`

`listProjects` · `createProject` · `updateProject` · `deleteProject` · `assignToProject` · `listWorkOrders` · `saveWorkOrder` · `deleteWorkOrder` · `saveSupplyLine` · `deleteSupplyLine` · `listRenterSuppliers` · `fetchChart`. Forward `projectId`/`projectVersion` through `draftToCreateRequest`.

### W-T4 — `applyProjectDefaults` + the `project` provenance
**Scope:** contract
**Files:** new `src/lib/contract/project-apply.ts`; edit `contract/provenance.ts`, `components/create/Provenance.tsx`

The pure merge. **Two hard rules: never touch a field the agent filled, and skip the operator block for non-operator subtypes.** Unit-tested in isolation before anything is wired to it — the whole feature's correctness sits here.

Add `"project"` to `FieldSource`; precedence `renter > agent > project > default > empty`.

**Given/When/Then**
- Given the agent set a start date / When a project is applied / Then the agent's value stands.
- Given a generator / Then no operator term is written.

### W-T5 — The operator rule
**Scope:** web-create
**Files:** `contract/taxonomy.ts`, `components/create/OperatorRail.tsx`, `create/Canvas.tsx`, `lib/api/app-adapters.ts`

`operatorApplies(ref, taxonomy)` reads the backend flag, with a small category-tag fallback for anything unrecognised (treated as applicable). Where false: `operatorNeeded` forced `"no"`, **`OperatorRail` does not render at all** — not the collapsed 72px strip, there is nothing to reopen — and `draftToCreateRequest` omits every operator field.

The renter's own words still win: an explicit *"generator with operator"* shows the rail, with a note.

### W-T6 — Hide the overtime rate
**Scope:** web-create
**Files:** `create/WhenPanel.tsx:259`, `create/ReadyToSend.tsx:131`, `requests/RequestEditModals.tsx:227` (+ its patch at `:153`); new `docs/overtime-disabled.md`

Comment in place following `docs/surveys-disabled.md`; one doc listing every site so re-enabling is mechanical. **The data path is untouched** — it keeps defaulting to `"without"` and keeps being sent, so no backend contract moves.

Open: whether the term also leaves the **supplier** side (`BidFormClient.tsx:1048`, `CompareMatrix.tsx:54`, `DealRoom.tsx:1169`). Out of scope until ruled.

### W-T7 — `ProjectChips`
**Scope:** web-create
**Files:** new `components/create/ProjectChips.tsx`; mount in `screens/Intake.tsx`

Every project, most-recently-used first, capped at six with *All projects* beyond. **Ended ones sort last, tagged, never hidden** — hiding a project because a date passed would silently break a renter who extended verbally.

**The row renders nothing at all when there is nothing to show** — a guest, or a signed-in renter with no projects yet. Not an empty label, not a placeholder. A renter who has never made a project must see today's intake, unchanged, so nothing about this feature reaches someone who is not using it.

**Given/When/Then**
- Given a signed-in renter with zero projects / Then the intake screen is identical to today's, with no chip row and no caption.
- Given a guest / Then the same.

### W-T8 — `ProjectPills` + the caption + the conflict
**Scope:** web-create
**Files:** new `components/create/ProjectPills.tsx`

Five headline pills — project · site · basis · dates · hours/day — plus *+2 more project defaults* opening a sheet. **Every edit is request-local; the project is never written**, and a changed pill is marked.

Beneath them, the caption that says what the project did *not* fill:

> **You type the machine** — what it is, its size, how many, and any accessory. Everything else above is filled in already.

Without it, a screen of filled controls implies the equipment is handled too.

**Conflict:** compare the agent's `detected_locations` with the project's, **in the web** — string comparison, no model. The site pill turns red and offers *keep what I wrote* / *use the project's site*. Keeping it is valid; the request sits in the project with a different site.

**Given/When/Then**
- Given a pill edited / Then the project is unchanged and the request carries the new value.

### W-T9 — *Start from* (templates)
**Scope:** web-create
**Files:** `create/ProjectPills.tsx`, `contract/project-apply.ts`

Lists work orders **and** past requests in this project, most-recent first, labelled `kind · ref · first machine`. Copies **all** machine terms and the source's own `when` override; copies **no** equipment and **no** budget. A one-time copy — the source is never re-read, so deleting it later changes nothing.

Project-scoped only. Cross-project templates are deliberately out of v1.

### W-T10 — `ProjectForm` (New and Defaults are one component)
**Scope:** web-projects
**Files:** new `components/projects/ProjectForm.tsx`, `app/projects/page.tsx`

Two sections, **seven fields, no more**: **Where** (map picker → address → title) and **When & terms** (basis · start · end · hours/day · extendable · payment terms).

The **map leads** and the address follows the pin — dropping a pin is how a site is chosen; typing an address is the fallback. Use the existing `WherePanel` picker, not a new one. Address required; blank title falls back to the location's short name, marked *default*.

The edit variant adds the propagation list and nothing else. Footer is **three** actions — *Cancel · Project only · Save and apply to the ticked* — because "apply to existing" is a separate decision, not a checkbox on Save.

### W-T11 — The propagation dialog
**Scope:** web-projects
**Files:** `components/projects/ProjectForm.tsx`

One row per filed item, computed from `requestActions()`: *no bids — free to edit* · *has bids — uses its one post-bid edit* · *post-bid edit already used* · *closed* · *work order — always editable*. **Pre-tick only the free ones** — a pre-ticked bid-bearing request spends an edit the renter did not intend to spend. Send the explicit id list; render `skipped[]` afterwards.

### W-T12 — Delete, and *Project created*
**Scope:** web-projects
**Files:** `components/projects/**`

**Delete is offered only on an empty project.** A project with rows opens an explanation instead — what is filed, that a finished site reads as *ended* on its own, and where *Remove from the project* lives. No destructive action is presented at all.

**After creating one**, the same modal asks what goes on the site — an empty project is useless and *Add work order* otherwise lives on a board the renter has not seen:

> **Add a work order** — a machine already on site; private, no supplier ever sees it.
> **Post a new request** — ask our suppliers; the site's terms are filled in already.

---

## Phase 2 — work orders, awards, and the chart

### W-T13 — `ProjectsBoard`
**Scope:** web-projects
**Files:** new `components/projects/ProjectsBoard.tsx`

Rail (projects, ended last and tagged · **Unassigned** when anything is filed nowhere · New project), meta bar (title with inline edit · location with its padlock · derived first-start/last-end · counts), and the chart.

**Requests and work orders are counted separately, never summed** — a work order also posted as a request is deliberately two rows.

**`.panel` has `overflow:hidden` for the chart's sake; Unassigned has no chart and must not clip** — it was cutting the row menu in the prototype and will do the same here.

### W-T14 — `ChartRow`
**Scope:** web-projects
**Files:** new `components/projects/ChartRow.tsx`

**One row per supply line**, not per item. An un-awarded item is one hatched row reading *awaiting award* — no marks, no papers, because there is no supply line to hang them on.

- Bar = `start → end`, **no state**. Solid navy awarded, hatched grey not.
- **No legend.** Green mark = mobilized, orange = demobilized, unlabelled, on the bar's **top edge** — centred they cover the bar's own dates. Date in the tooltip.
- Documents as **orange markers in the row's top corner**, `+N` past three.
- The axis holds every date under the project, including an un-awarded work order's own window.

### W-T15 — `RowMenu`
**Scope:** web-projects
**Files:** new `components/projects/RowMenu.tsx`

By row type (spec §8.4). Marketplace rows carry three navigation-only links — *Open the request*, *Our quotation* (a **download** of the existing generated PDF, never an upload slot), *Open the deal room*. Work orders have neither quotation nor deal room.

An unfiled row's action reads **File in a project**, not *Move to another project* — it was never in one.

### W-T16 — `AwardDialog`
**Scope:** web-projects
**Files:** new `components/projects/AwardDialog.tsx`

Supplier · units · rate · start · end, with **Split across another supplier** and a running `used of quantity` counter that blocks Save when over.

**The supplier control has two modes, chosen by whether `GET /agents/renter-suppliers` answers** — the real picker with the vendor-registered gate, or a text field with autocomplete over names already used. Production only sees the picker; the fallback exists so we are not blocked while the registry lands.

`supplierName` is written either way.

**Un-award is never blocked**, including with a PO attached — the confirm names every document that goes with it, and says the marks go too.

### W-T17 — `WorkOrderForm`
**Scope:** web-projects
**Files:** new `components/projects/WorkOrderForm.tsx`

**Equipment first, supplier second.** Three fieldsets:

1. **Equipment** — one card per machine: category → subtype → size as a **cascade** (each level disabled until its parent; changing a parent clears the children), quantity, accessories, notes. Plus **Not in the catalogue** → free-text name and size, legal here and nowhere else.
2. **Machine terms** — shared by the order, and **overridable per machine** via *Different terms for this machine*, which reveals the same fields and tags the card. The **operator block is absent, not disabled**, when no machine takes one.
3. **Supplier & period** — the order's own period (with the project-conflict warning), then per machine its supplier lines.

Saving writes the order, its items **and one supply line per supplier line**.

**Editing the period** opens *Move the awards to the new period?* — one row per award, **pre-ticked only where the award still sits on the old period**; one with its own dates is listed unticked with those dates shown.

**Editing must upsert items by id.** Rebuilding the list orphans every award through the cascade.

### W-T18 — Move / File, with the location suggestion
**Scope:** web-projects
**Files:** new `components/projects/MoveDialog.tsx`

**Leads with the projects at that row's own site** — named cards, one click — with the rest in a select below. Forty projects in a dropdown is a search; *the one you are obviously looking for, plus a list* is a decision. When nothing matches it says so rather than dropping the renter into a bare list. Ended projects in the fallback list are labelled.

Filing changes **no value**, and the dialog says so.

### W-T19 — Documents dialog
**Scope:** web-projects
**Files:** new `components/projects/DocumentsDialog.tsx`

PO · contract · supplier quotation · other, several per supply line, through the existing document storage. On marketplace rows, a line explaining that **our** quotation is generated rather than uploaded, with the download in the row menu.

### W-T20 — The conflict dialog
**Scope:** web-projects
**Files:** new `components/projects/ConflictDialog.tsx`

Opened from the *differs from the project* chip on a group header. Lists only the fields that differ, offers *keep it different* or *match the project* — the latter running through the ordinary edit rule, and disabled with the reason when it cannot.

**A work order can only ever conflict on its period**; its location is locked. A request can differ on both.

---

## Phase 3 — the fast agent

### W-T21 — Tier routing
**Scope:** web-create
**Files:** `store/rfq-store.tsx`, `lib/api/client.ts`, new `api/agent/quick/route.ts`

The tier follows the **shape of the text**, not whether a project exists:

| | |
|---|---|
| one equipment line | Tier 0 — the shared matcher, in the browser, no network |
| a sentence with extras + a project | Tier 1 — `POST /api/agent/quick` → `{MANSOUR_URL}/rfq/quick` |
| a paragraph, or no project | Tier 2 — today's path, **byte-identical** |

**Nothing here changes `/rfq/jobs`.** The mobile app and the projectless web keep the same model, prompt content, few-shot window and polling they have today.

Two agent tickets touch shared code, and neither is a prerequisite for anything else: the prompt-block reorder (NA-T1), which is a cache optimisation and is dropped if its eval is not clean, and the dedup-hash fix (NA-T6), which is a bug fix the mobile app is exposed to today.

Tier 1 falls back to the job path on non-2xx or timeout.

### W-T22 — Tier 0 in the browser
**Scope:** web-create
**Files:** `lib/agent/quick-match.ts` (importing the matcher from NA-T8)

The browser already holds the full taxonomy for the dropdowns, so the match costs **no network at all**. Import the shared module — never reimplement the rules, they will drift silently.

Post the result to Mansour **fire-and-forget** (NA-T7) so the corpus and the correction loop stay whole.

### W-T23 — Inline result, escalation, warming
**Scope:** web-create
**Files:** `screens/Intake.tsx`, `CreateSurface.tsx`, `create/ProjectChips.tsx`

Render inline on the intake screen; escalate to `Processing.tsx` **only past 8 seconds**. Warm the prompt cache when intake mounts with a project selected — best-effort, never blocking, never surfaced.

### W-T24 — The two post-submit offers
**Scope:** web-create
**Files:** `screens/Confirmation.tsx`

After a projectless submit, **decided by whether the stated place already has a project**:

- **It does** → *You already have a project here.* Two equal cards: **Add it to \<project\>** and **It's a different site** (create one). Plus *Not now*. Never a second project for the same place — that is how a site's picture splits in two.
- **It does not** → *Create a project from this request?* with **two labelled lists of the renter's own values**: *saved as the project* vs *stays with this request*. That split is the whole mental model, and this is the one screen where they meet it with their own values in front of them.

Permanently dismissible per device. Declining changes nothing.

A guest who signs in at the submit gate posts **exactly as today** — the draft is never retro-filled — and this offer follows as for anyone else.

---

## Phase 4 — the rest

### W-T25 — Titles, guests, empty states, i18n
**Scope:** web
Optional titles at all three levels with their fallbacks · no chips for guests · empty states for no projects, an empty project, empty Unassigned · every new string bilingual, with the chart, pins and pills on logical properties for RTL.

---

## Order

```
W-T1 ─ W-T2 ─ W-T3
   ↓
W-T4 (unit-tested first) ─ W-T5 ─ W-T6
   ↓
W-T7 ─ W-T8 ─ W-T9 ─ W-T10 ─ W-T11 ─ W-T12        ← Phase 1 ships here
   ↓
W-T13 ─ W-T14 ─ W-T15 ─ W-T16 ─ W-T17 ─ W-T18 ─ W-T19 ─ W-T20
   ↓
W-T21 ─ W-T22 ─ W-T23 ─ W-T24 ─ W-T25
```

**Phase 1 deliberately ships with no speed win.** The field cut (spec §5) is the expensive thing to change later, so it gets proven against real use before any prompt work leans on it.
