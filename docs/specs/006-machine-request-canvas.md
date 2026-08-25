# Machine Request Canvas

| | |
|---|---|
| **Key** | MREQ |
| **Status** | Draft |
| **Author** | yfa245 |
| **Created** | 2026-08-25 |
| **Layers** | web · agents-backend (one additive field, §7.1) |
| **Links** | Prototype: `Machine Request Standalone.html` (Claude Design bundle, unpacked to a `x-dc` template + state class). Baseline behaviour: `docs/request-experience-flow.md`. |

> Acceptance IDs in this document are namespaced `MREQ-AC-NN`. They are local to this
> spec and are **not** `moedatech-specs` acceptance IDs.

---

## 1. Problem & outcome

The RFQ create flow is a four-step wizard. A renter describes what they need in their own words, the
agent parses it, and then the renter is walked through four numbered screens — Project, Equipment,
Preferences, Preview — before anything reaches a supplier. The steps impose an order that has nothing
to do with how a renter thinks about a job, they hide what has already been decided on their behalf,
and they say nothing about which of the many fields actually matter.

The outcome we want is a single canvas. The renter's own sentence stays visible at the top. The
machine, the site and the schedule are three panels on one page. Every value the system or the agent
chose is visibly marked as such, so nothing is decided silently. A single counter — "N things need
you" — states exactly how much is left, and it counts only what genuinely blocks.

**Success signal:** a renter can see, without scrolling or clicking, what the system decided for them
and what is still theirs to decide.

## 2. Who it's for

Renters (rentees) creating an equipment request on the web — guests, basic and verified tiers alike.
Guests run the whole flow and meet the account gate at submit, unchanged.

## 3. Current state

`/create` runs a four-phase state machine (`rfq-store.tsx`): `intake → processing → wizard →
confirmation`. The `wizard` phase renders `Wizard.tsx`, which owns a step-chip header, a footer
Back/Next pair, a "Start over" control, and four step components. Forward navigation is gated by
`gateStep1/2/3` (`contract/gates.ts`), and each forward step pushes a browser history entry so
Back/Forward walk the wizard.

This spec replaces the `wizard` phase's internals. `intake`, `processing` and `confirmation` are
untouched, as are the submit path, the BFF routes, and every backend contract.

## 4. Scope

**In**

- A single-canvas request builder replacing `Wizard.tsx`, `Step1Project`, `Step2Equipment`,
  `Step3Preferences` and `ItemRow`'s presentation.
- A "Ready to send" review screen replacing `Step4Preview`.
- A rewritten gate module expressing the app's required set plus two web-only additions.
- A field-provenance treatment (agent / default / renter) applied across the canvas.
- Corrected billable-day arithmetic and corrected schedule-panel copy, EN + AR.

**Out**

- Any backend change. No new endpoints, no schema delta, no enum change.
- Any contract-type change other than one additive, web-only field (`touchedFields`).
- `intake`, `processing`, `confirmation` screens.
- The agent's parsing behaviour.
- Mobile parity. This design deliberately departs from the app's four-step form. The app remains the
  authority for everything not being redesigned — option vocabularies, the required set, pricing
  arithmetic and the submit mapping — and this document holds to it on all of those.

**Assumptions**

- The taxonomy and attachment endpoints already serve what the new controls need; neither changes.
- `agentOrigin` (the agent's untouched project + items, held in the store) remains the source for
  agent-vs-renter provenance, as `Step1Project` and `ItemRow` already use it.
- Equipment-certificate globalization stays in `agent-adapters.ts` and is not reimplemented in the UI.

## 5. Flows

### 5.1 Happy path — one machine

1. The renter types their request and submits it. `intake → processing` are unchanged.
2. The canvas opens. The renter's sentence sits at the top under "YOU WROTE", with an Edit link and a
   pill reading "N things need you".
3. The equipment panel is open: **The machine** card on the left, **The operator** rail on the right.
   Values the agent detected carry an amber highlight and an "AI selected" badge; values the system
   defaulted carry an amber highlight and a "Default" badge.
4. The renter resolves the marked required fields — the amber dots. Each one they change loses its
   amber treatment and reads "changed by you".
5. The renter opens **Where it goes**, positions the pin, and presses "This is the right spot".
   **When it runs** opens automatically.
6. The renter sets the dates and billing basis, reads how many days they will be charged for, and
   ticks the confirmation. The canvas returns to the equipment panel.
7. The renter presses "Review & send". The Ready-to-send screen shows exactly what suppliers will
   receive, with Preferences as the only editable region.
8. "Send to suppliers" submits. Guests meet the account modal first, then the request auto-posts.
   The existing confirmation screen renders.

### 5.2 Several machines

1. The agent returns more than one item; the canvas opens on item 1 of N. There is no mode toggle.
2. The primary button reads "Next equipment →". Pressing it raises the carry-forward modal, which
   states that the site and schedule apply to the whole request and that the next item's other
   details start out matching this one.
3. On item 2 and later, *Where it goes* and *When it runs* render as a locked green strip. Carried
   values are highlighted so the renter can see what was inherited.
4. "← Previous equipment" returns to the prior item with its edits intact.
5. On the last item the button reads "Review & send →".

### 5.3 An item the marketplace can't supply

1. The agent returns an item with `verdict === "no-match"`.
2. The machine card renders the red unavailable panel instead of the type/size controls.
3. The renter either picks another type, or presses the WhatsApp hand-off, which sets
   `sourcingRequested`. The row stays visible in a pending state.
4. The item never blocks advancing and is excluded from the broadcast (`postableItems`).

### 5.4 Gating

Panels unlock in order, and a refused move shakes rather than explains:

```
Equipment  ──(required fields set)──►  Where it goes
Where      ──("This is the right spot")──►  When it runs
When       ──(charged-days confirmation ticked)──►  Review & send
```

## 6. Web surface — implement in `Web-App`

### Pages / components

| Path | Action |
|---|---|
| `src/components/wizard/Wizard.tsx` | **delete** — replaced by the canvas |
| `src/components/wizard/Step1Project.tsx` | **delete** — split into the Where and When panels |
| `src/components/wizard/Step2Equipment.tsx` | **delete** — replaced by the item walker |
| `src/components/wizard/Step3Preferences.tsx` | **delete** — moves into the review screen |
| `src/components/wizard/ItemRow.tsx` | **dismantle** — logic to hooks, presentation discarded |
| `src/components/wizard/Step4Preview.tsx` | **rewrite** as `create/ReadyToSend.tsx` |
| `src/components/wizard/YearPicker.tsx` | **delete** — replaced by the photo-overlay dropdown |
| `src/components/create/Canvas.tsx` | **new** — panel host, gating, item walker, start-over |
| `src/components/create/MachineCard.tsx` | **new** |
| `src/components/create/OperatorRail.tsx` | **new** |
| `src/components/create/WherePanel.tsx` | **new** — wraps the existing Maps picker |
| `src/components/create/WhenPanel.tsx` | **new** |
| `src/components/create/CarryForwardModal.tsx` | **new** |
| `src/components/create/Provenance.tsx` | **new** — the amber highlight + badge treatment |
| `src/components/create/ReadyToSend.tsx` | **new** |
| `src/components/screens/{Intake,Processing,Confirmation}.tsx` | unchanged |

### Hooks extracted from `ItemRow`

- `useItemTaxonomy(item)` — category/subtype/capacity resolution and the searchable option lists.
- `useItemAttachments(subtypeId)` — the `GET /api/equipment/attachments/:subtypeId` fetch, the
  preselected-defaults-on behaviour, and the empty-list hide.
- `useItemOverrides(item, project)` — per-item override reads that fall back to the request-wide value.
- `useItemVerdict(item)` — needs-validation / no-match / removed / `sourcingRequested` handling.

### BFF routes

None added, changed or removed. The canvas consumes the same routes the wizard does:
`/api/equipment/attachments/:subtypeId`, the taxonomy fetch, and `POST /api/requests`.

### Contract / adapters

- `src/lib/contract/gates.ts` — rewritten. `gateStep1/2/3` are replaced by `gateEquipment(item)`,
  `gateWhere(project)`, `gateWhen(project)` and `requiredGaps(draft)`; `itemBlocksAdvance` and
  `postableItems` are kept as-is.
- `src/lib/contract/draft.ts` — one additive field on `RfqDraft`:
  `touchedFields: string[]` — dotted paths the renter has personally edited, using the same key
  vocabulary as the agent's `fieldNotes`. **Web-only.** Never sent to either backend.
- `src/lib/api/agent-adapters.ts` — one deletion: stop reading `payment_method` into the draft
  (line 429). Everything else, including the certificate and year globalization, is untouched.
- `src/lib/api/app-adapters.ts` — unchanged. `paymentMethod` becomes permanently `undefined` as a
  consequence of the line above, not by editing the mapping.

### Store

`rfq-store.tsx` keeps its four phases and its draft persistence. Changes:

- `step: Step` and the `GO_STEP` action are replaced by `activeSection: "equipment" | "where" |
  "when" | null` plus `whereConfirmed` / `chargedDaysUnderstood` flags and an `itemIndex`.
- `touchedFields` is persisted with the draft and read by the provenance helper.
- The history effects (lines 662–707) are reduced to a single canvas entry: one push on
  `intake → wizard`, one on `wizard → review`. Opening or closing a panel pushes nothing.

### Pricing

Billable days come from `src/lib/pricing/rental.ts` — `durationDaysBetween(start, end)` and
`billableDays(start, durationDays)`. The canvas must not compute its own. Both ends are inclusive,
both dates are read in UTC, and Fridays are excluded for every price unit. `workingDaysPerWeek` has
no control on the canvas and submits as `6`.

### i18n

New keys under `t.create.*`. Numerals follow the existing convention: `arabicIndicDigits` /
`toArabicIndic` (`bid-map.ts`) in Arabic, Latin in English. Native `<input type="date">` renders per
browser locale and is not ours to control.

| Key | EN | AR |
|---|---|---|
| `create.when.chargedLabel` | DAYS YOU'LL BE CHARGED FOR | الأيام التي ستُحاسب عليها |
| `create.when.chargedExplain` | Your rental runs {total} calendar days. Fridays are not charged, and there are {fridays} of them, so suppliers price {charged} days at {hours} hours each. | يمتد الإيجار {total} يوماً تقويمياً. أيام الجمعة غير محسوبة وعددها {fridays}، لذلك يسعّر الموردون {charged} يوماً بواقع {hours} ساعات يومياً. |
| `create.when.chargedNoDates` | Add a start and end date and we'll show exactly how many days you'll be charged for. Fridays are never charged. | أضف تاريخ البداية والنهاية لنعرض عدد الأيام التي ستُحاسب عليها بالضبط. أيام الجمعة غير محسوبة أبداً. |
| `create.when.confirm` | I understand suppliers will price {charged} days, not {total}. | أفهم أن الموردين سيسعّرون {charged} يوماً، وليس {total}. |
| `create.when.confirmNoDates` | I understand suppliers will price without a fixed end date. | أفهم أن الموردين سيسعّرون دون تاريخ انتهاء محدد. |
| `create.when.tooShortMonthly` | Your dates cover {days} days. Monthly billing usually needs 30 days or more. | تغطي تواريخك {days} يوماً. الفوترة الشهرية تحتاج عادةً ٣٠ يوماً أو أكثر. |
| `create.when.tooShortWeekly` | Your dates cover {days} days. Weekly billing usually needs 7 days or more. | تغطي تواريخك {days} أيام. الفوترة الأسبوعية تحتاج عادةً ٧ أيام أو أكثر. |
| `create.when.nudgeBoth` | Suppliers quote lower when they don't know your dates. Add a start and end date to get better bids. | يقدّم الموردون أسعاراً أفضل عندما يعرفون تواريخك. أضف تاريخ البداية والنهاية للحصول على عروض أفضل. |
| `create.when.nudgeEnd` | Suppliers quote lower when they don't know your end date. Add one to get better bids. | يقدّم الموردون أسعاراً أفضل عندما يعرفون تاريخ الانتهاء. أضفه للحصول على عروض أفضل. |
| `create.when.nudgeStart` | Suppliers quote lower when they don't know your start date. Add one to get better bids. | يقدّم الموردون أسعاراً أفضل عندما يعرفون تاريخ البداية. أضفه للحصول على عروض أفضل. |
| `create.machineCard.delivery` | To site — mobilisation | إلى الموقع — التوصيل |
| `create.machineCard.returnFromSite` | From site — demobilisation | من الموقع — الإرجاع |
| `create.machineCard.fuelResponsibility` | Fuel — {fuel} | الوقود — {fuel} |
| `create.party.supplier` | Supplier | المورّد |
| `create.party.weCollect` | We collect | نستلمها |
| `create.party.weReturn` | We return | نعيدها |
| `create.party.wePay` | We pay | ندفع |
| `create.party.weCover` | We cover | نتكفّل |
| `create.provenance.agent` | AI selected | اختاره الذكاء الاصطناعي |
| `create.provenance.default` | Default | افتراضي |
| `create.provenance.renter` | changed by you | غيّرته بنفسك |
| `create.banner.needsYou` | {n} things need you | {n} أمور تحتاج إليك |
| `create.year.any` | Any year | أي سنة |
| `create.cert.none` | No certificate | بدون شهادة |

### RTL notes

- The operator rail sits at the inline end; collapsed, it hugs the same edge. Its vertical "OPERATOR"
  label uses `writing-mode: vertical-rl` in both directions.
- The photo overlays are positioned with logical properties so the quantity stepper and the
  certificate dropdown swap sides under `dir="rtl"`.
- The date range's `→` separator flips to `←`.
- Numerals sit inside the `dir="ltr"` isolate the rest of the app already uses for figures.

## 7. Backend contract — implement in `Moedatech-App`

### 7.1 Equipment images on the taxonomy — one endpoint change, no migration

The canvas has a machine panel and no machine picture, so it renders the taxonomy icon. The data to
do better already exists and is simply not served.

- **Owning app:** `apps/backend-agents`
- **The column exists.** `equipment_taxonomy.image_key` — `EquipmentTaxonomy.imageKey`,
  `String? @db.VarChar(500)` (`apps/backend/prisma/schema.prisma:1037`). **No new column, no
  migration, no admin work** if images are already being uploaded against it.
- **The plumbing exists too.** `getBidForm.ts:93` already selects `imageKey` alongside `name` /
  `nameAr` and converts it with the same key→public-URL helper the rest of the handler uses
  (`imageUrl: toUrl(sub?.imageKey)`, line 134).
- **The gap:** `getTaxonomy.ts` (lines 47–56) does not include `imageKey` in its `select`, and its
  node mapping (lines 61–71) therefore cannot emit it. `GET /agents/taxonomy` returns
  `id · level · name · name_ar · parent_id · aliases · tag · sort_order · visibility` and nothing else.
- **Change:** add `imageKey: true` to the select, and `image_url: toUrl(n.imageKey)` to each node.
  Additive — every existing consumer ignores an unknown field.
- **Backward compatibility:** the flat node list is the "unchanged Mansour contract (§3.3)" per that
  handler's own comment, so the addition should be confirmed against Mansour before it lands.

**Web side, once served:** add `image_url` to `TaxonomyNode` (`contract/app.ts`), carry it through
`nodesToTree` (`app-adapters.ts`) onto `Category` / `Subcategory`, and render it in `MachineCard` with
the taxonomy icon as the fallback for nodes that have no image.

### 7.2 Everything else — nothing to implement

The rest of this feature is web-only.

Stated explicitly so a backend session reading this document does not go looking:

- No endpoint is added, changed or removed.
- No Prisma model or field changes; no migration.
- No enum or validation change in `apps/backend` or `apps/backend-agents`.
- The submitted payload shape is unchanged, with one behavioural narrowing: `paymentMethod` is now
  always absent, because the web stops reading the agent's `payment_method` inference and offers no
  control for it. The field is already optional on the request path, so this needs no backend work —
  but it is worth a backend reader knowing that requests created from the web will no longer carry it.
- `workingDaysPerWeek` is always `6` from the web. It was already defaulted to `6`; the web simply no
  longer offers a control that could change it.

## 8. Acceptance criteria

| ID | Layer | Given / When / Then |
|---|---|---|
| MREQ-AC-01 | web | **Given** a draft exists **When** the store enters phase `wizard` **Then** the single canvas renders — "YOU WROTE" banner, machine + operator cards, *Where it goes*, *When it runs* — and no step chips, step numbers or `goStep` control appears anywhere. |
| MREQ-AC-02 | web | **Given** the canvas is open with unmet required fields in the equipment panel **When** the renter clicks the *Where it goes* header **Then** the panel does not open, the incomplete blocks receive the `shake-error` class for 450 ms, and focus stays in the equipment panel. |
| MREQ-AC-03 | web | **Given** equipment is complete and the location is unconfirmed **When** the renter clicks the *When it runs* header **Then** the panel does not open and the "This is the right spot" button shakes. |
| MREQ-AC-04 | web | **Given** the renter presses "This is the right spot" **Then** `project.location.confirmed` becomes `true` and *When it runs* opens automatically. |
| MREQ-AC-05 | web | **Given** *When it runs* is open **When** the renter ticks the charged-days confirmation **Then** the panel is marked confirmed and the canvas returns to the equipment panel. |
| MREQ-AC-06 | web | **Given** the canvas is open **When** the renter presses browser Back **Then** the intake screen renders with the draft intact; opening or closing a panel never pushes a history entry. |
| MREQ-AC-07 | web | **Given** the Ready-to-send screen is open **When** the renter presses browser Back **Then** the canvas renders, not the intake screen. |
| MREQ-AC-08 | web | **Given** the canvas is open **When** the renter presses "Start over" and confirms **Then** the saved draft is cleared and a fresh intake renders; cancelling leaves the draft untouched. |
| MREQ-AC-09 | web | **Given** any item **Then** advancing is blocked only by: at least one item, and per item `categoryId`, `subtypeId`, `capacityId`, `fuelType`, `deliveryToSite`, `returnFromSite`, `equipmentYear` and equipment certificate; plus `location` (lat + lng + label) and `rentalBasis` request-wide. The first seven mirror `create_request_page.dart` `_missingPerStep`; `equipmentYear` and the certificate are web-only additions. |
| MREQ-AC-10 | web | **Given** `startDate` is empty **When** the renter advances **Then** nothing blocks, and the start-date advisory renders. *(Deliberate divergence: the app requires it.)* |
| MREQ-AC-11 | web | **Given** fuel responsibility, attachment, night shift, nationality, food or accommodation is unset **Then** no amber dot renders on it and it never blocks. |
| MREQ-AC-12 | web | **Given** N required fields are unset **Then** the banner pill reads "N things need you", and N counts required gaps only. |
| MREQ-AC-13 | web | **Given** every required field is set **Then** the pill disappears, each panel dot is green, and completed panels render with the green-tinted background. |
| MREQ-AC-14 | web | **Given** an item with `verdict === "no-match"` or `removed === true` **Then** it is excluded from the required count and never blocks, per `postableItems`. |
| MREQ-AC-15 | web | **Given** required gaps exist **When** the renter presses the primary Next button **Then** navigation is refused and every incomplete block shakes simultaneously. |
| MREQ-AC-16 | web | **Given** the machine card **Then** the photo carries four live overlays: quantity stepper (floor 1), equipment-certificate dropdown, minimum-year dropdown, and fuel-type picker. |
| MREQ-AC-17 | web | **Given** the fuel picker **Then** its options are exactly `diesel` and `electric` from `FUEL_TYPES`, and the selection persists to `item.fuelType`. |
| MREQ-AC-18 | web | **Given** the minimum-year dropdown **Then** its options are `any · 2015+ · 2018+ · 2020+ · 2022+` from `EQUIPMENT_YEARS`, and picking **Any year** is an explicit choice that satisfies the gate. |
| MREQ-AC-19 | web | **Given** the equipment-certificate dropdown **Then** its options are `tuv · aramco · other` from `SAFETY_CERTIFICATES` plus an explicit **No certificate** option that satisfies the gate; choosing `other` reveals a free-text field bound to `safetyCertsOtherText`. |
| MREQ-AC-20 | web | **Given** an item's subtype **Then** CATEGORY renders read-only from the resolved `TaxonomyRef`, never a literal string. |
| MREQ-AC-21 | web | **Given** the TYPE or SIZE dropdown is open **Then** it lists taxonomy options for that level with a search field filtering them, and picking one stamps `ref`. |
| MREQ-AC-22 | web | **Given** a subtype with configured attachments **Then** multi-select chips render from `GET /api/equipment/attachments/:subtypeId` with preselected rows on and no free-text input; **given** a subtype with none, the section does not render. |
| MREQ-AC-23 | web | **Given** the subtype is a crane **Then** the optional free-text `workType` field renders; for any other subtype it does not. |
| MREQ-AC-24 | web | **Given** an item with `verdict === "no-match"` **Then** the red unavailable card renders with a WhatsApp hand-off that sets `sourcingRequested`, the row stays visible in a pending state, and the item is excluded from the broadcast. |
| MREQ-AC-25 | web | **Given** the operator toggle is off **Then** the rail collapses to the narrow vertical strip, `operatorNeeded` becomes `"no"`, and the operator fields are excluded from every summary. |
| MREQ-AC-26 | web | **Given** the accommodation & transport control is set **Then** both `fatAccommodationTransport` and the transport half are written together from one press. |
| MREQ-AC-27 | web | **Given** the operator certificate chips **Then** options are `tuv · spsp · saso-technical · other` from `OPERATOR_CERTIFICATES` with a free-text field for `other`, and the selection appears in the Ready-to-send operator summary. |
| MREQ-AC-28 | web | **Given** nationality is set to Restricted **Then** the free-text `nationalityCustom` field (≤100 chars) renders; setting it to Any hides and clears it. |
| MREQ-AC-29 | web | **Given** the *Where it goes* panel is expanded **Then** the live Google Maps picker renders, accepting a search term, a pasted Maps link, coordinates, or a dragged pin. |
| MREQ-AC-30 | web | **Given** `detectedLocations` has more than one entry and the warning is not dismissed **Then** the multi-location notice renders, telling the renter the other sites need separate requests. |
| MREQ-AC-31 | web | **Given** the location carries an unresolved `conflict` **Then** advancing is blocked until it is resolved. |
| MREQ-AC-32 | web | **Given** both dates are set **Then** the charged-day figure is computed by `durationDaysBetween(start, end)` and `billableDays(start, duration)` from `lib/pricing/rental.ts` — inclusive of both ends, read in UTC, Fridays excluded — and the canvas contains no arithmetic of its own. |
| MREQ-AC-33 | web | **Given** start `2026-08-12` and end `2027-02-08` **Then** the panel states 181 calendar days, 26 Fridays, and **155** charged days. |
| MREQ-AC-34 | web | **Given** either date is empty **Then** no charged-day figure renders, the explain line reads `create.when.chargedNoDates`, and the confirmation reads `create.when.confirmNoDates` — the renter can still tick it and finish the panel. |
| MREQ-AC-35 | web | **Given** the canvas **Then** no `workingDaysPerWeek` control renders anywhere, and the value submitted is `6`. |
| MREQ-AC-36 | web | **Given** billing is Monthly and the dates cover fewer than 30 days **Then** `create.when.tooShortMonthly` renders with the **day** count, never a month count, and does not block. |
| MREQ-AC-37 | web | **Given** billing is Weekly and the dates cover fewer than 7 days **Then** `create.when.tooShortWeekly` renders with the day count and does not block. |
| MREQ-AC-38 | web | **Given** the agent returned several items **Then** the canvas opens on item 1 of N with no single/multi mode toggle rendered anywhere. |
| MREQ-AC-39 | web | **Given** more items remain **When** the renter presses "Next equipment" **Then** the carry-forward modal explains that site and schedule apply request-wide and that other details start matching the current item. |
| MREQ-AC-40 | web | **Given** the renter is on item 2 or later **Then** *Where it goes* and *When it runs* render as the locked strip, not editable panels, and "← Previous equipment" returns to the prior item with its edits intact. |
| MREQ-AC-41 | web | **Given** a field was carried from the previous item **Then** it renders with the carried-highlight treatment so the renter can see what was inherited. |
| MREQ-AC-42 | web | **Given** every required field is set **When** the renter presses "Review & send" **Then** the read-only summary renders and each Edit link returns to that item in the canvas. |
| MREQ-AC-43 | web | **Given** the Ready-to-send screen **Then** Preferences is the only editable region: payment terms, maintenance responsibility + SLA, budget ceiling, bid window, supplier filters, and notes. |
| MREQ-AC-44 | web | **Given** any submission **Then** `paymentMethod` is absent from the payload and the agent's `payment_method` inference is never read into the draft. |
| MREQ-AC-45 | web | **Given** the equipment table **When** the renter presses the export action **Then** `rfq-spec-sheet.csv` downloads via the existing `lib/export/spec-sheet` helper. |
| MREQ-AC-46 | web | **Given** every item carries the same equipment certificates and no free-text "other" **When** the request is submitted **Then** the set is lifted to `project.certificates.safety` and each item's override is nulled, per `agent-adapters.ts`; **given** they differ, the request-wide default is empty and per-item overrides are kept. |
| MREQ-AC-47 | web | **Given** a guest presses "Send to suppliers" **Then** the account modal opens and the request auto-submits on completion. |
| MREQ-AC-48 | web | **Given** submission succeeds **Then** the existing confirmation screen renders with its share affordances. |
| MREQ-AC-49 | web | **Given** a saved draft on entry **Then** the continue / start-over prompt overlays the restored canvas and the choice is honoured. |
| MREQ-AC-50 | web | **Given** `?mode=trial` **Then** the trial ribbon renders above the canvas on every panel and the request submits with `isTrial: true`. |
| MREQ-AC-51 | web | **Given** locale `ar` **Then** every canvas string resolves from `ar.ts`, the layout mirrors RTL, the operator rail collapses to the inline-end edge, and every figure renders in Arabic-Indic digits via `toArabicIndic` — matching the existing convention, not Latin numerals. |
| MREQ-AC-52 | web | **Given** the taxonomy or attachment fetch fails **Then** the affected control renders empty and disabled rather than throwing, and the rest of the canvas stays usable. |
| MREQ-AC-62 | web | **Given** a party choice on the canvas **Then** the renter's side names the obligation — "We collect" for mobilisation, "We return" for demobilisation, "We pay" for fuel, "We cover" for food and accommodation — and never the bare "Me"; the shared `options.party` vocabulary is unchanged for the bid form, deal room and review table. |
| MREQ-AC-63 | web | **Given** the fuel responsibility control **Then** its label names the item's fuel type ("Fuel — diesel"), so the choice states what is being paid for. |
| MREQ-AC-53 | web | **Given** delivery or return is unset **Then** the "Me" pill renders visibly selected with the "Default" badge, and the submitted `mobilizationByRentee` / `demobilizationByRentee` match that shown selection — the `?? "me"` fallback in `app-adapters.ts` is retained but is never invisible to the renter. |
| MREQ-AC-54 | web | **Given** an item whose year or certificate the renter has not touched **Then** an amber dot renders on that control and advancing is blocked, even when the agent prefilled a value. |
| MREQ-AC-55 | web | **Given** the renter picks "Any year" or "No certificate" **Then** the gate is satisfied and the submitted payload is identical to today's unset case — `equipmentYear` maps to `null` via `yearOut()`, safety certificates map to an empty list. |
| MREQ-AC-56 | web | **Given** a draft is saved and resumed **Then** `touchedFields` survives, and a control touched before the reload does not show its dot again. |
| MREQ-AC-57 | web | **Given** any field whose current value still equals what the agent produced (`agentMatches`) **Then** it renders with the amber highlight and the "AI selected" badge. |
| MREQ-AC-58 | web | **Given** any field the system defaulted and the renter has not touched **Then** it renders with the amber highlight and the "Default" badge — including delivery and return pre-set to "Me". |
| MREQ-AC-59 | web | **Given** the renter changes a highlighted field **Then** the amber treatment clears, the badge reads "changed by you", and the field's dotted path is added to `touchedFields`. |
| MREQ-AC-60 | web | **Given** a draft is saved and resumed **Then** previously-touched fields do not revert to the amber treatment. |
| MREQ-AC-61 | web | **Given** a value the renter never touched **Then** the amber highlight alone never blocks advancing — only the dot does. |

## 9. Test cases

**159 tests across 15 files**, all green. The suite runs two environments: node for pure logic, jsdom
for the `.test.tsx` files that render components (`vitest.config.ts` `environmentMatchGlobs`). The
DOM half is new — the four-step wizard it replaced had no component tests at all, which is how a
screen reaches UAT unlooked-at.

| File | Env | Tests | Satisfies |
|---|---|---|---|
| `tests/unit/gates.test.ts` | node | 23 | AC-09, 10, 11, 14, 29, 31, 54, 55 |
| `tests/unit/charged-days.test.ts` | node | 9 | AC-32, 33, 34, 36, 37 |
| `tests/unit/provenance.test.ts` | node | 8 | AC-57, 58, 59, 61 |
| `tests/unit/submit-payload.test.ts` | node | 10 | AC-35, 44, 46, 53, 55 |
| `tests/unit/create-canvas-wiring.test.ts` | node | 9 | AC-01, 32, 44 (drift guards) |
| `tests/unit/canvas-render.test.tsx` | jsdom | 3 | AC-01, 12, 13, 38 |
| `tests/unit/canvas-gating.test.tsx` | jsdom | 8 | AC-02, 03, 04, 05, 15 |
| `tests/unit/machine-card.test.tsx` | jsdom | 18 | AC-16–24, 55, 62, 63 |
| `tests/unit/operator-rail.test.tsx` | jsdom | 10 | AC-11, 25, 26, 27, 28, 62 |
| `tests/unit/when-panel.test.tsx` | jsdom | 16 | AC-05, 10, 32–37 |
| `tests/unit/where-panel.test.tsx` | jsdom | 8 | AC-29, 30, 31 |
| `tests/unit/canvas-multi-item.test.tsx` | jsdom | 8 | AC-38, 39, 40, 41 |
| `tests/unit/ready-to-send.test.tsx` | jsdom | 14 | AC-42, 43, 44, 45, 47 |
| `tests/unit/canvas-provenance.test.tsx` | jsdom | 9 | AC-51, 52, 56, 57, 58, 59, 60, 61 |
| `tests/unit/canvas-history.test.tsx` | jsdom | 6 | AC-01, 06, 07, 08 |

### Harness

`tests/setup/canvas.tsx` mounts a component inside the real `LocaleProvider` / `SessionProvider` /
`RfqProvider` and reaches the canvas through the genuine actions — `process()` then
`enterWizard()`. Only the HTTP layer is stubbed (session, taxonomy, attachments, and the agent's
job POST + poll); the reducer, the `agentOrigin` snapshot and draft persistence are all real, so
provenance and the year/certificate gates are exercised against the state shape the app actually
produces rather than one assembled by hand.

`tests/setup/dom.ts` supplies what jsdom lacks (`matchMedia`, `scrollTo`) and stubs
`next/navigation`, whose `useRouter` throws outside a Next render.

### Not covered

- **The pixels.** These tests assert behaviour, structure and copy. Nothing here checks that the photo
  panel's overlays land where they should, that the RTL mirror looks right, or that the shake reads
  as a refusal. That is what UAT is for.
- **The live map.** `GoogleMapLocationPicker` is `next/dynamic` and renders as nothing under jsdom, so
  `WherePanel`'s tests cover the controls around it, not the map itself.
- **A real submit.** The guest gate is asserted up to the account modal; the POST itself is not fired.

## 10. Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| 1 | The prototype's per-item "carried from the previous item" highlight has no persistence rule. Should a carried value that the renter never touches keep its highlight through a draft save/resume, or settle to a normal value? | MREQ-AC-41 | product |
| 2 | `customAttachments` is submitted (`app-adapters.ts:244`) but no UI writes it, and the attachment control is explicitly predefined-only. Should the field be retired, or is a free-text path intended later? | none — dead but harmless | product |
| 3 | The prototype's "Open in Excel" sat beside the equipment table; the existing export produces CSV, not xlsx. Keep the CSV wording, or is a real spreadsheet format wanted? | MREQ-AC-45 wording only | product |
| 4 | Equipment certificates are now per-item only. `project.certificates.safetyOther` (the request-wide free-text cert) consequently has no editor. Retire it, or surface it somewhere on the review screen? | none — globalization still works | product |
| 5 | The app requires `startDate`; this spec keeps it optional on the web (MREQ-AC-10). Should the app be relaxed to match, or the web tightened later, so the two stop diverging? | none today | product |
| 6 | "We cover" is used for BOTH food and accommodation & transport (MREQ-AC-62). The three terms the owner specified — We collect / We return / We pay — each name a distinct act; food and accommodation have no equally natural verb. Confirm the wording or supply better. | MREQ-AC-62 wording only | product |
| 7 | Are equipment images actually populated against `equipment_taxonomy.image_key` today, and at which level (category, subtype, or both)? §7.1 is a two-line change only if the images already exist; otherwise it is also an admin upload exercise. | §7.1 | product / admin |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-25 | Spec created. |
| 2026-08-25 | Party choices renamed to name the obligation (We collect / We return / We pay / We cover); fuel label carries the fuel type. MREQ-AC-62/63. |
| 2026-08-25 | DOM test harness added (jsdom + Testing Library); 159 tests across 15 files, §9 rewritten to what exists. |
| 2026-08-25 | §7.1 added: `equipment_taxonomy.image_key` already exists and is already served by the bid-form handler; `getTaxonomy` just does not select it. |
