# 003 — Supplier deal room: the request in reach of its answer

> ## ⚠️ DRAFT — NOT AUDITED. DO NOT IMPLEMENT FROM THIS.
>
> Written before the code was read properly. It has **not** had the reference audit that 004 had, and
> at least one class of error is known to be present: it treats `yardConfirmed` as a single fact, when
> the codebase carries **two different meanings** for it — the supplier's self-report on the readiness
> card, and the renter-facing derivation that decides pin colour. Those can disagree, which is exactly
> what a supplier-facing "how the renter sees you" surface must not get wrong.
>
> Before any of this is built: audit every `file:line`, re-verify each claim about mobile behaviour
> against `apps/mobile`, and re-check which fields are renter-facing versus admin-only — the mistake
> that produced invented moderation state in an earlier draft of 004.

> **Scope decision (2026-08-06).** Deal room only. **No map on the supplier side** — see §4.1 for why,
> stated once so it is not re-proposed. The bid form is out of scope; the yard-picker moment it needs is
> recorded as a follow-up in §10, not built here.

**Prefix:** `SDR-AC-*` / `SDR-TC-*`. Platform: **Flutter** (`apps/mobile`), backend twin
`apps/backend` unless stated.

---

## 1. Problem & outcome

Spec 001 gives the renter a surface that **judges the supplier** — a red pin for an unconfirmed yard, a
document badge, a composition bar reading *«قدّم عرضاً لـ٢ وحدة، سجّل ١»*, and machines drawn hollow
because the renter *could* ask for them. It also gives the renter a way to **ask** — structured
`rentee_request` cards bound to one `equipmentId` (001 §7.13).

The supplier can see none of it, and can answer none of it.

**Outcome.** When the renter asks, the supplier sees a card, not a sentence — and the control that
answers it is in the same screen, enabled. When the renter's map marks him red, he knows, in the same
words, and one tap fixes it.

**Why this is not optional polish.** 001's correlation model (§7.13.4) has three layers. Layer 1 is
*"the supplier answers by doing the thing"* — but the doing is disabled (§3.3). Layer 3 is the echoed
refusal — the mobile client never sends one. **Two of the three layers are unreachable from the only
client the supplier has**, so `alternative` requests read *"waiting for the supplier"* forever, which is
the exact defect 001 §7.13.4 was written to prevent.

## 2. Who it's for

The **supplier** on mobile, mid-negotiation: he has bid, a deal room is open, and the renter is asking
him for something. He is not browsing and not comparing — he owns every machine in question.

## 3. Current state — three facts, each verified in code

### 3.1 The request arrives as plain text

`ChatMessage` (`deal_chat_list.dart:17-40`) carries `text` and its translations, and nothing else. **No
custom payload reaches the mobile UI.** The list renders a plain bubble or a `_SystemPill`
(`:188`, `:299`).

There is no general card parser. `rate_proposal` is read in exactly one place, to build negotiation
rounds (`negotiation_rounds.dart:140`), and never becomes a rendered card.
`deal_system_events.dart` is a **closed five-value enum** (`roomOpened`, `offerReceived`, `counterSent`,
`accepted`, `cancelled`) with an icon and a string — no payload, no actions.

So a `rentee_request` card today renders as its fallback sentence. This is the same defect spec 002
fixed on **web**; it is unfixed on **mobile**.

### 3.2 The answer lives on a different screen

`BidReadinessSection` — the controls for confirming a yard, toggling units and uploading documents —
mounts at `my_bids_page.dart:288`, behind a `_readinessOpen` toggle. It is **not** in the deal room.

### 3.3 …and that screen turns itself off exactly when the room opens

`bid_readiness_bloc.dart:472-474`:

```dart
editable:
    !_terminalBidStatuses.contains(_bid.status.toUpperCase()) &&
    _bid.dealRoomId == null,
```

The comment above it claims `dealRoomId != null` *"mirrors that server condition exactly"*. **It does
not.** The server (`bid.service.ts:412-418`) states a bid *"stays editable through its whole LIVE
lifecycle — pending, in negotiation, and accepted, **including once a deal room is open** — so the
supplier can still correct the offered unit's yard / equipment / per-unit metadata."* The
`BID_OFFER_LOCKED` guard (`:470-481`) fires **only when the offered-unit count changes**, and `:466-469`
names our case explicitly: *"same-count updates only refresh that metadata and stay allowed, otherwise a
yard confirmation would fail the moment negotiation starts."*

| Action, with a deal room open | Server | Mobile client |
|---|---|---|
| Confirm / change a unit's yard (same count) | **allowed** | **blocked** (`_onYardConfirmed:519`) |
| Swap the machine on a single-unit bid (count stays 1) | **allowed** | **blocked** (`_onUnitToggled:489`) |
| Upload a document or photo (writes to the *listing*) | **unrestricted** | **blocked** (`_onDocUploaded:582`, `_onPhotoUploaded`) |
| Change the offered count | **blocked** — correct | blocked ✓ |

**This is a live supplier-facing defect independent of 001.** A supplier who opens the readiness card
during negotiation sees dead controls, with no explanation.

### 3.4 What already exists and must be reused, not rebuilt

| Asset | Where | Reuse as |
|---|---|---|
| Per-unit readiness derivation | `bid_readiness.dart:73` | the mirror's verdict — **the same function the renter's view uses** |
| Request-vs-unit matching, ownership doc kinds | `bid_readiness.dart` (`kPooDocTypes`, `kMandatoryPhotoSlots`, `kOperatorReqCodeToDocKind`) | unchanged |
| The readiness editor | `BidReadinessSection` + `bid_readiness_sheets.dart` | mounted from a second entry point, **not copied** |
| The renter's verdict view | `RenteeReadinessSection` (`v3_bid_card.dart:152`) | the wording the mirror must agree with |
| Supplier's qualifying fleet | `getMatchedFleet` | already exists; 001 §7.12 is its renter-facing twin |

## 4. Scope

### 4.1 No map, and why — decided, do not re-propose

The renter's map earns its space because his question is **comparative and spatial**: *whose machine is
near my site?* Distance is the differentiator he cannot otherwise rank.

The supplier has no such question. **He owns every machine on that map**, and there is one project. His
only spatial decision — *which of my yards do I fulfil from?* — is **made at bid time**, is momentary,
and is a **picker**, not a browser. Every map in this app is already a picker
(`location_picker_sheet.dart`, `add_yard_page.dart`, the project step); there is **no browse map
anywhere in the product**, so one here would be a new pattern paying for a decision that was never a
browse.

**Bid and deal room are also not merged into one map view.** The two moments ask different questions —
bidding is *"which machines, which yard, what price"*, decided once; the deal room is *"what is he asking
now, what is blocking, where do we settle"*, repeated. Merging them makes the supplier navigate a
spatial UI to answer *"do you have the istimara?"*. **The machines do not move after the bid.**

### 4.2 In

- **A card renderer for the deal-room chat** — the first one on mobile (§6.2). Introduced, not extended.
- **Inbound `rentee_request` cards** render with their machine, kind and requested document types.
- **Layer-1 answers in place**: the card's action opens the existing readiness control for *that*
  machine, in the deal room, enabled (§6.3).
- **Layer-3 decline echo**: the supplier can say *no*, and it round-trips (§6.4). Closes O-2.
- **The mirror** — how this offer looks to the renter, in the renter's own words (§6.5).
- **O-1 fix**: split `editable` into `editable` / `countEditable` (§7.1).
- Unread and notification behaviour for the new card type (§6.7).
- Empty and degraded states (§6.8).

### 4.3 Out

- Any map, pin, or distance visualisation on the supplier side (§4.1).
- **The bid form** — including the yard-picker moment it needs. Recorded in §10, not built.
- Changing the price bar, the quotation, or any negotiation mechanic.
- A cross-room "all my pending requests" inbox. One room at a time, as today.
- Changing what the renter sees. 001 is normative; this spec must not contradict it.
- Any change to the offered **count** rule — the server locks it once a room exists, correctly.

### 4.4 Assumptions

0. **The shipped app is the source of truth; the prototype illustrates layout only.** Where they
   disagree, the app wins and the prototype element is dropped rather than built.
1. **One bid ↔ one deal room.** `DealRoom.bidId` is `@unique`, so the room always resolves to exactly
   one bid, and therefore to one readiness subject. This is what makes a second entry point cheap.
2. A supplier may hold **two bids on one item** — `@@unique([requestId, bidOwnerKey, equipmentId])`
   (`schema.prisma:1260`) is per *equipment*. Each has its own room. This spec never aggregates across
   rooms, so the ambiguity 001 §6.5 handles with bid-keyed tabs does not arise here.
3. Documents and photos upload to the **listing**, not to the bid — so they are never count-locked, and
   a document uploaded to answer one request improves every bid carrying that machine.

## 5. Flows

**The request arrives**
1. The renter sends an equipment-scoped request (001 §7.13). It lands in this bid's Stream channel.
2. The supplier gets a notification, and the room's unread reflects it (§6.7).
3. Opening the room, he sees a **card** — the machine's identity, what is being asked, and one action.

**Answering by doing (layer 1)**
4. He taps the action. The relevant control opens **in the room**, scoped to that machine: the yard
   sheet for an availability request, the upload sheet for a document request.
5. He confirms the yard or uploads the file. The write goes through the existing bloc handlers.
6. The card re-derives from state on the next render and reads as answered. **Nothing is stored on the
   card, and he never types a reply.**

**Saying no (layer 3)**
7. Where there is nothing to do — *«هل لديك معدّة أخرى؟»* when he has none — he taps **«لا يوجد بديل»**.
8. That sends an echo card `{inReplyTo, equipmentId, resolution:'declined'}` (§7.2). The renter's card
   resolves to *refused* instead of waiting forever.

**The mirror**
9. From the room he can open **«كيف يرى المستأجر عرضك»** — the same verdict the renter sees, with the
   fixable items first and each one a tap away from its control.

**Degraded**
- No registered machine behind the offer → the mirror states that plainly and offers the one useful
  action; no empty document furniture (§6.8).
- A request for a machine that is not in this bid → answerable only by a swap or a second bid where the
  count would change (§6.6).

## 6. Mobile surface

### 6.1 Where readiness lives — one editor, one verdict, two entry points

**Normative.** This spec adds **no new readiness implementation**.

- The **editor** is `BidReadinessSection`. The deal room mounts it, scoped to the room's bid. It is not
  reimplemented, restyled or forked.
- The **verdict** is `bid_readiness.dart:73`. The mirror renders it. The renter's surfaces render the
  same function. **If the mirror and the renter's map ever disagree, that is a defect in one of them,
  never a difference of opinion.**
- Entry points are two — My Bids (existing) and the deal room (new). Nothing else changes.

Rationale: the failure in §3 is one of *reach*, not of capability. The controls exist and work; they are
in the wrong place and switched off. Building a second readiness surface would create exactly the
drift 001 §6.9.1 spent a section removing on the renter's side.

### 6.2 The request card — the first structured card on mobile

`rentee_request` renders as a card with:

| Part | Content |
|---|---|
| **Header** | the machine — photo thumb, `modelName`, `serialNumber`. **Always**, because the request is bound to one `equipmentId` (001 §7.13.1) |
| **Ask** | one line, from `kind`: تأكيد التوفّر · مستندات · معدّة بديلة |
| **Detail** | for `document`, the requested types as chips — never a raw count |
| **Action** | exactly one primary; see §6.3 |
| **State** | derived, never stored — §6.3 |

- **The machine is shown, not just named.** A supplier with eleven forklifts cannot act on a serial
  alone.
- **The fallback sentence still renders** where the card cannot be built (unknown kind, missing
  `equipmentId`, a machine no longer his). A card that fails to parse must degrade to the text that is
  already in the message, never to an empty bubble. This is what 002 established on web.
- **No status chip on the card.** Its state is derived on every render (§6.3), so a stored chip could
  contradict the machine it describes.

### 6.3 Layer 1 — the action opens the control, in the room

| `kind` | Action | Opens | Answered when |
|---|---|---|---|
| `availability` | «أكّد الساحة» | the yard sheet for that unit | that unit's `yardConfirmed` is true |
| `document` | «أرفق المستند» | the upload sheet, pre-filtered to the requested types | every requested type appears in that unit's `documentKeys` |
| `alternative` | «اعرض معدّة أخرى» / «لا يوجد بديل» | the unit picker, or the decline echo | **not derivable** — §6.4 |

- **Derived on every render**, by re-reading the machine — never from anything stored on the message.
  This is 001 §7.13.4 layer 1, and it is why the supplier can answer *by doing the thing*.
- **The control opens scoped to the card's `equipmentId`.** Dropping the supplier into an unscoped
  readiness list and expecting him to find the right machine is what makes a two-tap answer a
  ten-tap one.
- **An answered card stays in the timeline** and reads as answered. It is a record of the conversation,
  not a to-do that vanishes.

### 6.4 Layer 3 — the refusal must round-trip *(closes O-2)*

`alternative` has **no observable counterpart** — nothing in the data means *"I have nothing else"*. So
without an explicit reply the renter's card waits forever, which 001 §7.13.4 calls out as the defect that
made a refusal invisible while it sat in the same conversation.

**Required:** a decline action that posts an echo card (§7.2). It carries `resolution: 'declined'` and
`inReplyTo`. The supplier may add a sentence; the payload does not depend on it.

**A decline is not a dead end.** After declining, the card offers *«اقترح سعراً بدل ذلك»* — the
negotiation is still live and the renter asked because he wants this deal.

### 6.5 The mirror — «كيف يرى المستأجر عرضك»

A sheet opened from the room. It shows **what the renter sees**, in the renter's words, and makes each
fixable item a tap from its control.

```
كيف يرى المستأجر عرضك

  ●  ٢ وحدة معروضة · ١ مسجّلة              ← 001 §6.3.2 composition
  ●  الساحة غير مؤكّدة  ← يظهر لديه بالأحمر     [أكّد الساحة]
  ●  ينقص: الاستمارة، التأمين                [أرفق]
  ✓  الصور مكتملة
```

- **The renter's vocabulary, not ours.** If his map says «غير مؤكّدة», the mirror says «غير مؤكّدة». A
  supplier told *"metadata incomplete"* cannot connect it to the red pin costing him the job.
- **Consequence before instruction.** *«يظهر لديه بالأحمر»* is why he should care; the button is what to
  do. Reversing them produces a chore list.
- **Fixable first, then satisfied.** Green rows are reassurance and sort last.
- **It never invents a judgement.** Every row comes from `bid_readiness.dart:73`. Where the renter's
  surface shows nothing, the mirror shows nothing.
- **No score, no percentage, no grade.** 001 §6.11's bid-quality model exists for the *renter's*
  ranking. Showing a supplier a number he can farm turns a readiness signal into a game.

### 6.6 What stays blocked, and says so

On a **multi-unit** bid mid-negotiation, adding a machine changes the offered count, which the server
locks (`BID_OFFER_LOCKED`) — correctly.

So an availability request for a machine **not in this bid** can only be answered by a swap (single-unit
bids, count unchanged) or by a second bid. Where neither applies, the control is **disabled with its
reason stated** — *«لا يمكن تغيير عدد الوحدات بعد بدء التفاوض»* — never silently dead. §3.3 is the
defect; reproducing it with better manners is not the fix.

### 6.7 Unread and notification

- `rentee_request` **inflates the unread badge**. It is a direct question from the counterparty; a
  question that does not raise a badge is a question that does not get answered. This mirrors 002's
  decision for the renter-side card, and must be an **explicit** membership of the inflating set, not an
  accident of omission.
- The push notification names **the machine and the ask** — *«طلب تأكيد توفّر — رافعة شوكية FD25-31002»*
  — not *"you have a new message"*. The supplier triages from the lock screen.
- The **decline echo does not inflate** the renter's badge beyond the existing rules for a supplier
  message; it is an answer, not a new question.

### 6.8 Empty and degraded states

| Case | Behaviour |
|---|---|
| Offer has **no registered machine** | mirror states it plainly; the only action is to attach machines. **No empty document rows, no empty photo slots** — those describe a machine, and there is none (mirrors 001 §6.3.7) |
| Card's `equipmentId` is no longer the supplier's | fall back to the message text; no action; never a broken card |
| Unknown `kind` | fall back to the message text — a client that shipped before a kind existed must not crash on it |
| Bid is terminal (withdrawn, rejected) | cards render read-only, actions absent, mirror hidden |
| Offline | cards render from cache; actions disabled with the standard offline banner, not silently inert |

### 6.9 Copy

| Key | AR | EN |
|---|---|---|
| `sdr.reqAvailability` | طلب تأكيد التوفّر | Availability requested |
| `sdr.reqDocument` | طلب مستندات | Documents requested |
| `sdr.reqAlternative` | طلب معدّة بديلة | Alternative requested |
| `sdr.actConfirmYard` | أكّد الساحة | Confirm the yard |
| `sdr.actAttach` | أرفق المستند | Attach |
| `sdr.actOffer` | اعرض معدّة أخرى | Offer another |
| `sdr.actDecline` | لا يوجد بديل | Nothing available |
| `sdr.declined` | أبلغت المستأجر بعدم توفّر بديل | You told the renter nothing is available |
| `sdr.answered` | تمّ الرد | Answered |
| `sdr.mirrorTitle` | كيف يرى المستأجر عرضك | How the renter sees your offer |
| `sdr.mirrorRed` | يظهر لديه بالأحمر | Shows red to them |
| `sdr.countLocked` | لا يمكن تغيير عدد الوحدات بعد بدء التفاوض | The unit count can't change once negotiation starts |
| `sdr.noMachines` | لا توجد معدّة مسجّلة في هذا العرض | No registered machine in this offer |

---

## 7. Contract

### 7.1 O-1 — split the gate *(client-only, no backend change)*

Replace the single `editable` with two flags:

| Flag | Meaning | Gates |
|---|---|---|
| `editable` | the bid is non-terminal | yard confirm, single-unit swap, document upload, photo upload |
| `countEditable` | non-terminal **and** `dealRoomId == null` | `_onCommitAdjusted`, and the multi-unit add/remove branch of `_onUnitToggled` |

Handlers to change: `_onYardConfirmed:519`, `_onUnitToggled:489` (single-unit branch only),
`_onDocUploaded:582`, `_onPhotoUploaded`. Keep the gate on `_onCommitAdjusted:532`.

UI call sites gated on the old flag: `bid_readiness_section.dart:304` and `:455`, plus the occurrences in
`bid_readiness_sheets.dart` — **29 references to `editable` in that file**, so each must be classified
rather than bulk-replaced. Getting this wrong in the permissive direction produces a 409 the supplier
cannot explain.

**Also correct the comment** at `bid_readiness_bloc.dart:466-471`. It asserts the client mirrors the
server exactly; it does not, and the wrong belief is what produced the bug.

**This ships as its own PR**, before or beside the rest. It is a live defect, and it is the prerequisite
for layer 1.

### 7.2 The decline echo

```jsonc
{
  "type": "rentee_request_reply",
  "inReplyTo": "<message id of the request card>",
  "equipmentId": "<the machine asked about>",
  "resolution": "declined"        // the only value this surface sends
}
```

- **`inReplyTo` is required.** 001 §7.13.4 correlates on it; without it the echo cannot bind to a card.
- **`equipmentId` is required and must match** the card's. A reply that drifts to another machine is
  rejected rather than mis-bound.
- **No free-text field in the payload.** The supplier's sentence rides in the message body, where it is
  translatable, and never becomes the machine-readable answer.
- `resolution: 'confirmed'` is **not sent from here** — a confirmation is expressed by doing the thing,
  and layer 1 outranks any echo (001 §7.13.4). Sending both would create two answers that can disagree.

### 7.3 Unread inflation

`rentee_request` joins `UNREAD_INFLATING_CARD_TYPES` **explicitly**, with the decision recorded — 002
found the renter-side omission was an accident, not a choice. `rentee_request_reply` does not join it.

### 7.4 The mirror reads existing data only

No new endpoint. The mirror composes from what the readiness bloc already loads plus
`bid_readiness.dart:73`. **If a row cannot be derived from data the renter also has, it does not
belong in the mirror** — that is the invariant keeping the two surfaces from drifting.

### 7.5 No supplier fleet endpoint is needed

`getMatchedFleet` already returns the supplier's qualifying machines for a request. 001 §7.12 adds the
**renter-facing** twin and states it must use the same subtype/capacity rule. Nothing new here.

---

## 8. Acceptance criteria

| ID | Layer | Criterion |
|---|---|---|
| SDR-AC-01 | mobile | **Given** a `rentee_request` message **When** the chat renders **Then** it is a card carrying the machine's photo, model and serial — not a plain text bubble |
| SDR-AC-02 | mobile | **Given** a card that cannot be built (unknown `kind`, missing or foreign `equipmentId`) **When** it renders **Then** it falls back to the message text, never to an empty or broken bubble |
| SDR-AC-03 | mobile | **Given** a `document` request **When** the card renders **Then** the requested types are listed as chips, never summarised as a count |
| SDR-AC-04 | mobile | **Given** any request card **When** it renders **Then** it shows exactly one primary action, resolved from `kind` per §6.3 |
| SDR-AC-05 | mobile | **Given** a card **When** its state is shown **Then** it is **derived on every render** by re-reading the machine, and no status is persisted on the message |
| SDR-AC-06 | mobile | **Given** an `availability` card **When** the action is tapped **Then** the yard sheet opens **scoped to that card's `equipmentId`**, inside the deal room, with controls **enabled** |
| SDR-AC-07 | mobile | **Given** a `document` card **When** the action is tapped **Then** the upload sheet opens pre-filtered to the requested types for that machine |
| SDR-AC-08 | mobile | **Given** the supplier confirms the yard from that sheet **When** the card next renders **Then** it reads answered, with no reply typed and nothing written to the message |
| SDR-AC-09 | mobile | **Given** an answered card **When** the timeline renders **Then** it remains in place as a record; it is never removed or collapsed away |
| SDR-AC-10 | mobile | **Given** an `alternative` card **When** the supplier has nothing to offer **Then** a decline action posts `{type:'rentee_request_reply', inReplyTo, equipmentId, resolution:'declined'}` |
| SDR-AC-11 | mobile | **Given** a decline **When** it is composed **Then** `inReplyTo` and `equipmentId` are both present and the `equipmentId` matches the card's; a mismatch is refused, not sent |
| SDR-AC-12 | mobile | **Given** a decline **When** the supplier adds a sentence **Then** it travels in the message body only — the payload carries no free-text answer field |
| SDR-AC-13 | mobile | **Given** a declined `alternative` **When** the card re-renders **Then** it offers «اقترح سعراً بدل ذلك», because declining one ask does not end the negotiation |
| SDR-AC-14 | mobile | **Given** this surface **When** any reply is composed **Then** it never sends `resolution:'confirmed'` — confirmation is expressed by doing the thing (001 §7.13.4 layer 1) |
| SDR-AC-15 | mobile | **Given** the deal room **When** the mirror opens **Then** every row derives from `bid_readiness.dart:73`, the same function the renter's view uses |
| SDR-AC-16 | mobile | **Given** the mirror **When** a row describes a problem **Then** it states the renter-visible consequence («يظهر لديه بالأحمر») before the action |
| SDR-AC-17 | mobile | **Given** the mirror **When** rows are ordered **Then** fixable rows precede satisfied ones |
| SDR-AC-18 | mobile | **Given** the mirror **When** it renders **Then** it shows no score, percentage or grade |
| SDR-AC-19 | mobile | **Given** the mirror's wording **When** compared with the renter's surface for the same bid **Then** the same state is described in the same words |
| SDR-AC-20 | mobile | **Given** a deal room is open **When** the supplier confirms a yard, swaps a machine on a single-unit bid, or uploads a document or photo **Then** the action **succeeds** — the server permits all four (`bid.service.ts:412-418`) |
| SDR-AC-21 | mobile | **Given** a deal room is open **When** the supplier tries to change the offered **count** **Then** it stays blocked, and the reason is stated — never a dead control |
| SDR-AC-22 | mobile | **Given** a multi-unit bid mid-negotiation **When** an availability request names a machine not in the bid **Then** the control is disabled **with its reason shown**, because answering would change the count |
| SDR-AC-23 | mobile | **Given** the readiness editor **When** it is reached from either My Bids or the deal room **Then** it is the same `BidReadinessSection`, not a second implementation |
| SDR-AC-24 | app-backend | **Given** a `rentee_request` **When** unread counting runs **Then** its membership of `UNREAD_INFLATING_CARD_TYPES` is explicit and recorded, not an omission |
| SDR-AC-25 | mobile | **Given** a `rentee_request` arrives **When** the push notification is built **Then** it names the machine and the ask, not "new message" |
| SDR-AC-26 | mobile | **Given** `rentee_request_reply` **When** unread counting runs **Then** it does **not** inflate the renter's badge beyond the normal message rules |
| SDR-AC-27 | mobile | **Given** an offer with no registered machine **When** the mirror opens **Then** it says so and offers only the attach action — no empty document rows and no empty photo slots |
| SDR-AC-28 | mobile | **Given** a terminal bid **When** the room renders **Then** cards are read-only, actions absent, mirror hidden |
| SDR-AC-29 | mobile | **Given** the device is offline **When** a card action is tapped **Then** it is disabled behind the standard offline banner, never silently inert |
| SDR-AC-30 | mobile | **Given** the card renderer **When** it meets any existing type (`rate_proposal`, `term_accepted`, `counter`, `term_updated`, `rate_response`) **Then** their present rendering is unchanged — this spec adds a type, it does not restyle the timeline |

## 9. Test plan

| ID | Covers | Layer | File | Assertion |
|---|---|---|---|---|
| SDR-TC-01 | AC-01, AC-03 | mobile | `test/deal_room/request_card_test.dart` | parses a `rentee_request` into a card model with machine identity and doc-type chips |
| SDR-TC-02 | AC-02 | mobile | same | unknown kind, missing `equipmentId`, and a foreign machine each fall back to message text |
| SDR-TC-03 | AC-04, AC-05 | mobile | same | one action per kind; state recomputed from a mutated machine fixture with nothing read off the message |
| SDR-TC-04 | AC-06, AC-07 | mobile | `test/deal_room/request_actions_test.dart` | the action resolves to the right sheet, carrying the card's `equipmentId` |
| SDR-TC-05 | AC-08, AC-09 | mobile | same | confirming the yard flips the card to answered on re-render; the card stays in the list |
| SDR-TC-06 | AC-10, AC-11, AC-12 | mobile | `test/deal_room/decline_echo_test.dart` | payload shape exact; mismatched `equipmentId` refused; free text stays out of the payload |
| SDR-TC-07 | AC-13, AC-14 | mobile | same | post-decline affordance present; no composer path emits `resolution:'confirmed'` |
| SDR-TC-08 | AC-15, AC-17, AC-18 | mobile | `test/marketplace/mirror_test.dart` | rows come from the shared function; fixable sort first; no numeric grade in the model |
| SDR-TC-09 | AC-16, AC-19 | mobile | same | each problem row carries a consequence string, and it matches the renter-side label for that state |
| SDR-TC-10 | AC-20, AC-21 | mobile | `test/marketplace/bid_readiness_gate_test.dart` | with `dealRoomId != null`: yard, single-unit swap and both uploads pass; count change blocked with a reason |
| SDR-TC-11 | AC-22 | mobile | same | multi-unit + not-in-bid machine → disabled control exposes its reason |
| SDR-TC-12 | AC-23 | mobile | `test/marketplace/readiness_entry_test.dart` | both entry points resolve to one widget type and one bloc |
| SDR-TC-13 | AC-24, AC-26 | app-backend | `.../stream-cards.test.ts` | `rentee_request` in the inflating set; `rentee_request_reply` absent |
| SDR-TC-14 | AC-25 | mobile | `test/notifications/request_push_test.dart` | notification body contains model and serial and the ask |
| SDR-TC-15 | AC-27, AC-28 | mobile | `test/marketplace/mirror_test.dart` | no-machine offer → attach-only, no empty furniture; terminal bid → read-only |
| SDR-TC-16 | AC-29 | mobile | `test/deal_room/request_card_test.dart` | offline → actions disabled, banner shown |
| SDR-TC-17 | AC-30 | mobile | `test/deal_room/chat_regression_test.dart` | golden: existing card types render byte-identically before and after the renderer lands |

## 10. Open questions

| # | Question | Status |
|---|---|---|
| 1 | **The bid-form yard-picker.** 001 AC-232/233 make the yard choice decide the supplier's pin colour and distance on the renter's map, but he picks a yard today with no sight of that. A small picker map (project pin + candidate yards + distance) belongs in the bid form. | **Deferred — out of scope by decision (2026-08-06).** Recorded so it is not lost. |
| 2 | Should the mirror be reachable from **My Bids** as well, or only from the room? | **Open.** The room is where the pressure is; My Bids is where he browses. Cheap to add later, so shipping room-only first is safe. |
| 3 | When a supplier holds **two bids on one item**, each room mirrors its own bid. Is a combined view ever wanted? | **Open, low priority.** No evidence a supplier thinks across his own bids the way a renter compares suppliers. |
| 4 | Does declining an `alternative` deserve a **renter-side push**, or is the in-room card enough? | **Open** — depends on whether 001's arrival surfaces already cover it. |

## 11. Changelog

| Date | Change |
|---|---|
| 2026-08-06 | Spec created. Scope set to **deal room only** by decision, with **no supplier map** — §4.1 records the reasoning so it is not re-proposed: the renter's map answers a comparative spatial question, the supplier owns every machine on it, and his one spatial decision is a bid-time picker. Grounded in three verified facts: `ChatMessage` carries only text so **no custom payload reaches the mobile UI** (`deal_chat_list.dart:17-40`) and mobile has **no card renderer at all**; the answering controls live on a **different screen** (`my_bids_page.dart:288`); and that screen **disables itself when a room opens** (`bid_readiness_bloc.dart:472-474`) on a comment that claims to mirror a server condition it does not — the server permits yard, swap and uploads mid-negotiation (`bid.service.ts:412-418`, `:466-481`) and locks only the count. Established the **one editor / one verdict / two entry points** rule (§6.1) so the mirror cannot drift from the renter's surface. Closes O-2 with the decline echo (§7.2) and O-1 with the split gate (§7.1). |
