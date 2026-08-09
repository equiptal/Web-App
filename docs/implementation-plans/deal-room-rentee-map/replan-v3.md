# Re-plan against spec 004 (v3) — 2026-08-08

Spec `docs/specs/004-deal-room-equipment-verification.md` (426 lines, 42 ACs, prefix `RM3-`) **replaces**
001/v2 (2,191 lines, 201 ACs) for this surface. This document is the disposition of all 44 existing
tickets against it, and the new ticket set.

## What actually changed

> **v2 answered "which offer?" — v3 answers "is this offer real?"**

That single sentence moves the surface from **comparison** to **verification**, and the consequences are
structural, not cosmetic:

| | v2 | v3 |
|---|---|---|
| Scope | every bid on an item | **one bid** |
| Entry | a map view on the bids surface | **clicking that bid's card** |
| Panel subject | competing offers | **this supplier's machines** |
| Item strip · request block · offers list | present | **removed** — chosen upstream |
| Edge rail | chat + equipment + docs | **removed** — a chat dock; documents inline |
| Price bar | full-width footer | **bottom of the panel** |
| Off-platform | hosted on this surface (§6.13, ~30 ACs) | **never reaches it** (§6.11) |

**The backend is untouched.** §7 is explicit: no new endpoint, no new field, no migration — everything
v3 renders is already served by work that has landed.

## Disposition — all 44 tickets

### Backend — ~~9 tickets, all landed, all still correct ✅~~ → **7 landed; 2 withdrawn**

`T1` per-unit location · ~~`T2` `unitsOffered` ownership~~ · `T3` bid coordinates + golden file · `T4`
ownership documents · `T5` the fleet endpoint · `T6` the `rentee_request` card · ~~`T37` per-unit `yardId`
ownership~~ · `T44` trial-request fleet.

> **Corrected 2026-08-09 — `T2` and `T37` are no longer landed.** Both `unitsOffered` ownership guards
> were **removed from the code** by the owner: **`cd47f713`** (T2, equipment) and **`ecec55be`** (T37,
> yard), the latter for the second time, along with their test suites. Neither was ever a v3 requirement
> — §7 asks for no new validation — so nothing in V1…V18 depends on them.
>
> Struck rather than deleted, because deleting the line is what let this happen: T37 was closed in
> `tickets.md` §A while its full body stayed live in `archive-tickets-v2.md`, a reader rebuilt the guard
> from it, and it shipped. **Do not reinstate either guard from any document in this folder.**

v3 §7.1 names `GET /me/bids/{bidId}/fleet` → `mapFleet` → `FleetMachine` as **the** data source, and §7.2
names `unitAvailability`/`locationSource` as **the only derivation**. Both are exactly what T5 and T1
built. §7.3 keeps the request contract unchanged.

**`T7`** (`city` / `contactInfo`) — **shipped, now outside this feature.** Off-platform is out of scope
in v3, but the fix is a genuine defect repair and is already merged to `staging`. Keep; stop counting it
against this spec.

### Web contract — keep with edits

| | Disposition |
|---|---|
| **T8** types | **KEEP.** `FleetMachine`/`OfferedUnitDetail` is v3's contract verbatim |
| **T8** `supplierCompanyId` grouping | **KEEP, driver gone.** It existed for AC-70's per-company chat tabs, which v3 deletes. It still correctly serves the *upstream* bids surface (`GroupBids` supplier chips), so it stays — but nothing in v3 needs it |
| **T9/T10** `bid-map.ts` | **EDIT.** Function-by-function below |

**`bid-map.ts` — what survives:**

| Export | v3 |
|---|---|
| `unitAvailability` · `AVAILABILITY_COLOUR` | ✅ **core** — RM3-AC-19 makes it the single colour source for pin *and* card chip |
| `resolveUnitLocation` · `isPlottable` | ✅ RM3-AC-22 — an `absent` unit is not drawn |
| `decollide` · `MIN_PIN_GAP_PX` | ✅ markers still collide |
| `unitCountLabel` | ✅ RM3-AC-08 — the type word agrees with the count |
| `unitCounts` | ✏️ **EDIT** — RM3-AC-31 fixes `claimed = offered − registered`, **clamped at zero**, never derived from the fleet total |
| `unitIndicators` | ✏️ **EDIT** — RM3-AC-32 merges availability + commitment into **one** chip |
| `compositionBuckets` | ❌ **DROP** — the composition bar is replaced by count pills + the shortfall alert |
| `sortBids` | ❌ **DROP** — there is no offers list to sort. The equipment list is a plain nearest-first sort |
| `colourKeyModel` | ❌ **DROP** — v3 has no colour key; §6.8 states the scale in copy |

### Web UI — this is where the cost is

**1,463 lines of built UI**, of which roughly a third is invalidated:

| Ticket | Built | Disposition |
|---|---|---|
| **T11** list∣map toggle | 3 call sites in `GroupBids` | ❌ **UNDO → replace.** v3 enters by *clicking a bid card*, not a view toggle. The wiring is reusable; the toggle is not |
| **T12** workspace + canvas | `BidMapWorkspace` 276 · `MapCanvas` 358 | ✏️ **REWORK.** The canvas survives; the shell's three-state model (project → supplier → machine) is gone. v3 opens already scoped to one bid |
| **T13** bid list panel | **225 lines** | ❌ **UNDO in full.** No offers list exists in v3 |
| **T15** colour key | **69 lines** | ❌ **UNDO.** Not in v3 |
| **T16** machine pins | in `MapCanvas` | ✏️ **EDIT.** Keep the pin, drop the **hollow not-in-offer variant** — RM3-AC-09/10 list *offered machines only*. Add the availability label, distance chip and dotted route (§6.8) |
| **T17** footer | not built | ✏️ **EDIT** — relocate to the panel bottom (§6.10), still a re-host |
| **T33** edge rail | not built | ❌ **DROP.** Replaced by the chat dock |
| **T18–T22** panel/tabs/composition/chips/docs | not built | ❌ **DROP and rewrite** — see the new set. v3's detail is a hero + 2 tabs + a match grid; v2's was 3 tabs + composition bar + serial chips |
| **T23** no-registered-machines state | not built | ✅ **KEEP** → RM3-AC-26 |
| **T24** compose requests | not built | ✅ **KEEP**, widened to **four** requests (RM3-AC-17) |
| **T25** derived card state | not built | ✅ **KEEP** → RM3-AC-18 |
| **T26** notices | not built | ✏️ **REDUCE** to the dock's unread badge. The bubble/popup/`+N` system is not in v3 |
| **T27** chat tabs per item | not built | ❌ **DROP.** One bid ⇒ one room |
| **T28** reply echo reader | not built | ✅ **KEEP** — §7.3 keeps `{inReplyTo, equipmentId, resolution}` |
| **T29–T32** off-platform hosting | not built | ❌ **DROP entirely** (§6.11). Replaced by one routing rule — RM3-AC-25 |
| **T34/T35** off-platform defects | **shipped** | ✅ Keep as shipped bug fixes; out of this spec's scope |
| **T36** the 50 km refine | not built | ✅ **KEEP** as a standalone defect on the upstream list |
| **T38–T43** verification gates | — | ✅ **KEEP**, re-pointed at `RM3-*` |

### Net

| | |
|---|---|
| **Landed and still correct** | 13 tickets (9 backend + T8/T9/T10 partly + T34/T35) |
| **Landed and to be undone** | **~300 lines** — `BidListPanel` (225), `ColourKey` (69), the toggle wiring, plus 3 `bid-map.ts` exports |
| **Never built, now dropped** | T18–T22, T27, T29–T33 — **11 tickets** the rescope deleted before they cost anything |
| **New** | 13 tickets below |

The rescope's timing was lucky: everything it deletes was either unbuilt or is a contained component.

## New tickets — V1…V13

| | Ticket | ACs |
|---|---|---|
| **V1** | **Entry point** — open from a bid card, scoped to one bid; remove the list∣map toggle | 01 |
| **V2** | **Panel shell + header** — fixed-width panel, map fills; company name, verified chip, company-documents entry, and nothing else | 01, 02 |
| **V3** | **The counts** — three cases as pills, type word agreeing with the count from the request | 03, 04, 08 |
| **V4** | **Shortfall alert** — only when `claimed > 0`; **orange, never red**; states the consequence; action sends `alternative` with a **null** `equipmentId` | 05, 06, 07, 31 |
| **V5** | **Equipment list** — flat, nearest-first, **offered only**; card = photo · model · year · one availability chip carrying commitment · distance · certificate chips or an explicit none; **no serial, no load capacity**; اطلب التأكيد in **blue** when unconfirmed | 09, 10, 11, 12, 13, 32, 33 |
| **V6** | **Landing pre-selection** — the offer's confirmed machine selected on arrival, pin lifted with halo + in-offer tag, **no detail opens**; finite ~6-cycle pulse preserving the resting shadow | 34, 35 |
| **V7** | **Equipment detail** — hero photo + back, two tabs, availability/distance/yard line, and the **six-cell match grid against this request** (green / grey / red, each stating its finding) | 14, 36, 37 |
| **V8** | **Equipment documents** — two groups (photos · documents), each with its own attention count, **presence only, never verification**, select-all + per-row checkbox, batch request | 16, 38, 39, 42 |
| **V9** | **Company panel** — overlay with its own dark header; batch-selectable document list, **no IBAN**; **verification state + expiry**; attention count, never a total | 40, 41 |
| **V10** | **Map v3** — project pin, one marker per **offered** machine, availability label, distance chip, dotted route; card ↔ marker focus stays in step; `absent` units not drawn; colour from `unitAvailability` only | 15, 19, 20, 21, 22 |
| **V11** | **Requests** — the four asks, each bound to one `equipmentId` (null for the shortfall), state derived per render | 17, 18 |
| **V12** | **Chat dock + price footer** — persistent dock with the unread badge, no rail; footer at the panel bottom re-hosting the existing bar | 23, 24 |
| **V13** | **Routing + empty state** — an off-platform bid never opens this surface; a supplier with no registered machines gets an explanatory state with no empty card furniture | 25, 26 |

**Explicitly absent, and asserted as such:** ~~no distance filter (AC-28),~~ no bid-quality score/ring
(AC-29), no reason on the unconfirmed chip (AC-30). These are *negative* ACs — V5 and V10 must prove the
view model exposes no such field, not merely that nothing renders.

> **Superseded for AC-28, 2026-08-08 (owner decision).** The equipment list gets filters. AC-28 is
> rewritten from a prohibition into the control it forbade, AC-28a→28e carry the four rules that keep it
> safe, and the work is **V18** in [`tickets.md`](tickets.md). The v3 argument for removal is withdrawn
> in the open, not deleted: it held for the **v2** control, which filtered competing offers on the bids
> list, and does not carry to a list of one lessor's machines.

## Coverage

All 42 `RM3-AC-*` map to V1–V13, except **AC-27**, which is backend and **already satisfied** by T1/T5
(`yardConfirmed` read from this bid's `unitsOffered` entry, reported never rendered).

## Sequence

```
1. UNDO first          BidListPanel · ColourKey · the toggle · 3 bid-map exports
2. V1 V2 V3 V4         entry, shell, counts, shortfall      ← the panel's spine
3. V5 V6 V10           list, pre-selection, map             ← the surface becomes real
4. V7 V8 V9            detail, equipment docs, company docs ← the verification content
5. V11 V12 V13         requests, dock + footer, routing
6. T38–T43             the gates, re-pointed at RM3
```

Undo first, deliberately: leaving `BidListPanel` and `ColourKey` in place while building V2–V5 would mean
two competing panels in one directory and a reviewer unable to tell which is live.

## Two things to confirm before building

1. **`design.md` and `prototype/` describe the v2 prototype.** v3 names a different source of truth —
   `Deal Room Map.html` + `docs/rentee-map-v3-elements.md`. **The v3 prototype needs the same extraction
   treatment**, or V5–V9 will be built from prose while the exact geometry sits unread in a file. That is
   the single biggest risk to "matches the prototype".
2. **The six v2 UI decisions** (palette, pin labels, no index badge, taxonomy image, «المؤجّر»,
   `contact_info`) — 1, 3, 4 and 5 carry over untouched. Decision 6 is now moot here since off-platform
   left the surface. Decision 2's pin label wording should be re-checked against v3's
   *«مؤكّد توفرها» / «لم يؤكد توفرها بعد»*, which differs from v2's «متاحة» / «غير مؤكّدة».
