# The renter's own equipment name, on every line

**Source:** owner, 2026-09-12, create flow on staging
**Status:** PLAN. Nothing implemented. Three of the six pieces need the backend or the agent first.

---

## What he asked for

1. The custom-type field is **always at the top** of the card. It stops meaning "off-catalogue" and
   starts meaning *the renter's own words for this machine*.
2. The taxonomy row loses **CATEGORY**: it is **TYPE + SIZE** only, and the freed column carries a
   short action that says *this is not my machine, use my own words instead*.
3. Three cases on the intake flow, and a second flow (a line added by hand) that must not become a
   typing exercise.

### The two rules he set (2026-09-12, second pass)

- **Reading is the taxonomy's job whenever there is one.** Taxonomy present ⇒ read the taxonomy.
  Taxonomy null ⇒ read the custom name. Never both, never a merge.
- **The custom name is NOT required.** It may be null. What must hold is that **one of the two is
  sent**: the taxonomy triple, or the name.

Both are already the backend's rules, exactly: `isUndefinedEquipment` is `!subtypeId`, and
`hasValidEquipmentIdentity` refuses a line carrying neither. So this is a WEB change, not a contract
change — the web is the side that got it wrong, by treating the two as mutually exclusive on the way
out and by demanding a name it did not need.

---

## Where the product stands today (verified, not assumed)

| Fact | Where |
| --- | --- |
| The card draws CATEGORY (read-only tag) · TYPE · SIZE, and the name box ONLY when the line is off-catalogue | `MachineCard.tsx:340-440` |
| «Off-catalogue» on the draft = `verdict === "no-match"` AND no subtype id | `gates.ts:44` |
| The payload sends **ids or the name, never both** | `app-adapters.ts` |
| The backend stores **both** independently, and derives `isUndefined` from `!subtypeId` alone | `createRequest.ts:302-305`, `utils/undefined-equipment.ts:31` |
| A request whose item has no subtype is **created but never dispatched**, to anybody, by any route | `createRequest.ts:788-808` |
| The broadcast matcher keys on `subtypeId` with **no visibility filter** | `broadcast-dispatch.service.ts:139-150` |
| `GET /agents/taxonomy` **excludes HIDDEN** unless `?includeHidden=true` | `getTaxonomy.ts:52-58` |
| The web asks for the taxonomy **without** that flag | `src/app/api/taxonomy/route.ts:22` |
| Mansour asks for it **without** that flag too | `Normalization-Agent/src/external/agents-backend.ts:139-142` |

**The consequence that decides case 3:** nothing in the renter chain can see a HIDDEN node today —
not the agent that matches, not the dropdown that picks, not the card that would name it.

---

## The design

### One field, one meaning

`customEquipment` stops being "the name of a machine we do not carry" and becomes **the renter's own
words for this machine**. It is the first field on the card, above TYPE and SIZE, on every line, and
whatever it holds is sent. It carries no star while a type is set: with a taxonomy on the line, the
name is a note to us, not an answer he owes.

Nothing about the wire has to change for that: `customEquipmentName` and the three ids are
independent columns, and `isUndefined` is derived from the subtype alone. A line with ids AND a name
dispatches, matches and reads back exactly as it does today, with his words stored beside it.

### The row

```
EQUIPMENT NAME            [ water tanker                                   ]   ← no star: optional
                                                                                  when a type is set

TYPE                       SIZE                    ┌ not my machine? ┐
[ Water truck        v ]   [ 20,000 L        v ]   │ Use my own name │
                                                   └─────────────────┘
```

CATEGORY is dropped from the card, not from the payload: the category id is already derived from the
chosen subtype (`SET_ITEM_CATEGORY` fires from the TYPE picker), so nothing downstream notices.

### Case 1 — the catalogue has it (the common case)

The name field holds what he typed; TYPE and SIZE hold what the agent matched. He does nothing, and
the request goes out **on the taxonomy**, with his words stored as our reference.

The third column offers the escape hatch. Pressing it clears the ids
(`SET_ITEM_OFF_CATALOGUE`, which already exists) and the line becomes case 2 in place. Picking a type
again reverses it (`SET_ITEM_SUBCATEGORY` already restores the verdict). Both directions are lossless
and already tested.

Copy, EN then AR, one line each, because the current phrasing has to be clearer than «not the same as
my equipment input»:

> **Doesn't match what I want? Use my own name of equipment**
> لا يطابق ما أريد؟ استخدم اسم معدتي

Pressing it clears the taxonomy AND raises the orange note, in one move — the note is the explanation
of the state he has just chosen, so it appears with it rather than before it.

### Case 2 — the catalogue does not have it

Unchanged, and it is what ships today: no ids, the name is required, the orange note explains that no
supplier is notified and the share link is the route.

The only difference is cosmetic: the name field is where it now always is (top), rather than appearing
only in this state.

### Case 3 — the catalogue has it, HIDDEN

The request should carry the hidden ids (so we know what he asked for) and reach no supplier.

**It cannot be built on the web first.** In order:

1. **Agent** must be able to match a hidden node — `getTaxonomyNodes` needs `includeHidden=true`, and
   the node's visibility must travel with it so the match can be labelled.
2. **Backend** must skip dispatch for an item whose subtype is HIDDEN. `isUndefinedEquipment` is
   `!subtypeId`, so a hidden id reads as an ordinary line and `broadcastDispatchService.dispatch`
   notifies every supplier listing under it — which is the exact thing a hidden node exists to
   prevent.
3. **Backend** must decide what the SUPPLIER-facing bid form says for such a line, since the request
   still travels by link.
4. **Web** then needs the hidden node's NAME to draw, which it cannot resolve from its own taxonomy
   (hidden nodes are not in it). Either the item carries `subtypeName` from the agent, or
   `/api/taxonomy` starts requesting hidden nodes and marks them unpickable.

Web-side, once those exist, case 3 renders like case 1 with case 2's honesty: the matched name is
shown, the row says nobody will be notified, the share link is the route.

### A DIRECT request is taxonomy only (owner, 2026-09-12)

No hidden node, no custom name. A request started from a supplier's listing carries that listing's
public triple and nothing else.

That is not a preference, it is the only shape that works: `createRequest` skips dispatch for a
subtype-less item **including DIRECT** (`createRequest.ts:792`), and `submitBid` refuses such a bid —
so an off-catalogue DIRECT request reaches nobody at all, not even the supplier it names. The renter
would have addressed a firm that never hears about it.

So on a direct line the card withholds three things: the «use my own name» action, the «Add a custom
equipment type» row inside the TYPE list, and any line added by hand that has no taxonomy. And a
listing whose subtype is HIDDEN must not offer «Request this» at all.

### Flow 2 — a line added by hand

He is right that it would be annoying if the name were required: adding a machine would become *pick a
type, pick a size, then type the name of the thing you just picked*. It is not required — and it can
also be better than blank.

**The answer: the name follows the taxonomy until he touches it.** Pick «Water truck · 20,000 L» and
the field fills with exactly that, editable, marked as ours (the provenance ring the canvas already
uses). Type over it and it is his.

⚠️ And because the name is not required, this is a convenience rather than a gate: he may clear it and
send the line on its taxonomy alone.

The same rule covers the agent flow: his own words seed it there, the taxonomy seeds it here, and in
both cases the field states what it holds.

---

## Web work

| # | Change | Files |
| --- | --- | --- |
| 1 | `customEquipment` documented as the renter's words for every line; seeded from `rawLabel` (agent) or from the taxonomy (manual), never silently from a search fragment | `contract/draft.ts` |
| 2 | `customName()` keeps `customEquipment ?? rawLabel`; a new `displayName(item, taxonomy)` adds the taxonomy fallback for the manual case | `contract/gates.ts` |
| 3 | Send `customEquipmentName` on EVERY item, beside the ids | `api/app-adapters.ts` |
| 4 | The name field moves to the top of the card and renders always; CATEGORY leaves the row; the row becomes two columns plus the action | `create/MachineCard.tsx` |
| 5 | The «use my own name» action, wired to `setItemOffCatalogue` | `create/MachineCard.tsx`, `i18n/{en,ar}.ts` |
| 6 | Gate: **one of the two, never a required name.** A line with a subtype passes whatever the name holds, empty included. A line without one is blocked until it is named — which is the same gate as today, unchanged | `contract/gates.ts` |
| 7 | Tests: the four cases, both directions of the escape hatch, and "the payload carries ids AND a name" | `tests/unit/custom-equipment*.test.*` |

## Backend work (a different agent writes these)

- **`GET /agents/taxonomy`**: the agent (and possibly the web) needs `includeHidden=true` plus the
  node's `visibility` on every node it returns. It already supports the flag.
- **Dispatch**: skip supplier notification when an item's subtype is HIDDEN, the same way an item with
  no subtype is skipped today. Without this, case 3 notifies exactly the suppliers it must not.
- **The bid form** for a hidden-taxonomy line: which name does the supplier read, and is the line
  shown at all?
- **Confirm** (cheap, and it unblocks case 1 on its own): a line sent with all three ids AND
  `customEquipmentName` stores both and behaves as an ordinary line. The code says yes
  (`buildItemData`), but it has never been exercised with both.

## Agent work (Mansour)

- Match against hidden nodes and SAY so, so the web can tell case 1 from case 3 without guessing.
- `input_equipment` is already the machine name only (2026-09-06), which is what seeds the field.

---

## Open questions — each one changes the work

1. **What does the SUPPLIER read on a case-1 line?** Today the bid form prints the taxonomy name
   («Water truck · 20,000 L») and the renter's words stay internal. If he wants the renter's own words
   shown instead, or beside it, that is a bid-form change on the backend.
2. ~~Is the name required when the catalogue matched?~~ **Answered (owner, 2026-09-12): no.** It may
   be null; one of the two must be sent.
3. **Case 3 order.** Hidden matching is three tickets across two repos. Build cases 1 + 2 now and case
   3 when the agent can see hidden nodes, or hold the whole batch together?

---

## Everything else worth deciding before a line is written

| # | Issue | Where | Who |
| --- | --- | --- | --- |
| 1 | **The deal room reads the custom name FIRST** (`pick("customEquipmentName", "subtypeName", …)`). Harmless today because the two never coexist; the moment a matched line carries a name, every deal room prints the renter's words instead of the catalogue's. Contradicts his own rule | `contract/deal-room.ts:549` | web |
| 2 | **One reader, not twelve.** The rule «taxonomy if present, else the name» must live in a single helper that every surface calls; a direct read of `customEquipmentName` anywhere is how #1 happens again | `contract/requests.ts` | web |
| 3 | **A hidden-node listing is browsable.** `browseEquipment` excludes HIDDEN only when a category filter is supplied; unfiltered browse has no visibility condition. Combined with the store press, a hidden subtype can reach a request TODAY and be dispatched to exactly the suppliers the flag exists to protect | `equipment.repository.ts:765` | backend |
| 4 | **Dispatch must refuse a hidden subtype**, the way it refuses a missing one. First ticket of the three, not the last: it makes every other hidden change safe | `createRequest.ts:788` | backend |
| 5 | **Tier 0 seeds `rawLabel` from the TAXONOMY name**, not the renter's words, so on the fastest lane the «his words» field would open holding ours | `agent/quick-draft.ts:132` | web |
| 6 | **Editing after posting.** The modal has no taxonomy picker and shows the name only on an `isUndefined` line. Under the new rule the name is editable on any line — and the PATCH's acceptance of ids + name is still unverified | `RequestEditModals.tsx`, backend | both |
| 7 | **Blank must go as `undefined`, never `""`.** The backend's `min(1)` refuses an empty string, so a cleared box would 422 a line that is otherwise valid | `api/app-adapters.ts` | web |
| 8 | **The orange note keys on the missing TAXONOMY**, never on the presence of a name. With names everywhere, a note keyed on the name would appear on every matched line | `create/MachineCard.tsx` | web |
| 9 | **The agent correction now carries his words on matched lines too** (`input_equipment` falls back to `customEquipment`). Probably right — it teaches Mansour what he typed — but it is a change in what we send back on EVERY line, not only on misses | `api/agent-adapters.ts:606` | decide |
| 10 | **The chart projection still does not select `customEquipmentName`** (logged 2026-09-08, still open). Every line having a name makes the gap more visible, not less | `getChart.ts` | backend |

---

## The OS bid link's QR, which this change breaks on its own

`getBidFormPreview` computes `hasCustomEquipment` — *does ANY line carry a renter-typed name* — and
**the Supplier OS suppresses its entire app handoff on it**: the QR dialog and the «Go To App» button
(Fadwa, 2026-09-09). The reasoning is sound and is written down: the app's only route for a bid link
is `/marketplace/requests/{id}`, a screen built around a taxonomy match, so a machine the taxonomy
could not place has no app surface to open.

That flag is **the literal name test on purpose**, and its own comment says why: today every
off-catalogue line necessarily carries a name, so the name-present set strictly CONTAINS the
off-catalogue set, and the conservative direction was to key on the name.

**This change inverts that reasoning.** Once every line carries the renter's words, the flag is true
for every request, and the OS hides the QR and the app button on **every bid link in the product**.

### The fix, and it is one predicate

The question the OS is really asking is *can the app open this request* — which is the same question
dispatch asks. So both should read one helper:

```ts
// no subtype, or a HIDDEN one: the app has no screen for it, and no supplier is notified
const appOpenable = (i) => !!i.subtypeId && i.subtypeVisibility !== 'HIDDEN';
```

- `hasCustomEquipment` is **re-derived** from that (`some(line => !appOpenable(line))`), keeping the
  field name so the OS needs no deploy, with the comment corrected in place.
- Or a second field is added and the OS moves to it, with the old one kept as an alias for one
  release. Two deploys, and the ordering has to be watched.

### ⚠️ Deploy order, or every link loses its QR for five minutes or more

`backend-agents` must ship the re-derivation **before** the web starts sending a name on matched
lines. In the other order, every request created in between hides its own app handoff. And the preview
is `Cache-Control: public, max-age=300` with the OS revalidating at 300s, so the wrong answer outlives
the deploy by up to five minutes either way.

---

## The store press, checked against the app (owner: «check the stores in the app and align»)

### What the app does

| | App | Web |
| --- | --- | --- |
| Where the press builds its prefill | `equipment_detail_page.dart:600`, `public_equipment_detail_sheet.dart:820` | `EquipmentDetailSurface.tsx:175` |
| A listing with NO measurement | `capacityId: equipment.measurementId!` — a force-unwrap, so it **throws** | `capacityId: … ?? ''` on the public sheet — sends **two of three ids**, which `hasValidEquipmentIdentity` refuses with a 422 |
| | | The web sends the triple only when **all three** exist, else it falls back to typed text |
| A listing under a HIDDEN subtype | nothing checks; the ids go through | nothing checks; the ids go through |
| Where the supplier's own listing can be created | `/equipment/taxonomy` → `getTree` → `RENTER_VISIBLE` — **hidden nodes are not offered** | same endpoint |

Two things follow, and they are worth separating.

**The web is already stricter than both app call sites, and that is not alignment to copy.** The app's
two paths disagree with each other — one crashes, one 422s — on the same missing field. Reported, not
imitated: 🔴 **app defect**, `equipment_detail_page.dart:603` force-unwraps `measurementId` and
`public_equipment_detail_sheet.dart:823` sends `''` for it.

**A supplier cannot self-list under a hidden node.** Both pickers read the renter-visible tree, so
such a listing only exists when RelayPanel or admin creates it — which is exactly the case the owner
described. So the browse leak is narrow, and it is real.

### What the web does under the new rule

A direct request is taxonomy only, so the press must be **unavailable**, with a reason, whenever the
listing cannot supply a complete public triple:

- any of the three ids missing → no direct request (today it silently degrades into a typed
  request addressed to a supplier who will never be notified, because an off-catalogue DIRECT is not
  dispatched at all);
- the subtype HIDDEN → no direct request.

⚠️ **The web cannot see the second condition.** `EquipmentDetail` carries `subcategoryId` and no
visibility, so the backend has to either keep such listings out of the renter-facing feeds or put the
flag on the payload. Until one of those exists, the web can only enforce the first.

---

## The behaviour, by flow and by case

**HIDDEN IS UNDEFINED** (owner, 2026-09-12). One meaning, not two: *«for us, hidden or free text,
both are undefined»*. The single thing a hidden line gets that a free-text line does not is what the
RENTER sees — the catalogue's name and its photograph, so the machine feels part of the system.

So there is one state question and one display question, and they are different questions:

```
undefined(line) = subtypeId == null || subtypeVisibility === 'HIDDEN'
     → dispatch (never), the OS QR (never), what this is FOR US, c-hub, reporting

name/image      = the taxonomy's, whenever the line carries one; his words otherwise
     → what the RENTER sees, on the card and on every screen afterwards
```

⚠️ **The display question is NOT keyed on `isUndefined`, and it is the same rule for EVERYBODY**
(owner, 2026-09-12): *«if null taxonomy then read from the user words, otherwise use taxonomy even if
hidden»*. Renter screens, the supplier's bid form, the card, the quotation, c-hub — one rule, no
audience special-cased. A reader asks «is there a taxonomy name», never «is this undefined».

So the renter's own words are shown in exactly one situation: **there is no taxonomy on the line.**

`customEquipmentName` decides nothing at all. It is carried, stored, and displayed only where there is
no taxonomy name to show.

### Flow A — he typed the request (intake)

**Case 1 · the catalogue has it (public)**

1. Mansour returns the triple plus his own words.
2. The card: NAME holds his words, no star. TYPE and SIZE hold the match. The third column offers
   «Doesn't match what I want? Use my own name of equipment», and pressing it raises the note.
3. Gates: the taxonomy gates as today. The name is never asked for.
4. Sent: **three ids + the name**.
5. Backend: `isUndefined` false ⇒ dispatched to matching suppliers, as any request.
6. Read back: the TAXONOMY, everywhere, both locales. His words are our reference (c-hub, the agent
   correction) and are shown nowhere.
7. The OS bid link keeps its QR and «Go To App».

**Case 1b · he presses «use my own name»** → the ids clear and the line IS case 2, in place. Pressing
a TYPE again returns it to case 1. Both directions keep his words.

**Case 2 · the catalogue does not have it**

1. Mansour returns no ids.
2. The card: NAME is the required answer, starred. TYPE and SIZE are empty and pickable. The orange
   note says no supplier is notified and the link is the route.
3. Sent: **the name, no ids**.
4. Backend: `isUndefined` true ⇒ created, never dispatched, by broadcast or direct.
5. Read back: his words, everywhere, in both locales.
6. The OS bid link shows no QR. Already true today.

**Case 3 · the catalogue has it, HIDDEN** *(after the agent + backend tickets)*

1. Mansour matches the hidden node and says it is hidden.
2. The card: NAME holds his words. TYPE and SIZE show the hidden node's names, not pickable from the
   list. The orange note, because nobody is notified.
3. Sent: **the hidden triple + the name**.
4. Backend: **`isUndefined` TRUE** ⇒ created, never dispatched. Same state as a free-text line, for
   every purpose except the renter's eyes.
5. Read back, renter side: the hidden node's NAME and its PHOTOGRAPH, because the line carries a
   taxonomy even though it is undefined.
6. The OS bid link shows no QR, and c-hub reads it as an undefined request like any other.

### Flow B — he added the line by hand

1. The card opens empty: no name, no type, no size.
2. He picks a TYPE: the NAME fills with «Crawler excavator», marked as ours. He picks a SIZE: it
   becomes «Crawler excavator 20 ton». Editing it makes it his and stops it following.
3. He cannot find it: he writes the machine in the NAME box, which is already on the card, and leaves
   TYPE and SIZE empty. That IS case 2.
   🔴 **The «Add a custom equipment type» row inside the TYPE search is REMOVED, in every case**
   (owner, 2026-09-12). It was added on 2026-09-09 to open a box that did not exist yet; the box is
   now always on the card, so the row offered a second door to a room the renter is already standing
   in.
4. From there, sending, reading and dispatch are decided by the two questions above. **The flow
   changes nothing about the rules; it only changes what seeds the box.**

### When is a line UNDEFINED? One condition

**A line is undefined when it has no subtype id, OR when its subtype is HIDDEN.** Nothing else
decides it.

It gets there in exactly three ways:

1. the agent matched nothing and he never picked a TYPE (case 2), or
2. he pressed «Doesn't match what I want?», which clears the ids, or
3. the agent matched a HIDDEN node (case 3) — the ids are real, and the line is still undefined.

And it leaves that state one way: he picks a TYPE. His words stay in the box through all of it.

⚠️ **A filled name box does not make a line undefined**, and neither does editing it. Under the new
meaning almost every line carries a name; the name is a note, the subtype is the state.

⚠️ **It is per LINE, not per request** — and since a multi-item submission fans out into one request
per item, «this request is undefined» is exact: each line becomes its own request row, dispatched or
not on its own.

### The four logic changes these cases require

**1 · The payload stops choosing.** Today `app-adapters` sends the three ids **or** the name, never
both, because the name only ever existed on a line that had no ids. After: send whatever the line has.
A matched line goes out with its ids AND his words; the backend has a column for each.

**2 · Picking a type stops erasing his words.** Today `SET_ITEM_SUBCATEGORY` sets `customEquipment`
to null: the name meant «off-catalogue», so a type made it false. After, the name means «his words»,
and a type does not make his words untrue. He types «water tanker», the agent misses, he picks «Water
truck» himself — today the box empties, after it still says «water tanker» and both are sent.

**3 · The gate stays where it is.** Today a line with no taxonomy must be named. That does not change.
What must NOT happen is extending it: a line that has a type is never asked for a name, however empty
the box is.

**4 · The deal room reads the wrong one first.** `deal-room.ts:549` asks for
`customEquipmentName` before `subtypeName`. Today the two never appear together, so nothing shows. The
moment a matched line carries a name, every deal room prints «water tanker» where it should print
«Water truck · 20,000 L». The order reverses.

**5 · The «Add a custom equipment type» row goes** (see Flow B above).

### Worked example — one request, three lines

He types: *«2 water tankers 20,000 L, one light tower, one floating crane barge, Jubail, 3 months»*.

| Line | Case | NAME box | TYPE · SIZE | Sent | Dispatched | Every screen reads, renter AND supplier |
| --- | --- | --- | --- | --- | --- | --- |
| water tankers | 1 | `water tankers` | Water truck · 20,000 L | 3 ids + name | yes | **Water truck · 20,000 L** |
| light tower | 3 | `light tower` | Light tower · 9 m *(hidden)* | 3 hidden ids + name | **no** | **Light tower · 9 m** |
| floating crane barge | 2 | `floating crane barge` ★ | empty | name only | **no** | **floating crane barge** |

One link is minted for the request. The QR is offered only if **every** line is reachable — here it is
not, so the supplier is sent to the web form, which is the surface that can show all three.

---

## What «hidden is undefined» costs the backend

`isUndefinedEquipment(item)` is `!item.subtypeId` today, and it is the single helper everything reads
(dispatch, the bid form, c-hub). Making hidden mean undefined is a change to **that one function**,
plus the data it needs:

1. **`isUndefinedEquipment` gains the visibility test.** It takes only `{ subtypeId }` now, so it
   needs the node's visibility — either joined where it is called, or denormalised onto the item at
   create time. The second is cheaper to read and cannot drift if a node is hidden later; the first is
   honest about the present. **Their call**, but it decides every other line below.
2. **Dispatch** needs nothing new once the helper is right: `createRequest` already skips a dispatch
   for an undefined item, broadcast and direct alike.
3. **The OS QR** needs nothing new either, once `hasCustomEquipment` is re-derived from the same
   helper (see the section above). One predicate, three consumers.
4. **The renter-facing projections must keep carrying the hidden node's names and image key.** Today a
   line with taxonomy ids gets `subtypeName` / `capacityName` / the image resolved from the catalogue;
   nothing must start blanking them because the line is undefined, or the renter loses exactly the
   thing this whole case exists to give him.
5. 🔴 **The bid form's label must stop branching on `isUndefined`.** It reads
   `isUndefined ? customEquipmentName : taxonomy` today. Once hidden counts as undefined that prints
   the renter's words for a hidden line, which is the opposite of the ruling. It becomes
   `taxonomyName ?? customEquipmentName` — the same order every other surface uses, supplier-facing
   included.

---

## Order of work (owner asked: web + agent first, backend after)

**Building them first: yes. Shipping two of the pieces first: no** — each breaks something the day it
deploys, and neither failure is visible from the repo that caused it.

### The two pieces that cannot go first

| Piece | If it ships before its backend half | Blast radius |
| --- | --- | --- |
| **WEB: send the name on every line** | `hasCustomEquipment` is «any line carries a name», so it becomes true for EVERY request and the OS hides the QR and «Go To App» on **every bid link in the product** | every renter, immediately, and the preview is cached 300s so it outlives the rollback |
| **AGENT: `includeHidden=true`** | a hidden match reaches a request with real ids, `isUndefinedEquipment` is still `!subtypeId`, so the request **dispatches to exactly the suppliers the hidden flag exists to protect** | the one outcome this whole feature is meant to prevent |

### The two backend tickets that unlock them — both small

- **B1** — re-derive `hasCustomEquipment` from the undefined predicate instead of the name test
  (one function, no new column, no OS deploy). Unlocks the web.
- **B2** — `isUndefinedEquipment` gains the HIDDEN test, so dispatch skips a hidden line the way it
  skips a nameless one. Unlocks the agent. **No migration**: the visibility is read from the catalogue
  at the moment it is asked, so hiding a node acts on requests that already exist (owner's call,
  2026-09-12 — see `app-backend-changes.md` B2).

Everything else backend (projections keeping the hidden node's names and image, the bid-form label
order) can follow at leisure — those make case 3 read correctly, they do not make it unsafe.

### So the order

1. **Now, web, ships on its own:** the card (name at top, CATEGORY out, «Doesn't match what I want?»,
   the «Add a custom equipment type» row removed), the reducer keeping his words through a type pick,
   the read rule (taxonomy ?? his words) with the deal-room order fixed, the gate not asking for a
   name on a line that has a type, and direct staying taxonomy-only. **None of this touches the
   wire**, so it is safe the day it lands and it is most of the work.
2. **Now, web, built but held:** sending the name on every line. One line in `app-adapters`, behind
   the switch, waiting on **B1**.
3. **Now, agent, built but held:** hidden matching, waiting on **B2**.
4. **Then backend:** B1 and B2 — flip the switch on (2), deploy (3).
5. **Then the rest of the backend**, and case 3 reads properly end to end.
