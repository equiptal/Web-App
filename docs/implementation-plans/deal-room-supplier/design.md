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

**⚠ One mapping to settle.** The mockup uses two different refusals, and `rentee_request_reply`
carries `resolution: provided | declined | unavailable`:

- **«غير متوفّرة»** (availability) — the machine cannot serve this bid → `unavailable`.
- **«لا أملكه»** (documents) — *I do not have that paper*. That is closer to `unavailable` (it does
  not exist) than to `declined` (I will not give it to you), but the two read very differently to the
  renter, and `declined` is the one his card renders as **refused** rather than *waiting*.

**Decide before S4 ships.** Whichever is chosen, the renter's card must not read *waiting for the
lessor* for either (RM3-AC-55).

---

## 3 · S6 — the bid card carries the pending request

**New, from the mockup.** Today the lessor's bid card CTA is driven by the 6-state lifecycle:
`bidUiStateFromWire(bid.uiState)` → `BidStatePill` + a CTA that opens the deal room
(`v3_bid_card.dart`). It says things like *your turn* and *open the deal*.

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
