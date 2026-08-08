# Tickets — Deal-room equipment verification (v3)

Against **`docs/specs/004-deal-room-equipment-verification.md`** (42 ACs, prefix `RM3-`).
Layout source of truth: prototype `Deal Room Map.html` + `docs/rentee-map-v3-elements.md`.
The v2 ticket detail is preserved in `archive-tickets-v2.md`; disposition reasoning in `replan-v3.md`.

Scope tags: **`[BE]`** app-backend · **`[AG]`** agents backend · **`[BFF]`** `src/app/api/*` ·
**`[CT]`** web contract/logic · **`[UI]`** web components · **`[T]`** tests.

---

## A · Landed and still correct — 13 tickets, do not redo

v3 §7 is explicit: *"No new endpoint, no new field, no migration."* Everything it renders is already
served by this work.

| | Ticket | Where | v3 still needs it because |
|---|---|---|---|
| T1 | per-unit location on `offeredUnitsDetail` | `backend/…` `4cb24531` | §7.2 — `locationSource` is **the only** availability derivation |
| T3 | bid-level coordinates + golden file | `4cb24531` | `distanceKm` on every card and chip |
| T5 | **the supplier-fleet endpoint** | `a623118a` | §7.1 — `GET /me/bids/{bidId}/fleet` is *the* data source |
| T6 | `rentee_request` card + unread + notifications | `1ed15ff5`…`89c7c3ef` | §7.3, unchanged by v3 |
| T8 | contract types + `supplierCompanyId` | web `43393c9` | `FleetMachine` / `OfferedUnitDetail` **is** v3's contract |
| T9/T10 | `bid-map.ts` + tests | web `37af3ab` | partly — see **C** |

**Tickets closed out of this plan 2026-08-08** — the code is committed and stays; only the tracking
entries are removed, because none of them belongs to this feature:

| | Was | Why it left |
|---|---|---|
| **T2** | `unitsOffered` ownership (security) | a platform hole, not a v3 requirement. Shipped `5cc1921f` |
| **T37** | per-unit `yardId` ownership (security) | same. Shipped `5c60a938` |
| **T34** | the submission VAT-sum defect | an off-platform bug fix; off-platform is out of scope in v3. Shipped `36fb087` |
| **T44** | trial-request fleet 404 | trials have no relation to this feature. Shipped `c404bedf` |
| **T36** | the shipped 50 km refine | **withdrawn** — the "a bid 180 km away can own a machine 12 km away" argument only holds where machines are on screen. On the bids list there are only bids, and a bid's distance is the honest number for a bid |
| **T7** | agents `city` / `contactInfo` | off-platform left this surface; already cherry-picked to `staging` |
| **T35** | absent company rows | off-platform bug fix, out of scope |

---

## B · Superseded — removed from scope, not built

Nothing here cost implementation time except where **C** says otherwise.

| Ticket | Why v3 removes it | Replaced by |
|---|---|---|
| T11 list∣map toggle | entry is now **clicking a bid card**, not a view mode | **V1** |
| T13 bid list panel | there is no offers list — the view is one bid | **V5** (equipment list) |
| T14 distance filter | already dropped in v2; v3 re-states it (AC-28) | — |
| T15 colour key | v3 states the scale in copy; no legend component | — |
| T18–T20 panel shell / composition bar / machine chips | v2's 3-tab panel + composition bar + serial chips; v3 has count pills, a shortfall alert, and a 2-tab detail | **V2 V3 V4 V7** |
| T21 availability & fit tab | becomes the **six-cell match grid** | **V7** |
| T22 document tabs | regrouped: presence-only equipment docs vs verification+expiry company docs, batch-selected | **V8 V9** |
| T26 notice bubble / popup / `+N` | v3 keeps only the dock's unread badge | **V12** |
| T27 chat tabs per item | one bid ⇒ one room ⇒ no tabs | — |
| T29–T32 off-platform hosting | §6.11 — off-platform **never opens this surface** | **V13** (routing only) |
| T33 edge rail | replaced by the chat dock | **V12** |

**Still live but outside this spec:** **T36** (the shipped 50 km refine on the upstream list) and
**T38–T43** (verification gates, re-pointed at `RM3-*` in **E**).

---

## C · Undo — built against v2, invalidated by v3

Do this **first**. Leaving these in place while V2–V5 land means two competing panels in one directory
and no way for a reviewer to tell which is live.

### U1 · Remove the v2 offers UI `[UI]`
- `src/components/map/BidListPanel.tsx` (225 lines) — delete
- `src/components/map/ColourKey.tsx` (69 lines) — delete
- `GroupBids.tsx` — remove the `[قائمة │ خريطة]` toggle and its 3 call sites; **keep** the refetch
  freshness path, which V1 reuses
- `map-proto.css` — drop `.bm-row*`, `.bm-sort*`, `.bm-key*`; keep pin, spinner and info-box rules
- i18n — drop `bidMap.listView` / `bidMap.view` / the sort labels; **keep** the availability strings

### U2 · Retire three `bid-map.ts` exports `[CT][T]`
- `compositionBuckets` — the composition bar is gone
- `sortBids` — no offers list; the equipment list is a plain nearest-first sort
- `colourKeyModel` — no legend
- Update `tests/unit/bid-map.test.ts` accordingly. **Keep** `unitAvailability`, `AVAILABILITY_COLOUR`,
  `resolveUnitLocation`, `isPlottable`, `decollide`, `MIN_PIN_GAP_PX`, `unitCountLabel`.
- **Edit** `unitCounts` → RM3-AC-31 (`claimed = offered − registered`, **clamped at 0**) and
  `unitIndicators` → RM3-AC-32 (availability and commitment are **one** chip).

---

## D · New tickets

Every ticket names what it **reuses** from A, because v3 adds no data.

### V1 · Entry point — **addressable by `bidId`, not embedded** `[UI]`
**AC** 01 · **Files** a new route + `src/components/map/*`

**Revised 2026-08-08.** The all-bids view is being redesigned with **several** entry points, so the
surface must not be coupled to one caller.

- **Give it its own route keyed by bid** — `/bids/[bidId]/equipment` (or `/deal-room/[bidId]/equipment`).
  Every entry point then becomes a link: today's bids list, the redesigned all-bids view, the inbox, a
  notification, a deep link from a supplier's reply. None needs to know how the surface is built.
- **Key on `bidId`, never `dealRoomId`.** A bid may have no room yet, and creating one to open a
  **read-only** view would freeze the supplier's offered count (`BID_OFFER_LOCKED`). §4 assumption 3 says
  the two are interchangeable *once a room exists*; `bidId` is the one that always does.
- If it is kept as an in-page view instead of a route, the same rule applies one level down: the
  component takes **`bidId` as its only required prop** and knows nothing else about its caller.
- **Reuse:** the refetch freshness path from T11 (mount · focus · post-send, 15s staleness).
- **Given** the surface **When** it renders **Then** it resolves exactly one `bidId`, and no collection
  of other bids is reachable from it.
- **Given** the surface opens **Then** no deal room is created — browsing stays write-free.

### V2 · Panel shell + header `[UI]`
**AC** 01, 02 · Fixed-width panel, map fills the rest (§5).
Header: company name · verified chip **only when verified** · a company-documents entry. Nothing else.
- **Given** the header **When** it renders **Then** it shows **no** contact info, deals count, IBAN, CR or
  VAT — those live in the company panel (V9).

### V3 · The counts — three cases, three sentences `[UI][CT]`
**AC** 03, 04, 08 · Pills, not a run-on sentence.

| Case | Condition | Renders |
|---|---|---|
| single | `offered ≤ 1` | one pill — owned total |
| multi | `offered > 1`, `claimed = 0` | two pills — owned, and "in this offer" |
| short | `offered > 1` **and** `claimed > 0` | the two pills **plus** V4's alert |

- **Reuse:** `unitCountLabel` for the count word; the fleet row count for the owned total (§7.1 — *"no
  new field"*).
- **Given** the type word **When** it renders **Then** it agrees in number with the count and comes from
  **the request's** type, not the machine's.

**Three alignment rules, from 004a §4 and §4a — get these wrong and every number on the surface is wrong:**
1. **"Owned" means *qualifying*, not the whole fleet.** `getMatchedFleet` filters by the request's
   subtype **and** capacity, so «٣ لدى المؤجّر» is *three that fit this request*. Copy must not imply
   total inventory.
2. **"Registered" counts `inBid === true` rows only.** The fleet response includes owned-but-not-offered
   machines; counting all rows would understate every shortfall to zero.
3. **These pills describe the OFFER, never the agreed count** (AC-65). After a negotiation sets
   `agreedUnits`, the footer prices on it — these pills do not move.

### V4 · Shortfall alert `[UI][CT]`
**AC** 05, 06, 07, 31
- Renders **only** when `claimed > 0`. Its absence must reliably mean *nothing claimed*.
- **Orange, never red** — on this surface red means availability only; a shortfall is an incomplete
  offer, not an unavailable machine.
- States the **difference**, not the offered total, and that those units **do not appear on the map**.
- Action sends an **`alternative`** request with a **null `equipmentId`**. `add_to_offer` is retired and
  rejected server-side.
- **Given** `registered > offered` **When** `claimed` is computed **Then** it clamps to 0 — never a
  negative shortfall.

### V5 · Equipment list `[UI]`
**AC** 09, 10, 11, 12, 13, 32, 33 · **Flat, nearest-first, offered machines only.**
Card: photo · model · year · **one availability chip carrying commitment** · distance from the project ·
certificate chips or an explicit *«لا شهادات على المعدّة»* · **التفاصيل ›** · **اطلب التأكيد** when
unconfirmed.
- **Reuse:** `unitAvailability` for the chip (never `yardConfirmed`); `computeUnitReadiness` for cert
  presence; `FleetMachine.inBid` to filter.
- **No serial number, no load capacity** (AC-12) — the serial identifies the machine to the system, not
  to a renter.
- **One chip, not a chip plus a band** (AC-32) — so every card keeps the same height.
- **The request action is blue, never navy** (AC-33) — beside a red chip, navy reads as disabled.
- **Given** machines owned but not offered **Then** they are **not listed**; they are reachable only as
  an «اطلب معدّة أخرى» request.

### V6 · Landing pre-selection `[UI]`
**AC** 34, 35 · On arrival the offer's **confirmed** machine is selected — card accent, pin lifted with a
halo and an in-offer tag — and **no detail opens**. The renter is oriented, not navigated.
- Attention cue: **finite**, ~6 pulses over ~9s, then rests, **preserving the resting shadow** so the
  card never appears to move.
- **Given** the cue **When** it finishes **Then** it does not loop.

### V7 · Equipment detail `[UI]`
**AC** 14, 36, 37 · Replaces the panel with that machine.
1. full-bleed **hero photo** + back control
2. **two tabs** — the machine · its documents
3. one line: availability chip · distance · yard
4. **the match grid — the main content.** Six cells against *this request*: year & manufacturer ·
   attachments · equipment photos · proof of ownership · equipment certificate · operator certificates.
- Each cell reads **green** (satisfied), **grey** (not required) or **red** (missing) and **states its
  actual finding** — "3 of 4 uploaded", "on the machine's file", "not on the file".
- **Given** the detail **When** it renders **Then** it answers *"does this machine fit my request"*, not
  *"what is this machine"* — no specification dump.

### V8 · Equipment documents `[UI]`
**AC** 16, 38, 39, 42 · The detail's second tab. **Two groups**, each with its own attention count:
**photos** (front, plate, meter, side) and **documents** (proof of ownership, equipment safety cert,
operator safety cert).
- **Presence only** — uploaded / not uploaded / on the machine's file / none yet. **Never a verification
  badge**: a machine's paper is either there or it isn't, and a badge invites judging a supplier on a
  state the platform sets.
- Select-all + a checkbox per row; **requesting is a batch action**, one card carrying several types.
- **Reuse:** `documentKeys` on `FleetMachine`; T4 already unfiltered ownership types.

### V9 · Company panel `[UI]`
**AC** 40, 41 · Opens over the whole panel with its own dark header (name · verified chip · back).
A **document list, not a profile**: CR · VAT certificate · **IBAN** · national address · local content.
- **Company rows carry verification state and expiry** — verified, valid-until, renews-annually, or
  no-document-yet in red. This asymmetry with V8 is deliberate: a company paper is checked and expires.
- Attention count on the group heading counts **rows needing action**, never a total.

### V10 · Map `[UI]`
**AC** 15, 19, 20, 21, 22 · Project pin (*مشروعك*) · one marker per **offered** machine · availability
label (*مؤكّد توفرها* / *لم يؤكد توفرها بعد*) · distance chip · **dotted route** back to the project.
- **Reuse:** `MapCanvas`, `decollide`, `MIN_PIN_GAP_PX`, `isPlottable` — all landed under T16.
- **Edit from v2:** drop the hollow **not-in-offer** pin variant; v3 draws offered machines only.
- Colour from `unitAvailability` **only** — the card chip and the pin must never disagree (AC-19).
- **Given** a unit whose availability is `absent` — `unidentified` or `none` — **Then** it is **not
  drawn**; an undrawable unit cannot carry a colour.
- **Given** unconfirmed copy **Then** it reads as *unanswered*, never refused (AC-20).
- Selecting a card focuses its marker and vice-versa (AC-15).

### V11 · The four requests `[UI][CT]`
**AC** 17, 18

| Request | Raised from |
|---|---|
| اطلب تأكيد التوفّر | the card (V5) and the detail (V7) |
| اطلب معدّة أخرى | bottom of the list (dashed) and inside each detail |
| اطلب مستنداً | per document row — equipment (V8) and company (V9) |
| اطلب إضافتها | the shortfall alert (V4) |

- **Reuse:** T6's `rentee_request` service — `ref` minted server-side, `serial` stamped from the
  resolved listing, `equipmentId` ownership-checked **before** the message exists.
- Each carries the machine **as data**, not only in prose, and is sent explicitly by the renter.
- **Card state is derived on every render** by re-reading the machine — nothing persisted on the message.

### V12 · Chat dock + price footer `[UI]`
**AC** 23, 24, 43→49, 62→67 · **Revised 2026-08-08 after verifying `DealRoom.tsx` — see 004a §4a.**

**The footer shows figures and hands off. It does not re-host the bar.**
What §6.10 calls a bar is `qp-foot` (`DealRoom.tsx:1608`) — the footer of a **three-page negotiation
wizard** bound to `page`/`editable`/`canNext`/`canSubmit`/`busy`/`doSubmit` inside a 1,706-line
component. It is not embeddable.
- **Build** the figures from **`computeDealTotals`** (`lib/contract/deal-room.ts`, pure and reusable):
  rate · source (*عرض افتتاحي*) · **التفاصيل** breakdown.
- **Negotiate/accept opens the existing flow** at `/deal-room/[id]`. Never re-implement it here.
- **No-room case:** most bids have `dealRoomId === null` — show the **bid's own** figures, no status
  line, and let negotiate be what creates the room.
- **AC-65/66/67 — two numbers, both correct:** the count pills and shortfall describe the **offer**
  (`unitsOffered`); the footer prices on **`agreedUnits`**. When they differ, say so **once, in the
  footer**. Never follow `lastProposedRentalUnits` — an unapproved counter must not rewrite the offer.

**The chat dock** — floating **المحادثة**, unread badge, **no edge rail**, plus §2 of 004a:
- **A tab per item** when that supplier has more than one bid in the RFQ group; none when he has one.
  Group by `bidSupplierKey` (company → member → name).
- **Per-tab unread** from `GET /api/me/deal-rooms` rows (`bidId` + `unreadCount`) — REST, no socket.
- **A tab whose bid has no room is compose-only**; the **send** creates the room, then connects.
- **Connection:** copy `DealRoom.tsx:358-398`'s pattern, but **reference-count `connect`/`release` in one
  shared module** — `:394` disconnects a *singleton* unconditionally, so two owners would tear each
  other down. Fetch the token once and watch the user's channels rather than one call per tab.
- **Arrival notice** (004a §2.1): bubble on the dock with `↩ ref · serial`, refresh-timed — copy must
  never imply immediacy.
- **Every custom card renders in every tab** — the negotiation vocabulary plus `rentee_request` and
  `rentee_request_reply`. Never a bare grey pill.

### V13 · Routing + the empty state `[UI]`
**AC** 25, 26
- **An off-platform bid never opens this surface.** It keeps `SharedBidSubmissionModal` +
  `SharedBidNegotiateRoom` exactly as they ship. This spec adds nothing to them and removes nothing.
- **A supplier who registered no machines** gets an explicit state — a price and a count were given —
  with **no empty card furniture**.

---

## E · Verification gates — re-pointed at `RM3-*`

**T38** frontend tests · **T39** backend tests (already satisfied for AC-27 by T1/T5) · **T40**
integration against staging · **T41** the visual pass against `Deal Room Map.html` · **T42** spec
alignment · **T43** regression.

**Three ACs are negative and need proving, not observing:** no distance filter (28), no bid-quality
score/ring (29), no reason on the unconfirmed chip (30). Assert the **view model exposes no such field**
— a render that happens not to show one is not the same thing.

---

## Coverage

All 42 `RM3-AC-*` map to V1–V13, except **AC-27**, which is backend and **already satisfied** by T1/T5.

## Sequence

```
C (U1, U2)  →  V1 V2 V3 V4  →  V5 V6 V10  →  V7 V8 V9  →  V11 V12 V13  →  E
undo first     the spine       it becomes real   verification content    wiring   gates
```

## Before V5 starts

**The v3 prototype is unread.** `design.md` and `prototype/` describe the **v2** prototype. v3's source of
truth is `Deal Room Map.html`, which needs the same split-and-extract treatment — otherwise V5–V9 get
built from prose while the exact geometry sits in a file nobody opened.
