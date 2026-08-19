# Deal-room draft quotation — download before CLOSED

Let the renter open/download the quotation while the room is still `OPEN` / `NEGOTIATING` /
`AWAITING_SUPPLIER_CONFIRMATION`, reflecting the live negotiated position, clearly marked as a
**draft** rather than the signed document.

## TL;DR

| Question | Answer |
| --- | --- |
| Does mobile need work? | **No** — the pre-close preview link is merged to `origin/main`. |
| Does the backend need a change? | **No** for the core feature. One *optional* field (`supplier.email`). |
| Backend deploy? | Only if we take the optional field. |
| App store release? | **No.** |
| What actually ships? | **Web only** — one Amplify deploy. |
| Spec change? | Yes — `deal-room-negotiation/spec-final.md` says CLOSED-only. Amend it. |

## Scope correction — read this first

A pre-acceptance quotation export **already exists on web**, from the bid-card selection
(`RequestBids.tsx:264` / `GroupBids.tsx:264`, shared template `lib/quotation/render.ts`), gated
only on selection + verification tier — no acceptance required. Mobile's in-room "preview" builds
from the **same source** (`buildQuotationDocumentArgsForBid`, routed by `bidId`).

And the bid row is **not** stale on price. `deal-room.service.ts` writes PRICE counters straight
back to `bid.priceAmount`:
- `updateTerm` PRICE counter — `:1600-1618` (*"mobile/014 PRICE term writeback"*)
- `batchUpdateTerms` PRICE — `:1937-1947`
- `proposeRate` — `~:2152`

**So the capability is not the gap.** Two narrower gaps remain:

1. **Non-price negotiated state never reaches the bid.** The writeback covers `priceAmount` (and
   the supplier's `note`) only. Negotiated non-price terms, mob/demob unit counts, and leg
   exclusions live in deal-room tables — which is why `DealRoomView` carries `mobUnits`,
   `demobUnits`, `mobExcluded`, `demobExcluded` separately, and why `computeDealTotals` needs
   them. A bid-card export is therefore correct on price and blind to everything else negotiated.
2. **Entry point.** Web makes the renter leave the room and return to the bids list. Mobile has a
   link in the room. Convenience only.

Gap 1 is the only real capability gap, and fixing it puts web **ahead of** mobile rather than at
parity — mobile's preview has the same blindness.

**Also worth fixing regardless:** the three writebacks are wrapped in `try/catch` +
`logger.warn` (`:1619-1621`, `:1948-1950`) — best-effort, not transactional. A failed writeback
leaves the bid at the old price with no signal, so *any* bid-derived quotation can silently go
stale. That's a backend robustness issue independent of this plan.

### Recommended scope

Build the deal-room draft from `room` (gaps 1 + 2 together) — that is the version that is
actually correct mid-negotiation. Sections W1–W8 below assume this. If only gap 2 matters to you,
the whole thing collapses to "add an in-room link to the existing bid-card export," which is a
few lines and none of W1/W3/W4.

---

## 1. Current state, per platform

### Mobile — already implemented ✅

`apps/mobile/lib/features/deal_room/presentation/widgets/deal_price_card/quotation_button.dart`
has two destinations, and its own doc comment states the intent:

- `status == closed` → **"Final quotation"** (`dealViewQuotationSigned`)
- anything else → **"Preview quotation"** (`dealViewQuotationDraft`)
- `abandoned` → button hidden entirely (`:43`)

The comment at `:16-20` names the exact risk this design guards against:

> *"an agreed price is not a closed deal: the supplier still has to confirm. An unlabelled
> 'quotation' mid-negotiation is how a rentee concludes the deal is done and stops chasing it."*

Wiring — `deal_room_page.dart:940-977`:
- rentee-only (`if (!isSupplier && state.dealRoom != null)`)
- PostHog `deal_room_quotation_viewed` with `kind: 'signed' | 'draft'` + `room_status`
- **both** paths `pushNamed(RouteNames.bidQuotation, {bidId})` — deliberately the same document
  (`:954-957`: *"Two rentee routes to 'the quotation' must not land on two different documents."*)

`bid_quotation_page.dart` then builds via `buildQuotationDocumentArgsForBid(...)`, renders, and
exports a **client-side** PDF (`buildRasterizedQuotationPdf` → `Share.shareXFiles`, filename
`quotation_<bidId8>.pdf`). No backend PDF involved.

**Two caveats about mobile's implementation** (decide whether web copies or improves on them):

1. Mobile's draft is built from the **BID**, not the live deal-room state. Price *is* live (the
   backend writes counters back to `bid.priceAmount` — see "Scope correction"), but negotiated
   non-price terms, mob/demob unit counts, and leg exclusions are **not** on the bid, so the
   preview misses them. Web rendering from `room` would be strictly more accurate than mobile.
2. **The document itself carries no DRAFT marker.** Only the *button label* differs.
   `quotation_lifecycle_header.dart` shows a validity chip (`valid until` / `expired`), not
   draft-vs-final. So a mobile user who exports a preview PDF gets a file that looks final.

### Backend — no change needed

Every field the web needs pre-close is already served:

| Needed | Pre-close source | Change? |
| --- | --- | --- |
| `agreedRate` | `room.rate` — already the fallback (`DealRoom.tsx:70`) | No |
| `priceUnit` | `room.priceUnit` — already the fallback | No |
| `contractType` | `room.contractType` — already the fallback | No |
| `agreedTerms` | `room.terms` (`state`, `value`, `platformDefault`) | No |
| `renteePhone` / `renteeEmail` | `/api/me` (`api/me/route.ts:57,64`) | No |
| `supplierPhone` | `room.supplier.phone` — *"always present"* (`deal-room.ts:13`) | No |
| `quotationNumber` | no row yet → use `room.shortCode` | No |
| `supplierEmail` | **not on `DealParty`** | **Optional** |

`supplierEmail` is a pre-existing known gap (`bids.ts:731`: *"not in the bid-list projection yet
— null until the backend adds it"*). Adding it = one field on the deal-room projection, `npm run
backend:deploy` (serverless), **no Prisma migration**. Ship the web change without it; the row
just renders `—`.

**One thing to verify first:** whether `GET /api/deal-rooms/{id}/quotation` errors before CLOSED
(no `Quotation` row exists until the supplier's `confirmDeal`). This decides step W2 below.

### Web — the gap

Both download entry points are behind `const closed = room.status === "CLOSED"`
(`DealRoom.tsx:592`):
- price-bar CTA — `:717-719`
- composer quote bar — `:836-841`

`AWAITING_SUPPLIER_CONFIRMATION` shows only **Withdraw** (`:722-725`). No draft path exists.

**Real-time is already solved — nothing to build.** `room` refreshes on a 15s poll (`:348`) plus a
1.5s-debounced refetch on every Stream `message.new` (`:377-384`), and both run *only while the
deal is non-terminal* — precisely the pre-close window. Rendering the draft from `room` at click
time is current by construction.

---

## 2. Web implementation

### W1 — split the document into `final` | `draft`

`buildQuotationHtml(room, q, renteeName, ar, L)` → add a `kind: "final" | "draft"` param.
`q` becomes optional (`QuotationView | null`).

The existing `q.x ?? room.x` fallbacks (`:70`, `:82`) already make the draft path work with
`q = null`. Fields needing draft branches:

- `qnum` (`:81`) — `final`: Quotation row. `draft`: `room.shortCode` (REQ-NNNNN) or `—`. **Never
  mint a quotation number for a draft** — that's what makes a document look issued.
- `q.agreedTerms` (`:161`, `:164`) — `draft`: derive from `room.terms`. See W3.
- party contacts (`:181-192`) — `draft`: `room.supplier.phone`, `/api/me` phone + email.
  Supplier email → `—` until the optional backend field lands.
- `legal` (`:205`) — `final`: keep. `draft`: replace *"valid for 7 days from the issue date"*
  with a not-binding line. A draft has no validity period.
- `wrapQuotationPage` title (`:207`) — `final`: "Confirmed Quotation". `draft`: "Draft quotation
  — not final".

### W2 — draft path in `downloadQuotation`

`downloadQuotation` (`:298`) opens with `await fetchQuotation(id)` (`:303`). Pre-close there is no
Quotation row, so this likely 404s straight into the `catch` → *"Couldn't load the quotation."*

**Mandatory fix — relaxing the `closed` gate alone is not enough.** Either:
- skip `fetchQuotation` entirely when `!closed`, or
- keep the call, swallow its failure, and fall through with `q = null`.

Pick based on the backend verification above. Skipping is safer and one fewer round-trip.

### W3 — unresolved terms must not read as agreed

Pre-close, `room.terms` holds `disputed` and `pending` alongside `fixed` / `agreed` /
`soft_accepted` (`TermState`, `deal-room.ts:17`).

- `agreed` / `soft_accepted` → the "Agreed terms" card, as today
- `fixed` → "Fixed terms" card, unchanged (`:166`)
- `disputed` / `pending` → **a separate "Still under negotiation" card**, not silently printed as
  settled

This is the one place where printing the raw current value would actively mislead.

### W4 — visible draft marking (the part mobile skipped)

The button label alone is not enough once the file leaves the browser:
- header badge — "DRAFT / مسودة"
- diagonal watermark in `render.ts` behind the body, gated on `kind === "draft"`
- download filename prefixed `draft-`
- pre-close CTA label: "Preview quotation" / "معاينة" — matching mobile's wording

### W5 — surface the CTA pre-close

`:717-741` — currently `closed ? download : awaiting ? withdraw : negotiate`. Add the draft link
**alongside** the existing state CTAs, not replacing them: `awaiting` must keep **Withdraw** as
its primary action, with the draft as a secondary link. Keep it hidden for `abandoned`, matching
mobile (`quotation_button.dart:43`).

### W6 — decide the chat-attachment inconsistency

Attachments are locked by the same `closed` flag with the tooltip *"Available after the deal is
confirmed"* (`:792-807`). Once a priced draft can be exported pre-close, that lock looks
arbitrary. Not a blocker — but decide it deliberately rather than discovering it in UAT.

### W7 — analytics parity

Mobile fires `deal_room_quotation_viewed` with `kind` + `room_status`. Match it so the two
platforms are comparable in PostHog.

### W8 — tests

Extend the existing quotation tests: draft renders with `q = null`; totals identical to the price
bar in both kinds (`computeDealTotals` is shared, so this is a regression guard); no quotation
number on a draft; disputed terms land in the negotiation card, not the agreed card.

---

## 3. Order of work

1. Verify the pre-close behaviour of `GET /api/deal-rooms/{id}/quotation` → settles W2.
2. Decide W6 (attachments) and whether web renders the draft from `room` (more live than mobile)
   or from the bid (strict mobile parity). **Recommend `room`** — it's what the renter is looking
   at, and it's already live-refreshed.
3. W1 + W2 + W3 (the render split — the bulk of it).
4. W4 + W5 (marking + entry point).
5. W7 + W8.
6. Amend `spec-final.md:17` and `:51`.
7. Optional: backend `supplier.email`, separately deployable, before or after.

## 4. Deployment

- **Web** — Amplify build from `main` (`amplify.yml`). The whole feature ships here.
- **Backend** — nothing required. If we take `supplier.email`: `npm run backend:deploy`, no
  migration, backward-compatible (web already tolerates `null`).
- **Mobile** — nothing. No store release, no TestFlight, no forced upgrade.
- **Rollback** — restoring the `closed` checks reverts it; no persisted state is written, since
  the draft is rendered client-side and never stored.

## 5. Risks

| Risk | Mitigation |
| --- | --- |
| Renter treats a draft as final and stops chasing the supplier | W4 marking + no quotation number + no validity line |
| Web draft (from `room`) shows different numbers than mobile's (from the bid) | Accept knowingly, or align mobile to `room` in a later app release |
| Mobile's exported preview PDF has no draft marker | Pre-existing mobile issue this plan surfaces; fix in the app repo separately |
| Draft numbers drift from the price bar | Both already share `computeDealTotals`; W8 guards it |
