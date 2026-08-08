# 004a — Addendum: the chat, and the request loop from both sides

**Extends** `004-deal-room-equipment-verification.md`. Prefix `RM3-AC-*` continues from 42, and runs to
**76** here after the 2026-08-08 additions (§8 defines 71–72, §9 defines 73–76).

⚠️ **`RM3-AC-*` is the only live prefix.** A bare `AC-nn` in a test name or comment is a spec-001 / v2
number that collides with a live `RM3-AC-nn` meaning something else — see the boxed note above 004 §8
before building any AC-to-test map.
**Layers:** web (`Web-App`) · app-backend · **mobile (supplier)** — this addendum is the first part of
the feature that needs the supplier's app.

Everything here is anchored to code that exists today. Where the design meets a wall in shipped
behaviour, the wall is named.

---

## 1 · The deal room is three modules

| Module | Where it lives | This spec |
|---|---|---|
| **Terms + price** | the existing negotiate flow | **unchanged** — §6.10 re-hosts the bar, redesigns nothing |
| **Equipment + documents** — readiness, verification, the four requests | the new surface | 004 §6.1–§6.8 |
| **Chat** | the dock | **this addendum, §2** |

They are connected by one fact: **the bid's primary machine.** `bid.equipmentId` is what the deal room
is about, and it is written by the supplier's readiness card as `selected.first`
(`bid_readiness_bloc.dart` `_persist`). Everything the renter verifies, and everything he asks about,
resolves through that id.

## 2 · Chat — one supplier, a tab per item

**Same chat UI as today.** The only addition is a tab strip.

**Why tabs and not one merged thread.** `DealRoom.bidId` is `@unique`, and the backend fans a
multi-item RFQ into one request per item, so **one bid = one item = one deal room = one Stream
channel**. A supplier bidding on three items has three channels. Merging them would mean inventing a
fourth channel and re-parenting messages; tabbing them presents the same rooms honestly.

- **Tabs appear only when that supplier has more than one bid in the RFQ group.** A single-bid supplier
  gets today's chat with no new chrome.
- **Grouping key:** `supplierCompanyId` → `supplierId` → `supplierName` — already shipped as
  `bidSupplierKey` (`bids.ts`). Two members of one firm are **one** counterparty: the backend already
  treats them so (`supplierBidScopeWhere`, and `deal-room.service.ts:954` adds every active colleague of
  both firms to the channel).
- **Per-tab unread** comes from `GET /api/me/deal-rooms` rows, which carry `bidId` + `unreadCount`
  (`inbox.ts:11,15`). No socket needed for the badge.
- **A tab whose bid has no room yet** still appears; the room is created on **send**, never on open.
- **Switching tabs must not move the map.** This surface is scoped to one bid by design; the chat is the
  one cross-item view, and that asymmetry is deliberate.

**Every custom card is preserved in every tab** — the negotiation vocabulary (`rate_proposal`,
`rate_response`, `term_accepted`, `counter`, `term_updated`, `term_reopened`) plus `rentee_request` and
`rentee_request_reply`. The chat is the permanent record of what was asked and answered; nothing is
rendered as a bare grey pill.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-43 | web | **Given** a supplier with two or more bids in the RFQ group **When** the dock opens **Then** one tab per item renders, each mounting that bid's own room |
| RM3-AC-44 | web | **Given** a supplier with exactly one bid **When** the dock opens **Then** no tab strip renders |
| RM3-AC-45 | web | **Given** two bids from different members of one firm (`supplierCompanyId` equal) **When** tabs are grouped **Then** they are one counterparty, not two |
| RM3-AC-46 | web | **Given** unread on an item the renter is not reading **When** the dock renders **Then** that tab carries its own badge |
| RM3-AC-47 | web | **Given** a tab whose bid has no deal room **When** the renter opens it **Then** nothing is created; the room is created only when he **sends** |
| RM3-AC-48 | web | **Given** any tab **When** it renders **Then** every custom card type renders as a card — negotiation vocabulary, `rentee_request`, and `rentee_request_reply` — never as a plain pill |
| RM3-AC-49 | web | **Given** the renter switches tab **When** the tab changes **Then** the map and the machine selection are unchanged |

### 2.1 The arrival notice — preserved from v2, retimed

The renter spends this surface on the **map**, not in a conversation, so a reply that only increments a
badge is easy to miss. v2's notice is kept: a bubble anchored to the chat dock carrying the supplier, the
message and `↩ ref · serial`, plus a transient popup for when a panel covers the dock.

**But it is refresh-timed, not live.** There is no socket here (unread comes from
`GET /api/me/deal-rooms`), so it appears on mount · focus · post-send · the 45s poll. **Copy must read
"you have a reply", never "just arrived"** — a notice that claims recency it cannot know is worse than a
quiet badge.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-62 | web | **Given** a reply arrives while the chat is not open **When** the next refresh returns it **Then** a notice appears on the dock carrying the request's `ref` and the machine, and the badge increments |
| RM3-AC-63 | web | **Given** the chat is already open on that tab **When** the reply lands **Then** no notice appears and no unread accrues |
| RM3-AC-64 | web | **Given** any arrival copy **When** it renders **Then** it never implies immediacy — the mechanism is a refresh, not a push |

## 3 · The request loop, both sides

Three requests cross to the supplier. Each must land on **an exact target** — a machine, or a machine
plus a document type — so the supplier can act without interpreting prose.

### 3.1 What the renter sends — already built

`rentee-request.service.ts` (app-backend, shipped): `ref` minted server-side · `serial` stamped from the
resolved listing · `equipmentId` ownership-checked **before** the message exists · `add_to_offer`
rejected. The card carries `{type, ref, scope, equipmentId, serial, kind, docTypes?}`.

### 3.2 What the supplier must do to answer — per kind

| Kind | Target | The supplier's act | How the renter learns |
|---|---|---|---|
| **availability** | `equipmentId` | open readiness at **that unit** and name the yard it leaves from | `unitsOffered[]` gains `{equipmentId, yardId}` → `locationSource` becomes `unit_yard` → the pin and chip turn green on the next refetch. **Derived — no reply needed** |
| **document** | `equipmentId` + `docTypes[]` | upload **that type** onto **that machine** | the type appears in `documentKeys` → the V8 row flips to uploaded, the card reads 2/3 → 3/3. **Derived** |
| **alternative** | `equipmentId` (or null for the shortfall) | swap the machine, add one, or submit a second bid | **nothing observable identifies "a different machine instead"** — this kind is the reason the reply card exists |

**So two of the three are answered by doing the work, and one can only be answered by replying.** That
asymmetry is why `rentee_request_reply` carries `resolution: provided | declined | unavailable` — a
refusal changes no state anywhere, so without the reply a "no" is invisible.

### 3.2b The answer is ALSO a message — decided 2026-08-08

Derived state alone is not enough. A supplier who confirms a yard changes a pin's colour and leaves
**no trace in the conversation**; with no socket and refresh-only freshness, the renter can miss it
entirely. So:

- **When the supplier completes the action from the request card**, the app knows the `ref` and posts
  `{inReplyTo, equipmentId, resolution: 'provided'}` **automatically on success.** The answer appears in
  the thread, at the moment it happened, next to the question.
- **Derived state remains the source of truth**, and remains the fallback for the common case where he
  acts *outside* the card — from the fleet page or the readiness card directly. A card whose machine
  already satisfies the ask reads answered even if no reply was ever posted.
- The two can never disagree, because the reply is a **record** and the state is the **verdict**: where
  both exist, §7.13.4's precedence already says derived state wins.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-56 | mobile | **Given** the supplier completes a request from its card **When** the write succeeds **Then** a reply card is posted automatically with `resolution: 'provided'`, carrying the same `ref` and `equipmentId` |
| RM3-AC-57 | mobile | **Given** the write fails **When** the action returns **Then** no reply is posted — a reply must never claim an answer the data does not show |
| RM3-AC-58 | web | **Given** a reply and the machine's state disagree **When** the card renders **Then** the derived state wins, and the reply remains visible as the record of what was said |

### 3.2c "Add a unit" is TWO steps, and only the second one answers the request

**Clarified 2026-08-08.** "Add a unit" means **register a new machine** — the existing add-equipment
form, reached from readiness. It creates an `EquipmentListing`. **It does not touch `bid.unitsOffered`,
so the offered count is unaffected and `BID_OFFER_LOCKED` never fires.**

But registering alone leaves the renter seeing nothing:

- his list is **offered machines only** (AC-09/10), so a new listing is `inBid: false` and is **not shown**
- `claimed = offered − registered(inBid)` is unchanged, so **the shortfall alert still reads the same**

So the answer is two steps, and the card must carry both:

| | Step | Effect on the bid |
|---|---|---|
| 1 | **add the equipment** (existing form) | none — a new listing exists |
| 2 | **commit it into a claimed slot** in readiness | `unitsOffered` gains a real `equipmentId` in place of padding |

**Step 2 IS a same-count edit** — 3 offered stays 3, the composition moves from 1 registered + 2 claimed
to 2 + 1 — and the server permits that with a room open (`bid.service.ts:412-418`).

**⚠️ Corrected 2026-08-08 — this section said "It is not, today, because of §3.2d", and that is no
longer true.** The paragraph below is the argument as it stood, kept because it is why §3.2d was raised
at all:

> ```
> stored      unitsOffered = [A, A, A]        offered count = 3
> rehydrate   readiness de-dupes              selected = [A]
> commit B    the newly registered machine    selected = [A, B]
> _persist    writes selected.length          2 entries  ≠  3  →  BID_OFFER_LOCKED
> ```
>
> So committing into what the supplier believes is a claimed slot is a **count change against the stored
> array**, and the write is refused the moment a deal room exists — which the renter's ask itself
> created. **Therefore §3.2d is not a latent defect; it BLOCKS this loop.**

**§3.2d is fixed** (see it for the detail): mobile `bid_readiness_bloc.dart` now holds the offered
**count** apart from the **set** of machines and persists `max(offeredCount, selected.length)` slots. So
committing a machine into a claimed slot writes the same number of entries it read, the edit is a
same-count edit, and it succeeds with a deal room open. **The shortfall ask is answerable.**

The supplier client still degrades honestly if a write does fail for any other reason: the sheet
surfaces the backend's real error and **no reply is posted** — so the renter's card never claims an
answer that did not happen.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-59 | mobile | **Given** an `alternative` or shortfall card **When** the supplier acts **Then** he is taken to the add-equipment form, and on return is offered the commit step — registering alone must not report the request as answered |
| RM3-AC-60 | mobile | **Given** the new machine is committed into a claimed slot **When** the bid is saved **Then** the offered COUNT is unchanged, so the write is a same-count edit and succeeds with a deal room open |
| RM3-AC-61 | web | **Given** a machine registered but not committed **When** the renter's surface refetches **Then** the shortfall is **unchanged** — the count follows committed machines, never the supplier's fleet size |

### 3.2d ~~Pre-existing defect this path depends on~~ — the padding collapse, **FIXED 2026-08-08**

**This section described an open defect. It is closed.** The description is kept because §3.2c's
argument, the shortfall loop and RM3-AC-60 all rest on understanding it — a reader who found only
"fixed" would not know what was fixed or why the loop was ever in doubt.

**What it was.** Independent of this feature, and it corrupted the counts above.

- **The bid form pads:** `while (ids.length < count) ids.add(state.equipmentId)`
  (`bid_form_bloc.dart:1566`) — a 3-unit offer with one machine stores **three identical entries**.
- **Readiness de-duplicated on rehydrate:** `if (id == null || selected.contains(id)) continue` — so
  `selected` became `[A]`, length 1.
- **`_persist` wrote `unitsOffered` from `selected`** — **one** entry.

**A supplier who opened the readiness card and touched anything silently dropped his own offered count
from 3 to 1.** Before a deal room existed it happened quietly; after one, the same write was refused
with `BID_OFFER_LOCKED` and he saw an error he could not act on. For this surface it meant the shortfall
could disappear because **the offer shrank**, not because it was filled.

**How it is fixed.** `bid_readiness_bloc.dart` now keeps the offered **count** as a value of its own,
separate from the de-duplicated **set** of machines, and persists `max(offeredCount, selected.length)`
slots. De-duplication still protects the set; it no longer decides the count. A supplier who commits a
newly registered machine into a claimed slot therefore writes the same number of entries he read, which
is a same-count edit and is permitted with a deal room open.

**Consequence for this spec:** §3.2c's blocking claim is withdrawn, RM3-AC-60 is satisfiable, and the
supplier-side ticket this section asked for is no longer outstanding.

### 3.3 The supplier's app cannot do any of this today

Verified, and it is the gating finding of this addendum:

| Gap | Evidence |
|---|---|
| **No custom-card renderer.** A `rentee_request` arrives and renders as nothing | `deal_system_events.dart` is a fixed 5-value enum (`roomOpened`/`offerReceived`/`counterSent`/`accepted`/`cancelled`); no widget in `features/deal_room/presentation/` reads `custom` or `extraData` |
| **No reply composer** | there is no path that emits `{inReplyTo, equipmentId, resolution}` |
| ~~The two derivable answers are blocked~~ | **RESOLVED upstream — verified 2026-08-08.** `origin/staging` and `origin/main` now read `editable: !_terminalBidStatuses.contains(_bid.status.toUpperCase())`; the `&& dealRoomId == null` clause is gone, and the doc comment states the rule we arrived at independently: *"A deal room being open does NOT make this false… only a COUNT change is rejected once a deal room exists"* |

**So the supplier CAN confirm a yard and upload documents during negotiation.** Only a **count** change
is refused (`BID_OFFER_LOCKED`, `bid.service.ts:470-481`), which is correct. The loop is viable; what
remains missing is the card, the wiring and the reply.

### 3.4 Supplier-side tickets — mobile

| | Ticket | Why |
|---|---|---|
| ~~S1~~ | ~~Split the readiness gate~~ | **DONE upstream** — `origin/staging` and `origin/main` already drop the `dealRoomId == null` clause. Nothing to build |
| **S2** | **Render `rentee_request` as a card** — machine thumbnail, name and serial resolved from `equipmentId` **at render time**, the `ref`, and the ask in words | the mirror of the web's `ChatCard`; today the request is invisible |
| **S3** | **Wire each card to its exact target.** availability → open readiness focused on that unit's yard sheet; document → open that machine's upload for **that `docType`**; alternative → the fleet picker | "wired to the exact equipment/doc" is this ticket |
| **S4** | **Reply on completion + composer.** On a successful write from the card, post `resolution: 'provided'` **automatically** (§3.2b); offer `declined` / `unavailable` explicitly | the answer must land in the conversation, not only in a pin's colour — and a "no" has no other way to reach the renter |
| **S5** | **Render `rentee_request_reply`** on both sides so the thread reads as a conversation | closes the loop visibly |

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-50 | mobile | **Given** a `rentee_request` arrives **When** the supplier's chat renders **Then** it is a card naming the exact machine, resolved from `equipmentId` at render time — never parsed from the text |
| RM3-AC-51 | mobile | **Given** an `availability` card **When** the supplier acts on it **Then** he is taken to **that unit's** yard sheet, and completing it writes `{equipmentId, yardId, yardConfirmed}` |
| RM3-AC-52 | mobile | **Given** a `document` card naming types **When** the supplier acts **Then** he is taken to the upload for **those types** on **that machine** |
| RM3-AC-53 | mobile | **Given** a deal room exists **When** the supplier confirms a yard or uploads a document **Then** it succeeds — only a **count** change is refused |
| RM3-AC-54 | mobile | **Given** any request **When** the supplier declines **Then** a reply card carries `resolution: 'declined'`, and the renter's card reads refused rather than waiting |
| RM3-AC-55 | web | **Given** an `alternative` request and a `declined` reply **When** the card renders **Then** it reads refused — never "waiting for the supplier" |

## 4 · Alignment with shipped code — five things to get right

Checked against the code, not assumed.

1. **The fleet total is *qualifying* machines, not the supplier's whole fleet.**
   `getSupplierFleetForBid` → `getMatchedFleet` matches on the request's subtype **and** capacity. So
   «٣ لدى المؤجّر» means *three that fit this request*. Copy must not imply a total inventory.
2. **`claimed = offered − registered`, where "registered" is machines in THIS bid.**
   The fleet response includes owned-but-not-offered machines (`inBid: false`). Counting fleet rows would
   understate the shortfall to zero. Count `inBid === true` rows. **Clamp at zero** (AC-31).
3. **The counts can move while the renter is looking.** Until the room exists, the supplier can add units
   up to the request's `numberOfUnits` — and `unitsOffered.length` **is** the offered count, so the
   shortfall changes. After the room exists it is frozen. No copy may imply the numbers are fixed.
4. **Equipment document rows show presence only — but the data carries more.** `documentKeys` entries
   include `verifyStatus` and `expiryDate` (T1 passes them through). §6.6 deliberately renders only
   presence there; the fields exist and must simply not be shown.
5. **The room-creating acts are exactly three:** negotiate/accept, sending a request card, sending the
   first chat message. Selecting a bid, a machine, a document, or opening a tab must never create one —
   a `DealRoom` row freezes the supplier's offered count.

## 4a · Verified against the deal room — four findings that change the plan

Checked in code on 2026-08-08, because "re-hosts the existing UI" was an assumption, not a fact.

### 4a.1 The "price bar" is a negotiation wizard, and only half of it can be re-hosted

`DealRoom.tsx` is **1,706 lines**, and what §6.10 calls a footer is `qp-foot` (`:1608`) — the footer of a
**three-page wizard** (`page 0 → 1 → 2`, *"Next: Terms" → "Review & send" → "Accept offer"*), bound to
that component's local state: `page`, `editable`, `allMatched`, `canNext`, `canSubmit`, `busy`,
`doSubmit`, `onClose`, `setLogOpen`.

| Half | Verdict |
|---|---|
| **The figures** — rate, source, التفاصيل breakdown | ✅ genuinely re-hostable: `computeDealTotals` lives in `src/lib/contract/deal-room.ts` and is pure |
| **"the existing negotiation entry point"** | ❌ **not embeddable.** It is a wizard, not a button |

**Normative:** the footer **shows** figures from `computeDealTotals` and **hands off** to the existing
flow. It never re-implements negotiation, and it never edits a figure.

### 4a.2 The module boundary — stated, because two surfaces now touch one room

`/deal-room/[id]` is a full page inside `AppShell`, mounted only at that route; the verification surface
is its own view. They are never on screen together, and the handoff is navigation.

> **The verification surface owns equipment, documents and requests. The moment the renter negotiates or
> accepts, the existing deal-room flow takes over. Price and chat appear here read-only and as an entry
> point — never as a second implementation.**

Without this rule the two surfaces would each render price, chat and terms over the same room, and would
eventually disagree.

### 4a.3 The chat dock can connect — with two constraints

`DealRoom.tsx:358-398` is self-contained and copyable: `fetchStreamToken(id)` →
`StreamChat.getInstance()` → `connectUser` → `channel("messaging", channelId).watch()`.

1. **The token is room-scoped.** No `dealRoomId` ⇒ no token ⇒ no chat. That is consistent with D-A: a
   room exists only after the renter sends. A tab whose bid has no room is **compose-only**, and the send
   creates the room and then connects.
2. **The client is a singleton and the cleanup disconnects unconditionally** (`:394`,
   `client?.disconnectUser()`). Our dock and `/deal-room/[id]` are different routes, so they do not
   overlap today — but the moment anything renders the deal room without a full route change, that
   disconnect tears the dock's connection down. **Reference-count `connect`/`release` in one shared
   module** rather than letting two components own a singleton.
3. **For tabs across N rooms**, fetch the token once and watch that user's channels, rather than N
   token calls — the token is user-scoped even though the route is room-scoped.

### 4a.4 The counts describe the OFFER; the footer prices on the AGREED count

`deal-room.ts:57` is explicit: the room's `numberOfUnits` is the **price basis** —
`agreedUnits ?? bid.unitsOffered.length ?? request.numberOfUnits` — and `comparison.ts:124` already
prefers `agreedUnits` when it is set.

So after a renter negotiates 3 units down to 2, **two different numbers are both correct**:

| Surface | Number | Meaning |
|---|---|---|
| The count pills + shortfall (§6.2, §6.3) | **offered** = `unitsOffered.length` | what the supplier's offer is made of |
| The price footer (§6.10) | **agreed** = `agreedUnits` | what the money is now based on |

v2 §7.6 had a rule for this and v3 dropped it silently. Restored, and narrowed:

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-65 | web | **Given** an agreed count differing from the offered count **When** the surface renders **Then** the count pills and the shortfall keep describing the **offer** (`unitsOffered`), and the footer prices on **`agreedUnits`** |
| RM3-AC-66 | web | **Given** those two numbers differ **When** they are both on screen **Then** the difference is stated once, in the footer — never left as two unexplained figures |
| RM3-AC-67 | web | **Given** a mid-negotiation proposal **When** the counts render **Then** they follow `agreedUnits` only, never `lastProposedRentalUnits` — an unapproved counter must not rewrite what the offer says |

## 5 · Two corrections to 004

| | |
|---|---|
| **AC-34 (landing pre-selection)** | Says *the offer's **confirmed** machine* is pre-selected. The authoritative unit is **`bid.equipmentId`** — the supplier's `selected.first`, which is what the deal room is about. On a multi-unit offer several machines can be confirmed; only one is primary. **Pre-select `bid.equipmentId`**, falling back to the first confirmed machine only if the primary is absent from the fleet response |
| **AC-03/04/05 (the counts)** | Add: registered counts `inBid === true`, and the numbers are live until the deal room exists (§4.2, §4.3) |

## 6 · Sequence

The renter's side ships first and is useful alone — he can verify machines and read documents without
sending anything. **The moment requests ship, S1 is required**, or every ask is unanswerable.

```
web V1…V13                     renter verifies — useful with no supplier change
        ↓
S2  render the card            supplier sees the ask
S3  wire card → exact target   supplier answers in one tap
S4  reply on completion        the answer lands in the conversation
S5  render the reply           the loop is visible on both sides
```

**S1 is gone** — the readiness gate was already fixed upstream, so a supplier can confirm a yard or
upload a document during negotiation today. The remaining supplier work is presentation and wiring, not
permission.

## 7 · Every document must be openable — added 2026-08-08

**Product decision:** a renter must be able to **view and download** every document this surface names,
at **both** levels — the machine's papers and the company's.

**One exception, added by the owner on 2026-08-08 and narrowing this section: the operator's
certificates.** They are shown as a **status** — on file or not — and expose no file (§9 / AC-75, 004
§6.6a). The reason is the same one this section is built on, applied honestly: this surface exists to
answer *can I trust this paperwork*, **nothing validates an operator document on upload**, and a file
the renter can open reads as evidence that was checked. Presence is a fact the platform can stand
behind; the contents are not. Everything else on this surface — the machine's papers, its photos, the
firm's papers — keeps view + download.

This surface exists to answer *can I trust this counterparty's paperwork*, and it is now the **only**
place that evidence appears after bidding: `operator_certification`, `safety_certifications` and
`operator_nationality` are in `RETIRED_DEAL_ROOM_TERM_KEYS`, stripped from the deal room at build **and**
read, and ignored by the close gate. The cert *terms* are gone from negotiation, so the cert *documents*
carry the whole burden. A row the renter cannot open reduces this panel to a rumour.

### 7.1 What is actually built, checked rather than assumed

**Updated 2026-08-08 — V14 and V15 shipped, and this table was the audit that produced them.** The
original state is kept in the right-hand column so the finding that justified the tickets is still
legible; the left column is what is true now.

| | State when audited | State now |
|---|---|---|
| Equipment documents — data | ✅ real. `getSupplierFleet` presigns via `batchSignItems`; ownership papers are deliberately unfiltered for the renter | ✅ unchanged |
| Equipment documents — controls | ⚠️ download only. No view | ✅ **view** per row (V15, AC-69) — **download moved to the batch** (§8.2, owner 2026-08-08) — and **the operator's certificates expose neither** (AC-75) |
| Company documents — controls | ⚠️ download only. No view | ✅ **view** per row, **download in the batch** (V15, AC-69, §8.1, §8.2) |
| **Company documents — data** | ❌ **none.** `CompanyPanel` takes `docs` as a prop and no route can fill it | ✅ **served.** `GET /marketplace/bids/{bidId}/company-documents`, presigned via `batchSignItems`, gated by the **same predicate as the fleet read**, bid-scoped with no company id accepted from the client (V14) |

**AC-68 is satisfied.** The last row *was* the real finding: `getMyCompany` serves a supplier's *own*
company and `partner/company.ts` is the partner/admin surface, so **neither was reachable by a renter**
and V9's rows were structurally always "no document yet" — not a missing link on a present document, but
a panel with no data behind it. That is fixed. The claim "❌ none" is withdrawn rather than deleted,
because it is the whole argument for why V14 exists.

**This did not survive as a request path.** The company read is a *read*: the panel lists, opens and
downloads. A renter cannot ask the firm for a paper — see §8.

### 7.2 Presence-only was never meant to mean unopenable

§6.6 says equipment rows render **presence only**. That governs **verification state** — an equipment
paper carries no verify badge, because a machine's paper is either there or it is not, and a badge
invites judging a lessor on a technicality. It does **not** govern reachability. Stated here because the
wording invites exactly the opposite reading, and a reasonable implementer would honour it by shipping a
row with nothing to click.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-68 | backend | **Given** a renter who can reach a bid's request **When** he opens the company panel **Then** the bid's supplier's company documents are served **bid-scoped** — no company id accepted from the client — gated by the same predicate as the fleet read, with presigned urls, verification state and expiry |
| RM3-AC-69 | web | **Given** any document row at either level **When** it carries a url **Then** it exposes **view**, and **When** it carries none **Then** it exposes nothing, never a dead control. *(**Narrowed 2026-08-08 by the owner's UI design — it required "view AND download, view primary".** The per-row **download** control is withdrawn: downloading is now the **batch** action beneath the list (§8.2), so a per-row download would be a second control for one act, one of which the renter has to learn is redundant. **View survives, and that is the point of keeping it** — the renter must still be able to look at one paper without selecting anything. Also unchanged by the earlier operator ruling, and worth saying why: the operator's rows carry **no url by design** (AC-75), so this criterion is satisfied by its second clause rather than exempted from — "a renter must be able to view every document this surface names" is now false of one family, deliberately.)* |
| RM3-AC-70 | backend | **Given** local content **When** the company documents are assembled for **display** **Then** it resolves from `held_cert_docs.LC` **or** the legacy `local_content_doc_key` — so the panel can list, show and open it — because it is a held cert and not a catalogue document. The same dual-read serves SASO from `held_cert_docs.SASO` / `saso_heavy_equip_doc_key`. *(Re-scoped 2026-08-08, the day it was written. It was authored to make a company-scope document **request** resolvable: a held cert has no `DocumentInstance`, so an ask answered against catalogue keys alone would hang open forever. That ask is withdrawn — a document request names a machine, AC-71 — so the criterion now stands on display alone, which is what it was always really about. Nothing about the backend read changes.)* |

## 8 · A document request names a machine — decided 2026-08-08

**Product decision.** The renter can ask about a **machine's** papers. He can no longer ask for the
**firm's**.

This reverses part of §6.6 and §6.7 of 004 and part of §7 above, and those places are corrected in situ
rather than left to be reconciled by a reader. What changes:

| | Before | Now |
|---|---|---|
| Equipment document rows | select-all, tick per row, batch «اطلب مستنداً» | **unchanged** |
| Company document rows | the same select-all, tick and batch ask | **read and open only** — no request control. ~~no tick, no select-all, no send~~ **corrected in §8.1: the tick and select-all are back, and the batch downloads** |
| `rentee_request` `document` kind | `scope: equipment` with an id, **or** `scope: company` with none | **`scope: equipment` with an id, always** |
| The shortfall's «اطلب إضافتها» | `alternative`, `scope: company`, null id | **unchanged — this is the one surviving company-scope ask** |

**Why.** The company ask was specced on the symmetry of §6.6's row grammar, not on anything a supplier
could act on:

- A company paper belongs to the **firm**, so the ask names no machine and threads onto no unit.
- The only act that closes it is the supplier editing his **own profile**, which he does from his
  profile and not from a conversation — so the loop 004a exists to close never closed for this kind.
- And the renter can already **see** every company paper and open it (§7 / AC-69). The question the ask
  was meant to answer is answered by looking.

**Viewing and downloading company documents is unchanged and must keep working.** The panel still lists
CR · VAT · national address · local content · SASO, still shows verification state and expiry, and still
opens and downloads each paper (V15 / AC-69). V14's read (§7.1) is untouched. **Only the ask is
withdrawn** — and §8.1 records that the first implementation of this ruling withdrew the selection UI
along with the ask, which was more than was decided here.

**The rule is enforced by the type, not by a guard.** `RenteeRequestDraft`'s `document` arm requires
`scope: "equipment"` and a non-nullable `equipmentId`, so `kind: 'document'` with a null id cannot be
written down; `composeDocumentRequest` takes `equipmentId: string` for the same reason; and there is no
`scope` input on `RenteeAsk` for a caller to assert one with. A guard is something a future caller
routes around — an unrepresentable state is not.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-71 | web | **Given** a document request **When** it is composed **Then** it names a machine — `scope: "equipment"` with a non-empty `equipmentId` — and a `document` ask carrying no machine is **unrepresentable in the payload type** and refused at runtime by the one composer, whatever scope a caller asserts. **A company paper is read, not requested** |
| RM3-AC-72 | web | **Given** the company document panel **When** it renders **Then** every paper is listed with its verification state, its expiry and its **view** control; **a paper carrying a url also carries a checkbox**, the panel carries **select-all** — reading «حدّد كل المتاح» — over those papers, and the **single** batch action beneath them **saves the selection**. **When** a paper carries no url **Then** it is listed but **not selectable**. And there is **no request control anywhere on the panel**. *(Corrected twice on 2026-08-08. First, hours after it was written: it read "there is **no checkbox, no select-all and no request control** anywhere on it" — see §8.1, withdrawing the ask took the selection UI with it and the owner restored the ticks for a different verb. Then again for the mode split of §8.2: the row's **download** control is gone with every other row's (AC-69), and this panel is the **single-mode** case — a company row is never requestable, so its checkbox column has exactly one meaning and can never mix. It gets **no** disabled request button; the equipment tab's second footer button would name an act this panel refuses to offer.)* |

### 8.1 The ticks come back — for opening, not for asking

**Product decision, 2026-08-08, later the same day.** Withdrawing the company-scope *request* above took
the company panel's **checkboxes and select-all** away with it. That was one step too far, and this
section reverses that half and only that half.

| | After §8 | Now |
|---|---|---|
| Company row — **checkbox** | ~~none~~ | **one per row that carries a url** |
| Company panel — **select-all** | ~~none~~ | **restored**, over the rows that carry a url |
| The batch beneath them | ~~none~~ | **opens or saves the selection** — never a request |
| Company row — **request control** | none | **none. Unchanged, and this is the load-bearing half** |
| `rentee_request` `document` kind | `scope: equipment` with an id, always | **unchanged** |

**Why the ticks were wrong to remove.** A renter checking a firm wants its CR **and** its VAT
certificate. Select-all exists precisely to stop him clicking five rows one at a time, and that argument
never depended on what the button underneath the list did. What was withdrawn was the **verb**, not the
selection.

**Why the batch SAVES rather than OPENS.** Each row's url is a presigned link and the per-row **view**
opens a new tab. Five of those from one click is five popups: a browser lets the first through and
blocks the rest, so a "view all" control would tell the renter it opened five papers and open one. That
is a control that silently does one thing when five were asked for — the exact failure AC-69 forbids at
row level, moved up to the group. So:

- the **batch downloads**, fetching each selected file and saving it, reporting how many landed; and
- **view stays per row**, where a click is a user gesture and the tab always opens.

**A row with no url is listed but cannot be ticked.** There is nothing to open or save behind it. AC-69
already refuses a dead control on such a row; a tick that yields nothing when the batch runs is that
same dead control one step later. (The **equipment** tab's rule is the near-opposite one and stays that
way: there, a **missing** paper is exactly the row worth ticking, because ticking it asks for it. Stated
as *missing*, not *url-less* — see §9: a paper can be on the file with no signed link, and the
operator's rows carry no link at all.)

### 8.2 One checkbox column, two mutually exclusive modes — owner's UI design, 2026-08-08

**Selection stops being one thing.** There is **one** checkbox column on the equipment documents tab and
its meaning is set by **the first tick**:

| Ticked set | Mode | Tickable | Live footer button |
|---|---|---|---|
| empty | **neutral** | every row any batch can answer | **neither** — both visible, both disabled |
| a **held** row was ticked first | **download** | the held rows | «تنزيل», carrying the count |
| a **missing** row was ticked first | **request** | the missing rows | «اطلب من المؤجّر إرساله», carrying the count |

The kind that does not match the mode **dims to 45% and stops responding**, so a selection can never mix.
Clearing the last tick returns to neutral and re-enables everything.

**What this does NOT change.** *You can only ask for what is not there* (§9) survives exactly: a held
paper is **never requestable**. What changes is that a held row becomes **tickable** — for a different
act. A **held row with no url** is untickable in **every** mode, as it already was: nothing to save and
nothing to ask.

**Both footer buttons stay visible**, only the supported one live. The disabled one keeps the same
**shape** — greyed, a paler border, muted text, 70% opacity, `not-allowed` cursor. Hiding it would make
the panel change shape under the renter's first tick and hide the fact that one column does two things.

**Select-all follows the mode** — «حدّد كل المتاح» / «حدّد كل الناقص» — with «إلغاء التحديد (n)» to clear
back to neutral. At neutral, where there is no mode to follow, **both** links may appear rather than one
being chosen for the renter.

**A dimmed row must be inert, not merely faded.** Its input is `disabled`, marked `aria-disabled`, and
out of the tab order. A control that looks dead but still takes a click is worse than one that looks
alive.

**The company panel is the single-mode case and needs no fork.** A company row is never requestable, so
its only possible mode is *download*: the dimming path is unreachable, the select-all reads
«حدّد كل المتاح», and there is **no** request control — company papers are read, not requested (AC-71,
AC-72).

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-77 | web | **Given** the equipment documents tab with nothing ticked **Then** every row a batch can answer is tickable and **both** footer buttons render disabled; **When** the renter ticks a **held** row **Then** the selection is in **download** mode, the missing rows dim to 45% and become inert (`disabled`, `aria-disabled`, out of the tab order), «تنزيل» goes live carrying the count and the request button stays disabled; **When** he ticks a **missing** row first **Then** the mirror holds, «اطلب من المؤجّر إرساله» goes live and the held rows go inert; **When** he clears the last tick **Then** the selection returns to **neutral** and every row is tickable again. **And** a **held row with no url** is tickable in **no** mode, and a **held** row is requestable in **none** |
| RM3-AC-78 | web | **Given** a selection in either mode **When** select-all is used **Then** it covers **only that mode's rows** — «حدّد كل المتاح» over the held, «حدّد كل الناقص» over the missing — and «إلغاء التحديد (n)» clears back towards neutral; **When** the live button reports a count **Then** it is the count the batch beneath it would actually act on, and the other batch is empty. **And** however a selection was arrived at, a document **request** still names only rows whose status is **missing** |

| ID | AC | Layer | Where | What it pins |
|---|---|---|---|---|
| RM3-TC-26 | AC-77, AC-78 | web | `tests/unit/machine-panel.test.ts` | **New 2026-08-08 (§8.2).** The mode is inferred from the first tick and is a **pure function of the rows and the ticked set** — no stored mode: a held row ticks *download*, a missing row ticks *request*, nothing ticked is neutral; while a mode holds the other kind is untickable, and clearing the last tick restores all of them; a held row with **no url** and the operator's certificates are tickable in neither mode; select-all's two key lists are disjoint and neither can reach the other's rows; each batch is **empty** for the other mode's selection, a row holding several files yields one target per file named apart, and a request draft composed over **every** row still names only the missing ones |

## 9 · One rule for every document row — decided 2026-08-08

**Product decision**, written up normatively in 004 §6.6 and §6.6a. Restated here with its ACs because
it replaces a design this addendum's §7 was written on top of.

Every document row, in **every** family — photos, proof of ownership, equipment certificates, operator
documents — obeys one rule:

| | Held | Absent |
|---|---|---|
| **Required** | shown · green · openable · **not requestable** | **red, "no document yet"** · counted · requestable |
| **Not required** | shown · openable · no verdict, no colour, not counted · not requestable | **not rendered** |

**Corrected later the same day — you can only ask for what is not there.** ~~A required row is
requestable held or not~~: the owner withdrew the "legible re-scan" argument, because an ask naming a
paper the lessor can see on his own file can only be answered *"it is already there."* Requestable is
therefore **exactly** the missing rows, and a group with nothing missing offers no batch control at all.

**Required** = asked for by this request (the certs, as `computeUnitReadiness` derives them) **or**
platform-mandatory regardless of the request (`front` and `serial`/plate photos, proof of ownership —
the set `bid_readiness.dart` holds the lessor to).

The rationale, and the withdrawal, are in 004 §6.6: the platform already refuses to fail a party on
something nobody asked for, and the fixed rows were the one place that rule broke.

| ID | Layer | Criterion |
|---|---|---|
| RM3-AC-73 | web | **Given** any document row in any family **When** the tab renders **Then** a **required** paper renders whether held or not — green and **not requestable** when held, red and counted and requestable when absent — and a **not-required** paper renders only when it is held, carrying no verdict, no colour, no place in the attention count and no checkbox. **Requestable is exactly the missing rows**, and a group with none of them renders no select-all bar. *(Amended later on 2026-08-08. As first written this said only "red and counted and requestable when absent" and left the held case silent, and the implementation read the silence the other way — a required row was selectable held or not, for a legible re-scan. The owner withdrew that: you can only ask for what is not there.)* |
| RM3-AC-74 | web | **Given** the photo group **When** it renders **Then** `front` and `serial`/plate render whether uploaded or not and go **red** when absent, `meter` and `side` render **only when uploaded**, and the group's count is over the rows that actually render — never "of 4" |
| RM3-AC-75 | web | **Given** the equipment documents tab **When** it renders **Then** the operator's papers are a **third group** with their own rows and their own attention count, each row stating **only whether that certificate is on file** — green or red, **no view, no download, no url** — and requestable exactly when it is absent; covering `operating_license` · `operator_tuv` · `operator_spsp` · `operator_id` · `operator_insurance`, and **not** identified by an `operator_` prefix, which `operating_license` does not carry. The rows are the certificates **this request asked for**, read from `computeUnitReadiness`'s `operatorCerts` (`present`, ignoring `url`); an operator paper nobody asked for raises no row. *(Rewritten later on 2026-08-08. It read "each viewable, downloadable and requestable". **Withdrawn by the owner**: nothing validates an operator document on upload, so a file the renter can open presents an unchecked upload as verified evidence, and this surface exists to answer* can I trust this? *— presence is a fact the platform can stand behind, the contents are not. Requestability narrowed with it, per AC-73.)* |
| RM3-AC-76 | web | **Given** a row whose family holds **more than one** file **When** it renders **Then** every held file is reachable — a row must never expose the first file and silently drop the rest. *(Scoped 2026-08-08 to the families that expose files at all: ownership and equipment certificates. The operator's rows were the example this was found on and are now out of its reach entirely — they expose no file, so there is no first one to drop, AC-75.)* |

## 10 · A known and accepted divergence — proof of ownership in the readiness fraction

**Owner's ruling, 2026-08-08: follow existing behaviour, do not change it.** Recorded here so the next
reader finds a decision rather than a bug, and so a tester does not raise it.

The two readiness scorers count a different denominator:

| | Denominator | Proof of ownership |
|---|---|---|
| web `bid-readiness.ts` | `total = 1 + certs` | **excluded** |
| mobile `bid_readiness.dart` | `total = 2 + certs` | **included** |

So a machine with no ownership paper reads **50% to the lessor and 100% to the renter**.

**The consequence, stated plainly:** after §9's rule the documents tab marks that paper **red** —
required, absent — while the readiness band beside it can read **green**. That is the accepted state.
The row is a fact about one paper; the band is a fraction over a different set.

⚠️ **The web comment's stated reason is stale.** It says the exclusion exists because *"the backend
strips it from the renter's `offeredUnitsDetail`"* — but `RENTEE_HIDDEN_DOC_TYPES` has been deleted and
ownership papers now reach the renter with usable urls. The exclusion no longer rests on redaction. It
rests on the band argument alone: a fraction that counted a paper the renter cannot influence would hold
every supplier permanently short of 100%, which is a different claim from "this machine is missing a
document" and is not what the band is for.
