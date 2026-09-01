# What the backend still has to change

**Written for the backend developer**, after reading `backend-delivered.md` and wiring the web against
it. Everything in the delivery note that the web can consume is consumed — the list below is only what
is left.

Ordered by what blocks whom.

---

## 1. Run the migration — **this blocks everything**

`20260831220000_renter_suppliers` has never been applied on any stage. Until it is, every
`/agents/renter-suppliers*` endpoint answers 500 and the whole feature is dark: the list, the add, the
import, the groups, the profile, the shares, the invites, and the award (which now refuses a typed
name).

Nothing below matters until this runs. It is also the only item here that is not a code change.

**Done when:** `GET /agents/renter-suppliers?userId=<a real renter>` answers `200 []` rather than 500
on staging.

---

## 2. `channel` has no word for two of the four channels we send on

`shares.create` and `shares.invite` take `channel: z.enum(['email', 'whatsapp'])`.

The invite dialog offers four: **WhatsApp · e-mail · SMS · copy to clipboard**. All four send the same
body. Two of them can be recorded and two cannot, so today SMS and Copy leave no trace on the
supplier's history and the dialog has to say so out loud — which is honest, and worse than recording
them.

Writing an SMS as `"email"` would put a lie in an audit row, so the web will not do that.

**Ask:** widen to `z.enum(['email', 'whatsapp', 'sms', 'copy'])`.

`copy` is worth its own value rather than an `other`: it means *the renter took the words and sent
them somewhere we cannot see*, which is a different fact from a channel we know and different from a
send that failed.

**Done when:** `POST /agents/renter-suppliers/invites` with `channel: "sms"` returns 200 and the row
comes back on `sends[]` with that channel.

---

## 3. The supplier directory has no city and no verification mark

`GET /agents/suppliers` (S1) answers `id`, `first_name`, `last_name`, `company_name`. The web now
reads it for the *Add from Moedatech* picker — correctly, because it lists every account rather than
only the firms with a shopfront.

But a renter searching "Al" gets nine identical-looking rows and no way to tell which one is his. The
store list had `city` and `isVerified` and the directory does not, so the picker shows neither: half a
column, filled in only for the firms that happen to have a store, is worse than no column.

**Ask:** add `city` and `isVerified` to each row (and `hasStore`, if it is free — it lets the picker
sort the recognisable ones first without hiding anyone).

**Done when:** a directory row carries the same city and verification mark the store list already
shows for a supplier who has both.

---

## 4. `extendable` is not on the public bid-form payload

The bid-link card reads `GET /public/bid-form/{token}` and draws the request's terms from it. The one
field it cannot show is `extendable`, so a month-long request that the renter marked extendable reads
as a flat month — and a supplier prices a month.

**Ask:** add `projectTerms.extendable: boolean` to `GET /public/bid-form/{token}`.

Only if the owner wants that word on the card. It is the last card field behind the backend; nothing
else on it is missing.

**Done when:** the payload carries the flag and the card reads *"1 month & extendable"*.

---

## 5. Two open decisions the backend has already ruled on — confirm and close

Neither is web work. Both are in `backend-delivered.md §1` and neither has been put to the owner:

- **BE-12, merging two supplier rows: not built.** The stated reason is that one phone per row makes a
  lossless merge impossible. The consequence a renter meets: an import that hits
  `SAME_NAME_DIFFERENT_CONTACT` creates a second row for what may be one firm, and his only remedy is
  to delete one and lose its history. The import screen now says this before it writes.
- **BE-20, revealing a platform supplier's own contact behind the vendor flag: provisional.** The web
  is built so it costs nothing either way — a row with no contact reads *not set · add*. But until it
  is switched on, a renter who adds a firm from the directory gets a row he cannot e-mail, which is
  most of the point of adding it.

---

## What is NOT asked for, and why

So nobody builds these on spec:

- **A per-user seen state.** The unseen dot is local (`src/lib/supplierSeen.ts`), exactly as the
  delivery note directs. `rollup.newBids` stays a 24-hour window and the two deliberately disagree:
  the count is a fact about the bid, the dot is a fact about the reader.
- **A dismiss-suggestion endpoint.** Client-side, per user, per the ticket.
- **`opened` on a share.** Every recipient of one request gets the same link, so the page sees a visit
  and never whose. The profile says *you shared this with them*, never *they opened it*.
- **A CR number anywhere.** Removed from add, import and edit. 3 of 1,489 supplier accounts carry one.
- **Structured fields on `/public/bid-form/{token}/preview`.** The card reads the full payload instead.
  It bumps `opened_count` on every unfurl, which the owner accepted on 2026-09-01 because nothing reads
  that number. **If it ever becomes something a renter is shown, this comes back** — the fix is to move
  the fields onto the read-only preview, and `fetchBidForm` in `src/lib/api/bidPreview.ts` is the only
  thing that would change.

---

## One thing the web had wrong, now fixed — no action needed

`DELETE /agents/renter-suppliers/groups/{name}` was being called as `/groups?name=`. It 404'd, which a
renter reads as *it broke*. The contract test had the route waived as absent, so the waiver was
describing this app's mistake rather than a missing endpoint. Corrected here; the endpoint was always
right.
