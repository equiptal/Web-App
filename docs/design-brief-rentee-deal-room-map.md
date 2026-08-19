# Design brief — the renter's deal-room map

Context for design work. Everything here is decided product behaviour; the full spec is
`docs/specs/001-deal-room-rentee-map.md` (long — you shouldn't need it).

---

## The product

A Saudi heavy-equipment rental marketplace. A **renter** (مستأجر) posts a request — *"one 3-tonne
forklift, 14 days, with an operator, at this site"* — and **suppliers** (موردون) bid on it. When the
renter engages a bid, a **deal room** opens: a chat plus a price-negotiation bar.

**Arabic, RTL, desktop web.** The mobile app is a separate Flutter product; this surface is web only.

## The problem this surface solves

A renter with six bids can compare prices easily and can compare nothing else. He cannot tell:

- **where the machines actually are** — a cheap bid 200 km away costs more once mobilised;
- **whether the supplier has committed to a specific machine at all**, or just typed a number;
- **whether the machine has the papers** the request asked for.

So the cheapest bid wins, and the disappointment arrives later.

## What the surface is

Inside the deal room, a **map view** that answers *"is this offer real, and where is it?"*

- The map opens on **the project site only**. No pins for suppliers or bids.
- A **panel floats over the map's leading edge**, listing the received offers, cheapest first.
- Selecting a supplier draws **his machines** as pins — one per physical machine — and the panel
  switches to listing those machines.
- Selecting a machine opens a **detail drawer**: photos, how it matches the request, its documents,
  the company's documents.
- The existing **price bar** stays pinned at the bottom, unchanged.

## The vocabulary — please keep these distinctions visible

| Concept | Arabic | What it means |
|---|---|---|
| Offer / bid | عرض | one supplier's quote on one request |
| Machine / unit | معدّة / وحدة | one physical machine, identified by a serial |
| Yard | ساحة | where a machine is parked; drives distance |
| **Confirmed** | مؤكّدة | the supplier named the yard this machine ships from |
| **Not confirmed** | غير مؤكّدة | he hasn't — the machine may still be available |
| **Claimed** | عدد بلا معدّة مسجّلة | he offered *3 units* but registered only 2 machines |

**The offered-vs-registered gap is the heart of it.** A supplier can offer 3 and register 1. The
renter must see that without being told twice.

## Colour — one scale only, and it was hard-won

**Green = availability confirmed. Red = not confirmed. That is the only meaning colour carries.**

Distance does **not** colour anything (it's a filter). Neither does price or supplier rating. An
earlier design had two scales — a supplier-level aggregate and a machine-level one — and renters
learned red in one state and met amber in the next. Don't reintroduce a second scale.

One nuance worth designing well: **«غير مؤكّدة» does not mean unavailable.** It means the supplier
hasn't answered yet. Renters read red as rejection and discard suppliers who never declined anything.

## What the renter can *do* here

Three requests, each attached to one specific machine and delivered into the chat as a structured card:

1. **اطلب تأكيد التوفّر** — ask the supplier to confirm this machine's yard.
2. **اطلب معدّة أخرى** — ask about a different machine.
3. **اطلب مستنداً** — ask for specific documents (raised from the document list, not a button).

He never types these. He also cannot edit the offer — only ask.

## Fixed constraints

- **RTL.** Panels sit on the inline-end edge; anything floating must not be occluded in RTL — an
  earlier legend rendered behind the panel and was invisible exactly when needed.
- **The price bar is existing shipped UI.** Re-hosted as-is; not a redesign target.
- **No realtime.** Data refreshes on load, on focus, and after sending. Nothing animates in by itself,
  so don't design copy that promises immediacy.
- **Some offers come from outside the platform** (a supplier emailed a quote). They appear in the list
  but **can never be plotted** — they have no coordinates. They need a dignified non-map treatment,
  not an error state.
- Badges count **things needing attention**, never totals. A badge that always shows a number stops
  being a signal.

## Where design help is most wanted

1. **The equipment list.** Every machine is the same type, so cards differ only by serial, yard,
   distance and readiness. A plain list is flat and hard to scan — see `001a-equipment-panel-addendum.md`.
2. **Keeping the other offers present** once the renter has gone into one supplier, without giving
   the list back its full width.
3. **Making the offered-vs-registered gap legible** at a glance.
4. **The not-confirmed state** reading as *unanswered*, not *rejected*.

## Prototypes

`~/Downloads/deal-room-rentee-map-v2.html` — offers-panel version (matches the spec)
`~/Downloads/deal-room-rentee-map-v3.html` — equipment-panel version (the proposed change)

Both are self-contained; open in a browser. Layout only — the shipped app wins where they disagree.
