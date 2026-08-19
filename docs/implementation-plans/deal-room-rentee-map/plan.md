# Implementation plan — Deal Room Rentee Map (RMAP)

> ## ⛔ SUPERSEDED — 2026-08-09. This is not the build list any more.
>
> It plans against **spec 001**, which is itself superseded by
> [`../../specs/004-deal-room-equipment-verification.md`](../../specs/004-deal-room-equipment-verification.md).
> **The live plan is [`replan-v3.md`](replan-v3.md) (disposition) + [`tickets.md`](tickets.md) (the V1…V18 set).**
>
> Kept for the reasoning in **§Decisions (D-A…D-C)** and **§Open items (O-1, O-2)**, which are still the
> record of why those calls were made. Two of its statements are now false in the open:
>
> - **D-C — "the distance filter is dropped entirely"** (`:166-172`) is **reversed**. See the strike there.
> - Sequencing and slice names (S1…S6) do not map onto the V-tickets; read `replan-v3.md` for the mapping.

**Not a spec.** `docs/specs/001-deal-room-rentee-map.md` is the contract. This is the ordered build
list, the sequencing, and the open items. It never restates an AC — it references one.

| | |
|---|---|
| **Spec** | `docs/specs/001-deal-room-rentee-map.md`, revision of **2026-08-05 21:27** (2158 lines; ~213 live AC rows, 24 struck) |
| **Prototype** | `deal-room-rentee-map-v2.html` — layout only (§4 assumption A0) |
| **Web branch** | `web/deal-room-rentee-map` (off `staging`) |
| **Backend branch** | `backend/deal-room-rentee-map` in `equiptal/Moedatech-App` (off `staging`, PR → `staging`), no board tickets |
| **Scope** | **rentee web only.** The rentee **mobile** port and the **supplier** surfaces are later, separate work |
| **Checks** | `npx tsc --noEmit` · `npx vitest run` · `npx eslint <files>` |

## Three consumers, one backend

Delivery order is **rentee web → rentee mobile → supplier mobile**, all reading the same
`apps/backend`. Two constraints follow:

1. **No web-shaped backend.** Every §7 field lands on `getBidList` / `getBidDetail`, which mobile
   already consumes (§7.10), and the §7.12 fleet endpoint is a plain REST resource — nothing is
   derived in a BFF route that Flutter would have to re-derive. Values both clients need
   (`locationSource`, per-unit `distanceKm`, `inBid`) are computed server-side, once.
2. **Client logic is parity-by-duplication here, so it must be portable.**
   `src/lib/contract/bid-readiness.ts` and `apps/mobile/.../domain/bid_readiness.dart` are the same
   rules written twice. `bid-map.ts` (S2) is therefore written as pure functions with **no React, no
   DOM, no i18n inside** — a mechanical Dart port later, not a rewrite.

**Parity trap for the mobile port.** Two `getRequestSubmissions` handlers exist with different
`SELECT`s. The web calls the **agents** one (already has `company_documents`, `rentee_messages`; lacks
`city`, `contact_info` → T7). `apps/backend` serves **mobile** and is the mirror image. T7 does not
cover mobile.

## Verified state — before a line is written

| | |
|---|---|
| **Chat-card seam** | **Built** (spec 002): `ChatCard.tsx`, `parseChatCard` (`deal-rounds.ts:150`), branch ahead of the `system_bot` return (`DealRoom.tsx:848`), 47 tests green. `rentee_request` is a 6th registry entry. |
| **Off-platform** | **~1,700 lines built:** `SharedBidSubmissionModal` (538), `SharedLinkBidCard` (293), `BidEquipmentModal` (222), `BidTermsModal` (137), `link-bids.ts` (500), `bid-quality.ts` (124), `vat-inclusive.ts` (42), `QualityRing`. S6 is hosting, not building. |
| **Leaflet** | `leaflet@1.9.4` + `react-leaflet@5` already dependencies; `MapLocationPicker.tsx` is the only current `MapContainer`. No new dependency. |
| **Unit contract** | `bids.ts:78-91` types `OfferedUnitDetail`, `:743` maps it — §7.2's fields drop into an existing mapper. |
| **Readiness** | `computeBidReadiness` already consumed by `GroupBids:951`, `BidComparisonWorkspace:665`. Zero new work (§6.6). |
| **Backend** | **Nothing in §7 exists.** `buildOfferedUnitIndex` selects no `yardId`/`yard` (`rentee.service.ts:518-532`); `offeredUnitsDetailFor` drops `entry.yardId`/`yardConfirmed` (`:588-594`); the lookup is `{id, tenantId}` only (`:519`) so the competitor-machine leak is live; `submitBid.ts:30` / `editBid.ts:28` are `z.array(z.any())`; the contradicting comment sits at `:449`; no fleet endpoint; `UNREAD_INFLATING_CARD_TYPES` (`stream.service.ts:38`) holds 5 types. |
| **Working tree** | An unrelated in-flight change is uncommitted on this branch (`src/app/bid/[token]/` split into `BidFormClient.tsx`, new `src/lib/api/bidPreview.ts`, `tests/unit/bid-preview.test.ts`, plus `docs/web-work-plan.md`). **Commit or stash it before RMAP work lands**, or the first commit mixes two features. |

## Host surface

A `[قائمة │ خريطة]` segmented control in `GroupBids.tsx`'s existing controls cluster, before the item
selector (`:674`) and the filter button (`:707`) — the row already carrying the supplier chips
(`:657`). `view === 'map'` swaps the card grid for `BidMapWorkspace`.

`GroupBids` already fetches every item's bids across the RFQ group (`:161`), owns the item switcher,
the submissions list, readiness and the deal-room open path (`:249`) — exactly what §3, §6.5 and §6.6
assume. `/compare`'s `BidComparisonWorkspace` (2160 lines) is a comparison table and would need all of
it re-plumbed.

## The pin model changed — read this before sequencing anything

The 2026-08-05 revision retires **one pin per bid** (§4 retirement table). Every pin on the map now
comes from **the selected supplier's registered qualifying fleet** (§6.2 state 2, assumption 4), and
bids are never plotted (AC-169 says so explicitly).

**Consequence: nothing but the project pin can be drawn until §7.12's fleet endpoint exists.** The
bid-level coordinates already on the wire (`bid.equipmentLat/Lng`, `bid.yard{…}`,
`bid.equipment.yard{…}` — `bid.repository.ts:151-196`) are now **unused by the map**; they remain only
as the §7.3 fallback for a unit's location inside the panel. So `T5` is the gating ticket for map
content, not `T1`.

What is still buildable with zero backend: the whole **bid list** side — rows, cheapest-first and
nearest sorts over existing `distanceKm`, the colour key, the off-platform rows, the footer, and every
pure selector in S2.

## Green vs red — settled 2026-08-05

The colour answers *"did the supplier commit this machine to **this bid**?"*

| Source | Meaning | Colour |
|---|---|---|
| the machine has an entry in **this bid's** `unitsOffered` carrying a `yardId` → `locationSource: 'unit_yard'` | committed through the readiness card, from a named yard | **green**, plotted at that yard |
| no such entry — location falls to `bid_pin` / `bid_yard` / `listing_yard`, or the machine is owned but not offered (`inBid: false`) | no per-unit commitment for this bid | **red**, plotted at the yard registered on the machine's file |
| `unidentified` (claimed count with no machine) | nothing to draw | **not drawn at all** (§6.2); counted in the composition bar only |
| `none` (machine with no resolvable coordinates) | unknown location | no pin; row tagged «لم يُشارك الموقع», exempt from the filter, last under *nearest* |

This is §7.3 verbatim (*"Only level 1 counts as confirmed; 2–4 are inferred"*) and AC-18's own test —
**no spec change and no supplier-app change needed.**

**Do not read the `yardConfirmed` boolean for colour.** Supplier-side it is `yardId != null`
(`bid_readiness_bloc.dart:245` defaults the yard from the machine's registered one; `:442` derives the
flag from its presence), the yard sheet asks *«من أي ساحة تخرج الوحدة؟»* pre-filled and never demanded,
and `bid_readiness.dart:288-290` keeps the yard out of the readiness gap ladder. It is `true` for every
readiness-written entry, so it carries nothing the precedence doesn't. Report it verbatim where §7.7 /
AC-10 require; nothing renders from it.

**This rule must be implemented inside `T5` too.** §7.12's field table lists `yardConfirmed` and
`lat`/`lng` with no derivation. If the endpoint answers them from the *listing*, every pin is green and
the colour is dead. See T5.

## Decisions taken in review — 2026-08-05

### D-A · A deal room is created by the first committing act, never by browsing

Creating a `DealRoom` row freezes that supplier's offered-unit count (`BID_OFFER_LOCKED`,
`bid.service.ts:470-481`), so it must never be a side effect of looking around.

| Renter action | Creates a room |
|---|---|
| selecting a bid row · selecting a machine · opening the machine panel | **no** |
| opening the chat panel on a bid with no room | **no** — compose-only, "no messages yet" |
| **sending** a chat message · **sending** a request card · negotiate · accept | **yes** |

**Spec consequences:** AC-69 changes from *opening* runs create-or-fetch to **sending** does. AC-32's
*"every figure comes from `computeDealTotals(room)`"* applies **once a room exists**; with no room the
footer renders the **bid's own** rate / mob / demob / VAT. The chat panel needs a compose-only state.

### D-B · No Stream on the map surface — unread and notices come from REST, on refresh

**Decided by product 2026-08-06: instant is not worth its cost here.** Nothing on this surface opens a
socket. Verified sources:

| Need | Source |
|---|---|
| Per-tab unread badge (AC-68) | `GET /api/me/deal-rooms` — each row carries `bidId`, `dealRoomId`, `unreadCount` (`inbox.ts:11,13,15`), fetched alongside the bids refetch |
| Rail unread badge | the same rows, or `GET /api/me/deal-rooms/unread-count` → `{ total }` |
| Arrival bubble / popup (§6.8) | **derived on refresh** — a row whose `unreadCount` rose since the last fetch |
| The chat thread itself + sending | Stream, connected **only while the chat panel is open**, exactly as `DealRoom.tsx:362` does today |

**Consequences:** no user-level token route is needed (a room exists by the time the panel opens, or the
first send creates one). `DealRoom.tsx:394`'s `disconnectUser()` needs **no refactor** — the panel and the
`/deal-room` page are never mounted together; verify by navigating out and back rather than changing a
shipped file. **§6.8's copy must be reworded** (AC-230 already requires it): the bubble means *"you have
unread messages from this supplier"*, not *"a message just arrived"* — drop the pulse-on-arrival and the
~7s transient framing.

**Plus a 45s unread poll, agreed 2026-08-06.** While map view is visible, re-call
`GET /api/me/deal-rooms` every 45s through the **same** fetch the refresh path uses, so badges and the
§6.8 notices appear within half a minute without a socket. Guards: **pause when the tab is hidden**
(`visibilitychange`); **skip entirely when no bid on the request has a `dealRoomId`** (nothing to count);
**map view only**, so list view keeps today's behaviour. Cost: one existing indexed query per renter per
45s — 100 concurrent renters ≈ 2 req/s.

**This does not touch bid freshness.** Bids stay mount / focus / post-send only, so §7.5 and AC-190 hold
verbatim; the poll carries unread counts alone. A socket remains the later, additive option if live
message streaming is ever wanted on this surface.

### D-D · Sorting, and the deferred supplier-gate bug — 2026-08-06

**Sort:** two only — **cheapest rate** (default) and **nearest**, measured on the bid's server-computed
`distanceKm`. Not the supplier's nearest qualifying machine: that would rank a supplier highly for a
machine **not on the table**, and would force loading every bid's fleet at mount, defeating A5. Rating is
retired (AC-24). (Note: once a bid has gone through readiness, `_persist:725` writes the primary
committed unit's yard onto the bid, so a green bid's distance already reflects its green machine.)

**O-1 deferred by decision.** The mobile readiness-gate fix is not filed and not scheduled here.
Consequence, stated once: because sending a request card creates the deal room (D-A) and the room's
existence trips the client gate, **every `availability` request is unanswerable from the supplier app** —
not merely those sent mid-negotiation. Layer 1 never resolves; layer 3 needs the echo card the supplier
client doesn't send (O-2).

Therefore **T25 renders `availability` cards with no status line** — ask, machine, `ref`, nothing claiming
a state. §7.13.4 itself calls a permanent *"waiting for the supplier"* the one failure mode the design must
not have. `document` and `alternative` keep their derived status: a document can still be uploaded from the
equipment page, and an `alternative` is answered by a swap or a second bid. This flips back to full derived
status when the gate is fixed — two lines, no rework. **AC-64, AC-97, AC-114, AC-115 are declared
blocked-on-supplier** in the PR rather than claimed.

### D-C · The distance filter is dropped entirely — product decision

§6.10, AC-225→228, AC-204, TC-125, TC-117, the `distAll`/`dist50`/`dist100`/`dist200`/`distCount` i18n
keys, the band selector and the "N of M offers" count all go, along with ticket **T14**. Distance
**text** on rows and pins stays, as does the **nearest** sort — defined as the **bid's** distance, since
rows are bids. (The dropped filter had a real defect: a bid measuring 180 km can own a machine 12 km
from the site, so a band would have hidden exactly the machine the renter wanted.)

## Open items — decide before the slice that needs them

### O-1 · The supplier client blocks answers the server allows — a mobile bug, not a design constraint

**Resolved 2026-08-05 by reading the server.** `editBid` (`bid.service.ts:412-418`) states: *"A bid
stays editable through its whole LIVE lifecycle — pending, in negotiation, and accepted, **including
once a deal room is open** — so the supplier can still correct the offered unit's yard / equipment /
per-unit metadata."* The `BID_OFFER_LOCKED` guard (`:470-481`) fires **only when the offered-unit COUNT
changes** and a room exists, and `:466-469` names our case: *"same-count updates only refresh that
metadata and stay allowed, otherwise a yard confirmation would fail the moment negotiation starts."*

| Action, with a deal room open | Server | Mobile client |
|---|---|---|
| Confirm / change a unit's yard (same count) | **allowed** | **blocked** — `_onYardConfirmed:523` |
| Swap the machine on a single-unit bid (count stays 1) | **allowed** | **blocked** — `_onUnitToggled:493` |
| Upload a document / photo (writes to the *listing*, not the bid) | **unrestricted** | **blocked** — `_onDocUploaded:586`, `_onPhotoUploaded` |
| Change the offered count | **blocked** (correct) | blocked ✓ |

`editable = !terminal && dealRoomId == null` (`bid_readiness_bloc.dart:472-474`) over-applies a
count-only lock to everything. **Fix: split it into `editable` and `countEditable`** — keep the gate on
`_onCommitAdjusted` and the multi-unit add/remove branch of `_onUnitToggled`; drop it from
`_onYardConfirmed`, the single-unit swap, and both upload handlers. Plus the six UI call sites
(`bid_readiness_section.dart:304`; `bid_readiness_sheets.dart:1564`, `:1657`, `:1721`, `:2204`,
`:2212`).

**This is a live supplier-facing defect independent of RMAP** — a supplier who opens the readiness card
during negotiation sees dead controls. Worth its own bug and its own small mobile PR.

**Residue that stays blocked, correctly:** on a **multi-unit** bid mid-negotiation, adding a machine
changes the count, so an availability ask for a not-in-offer machine can only be answered by a swap or
a second bid.

**Consequence for this plan:** nothing in the web build is blocked. AC-64, AC-97, AC-114 and AC-115
cannot be *demonstrated* until the mobile fix ships, and are declared blocked-on-supplier in the PR
rather than claimed.

### O-2 · A refusal cannot round-trip yet *(affects S5 only)*

§7.13.4 layer 3 (`{inReplyTo, equipmentId, resolution:'declined'}`) is the only layer that can express
"no", and `alternative` has no derivable state. The mobile supplier client does not send it. So
**AC-121 is fixture-testable only** until the supplier slice ships. T28 builds the reader; the PR says
so plainly.

### O-3 · Closed 2026-08-05 — spec cleaned

The ownership-document contradictions (AC-41, AC-61c→61g, TC-30/45b/51b), the orphaned unit-selection
rows (AC-44→46, TC-32/38), and the stale action counts (AC-85→87, TC-61) were removed or rewritten in
the 21:27 revision. §7.12 now defines `yardConfirmed` as a property of **this bid's** `unitsOffered`
entry (false when `inBid: false`), states which coordinates to send, and returns the
`offeredUnitsDetail` shape. §6.5 keys chat tabs by the **bid**. Nothing outstanding.

**A1 settled with it:** readiness for a non-offered machine needs no refactor — export the existing
per-unit function (`bid-readiness.ts:73`) and feed it the fleet payload, which now arrives in the same
shape. `computeBidReadiness` keeps working untouched.

## Slices

Exit criteria per slice: `tsc` + `vitest` + `eslint` clean on touched files, and the listed ACs
demonstrable. Anything rendered is manual-verify — this repo has no component-test harness.

### S1 · Backend — `Moedatech-App`, own branch, PR → `staging`
**T1–T7.** Ordered inside the slice: **T5 first** (it gates every pin), then T2 (security), then the
rest. **ACs** 01→10, 08b, 09, 91→96, 101, 102, 104→111, 183→185, 193, 205.

### S2 · Web contract + pure selectors — no backend dependency, starts immediately
**T8–T10.** **ACs** 18→24, 37, 55→59, 146, 167/168, 225→228.

### S3 · Map surface — list side first, pins when T5 lands
**T11–T17.** **ACs** 21→23, 29, 30, 72→82, 98→100, 131, 132, 137→139, 169→177, 190, 225→230.

### S4 · Machine panel
**T18–T23.** **ACs** 40, 42, 43, 60, 61, 61b, 83→88, 103, 119, 120, 133→136, 140→158, 178→181, 208→210.

### S5 · Requests, derived status, notices, chat tabs
**T24–T28.** **ACs** 66→71, 89, 90, 113→118, 121→128, 152→166, 182. Gated by **O-1** and **O-2**.

### S6 · Off-platform on the new surface — independent of S3–S5, mostly assembly
**T29–T32.** **ACs** 194, 196→206, 211→224.

```
S1 ── T5 fleet ─┬────────────► unblocks map pins
    ├─ T2 security (ship separately, it is a live hole)
    └─ T1 T3 T4 T6 T7
S2 selectors ───┴─► S3 list ─► S3 pins ─► S4 panel ─► S5 requests
                └─► S6 off-platform (independent)
```

## Architecture

**BFF routes** — `src/app/api/*`, all via `withAuthedBackend`; the web never calls a backend directly.

| Method · path | Proxies | New? |
|---|---|---|
| `GET /api/me/requests/[id]/bids` | `getBidList` | exists — response grows (T1, T3) |
| `GET /api/me/requests/[id]/suppliers/[supplierId]/fleet` | §7.12 fleet endpoint | **new** (T5) |
| `POST /api/me/deal-rooms/[id]/requests` | `rentee_request` card post | **new** (T6) |
| `GET /api/me/requests/[id]/submissions` | agents `getRequestSubmissions` | exists — gains `city`, `contact_info` (T7) |
| `GET /api/me/deal-rooms/[id]/documents` | `getDealRoomDocuments` | exists, unchanged — company tab source |

**Contract** — extend `OfferedUnitDetail` + `BidCard` in `bids.ts`; new `bid-map.ts` (pure); extend the
`ChatCard` union in `deal-rounds.ts` with `rentee_request` + the supplier reply echo.
**i18n** — `src/lib/i18n/{en,ar}.ts`; §6.6's `bidMap.*` table is the starting set (note it now carries
`distAll` / `dist50` / `dist100` / `dist200` / `distCount`, not the retired band keys).
**Store** — none; map state is local to `BidMapWorkspace` (§6.6).

## Risks

| Risk | Handling |
|---|---|
| T2's ownership fix makes some production bids show **fewer** units | Intended (§7.10). Count stays `unitsOffered.length`; the gap renders as unregistered (AC-184). Do not compensate. |
| `distanceKm` drift on existing cards | AC-09 golden-file characterization test **first** in S1. |
| Someone "fixes" the bid form to write `yardId` at submit | That would make every bid green on arrival and destroy the signal (see G-5). `_offeredUnitEntries` (`bid_form_bloc.dart:1570`) must keep emitting `{itemId, equipmentId}` only. |
| Leaflet + RTL | Leaflet draws an LTR canvas; pin **content** sets `direction:rtl`. Panel on `insetInlineEnd`, never `right`. |
| Colour key occluded in RTL | Panel-hosted, never floating (§6.9.2). |
| Merged-PDF download over a **mixed** set (§6.7.5) | Ship separate files; **hide** the merge option (AC-210). Never shown broken. |
| `rentee_request` notification spam | AC-106 coalescing is inside T6, not a follow-up. |
| No component-test harness | Pure functions carry the tests; rendered behaviour is declared manual-verify in the PR. |
