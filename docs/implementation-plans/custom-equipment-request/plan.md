# Implementation Plan — Custom (off-catalogue) equipment on a request

**Source:** free-form (owner, 2026-09-05)
**Card id:** custom-equipment-request
**Generated:** 2026-09-05

## Summary

Today, when the agent cannot place an item in the taxonomy it returns `verdict: "no-match"`, the
canvas replaces the taxonomy trio with a red "we couldn't find this in our catalogue" card, and the
item is dropped from the post (`postableItems`). The renter's only route is a prefilled WhatsApp
message to support.

The change: keep the detection exactly as it is, but let the renter **name the machine himself** in a
free-text box under the taxonomy trio, and let the request post with that text. The three taxonomy
ids are omitted from that line's payload, the free text is stored beside them, and every surface
that would have shown the taxonomy name (the request details, the bid form the supplier fills, the
bid cards, the quotation) reads the free text instead when the projection has no subtype.

## Locked decisions

- **Detection is untouched.** `deriveVerdict` still returns `no-match`; no new verdict value. The
  item's new state is "no-match **with** a renter-supplied name", carried by one new field.
- **One new item field:** `customEquipment: string | null` on `EquipmentItem` (trimmed, ≤120 chars,
  required to post such a line). Distinct from `rawLabel` (what the RFQ text said, agent-supplied,
  display aid) — the renter's typed name is his own answer and must not be confused with the agent's
  echo. `rawLabel` prefills the box on first render so the common case is one glance, not typing.
- **The trio stays on screen for a no-match item.** Today it is replaced by `UnavailableCard`. It is
  now rendered (empty, and not marked required) with the free-text box under it and a softened notice
  above, so a renter who *can* find his machine in the list still can. Picking a subtype makes the
  line ordinary again.
- **Ids win over text.** `customEquipment` is only *read* where the ids are null. A line with a
  complete `ref` posts exactly as it does today (its text rides along for the record, unread).
- **A custom line posts, and it still cannot be matched.** The backend matcher keys on `subtype_id`;
  a line without one reaches no supplier through the broadcast. So a request that contains one is
  useful through the **shared link** (and DIRECT), which is precisely the flow the owner named. The
  WhatsApp sourcing hand-off is kept, not replaced.
- **No "Other" node in the taxonomy** (owner, 2026-09-05). The cheaper backend route was a seeded
  sentinel path (`Other / Not in catalogue / Unspecified`) so the three ids stay non-null and no
  backend reader changes. Rejected: the taxonomy contract carries no hidden/inactive flag
  (`src/lib/contract/taxonomy.ts`), so that row would appear in the subtype list on this canvas, in
  the mobile app's picker, and in c-hub, and a renter could pick "Not in catalogue" for a machine the
  catalogue has. The line carries **no ids at all** instead (omitted on the wire, unset in the row),
  and the taxonomy stays a list of real equipment.
- **The three ids are OMITTED from the body, never sent as `null`** (owner, 2026-09-05). The web
  keys are optional (`categoryId?: string`), and `JSON.stringify` drops an undefined key, so a custom
  line's payload simply has no `categoryId` / `subtypeId` / `capacityId` in it. This is the house
  idiom already (`projectId: draft.projectId ?? undefined`, `overtimeRate: undefined`).
  ⚠️ Absent and null are different failures against a Zod schema — absent needs `.optional()`, null
  needs `.nullable()` — so the backend ticket must ask for `.optional()`, not "accept null".
  ⚠️ And it changes the wire only: the request-item **column still holds NULL**, because nothing was
  written to it. Omitting the key means "we are not telling you a subtype", which is exactly the
  fact; it does not avoid a nullable column, and no shape of body can.
- **Web ships inert until the backend accepts the omission.** `CreateRequestItem` is documented "All 3
  ids required (422 if null)" (`src/lib/contract/app.ts:43`). Until the backend lands, the free-text
  box is behind one switch (`NEXT_PUBLIC_CUSTOM_EQUIPMENT`, default off), so the create flow's
  current behaviour is byte-identical while the backend work is in flight.

## Backend work (blocking — different agent writes these tickets)

1. **`POST /agents/requests`** must accept an equipment item whose `categoryId` / `subtypeId` /
   `capacityId` keys are **absent from the body** when `customEquipmentName` (string, 1–120) is
   present, and reject a line that carries neither. In Zod terms the three become `.optional()`
   (NOT `.nullable()` — the web sends no key at all, and a `.nullable()`-only field still 422s
   "Required" on an absent one). The columns are nullable in the database because nothing is written
   to them. New column on the request-item table, e.g. `custom_equipment_name VARCHAR(120)`.
   Migration ships **before** the web switch is turned on.
1b. **The columns themselves.** `category_id` / `subtype_id` / `capacity_id` on the request-item
   table are FKs and are believed to be `NOT NULL` (inferred from `src/lib/contract/app.ts:43`, not
   read from the schema — the backend repo is not checked out here). If they are, the migration must
   `DROP NOT NULL` on the three. A nullable FK is legal: null means "references nothing", the
   constraint only fires on a value that is present. There is no other way to store a line with no
   subtype, which is why the sentinel row was the alternative and why rejecting it forces this.
2. **Request projections** (`GET /agents/requests`, `/requests/{id}`, the inbox/bid projections)
   must return `customEquipmentName` on the item, alongside the existing `subtypeName` /
   `capacityName` nulls. Without it every renter-facing surface says "—".
   ⚠️ **Any INNER JOIN onto the taxonomy silently deletes the line.** Every projection that folds in
   `subtypeName` / `capacityName` must be a LEFT JOIN, or a request with one custom machine comes
   back with that machine missing entirely — the renter sees fewer items than he sent, with no error
   anywhere. Same trap in the bid-form query, the matcher, and any admin list.
3. **`GET /public/bid-form/{token}`** must set the item's `label` from `custom_equipment_name` when
   the taxonomy is null (and leave `size` null). This is the one the owner asked for by name: the
   bid form is created as usual and reads the renter's text as the equipment name. `labelAr` stays
   null — the renter typed one language, and inventing the other is worse than showing his words.
4. **Matching / broadcast:** decide what a `subtype_id`-less line does to supplier matching. Web's
   assumption is "no broadcast match, link + DIRECT only". If ops want a notification instead, that
   is a backend rule, not a web one.
5. **c-hub / admin:** the line must be visible and identifiable so ops can add the taxonomy row and
   later re-point the request. Out of scope for web.

## Web changes, file by file

### 1. The draft model

- `src/lib/contract/draft.ts` — add `customEquipment?: string | null` to `EquipmentItem`, documented
  as above (its relationship to `rawLabel`, and that it is read only when `ref` is incomplete).
- `src/lib/api/agent-adapters.ts` — seed `customEquipment: null` on every mapped line (the box
  prefills from `rawLabel` at render time, so the draft does not carry a value the renter never
  typed; a prefill written into state would post text he never looked at).
- `src/lib/store/rfq-store.tsx` — no new action: the box writes through `patchItem`. Two touch-ups:
  - `SET_ITEM_SUBCATEGORY` clears `customEquipment` (the line is no longer off-catalogue).
  - `newManualItem` keeps it null.

### 2. The gates (shared — read the blast radius below)

- `src/lib/contract/gates.ts`
  - `postableItems`: drop `removed`, and drop a `no-match` line **only when it has no
    `customEquipment`**. Everything else about it is unchanged.
  - `itemAppGaps`: for a no-match line with the switch on, stop returning `[]` early — require
    `customEquipment` (new gap field `custom_equipment`, reason `gate.customEquipmentMissing`) plus
    the existing quantity check, and skip the three taxonomy gaps. A no-match line with the switch
    off keeps returning `[]`.
  - `itemWebGaps` / `transportGaps`: a **postable** custom line is gated like any other (year,
    certificate, delivery, return) — those values are posted for it and shown to the supplier. A
    no-match line with no text keeps its early return.
- **Blast radius of `postableItems`** (8 call sites, all of which now include a named custom line —
  which is the intent): `ReadyToSend.tsx:69`, `Confirmation.tsx:48`, `spec-sheet.ts:40`,
  `draftBidForm.ts:93`, `app-adapters.ts:190`, `rfq-store.tsx:1062` (submit + the
  edited-from-draft diff). Nothing else changes shape.

### 3. The canvas

- `src/components/create/MachineCard.tsx`
  - Render the taxonomy trio for a no-match line as well; keep its `star`/`required` marks OFF while
    the line is custom (nothing in the catalogue can satisfy them).
  - `UnavailableCard` becomes the notice + the free-text field: title unchanged in substance, body
    reworded from "It won't be included in this request" to "Name it and we'll send it with your
    request", the WhatsApp button kept underneath as the sourcing route.
  - New `CanvasField` under the trio: `TextInput`, `maxLength={120}`, value
    `item.customEquipment ?? item.rawLabel ?? ""`, `missing`/`shake`/`required` driven by the new
    `custom_equipment` gap so it behaves like every other required control.
  - The header `PanelDot` already reads `gaps`; drop the `&& !notAvailable` term, because a named
    custom line is now genuinely complete and `gaps` tells the truth for it.
- `src/components/create/Canvas.tsx` — `equipmentDone` (line 201) drops `&& !itemUnavailable` for the
  same reason; the comment above it is rewritten (it currently states that no gate can fire on a
  no-match row, which stops being true).
- `src/components/create/hooks.ts:173-177` — `useItemVerdict`'s "never blocks and never posts"
  comment and any derived flag updated; a named custom line blocks and posts.
- `src/lib/contract/draft.ts:442` — the `notAvailable` counter now means "off-catalogue", named or
  not; check its readers before renaming.

### 4. The submit payload

- `src/lib/contract/app.ts` — `CreateRequestItem`: `categoryId` / `subtypeId` / `capacityId` become
  OPTIONAL (`categoryId?: string`), never `| null`, plus `customEquipmentName?: string`. The doc
  comment on line 43 is rewritten to state the new rule (ids **or** a custom name, never neither) and
  that the ids are omitted rather than nulled.
- `src/lib/api/app-adapters.ts:258-262` — spread the ids in only when the ref has them:
  `...(i.ref.categoryId ? { categoryId: i.ref.categoryId } : {})` and the same for the other two,
  plus `customEquipmentName: i.customEquipment?.trim() || undefined`. An ordinary line's payload is
  byte-identical to today's. Nothing else in the mapping moves.
  ⚠️ `?? undefined` would also work — `JSON.stringify` drops it — but the conditional spread is the
  idiom this function already uses and it survives a caller that stringifies with a replacer.
- `src/lib/api/agent-adapters.ts:606` — `draftToRfqCorrection`'s `input_equipment` falls back to
  `customEquipment` before `rawLabel`, so the correction teaches the agent the renter's own words for
  a machine it could not place. `category_id`/`subtype_id`/`capacity_id` are already nullable there.

### 5. Reading it back (the renter's surfaces)

- `src/lib/contract/requests.ts` — `RequestItem` gains `customEquipmentName: string | null`;
  `itemName()` (line 384) falls back to it before "—", in both languages.
- `src/lib/contract/request-fields.ts:174`, `src/lib/contract/sibling-tabs.ts:86` — same fallback.
  Prefer exporting one helper from `requests.ts` and calling it in all three rather than three copies
  of the same `??` chain.
- `src/lib/contract/inbox.ts:65,96,101` — `equipmentName` / `equipmentSummary` /
  `equipmentType.name` fall back to the custom name (this is the rail the 2026-09-05 entry fixed;
  keep its "the REQUEST's machine, not the supplier's listing" rule intact).
- `src/lib/contract/deal-room.ts:547` — add `customEquipmentName` to the `pick(...)` chain.
- `src/lib/contract/chat-dock.ts:60`, `src/lib/contract/bid-map.ts`,
  `src/components/requests/RequestDetail.tsx`, `RequestGroupDetail.tsx`, `RequestBids.tsx`,
  `src/components/map/BidMapWorkspace.tsx` — same fallback wherever `subtypeName` is read for
  display. (13 files reference `subtypeName`, 32 occurrences; the sweep is mechanical but must be
  complete, or one screen says "—" while the rest name the machine.)
- `src/components/requests/RequestEditModals.tsx` — the item edit modal offers the free-text name for
  a line whose ids are null, and clears it if the renter picks a real subtype (mirroring the
  reducer's rule).

### 6. The bid form and the preview

- `src/lib/contract/link-bids.ts:360-363` — `BidFormItem.label` already maps from the backend's
  `label`; add `customEquipmentName` to the mapping as a fallback in case the backend sends the field
  rather than folding it into `label` (harmless if it never arrives, and it removes a round trip of
  contract argument).
- `src/lib/draftBidForm.ts:47-50` — `label` falls back to `customEquipment` before `agentNames` and
  `rawLabel`; `size` stays `rawSize` (null for most custom lines). This is what *Ready to send*
  previews, so it must read the same as the posted form.
- `src/app/bid/[token]/BidFormClient.tsx` — verify only: it renders `it.label` / `it.size` and
  tolerates a null size. No change expected; a size-less row must not print an empty separator.
- `src/components/requests/SharedBidSubmissionModal.tsx` — same, through `bidCardModel`.

### 7. Copy (both languages, no trailing periods, no em dashes)

- `src/lib/i18n/en.ts` / `ar.ts`
  - `step2.noMatch.explainer` reworded (it currently promises the item is excluded).
  - new: `create.machineCard.customEquipment` (label), `customEquipmentPlaceholder`,
    `gate.customEquipmentMissing`.
  - `step2.noMatch.whatsappMessage` keeps its wording; the button is now the secondary route.

## Tests

- `tests/unit/canvas-no-match.test.tsx` (4 existing cases) — **will fail** by design; rewrite for the
  new state machine: unnamed custom line still blocks and still does not post; named line completes,
  posts, and paints its dot green.
- New `tests/unit/custom-equipment.test.ts`: `postableItems` includes a named custom line and excludes
  an unnamed one; `itemAppGaps` asks for the text and not for a category; picking a subtype clears the
  text; `draftToCreateRequest` OMITS the three id keys (assert on `JSON.stringify` / `"categoryId" in
  item`, not on the value — a test that reads `undefined` passes for a key that is present and null)
  and sends `customEquipmentName`; `itemName` falls back.
- `tests/unit/bid-card-text.test.ts` / `submission-viewer.test.tsx` — a bid-form item with a custom
  label and no size renders the name alone, with no dangling separator.
- Gate: typecheck (making the three ids optional surfaces every reader), lint, unit.

## Edge cases to settle while building

- **Empty vs whitespace vs absent:** the gate trims; `"   "` is not a name.
- **Every line is no-match:** the 2026-09-04 entry records that this is a dead end today
  (`gate.noItems` blocks and there is no "add a machine" control). With the free-text box that state
  becomes *completable*, which is a real improvement — verify it end to end, because it is the case
  the owner is most likely to try first.
- **A custom line plus ordinary lines** in one request: the ordinary lines still broadcast; the custom
  one only reaches suppliers through the link. Say so on *Ready to send* rather than letting the
  renter discover it in the bid count.
- **Arabic:** the renter's text is shown verbatim in both languages, and Latin digits inside it are
  left alone (the 2026-09-04 digits rule sweeps our strings, not his).
- **Trial mode / spec-sheet export** carry the custom name like any other item name.

## Order of work

1. Backend ticket 1 + 2 (schema, create endpoint, projections) — ships first.
2. Web: model, gates, payload, read-back sweep, copy, tests — behind `NEXT_PUBLIC_CUSTOM_EQUIPMENT`.
3. Backend ticket 3 (bid-form label) — before the switch, or the supplier reads "Equipment".
4. Turn the switch on. Rollback is the switch, not a redeploy.
