# Deal Room Rentee Map — per-item supplier bid map

> ## ⛔ SUPERSEDED — 2026-08-09. Do not build from this document.
>
> **Replaced by [`004-deal-room-equipment-verification.md`](004-deal-room-equipment-verification.md)**
> (plus its addenda [`004a`](004a-addendum-chat-and-the-request-loop.md) and
> [`001a`](001a-equipment-panel-addendum.md)), which is **self-contained** and anchored to code.
> The disposition of every RMAP ticket against 004 is in
> [`../implementation-plans/deal-room-rentee-map/replan-v3.md`](../implementation-plans/deal-room-rentee-map/replan-v3.md);
> the live ticket set is [`tickets.md`](../implementation-plans/deal-room-rentee-map/tickets.md).
>
> This file is **kept, not deleted**, because it is the record of how the surface got here — v2 answered
> *"which offer?"*, v3 answers *"is this offer real?"*, and the arguments for the removals are only
> legible here. But it is **not a contract any more**, and two of its rules are actively wrong:
>
> | Still written as live here | The truth since |
> |---|---|
> | **`scope: 'company'` document requests** — the wire contract at `:1545-1555`, AC-117 at `:1850`, TC-77 at `:2069` | **Withdrawn.** *A document request names a machine.* The company panel is read/open/download only, with **no request control of any kind** (004 §6.1, 004a §8, AC-71/72). `RenteeRequestDraft`'s `document` arm cannot express it. `scope: 'company'` survives for **exactly one** ask — the shortfall's «اطلب إضافتها» |
> | **Distance as a bid sort**, and the surrounding distance rules at `:56, :209-210`, AC-24 at `:1751`, open question 5 at `:2135` | v3 has **no offers list to sort** — the equipment list is a plain nearest-first sort of one lessor's machines (004 §6.4). Separately, the *filter* those lines record as dropped was **reinstated 2026-08-08 by owner decision** (004 §6.4a, AC-28 rewritten, AC-28a→28e) |
>
> Acceptance IDs here (`RMAP-AC-*`) are **dead**. The only live prefix is `RM3-AC-*` in 004.

| | |
|---|---|
| **Key** | RMAP |
| **Status** | ~~Draft~~ → **Superseded by 004** (2026-08-09) |
| **Author** | yfa245 |
| **Created** | 2026-08-03 |
| **Layers** | web · app-backend |
| **Links** | Prototype: `Deal Room Rentee Map (standalone).html` (bundled React + Leaflet 1.9.4, RTL/ar) |

> Acceptance IDs in this document are namespaced `RMAP-AC-NN`. They are local to this
> spec and are **not** `moedatech-specs` acceptance IDs.

---

## 1. Problem & outcome

A renter comparing bids on a requested machine sees a list of cards. Location is compressed to a
single number — "12 كم" — with no way to see *where* the equipment actually sits, which offers
cluster near the site, or which are scattered across the province. Distance also silently
disappears (reads "—") when a supplier's location can't be resolved, and nothing tells the renter
that a distance is an *inference* rather than something the supplier confirmed for this deal.

**Outcome.** For each requested item, the renter sees every bid plotted on a live map against
their project site, banded by distance, with an explicit confirmed-vs-assumed signal on each
location, and opens that bid's existing deal room from any pin.

**Success signal.** The renter reaches a deal room from the map, and suppliers who confirm their
per-unit yards on the readiness card are visibly distinguished from those who haven't.

## 2. Who it's for

- **Primary:** the renter (rentee) choosing between bids on one requested item.
- **Secondary:** the supplier — confirming a unit's yard on the bid-readiness card now visibly
  strengthens how their offer reads, giving that surface a purpose it currently lacks on the
  renter's side.

## 3. Current state

Bids are already fetched and displayed per item. `GroupBids.tsx:161` calls `fetchBids(it.id)` once
per member request of the RFQ group and keys results by `requestId`; the item switcher exists.
Each bid card shows `distanceKm`, computed server-side (`rentee.service.ts:669-676`) and
recomputed defensively in `mapBid` (`bids.ts:617-621`) from `bid.equipmentLat/Lng` → `bid.yard` →
`bid.equipment.yard`, measured to `request.projectLat/Lng`.

There is no map. Raw coordinates are computed in `mapBid` and then discarded — only `distanceKm`
survives onto the `Bid` type. Per-unit yard confirmations exist in the database but never reach
the renter (see §7).

## 4. Scope

**In**
- Map canvas (Leaflet — `react-leaflet` is already a dependency) scoped to exactly one requested item.
- Map opens on the **project location only** — no supplier pins, no bid pins (§6.2).
- **Bid list is the entry point**: scrollable, cheapest-first, nearest as the only alternative sort (§6.2).
- Selecting a **supplier** reveals **that supplier's qualifying fleet** as one pin per registered machine,
  each individually selectable (§6.2).
- **Distance filter** over the list and map together, defaulting to "all" (§6.10).
- Confirmed-vs-unconfirmed availability, as one colour scale — green / red — on pin, chip and list (§6.9).
- Item strip for multi-item RFQs (switches which member request is in view).
- **Merged machine panel** — three tabs over one sticky identity header: availability & fit, equipment
  documents, company documents (§6.3).
- **Two equipment-scoped requests** — confirm availability, request a different machine — plus document
  requests raised from the document tabs, all delivered as structured chat cards (§6.7, §7.13).
- Chat available once a supplier is selected (§6.2), with arrival surfaces that work while the renter is
  on the map (§6.8).
- Bottom price bar — the **existing** deal-room bar re-hosted, unchanged except one label (§6.1).
- Off-platform submissions merged into the same list, never plotted, with their own panel, modal and
  read-only bar (§6.13).

**Explicitly NOT in scope — retired during the 2026-08-04 direction change, listed so they are not
re-derived from an old AC:**

| Retired | Replaced by |
|---|---|
| One pin per bid, expanding to per-unit pins | machine pins on supplier selection (§6.2) |
| Bid fan-out into per-unit pins, and location collapse | machines are drawn individually (§6.2). Note this is **not** the ~74px marker declutter of §6.2, which is live |
| Distance **rings** (30/120/220 km) and ring colour by band | colour means **availability**; distance is a filter (§6.10) |
| Rating sort | removed — cheapest-first and nearest only |
| **Live/push updates** | refetch on mount, focus and post-send (§7.5) |
| Unidentified units drawn as a hollow marker | **never drawn** — a count has no place on a map (§6.2) |
| `agreedUnitIds` on the quotation stepper | withdrawn — the quotation agrees *how many*, never *which* (§7.6) |
| A separate supplier panel owning company documents | company documents are the machine panel's third tab (§6.3.4) |
| `add_to_offer` as a request kind | `alternative` covers it (§6.7.1) |

**Out**
- Supplier pins on the map, and therefore supplier company coordinates. Removed by decision: the
  coordinates are not reliable enough to plot, so the requirement disappears rather than being met.
- Supplier-side rendering of the request card — specced only far enough to guarantee what the rentee
  side emits.
- Tracked request status (asked → answered). The loop closes observably instead; see open question 12.
- Nothing rail-related is deferred any more: all three buttons are specced (§6.2, §6.5, §6.6).
- The prototype's fit-gate actions (accept as-is / swap / request a matching unit) as *panel*
  actions. Selection moves to §6.4; "swap" and "request" collapse into prefilled chat messages.
- Per-unit **accept/reject**. The deal transacts at bid level; there is no per-unit verdict state and
  inventing one is a platform change, not a map feature.
- Blocking a supplier from offering more units than they have registered. Explicitly allowed by
  decision — the map surfaces the gap instead of preventing it.
- The prototype's pre-selection aggregate bar (`rBidsBar`: lowest / average / highest across bids,
  "افتح أفضل عرض"). Removed by decision — the footer shows nothing until a bid is selected.
- The prototype's *implementation* of the per-unit toggle (`grand / qty`). The toggle itself stays —
  it is shipped behaviour — but scaling the rate, per §6.1.
- Off-platform / `converted` bid locations — deferred by decision; they resolve to "no location".
- Cross-item supplier coverage ("this supplier covers 2 of your 3 items") — impossible on this
  surface (§4 assumption 2) and deliberately dropped; a separate feature if wanted.
- Per-unit **acceptance**. A machine is individually *selectable* — that is how its panel opens —
  but it is never independently acceptable or priceable: the offer is the unit of agreement.
- Any change to how `distanceKm` is computed on existing bid cards.

**Assumptions**

- **A0 — the shipped app is the source of truth; the prototype illustrates layout only.** Where the two
  disagree, the app wins. This applies most sharply to the **bottom price bar**, which the prototype
  reworked and then reverted: §6.1 is normative, the prototype's bar is to be ignored entirely.
1. `request.projectLat/Lng` is the site pin. When absent, machine pins still plot once a supplier is
   selected, but every distance reads "—" and the nearest sort is disabled (§5 degraded paths).
2. A bid belongs to exactly one `EquipmentRequest`, and the backend fans a multi-item RFQ into one
   request per item (`requests.ts:8-10`). Therefore **one bid covers exactly one item, always**.
3. `createBid` refuses a bid with no resolvable location, so a bid with no coordinates at all is
   rare — it arises mainly when a supplier deletes a yard after bidding (`bids.yard_id` is
   `ON DELETE SET NULL`, migration `20260311104221`).
4. A supplier's fleet is drawn from his **registered, qualifying machines**, not from `unitsOffered`
   — so a bid with an empty or legacy-numeric `unitsOffered` still yields pins, and its claimed
   count is shown in the composition bar (§6.3.2) rather than on the map.

## 5. Flows

**Happy path — single-item RFQ**
1. Renter opens the bids surface for a request and switches to the map view.
2. The map fits to the **project site alone**. No supplier or bid pins are drawn (§6.2).
3. The bid list is the entry point: cheapest-first by default, nearest as the only other sort,
   each row carrying price, distance, unit count and its off-platform tag where applicable.
4. Selecting a **supplier** draws that supplier's qualifying fleet — one pin per registered machine,
   coloured green (confirmed) or red (not confirmed), each individually selectable. The chat button
   appears at this point and not before.
5. Selecting a **machine** opens the merged panel (§6.3): availability & fit, equipment documents,
   company documents, over one sticky identity header. The equipment button appears at this point.
6. Equipment-scoped requests and document requests are composed here and sent as structured chat
   cards bound to that `equipmentId` (§6.7, §7.13).

**Multi-item RFQ**
1. An item strip renders above the map, one chip per member request of the RFQ group.
2. Selecting item *N* swaps the map and list to that item's bids. The map is never all-items.

**Freshness — no realtime mechanism (§7.5)**
1. The client refetches on mount, on window focus, and after it sends a request card.
2. A bid that arrived since the last fetch appears in the list on the next refetch, with the
   new-bid treatment of §6.11. It adds no pins — bids are not plotted.
3. There is no subscription, no poll and no socket. AC-190 states this as a requirement so it is
   not reintroduced as an "obvious" improvement.

**Degraded paths**
- No bids → site pin alone, empty state, no bid list.
- Bid with no resolvable location → listed normally, tagged "Location not shared", and sorted last
  under nearest.
- Request with no project coordinates → distances render "—", never 0, and the nearest sort is
  disabled rather than silently meaningless.

## 6. Web surface — implement in `Web-App`

### 6.1 Bottom price bar — OUT OF SCOPE, ignore the prototype's version

**Decided: this feature changes nothing about the bottom bar.** It re-hosts the deal room's existing
price/negotiation bar exactly as shipped — same layout, same hero rate, same per-unit toggle, same
breakdown popover, same accept/negotiate actions, same sheet styling.

**The prototype's bar is not a design input.** During prototyping it was reworked into a
"negotiation gap track" (two markers on a rail with the distance between them) and then **reverted** by
decision. Anyone reading the prototype should treat the bottom bar as illustrative filler and take the
live `DealRoom` bar as the truth. Do not port anything from it.

**The single exception**, which *is* in scope because it is a wording fix rather than a redesign:

| State | Current label | Required label |
|---|---|---|
| No counter-offer yet | `تفاوض` | **`اطلب سعراً أقل`** |
| Renter's offer is with the supplier | `عرضك المُرسل` | `عرضك لدى المؤجّر` |
| Supplier has replied, renter's turn | `راجع وردّ` | `راجع وردّ` (unchanged) |

Rationale: `تفاوض` is an abstract verb next to a number and does not tell a first-time renter that the
price is movable at all. Nothing else about the bar changes.

**Visibility rule (unchanged from the shipped app):** the bar appears only once a supplier is selected.
With no supplier selected there is no deal room and therefore no price to show.

**One carve-out.** Everything above concerns bids with a `DealRoom`. An **off-platform submission has no
deal room**, so it cannot use this bar at all — it gets a separate read-only variant specified in
**§6.13.9**. That is not a change to the bar described here; it is a different bar for a different object.

### 6.2 Map surface — project first, then supplier, then machine

Three states, entered in order. Nothing is shown before it can be shown honestly.

**State 1 — the project only.** The map opens with **just the project-location pin**. No supplier
pins. Supplier company coordinates are not reliable enough to plot, and a pin in roughly the wrong
place is worse than no pin: it invites distance judgements that are wrong. The bid list carries the
overview instead.

**State 2 — a supplier is selected.** From the list. That row becomes active, the others recede, and
**that supplier's qualifying machines appear on the map** — every machine of the requested type they
own, not only the units in the bid. No other supplier's machines are drawn.

**State 3 — a machine is selected.** It gains a selection indicator and the machine panel (§6.3)
opens, scoped to it.

#### The bid list — the actual entry point

Scrollable, full height beside the map, **sorted cheapest-rate first** by default, with **nearest** as
the only alternative sort (AC-24 — rating is retired). Each row carries the supplier, rate, distance,
and the offered-vs-registered split.
Selecting a row is what populates the map.

#### Machine pins

| Channel | Carries | Notes |
|---|---|---|
| **Fill colour** | availability | 🟢 yard confirmed in bid readiness · 🔴 not confirmed (drawn at the yard recorded when the machine was added to the fleet) |
| **Readiness bar** | documents present vs documents this request requires | thin segmented bar beneath the pin |
| **Image** | the request item's taxonomy image | falls back to category image, then a generic icon — never a broken image |
| **Outline** | in the offer vs owned-but-not-offered | filled = in the offer; hollow = the renter can ask for it |
| **Selection ring** | the currently selected machine | exactly one at a time |

Colour means **availability and nothing else**. Distance is text on the pin and a neutral tooltip
label; a legend that described colour as a distance band was removed, because a legend mislabelling
the only colour on screen is worse than no legend.

**Claimed units are never drawn.** `offered − machines the supplier owns` have no equipment record,
therefore no yard and no coordinates. They are a count, and a count has no place on a map. The
shortfall is stated in the supplier's info box and in the panel.

**Machines closer than ~74px on screen fan apart** with a leader line back to the true yard. Comparing
coordinates for equality is not enough — two machines in one yard are metres apart in the data and
still collide on screen.

**Chat unlocks with the supplier.** Before a supplier is selected there is no counterparty, so the
chat rail button is unavailable.

### 6.3 Machine panel — one panel per machine, and the only place that asks for anything

**Merged deliberately.** Eligibility, equipment verification and company verification were three
separate stops. The first two are properties of **one machine** — the machine the renter has just
selected — and the third is one tap away in practice, so all three live in **one panel, three tabs, over
a single sticky identity header.**

#### 6.3.1 Sticky identity header

Always visible, never scrolls away, present on all three tabs:

| Element | Content | Notes |
|---|---|---|
| Thumbnail | taxonomy glyph | placeholder for the listing's primary photo |
| Title | `{model} · {spec}` | e.g. `FD30 · رافعة شوكية ٣ طن` |
| Sub | `{serial} · {year}` | monospace, `dir="ltr"` inside the RTL panel |
| **Availability chip** | `● التوفّر مؤكّد` / `● التوفّر غير مؤكّد` | **filled and saturated** — solid green `#12904A` or solid red `#C62A2A`, white text, coloured shadow |

The chip is **not** tinted or outlined. It is the headline fact about the machine and it must read at a
glance from across the room. Its colour must equal the colour of that machine's own pin on the map
(§6.9.1) — a tinted amber chip above a red pin describing the same machine is the defect this replaces.

Why the header must be sticky: a request composed from the documents tab is bound to *this* machine
(§6.7). If the identity can scroll out of view, the renter can compose a request against a machine he is
no longer looking at.

#### 6.3.2 Offer composition — what the quoted count is actually made of

Shown directly under the header, **above** the machine chips, when the offer covers more than one unit
**or** any unit is unregistered:

```
قدّم المؤجّر عرض سعر لـ٣ وحدة
وهذا ما تتكوّن منه

[▓▓ 1 ▓▓][██ 1 ██][███ 1 ███]      ← proportional widths, count printed inside
 hatched   red      green

▓ ١ غير مسجّلة   ■ ١ غير مؤكّدة   ■ ١ جاهزة ومؤكّدة

١ من هذه الوحدات أضافها المؤجّر كعدد فقط — بلا رقم تسلسلي ولا مستندات ولا موقع.
لا تظهر على الخريطة ولا بين المعدّات أدناه، ولا يمكنك فحصها.
```

| Bucket | Source | Fill |
|---|---|---|
| **جاهزة ومؤكّدة** | registered machine, `yardConfirmed: true` | solid green `#12904A` |
| **غير مؤكّدة** | registered machine, `yardConfirmed: false` | solid red `#C62A2A` |
| **غير مسجّلة** | `unitsOffered.length` − registered machines | **diagonal hatch** `#5E7C93`/`#8AA6BC` |
| **من خارج المنصّة** | an off-platform submission's units (§6.13.5) | **amber hatch** `#8a4f08`/`#D4A056` — a different hatch, because it is evidence-without-listing rather than nothing |

Rules:

- **Empty buckets are omitted**, not rendered as zero. A zero segment is noise.
- **The unregistered bucket is hatched, not transparent.** An earlier draft drew it as an empty dashed
  outline, which made the single most important fact the least visible thing on the card. Hatching says
  *present but not the same kind of thing* — it is a hole in the offer, not a colour of it.
- **This section does not lead with confirmation.** Confirmation is read per machine from the header
  chip; what nothing else answers is how much of the quoted count is a real machine at all.
- **Counting:** one literal Arabic form for every count — `١ وحدة`, `٢ وحدة`, `٣ وحدة`. Decided by the
  product owner over grammatical pluralisation (`وحدتين`/`وحدات`). Implement as one helper so it is
  changed in one place if revisited.

#### 6.3.3 Machine navigation — name the machine, never an index

Chips below the composition bar, one per **registered** machine in the offer:

```
[ ● FD30T-118207  ٢٠٢٠ ]   [ ● FD30T-114522  ٢٠١٨ ]
```

- Serial (monospace, LTR) + build year + an availability dot (green/red). Yard in the `title`.
- **Never `وحدة ١` / `وحدة ٢`.** Nothing links a bid to a numbered unit of the request — that index was
  invented by the UI and implied a correspondence that does not exist. The renter is navigating the
  supplier's machines.
- Unregistered units get **no chip** — there is nothing to select. Their count lives in §6.3.2 only.
- Shown only when the supplier has more than one registered machine in the offer.

#### 6.3.4 The three tabs

| Tab | Content | Scoped to |
|---|---|---|
| **التوفّر والمطابقة** | photos, spec-match grid, the two requests | the selected machine |
| **مستندات المعدّة** | per-document list, checkbox multi-select | the selected machine |
| **مستندات الشركة** | per-document list, checkbox multi-select | the supplier |

Tab badges count **items needing attention**, never totals — a badge that always shows a number stops
being a signal. The availability tab counts an unconfirmed yard and a failed fit; the document tabs count
documents that are neither verified nor deferred by agreement.

#### 6.3.5 Availability & fit tab — order and content

1. **Photos card** (`صور المعدّة`) — the four mandatory slots, filled first, empty ones dashed. First
   because a renter recognises a machine by sight before he reads anything about it.
2. **Spec-match grid** (`ملخّص المطابقة مع طلبك`) — one cell per compared attribute, colour-coded.
3. **Two requests** (§6.3.6).

**Removed by decision, do not reinstate:**

- the red *«هذه الوحدة لا تطابق طلبك»* banner — the match grid already flags the failing row in red;
- the two-tile *«حالة هذه الوحدة»* card (readiness band + yard) — the header chip carries availability
  and the match grid measures readiness, so it restated both;
- a paragraph explainer of what the colour means — it became the header chip plus the colour key.

**The spec-match grid is scoped to the selected machine.** Build year and safety certificate come from
the **unit**, not from the request item's template. Consequences:

- the header and the grid cannot contradict each other (the defect: a 2020 unit under a header saying
  2020, above a grid row saying 2018);
- **the fit gate is genuinely per-machine** — selecting the 2018 machine raises it, selecting the 2020
  machine clears it, from the same request.

Attributes a listing does not hold per unit (fuel type, attachments) still fall back to the item template.

#### 6.3.6 The two requests — a list, not a fork

```
أرسل أيّهما شئت أو كليهما — كل طلب مستقل

[+] اطلب تأكيد التوفّر     ليؤكّد المؤجّر ساحة هذه المعدّة        ‹
[+] اطلب معدّة أخرى        لترى ما لديه من نفس النوع            ‹
```

- **Stacked full-width rows, never side by side.** Two buttons in a row read as *pick one*. These are
  independent requests and the renter may send both, so the lead-in says so and the list shape carries it.
- `اطلب تأكيد التوفّر` appears **only when the yard is unconfirmed**, and appears in **exactly one place**
  in the panel. An earlier draft had it on both an explainer and the actions row, which made the pair
  look like a different choice than it is.
- `اطلب معدّة أخرى` is **always** available.
- Requesting a **document** is *not* in this list. It lives in the document tabs, where the types are
  chosen (§6.7.2). Three separate routes to a document request existed at one point; there is now one.

#### 6.3.7 Edge case — an offer with NO registered machine

A supplier may quote a price and a count and register nothing behind it. The offer is still real: it has
a price, a company, and a chat. What it has no subject for is machine inspection.

**Required behaviour:**

- The **availability** and **equipment documents** tabs show one explicit empty state — *«لا توجد معدّة
  مسجّلة في هذا العرض»* — explaining that the supplier gave a price and a count only, and that company
  documents and the chat remain available.
- Neither tab renders its normal furniture. Specifically **no photo strip of empty slots and no
  spec-match grid built from the request template** — those describe a machine, and there is none. An
  earlier build produced exactly that: a headerless shell that looked broken rather than empty.
- The **company documents** tab is unaffected; those belong to the supplier.
- The **equipment rail button must still render**, even though no machine can be selected, or the renter
  cannot reach the company documents tab at all.
- The empty state offers one action: ask the supplier to attach registered machines to the offer
  (composed as an `alternative` request, scope `equipment`, with a null `equipmentId`).

#### 6.3.8 Document tabs — behaviour common to both

- One row per document: checkbox · type icon with a status badge · name · expiry-or-meta line · action.
- **Row action depends on availability:** `⤓` download when the document exists, **`+ طلب`** when it does
  not. A single missing document can therefore be requested without ticking anything first.
- `تحديد الكل` bar at the top and the request/download footer at the bottom are both **sticky**. A
  document list is as long as the supplier's paperwork, and the action must not depend on scrolling to
  the end of it.
- Selection state is keyed per tab **and per machine**, so switching machine or tab never carries a stale
  selection into a request.
- Ownership documents are listed and **openable** (§7.14) — no lock placeholder.

### 6.4 Supplier panel — company profile only

Opens from the supplier row in the bid list. Carries verification status, deal history and company
profile.

**Company documents are NOT here.** They moved into the machine panel's third tab (§6.3.4) by decision:
the renter is one tap from them while inspecting a machine, and splitting documents across two surfaces
meant he had to know in advance which kind he wanted. `fetchDealRoomDocuments.companyDocuments` is the
source either way.

**Identical across every bid that supplier makes**, so it is cached per supplier rather than refetched,
and it **never changes with machine selection** — which is exactly why its tab label says so
(*«تخصّ الشركة — لا تتغيّر بتغيير الوحدة»*).

### 6.5 Chat panel — one supplier, tabs per item

**The problem.** A supplier bidding on two items of the same RFQ produces two bids, therefore two
deal rooms (`DealRoom.bidId` is `@unique`), therefore **two separate Stream channels**. Today those
conversations are unrelated surfaces, and the renter may not realise both belong to the same
supplier. The renter thinks "I am talking to this company about my project"; the system thinks
"two unrelated rooms".

**The fix — grouping, not merging.** The chat panel is scoped to **one supplier within one RFQ
group**, with a tab per item that supplier has bid on. Each tab mounts that item's own deal-room
channel. Nothing about deal rooms, bids or channels changes — this is purely how they are presented.

```
Supplier: Al-Kharj Industrial                        [company docs →]
┌────────────┬──────────────┬─────────────┐
│ Excavator •│ Generator  ②  │ Compressor  │      ← one tab per item this supplier bid on
└────────────┴──────────────┴─────────────┘
   … that item's deal-room conversation …
```

- **The tab key is the BID, not the item.** `@@unique([requestId, bidOwnerKey, equipmentId])`
  (`schema.prisma:1260`) makes a bid unique per *equipment*, not per item — so one supplier may hold
  **two bids on the same item**, each with its own deal room and its own Stream channel. Keying tabs by
  item collapses them and leaves the second room unreachable. Key by `bidId`; label by item; where two
  tabs would carry the same item label, disambiguate with the machine (serial or model), because the
  rate alone changes as they negotiate.
- **Tabs appear only when the supplier has more than one bid in this RFQ group.** A single-bid
  supplier gets the conversation with no tab strip — no new chrome for the common case.
- **Per-tab unread badge**, so an unanswered message on the Generator is visible while reading the
  Excavator thread. This is the core of the problem being solved.
- **A tab whose bid has no deal room yet** (`dealRoomId === null`) still appears, and opening it runs
  the existing create-or-fetch path — the same behaviour as opening that bid from anywhere else.
- **Grouping key** is `supplierId`, falling back to `supplierName` — the rule `bidSuppliers()`
  (`bids.ts:801`) already uses. For company-shared bids, two members of one firm are the same
  counterparty, so group by company when `supplierCompanyId` is present.
- **The chat tab does not move the map.** Switching to the Generator tab changes the conversation
  only; the map and item strip stay where the renter put them. Chat is a cross-item view by design;
  the map deliberately is not (§4 assumption 2).

**No backend work.** `GroupBids.tsx:161` already fetches every item's bids across the RFQ group, and
each `BidCard` carries `supplierId`, `supplierName` and `dealRoomId`. Grouping is client-side over
data already in hand. Per-channel unread comes from the Stream client the deal room already uses;
`inbox.ts` shows the same `unreadCount` shape being consumed today.

**Scope note.** This is the first cross-item surface in the feature, and it is the *honest* form of
"this supplier covers several of your items" — separate bids, presented together, rather than the
prototype's fictional single bid spanning items (§4 Out). It partially answers open question 4.

### 6.6 Per-machine indicators — availability and readiness

Every unit carries **two independent signals**. They answer different questions and must not be
merged into one colour, because a unit can be fully documented yet have no confirmed yard, or sit in
a confirmed yard with no paperwork at all.

> **Where they surface, as of the 2026-08-05 revision.** These two signals are *data*, not a layout.
> **Availability** surfaces as the header chip (§6.3.1), the pin colour (§6.9.1), the machine chips
> (§6.3.3) and the composition bar's solid segments (§6.3.2). **Readiness** surfaces as the per-pin
> readiness bar on the map and inside the spec-match grid. The two-tile *«حالة هذه الوحدة»* card that
> used to render both in the panel was **removed** — it restated what the chip and the grid already said.
> Nothing about the underlying signals changed; do not re-add the tiles.

| | Question | Source | States |
|---|---|---|---|
| **Readiness** | does this machine hold what the request asks for? | `computeBidReadiness()` — **already exists**, renter-side, client-side | `green` 100% · `yellow` ≥50% · `red` <50% |
| **Yard** | did the supplier confirm where this machine actually is? | `yardConfirmed` on the unit (§7.2) | confirmed · not confirmed |

**Readiness needs no new work.** `src/lib/contract/bid-readiness.ts` is already the rentee-subset
port: per unit it scores mandatory photos plus each *requested* equipment/operator certificate, and
emits `done` / `total` / `percent` / `band` via `bandOf()` (`:67`). Proof-of-ownership is
deliberately excluded from scoring, since the backend strips it from the renter's payload — scoring
it would hold every supplier permanently short. It is already consumed by `GroupBids.tsx` and
`BidComparisonWorkspace.tsx`, so the map inherits it by being inside `GroupBids`.

Rules:

- Both indicators render **per unit**, and **for a single-unit bid as well** — a lone machine still
  shows its readiness band and yard state. There is no "only when multi-unit" condition.
- On the map, the pin ring already encodes **yard confirmation** (§6.3). Readiness rides as a small
  second mark on the pin, so the two never compete for one colour.
- **Unidentified units get neither.** No machine means no documents to score and no yard to confirm;
  they are **not drawn at all** (§6.2). A red readiness badge would wrongly imply a machine
  exists and is failing.
- **Off-platform bids get neither.** `computeBidReadiness` returns null without `offeredUnitsDetail`
  (native bids only) — render the absence, not a red state.
- A `yellow`/`red` readiness band is **not** a conflict. It means documents are missing, not that the
  machine violates the request. Year mismatches and declared-but-unevidenced certificates stay
  separate signals (§6.2).

- **Store** — none. Map state (selected bid, expanded bid, sort key, view mode) is local to
  `GroupBids`.
- **i18n** — `src/lib/i18n/en.ts` + `ar.ts`:

  | Key | EN | AR |
  |---|---|---|
  | `bidMap.view` | Map | خريطة |
  | `bidMap.listView` | List | قائمة |
  | `bidMap.yourSite` | Your site | موقعك |
  | `bidMap.confirmed` | Confirmed by supplier | مؤكّد من المؤجّر |
  | `bidMap.assumed` | Not confirmed | غير مؤكّد |
  | `bidMap.noLocation` | Location not shared | لم يُشارك الموقع |
  | `bidMap.unitOf` | Unit {i} of {n} | وحدة {i} من {n} |
  | `bidMap.multiLocation` | {n} locations | {n} مواقع |
  | `bidMap.unitsConfirmed` | {c} confirmed · {a} not confirmed | {c} مؤكّدة · {a} غير مؤكّدة |
  | `bidMap.noBids` | No bids on this item yet | لا توجد عروض على هذا البند بعد |
  | `bidMap.noSiteLocation` | This request has no project location | لا يوجد موقع مشروع لهذا الطلب |
- **RTL notes** — shell inherits `dir` from the locale. The side panel sits on the inline-end edge
  (`insetInlineEnd`), not a hardcoded `right`. Leaflet renders its own LTR canvas — pin *content*
  must set `direction:rtl` explicitly, as the prototype does. Rate and distance numerals follow the
  existing app convention (Western digits, per `RequestsList`).

### 6.7 Request composition — web side of the machine binding

Every request the renter can send, where it is composed, and what it carries.

#### 6.7.1 The four request kinds

| Kind | Composed from | Scope | Carries |
|---|---|---|---|
| `availability` | availability tab, only when unconfirmed | equipment | `equipmentId` |
| `alternative` | availability tab, always | equipment | `equipmentId` (as context, not as a rejection) |
| `document` | either document tab | equipment **or** company | `equipmentId` + `docTypes[]` |
| ~~`add_to_offer`~~ | **RETIRED** — see below | — | — |

> **`add_to_offer` is retired.** It was defined as "ask for a machine he owns but did not offer", but
> **no surface ever composed one** — the action row that produced it was removed when the requests were
> consolidated, leaving a kind that could be rendered and resolved but never created. `alternative`
> already asks the same question in a better form ("what else do you have of this type, across everything
> you have registered"), so the kind is retired rather than given a second route to one intent.
> Implementations must not accept it.

#### 6.7.2 Document requests — two routes, one payload

**Per row.** A document that does not exist shows `+ طلب` inline. One tap composes a card naming that
one type. No ticking required.

**Multi-select.** Tick N documents → `+ طلب عبر المحادثة` → **one** card carrying all N in `docTypes`.
Never N cards: that floods the channel and produces N notifications for one intent.

**Asking for something already on file is interrupted once.** If any ticked document is `ok` or
`checking`, the send is held and the renter is shown:

```
١ من المستندات المحدَّدة متوفّرة بالفعل
تأمين المعدّة
يمكنك تنزيلها الآن دون طلب. أطلبها من المؤجّر فقط إذا أردت نسخة محدَّثة.

[ اطلب الناقص فقط (٢) ]   [ اطلب الكل ]   إلغاء
```

- **`اطلب الناقص فقط`** drops the already-provided types from `docTypes` entirely.
- **`اطلب الكل`** sends everything, for the legitimate case of wanting a fresher copy.
- If **every** ticked document is already provided, `اطلب الناقص فقط` is not offered and choosing
  `اطلب الكل` is the only way through — the renter is told the selection is already available.
- The confirmation is **sticky at the bottom** and the normal footer **stands down** while it is open.
  Two send buttons for one send is worse than one in the right place.

Rationale: silently asking a supplier for a document he already uploaded wastes his time and makes the
renter look like he did not look. One interruption, with the choice stated, is the right cost.

#### 6.7.3 "Another machine" asks by TYPE, never as a swap

```
هل لديك رافعة شوكية ٣ طن أخرى مسجّلة لديك؟
أرسل لنا خياراتك المتاحة المطابقة لمواصفات الطلب.
```

The earlier wording — *«هل لديك وحدة أخرى بدل FD30T-114522؟»* — reads as **rejecting that machine**.
What the renter means is *what else do you have of this type*, across everything he has registered.

Normative: the composed text **must not contain the serial** and **must not contain `بدل`**; it **must**
name the equipment type. The card still carries `equipmentId` so the supplier knows which machine the
renter was looking at when he asked — the binding is in the data, the framing is in the text.

#### 6.7.4 Binding rules the web must hold to

- **The composed card is shown before it is sent**, rendered by the *same* component that renders the
  sent message. What the renter reviews is byte-for-byte what the supplier receives.
- **The card resolves its machine from `equipmentId`.** Image, name and serial are looked up at render
  time, never copied into the message body — so the card cannot display a machine other than the one it
  references, and a renamed listing updates everywhere.
- **The status line is derived per render** (§7.13.4). The web stores nothing about whether a request was
  answered.
- **Company-scope cards render under the supplier's identity**, not a machine's, and carry a null
  `equipmentId`.
- **A `ref` is displayed on every card** (`RQ-7F3A`) so either party can quote it in free text.

#### 6.7.5 Downloading more than one document — the renter picks the shape

**Decided 2026-08-05: ask, do not assume.** Selecting several documents and pressing download prompts:

```
كيف تريد تنزيل ٣ مستندات؟
[ ملفات منفصلة ]   [ ملف PDF واحد ]   إلغاء
```

- **One document → no prompt.** It downloads directly; a choice with one option is friction.
- The prompt is **sticky at the bottom of the panel**, like the already-provided confirmation (§6.7.2), and
  the normal footer stands down while it is open.
- Rows that carry no file are excluded from the count before the prompt appears, so the number offered is
  the number that will actually download.

**Implementation note.** *«ملف PDF واحد»* needs either a client-side PDF library (not a dependency today)
or a backend merge endpoint, and the set is **mixed** — a certificate may be a PDF while equipment photos
are JPEGs, which have to be rendered onto pages rather than concatenated. Choosing this option is the point
at which that cost is paid; the separate-files path needs nothing new. If the merge is deferred, the option
must be **hidden**, not shown and broken.

### 6.8 Being told something arrived, without leaving the map

The renter spends this view on the **map and the bid list**, not inside a conversation. Anything that
arrives has to reach him there.

#### 6.8.1 Four surfaces, deliberately different in weight

| Surface | Shows | Lifetime | Why this weight |
|---|---|---|---|
| **The map itself** | the machine's pin recolours, the composition bar recounts | permanent | The answer, not an announcement. Needs no reading and no interaction. |
| **Conversation bubble on the chat icon** | supplier, message, `↩ ref · serial`, *open the chat* | until read or dismissed | The primary notice. Lives where the conversation lives, with a tail pointing at the button that opens it. |
| **Unread count on the chat icon** | numeric badge | until read | Survives a dismissed bubble. The only surface still there a minute later. |
| **Transient popup (bottom-start)** | same content, plus a bid variant | ~7s | Covers the case where a side panel is open and the rail is faded out. |

#### 6.8.2 The bubble

```
                        رسالة جديدة  [+١]  ✕  ╮
                  الدرعية للمقاولات             ├──▶  💬 ②
       المعدّة جاهزة، وأستطيع تقديم المشغّل…      │
                  [ افتح المحادثة ‹ ]           ╯
```

- **Filled, not tinted.** Solid `#1D4ED8` (or `#B26206` for a refusal), white text, 2px white border, a
  coloured glow ring, and it pulses three times on arrival then settles. It competes with a full-screen
  map for attention; an outlined card lost that fight.
- Fires on **any** supplier arrival — a reply to a request *and* an ordinary chat message.
- Shows `↩ RQ-… · SERIAL` when it answers a specific request, so the renter knows *which* request was
  answered without opening anything.
- **`+N` chip** when more than one is waiting.
- **Amber for a refusal, blue otherwise.** A "no" that looks like a "yes" for the half-second before it
  is read is worse than no notice at all.
- **`✕` hides it, but a NEW arrival brings it back.** Dismissing one message must never silence the next.
- Clicking opens that supplier's room, **selecting that supplier first if he is not the current one.**

#### 6.8.3 The chat icon must survive deselection

**Normative:** the chat rail button renders when a supplier is selected **or when any conversation
arrival is pending.** With no supplier selected it shows the pending count and opens the room the arrival
came from.

This is not a nicety. An earlier design scoped every notice to the *selected* supplier, so stepping back
to the offer list made a waiting reply invisible — the same failure that killed a header-strip alert
attempt before it. A pending conversation is itself a reason for the button to exist.

#### 6.8.4 Rules

- The bubble and popup appear **only when the chat panel is not the visible panel.** If the renter is
  already reading the conversation, announcing it is noise.
- Opening a supplier's chat **clears his unread count, dismisses the notice, and marks his arrivals read
  — and only his.** Another supplier's stay pending.
- **New bids do not use the bubble.** They use the popup with `اعرضه في القائمة`, because there is no
  conversation to open (§6.11).
- **Derived answers still fire a notice.** When the supplier confirms a yard he never touches the request,
  so if the notice depended on a reply message existing, the most common answer in the system would be
  silent. It is triggered by the **state change**, not by the message.

#### 6.8.5 Known limitation, recorded deliberately

The bubble hangs off the rail, and the rail fades out when a side panel is open. So a message arriving
while the renter reads the equipment panel produces the **popup** only, not the bubble. Putting the bubble
over an open drawer would collide with it. Accepted; revisit if the popup proves too easy to miss.

### 6.9 Making the colours mean something

Colour is the primary signal on this map, so the renter must be able to learn it without guessing.

#### 6.9.1 ONE scale — every pin is a machine

| Colour | Meaning |
|---|---|
| **Green** | this machine's yard is confirmed in the bid readiness card |
| **Red** | this machine is registered, its location is known, the supplier has not confirmed it |

That is the whole vocabulary. It applies identically to the map pin, the machine chip in the panel, the
header availability chip, and the composition bar's solid segments.

**Two earlier mistakes, both now corrected:**

1. **Two scales.** A supplier-level aggregate (green all / grey some / red none) was documented alongside
   the machine scale. It described **dots that no longer exist** — the map stopped plotting suppliers when
   this feature moved to project-location-only, so the aggregate explained nothing on screen.
2. **Red vs amber for the same idea.** The pre-selection legend taught green/**red**/grey while the
   post-selection legend used green/**amber** for "not confirmed", so a renter learned red and then met
   amber. `unitIcon` was already drawing unconfirmed machines **red**, so amber was the outlier and the
   key was describing pins that did not exist either.

The unregistered bucket in §6.3.2 is a **hatch**, not a third colour — it is not a state of a machine,
it is the absence of one.

#### 6.9.2 The key must be impossible to miss and impossible to cover

The colour key lives **inside the bid-list panel**, collapsed behind `؟ ما معنى الألوان؟`.

**Not floating on the map.** A floating overlay positioned with `insetInlineEnd` at a low z-index renders
*behind* the bid panel in RTL — which hid the machine key in the one state where machine pins exist.
Panel-hosted, it cannot be occluded, it is present in every state of the view, and it sits next to the
counts it explains.

Collapsed by default: a renter who already knows the scale should not pay for it in vertical space on
every visit.

#### 6.9.3 The key must state that red is not a refusal

```
كل دبّوس على الخريطة = معدّة واحدة
● ✓  مؤكّدة       أكّد المؤجّر ساحتها في جاهزية العرض
● ؟  غير مؤكّدة   لم يؤكّدها بعد

«غير مؤكّدة» لا تعني غير متوفّرة — تعني أن المؤجّر لم يحدّد ساحتها في جاهزية
العرض بعد. اطلب التأكيد من لوحة المعدّة.

الوحدات المضافة كعدد فقط لا تظهر على الخريطة — لا توجد معدّة مسجّلة لها.
```

That first clause is the one that matters and **must not be dropped**. Red is a strong signal and without
it an unconfirmed machine reads as *rejected* — the renter discards a supplier who never declined
anything.

#### 6.9.4 Accepted: `yardConfirmed` is presented as availability

**Decided 2026-08-05: no change.** The platform has no availability state. `yardConfirmed` means *"the
supplier confirmed where this machine is"*, and the UI presents that as availability — green chip
`التوفّر مؤكّد`, red `التوفّر غير مؤكّد`, and the confirmed/unconfirmed split in the composition bar.

**What is being accepted, stated plainly so it is not discovered later as a bug:** a supplier can confirm
a yard for a machine that is fully booked for the requested dates, and this UI will show it green. Green
therefore means *"he told us where it is"*, not *"it is free on your dates"*.

**Why that is tolerable here:** the renter's next step is always a conversation or a quotation, both of
which establish dates explicitly. Nothing in this view commits anyone to anything, so an optimistic signal
costs a message rather than a booking.

**If it ever needs fixing**, the shape is a real availability declaration per unit (available-from /
available-until on the readiness card) — new backend state and new supplier UI, i.e. its own feature.
Wording would then split into two signals rather than one.

### 6.10 ~~Distance filter~~ — **WITHDRAWN 2026-08-06 by product decision**

**Do not build a distance filter.** The band selector, its default, the list-and-map scoping, the
"N of M offers" count and the off-platform exemption are all removed, along with AC-225→228, AC-204,
TC-125, TC-117 and the `bidMap.distAll`/`dist50`/`dist100`/`dist200`/`distCount` keys.

**Why it was dropped, recorded so it is not reintroduced as an "obvious" improvement:** the filter
measured a **bid's** `distanceKm`, but the map draws a supplier's **machines**. A bid whose yard is
185 km away can belong to a supplier owning a qualifying machine 12 km from the site, so a `≤ 100 km`
band would have hidden exactly the machine the renter wanted. Measuring per machine instead would have
required loading every bid's fleet up front, which the lazy per-selection fetch deliberately avoids.

**What stays:** distance as **text** on rows and pins, and the **nearest** sort (AC-24), measured on the
bid's `distanceKm`.

### 6.11 A bid arriving while the renter is watching

Live bid arrival is a first-class event: it is the one thing in this view that changes the answer to
*"who should I rent from"*.

#### 6.11.1 What must happen when the data arrives — on load, focus, or after a send

There is **no push** (§7.5 withdrawn). "Arrival" means *the refetch returned a bid that was not there
before* — so all of this happens on one of §7.5.1's three triggers, not within a second of the supplier
acting. No copy may imply otherwise.

| Surface | Behaviour |
|---|---|
| Bid list | the row appears and the list **re-sorts itself** into the active order |
| List header | the count increments |
| Top bar | the on-map offer count increments |
| Map | the new supplier's machine pins join |
| The row | a **`وصل الآن`** badge marks it for ~9s |
| Notice | the transient popup fires, with `اعرضه في القائمة` |

**The re-sort is normative.** If a new cheaper bid merely appended to the bottom of a cheapest-first
list, the sort would be decorative and the renter would mis-read the ordering.

**The just-arrived marker is relative to the last view, not to wall-clock time.** With no push, a bid may
be hours old by the time the renter sees it; marking it "just arrived" is still correct — it is new *to
him* — but the copy must not claim recency.

#### 6.11.2 Clicking the notice reveals the row — it does not open a room

- sort to a known order, **scroll the row into view** (centred, smooth),
- **pulse it** (~2.4s: a box-shadow ring plus a coloured border), then stop,
- dismiss the popup.

It deliberately does **not** select the supplier and does **not** open any panel. The notice said an offer
arrived; the answer is *here it is*.

#### 6.11.3 The notice must not claim more than it knows

The comparison against existing offers is **computed**, never asserted. An early version's copy read
*«أقل من كل العروض الحالية»* while a cheaper offer was visibly sitting in the list beside it. Required
form: state the rate, then either `— أقل سعر في العروض` or `— أعلى من أقل سعر بـ N ر.س`, derived from the
other offers' rates at send time.

### 6.12 Two coverage numbers, deliberately not reconciled

The request-level **fulfilment bar** and this feature's **machine counts** measure different things, and
both stay as they are (decided 2026-08-05).

| Surface | Counts | Answers |
|---|---|---|
| Fulfilment bar | `Σ bid.unitsOffered.length` across bids — **claimed** units | *how much of my request have suppliers offered to cover?* |
| Map + composition bar (§6.3.2) | **registered machines** per supplier | *how much of it can I actually inspect?* |

They will differ on the same request whenever a supplier quotes a count above the machines he registered.
**That difference is information, not an error** — it is precisely the gap the composition bar exists to
expose. Reconciling them would delete the signal.

**No relabel is required.** The bar is commercial coverage; the machine counts are verifiable substance.
A reader who assumes they must agree is reading the bar as an inspection guarantee, which it never was.

### 6.13 Off-platform submissions — shown in full, with no map presence

> ## ⚠️ MUCH OF THIS ALREADY EXISTS — read this before estimating
>
> A code audit on 2026-08-05 found substantial parts of this section already implemented. Earlier
> revisions specced them as new work. **Extend these, do not rebuild them.**
>
> | Already in `Web-App` | Lines | What it does |
> |---|---|---|
> | `src/components/requests/SharedBidSubmissionModal.tsx` | 538 | the submission viewer |
> | `src/components/requests/SharedLinkBidCard.tsx` | 293 | the off-platform bid card, incl. its two footer actions |
> | `src/components/requests/BidEquipmentModal.tsx` | 222 | Equipment → التفاصيل |
> | `src/components/requests/BidTermsModal.tsx` | — | Terms → عرض |
> | `src/lib/contract/bid-quality.ts` | 124 | the 40/30/30 quality score (§6.13.11) |
> | `src/lib/contract/vat-inclusive.ts` | 42 | the VAT-inclusive toggle (§6.13.2) |
> | `src/lib/contract/link-bids.ts` | — | the submission contract + mappers |
> | `src/components/bid/QualityRing.tsx` | — | the donut + badge |
> | `tests/unit/vat-inclusive.test.ts`, `link-bids.test.ts` | — | passing |
>
> **What is genuinely new** in this section: hosting these on the **map/compare surface** (rail buttons,
> read-only bottom bar with the التفاصيل breakdown, the composition state, the em-dash rule for the map
> context), plus the two agents `SELECT` additions (§6.13.1).



An off-platform bid is a `link_bid_submissions` row: a supplier filled the request's public form without
an account. It is **not a `Bid`**, has **no `EquipmentListing`**, and is served by a **different
endpoint** (`getRequestSubmissions`) from the bid list. A converted submission disappears from that list
and becomes an ordinary bid (`converted_at IS NULL` is in the read predicate), so everything below concerns
**unconverted, moderation-approved** submissions only.

#### 6.13.1 What exists — verified field inventory

**Reaches the renter today** (`getRequestSubmissions.ts:175-207`; the mapper spreads `...it`, so per-item
attachments pass through):

| Level | Fields |
|---|---|
| Submission | `id` `requestId` `quotationRef` `rfqRef` `groupRef` `companyName` `crNumber` `vatNumber` `nationalAddress` `contactInfo` `notes` `validUntil` `grandTotal` `createdAt` |
| Per item | `requestItemId` `confirmations{}` `offeredUnits` `numberOfUnits` `rentalRate` `deliveryPrice` `returnPrice` `total` **`photos[]`** **`documents[]`** `priceUnit` `label` `requiredTerms` |

**Mind which twin you read.** There are **two** `getRequestSubmissions` handlers and their `SELECT`s
differ. The **web** calls the agents one (`/api/me/requests/:id/submissions` → `agentsGet` →
`/agents/requests/{id}/bid-submissions`); `apps/backend` serves **mobile**.

| Column | agents (web) | `apps/backend` (mobile) |
|---|---|---|
| `company_documents` | ✅ already selected | ❌ |
| `rentee_messages` | ✅ already selected | ❌ |
| `contact_info` | ❌ **missing** | ✅ |
| `city` | ❌ **missing** | ❌ |

**So the web needs two additions to the AGENTS handler: `city` and `contact_info`.** An earlier revision
of this document said `city` and `company_documents` — that was read off the mobile twin and was wrong.
`company_documents` already arrives.

`city` is mapped by the web contract today (`src/lib/contract/link-bids.ts:241`) but the agents `SELECT`
never returns it, so **that field is always null in production right now.**

**Does not exist at any level:** `equipmentId` · `yardId` · coordinates · `serialNumber` ·
`manufacturer` · `modelName` · `year` · `yardConfirmed`.

#### 6.13.2 VAT — the inclusive/exclusive signal EXISTS, and is already implemented

**Corrected 2026-08-05.** An earlier revision of this section stated that no inclusive/exclusive flag
exists and that the VAT label is therefore deterministic. **That was wrong.** The mechanism exists, is
implemented, and is tested.

##### How it works — `src/lib/contract/vat-inclusive.ts` (42 lines)

Some suppliers quote VAT-inclusive. The public bid form has a **toggle**. Rather than adding a column, the
implementation:

1. **Stores every submission VAT-EXCLUSIVE.** On submit, `grossToNet()` strips the 15% back out of what the
   supplier typed, so a stored submission is identical in shape to an on-platform bid and the renter side —
   which always adds 15% — lands on the same total the supplier intended.
2. **Carries the fact as a tagged line in `notes`** — `[VAT-INCLUSIVE]` — the one field that round-trips to
   the renter without a new column or endpoint.
3. **The renter side detects and strips it**: `hasVatInclusiveNote(notes)` → show the note;
   `stripVatInclusiveNote(notes)` → the notes as the supplier meant them.

Already consumed by `SharedBidSubmissionModal.tsx:209` (detect) and `:451` (display). Covered by
`tests/unit/vat-inclusive.test.ts` — 11 passing tests that chain supplier submit → storage → renter view
and assert the renter's grand total lands on exactly what the supplier typed.

##### Requirements for this feature

- **Read the signal, do not assume.** `hasVatInclusiveNote(submission.notes)` tells you whether the
  supplier quoted inclusive. Note it in the bar when true — this is the behaviour the product owner asked
  for and it is available.
- **Never display raw `notes`.** Always `stripVatInclusiveNote()` first, or the renter sees the internal
  `[VAT-INCLUSIVE]` marker.
- **Stored prices are always net**, so:

| Figure | VAT |
|---|---|
| `rentalRate`, `deliveryPrice`, `returnPrice` | net (exclusive) — always, regardless of the toggle |
| `total`, `grandTotal` | gross (inclusive) — always |

So the *arithmetic* is uniform; the toggle changes only **what the supplier typed**, not what is stored.
The label on a figure still follows the field it came from, and the toggle adds one extra note.

- **No normalisation for ranking** (decided). Compare on the **rate**, never `grandTotal`.

**Open question 19 is closed by this** — see §10.

#### 6.13.3 Bid list row

Same row shape, with an **«من خارج المنصّة»** badge. Differences:

| Element | Off-platform |
|---|---|
| Rate | `rentalRate` + `priceUnit`, labelled as pre-VAT |
| Cheapest badge | eligible, computed from the **rate** (VAT-exclusive on both sides) — never from `grandTotal` |
| Distance | **replaced by `city`** — there are no coordinates to measure |
| ETA · deals count · verified tick | absent (no `mobLeadTime`, no account history, no verified account) |
| Composition bar | `offeredUnits` with the off-platform state below |

#### 6.13.4 Map — no pin, and say so once

There is no coordinate at any precedence level, so an off-platform submission is **never plotted**. The
colour key (§6.9.2) gains one line stating it. Without that, a renter counting eight offers against six
pins reads the difference as a bug.

#### 6.13.5 Composition bar — a FOURTH state, distinct from count-only padding

An off-platform unit carries **photos and documents but no registered listing**. That is *not* the
count-only padding of §6.3.2, and drawing it as a hatched hole understates it badly.

| State | Meaning |
|---|---|
| جاهزة ومؤكّدة | registered machine, yard confirmed |
| غير مؤكّدة | registered machine, yard not confirmed |
| غير مسجّلة | **count only** — no machine, no photos, no documents |
| **من خارج المنصّة** | **evidence but no listing** — photos and documents exist, nothing is registered |

#### 6.13.6 The rail — TWO buttons

Mirrors the live `SharedLinkBidCard`, which separates an **Equipment → التفاصيل** modal
(`BidEquipmentModal`) from the footer's **عرض العرض** submission view. Two questions, two surfaces:

| Button | Opens |
|---|---|
| 🏗️ المعدّة والمستندات | the equipment panel (§6.13.7) |
| 🧾 عرض العرض المُقدَّم | the submission modal (§6.13.8) |

**Neither the chat nor the machine panel appears.** There is no `DealRoom` and no `EquipmentListing`, so
both would open onto nothing.

#### 6.13.7 Equipment panel — what he claimed, marked as unverified

Order, matching the live modal:

1. **Certificate chips** — from `confirmations`, rendered as `✓ TÜV` / `✓ الاستمارة`.
2. **Title** — `{label} · {requested measurement}`.
3. **Unverified callout** — «بيانات من المؤجّر» / *«أقرّ بها المؤجّر في نموذج الرابط فقط — لم تُوثَّق. راجع
   العرض المُقدَّم كاملاً قبل الاعتماد عليها.»*, with **الكمية المتاحة** under a divider.
4. **Spec grid** — six tiles (below).
5. **الشهادات والملكية على الملف** — the same chips, as an explicit "on file" list.
6. Composition card, photos, equipment documents, company documents.
7. Onward link: **👁 عرض العرض المُقدَّم**.

**Absent by construction, and stated in words rather than silently omitted:** no availability chip, no
readiness band, no yard tile, no spec-match grid. All four require a listing.

**Absent-data conventions (normative), used consistently:**

| Surface shape | Convention |
|---|---|
| A **tile** in a spec grid | **—** (em-dash) |
| A **row** in a key/value list | **«— غير مُدخل»** |

Both mean *this does not exist*; the difference is only what reads well in each shape. Neither is ever a
blank, and neither field is ever dropped.

**The em-dash rule (normative).** A field that does not exist renders as **—**, never dropped. Hiding an
unknown field makes the payload look complete; showing it as unknown is what lets the renter see what he
is not being told. Distance and fuel type are the two that are always unknown.

**Two tiles are the renter's OWN requirement, not the supplier's claim** — and must be labelled so:

| Tile | Source | Note |
|---|---|---|
| المسافة | — | no coordinates exist |
| القياس | **the request item**, not the submission | the mapper supplies only `label`; there is no measurement field on a submission |
| الكمية المعروضة | `offeredUnits` | the supplier's |
| نوع الوقود | — | not collected by the form |
| سنة الصنع | **the request** (`≥ 2020`) | the supplier never states a year |
| السعر | `rentalRate` | pre-VAT (§6.13.2) |

Because two of six tiles are the renter's own criteria, the panel must say so explicitly — otherwise
`≥ ٢٠٢٠` reads as the supplier having confirmed a 2020+ machine, which he never did.

#### 6.13.8 Submission modal — the document as submitted

A modal, not a side panel, matching the live "view submission" screen.

1. **Dark header** — 🔗 tile, company name, «من خارج المنصّة · أُرسل عبر رابط طلبك · للعرض فقط», close.
2. **Read-only banner** — 👁 «العرض المُقدَّم — كما أدخله المؤجّر في نموذجك بالضبط».
3. **Bid quality** — donut + three weighted bars (§6.13.11).
4. **Reference strip** — رقم العرض · رقم الطلب · الطلب · أُرسل.
5. **Dark item header** — name, an `×N وحدة` pill, and an item counter.
6. **Terms grid** — two columns; each card pairs **اختيارك** (blue) against **اختيار المؤجّر** (green ✓ /
   red ✕), the card tinted green on a match and red on a mismatch.
7. Price rows with VAT stated · photo strip · equipment documents · company documents · company details
   · supplier notes.
8. **Footer** — إغلاق · **⤓ تنزيل عرض السعر** · the read-only reminder.

**No message thread.** Removed by decision. Off-platform messaging exists in the backend
(`rentee_messages` and the messages endpoint) but is deliberately not surfaced here.

**Absent fields read as «— غير مُدخل»**, not as blank rows — same reasoning as the em-dash rule.

#### 6.13.9 Bottom bar — read-only, with a breakdown

- Hero: `rentalRate` labelled **قبل الضريبة**; under it the total labelled **شامل الضريبة**.
- **التفاصيل** opens the same dark popover the platform bar uses: الإيجار ×N · التعبئة والنقل · الإرجاع ·
  المجموع قبل الضريبة · ضريبة القيمة المضافة (١٥٪) · الإجمالي. This is the **only** place mobilisation,
  demobilisation and VAT are visible, so it is required, not optional.
- **VAT is derived as `total − subtotal`**, never recomputed as `subtotal × 0.15`. The submission stores an
  already-rounded total; recomputing can produce a breakdown whose lines do not sum to the figure the
  supplier actually sent.
- **No اعتمد and no اطلب سعراً أقل** — both need a deal room.
- One action: 🧾 عرض العرض المُقدَّم.

#### 6.13.10 Field → surface matrix

Every field the renter can receive, and where it appears. `†` marks the two that require the agents
`SELECT` addition of §6.13.1 (`city`, `contact_info`).

| Field | Bid row | Equip panel | Submission modal | Bottom bar |
|---|---|---|---|---|
| `companyName` | ✅ title | — | ✅ header + company details | — |
| `city` † | ✅ **replaces distance** | — | ✅ company details | — |
| `crNumber` | — | — | ✅ (— غير مُدخل if absent) | — |
| `vatNumber` | — | — | ✅ (— غير مُدخل if absent) | — |
| `nationalAddress` | — | — | ✅ | — |
| `contactInfo` | — | — | ✅ **once selected** — missing from the agents payload today | — |
| `notes` | — | — | ✅ supplier notes | — |
| `validUntil` | — | — | ✅ company details | — |
| `createdAt` | — | — | ✅ reference strip | — |
| `quotationRef` | — | — | ✅ reference strip | — |
| `rfqRef` / `groupRef` | — | — | ✅ reference strip | — |
| `grandTotal` | — | — | — | ⚠️ **not used** — see §6.13.2; ranking and display use the rate |
| `companyDocuments` | — | ✅ list | ✅ list | — *(already on the wire)* |
| `label` | — | ✅ title | ✅ item header | — |
| `offeredUnits` | ✅ composition | ✅ tile + الكمية المتاحة | ✅ units pill + price rows | ✅ hero sub-line |
| `numberOfUnits` | — | — | ✅ "N of M requested" | — |
| `rentalRate` | ✅ rate | ✅ tile (accented) | ✅ price rows | ✅ **hero** |
| `deliveryPrice` | — | — | ✅ price rows | ✅ **التفاصيل only** |
| `returnPrice` | — | — | ✅ price rows | ✅ **التفاصيل only** |
| `total` | — | — | ✅ total row | ✅ sub-line + التفاصيل |
| `priceUnit` | ✅ | ✅ | ✅ | ✅ |
| `photos[]` | — | ✅ strip | ✅ strip | — |
| `documents[]` | — | ✅ list | ✅ list | — |
| `confirmations` | — | ✅ **cert chips** | ✅ **terms grid** | — |
| `requiredTerms` | — | — | ✅ terms grid (اختيارك side) | — |
| `requestItemId` | — | — | internal only | — |
| requested measurement | — | ✅ tile *(from request)* | — | — |
| requested min year | — | ✅ tile *(from request)* | — | — |

**Never available, and shown as — wherever a platform bid would show them:** `equipmentId`,
`serialNumber`, `manufacturer`, `modelName`, `year`, `yardId`, coordinates, `yardConfirmed`, distance,
fuel type, readiness band.

#### 6.13.11 Bid quality score — ALREADY IMPLEMENTED, do not rebuild

**`src/lib/contract/bid-quality.ts` exists and is the source of truth.** 124 lines, rendered by
`src/components/bid/QualityRing.tsx`, already consumed by `BidComparisonWorkspace.tsx:17` and
`GroupBids.tsx:18`. An earlier revision of this section specified it as new work with a formula that did
**not** match the code; that was wrong and is corrected below.

**Use the existing exports.** `qualityFromSubmission(sub)` for a submission-level view,
`qualityFromSubmissionItem(sub, item)` for a per-item score on a multi-item bid.

##### The real formula

`score = round(100 × (0.4 × terms + 0.3 × equipment + 0.3 × company))`, each part clamped to 0–1.
Bands: `high ≥ 80` · `mid ≥ 50` · else `low`. **Note 50, not 60.**

| Part | How it is actually computed |
|---|---|
| **terms** (40%) | Over `ITEM_TERM_KEYS` (`operator`, `nationality`, `fatFood`, `fatTransport`, `fuel`, `fuelType`, `year`, `operatorCert`, `equipmentCert`): count only keys the request **actually requires** (`requiredTerms[k] != null`), and score the fraction the supplier confirmed `=== true`. No required terms ⇒ 1. |
| **equipment** (30%) | **Bucket coverage, not a document count.** Buckets: equipment photos (always) · proof of ownership (always) · equipment certificate *only if some item requires `equipmentCert`* · operator certificate *only if some item requires `operator` or `operatorCert`*. Each bucket scores 1 if it has ≥1 file. |
| **company** (30%) | Four **optional** slots, each satisfiable by **text OR a document**: `cr` (`crNumber` or a `cr` doc) · `vat` (`vatNumber` or `vat_cert`) · `address` (`nationalAddress` or `national_address`) · `otherDocs` (any of `local_content`, `saso_heavy_equip`, `other`). |

##### Corrections to what this document previously said

- **Company details do NOT include `contactInfo`.** Company name and contact are *required to submit*, so
  scoring them would give every submission free points. The fourth slot is **`otherDocs`**.
- **Equipment is bucket coverage**, not attached ÷ expected types. A supplier who uploads ten photos and no
  ownership paper scores 0.5, not 1.
- **A slot can be satisfied by text OR a document** — a CR number typed in counts the same as a CR file.
- **The mid band starts at 50**, not 60.

##### What it is not

A **completeness-and-agreement** score, never a trust score, and it must not be labelled as verification.
Every input is self-declared: a submission can reach 100 with nothing verified. That is why §6.13.7's
unverified callout sits above it.

## 7. Backend contract — implement in `Moedatech-App`

> **Self-contained hand-off.** Written to be pasted into a session that cannot read the `Web-App`
> repo.

**Owning app:** `apps/backend` (app-backend).

### 7.1 Context

The renter's bid list (`GET /marketplace/requests/{requestId}/bids` → `getBidList`, in
`src/services/marketplace/rentee.service.ts`) returns each bid with a server-computed `distanceKm`,
derived at `:669-676` from `bid.equipmentLat/Lng ?? bid.yard?.latitude ?? bid.equipment?.yard?.latitude`
measured against `request.projectLat/Lng`.

A new renter-facing map needs (a) the raw coordinates behind that number and (b) **per-unit**
locations, which exist in the database today but are dropped before they reach the renter.

### 7.2 Change 1 — expose per-unit location on `offeredUnitsDetail`

The supplier's bid-readiness card writes per-unit claims into the bid's `unitsOffered` JSON as
`{ itemId, equipmentId, yardId, yardConfirmed }` (mobile: `bid_readiness_bloc.dart:58`; the server
stores the array verbatim and today reads only its length). That per-unit yard never reaches the
renter, for two reasons:

1. `buildOfferedUnitIndex` (`rentee.service.ts:511`) queries `equipmentListing` with an explicit
   `select` of `id, manufacturer, modelName, year, fuelType, licensePlateNumber, subcategoryId,
   measurementId, documentKeys, photoKeys` — **no `yardId`, no `yard`, no coordinates**.
2. `offeredUnitsDetailFor` (`:581`) iterates `bid.unitsOffered` but reads only `entry.equipmentId`
   to look up that index — **`entry.yardId` and `entry.yardConfirmed` are never copied out** — and
   then dedupes by `equipmentId`.

This appears incidental rather than a deliberate redaction (the adjacent `RENTEE_HIDDEN_DOC_TYPES`
filter *is* deliberate and must be preserved).

**Required:**

- Add to the `buildOfferedUnitIndex` select: `yardId`, and
  `yard: { select: { id: true, name: true, latitude: true, longitude: true, city: true } }`.
- In `offeredUnitsDetailFor`, carry `entry.yardId` and `entry.yardConfirmed` through, and resolve
  each unit's coordinates by the precedence in §7.3.
- **Keep the existing dedupe by `equipmentId`.** It is correct. The supplier app pads the array when
  the fleet is smaller than the offered count — `while (ids.length < count) ids.add(primary)`
  (`bid_form_bloc.dart:1566`) — so duplicate entries are *padding*, genuinely the same machine, and
  collapsing them is right. One physical machine cannot be in two places, so there is no legitimate
  same-id/different-location case.
- **Do not** try to read plain-string entries as equipment ids. Some payloads carry request **item**
  ids in that position (`bid_form_bloc.dart:516` extracts `itemId`, not `equipmentId`), so coercing
  them would look up item ids in the equipment table. Skipping non-object entries — today's
  behaviour — is correct.
- **Add an ownership check on BOTH sides (security — decided 2026-08-05, see §7.2.1).** `buildOfferedUnitIndex` currently queries
  `equipmentListing.findMany({ where: { id: { in: ids }, tenantId } })` — tenant-scoped only. A
  supplier can therefore place a **competitor's** `equipmentId` into `unitsOffered` and have that
  competitor's documents, photos, year — and, once this change lands, their **yard location** —
  served to the renter as part of this bid. Scope the query with the same guard `createBid` already
  applies to `input.yardId`, whose comment names this exact attack: *"without this a supplier could
  attach a competitor's yard (its name + GPS + city surface on the rentee's bid card, spoofing
  location)"*. An entry that fails the ownership check resolves to no machine.
- Compute a per-unit `distanceKm` with the same `haversineKm` helper and the same
  `request.projectLat/Lng`, so a unit's distance is directly comparable to the bid's.

**Ownership documents — presence only, never the file.** `RENTEE_HIDDEN_DOC_TYPES` removes
registration / customs / sale-contract entries from `documentKeys` so completely that the renter
cannot tell whether they exist. The renter has a legitimate need to know ownership is *proven*; they
have no business reading a sale contract that shows what the supplier paid. So emit a **separate,
file-less** summary alongside the filtered list:

```ts
// ~~ownershipDocs~~ — WITHDRAWN, see §7.14. Ownership documents are returned like any other type,
// with usable urls, inside `documentKeys`. There is no presence-only summary.
```

- **No `key`, no `url`, ever.** Not "a URL the UI chooses not to render" — the field must not exist
  in the payload, so no client and no future caller can presign or fetch the file.
- `documentKeys` keeps excluding these types, unchanged.
- The existence of a registration document is not sensitive; its contents are. This exposes the
  former and nothing else.

**Added fields on each `offeredUnitsDetail` entry** (all additive; existing fields unchanged):

| Field | Type | Meaning |
|---|---|---|
| `yardId` | `string \| null` | resolved yard for this unit |
| `yardName` | `string \| null` | that yard's display name |
| `yardCity` | `string \| null` | that yard's city |
| `yardConfirmed` | `boolean` | supplier confirmed this unit's yard on the readiness card |
| `lat` | `number \| null` | resolved latitude |
| `lng` | `number \| null` | resolved longitude |
| `distanceKm` | `number \| null` | to `request.projectLat/Lng`; null if either side missing |
| `locationSource` | `'unit_yard' \| 'bid_pin' \| 'bid_yard' \| 'listing_yard' \| 'unidentified' \| 'none'` | which level produced the coordinate |
| ~~`ownershipDocs`~~ | — | **WITHDRAWN (§7.14)** — ownership documents ride in `documentKeys` with usable urls, like any other type |

#### 7.2.1 `unitsOffered` ownership — required on both sides

**Decided 2026-08-05: implement it, read side and write side.** Verified against the code below.

**What is already checked.** The bid's own `equipmentId` is ownership-checked today —
`bid.service.ts`, submit step 4:

```ts
const equipment = await prisma.equipmentListing.findFirst({
  where: { id: input.equipmentId, ...ownerScopeWhere(supplierId, supplierCompanyId), tenantId, deletedAt: null },
});
if (!equipment) throw new AppError(ERROR_CODES.EQUIPMENT_OWNERSHIP);
```

**What is not.** `unitsOffered` is `z.array(z.any()).optional()` in **both** `submitBid.ts:30` and
`editBid.ts:28` — no shape, no ownership check — and is stored raw (`bid.repository.ts:216`). On the read
side `collectOfferedEquipmentIds` (`rentee.service.ts:487-505`) trusts `e.equipmentId` from every entry,
and `buildOfferedUnitIndex` resolves them with `where: { id: { in: ids }, tenantId }` — id and tenant only
(`:519-521`).

**The exposure.** A supplier can submit a bid whose primary `equipmentId` is legitimately his while
`unitsOffered` names a **competitor's** listing. The renter is then served that competitor's model, year,
plate number, `documentKeys`, `photoKeys` and — once this section ships — the machine's **yard
coordinates**, presented as a unit of his offer. Same-tenant only, and not reachable from any supplier-app
flow, but reachable with one crafted API call.

##### Change 1 — write side (both endpoints)

Validate every `equipmentId` in `unitsOffered` against **the same scope as the primary check**:

```ts
// submitBid + editBid, alongside the existing step-4 ownership check
const offeredIds = [...new Set(
  (input.unitsOffered ?? [])
    .map((e: any) => e?.equipmentId)
    .filter((id: any): id is string => typeof id === 'string' && id),
)];
if (offeredIds.length) {
  const owned = await prisma.equipmentListing.count({
    where: { id: { in: offeredIds }, ...ownerScopeWhere(supplierId, supplierCompanyId), tenantId, deletedAt: null },
  });
  if (owned !== offeredIds.length) throw new AppError(ERROR_CODES.EQUIPMENT_OWNERSHIP);
}
```

- **Reuse `ownerScopeWhere`, do not write a new predicate.** The T7 company-shared-fleet rule means a
  colleague's machine in the same company **is** owned; hand-rolling `userId === supplierId` would reject
  legitimate bids from multi-member companies.
- Reject with the **existing** `EQUIPMENT_OWNERSHIP` code — no new error code, so no client changes.
- `editBid` matters as much as `submitBid`: a clean bid can be edited dirty.

##### Change 2 — read side

Scope the lookup so pre-existing rows stop leaking:

```ts
const units = await prisma.equipmentListing.findMany({
  where: { id: { in: ids }, tenantId, /* + per-bid owner scope, see note */ },
```

**Note on shape.** `buildOfferedUnitIndex` today builds **one flat index keyed by `equipmentId` across
all bids**, so there is no per-bid owner to scope by at query time. Either:

- **(preferred)** keep the single batched query, then **drop entries at assembly time** when the resolved
  listing's owner does not match the bid that referenced it — the bid rows are already in hand, so this
  needs no extra query and preserves the no-N+1 property; or
- group ids by bid and issue one query per owner scope, which reintroduces a query per supplier.

Whichever is chosen, **the index must stop being shared blindly across bids** — that sharing is the
mechanism by which one bid can surface another supplier's machine.

##### Consequences to expect

- **A bid that today shows N units may show fewer.** That is the fix working. Do not compensate by
  inflating the detail list.
- **The offered count and the inspectable set may disagree** (AC-184). `unitsOffered.length` still drives
  the count; the difference surfaces in the renter UI as unregistered units (§6.3.2), which is the
  honest presentation — the supplier claimed a unit and produced nothing verifiable for it.
- **No backfill is specified.** The read filter makes existing bad rows harmless; the write check stops new
  ones. Whether to hunt for historical abuse is a separate call (it cannot be reconstructed reliably,
  since `z.any()` left no record of intent).

### 7.3 Location precedence (normative)

Per unit, highest wins. The rule: **anything the supplier did for *this bid* outranks a fleet
default, and anything done per *unit* outranks anything done per *bid*.**

| # | `locationSource` | Source | Supplier action |
|---|---|---|---|
| 1 | `unit_yard` | `unitsOffered[].yardId` → `Yard.latitude/longitude` | confirmed this unit's yard on the readiness card |
| 2 | `bid_pin` | `bid.equipmentLat` / `bid.equipmentLng` | dropped a custom pin on the bid form |
| 3 | `bid_yard` | `bid.yardId` → `Yard.latitude/longitude` | picked a yard on the bid form |
| 4 | `listing_yard` | `equipment.yardId` → `Yard.latitude/longitude` | assigned the machine to a yard when adding it to the fleet |
| 5 | `unidentified` | — | the offered count exceeds the machines named (array padding) — a unit with no machine behind it at all |
| 6 | `none` | — | a named machine whose every location level is null (e.g. its yard was deleted) |

**`unidentified` vs `none` are different states and must not be merged.** `unidentified` means *no
machine* — nothing to document, no readiness to check, and the count is the only thing that exists.
`none` means *a real machine whose location is unknown*. The renter's exposure differs completely.

Levels 2–4 are exactly the existing bid-level chain and must stay byte-compatible with the current
`distanceKm` on the bid, so today's bid cards do not shift. Only level 1 counts as *confirmed*;
2–4 are inferred.

### 7.4 Change 2 — expose bid-level coordinates

Add `lat`, `lng` and `locationSource` to the bid object itself, resolved by levels 2–4 of §7.3.
`distanceKm` is unchanged. This lets the client plot a pin without re-deriving coordinates.

### 7.5 ~~Change 3 — live bid events~~ **WITHDRAWN — no Stream, no push, no backend change**

**Decided 2026-08-05: there is no realtime mechanism in this feature.** Both earlier designs — a
per-request Stream channel, then a `sendUserCustomEvent` to the request owner — are withdrawn. **This
section requires no backend work at all.**

**Why.** Bids arrive over hours or days. The probability that the renter is looking at this screen at the
moment a bid lands is low, so a push path buys very little and costs a Stream dependency, a connection on
`/compare` that does not exist today, and an event contract to maintain. The original *"live like Uber"*
framing came from a design where **supplier pins arrived on the map**; that design is gone (§6.2 — the map
opens on the project location only and machines appear on selection), so nothing on screen is inherently
live any more.

#### 7.5.1 What replaces it — refetch, and it is NOT a fallback

These were previously written as safety nets under a push design. With push withdrawn they are **the
entire mechanism, and therefore normative**:

| Trigger | Why it carries the weight |
|---|---|
| **On mount** | the ordinary load; covers the overwhelmingly common case of a renter opening the page after bids arrived |
| **On window focus** | the renter tabs back after the supplier acted, and the screen is current |
| **After the renter sends a request** | **the load-bearing one.** This is the one moment he *is* watching, and it is when the self-closing loop (§7.13.4) needs to resolve |

**A manual refresh affordance is required** on the bid list, since nothing else guarantees freshness while
the page sits open.

#### 7.5.2 The consequence, stated so it is not discovered later

Three things now update **only on one of those triggers**, not within a second:

1. a **new bid** appearing in the list,
2. a **pin recolouring** when the supplier confirms a yard,
3. a **request card's status line** flipping to answered.

All three still work. They are just not instantaneous, and no copy anywhere may imply that they are —
§6.11 is worded accordingly.

**If this is ever revisited**, the cheapest route is the withdrawn user-event design: `stream-chat@9.46`
already exposes `sendUserCustomEvent(targetUserID, event)`, the renter is already a Stream-active user via
deal-room chat, and no channel would need creating. It was withdrawn on cost/benefit, not feasibility.

### 7.6 Change 4 — the map follows the APPROVED unit term only

Per-unit binding (`agreedUnitIds`) was specced here and is now **withdrawn**: the quotation agrees
*how many* units, never *which machines*. Which specific machines are supplied is settled with the
supplier in chat, so there is nothing to persist and **no new column**.

What remains is narrower, and it matters for the map: the count the map shows for a bid must be the
**bid's original offered count** until the supplier has **approved** a different one as the unit term.

- While the renter's counter is pending, the map keeps showing the offered count. An unapproved
  counter-offer must not silently rewrite what the offer says.
- Once the supplier approves, the map shows the agreed count — 4 offered, 3 agreed → the pin reads 3.
- Source: `DealRoom.agreedUnits`, **and only once the room has reached an approved state**
  (`AWAITING_SUPPLIER_CONFIRMATION` / `CLOSED`). `lastProposedRentalUnits` must never drive the map —
  the schema comment marks it **display only**.
- No new field. This is a read rule, not a write.

### 7.7 Validation rules

- Coordinates are returned as numbers; `Decimal` columns must be coerced (`Number(...)`), matching
  the existing `distanceKm` computation.
- A unit whose resolved yard has a null latitude **or** null longitude is `locationSource: 'none'`,
  never a half-resolved point.
- `yardConfirmed` is reported verbatim from the stored entry; the server must not infer it from the
  presence of a `yardId`.

### 7.8 Data model delta

**No new column.** `agreedUnitIds` was specced here and **withdrawn** (§7.6) — the quotation agrees
*how many* units, never *which machines*, so there is nothing to persist. Every other field
already exists: `Bid.equipmentLat/Lng`, `Bid.yardId`, `Bid.unitsOffered`
(JSON), `EquipmentListing.yardId`, `Yard.latitude/longitude/name/city`,
`EquipmentRequest.projectLat/Lng`. One additive migration for the column.

### 7.9 Error codes

| Code | Meaning | EN | AR |
|---|---|---|---|
| `FORBIDDEN` | caller may not read this request's bids (existing) | You don't have access to this request. | ليس لديك صلاحية على هذا الطلب. |
| `REQUEST_NOT_FOUND` | unknown request (existing) | Request not found. | الطلب غير موجود. |
| `VALIDATION_ERROR` | request card fails §7.13.3 — unknown `equipmentId`, retired `add_to_offer` kind, or missing `bidId` | That request isn't valid for this offer. | هذا الطلب غير صالح لهذا العرض. |

No new error codes.

### 7.10 Backward compatibility

- **Mobile consumes the same `getBidList` response.** Every change is **additive** — new fields on
  the bid and on `offeredUnitsDetail`. **No new column** (§7.6). No field is renamed, retyped or
  removed, and the existing dedupe is deliberately preserved (§7.2).
- `distanceKm` on the bid must not change value for any existing bid. Coordinates are additive only.
- **The ownership filter (§7.2) is a behaviour change**, and intentionally so: a bid that today
  surfaces a competitor's machine will, after this, surface no machine for that entry. Its offered
  *count* is unaffected. Expect a small number of production bids to show fewer identified units —
  that is the leak closing, not a regression.

### 7.11 ~~Defect — ownership documents leak through the deal-room endpoint~~ *(WITHDRAWN — see §7.14)*

> **Withdrawn 2026-08-04.** Ownership documents are now intentionally viewable by the renter (§7.14).
> What this section called a leak is the decided behaviour. Kept for the reasoning it records.

Not caused by this feature, but this feature is what made it visible, and the two sides must agree
before a second documents surface ships.

**Two files state opposite intentions about the same documents.**

`rentee.service.ts:449` — a categorical rule, applied when building `offeredUnitsDetail`:
```ts
// Ownership docs stay supplier-private and must never surface on rentee
// screens (istimara / customs / sale-contract / saso-registration).
const RENTEE_HIDDEN_DOC_TYPES = new Set([...]);
```

`deal-room.service.ts:3815` — the renter-facing branch of `getDealRoomDocuments`, listing those very
documents as its content, with **no type filter in the query**:
```ts
// Document instances (TÜV, SPSP, istimara, custom card, sale contract)
SELECT edt.document_key, di.file_key, edt.display_name
  FROM document_instances di … WHERE di.entity_type = 'equipment' AND di.entity_id = ${equipmentId}
```

**The "never surface" rule should win**, and not only because it is the categorical one: a
`sale_contract` can reveal what the supplier **paid** for the machine. Serving that to a renter who
is at that moment negotiating a rental rate against them is a commercial harm, not merely a privacy
lapse.

**Fix:** apply the same `RENTEE_HIDDEN_DOC_TYPES` exclusion to the renter-facing branch of
`getDealRoomDocuments`. Supplier-facing behaviour is unchanged — the filter applies only when
`!isSupplier`.

**Consequence, stated so it isn't mistaken for a regression:** the deal room's existing Documents
modal will stop showing registration / customs / sale-contract documents for the bid's primary
machine. Renters who have been seeing them will stop. That is the rule being enforced, not a feature
being removed.

This also removes the contradiction §6.5 would otherwise have created: with the fix, the map's
documents panel and the deal room's modal agree — neither shows ownership documents.

### 7.12 Change 5 — the supplier's qualifying fleet *(new backend work)*

Expanding a supplier reveals **every machine of the requested type that supplier owns**, not only the
units in the bid. Nothing serves this today: `browseEquipment` is a marketplace-wide browse that
*excludes* the caller and accepts no supplier filter, and there is no renter-facing fleet endpoint.

**Required:** for a request the renter owns, list a given **bidding** supplier's active equipment
matching that request's item, each carrying:

| Field | Why |
|---|---|
| `equipmentId`, `serialNumber`, `year`, `modelName` | identity in the panel |
| `yardName`, `lat`, `lng`, `distanceKm` | the pin |
| `yardConfirmed` | green vs red |
| `inBid` | filled pin vs hollow “you could ask for this” |
| `documents[]`, `photos[]` | the panel — the **same shape as `offeredUnitsDetail`** (see below), with **no** renter-facing type filter (§7.14) |

- **Scope:** only suppliers who have **actually bid** on this request. This must not become a way to
  browse an arbitrary company's fleet.
- **Matching:** the same subtype/capacity rule the supplier’s own matched-fleet view uses, so both
  sides agree on what “qualifying” means.
- **Ownership:** company-aware (`ownerScopeWhere`), so a member’s firm-shared machines are included
  and nobody else’s are.

**Two definitions the field table above cannot carry, and both change what the renter sees:**

- **`yardConfirmed` is a property of THIS BID's `unitsOffered` entry, never of the listing.** A machine
  is confirmed because the supplier placed it at a yard *for this offer*. Reading it off the equipment
  listing turns every pin green, because a listed machine always sits somewhere. Where the machine is
  not in this bid (`inBid: false`) there is no entry, so `yardConfirmed` is **false** — not null and
  not inherited.
- **Which coordinates to send follows from that.** Confirmed → the **bid entry's yard**. Unconfirmed →
  the machine's **registered yard** (§7.3 precedence). The two can differ, and sending the wrong one
  puts a green pin at a place the supplier never committed to. §6.2 states this in prose; it is
  normative here.

**Return each machine in the `offeredUnitsDetail` shape** — the same `documents[]` and `photos[]`
structure, not an ad-hoc "presence" summary. One payload then feeds **both** the pin's readiness bar
and the document tab of a machine that is *not* in the offer. A presence-only summary cannot fill that
tab, and the alternative — a second fetch when the renter opens a not-in-offer machine — puts a
network round-trip inside a tab switch.

### 7.13 Change 6 — the rentee request card, and how a request is bound to one machine *(new backend work, small)*

**Decided:** `rentee_request` **does** inflate the unread badge, and also raises a supplier-side
notification, so an equipment-scoped question is visible without opening the room.

The renter asks about **one specific machine**: confirm its availability, provide named documents, or
offer a different unit. The supplier must be able to tell *which* machine without parsing a sentence,
and the renter must be able to tell which machine a reply is about. This section is the contract for
that binding.

#### 7.13.1 The key is `equipmentId`, never the serial

`EquipmentListing.serialNumber` is **`String?`** and is unique only per `(tenantId, userId)`. Two
different suppliers can therefore hold the same serial legitimately, and a listing may hold none at
all. A request keyed on the serial is ambiguous in exactly the case that matters — a fleet of
identical machines.

`EquipmentListing.id` is the key. **One row = one physical machine** (there is no quantity column on
the model), so an id names a machine with no further qualification. The serial travels alongside as
**display text only**; nothing resolves off it.

#### 7.13.2 Card payload

Accept and persist one new card type on the renter → supplier direction:

```ts
{ type: 'rentee_request',
  ref: string,                                  // 'RQ-7F3A' — short, quotable by both sides
  scope: 'equipment' | 'company',
  equipmentId: string | null,                   // required when scope='equipment', null when 'company'
  serial: string | null,                        // display only — never used to resolve
  kind: 'availability' | 'document' | 'alternative',   // 'add_to_offer' is RETIRED (§6.7.1)
  docTypes?: string[] }                         // document requests only; one card, many documents
```

- **No new table, no new endpoint.** It is a Stream message with structured `customData`, sent through
  the existing chat path. Stream persists messages permanently, so the record already exists — see
  §7.13.5 for why no row is added.
- **`scope: 'company'` carries no `equipmentId`.** A commercial-registration request is about the
  supplier, not a machine; attaching a machine id would make the supplier read it as one.
- **`docTypes` is an array.** The renter ticks several documents and sends **one** card. Splitting it
  into one card per document would flood the channel and produce N notifications for one intent.
- **`ref` is minted by the backend**, not the client, so it is unique and cannot be spoofed into
  colliding with another conversation's reference.

#### 7.13.3 Validation

- `equipmentId` **must** resolve to a listing owned by the bidding supplier, in the same tenant. Reuse
  the ownership scoping from §7.2 — the same check that stops a bid quoting someone else's machine.
- `equipmentId` **need not be in `unitsOffered`.** Asking about a machine the supplier did not offer is
  legitimate — it is an `alternative` request — so do not reject on that basis.
- **`add_to_offer` must be rejected.** The kind is retired (§6.7.1); no surface produces it (AC-182).
- `scope='equipment'` with a null `equipmentId`, or `scope='company'` with a non-null one, is a
  `400` — a malformed card is worse than no card, because it renders as a question about nothing.
- `docTypes` entries must be known document types. An unknown type cannot be resolved in §7.13.4, so
  the card would never show an answer.

#### 7.13.4 How the answer is correlated — three layers, in order of reliability

**1. Observable state (the real answer).** The card renders its status by **re-reading the machine on
every render**, not from anything stored on the request:

| `kind` | Derivable? | Answered when |
|---|---|---|
| `availability` | yes | that unit's `yardConfirmed` is true |
| `document` | yes | every `docTypes` entry appears in that unit's `documentKeys` |
| `alternative` | **no** | nothing observable identifies "a different machine instead of this one" |

This is why the supplier can answer by **doing the thing** rather than by replying, and why the
renter's card updates on the next **refetch** — which a send already triggers (§7.5.1). Nothing is pushed.

**Precedence is normative, and layer 3 is not optional.** `alternative` has no observable
counterpart, so a card of that kind read *"waiting for the supplier"* indefinitely — including when a
refusal was sitting directly beneath it in the same conversation. The rule is therefore:

1. If the kind is derivable, **layer 1 answers** — always, and it overrides any echo, because state
   cannot be wrong about itself.
2. If the kind is **not** derivable, the **echoed `resolution` answers** (§7.13.4 layer 3).
3. Only with neither is the request genuinely still open.

Skipping step 2 is what makes a "no" invisible, which is the one failure mode this design must not have.

**2. Stream threading.** `sendMessage` already returns `response.message.id`. Persist it, and have the
supplier client reply with `parent_id` set to it. Stream supports this today and the app does not use
it yet. This gives an exact reply→request link for free-text answers that no state change covers.

**3. Echoed correlation.** The supplier's reply card carries
`{ inReplyTo: <ref>, equipmentId, resolution: 'provided' | 'declined' | 'unavailable' }`. This is the
only layer that can express **"no"** — a decline changes no state, so layers 1 and 2 cannot represent it.

#### 7.13.5 No status column, and why

The request has **no `status` field and no counter.** Both were considered and rejected:

- A stored status **goes stale by default**. A supplier who confirms the yard from the readiness card —
  the normal path — never touches the request, so the row stays `open` forever. A counter built on it
  shows work that is already done, and a badge nobody trusts is worse than no badge.
- Layer 1 above makes status **derivable**, and a derived value cannot disagree with reality.

**Consequence, recorded because it is a real cost:** without a row, "every open request across all my
deal rooms" is **not SQL-queryable**. A supplier-side inbox spanning rooms would need either a scan of
Stream channels or the table this section declines to add. That is a deliberate trade for this feature,
which is scoped to one room at a time — not a claim that the table is never needed. Revisit under
open question 12 if a cross-room supplier inbox is specified.

### 7.14 Decision — ownership documents are fully viewable to the renter

**Decided by the product owner, reaffirmed after the risk was raised.** The renter sees every equipment
document, ownership papers included, and can **open them** — not presence-only.

This supersedes two earlier positions in this document:

- **§7.11 is withdrawn.** It recorded `getDealRoomDocuments` serving ownership documents to the renter
  as a *defect*, on the strength of the rule in `rentee.service.ts:449`: *"Ownership docs stay
  supplier-private and must never surface on rentee screens (istimara / customs / sale-contract /
  saso-registration)."* That rule is now the thing being changed, not the thing being enforced.
- **Presence-only (`ownershipDocs` without key or url) is withdrawn.** The per-unit payload returns the
  documents themselves.

**Required backend change:** remove `RENTEE_HIDDEN_DOC_TYPES` filtering from the renter-facing path in
`buildOfferedUnitIndex` (`rentee.service.ts`), so `documentKeys` includes ownership types with usable
urls. `getDealRoomDocuments` already returns them and needs no change.

**Consequences, recorded because they are not obvious:**

- A **`sale_contract` can show what the supplier paid for the machine.** The renter reading it is
  negotiating a rental rate against that supplier. This is a commercial disclosure, not only a privacy
  one, and it is now deliberate.
- The rule in `rentee.service.ts:449` must be **deleted or rewritten**, not silently bypassed. Leaving a
  comment that says "must never surface" next to code that surfaces them guarantees someone
  re-implements the filter later believing it was a regression.
- Suppliers were never told their ownership papers would be visible to renters. Whether that needs
  surfacing to them is open question 14.
#### 7.14.1 Shipping without supplier notice — decided, and what it does not excuse

**Decided 2026-08-05: ship it silently.** No in-app notice, no email, no opt-out per document type, and no
carve-out for `sale_contract`. Suppliers are not told; the full ownership set becomes renter-visible and
openable.

**This is a product decision and it is recorded, not argued.** Two things it does *not* change:

1. **The contradictory rule in the code must still be deleted or rewritten** (AC-102). `rentee.service.ts:449`
   currently reads *"Ownership docs stay supplier-private and must never surface on rentee screens
   (istimara / customs / sale-contract / saso-registration)."* Leaving that comment next to code that
   surfaces them guarantees a future reader re-implements the filter believing it is a regression. Shipping
   quietly to suppliers is a choice; shipping quietly to the next engineer is a bug.
2. **The disclosure is still real.** `sale_contract` can show the purchase price of a machine to the party
   negotiating its rental rate. If that becomes contentious after launch, the mitigation is a per-type
   exclusion — cheap to add, since the filter constant (`RENTEE_HIDDEN_DOC_TYPES`) still exists and only
   its application to the renter path is being removed.

**Not specified here, deliberately:** whether the supplier-facing terms or privacy copy already cover this.
That is outside a technical spec's reach and was not asserted either way.

## 8. Acceptance criteria

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-01 | app-backend | **Given** a bid whose `unitsOffered[]` entry carries a `yardId` **When** the renter fetches bids **Then** that unit's detail returns `locationSource: 'unit_yard'` with the yard's `lat`, `lng`, `yardName`, `yardCity` |
| RMAP-AC-02 | app-backend | **Given** a unit entry with no `yardId` and a bid carrying `equipmentLat/Lng` **When** built **Then** the unit resolves to `bid_pin` with the bid's coordinates |
| RMAP-AC-03 | app-backend | **Given** a unit entry with no `yardId`, a bid with no custom pin but a `bid.yardId` **When** built **Then** the unit resolves to `bid_yard` |
| RMAP-AC-04 | app-backend | **Given** none of the above but the unit's listing has a yard with coordinates **When** built **Then** the unit resolves to `listing_yard` |
| RMAP-AC-05 | app-backend | **Given** no resolvable coordinates at any level **When** built **Then** `locationSource: 'none'` with null `lat`, `lng` and `distanceKm` |
| RMAP-AC-06 | app-backend | **Given** a resolved yard row whose latitude or longitude is null **When** built **Then** the unit is `none`, never a half-resolved point |
| RMAP-AC-07 | app-backend | **Given** per-unit coordinates and a request with `projectLat/Lng` **When** built **Then** each unit carries its own `distanceKm` from the same `haversineKm` helper |
| RMAP-AC-08 | app-backend | **Given** `unitsOffered` padded with duplicate copies of the primary `equipmentId` **When** details are built **Then** the dedupe collapses them to one detail row, while the offered count still reads `unitsOffered.length` |
| RMAP-AC-08b | app-backend | **Given** an entry whose `equipmentId` belongs to a machine the bidding supplier does **not** own **When** the renter's payload is built **Then** it resolves to no machine and none of that machine's model, year, plate, documents, photos or yard are returned |
| RMAP-AC-183 | app-backend | **Given** a bid submission or edit whose `unitsOffered` names an `equipmentId` the caller does not own **When** it is validated **Then** it is rejected with `EQUIPMENT_OWNERSHIP`, and no bid row is written |
| RMAP-AC-184 | app-backend | **Given** a bid already stored with a foreign `equipmentId` in `unitsOffered` **When** the renter fetches it after this change **Then** the offered count still reflects `unitsOffered.length` while the foreign machine contributes no detail — the count and the inspectable set are allowed to disagree, and the composition bar reports the difference as unregistered |
| RMAP-AC-185 | app-backend | **Given** the company-shared fleet rule (T7) **When** ownership is checked on a `unitsOffered` entry **Then** it uses the same `ownerScopeWhere(supplierId, supplierCompanyId)` scope as the primary `equipmentId` check — a colleague's machine in the same company is owned, a competitor's is not |
| RMAP-AC-09 | app-backend | **Given** any existing bid **When** the list is fetched after this change **Then** its bid-level `distanceKm` is byte-identical to before, and `lat`/`lng`/`locationSource` are added |
| RMAP-AC-10 | app-backend | **Given** `yardConfirmed: false` on a stored entry that nonetheless has a `yardId` **When** built **Then** `yardConfirmed` returns `false` — never inferred from the yard's presence |
| ~~RMAP-AC-11~~ | ~~app-backend~~ | **WITHDRAWN 2026-08-05 — no realtime mechanism.** Was: a Stream user event on every bid write. §7.5 withdrawn; there is no backend work for arrival. |
| ~~RMAP-AC-186~~ | ~~app-backend~~ | **WITHDRAWN with §7.5** — there is no push to fail. |
| ~~RMAP-AC-187~~ | ~~web~~ | **WITHDRAWN with §7.5** — the compare page needs no Stream connection. |
| ~~RMAP-AC-188~~ | ~~web~~ | **WITHDRAWN with §7.5** — there is no event to handle. |
| ~~RMAP-AC-189~~ | ~~web~~ | **WITHDRAWN with §7.5** — there are no events to coalesce. |
| RMAP-AC-191 | web | **Given** `DealRoomView.numberOfUnits` **When** the contract type is read **Then** its comment states what it actually holds (`agreedUnits ?? offeredUnitCount ?? requested`) rather than "units the RFQ asked for" — the field is not renamed |
| RMAP-AC-193 | app-backend | **Given** the **agents** `getRequestSubmissions` (the handler the web calls) **When** the renter payload is built **Then** it also selects `city` and `contact_info`, which that `SELECT` omits — `company_documents` and `rentee_messages` are already selected there |
| RMAP-AC-219 | web | **Given** the bid-quality score **When** it is displayed anywhere in this feature **Then** it comes from the existing `bid-quality.ts` (`qualityFromSubmission` / `qualityFromSubmissionItem`) — no second implementation is written |
| RMAP-AC-220 | web | **Given** the company-details part of the score **When** it is computed **Then** it uses the four optional slots (CR, VAT, address, other-docs), each satisfiable by text or document, and **excludes** company name and contact — which are required to submit |
| RMAP-AC-222 | web | **Given** a submission whose supplier priced VAT-inclusive **When** the bottom bar and the submission modal render **Then** the fact is noted, read via `hasVatInclusiveNote(notes)` — not inferred |
| RMAP-AC-223 | web | **Given** any surface that displays `notes` **When** it renders **Then** it passes them through `stripVatInclusiveNote()` first, so the `[VAT-INCLUSIVE]` marker is never shown to the renter |
| RMAP-AC-224 | web | **Given** the VAT-inclusive path **When** it is implemented **Then** it uses the existing `vat-inclusive.ts` helpers — no second implementation, and no assumption that stored prices are ever gross |
| RMAP-AC-221 | web | **Given** the equipment part of the score **When** it is computed **Then** it is bucket coverage — photos and ownership always, plus equipment/operator certificates only when the request requires them — not a raw document count |
| RMAP-AC-194 | web | **Given** an off-platform submission **When** the bid list renders **Then** the row carries an off-platform badge, shows `city` where a distance would be, and omits ETA, deals count and verified tick |
| ~~RMAP-AC-195~~ | ~~web~~ | **WITHDRAWN 2026-08-05 by decision — no VAT normalisation.** Prices are shown as submitted. Replaced by AC-206, which only requires that ranking uses the rate rather than the VAT-inclusive total. |
| RMAP-AC-206 | web | **Given** off-platform and platform bids in one list **When** the cheapest badge is computed **Then** it uses each bid's **rate**, never an off-platform `grandTotal` — no conversion is applied to either side |
| RMAP-AC-208 | web | **Given** more than one downloadable document is selected **When** the renter presses download **Then** he is asked whether he wants separate files or one merged PDF, and neither is chosen for him |
| RMAP-AC-209 | web | **Given** exactly one document is selected **When** the renter presses download **Then** it downloads directly with no prompt |
| RMAP-AC-210 | web | **Given** the merge option is not implemented **When** the prompt renders **Then** that option is hidden rather than shown and failing |
| RMAP-AC-207 | web | **Given** VAT handling **When** it is implemented **Then** it reads the existing `[VAT-INCLUSIVE]` signal via `hasVatInclusiveNote()` — an inclusive/exclusive choice DOES exist on the public form (§6.13.2) |
| RMAP-AC-196 | web | **Given** any off-platform money figure **When** it renders **Then** it carries a VAT label derived from which field it came from — components as pre-VAT, totals as VAT-inclusive — and no figure is ever shown bare |
| RMAP-AC-197 | web | **Given** an off-platform submission **When** the map renders **Then** it has no pin at all, and the colour key states that off-platform offers carry no location |
| RMAP-AC-198 | web | **Given** an off-platform submission **When** the composition bar renders **Then** its units use a state distinct from count-only padding, reflecting that photos and documents exist without a registered listing |
| RMAP-AC-199 | web | **Given** an off-platform submission is selected **When** the rail renders **Then** it shows exactly two buttons — equipment and view-submission — and neither the chat button nor the platform machine panel |
| RMAP-AC-200 | web | **Given** the submission modal **When** it renders **Then** it shows the read-only banner, the quality score, the reference strip, the item header with a units pill, the terms grid pairing the renter's choice against the supplier's, price rows with VAT stated, photos, equipment documents, company documents, company details and notes — and **no message thread** |
| RMAP-AC-211 | web | **Given** the equipment panel **When** a field that does not exist for an off-platform submission is rendered **Then** it shows an em-dash rather than being omitted — distance and fuel type always |
| RMAP-AC-212 | web | **Given** the equipment panel's measurement and build-year tiles **When** they render **Then** they are labelled as the **renter's own requirement**, not as anything the supplier stated |
| RMAP-AC-213 | web | **Given** an off-platform submission **When** the equipment panel renders **Then** it shows no availability chip, no readiness band, no yard tile and no spec-match grid, and states in words why |
| RMAP-AC-214 | web | **Given** `confirmations` **When** the equipment panel renders **Then** the acknowledged certificates appear as chips, and the panel does not imply they are verified |
| RMAP-AC-215 | web | **Given** the bottom bar **When** التفاصيل is opened **Then** it shows mobilisation, demobilisation and VAT scaled by offered units — the only place those three are visible |
| RMAP-AC-216 | web | **Given** the breakdown **When** VAT is displayed **Then** it equals `total − subtotal`, so the lines always sum to the stored total |
| RMAP-AC-217 | web | **Given** the quality score **When** it renders **Then** it is 40/30/30-weighted over terms match, equipment documents and company-detail completeness, and is never labelled as a trust or verification score |
| RMAP-AC-218 | web | **Given** an absent company field **When** the submission modal renders **Then** the row reads "not entered" rather than appearing blank |
| RMAP-AC-201 | web | **Given** the submission viewer **When** its actions render **Then** document requests are offered while confirm-availability and request-another-machine are absent |
| RMAP-AC-202 | web | **Given** an off-platform submission **When** the bottom bar renders **Then** it is read-only: the price and breakdown show, accept and counter-offer are absent, and the reason is stated inline |
| ~~RMAP-AC-225~~ | ~~web~~ | **WITHDRAWN 2026-08-06 — no distance filter (§6.10).** Was: **Given** the bid list **When** it first loads **Then** no distance filter is applied — the default band is "all" |
| ~~RMAP-AC-226~~ | ~~web~~ | **WITHDRAWN 2026-08-06 — no distance filter (§6.10).** Was: **Given** a distance band is selected **When** the list and map render **Then** both apply the same band, and the active band is displayed with a "N of M offers" count |
| ~~RMAP-AC-227~~ | ~~web~~ | **WITHDRAWN 2026-08-06 — no distance filter (§6.10).** Was: **Given** a bid whose `locationSource` is `none` **When** any distance band is active **Then** it remains listed — unknown distance is never treated as far |
| ~~RMAP-AC-228~~ | ~~web~~ | **WITHDRAWN 2026-08-06 — no distance filter (§6.10).** Was: **Given** an active distance band **When** the renter clears it **Then** it takes one action, and all offers return |
| ~~RMAP-AC-204~~ | ~~web~~ | **WITHDRAWN 2026-08-06 — no distance filter (§6.10).** Was: **Given** a distance filter is applied to the map **When** off-platform submissions are considered **Then** they are excluded from the filter's scope and remain listed, rather than being silently dropped as though they were far away |
| RMAP-AC-205 | app-backend | **Given** a `rentee_request` whose derived state is still unanswered **When** the supplier's surfaces render **Then** the card and its notification keep surfacing until the derived state resolves — with no stored status column, the persistence is recomputed, not remembered |
| RMAP-AC-203 | web | **Given** a submission that has been converted **When** the renter's surfaces render **Then** it appears once, as an ordinary bid, and not also as a submission |
| RMAP-AC-192 | web | **Given** a machine whose yard is confirmed but which is unavailable on the requested dates **When** the panel renders **Then** it still shows confirmed availability — this is the accepted approximation of §6.9.4, not a defect |
| RMAP-AC-190 | web | **Given** no realtime mechanism exists **When** the renter opens the page, refocuses the window, or sends a request **Then** the data refetches — these three triggers are the whole freshness mechanism, not a fallback |
| RMAP-AC-229 | web | **Given** the bid list **When** it renders **Then** a manual refresh affordance is available, since nothing else guarantees freshness while the page sits open |
| RMAP-AC-230 | web | **Given** any copy about arrival or a state change **When** it is written **Then** it never implies instantaneous updating |
| RMAP-AC-231 | web | **Given** one supplier holding **two bids on the same item** **When** the chat tabs render **Then** both appear — neither room is unreachable — and the two same-labelled tabs are disambiguated by machine (serial or model), never by rate |
| RMAP-AC-232 | app-backend | **Given** the fleet endpoint **When** `yardConfirmed` is resolved **Then** it comes from **this bid's** `unitsOffered` entry, never from the equipment listing; a machine with `inBid: false` reports `false`, not null and not the listing's value |
| RMAP-AC-233 | app-backend | **Given** a fleet machine **When** its coordinates are chosen **Then** confirmed uses the **bid entry's yard** and unconfirmed the machine's **registered yard** (§7.3), so a green pin never sits at a location the supplier did not commit to for this offer |
| RMAP-AC-234 | app-backend | **Given** the fleet endpoint **When** it returns a machine **Then** each carries the full `offeredUnitsDetail` shape — `documents[]` and `photos[]` — so the same payload fills both the readiness bar and the document tab of a not-in-offer machine, with no second fetch on tab switch |
| ~~RMAP-AC-12~~ | ~~app-backend~~ | **WITHDRAWN — there is no bid-events token** (§7.5 withdrawn); `canAccessRequest`/T6 is still enforced by `getBidList`. Was: **Given** a user who fails `canAccessRequest` **When** they request a bid-events token for that request **Then** it is refused with `FORBIDDEN` |
| ~~RMAP-AC-13~~ | ~~app-backend~~ | **WITHDRAWN — there is no bid-events token** (§7.5 withdrawn); `canAccessRequest`/T6 is still enforced by `getBidList`. Was: **Given** an active member of the request's owning company **When** they request a token **Then** it is granted, matching `getBidList`'s T6 behaviour |
| ~~RMAP-AC-14~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Was: a bid whose units share one location draws exactly one badged pin. Suppliers are no longer pinned at all (§6.2); machines are. |
| ~~RMAP-AC-15~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Was: a multi-location bid collapses to one pin with a range. Same reason as AC-14. |
| ~~RMAP-AC-16~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Was: pins fan out per location on selection. Bids are no longer pinned; machines are, individually (§6.2). |
| ~~RMAP-AC-17~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Was: selecting a sibling pin selects the whole bid. A machine pin now selects **that machine** — it is the machine panel's subject (§6.3). |
| RMAP-AC-18 | web | **Given** a unit with `locationSource: 'unit_yard'` **When** rendered **Then** it shows the confirmed indicator; **Given** any of `bid_pin`/`bid_yard`/`listing_yard` **Then** it shows the not-confirmed indicator, distinguishable on both pin and list card |
| RMAP-AC-19 | web | **Given** a bid with `locationSource: 'none'` (including off-platform bids) **When** the map renders **Then** no pin is drawn, the card is tagged "Location not shared / لم يُشارك الموقع", and it is excluded from distance sorting |
| ~~RMAP-AC-20~~ | ~~web~~ | **SUPERSEDED — do not implement.** Was: distance bands coloured green/amber/slate. Colour means **availability** (§6.9.1); distance is a filter with bands 50/100/200 km (§6.10), and those bands carry no colour. |
| RMAP-AC-21 | web | **Given** a request with no `projectLat/Lng` **When** the map renders **Then** machine pins still plot on supplier selection, every distance reads "—" and never 0, and the nearest sort is disabled rather than ordering arbitrarily |
| RMAP-AC-22 | web | **Given** a multi-item RFQ **When** item *N* is selected in the strip **Then** only that member request's bids are listed and only its suppliers' fleets are plottable, and the count badge matches; there is no all-items view |
| RMAP-AC-23 | web | **Given** a single-item RFQ **When** the map opens **Then** no item strip renders |
| RMAP-AC-24 | web | **Given** the bid list **When** sorted by nearest **Then** null-distance bids sort last, never first; the price sort — the default — is unaffected by null distance. Only these two sorts exist; **rating is retired** (§6.2) |
| ~~RMAP-AC-25~~ | ~~web~~ | **WITHDRAWN — there is no subscription and no `bid.created` event** (§7.5). New bids surface on refetch (AC-169, AC-190). |
| ~~RMAP-AC-26~~ | ~~web~~ | **WITHDRAWN — no subscription, therefore no poll fallback** (§7.5.1). |
| ~~RMAP-AC-27~~ | ~~web~~ | **WITHDRAWN — nothing to suspend; there is no background channel** (§7.5.1). |
| ~~RMAP-AC-28~~ | ~~web~~ | **SUPERSEDED — do not implement.** Was: activating a pin opens that bid's deal room. Selecting a supplier reveals his fleet and enables chat in place (§6.2); the renter never leaves the map. |
| RMAP-AC-29 | web | **Given** a request with zero bids **When** the map opens **Then** the site pin renders alone with an empty state and no bid panel |
| RMAP-AC-30 | web | **Given** Arabic locale **When** the map renders **Then** the shell is RTL, the panel sits on the inline-end edge, pin content sets `direction:rtl`, and numerals follow the existing convention |
| RMAP-AC-31 | web | **Given** no bid is selected **When** the map renders **Then** the footer price bar is not rendered at all — no aggregate, average or "best offer" state exists |
| RMAP-AC-32 | web | **Given** a bid is selected **When** the footer renders **Then** every monetary figure comes from `computeDealTotals(room)` and matches the deal-room page's own bar for the same room, figure for figure |
| RMAP-AC-32b | web | **Given** a deal of more than one unit **When** the footer renders **Then** the hero shows the rate per period with a per-unit / all-units toggle defaulting to **per unit**, computed as `priceAll ? rate * units : rate` — never by dividing the grand total |
| RMAP-AC-32c | web | **Given** a single-unit deal **When** the footer renders **Then** no toggle renders |
| RMAP-AC-32d | web | **Given** the toggle is switched **When** the breakdown is open **Then** mob, demob, VAT and the totals are unchanged — the toggle affects the hero rate only |
| RMAP-AC-33 | web | **Given** a selected bid **When** the footer renders **Then** its status and turn prompt derive from `room.status` and `myTurn`, matching the deal-room page for the same room |
| RMAP-AC-34 | web | **Given** the footer's negotiate action **When** activated **Then** the existing counter flow opens and submits through `submitCounter` — no alternative negotiation path |
| RMAP-AC-35 | web | **Given** the footer's accept action **When** activated **Then** the existing accept flow opens and `doAccept` receives `contractType` + `termResolutions` from its Summary step |
| RMAP-AC-36 | web | **Given** a selected off-platform (converted/link) bid **When** the footer renders **Then** it shows the flat `quotedTotal` with no rental/mob/demob breakdown rows |
| RMAP-AC-37 | web | **Given** a bid offering more units than it identifies machines **When** its **row and composition bar** render — bids are not pinned (§4) **Then** both counts appear and are labelled distinctly — offered vs identified — and no element presents the offered count as a number of machines |
| ~~RMAP-AC-38~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Was: unidentified units render as one hollow marker. §6.2 is normative: **claimed units are never drawn**; their count lives in the composition bar (§6.3.2). |
| ~~RMAP-AC-39~~ | ~~web~~ | **SUPERSEDED 2026-08-04 — do not implement.** Depended on AC-38's hollow marker, which is never drawn. |
| RMAP-AC-40 | web | **Given** a unit whose `locationSource` is `unit_yard` **When** the equipment panel renders **Then** it shows that unit's own serial, year, certificates, photos and yard — not the bid's primary machine |
| ~~RMAP-AC-41~~ | ~~web~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| RMAP-AC-42 | web | **Given** a bid declaring a certificate that a specific offered machine lacks **When** the panel renders that machine **Then** the discrepancy is stated explicitly |
| RMAP-AC-43 | web | **Given** the equipment panel **When** it renders **Then** it exposes no accept, swap or request action — it is read-only |
| ~~RMAP-AC-44~~ | ~~web~~ | **WITHDRAWN — orphaned by §7.6.** Per-unit binding is not persisted (`agreedUnitIds` withdrawn, no new column), and the backend half (AC-47→51) is already gone, so this UI would have had nowhere to send its output. Which machines are supplied is settled with the supplier in chat. |
| ~~RMAP-AC-45~~ | ~~web~~ | **WITHDRAWN — orphaned by §7.6.** Per-unit binding is not persisted (`agreedUnitIds` withdrawn, no new column), and the backend half (AC-47→51) is already gone, so this UI would have had nowhere to send its output. Which machines are supplied is settled with the supplier in chat. |
| ~~RMAP-AC-46~~ | ~~web~~ | **WITHDRAWN — orphaned by §7.6.** Per-unit binding is not persisted (`agreedUnitIds` withdrawn, no new column), and the backend half (AC-47→51) is already gone, so this UI would have had nowhere to send its output. Which machines are supplied is settled with the supplier in chat. |
| ~~RMAP-AC-47~~ | ~~app-backend~~ | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6: the quotation agrees *how many*, never *which*). |
| ~~RMAP-AC-48~~ | ~~app-backend~~ | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6: the quotation agrees *how many*, never *which*). |
| ~~RMAP-AC-49~~ | ~~app-backend~~ | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6: the quotation agrees *how many*, never *which*). |
| ~~RMAP-AC-50~~ | ~~app-backend~~ | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6: the quotation agrees *how many*, never *which*). |
| ~~RMAP-AC-51~~ | ~~app-backend~~ | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6: the quotation agrees *how many*, never *which*). |
| RMAP-AC-55 | web | **Given** an identified unit **When** it renders on **its machine pin and in the panel** — not on the bid row, which is a bid **Then** it shows a readiness band (`green`/`yellow`/`red` from `computeBidReadiness`) **and** a separate yard-confirmed indicator, as two independent signals |
| RMAP-AC-56 | web | **Given** a bid with exactly one unit **When** it renders **Then** both indicators still show — neither is conditional on the bid being multi-unit |
| RMAP-AC-57 | web | **Given** a unit that is fully documented but whose yard is unconfirmed (or the reverse) **When** it renders **Then** the two indicators disagree visibly and neither is masked by the other |
| RMAP-AC-58 | web | **Given** an unidentified unit **When** it renders **Then** it shows neither indicator — no readiness band, no yard state |
| RMAP-AC-59 | web | **Given** an off-platform bid (no `offeredUnitsDetail`, `computeBidReadiness` → null) **When** it renders **Then** readiness shows as unavailable, never as `red` |
| RMAP-AC-60 | web | **Given** the documents panel **When** it opens **Then** it renders a company tab (from `supplierProfile` via `fetchDealRoomDocuments.companyDocuments`) and an equipment tab, each with a badge counting documents needing action |
| RMAP-AC-61 | web | **Given** a multi-unit bid **When** the renter selects a different unit pin **Then** the equipment tab re-scopes to that machine's own `documentKeys`; it must **not** read the deal-room endpoint's `equipmentDocuments`, which returns only the bid's primary machine |
| RMAP-AC-61b | web | **Given** the company tab **When** the renter selects a different unit pin **Then** it does **not** change — company documents describe the supplier, not a machine |
| ~~RMAP-AC-61c~~ | ~~web~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| ~~RMAP-AC-61f~~ | ~~app-backend~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| ~~RMAP-AC-61g~~ | ~~app-backend~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| ~~RMAP-AC-61d~~ | ~~app-backend~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| ~~RMAP-AC-61e~~ | ~~app-backend~~ | **WITHDRAWN — contradicts §7.14.** Ownership documents are **fully viewable** by the renter with a working control (AC-101→103). This row encodes the hide-and-filter design that §7.11 withdrew. |
| RMAP-AC-62 | web | **Given** documents are ticked **When** the renter presses Download **Then** each ticked document downloads via its presigned `url`; no merged PDF is produced |
| RMAP-AC-63 | web | **Given** documents are ticked **When** the renter presses Request **Then** the chat opens with a prefilled message naming exactly those documents, and nothing is persisted as a request record |
| RMAP-AC-64 | web | **Given** the supplier subsequently uploads a requested document **When** the next **refetch** returns (mount, focus, or post-send — §7.5.1) **Then** the readiness and document counts update with no further action |
| RMAP-AC-65 | web | **Given** both surfaces are visible **When** the readiness count and the document count differ **Then** each is labelled by its own question and neither is presented as a subset of the other |
| RMAP-AC-66 | web | **Given** a supplier with two or more bids in the same RFQ group **When** the chat panel opens **Then** it shows one tab **per bid**, keyed by `bidId` and labelled by item, each mounting that bid's own deal-room channel |
| RMAP-AC-67 | web | **Given** a supplier with exactly one bid in the RFQ group **When** the chat panel opens **Then** no tab strip renders — the conversation shows directly |
| RMAP-AC-68 | web | **Given** an unread message on an item the renter is not currently reading **When** the chat panel renders **Then** that item's tab carries an unread badge |
| RMAP-AC-69 | web | **Given** a tab whose bid has no deal room yet (`dealRoomId` null) **When** the renter opens it **Then** the existing create-or-fetch path runs, identically to opening that bid elsewhere |
| RMAP-AC-70 | web | **Given** two bids from different members of the same supplier company (`supplierCompanyId` equal) **When** chats are grouped **Then** they group as one counterparty, not two |
| RMAP-AC-71 | web | **Given** the renter switches chat tab **When** the tab changes **Then** the map view and item strip selection are unchanged |
| RMAP-AC-72 | web | **Given** the renter opens the map view **When** it first renders **Then** only the project-location pin is drawn — no supplier pins and no equipment pins |
| RMAP-AC-73 | web | **Given** the first screen **When** it renders **Then** a scrollable bid list appears **floating over** the map on the inline-end edge — not beside it, and never replaced in any later state (prototype `#dpGuide`, design.md §1) — sorted cheapest-rate first by default |
| RMAP-AC-74 | web | **Given** the bid list **When** the renter selects a supplier **Then** that row becomes active, the others visibly recede, and the selection is single — picking another replaces it |
| RMAP-AC-75 | web | **Given** a supplier is selected **When** the map updates **Then** that supplier's qualifying machines appear and no other supplier's machines are drawn |
| RMAP-AC-76 | web | **Given** a machine whose yard is confirmed in bid readiness **When** its pin renders **Then** it is green; **Given** an unconfirmed machine **Then** it is red, positioned at the yard recorded when it was added to the fleet |
| RMAP-AC-77 | web | **Given** claimed units (offered count exceeding the supplier's machines) **When** the map renders **Then** none are drawn, and the shortfall is stated in the info box and the panel |
| RMAP-AC-78 | web | **Given** a machine the supplier owns but did not include in the offer **When** its pin renders **Then** it is visually distinct from an in-offer machine |
| RMAP-AC-79 | web | **Given** each machine pin **When** it renders **Then** it carries a readiness bar showing documents present against documents this request requires |
| RMAP-AC-80 | web | **Given** each machine pin **When** it renders **Then** it uses the request item's taxonomy image, falling back to the category image then a generic icon — never a broken image |
| RMAP-AC-81 | web | **Given** a machine is selected **When** it renders **Then** it carries a selection indicator distinguishing it from its siblings, and exactly one machine is selected at a time |
| RMAP-AC-82 | web | **Given** no supplier is selected **When** the rail renders **Then** chat is unavailable; **Given** a supplier is selected **Then** chat becomes available |
| RMAP-AC-83 | web | **Given** a machine is selected **When** its panel opens **Then** identity, fit against the request, readiness, **that machine's** documents and availability all appear in one panel — no eligibility/verification split |
| RMAP-AC-84 | web | **Given** the machine panel **When** it renders **Then** company documents are its **third tab** (§6.3.4), scoped to the supplier while the other two tabs are scoped to the machine — they are **not** on a separate supplier surface, and §6.4 carries profile only |
| RMAP-AC-85 | web | **Given** an in-offer machine whose yard is **not** confirmed **When** its panel renders **Then** the availability & fit tab shows **exactly two stacked full-width request rows** — «اطلب تأكيد التوفّر» then «اطلب معدّة أخرى» — under a lead-in stating both may be sent, and «اطلب تأكيد التوفّر» appears in **exactly one place** in the panel (§6.3.6) |
| RMAP-AC-86 | web | **Given** an in-offer machine whose yard **is** confirmed **When** its panel renders **Then** «اطلب تأكيد التوفّر» is absent and **one** row remains — «اطلب معدّة أخرى», which is always available (§6.3.6) |
| RMAP-AC-87 | web | **Given** a machine the supplier owns but did **not** offer **When** its panel renders **Then** the request offered is an `alternative` (§6.7.1) — there is **no** *add to the offer* action, because no surface may compose the retired `add_to_offer` kind (AC-182) |
| RMAP-AC-88 | web | **Given** a document is wanted **When** the renter looks for how to ask **Then** the request is raised **per row inside the document tabs** (§6.7.2) — there is no document action in the request rows and no separate picker; §6.3.6 states there is now exactly one route where three once existed |
| RMAP-AC-89 | web | **Given** either request row, or a document request raised from a document tab **When** triggered **Then** the chat opens with the request card pre-composed and **unsent**, and the renter sends it explicitly |
| RMAP-AC-90 | web | **Given** a request is sent **When** the message is built **Then** it carries `{type:'rentee_request', kind, equipmentId, serial}` plus `docType` for a document request — the machine travels as data, not only in the text |
| RMAP-AC-91 | app-backend | **Given** a rentee request card is posted **When** it reaches Stream **Then** it uses the existing `customData` channel and a new card `type`, leaving the existing vocabulary (`term_accepted`, `counter`, `term_updated`, `rate_proposal`, `rate_response`) unchanged |
| RMAP-AC-92 | app-backend | **Given** the new card type **When** unread counting runs **Then** its membership of `UNREAD_INFLATING_CARD_TYPES` is an explicit decision, not an accident of omission |
| RMAP-AC-93 | app-backend | **Given** a card whose `equipmentId` is not a machine the bidding supplier owns, or does not match the request item **When** it is submitted **Then** it is rejected |
| RMAP-AC-94 | app-backend | **Given** a renter and a supplier who has bid on their request **When** the fleet endpoint is called **Then** it returns that supplier's active matching machines with `equipmentId`, `serialNumber`, `year`, `yardName`, `lat`, `lng`, `distanceKm`, `yardConfirmed`, `inBid` and document presence |
| RMAP-AC-95 | app-backend | **Given** a supplier who has **not** bid on the request **When** the fleet endpoint is called for them **Then** it is refused — this must not become a way to browse an arbitrary company's fleet |
| RMAP-AC-96 | app-backend | **Given** a company member's firm-shared machines **When** the fleet is listed **Then** they are included via `ownerScopeWhere`, and no other company's machines are |
| RMAP-AC-97 | web | **Given** the supplier confirms a yard after an availability request **When** the next **refetch** returns (§7.5.1) **Then** the pin recolours and the request card resolves, with no other input |
| RMAP-AC-98 | web | **Given** Arabic locale **When** list, map and panel render **Then** the layout is RTL, the list sits on the correct inline edge, and pin content sets `direction:rtl` |
| RMAP-AC-99 | web | **Given** a request with no bids **When** the map view opens **Then** the project pin renders alone with an empty-state message and no list rows |
| RMAP-AC-100 | web | **Given** a selected supplier with **no** locatable machines (all claimed, or every yard deleted) **When** the map updates **Then** no machine pins are drawn and the panel states why, rather than showing an empty map with no explanation |
| RMAP-AC-101 | app-backend | **Given** the renter fetches bids **When** `offeredUnitsDetail` is built **Then** ownership document types (istimara, customs, customs_card, sale_contract, sales_contract, saso_registration) are included in `documentKeys` with usable urls |
| RMAP-AC-102 | app-backend | **Given** the ownership filter is removed **When** the code is reviewed **Then** the "must never surface on rentee screens" rule in `rentee.service.ts` has been deleted or rewritten — not left contradicting the behaviour |
| RMAP-AC-103 | web | **Given** a machine with ownership documents **When** the machine panel renders **Then** each is listed with a working View/Download control, like any other document |
| RMAP-AC-104 | app-backend | **Given** a `rentee_request` card is posted **When** unread counting runs **Then** it inflates the supplier’s unread badge |
| RMAP-AC-105 | app-backend | **Given** a `rentee_request` card is posted **When** notifications are dispatched **Then** the supplier receives one carrying the same `equipmentId`, so the request is actionable without opening the room |
| RMAP-AC-106 | app-backend | **Given** a renter sends several requests in quick succession **When** notifications are dispatched **Then** they coalesce rather than arriving as one ping per request |
| RMAP-AC-107 | app-backend | **Given** two suppliers each own a listing carrying the identical `serialNumber` **When** a `rentee_request` naming one `equipmentId` is posted **Then** it resolves to exactly that listing, and the other supplier's listing is never matched |
| RMAP-AC-108 | app-backend | **Given** a `rentee_request` whose `equipmentId` belongs to a listing the bidding supplier does not own **When** the card is posted **Then** it is rejected with `403`, and no message is written to the channel |
| ~~RMAP-AC-109~~ | ~~app-backend~~ | **WITHDRAWN — `add_to_offer` is retired** (§6.7.1); `alternative` covers the intent. |
| RMAP-AC-110 | app-backend | **Given** `scope: 'equipment'` with a null `equipmentId`, or `scope: 'company'` with a non-null one **When** the card is posted **Then** it is rejected with `400` |
| RMAP-AC-111 | app-backend | **Given** a `rentee_request` is posted **When** the response returns **Then** it carries a backend-minted `ref` and the Stream `message.id`, so a reply can thread to it via `parent_id` |
| RMAP-AC-112 | app-backend | **Given** a supplier reply card carries `{ inReplyTo, equipmentId, resolution: 'declined' }` **When** it is stored **Then** both fields survive round-trip, so a refusal is representable even though it changes no state |
| RMAP-AC-113 | web | **Given** a sent `rentee_request` card **When** the chat renders **Then** the machine's image, name and serial are resolved from `equipmentId` at render time, not read from the message text |
| RMAP-AC-114 | web | **Given** an availability request whose unit later flips `yardConfirmed` to true **When** the chat re-renders **Then** the card's status line reads answered, with no reply message and no stored status |
| RMAP-AC-115 | web | **Given** a document request naming three types, one of which is now present **When** the card renders **Then** the status line reads 1/3, recomputed from the unit's current `documentKeys` |
| RMAP-AC-116 | web | **Given** the renter ticks four documents in the machine panel **When** they send **Then** exactly one card is posted carrying all four in `docTypes` |
| RMAP-AC-117 | web | **Given** a company-documents request **When** the card is composed **Then** it carries `scope: 'company'` with a null `equipmentId` and renders under the supplier's identity, not a machine's |
| RMAP-AC-118 | web | **Given** a composed but unsent request **When** it is displayed for review **Then** it renders through the same component as the sent message, so review and delivery cannot diverge |
| RMAP-AC-119 | web | **Given** a supplier unit built before the request's minimum year **When** the machine panel opens on that unit **Then** the fit gate is raised for that unit and cleared when a compliant unit is selected — the grid follows the unit, not the request item template |
| RMAP-AC-120 | web | **Given** a document list longer than the panel **When** the renter scrolls it **Then** the select-all bar and the request/download footer stay visible |
| RMAP-AC-121 | web | **Given** an `alternative` request, whose kind has no observable counterpart, and a supplier reply echoing `resolution: 'declined'` **When** the request card renders **Then** it reads refused — not "waiting for the supplier" |
| RMAP-AC-122 | web | **Given** a derivable request kind and an echoed `resolution` that disagrees with the machine's state **When** the card renders **Then** the derived state wins over the echo |
| ~~RMAP-AC-123~~ | ~~web~~ | **WITHDRAWN — `add_to_offer` is retired** (§6.7.1). |
| RMAP-AC-124 | web | **Given** a reply arrives while the chat panel is **not** the visible panel **When** it lands **Then** an in-view notification appears carrying the request's `ref` and the machine's serial, and the rail chat button shows an unread count |
| RMAP-AC-125 | web | **Given** a reply arrives while the chat panel **is** visible **When** it lands **Then** no notification is shown and no unread count accrues |
| RMAP-AC-126 | web | **Given** an unread count and a visible notification **When** the renter opens the chat **Then** both clear in that one action |
| RMAP-AC-127 | web | **Given** a reply echoing `resolution: 'declined'` **When** the notification renders **Then** it is colour-keyed to refusal, not to success |
| RMAP-AC-128 | web | **Given** the supplier confirms a yard and sends **no** message **When** the renter is on the map **Then** the pin recolours, the availability legend recounts, and the notification still fires — it is triggered by the state change, not by a message |
| RMAP-AC-129 | web | **Given** the colour key is shown **When** it renders **Then** it presents exactly **one** scale — green confirmed, red not confirmed — and no supplier-level aggregate (§6.9.1) |
| RMAP-AC-130 | web | **Given** the single colour scale **When** its labels are compared across map states **Then** no meaning is represented by two different colours — the pre-selection and post-selection legends must teach the same green/red, never red then amber (§6.9.1) |
| RMAP-AC-131 | web | **Given** a supplier is selected, so machine pins are on the map **When** the renter looks for the colour key **Then** it is visible and not occluded by the bid-list panel in either LTR or RTL |
| RMAP-AC-132 | web | **Given** the colour key **When** the panel first renders **Then** it is collapsed, and expanding it does not scroll the bid list out of view |
| RMAP-AC-133 | web | **Given** a machine whose yard is **not** confirmed **When** its panel opens **Then** the first thing shown is a sentence naming the actor and cause, explicitly stating that unconfirmed does **not** mean unavailable, with the request-confirmation action inline |
| RMAP-AC-134 | web | **Given** a machine whose yard **is** confirmed **When** its panel opens **Then** the sentence states that the supplier confirmed it and that the location shown is the one he confirmed |
| RMAP-AC-135 | web | **Given** the availability explanation carries the request action **When** the actions row renders **Then** it does not also offer an availability request — one intent, one button |
| RMAP-AC-136 | web | **Given** the yard indicator tile **When** it renders **Then** its label names what is being measured (was the yard confirmed by the supplier) rather than showing a bare adjective |

**Bottom bar (§6.1) — scope**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-137 | web | **Given** the deal-room bottom bar **When** this feature ships **Then** its layout, hero, toggle, breakdown and actions are unchanged from the shipped `DealRoom` bar — the prototype's "gap track" is not implemented |
| RMAP-AC-138 | web | **Given** no counter-offer has been made **When** the bar renders **Then** the negotiate action reads `اطلب سعراً أقل` |
| RMAP-AC-139 | web | **Given** the renter's offer is with the supplier **When** the bar renders **Then** the action reads `عرضك لدى المؤجّر`, and once he replies it reads `راجع وردّ` |

**Machine panel structure (§6.3)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-140 | web | **Given** a machine is selected **When** the panel renders **Then** the availability chip is a **filled** solid green or solid red pill, and its colour equals that machine's pin colour on the map |
| RMAP-AC-141 | web | **Given** the availability tab **When** it renders **Then** the equipment photos appear first, above the spec-match grid and the requests |
| RMAP-AC-142 | web | **Given** the availability tab **When** it renders **Then** neither the red "does not match" banner nor the two-tile status card is present |
| RMAP-AC-143 | web | **Given** an offer covering more than one unit **When** the panel renders **Then** a composition bar shows confirmed / unconfirmed / unregistered as proportional segments with the count printed in each |
| RMAP-AC-144 | web | **Given** a composition bucket whose count is zero **When** the bar renders **Then** that segment is omitted entirely, not drawn as an empty or zero-width segment |
| RMAP-AC-145 | web | **Given** unregistered units in the offer **When** the composition bar renders **Then** that segment is a hatched fill (not a transparent outline) and a footnote states they carry no serial, documents or location and appear on neither the map nor the machine list |
| RMAP-AC-146 | web | **Given** any unit count **When** it is rendered as text **Then** it uses one literal form — `١ وحدة`, `٢ وحدة`, `٣ وحدة` — with no grammatical pluralisation |
| RMAP-AC-147 | web | **Given** a supplier with more than one registered machine **When** the chips render **Then** each is labelled with that machine's serial and year, and no chip reads `وحدة N` |
| RMAP-AC-148 | web | **Given** unregistered units **When** the chips render **Then** they produce no chip — there is nothing to select |
| RMAP-AC-149 | web | **Given** the availability tab **When** the two requests render **Then** they are stacked full-width rows under a lead-in stating both may be sent, not two buttons side by side |
| RMAP-AC-150 | web | **Given** an unconfirmed machine **When** the panel renders **Then** `اطلب تأكيد التوفّر` appears exactly once in the whole panel |
| RMAP-AC-151 | web | **Given** a confirmed machine **When** the panel renders **Then** the availability request is absent and `اطلب معدّة أخرى` is still offered |

**Documents (§6.7.2)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-152 | web | **Given** a document that does not exist **When** its row renders **Then** it offers `+ طلب` inline, requestable without ticking anything |
| RMAP-AC-153 | web | **Given** a document that exists **When** its row renders **Then** it offers download, not a request |
| RMAP-AC-154 | web | **Given** a selection containing at least one already-provided document **When** the renter sends **Then** the send is held and a confirmation names the provided ones and offers *request only the missing* / *request all* / *cancel* |
| RMAP-AC-155 | web | **Given** that confirmation and *request only the missing* **When** the card is composed **Then** the already-provided types are absent from `docTypes` |
| RMAP-AC-156 | web | **Given** every selected document is already provided **When** the renter sends **Then** *request only the missing* is not offered and the renter is told the selection is already available |
| RMAP-AC-157 | web | **Given** the confirmation is open **When** the panel renders **Then** the normal request footer is hidden — one send is offered, not two |
| RMAP-AC-158 | web | **Given** a document list longer than the panel **When** it is scrolled **Then** the select-all bar and the action footer both remain visible |

**Request wording (§6.7.3)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-159 | web | **Given** the *request another machine* action **When** the card is composed **Then** its text names the equipment type, contains neither the machine's serial nor the word `بدل`, and the card still carries that machine's `equipmentId` |

**Notification surfaces (§6.8)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-160 | web | **Given** an arrival while the chat panel is not visible **When** it lands **Then** a filled, high-contrast bubble is anchored to the chat icon with a tail pointing at it |
| RMAP-AC-161 | web | **Given** the bubble is dismissed with ✕ **When** a NEW arrival lands **Then** the bubble reappears |
| RMAP-AC-162 | web | **Given** a refusal **When** the bubble renders **Then** it is colour-keyed to refusal, not to success |
| RMAP-AC-163 | web | **Given** more than one arrival pending **When** the bubble renders **Then** it shows the newest plus a `+N` count |
| RMAP-AC-164 | web | **Given** an arrival is pending and **no** supplier is selected **When** the rail renders **Then** the chat button is still present, badged, and opens the room the arrival came from |
| RMAP-AC-165 | web | **Given** arrivals from two different suppliers **When** the renter opens one supplier's chat **Then** only that supplier's arrivals are marked read |
| RMAP-AC-166 | web | **Given** a new bid arrival **When** notices render **Then** it uses the transient popup, not the conversation bubble |

**Colour semantics (§6.9)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-167 | web | **Given** the colour key **When** it renders **Then** it presents exactly ONE scale — green confirmed, red not confirmed — and contains no supplier-level aggregate scale |
| RMAP-AC-168 | web | **Given** an unconfirmed machine **When** its pin, its chip, its panel header chip and the composition bar are compared **Then** all four are red |

**Live bid arrival (§6.11)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-169 | web | **Given** a new bid arrives **When** a refetch returns it (mount, focus, or post-send — §7.5.1) **Then** the list grows and the header and top-bar counts increment. It adds **no pins** — bids are not plotted (§6.2) — and nothing appears without a refetch (AC-190) |
| RMAP-AC-170 | web | **Given** cheapest-first sorting and an arriving bid cheaper than some existing offers **When** it lands **Then** the list re-sorts so the row sits in price order — it does not append |
| RMAP-AC-171 | web | **Given** a newly arrived bid **When** the list renders **Then** its row carries a temporary "just arrived" marker |
| RMAP-AC-172 | web | **Given** the arrival notice **When** the renter clicks it **Then** the row is scrolled into view and pulsed, the popup is dismissed, and no supplier is selected and no panel is opened |
| RMAP-AC-173 | web | **Given** the arrival notice **When** its text renders **Then** the comparison against existing offers is computed from their rates, never asserted — a bid that is not the cheapest must not claim to be |

**Rail (§6.3, §6.8.3)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-174 | web | **Given** no supplier selected and nothing pending **When** the rail renders **Then** it is absent entirely — no dimmed buttons |
| RMAP-AC-175 | web | **Given** a supplier is selected but no machine **When** the rail renders **Then** the chat button is present and the equipment button is not |
| RMAP-AC-176 | web | **Given** a machine is selected **When** the rail renders **Then** the equipment button appears |
| RMAP-AC-177 | web | **Given** a machine is selected **When** the renter switches to a different supplier **Then** the machine selection is cleared — a choice does not carry across fleets |

**Edge cases (§6.3.7, §6.7.1)**

| ID | Layer | Given / When / Then |
|---|---|---|
| RMAP-AC-178 | web | **Given** an offer with no registered machine at all **When** the availability or equipment-documents tab renders **Then** it shows an explicit empty state naming the cause, and renders neither a photo strip nor a spec-match grid |
| RMAP-AC-179 | web | **Given** that same offer **When** the company-documents tab renders **Then** it works normally |
| RMAP-AC-180 | web | **Given** that same offer **When** the rail renders **Then** the equipment button is present, so the company-documents tab stays reachable |
| RMAP-AC-181 | web | **Given** that same offer **When** the renter uses the empty state's action **Then** an `alternative` request is composed with a null `equipmentId`, asking the supplier to attach registered machines |
| RMAP-AC-182 | both | **Given** a request card with `kind: 'add_to_offer'` **When** it is composed or received **Then** it is rejected — the kind is retired and no surface produces it |

**Superseded by the 2026-08-04 revision** (kept, not deleted, since they were approved earlier):
`AC-14`/`AC-15` — collapsed-then-fan-out supplier pins; suppliers are no longer pinned.
`AC-31`→`AC-36`: read *bid selection* as **supplier selection** throughout — the footer appears when a supplier is selected (§6.1). No other clause in those rows changes.
`AC-60`→`AC-65`: read *documents panel* as **the machine panel's document tabs** (§6.3.4). The
supplier panel (§6.4).

## 9. Test cases

| ID | Satisfies | Layer | Where | Case |
|---|---|---|---|---|
| RMAP-TC-01 | AC-01 | app-backend | `apps/backend/src/tests/unit/rentee-unit-location.test.ts` | entry with `yardId` → `unit_yard` + that yard's coords/name/city |
| RMAP-TC-02 | AC-02, AC-03, AC-04 | app-backend | same | precedence table: assert each of `bid_pin`, `bid_yard`, `listing_yard` is chosen at the right level |
| RMAP-TC-03 | AC-05, AC-06 | app-backend | same | no coords anywhere → `none`; yard with null lng → `none`, not a half point |
| RMAP-TC-04 | AC-07 | app-backend | same | per-unit `distanceKm` equals `haversineKm(unit, project)` |
| RMAP-TC-05 | AC-08 | app-backend | same | two entries, same `equipmentId`, different yards → both returned |
| RMAP-TC-06 | AC-09 | app-backend | `.../rentee-bid-list.characterization.test.ts` | golden-file: bid-level `distanceKm` unchanged across a fixture set |
| RMAP-TC-07 | AC-10 | app-backend | `.../rentee-unit-location.test.ts` | `yardId` present + `yardConfirmed:false` → returns `false` |
| ~~RMAP-TC-08~~ | ~~AC-11~~ | — | — | **WITHDRAWN — no bid events are emitted** (§7.5). |
| ~~RMAP-TC-09~~ | ~~AC-12, AC-13~~ | app-backend | same | non-owner → `FORBIDDEN`; company member → granted |
| ~~RMAP-TC-10~~ | ~~AC-14, AC-15~~ | — | — | **WITHDRAWN — `groupPinsByLocation` has no caller.** Bids are not plotted and machines are drawn individually, so there is nothing to group (§6.2). |
| ~~RMAP-TC-11~~ | ~~AC-16, AC-17~~ | — | — | **WITHDRAWN — bids are not pinned and there is no fan-out** (§6.2). |
| RMAP-TC-12 | AC-18 | web | same | `unit_yard` → confirmed; each of the other three → not confirmed |
| RMAP-TC-13 | AC-19 | web | same | `none` → excluded from pins, present in list, excluded from distance sort |
| ~~RMAP-TC-14~~ | ~~AC-20~~ | — | — | **WITHDRAWN — no distance-coloured bands** (§6.9.1). Filter thresholds are covered by TC-125. |
| RMAP-TC-15 | AC-21 | web | same | null site → machine pins retained, distance null (not 0, not NaN), nearest sort reported unavailable |
| RMAP-TC-16 | AC-22, AC-23 | web | same | `bidsForItem` returns only that requestId's bids; single-item group → strip suppressed |
| RMAP-TC-17 | AC-24 | web | same | `sortBids('nearest')` puts nulls last — the key is `'price' | 'nearest'`; `dist` is the prototype's label id, not the contract's; the price order is unchanged by nulls; only these two sorts are exposed |
| ~~RMAP-TC-18~~ | ~~AC-25~~ | — | — | **WITHDRAWN — no event reducer exists** (§7.5). Refetch is covered by TC-108. |
| ~~RMAP-TC-19~~ | ~~AC-26, AC-27~~ | — | — | **WITHDRAWN — no poll scheduler exists** (§7.5.1). |
| ~~RMAP-TC-20~~ | ~~AC-28~~ | — | — | **WITHDRAWN — the renter does not navigate to a deal room from the map** (§6.2). |
| RMAP-TC-21 | AC-31 | web | `tests/unit/bid-map.test.ts` | footer visibility selector returns null with no selection, the room's totals with one |
| RMAP-TC-22 | AC-32 | web | `tests/unit/deal-room.test.ts` *(or existing totals suite)* | same room fixture → footer figures equal `computeDealTotals` output; no recomputation in the component layer |
| RMAP-TC-23 | AC-33 | web | same | status/turn mapping table over `status` × `lastCounterBy` |
| RMAP-TC-24 | AC-36 | web | `tests/unit/bid-map.test.ts` | link bid with `quotedTotal` and null rate → flat-total shape, breakdown rows suppressed |
| RMAP-TC-25 | AC-08 | app-backend | `.../rentee-unit-location.test.ts` | padded array `[A,A,B]` → 2 detail rows, offered count 3 |
| RMAP-TC-26 | AC-08b, AC-184 | app-backend | same | entry referencing another supplier's listing → no machine, no docs/photos/yard leaked, while `unitsOffered.length` still drives the offered count |
| ~~RMAP-TC-107~~ | ~~AC-11, AC-186~~ | — | — | **WITHDRAWN with §7.5** — no backend event to test. |
| RMAP-TC-108 | AC-190, AC-229, AC-230 | web | `tests/unit/bid-map.test.ts` | mount, focus and post-send each trigger a refetch; a manual refresh is exposed; no arrival copy asserts immediacy |
| RMAP-TC-112 | AC-193 | app-backend | `apps/backend/src/tests/handlers/get-request-submissions.test.ts` | the payload carries `city` and `company_documents` |
| RMAP-TC-113 | AC-194, AC-197, AC-198, AC-199 | web | `tests/unit/off-platform.test.ts` | row model: badge, city-not-distance, absent ETA/deals/verified; no pin; the distinct composition state; a one-button rail |
| RMAP-TC-119 | AC-208, AC-209 | web | `tests/unit/deal-room-docs.test.ts` | two selected → a prompt with both shapes and no download started; one selected → downloads with no prompt |
| RMAP-TC-120 | AC-210 | web | same | with merge disabled the prompt exposes only the separate-files path |
| RMAP-TC-114 | AC-196, AC-206, AC-207 | web | same | every off-platform money field carries a VAT label matching its source field; the cheapest badge is computed from rates and never from `grandTotal`; no conversion is applied |
| RMAP-TC-115 | AC-200, AC-201, AC-202, AC-218 | web | same | modal model contains every listed section and no message thread; availability/another-machine absent; bar model has no accept or counter action; an absent field yields the not-entered string |
| RMAP-TC-121 | AC-211, AC-212, AC-213, AC-214 | web | `tests/unit/off-platform.test.ts` | unknown fields resolve to em-dashes; measurement and year tiles carry the requirement label; no availability/readiness/yard/spec-match in the panel model; certs render as acknowledged, not verified |
| RMAP-TC-122 | AC-215, AC-216 | web | same | the breakdown exposes mob/demob/VAT scaled by units, and `subtotal + vat === total` for every fixture |
| RMAP-TC-124 | AC-222, AC-223, AC-224 | web | `tests/unit/vat-inclusive.test.ts` *(extend — 11 tests already pass)* | a tagged submission surfaces the note on bar and modal; displayed notes never contain the marker; no helper is duplicated |
| RMAP-TC-123 | AC-217, AC-219, AC-220, AC-221 | web | `tests/unit/bid-quality.test.ts` *(extend the existing suite if present)* | score matches `bid-quality.ts` for a fixture set; contact/company-name are excluded from the company part; photos-without-ownership scores 0.5 on the equipment part; the label carries no trust/verification wording |
| ~~RMAP-TC-125~~ | ~~AC-225→228~~ | web | `tests/unit/bid-map.test.ts` | default band is all; a band filters list and map identically and reports N of M; a `none`-location bid survives every band; clearing restores the full set |
| RMAP-TC-126 | AC-231, AC-66 | web | `tests/unit/bid-map.test.ts` | two bids from one supplier on one item → two tabs keyed by `bidId`, both reachable, labels disambiguated by serial and stable as rates change |
| RMAP-TC-127 | AC-232, AC-233 | app-backend | `.../rentee-unit-location.test.ts` | `yardConfirmed` reads the bid entry not the listing; `inBid:false` → false; confirmed emits the bid entry's yard and unconfirmed the registered yard, asserted where the two differ |
| RMAP-TC-128 | AC-234 | app-backend | same | fleet rows carry `documents[]` and `photos[]` matching the `offeredUnitsDetail` shape for both in-offer and not-in-offer machines |
| ~~RMAP-TC-117~~ | ~~AC-204~~ | web | `tests/unit/off-platform.test.ts` | applying a distance filter leaves off-platform rows listed and unfiltered |
| RMAP-TC-118 | AC-205 | app-backend | `.../stream-cards.test.ts` | an unanswered request keeps producing the supplier-side surfacing across repeated reads with no status column written |
| RMAP-TC-116 | AC-203 | web | same | a converted submission is excluded from the submission list and present in the bid list exactly once |
| RMAP-TC-110 | AC-191 | web | **manual** | the comment on `numberOfUnits` matches its assignment — a review check, not an assertion |
| RMAP-TC-111 | AC-192 | web | `tests/unit/bid-map.test.ts` | a unit with `yardConfirmed: true` resolves to confirmed regardless of any date input, documenting the approximation |
| ~~RMAP-TC-109~~ | ~~AC-187~~ | — | — | **WITHDRAWN with §7.5** — no Stream connection to share. |
| RMAP-TC-106 | AC-183, AC-185 | app-backend | `apps/backend/src/tests/services/bid-ownership.test.ts` | submit and edit both reject a foreign `equipmentId` in `unitsOffered` with `EQUIPMENT_OWNERSHIP` and write nothing; a same-company colleague's machine is accepted |
| RMAP-TC-27 | AC-37 | web | `tests/unit/bid-map.test.ts` | `unitCounts()`: offered 4 / identified 2 / unidentified 2 from a padded array |
| ~~RMAP-TC-28~~ | ~~AC-38, AC-39~~ | — | — | **WITHDRAWN — claimed units are never drawn** (§6.2); the count is asserted on the composition bar instead (TC-58). |
| RMAP-TC-29 | AC-40 | web | same | panel selector keyed by unit returns that unit's own serial/year/certs, not the bid primary's |
| ~~RMAP-TC-30~~ | ~~AC-41~~ | — | — | **WITHDRAWN — no `viewable:false` row exists** (§7.14). Viewability is asserted by TC-69/TC-70. |
| RMAP-TC-31 | AC-42 | web | same | bid declares TÜV, unit lacks it → discrepancy flag raised |
| ~~RMAP-TC-32~~ | ~~AC-44, AC-45~~ | — | — | **WITHDRAWN — no unit-selection modal exists** (§7.6). |
| ~~RMAP-TC-33~~ | ~~AC-47, AC-48, AC-49~~ | — | — | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6). |
| ~~RMAP-TC-34~~ | ~~AC-50~~ | — | — | **WITHDRAWN — the quotation agrees a count, not named machines** (§7.6). |
| ~~RMAP-TC-35~~ | ~~AC-51~~ | — | — | **WITHDRAWN — `agreedUnitIds` is not implemented** (§7.6). |
| RMAP-TC-36b | AC-32b, AC-32c, AC-32d | web | `tests/unit/bid-map.test.ts` | hero rate = `priceAll ? rate*units : rate`, defaults to per-unit; no toggle at units=1; mob/demob/VAT/totals identical across both toggle states |
| RMAP-TC-36 | AC-34, AC-35 | web | `tests/unit/bid-map.test.ts` | footer action dispatch: negotiate → `submitCounter` payload; accept → `doAccept` carrying `contractType` + `termResolutions` |
| RMAP-TC-37 | AC-43 | web | same | the panel's action list is empty for every unit state — guards against an action being added back |
| ~~RMAP-TC-38~~ | ~~AC-46~~ | — | — | **WITHDRAWN — `selectedUnits` is never sent** (§7.6). |
| ~~RMAP-TC-45b~~ | ~~AC-61d, AC-61e~~ | — | — | **WITHDRAWN — the renter-facing exclusion was removed** (§7.14); TC-69 asserts no residual filter. |
| RMAP-TC-45 | AC-60, AC-61, AC-61b | web | `tests/unit/bid-map.test.ts` | equipment tab resolves from the selected unit's `documentKeys` and changes with the selection; company tab is selection-invariant |
| RMAP-TC-46 | AC-62, AC-63 | web | same | ticked set → N download targets; request builder emits a message naming exactly the ticked documents and returns no persisted payload |
| RMAP-TC-47 | AC-64 | web | same | adding a document to `equipmentDocuments` raises the readiness `done` count on the next compute |
| RMAP-TC-49 | AC-66, AC-67, AC-70 | web | `tests/unit/bid-map.test.ts` | `supplierChatTabs(groupBids, supplierKey)`: 2 bids → 2 tabs in item order; 1 bid → no tabs; two company members with equal `supplierCompanyId` → one counterparty |
| RMAP-TC-50 | AC-68 | web | same | per-tab unread badge derives from that channel's unread count, not the aggregate |
| RMAP-TC-51 | AC-69, AC-71 | web | same | tab with null `dealRoomId` resolves to the create-or-fetch target; switching tab leaves map selection and active item untouched |
| ~~RMAP-TC-51b~~ | ~~AC-61f, AC-61g~~ | — | — | **WITHDRAWN — `ownershipDocs` carries keys and urls like any other type** (§7.14); covered by TC-69. |
| RMAP-TC-52 | AC-72, AC-99 | web | `tests/unit/bid-map.test.ts` | first-screen selector returns the project pin only, for both a populated and an empty bid list |
| RMAP-TC-53 | AC-73, AC-74 | web | same | list is cheapest-first by default; selecting sets exactly one active row |
| RMAP-TC-54 | AC-75, AC-100 | web | same | `fleetPins(bid)` returns only that supplier’s machines; a supplier with no locatable machines yields zero pins and a stated reason |
| RMAP-TC-55 | AC-76, AC-78 | web | same | confirmed → green filled; unconfirmed → red at listing yard; not-in-offer → hollow |
| RMAP-TC-56 | AC-77 | web | same | claimed units contribute no pins and are reported in the split |
| RMAP-TC-57 | AC-79, AC-80 | web | same | readiness bar segments = present/required; taxonomy image falls back category → generic, never empty |
| RMAP-TC-58 | AC-81 | web | same | selecting a second machine deselects the first |
| RMAP-TC-59 | AC-82 | web | same | chat availability is false with no supplier, true with one |
| RMAP-TC-60 | AC-83, AC-84 | web | same | panel payload exposes all three tabs: machine identity/fit, machine documents, and company documents scoped to the supplier |
| RMAP-TC-61 | AC-85, AC-86, AC-87 | web | same | `machineActions(machine)` over the three states: in-offer unconfirmed → 2 rows, availability first; in-offer confirmed → 1 row; not-in-offer → `alternative`, and **no** action of kind `add_to_offer` in any state |
| RMAP-TC-62 | AC-88 | web | same | the document tabs expose a per-row request for types that are neither verified nor deferred; the request rows expose no document action |
| RMAP-TC-63 | AC-89, AC-90 | web | same | action → pre-composed unsent card; payload carries kind, equipmentId, serial, and docType only for document requests |
| RMAP-TC-64 | AC-91, AC-92 | app-backend | `.../stream-cards.test.ts` | new type accepted via customData; existing vocabulary unchanged; unread membership asserted explicitly |
| RMAP-TC-65 | AC-93 | app-backend | same | foreign or non-matching equipmentId rejected |
| RMAP-TC-66 | AC-94, AC-95, AC-96 | app-backend | `.../supplier-fleet.test.ts` | bidding supplier returns matching machines with all fields; non-bidding supplier refused; firm-shared included, others excluded |
| RMAP-TC-67 | AC-97 | web | `tests/unit/bid-map.test.ts` | flipping `yardConfirmed` in a refetch moves the pin colour with no other input |
| RMAP-TC-68 | AC-98 | web | **manual** | Arabic RTL layout across list, map and panel — no component harness in this repo |
| RMAP-TC-69 | AC-101, AC-102 | app-backend | `.../rentee-unit-location.test.ts` | ownership types present in `documentKeys` with urls; no residual filter and no contradicting comment |
| RMAP-TC-70 | AC-103 | web | `tests/unit/bid-map.test.ts` | ownership rows expose a viewable url, not a locked placeholder |
| RMAP-TC-71 | AC-104, AC-105, AC-106 | app-backend | `.../stream-cards.test.ts` | card inflates unread; notification carries equipmentId; N rapid requests coalesce |
| RMAP-TC-72 | AC-107 | app-backend | `.../stream-cards.test.ts` | two suppliers, one shared `serialNumber` → the card resolves by id to one listing only |
| RMAP-TC-73 | AC-108, AC-110 | app-backend | same | foreign `equipmentId` → 403 and no message written; both scope/id mismatches → 400 |
| ~~RMAP-TC-74~~ | ~~AC-109~~ | — | — | **WITHDRAWN — `add_to_offer` is retired.** |
| RMAP-TC-75 | AC-111, AC-112 | app-backend | same | post returns `ref` + `message.id`; a reply carrying `inReplyTo`/`resolution:'declined'` round-trips intact |
| RMAP-TC-76 | AC-113, AC-114, AC-115 | web | `tests/unit/bid-map.test.ts` | card view-model resolves identity from `equipmentId`; flipping `yardConfirmed` flips the derived status with no other input; 1-of-3 document count recomputes from `documentKeys` |
| RMAP-TC-77 | AC-116, AC-117 | web | same | four ticked documents produce one card with four `docTypes`; company scope yields null `equipmentId` |
| RMAP-TC-78 | AC-119 | web | same | fit rows built from the selected unit: 2018 unit fails the year gate, 2020 unit passes, same request fixture |
| RMAP-TC-79 | AC-118, AC-120 | web | **manual** | draft and sent cards render identically; sticky select-all bar and footer — no component harness in this repo |
| RMAP-TC-80 | AC-121, AC-122 | web | `tests/unit/bid-map.test.ts` | precedence table: non-derivable kind + declined echo → refused; derivable kind + contradicting echo → derived wins |
| RMAP-TC-81 | AC-124, AC-125, AC-126 | web | same | notification selector returns a payload only when the chat panel is not visible; carries ref + serial; opening the chat zeroes unread and clears the notification in one call |
| RMAP-TC-82 | AC-127, AC-128 | web | same | declined resolution maps to the refusal colour key; a `yardConfirmed` flip with no message still produces a notification payload |
| RMAP-TC-83 | AC-129, AC-130 | web | `tests/unit/bid-map.test.ts` | the key model exposes one scale and no aggregate; no meaning maps to two colours |
| RMAP-TC-84 | AC-133, AC-134, AC-136 | web | same | explainer selector returns actor/cause/next-step per state; the unconfirmed copy contains the "not unavailable" clause; tile label names its measure |
| RMAP-TC-85 | AC-135 | web | same | with the explainer present, `machineActions` for an unconfirmed unit contains no `availability` entry |
| RMAP-TC-86 | AC-131, AC-132 | web | **manual** | key visible and unoccluded with a supplier selected, in both directions; collapsed by default — no component harness in this repo |
| RMAP-TC-87 | AC-137, AC-138, AC-139 | web | `tests/unit/deal-room-bar.test.ts` | bar view-model is unchanged from the shipped shape; the negotiate label maps to the three turn states |
| RMAP-TC-88 | AC-140, AC-142 | web | `tests/unit/bid-map.test.ts` | header chip tone equals the pin tone for the same unit; neither removed block appears in the panel model |
| RMAP-TC-89 | AC-143, AC-144, AC-145 | web | same | composition selector returns only non-zero buckets, proportional weights, and flags the unregistered bucket as hatched |
| RMAP-TC-90 | AC-146 | web | same | unit-count formatter returns `١ وحدة`, `٢ وحدة`, `١١ وحدة` |
| RMAP-TC-91 | AC-147, AC-148 | web | same | chip labels carry serial+year for registered machines; unregistered units yield no chip |
| RMAP-TC-92 | AC-149, AC-150, AC-151 | web | same | action list is stacked with the lead-in; the availability request appears exactly once when unconfirmed and not at all when confirmed |
| RMAP-TC-93 | AC-152, AC-153 | web | `tests/unit/deal-room-docs.test.ts` | row action is request when absent, download when present |
| RMAP-TC-94 | AC-154, AC-155, AC-156, AC-157 | web | same | mixed selection is intercepted; missing-only excludes provided types; all-provided offers no missing-only path; the footer is suppressed while the confirmation is open |
| RMAP-TC-95 | AC-159 | web | same | the alternative request's text contains the type, and contains neither the serial nor `بدل`, while the card retains `equipmentId` |
| RMAP-TC-96 | AC-160, AC-161, AC-162, AC-163 | web | `tests/unit/deal-room-notify.test.ts` | bubble payload only when the chat is hidden; dismissal then a new arrival re-shows; refusal maps to the refusal tone; `+N` reflects the pending count |
| RMAP-TC-97 | AC-164, AC-165 | web | same | chat button renders with no supplier when an arrival is pending; reading one supplier's chat leaves another's arrivals pending |
| RMAP-TC-98 | AC-166, AC-172, AC-173 | web | same | a bid arrival routes to the popup, its click reveals-without-selecting, and its comparison text is derived from the other offers' rates |
| RMAP-TC-99 | AC-167, AC-168 | web | `tests/unit/bid-map.test.ts` | the key model exposes one scale and no aggregate; all four unconfirmed surfaces resolve to the same red token |
| RMAP-TC-100 | AC-169, AC-170, AC-171 | web | same | appending a bid grows the list and re-sorts it into price order, and marks the row as new |
| RMAP-TC-101 | AC-174, AC-175, AC-176, AC-177 | web | same | rail contents per selection state; switching supplier clears the machine selection |
| RMAP-TC-102 | AC-141, AC-158 | web | **manual** | photo-first ordering and sticky doc bars — rendered layout, no component harness in this repo |
| RMAP-TC-103 | AC-178, AC-179, AC-180 | web | `tests/unit/bid-map.test.ts` | a zero-machine offer yields the empty-state model, no photo/grid model, a working company-doc model, and a rail containing the equipment button |
| RMAP-TC-104 | AC-181 | web | same | the empty state's action composes `alternative` with a null `equipmentId` |
| RMAP-TC-105 | AC-182 | both | `tests/unit/deal-room-cards.test.ts` + `.../stream-cards.test.ts` | no composer emits `add_to_offer`; a card carrying it is rejected rather than rendered |
| RMAP-TC-48 | AC-65 | web | same | readiness denominator (requested items) and document-list total are computed independently — a fixture where they differ keeps both values and both labels |
| RMAP-TC-42 | AC-55, AC-57 | web | `tests/unit/bid-map.test.ts` | unit indicator selector returns `{readinessBand, yardConfirmed}` independently: green+unconfirmed and red+confirmed both survive as distinct pairs |
| RMAP-TC-43 | AC-56 | web | same | single-unit bid still yields both indicators |
| RMAP-TC-44 | AC-58, AC-59 | web | same | unidentified unit → both indicators absent; `computeBidReadiness` null → readiness unavailable, not `red` |
| RMAP-TC-39 | AC-29, AC-30 | web | **manual** | zero-bid empty state; Arabic RTL layout, panel edge, pin `direction:rtl` — no component harness exists in this repo (see caveat) |

**Testability caveat, stated plainly.** The pure-function cases — `RMAP-TC-12`, `TC-13`, `TC-15`, `TC-16`, `TC-17` and their successors — are written against pure
functions precisely so vitest can cover them. This repo has **no component-test harness** — no
`@testing-library`, no jsdom setup — so the *rendered* result of AC-29 (empty state), AC-30 (RTL layout)
and the machine-panel tabs (AC-52→AC-70) cannot be asserted automatically today and
are **manual-verify**. Adding a component-test harness is out of scope here; if it is wanted, it
should be its own ticket rather than smuggled into this feature.

## 10. Open questions

Numbers are stable. Rows resolved by a later decision are kept and marked, so nobody reopens a
settled point or assumes an unanswered one was handled.

### Live — genuinely undecided

| # | Question | Blocks | Owner |
|---|---|---|---|


### Resolved by a later decision — do not reopen

| # | Was | Resolution |
|---|---|---|
| 2 | Should an unconfirmed yard plot at that yard or fall back to the bid pin? | Plots at the yard recorded when the machine was added, coloured red (§6.2). |
| 4 | Cross-item supplier coverage as a separate view? | Answered in the honest form: the chat groups one supplier's separate bids into per-item tabs (§6.5). A per-item map cannot express it. |
| 7 | Two machines at the same yard — merge or spread? | Spread, via pixel-space de-collision with a leader line back to the true yard (§6.2). |
| 8 | Notify the supplier when the renter names specific machines? | Moot: `agreedUnitIds` withdrawn (§7.6). The quotation agrees *how many*, never *which*. |
| 11 | Ownership documents reaching the renter — a defect? | No. It is the decided behaviour (§7.14). §7.11 withdrawn. |
| 13 | Rail buttons split eligibility vs verification? | Merged by subject: one machine panel (§6.3), separate supplier panel (§6.4). |
| 14 | Do suppliers need to be told their ownership papers — including sale contracts, which can reveal what they paid for a machine — become visible to renters (§7.14)? | **No — ship without notifying, decided 2026-08-05.** No in-app notice, no email, no opt-out, and no per-type exclusion: the full set including `sale_contract` becomes renter-visible. See §7.14.1 for what this leaves outstanding. |
| 3 | Is there appetite for a true **availability** flag, distinct from yard confirmation? | **No change, decided 2026-08-05.** `yardConfirmed` stands as the availability signal and the UI wording stays (`التوفّر مؤكّد` / `التوفّر غير مؤكّد`). See §6.9.4 for what is being accepted.
| 16 | `DealRoomView.numberOfUnits` is documented as "units the RFQ asked for" but holds `agreedUnits ?? offered ?? requested`. | **Fix the comment, decided 2026-08-05** (option A — not renamed). AC-191.
| 18 | The fulfilment bar sums claimed units while the map counts registered machines — align or relabel? | **Neither, decided 2026-08-05.** They are different measures by design and both stay as they are: the bar reports commercial coverage across bids, the map reports equipment per supplier. No relabel. See §6.11.
| 1 | How do off-platform bids appear, given they cannot be plotted? | **Merged into the renter's surfaces in full, decided 2026-08-05** — §6.12. Shown in the bid list with an off-platform badge and `city` in place of distance, never plotted, one rail button opening a full submission viewer (documents, photos, terms, notes, messages), and a read-only bottom bar. Also corrects an error in the earlier wording of this question: a **converted** bid *does* have a listing and plots normally — `convert-bid.service.ts` sets `equipmentId` from the supplier's matching listing. |
| 5 | Distance-band filter on the map, mirroring `maxDistanceKm`? | **REVERSED — no filter, decided 2026-08-06.** First answered "yes, add it"; then dropped entirely (§6.10) once it was clear the filter measures a **bid's** distance while the map draws a supplier's **machines**, so a band can hide the very machine the renter wanted. AC-225→228 and AC-204 struck. Distance text and the nearest sort stay. |
| 9 | Should the offered **count** be capped at the machines named? | **No — keep as is, decided 2026-08-05.** Surfacing beats forbidding: the composition bar (§6.3.2) exposes the gap as unregistered units. Note the *identity* half of this question was separately closed by open question 15 — foreign `equipmentId`s are now rejected; only the count stays unconstrained. |
| 12 | Track requests with a stored open/answered status? | **No stored status, decided 2026-08-05** — but the **supplier must keep seeing the request card and its notification until it is answered**, derived from §7.13.4 layer 1 rather than from a column. AC-205. |
| 10 | Should ticked documents merge into a single PDF? | **Ask the renter, decided 2026-08-05.** Neither shape is imposed: downloading more than one document prompts *«ملفات منفصلة»* / *«ملف PDF واحد»*. A single document downloads directly with no prompt. §6.7.5, AC-208→210. |
| 19 | A supplier typing a VAT-inclusive rate has 15% added on top — add a form choice and a column? | **Already solved, found 2026-08-05.** The public form has the toggle; `src/lib/contract/vat-inclusive.ts` strips VAT to store net and carries the fact as a `[VAT-INCLUSIVE]` tag in `notes`, which the renter side detects and strips. No column was needed. §6.13.2 rewritten; AC-222→224. |
| 6 | Stream channel lifecycle for bid events — eager or lazy? | **Moot — and then the whole mechanism was withdrawn, 2026-08-05.** First answered "no channel, use `sendUserCustomEvent`"; then **realtime was dropped entirely** on cost/benefit, since bids arrive over hours and the renter is almost never watching. §7.5 withdrawn; freshness comes from mount / focus / post-send refetch (§7.5.1). |
| 17 | Legacy accepted deals with `agreedUnits: null` read as full coverage; must the UI apply the same fallback? | **Ignored by decision, 2026-08-05.** The scope was narrower than first stated in this document: `RESERVED_STATUSES` is `AWAITING_SUPPLIER_CONFIRMATION`/`CLOSED` only (`coverage.service.ts:33-36`), so a modern `OPEN`/`NEGOTIATING` room with null `agreedUnits` is never counted and null correctly means *nothing agreed*. Only pre-model **accepted** rows were ever affected. Not handled. |
| 15 | Should `unitsOffered` entries be ownership-checked? | **Yes — both sides, decided 2026-08-05.** Write-side validation on `submitBid` **and** `editBid` reusing `ownerScopeWhere`; read-side scoping in `buildOfferedUnitIndex`. Specced in §7.2.1, AC-08b + AC-183→185. |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-06 | **Implementation reconciliation (T42) — six UI decisions settled and swept into the spec.** **(1) Terminology:** every «المورد» became **«المؤجّر»** (14 occurrences, including §6.6's i18n values) — the shipped app uses المؤجّر 79 times against 21, so one screen was about to call the same person two things. **(2) Palette:** the availability pair is the prototype's **`#16A34A` / `#D9362A`**, superseding §6.3.1's `#12904A` / `#C62A2A`; AC-168 requires pin, machine chip, header chip and composition bar to be the *same* red, so only one pair can exist. **(3) Pin labels:** the pin keeps its short «متاحة» / «غير مؤكّدة» / «يمكنك طلبها» (9px inside a 132px marker) while the panel chip keeps §6.3.1's explicit wording — one fact, two lengths. **(4) The pin's numeric index badge is dropped** — §6.3.3 banned that invented per-unit index on chips for a reason that applies identically to pins: nothing links a bid to a numbered unit, so «what about unit 2?» names something the supplier cannot resolve. **(5) Pin content is the taxonomy image**, falling back to the category image then a generic icon (AC-80) — the prototype's emoji is the one place it is not the answer. **(6) `contact_info` is now returned to the renter**, reversing the `rentee-negotiate-relay` decision recorded in `getRequestSubmissions.ts`; the trade-off (a renter can take the deal off-platform) was accepted deliberately by the product owner, and the code comment now records the reversal rather than contradicting it. Also struck **§7.2's `ownershipDocs`** field and its table row, which outlived the §7.14 withdrawal; corrected **TC-17** to the implemented `'nearest'` sort key; and reworded **AC-73** — the bid panel **floats over** the map and stays visible in every state, it does not sit beside it. |
| 2026-08-06 | **Coverage audit (D2) applied — the last rows that outlived their decisions.** (1) **§6.10 distance filter WITHDRAWN** by product decision, with AC-225→228, AC-204, TC-125, TC-117 and the five `bidMap.dist*` i18n keys struck; the reason is recorded in §6.10 so it is not rebuilt — the filter measured a **bid's** distance while the map draws a supplier's **machines**, so a band could hide the very machine the renter wanted. Distance text and the **nearest** sort stay. (2) **AC-12/AC-13 struck** — they authorized a **bid-events token** that no longer exists (§7.5 withdrawn); `canAccessRequest`/T6 remains enforced by `getBidList`, so nothing is lost. TC-09 struck with them. (3) **AC-37 and AC-55 reworded** off bid-pin-era language: bids are not pinned, and a unit renders on its machine pin and in the panel, not on the bid row. |
| 2026-08-03 | Spec created. |
| 2026-08-05 | **Coverage audit for stale content — every retired concept grepped across the document rather than spot-checked, after three contradictions were found by inspection.** The largest pocket was **§4 Scope "In", which was never updated through the 2026-08-04 direction change** and still listed one-pin-per-bid, per-unit fan-out, distance rings, rating sort, live updates, a hollow marker for unidentified units, `agreedUnitIds`, a supplier panel owning company documents, and "three equipment-scoped requests". §4 rewritten, and a **"Retired / Replaced by" table added** so an old AC cannot be re-derived from it. §5's flow steps for rings and one-pin-per-bid struck; the "Per-unit fan-out" and "Live update" headings marked retired. **AC-16/17** (fan-out; "a unit is never selectable") and **AC-38/39** (hollow marker) struck — both directly contradicted §6.2, and AC-17 contradicted the machine panel's entire premise. **`agreedUnitIds`** was withdrawn in §7.6 but still live in §7.8's data-model delta and AC-47→51 — all cleared. **`add_to_offer`** was retired in §6.7.1 but still specced in §7.13's payload, validation and derivable table, plus AC-109/123 and TC-74 — all cleared, with an explicit "must be rejected" rule. **AC-129** still demanded both colour scales, **AC-207** still asserted no VAT flag exists, and **AC-64/97** still referenced "the next live update" — all corrected. Structural fix: **§7.14.1 was nested inside §7.6** and has been moved under §7.14. |
| 2026-08-05 | **Second staleness sweep — the retired set derived FROM the document rather than from memory.** The first sweep grepped sixteen concepts I remembered, which is the same failure mode as reading it. This one extracted every identifier named in a struck line and looked for live uses, and flagged numeric constants carrying two values. It found a **whole surviving realtime subsystem the first sweep never grepped for** — §5 subscribed to bid events, fell back to a **20s poll**, and suspended on hide, with **AC-25/26/27** and TC-18/19 implementing it, all contradicting §7.5. It also found **AC-20 colouring pins green/amber/slate by distance band**, contradicting §6.9.1 where colour means availability; the **i18n keys `bandNear/bandMid/bandFar` still carrying 30/120/220 km** while the live filter (§6.10) uses 50/100/200; **AC-28** still opening a deal room on pin activation; AC-21/22 still assuming bids are pinned; §4 assumption 4 describing per-unit pins; a **duplicated assumption A0/0**; and the §4 "Out" line denying per-unit selection, which the machine panel contradicts. **§5 was rewritten wholesale** — the previous sweep had struck its prose, which left half-struck sentences still reading as instructions. Two corrupt artefacts fixed: the **§7 heading was tripled** by an earlier replace-all, and the work plan listed **"W16 live updates" as merely blocked** when it is withdrawn, under an ID since reassigned to Notification surfaces. |
| 2026-08-05 | **Third staleness sweep — retired concepts written as PROSE.** Found by the product owner, not by either auditor: **AC-87 asked for *«add this machine to the offer»* as a primary action** — an action whose payload §6.7.1 retires and AC-182 forbids. Neither earlier sweep could see it: v1 grepped remembered concepts, v2 grepped backticked identifiers and numeric constants, and AC-87 spells the identifier out in English. Its neighbours were stale the same way: **AC-84 placed company documents outside the machine panel**, which is the retired separate-supplier-panel model (§6.3.4 makes them tab 3); **AC-85/89 specified «three actions»** and **AC-86 «two remain»** when §6.3.6 defines two rows and one respectively; **AC-88 specified a document picker** when §6.3.6 says the three routes to a document request collapsed into one, inside the document tabs; and **AC-130 read «the two scales»** after the one-scale decision. TC-60/61/62 rewritten with them — TC-61 had asserted *«2 with add-to-offer primary»*. |
| 2026-08-05 | **Fourth sweep — orphans and contradictions found by the product owner.** Three groups. **(a) Orphaned by §7.6:** AC-44/45/46 specified a renter-side modal picking specific machines and sending `selectedUnits` with `proposeRate`, but the backend half (AC-47→51) was already withdrawn — the UI survived with nowhere to send its output. Struck with TC-32/38. **(b) Contradicting §7.14:** AC-41 and AC-61c denied a View control, AC-61f/g specified `ownershipDocs` with no key or url, and AC-61d/e applied `RENTEE_HIDDEN_DOC_TYPES` renter-side — all the hide-and-filter design that §7.11 withdrew. Struck with TC-30/45b/51b; TC-45 lost its ownership clause; TC-69/70 already assert the current behaviour and were kept. **(c) Stale prose:** §6.2 offered "the existing sort options" after rating was retired; §7.13.4 had an empty table row where `add_to_offer` was removed **and still claimed §7.5 "pushes the bid event"**; §8's tail said AC-31→36 and AC-60→65 were superseded "in part", which cannot be implemented, now stated as a concrete substitution; §9's caveat still cited TC-10…TC-19 as pure-function examples after they were struck. **Three gaps filled where the spec was silent rather than wrong (AC-231→234, TC-126→128):** `yardConfirmed` must derive from **this bid's** `unitsOffered` entry — read off the listing, every pin turns green — and the coordinates follow from it; the fleet endpoint must return the `offeredUnitsDetail` shape so one payload feeds both the readiness bar and a not-in-offer machine's document tab; and **chat tabs must key on `bidId`, not the item** — `@@unique([requestId, bidOwnerKey, equipmentId])` (`schema.prisma:1260`) permits one supplier two bids on one item, so an item-keyed tab strip leaves the second deal room unreachable. |
| 2026-08-05 | **Realtime withdrawn entirely — §7.5 requires no backend work.** Reversing the earlier decision to keep live arrival via `sendUserCustomEvent`: bids arrive over hours or days, so the renter is almost never on this screen when one lands, and a push path costs a Stream dependency plus a `/compare` connection that does not exist today. The original *"live like Uber"* framing belonged to a design where **supplier pins arrived on the map**, which §6.2 removed — nothing on screen is inherently live any more. AC-11 and AC-186→189 withdrawn along with TC-107/109; **the three refetch triggers (mount · window focus · after the renter sends a request) are promoted from fallbacks to the entire, normative mechanism** (§7.5.1), with post-send called out as load-bearing because it is the one moment the renter is actually watching for the self-closing loop. A **manual refresh affordance is now required** (AC-229) and **no copy may imply instantaneous updating** (AC-230). §6.11 reworded so "arrival" means *the refetch returned something new*, and the just-arrived marker is defined as new **to the renter** rather than recent. §7.5.2 records the three things that consequently update only on a trigger, and notes that the withdrawn user-event design remains the cheap route if this is revisited — it was dropped on cost/benefit, not feasibility. |
| 2026-08-05 | **Logic/requirements review of this document — six defects found and fixed.** (1) **§6.1 contradicted §6.13.9**: it stated the bottom bar is unchanged while §6.13 specifies a separate read-only bar; a carve-out now says so where a §6.1-only reader will see it. (2) **The distance filter was approved (open question 5) but never specified** — the sole AC covered only *excluding* off-platform from it. New **§6.10** defines the control, bands, a **default of "all"** (a renter who cannot see all his offers cannot tell few bids from a narrow filter), list-and-map-together scoping, the rule that **unknown distance is never treated as far**, a stated "N of M" count, and one-tap clearing (AC-225→228). Sections 6.10→6.12 renumbered to 6.11→6.13 with all cross-references updated. (3) **§6.13.5's heading said "a third state" while its own table listed four.** (4) **§6.3.2's bucket table omitted the off-platform fill**, so the two composition tables disagreed; the amber hatch is now specified there and distinguished from the grey one. (5) **AC-14 and AC-15 were still live rows** in the acceptance table while only a prose note called them superseded — an implementer building from the table would have built supplier pins, which the direction change removed. Struck through like AC-08b. (6) **Two absent-data conventions** (em-dash in tiles, «— غير مُدخل» in rows) were in use without a stated rule; now documented as one normative pair. |
| 2026-08-05 | **Final pre-implementation review — every `file:line` reference in this document was checked against the code, and it found more that was already built.** (1) **The VAT-inclusive toggle EXISTS** and §6.13.2's claim that no such signal could be read was **wrong**: `src/lib/contract/vat-inclusive.ts` (42 lines) gives the public form a toggle, stores every submission **net** by stripping 15% on submit, and carries the fact as a `[VAT-INCLUSIVE]` tag in `notes` — consumed today by `SharedBidSubmissionModal.tsx:209/:451` and covered by 11 passing tests. Section rewritten; **open question 19 closed as already solved**; AC-222→224 added, including the requirement to `stripVatInclusiveNote()` before ever displaying notes. (2) A new **⚠️ already-exists banner** heads §6.12, listing the ~1,100 lines of shipped code that earlier revisions specced as new work — `SharedBidSubmissionModal` (538), `SharedLinkBidCard` (293), `BidEquipmentModal` (222), `BidTermsModal`, `bid-quality.ts`, `vat-inclusive.ts`, `link-bids.ts`, `QualityRing.tsx` — and states that what is genuinely new is hosting them on the map/compare surface. (3) Two stale references corrected: the location-card branch is `DealRoom.tsx:890`, not `:855`, and the mobile blocs live under `features/marketplace/`, not `features/bid_form/` or `features/bid_readiness/`. |
| 2026-08-05 | **Three corrections after reading the code again — this document had said things that were not true.** (1) **The bid-quality score already exists**: `src/lib/contract/bid-quality.ts` (124 lines) is rendered by `QualityRing.tsx` and consumed by `BidComparisonWorkspace.tsx` and `GroupBids.tsx`. §6.13.11 previously specced it as new work **with a formula that did not match the code**; it now documents the real one and forbids a second implementation (AC-219). Concretely: the company part uses four **optional** slots — CR, VAT, address, **other-docs** — each satisfiable by text *or* document, and **excludes company name and contact** because those are required to submit (AC-220); the equipment part is **bucket coverage** (photos + ownership always, equipment/operator certificates only when required) rather than a document count (AC-221); and the mid band starts at **50**, not 60. (2) **The `SELECT` additions were named off the wrong twin.** There are two `getRequestSubmissions` handlers; the web calls the **agents** one, which **already selects `company_documents` and `rentee_messages`** but **omits `contact_info` and `city``. AC-193 corrected accordingly. (3) **`city` is already mapped by `link-bids.ts:241` but never returned**, so that field is null in production today — which is why it cannot be used as the distance stand-in until the `SELECT` changes. |
| 2026-08-05 | **§6.12 reconciled with the built prototype, and documented field-by-field per surface** (§6.13.6→6.12.11, AC-199/200 corrected, AC-211→218, TC-121→123). The rail is **two** buttons, not one — mirroring the live `SharedLinkBidCard`, which separates an Equipment → `BidEquipmentModal` from the footer's view-submission. The viewer became a **modal** with a quality donut, reference strip, dark item header and a terms grid pairing اختيارك against اختيار المؤجّر; the **message thread was removed**. The bottom bar gained the **التفاصيل** breakdown — the only place mobilisation, demobilisation and VAT are visible — with VAT **derived as `total − subtotal`** so the lines always reconcile with the stored total. New **§6.13.10 field → surface matrix** covering every field the renter can receive and where each appears, plus the list that is never available. New **§6.13.11** defines the quality score (40/30/30 over terms match, equipment documents, company-detail completeness) and states plainly that it is a completeness-and-agreement score, **not** a trust score, since every input is self-declared. Two corrections to what was built: an off-platform submission has **no measurement field** — the mapper supplies only `label`, so the measurement tile, like `≥ 2020`, is the **renter's own requirement** and must be labelled as such (AC-212); and the **em-dash rule** is now normative — a non-existent field renders as — rather than being omitted, so the renter can see what he is not being told (AC-211). |
| 2026-08-05 | **Open question 10 decided: the renter chooses the download shape** (§6.7.5, AC-208→210). Selecting several documents prompts *«ملفات منفصلة»* / *«ملف PDF واحد»*; a single document downloads with no prompt. Recorded that the merge path needs a PDF library or a backend endpoint and must handle a **mixed** set (certificates as PDFs, equipment photos as images, which render onto pages rather than concatenating) — and that if the merge is deferred the option must be **hidden**, not shown and broken. |
| 2026-08-05 | **VAT normalisation dropped by decision** — off-platform prices are shown **as submitted** with a note saying whether VAT is included (§6.13.2 rewritten, AC-195 withdrawn, AC-196 restated, AC-206/207 added). Verified that **no inclusive/exclusive flag exists** anywhere in the submission path — the only `vat` field is `vat_number`, and the accepted item fields are `confirmations`/`offeredUnits`/`rentalRate`/`deliveryPrice`/`returnPrice` — so the label is **deterministic from which field a figure came from** (components exclusive, `total`/`grandTotal` ×1.15 inclusive) rather than read from data. The only ranking rule kept is that the cheapest badge is computed from the **rate**, never from `grandTotal`, since that is the sole VAT-bearing figure. New **open question 19** records the real gap this exposes: a supplier who enters a VAT-inclusive rate has 15% added on top and nothing detects it — fixing that needs a choice on the public form and a column to store it, not a display change. |
| 2026-08-05 | **Off-platform submissions specced in full — new §6.12**, closing open question 1 and correcting its premise: a **converted** bid *does* have a listing and plots normally (`convert-bid.service.ts` sets `equipmentId` from the supplier's matching listing), so only **unconverted** submissions lack a location. Field inventory verified against `getRequestSubmissions.ts:175-207` — far more exists than the question assumed, including per-item **photos** and **documents**, `confirmations`/`requiredTerms`, `offeredUnits` and the taxonomy `label`; `city` and `company_documents` exist in the table but are **not selected** and must be added (AC-193). VAT clarified: `submitBidForm.ts` hardcodes `1.15`, so component prices are pre-VAT and `total`/`grandTotal` always VAT-inclusive — there is no per-submission flag, the requirement is to **label** which figure is shown and to **normalise before ranking** or the cheapest badge lies (AC-195/196). Decided presentation: merged into the bid list with a badge and `city` instead of distance, **never plotted**, **one rail button** opening a full submission viewer (company, per-item pricing, photos, equipment + company documents, terms, notes, message thread), and a **read-only bottom bar** — no accept and no counter-offer, because no `DealRoom` exists before conversion (AC-194→203). A **fourth composition state** added for units with evidence but no listing, distinct from count-only padding. Also closed: **#5** distance filter approved, with off-platform rows excluded from it rather than silently dropped (AC-204); **#9** the offered count stays uncapped, noting its identity half was closed by #15; **#12** no stored status, but the supplier keeps seeing an unanswered request card via derived state (AC-205). |
| 2026-08-05 | **Three questions closed with no behaviour change.** **#3** — `yardConfirmed` continues to be presented as availability and the wording stays; new **§6.9.4** records what that accepts (a supplier can confirm a yard for a machine booked solid and it will show green, so green means *"he told us where it is"*, not *"free on your dates"*), why it is tolerable (the next step always establishes dates), and the shape of a real fix if it is ever needed (AC-192). **#16** — the `numberOfUnits` **comment** is corrected rather than the field renamed (AC-191). **#18** — the fulfilment bar and the machine counts stay as two different measures with no relabel; new **§6.12** states why reconciling them would delete the very signal the composition bar exists to expose. |
| 2026-08-05 | **Live bid arrival kept, but re-based from a channel onto a USER event** (§7.5 rewritten, AC-11 restated, AC-186→190). `stream-chat@9.46` exposes `sendUserCustomEvent(targetUserID, event)`, so the backend pushes `bid.changed` straight to the request owner: **no channel is created**, no per-request channel growth, and no new billable identity — the renter is already Stream-active via deal-room chat (pricing axis to be confirmed against the contract, not assumed). **Open question 6 closed as moot**: with no channel there is no eager-vs-lazy decision. Specced as a *hint to refetch* only — the client refetches through the authorised endpoint and renders nothing from the payload, events coalesce, and **refetch-on-focus plus refetch-after-send are required fallbacks**, so no screen depends on Stream being reachable. Recorded that `/compare` holds no Stream connection today (the web connects only in `DealRoom.tsx:420`) and must reuse the existing singleton. **Open question 17 ignored by decision**, with a correction to an earlier overstatement in this document: `RESERVED_STATUSES` covers only post-acceptance states, so for every modern room null `agreedUnits` correctly means nothing agreed. |
| 2026-08-05 | **Open question 14 decided: ownership documents ship renter-visible without notifying suppliers** — no notice, no opt-out, no `sale_contract` carve-out (§7.14.1). Recorded with the two things the decision does not excuse: AC-102's requirement to delete the now-contradictory *"must never surface on rentee screens"* rule at `rentee.service.ts:449`, and the fact that the commercial disclosure remains real, with the per-type exclusion named as the cheap mitigation if it becomes contentious. |
| 2026-08-05 | **Open question 15 decided: `unitsOffered` gets an ownership check on both sides.** New **§7.2.1** with the verified call sites and both changes spelled out — write-side validation in `submitBid.ts`/`editBid.ts` (currently `z.array(z.any())`, no check) reusing the existing `ownerScopeWhere` and `EQUIPMENT_OWNERSHIP` code, plus read-side scoping in `buildOfferedUnitIndex` (currently `{id, tenantId}` only, `rentee.service.ts:519-521`). Flagged that the function builds **one flat index across all bids**, so the fix is to drop mismatched entries at assembly time rather than per-bid queries, preserving the no-N+1 property. AC-183→185 added: write rejection, the count-vs-inspectable divergence that results (surfaced as unregistered units, not hidden), and the requirement to honour the T7 company-shared-fleet scope so a colleague's machine is not wrongly rejected. Also corrected an overstatement earlier in this document: the bid's **primary** `equipmentId` *is* already ownership-checked in `bid.service.ts` — only `unitsOffered` was unchecked. |
| 2026-08-05 | **Two unhandled cases found while auditing for completeness, both closed** (§6.3.7, §6.7.1, AC-178→182). (a) **An offer with no registered machine at all** had never been exercised — every fixture carried at least one — and produced a headerless shell with an empty photo strip and a spec grid built from the request template, i.e. it looked broken rather than empty. Now an explicit empty state, with company documents and chat still reachable and the rail button retained so they can be. (b) **`add_to_offer` was a request kind nothing could compose** — renderable, simulatable and resolvable, but no surface created one after the actions were consolidated. Retired rather than given a route, since `alternative` already asks the same question in a better form. |
| 2026-08-05 | **Consolidation pass — spec reconciled with the finished prototype.** §6 rewritten end to end after ~15 rounds of design changes had left it describing surfaces that no longer exist. §6.1 restated as **out of scope**: the bottom bar re-hosts the shipped deal-room bar unchanged, the prototype's "negotiation gap track" was built and then **reverted by decision**, and the only in-scope change is the `تفاوض` → `اطلب سعراً أقل` relabel (AC-137→139). §6.3 rewritten around the sticky identity header with a **filled, saturated** availability chip, the **offer-composition bar** (confirmed / unconfirmed / **hatched** unregistered), **machine-named chips** replacing the fictional `وحدة N` index, and the two requests as a **stacked list with a lead-in** rather than a side-by-side fork (AC-140→151, 174→177). Removed-by-decision blocks recorded so they are not reinstated: the red mismatch banner, the two-tile status card, and the paragraph explainer. §6.4 corrected — company documents live in the machine panel's third tab, not the supplier panel. §6.6 annotated with where its two signals now surface. §6.7 gains the per-row `+ طلب`, the **already-provided confirmation** with its three outcomes, and the normative rule that the alternative request names the **type** and contains neither the serial nor `بدل` (AC-152→159). §6.8 replaces the withdrawn header-strip alert with the **conversation bubble on the chat icon**, and makes it normative that **the chat button survives deselecting the supplier** — the failure that killed both earlier attempts (AC-160→166). §6.9 reduced to **ONE colour scale**: the supplier-level aggregate described dots that stopped existing when the map went project-location-only, and amber-vs-red for the same idea was an inconsistency with `unitIcon`, which already drew unconfirmed machines red (AC-167→168). New **§6.11 live bid arrival** — list growth, mandatory **re-sort**, just-arrived marker, reveal-without-selecting, and the rule that the comparison text is **computed, never asserted** (AC-169→173). Unit counts fixed to **one literal Arabic form** (`٢ وحدة`) by product decision over grammatical pluralisation (AC-146). §7 subsections **reordered into ascending numeric order without renumbering**, so every existing cross-reference still resolves. 184 ACs (144 web, 40 backend), 103 TCs, all covered. |
| 2026-08-04 | **Colour semantics made learnable** (§6.9, AC-129→136, TC-83→86). Two defects found by asking how the renter learns the scale: (a) the pre-selection legend taught green/**red**/grey while the post-selection legend used green/**amber** for the same "not confirmed" meaning, so the renter learned red then met amber; (b) the floating legend was positioned `insetInlineEnd` at z-index 23, which renders it **behind the bid-list panel in RTL** — hiding the machine-colour key in the only state where machine pins exist. Both scales now appear together, each labelled with what it colours, hosted **inside the bid panel** where nothing can occlude them, collapsed by default. Selecting a machine now opens with a **sentence, not a chip**, naming the actor, the cause and the next step — and stating explicitly that «غير مؤكّدة» **does not mean unavailable**, because without that clause an unconfirmed machine reads as rejected and the renter discards a supplier who never declined anything. The availability request moved onto that explanation and was removed from the actions row (one intent, one button). |
| 2026-08-04 | **Correlation precedence made normative** (§7.13.4, AC-121→123) after the prototype exposed the hole: `alternative` has no observable counterpart, so its card read "waiting for the supplier" while the supplier's refusal sat directly beneath it in the same conversation. Rule is now — derivable kinds are answered by state and state overrides any echo; non-derivable kinds are answered by the echoed `resolution`; only with neither is a request open. `add_to_offer` reclassified as **derivable** (the machine appears in `unitsOffered`). Added §6.8 — the three notification surfaces (map recolour / persistent rail count / transient in-view toast carrying ref + serial), AC-124→128, TC-80→82. The notification is triggered by the **state change, not by a message**, because the most common answer in the system — a supplier confirming a yard from the readiness card — sends no message at all. Verified against `stream.service.ts:38-53`: `custom` is already in production for five card types and the validator does not whitelist them, so `rentee_request` needs **no schema change** — only the `UNREAD_INFLATING_CARD_TYPES` line, the ownership check, and notification dispatch. On the **web**, `DealRoom.tsx:890` renders exactly one card (`custom.kind === 'location'`); the five negotiation cards fall through to plain text today, so this would be the web's second card renderer. |
| 2026-08-04 | **Request→machine binding fully specced** (§6.7, §7.13.1→7.13.5, AC-107→120, TC-72→79). The linking key is `EquipmentListing.id`, **not `serialNumber`** — the serial is `String?` and unique only per `(tenantId, userId)`, so two suppliers can legitimately share one and a fleet of identical machines would be ambiguous; the serial travels as display text and nothing resolves off it. Card payload gains `ref` (backend-minted), `scope: equipment|company`, and `docTypes[]` so a multi-document request is **one** card, not N. Answer correlation defined as three layers: derived state (the real answer), Stream `parent_id` threading (already returned by `sendMessage`, unused today), and an echoed `{inReplyTo, equipmentId, resolution}` — the only layer that can express a refusal. **A status column and a request counter were considered and rejected**: a supplier confirming the yard from the readiness card never touches the request, so stored status goes stale by default. Cost recorded honestly — without a row, cross-room "my open requests" is not SQL-queryable. |
| 2026-08-04 | Added §6.5 — two independent per-unit indicators, readiness band (existing client-side `computeBidReadiness`) and yard-confirmed (AC-55→59); shown for single-unit bids too, absent for unidentified and off-platform units. |
| 2026-08-04 | §7.11 — recorded a defect this feature exposed: `getDealRoomDocuments` serves ownership documents (istimara / customs / sale contract) to the renter, contradicting the explicit "must never surface on rentee screens" rule enforced on `offeredUnitsDetail`. A sale contract can reveal the purchase price to the party negotiating against the supplier. Fix is to apply the same exclusion renter-side (AC-61d/e); the deal room will stop showing documents renters see today. Open question 11 closed. |
| 2026-08-04 | **Ownership documents are fully viewable to the renter** (§7.14, AC-101→103) — product decision, reaffirmed after the commercial-disclosure risk was raised. Withdraws §7.11 (which treated this as a defect) and the presence-only design. Requires removing `RENTEE_HIDDEN_DOC_TYPES` from the renter path **and** deleting the rule comment that contradicts it. `rentee_request` cards now inflate the unread badge and raise a supplier notification (AC-104→106). Open question 14 records that suppliers have not been told. |
| 2026-08-04 | **Direction change.** Map now opens on the project location only — supplier pins removed because their coordinates are not reliable enough to plot, which **deletes the company-coordinates backend ask entirely** (was §7.12). The bid list becomes the entry point (cheapest-first). Supplier selection reveals that supplier’s qualifying fleet; machine selection opens a **merged** machine panel (eligibility + that machine’s documents), with company documents moved to a separate supplier panel. Three equipment-scoped requests (availability / document / add-to-offer) ship as **structured chat cards** carrying `equipmentId` — reusing the `customData` channel and card vocabulary Stream messages already have, so the supplier knows exactly which machine without parsing prose. AC-72→100, TC-52→68. |
| 2026-08-04 | Added §6.6 — chat panel groups one supplier's separate deal rooms across an RFQ into tabs per item (AC-66→71), so two bids from the same supplier stop reading as unrelated conversations. Client-side grouping over data `GroupBids` already fetches; no backend. All three rail buttons now specced. |
| 2026-08-04 | Added §6.5 — documents panel (rail button 2), re-hosting `DocumentsModal` with the backend's own company/equipment tab split (AC-60→65). Request action specced as Option A: a prefilled chat message, no recorded request state. Equipment tab sources `equipmentDocuments` rather than per-unit `documentKeys`, because the latter strips ownership documents. Readiness count and document count deliberately left unreconciled — they answer different questions. |
| 2026-08-04 | Removed the "agreeing more units than registered" advisory (was §6.6, AC-52→54) by decision. IDs 52–54 are retired, not reused. The renter is not nudged when the agreed count exceeds the identified machines; the offered-vs-identified split (§6.3, AC-37) still states the facts without prompting an action. |
| 2026-08-04 | Per-unit model settled. Added: equipment panel as read-only per-unit eligibility (§6.2, AC-40→43); offered-vs-identified rule (§6.3, AC-37); unidentified units as one hollow marker (AC-38/39); unit selection on the quotation stepper (§6.4, AC-44→46); `DealRoom.agreedUnitIds` with propose/accept plumbing and serials in the quotation (§7.6, AC-47→51). **Corrected AC-08** — the existing dedupe is right; duplicate entries are array padding, and one machine cannot be in two places. Dropped a proposed `unitsOffered` string-normalisation "fix": those entries carry request *item* ids, not equipment ids, so coercing them would have been a bug. Added an **ownership filter** to `buildOfferedUnitIndex` (AC-08b) — a pre-existing hole that this feature would otherwise widen to include yard coordinates. Per-unit accept ruled out; `DealRoomUnit` table considered and rejected as heavier than the codebase's column convention. |
| 2026-08-03 | Bottom price bar added (§6.1, AC-31→36): re-hosts the existing deal-room bar, shown only when a bid is selected. Prototype's aggregate bar and per-unit toggle dropped. Assumption 0 recorded — shipped behaviour is the source of truth, prototype illustrates layout only. |
