# The post-deal-room quotation — what this feature changed underneath it

**Status:** analysis + plan. No code, no tests, no spec touched.
**Date:** 2026-08-09
**Scope tags:** **`[BE]`** app-backend · **`[CT]`** web contract/logic · **`[UI]`** web components · **`[T]`** tests.

---

## The verdict, first

**The quotation's arithmetic is correct and nothing this feature changed can make it wrong.** Every
figure it prints is the number the renter saw in the room, by construction — the document and the
price bar call the same `computeDealTotals`. The stale-snapshot failure you might expect after a
reopen cannot be triggered: the quotation row is upserted on every re-confirm, the room's proposal
columns stop moving at `CLOSED`, the bid is un-editable once accepted, and no endpoint edits a
request's dates. I went looking for a broken total and did not find one.

**What is broken is the document's vocabulary.** Two things, both provable from the code:

1. The Agreed-terms card reads `q.agreedTerms` **unfiltered**, so the day the backend retirement
   ships, every deal closed before it will print `Operator nationality`, `Operator certification` and
   `Safety certifications` on the web — rows the app suppresses at parse and the deal room no longer
   has. Same deal, two different documents.
2. Four contract facts are printed **twice, under two names**. Subletting appears as "Subletting" in
   one card and "Crosshire" in another. A reader cannot tell whether that is one obligation or two.

Everything else on your list is either already right or not worth doing, and I have said which
below rather than finding work for it.

---

## What the quotation is today

`DealRoom.tsx:107` `buildQuotationHtml(room, q, renteeName, ar, L)` builds one HTML page and opens it
in a new window, which self-prints. It is reachable only when `room.status === "CLOSED"`, from two
controls (the price-bar `Download quote` at `:779` and the composer's `Download quotation` at `:940`).
It short-circuits first: `downloadQuotation` (`:341`) fetches `GET /api/deal-rooms/{id}/quotation`
and, **if the row carries a `pdfUrl`, opens that instead and renders nothing** — see the decision on
that branch below. Otherwise it fetches the renter's own name from `/api/me` (best-effort; a failure
leaves the party unnamed) and renders. The page structure comes from `src/lib/quotation/render.ts`,
shared verbatim with the bid-card quotation: a navy header carrying the quotation number
(`q.quotationNumber` truncated to 8 characters, upper-cased, falling back to the row's uuid) and
today's date; two party blocks — supplier with a National Address / CR # / VAT # triplet that shows a
green "✓ Verified" pill instead of a value when `room.supplier.isVerified`, plus `q.supplierPhone` /
`q.supplierEmail`, and rentee with phone and email only; **no** meta strip and **no** listed-equipment
block, both deliberately empty for app parity; a six-column invoice table of exactly three rows —
Rental, Delivery to site, Return from site, each detailed with `room.supplier.name`, with an excluded
leg printing "Not included" and a zero-priced leg printing "Arranged by the rentee" or "Included"
depending on `room.mobByRentee` / `demobByRentee`; a "Rate & cost responsibilities" strip carrying the
overtime rate and any cost-keyed term (`fuel`, `maintenance`, `overtime`, the two `fat_*` keys,
operator food and transport), taken from `q.agreedTerms` first and `room.terms` second; subtotal, VAT
at 15%, grand total, and the amount in words with halalas; then up to three cards — **Rental &
equipment details** (equipment, location, rental type, contract type, start, end, duration, working
hours/day, working days/week, fulfillment, urgency, subletting, local content, extendable, notes —
each row skipped when empty), **Agreed terms** and **Fixed terms**; and finally a one-line disclaimer
in place of the full legal clause list, with the signed block suppressed.

**The split between the snapshot and the live room.** From the confirmed `Quotation` row: `agreedRate`,
`priceUnit`, `contractType`, `agreedTerms`, and the four contact fields. From the live `DealRoomView`:
the supplier's name, `mobPrice`/`demobPrice`, both exclusions, all three unit counts, the duration,
the start date, every fixed term, and every row of the details card. The renter's own name comes from
neither — it is fetched separately from `/api/me`.

**What it prices on.** `computeDealTotals(room, { rate: q.agreedRate ?? room.rate, priceUnit: q.priceUnit ?? room.priceUnit })`
— the same function the live price bar calls, which is what makes "the quotation total equals the
number the renter saw" true by construction rather than by inspection. Per-unit rental is
`(rate ÷ divisor) × billableDays`, divisor 1/6/26 for day/week/month, billable days = duration minus
the Fridays in `[start, start + duration − 1]` counted in UTC. Units precedence is
`override.rentalUnits ?? room.agreedUnits ?? room.numberOfUnits ?? 1`, and `numberOfUnits` was itself
resolved at map time (`deal-room.ts:354`) as `agreedUnits ?? bid.unitsOffered.length ?? request.numberOfUnits`
— **the supplier's offered count, not the requested one**. Each leg carries its own count, capped at
the rental count, contributing zero when excluded. VAT is `Math.round(subtotal × 0.15)`.

---

## Defects

*It states something untrue, or contradicts the deal room.*

### D1 · The Agreed-terms card prints retired terms — `[CT]` · **small**

**Renders today.** `agreedRows = q.agreedTerms.filter((t) => t.key !== "PRICE" && !isCost(t.key))`
(`DealRoom.tsx:207`). That is the only filter. `COST_KEYS` covers fuel, maintenance, overtime, food
and transport; it does not cover `operator_nationality`, `operator_certification`,
`safety_certifications`, `mobilization_lead_time`, `fat` or `payment_method`.

New quotations are clean — `confirmDeal` snapshots with `!isDeprecatedTermKey(t.key)`
(`deal-room.service.ts:2923`), which is the single predicate covering both the deprecated and the
retired sets. **Every quotation written before that ships still carries them**, and the retirement is
on an unmerged branch. So this is not a legacy edge case; it is every deal closed to date.

The app already handles it. `QuotationModel.fromJson` filters the identical list against the identical
key set (`kHiddenDealRoomTermKeys`, `deal_room_models.dart:15-27`), described in its own comment as a
client-side backstop against a stale payload. The web has no backstop. So the same closed deal renders
an `Operator nationality: Filipino` row in a browser and nothing in the app.

**Should render.** Nothing for those keys. Filter `q.agreedTerms` against the same set the room's own
mapper already owns — `HIDDEN_DEAL_ROOM_TERM_KEYS` in `deal-room.ts:300` is that set, and it is a
superset of the backend's retired list.

**Why it matters to someone holding the document.** The card is titled *Agreed terms*. A
`safety_certifications` row under that heading asserts the parties negotiated and agreed a certificate
list. They did not: the value was copied from the request's ask into the room, was never actionable,
and is retired precisely because it was never a negotiation. The document claims an agreement that did
not happen, and it claims it in the one section a reader in a dispute would go to first.

**The argument against, recorded.** These rows were on the document when it was issued. Removing them
retroactively edits a signed artefact, and the safer instinct with contract text is to keep more
rather than less. If you want history preserved, the alternative is a fourth card — *Recorded at
signing* — that keeps the rows but stops them claiming agreement. I do not recommend it: it is twice
the work, it puts a section on the page nobody asked for, and it still leaves the app and the web
showing different documents. One vocabulary across both clients is worth more than a contested reading
of history.

*Side note this closes:* the SASO correction cannot reach this document by any other route (see
"Not worth doing"), but a legacy `safety_certifications` value **is** where a raw `saso_registration`
token could print — `valFmt` calls no classifier and no label map, so it would emit the wire string
verbatim. Filtering removes the only landing spot.

### D2 · Four facts printed twice, under two names — `[UI]` · **small**

**Renders today.** `working_days`, `working_hours`, `local_content` and `crosshire` are ACKNOWLEDGE
terms. The backend fills them from request columns —
`fixedFromRequest.working_hours = request.workingHoursPerDay`, `.working_days = request.workingDaysPerWeek`,
`.local_content = request.localContent`, `.crosshire = request.subletting` (`deal-room.service.ts:725-745`)
— and `buildTermsArray` emits them `state: 'fixed'`. They are not in the web's hidden set, so they
reach `room.terms` and land in the **Fixed terms** card.

The **Rental & equipment details** card renders the same four request columns directly:
`dd.workingHoursPerDay`, `dd.workingDaysPerWeek`, `yn(dd.localContent)`, `yn(dd.subletting)`
(`DealRoom.tsx:187-192`). Same source, same value, two rows, two label vocabularies. Subletting is the
sharpest: the detail row says **Subletting**, the term is keyed `crosshire` and labelled **Crosshire**
(`term-matching.ts`). Nothing on the page says they are the same obligation.

**Should render.** Once. Keep the term row — it is the contract line, and its card title records that
the supplier never negotiated it — and drop the four request-derived detail rows the fixed card
already covers.

**Why it matters.** Two rows stating the same obligation in different words is how a reader concludes
there are two obligations. On a screen that is noise; on a document someone is reading against an
invoice it is an argument.

**The argument against, recorded.** The details card is the one a reader skims, and burying working
hours under a heading called *Fixed terms* is worse for comprehension than a duplicate. The opposite
fix — keep the detail rows, drop the four fixed rows — is equally cheap. I prefer keeping the term
because the document then still says these were fixed rather than agreed, which is a fact about how
the deal was struck and is not recoverable from the request columns.

---

## Gaps

*It omits something this feature now makes available.*

### G1 · The unit count is never stated — `[UI]` · **extra small**

The number the money is based on appears **only** as a multiplier inside a table cell —
`` `${factorInt} × ${units}` `` — and only when `units > 1` (`DealRoom.tsx:145-149`). There is no row
anywhere that says how many machines this deal is for, and `room.requestedUnits` is on hand and never
printed.

It does not contradict the room: the topbar prints the same `room.numberOfUnits` (`:714`), and the
price-bar segment prices on the same figure. So this is a gap, not a defect.

But the map surface already has a rule for exactly this shape of confusion — RM3-AC-66: when the
offered count and the priced count differ, the footer **says so once**, because two unexplained
figures on one screen is the defect that rule exists to stop. The quotation carries the identical
ambiguity (`agreedUnits ?? offered ?? requested`) and says nothing at all. One row in the details card
— `Units · 2 of 3 requested` — is the cheapest item on this page and the one a dispute is most likely
to turn on.

### G2 · Required attachments never reach the document — `[CT]` · **small**

`required_attachments` is an ACKNOWLEDGE term, emitted `fixed` by the backend, and stripped by the
web's `HIDDEN_DEAL_ROOM_TERM_KEYS` (`deal-room.ts:300`) — a filter written for the *negotiation table*,
which the quotation then reuses because it reads the same `room.terms` array. The renter asked for a
breaker and a bucket; the contract does not mention them.

`fulfillment_type` is hidden by the same filter but survives by accident, because the details card
reads the request's own `fulfillmentType` column. Attachments have no such second route.

**Fix shape:** the quotation needs its own view of the terms, filtered at render rather than inheriting
the table's filter at map time. Small, but it is a change to a shared mapper's contract, so it wants a
test that pins which keys each surface sees.

### G3 · The machines are not named — `[BE][CT][UI]` · **large, and mostly backend**

Neither the quotation nor any of the other three implementations names a machine. No serial, no plate,
no yard.

This is not a rendering omission — **the data is not on the wire.** `dealRoomInclude` selects
`bid.unitsOffered` (`deal-room.repository.ts:76`), which is the raw JSON column: equipment ids and a
yard id, nothing else. The identities live in `offeredUnitsDetail`, assembled by `offeredUnitsDetailFor`
+ `buildOfferedUnitIndex` in `rentee.service.ts:907` and served **only** on the marketplace bid list and
bid detail endpoints. `getQuotation` does not carry it either.

So naming the machines means adding that projection to the deal-room or quotation payload — including
its ownership gate, which is what stops a planted `equipmentId` naming a competitor's machine — and
then rendering it. It is a real epic-sized piece of work, not a card. **It is also the prerequisite for
G4**, which is why the two travel together.

### G4 · Verification leaves no trace — **decision, see below**

---

## Decisions

*Product questions only the owner can settle.*

### Dec-1 · Should verification reach the contractual artefact?

The renter now spends the entire surface deciding which machines are acceptable and which papers
exist. None of it survives into the document. The evidence is there if it is wanted: `documentKeys`
entries carry `verifyStatus` and `expiryDate` (`bids.ts:89`), and the ask/answer loop is permanently
recorded — Stream persists the `rentee_request` / `rentee_request_reply` cards, `parseChatCard` already
types them, and `buildQuotationHtml` is called from a component that has the whole message list in
scope. An appendix would cost no backend work at all.

**For.** The quotation is the only artefact that outlives the room. If a renter accepted a price partly
because a machine's TÜV was on file, and the machine arrives without one, the document he is holding is
silent about the thing that decided him. Expiry is the strongest case: a certificate that lapses
mid-rental is knowable at signing and knowable by nobody afterwards.

**Against.** A quotation is an offer and its acceptance. It is not an inspection certificate. Printing
"TÜV: verified" beside a signature converts a clerical check into a warranty the platform never gave —
and the legal block already allocates that risk cleanly, in the other direction: *"The supplier is
responsible for the equipment's roadworthiness and technical safety on the delivery date, and for
satisfying mandated safety certifications"* (`render.ts:327`). Restating it as a per-machine platform
verdict weakens a clean allocation. `verifyStatus` is also a platform state, not a fact about the
world, and it moves; freezing it onto a document invites exactly the reading we should avoid.

**Recommendation: print the facts, not the verdicts.** For the machines actually in the deal, list
which papers were **on file at signing** and their expiry dates where an expiry falls inside the rental
window. Do not print `verifyStatus`. That gives the document-holder the one thing he cannot reconstruct
later — what existed on the day — without the platform underwriting anything. **It is blocked on G3**;
you cannot list a machine's papers on a document that cannot name the machine.

### Dec-2 · The `pdfUrl` branch — a fourth document, one API call away

`downloadQuotation` opens `q.pdfUrl` and returns before rendering anything (`DealRoom.tsx:347`). Server
PDF generation is disabled at deal close — commented out at `deal-room.service.ts:3030` with the note
*"The client renders/rasterizes the quotation document itself"* — so `pdfUrl` is null on new deals.

But `POST /api/deal-rooms/{dealRoomId}/quotation/retry-pdf` is live and authorized to either party
(`serverless.yml:3384`), `retryPdf` admits `pdfStatus` of `FAILED` **or** `PENDING`, and `PENDING` is the
column default — so the guard passes for every quotation row ever written. One call from either side
mints the dormant PDF, and from then on that deal's quotation is the server's document, permanently,
on both clients. That document uses a different fixed-term rule and prints certificate rows the
retirement removed everywhere else.

Neither client exposes a button for it (the app's is commented out at `quotation_page.dart:487`), so it
is not reachable by a user today. **The decision is whether to close the route, tighten the state guard,
or leave it.** I have not filed a ticket for it — it is a backend call, not a web one, and it may well
be deliberate.

### Dec-3 · The renter's own two copies of the same deal disagree — mobile side

On mobile, the deal room's CLOSED action **role-splits** (`deal_room_page.dart:1785`): the supplier goes
to the deal-room `QuotationPage`, the renter is routed to the marketplace `BidQuotationPage`. That
document is built from the **live bid**, not the confirmed Quotation row, and it prices with a weekly
divisor of 7, no Friday exclusion, and unrounded VAT. So a renter who downloads his quotation on the
phone and on the web gets two different totals for the same signed deal. **This is mobile work and this
ticket cannot fix it**, but it is the single largest disagreement I found and it should not be lost.

---

## Do the three implementations agree?

There are **four**, not three, and they agree on the money but not on the words.

| | Source of truth | Weekly ÷ | Fridays | Retired keys | Certificates | Fixed terms |
|---|---|---|---|---|---|---|
| Backend PDF (`quotation.service.ts`) — dormant | snapshot + live room | 6 | excluded | **prints them** | prints request's asks | `agreedTerms` where `state === 'FIXED'` |
| Web (`buildQuotationHtml`) | snapshot (rate/unit/terms) + live room | 6 | excluded | **prints them** | none at all | `room.terms` where `state === 'fixed'` |
| Mobile supplier (`QuotationPage`) | snapshot + request | 6 | excluded | filtered at parse | prints request's asks | **no such card** |
| Mobile rentee (`QuotationDocument`) | **the live bid** | **7** | **not excluded** | re-surfaces from `t3Declarations` | removed from header, survives in terms body | — |

Read the last three columns as one finding: **there is no shared answer to "what is a fixed term on
this document".** The web derives them from the live room, the dormant PDF from the snapshot's own
`state` field, and the app has no such section. Three implementations, three definitions, one word.

On the money the first three agree exactly, which is real and worth stating plainly — the divisor
table, the Friday rule and the leg independence are the same in all three. Only the mobile rentee
document diverges, and it diverges on all four counts at once.

**None of the four names a machine. None of the four carries per-machine verification.**

---

## Not worth doing

- **The ask/answer log as an appendix.** Cheap to build — the cards are typed and in scope — and wrong
  to print. It records a complaint, not a term. A renter who signed anyway waived the question, and
  printing *"3 documents requested, 1 unanswered"* on the artefact of a completed deal is trivially
  gameable: ask for ten papers, sign, hold the list up later. Stream already keeps the loop permanently
  and searchably for anyone who needs it in a dispute. Recorded here so it does not get proposed again.
- **Anything for the SASO correction.** Traced end to end: **the web quotation renders no certificates
  anywhere.** `dd.equipmentCerts` and `dd.operatorCerts` are mapped onto `DealItemDetails` and never
  added to `detailRows`; there is no `listed` block (`listed` is left undefined); `safety_certifications`
  is stripped from `room.terms`. `canonicalCertCode` is never called from this document and cannot be.
  The one residual — a legacy snapshot printing a raw `saso_registration` token — is removed by D1.
  **No work.** (Out of scope but flagged: the app's `equipmentCertLabel` still maps `saso_registration`
  to "SASO Equipment Registration Certificate", `localized_labels.dart:755`, contradicting the ruling
  recorded two functions below it at `:774`. Mobile bug.)
- **Reading the snapshot columns instead of the live room.** `Quotation` freezes `agreedUnits`,
  `mobUnits`, `demobUnits`, both exclusions, both leg prices and `durationDays` — added, per the code's
  own comment, because *"a release → renegotiate served a stale rate against fresh units"*. The web
  reads none of them, which re-creates by construction the exact bug those columns were added to
  prevent. **And yet there is no reachable path that makes them differ**: the row is upserted on every
  re-confirm and its `pdfUrl` cleared, the room's proposal columns stop being written at `CLOSED`,
  `editBid` refuses a terminal bid, and there is no endpoint that edits a request's dates. It is a
  latent divergence, not a live one. Not worth a ticket now; worth a comment if anyone touches the
  mapper. Note in passing that `durationDays` is snapshotted and read by **no client at all** — and
  that `startDate` is not snapshotted, so a frozen duration would still not fully freeze the total.
- **Re-enabling or deleting the server PDF.** Not this ticket's job in either direction. See Dec-2.
- **Chasing the mobile rentee document's pricing.** Large, real, and not fixable from the web. See
  Dec-3.

---

## Tickets

Numbering continues from the highest RM3-AC in use, **RM3-AC-78** (`docs/specs/004a-addendum-chat-and-the-request-loop.md:550`).
New criteria start at **RM3-AC-79**. Bare `AC-nn` inside this folder means `RM3-AC-nn`; in tests, cite
the full prefix.

### Q1 · The Agreed-terms card stops printing retired terms `[CT][T]`
**AC** 79, 80 · **small** · **Files** `src/components/deal-room/DealRoom.tsx:207`, `src/lib/contract/deal-room.ts:300`

- Filter `q.agreedTerms` against `HIDDEN_DEAL_ROOM_TERM_KEYS` — the set the room's mapper already owns,
  and a superset of the backend's `RETIRED_DEAL_ROOM_TERM_KEYS` ∪ `DEPRECATED_DEAL_ROOM_TERM_KEYS`.
  One set, not a second hand-written list, because two lists is how the surfaces drift apart again.
- **Export the set.** It is module-private today. The quotation is the second consumer, and a copy
  would be the third definition of the same fact.
- **Reuse:** the existing `isCost` exclusion stays — cost keys move to the price-extras strip and must
  not appear twice.
- Do **not** apply the filter to the price-extras loop. `fat_food` and `fat_accommodation_transport` are
  active keys; only the bare legacy `fat` is deprecated, and `isFatKey` is deliberately not the
  predicate the backend uses here.
- **Given** a quotation snapshot carrying `operator_nationality` **When** the document renders **Then**
  no row for it appears in any card.
- **Given** a snapshot carrying only retired keys **When** the document renders **Then** the Agreed
  terms card is omitted entirely rather than rendered empty.

### Q2 · No fact appears twice `[UI][T]`
**AC** 81 · **small** · **Files** `src/components/deal-room/DealRoom.tsx:187-192`

- Drop the four detail rows the Fixed-terms card already carries: working hours/day, working days/week,
  subletting, local content. Their term equivalents (`working_hours`, `working_days`, `crosshire`,
  `local_content`) are filled from the identical request columns server-side.
- Keep the **term** row, not the detail row — the card title is the only place the document records
  that the supplier never negotiated these.
- Leave `fulfillment` alone. Its term is hidden by the map filter, so the detail row is its only route
  onto the document (see Q4).
- **Given** a room whose fixed terms include `crosshire` **When** the document renders **Then**
  subletting appears exactly once, under the Fixed terms card.

### Q3 · The document states how many machines the deal is for `[UI][T]`
**AC** 82, 83 · **extra small** · **Files** `src/components/deal-room/DealRoom.tsx:179-195`

- One row in the details card, stating the priced count and — only when they differ — the requested
  count. `room.requestedUnits` is already mapped.
- The wording follows RM3-AC-66's rule: state the difference **once**, in one place, rather than
  leaving two figures on the page for the reader to reconcile.
- **Given** a deal priced on 2 of 3 requested units **When** the document renders **Then** the details
  card states both, in one row.
- **Given** priced and requested counts that match **Then** the row states the count alone and does not
  mention the request.

### Q4 · Required attachments reach the document `[CT][UI][T]`
**AC** 84 · **small** · **Files** `src/lib/contract/deal-room.ts:300-344`

- The quotation must see terms the **negotiation table** hides. Today it inherits the table's filter
  because both read the same `room.terms`, applied at map time.
- Move the hide to the render, or carry a second projection. Either way one array must not be silently
  serving two audiences with two different needs.
- Only `required_attachments` is actually lost — `fulfillment_type` survives via the request column.
  Scope this to attachments rather than un-hiding the whole set.
- **Given** a request naming two attachments **When** the document renders **Then** the Fixed terms card
  names them, resolved to labels rather than ids.

### Q5 · Machine identity on the deal-room payload `[BE]` — **blocked, not scheduled**
**AC** — · **large** · **Files** `apps/backend/src/repositories/deal-room.repository.ts:62`, `apps/backend/src/services/marketplace/rentee.service.ts:907`

- Prerequisite for G3 and Dec-1. Project `offeredUnitsDetail` onto `getQuotation` (which already holds
  the bid), carrying its ownership gate unchanged — that gate is what stops a planted `equipmentId`
  naming a machine the bidding firm does not own.
- **Do not schedule until Dec-1 is settled.** Building the payload before deciding what goes on the
  document is how we end up with a projection nobody consumes.

---

## Coverage

| AC | Ticket | Class |
|---|---|---|
| RM3-AC-79, 80 | Q1 | defect |
| RM3-AC-81 | Q2 | defect |
| RM3-AC-82, 83 | Q3 | gap |
| RM3-AC-84 | Q4 | gap |
| — | Q5 | blocked on Dec-1 |

**Sequence.** Q1 → Q2 → Q3 are independent and can ship in any order; Q1 is the only one that changes
what a *legacy* document says, so it goes first. Q4 touches a shared mapper and should not ride with
them. Q5 waits on a decision.
