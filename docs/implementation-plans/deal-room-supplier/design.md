# Supplier side — the request card, and the bid card that carries it

Design fixed from the owner's mockup, 2026-08-08. Implements **S2 · S3 · S4 · S5** of
`docs/specs/004a-addendum-chat-and-the-request-loop.md` §3.4, and adds **S6**, which the mockup
introduces and the addendum does not cover.

**Layer: `apps/mobile` only.** The lessor stays in the app he already uses. Nothing here is a new
screen — a card inside the existing deal-room chat, a sheet, and a label change on a card that
already exists.

---

## 1 · The card, as drawn

Same shell for every kind. The renter's `ChatCard` and this one are the two ends of one conversation,
so they share their vocabulary: the ref, the machine, the ask, the state.

```
┌──────────────────────────────────────────────────────────┐
│  RQ-7F3A    FD30T-118207   كوماتسو FD30            ▣    │   ref · serial · name · taxonomy tile
│                                                          │
│  طلب تأكيد التوفّر                                        │   the ask, named
│  أكّد أن هذه المعدّة متاحة لهذا العرض، وحدّد الساحة        │   what he is being asked to do
│  التي ستخرج منها.                                        │
│  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈  │
│  ● بانتظار ردّك                                          │   state
│  ┌──────────────┐  ┌────────────────────────────────┐   │
│  │ غير متوفّرة   │  │        حدّد الساحة              │   │   refuse · act
│  └──────────────┘  └────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

A **document** request differs only in its middle: the ask names the types as chips —
«الاستمارة» «شهادة الفحص» — and the buttons read «لا أملكه» / «ارفع المستندات».

### What the anatomy commits us to

| Element | Consequence |
|---|---|
| **The machine's name, serial and image** | resolved from `equipmentId` **at render time** (RM3-AC-50), never parsed out of the message text. A card that named the machine in prose could not survive a rename and could not show a thumbnail |
| **The `ref` (RQ-7F3A)** | displayed, because the renter's reply card echoes it back as `↩ ref · serial`. The two must read as a pair |
| **The doc-type chips** | come from `docTypes[]` on the card payload — one card carries many types (§6.7.2), never zero |
| **The primary button names the ACT** | «حدّد الساحة», «ارفع المستندات» — not «ردّ». The lessor should know what he is about to do before he taps, and the label is the only thing that tells him |
| **«بانتظار ردّك»** | *awaiting your reply* — the mirror of the renter's *unanswered*. Neither side's copy may imply a refusal that was never made |

---

## 2 · The two buttons, and what they mean on the wire

The primary is **S3** — the deep link into the screen that answers the ask:

| Kind | Primary | Lands on |
|---|---|---|
| `availability` | **حدّد الساحة** | readiness, **that unit**, yard sheet open |
| `document` | **ارفع المستندات** | that machine's upload, **pre-filtered to those `docTypes`** |
| `alternative` | **أضف معدّة** | the add-equipment form, then the commit step (§3.2c) |

On a **successful write**, the app posts `resolution: 'provided'` by itself (RM3-AC-56). On a failed
write it posts **nothing** (AC-57) — a reply must never claim an answer the data does not show.

The secondary is **S4** — the refusal, which has no other way to reach the renter, because a "no"
changes no state anywhere.

**Settled by the owner, 2026-08-08: there is exactly ONE refusal, and it is `unavailable`.
`declined` is never offered and never emitted.**

Both secondary buttons — «غير متوفّرة» on an availability card and «لا أملكه» on a document card —
post `resolution: 'unavailable'`. The wording differs because the thing being refused differs; the
meaning does not.

**Why one and not two.** `declined` means *I have it and will not give it to you*; `unavailable`
means *it does not exist*. Only the second is a fact the lessor can state about himself. The first is
a motive, and asking a lessor to declare one on a marketplace invites him to say nothing at all —
which is the outcome this whole loop exists to prevent. A refusal that costs him nothing to send is a
refusal the renter actually receives.

**Consequences to hold to:**

- **No UI anywhere emits `declined`.** Not this card, not a composer, not a debug path.
- **Readers keep handling it.** `rentee_request_reply`'s `resolution` stays a three-value union and
  the renter's card keeps rendering `declined` as refused. It costs nothing, and a reader that
  crashed on a value the contract permits would be a worse failure than a branch nobody reaches.
- **`unavailable` is a definitive ANSWER, not a non-answer.** The renter's card must read refused —
  never *waiting for the lessor* (RM3-AC-55). Getting this wrong leaves him waiting for a reply he
  already has, which is the exact failure the reply card was introduced to fix.

**RM3-AC-54 is now wrong** — it says a refusal carries `resolution: 'declined'`. It must say
`unavailable`, and the spec should state that `declined` is contract-legal but never produced.

---

## 3 · S6 — the bid card carries the pending request

**New, from the mockup. Shipped 2026-08-08 (`40aeb3f9`).**

**⚠ Corrected while building it: the lessor's card is `_BidCard` in `my_bids_page.dart`, not
`v3_bid_card.dart`.** This section originally named the latter and was wrong — that file is the
**renter's** view of a lessor's bid (`markBidViewedByRentee`, a header showing `bid.supplier`,
«ملاحظة المورد», `MyOffersBloc`). Every `renteeRequestTargetFor` destination is lessor tooling, so a
«حدّد الساحة» CTA placed there would have sent the renter into sheets he cannot use.

The consequence is that the lifecycle machinery this section assumed does not exist on the lessor's
card: `MyBidItemModel` carries no `uiState`, and there is no `BidStatePill`. The label a pending ask
displaces is «فتح غرفة الصفقة» / «عرض التفاصيل», driven by `_shouldOpenDealRoom`. The rule is
unchanged in spirit — a pending request beats the general state.

**The change:** when a request is unanswered, the same button says **what the renter asked for** —
«حدّد الساحة», «ارفع المستندات» — in place, in the existing button, with only the label and the
destination changing.

The point is that the lessor answers from the list, without opening a conversation to discover there
was a question in it. It is the same argument the renter's side made for the arrival notice: a state
that only a badge announces is a state that gets missed.

### Three things to resolve, in order of how much they matter

**1 · Where does the bid card learn a request is pending?** This is the load-bearing question, and it
is the reason S6 is not a label change. The bids list does not read chat messages today. Two routes:

- **Derive it client-side** from the room's messages — needs the list to hold room state it currently
  does not, for every bid on screen.
- **Carry it on the bid payload** — a small server-side projection (`pendingRequest: {ref, kind,
  equipmentId, docTypes}` or just a count), computed the same way §7.13.4's precedence already
  computes a card's verdict.

The second is smaller at the client and matches how every other lifecycle signal already reaches this
card. It is a backend change, so it needs its own ticket.

**Decided 2026-08-08: client-side, and the backend ticket is dropped.** The request cards are already
in Stream and the app already parses them (`5f9751b4`), so one `queryChannels` covers every room on
screen and reuses one vocabulary instead of inventing a second. No schema change, no endpoint.

**1b · How it reads them — one query per list load, no live connection.** Two alternatives were
weighed and rejected:

- **A live connection**, so the button changes the moment the renter sends. Rejected because the
  deal-room page already builds its own client and disposes it on exit, and two live connections for
  one user fight. The web side hit exactly this: leaving the deal room tore down the chat dock's
  channels, because the client is effectively a singleton and the cleanup disconnected
  unconditionally. Making it safe means hoisting the connection to app level and reference-counting it
  everywhere — risking the conversation he is *in* to refresh a button on a list.
- **One query per bid.** Ten cards on screen, ten calls per refresh, for the same answer.

**The cost, stated rather than hidden:** a request arriving while he is looking at the list does not
change the button until he refreshes. Acceptable because a request is not answered in the same second
it arrives — he finds it on his next look, which is when he would have acted anyway.

**Not a one-way door.** The reading logic is identical either way; only where the connection lives
changes. The case that would justify moving is lessors *waiting* on that list like a dispatch queue,
and nothing in the flows says they do.

**2 · What wins when both are live?** A request can be unanswered *while* it is also his turn to
counter. Recommended: **the request wins while unanswered** — it is a specific question about a named
machine with a one-tap answer, where *your turn* is a general state he can act on at any time. State
the rule explicitly rather than letting render order decide it.

**3 · More than one unanswered request on one bid.** The renter can ask about availability and
documents on the same machine, or about several machines. The button cannot say two things.
Recommended: show the **oldest unanswered** and mark that there are more (a count), so nothing is
hidden and the order is predictable — first asked, first answered.

---

## 4 · What this does NOT change

- **The lessor's deal room stays as it ships.** The redesign is the renter's surface; the lessor
  receives requests and acts on them in the app he has.
- **No new permission.** `S1` is gone — the readiness gate was fixed upstream, so a lessor can
  confirm a yard or upload a document with a deal room open. Only a **count** change is refused
  (`BID_OFFER_LOCKED`), which is correct.
- **The wire contract.** `rentee_request` and `rentee_request_reply` are unchanged; this is
  presentation and wiring.

---

## 5 · Ticket set

| | Ticket | Layer |
|---|---|---|
| **S2** | Render `rentee_request` as the card above — machine resolved from `equipmentId` at render time | mobile |
| **S3** | Wire each kind to its exact target | mobile |
| **S4** | Auto-reply on success + the explicit refusal sheet | mobile |
| **S5** | Render `rentee_request_reply` on **both** sides | mobile + web |
| **S6** | The bid card's CTA carries the pending request | mobile **+ backend** (see §3.1) |

**Sequence:** S2 → S3 → S4 → S5, with S6 after S2 (it needs the same resolution logic). The renter's
side ships useful alone, but **the moment requests go live S2 is required**, or every ask lands
invisible.
