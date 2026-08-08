# 004 — Deal-room equipment verification (v3)

**Prefix:** `RM3-AC-*` / `RM3-TC-*` · **Layer:** web (`Web-App`) unless marked
**Self-contained.** Everything this surface depends on is stated here and anchored to code, not to
another spec.
**Source of truth for layout:** prototype `Deal Room Map.html` · element list
`docs/rentee-map-v3-elements.md`

---

## 1. Problem & outcome

A renter with a bid in hand can compare prices and nothing else. He cannot tell whether the offer is
backed by real machines, where they are, or whether they carry the papers he asked for.

**v2 answered "which offer?" — v3 answers "is this offer real?"**

The surface stops being a comparison tool and becomes a **verification tool**, scoped to one bid.

## 2. Who it's for

The **renter**, after choosing an item and a supplier's bid. He is not shopping any more; he is
deciding whether to trust what he already picked.

## 3. What changed from v2

| | v2 | v3 |
|---|---|---|
| Scope | all bids on an item | **one bid** |
| Entry | the map view of the bids surface | **clicking that bid's card** |
| Panel subject | competing offers | **this supplier's machines** |
| Request block, item strip | present | **removed** — the item is chosen upstream |
| Bid economics as a browsable list | present | **removed** |
| Edge rail | chat + equipment + docs | **removed** — replaced by a chat dock; documents are inline |
| Price bar | full-width footer | **bottom of the panel** |

Everything else — request-card contract, colour meaning, distance semantics, derived card state —
carries over unchanged.

## 4. Scope

### In

Panel header (supplier identity + company documents) · fleet/offer counts and the shortfall alert ·
the equipment list · equipment detail · equipment documents · the four requests · the map · the chat
dock · the price footer.

### Out

- Comparing bids, switching supplier, switching item — all upstream.
- Any change to negotiation, quotation or terms mechanics. The price footer **re-hosts** existing UI.
- Any change to the `rentee_request` wire contract (§7.3).
- Reinstating the retired `add_to_offer` kind.
- **Off-platform bids entirely.** They do not open this surface and nothing about them changes (§6.11).

**Removed from v2 by decision — do not reinstate:**

| Removed | Why |
|---|---|
| **Distance filter** (الكل / ≤٥٠ / ≤١٠٠ / ≤٢٠٠ كم) | it filtered *competing offers*. One supplier's fleet is small and already sorted nearest-first, so filtering only hides machines from a comparison the renter is no longer making |
| **Bid quality** — score, ring, percentage | quality ranks offers *against each other*. This surface verifies one offer, and a score here invites the supplier to farm the number instead of answering the request |
| **A reason on the unconfirmed chip** | «التوفّر غير مؤكّد» and the request are the whole message; the cause (`bid_pin` / `bid_yard` / `listing_yard`) is not the renter's problem to interpret |

### Assumptions

1. **The shipped app wins** where it and the prototype disagree; a prototype-only element is out of
   scope unless separately requested.
2. The view always resolves to exactly **one bid**, therefore one supplier and one item.
3. `DealRoom.bidId` is unique, so the room and the bid are interchangeable here.

## 5. Layout

```
┌──────────── panel (fixed width) ─────────────┬─────────── map (fills) ──────────┐
│ supplier name · ✓ شركة موثّقة · مستندات الشركة › │                                  │
│ ⟨٣ لدى المورد⟩ ⟨٥ في هذا العرض⟩                │      project pin · مشروعك        │
│ ▸ shortfall alert — اطلب إضافتها               │      machine markers             │
│ ─────────────────────────────────────────     │      availability label          │
│ equipment card · nearest first                │      distance chip · dotted route│
│ equipment card                                │                                  │
│ ─────────────────────────────────────────     │                                  │
│ اطلب من المورد إضافة … أخرى   (dashed)         │                       ⟨المحادثة⟩ │
│ price · عرض افتتاحي · التفاصيل                  │                                  │
└──────────────────────────────────────────────┴──────────────────────────────────┘
```

## 6. Web surface

### 6.1 Panel header and the company panel

**Header:** company name, a verified chip when verified, and an entry to company documents. Nothing
else — the header states identity, not a profile.

**The company panel** opens over the whole panel with its own dark header (company name + verified
chip + back). It is a **document list**, not a profile page:

- an **attention count** on the group heading — how many rows need something, never a total
- **select-all**, plus a checkbox on every row: documents are handled in **batches**, because a renter
  asking for papers asks for several at once
- each row: thumbnail with a status dot · name · a status line · **download**
- **company rows carry verification state and expiry** — verified, valid-until, renews-annually, or
  no-document-yet in red

Company documents include **CR, VAT certificate, national address and local content**.

**IBAN is excluded — product decision, 2026-08-08.** It is banking detail, not a paper a renter verifies a
lessor by, and this panel exists to answer *can I trust this counterparty's documents*. It stays in the
full company profile. An earlier draft of this section argued the opposite; that argument is withdrawn.

### 6.2 The counts — three cases, three sentences

Rendered as pills so each number is readable on its own; a run-on sentence made both invisible.

| Case | Condition | Renders |
|---|---|---|
| **single** | offered ≤ 1 | one pill — *«٣ رافعات شوكية ٣ طن لدى المورد»* |
| **multi** | offered > 1, nothing claimed | two pills — owned, and *«في هذا العرض»* |
| **short** | offered > 1 **and** claimed > 0 | the two pills **plus** the shortfall alert |

- The **type word agrees with the count** and comes from the request, so it reads in the renter's terms.
- **Owned ≠ offered.** A supplier with four and an offer of one is a different proposition from one
  with exactly one; both numbers are shown because the comparison is the point.

### 6.3 The shortfall alert — only when there is one

> **٢ وحدة في العرض بلا معدّة مسجّلة — لا تظهر على الخريطة**  ⟨اطلب إضافتها⟩

- Renders **only** when `claimed > 0`. When the offer is fully backed, nothing renders — a line that
  always appears stops being read, and its absence must reliably mean *nothing claimed*.
- **Orange, never red.** A shortfall is an incomplete offer, not an unavailable machine, and on this
  surface **red means availability only**. Reusing red would collapse two different problems.
- It states the consequence — *لا تظهر على الخريطة* — because a claimed unit has no location, no
  documents and no serial. This alert is the **only** place claimed units exist in the UI.
- The action sends **an `alternative` request with a null `equipmentId`** — there is no machine to
  name. `add_to_offer` is retired and rejected server-side (`RETIRED_REQUEST_KINDS`).

### 6.4 The equipment list

**Flat, nearest first, offered machines only.**

Machines the supplier owns but did not offer are **not a second list to scan** — they are one
request, made from §6.7.

Each card carries: **photo** · model · year · **availability chip** · **distance from your project** ·
**certificate chips** (TÜV, SPSP…) or *«لا شهادات على المعدّة»* · **التفاصيل ›**, plus
**اطلب التأكيد** when availability is unconfirmed.

**Not on the card:** serial number, load capacity. The serial identifies the machine to the system;
it does not help a renter recognise it.

**Availability and commitment are one chip, not two.** A confirmed machine that is in the offer reads
as a single statement — confirmed *and* in this offer. An earlier build put commitment on its own band
below, which made cards unequal in height and split one fact across two rows.

**The request action is blue**, not navy. Inside a row already carrying a red availability chip, navy
read as disabled — the one control the renter is supposed to press looked switched off.

**Landing pre-selection.** On arrival the offer's **confirmed** machine is already selected: its card
takes the selection accent and its map pin lifts with a halo and an "in the offer" tag. **No detail
opens** — the renter is oriented, not navigated. The card draws attention with a slow pulse of about
six rings over roughly nine seconds, then rests; its resting shadow is preserved throughout, so the
card does not appear to move.

### 6.5 Equipment detail

Opening the details replaces the panel with that machine:

1. a **full-bleed hero photo** with a back control — the machine is identified by sight first
2. **two tabs** — the machine, and its documents
3. one line under the tabs: availability chip · distance · yard
4. **the match grid — the main content.** Six cells scoring this machine against *this request*:
   year & manufacturer · attachments · equipment photos · proof of ownership · equipment certificate ·
   operator certificates. Each reads green (satisfied), grey (not required) or **red (missing)**, and
   each states the actual finding — "3 of 4 uploaded", "on the machine's file", "not on the file".

**The detail answers "does this machine fit my request", not "what is this machine".** A specification
dump would list attributes the renter must then judge himself; the grid does the judging and shows its
working. Anything that is merely descriptive belongs on the card, not here.

Selecting a machine focuses its map marker; selecting a marker focuses its card.

### 6.6 Documents

**Equipment documents** are the machine detail's second tab; **company documents** are the company
panel (§6.1). Both use the same grammar: select-all, a checkbox per row, a thumbnail with a status
dot, a name, a status line, and download.

**Equipment documents come in two groups**, each with its own attention count:

- **photos** — front, plate, meter, side
- **documents** — proof of ownership / registration, equipment safety certificate, operator safety
  certificate

**The two levels carry different status, and this is deliberate:**

| | Status shown |
|---|---|
| **Equipment** rows | **presence only** — uploaded / not uploaded / on the machine's file / no document yet |
| **Company** rows | **verification and expiry** — verified, valid-until, renews-annually |

A machine's paper is either there or it isn't; that is all the renter can act on, and a verification
badge here would invite him to judge a supplier on a state the platform sets. A company's paper has a
real lifecycle — it is checked, and it expires — so hiding that would strand him.

**Requesting is a batch action, not a per-row button.** The renter ticks what he wants and asks once;
one card carrying several types beats several cards carrying one each.

### 6.7 The four requests

| Request | Raised from |
|---|---|
| **اطلب تأكيد التوفّر** | the card, and the detail |
| **اطلب معدّة أخرى** | bottom of the list (dashed), and inside each detail |
| **اطلب مستنداً** | per document row — equipment and company |
| **اطلب إضافتها** | the shortfall alert (§6.3) |

Each is bound to one `equipmentId` (null for the shortfall ask) and posted as a `rentee_request` card.
**Card state is derived on every render** by re-reading the machine — never stored on the message.

### 6.8 Map

Project pin (*مشروعك*) · one marker per **offered** machine · an availability label on each
(*مؤكّد توفرها* / *لم يؤكد توفرها بعد*) · a distance chip · a dotted route back to the project.

**One colour scale: green = availability confirmed, red = not confirmed.** Distance colours nothing.
«لم يؤكد» means *unanswered*, never *rejected* — copy must not imply refusal.

**Colour comes from `unitAvailability(unit)` — never from the `yardConfirmed` boolean.**
`bid-map.ts:74` derives it from `locationSource`: `unit_yard` → confirmed; `bid_pin` / `bid_yard` /
`listing_yard` → unconfirmed; `unidentified` / `none` → absent, and an absent unit is **not drawn at
all**. The code says why in as many words: *"Never read the `yardConfirmed` boolean for colour"* —
supplier-side it is just `yardId != null`, so it is true for every readiness-written entry and carries
no information the precedence does not already give. It is reported verbatim where AC-10 requires and
rendered nowhere.

The same rule governs the **card's** availability chip (§6.4) — one derivation, both surfaces, or the
card and its pin can disagree.

### 6.9 Chat dock

A floating **المحادثة** control. The edge rail is gone; chat is the only persistent global action.
It carries the unread badge and the request cards composed above.

### 6.10 Price footer

Bottom of the panel: the rate, its source (*عرض افتتاحي*), **التفاصيل** expanding the breakdown, and
the existing negotiation entry point. **Re-hosted, not redesigned.**

### 6.11 Off-platform offers — out of scope, unchanged

**Decided 2026-08-07: an off-platform bid does not open this surface, and nothing about it changes.**

It keeps exactly the behaviour it has today: the renter opens `SharedBidSubmissionModal` to read the
submission, and `SharedBidNegotiateRoom` to message the supplier. Both already ship. This spec adds
nothing to them, removes nothing from them, and redesigns nothing.

**Why it cannot be this surface.** An off-platform submission has **items, not machines** — no
`equipmentId`, no serial, no yard, no coordinates. Every organising idea of §6.2–§6.8 (a machine, its
availability, its distance, its pin) has no referent, and the four requests of §6.7 bind to an id that
does not exist. Rendering this surface with all of it missing would describe the supplier as failing
checks he was never able to take.

**The only requirement this spec places on off-platform bids: route them away from here.**

Two facts recorded so a later change does not get them wrong:

- **Conversion is an ops action.** There is no renter-facing "request conversion" control today, and
  this spec does not add one. `city` exists because it *"feeds the account the admin creates on convert"*.
- **Moderation is not renter-facing.** `moderationStatus` / `reviewState` / `autoApprovesAt` exist only
  on the **admin** endpoint. `LinkBidSubmission` carries no moderation field. Do not surface review
  state to the renter unless the contract is extended first.

## 7. Data — all of it already exists

**No new endpoint, no new field, no migration.** Every value this surface renders is already served
and already typed. Anchors below are code, so they can be checked.

### 7.1 The fleet — one call

`GET /me/bids/{bidId}/fleet` → `src/app/api/me/bids/[id]/fleet/route.ts`, parsed by
`mapFleet()` in `src/lib/contract/fleet.ts` into `FleetMachine[]`.

`FleetMachine extends OfferedUnitDetail` (`src/lib/contract/bids.ts`), which carries everything the
cards, the detail and the map need:

| Element | Field |
|---|---|
| photo | `photoKeys` |
| model · year | `manufacturer` · `modelName` · `year` |
| type & size | `subcategoryName` / `subcategoryNameAr` · `measurementName` / `measurementNameAr` |
| distance | `distanceKm` |
| documents | `documentKeys` |
| yard | `yardName` · `yardCity` · `lat` / `lng` |
| offered or not | `inBid` — **defaults to false when absent**, so a missing flag can never promote a machine into an offer the supplier did not make |
| availability | `locationSource` → §7.2 |

**The fleet total (§2) is this response's row count.** No new field.

**Rows with no `equipmentId` are dropped** by `mapFleet` — the id is the pin identity, the selection key
and the de-collision key, so a row without one cannot be drawn safely.

### 7.2 Availability — the only derivation

`unitAvailability(unit)` in `src/lib/contract/bid-map.ts:74`, from `locationSource`:

| `locationSource` | Result | Drawn? |
|---|---|---|
| `unit_yard` | **confirmed** (green) | yes |
| `bid_pin` · `bid_yard` · `listing_yard` | **unconfirmed** (red) | yes |
| `unidentified` (a claimed count) · `none` (no resolvable location) | **absent** | **no** |

Only `unit_yard` is a per-unit commitment made *for this bid*. The other three are real coordinates
inferred from the bid as a whole or from where the machine was registered — precise, but with no
promise behind them.

**`yardConfirmed` is reported and never rendered.** Supplier-side it is derived from `yardId != null`,
so it is true for every readiness-written entry and carries no information the precedence does not.
Reading it for colour turns every pin green.

### 7.3 Requests — the existing card

`rentee-request.service.ts` (app-backend), unchanged by this spec:

- kinds `availability` · `document` · `alternative`; `add_to_offer` is in `RETIRED_REQUEST_KINDS` and
  rejected with a 400.
- `ref` is **minted by the backend** and never accepted from a client, so a card cannot be threaded onto
  another conversation's question.
- `serial` is **stamped from the resolved listing**, display-only — a client-supplied serial could name a
  different machine than the id.
- `equipmentId` is ownership-checked **before** the message exists: a foreign id leaves no trace in the
  channel, because Stream messages cannot be deleted.
- the supplier's reply carries `{inReplyTo, equipmentId, resolution}` where resolution is
  `provided` | `declined` | `unavailable`.

**Nothing is stored for a request beyond the Stream message** — no table, no status column. That is why
card state must be derived by re-reading the machine (§6.7).

## 8. Acceptance criteria

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-01 | web | **Given** the view opens **When** it renders **Then** it is scoped to exactly one bid — no offer list, no supplier switcher, no item strip |
| RM3-AC-02 | web | **Given** the header **When** it renders **Then** it shows company name, a verified chip only when verified, and a company-documents entry — and no contact info, deals count, IBAN, CR or VAT |
| RM3-AC-03 | web | **Given** an offer of one unit **When** the counts render **Then** only the owned-total pill renders |
| RM3-AC-04 | web | **Given** an offer of more than one unit with nothing claimed **When** the counts render **Then** both pills render and **no** shortfall alert appears |
| RM3-AC-05 | web | **Given** `claimed > 0` **When** the counts render **Then** the shortfall alert renders, stating the **difference** — not the offered total — and that those units do not appear on the map |
| RM3-AC-06 | web | **Given** the shortfall alert **When** it renders **Then** it is **orange, never red**, because red on this surface means availability only |
| RM3-AC-07 | web | **Given** the shortfall action **When** triggered **Then** it composes an `alternative` request with a **null** `equipmentId`; no surface emits `add_to_offer` |
| RM3-AC-08 | web | **Given** the counts **When** the type word renders **Then** it agrees in number and comes from the request's own type |
| RM3-AC-09 | web | **Given** the equipment list **When** it renders **Then** it is flat, sorted **nearest first**, and contains **only offered** machines |
| RM3-AC-10 | web | **Given** machines owned but not offered **When** the list renders **Then** they are **not listed**; they are reachable only as an «اطلب معدّة أخرى» request |
| RM3-AC-11 | web | **Given** a card **When** it renders **Then** it carries photo, model, year, availability chip, distance from the project, and certificate chips — or an explicit "no certificates" line |
| RM3-AC-12 | web | **Given** a card **When** it renders **Then** it shows **no serial number and no load capacity** |
| RM3-AC-13 | web | **Given** a card whose availability is unconfirmed **When** it renders **Then** it offers **اطلب التأكيد** directly, without opening the detail |
| RM3-AC-14 | web | **Given** التفاصيل **When** activated **Then** the panel shows that machine's full specification, its **actual documents**, and اطلب معدّة أخرى |
| RM3-AC-15 | web | **Given** a machine is focused **When** the map renders **Then** its marker is distinguished; **Given** a marker is activated **Then** its card is focused — the two stay in step |
| RM3-AC-16 | web | **Given** any document row **When** it renders **Then** it offers open, download and request — and **no verification status** on equipment documents |
| RM3-AC-17 | web | **Given** any of the four requests **When** composed **Then** it carries the machine as data (`equipmentId`), not only in prose, and is sent explicitly by the renter |
| RM3-AC-18 | web | **Given** a request card **When** its state renders **Then** it is derived by re-reading the machine, with nothing persisted on the message |
| RM3-AC-19 | web | **Given** a machine **When** its pin AND its card chip render **Then** both take their colour from `unitAvailability(unit)` (derived from `locationSource`) and **never** from the `yardConfirmed` boolean, so the two can never disagree |
| RM3-AC-20 | web | **Given** an unconfirmed machine **When** its copy renders **Then** it reads as *unanswered*, never as refused or unavailable |
| RM3-AC-21 | web | **Given** the map **When** it renders **Then** it shows the project pin, one marker per offered machine, a distance chip and a route back to the project |
| RM3-AC-22 | web | **Given** a unit whose availability is `absent` — a claimed count (`unidentified`) or a machine with no resolvable location (`none`) — **When** the map renders **Then** it is **not drawn**; an undrawable unit cannot carry a colour |
| RM3-AC-23 | web | **Given** the surface **When** it renders **Then** chat is reachable from a persistent dock, and there is no edge rail |
| RM3-AC-24 | web | **Given** the price footer **When** it renders **Then** every figure matches the existing deal-room bar for the same room, and the negotiation entry point is the existing flow |
| RM3-AC-25 | web | **Given** an off-platform offer **When** the renter opens it **Then** this surface is **not** used — the existing submission viewer and negotiate room open instead, unchanged |
| RM3-AC-26 | web | **Given** an offer whose supplier registered no machines **When** the list renders **Then** it states that a price and a count were given, with no empty card furniture |
| RM3-AC-27 | app-backend | **Given** the fleet read **When** it resolves a machine **Then** `locationSource` follows the §7.2 precedence, and `yardConfirmed` is reported verbatim from **this bid's** `unitsOffered` entry — reported, never rendered |
| RM3-AC-28 | web | **Given** the surface **When** it renders **Then** there is **no distance filter** — the fleet belongs to one supplier, so filtering it hides machines without helping a comparison the renter is no longer making |
| RM3-AC-29 | web | **Given** the surface **When** it renders **Then** there is **no bid-quality score, ring or percentage** anywhere; quality ranking belongs to surfaces that compare offers, and this one verifies a single offer |
| RM3-AC-30 | web | **Given** an unconfirmed machine **When** its chip renders **Then** it states only that availability is not confirmed — **no reason, no cause, no location-source explanation** — with the request as the next step |
| RM3-AC-31 | web | **Given** the counts **When** the shortfall is computed **Then** `claimed = offered − registered`, and it is never derived from the fleet total or any other count |
| RM3-AC-32 | web | **Given** a confirmed machine that is in the offer **When** its card renders **Then** availability and commitment are **one chip**, not a chip plus a separate band — so every card in the list has the same height |
| RM3-AC-33 | web | **Given** a card whose availability is unconfirmed **When** the request action renders **Then** it is **blue**, never navy — beside a red chip, navy reads as disabled |
| RM3-AC-34 | web | **Given** the surface loads **When** it first renders **Then** the offer's **confirmed** machine is already selected — card accent, pin lifted with halo and an in-offer tag — and **no detail opens** |
| RM3-AC-35 | web | **Given** that pre-selected card **When** it draws attention **Then** it pulses roughly six times over about nine seconds and then rests, preserving its resting shadow so the card never appears to shift |
| RM3-AC-36 | web | **Given** the equipment detail **When** it opens **Then** it shows a hero photo, two tabs (machine · documents), an availability/distance/yard line, and a **match grid against this request** — not a specification dump |
| RM3-AC-37 | web | **Given** the match grid **When** it renders **Then** each cell states its actual finding and reads green, grey (not required) or **red** when missing |
| RM3-AC-38 | web | **Given** either document surface **When** it renders **Then** it offers select-all, a checkbox per row, a thumbnail with a status dot, and per-row download — and requesting is a **batch** action over the ticked rows |
| RM3-AC-39 | web | **Given** equipment document rows **When** they render **Then** they show **presence only** — uploaded / not uploaded / on file / none yet — and **never** a verification badge |
| RM3-AC-40 | web | **Given** company document rows **When** they render **Then** they **do** show verification state and expiry, because a company paper is checked and does expire |
| RM3-AC-41 | web | **Given** the company panel **When** it renders **Then** it carries CR, VAT, national address and local content — **and no IBAN** — with an attention count that counts rows needing action, never a total |
| RM3-AC-42 | web | **Given** the equipment documents tab **When** it renders **Then** photos and documents are **two groups**, each with its own attention count |

## 9. Test plan

| ID | Covers | Layer | File | Assertion |
|---|---|---|---|---|
| RM3-TC-01 | AC-01, AC-02 | web | `tests/unit/bid-map.test.ts` | view model exposes one bid; header model omits contact/deals/IBAN/CR/VAT |
| RM3-TC-02 | AC-03, AC-04, AC-05 | web | same | the three count cases over fixtures: single → 1 pill; multi → 2 pills, no alert; short → alert with `offered − registered` |
| RM3-TC-03 | AC-06, AC-07 | web | same | alert style token is the attention accent, not the availability red; composer emits `alternative` + null id, never `add_to_offer` |
| RM3-TC-04 | AC-08 | web | same | type word pluralises with the count and derives from the request |
| RM3-TC-05 | AC-09, AC-10 | web | same | list is flat, ascending by km, and excludes `inBid:false` machines |
| RM3-TC-06 | AC-11, AC-12, AC-13 | web | same | card model fields exactly; no serial/load; confirm action present only when unconfirmed |
| RM3-TC-07 | AC-14, AC-15 | web | same | detail model carries specification + documents; focus round-trips card ↔ marker |
| RM3-TC-08 | AC-16 | web | same | every document row exposes three actions; equipment rows expose no status |
| RM3-TC-09 | AC-17, AC-18 | web | `tests/unit/deal-room-cards.test.ts` | payload carries `equipmentId`; state recomputed from a mutated machine with nothing read off the message |
| RM3-TC-10 | AC-19, AC-20, AC-21, AC-22 | web | `tests/unit/bid-map.test.ts` | one colour scale; unconfirmed copy contains no refusal wording; claimed units produce no marker |
| RM3-TC-11 | AC-23, AC-24 | web | manual | chat dock persistent, no rail; footer figures match the deal-room bar for the same room |
| RM3-TC-12 | AC-25, AC-26 | web | `tests/unit/link-bids.test.ts` | an off-platform bid never routes to this surface; a platform offer with no registered machines renders the explanatory state with no empty furniture |

| RM3-TC-13 | AC-27 | app-backend | `.../rentee-unit-location.test.ts` | `yardConfirmed` reads the bid entry, not the listing |
| RM3-TC-14 | AC-28, AC-29, AC-30 | web | `tests/unit/bid-map.test.ts` | the view model exposes no distance-band state, no quality figure, and the unconfirmed chip carries no reason/cause field |
| RM3-TC-15 | AC-31 | web | same | `claimed` is `offered − registered` across fixtures — including registered > offered, which must clamp to zero rather than render a negative shortfall |
| RM3-TC-16 | AC-32, AC-33 | web | same | the card model emits one availability chip carrying commitment, no second band; the request action's token is the blue one |
| RM3-TC-17 | AC-34, AC-35 | web | same | initial state selects the offer's confirmed machine with no detail open; the attention cue is finite (~6 cycles) and not a persistent loop |
| RM3-TC-18 | AC-36, AC-37 | web | same | detail model exposes hero photo, two tabs and six match cells; a missing requirement yields red and a not-required one yields grey |
| RM3-TC-19 | AC-38, AC-39, AC-40, AC-41, AC-42 | web | same | both surfaces expose select-all + per-row selection and a batch request; equipment rows carry presence only and no verification field; company rows carry verification + expiry and **exclude IBAN**; photos and documents are separate groups, each counting only rows needing action |

## 10. Open

All resolved. Kept as a record so a later change does not reopen them by accident.

| # | Question | Decision (2026-08-08) |
|---|---|---|
| 1 | What happens to off-platform bids on this surface? | **Nothing — they never reach it.** They keep `SharedBidSubmissionModal` + `SharedBidNegotiateRoom` exactly as they ship (§6.11). An earlier draft designed a replacement view; that is withdrawn. |
| 2 | Keep the distance filter? | **Removed** (AC-28). |
| 3 | Does the unconfirmed chip need a reason? | **No** (AC-30). Availability-not-confirmed plus the request is the whole message. |
| 4 | Is `claimed = offered − registered`? | **Yes** (AC-31). The prototype's figures were demo-forced via `offerCase` and are not the rule. |
| 5 | Bid quality on this surface? | **No** (AC-29). Quality ranks offers against each other; this surface verifies one. |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-08 | **Verified against the prototype — three sections were wrong and are rewritten.** The spec had been written from the element list after rendering only two states, so §6.1, §6.5 and §6.6 described intentions rather than the design. Rendering the remaining states found: the **equipment detail** is a hero photo, two tabs and a **six-cell match grid against this request** — not the specification dump specced; the **company panel** is a batch-selectable document list that **includes IBAN**, which the spec had wrongly moved to a profile; and documents are **batch-selected**, not three buttons per row, with a deliberate asymmetry the spec had flattened — **equipment rows carry presence only, company rows carry verification and expiry**. Four later design changes folded in (AC-32→35): availability and commitment as **one chip** so cards keep equal height; the request action **blue**, since navy read as disabled beside a red chip; **landing pre-selection** of the offer's confirmed machine with no detail opening; and a **finite ~6-cycle** attention pulse that preserves its resting shadow. Twelve ACs and four TCs added. Still unopened: the document modal, and the chat dock beyond its badge. |
| 2026-08-08 | **Made self-contained.** All references to spec 001 removed. §7 replaced a four-row "see 001 §7.12 / AC-232→234" table with the real contract read from code: the fleet route and `mapFleet` → `FleetMachine` with a field-by-field map of every card element; the full `locationSource` → availability ladder; and the request-card rules from `rentee-request.service.ts`. A spec anchored to code cannot drift with another document, and this one no longer depends on which branch's 001 the reader has. |
| 2026-08-08 | **Realigned against decisions and audited.** Five open questions closed: off-platform is **out of scope entirely** — an earlier draft designed a replacement submission view, now withdrawn, and its answer to question 1 was itself stale; the **distance filter** and **bid quality** are removed (AC-28, AC-29); the unconfirmed chip carries **no reason** (AC-30); `claimed = offered − registered` is normative and the prototype's demo-forced figures are not (AC-31). A "do not reinstate" table records why each removal happened. **One contradiction with shipped code fixed:** the spec implied `yardConfirmed` drives pin colour, but `bid-map.ts:74` states *"Never read the `yardConfirmed` boolean for colour"* — supplier-side it is only `yardId != null`, so it is true for every readiness-written entry. Colour comes from `unitAvailability()` via `locationSource`; had this shipped, every pin would have been green (AC-19, AC-22, AC-27). Also corrected an invented test path (`off-platform.test.ts` → `link-bids.test.ts`). Verified: every field the card promises exists on `FleetMachine`/`OfferedUnitDetail`, and the fleet endpoint is already wired in the web. |
| 2026-08-07 | Spec created from the v3 prototype and `rentee-map-v3-elements.md`. Records the shift from comparison to **verification**: one bid per view, entered from that bid's card, with the offers list, request block, item strip and edge rail all removed. Establishes the three count cases and the **orange-not-red** rule for the shortfall alert (red is reserved for availability). Fixes the equipment list as **flat, nearest-first, offered-only**, with not-offered machines reachable as a request rather than a second list. No backend change — the fleet total is the existing endpoint's row count. |
