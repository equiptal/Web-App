# Web-App changes — off-catalogue equipment on a request

**For:** whoever implements this in `equiptal/Web-App` (the renter web app).
**Backend status (2026-09-05):** built in `Moedatech-App`, **not deployed, migration not applied.**
This document states exactly what the backend now accepts and returns, so the web half can be
written against a real contract rather than a guess.

The web-side plan already in that repo
(`docs/implementation-plans/custom-equipment-request/plan.md`) is still broadly right. **Where the
two disagree, this file wins** — that plan had to infer the backend, and three of its inferences
turned out to be wrong (noted at the end).

---

## 1. What the renter sees, in words

Detection is unchanged: the agent still returns `verdict: "no-match"` for a machine our catalogue
cannot place. What changes is what happens next.

Today the row says the item **will not be included**, and it is dropped from the post. Now the
renter can name the machine himself and post the request with it.

### The message the renter must be given (owner, 2026-09-05)

Three facts, all of them, on the no-match row. He must not discover any of them afterwards:

1. **This equipment is not in our list.**
2. **We have no Moedatech supplier for it**, so it will not be sent to anyone.
3. **He can still post the request, and share its link with his own supplier.**

Suggested copy, to be finalised by whoever owns the wording:

> **Not in our catalogue**
> We don't have this equipment listed, and no Moedatech supplier is matched to it, so we won't send
> it to anyone. You can still post this request and share its link with your own supplier

Arabic:

> **غير موجودة في قائمتنا**
> هذه المعدة غير مدرجة لدينا ولا يوجد مورّد في مويداتك مطابق لها، لذلك لن نرسلها إلى أحد. يمكنك مع
> ذلك نشر الطلب ومشاركة رابطه مع مورّدك الخاص

⚠️ **Say "we will not send it", never "no supplier was found".** The request is never dispatched at
all — the platform does not look and fail, it does not look. A renter told "none matched" waits for
bids that were never solicited.

⚠️ **The share link is the whole point of letting it post**, so the copy has to name it. A renter
who posts and then waits has been given a worse experience than the old "it won't be included".

⚠️ **Keep the WhatsApp "Provide it for me?" button.** It is the route to getting the machine into
the catalogue properly; the free-text box is not a replacement for it.

### Copy that must change

`src/lib/i18n/{en,ar}.ts`:

- `step2.noMatch.explainer` — currently *"We couldn't find this in our catalogue. It won't be
  included in this request."* The second sentence is now false.
- `step2.noMatch.newSizeExplainer` — same, ends *"It won't be included in this request."*
- New keys: the free-text field's label and placeholder, and the gate reason for an unnamed line.
- `step2.noMatch.whatsappMessage` — unchanged.

⚠️ No trailing periods in UI strings, and no em dashes in copy (house rules).

---

## 2. The wire contract, exactly

### Creating the request — `POST /api/requests` → `POST /agents/requests`

One line of `equipmentItems` changes shape, and nothing else on the payload moves.

```jsonc
// ordinary line — byte-identical to today
{ "categoryId": "cat-7", "subtypeId": "sub-3", "capacityId": "meas-9",
  "numberOfUnits": 1, "operatorIncluded": "YES", /* …every other field unchanged… */ }

// off-catalogue line — the new shape
{ "customEquipmentName": "floating crane barge",
  "numberOfUnits": 1, "operatorIncluded": "YES", /* …every other field unchanged… */ }
```

The rule the backend enforces per item:

| Sent | Result |
| --- | --- |
| all three ids | accepted, as always |
| **no ids + `customEquipmentName`** | accepted — the new case |
| one or two ids | **422** |
| neither ids nor a name | **422**, as always |
| all three ids **and** a name | accepted; the ids win, the text rides along unread |

⚠️ **OMIT the three keys. Do not send `null`.** They are `.optional()` on the backend, not
`.nullable()` — an explicit `null` fails validation where an absent key passes. `JSON.stringify`
drops `undefined`, and the conditional spread is the idiom `draftToCreateRequest` already uses:

```ts
...(i.ref.categoryId ? { categoryId: i.ref.categoryId } : {}),
...(i.ref.subcategoryId ? { subtypeId: i.ref.subcategoryId } : {}),
...(i.ref.measurementId ? { capacityId: i.ref.measurementId } : {}),
customEquipmentName: i.customEquipment?.trim() || undefined,
```

⚠️ **A PARTIAL triple is a 422, and that is deliberate.** Two of three ids resolves to nothing the
matcher can use; accepting it would produce a request that looks normal in every admin screen and
silently matches nobody. If the web can ever emit a partial ref, fix it there.

`customEquipmentName` is **trimmed, 1–120 characters**. `"   "` is not a name.

### Reading a request back

Every item on every renter-facing read now carries two extra fields:

```jsonc
// ordinary line
{ "subtypeName": "Crawler excavator", "capacityName": "20 ton",
  "customEquipmentName": null, "isUndefined": false }

// off-catalogue line
{ "categoryName": null, "subtypeName": null, "capacityName": null,
  "customEquipmentName": "floating crane barge", "isUndefined": true }
```

So the read rule everywhere is:

```ts
const name = item.isUndefined ? item.customEquipmentName : item.subtypeName;
```

⚠️ **`isUndefined` is DERIVED by the backend on every read, not stored.** Branch on it; never
recompute it from the ids.

⚠️ **The three id fields come back as the EMPTY STRING, not null**, for such a line. They are
`NOT NULL` columns and `''` is the sentinel. Never render them, and never test for `''` in the web —
`isUndefined` is the contract.

⚠️ Every taxonomy name is `null`, in **both** locales. There is no Arabic version of the renter's
text: he typed one language and both locales show his words.

### The shared bid form — `GET /public/bid-form/{token}`

Already handled server-side. The item comes back as:

```jsonc
{ "label": "floating crane barge", "labelAr": "floating crane barge",
  "size": null, "sizeAr": null, "imageUrl": null,
  "isUndefined": true, "customEquipmentName": "floating crane barge" }
```

`label` is already what `BidFormItem` maps from, so **the form needs no change to name the machine**.
Optional: use `isUndefined` to mark the row as "not in our catalogue" for the supplier's benefit.

⚠️ **A null `size` is already the ordinary case** (most subtypes carry no measurement), so the form
handles it — but check that a size-less row prints no dangling separator.

The link **preview** (`/preview`, the Open Graph card) also names it: the headline uses the renter's
words instead of falling back to the literal word "Equipment".

---

## 3. Where such a request appears, and where it does not

This is the part the copy has to be honest about.

| Surface | Shows it? |
| --- | --- |
| The renter's own list and detail (web + app) | **Yes** |
| His firm's colleagues (company-shared visibility) | Yes, by the normal rules |
| The shared bid-form link, and its unfurled preview card | **Yes** — the one supplier-facing route |
| Supplier app feed / "For you" / Explore / Browse | No |
| Supplier home "unbid requests" badge | No |
| Supplier OS market list and request detail | No |
| The public open-demand book (`/partner/v1/requests/open`) | No |
| Bid gate, and `submitBid` | Refused (`E9017`, 422) |
| c-hub / CRM | Yes, flagged **"Not in catalogue"** for ops |

**Not dispatched at all** — no notification is sent to anyone, and `matchedSupplierCount` is `0`.
A `DIRECT` off-catalogue request (started from a supplier's store page) is **also** not sent to that
supplier — one rule for every request type, since nothing in the app could let him answer it.

⚠️ **Consequence the UI must own:** a request whose every line is off-catalogue will have zero bids
forever unless the renter shares the link. *Ready to send* and the confirmation screen should say so,
and the share-link control should be prominent on such a request — not one tap away.

---

## 4. Web changes, file by file

The existing web plan's §1–§7 stand. In short:

- **`src/lib/contract/draft.ts`** — `customEquipment?: string | null` on `EquipmentItem`, distinct
  from `rawLabel` (the agent's echo). `rawLabel` prefills the box; the renter's typed value is his.
- **`src/lib/contract/gates.ts`** — `postableItems` keeps a `no-match` line **that has a name**;
  `itemAppGaps` requires the name for such a line and skips the three taxonomy gaps.
  ⚠️ 8 call sites of `postableItems` now include these lines — that is the intent, but check each.
- **`src/components/create/MachineCard.tsx`** — keep the taxonomy trio visible (not required), add
  the free-text field under it, reword the notice per §1, keep the WhatsApp button.
- **`src/lib/api/app-adapters.ts`** — the payload change in §2.
- **Read-back sweep** — `itemName()` and every `subtypeName` reader (13 files, ~32 occurrences) fall
  back to `customEquipmentName` when `isUndefined`. One shared helper, not 13 `??` chains.
- **`src/lib/draftBidForm.ts`** — the *Ready to send* preview must read the same as the posted form.
- **Tests** — `tests/unit/canvas-no-match.test.tsx` (4 cases) will fail by design; rewrite for the
  new state machine. Assert the payload **omits** the keys (`"categoryId" in item === false`), not
  that they are `undefined` — the second passes for a key that is present and null.

### Ship order

The backend must be deployed **before** the web switch is turned on, in this order:

1. the migration (one `ADD COLUMN`), 2. `agents-equipment`, 3. `marketplace` + `partner-api` +
`admin-requests` + `admin-crm`, 4. the app build, 5. the web switch.

Until step 2, `POST /agents/requests` **422s** an item with no ids. Keep the feature behind
`NEXT_PUBLIC_CUSTOM_EQUIPMENT` (default off) so the create flow is byte-identical meanwhile.

---

## 5. Corrections to the web-side plan

Three things it inferred without the backend checked out:

1. **"The three ids are FKs, so the migration must drop constraints."** They are not. The only
   foreign key on `request_equipment_items` is `request_id`. The migration is one additive
   `ADD COLUMN custom_equipment_name VARCHAR(120) NULL` — the three id columns are **unchanged and
   still `NOT NULL`**, and an off-catalogue line is written with the empty string in all three. No
   nullability change anywhere.
2. **"Any INNER JOIN onto the taxonomy silently deletes the line."** No such join exists. Names are
   resolved through a `Map` lookup and the item is spread, so a line with no taxonomy survives with
   null names.
3. **The sentinel "Other" taxonomy node was rejected on the grounds that the taxonomy contract has
   no hidden flag.** True of the web contract, false of the backend — `visibility: HIDDEN` exists and
   renter surfaces already filter it. The node was still rejected, on better grounds (it would turn
   renter free text into permanent rows in an ops-curated table). Recorded so the argument is not
   re-run from the wrong premise.

Plus one thing that is now settled and was open in that plan: **matching** (§4 there). A
subtype-less line reaches no supplier by any route, and `DIRECT` is no exception.
