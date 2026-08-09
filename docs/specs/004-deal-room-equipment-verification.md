# 004 — Deal-room equipment verification (v3)

**Prefix:** `RM3-AC-*` / `RM3-TC-*` · **Layer:** web (`Web-App`) unless marked
**Self-contained.** Everything this surface depends on is stated here and anchored to code, not to
another spec.
**Source of truth for layout:** prototype `Deal Room Map.html` (geometry extracted in
`docs/implementation-plans/deal-room-rentee-map/design-v3.md`) · element list
`docs/rentee-map-v3-elements.md` — **for layout and intent only. On behaviour, THIS spec and `004a`
win.** The element list was written 2026-08-07, before the 7–9 August rulings, and went on stating rules
that were later withdrawn (the company document ask · per-row download · a held row being requestable ·
"every row, the same three actions", which sweeps in the operator's inert rows). Each is now struck in
place there, dated, with what replaced it — corrected 2026-08-09, see §11.

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
| ~~**Distance filter** (الكل / ≤٥٠ / ≤١٠٠ / ≤٢٠٠ كم)~~ — **REINSTATED 2026-08-08 by owner decision; see §6.4a and AC-28** | ~~it filtered *competing offers*. One supplier's fleet is small and already sorted nearest-first, so filtering only hides machines from a comparison the renter is no longer making~~ — the argument held for the v2 control, which filtered offers on the bids list. It does not hold for a list of one lessor's machines, where the renter is narrowing to what he can accept rather than comparing anyone. The bands return unchanged; the caution that removed them survives as the four rules in §6.4a |
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
- **select-all**, plus a checkbox on every row **that carries a url**: papers are handled in **batches**,
  because a renter checking a firm wants its CR and its VAT certificate together. The batch **opens or
  saves** the selection — it is **not** a request, and there is no request control anywhere on this panel
  (AC-71, AC-72). A row with no url is listed but not tickable: there is nothing behind it to open.
  ~~**Withdrawn 2026-08-08:** this list has no selection and no send; there is nothing here to tick~~ —
  **that went too far and is itself withdrawn, the same day.** Withdrawing the *ask* took the selection
  UI with it; only the ask was decided. See 004a §8.1
- each row: thumbnail with a status dot · name · a status line · **view** (§7 / AC-69). *The per-row
  **download** was withdrawn 2026-08-08 — downloading is the batch beneath the list (004a §8.2).*
- **company rows carry verification state and expiry** — verified, valid-until, renews-annually, or
  no-document-yet in red

Company documents are **five** papers: **CR · VAT certificate · national address · local content ·
SASO registration** — all read-only: listed, opened and downloaded, **one at a time or several at once**,
never requested.

**Corrected 2026-08-08 — this section named four.** SASO registration was missing, and AC-41 was
missing it too.

**Two storage systems, one list, and the renter must not be able to tell.** `cr`, `vat_cert` and
`national_address` are **catalogue documents**; **local content and SASO are held certs** — their files
live in `supplier_profiles.held_cert_docs.LC` / `.SASO`, with the legacy `local_content_doc_key` and
`saso_heavy_equip_doc_key` columns still populated and still dual-read. Nothing ever writes a
`DocumentInstance` for either. This is written down because it is the reason the two were absent for so
long, and because a renter verifying a firm does not care which table a paper sits in: all five render
identically, and all five open.

⚠️ **`saso` names several different papers across the tree, and this row is the FIRM's registration.**
A machine's own certificate can carry a bare `saso` too, and `saso_registration` / `saso_inspection` are
a listing's papers again. They are separated by **scope** and by nothing else — the company list is
resolved against the firm and never against a listing — and **no alias folds any spelling onto another**,
because an alias would have the supplier upload the wrong paper.

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

### 6.4a Filtering the list

**Approved by decision, 2026-08-08 (owner, twice and explicitly).** This *reverses* v3's removal of the
distance filter — see the rewritten **AC-28** and §11's changelog entry, which withdraw the old argument
rather than leaving it to be quietly contradicted.

**A filter selects for what a machine HAS, never for what it lacks.** «لديها TÜV» narrows the list to
the machines carrying a TÜV. The renter is deciding what he can accept, not assembling a chase-list of
the lessor's gaps; a "missing TÜV" chip would turn a verification surface into an accusation surface,
and the ask («اطلب المستند») is already the right instrument for a gap.

**No model filter** — within one lessor's offer the models are near-identical, so a control that only
ever offers one value is furniture. **No sort control** — the order is nearest-first, permanently.

#### The controls

| Control | Renders only when |
|---|---|
| **المسافة** — الكل · ≤ ٥٠ · ≤ ١٠٠ · ≤ ٢٠٠ كم | more than one band is represented, i.e. some band would hide a machine |
| **التوفّر** — «مؤكّد توفرها» | the list mixes confirmed and unconfirmed |
| **السنة** — «٢٠٢٠ أو أحدث» | the request asked for a **minimum year** (not an age) |
| **الملحقات** | the request asked for attachments **and** a machine's file can answer — see below |
| **الشهادات** — one chip per certificate | the request **named that certificate**, equipment or operator |

The bands are **v2's own** (`001-deal-room-rentee-map-v2.md` §6.10), reused rather than reinvented.
**«الكل» is not a chip** — it is the cleared state, and clearing is one press.

**Combining: AND between controls, OR within one.** ≤ ٥٠ كم **AND** ٢٠٢٠ أو أحدث **AND** (TÜV **OR**
SPSP). A control with nothing pressed imposes nothing; it is never an implicit "none of these".

#### The four rules that make this safe on a verification surface

1. **Only criteria the request asked for.** The request named no certificate ⇒ there is no certificate
   control. This is the rule the rest of the surface already obeys — §6.5's grid greys a cell nobody
   asked about, and §6.6 does not render a document that was not required — and breaking it here would
   hold the lessor to a standard he was never given.
2. **A control appears only when it would actually split the list.** Every machine confirmed ⇒ no
   availability chip. Every machine inside ≤ ٥٠ كم ⇒ no distance row at all. A row of controls that all
   do nothing is worse than no row: a chip that hides nothing invites the renter to believe he has
   checked something. One consequence is load-bearing — **a single chip can never empty the list**,
   because an option that keeps nothing never became an option. Only a combination can.
3. **The count always states the whole — «٣ من ٨».** The denominator is the offer, never the filtered
   figure. On a surface whose job is telling the renter what the lessor has, a hidden machine must
   never let the offer read as smaller than it is.
4. **The map follows the filter.** Cards and markers stay in step (**AC-15**): a filtered-out machine
   leaves the map with its card, and a selection the filter hides is dropped. The pin set is derived
   from the filtered list, so the two surfaces cannot disagree about what the offer contains.

#### A machine with no distance

**Kept by every band, never hidden.** `locationSource: 'none'` means *unknown*, not *far*; hiding it
would silently delete a real offered machine on the strength of a fact nobody has. It is v2's own rule
for this control, and the only reading consistent with §6.4's sort, which puts a null **last** without
ever calling it distant. Because the chips alone cannot show this, the distance row **says so** whenever
such a machine is in the list.

**A machine with no year on file, by contrast, IS filtered out** by the year chip: the chip selects for
a machine that *has* the year, and that machine does not demonstrably have it. This is not a new
judgement — §6.5's grid already reads a missing year red against a year ask, so the two agree about the
same machine.

#### الملحقات — specified, and today always suppressed by rule 2

The request can ask for attachments (`attachment_ids` / `custom_attachments`), so rule 1 is satisfiable.
**The machine's side is not:** the fleet row records what the machine *is*, never what it comes with —
neither `FleetMachine` nor `offeredUnitsDetail` carries an attachments field. No machine can therefore
be *shown* to have them, and rule 2 drops the control before it becomes a chip.

That is the correct answer rather than a gap, and it is the same one §6.5 already gives: the grid
refuses to colour that cell because *"colouring this red would tell the renter the supplier failed a
check the platform never ran"*. A chip would be worse — pressing it would empty the list and read as
*"not one of his machines has what you asked for"*, a verdict on the lessor drawn entirely from our own
missing column. The control comes alive on its own the day the wire carries the field.

#### The empty state

**It names what emptied the list and offers to clear it.** Plain «لا توجد نتائج» reads as *"this lessor
has nothing"* — a claim about him rather than about the chips the renter pressed, and exactly the
confusion **AC-26**'s state exists to avoid. The two must not be mistakable for each other:

| | **AC-26** — nothing registered | **AC-28e** — emptied by a filter |
|---|---|---|
| Says | the lessor gave a price and a count only | which chips are active, and how many the offer holds |
| Carries an action | no — nothing can be done about it | yes — «امسح التصفية» |
| Reached when | the offer registers **no** machine at all | the offer holds machines and the chips hid them all |

### 6.5 Equipment detail

Opening the details replaces the panel with that machine:

1. a **full-bleed hero photo** with a back control — the machine is identified by sight first
2. **two tabs** — the machine, and its documents
3. one line under the tabs: availability chip · distance · yard
4. **the match grid — the main content.** Six cells scoring this machine against *this request*:
   year & manufacturer · attachments · equipment photos · proof of ownership · equipment certificate ·
   operator certificates. Each reads green (satisfied), grey (not required) or **red (missing)**, and
   each states the actual finding — ~~"3 of 4 uploaded"~~ **"2 of 2 uploaded"**, "on the machine's file",
   "not on the file".

> ~~**The photo cell's "N of 4" is a completeness VERDICT, not a row count.** It survives §6.6's
> 2026-08-08 rule unchanged, and the two must not be confused: the grid scores the machine against the
> request and reports a fraction over all four slots, while the documents tab renders **rows** and
> counts only the ones that render. A reader arriving from §6.6 would otherwise expect this fraction to
> shrink to the required slots; it does not. Neither number is normative for the other.~~
>
> **WITHDRAWN — the owner ruled the opposite, and the code implements the ruling. 2026-08-09.**
>
> **The photo cell is scored over the REQUIRED slots only — `front` + plate — exactly like the
> documents group.** The paragraph above argued the cell was a separate kind of number that kept its
> denominator of four; it does not. `photosCell` in
> `src/components/map/panel/machine-panel-model.ts:354-365` reads `REQUIRED_PHOTO_SLOTS` (`:839`), so the
> denominator is **2**, and the module's own comment records the ruling and its date.
>
> **Why the owner reversed it, and it is not a preference.** Once §6.6's rule made the documents group
> require only the two slots the lessor is actually held to (mirroring `bid_readiness.dart`), the two
> numbers **contradicted each other on one screen**: a machine holding front + plate with no meter shot
> read *"nothing outstanding"* in the documents tab and **red, "2 of 4 uploaded"** in this cell. The cell
> follows the group, so the grid stops failing a machine on shots nobody asked for — which is the rule
> **every other cell already obeys**, and which §6.5 states in as many words below: *a cell nobody asked
> about cannot fail.* The withdrawn paragraph was the single place the grid broke that rule.
>
> A renter who wants to know whether the optional shots exist reads the **group**, where `meter` and
> `side` appear when they are uploaded (AC-74).

**The detail answers "does this machine fit my request", not "what is this machine".** A specification
dump would list attributes the renter must then judge himself; the grid does the judging and shows its
working. Anything that is merely descriptive belongs on the card, not here.

Selecting a machine focuses its map marker; selecting a marker focuses its card.

### 6.6 Documents

**Equipment documents** are the machine detail's second tab; **company documents** are the company
panel (§6.1). Both use the same **row** grammar: a thumbnail with a status dot, a name, a status line,
and **view**.

**Corrected 2026-08-08 (owner's UI design, 004a §8.2) — the row's own *download* is gone.** The grammar
read "view + download" per row. Downloading is now what the **batch** beneath the list does, so a per-row
download would be a second control for one act. **View stays**, so the renter can look at one paper
without selecting anything.

**Corrected 2026-08-08 — the two lists share the row and the tick, but not the verb underneath.** This
section said *"Both use the same grammar: select-all, a checkbox per row…"* and built to it; the product
owner has since decided that **a document request names a machine**, so the company list carries **no
batch ask and no request control of any kind**. The over-extension was to read one shared *row* grammar
as one shared way of *asking*.

**Corrected again, the same day, in the other direction.** This correction first read *"the company list
carries **no checkboxes, no select-all and no batch ask**"* — and that withdrew more than was decided.
**Select-all and the per-row checkbox are restored on the company list**, over the rows that carry a url;
the batch beneath them **opens or saves** the selection rather than asking for it, and a row with no url
is listed but not tickable. What stays withdrawn is the **ask**, and only the ask. See 004a §8.1.

#### One rule for every document row — owner's ruling, 2026-08-08

**This replaces the fixed-row design this section used to specify**, and it applies to **photos, proof
of ownership, equipment certificates and operator documents alike. No family is exempt.**

| | Held | Absent |
|---|---|---|
| **Required** | shown · green · openable · **not requestable** | **red, «لا يوجد مستند بعد» / "no document yet"** · counted in the attention count · **requestable** |
| **Not required** | shown · openable · **no verdict, no colour, not counted, not requestable** | **not rendered at all** |

**The requestable column collapses to one sentence — owner's ruling, later on 2026-08-08: _you can only
ask for what is not there._**

~~A *required* row is requestable whether it is held or not~~ — withdrawn. The first draft of this table
left a held-and-required row tickable, on the argument that a renter might want a legible re-scan of a
paper already on the file. The owner reversed it: **the batch ask exists to chase a paper that is
absent**, and an ask naming one the lessor can see on his own file has exactly one possible answer — *"it
is already there."* A re-scan is a conversation, not a document request.

So **selectable = the row is missing**, in every family, and the two halves of the old rule (a
not-required row was already unaskable) become one. A group with **nothing missing offers no batch
control at all** — not a disabled one, because a control whose only reachable outcome is an empty ask is
the dead control §7 / AC-69 forbids, moved one step later.

**"Required" means either of two things:**

1. **asked for by this request** — the equipment and operator certificates, exactly as
   `computeUnitReadiness` derives them by mapping over the request's own asks; or
2. **platform-mandatory regardless of the request** — the `front` and `serial`/plate photos, and proof
   of ownership: the set `bid_readiness.dart` holds the lessor to whether or not the renter asked.

**Why the fixed rows were wrong.** The platform already refuses to fail a party on something nobody
asked for. `matchGrid` greys an unasked cell in as many words — *"a cell nobody asked about cannot
fail"* — and **both** readiness scorers build their certificate list by mapping over the request's asks
rather than over a catalogue. §6.6's fixed rows were the one place that rule broke: they rendered a
red, counted, requestable row for a paper the renter had never asked for and the platform does not
mandate, which is a verdict nobody is entitled to.

**The property the fixed rows protected survives.** The reason they were specced was that the renter
must be able to see what is **missing** — a list of what a supplier happens to have uploaded answers no
question. That still holds, because every *required* row renders whether it is held or not. What
disappears is only the row that was never anyone's obligation.

An earlier draft of this section argued that a fixed row set was the only way to show absence; that
argument is withdrawn — it conflated "absent" with "owed".

**Equipment documents come in THREE groups**, ~~each with its own attention count~~ — **the first two carry
an attention count; the operator's carries none** (owner, 2026-08-08, §6.6a):

- **photos** — `front` and `serial`/plate are **required** and go red when absent; `meter` and `side`
  render **only when uploaded**
- **documents** — proof of ownership / registration (required), equipment safety certificates
- **operator documents** — their own group, §6.6a

**Corrected 2026-08-08 — this section specced TWO groups**, with the operator's paperwork as a single
row inside the second. That is withdrawn: an operator's documents are a different subject with a
different obligation, and burying five of them behind one row named "operator safety certificate" hid
both what was held and what was owed. See §6.6a.

**The two levels carry different status, and this is deliberate:**

| | Status shown |
|---|---|
| **Equipment** rows | **presence only** — uploaded / not uploaded / on the machine's file / no document yet |
| **Company** rows | **verification and expiry** — verified, valid-until, renews-annually |

A machine's paper is either there or it isn't; that is all the renter can act on, and a verification
badge here would invite him to judge a supplier on a state the platform sets. A company's paper has a
real lifecycle — it is checked, and it expires — so hiding that would strand him.

**Requesting is a batch action, not a per-row button — on the equipment tab, which is the only list
that can be requested from.** The renter ticks what he wants and asks once; one card carrying several
types beats several cards carrying one each.

**Both lists tick; the verb differs.** ~~The company list has nothing to tick~~ — corrected 2026-08-08
(004a §8.1). The company list ticks too, and its batch **opens or saves** the selection: its papers are
read, never requested. The other difference is which rows may be ticked, and it follows from the verb —
a company row with **no url** is not tickable (nothing to save), while an equipment row that is
**missing** is exactly the one worth ticking (that is the paper being asked for).

~~an equipment row with no url is exactly the one worth ticking~~ — corrected the same day, twice over.
The equipment rule is *missing*, not *url-less*: a paper can be **on the file with no signed link**, and
that row is not a gap the lessor can close. And the operator's rows now carry no url at all by design
(§6.6a), so "no url" would have made every one of them askable, including the ones already on file — a
moot point since later that day, when the operator's rows stopped being askable in **any** state (§6.6a,
AC-75), but it is why the rule is *missing* rather than *url-less* for every other family.

### 6.6a The operator's documents — their own group

**Added 2026-08-08.** §6.6 listed "operator safety certificate" as one row among the machine's papers.
It is now a **third group with its own rows and its own attention count**.

#### These rows are a STATUS, not a document list — owner's ruling, later on 2026-08-08

~~every row in it is viewable, downloadable and requestable on the same terms as any other (§6.6's rule,
§7 / AC-69)~~ — **withdrawn.** The section was written with a view/download pair per operator
certificate, exactly like the equipment's papers. The owner reversed it:

> Show the operator's certificates the way the **bid-readiness card** already shows them: **present or
> not — green or red — and nothing else.** No view, no download, no file access.

**Why, and it is not a UI preference.** **Nothing validates an operator document on upload.** Handing the
renter a file to open presents an unchecked upload as if it were verified evidence, and this surface
exists to answer *can I trust this?* — so it must not imply a check that never happened. **Presence is a
fact the platform can stand behind; the contents are not.**

~~What the group keeps: its heading, its rows, its own attention count, and requestability under the rule
above (askable exactly when the certificate is absent). What it loses: view, download, the multi-file
treatment of §6.6a's own defect note below, and any url reaching the renter.~~

#### Narrowed again the same day — a STATUS is all of it

The paragraph above kept the checkbox on a missing certificate and kept the group inside the attention
count, and the implementation shipped exactly that: a tick on every red operator row, composing into the
batch ask. **The owner withdrew it**, in the same sentence as the first ruling:

> Operator docs **cannot be viewed or requested** and are **not part of docs** — they are just a view of
> what the supplier has.

So the group is not a quieter kind of document list; **it is outside the document machinery**. The reason
is the one already given, carried to its end: nothing validates an operator document on upload, so
**presence is the only claim the platform can stand behind** — and a claim the platform cannot back is not
a surface the renter should be invited to act on. It tells him what the lessor holds and stops there.

**What the group keeps:** its heading, its rows, and **green/red per certificate**.

**What it loses:** view, download, any url reaching the renter, the multi-file treatment of §6.6a's own
defect note below — and now **the checkbox in every mode, its place in the batch ask, its select-all key,
and its attention count**, both its own pill and its contribution to the tab's badge.

**The count goes because the count is a promise.** The pill reads *"N rows need action from you"*, and
there is no action here to take. A number would promise one; a zero would print «لا ينقص شيء» in green
over a row that is red. So the group states no count at all — which is not the same as stating zero, and
the implementation carries the distinction (`DocGroup.attention` is `null`, not `0`).

**The rows read the scorer, not a second reading of the machine's file.** `computeUnitReadiness`'s
`operatorCerts` already carries this exact shape — `{code, labelEn, labelAr, present, url}` — so the
group reads **`present` and ignores `url`**. That also settles the row set: the scorer maps over the
certs *this request asked for*, so an operator paper nobody asked about raises no row. With no verdict,
no place in the count and no file behind it, such a row would have nothing left to say.

**Equipment papers, photos and company documents are unaffected** — they keep **view** (§7 / AC-69; the
per-row download went from all of them together on 2026-08-08, 004a §8.2).

The backend's operator vocabulary, verbatim, because it is not guessable from the pattern:

`operating_license` · `operator_tuv` · `operator_spsp` · `operator_id` · `operator_insurance`

⚠️ **`operating_license` carries no `operator_` prefix.** Anything that identifies an operator paper by
that prefix drops the licence — the most important one in the set.

Which of these are **required** follows §6.6's rule: the operator certificates this request asked for,
as `computeUnitReadiness` derives them. ~~An operator document nobody asked for renders when it is held
and does not render when it is not.~~ Corrected with the status ruling above: an operator document
nobody asked for renders **no row in either case**. The held-and-unrequired row existed to let the
renter *open* a paper the lessor happened to hold; with no file behind it, it would state nothing.

#### The defect this group fixes — the first file only

Recorded because it was silent, and because it is not confined to the operator's papers. The paper rows
resolved their link as `held.find(d => d.url)?.url` — **the first file that carries a url, and nothing
after it.** A machine holding **two** ownership documents, **two** equipment certificates or ~~**two**
operator papers~~ rendered one link and **silently dropped the rest**. Nothing on screen said a second
file existed, so the renter read a complete row over an incomplete disclosure. Every file a row covers
must be reachable.

**The operator's papers are struck from that list, not fixed in it** (status ruling above): they expose
no file at all, so there is no first link and no dropped rest. The defect and its fix stand for
**ownership and equipment certificates**, where the renter does open files. It is recorded here rather
than moved because this group is where it was found.

### 6.7 The four requests

| Request | Raised from |
|---|---|
| **اطلب تأكيد التوفّر** | the card, and the detail |
| **اطلب معدّة أخرى** | bottom of the list (dashed), and inside each detail |
| **اطلب مستنداً** | per **missing** document row — **equipment only** (corrected twice on 2026-08-08; this row read "equipment and company", and then "per document row", which the *ask only what is missing* ruling makes false — a paper on the file raises no ask) |
| **اطلب إضافتها** | the shortfall alert (§6.3) |

Each is bound to one `equipmentId` (null for the shortfall ask) and posted as a `rentee_request` card.
**Card state is derived on every render** by re-reading the machine — never stored on the message.

**Why the company ask went.** It was specced on the symmetry of §6.6's row grammar rather than on
anything a supplier could act on: a company paper belongs to the firm, so the ask names no machine, and
the only thing that could ever close it is the supplier editing his own profile — which he does from his
profile, not from a conversation. Meanwhile the renter can already *see* every company paper and open it
(§7 / AC-69), so the question the ask was meant to answer is answered by looking. **A document request
names a machine; a company paper is read, not requested.** Stated as an AC in the addendum, §8.

Note that `null` in the row above remains correct for **one** ask only — the shortfall's
«اطلب إضافتها», which asks *for* a machine and so has none to name. That is unchanged.

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

> ### ⚠️ `RM3-AC-*` is the ONLY live prefix for this feature — added 2026-08-08
>
> Every criterion for the deal-room rentee map, in this spec and in the 004a addendum, is numbered
> **`RM3-AC-nn`**. The 004a addendum continues the same series (it resumes at 43); there is no second
> numbering.
>
> **A bare `AC-nn` in a test name or comment is historical and is NOT traceability.** Those citations
> come from spec 001 and from v2 of this feature, where the same integers mean different things.
> `fleet.test.ts` is the clearest example: `describe("what gets plotted (AC-19)")` is about
> **plottability**, while **RM3-AC-19** is the criterion that a pin and its card chip take colour from
> the same derivation. Nothing links them but the number.
>
> **Any AC-to-test map built by grepping for `AC-nn` will report false coverage** — and it will do so on
> exactly the criteria a reader is most likely to trust, because a hit looks like evidence. A coverage
> tool must match **`RM3-AC-`** with the prefix included, and must treat a bare `AC-nn` as no citation
> at all.
>
> The test files still carrying bare citations are listed in the follow-up ticket; renumbering them is
> not part of this spec's changes, because several are owned by work in flight. **The authority in the
> meantime is §9's test plan**, which names the file and the assertion for each `RM3-AC-*` explicitly
> rather than relying on a string in a test name.

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
| RM3-AC-14 | web | **Given** التفاصيل **When** activated **Then** the panel is replaced by that machine showing, in order: a hero photo with a back control · two tabs (the machine · its documents) · one line carrying the availability chip, the distance and the yard · the **six-cell match grid** (§6.5) · the document rows on the second tab · and «اطلب معدّة أخرى». *(Rewritten 2026-08-08. It read "that machine's **full specification**", which §6.5 contradicts in as many words — "not a specification dump… anything merely descriptive belongs on the card, not here". The old wording was both unassertable and the opposite of the design; a test can now enumerate what the model exposes.)* |
| RM3-AC-15 | web | **Given** a machine is selected from the list **Then** the same `selectedMachineId` reaches the map (`MapCanvas.selectedId`) and the list (`EquipmentList.selectedId`); **Given** a marker is activated **Then** it sets that same value, so exactly **one** machine id is selected on both surfaces at any moment and re-selecting the current one clears it. *(Rewritten 2026-08-08. It read "its marker is **distinguished**" — undefined, so nothing could assert it. The assertable claim is that one selection value reaches both surfaces; how a distinguished marker *looks* is a manual check.)* |
| RM3-AC-16 | web | **Given** an **equipment** document row **When** it renders **Then** it carries **no verification status**; **When** it carries a url **Then** it offers **view** (AC-69); and **When** the paper is **missing** (§6.6) **Then** it is **requestable** — and only then. A row that is *on the file*, required or not, is openable but is **not** the renter's to request; it is, however, **tickable for download** (004a §8.2). *(Re-scoped four times on 2026-08-08. It read "**any** document row… offers open, download and request". Three things were wrong: a **company** row now offers open and download but never request (AC-71/72); under the required/not-required rule a not-required held row is openable without being owed (AC-73); and the "required ⇒ requestable" clause that replaced it was itself withdrawn later the same day — you can only ask for what is not there, so a required paper already on the file is not requestable either. **The operator's rows are the exception to the first clause AND to the third**: they carry no url by design and offer no control at all — no view, and (from later that day) **no checkbox and no ask, absent or held** — AC-75. **Fourth**, the owner's UI design withdrew the per-row **download** — saving is the batch's job — and made a held row **tickable** for it; *requestable* is unchanged and still means *missing*, AC-77.)* |
| RM3-AC-17 | web | **Given** any of the four requests **When** composed **Then** it carries the machine as data (`equipmentId`), not only in prose, and is sent explicitly by the renter |
| RM3-AC-18 | web | **Given** a request card **When** its state renders **Then** it is derived by re-reading the machine, with nothing persisted on the message |
| RM3-AC-19 | web | **Given** a machine **When** its pin AND its card chip render **Then** both take their colour from `unitAvailability(unit)` (derived from `locationSource`) and **never** from the `yardConfirmed` boolean, so the two can never disagree |
| RM3-AC-20 | web | **Given** an unconfirmed machine **When** its copy renders **Then** it reads as *unanswered*, never as refused or unavailable |
| RM3-AC-21 | web | **Given** the map **When** it renders **Then** it shows the project pin, one marker per offered machine, a distance chip and a route back to the project |
| RM3-AC-22 | web | **Given** a unit whose availability is `absent` — a claimed count (`unidentified`) or a machine with no resolvable location (`none`) — **When** the map renders **Then** it is **not drawn**; an undrawable unit cannot carry a colour |
| RM3-AC-23 | web | **Given** the surface **When** it renders **Then** chat is reachable from a persistent dock, and there is no edge rail |
| RM3-AC-24 | web | **Given** the price footer **When** its model is built **Then** every figure comes from `computeDealTotals` through `priceFooterModel`, fed by the **same accessors the deal room uses** — `agreedUnits ?? unitsOffered` for the priced count, exactly `mapDealRoom`'s precedence, and the request's **`estimatedDurationDays`** for `periods`, the same field `deal-room.ts` maps — and the negotiation entry point is the existing flow. *(Rewritten 2026-08-08. It read "every figure **matches** the existing deal-room bar", which a test can satisfy by hand-feeding both sides the same numbers and proving nothing. The assertable claim is that the **inputs** are derived through one path — `estimatedDurationDays` named explicitly, because it is the one value the footer cannot read off the bid and the one most likely to diverge.)* |
| RM3-AC-25 | web | **Given** an off-platform offer **When** the renter opens it **Then** this surface is **not** used — the existing submission viewer and negotiate room open instead, unchanged |
| RM3-AC-26 | web | **Given** an offer whose supplier registered no machines **When** the list renders **Then** it states that a price and a count were given, with no empty card furniture |
| RM3-AC-27 | app-backend | **Given** the fleet read **When** it resolves a machine **Then** `locationSource` follows the §7.2 precedence, and `yardConfirmed` is reported verbatim from **this bid's** `unitsOffered` entry — reported, never rendered |
| RM3-AC-28 | web | **Given** the equipment list **When** the offer spans more than one distance band **Then** a distance filter renders with v2's own bands — الكل · ≤ ٥٠ · ≤ ١٠٠ · ≤ ٢٠٠ كم — and «الكل» is the cleared state rather than a chip. *(**Rewritten 2026-08-08 by owner decision.** v3 forbade this control, arguing "the fleet belongs to one supplier, so filtering it hides machines without helping a comparison the renter is no longer making". **That argument is withdrawn.** It was sound about the v2 control, which filtered competing OFFERS on the bids list; it does not carry to a list of one lessor's machines, where the renter is not comparing anyone and is narrowing to what he can accept. The rules that made the removal feel necessary are kept and generalised as AC-28a→28e rather than discarded with it — see §6.4a.)* |
| RM3-AC-28a | web | **Given** the filter row **When** it renders **Then** it offers **only criteria the request asked for** — no certificate chip for a certificate the request did not name, no year chip without a minimum-year ask — and every chip selects for what a machine **HAS**, never for what it lacks; controls AND together and chips inside one control OR |
| RM3-AC-28b | web | **Given** any control **When** it would keep every machine, or none **Then** it does not render at all — and therefore no single chip can empty the list |
| RM3-AC-28c | web | **Given** a machine with no resolvable distance **When** any band is active **Then** it is **kept, never hidden** — unknown is not far — and the distance row states that it is; **given** a machine with no year on file **When** the year chip is active **Then** it **is** filtered out, agreeing with §6.5's red on that same machine |
| RM3-AC-28d | web | **Given** any filter state **When** the count renders **Then** it states the whole — «٣ من ٨» — with the offer's own total as the denominator, never the filtered figure |
| RM3-AC-28e | web | **Given** a filter that leaves nothing **When** the empty state renders **Then** it **names the active chips**, states the offer's total and offers «امسح التصفية» — and is not reachable by, nor mistakable for, AC-26's "no machine is registered" |
| RM3-AC-29 | web | **Given** the surface **When** it renders **Then** there is **no bid-quality score, ring or percentage** anywhere; quality ranking belongs to surfaces that compare offers, and this one verifies a single offer |
| RM3-AC-30 | web | **Given** an unconfirmed machine **When** its chip renders **Then** it states only that availability is not confirmed — **no reason, no cause, no location-source explanation** — with the request as the next step |
| RM3-AC-31 | web | **Given** the counts **When** the shortfall is computed **Then** `claimed = offered − registered`, and it is never derived from the fleet total or any other count |
| RM3-AC-32 | web | **Given** a confirmed machine that is in the offer **When** its card model is built **Then** availability and commitment are carried by **one chip value**, and the model exposes **no second band field** for commitment. *(Rewritten 2026-08-08. The trailing clause read "so every card in the list has the same height" — a rendered-layout fact no `node` test observes. It was the *reason* for the rule, not the rule; the assertable claim was already in the sentence before it. Equal height stays a **manual** check.)* |
| RM3-AC-33 | web | **Given** a card whose availability is unconfirmed **When** the request action renders **Then** it is **blue**, never navy — beside a red chip, navy reads as disabled |
| RM3-AC-34 | web | **Given** the surface loads **When** it first renders **Then** the offer's **confirmed** machine is already selected — card accent, pin lifted with halo and an in-offer tag — and **no detail opens** |
| RM3-AC-35 | web | **Given** that pre-selected card **When** it draws attention **Then** the cue is **finite**: the keyframes run **exactly 6 iterations** and the stylesheet contains **no `infinite`** on that animation, and the class is removed after **`LANDING_CUE_MS = 9_400`** ms (`BidMapWorkspace.tsx`). **Manual:** the resting shadow is preserved across the cue, so the card never appears to shift. *(Rewritten 2026-08-08. It read "**roughly** six times over **about** nine seconds" — neither "roughly" nor "about" can be asserted. The count and the named constant are exact; the shadow clause is a visual fact and is labelled as manual rather than left to look testable.)* |
| RM3-AC-36 | web | **Given** the equipment detail **When** it opens **Then** it shows a hero photo, two tabs (machine · documents), an availability/distance/yard line, and a **match grid against this request** — not a specification dump |
| RM3-AC-37 | web | **Given** the match grid **When** it renders **Then** each cell states its actual finding and reads green, grey (not required) or **red** when missing |
| RM3-AC-38 | web | **Given** the **equipment** document surface **When** it renders **Then** it offers a thumbnail with a status dot per row, per-row **view** on every row that carries a url, **one checkbox column whose meaning is set by the first tick** (004a §8.2), and a select-all per mode — «حدّد كل المتاح» over the held rows, «حدّد كل الناقص» over the missing, **exactly one of the two rendering at a time, chosen at neutral by the majority of the tickable rows (AC-78)** — with «إلغاء التحديد (n)» back to neutral. **No operator row carries a checkbox or appears in either select-all list** (AC-75). Both requesting and downloading are **batch** actions over the ticked rows, and **both footer buttons stay visible with only the supported one live**. **When** a mode has no rows to offer **Then** its select-all does not render, rather than one that could only compose an empty batch. *(Re-scoped three times on 2026-08-08. This read "either document surface": the company panel offered the same select-all and batch **ask**. It no longer does — a document request names a machine, RM3-AC-71; the company panel does still offer select-all and a checkbox per openable row, and its batch **downloads** — RM3-AC-72, 004a §8.1. Re-scoped again later the same day: "a checkbox per row" was true of **every** row, then of the **missing** ones only. It is now true of every row **a batch can answer** — the missing ones tick for a *request*, the held-and-reachable ones tick for a *download*, and never both at once (AC-77/78). The per-row download glyph went at the same time. "You can only ask for what is not there" is untouched by that.)* |
| RM3-AC-39 | web | **Given** equipment document rows **When** they render **Then** they show **presence only** — uploaded / not uploaded / on file / none yet — and **never** a verification badge |
| RM3-AC-40 | web | **Given** company document rows **When** they render **Then** they **do** show verification state and expiry, because a company paper is checked and does expire |
| RM3-AC-41 | web | **Given** the company panel **When** it renders **Then** it carries CR, VAT, national address, local content **and SASO registration** — **and no IBAN** — with an attention count that counts rows needing action, never a total. *(Corrected 2026-08-08: this named four papers. The panel lists **five**; SASO was the missing one. See §6.1 for why local content and SASO are not catalogue documents.)* |
| RM3-AC-42 | web | **Given** the equipment documents tab **When** it renders **Then** photos, documents and **operator documents** are **three groups**; ~~each with its own attention count~~ **photos and documents each carry an attention count and the operator's carries none** — and where there is a count it is over **the rows that actually render**, never a fixed slot total. *(Rewritten twice on 2026-08-08. This read "photos and documents are two groups": the operator's papers were one row inside the second group, and the photo group was a fixed four slots counted "N of 4". Under §6.6's rule the operator gets its own group (§6.6a) and `meter`/`side` render only when uploaded, so a fixed denominator would count rows that are not on screen. Then "each with its own attention count" was withdrawn for the operator's group alone: with no tick, no ask and no file on those rows, a count would name an action the renter cannot take — AC-75, §6.6a.)* |

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
| RM3-TC-08 | AC-16 | web | same | an **equipment** document row exposes **view** when it carries a url and nothing when it does not, exposes a request only when the paper is **missing**, and exposes no verification status in any state. *(Re-scoped three times on 2026-08-08 — the third withdrew the per-row download (AC-69, 004a §8.2) with AC-16: a company row exposes open and download and **no** request — asserted by TC-21; and "exposes open, download and request" on every row is now false of a held one, which cannot be requested, and of an operator row, which cannot be opened.)* |
| RM3-TC-09 | AC-17, AC-18 | web | `tests/unit/deal-room-cards.test.ts` | payload carries `equipmentId`; state recomputed from a mutated machine with nothing read off the message |
| RM3-TC-10 | AC-19, AC-20, AC-21, AC-22 | web | `tests/unit/bid-map.test.ts` | one colour scale; unconfirmed copy contains no refusal wording; claimed units produce no marker |
| RM3-TC-11 | AC-23, AC-24 | web | manual | chat dock persistent, no rail; footer figures match the deal-room bar for the same room |
| RM3-TC-12 | AC-25, AC-26 | web | `tests/unit/bid-equipment-access.test.ts` | an off-platform bid never routes to this surface; a platform offer with no registered machines renders the explanatory state with no empty furniture. *(Re-pointed 2026-08-08. This named `tests/unit/link-bids.test.ts`, which only ever asserted that the mapper sets `viaSharedLink` — it never tested routing, so AC-25 had **no** coverage. Worth stating why the guard it was meant to cover was dead: the guard tested `bid.viaSharedLink`, which the route's own mapper never sets, and an off-platform id is `link-…` — a different entity whose fetch cannot succeed. A real off-platform deep link therefore landed on "this offer couldn't be loaded" rather than on its own surface.)* |
| RM3-TC-13 | AC-27 | app-backend | `.../rentee-unit-location.test.ts` | `yardConfirmed` reads the bid entry, not the listing |
| RM3-TC-14 | AC-29, AC-30 | web | `tests/unit/bid-map.test.ts` | the view model exposes no quality figure, and the unconfirmed chip carries no reason/cause field. *(**Re-pointed 2026-08-08.** This also required "no distance-band state". AC-28 reversed, so that clause inverts and moves to TC-14a — a negative assertion cannot survive the criterion that made it negative.)* |
| RM3-TC-14a | AC-28, AC-28a→28e | web | `tests/unit/equipment-list.test.ts` | the view model **does** expose distance bands — exactly ≤50/≤100/≤200 — and only under the stated conditions: a control absent when the request did not ask, absent when it would not split the list, the predicate ANDing across controls and ORing within one, the count carrying the unfiltered total, a null distance kept by every band while a null year is filtered out, the marker set equal to the **filtered** list minus what cannot be plotted, and an empty state that neither reaches nor resembles AC-26's |
| RM3-TC-15 | AC-31 | web | same | `claimed` is `offered − registered` across fixtures — including registered > offered, which must clamp to zero rather than render a negative shortfall |
| RM3-TC-16 | AC-32, AC-33 | web | same | the card model emits one availability chip carrying commitment, no second band; the request action's token is the blue one |
| RM3-TC-17 | AC-34, AC-35 | web | same | initial state selects the offer's confirmed machine with no detail open; the attention cue is finite (~6 cycles) and not a persistent loop |
| RM3-TC-18 | AC-36, AC-37 | web | same | detail model exposes hero photo, two tabs and six match cells; a missing requirement yields red and a not-required one yields grey |
| RM3-TC-19 | AC-38, AC-39, AC-40, AC-41, AC-42, AC-71, AC-72 | web | same | the **equipment** surface exposes a per-mode select-all + per-row selection feeding a batch **request** *or* a batch **download**; the **company** surface exposes select-all + per-row selection over its openable rows and a batch **download**, and **no request control** — while listing every paper with its status and its **view** control; equipment rows carry presence only and no verification field; company rows carry verification + expiry and **exclude IBAN** and **include SASO**; photos, documents and operator documents are **three** groups, each counting only rows needing action, the operator's group stating presence with no url on any row; and on the equipment surface a **request** still reaches the **missing** rows only, whatever the checkbox column allows a tick on. *(Rewritten 2026-08-08 five times over: it read "both surfaces expose select-all + per-row selection and a batch request", which the company reversal made false; then "the company surface exposes neither — no tick, no select-all, no send", which §8.1 makes false in turn; then "per-row selection" over every equipment row, which the *ask only what is missing* ruling makes false. It also named two groups and four company papers, and gave the operator's rows a view/download pair they no longer have.)* |
| RM3-TC-20 | AC-71 | web | `tests/unit/rentee-request-loop.test.ts` | a `document` ask composed with a null, absent, empty or whitespace `equipmentId` is refused, including when it names only company papers (`cr`, `local_content`, `saso`); a `scope` asserted by a caller is not honoured because there is no scope input; the shortfall's company-scope `alternative` still composes |
| RM3-TC-21 | AC-72 | web | `tests/unit/machine-panel.test.ts` | the company row model carries no requestable document types, and the batch composer takes a machine id it cannot be handed a null for; every company row still resolves its **view** control |
| RM3-TC-22 | AC-73, AC-74 | web | same | over a machine holding some papers and missing others: every **required** row renders in both states and is counted only when absent; a **not-required** absent paper produces **no row**; a not-required held paper produces a row with no colour and no place in the count; the photo group's count equals the number of rows it rendered; and **requestable is the same set as missing, in every group that can be asked of** — a held row is never requestable, and a batch composed from an all-ticked selection carries only the absent papers. *(Scoped 2026-08-08: ~~"in every group"~~ included the operator's, where **no** row is requestable in either state — AC-75. The test excludes that group by name rather than by a filter that happens to skip it, so the exception stays visible.)* |
| RM3-TC-23 | AC-75 | web | same | the operator's papers form their own group ~~with its own attention count~~ **that participates in nothing**, each row stating only *on the file* or *no document yet*, **carrying no url and exposing no control in either state** — and asserted as a negative, since a group that renders must be provably unreachable rather than merely usually skipped: **no row requestable, no row selectable at neutral or in either mode, no operator key in either select-all list, no operator row in the request draft even with every row on the tab ticked, no doc type to ask with, and nothing added to the tab's badge (`attention` is `null`, not `0`)**; a request naming an operator licence resolves against a held `operating_license` despite its carrying no `operator_` prefix; a request that asked nothing of the operator renders no group, whatever the machine holds |
| RM3-TC-24 | AC-76 | web | same | a machine holding two ownership documents or two equipment certificates exposes **every** file — never the first alone. *(Operator papers were named here too and are struck: under AC-75 they expose no file at all, so there is no first link and no dropped rest.)* |
| RM3-TC-25 | AC-69, AC-72 | web | `tests/unit/machine-panel.test.ts` | **New 2026-08-08 (004a §8.1).** The company panel's selection: every row carrying a url is selectable and a row carrying none is **listed but not selectable**, including a paper marked present whose key was never signed; the batch covers **exactly the ticked rows that have urls**, in list order — a tick that survives a row losing its url drops out of it, so the control's count and the files it saves are the same number; an empty selection yields an empty batch; each saved file is named after the row the renter read, keeping the url's extension when there is one and omitting it rather than guessing; and the module exposes a download path and **no request path** |

## 10. Open

All resolved. Kept as a record so a later change does not reopen them by accident.

| # | Question | Decision (2026-08-08) |
|---|---|---|
| 1 | What happens to off-platform bids on this surface? | **Nothing — they never reach it.** They keep `SharedBidSubmissionModal` + `SharedBidNegotiateRoom` exactly as they ship (§6.11). An earlier draft designed a replacement view; that is withdrawn. |
| 2 | Keep the distance filter? | ~~**Removed** (AC-28).~~ → **Reinstated 2026-08-08 by owner decision**, with bands, rules and an empty state (§6.4a, AC-28 rewritten, AC-28a→28e added). |
| 3 | Does the unconfirmed chip need a reason? | **No** (AC-30). Availability-not-confirmed plus the request is the whole message. |
| 4 | Is `claimed = offered − registered`? | **Yes** (AC-31). The prototype's figures were demo-forced via `offerCase` and are not the rule. |
| 5 | Bid quality on this surface? | **No** (AC-29). Quality ranks offers against each other; this surface verifies one. |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-09 | **Documentation-only pass. Nothing here changes behaviour; it closes the gap between the written record and the code, which had already produced one live defect.** (1) **§6.5's photo-cell note is withdrawn — the spec contradicted a ruling the code obeys.** It insisted the cell's *"N of 4"* survived §6.6's rule *"unchanged"*, scoring over **all four** slots. The owner ruled the opposite: the cell is scored over the **required** slots only (`front` + plate), so the denominator is **2**, and `photosCell` (`machine-panel-model.ts:354-365`, `REQUIRED_PHOTO_SLOTS` at `:839`) has implemented that ruling since 2026-08-08 with the reasoning in its own comment. The note was the single place the grid broke *"a cell nobody asked about cannot fail"* — the rule §6.5 states two paragraphs later — and it put two disagreeing numbers on one screen: front + plate with no meter shot read "nothing outstanding" in the documents tab and **red, "2 of 4 uploaded"** in this cell. §6.5's example is corrected to "2 of 2 uploaded"; the withdrawn paragraph is struck in place, not deleted. `tickets.md`'s V7 corrected to match, where "3 of 4" had contradicted V8's *never "of 4"* (AC-74). No AC asserted the fraction, so none is rewritten. (2) **§6.1's per-row "one at a time" and the operator group's attention count** corrected in situ — see those sections. (3) **The layout source of truth at §6 is narrowed** — `rentee-map-v3-elements.md` carries geometry and intent; **004/004a win on behaviour**, and every rule that file states which was later withdrawn is now struck at source. (4) Seven superseded documents (specs 001 and 001-v2; `plan.md`, `design.md`, `coverage.md`, `RESUME.md`, `archive-tickets-v2.md`) were given superseded banners, and **both `unitsOffered` ownership guards — T2 (`cd47f713`) and T37 (`ecec55be`) — struck as withdrawn everywhere they were recorded as landed.** T37's still-live ticket body in `archive-tickets-v2.md` is the mechanism that caused the defect: the ticket was closed, the text stayed, a reader rebuilt the guard and shipped it. |
| 2026-08-08 | **Two owner corrections, each narrowing what had shipped.** (1) **The operator's certificates are a STATUS ONLY, outside the document machinery** — *"operator docs cannot be viewed or requested and are not part of docs; they are just a view of what the supplier has."* The previous ruling had taken away view and download but left a **checkbox on every missing certificate**, feeding the batch ask, and left the group **its own attention count**. Both are withdrawn: no checkbox in any mode, no place in any batch, no select-all key, and **no count** — not zero, none at all, because the pill promises an action and there is none (`DocGroup.attention` is `null`, and the tab's badge adds nothing). The group keeps its heading, its rows and green/red per certificate. The reason is the one already on record, carried to its end: **nothing validates an operator document on upload**, so presence is the only claim the platform can stand behind, and a claim it cannot back is not a surface to act on. Corrected in situ: §6.6's group list and its "no url" clause, **§6.6a** (a new subsection recording the narrowing), **AC-16**, **AC-38**, **AC-42**, TC-22, TC-23; and in 004a: §7's exception, §7.1's control row, **AC-73 scoped out of the operator family**, **AC-75 rewritten**, **AC-77** and **TC-26** extended. (2) **One select-all link, not two** — the build rendered «حدّد كل المتاح» *and* «حدّد كل الناقص» at neutral; the owner's prototype draws one. **Select-all follows the mode, and at neutral the majority of the group's tickable rows picks it:** *"if more than half is available then download; if more than half is missing, the request will be the enabled one."* A tie falls to «حدّد كل المتاح» (download acts only on the renter's own screen; a request reaches the lessor), and the majority is counted over **tickable** rows so an untickable majority cannot choose a link that selects nothing. The footer is untouched — at neutral both buttons stay visible and disabled. **AC-78** and §8.2 corrected in 004a. Also **the active footer button is NAVY `#1C3550`**, the prototype's own token (design-v3 §2), not the blue it shipped as; AC-33 is unaffected — that rules on `.mp-act` beside the availability chip, not on these two. |
| 2026-08-08 | **One checkbox column, two mutually exclusive modes** (owner's UI design, later the same day; written up normatively in 004a §8.2, with **AC-77**, **AC-78** and **TC-26** added there). Selection stops being one thing: the column's meaning is set by **the first tick** — a **held** row ticks for *download*, a **missing** row ticks for *request* — and the other kind **dims to 45% and goes inert** (`disabled`, `aria-disabled`, out of the tab order), so a selection can never mix. Both footer buttons stay visible, «تنزيل» and «اطلب من المؤجّر إرساله», with only the supported one live and carrying the count; the disabled one keeps the same shape, greyed with a paler border, muted text, 70% opacity and a `not-allowed` cursor. Select-all follows the mode — «حدّد كل المتاح» / «حدّد كل الناقص» — with «إلغاء التحديد (n)» back to neutral. **The per-row download control is withdrawn** from every family: downloading is the batch now, and **view** is what a row keeps so the renter can look at one paper without selecting anything. **What did NOT change:** *you can only ask for what is not there* — a held paper is still never requestable — and a **held row with no url** is still tickable in no mode at all. The **company panel is the single-mode case** and needed no fork: its rows are never requestable, so its column has one meaning, its select-all reads «حدّد كل المتاح», and it gets no request control (AC-71/72). Corrected in situ here: §6.1's row bullet, §6.6's row grammar, §6.6a's "unaffected" clause, **AC-16 and AC-38 re-scoped**, TC-08, TC-19, TC-21, TC-23; and in 004a: **AC-69 narrowed**, **AC-72 rewritten**, §7.1's control rows, and §8.2 added. ⚠️ **Wording flag:** the owner wrote «اطلب من المورد إرساله»; this surface says **«المؤجّر» and never «المورد»** throughout, so «اطلب من المؤجّر إرساله» ships. One word overrules it. |
| 2026-08-08 | **Two owner rulings, each withdrawing something this spec had just asserted.** (1) **The operator's certificates are a STATUS, not a document list.** §6.6a had specced a row per certificate with a view/download pair, "on the same terms as any other". Withdrawn: they are shown the way the bid-readiness card shows them — *present or not, green or red, nothing else.* **Nothing validates an operator document on upload**, so handing the renter a file to open presents an unchecked upload as verified evidence, and this surface exists to answer *can I trust this?* — presence is a fact the platform can stand behind, the contents are not. The rows read `computeUnitReadiness`'s `operatorCerts` (`present`, ignoring `url`), which also settles the row set: only the certificates *this request asked for*. Equipment papers, photos and company documents are unaffected and keep view + download. Corrected in situ: §6.6a's opening claim, its required/not-required paragraph, its first-file defect note, **AC-75 rewritten**, AC-76 scoped, AC-16, TC-08, TC-19, TC-23, TC-24, 004a §7's opening decision, §7.1's control row, and AC-69's note. (2) **A document can only be requested when it is NOT there.** §6.6's table left a *required* row requestable held or not, on a "legible re-scan" argument; the owner reversed it — an ask naming a paper the lessor can see on his own file can only be answered *"it is already there."* **Selectable = missing**, in every family, and a group with nothing missing offers **no batch control at all** rather than one that could compose an empty ask. Corrected in situ: §6.6's table and its "no url / missing" clause, §6.7's tick rule via 004a §8.1, **AC-73 amended**, AC-16, AC-38, TC-08, TC-19, TC-22. |
| 2026-08-08 | **The company panel's ticks come back — for opening, not for asking** (owner's ruling, later the same day; written up in 004a §8.1). The alignment pass below withdrew the company-scope document **request**, and the implementation withdrew the **selection UI** along with it — checkboxes, select-all, batch button. Only the ask was decided. **Select-all and a checkbox per row are restored** on the company panel, over the rows that carry a url; the batch beneath them **opens or saves** the selection and is **never** a request; a row with no url is listed but not tickable, because a tick that yields nothing when the batch runs is the dead control AC-69 forbids, moved one step later. The batch **downloads** rather than opening: a "view all" over five presigned links is five popups, of which a browser lets one through — a control that silently does one thing when five were asked for. View therefore stays **per row**. Corrected in situ: §6.1's withdrawn-selection bullet, §6.6's "corrected" note and its "the company list has nothing to tick" clause, AC-38's re-scoping note, **AC-72 rewritten**, TC-19 rewritten (third time), and **TC-25 added**. Unchanged and still load-bearing: **no request control anywhere on the company panel**, and `RenteeRequestDraft`'s `document` arm still cannot express a company ask. |
| 2026-08-08 | **Testability pass, from a coverage audit.** Five criteria were **unassertable as written** and are rewritten to name what a test can actually observe, each carrying the old wording and why it failed. **AC-14** claimed the detail shows the machine's *"full specification"* — which §6.5 contradicts in as many words — and now enumerates the panel's six parts. **AC-15** said the marker is *"distinguished"*, undefined; it now claims that one `selectedMachineId` reaches both `MapCanvas` and `EquipmentList`. **AC-35**'s *"roughly six times over about nine seconds"* becomes exactly 6 keyframe iterations, no `infinite`, and `LANDING_CUE_MS = 9_400`, with the resting-shadow clause labelled **manual**. **AC-32**'s *"the same height"* is a rendered-layout fact no `node` test observes — it was the reason for the rule, not the rule, and is now labelled manual. **AC-24**'s *"every figure matches the deal-room bar"* could be satisfied by hand-feeding both sides; it now requires the **inputs** to come through the same accessors, naming `estimatedDurationDays` and `agreedUnits ?? unitsOffered`. Also **AC-16** re-scoped a second time: a *not-required* held row is openable but not requestable (AC-73). And a boxed note added above §8: **`RM3-AC-*` is the only live prefix** — bare `AC-nn` in tests are spec-001 / v2 numbers that collide with live criteria, so any grep-built coverage map reports false hits (`fleet.test.ts`'s AC-19 is plottability; RM3-AC-19 is colour agreement). Offending files are listed in ticket **T44**. |
| 2026-08-08 | **Alignment pass — five owner rulings, each reversing something this spec asserted.** (1) **A document request names a machine.** §6.1, §6.6, §6.7, AC-16, AC-38, AC-41's panel and TC-19 all described a company-scope document ask with select-all and a batch request; the company panel is now **read and open only**, and the payload type cannot express a `document` ask with no machine. Viewing and downloading company papers is untouched (AC-71, AC-72; 004a §8). (2) **One rule for every document row**, replacing §6.6's fixed rows: a *required* paper renders held or not — red, counted and requestable when absent — and a *not-required* one renders only when held, with no verdict and no place in the count. The fixed rows were the single place the platform's own "a cell nobody asked about cannot fail" rule broke (AC-73). (3) **The photo group is no longer four fixed slots**: `front` and plate are required, `meter` and `side` render only when uploaded, and the count is over the rows that render — AC-42 rewritten, "of 4" withdrawn as a normative count (AC-74). (4) **The operator's documents are a third group** (§6.6a) rather than one row inside the machine's papers, with the backend's five-term vocabulary written down because `operating_license` carries no `operator_` prefix (AC-75); recorded with the silent defect it fixes — rows resolved `held.find(d => d.url)?.url`, the **first file only**, so a second ownership, equipment or operator paper was dropped without a trace (AC-76). (5) **SASO is the fifth company paper** — AC-41 named four; local content and SASO are **held certs**, not catalogue documents. Also: **TC-12 re-pointed** from `link-bids.test.ts` (which only ever asserted the mapper sets `viaSharedLink`, never routing) to `bid-equipment-access.test.ts`, and TC-08 re-scoped. Six ACs and five TCs added. |
| 2026-08-08 | **Verified against the prototype — three sections were wrong and are rewritten.** The spec had been written from the element list after rendering only two states, so §6.1, §6.5 and §6.6 described intentions rather than the design. Rendering the remaining states found: the **equipment detail** is a hero photo, two tabs and a **six-cell match grid against this request** — not the specification dump specced; the **company panel** is a batch-selectable document list that **includes IBAN**, which the spec had wrongly moved to a profile; and documents are **batch-selected**, not three buttons per row, with a deliberate asymmetry the spec had flattened — **equipment rows carry presence only, company rows carry verification and expiry**. Four later design changes folded in (AC-32→35): availability and commitment as **one chip** so cards keep equal height; the request action **blue**, since navy read as disabled beside a red chip; **landing pre-selection** of the offer's confirmed machine with no detail opening; and a **finite ~6-cycle** attention pulse that preserves its resting shadow. Twelve ACs and four TCs added. Still unopened: the document modal, and the chat dock beyond its badge. |
| 2026-08-08 | **Made self-contained.** All references to spec 001 removed. §7 replaced a four-row "see 001 §7.12 / AC-232→234" table with the real contract read from code: the fleet route and `mapFleet` → `FleetMachine` with a field-by-field map of every card element; the full `locationSource` → availability ladder; and the request-card rules from `rentee-request.service.ts`. A spec anchored to code cannot drift with another document, and this one no longer depends on which branch's 001 the reader has. |
| 2026-08-08 | **The equipment list gets filters — AC-28 is reversed, not quietly contradicted** (owner decision, stated twice). New **§6.4a** and **AC-28a→28e**; **AC-28 rewritten** from "there is no distance filter" to the bands that render and when. The withdrawn argument is left visible in AC-28, in the "do not reinstate" table and in open question 2, struck rather than deleted, so a reader sees a decision and not a mistake: it was sound about the **v2** control, which filtered competing OFFERS on the bids list, and does not carry to a list of one lessor's machines. **The caution survives the reversal** as four rules — only criteria the request asked for, no control that would not split the list, a count that always states the whole, and a map that follows — which is why a chip cannot be offered for a certificate nobody named, cannot appear when it would do nothing, and cannot let the offer read as smaller than it is. Bands are **v2's own** (الكل · ≤٥٠ · ≤١٠٠ · ≤٢٠٠ كم), reused rather than reinvented. Two asymmetries are decided and stated: a machine with **no distance** is kept by every band (unknown is not far) and the row says so; a machine with **no year** is filtered out, which is what §6.5's grid already says about it. **الملحقات is specified but never renders today** — the fleet row carries no attachments field, so no machine can be shown to have them and rule 2 drops the control; a chip there would be a verdict on the lessor drawn from our own missing column. `RM3-TC-14` loses its distance clause to the new `RM3-TC-14a`: a negative assertion cannot survive the criterion that made it negative. |
| 2026-08-08 | **Realigned against decisions and audited.** Five open questions closed: off-platform is **out of scope entirely** — an earlier draft designed a replacement submission view, now withdrawn, and its answer to question 1 was itself stale; the **distance filter** and **bid quality** are removed (AC-28, AC-29); the unconfirmed chip carries **no reason** (AC-30); `claimed = offered − registered` is normative and the prototype's demo-forced figures are not (AC-31). A "do not reinstate" table records why each removal happened. **One contradiction with shipped code fixed:** the spec implied `yardConfirmed` drives pin colour, but `bid-map.ts:74` states *"Never read the `yardConfirmed` boolean for colour"* — supplier-side it is only `yardId != null`, so it is true for every readiness-written entry. Colour comes from `unitAvailability()` via `locationSource`; had this shipped, every pin would have been green (AC-19, AC-22, AC-27). Also corrected an invented test path (`off-platform.test.ts` → `link-bids.test.ts`). Verified: every field the card promises exists on `FleetMachine`/`OfferedUnitDetail`, and the fleet endpoint is already wired in the web. |
| 2026-08-07 | Spec created from the v3 prototype and `rentee-map-v3-elements.md`. Records the shift from comparison to **verification**: one bid per view, entered from that bid's card, with the offers list, request block, item strip and edge rail all removed. Establishes the three count cases and the **orange-not-red** rule for the shortfall alert (red is reserved for availability). Fixes the equipment list as **flat, nearest-first, offered-only**, with not-offered machines reachable as a request rather than a second list. No backend change — the fleet total is the existing endpoint's row count. |
