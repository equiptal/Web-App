# My Suppliers — what the backend delivers, and what the web has to build

**Written for the web developer.** Every endpoint below exists in `Moedatech-App/apps/backend-agents`
and is reachable at `/agents/*` with the service token, forwarding the renter as `userId`.

> ⚠️ **Nothing works until the migration runs.** `20260831220000_renter_suppliers` has never been
> applied on any stage. Until it is, every endpoint here answers 500. Ask the owner to run it.

---

## 1. Decisions that changed the ticket

Read these first — several of them change what the screens can show.

| # | The ticket said | What shipped | Why |
|---|---|---|---|
| 1 | Match on **CR**, then phone, then email | **Phone, then email. There is no CR at all** — no column, no field, no matching | A CR is hand-typed on a public form and two different companies reach one routinely (a typo, a branch of a group). Matching on it files one firm's bid into another's history |
| 2 | Promote a hand-typed row when the supplier gets an account | **A label.** The row stays the renter's; `onMoedatech: true` appears | Nothing is rewritten, so the renter keeps their own name, tags and flag — and it self-corrects on every read |
| 3 | `rollup.newBids` = since **I** last looked | = **arrived in the last 24 hours**, same for everyone | No table, no write on every tap. The per-person "unseen" dot is now the **web's** job — see §4 |
| 4 | Each send carries `opened` | **`opened` is absent** | All recipients of one request get the *same* link, so the bid page sees a visit but not whose |
| 5 | `supplierId` looks like `"u_882"` | **a number** | `users.id` is an integer in this database |
| 6 | An award may carry a typed supplier name | **`supplierId` is required** and must be a row in the caller's own list | — |

**Not built:** BE-12 (merge two rows — can't be done losslessly with one phone per row),
BE-18 (bid-card investigation), BE-19 (deferred by the ticket), BE-20 (provisional).

---

## 2. The endpoints

All take the renter as `userId` — in the query for GET/DELETE, in the body for POST/PATCH.

### The list

```
GET /agents/renter-suppliers?userId=46
```

```jsonc
[{
  "id": "8f2c…", "kind": "own" | "platform",
  "supplierId": 675 | null,        // the account, linked OR matched by phone/email
  "onMoedatech": true,             // ⚠️ NEW — show the badge on this
  "matchedOn": "phone" | "email" | null,   // null on a linked row: the id IS the link
  "name": "Najd Equipment Est.",   // the renter's own name on an `own` row, the live account name on a `platform` one
  "contactName": "Bandar",
  "email": "sales@najd-eq.sa", "phone": "+966559031174",
  "vendorRegistered": true, "groups": ["Earthmoving"],
  "store": true, "verified": true,
  "extra": { "Payment terms": "30 days" },
  "unparsed": { "phone": "call the office" },   // ⚠️ present ONLY when a cell could not be parsed
  "source": "manual" | "sheet" | "platform",
  "updatedAt": "2026-09-01T…",
  "rollup": { "bidsApp": 3, "bidsLink": 1, "lastBidAt": "2026-08-29T…", "rooms": 3, "awards": 2, "newBids": 1 }
}]
```

### The rest

| | |
|---|---|
| `GET /agents/renter-suppliers/{id}?userId=` | the list row **plus** `bids[]`, `awards[]`, `sends[]` |
| `POST /agents/renter-suppliers` | one row by hand → `201` the row, or `409 ALREADY_LINKED` |
| `POST /agents/renter-suppliers/bulk` | the sheet import → `created[] merged[] rejected[] warnings[]` |
| `POST /agents/renter-suppliers/link` | the directory picker → `created[] skipped[]` |
| `PATCH /agents/renter-suppliers/{id}` | edit → the row, sometimes `linkBidsMoved` |
| `DELETE /agents/renter-suppliers/{id}?userId=` | → `{ deleted, keptBids, keptAwards, keptRooms }` |
| `GET /agents/renter-suppliers/suggestions?userId=` | firms who bid but are not on the list |
| `GET /agents/supplier-lookup?userId=&phone=&email=` | → `{ supplierId, matchedOn, liveKeys }` or **404** |
| `GET/PATCH /agents/renter-suppliers/groups` · `DELETE …/groups/{name}?userId=` | groups |
| `POST/GET /agents/requests/{id}/shares` · `POST /agents/renter-suppliers/invites` | declared sends |

---

## 3. Screens to build

### 3.1 The list

- **`onMoedatech`** → the *"on Moedatech"* badge. It appears on hand-typed rows too, matched by
  phone or email, and the row is still `kind: "own"` — **do not** treat the badge as "linked".
- **`unparsed`** → render that field **red**, showing the text it holds, with the row's own value
  greyed or blank. Its **presence** is the signal; it is absent, never `{}`, when nothing is wrong.
- **`rollup.newBids`** → *"2 new"*, meaning **in the last 24 hours**. Not "unread".
- **`vendorRegistered`** → the toggle. It is idempotent server-side: a double-tap writes nothing
  and the response carries `unchanged: true`.

### 3.2 ⚠️ The unseen dot is yours to build

The backend has **no per-user seen state and no endpoint for it** — the same arrangement the ticket
already mandates for dismissing a suggestion: *"client-side and per user. Do not add a write."*

```
store locally:  { [supplierRowId]: lastOpenedISO }
show the dot when:  rollup.lastBidAt > lastOpened[row.id]
clear it:  on opening the supplier, write the current time to that key
```

Its limit, so nobody promises otherwise: local memory is **per device**, and clearing browser data
resets it. That is why the *count* (`newBids`) is not built on it.

### 3.3 The import — use the preview

```
POST /agents/renter-suppliers/bulk   { userId, rows: [...], dryRun: true }
```

Runs the whole decision and **writes nothing**. Show the renter their red cells and their duplicates,
let them fix the file, then post again without `dryRun`.

Caps: **500 rows, 2 MB**. Past either you get `413` with the real count — never a partial import.

The response:

```jsonc
{ "created":  [{ "row": 0, "id": "…" }],           // id is null in a dry run
  "merged":   [{ "row": 1, "id": "…", "on": "phone" | "email" }],
  "rejected": [{ "row": 2, "reason": "MISSING_CONTACT" | "MISSING_NAME" | "DUPLICATE_OF_ROW_7" }],
  "warnings": [{ "row": 3, "field": "phone", "reason": "INVALID_PHONE", "value": "call the office" }] }
```

`warnings` reasons: `INVALID_PHONE`, `INVALID_EMAIL`, `TRUNCATED`, `TOO_LONG`,
`SAME_NAME_DIFFERENT_CONTACT`.

⚠️ **`SAME_NAME_DIFFERENT_CONTACT` is the one to design for.** The sheet names a supplier already on
the list but reaches a different phone and email, so it was added as a **new row**. Two firms a
renter named the same are real, so the backend refuses to fold them — **the preview should ask.**

⚠️ **A merge fills blanks only and never overwrites.** Re-importing an old sheet cannot undo a
correction made in the app. So a genuinely *updated* sheet will not update anything: the renter has
to edit in the app. Say so in the import screen.

### 3.4 The directory picker — blocked until the web reads the new field

`GET /stores` and `GET /stores/{storeId}` now carry **`supplierId`** and **`supplierCompanyId`**.
The store `id` is **not** what a link row stores. Send `supplierId` to
`POST /agents/renter-suppliers/link`.

Picking someone already on the list is **`skipped: "ALREADY_LINKED"` or `"ALREADY_IN_LIST"`**, not an
error — say *"already in your list"* and open that row.

### 3.5 Suggestions

```jsonc
[{ "companyName": "Arabian Crane Services", "phone": "+966554472216",
   "email": "ops@…" | null, "supplierId": 951 | null, "why": "link_bid", "at": "…" }]
```

One row per **firm**, not per bid. Last 180 days, 50 max. **Dismissal is client-side** — there is no
endpoint and there must not be one. When `supplierId` is set, offer *Link* (§3.4) rather than
creating a hand-typed row.

### 3.6 The profile

`bids[]` merges both lanes, newest first:

```jsonc
{ "requestId": "…", "requestCode": "RFQ-40218", "equipment": "Excavator 20t", "site": "Qiddiya — Zone 4",
  "price": "8400", "priceUnit": "PER_MONTH", "units": 3,
  "at": "…", "via": "app" | "link", "bidId": "…" }
```

⚠️ **`price` is a RATE per unit per period, in both lanes — never a total.** Multiply by `units` and
prorate by `priceUnit` using the same helpers the bid card already uses
(`headlineAmount` over `computeRentalTotal`). Do not sum the column.

⚠️ **`rollup.bidsLink` counts SUBMISSIONS; `bids[]` has one line per request ITEM.** One submission
covering a crane and a generator is `bidsLink: 1` and **two** rows. They are meant to differ.

`sends[]` — `{ kind: "share"|"invite", channel, requestId, requestCode, declaredAt, declaredBy }`.
⚠️ **`declaredAt`, not `sentAt`, and no `opened`.** This is only what the renter said they sent. It
must never be presented as delivered, bounced or read.

### 3.7 Groups

`GET` → `[{ name, count }]`, alphabetical. Two spellings are **one** group.

`PATCH { userId, from, to }` → `{ renamed: n, mergedInto?: "Earth works" }`.
⚠️ **`mergedInto` means two groups became one.** Warn before, because renaming back does not undo it.

`DELETE …/groups/{name}?userId=` → `{ removedFrom: 2, suppliersKept: 2, deletedSuppliers: 0 }`.
The dialog must say **"this removes the label from 2 suppliers; no supplier is deleted."** Percent-encode
the name — group names hold spaces and Arabic.

### 3.8 Awards

`POST /agents/projects/{id}/awards` now **requires `renterSupplierId`** (sent as `supplierId`) and it
must be a row in the caller's list, else `400 SUPPLIER_REQUIRED`. The typed-name-only path is gone.
Keep sending `supplierName` — it is stored as a snapshot of what the firm was called that day.

---

## 4. Errors to handle

| code | status | what to do |
|---|---|---|
| `MISSING_CONTACT` | 400 | the row needs an email or a phone. `details.notes` names the field that was dropped |
| `MISSING_NAME` | 400 | a hand-typed supplier must have a name |
| `NAME_IS_THEIRS` | 400 | you tried to rename a linked supplier; their name comes from their account |
| `SUPPLIER_REQUIRED` | 400 | an award needs a supplier from the list |
| `ALREADY_LINKED` | 409 | `details.id` is the existing row — say *"already in your list"* and open it |
| `TOO_MANY_ROWS` / `PAYLOAD_TOO_LARGE` | 413 | `details` carries the real count and the limit |
| `TOO_MANY_REQUESTS` | 429 | the supplier lookup is capped at 100/day per firm |

⚠️ **`400 MISSING_CONTACT` fires on a phone the renter thinks they typed** — `"call the office"`
parses to nothing. Point at the field, not the form.

---

## 5. Two things worth knowing before you design

**Off-platform bids are matched fresh on every read, not stored.** If the renter edits a supplier's
phone, a bid recorded last September can move off that supplier and reappear as a suggestion. The
`PATCH` response tells you when that happened:

```jsonc
{ "…the row…", "linkBidsMoved": { "before": 2, "after": 1 } }
```

Present it — *"1 off-platform bid no longer shows under this supplier."* The key is **absent** when
nothing moved, which is not the same as `0`.

**The supplier lookup answers on phone and email only.** `liveKeys` says so in the response. Measured
on staging: 1,489 of 1,489 supplier accounts have a phone, 594 have an email, **3** have a CR. Do not
render a CR box.
