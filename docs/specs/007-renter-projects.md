# Renter Projects

| | |
|---|---|
| **Key** | PROJ |
| **Status** | Draft — open rulings in §11 |
| **Author** | yfa245 |
| **Created** | 2026-08-29 |
| **Layers** | web · agents-backend (new entity + taxonomy field) · Normalization-Agent (new scoped extraction path) |
| **Links** | UI reference: `prototypes/renter-dashboard-v2.html` (`renderProjects`, line 863). Create-flow baseline: `docs/request-create-flow.md`, `docs/specs/006-machine-request-canvas.md`. |

> Acceptance IDs are namespaced `PROJ-AC-NN`. Local to this spec.

---

## 1. Problem & outcome

A renter running a real site posts the same request settings over and over. "Qiddiya Zone 4",
September to December, monthly basis, 10 hours a day, six days a week, supplier delivers, I pay the
fuel, SPSP operators, 30-day payment. Every single request re-states all of it, and the agent
re-parses all of it from a paragraph the renter had to write again.

Only one thing actually changes between those requests: **which machine**, what size, and which
accessory hangs on it.

The outcome we want: the renter states the site once, as a **project**. After that, creating a
request is one line of text — "2 excavators 20t with a breaker" — the project fills everything else,
and the agent answers in **seconds** because it is only asked to identify the machine.

**Success signal:** a renter with a project posts a second request in under fifteen seconds,
start to submit, and every term on it is the one their site actually runs on.

## 2. Who it's for

Renters (rentees) on the web who run more than one request against the same site. Guests have no
projects — the feature is invisible to them and the existing intake is unchanged.

## 3. Current state

There is **no project concept anywhere in the product.** `requestGroupId`
(`src/lib/contract/requests.ts:389`) is the fan-out group of a single multi-item submission — the
three requests one paste produced — not a site and not a container.

What exists that this builds on:

- **The create flow.** `/create` runs `intake → processing → wizard → confirmation`
  (`src/lib/store/rfq-store.tsx`). The `wizard` phase renders one canvas (`Canvas.tsx`) with
  `WherePanel`, `WhenPanel`, `MachineCard` and `OperatorRail`.
- **The draft model.** `src/lib/contract/draft.ts` — `ProjectDetails` (confusingly named: it means
  "request-wide", not "project"), `EquipmentItem`, `Preferences`.
- **Provenance.** `src/lib/contract/provenance.ts` marks every field as `agent | default | renter |
  empty`, so the renter can see what was decided for them.
- **The agent.** One Anthropic call in `Normalization-Agent/src/services/rfq.service.ts:819` —
  system prompt (instructions + full taxonomy, prompt-cached) then learned rules + 25 few-shot
  (second cache breakpoint), `max_tokens: 32000`, temperature 0, streamed. The web starts a job at
  `POST /rfq/jobs` and polls every 2s with a 4-minute ceiling.
- **The dashboard picture.** `prototypes/renter-dashboard-v2.html` already draws the projects rail,
  the meta bar and the gantt this spec describes, on mock data.

## 4. Scope

**In:** the project entity and its CRUD; project chips and editable pills in intake; a fast
equipment-only agent path; project prefill on the canvas; assign / move / edit / delete / archive;
the projects dashboard; the "make a project from this request" offer.

**Out:** cost roll-up per project, project-level budget tracking, project members/permissions beyond
the company scope in §5.1, project templates shared between companies, the supplier-side view of a
project.

---

## 5. The model

### 5.1 The entity

A project is **two things at once** and the design has to keep them separate:

- a **container** — requests belong to it, and the dashboard reports on them;
- a **template** — a set of default request settings new requests start from.

```
Project {
  id            uuid
  companyId     uuid | null      // owning company; null = personal
  ownerUserId   uuid             // creator
  title         string | null    // null ⇒ derived from the location's short name
  status        "active" | "archived"
  location      { label, lat, lng }
  defaults      ProjectDefaults  // §5.2
  version       int              // +1 on every edit of `defaults`
  createdAt, updatedAt
}
```

A request gains two fields: `projectId` (uuid, nullable) and `projectVersion` (int, nullable —
the project version the request was created from).

Derived on read, never stored: `requestCount`, `firstStart`, `lastEnd`, `unitsAwarded`. The
`2026-09-01 / 2026-12-31` in the dashboard reference are **derived from the live requests**, not the
project's own dates.

**Scope:** company-wide when the renter belongs to a company, personal otherwise. Every member of the
company sees and uses the company's projects; only the owner (or a company admin) can edit or delete
one. *(Ruling open — §11.)*

### 5.2 Field ownership

Straight from `draft.ts`. This is the whole cut, and it is the heart of the spec.

**The project owns these (`ProjectDefaults`):**

| Group | Fields |
|---|---|
| Location | `location.label`, `lat`, `lng` |
| Timing | `rentalBasis`, `extendable`, `startDate`, `endDate`, `hoursPerDay` |
| Advanced | `workingDaysPerWeek`, `overtimeRate`, `equipmentYear` |
| Certificates | `safety[]`, `safetyOther`, `other[]` |
| Responsibilities | `deliveryToSite`, `returnFromSite`, `fuelResponsibility` |
| **Operator policy** | `nationality`, `nationalityCustom`, `certificate[]`, `certificateOther`, `nightShift`, `fatRequired`, `fatFood`, `fatAccommodationTransport` |
| Preferences | `payment.terms`, `payment.method`, `maintenance.responsibility`, `maintenance.sla`, `supplierFilters.verifiedOnly`, `supplierFilters.sublettingAllowed`, `supplierFilters.bidWindow` |

**The request owns these — the agent's whole job on the project path:**

`ref` (category → subtype → size) · `rawLabel` / `rawSize` · `quantity` · `attachmentIds` /
`customAttachments` · `fuelType` · `workType` · `additionalNotes` · `operatorNeeded` (yes/no/optional
— see §7) · any per-item override of a project value.

**Deliberately not on the project:** `budgetSar` (a ceiling for *this* machine, not for a site) and
`preferences.additionalNotes` (request-specific by nature).

### 5.3 The snapshot rule

**A request never reads its project at display time.** At submit it stores its own full resolved copy
of every value — which is already exactly what the draft is. `projectId` and `projectVersion` are a
link and a stamp, nothing more.

This is what makes the renter's rule free: editing a project cannot retroactively change a live
request, because no live request is looking. It also makes "has this request drifted from its
project?" answerable by comparing the stored values against the project at `version`.

---

## 6. Journeys

### 6.1 Create a project

Entry: `/projects` → **New project**, or the offer after a request (§6.4).

One form, the same controls the canvas already uses (`WherePanel`, `WhenPanel`, `OperatorRail`, the
preferences fields), plus a title. **Nothing about equipment appears** — no category, no subtype, no
size, no accessories. Only the location is required; everything else may be left unset and simply
won't prefill.

- **PROJ-AC-01** — the project form offers every field in §5.2 and no equipment field.
- **PROJ-AC-02** — location is the only required field.
- **PROJ-AC-03** — an empty title displays the location's short name (first address segment,
  postcode stripped — same rule as `shortSite()` in the prototype) and is marked *default*.

### 6.2 Intake with a project

Below the intake textarea, a row of chips — one per **active** project, most recently used first,
capped at six, with **All projects** opening a picker when there are more.

Clicking a chip **selects** it. The chip row is replaced by a row of **pills** stating what the
project will fill in, each pill a dropdown:

```
[ Qiddiya Zone 4 ⌄ ]  [ Monthly ⌄ ]  [ 1 Sep → 31 Dec ⌄ ]  [ 10 h/day ⌄ ]  [ Operator: SPSP ⌄ ]  [ + 9 more settings ]
```

Five headline pills and a link. All eighteen fields as pills is a form, not a chip row; the link
opens a compact sheet holding the rest, at the same density.

- **PROJ-AC-04** — changing a pill changes **this request only**. The project is untouched, and the
  pill is marked as changed.
- **PROJ-AC-05** — deselecting the project (the × on the project pill) restores the full agent path
  and drops every prefill.
- **PROJ-AC-06** — guests see no chip row.
- **PROJ-AC-07** — with a project selected, the placeholder changes from the four full-sentence
  examples to equipment-only ones ("2 excavators 20t with a breaker").

The renter types the machine and presses Continue. The agent runs the **equipment-only** path (§8),
the canvas opens prefilled, and every project-sourced value carries a **project** provenance mark —
a fourth `FieldSource` beside `agent`, `default` and `renter`
(`src/lib/contract/provenance.ts:25`).

- **PROJ-AC-08** — a value that came from the project is marked *from project*, never *default* and
  never *agent*.
- **PROJ-AC-09** — the agent's extracted values (equipment, quantity, accessories) still carry
  `agent` provenance, unchanged.

### 6.3 Intake without a project — unchanged

The renter who pastes a full RFQ, with no project selected, gets **exactly today's behaviour**: the
full-scope agent, header extraction included, the four-stage processing screen, the 4-minute ceiling.
This path is not narrowed, not deprecated, and not slowed down.

- **PROJ-AC-10** — with no project selected, the request body sent to the agent is byte-identical to
  today's.

### 6.4 "Make a project from this?"

On the **confirmation** screen after a projectless submit — never before it, and never as a gate.

> **Reuse these settings?** — Save Qiddiya Zone 4 as a project and your next request starts here.
> `[ Save as a project ]` `[ No thanks ]`

Saving copies the submitted request's §5.2 fields into a new project, titled from the location, and
links the just-submitted request to it at version 1.

- **PROJ-AC-11** — the offer appears only when the renter has no project matching that location, and
  is dismissible permanently per device.
- **PROJ-AC-12** — declining changes nothing about the submitted request.

### 6.5 The dashboard

`/projects` — the rail, the meta bar and the gantt already drawn in
`prototypes/renter-dashboard-v2.html`, on real data. Per project: title (inline-editable), location,
derived first-start / last-end, request count, **Assign new request**, and the gantt of every machine
under it with its live state.

- **PROJ-AC-13** — a request with no project appears under **Unassigned**, and can be assigned from
  there.
- **PROJ-AC-14** — **Assign new request** opens `/create?project=<id>` with the project preselected.

---

## 7. The operator rule

Operator policy lives on the project (§5.2). But an operator is meaningless for a generator, an air
compressor or a light tower, and pushing the project's SPSP-nationality-F.A.T policy onto one would
put terms on the request that nobody meant and suppliers would price against.

So: **the taxonomy decides whether operator applies at all.**

- The taxonomy gains `operatorApplicable: boolean` on the subcategory, inheriting from the category
  when unset (`src/lib/contract/taxonomy.ts`). It is **data from the agents-backend**, not a
  hard-coded list in the web — the repo already removed one tag-based rule for exactly this reason
  (see the note at `taxonomy.ts:43`).
- Where `operatorApplicable === false`: `operatorNeeded` is forced to `"no"`, the project's operator
  policy is **not** applied, and `OperatorRail` does not render at all — not the 72px collapsed
  strip either. There is nothing to reopen.
- Where it is `true` or unknown: today's behaviour, with the project's operator policy as the prefill.

- **PROJ-AC-15** — for a non-operator subtype no operator field is sent to the backend and no
  operator control is shown.
- **PROJ-AC-16** — the agent's own explicit "with operator" on such a line still wins and shows the
  rail, with a note. The renter's words beat a catalogue flag.
- **PROJ-AC-17** — until the backend serves the flag, the web falls back to a small
  category-tag list and behaves as `true` for anything it doesn't recognise.

---

## 8. The agent — two scopes, one prompt cache

### 8.1 Why it is slow today, precisely

The latency is **output generation**, not input. The taxonomy prefix is already prompt-cached at two
breakpoints (`rfq.service.ts:812-828`). What costs seconds is that the model writes the whole RFQ:
`rfq_header`, every line item, `missing_required_fields` for header fields, and per-field notes — on
`claude-opus-4-5` by default, with `max_tokens: 32000`.

On the project path, the header is **already known**. Asking the model to re-derive it is paying
for an answer we hold.

### 8.2 The new scope

`scope: "equipment_only"` on the extraction request, with the project's resolved values passed as
`context`:

```jsonc
POST /rfq/quick            // synchronous — no job row, no poll
{
  "message": "2 excavators 20t with a breaker",
  "source": "web_rfq",
  "language": "en",
  "scope": "equipment_only",
  "context": {
    "project_ref": "<opaque id>",       // for dedup + telemetry only
    "location": "Qiddiya Zone 4, Riyadh",
    "rental_basis": "MONTHLY",
    "start_date": "2026-09-01", "end_date": "2026-12-31",
    "hours_per_day": 10, "working_days_per_week": 6,
    "operator_policy": { "…": "…" }
  }
}
→ 200 { rfq_id, line_items[], summary_counts, missing_required_fields }   // line-item scoped only
```

Server-side, for this scope only:

1. **No header.** The prompt asks for `line_items` and nothing else. No `rfq_header`, no header-level
   missing fields, no header field notes.
2. **A smaller model.** `MANSOUR_RFQ_EQUIPMENT_MODEL_ID`, defaulting to Haiku. The input is one line
   and the taxonomy is in the prompt; this is a matching job, not a comprehension job.
3. **`max_tokens: 4096`**, not 32000.
4. **`fewShotLimit` 5**, not 25 — keyword-selected as today.
5. **Synchronous.** No job row, no 2-second poll floor. The web falls back to the async
   `/rfq/jobs` path if the call exceeds its timeout.

### 8.3 The cache ordering change — do not skip this

Prompt caching is **prefix**-matched. Today the system prompt is
`buildRfqSystemPrompt(taxonomyBlock)` — instructions **then** taxonomy, in one block. A second set
of instructions for the new scope would therefore change the prefix and **miss the cache the full
path relies on**, making both paths slower.

The blocks must be reordered so the shared, large, rarely-changing part comes first:

```
Block A: taxonomy                         (cache_control, shared by both scopes)
Block B: instructions for THIS scope      (cache_control, one of two variants)
Block C: learned rules + few-shot         (cache_control, volatile)
```

- **PROJ-AC-18** — the full-scope prompt after reordering is semantically identical to today's, and
  the existing eval suite passes unchanged.

### 8.4 The dedup bug this would otherwise hit

`hashInput()` (`Normalization-Agent/src/handlers/rfq/jobs.handler.ts:37`) hashes only
`source + message + attachments`, over a 120-second window. With one-line messages, two renters —
or one renter under two different projects — sending "2 excavators 20t" inside two minutes would
**collapse into one job and get each other's answer.**

`scope` and a `context` fingerprint must go into the hash before this ships.

- **PROJ-AC-19** — the same message under two different projects produces two distinct extractions.

### 8.5 Target and honesty

Target: **under 5 seconds**, p50, for a one-line message on a warm cache.

A cold prompt cache (idle beyond the ephemeral TTL, or a taxonomy refresh) costs a full uncached
input pass on the first call. Mitigation: warm it when the renter opens intake with a project
selected. If the call is still running at 8 seconds, the UI escalates to the full processing screen
rather than pretending.

- **PROJ-AC-20** — the equipment-only path renders results inline in the intake screen; it escalates
  to the processing screen only past 8 seconds.

---

## 9. Lifecycle rules

| Action | Behaviour |
|---|---|
| **Assign / move a request** | Filing only. Values do **not** change — the request keeps the terms it was posted with. Moving a request that already has bids is allowed; nothing about the offers changes. |
| **Edit a project** | Bumps `version`. The renter is asked: *next requests only*, or *apply to existing requests too*. |
| **…apply to existing** | Only requests that are **open with no bids yet**. Awarded, contracted and bid-on requests are never touched — changing terms under a live offer invalidates it. The dialog lists exactly which requests will change and which are excluded, before applying. |
| **Delete a project** | Requests survive and become unassigned. Confirmed with the count: "4 requests will move to Unassigned." |
| **Archive a project** | Hidden from the intake chip row and the default dashboard rail; requests untouched; reversible. |
| **Location conflict** | The renter picked "Qiddiya" but wrote "in Dammam". The location pill shows the conflict and asks which wins. Never resolved silently. |
| **Multiple sites** | One project is one site. The agent's existing multi-location warning stands; a second site is a second project. |

- **PROJ-AC-21** — moving a request between projects changes no request value.
- **PROJ-AC-22** — "apply to existing" never modifies a request with at least one bid.
- **PROJ-AC-23** — deleting a project deletes no request.
- **PROJ-AC-24** — a location stated in the message that contradicts the project's is surfaced as a
  conflict, not overwritten.

---

## 10. Fan-out

The agents-backend fans one submission into N single-item requests sharing a `requestGroupId`.
`projectId` and `projectVersion` must be stamped on **every** fanned row, not only on the group — the
dashboard gantt is per machine, and a row with no project would vanish from its own project.

- **PROJ-AC-25** — a three-item submission under a project produces three requests, each carrying
  that `projectId`.

---

## 11. Open rulings

1. **Where the entity lives.** The web is a BFF with no database. The plan assumes **agents-backend**
   owns `projects` and `requests.projectId`, because that is where requests live and the dashboard
   must be true across devices. Alternatives: app-backend (cross-door joins), or web-only
   localStorage (ships fastest, lies on a second device — demo only).
2. **Company scope.** Assumed company-wide, owner-edits-only. Flip to personal-only if projects
   should not be shared between members.
3. **Operator policy on the project.** *Ruled: yes, project-level, with the §7 taxonomy rule.*
4. **`budgetSar`** — assumed request-level, not on the project.
5. **Project dates** — assumed the project stores a default window used to prefill, while the
   dashboard shows the window derived from live requests. Both, not one.
