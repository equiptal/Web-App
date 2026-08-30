# 007 Renter Projects — is the spec actually built?

**Audited 2026-08-31**, criterion by criterion against the code, after the machine-terms editor was
found missing during UAT. 58 criteria (`PROJ-AC-01`…`62`; 49–50 and 57–58 are unused numbers).

**52 built · 6 not built.** None of the six is a surprise-in-hiding any more — each is named here
with what it would take.

---

## Not built

### AC-05 · The overtime control is still on screen

§5.4 says `overtimeRate` leaves the renter's surfaces entirely, naming three sites. All three still
render it:

| site | spec cites | now |
|---|---|---|
| `WhenPanel.tsx` | :259 | `ChoiceRow<OvertimeRate>` at **:259** |
| `ReadyToSend.tsx` | :131 | still present |
| `RequestEditModals.tsx` | :227 | still present |

Never started — no commit mentions it. The data path is meant to stay untouched (`"without"` keeps
being sent), so this is three deletions of JSX and nothing else. **Small, and entirely unblocked.**

### AC-15, AC-18, AC-19, AC-20, AC-59, AC-60 · The supplier registry

`GET /agents/renter-suppliers` does not exist — 404 live, zero routes in `serverless.yml`. The web
already calls it and treats an empty answer as normal, so the award dialog falls back to a free-text
name with a datalist of names used before on that line.

What that costs today: **two typings of the same supplier are two unrelated strings.** No dedupe, no
per-supplier roll-up, and `supplierId` is always null.

⚠️ **AC-15 is not merely unbuilt — the code contradicts it.** The spec says *an award requires a
vendor-registered supplier*; `AwardDialog.tsx:123` carries the comment *"Vendor registration is the
renter's own gate, shown rather than enforced"* and lets an unregistered supplier be chosen. That is
a decision someone made against the written criterion, and it is not recorded anywhere as a ruling.
**Raised in `RULINGS.md`** rather than resolved here — enforcing it would block awards on a registry
that does not exist yet, and the marketplace path (AC-20) is supposed to build the list from real
use rather than ask the renter to register anyone up front.

### AC-09, AC-10, AC-11 · The operator-applicable flag

W-T5, deferred by decision. Where a subcategory takes no operator, `operatorNeeded` should be forced
to `"no"`, no operator term copied or sent, and the rail hidden — with the renter's own words still
winning (*"generator with operator"* shows the rail, with a note).

Today the operator block shows for every machine. That is a visible-but-harmless default, not a
wrong value.

**This is the dependency that cost the machine-terms editor.** W-T17 deferred the whole terms block
over this one field's visibility, and the caveat lived only in a commit body. It is one condition in
`TermsFields.tsx` when it lands.

### AC-02 · Delete does not name the creator

*"A project's delete confirmation names its creator."* `ProjectDelete.tsx` names the **project** —
`"{name}" has nothing filed under it` — and never the person who made it. `ownerName` is already on
the payload, so this is one interpolation and one copy change.

Matters on a shared company board, which is the whole premise of AC-01: on a site somebody else
created, the confirmation should say so.

---

## Built, and what proves it

| Area | Criteria | Evidence |
|---|---|---|
| Company visibility, request copies its own values, differences marked | 01, 03, 04 | `project-apply`, `project-propagation` |
| Templates copy terms and never equipment | 06, 07, 08 | `project-templates` — 7 tests |
| Chart: ghost rows, per-allocation pins, units cap | 12, 13, 14 | `project-chart`, `project-work-order` |
| Awarding leaves marketplace status alone | 16 | `project-routes` |
| Ours vs theirs on quotations | 17 | `DocumentsDialog` |
| Un-awarding never blocked, names what goes | 38 | `AwardDialog` |
| Move / file, and the picker leading with the row's own site | 21, 54, 55 | `project-move` |
| Apply never spends a bid-bearing edit | 22 | `project-propagation` |
| Delete only when empty; a request is unfiled, never deleted | 23, 39 | `project-delete`, live `409 PROJECT_NOT_EMPTY` |
| *Ended* derived, never stored | 40 | `projectEnded` |
| Pills, provenance, guests see no chips | 24–29 | `project-intake`, `Provenance` |
| The offer: equal choices, real values, dismissible | 30, 46, 47, 52, 53, 56 | `ProjectOffer` |
| Agent tiers: same shape, no project data, 8s escalation | 31–36 | `agent-tier`, `Intake.tsx:82` |
| A blank title never renders blank | 37 | `projectTitle`, `titleIsDerived` |
| Off-catalogue machines | 41, 42 | `project-work-order` |
| **Machine terms, shared and overridable** | **43, 44** | **`project-machine-terms` — 8 tests** |
| Period change never moves an award on its own | 45 | `propagationForWorkOrder` |
| Creating a project offers both ways | 48 | `ProjectCreated`, and the header buttons |
| No location conflict on a work order | 51 | work orders have no location |
| Work order is a group id; a header write reaches every row | 61, 62 | backend `renter-projects-work-order-upsert` |

---

## How AC-43 and AC-44 were missed

Worth recording, because the mechanism will repeat otherwise.

W-T17 shipped with this in its **commit body**:

> "The per-machine terms editor is a stub. Whether the operator block is hidden for equipment that
> takes no operator depends on W-T5, which is deferred, so the block is not written yet rather than
> written wrong."

Two failures, and the second is the expensive one:

1. **A one-field dependency deferred eleven fields.** Shipping ten of them with the operator block
   always visible was right, and adjustable in one line later.
2. **The caveat was written where nothing reads it.** Not the ticket list, not the UAT script, not
   the owner — who found it by trying to use the form.

`work_order_items.terms` was ready the whole time and both handlers accepted terms in both places.
It was **web-only and unblocked** from day one, and every work order saved an empty blob into a
column built to hold exactly this.

**What changes:** a deferred criterion goes in this file, not a commit message. This audit is the
place a "stub" has to survive being written down.
