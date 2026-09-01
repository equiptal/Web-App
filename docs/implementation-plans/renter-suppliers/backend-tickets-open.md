# My Suppliers — the two tickets still open

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
  "phone": "+966559107772"
}
```

### What NOT to do

- **Do not gate it on `vendorRegistered`.** The flag means "a firm I have registered as a vendor" and
  nothing else now; the web stopped forcing it on a directory add in `c3d7b84`.
- **Do not invent a contact.** Null stays null — the web renders *not set · add* and the renter types
  one, which is a working path and must keep working.

### Done when

`GET /agents/renter-suppliers/{id}` for a freshly linked supplier whose account has an e-mail returns
that e-mail, with the vendor flag off.

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

## Closed since the last list — no action

- **Deploy, and the migration.** Every route answers 401 without a token; the nonsense control 404s.
- **The `channel` enum.** `email`, `whatsapp`, `sms` and `copy` all accepted; `other` refused.
- **City and the verified mark on the directory.** `GET /agents/suppliers` already answers
  `{ id, name, company_name, city, is_verified, has_store }` — the web was hiding them.
- **`extendable`.** `getBidForm` has returned `projectTerms.extendable` since 2026-09-01. The web was
  never reading the key; fixed in `c3d7b84`. Nothing owed here.
- **`DELETE /renter-suppliers/groups/{name}`.** The path was always right; the web was calling it as a
  query and getting a 404 it read as "it broke".
