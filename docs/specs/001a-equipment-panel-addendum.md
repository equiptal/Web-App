# 001a — Addendum: the panel lists EQUIPMENT, not bids

**Status:** proposed · prototype `deal-room-rentee-map-v3.html` · amends 001 §6.2
**Date:** 2026-08-06

---

## The idea in one line

Same map, same floating panel, **different subject**: once a supplier is selected the panel stops
listing competing bids and lists **that supplier's machines**, because from that point the renter is
verifying equipment, not comparing offers.

## Why

001 made the bid list the entry point and kept it on screen in every state. That is right *while
choosing*. It stops being right the moment a supplier is chosen: the renter's question changes from
*"whose offer is best?"* to *"is this offer real?"* — and every answer to the second question is about
a **machine**, not a bid. Leaving the bid list in the panel meant the surface answering the question
was the drawer, and the panel spent its space on a decision already made.

## What the panel becomes

| State | Panel shows |
|---|---|
| No supplier selected | the offers — unchanged from 001 §6.2 |
| Supplier selected | his name + `›` back · the offer-composition bar · **one card per machine** |

**Each card:** serial (the identity — every machine here already matches the request type) · type ·
year · availability ✓/؟ in the pin's own green/red · certificate on file · yard · distance.

**Two kinds of card:**
- **In the offer** → selecting opens the machine detail drawer and focuses its pin.
- **`خارج العرض`** (owned, not offered) → not inspectable. It carries one action:
  «اطلب هذه المعدّة بدلاً منها», which is an `alternative` request bound to that `equipmentId`.

Selection is two-way: the card takes a blue accent, the pin takes a ring and a ✓.

## What this changes elsewhere

- **The map's composition box is removed.** It stated the same offered-vs-registered split as the
  panel header and rendered on top of the panel.
- **`alternative` becomes per-machine.** Previously one generic «اطلب معدّة أخرى»; now the renter can
  name the machine he means, which is what §7.13 wanted the card to carry anyway.
- The machine detail, documents, chat, price bar, requests and the map itself are **unchanged**.

## What it breaks — decide before building

**001 §6.2 says the bid list "stays visible in every state".** This addendum breaks that: the offers
are reachable only via the back chevron. That rule existed so a renter can always see he has other
options and not over-invest in one supplier.

Options: accept it and amend §6.2; or keep a one-line strip under the header
(*«٦ عروض أخرى — عُد للقائمة»*) so the alternatives stay present without paying for a full list.
**Recommend the strip** — it preserves the intent at almost no cost.

## Open

1. Should `خارج العرض` machines be a separate group rather than tagged rows in the same list? They are
   a different kind of thing — his offer versus what could be asked for.
2. Should the panel show *all* his qualifying fleet, or only what relates to this request? Currently
   all, which is what makes the alternative ask concrete.

## Not in this addendum

No backend change. No new field, no new endpoint, no change to `rentee_request`. This is a
presentation change to one panel, plus the removal of one duplicated map element.
