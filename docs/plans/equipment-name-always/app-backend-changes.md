# Backend changes — the renter's own equipment name, and «hidden is undefined»

**For:** whoever writes the tickets in `Moedatech-App`.
**Web status:** done and green on `staging` (uncommitted at the time of writing). The card, the read
rule, the gate and the reducer are live-safe; the one piece that touches the wire is held behind
`NEXT_PUBLIC_EQUIPMENT_NAME_EVERY_LINE`, default off, waiting on **B1** below.
**Source of the rules:** owner, 2026-09-12. Quoted where they decide something.

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
- `PREVIEW_SELECT` (`:333`) must then select what the predicate reads — `subtypeId`, and
  `subtypeHidden` if B2 takes the column route.
- ⚠️ The response is `Cache-Control: public, max-age=300` and the OS revalidates at 300s, so whichever
  answer is wrong outlives its deploy by five minutes. Not a bug to chase.

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

### The decision this needs first — a column, or a read?

`request_equipment_items` has **no Prisma relation** to `equipment_taxonomy` (plain string ids), and
four feed queries filter in SQL on *«this line has a usable taxonomy»*:

```
request.repository.ts:537, 709, 753 · partner/openRequests.ts:130
    equipmentItems: { some: { subtypeId: { not: UNDEFINED_TAXONOMY_ID } } }
```

| | **A · denormalised column** `subtype_hidden` | **B · resolve at read** |
| --- | --- | --- |
| Feed SQL | `{ subtypeId: { not: '' }, subtypeHidden: false }` | fetch the hidden subtype ids first (small, cacheable), then `subtypeId: { notIn: hidden }` |
| JS call sites | unchanged — the flag is on the row | ~8 sites across three packages must load visibility, and **a miss is invisible**: the feed hides the line while the bid gate still accepts it |
| Meaning | «this request was made under a hidden node» — a fact about the REQUEST, permanent | «this request's node is hidden right now» — a fact about the CATALOGUE, retroactive |
| Hiding a node later | old requests keep behaving as they did | old requests silently leave the feeds and stop accepting bids, including ones mid-negotiation |
| Cost | one additive column + backfill + migration-before-code ordering | no migration |

**Rejected third option:** store a hidden line as off-catalogue outright (empty ids + his words). No
migration and no new concept, but the renter then loses the catalogue's name and picture, which is the
one thing hidden lines are meant to keep.

**Written, not committed, in the `Moedatech-App` working tree** (option A, so it can be read or
discarded): the migration `20260912100000_request_item_subtype_hidden`, the `subtypeHidden` field on
`RequestEquipmentItem`, the three copies of `isUndefinedEquipment`, `assertRequestable` no longer
refusing hidden, and `createRequest` marking the line. **Nothing is committed there and the feed
WHERE clauses were NOT touched** — that half waits on this decision.

### What must be true once it lands

- **Dispatch**: `createRequest.ts:788` already skips an undefined item, broadcast and DIRECT alike.
  Nothing new once the predicate is right.
- **Bid gate**: `bid-eligibility.service.ts:349`, `bid.service.ts:485`, `partner/market.ts:164` all
  read the same helper. Nothing new.
- **Feeds**: the four WHERE clauses above.
- **`matchedSupplierCount` stays 0**, meaning «never dispatched», as for any undefined line.

---

## B3 · The bid form's label must stop branching on `isUndefined`

`getBidForm.ts:145` builds the item label as `isUndefined ? customEquipmentName : taxonomy`. The
moment hidden counts as undefined, that prints the renter's words for a hidden line — the opposite of
the ruling. It becomes:

```
label = taxonomyName ?? customEquipmentName
```

Same order every other surface uses, supplier-facing included. `isUndefined` stays in the payload: it
is the behaviour flag, and the web reads it for what a line can DO, never for what it is called.

---

## B4 · The projections must keep naming a hidden line

A hidden line has ids, so `subtypeName` / `capacityName` / the image resolve from the catalogue as
they do for any other line — **provided nothing starts blanking them because the line is undefined**.
Worth an explicit test: the renter's whole reason for case 3 is that the machine still looks like part
of the system.

`resolveTaxonomyMap` looks nodes up by id with no visibility filter, so this should already hold.
Confirm rather than assume.

---

## B5 · Two older items, still open, now more visible

- **The chart projection does not select `customEquipmentName`** (raised 2026-09-08). `getChart.ts:156`
  labels a request's item from its taxonomy pair alone, so an off-catalogue line draws a blank name;
  the work-order branch beside it already falls back to `rawLabel`. The web fills the gap client-side
  and prints a placeholder when it cannot.
- **`PATCH /rentees/me/requests/{id}` accepting an item with ids AND `customEquipmentName`** has never
  been verified (raised 2026-09-06). The web's edit modal now offers the name on any line.

---

## Deploy order, and what breaks if it is wrong

1. **B1 first.** Until it ships, the web's switch must stay off — with it on, every bid link in the
   product loses its QR and «Go To App».
2. **B2 before the AGENT's `includeHidden`.** Until the predicate knows about hidden, a hidden id on a
   request reads as an ordinary line and **dispatches to exactly the suppliers the flag exists to
   protect**. See `agent-changes.md`.
3. If B2 takes the column route: **migration before code**, as always here.
4. B3, B4, B5 can follow. They make case 3 read correctly; they do not make it unsafe.

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
