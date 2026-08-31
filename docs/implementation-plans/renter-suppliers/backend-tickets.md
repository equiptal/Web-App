# Backend tickets — My Suppliers (SUP)

**For the backend agent. This file is self-contained**: it states the schema, every endpoint's request and response, the rules, and what "done" means. Nothing here requires reading the web repo.

| | |
|---|---|
| **Key** | SUP-BE |
| **Consumer** | Web-App, `docs/implementation-plans/renter-suppliers/plan.md` |
| **Prototype** | `prototypes/renter-suppliers-v1.html` in Web-App — the screens these feed |
| **Routing note** | Tickets marked **[agents]** belong to the agents service (`/agents/*`, service-token, `userId` forwarded). Tickets marked **[app]** belong to the app backend (`/marketplace/*`, the renter's own session). Two suites, one feature. |

## What the feature is, in five sentences

A renter keeps a private list of the suppliers they work with. Some of those suppliers have a Moedatech account and some do not. The list carries the renter's own flag on each — *registered vendor* — plus their own groups, contacts and imported spreadsheet columns. The list is read on one screen, feeds the recipient picker when a request is shared, and feeds the supplier picker when a project award is made. **The flag and the groups belong to the renter's company and are never visible to the supplier.**

## Rules that hold across every ticket

1. **A row is a LINK between a company and a supplier.** Never a column on the supplier's own account. Two renters flag the same supplier differently and neither sees the other.
2. **The owner is the COMPANY, not the user.** Every read and write is scoped by the caller's company. `created_by_user_id` is audit only.
3. **Uniqueness is enforced by indexes, not by application code.** Two members adding the same supplier at the same moment must not produce two rows.
4. **Roll-ups are computed server-side.** If the client computes them, one page load fetches every bid of every supplier.
5. **Bulk is never all-or-nothing.** One bad row must not lose thirty-nine good ones.
6. **Deleting a link deletes the link.** Bids, deal rooms, awards and the supplier's account are untouched.

---

## SUP-BE-1 — The table **[agents]**

```sql
CREATE TABLE renter_suppliers (
  id                  uuid PRIMARY KEY,
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_user_id  uuid NOT NULL,
  supplier_user_id    uuid NULL,              -- set when the supplier has an account
  kind                text NOT NULL,          -- 'platform' | 'own'
  vendor_registered   boolean NOT NULL DEFAULT false,
  vendor_registered_by   uuid NULL,
  vendor_registered_at   timestamptz NULL,
  name                text NULL,              -- 'own' rows only; a platform row reads its account
  contact_name        text NULL,
  email               text NULL,
  phone_e164          text NULL,
  cr_number           text NULL,
  groups              text[] NOT NULL DEFAULT '{}',
  extra               jsonb NOT NULL DEFAULT '{}',
  source              text NOT NULL,          -- 'platform' | 'manual' | 'sheet' | 'link_bid'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ON renter_suppliers (company_id, supplier_user_id) WHERE supplier_user_id IS NOT NULL;
CREATE UNIQUE INDEX ON renter_suppliers (company_id, phone_e164)       WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX ON renter_suppliers (company_id, cr_number)        WHERE cr_number IS NOT NULL;
CREATE        INDEX ON renter_suppliers (company_id, updated_at DESC);
CREATE        INDEX ON renter_suppliers (company_id, email);           -- lookup only, NOT unique
```

**Why email is not unique:** two rows can legitimately share an address (one estimator covering two firms), and a unique index would reject a valid write.

**Why `name` is nullable:** a `platform` row must read the supplier's live name from their account. Copying it means a rename never reaches the renter.

**Done when:** the table exists, all five indexes exist, and inserting the same `(company_id, phone_e164)` twice fails at the database and not in code.

---

## SUP-BE-2 — Normalization on every write **[agents]**

Both keys are normalized server-side. A client will send whatever the renter's spreadsheet held.

- **Phone → E.164.** `0551234567`, `+966 55 123 4567`, `966551234567` and `00966551234567` are the same number. Default region **SA**. A value that cannot be parsed is stored as `NULL` and reported back in `rejected[]` — never stored raw, because a raw value is a key that will never match.
- **CR → digits as text.** Strip spaces, dashes and punctuation. **Keep leading zeros.** Never cast to a number.

**Done when:** the four phone spellings above all resolve to one row, and a CR of `0101 234 567` matches `0101234567`.

---

## SUP-BE-3 — `GET /agents/renter-suppliers` **[agents]**

The list. One row per link, with the roll-up computed here.

```jsonc
[{
  "id": "…", "kind": "platform", "supplierId": "u_882",
  "name": "Zahid Tractor",          // live from the account for platform, stored for own
  "contactName": "Faisal Al-Otaibi",
  "email": "tenders@zahidtractor.com", "phone": "+966552148890", "crNumber": "1010445521",
  "vendorRegistered": true, "groups": ["Earthmoving","Riyadh"],
  "store": true, "verified": true,
  "extra": { "Payment terms": "30 days" },
  "rollup": { "bidsApp": 3, "bidsLink": 1, "lastBidAt": "2026-08-29T…", "rooms": 3, "awards": 2 }
}]
```

- `bidsApp` — bids this supplier made on this company's requests inside the app.
- `bidsLink` — link submissions attached to this row (see SUP-BE-9).
- `rooms` — deal rooms opened between the two.
- `awards` — project awards carrying this row's `supplierId`.
- **`newBids` is NOT in this payload yet.** It is per user and arrives with SUP-BE-13.

**Done when:** a company with 200 suppliers returns in one query set, and no roll-up requires a second call.

---

## SUP-BE-4 — `GET /agents/renter-suppliers/{id}` **[agents]**

The profile. Everything in the list row, plus:

```jsonc
{
  "bids": [{ "requestId":"…", "requestCode":"RFQ-40218", "equipment":"Excavator 20t",
             "site":"Qiddiya — Zone 4", "price":"8400", "priceUnit":"PER_MONTH",
             "at":"2026-08-29T…", "via":"app" | "link", "bidId":"…" }],
  "awards": [{ "projectId":"…", "projectTitle":"Qiddiya Zone 4", "equipment":"Excavator 20t",
               "units":3, "price":"8400", "start":"2026-09-01", "end":"2026-12-31" }],
  "sends":  [{ "kind":"share" | "invite", "requestCode":"RFQ-40218",
               "at":"2026-08-26T…", "opened":true }]
}
```

`sends` is empty until SUP-BE-15 ships; return the key so the client does not branch on its absence.

**Done when:** a supplier with no bids returns `bids: []` and not an error, and one bid's `bidId` is enough for the web to open it in its request.

---

## SUP-BE-5 — `POST /agents/renter-suppliers` **[agents]**

One row.

```jsonc
{ "name":"Najd Equipment Est.", "contactName":"Bandar", "email":"sales@najd-eq.sa",
  "phone":"0559031174", "crNumber":"1010445521", "vendorRegistered":true, "groups":[] }
```

- `name` required. **At least one of `email` or `phone` required** → otherwise `400 MISSING_CONTACT`.
- A phone or CR that already exists in this company → `409` with `{ code:"ALREADY_LINKED", id }`. Not an error the user sees as a failure: the web says *"already in your list"* and opens that row.
- `source: "manual"`, `kind: "own"`.

---

## SUP-BE-6 — `POST /agents/renter-suppliers/bulk` **[agents]**

The spreadsheet import. **Cap: 500 rows, 2 MB.** Past it → `413` with the count. **Never truncate** — a renter must not believe they imported a file they did not.

```jsonc
// request
{ "rows": [{ "name":"…", "contactName":"…", "email":"…", "phone":"…", "crNumber":"…",
             "extra": { "Payment terms":"30 days" }, "vendorRegistered": true }] }

// response — partial success is the normal outcome
{ "created": [{ "row":0, "id":"…" }],
  "merged":  [{ "row":1, "id":"…", "on":"phone" }],
  "rejected":[{ "row":2, "reason":"MISSING_CONTACT" }] }
```

`extra` is pass-through JSON: whatever columns the renter did not map. Do not validate its shape.

---

## SUP-BE-7 — `POST /agents/renter-suppliers/link` **[agents]**

Linking suppliers who already have accounts, from the directory picker.

```jsonc
{ "items": [{ "supplierId":"u_882", "vendorRegistered": true },
            { "supplierId":"u_604", "vendorRegistered": false }] }
```

An already-linked supplier is **skipped, not an error**. Response mirrors bulk: `created[]`, `skipped[]`.

---

## SUP-BE-8 — `PATCH` and `DELETE /agents/renter-suppliers/{id}` **[agents]**

- `PATCH` accepts `vendorRegistered`, `contactName`, `email`, `phone`, `crNumber`, `groups`. **Idempotent** — the vendor toggle fires fast and sometimes twice. Setting `vendorRegistered` stamps `vendor_registered_by` and `_at`.
- A `platform` row refuses `name` → `400 NAME_IS_THEIRS`.
- `DELETE` removes the row only. Response states what was untouched so the client can say it: `{ deleted:true, keptBids:4, keptAwards:2 }`.

---

## SUP-BE-9 — Attach a link submission to a row **[agents]**

Runs on every incoming `LinkBidSubmission`. **Keys in order: CR, then phone, then email.**

| Case | Result |
|---|---|
| `crNumber` matches a row in the request owner's company | attach |
| No CR match, `contactInfo` (phone) matches a row | attach, **and backfill `cr_number` onto that row** |
| CR matches one row, phone matches a different one | attach on CR, and record a `possible_duplicate` flag on the pair. **Never merge on a conflict** |
| `contactInfo` holds an **email** that matches exactly one row | attach. Backfill nothing |
| That email matches two or more rows | no attach — it becomes a suggestion instead |
| Nothing matches | no attach. The submission is offered as a **suggestion** (SUP-BE-10) |

**Never match on company name.** Saudi commercial names repeat across regions; a wrong attach writes a bid into another firm's history.

**Free-mail domains — `gmail`, `hotmail`, `outlook`, `yahoo` — never match.** A salesperson's personal address is not a company's identity.

---

## SUP-BE-10 — `GET /agents/renter-suppliers/suggestions` **[agents]**

Suppliers who bid on this company's requests but hold no link row. Derived, never stored.

```jsonc
[{ "companyName":"Arabian Crane Services", "phone":"+966554472216", "crNumber":"…",
   "supplierId": null,            // set when they have an account
   "why":"link_bid", "at":"2026-08-28T…" }]
```

Dismissal is client-side and per user. Do not add a write for it.

---

## SUP-BE-11 — `GET /agents/supplier-lookup` **[agents]**

Does an account exist for this firm? Used when an `own` row is created, nightly for unmatched rows, and when an invited supplier signs up.

```
GET /agents/supplier-lookup?cr=1010445521&phone=%2B966559031174&email=sales@najd-eq.sa
→ 200 { "supplierId":"u_951", "matchedOn":"cr" | "phone" | "email" }
→ 404 (no match)
```

**It returns an id and the matched key. Nothing else — no name, no store, no city, no profile.** A renter with a phone book must not be able to enumerate the platform. Rate-limit per company.

**Blocking question for this ticket:** is `cr_number` stored on the supplier's *account*? The bid form collects a CR per submission, which is not the same thing. If the account has no CR, this endpoint answers on phone and email only, and the web is told which keys are live.

---

## SUP-BE-12 — Promotion and merge **[agents]**

When SUP-BE-11 returns a match for an `own` row:

| Case | Result |
|---|---|
| `matchedOn` is `cr` or `phone`, and the company has no platform row for that supplier | **promote in place**: set `supplier_user_id`, `kind='platform'`. Keep `groups`, `vendor_registered`, `extra`, `cr_number`, `email`, `phone`. Stop serving the stored `name` |
| `matchedOn` is `cr` or `phone`, and a platform row already exists for that supplier | **merge**: keep the older row, union `groups`, `vendor_registered = a OR b`, merge `extra` (prefix colliding keys), move attached submissions, delete the newer row. Promoting instead would hit the unique index and the row would silently stop updating |
| `matchedOn` is `email` | **do not promote.** Return it as a pending suggestion the renter confirms. An email is a person, not a firm |
| CR says one account and phone says another | do nothing. Flag for the renter — an automatic merge here joins two real companies |
| The supplier later deletes their account | the row does **not** demote. The bids and awards happened; serve the last known name |

**Both operations are idempotent and logged.** A renter who cannot explain why two rows became one stops trusting the list.

---

## SUP-BE-13 — `newBids`, per user **[agents]**

```sql
CREATE TABLE renter_supplier_seen (
  user_id            uuid NOT NULL,
  renter_supplier_id uuid NOT NULL REFERENCES renter_suppliers(id) ON DELETE CASCADE,
  last_seen_bids_at  timestamptz NOT NULL,
  PRIMARY KEY (user_id, renter_supplier_id)
);
```

- `GET /agents/renter-suppliers` gains `rollup.newBids` — bids attached after this caller's `last_seen_bids_at`, or all of them when no row exists.
- `POST /agents/renter-suppliers/{id}/seen` stamps it.

**Per user, deliberately.** A colleague opening a supplier's bids must not clear another member's badge.

---

## SUP-BE-14 — Groups **[agents]**

Flat labels on the row; no group table. A group with no members does not exist.

- `GET /agents/renter-suppliers/groups` → `[{ "name":"Earthmoving", "count":3 }]`
- `PATCH /agents/renter-suppliers/groups` → `{ "from":"Earthmoving", "to":"Earth works" }` renames across the company in one write.
- `DELETE /agents/renter-suppliers/groups/{name}` removes the label from every row. **It never deletes a supplier**, and the response says how many rows it touched.

---

## SUP-BE-15 — The declared share **[agents]**

```
POST /agents/requests/{id}/shares
{ "renterSupplierIds": ["…","…"], "channel": "email" | "whatsapp" }
→ { "recorded": 6 }
```

**It records what the renter said they sent. It is not a delivery confirmation** — the mail leaves from the renter's own client, so nothing here may ever be reported as *delivered* or *bounced*.

`GET /agents/requests/{id}/shares` returns the records with `opened` — which is real, because the public bid page is server-rendered and sees the first non-bot visit. **No tracking pixel.**

Invitations to join Moedatech are the same table with `kind: "invite"` and no request id.

---

## SUP-BE-16 — A supplier directory to pick from **[app]**

**The picker must browse SUPPLIERS, not stores.** `GET /stores` lists shopfronts, so a supplier who has never built one is invisible to it — and a renter who cannot find a firm he works with will type it in by hand, creating an `own` row for a company that already has an account. Matching repairs that later (SUP-BE-12), but the renter did work he should not have, and until the nightly pass runs his list is wrong.

Two things are needed, and they are separable:

**a · The supplier's id on the stores payload.** `GET /stores` returns a store id; a link row needs the supplier's. The web already reads every plausible spelling and falls back to null (`supplierIdOf`), so **if the id is on the wire under any name, nothing more is required here** — confirm it, and say which name.

**b · A directory read that includes suppliers with no store.**

```
GET /agents/suppliers?q=zahid&city=Riyadh&cursor=…
→ { "items": [{ "supplierId":"u_882", "name":"Zahid Tractor", "city":"Riyadh",
                "verified": true, "hasStore": true, "equipmentCount": 41 }],
    "next": "…" }
```

Minimal fields — enough to recognise a firm and no more. No phone, no email, no CR: a renter must not be able to harvest contact details for suppliers he has never dealt with.

**The exposure question this raises, and it needs an answer before the endpoint is written.** Stores is browsable because a store is a shopfront its owner chose to open. A supplier with no store never opted into being listed. So which of these is the directory?

1. **Every supplier account** — the most useful picker, and the largest exposure.
2. **Suppliers with a store, plus any supplier this renter has already dealt with** — a bid, a deal room, an award. Nothing new is exposed: he has seen all of them already.
3. **Stores only** — today's behaviour, and the one that sends renters to the keyboard.

**Recommended: 2.** It covers the case that actually bites — a supplier who bid through a shared link and has no store — while exposing nobody the renter has not already met. Option 1 can follow if suppliers are asked to consent to being listed.

**Done when:** the exposure question has a written answer, and the endpoint returns store-less suppliers under it.

---

## SUP-BE-17 — An award requires a supplier id **[agents]**

The project award currently accepts a typed `supplierName` with no id, because this registry did not exist. Once it does:

- `POST /agents/projects/{id}/awards` requires `renterSupplierId`.
- `supplierName` is still **stored** beside it — a snapshot of what the firm was called that day. It is never a lookup key again.
- Reject an award with neither → `400 SUPPLIER_REQUIRED`.

---

## SUP-BE-18 — The bid-link card does not render in production **[app]** · investigation

Everything the renter sends leans on this card, and it does not arrive in production mail today (2026-08-31). Two faults share the symptom:

- **App-sent mail shows no card** → `apps/backend-admin/src/services/email/bid-link-card.ts`. Suspects: CSS in a `<style>` block (most clients strip it — everything must be inline), the image host, or the send pipeline escaping the HTML body.
- **The link does not unfurl** → the public bid page's Open Graph tags, its `og` image route, whether the preview read answers for a production token, and whether the canonical points somewhere else.

**Done when:** a production token is pasted into WhatsApp, Apple Mail, Outlook and Gmail, each result is recorded, and the failing layer is named before any fix is written.

---

## SUP-BE-19 — A structured bid preview **[app]** · deferred, design first

The card today is reverse-engineered from a description string: the renderer splits it on a separator and guesses whether each part is a location or a rental basis. Three more terms cannot survive that.

The preview read becomes fields — `equipment`, `units`, `site`, `start`, `end`, `extendable`, `fuel`, `mobDemob`, `payment`, `closesAt` — and both renderers format them instead of parsing prose.

**Design is not settled.** The card must read correctly in WhatsApp, Apple Mail, new Outlook, Gmail, Slack and iMessage, and the 880×320 image holds two short lines rather than a table. **Do not start this ticket** until the card design is agreed with the owner; it is listed here so it is not forgotten.

---

## Order

| | Tickets | Unblocks |
|---|---|---|
| **First** | BE-16, BE-11's blocking question, BE-18 | the picker, matching, and everything that sends |
| **1** | BE-1, BE-2, BE-3, BE-5, BE-6, BE-7, BE-8 | the list exists and can be built |
| **2** | BE-9, BE-10, BE-12, BE-14 | matching and groups |
| **3** | BE-4, BE-13, BE-17 | the profile, the badge, and awards that link |
| **4** | BE-15, BE-19 | the outbound half |
