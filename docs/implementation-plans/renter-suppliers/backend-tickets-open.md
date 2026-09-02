# My Suppliers — the tickets still open

**For the backend developer.** Everything else in this feature is built, deployed and verified: the
web ran 37 end-to-end checks against `kge3xspt36` on 2026-09-02 and all of them pass. These two are
what is left.

Each carries the probe that found it, so nothing here has to be taken on trust.

---

## SUP-BE-20 · A linked supplier's contact is never returned

**Status:** the only thing standing between *Add from Moedatech* and *Send to my suppliers*.
**Decision needed from the owner first — see «The decision» below. Do not build before that.**

### What happens now

`POST /agents/renter-suppliers/link` creates the row. `GET /agents/renter-suppliers/{id}` returns it
with `email: null` and `phone: null` — **whatever the supplier's own account holds, and whatever the
vendor flag is set to.**

Probed on 2026-09-02, renter `userId=46`, supplier `313`, whose account carries a real address:

```
GET /agents/users/313          →  users.email = m7a7ooo@gmail.com

link { supplierId: 313, vendorRegistered: true }
GET /agents/renter-suppliers/{id}
  →  { kind: "platform", vendorRegistered: true,  email: null, phone: null }

link { supplierId: 313, vendorRegistered: false }
  →  { kind: "platform", vendorRegistered: false, email: null, phone: null }
```

Identical. The flag changes nothing, so this is not a gate that is switched off — the fields are
simply never populated for a `platform` row.

### It is worse than a missing field: the row cannot be edited at all

Found in UAT on 2026-09-02. `PATCH /agents/renter-suppliers/{id}` on a linked row answers:

```
400  MISSING_CONTACT
     "A supplier must keep an email or a phone number"
```

The rule is right in itself. But **every linked row has neither**, because this ticket is what would
give it one — so the guard refuses an edit to a row whose contact the backend is itself withholding.
The renter meets it by pressing the vendor toggle and reading a flat failure against a flag that has
nothing to do with contacts.

So a supplier added from the directory is **frozen**: no flag, no groups, no contact, nothing. The
web now names the reason instead of saying "that did not save", which is the best it can do from
here.

⚠️ **`contactName` belongs in this ticket too.** It is the same family as the e-mail and the phone —
the person at the firm, held on the account — and it comes back null for the same reason.

### Why it matters

The web's share sheet has one rule, and it is deliberate:

```ts
// src/lib/contract/renter-suppliers.ts
export const canBeEmailed = (s: RenterSupplier): boolean => !!s.email?.trim();
```

**No e-mail, no send.** So a renter who adds a firm through *Add from Moedatech* gets a row that
*Send to my suppliers* will not send to — while Moedatech is holding that firm's address. The two
halves of the feature do not connect.

Nothing is silent about it: the share panel names who it is skipping *before* the send. It is not a
data-loss bug. It is the picker producing rows the sharer cannot use.

### The decision — the owner's, not the backend's

Turning this on means **every renter who adds a firm from the directory sees that firm's contact
details.** The supplier is not asked and is not told. That is a privacy position, and it should be
taken deliberately rather than arrived at.

The owner ruled on 2026-09-02: *"a user can add from Moedatech without marking vendor, same
behaviour as adding externally, and in both ways the contact info will appear after adding."*

So the flag is **not** the gate. Written up here so the ruling is on the record before code follows it.

### What to build

On a row whose `kind` is `platform`, populate `email` and `phone` from the linked account, with **no
condition on `vendorRegistered`**.

The renter's own entry still wins where he has made one: he may have a different address for the
person he actually deals with, and that is the one he means.

```jsonc
// GET /agents/renter-suppliers and /agents/renter-suppliers/{id}
{
  "kind": "platform",
  "supplierId": 313,
  "vendorRegistered": false,          // no longer relevant to the fields below
  "email": "m7a7ooo@gmail.com",       // the account's, unless the renter typed his own
  "phone": "+966559107772",
  "contactName": "Mohammed"           // the person on the account, same rule
}
```

### What NOT to do

- **Do not gate it on `vendorRegistered`.** The flag means "a firm I have registered as a vendor" and
  nothing else now; the web stopped forcing it on a directory add in `c3d7b84`.
- **Do not invent a contact.** Null stays null — the web renders *not set · add* and the renter types
  one, which is a working path and must keep working.

### Done when

1. `GET /agents/renter-suppliers/{id}` for a freshly linked supplier whose account has an e-mail
   returns that e-mail, with the vendor flag off.
2. `PATCH` on that same row succeeds — today it is refused by `MISSING_CONTACT`, which is the guard
   firing on the very gap this ticket closes.

### One thing to expect

Measured by the backend's own note: **1,489 of 1,489 supplier accounts carry a phone, 594 carry an
e-mail.** So roughly six in ten linked rows will still come back without an address even after this
ships, and the web's inline *Add e-mail* stays the fallback. That is fine — it just means this is not
the last word on reaching a supplier.

---

## SUP-BE-21 · A closed request loses its city and its dates

**Status:** small, self-contained, no decision needed.

### What happens now

`GET /public/bid-form/{token}/preview` builds a title and a description. On a request that has
closed, `buildPreviewCopy` takes an early return and **replaces** the description:

```ts
// getBidFormPreview.ts, the !accepting branch
description: clamp(
  ar ? 'لم يعد هذا الطلب يقبل العروض.' : 'This request is no longer accepting bids.',
  DESC_MAX,
)
```

Verified live against the owner's own token (`REQ-00233`, 2026-09-01):

```
title        REQ-00233 — Vacuum Robot rental, 3 units
description  This request is no longer accepting bids.
```

### Why it matters

Someone forwards a shared link a week after the request closed. The equipment and the reference
survive, because they are in the title. **The city and the dates are gone**, so the reader cannot tell
which job it was — which is the one thing a forwarded link is for.

### What to build

Append rather than replace. Every value is already computed a few lines above the early return:

```ts
// what it needs to be
description: clamp([city, length, 'No longer accepting bids'].filter(Boolean).join(' · '), DESC_MAX)
```

One line. The link itself still refuses the bid, which is where that belongs — the page has room to
say it properly and the card does not.

### Optional, only if you want the terms too

`getBidForm` early-returns an empty shell for a closed request (`getBidForm.ts:85`) — no
`projectTerms`, no `items`. Returning them and letting `status: "closed"` do the work would let the
card carry the terms as well. **Not asked for**: a closed request showing full terms reads like an
invitation with the door locked, and the description fix above is what actually identifies the job.

### Done when

The preview's description for a closed token still names the city and the dates.

---

## SUP-BE-22 · A matched row counts its bids and cannot list them

**Status:** the renter sees "9 bids", opens them, and is told there are none.
**Found in UAT, 2026-09-02.** One line, self-contained, no decision needed.

### What happens now

Renter `userId=46`, row `ca034e95…`:

```
GET /agents/renter-suppliers        →  rollup: { bidsApp: 9, bidsLink: 0 }
GET /agents/renter-suppliers/{id}   →  bids: []
```

The row itself says how it got there:

```jsonc
{ "name": "yo", "kind": "own", "source": "sheet",
  "phone": "+966502165558",
  "supplierId": 2544, "onMoedatech": true, "matchedOn": "phone" }
```

An imported row whose phone MATCHES account 2544. The match is recomputed on every read and is not
stored, so the row's `supplier_user_id` column is null — nothing was ever linked.

### Why

The two reads resolve that account differently.

`renter-supplier-rollup.service.ts:149` — the COUNT falls back to the match:

```ts
const accountOf = (r) => r.supplierUserId ?? resolved?.get(r.id)?.supplierId ?? null;
const supplierIds = [...new Set(rows.map(accountOf).filter(...))];
```

`renter-supplier-profile.service.ts:122` — the LIST reads the stored column alone:

```ts
row.supplierUserId !== null
  ? prisma.bid.findMany({ where: { supplierId: row.supplierUserId, ... } })
  : Promise.resolve([])          // ← an imported row takes THIS branch
```

So on a matched row the profile does not fetch the wrong bids. **It never runs the query at all.**

### How much of a renter's list this covers

Every supplier he typed in or imported whose phone or e-mail matches a real account — which is the
common case, and the case `onMoedatech` and `matchedOn` exist to serve. Only a row added through *Add
from Moedatech*, where `supplier_user_id` is genuinely stored, lists its bids today.

Off-platform bids are unaffected and agree exactly, because both sides call the same
`readLinkSubmissionsForScope`. The row `gg` on the same account reports `bidsLink: 2` and lists two.

### What to build

Give the profile the roll-up's fallback — resolve the account the same way before deciding whether
there is anything to fetch. Best as one shared `accountOf`, since two copies of that resolution is
what produced this.

### Done when

For every row, `bids[].filter(via === "app").length` equals `rollup.bidsApp`. The row above lists nine.

### Worth checking while you are there

`rollup.bidsLink` counts SUBMISSIONS and `bids[]` carries one line per request ITEM, so those two are
**meant** to differ: a submission covering two machines is `bidsLink: 1` and two rows. The web knows
this. Only the app lane is wrong.

---

## Please do NOT build these

Raised earlier, examined, and dropped. Written down so nobody picks them up from an old note.

**The `supplier-lookup` 500.** An unknown `userId` throws instead of answering 404 — the handler
writes an audit row and `audit_logs.user_id` is a foreign key to `users.id` (`schema.prisma:529`), so
an id that does not exist violates it. **Not worth a ticket:** no renter can reach it (`relayAsRenter`
always sends a real session id), and the enumeration angle is worthless because anyone who can call it
already holds the service token, and `/agents/users/lookup` hands them the whole record from a phone
number. Fix it next time you are in that file, for the sake of the logs.

**Merging two supplier rows (BE-12).** Left unbuilt on the grounds that one phone per row makes a
lossless merge impossible. That reasoning holds, and the consequence is smaller than it was written
up as: off-platform bids are matched fresh on every read, so deleting a duplicate does not destroy its
history — the bids reappear as suggestions. A tidy-up annoyance, not data loss.

---

## SUP-BE-23 — a share e-mail that carries the card, from the renter's own address

**Owner, 2026-09-02:** *"i want it from his email not us"* and *"i dont want user to copy past i want
it when share it directly to has preview."*

### The constraint, stated once

The web opens the renter's own compose window by URL. `?body=` is `text/plain` by specification —
Gmail's `view=cm`, Outlook's `deeplink/compose`, and `mailto:` (RFC 6068) alike. **No compose URL
accepts HTML.** So no browser-only change can put a card in that message. The card currently rides
the clipboard and needs one Ctrl+V, which the owner has rejected.

Getting the card in means WRITING INTO the mailbox rather than opening a window at it. Two ways.

### Option A — OAuth mail draft (recommended)

Create an HTML draft in the renter's own mailbox; the web opens it for him to review and send.

- **Microsoft Graph** — `POST /me/messages` with `body.contentType: "HTML"`, scope
  `Mail.ReadWrite`. Ordinary consent; admin consent for tenants. **Cheap.**
- **Gmail API** — `users.drafts.create` with a base64url MIME body, scope `gmail.compose`. This is a
  Google **restricted** scope: production access needs a paid third-party security assessment
  (CASA), which takes months. **Expensive.**

Backend owns: the OAuth handshake, refresh-token storage per renter, and a
`POST /agents/requests/{id}/share-draft` taking `{ supplierIds[], subject, html, text }` that creates
the draft and answers its id/webLink. The web already renders the HTML (`shareMessageHtml`) and
already records the share.

**Recommendation: ship Microsoft first.** It is a fraction of the work, and this market's business
mailboxes are heavily Microsoft 365. Gmail renters keep the paste until CASA is done.

### Option B — domain-verified SES

The renter's company verifies its domain with us (one DNS record); SES then sends legitimately as
`bandar@zahid.sa`. Truly from him, no OAuth, no paste.

Backend owns: a domain-verification flow per company, DKIM records, and a `share-email` route using
the existing `ses.service.ts` (`sendEmail({ to, subject, html, from })` is already there).

The catch is that it is **per company, not per user** — a renter cannot self-serve without control of
his DNS, so it fits verified companies and leaves everyone else on the paste.

### A and B both send from his address. They differ over his Sent folder

| | A · OAuth draft | B · Verified domain |
| --- | --- | --- |
| The `From` a supplier sees | his address | his address |
| Who actually sends it | **his mailbox** | our servers, DKIM-signed for his domain |
| It appears in his **Sent** folder | **yes** | no, unless we BCC him |
| He reviews it before it goes | yes — it opens as a draft | no, it just sends |
| Setup | one consent, per person | one DNS record, per company |
| A renter on a personal `@gmail.com` | works | **impossible** — he owns no domain |
| Delivery + bounce reporting | no | **yes** |

A is the more literal reading of *"from his email"*: his account sends it, and he finds it in Sent
next month when a supplier disputes what was asked. B is his address on our envelope — legitimate,
but the message never touches his mailbox, so it is invisible to him afterwards unless we BCC him,
and that BCC is then the only record he has.

**Neither is wrong. Pick on this question:** does the renter need to find the e-mail in his own Sent
folder later? If yes, A. If what matters more is knowing the e-mail was actually delivered, B.

### Not viable, for the record

- **SES from `notifications@moedatech.net` with `Reply-To` the renter.** What most platforms do, and
  what the owner explicitly ruled out: it is not his address.
- **An `.eml` download.** Real, but needs a configured desktop mail client — the exact failure
  `composeEmail.ts` exists to avoid — and download-then-open is worse than one paste.

### Done when

A renter presses Send with E-mail chosen and a message **with the card in it** is waiting in his own
Sent or Drafts folder, from his own address, with no clipboard step.

---

## Closed since the last list — no action

- **Deploy, and the migration.** Every route answers 401 without a token; the nonsense control 404s.
- **The `channel` enum.** `email`, `whatsapp`, `sms` and `copy` all accepted; `other` refused.
- **City and the verified mark on the directory.** `GET /agents/suppliers` already answers
  `{ id, name, company_name, city, is_verified, has_store }` — the web was hiding them.
- **`extendable`.** `getBidForm` has returned `projectTerms.extendable` since 2026-09-01. The web was
  never reading the key; fixed in `c3d7b84`. Nothing owed here.
- **`DELETE /renter-suppliers/groups/{name}`.** The path was always right; the web was calling it as a
  query and getting a 404 it read as "it broke".
