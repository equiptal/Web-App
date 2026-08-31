# My Suppliers — implementation plan

Prototype: `prototypes/renter-suppliers-v1.html`. Key **SUP**.

Two repos: **agents-backend** owns the rows, **Web-App** owns everything the renter touches. There is no third repo and no new infrastructure — the outbound email leaves from the renter's own mail client, not from us.

Four phases, each shippable on its own:

| | Ships | Renter gets |
|---|---|---|
| **1** | the link row, the reads, the table, adding | a list that exists |
| **2** | groups, sheet import, matching | a list worth having |
| **3** | the profile — bids, papers, awards, what was sent | the history |
| **4** | share a request, invite to Moedatech | the outbound half |

---

## The decisions this plan is written against

Settled with the owner, 2026-08-31. Each is load-bearing; changing one changes the schema or the screen.

1. **The list belongs to the COMPANY, not the user.** One list per company; `created_by_user_id` is audit only. A colleague never rebuilds it, the same supplier cannot exist twice in one firm, and the rows survive a member leaving.
2. **A row is promoted SILENTLY** the moment its CR number or its phone matches a Moedatech account (§M0). It keeps its groups, its vendor flag and its sheet fields. Consequence: *how a row started* stops being a fact worth a column — the table shows an `On Moedatech` badge on the name, and its absence is the other state.
3. **`NEW` is per USER** — "since *you* last looked". A shared list does not mean shared attention.
4. **An award REQUIRES a supplier row.** The `AwardDialog` typed-name fallback is removed when this ships; it only ever existed because the registry did not (`client.ts:1217` comment). `supplierName` stays stored beside the id as a snapshot of the day, never as a lookup key. The award dialog gains an inline *add supplier* path so a renter mid-award is not sent away and back.
5. **The email leaves from the renter's own address**, `mailto:`-filled with recipients, subject and body. No mailer, no SES, no DNS. We record a *declared share*, never a delivery.
6. **Recipients go in BCC**, capped at 25 per send. They are bidding against each other; **To** would hand every competitor the others' addresses, and that cannot be undone.

---

## Phase 0 — before any code

- **P0-1** — confirm with agents-backend that `companies` is the right owner scope and that a company id is derivable from the session on every route below. The whole schema rests on it.
- **P0-2** — agree who removes the `AwardDialog` typed-name fallback, and when. It is one screen in the projects feature, and it must not be forgotten: leaving it means awards that no supplier row can ever claim.
- **P0-3** — confirm the app backend can answer *"does an account exist for this CR or this E.164 phone?"* without exposing the account, and that `crNumber` is stored on the supplier account at all (the bid form collects it per submission — that is not the same thing). See §M2. If it cannot, matching degrades to link-submission-only (§M1) and promotion (decision 2) waits.

---

## M · Matching — the two problems, and why they are not one

They share their keys and nothing else. One runs on every incoming bid; the other runs on a schedule and on write.

### M0 · The keys, in order of trust

| Key | Where it comes from | Use |
|---|---|---|
| **CR number** | `SubmitBidFormPayload.crNumber` — the bid form collects it, and the renter's own sheet usually carries a "CR number" column | **Primary where present.** Nationally unique, issued to the firm, and it does not change when the salesperson does |
| **Phone, E.164** | `contactInfo` on a submission (already normalized), the phone on an account, the phone on a typed or imported row | **Primary otherwise.** It is the account key the shared-link feature already uses |
| **Email** | the renter's own note of who they deal with; occasionally an address that landed in `contact_info` | **Last resort, and it never decides alone.** See below |

**There is no email FIELD to match on.** `SubmitBidFormPayload` carries `companyName`, `crNumber`, `vatNumber`, `nationalAddress` and `contactInfo` — and `contactInfo` is a phone, collected through a structured phone input and stored E.164. `RenterProfile.email` exists but is nullable, because an account is created against a phone.

**So email is a fallback for the case where an address turns up anyway** — `contact_info` is a text column, and data that did not come through the form (a migration, an API submit, a legacy row) can hold one. When it does, use it, under three guards:

1. **Read it, do not assume it.** If `contactInfo` parses as an email rather than a phone, treat it as an email. Compare lowercased and trimmed.
2. **Only when it is unambiguous.** An email match counts only if it hits **exactly one** row in the company's list. Two hits is no match — not a guess between them.
3. **It suggests; it never promotes.** CR and phone are firm identity, so they promote silently (decision 2). An email is a *person* — the estimator you deal with. It moves when they move, and one shared `info@` can cover two firms. So an email-only match raises a confirmation the renter accepts or rejects; it never silently rewrites a row.

Free-mail domains (`gmail`, `hotmail`, `outlook`, `yahoo`) are excluded from matching entirely. A salesperson's personal address is not a company's identity.

**Normalize before comparing.** CR: strip spaces and punctuation, keep leading zeros — a CR is a string, never an integer. Phone: E.164, server-side, on every write; a sheet will carry `0551234567`, `+966 55 123 4567` and `966551234567` in one column.

**A CR belongs to a branch, not always to a group.** Two branches of one firm hold two CRs and are two suppliers here — which is correct: they invoice separately and bid separately.

### M1 · A link submission → which supplier row

**Trigger:** a `LinkBidSubmission` arrives.
**Keys:** `crNumber` first, then `contactInfo` as a phone (E.164, already normalized — `link-bids.ts:183`), then `contactInfo` as an email where it holds one — under the §M0 guards.

| Case | Result |
|---|---|
| CR matches a row in this company's list | attach. The strongest match we have, and it survives a change of contact |
| CR matches nothing, phone matches a row | attach, and **backfill the CR onto that row** — the submission just told us something the renter did not know |
| CR matches one row and phone matches a DIFFERENT row | attach on CR, and flag the pair for the renter as a possible duplicate. Never merge on a conflict without being asked |
| Phone matches a row in this company's list | attach the submission to that row. Its bid count, `via link`, and `NEW` all follow |
| Phone matches nothing, submitter has no account | **Suggested band.** A candidate, never an automatic row — the renter decides who is in their list |
| Phone matches nothing, submitter HAS an account | Suggested band, marked as on Moedatech, so adding it creates a `platform` row directly |
| Neither CR nor phone matches, and both are absent | cannot be attached or suggested. Do not guess from `companyName`; two firms share a name more often than a number |
| No CR, and `contactInfo` holds an email that matches exactly one row | attach, and backfill nothing — an email tells us who we already knew, not a new fact about the firm |
| That email matches two or more rows | no match. Send it to the Suggested band instead of guessing between them |
| Phone matches TWO rows in one company | impossible by the unique index below. If legacy data breaks it, attach to the older row and log |

**Never match on company name.** Saudi commercial registrations repeat names across regions, and a wrong attach writes a bid into the wrong firm's history.

### M2 · An external supplier → is there a Moedatech account?

**Trigger:** three moments, not one — (a) on create/import of an `own` row, (b) nightly for rows still unmatched, (c) when an invited supplier signs up.
**Keys:** CR where the row has one, then the E.164 phone, then the email as a last resort.
**Endpoint needed:** `GET /agents/supplier-lookup?cr=…&phone=…&email=…` → `{ supplierId, matchedOn: "cr" | "phone" | "email" } | 404`. It must return **only an id and which key hit** — never a name, a store or a profile. A renter with a phone book must not be able to enumerate the platform, and the same rule makes CR the safer lookup: a CR is public on the firm's own paperwork, a phone is not.

| Case | Result |
|---|---|
| Match found, row is `own` | promote in place (decision 2): set `supplier_user_id`, `kind = "platform"`, stop using the stored name. Keep groups, vendor flag, `extra`. Profile notes *now on Moedatech* |
| Match found, but this company already has a `platform` row for that supplier | **merge**, do not promote — else the unique index rejects the write and the row silently stops updating. Keep the older row, union the groups, keep `vendor_registered = true` if either had it, append the `extra` under a prefixed key |
| `matchedOn: "email"` | **do not promote.** Raise it to the renter: *"Gulf Power Rentals may be on Moedatech — link them?"* Accepting promotes; ignoring changes nothing, and it is not asked again for 90 days |
| Row has no CR, no phone and no email | never matched. It stays `own` forever, which is correct — we have nothing to match on |
| CR says one account, phone says another | do nothing automatically. Raise it to the renter; an automatic merge here would join two real firms |
| Supplier deletes their account | the row does **not** demote. The bids and awards happened. Read the name from the last snapshot |
| Two rows in the company share a phone (legacy) | merge on the same rules, oldest wins |

**Both merges are idempotent and logged.** A renter who cannot explain why two rows became one will not trust the list again.

---

## Phase 1 — the row exists

### 1A · agents-backend

| # | Work |
|---|---|
| A1 | `renter_suppliers` — `id, company_id, created_by_user_id, supplier_user_id NULL, kind, vendor_registered, name, contact_name, email, phone_e164, cr_number, extra jsonb, source, created_at, updated_at`. Index `(company_id, updated_at DESC)`. `UNIQUE (company_id, supplier_user_id) WHERE supplier_user_id IS NOT NULL` and `UNIQUE (company_id, phone_e164) WHERE phone_e164 IS NOT NULL` and `UNIQUE (company_id, cr_number) WHERE cr_number IS NOT NULL` — the indexes ARE the dedupe rule; do not enforce it in application code where a race can slip past. **Email gets a plain index, never a unique one** — it is a fallback lookup (§M0), and two rows legitimately share one address |
| A2 | `GET /agents/renter-suppliers` — extend the existing read. Returns the roll-up per row **computed server-side**: `bidsApp`, `bidsLink`, `newBids`, `lastBidAt`, `rooms`, `awards`. If the web computes these, one page load fetches every bid of every supplier |
| A3 | `POST /agents/renter-suppliers` (one) · `POST …/bulk` (sheet) · `PATCH …/{id}` · `DELETE …/{id}`. `DELETE` removes the LINK only — bids, deal rooms and awards are untouched, and the response says so |
| A4 | `POST …/link` — `{ items: [{supplierId, vendorRegistered}] }`. An already-linked supplier is skipped, not an error |
| A5 | Phone normalization to E.164 and CR normalization (strip punctuation, keep leading zeros, store as text) on every write, server-side |

**Bulk is never all-or-nothing.** It returns `created[]`, `merged[]`, `rejected[{row, reason}]`. One bad row must not lose thirty-nine good ones.

### 1B · Web-App — contract & BFF

| # | Work | Files |
|---|---|---|
| B1 | Extend `RenterSupplier`: `contactName`, `email`, `phone`, `groups[]`, `extra`, `source`, `store`, `verified`, and the roll-up. **Extend, do not fork** — `AwardDialog` already imports this type | `src/lib/api/client.ts:1217` → move to `src/lib/contract/renter-suppliers.ts` |
| B2 | The write routes, all through `relayAsRenter` | `src/app/api/renter-suppliers/**` |
| B3 | Keep the empty-array-on-failure behaviour of `listRenterSuppliers`. An unreachable registry reads as *"you have no suppliers"*, not a crash | `client.ts` |

### 1C · Web-App — screen

| # | Work |
|---|---|
| C1 | The table: Supplier (name + `On Moedatech` badge + contact) · Vendor registration · Contact · Groups · Bids · row actions. Row and name open the profile; the bids cell opens the bids list |
| C2 | `Add from Moedatech` — the picker over `GET /stores`. Every tick registers as a vendor by default, with a per-row untick |
| C3 | `Add my own suppliers` — a table of blank rows, add as many as wanted, per-row vendor tick |
| C4 | The vendor toggle, optimistic: flips on click, reverts on failure with a toast. Nothing else on the row waits for the round trip |
| C5 | Pin the screen in `src/lib/uiPins.ts` + `docs/ui-pins.md` |

---

## Phase 2 — the list becomes usable

| # | Work |
|---|---|
| D1 | `groups text[]` on the row, plus `GET /agents/renter-suppliers/groups` for the menu counts. Flat labels — no hierarchy, no group table. A group with no members does not exist |
| D2 | Rename is one write across the company's rows; delete removes the label and **keeps every supplier**. The dialog says so before the red button |
| D3 | Sheet import — parse client-side (SheetJS), map columns, preview, then `POST …/bulk`. **Five mappable fields: company, contact, email, phone, CR number** — CR earns a real field rather than `extra` because it is the strongest matching key we have, and most renters' sheets already carry it. Every other column is kept under `extra` as it is. No schema imposed on the renter's own file |
| D4 | Matching §M1 and §M2, including the merge rules |
| D5 | The Suggested band, derived per §M1. Dismissal is per user in `localStorage` — not a write |

---

## Phase 3 — the history

| # | Work |
|---|---|
| E1 | `GET /agents/renter-suppliers/{id}` — the profile: bids (each with `via`, request, site, price, date), rooms, awards, sends |
| E2 | Company papers. **Only ever readable through a bid** — `GET /marketplace/bids/{bidId}/company-documents` derives the supplier from the bid and re-checks `canAccessRequest`. Never bid → no papers at all, and the panel says that rather than drawing five empty pills. Read from the most recent bid this renter can still access; if that access lapses, say so instead of presigning a dead URL |
| E3 | Papers render as pills: green when held, faint when not, amber inside 60 days of expiry, expiry in the title. The eye is drawn from `downloadUrl`, never from the source — the `companyPanelSource` fallback states presence with nothing to open, and `docRowActions` deliberately returns no controls for it (AC-69) |
| E4 | Awards from `projects/{id}/awards` joined on `supplierId`, as rows: equipment, units, project, dates, price, a way through to the project |
| E5 | `last_seen_bids_at` per (user, renter_supplier) — decision 3. `NEW` counts bids after it; opening the bids list writes it |
| E6 | The bids list: every bid, its channel badge, and `Open in the request →`. It is a route, not a record — nothing about a bid is decided from the suppliers list |

---

## Phase 4 — the outbound half

No mailer. No SES. No DNS. The renter's own client sends.

| # | Work |
|---|---|
| F1 | `POST /agents/requests/{id}/shares` — records a **declared share**: `{renterSupplierIds[], at}`. It is what the renter said they sent, never a delivery confirmation. Nothing in the UI may say "delivered" or "bounced" |
| F2 | The share dialog: recipients by group or individually → the request → an optional line → the message. Skipped-for-no-email is named BEFORE the send, with `Add email` inline on those rows |
| F3 | `mailto:` with recipients in **BCC** (decision 6), capped at 25. Past the cap, or where no mail handler exists, the fallback is `Copy the addresses` + `Copy the message` |
| F4 | Gmail never unfurls a pasted URL into a card. `copyBidLink` already puts the rich card on the clipboard and Gmail's composer keeps it on paste — so the dialog offers both *Open in your email app* and *Copy the message*. The body itself is plain text; `mailto:` cannot carry HTML |
| F5 | `Invite to Moedatech` — off-platform rows only, the App Store and Play links from `src/lib/config/store-links.ts`, the same text `CompanyHub.tsx:621` sends. Recorded on the row; when the supplier later signs up, §M2 promotes the row and the record reads *joined* |
| F6 | *Opened the link* stays real: the token page is server-rendered and sees the visit. No tracking pixel |

---

## What this feature deliberately does NOT do

- **It is not the supplier directory.** Stores is that, and Stores looks the same for every renter. This list starts empty and only holds rows the renter created.
- **It does not notify.** A list you open occasionally is a bad notifier; link submissions already arrive where bids arrive (`link-bids.ts` maps them into a `BidCard` shape for exactly that reason). The pulsing `NEW` is a courtesy, not the mechanism.
- **It does not decide anything about a bid.** Compare, negotiate and award happen in the request. Every bid row here is a way out to it.
- **It never writes to the supplier's account.** The vendor flag lives on the link and nowhere else; the supplier is not told, and another renter's view of the same firm does not change.

---

## Open items

- **P0-3** blocks §M2 only. Everything else ships without it.
- Send cap of 25 assumed, not confirmed.
- Rating from the survey feature (`surveys/{id}/respond`) on the profile — out of scope here; decide when surveys are re-enabled (`docs/surveys-disabled.md`).
