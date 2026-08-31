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
- **P0-2b** — **`StoreCard.id` is a STORE, not a supplier.** The picker in C2 browses `GET /stores`, but the link row needs a `supplierId`. `StoreDetail` carries `supplierName` — a name, not an id. Confirm the stores payload exposes the supplier's id; if it does not, either it is added there or the picker reads a different list. **This blocks A4 and C2**, which is Phase 1's main way in, so it is settled before any code and not discovered during it.
- **P0-2c** — **the email card does not render in production.** Get a prod bid token, establish which of the two faults it is (§T1), and fix it. Everything in Phase 4 sits on this card; shipping a template that arrives broken is worse than the plain line we send today.
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

## T · The two templates

**Neither action is new. Both exist, each in a reduced form, and each is missing the same two things:
recipients and a template.**

| Today | Where | What is missing |
|---|---|---|
| Share a request | `ShareForBidsSheet.tsx` — copy the link, or open WhatsApp / Email / SMS | the recipients are blank and the body is one sentence. The renter types the rest, every time |
| Invite to the app | `BidCards.tsx:550` — one button on an off-platform bid card, **WhatsApp only**, at the number that bid | it reaches one supplier from one bid. There is no email flavour, and it cannot be sent to a group |

So Phase 4 does not build sending. It builds **who** and **what it says**.

### T1 · Share a request

Says: this renter wants a price on this equipment, at this site, for these dates, and here is where to
answer. The card is not new either — `bidCardHtml.ts` already renders it, and its own header says it
mirrors `renderBidLinkCard()` in `Moedatech-App/apps/backend-admin/src/services/email/bid-link-card.ts`.
Both come from the approved `email-link-preview.html`.


#### The template, and where it came from

A real one, sent by a renter on 18 Aug 2026 (owner-supplied):

> **Subject:** 100005706 Tower Light Diesel Project In rRyadh
> `https://web.moedatech.net/bid/shibh-al-jazeera-contracting-6ce618cf-…`
> #urgent
> PLEASE MENTION THE MODEL YEAR AND BRAND NAME OF THE EQUIPMENT.
> OTHERS TERMS : DIESEL Is Sajco Scope · Mob by & demob By Supplier · Duration : 1Month & extendable
> Thank you & Best Wishes — Mohammad Irfan Aazam, Shibh AL Jazira Contracting Company

**Every hand-typed line in it is already a field on the request.** He is retyping his own data, in
capitals, at 17:37, and any of it can be wrong by the time he sends it:

| What he typed | The field it already is |
|---|---|
| `DIESEL Is Sajco Scope` | `fuelResponsibility: "me"` + `fuelType: "diesel"` (`draft.ts:86,168`) |
| `Mob by & demob By Supplier` | `deliveryToSite` / return party = supplier (`draft.ts:84`) |
| `Duration : 1Month & extendable` | rental basis + dates + `extendable` (`draft.ts:54`) |
| `PLEASE MENTION THE MODEL YEAR AND BRAND` | the `year` term, and the bid form's own make/model fields — **asked structurally, so it comes back as data rather than prose** |
| `#urgent` | urgency, which the web derives at submit |
| `100005706` | HIS reference, not ours. Ours is `RFQ-NNNNN` (`requestCodeOf`, `requests.ts:384`) |

So T1 is not a nicer letter. It is the end of typing the request out twice.

**Subject** — ours first, his in front of it when he fills the optional *your reference*:

```
{rfqCode} · {equipment} ×{units} — {city}
{yourReference} · {rfqCode} · {equipment} ×{units} — {city}      ← when set
[Urgent] {rfqCode} · {equipment} ×{units} — {city}               ← when the request is urgent
```

`RFQ-40218 · Tower light ×6 — Riyadh`. His suppliers know him by his own number, not by ours, which
is why *your reference* exists at all — one input, remembered per company.

**Body — the card, and two names under it. Nothing else.**

No opening sentence. *"{renterCompany} is requesting a price for the equipment below"* says what the
card already says, one line above the card that says it, and a supplier who has read one of these has
read them all.

So the mail IS the card, and the terms move inside it:

```
        ┌──────────────────────────────────────────────────────────┐
        │  TOWER LIGHT (DIESEL) ×6                                 │
        │  Riyadh — Al Nakheel · 18 Aug → 17 Sep 2026 · extendable │
        │                                                          │
        │  Fuel: Shibh Al Jazira · Mob & demob: supplier           │
        │  Payment: 30 days                                        │
        │                                                          │
        │  [ Submit your bid ]        Bidding closes 21 Aug 2026   │
        │  web.moedatech.net                                       │
        └──────────────────────────────────────────────────────────┘

Shibh Al Jazira Contracting Company
Zahid Tractor

{the renter's own note — optional, free text}
```

**Which three terms.** The ones his real email carried, and no others: **fuel scope**, **mobilisation
and demobilisation**, **payment**. Duration and extendable ride with the dates on the second line,
because they are the same fact. Everything else — hours, operator, nationality, certificates, night
shift, overtime, breakdown SLA, maintenance — is a question the bid form already asks structurally,
and gets back as data instead of prose.

**A term appears only when the request carries it.** Two of three, or one. If none is set, the terms
line is not drawn and the card is equipment, place, dates and the button.

**The two names under the card** are who is asking and who is being asked — the renter's company, then
the supplier's. It is the only part of the mail that changes per recipient, which is also the check
that the right message went to the right firm.

> **Confirm:** if you meant the supplier's name as the greeting rather than a line under the card, it
> moves above and the renter's name becomes the sign-off. One line either way.

### The card has to grow

This is real work, not copy. Today the card is title, description, image band and domain — the shape
in `email-link-preview.html`, rendered twice: `bidCardHtml.ts` for the clipboard and
`renderBidLinkCard()` in `backend-admin` for app-sent mail, with the image itself coming from
`src/app/bid/[token]/og`.

| | Change |
|---|---|
| `bidCardHtml.ts` | a terms line under the description; **inline styles only** — a `<style>` block is stripped by most clients |
| `renderBidLinkCard()` (`backend-admin`) | the same, and the two stay mirrors: the file header already says they are |
| the `og` route | the image is 880×320 and it is what WhatsApp and Apple Mail show. Two short lines fit; a table does not. **Whatever the image cannot hold must also be in the HTML card**, or the same link says two different things in two clients |
| `fetchBidPreview` | must return the three terms, or the card renders them from nothing |

**And it lands on top of a card that does not render in production at all** (`SUP-T02`). Fix that
first; extending a card nobody receives proves nothing.

**The chase.** His real email carried `#urgent`, which means chasing is part of the job. A second body
for the same request, chosen when a share record already exists for that supplier:

```
Hello,

I sent you {rfqCode} · {equipment} ×{units} at {city} on {sentDate}.
Bidding closes {closesDate} — the link is still open.

        [ Submit your bid ]
```

No new card, no repeated facts block: he already has them. One line, the deadline, the link.

**But it does not render in production today (owner, 2026-08-31), and that is fixed before anything
here ships.** Sending a template that arrives broken is worse than sending a plain line. Two different
faults wear the same symptom, so establish which before touching code:

| If the fault is | The symptom | Where to look |
|---|---|---|
| The **app-sent email** shows no card | a mail that arrived with a bare link where the card should be | `bid-link-card.ts` in `backend-admin` — inlined CSS (most clients strip `<style>`), the image host, and whether the sender pipeline HTML-escapes the body |
| The **link preview** does not unfurl | WhatsApp / Apple Mail / Outlook showing a bare URL | `generateMetadata` in `src/app/bid/[token]/page.tsx`, the `og` route beside it, whether `fetchBidPreview` answers for a production token, and `metadataBase` — that exact fault was already found and fixed once on staging, where prod's canonical was being followed and answering with the generic site card |

**A prod token to test with is the first thing needed** — neither fault is diagnosable from staging.

### T2 · Invite to Moedatech

Says: you already work with this renter, join and their requests reach you in the app. Today it is one
plain line — `t.workspace.inviteMessage`, ending at `https://moedatech.net`. It needs the same
treatment as T1: a card of its own, and the App Store / Play links from `store-links.ts`.


#### The template

**It is sent from the renter's own WhatsApp or mailbox, so it speaks in his voice: MY requests, not
theirs.** `t.workspace.inviteMessage` already does this — *"I received your bid through Moedatech… you'll
see my requests directly"* — and T2 keeps it. A supplier reading a message from a man he knows, written
about that man in the third person, reads a mass mailing.

**Email — subject:** `Join me on Moedatech — {renterCompany}`

```
Hello {supplierContact, else supplierCompany},

I'm {renterContact} from {renterCompany} — we already work together.

I send my equipment requests through Moedatech. Join and my requests reach
you directly: you see the site, the dates and the units, and you bid with
your own store, your fleet and your documents in one place.

        [ Get the app ]     → linktr.ee/moedatech   (→ moedatech.net/get?ref=… later)

Joining is free.

{renterContact}
{renterCompany}
```

**WhatsApp — one message, one link.** No greeting block, no signature: WhatsApp already shows who
sent it.

```
Hello {supplierCompany} — {renterContact} from {renterCompany}.

I send my equipment requests through Moedatech. Join and my requests reach you
directly, and you bid with your own store, your fleet and your documents in
one place.

linktr.ee/moedatech
```

**Arabic**, same order, right-to-left, numbers and the URL left-to-right:

> **الموضوع:** انضم إليّ على مويداتك — {renterCompany}
>
> مرحباً {supplierCompany}،
> أنا {renterContact} من {renterCompany} — نتعامل معاً بالفعل.
> أرسل طلبات معداتي عبر مويداتك. انضم لتصلك طلباتي مباشرة: ترى الموقع والتواريخ والعدد، وتقدّم عرضك
> بمتجرك وأسطولك ومستنداتك في مكان واحد.
> [ حمّل التطبيق ] · الانضمام مجاني.

#### The second body — for a supplier who already bid through the link

Chosen automatically, because the app knows they did. Same voice, and it names something the supplier
actually did rather than something the renter wants:

```
Hello {supplierCompany} — you sent me a bid on {equipment} through a shared form.

Join Moedatech and my next request reaches you in the app, with your own store,
your fleet and your documents in one place — no form to fill in each time.

        [ Get the app ]     → linktr.ee/moedatech   (→ moedatech.net/get?ref=… later)
```

> مرحباً {supplierCompany} — أرسلت لي عرضاً على {equipment} عبر نموذج مشارَك.
> انضم إلى مويداتك ليصلك طلبي القادم داخل التطبيق، بمتجرك وأسطولك ومستنداتك في مكان واحد — بلا نموذج
> في كل مرة.

#### What T2 must never say

- **Not "{renterCompany} invited you"** — he is the sender; naming himself in the third person is how
  a mailshot reads.
- **No pitch about Moedatech.** The supplier is not being sold a platform; he is being told where his
  customer's work now arrives. One sentence of benefit, and it is the renter's requests.
- **No deadline, no urgency, no discount.** An invitation that pressures reads as a scam, and it is
  arriving from a real business relationship that is worth more than a conversion.

**T2 carries ONE link, not two.** Two store URLs side by side read acceptably in an email as badges,
and badly in WhatsApp, where two raw links look like spam and exactly one of them is relevant to the
person reading.

**Today that link is `https://linktr.ee/moedatech`** — it exists, it is where suppliers are already
sent, and Phase 4 ships against it. Not a hypothetical; a live page owned by marketing.

Two things it cannot do, both of which cost us something real:

| Cost | What it means here |
|---|---|
| **The `?ref` token dies at the door** | Linktree will not carry a query parameter through to the store, so a signup cannot be tied back to the invitation that caused it. §M2 falls back to matching the new account by phone, hours later, on the nightly pass — instead of knowing with certainty the moment they join |
| **The preview card is Linktree's** | the invitation unfurls as a Linktree profile beside a request that unfurls as our own card. The two messages from the same renter, minutes apart, look like they came from different companies |

**So: ship on the Linktree, and replace it with `moedatech.net/get` when marketing can.** `/get` is a
user-agent redirect and a small page — iOS to the App Store, Android to Play, desktop to both with a
QR — carrying its own Open Graph tags and passing `?ref={inviteToken}` through. It is an afternoon of
work on the marketing site, and it buys back both rows of that table. **Nothing in Phase 4 blocks on
it**: the link is one constant, and swapping it changes one string.

**The `inviteMessage` we send today already points at `moedatech.net`, not the Linktree**
(`en.ts:1471`). Whichever link wins, the two paths must agree — a supplier invited from a bid card and
the same supplier invited from the suppliers list should not land in two different places.

### T3 · How either one looks good in an email

Three routes, and they are not alternatives so much as a ladder:

| Route | Looks like | Works in |
|---|---|---|
| **Server-sent HTML** | the real card, laid out | everywhere. **See the finding below** |
| **Rich clipboard** — `copyBidLink` writes `text/html` AND `text/plain` at once | the real card when pasted into a composer | Gmail, Outlook web, Word, Notion. The plain flavour goes to WhatsApp and SMS, which unfurl it themselves |
| **`mailto:` body** | plain text, and the recipient's own client unfurls the link | WhatsApp, Apple Mail, Outlook, Slack. **Never Gmail** — Gmail does not fetch a pasted URL, by design |

Decision 5 puts us on rungs two and three: the dialog offers *Open in your email app* (mailto, plain,
BCC) and *Copy the message* (rich, for pasting into Gmail). T2 needs its own `copyInviteMessage`
sibling — the same two-flavour clipboard write, different content.

**The finding that may reopen decision 5.** `Moedatech-App/apps/backend-admin` has an email service,
and it already renders this exact card into app-sent mail. So "we have no mailer" was wrong: server-
sent HTML is available without new infrastructure, and it is the only route that looks right in every
client without asking the renter to paste anything. What it costs is the thing you chose against — the
mail no longer comes from the renter's own address. Worth one conversation before Phase 4 starts; the
plan below assumes decision 5 stands.

---

## Phase 1 — the row exists

### 1A · agents-backend

| # | Work |
|---|---|
| A1 | `renter_suppliers` — `id, company_id, created_by_user_id, supplier_user_id NULL, kind, vendor_registered, name, contact_name, email, phone_e164, cr_number, extra jsonb, source, created_at, updated_at`. Index `(company_id, updated_at DESC)`. `UNIQUE (company_id, supplier_user_id) WHERE supplier_user_id IS NOT NULL` and `UNIQUE (company_id, phone_e164) WHERE phone_e164 IS NOT NULL` and `UNIQUE (company_id, cr_number) WHERE cr_number IS NOT NULL` — the indexes ARE the dedupe rule; do not enforce it in application code where a race can slip past. **Email gets a plain index, never a unique one** — it is a fallback lookup (§M0), and two rows legitimately share one address |
| A2 | `GET /agents/renter-suppliers` — extend the existing read. Returns the roll-up per row **computed server-side**: `bidsApp`, `bidsLink`, `lastBidAt`, `rooms`, `awards`. If the web computes these, one page load fetches every bid of every supplier. **`newBids` is NOT here**: it is per user (decision 3) and needs `last_seen_bids_at`, which lands in Phase 3 (E5). Phase 1 ships the counts without the badge — a count is true on its own; a "new" count without a seen-state would be a lie |
| A3 | `POST /agents/renter-suppliers` (one) · `POST …/bulk` (sheet) · `PATCH …/{id}` · `DELETE …/{id}`. `DELETE` removes the LINK only — bids, deal rooms and awards are untouched, and the response says so |
| A4 | `POST …/link` — `{ items: [{supplierId, vendorRegistered}] }`. An already-linked supplier is skipped, not an error |
| A5 | Phone normalization to E.164 and CR normalization (strip punctuation, keep leading zeros, store as text) on every write, server-side |

**Bulk is never all-or-nothing.** It returns `created[]`, `merged[]`, `rejected[{row, reason}]`. One bad row must not lose thirty-nine good ones.

**And bulk has a ceiling: 500 rows, 2 MB.** Past it the request is refused with the count, not truncated — a silent truncation means a renter believes they imported a file they did not. The web enforces the same numbers before uploading so the refusal is instant, and the parse happens client-side anyway (D3). A renter with more than 500 suppliers splits the file, and we will hear about it long before that is common.

### 1B · Web-App — contract & BFF

| # | Work | Files |
|---|---|---|
| B1 | Extend `RenterSupplier`: `contactName`, `email`, `phone`, `groups[]`, `extra`, `source`, `store`, `verified`, and the roll-up. **Extend, do not fork** — `AwardDialog` already imports this type | `src/lib/api/client.ts:1217` → move to `src/lib/contract/renter-suppliers.ts` |
| B2 | The write routes, all through `relayAsRenter` | `src/app/api/renter-suppliers/**` |
| B3 | Keep the empty-array-on-failure behaviour of `listRenterSuppliers`. An unreachable registry reads as *"you have no suppliers"*, not a crash | `client.ts` |

### 1C · Web-App — screen

| # | Work |
|---|---|
| C1 | The table: Supplier (name + `On Moedatech` badge + contact) · Vendor registration · Contact · Groups · Bids · row actions. Row and name open the profile; the bids cell opens the bids list. The `NEW` badge is built but stays dark until E5 gives it a seen-state |
| C2 | `Add from Moedatech` — the picker over `GET /stores`, **linking on the supplier id that payload must carry** (P0-2b). Every tick registers as a vendor by default, with a per-row untick |
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
| E1 | `GET /agents/renter-suppliers/{id}` — the profile: bids (each with `via`, request, site, price, date), rooms, awards. **Sends are not in Phase 3**: nothing writes a share record until F1. Ship the profile without the *What you sent them* section rather than with an always-empty one — an empty section reads as "we sent nothing", which is a different claim from "we do not record this yet" |
| E2 | Company papers. **Only ever readable through a bid** — `GET /marketplace/bids/{bidId}/company-documents` derives the supplier from the bid and re-checks `canAccessRequest`. Never bid → no papers at all, and the panel says that rather than drawing five empty pills. Read from the most recent bid this renter can still access; if that access lapses, say so instead of presigning a dead URL |
| E3 | Papers render as pills: green when held, faint when not, amber inside 60 days of expiry, expiry in the title. The eye is drawn from `downloadUrl`, never from the source — the `companyPanelSource` fallback states presence with nothing to open, and `docRowActions` deliberately returns no controls for it (AC-69) |
| E4 | Awards from `projects/{id}/awards` joined on `supplierId`, as rows: equipment, units, project, dates, price, a way through to the project |
| E5 | `last_seen_bids_at` per (user, renter_supplier) — decision 3. `NEW` counts bids after it; opening the bids list writes it. **This is what turns on `newBids` in A2's roll-up and the pulsing badge in C1** — both of which ship dormant in Phase 1 |
| E6 | The bids list: every bid, its channel badge, and `Open in the request →`. It is a route, not a record — nothing about a bid is decided from the suppliers list |

---

## Phase 4 — the outbound half

No mailer. No SES. No DNS. The renter's own client sends. **And neither action is built from nothing:
both exist in reduced form (§T) — this phase gives them recipients and a template.**

| # | Work |
|---|---|
| F1 | `POST /agents/requests/{id}/shares` — records a **declared share**: `{renterSupplierIds[], at}`. It is what the renter said they sent, never a delivery confirmation. Nothing in the UI may say "delivered" or "bounced". **This is also what adds the *What you sent them* section to the Phase 3 profile** (E1), and what makes the invitation record in F5 readable |
| F2 | The share dialog: recipients by group or individually → the request → an optional **your reference** → an optional line → the message (**T1**). The facts block is assembled from the request, never typed |
| F2b | Skipped-for-no-email is named BEFORE the send, with `Add email` inline on those rows. `ShareForBidsSheet` keeps its own no-recipient path for sharing outside the list — the two fill the same template |
| F3 | `mailto:` with recipients in **BCC** (decision 6), capped at 25. Past the cap, or where no mail handler exists, the fallback is `Copy the addresses` + `Copy the message` |
| F4 | Gmail never unfurls a pasted URL into a card. `copyBidLink` already puts the rich card on the clipboard and Gmail's composer keeps it on paste — so the dialog offers both *Open in your email app* and *Copy the message*. The body itself is plain text; `mailto:` cannot carry HTML. **T2 needs the same two-flavour writer of its own** |
| F4b | The join link is one constant. It ships as `https://linktr.ee/moedatech`, which is live today, and becomes `moedatech.net/get` when marketing builds it (§T2) — a one-string change that buys back the `?ref` token and our own preview card. **Align `t.workspace.inviteMessage` (`en.ts:1471`) onto the same constant**, or a supplier invited from a bid card lands somewhere else than one invited from this list |
| F5 | `Invite to Moedatech` (**T2**) — off-platform rows only. Today this exists as one WhatsApp button on an off-platform bid card (`BidCards.tsx:550`, message `t.workspace.inviteMessage`). Here it gains an email flavour, a card, and the ability to go to several suppliers at once. Store links from `src/lib/config/store-links.ts`. **Keep WhatsApp** — it is how this actually reaches a supplier today, and `wa.me/{phone}` addresses one number at a time, which is exactly the shape of a one-supplier invitation |
| F6 | *Opened the link* stays real: the token page is server-rendered and sees the visit. No tracking pixel |

---

## What this feature deliberately does NOT do

- **It is not the supplier directory.** Stores is that, and Stores looks the same for every renter. This list starts empty and only holds rows the renter created.
- **It does not notify.** A list you open occasionally is a bad notifier; link submissions already arrive where bids arrive (`link-bids.ts` maps them into a `BidCard` shape for exactly that reason). The pulsing `NEW` is a courtesy, not the mechanism.
- **It does not decide anything about a bid.** Compare, negotiate and award happen in the request. Every bid row here is a way out to it.
- **It never writes to the supplier's account.** The vendor flag lives on the link and nowhere else; the supplier is not told, and another renter's view of the same firm does not change.

---

## Open items

- **⚠ CONFIRM: does the vendor flag reveal a supplier's contact?** Chosen provisionally on 2026-08-31 —
  a flagged `platform` row returns the account's email and phone (**SUP-BE-20**). It is the first time
  the platform gives out a supplier's details without the supplier acting, and the only gate is a
  checkbox the renter ticks about himself. It ships behind a server-side switch, logged and capped at
  20 reveals a day per company. **The owner will confirm or change it.** The alternative that costs
  almost nothing: reveal on a real relationship — a bid, a deal room, an award.

- **Who in a company may write?** The list belongs to the company (decision 1), so any member can currently delete a supplier or rename a group everyone uses. `CompanyHub` already has members and roles. Decide before Phase 1: everyone writes, or owners write and members read. Silence here means whoever builds it guesses, and guessing wrong is a support ticket about a colleague deleting a vendor.
- **The vendor flag should record who set it and when** — `vendor_registered_by`, `vendor_registered_at`. Two columns, and the first time two people disagree about whether a firm is approved, they settle it in a second rather than an argument.
- **The screen is bilingual, like every other one.** EN/AR strings in `src/lib/i18n/*`, RTL through logical properties, `DESIGN.md` tokens, no shadows. Stated here because it is not optional and every other plan in this repo says so out loud.
- **`moedatech.net/get` — worth asking marketing for, not worth waiting on.** Phase 4 ships on the Linktree. `/get` buys back the `?ref` token and our own preview card whenever it arrives.
- **Does the `ref` token reach signup?** Moot while the Linktree is the link — it drops the parameter. If `/get` lands, the app's signup still has to keep the token through the store round-trip (deferred deep link, or a short code the supplier pastes). If it cannot, §M2's phone match stays the mechanism.
- **Reopen decision 5?** `Moedatech-App/apps/backend-admin` already has an email service that renders this card. Server-sent mail is available; it costs the from-address. One conversation before Phase 4.
- **P0-3** blocks §M2 only. Everything else ships without it.
- Send cap of 25 assumed, not confirmed.
- Rating from the survey feature (`surveys/{id}/respond`) on the profile — out of scope here; decide when surveys are re-enabled (`docs/surveys-disabled.md`).
