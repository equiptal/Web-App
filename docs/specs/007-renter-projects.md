# Renter Projects, Work Orders & Site Tracking

| | |
|---|---|
| **Key** | PROJ |
| **Status** | Draft — decided through 2026-08-29; one open item in §15 |
| **Author** | yfa245 |
| **Created** | 2026-08-29 |
| **Layers** | web · agents-backend (new entities + one taxonomy field) · Normalization-Agent (two new extraction paths) |
| **Links** | Prototype: `prototypes/renter-projects-v1.html` (this spec, running). Gantt scaffolding borrowed from `prototypes/renter-dashboard-v2.html`. Create-flow baseline: `docs/request-create-flow.md`, `docs/specs/006-machine-request-canvas.md`. |

> Acceptance IDs are namespaced `PROJ-AC-NN`. Local to this spec.

---

## 1. Problem & outcome

Two problems, one shape.

**Posting is repetitive.** A renter running a real site re-states the same terms on every request — Qiddiya Zone 4, September to December, monthly, 10 hours a day, supplier delivers, I pay the fuel, SPSP operators, 30-day payment. Only the machine changes. And the agent re-parses all of it from a paragraph they had to write again.

**The site picture is missing.** Most of the equipment on a renter's site did not come from our marketplace. It came from their own fleet, or a vendor they have used for years. We show them the slice we sourced and nothing else, so our page is never the page they actually work from.

The outcome: a **project** states the site once. A **work order** records a machine that came from anywhere. A **request** is the marketplace RFQ we already build. All three sit on one chart, and creating a request becomes one line of text answered in seconds.

**Success signals:** a renter with a project posts their second request in under fifteen seconds; and the projects page shows every machine on their site, not only ours.

## 2. Who it's for

Renters (rentees) on the web running one or more sites. Guests have no projects — the feature is invisible to them and the existing intake is unchanged.

## 3. Current state

**There is no project concept anywhere in the product.** `requestGroupId` (`src/lib/contract/requests.ts:389`) is the fan-out group of one multi-item submission — not a site, not a container.

What this builds on:

- **The create flow.** `/create` runs `intake → processing → wizard → confirmation` (`src/lib/store/rfq-store.tsx`). The `wizard` phase is one canvas (`Canvas.tsx`) with `WherePanel`, `WhenPanel`, `MachineCard`, `OperatorRail`.
- **The draft model.** `src/lib/contract/draft.ts`.
- **Provenance.** `src/lib/contract/provenance.ts` marks each field `agent | default | renter | empty`.
- **The edit rule.** `requestActions()` (`src/lib/contract/workspace.ts:213`), enforced server-side at `request.service.ts:830` on `bidCount > 0 && renteeEditUsed === false`.
- **The agent.** One Anthropic call, `Normalization-Agent/src/services/rfq.service.ts:819` — system prompt (instructions **then** taxonomy, prompt-cached) then learned rules + 25 few-shot (second breakpoint), `max_tokens: 32000`, temperature 0, streamed. Web starts a job at `POST /rfq/jobs`, polls every 2s, 4-minute ceiling.
- **The generated quotation.** `GET /api/deal-rooms/{id}/quotation` returns a presigned PDF (`src/app/api/me/deal-rooms/[id]/quotation/route.ts`).
- **Marketplace statuses.** `OPEN · ACTIVE · PARTIALLY_ACCEPTED · ACCEPTED · EXPIRED · CLOSED · CANCELLED` (`requests.ts:16`). There is **no** contracted, on-rent, ended or off-hire anywhere.

## 4. The three levels

```
PROJECT ──────────── location · when · payment terms   (six fields, §5.1)
   │
   ├── WORK ORDER ── the renter's own record. Never reaches the marketplace.
   │   └── items ─── one machine each, sharing a group id. NO parent row — exactly how a
   │                 multi-item RFQ is a `requestGroupId` shared by its fanned rows.
   │                 Each machine carries its own COMPLETE terms.
   │
   └── REQUEST ───── the marketplace RFQ, as today, plus a project label
       └── items ─── the backend already fans out one request row per item
```

**A work order has no row of its own.** It is a group id its machines share, and the header — title,
period, which project it is filed under — is duplicated on each of them, following the pattern
`EquipmentRequest` already uses for a fanned submission rather than inventing a second one.

Three things fall out, and all three are improvements:

- **A machine's terms are its own and complete.** With a parent row they were a shared blob plus a
  sparse per-item patch, so every read had to overlay one on the other — a merge each surface had to
  perform identically, and one of them eventually would not. The welder you collect yourself simply
  has `delivery: "me"`; it is not an override of anything.
- **`projectId` lives in one place.** With a parent it sat on the order *and* its items, and the two
  had to be kept in step.
- **Less to scrub.** A mistake in a write path costs one machine's awards, not the
  whole order's.

The cost: nothing in the database enforces that a group agrees about its title or period. The renter
cannot cause that — the form writes every row together — but it makes one rule non-negotiable.
**Every header write goes through one helper that updates the whole group in a transaction.** Five
paths touch a header (create, edit, move, unfile, delete) and all five use it.

- **PROJ-AC-61** — a work order is a group id on its machines; no parent row exists.
- **PROJ-AC-62** — a change to a work order's title, period or project writes every row in the group,
  in one transaction.

Under every item sit **award allocations** — who supplies how many units. An allocation is the unit of tracking and the row on the chart (§8).

### 4.1 Ownership & scope

Projects, work orders and the supplier list are **company-wide**. Every member can create, edit, award and delete. `owner_user_id` records who created a project and is displayed (*created by Ahmed*); it is never a permission check.

- **PROJ-AC-01** — any member of a company sees and may act on every project in it.
- **PROJ-AC-02** — a project's delete confirmation names its creator; delete is offered only when the project is empty (§10).

### 4.2 Independence — the governing rule

**Nothing propagates downward after creation, at any level, with exactly one exception.**

| | Direction | Rule |
|---|---|---|
| Award, allocations, pins, documents | project-side only | never touch a request. The renter's private tracking record. |
| Project defaults → requests / work orders | project may write down | **only** on the renter's explicit tick in the edit dialog, and only through the existing request-edit rules (§10) |
| Request → project | never | editing a request never changes its project |
| Template → new request | copy at creation | a one-time copy; the source is never re-read |

A differing value is **shown, never silently resolved**. Everywhere both are visible — the intake pills, the request detail, the chart — a difference is marked *differs from the project default*, with *keep it* or *match the project*.

- **PROJ-AC-03** — a request stores its own full copy of every value at submit and never reads its project at display time.
- **PROJ-AC-04** — a difference between a request (or work order) and its project is always marked and never auto-corrected.

---

## 5. Field ownership

### 5.1 The project

**The rule:** the project holds only what the create flow actually **asks the renter for**. A field the backend receives but nobody is ever shown is a silent default, and a project default for it would be a setting for a question that is never put.

That rule removes three fields people expect to find here:

| | Why not |
|---|---|
| **hours per day** | **Removed from the project 2026-08-30 (owner).** It reads like a site fact and is not one: a crane on night shift and a generator running around the clock are the same site in the same week. It stays in the request's *More details*, beside the overtime rate it belongs with. |
| **working days per week** | sent as `workingDaysPerWeek`, but **no control exists anywhere in create** — seeded to 6 and shipped silently. (`hoursPerDay` at `WhenPanel.tsx:254`, `extendable` at `:179` and `paymentTerms` at `ReadyToSend.tsx:140` are all real controls; this one is not.) |
| **overtime rate** | a real control today, being removed from every renter surface (§5.4) |
| **terrain** | never in the create payload at all |

Seven fields, verified against what the create payload actually carries (`draftToCreateRequest`, `src/lib/api/app-adapters.ts:184`; `CreateRequestPayload`, `src/lib/contract/app.ts:78`):

| Project field | Create payload |
|---|---|
| location — label + lat/lng | `projectAddressLabel` · `projectLat` · `projectLng` |
| rental basis | `rentalType` |
| extendable | `extendable` |
| start date | `startDate` |
| end date | `endDate` |
| hours per day | `workingHoursPerDay` |
| payment terms | `paymentTerms` |

**Never stored on the project**, because the web derives them at submit and a stored copy would go stale:
`estimatedDurationDays` (from start/end) and `urgency` (from `startDate`, `computeUrgency`, mobile CR-017 parity). Set the project's dates and both follow.

**Location lives in its own columns**, not inside the `defaults` blob: `location_label` is read on every rail card and roll-up, and `lat`/`lng` are numeric and will be queried (proximity, map clustering). It is locked for **work orders**; a **request** may differ from it and stay different, shown as a conflict (§11.2).

**Terrain is not here.** `terrainType` exists on `RequestRecord` (`requests.ts:164`) and in the edit form, but the create payload never carries it, so a project default would have nothing to fill. Revisit if create ever takes it.

`rentalType` also accepts `PER_JOB` and `LONG_TERM`, which the web's basis control does not offer. The project inherits that limitation; it does not create it.

### 5.2 Machine terms

Stored on a work order and on a request. **This is the block the template copies.**

**Shared, then overridable per machine.** On a work order the block is set once for the whole order, and any machine may differ — its card carries *Different terms for this machine*, which reveals the same fields as an override and marks the card with how many it holds. *Follow the shared terms* clears them.

That is not a new idea: `draft.ts` already gives every request item overrides of the request-wide settings — `deliveryOverride`, `returnOverride`, `fuelResponsibilityOverride`, `safetyCertsOverride`, per-item `equipmentYear`, and a fully per-item operator block. The work order uses the same shape, held in `work_order_items.terms` — complete on every machine rather than a patch over a shared blob — so a crane and a generator on one order can have different delivery and different certificates without being split into two orders.

- **PROJ-AC-43** — every machine-term field is overridable per machine, and an overridden machine says so on its card.
- **PROJ-AC-44** — clearing an override returns that machine to the shared value; it never leaves a stale copy behind.
- **PROJ-AC-45** — changing a work order's period never moves an award on its own; each is ticked or left, and an award already carrying its own dates is never pre-ticked.

operator needed · operator nationality *(+ custom)* · operator certificates *(+ other)* · night shift · F.A.T required / food / accommodation-transport · equipment safety certificates *(+ other)* · delivery to site · return from site · fuel responsibility · min equipment year · fuel type

### 5.2.1 Equipment we don't list

A work order's machine may be **free text**; a request's may not.

The asymmetry is not arbitrary. A request goes to suppliers who bid against catalogue ids, so an unmatched machine has nothing to bid on. A work order goes to nobody — it is the renter's own fleet, and it only has to be legible to them. Their yard will contain machines we never listed.

So on `work_order_items` the taxonomy ids are **nullable**, `raw_label` is required when they are empty, and a CHECK enforces one of the two. Three consequences:

- The chart shows the typed name.
- **The operator block shows**, because an unknown machine falls back to *operator applies* — we do not know, so we do not hide a question.
- **As a template it is unaffected**, because a template copies machine terms and never the equipment.

Posting such a machine to the marketplace later means picking a real category, which is the agent's existing no-match path.

- **PROJ-AC-41** — a work-order machine saves with a free-text name and no taxonomy id; a request's does not.
- **PROJ-AC-42** — an off-catalogue machine reads as operator-applicable.

### 5.3 The request alone

category → subtype → size · quantity · accessories / attachments · work type · equipment notes · request notes · terrain · working days per week · fulfillment type

Plus the commercial choices that are **per request, not per site**:

**budget ceiling** · payment method · maintenance responsibility · breakdown SLA · verified suppliers only · subletting allowed · bid window

Only **payment terms** sits on the project, because it is the one commercial term a company applies uniformly — it comes from their finance department, not from the machine. The rest are shopping decisions: how much this machine is worth, who fixes it, how long to leave bidding open. Budget is the sharpest case — a ceiling copied from an excavator onto a crane filters out every real bid with no error shown — which is also why no template copies it.

### 5.4 Overtime rate is hidden

`overtimeRate` leaves the renter's surfaces entirely — the canvas (`WhenPanel.tsx:259`), the review summary (`ReadyToSend.tsx:131`), the request edit form (`RequestEditModals.tsx:227`), and it is never added to the project form. The data path is untouched: it keeps defaulting to `"without"` and keeps being sent, so no backend contract moves. Hidden in place following `docs/surveys-disabled.md`, not deleted.

- **PROJ-AC-05** — no renter surface offers an overtime control; the submitted payload is unchanged.

---

## 6. Templates — where machine terms come from

The project holds no machine terms. Instead, **anything already in the project is a template**.

1. The first request in a project has its machine terms filled by hand.
2. From then on the intake dropdown lists **every work order and past request in that project**.
3. Picking one copies its machine terms — and its `when` override, if it has one.
4. **Never the equipment.** Category, subtype, size, quantity and accessories always come from the typed text.

The dropdown is ordered most-recent-first, labelled `kind · ref · first machine`, with the last-used pinned and a search box past ~8 entries. Work-order rows and request rows are visually distinct — one is a plan, one is a live RFQ.

- **PROJ-AC-06** — the template copies every machine term and no equipment field.
- **PROJ-AC-07** — deleting a template changes nothing about requests that copied from it.
- **PROJ-AC-08** — a project with nothing in it shows no dropdown, and the renter fills machine terms by hand.

---

## 7. The operator rule — DEFERRED, not part of this feature

> **Ruled 2026-08-30: out of scope here.** Hiding the operator fields for equipment that takes no
> operator is backend work that will land separately, on its own terms. This feature does not add the
> taxonomy flag, does not read it, and does not gate anything on it — a request for a generator keeps
> today's behaviour exactly.
>
> The analysis below is kept because it is the reasoning whoever picks that work up will need. Nothing
> in it is implemented.

<details>
<summary>The deferred design</summary>


Machine terms include the operator policy. But an operator is meaningless for a generator, an air compressor or a light tower, and applying the policy there would put terms on the request that nobody meant and suppliers would price against.

**The taxonomy decides.** `operator_applicable` on the subcategory, inheriting from the category when unset, served by `GET /agents/taxonomy`. It is data from the backend, not a hard-coded list in the web — the repo already removed one tag-based rule for exactly this reason (`src/lib/contract/taxonomy.ts:43`).

- **PROJ-AC-09** — where the flag is false: `operatorNeeded` is forced to `"no"`, no operator term is copied or sent, and `OperatorRail` does not render at all — not even the 72px collapsed strip, since there is nothing to reopen.
- **PROJ-AC-10** — the renter's own words still win: an explicit "generator with operator" shows the rail, with a note.
- **PROJ-AC-11** — until the backend serves the flag, the web falls back to a small category-tag list and treats anything unrecognised as applicable.

</details>

---

## 8. Tracking — the chart

### 8.1 No states

The bar is **`start → end`** and nothing else. There is no Fulfilled, Awarded-as-a-state, Contracted, On-rent or Ended ramp.

Two **pins** sit on the bar, both set by the renter from the row menu and both undoable:

- **Mobilized** — the machine arrived.
- **Demobilized** — it left.

- **PROJ-AC-12** — the bar carries no status colour; awarded rows draw solid, un-awarded rows draw as a hatched ghost.
- **PROJ-AC-13** — pins are per allocation: two units from one vendor can be mobilized while a third from another is not.

### 8.2 The award

An award records **who the renter says is supplying this machine**. It is **not** the marketplace accept: it reads nothing from the deal room, writes nothing to it, and may legitimately disagree with whoever won the bid. We do not warn and do not sync.

An award splits units across suppliers, so one item becomes several allocations:

```
Excavator 20t ×3  →  2 units · Zahid Tractor · 8,600 SAR/mo · 1 Sep → 31 Dec
                     1 unit  · Al-Rajhi      · 9,100 SAR/mo · 5 Oct → 31 Dec
```

**Each allocation is one row on the chart**, with its own bar, pins and documents. An un-awarded item is a single ghost row with dates inherited from the work order or project.

This is what makes *award first* structural rather than a rule: pins and documents hang off an allocation, and there is no allocation until an award.

- **PROJ-AC-14** — the sum of a item's allocated units may not exceed its quantity.
- **PROJ-AC-15** — an award requires a **vendor-registered** supplier (§9). Same rule for work orders and requests.
- **PROJ-AC-16** — awarding never touches the request's marketplace status.

**Un-awarding is allowed at any time**, including after a PO is attached. The allocation's documents and pins go with it — so the confirmation names them (*"2 documents will be deleted with this award: PO-88213.pdf, Zahid-MSA.pdf"*) rather than removing them silently. A renter who awarded the wrong supplier should not have to live with it because they were quick with the paperwork.

- **PROJ-AC-38** — un-awarding is never blocked, and its confirmation names every document that will be deleted with it.

### 8.3 Documents

Attached per allocation, several allowed: **PO**, **contract**, **supplier's quotation**, other. A PO is raised to one supplier, which is why it belongs to the allocation and not the item.

**Our own quotation is generated, not uploaded.** On marketplace rows the menu links to the existing presigned PDF (`GET /api/deal-rooms/{id}/quotation`) as a download. Work orders have neither.

- **PROJ-AC-17** — the upload slots and the generated-quotation link are never presented as the same thing.

### 8.4 The row menu

The prototype's sheet, contents by row type.

| | Un-awarded | Awarded |
|---|---|---|
| **Request** | Award · Review the bids · Open the request · Remove from the project | Attach a document · Mark mobilized ⇄ undo · Mark demobilized ⇄ undo · Open the request · Our quotation · Open the deal room · Change the award · Remove from the project |
| **Work order** | *(never — awarded on the form)* | Attach a document · Mark mobilized ⇄ undo · Mark demobilized ⇄ undo · Edit the work order · Change the award · Remove from the project · Delete |

The three marketplace links are navigation only. No data flows either way.

---

## 9. Suppliers & vendor registration

### 9.1 How it works in the world

Every serious buyer keeps a **vendor master** — the list their finance system may raise a PO to. A supplier submits CR, VAT, Zakat, GOSI, National Address, a bank letter and insurance; procurement, finance and HSE review; approval issues a vendor code, scoped and dated. **It is per buyer.** Zahid's approval at CCC carries nothing to Nesma. (Central registries also exist — Etimad for Saudi government procurement, Ariba, Achilles — which is the analogue of our own `company.isVerified` layer.)

### 9.2 Scope — a dependency that lands before we ship

**The supplier registry is another feature's, and it ships before this reaches production.** Adding a supplier, marking one vendor-registered, managing the list, and the upsert-on-bid-accept all belong there.

So this is **a dependency, not a blocker**. We build against its contract from day one, and degrade cleanly while it is still in flight — which is a development condition, not a product decision.

**An award records both:**

```sql
renter_supplier_id  uuid NULL      -- the link, once the registry answers
supplier_name       text NOT NULL  -- the name as it stood when the award was made
```

The name is **always** written, even after the link exists. That is what makes the dependency safe: a row renders from a name it already holds, so nothing breaks if the registry is unavailable, a supplier is later removed from the list, or a match is never confirmed.

**The picker has two modes, chosen by whether the endpoint answers — not by a flag:**

| The endpoint | What the renter sees |
|---|---|
| answers | the real picker: their supplier list, only **vendor-registered** ones selectable, the rest disabled with *Mark as vendor registered* beside them |
| does not answer yet | a text field with autocomplete over names already used on this project |

The fallback exists so staging and development are not stuck behind another team. **Production only ever sees the picker**, because the registry lands first — so the vendor-registered gate (§9.1) is a real rule at launch, not a deferred one.

What this feature builds is **one read**, and the contract for it:

```
GET /agents/renter-suppliers
→ [ { id,
      kind: "platform" | "own",
      supplierId,            // set when kind = "platform"
      name,                  // resolved for display either way
      vendorRegistered: boolean,
      registeredAt } ]
```

That endpoint is the **seam**. The award picker reads it, filters on `vendorRegistered`, and needs to know nothing else. When the registry feature ships, the same call starts returning typed off-platform suppliers and real flags, and nothing here changes.

**If the registry slips past our ship date**, the fallback is what reaches production: awards carry a typed name, and the vendor-registered gate is deferred until it lands. Nothing else changes, because the name was always being recorded. Names typed in the meantime are matched to real rows once — the renter confirming each — and the link is added beside the name it already has.

That is the whole contingency, and it is why the name column is not optional.

- **PROJ-AC-59** — the award picker reads the list through one endpoint and filters on `vendorRegistered`; it contains no registry logic of its own.
- **PROJ-AC-60** — when the endpoint is unavailable the picker says so and offers a route, rather than showing an empty select.

### 9.3 What the registry itself will hold (not built here)

We already have the platform layer: `company.isVerified` plus the company document pile, and `supplierFilters.verifiedOnly` on a request. What is missing is the renter's own layer, and it is small: **the renter tells us a supplier is already an approved vendor in their system.** We collect no documents, run no approval, issue no vendor code.

One list holding two kinds of supplier:

- **Ours** — linked to a real `suppliers` row; the name is read from there, never copied.
- **Theirs** — typed in, off-platform; the row owns its own name.

`vendor_registered` is a flag **on the list row**, defaulting to **false** — a renter adds a supplier to track them; registering is a separate, later act. It is not a boolean on `suppliers`, because it is CCC's fact about Zahid, not a fact about Zahid.

- **PROJ-AC-18** — the award picker lists every supplier and lets only registered ones be chosen, with *Mark as vendor registered* on each of the rest.
- **PROJ-AC-19** — a supplier registered by one company is not registered for any other.
- **PROJ-AC-20** — accepting a bid on the marketplace upserts a linked list row (unregistered), so the renter's list builds itself from real awards.

Left for later, deliberately: registration **expiry** (certificates lapse) and **scope** (approved for earthmoving is not approved for electrical). Both exist in real vendor masters; neither is in v1.

---

## 10. Lifecycle

| Action | Behaviour |
|---|---|
| **Assign / move** a request or work order between projects | Filing only. No value changes, even where the new project differs. Allowed after bids. **The projects at that row's own site come first**, as named cards with a one-click *file it here*; the rest sit in a select below. Picking one of forty is a search; "the one you are obviously looking for, plus a list" is a decision. |
| **Remove from a project** | Unfiles it. Deletes nothing. |
| **Edit a project** | Bumps `version` and asks: *project only*, or *apply to what is already filed here*. |
| **…apply** | Through the ordinary request-update endpoint, so the server's own rule decides: free with no bids · **once** after bids (`renteeEditUsed`) · never past that · never when not OPEN/ACTIVE. Work orders have no gate. |
| **Delete a work order** | Allowed, and it takes its items and allocations with it — it is the renter's own record. |
| **Delete a request** | **Never.** The marketplace owns a request; withdrawing one is the existing cancel, on the request itself. A project can only unfile it. |
| **Delete a project** | **Only when it is empty.** Anything filed under it and no delete is offered at all — the dialog says what is filed and points at *Remove from the project*. |
| **A finished project** | Reads as **ended** — derived, the moment its last date has passed. Nothing to set, nothing to reverse. Ended projects sort last in the rail and in the intake chips; they are never hidden. |
| **Work order → marketplace** | **Two rows.** The work order stays as the plan; the request is its own row. `work_order_id` is recorded on the request as provenance only. |
| **Edit a work order's period** | Its awards keep the dates they have, and the form asks per award which should move. Awards still sitting on the old period are pre-ticked; awards that already carry their own dates are listed unticked, with those dates shown. |

The apply dialog must name every affected row, pre-tick only the free ones, state the **cost** on the ones that spend a post-bid edit, and give the reason on the ones it cannot touch. The endpoint then takes the **explicit list of ids** the renter approved — never a boolean.

```
Apply this to what's already filed here?
  ☑ RFQ-1042 · 2 excavators 20t     no bids — free to edit
  ☑ RFQ-1051 · 250 kVA generator    ⚠ has 4 bids — uses its one post-bid edit
  ☐ RFQ-1038 · telehandler 4t       post-bid edit already used — can't change
  ☑ WO-3 · tower crane              work order — always editable
```

Fanned-out siblings ride the existing mechanism, which already applies shared non-equipment fields across a group (`RequestEditModals.tsx:188`).

- **PROJ-AC-21** — moving between projects changes no value.
- **PROJ-AC-54** — the move/file picker leads with the projects at the row's own site, named and one click away; when none match it says so rather than showing a bare list.
- **PROJ-AC-55** — an unfiled row's action reads *File in a project*, not *Move to another project* — it was never in one.
- **PROJ-AC-22** — apply never modifies a request with a spent post-bid edit, or one not OPEN/ACTIVE.
- **PROJ-AC-23** — delete is offered only on an empty project, so no request or work order can be lost with one.
- **PROJ-AC-39** — a request can never be deleted from a project surface; only unfiled.
- **PROJ-AC-40** — *ended* is derived from the last date under a project and is never stored or set by anyone.
- **PROJ-AC-24** — location may propagate like any other field, under the same gate, and the dialog says what it is rather than treating it as routine.

---

## 11. Intake

### 11.1 The surface

Below the textarea: a **chip row** of active projects (most-recently-used, capped at six, *All projects* beyond that; hidden for guests). Selecting one replaces it with **pills** — five headline values, each a control, plus a sheet for the rest — and the **Start from** template dropdown.

```
[ Qiddiya Zone 4 ✕ ] [ site Qiddiya ] [ basis Monthly ⌄ ] [ dates 1 Sep → 31 Dec ] [ hrs/day 10 ⌄ ] [ + 9 more project defaults ]
```

Every pill edit is **request-local**; the project is never written. Project-sourced values carry a new `project` provenance source beside `agent`, `default` and `renter` (`src/lib/contract/provenance.ts:25`), with precedence `renter > agent > project > default > empty`.

- **PROJ-AC-25** — changing a pill changes this request only, and the pill is marked as changed.
- **PROJ-AC-26** — deselecting the project drops every prefill and restores the full agent path.
- **PROJ-AC-27** — a value from the project reads *from project*, never *default* and never *agent*.
- **PROJ-AC-28** — guests see no chip row.

### 11.2 Conflicts

The agent reports any place it saw in the text (it already returns `detected_locations`); **the web** compares that with the project. String comparison, no model. The site pill turns to a conflict state and the renter chooses. They may keep it different — the request and the project simply disagree, which is the point.

- **PROJ-AC-29** — a stated location that contradicts the project is surfaced, never overwritten, and may be kept.

**A work order can only ever conflict on its period.** Its location is locked from the project and the form says so, so there is nothing to disagree about. A request may differ on both.

| | Location | Period |
|---|---|---|
| Work order | impossible — locked | conflict on the form, and a chip on its chart header |
| Request | conflict, keepable | conflict, keepable |

- **PROJ-AC-51** — no location conflict can arise on a work order, because it has no location of its own.

### 11.3 After a projectless submit

Two different offers, decided by whether the renter **already has a project at that place**.

#### The place already has a project

> **You already have a project here**
> *Your request is posted — this changes nothing about it.*
> You wrote **Qiddiya**, and that is where this project already is. File the request there instead of starting a second one for the same site.
>
> | **Add it to Qiddiya Zone 4** | **It's a different site** |
> |---|---|
> | Qiddiya Zone 4, Qiddiya City, Riyadh 13513 · Monthly · 2026-09-01 → 2026-12-31 · 3 items | Create a new project from this request instead. Two sites can share a city — only you know. |
>
> *Filing it changes nothing on the request — it keeps every term it was posted with. Where those differ from the project's, both stay and the difference is shown on the row.* `[ Not now ]`

**Both ways out are equal choices, so both are cards.** Making "file it here" a card and "it's a different site" a footer button would put a thumb on the scale of a guess — a place match is our inference, and only the renter knows whether two sites share a city.

Without this, the second request a renter posts at a site they already have creates a **duplicate project for the same place**, and the site's picture splits in two with no way to notice.

Three rules on it:

- **It always asks.** A place match is not proof of the same site — two Riyadh projects are ordinary. Filing is never automatic.
- **Filing changes no value**, exactly as moving a request between projects does not (§10). A request whose dates differ from the project's keeps them, and the row shows the difference.
- **The escape hatch carries the same weight as the match.** Both are cards, side by side.
- More than one match lists them all, plus the *different site* card last.

- **PROJ-AC-52** — when the stated place matches an existing project, the offer is to **file it there**, never to create a second project for the same site.
- **PROJ-AC-53** — filing from that offer changes no value on the request.
- **PROJ-AC-56** — *file it here* and *create a new one* are presented as equal choices; neither is a footer afterthought.

#### The place has no project yet

On the confirmation screen — never before it, never as a gate:

> **Create a project from this request?**
> *Your request is posted — this changes nothing about it.*
> Save this site once, and every request or work order you add here afterwards starts from it — you type the machine and nothing else.

It does not just ask; it **shows what goes where**, in two lists:

| **Saved as the project — the site's terms** | **Stays with this request — the equipment's terms** |
|---|---|
| Location · Rental basis · Dates · Hours per day · Extendable · Payment terms | Operator · F.A.T · Delivery · Return · Fuel · Min year · Fuel type |
| *"These fill in by themselves on your next request here."* | *"Not part of the project. Pick this request under **Start from** next time and they copy across — the equipment itself never does."* |

That split is the whole mental model of the feature, and this is the one screen where a renter meets it with their own values in front of them. Two lists teach it once; a sentence would have to teach it every time.

- **PROJ-AC-30** — the offer appears only when no project matches that location, and is permanently dismissible per device.
- **PROJ-AC-46** — the offer shows the actual values that will be saved, split into the project's terms and the request's, each labelled with where it lands.
- **PROJ-AC-47** — declining changes nothing about the submitted request.

---

## 12. The agent

### 12.1 The rule

> The agent reads the text and returns **only what the text says**. Project values are never sent to it and never come back from it. The web merges afterwards.

Smaller input, smaller output, and the project's terms cannot be altered by a language model because they never reach one. Independence enforced by architecture, not by a prompt instruction.

### 12.2 Three tiers, chosen by the shape of the text

The project does not choose the tier. It only decides what fills the blanks afterwards.

| Text | Tier | What runs | Target |
|---|---|---|---|
| one equipment line — `2 excavators 20t` | **0** | keyword + size match against the taxonomy. **No model.** | ~50 ms |
| a sentence with extras — `…with a breaker, 2021 or newer` | **1** | small model, `line_items` only, synchronous | < 5 s |
| a paragraph or a file, no project | **2** | today's full path, **byte-identical** | as today |

**Tier 0** uses pieces that already exist: `extractEquipmentKeywords()` (`src/utils/equipment-keywords.util.ts`) scans the ~90 canonical taxonomy names with no model, and `resolveCategoryId` / `resolveSubcategoryId` / `resolveMeasurementId` (`src/repositories/taxonomy.repository.ts:180-199`) turn names into ids. It **must refuse** and hand to Tier 1 whenever: zero or several keywords match; the size does not resolve, or resolves more than one way; words remain after quantity + equipment + size are consumed; or the input is Arabic, until the Arabic index is proven at the same strictness.

**Tier 1** is three multiplications applied together: no header in the output (it is already known), a smaller model (`MANSOUR_RFQ_EQUIPMENT_MODEL_ID`, defaulting to Haiku), and no polling — a synchronous `POST /rfq/quick` with no job row, falling back to `/rfq/jobs` on timeout. Plus `max_tokens: 4096` and few-shot 5.

- **PROJ-AC-31** — with no project selected and a paragraph, the request body sent to the agent is byte-identical to today's.
- **PROJ-AC-32** — no project value is present in any agent request or response.
- **PROJ-AC-33** — Tier 0 and Tier 1 return the same shape, so the canvas cannot tell which answered.
- **PROJ-AC-34** — Tier 1 renders inline on the intake screen and escalates to the processing screen only past 8 seconds.

### 12.3 The prompt reorder — ships first, alone

Today the system prompt is `buildRfqSystemPrompt(taxonomyBlock)` — **instructions then taxonomy, in one cached block** (`rfq.service.ts:819`).

Prompt caching is **prefix**-matched, so a second instructions variant simply gets **its own** cached prefix. The full path is unaffected — it keeps its own entry. What the second prefix costs is that it carries its own copy of the taxonomy and is kept warm **only by its own traffic**, which is thin at launch — exactly when a renter is testing whether "one line, five seconds" is true.

Reordering so the taxonomy is the shared head means every full-path call keeps the equipment-only path warm too, and the taxonomy is cached once rather than twice.

**It is an optimisation, not a prerequisite.** If it does not come back clean it is dropped, and Tier 1 still ships on its own cached prefix with a colder first call. It goes first only because it is small and its eval is the cheapest place to catch a prompt regression.

```
Block A   taxonomy                     ← large, rarely changes, shared by both scopes
Block B   instructions for this scope  ← one of two variants
Block C   learned rules + few-shot     ← volatile
```

- **PROJ-AC-35** — the full-scope output after the reorder is unchanged, proven against the eval suite before anything depends on it.

The obvious optimisation — sending only the relevant slice of the taxonomy — makes it **slower**, because a per-request taxonomy block never hits the cache. Do not do it.

### 12.4 The dedup bug

`hashInput()` (`src/handlers/rfq/jobs.handler.ts:37`) hashes only `source + message + attachments` over 120 seconds. With one-line messages, two renters — or one renter twice — sending `2 excavators 20t` inside two minutes collapse into one job and get each other's answer.

- **PROJ-AC-36** — `scope` and a context fingerprint are part of the hash; the same message under two different projects produces two extractions.

### 12.5 Honesty

A cold prompt cache (a quiet period, a taxonomy refresh) makes the first call slow whatever we do. Warm it when intake opens with a project selected, and escalate the UI at 8 seconds rather than leaving a spinner pretending.

Two numbers gate the work: **Tier 0 hit rate** on real project-path messages, and **Tier 1 taxonomy-match accuracy against the full path**. If accuracy drops materially, revert the model and keep the output cut — a fast wrong match costs the renter far more than a slow right one.

---

## 13. Surface & interaction detail

Everything here is decided and built in `prototypes/renter-projects-v1.html`. It is recorded because a
sentence in a chat is not an instruction to an engineer.

### 13.1 The chart

- **No legend.** The old *Fulfilled · Awarded · Contracted · On rent · Ended* strip is gone with the
  states it explained. A solid navy bar is an awarded period; a hatched grey one is not awarded yet.
  Two coloured marks do not need a caption, and a caption under every row cost more than it gave.
- **Pins:** **green** for mobilized, **orange** for demobilized. Solid, unlabelled, sitting on the
  bar's **top edge** — centred they cover the bar's own dates, which is the one thing it has to say.
  The date is in the tooltip.
- **Documents** appear as small **orange markers in the row's top corner** — one per paper, `+N` past
  three, each with kind and filename in its title. Not a third line under the row: a machine with a PO
  and a contract on file is a glance, not a sentence.
- **Row grouping:** a request or work order header, then one row per **award allocation**, then the
  chart. An un-awarded item is one hatched row reading *awaiting award*.
- **A group whose period differs from its project** carries a `differs from the project: start · end`
  chip on its header, which opens the keep-or-match dialog (§10).

### 13.2 The rail

Active projects, then **Unassigned** when anything is filed nowhere, then **New project**, with a
Ended projects sort last, tagged *ended*, never hidden. Each card counts units awarded, requests and work orders separately —
never added together, because a work order posted as a request is deliberately two rows (§10).

### 13.3 The project form

**One form for New and for Defaults.** Same fields, same order; the edit variant adds the propagation
section and nothing else. Sections: **Where** (map picker → address → title) and **When & terms**
(basis · start · end · extendable · payment terms). Two sections, six fields — everything
else a renter might expect to find here belongs to the request (§5.3), or is never asked at all (§5.1).

- The **map** comes first and the address follows it: dropping a pin is how a site is chosen; typing an
  address is the fallback. The pin's coordinates are shown and update as it moves.
- Editing the location warns that existing requests keep the site they were posted with unless ticked
  in the propagation list.
- Footer: **Cancel · Project only · Save and apply to the ticked** — three actions, because "apply to
  existing" is a different decision from "save", not a checkbox on it.

**After creating one**, the same modal asks what goes on the site — an empty project is useless, and
*Add work order* otherwise lives on a board the renter has not seen yet:

> **Project created** · *Nothing is on this site yet. Two things can go on it — and they are not the same thing.*
>
> **Add a work order** — a machine already on site: your own fleet, or a vendor you already use. Private: no supplier ever sees it.
> **Post a new request** — ask our suppliers for a machine. The site's terms are filled in already — you type the machine and nothing else.
>
> *Both end up on the same chart, and you can add either at any time.* `[ Not now ]`

This is where the difference between the two is taught, at the one moment the renter is choosing
between them.

- **PROJ-AC-48** — creating a project offers both ways of putting something on it, each named and
  described, with a way out.

### 13.4 The work-order form

**Equipment first, supplier second**, in three fieldsets:

1. **Equipment** — title, then one card per machine: category → subtype → size (a cascade; each level
   is disabled until its parent is picked), quantity, accessories, notes. *Add another machine.*
2. **Machine terms** — shared by the order. The **operator block is absent, not disabled**, when no
   machine on the order takes an operator (§7), replaced by one line saying why. Delivery · return ·
   fuel · min year · fuel type · equipment safety certificates always show.
3. **Supplier & period** — the order's own period (with the project-conflict warning), then one card per
   machine holding its supplier lines: supplier (registered only) · units · rate, with *Split across
   another supplier* and a running `used of quantity` counter.

Saving writes the work order, its items **and one allocation per supplier line**.

### 13.5 Intake

Chips → pills → **Start from** dropdown → a live readout of which of the three speeds this text would
take (§12.2). The site pill turns red on a location conflict and opens a keep-or-use-the-project's
dialog. After a projectless post, the *Reuse these settings?* offer (§11.3).

## 14. Titles

Project, work order and request each carry an optional title. Blank falls back: a project to the location's short name (first address segment, postcode stripped), a request to its RFQ code, a work order to its first machine's name. A fallback title is marked *default*.

- **PROJ-AC-37** — a blank title never renders as blank.

---

## 15. Open items

**One open:**

1. **Overtime on the supplier side.** Hidden for renters (§5.4). Suppliers can still *quote* an overtime rate (`BidFormClient.tsx:1048`), and it shows in the matrix (`CompareMatrix.tsx:54`) and the deal room (`DealRoom.tsx:1169`). Either leave it as supplier-volunteered information, or remove the term from both sides. Recommended: leave it, and revisit once renters have stopped stating one.

**Decided, recorded here because they were once open:**

- **Supplier filters** stay in Preferences on the project, and a request's own values are never overwritten (§5.1).
- **Budget** is request-only, not on the project or a work order, and **not carried by a template copy** — a stale ceiling filters out every real bid with no error shown (§5.3).
- **Un-awarding** is allowed at any time, with a confirmation naming the documents that go with it (§8.2).

**Out of v1 by choice:**

- Registration **expiry** and **scope** on a vendor registration (§9.2). Both exist in real vendor masters; the columns are left room for.
