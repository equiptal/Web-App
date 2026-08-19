# Web work plan — deal-room map & chat cards

**Not a spec.** The specs are the contract; this is the ordered build list that implements them, with
file paths, dependencies and what is blocked. Acceptance lives in the specs — this document never
restates an AC, it references it.

| | |
|---|---|
| **Created** | 2026-08-04 |
| **Specs it implements** | `docs/specs/001-deal-room-rentee-map.md` (176 web ACs, 48 backend) · `docs/specs/002-deal-room-chat-cards.md` (17 web, 3 backend) |
| **Last reconciled** | 2026-08-05, against the finished prototype and all 18 closed decisions |
| **Repo** | `Web-App` — everything below is in this repo unless marked `[backend]` |
| **Checks** | `npx tsc --noEmit` · `npx vitest run` · `npx eslint <files>` |

## How the two specs differ

| | 001 — map & requests | 002 — chat cards |
|---|---|---|
| Kind | **New capability.** None of it exists today. | **Defect fix.** The data is already on the wire and the web discards it. |
| Size | 176 web ACs, 48 backend | 17 web ACs, 3 backend (optional) |
| Blocked? | Backend changes needed for per-unit location (§7.2) | No. Ships alone, today. |
| Ship first? | No | **Yes** — smaller, independent, and fixes something users see now |

They meet in one place: `rentee_request` (001 §7.13) is a sixth entry in the card registry that 002
creates. Build 002 first and 001's cards drop into an existing seam instead of inventing one.

## Facts established from the code (don't re-derive these)

- `leaflet@1.9.4`, `react-leaflet@5.0.0`, `@types/leaflet` are **already dependencies**
  (`package.json:14-20`), used by `src/components/shared/MapLocationPicker.tsx`. **No new dependency.**
- `src/components/compare/BidComparisonWorkspace.tsx` (2160 lines, mounted at `src/app/compare/page.tsx`)
  references lat/lng ~60 times but renders **no map** — no `MapContainer`, no `TileLayer`. The map is
  net-new on an existing page.
- `src/components/deal-room/DealRoom.tsx:844` returns early on `m.user?.id === "system_bot"`, **before**
  the `custom` branch at `:853`. That single ordering is the whole of defect W1.
- `custom` is already in production: `Moedatech-App/apps/backend/src/services/stream.service.ts:38-53`
  defines five card types, and `customData` is **not whitelisted** by any validator — so no backend
  schema change is needed to add a sixth.
- **No component-test harness in this repo.** No `@testing-library`, no jsdom. Everything asserted
  automatically must live in a pure function; rendered output is manual-verify. Do not plan otherwise.

---

## Phase 1 — Defects in the live web ✅ **ALREADY DONE**

**Verified 2026-08-05: W1–W5 are implemented and tested.** `ChatCard.tsx` exists, `parseChatCard` is at
`deal-rounds.ts:150`, the card branch precedes the `system_bot` return at `DealRoom.tsx:848`, and
`tests/unit/deal-room-cards.test.ts` passes **47 tests**. Do not rebuild.

**Two loose ends worth ten minutes:** confirm the backend Arabic-text fixes (002 §7) were applied — the web
rendering from `custom` would hide it if not — and confirm the translate affordance reaches card messages
(002 AC-17).

The items below are kept as the record of what was wrong and why.

### W1 · Negotiation cards render as one grey pill
**Spec:** 002 AC-01→10 · **Files:** `DealRoom.tsx`, new `ChatCard.tsx`, `deal-room-proto.css`, `deal-rounds.ts`

Five card types (`rate_proposal`, `rate_response`, `term_accepted`, `counter`, `term_updated`) plus
`term_reopened` all render as `.sysev` — a centred grey pill showing `m.text` and nothing else.

1. Add the `ChatCard` discriminated union + `parseChatCard` to `src/lib/contract/deal-rounds.ts`.
   **Never throws, never returns a partial card** — a malformed payload returns `null` and the message
   falls back to `m.text`. A throw inside a list render blanks the whole conversation.
2. New `src/components/deal-room/ChatCard.tsx` switching on `type`.
3. In `DealRoom.tsx`, check `parseChatCard(m.custom)` **before** the `system_bot` branch at `:844`.
   Unknown type → today's pill, unchanged.
4. Card classes in `deal-room-proto.css` alongside `.sysev`.

### W2 · English text inside the Arabic chat
**Spec:** 002 AC-02, AC-03 · **Files:** `ChatCard.tsx`, `src/lib/i18n/{en,ar}.ts`

`rate_proposal` falls back to `"{name} proposed a rate: 3000 per day"` and `rate_response` to
`"{name} accepted the proposed rate"` — the latter with no override path at all.

**Fix this in the web, not by waiting on the backend.** Compose every label client-side from
`dealRoom.cards.*` and never display `m.text` for a known card type. This is the only fix that also
repairs the messages **already sitting in Stream**, which a backend change cannot reach.

### W3 · A counter-offer displays without its number
**Spec:** 002 AC-04 · **Files:** `ChatCard.tsx`

`counter` carries `oldValue`/`newValue` in `custom` only; its text says just *"countered on X"*. The
renter sees that a counter happened but not what was offered. Render both values.

### W4 · The wrong-language messages are the only ones that can't be translated
**Spec:** 002 AC-17 · **Files:** `DealRoom.tsx`

`canTranslate` is computed at `:857`, after the `system_bot` early return at `:844`. So the Translate
button never appears on system messages — exactly the ones in English. Reordering for W1 fixes this as
a side effect; **verify it, don't assume it.**

### W5 · Raw term keys are user-visible
**Spec:** 002 AC-05 · **Files:** `ChatCard.tsx`

`termKey` values (`PRICE`, `MOB_DEMOB`) must go through the existing term-label lookup, never print raw.

**Phase 1 tests:** `tests/unit/deal-room-cards.test.ts` — 002 TC-01→09. TC-10 is manual (RTL direction,
translate affordance).

---

## Phase 2 — Map surface (001, needs backend)

**Blocked on** 001 §7.2 (per-unit `locationSource`/`lat`/`lng`/`distanceKm` on `offeredUnitsDetail`) and
§7.5 (live bid events). Build the pure logic first — it is testable against fixtures before the
endpoint lands.

### W6 · Contract + selectors (do this while backend is in flight)
**Spec:** 001 AC-01→11, AC-55→59 · **Files:** `src/lib/contract/bids.ts`, new `src/lib/contract/bid-map.ts`

Location precedence (unit yard → bid pin → bid yard → listing yard → none), the two independent
per-unit indicators, supplier-level aggregation (all/some/none). All pure. All unit-testable now.

### W7 · The map on `/compare`
**Spec:** 001 AC-12→30 · **Files:** `BidComparisonWorkspace.tsx` (or a new sibling), `bid-map.ts`

Opens on the project location only — **no supplier pins** (001's direction change: supplier coordinates
are not reliable enough to plot). Machine pins appear on supplier selection. Pixel-space de-collision,
not coordinate equality — machines in one yard are metres apart and will overlap otherwise.

### W8 · Bid list as the entry point
**Spec:** 001 AC-31→36 · **Files:** `BidComparisonWorkspace.tsx`

Cheapest-first, nearest as the only alternative sort. Selection is **row state** — accent bar and tick —
never a button labelled "select". No price-delta commentary.

### W9 · Colour key
**Spec:** 001 AC-129→132, AC-167/168 (§6.9.1→6.9.3) · **Files:** bid-list panel component

**ONE scale — green confirmed, red not confirmed.** Every pin is a machine. The supplier-level
green/grey/red aggregate was removed: it described dots that stopped existing when the map went
project-location-only, and amber contradicted `unitIcon`, which already draws unconfirmed machines red.
The key must also state that red **does not mean unavailable** (AC-133), or an unconfirmed machine reads
as rejected. **Host it inside the bid panel, not floating on the map** — a floating overlay at low
z-index renders behind that panel in RTL, which is how the machine key became invisible in the only state
where machine pins exist. Collapsed by default.

---

## Phase 3 — Machine panel (001)

### W10 · Three tabs over one sticky identity header
**Spec:** 001 AC-40→43, §6.3 · **Files:** new `MachinePanel.tsx`

Availability & fit / equipment documents / company documents. The identity header stays pinned across
tab changes so a request cannot be composed against a machine the renter scrolled past. Badges count
**needs-attention**, not totals.

### W11 · Availability chip + the "not unavailable" clause
**Spec:** 001 AC-140, AC-133→136 (§6.3.1, §6.9.3) · **Files:** `MachinePanel.tsx`, i18n

**A filled, saturated chip** (solid green / solid red) whose colour equals that machine's pin. The
paragraph explainer and the two-tile status card were both **removed** (§6.3.5) — do not build them. What
survives is the chip plus one muted line stating explicitly that
«غير مؤكّدة» **does not mean unavailable**. Without that clause an unconfirmed machine reads as
rejected and the renter discards a supplier who never declined anything.

The availability request lives **on this explanation only** — not also in the actions row (AC-135).

### W12 · Spec-match scoped to the selected unit
**Spec:** 001 AC-119 · **Files:** `MachinePanel.tsx`

Build year and safety certificate come from the **unit**, not the request item's template. Otherwise the
header and the match grid contradict each other and the fit gate is not per-machine.

### W13 · Document lists with multi-select
**Spec:** 001 AC-116, AC-120 · **Files:** `MachinePanel.tsx`

Per-row checkbox, select-all, `+ طلب (N)` / `⤓ تنزيل (N)` footer. **Select-all bar and footer sticky** —
a document list is as long as the supplier's paperwork and the action must not depend on reaching its end.
N ticked documents produce **one** card, not N.

---

## Phase 4 — Requests & replies (001 §7.13)

### W14 · Request composition and the linked card
**Spec:** 001 AC-107→118 · **Files:** `deal-rounds.ts` (extend W1's registry), `ChatCard.tsx`, `MachinePanel.tsx`

`equipmentId` is the key — **never the serial** (`serialNumber` is nullable and unique only per
`(tenantId, userId)`, so two suppliers can share one). Serial is display text; nothing resolves off it.

The card resolves image/name/serial **from `equipmentId` at render time**, so it cannot show the wrong
machine. Draft and sent states render through the **same component** (AC-118).

### W15 · Derived status, and the layer-3 fallback
**Spec:** 001 AC-121→123, §7.13.4 · **Files:** `bid-map.ts` or `deal-rounds.ts`

No stored status, no counter. Precedence, in order:

1. Derivable kinds (`availability`, `document`) → **state answers**, and overrides any echo. (`add_to_offer` is retired — 001 §6.7.1 — and must be rejected by validation.)
2. Non-derivable (`alternative`) → the **echoed `resolution` answers**.
3. Neither → genuinely open.

**Step 2 is not optional.** Skipping it is what made a supplier's refusal invisible while it sat directly
beneath the request in the same conversation.

### W16 · Notification surfaces
**Spec:** 001 AC-124→128, §6.8 · **Files:** `BidComparisonWorkspace.tsx`, new notification component

Map recolour (the answer) · persistent rail unread count · transient in-view toast carrying the `ref` and
serial. Only when the chat panel is not visible; opening the chat clears both in one action; colour-keyed
to the resolution.

**Triggered by the state change, not by a message** — the most common answer in the system is a supplier
confirming a yard from the readiness card, which sends no message at all.

---

## Phase 5 — Live arrival & notifications (001 §6.8, §6.10, §7.5)

### W17 · Bid arrival over a Stream USER event
**Spec:** 001 §7.5, AC-11, AC-186→190 · **Files:** `BidComparisonWorkspace.tsx`, new `bid-events.ts`

**No channel.** `sendUserCustomEvent(renteeUserId, {type:'bid.changed', …})` pushes to the request owner.
`/compare` has **no Stream connection today** — the web connects only in `DealRoom.tsx:420` — so reuse
`StreamChat.getInstance()` and the existing token endpoint rather than opening a second connection.

Treat the event as a **hint to refetch only**: never render from its payload, coalesce bursts into one
refetch, fetch once on mount regardless, and implement **refetch-on-focus + refetch-after-send** so no
screen depends on Stream being reachable.

### W18 · Arrival surfaces
**Spec:** 001 §6.8, §6.10, AC-124→128, AC-160→173

Map recolour · **conversation bubble on the chat icon** (filled, high-contrast, a +N count, amber for refusals,
dismiss then re-show on a new arrival) · persistent unread count · transient popup for bids.

**The chat button must render when an arrival is pending even with no supplier selected** (AC-164). This
is not cosmetic — scoping every notice to the selected supplier is what made two earlier designs fail.

New bid: list re-sorts (**not** appends), just-arrived marker, click reveals the row without selecting it,
and the comparison text is **computed** from other offers' rates, never asserted.

## Phase 6 — Off-platform submissions (001 §6.12)

**Ships independently of Phases 2-5** — it touches the bid list and adds two surfaces, but needs none of
the map/machine work. Consider splitting it into its own spec if it competes for the same sprint.

### W19 · Backend: two SELECT additions — to the AGENTS handler
**Spec:** 001 AC-193, §6.12.1 · **Files:** `apps/backend-agents/.../getRequestSubmissions.ts`

Add **`city`** and **`contact_info`**. There are **two** `getRequestSubmissions` handlers with different
`SELECT`s — the web calls the **agents** one; `apps/backend` serves mobile. The agents handler **already
selects `company_documents` and `rentee_messages`**, so do not add those.

`city` is already mapped by `src/lib/contract/link-bids.ts:241` but never returned, so **that field is
null in production today** — the bid row cannot use it as the distance stand-in until this ships.

### W20 · Bid list row
**Spec:** 001 §6.12.3, AC-194, AC-196, AC-206

Off-platform badge · **`city` where the distance goes** · no ETA/deals/verified · the composition state ·
cheapest badge computed from the **rate**, never `grandTotal` (the only VAT-bearing figure).

### W21 · Equipment panel
**Spec:** 001 §6.12.7, AC-211→214

Cert chips from `confirmations` · unverified callout · six spec tiles.

**Two rules that are easy to get wrong:**
- **Em-dash, don't omit.** Distance and fuel type never exist; showing them as — is how the renter sees
  what he is *not* being told.
- **Measurement and build year are the RENTER'S requirement**, not the supplier's claim. A submission has
  no measurement field at all (the mapper supplies only `label`) and no year. Label both, or `≥ 2020`
  reads as a confirmed 2020+ machine.

### W22 · Submission modal
**Spec:** 001 §6.12.8, §6.12.11, AC-200, AC-217, AC-218

Read-only banner · quality donut + three weighted bars · reference strip · dark item header · terms grid
(اختيارك vs اختيار المورد) · price rows with VAT stated · photos · both document sets · notes.
**No message thread.** Absent fields read "not entered", not blank.

**The quality score ALREADY EXISTS — do not rebuild it.** `src/lib/contract/bid-quality.ts` (124 lines) is
rendered by `QualityRing.tsx` and consumed by `BidComparisonWorkspace.tsx:17` and `GroupBids.tsx:18`. Use
`qualityFromSubmission` / `qualityFromSubmissionItem` (AC-219). Three things about it are easy to get wrong
and are documented in §6.12.11: the company part excludes **company name and contact** (they are required to
submit) and its fourth slot is **other-docs**; the equipment part is **bucket coverage**, not a document
count; and the mid band starts at **50**. It is completeness-and-agreement, **never** trust — every input is
self-declared, so it must not be labelled as verification (AC-217).

### W23 · Read-only bottom bar
**Spec:** 001 §6.12.9, AC-202, AC-215, AC-216

Rate labelled pre-VAT, total labelled VAT-inclusive, and **التفاصيل is required** — it is the only place
mobilisation, demobilisation and VAT appear. Compute **VAT as `total − subtotal`** so the lines always sum
to the stored total. No accept, no counter-offer: there is no deal room before conversion.

---

## Ready to start? — what is and is not settled

**Already built — verify, don't rebuild:** all of Phase 1 (002), and much of Phase 6 —
`SharedBidSubmissionModal` (538 lines), `SharedLinkBidCard` (293), `BidEquipmentModal` (222),
`BidTermsModal`, `bid-quality.ts`, `vat-inclusive.ts`, `QualityRing.tsx`. See §6.12's banner.

**Start here instead:** **W6** (pure selectors, no backend), then **W19** (two agents `SELECT` additions),
then the genuinely-new part of Phase 6 — hosting the existing components on the map/compare surface
(rail buttons, read-only bar with التفاصيل, the composition state). Every field is documented per surface in **§6.12.10**; the quality score **already exists** and
§6.12.11 documents the real formula rather than specifying new work.

**Blocked on backend:** Phases 2-4 need 001 §7.2 (per-unit location). Phase 5 needs §7.5.

**Not settled — do not guess:**

| | |
|---|---|
| **Open question 19** | a supplier typing a **VAT-inclusive** rate into the public form has 15% added on top, undetected. Affects data quality, not this UI. |
| **Scope call** | §6.12 (Phase 6) is a sibling feature sharing these surfaces. Splitting it into `003-…` would let it ship on its own cadence. |

**Known gap between spec and prototype:** the prototype does not implement the distance filter (AC-204)
or the map-recolour-on-refetch path; both are specced and neither is prototyped.

## Suggested order

```
Phase 1 (W1→W5)  ──────────►  ships alone, no backend, fixes live defects
                                        │
Phase 2 (W6)     ──────────►  pure logic, testable against fixtures now
                                        │
        [backend §7.2 + §7.5 land here]
                                        │
Phase 2 (W7→W9) ─► Phase 3 (W10→W13) ─► Phase 4 (W14→W16) ─► Phase 5 (W17→W18)

Phase 6 (W19→W23)  ──────────►  independent of Phases 2-5; only W19 is backend
```

W6 is the only Phase 2 item that does not wait on the backend — start it in parallel with Phase 1.

## Blocked / undecided

| Item | Blocked by | Where recorded |
|---|---|---|
| W7 pin colours | per-unit `yardConfirmed` + coordinates | 001 §7.2, AC-01→10 |
| ~~Live updates~~ *(this row once read "W16", an ID now held by W16 · Notification surfaces)* | **CANCELLED — not blocked, withdrawn.** There is no realtime mechanism (001 §7.5.1); freshness is refetch on mount/focus/post-send. Do not schedule this. | 001 §7.5.1, AC-190 |
| Ownership documents viewable | product decision **made**, backend change not done | 001 §7.14, AC-101→103 |
| Cross-room "my open requests" | deliberately not built — no table | 001 §7.13.5, open question 12 |
| `term_reopened` unread | unclear whether its exclusion is deliberate | 002 open question 1 |
| VAT-inclusive rate typed into the public form | undetected; needs a form field + column | 001 open question 19 |
| Whether §6.12 splits into its own spec | scope/sequencing call | — |
| Term cards actionable? | scope decision | 002 open question 2 |
| English text on historical Stream messages | no backfill planned | 002 open questions 3, 4 |

## Standing constraints

- **Every user string bilingual**, EN + AR, in `src/lib/i18n/{en,ar}.ts`. RTL is the default reading
  direction, not an afterthought.
- **Numeric runs stay LTR inside RTL bubbles** — rates, serials, unit counts. Wrap in `dir="ltr"`.
- **Arrows are logical.** An old→new transition must read right-to-left in Arabic; never hardcode `→`.
- **The web never calls a backend directly.** Every server call goes through a BFF route under
  `src/app/api/*` via `withAuthedBackend`.
- **Pure functions carry the tests.** If a behaviour can't be expressed as a pure function, it is
  manual-verify — say so in the PR rather than claiming coverage.
