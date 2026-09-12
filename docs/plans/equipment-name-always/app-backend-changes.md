# Backend changes — the renter's own equipment name, and «hidden is undefined»

**For:** whoever writes the tickets in `Moedatech-App`.
**Web status:** done and green on `staging` (uncommitted at the time of writing). The card, the read
rule, the gate and the reducer are live-safe; the one piece that touches the wire is held behind
`NEXT_PUBLIC_EQUIPMENT_NAME_EVERY_LINE`, default off, waiting on **B1** below.
**Source of the rules:** owner, 2026-09-12. Quoted where they decide something.

---

## Backend status — each claim below checked against `Moedatech-App`, 2026-09-12

| | | |
| --- | --- | --- |
| **B1** QR flag | **BUILT on `main`, not committed, not deployed** | one open question, at the end of B1 |
| **B2** hidden is undefined | **not started** — the spec below is the whole of it | no migration; code only |
| **B3** bid-form label | 🔴 **ALREADY CORRECT — no change needed** | the section below is stale |
| **B4** hidden line keeps its name | **CONFIRMED by reading** | both resolvers look up by id, unfiltered |
| **B5a** chart selects the name | 🔴 **ALREADY DONE**, and wider than asked | the section below is stale |
| **B5b** PATCH with ids + name | **accepted** — verified by direct invocation, 2026-09-06 | never run against a deployed stage |

So what is actually left is **B2**, plus deploying B1.

---

## The two rules, in one place

```
undefined(line) = subtypeId == null || subtype is HIDDEN
    → no dispatch, no in-app bid, no deal room, no award, no QR. What the line IS, for us.

name shown     = the taxonomy's name whenever the line has one, HIDDEN included;
                 the renter's own words only when it has none.
    → for EVERYBODY. Renter screens, the supplier's bid form, the quotation, c-hub.
```

> *"If taxonomy is sent then always read the taxonomy, if null then the custom."*
> *"Hidden or free text, both are undefined."*

⚠️ **They are different questions.** A hidden line is undefined **and** has a catalogue name. Any
reader that picks its label by `isUndefined` will print the renter's words over a perfectly good
catalogue name. Ask *«is there a taxonomy name»*, never *«is this undefined»*.

⚠️ **`customEquipmentName` decides nothing.** From the web's side it now rides on ordinary lines too —
it is «what the renter calls this machine», our reference, not a state.

---

## B1 · The OS bid link loses its QR the day the web starts sending names

**Ticket, and it is the one that blocks the web.**

`getBidFormPreview.ts:435` computes `hasCustomEquipment` as *does ANY line carry a renter-typed name*,
and the Supplier OS suppresses its entire app handoff on it — the QR dialog and «Go To App»
(`Monorepo-SupplierOS/apps/web/src/app/[locale]/(public)/bid/[token]/bid-handoff.tsx:104`).

The field's own comment explains the choice, and the reasoning is sound *today*: every off-catalogue
line necessarily carries a name, so the name-present set strictly contains the off-catalogue set.
**The web change inverts that premise** — once every line carries a name, the flag is true for every
request in the product.

**Change:** derive it from the undefined predicate instead:

```ts
const hasCustomEquipment = reqs.some((r) =>
  (r.equipmentItems ?? []).some((i) => isUndefinedEquipment(i))
);
```

- **Keep the field NAME.** The OS needs no change and no deploy, and its test pins the exact
  expression (`app-handoff.test.ts:96`). A rename couples two deploys for no gain; do it later, in
  both repos, if the name bothers us.
- `PREVIEW_SELECT` (`:333`) must then select what the predicate reads — `subtypeId`, plus whatever
  B2's helper needs to judge it (see B2: the visibility is read from the catalogue, not from the row,
  so this query also has to have the hidden set in hand).
- ⚠️ The response is `Cache-Control: public, max-age=300` and the OS revalidates at 300s, so whichever
  answer is wrong outlives its deploy by five minutes. Not a bug to chase.

### Built 2026-09-12 — `agents-equipment`, uncommitted, not deployed

`apps/backend-agents/src/handlers/agents/bid-form/getBidFormPreview.ts`, three parts that ship
together:

1. the predicate above, replacing `!!i.customEquipmentName?.trim()`;
2. **`subtypeId: true` in `PREVIEW_SELECT`** — it was NOT selected (only `categoryId`,
   `customEquipmentName`, `numberOfUnits`). Without it the predicate reads `undefined` on every line
   and suppresses the handoff on **every** request: the same outage, inverted;
3. the field's comment, which documented the dead premise — *"every off-catalogue line necessarily
   carries a name, so this set strictly CONTAINS the off-catalogue set"* — and would otherwise argue
   the next reader straight back into the bug.

Verified: `typecheck:ratchet` on `backend-agents`, 0 pre-existing errors, no file got worse. Not run
against a stage.

⚠️ **This call site will stop compiling when B2 lands, on purpose.** B2 changes the predicate's
signature to take the hidden set, and this is one of the call sites that must then load it — which is
precisely the mechanism B2 chose over a sibling helper.

### ⚠️ Open, parked by the owner: `some` or `every`, for a multi-item link

The predicate is `some` — one undefined line hides the handoff for the whole link. That is inherited
from the old test, not a decision.

The fan-out makes the other reading defensible: a multi-item submission becomes **one single-item
request per line** sharing a group id, so an undefined line is its own request — undispatched,
invisible on every supplier surface — while the ordinary ones are perfectly biddable in the app. On
that reading only `every` (nothing in the link is biddable) should hide the QR.

**What settles it is what the QR opens** — the group token, or one request id. If the app resolves
the group and renders only the biddable requests, `every` is right; if it can land on the undefined
request, `some` is protecting a dead end. That is in the OS repo, which was not read.

⚠️ Either way the FORM is unaffected: `getBidForm` flattens every item across the group, so the
supplier always sees all of them, each labelled. This flag controls the app handoff only.

---

## B2 · Hidden is undefined

Today a hidden node **cannot reach a request at all**: `assertRequestable`
(`taxonomy-normalization.service.ts:176`) throws `not-requestable`, and `createRequest` answers
*"the selected subtype is hidden or inactive and cannot be requested"*. So case 3 does not exist yet,
and the store-press path cannot leak a hidden id either — the create refuses first.

For the owner's case 3 the create must **accept and record** it instead:

1. `assertRequestable` keeps refusing `isActive === false` and stops refusing `visibility === 'HIDDEN'`.
   (Inactive is a hard off switch for everybody; hidden is a renter-visibility rule.)
2. The line is stored with its **real ids** — that is what lets the renter read it by the catalogue's
   name and see its picture.
3. Everything that asks *«can this reach a supplier»* must now answer no for it.

### The route — DECIDED: resolve at read. No migration.

`request_equipment_items` has **no Prisma relation** to `equipment_taxonomy` (plain string ids), so
the predicate cannot see `visibility` by itself. Two ways to give it that fact, and the owner chose
the first (2026-09-12, answering *«why migration?»*):

| | **RESOLVE AT READ — chosen** | **STAMPED COLUMN — rejected** |
| --- | --- | --- |
| Schema | nothing | `subtype_hidden` on `request_equipment_items` |
| Migration | **none** | additive column + backfill, migration before code |
| Feed SQL | fetch the hidden ids first, then `subtypeId: { notIn: hidden }` | `subtypeHidden: false` |
| JS call sites | ~8 across three packages must be handed the hidden set | unchanged, the flag is on the row |
| Meaning | «this line's node is hidden **right now**» — a fact about the catalogue | «this request was made under a hidden node» — a fact about the request, permanent |
| Hiding a node later | old requests leave the feeds and stop accepting bids **at once** | old requests keep behaving as they did |
| Rollback | revert the code; there is no data to unwind | revert the code, then decide what to do with a column full of answers |

**What the choice accepts, said plainly:** hiding a node is **retroactive**. Hide *Light tower 9 m* on
Friday and every request already made on it — including one with an open deal room and a supplier
waiting — leaves the feeds and stops accepting bids on Friday. That is the behaviour, not a bug to be
reported later. If ops need a node hidden *for new requests only*, this route cannot give them that,
and the answer then is the column.

**Rejected third option:** store a hidden line as off-catalogue outright (empty ids + his words). No
migration and no new concept, but the renter then loses the catalogue's name and picture, which is the
one thing hidden lines are meant to keep.

### How to build it so a missed call site cannot ship

🔴 **The hazard of this route is a call site nobody changed, and it is silent**: the feed hides the
line while the bid gate goes on accepting bids for it. Two rules make that impossible rather than
unlikely.

1. **ONE loader, one set.** A single `hiddenSubtypeIds(): Promise<Set<string>>` over
   `equipment_taxonomy WHERE visibility = 'HIDDEN'`. Small, and the only definition of the fact.
   Never a second query that filters on `visibility` by hand.
2. **Change the predicate's SIGNATURE, do not add a sibling.**

   ```ts
   // three copies of undefined-equipment.ts
   isUndefinedEquipment(item, hidden: ReadonlySet<string>): boolean
       => !item.subtypeId || hidden.has(item.subtypeId)
   ```

   The second parameter is what makes the compiler name every call site the day this lands. A new
   `isUndefinedOrHidden()` beside the old one compiles everywhere and leaves the misses to a reader —
   which is exactly how the feed and the gate come to disagree.

**Caching:** the set is small and changes when ops hide a node, so a TTL is tempting. ⚠️ **Not on the
CREATE path.** Dispatch happens once, at create, and a stale set there notifies precisely the
suppliers the hiding was meant to protect — for the length of the TTL, with no second chance. Read it
fresh in `createRequest`; cache it for the feeds if they need it.

**Empty set:** guard it explicitly (`hidden.size ? { notIn: [...hidden] } : {}`) rather than relying on
what Prisma does with `notIn: []`. One query shape that behaves differently when nothing is hidden is
not worth the line it saves.

### The sites

**SQL — the four feed filters** (`«this line has a usable taxonomy»`):

```
request.repository.ts:537, 709, 753 · partner/openRequests.ts:130
    equipmentItems: { some: { subtypeId: { not: UNDEFINED_TAXONOMY_ID } } }
                                      → plus notIn the hidden set
```

**JS — everything that reads the predicate**, each of which must now load the set first:

- **Dispatch**: `createRequest.ts:788` already skips an undefined item, broadcast and DIRECT alike.
  Nothing new once the predicate is right — but this is the one that must not read a cache.
- **Bid gate**: `bid-eligibility.service.ts:349`, `bid.service.ts:485`, `partner/market.ts:164`.
- **B1's preview**: `getBidFormPreview.ts:435`.
- **`matchedSupplierCount` stays 0**, meaning «never dispatched», as for any undefined line.

**Nothing is written in `Moedatech-App`.** A column-route draft existed in that working tree while the
decision was open and was reverted when it closed; the tree is clean on `main`. This section is the
whole of the specification.

---

## B3 · The bid form's label — 🔴 ALREADY CORRECT, nothing to change

**This section was written against an assumption and the assumption was wrong.** It said
`getBidForm.ts:145` builds the label as `isUndefined ? customEquipmentName : taxonomy`. It does not,
and never has since the field was introduced. `getBidForm.ts:148` reads:

```ts
label:   tax?.name   ?? i.customEquipmentName ?? null,
labelAr: tax?.nameAr ?? i.customEquipmentName ?? null,
```

— the exact order the ruling asks for. `isUndefined` is computed one line above and used only as the
payload's behaviour flag, never for the label.

So a hidden line will label itself from the catalogue the day B2 lands, with no change here. What is
owed is the **test**, not the code: *the bid form labels a hidden line with the catalogue's name, and
an off-catalogue line with the renter's words.*

---

## B4 · The projections must keep naming a hidden line

A hidden line has ids, so `subtypeName` / `capacityName` / the image resolve from the catalogue as
they do for any other line — **provided nothing starts blanking them because the line is undefined**.
Worth an explicit test: the renter's whole reason for case 3 is that the machine still looks like part
of the system.

**Confirmed 2026-09-12 by reading, as asked.** Both name resolvers look a node up by id with **no
`visibility` and no `isActive` filter**:

- `request.repository.ts:1161` — `enrichEquipmentItemsWithTaxonomy`, which every renter-facing read
  goes through (list, detail, deal room, bids, outcome survey);
- `taxonomy.service.ts:315` — `resolveTaxonomyMap`.

So a hidden line keeps its `subtypeName`, `capacityName` and image key for free. Nothing in the
projections branches on `isUndefined`, so there is nothing to stop blanking them. Still worth the
explicit test — this is the renter's whole reason for case 3, and it would break silently.

---

## B5 · Two older items — 🔴 BOTH ALREADY CLOSED

- **The chart projection.** Said not to select `customEquipmentName` (raised 2026-09-08). **It does**,
  and it does more than was asked: `getChart.ts` selects the field and labels each item through a
  three-step chain — `subtype (+ size) → category → the renter's typed name` — so it also covers the
  HALF-PLACED line (a category with no subtype), which the ticket did not mention. The web's
  client-side fallback and its placeholder are now belt-and-braces rather than the only cover.
- **`PATCH /rentees/me/requests/{id}` with ids AND `customEquipmentName`.** **Accepted.**
  `hasValidEquipmentIdentity` returns true on three ids regardless of the name, and
  `buildItemCreateData` stores the name alongside them, so the line round-trips and behaves as
  ordinary. ⚠️ Verified by **direct invocation of the validator and `editRequest` with prisma
  stubbed** on 2026-09-06 — **never against a deployed stage**, so the contract is proven in code and
  unproven over the wire.

---

## Deploy order, and what breaks if it is wrong

1. **B1 first.** Until it ships, the web's switch must stay off — with it on, every bid link in the
   product loses its QR and «Go To App».
2. **B2 before the AGENT's `includeHidden`.** Until the predicate knows about hidden, a hidden id on a
   request reads as an ordinary line and **dispatches to exactly the suppliers the flag exists to
   protect**. See `agent-changes.md`.
3. **No migration anywhere in this feature.** B2 resolves at read, so B2 is a code deploy and a
   revert is a code revert.
4. ~~B3, B4, B5 can follow.~~ **All three are already true in the code** — B3 and B5 were written
   against assumptions that turned out to be wrong, B4 was confirmed by reading. What they leave
   behind is tests, not deploys. See the status table at the top.

---

## Tests worth asking for

- `hasCustomEquipment` is **false** for a request whose every line has a live taxonomy and a name, and
  **true** for one with a hidden line. (The first is the regression B1 exists to prevent.)
- A create with a hidden subtype **succeeds**, stores the real ids, and dispatches to **nobody** —
  `matchedSupplierCount` 0, no `MatchEvent`, no notification, DIRECT included.
- A bid on that request is refused by the gate, as for an off-catalogue one.
- The bid form labels a hidden line with the **catalogue's** name, and an off-catalogue line with the
  renter's words.
- A renter projection of a hidden line still carries `subtypeName`, `capacityName` and the image key.
- A create with three ids **and** `customEquipmentName` stores both, and the line behaves as ordinary
  (this is what the web will start sending once B1 lands).
- **Hiding a node acts on a request that already exists**: create on a public node, confirm it is in
  the feed and bid-able, hide the node, and confirm the same request is out of the feed and refused by
  the gate with no write to it. That is the chosen route's defining behaviour, so it is the case that
  proves the route landed rather than half-landed.
- The hidden set being **empty** leaves every feed query answering exactly what it answers today.
