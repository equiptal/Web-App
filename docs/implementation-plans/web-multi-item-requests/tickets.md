# Tickets — Grouped Requests & Bids (Phase 1: My Requests)

Branch: `web-app/multi-item-requests`
Prototype: `prototypes/requests-grouped.html`
Plan: see conversation / `plan.md`

A multi-item RFQ is fanned out by the backend into one single-item `EquipmentRequest` per item, **all sharing one `requestGroupId`** (stamped in `agents-backend createRequest`). The read endpoint `GET /marketplace/my-requests` already returns `requestGroupId` per request and accepts a `?groupId=` filter — so this is **frontend-only**. Phase 1 reshapes the **My Requests** segment of `/requests` to cluster by group (the circled view) and adds a single-page multi-item **group detail**. My Bids grouping is **Phase 2** (out of scope here).

**Cross-cutting:** data is unchanged; grouping + the "City — Neighbourhood" label are derived client-side. Group-level fields (address, date, type) are identical across a group (shared `baseRequestData`). **Design/style = prototype**, mapped to existing `requests-proto.css` tokens. Implement top-to-bottom; all ride `web-app/multi-item-requests`.

## Decisions (locked)
- **A** — Group label = **Location** (`City — Neighbourhood`), derived by `parseAddress(projectAddressLabel)`; full address in the group strip. Heuristic over Google's formatted address; falls back to the raw label.
- **B** — "View full request details" → **one page rendering all the group's requests together** (multi-item), not per-item navigation.
- **C** — My Bids grouped (Phase 2).

---

## Contract & data

### T1 — Grouping model: `requestGroupId`, `parseAddress`, `groupRequests`
**Scope:** contract
**Files:** `src/lib/contract/requests.ts`
**Description:**
- Add `requestGroupId: string | null` to `RequestListItem`; map it in `mapRequestListItem` (`str(r.requestGroupId)`).
- Add `parseAddress(label: string | null): { city: string | null; neighbourhood: string | null }` — split the Google-formatted address on commas, drop country + postcode tokens; `city` = segment preceding the postcode/country, `neighbourhood` = the district segment before the city. Tolerant: returns nulls when it can't parse.
- Add `RequestGroup` type + `groupRequests(items: RequestListItem[]): RequestGroup[]` — bucket by `requestGroupId` (ungrouped/null → a group of one keyed by the item id, preserving order); derive per group: `id`, `items[]`, `city`/`neighbourhood`/`locationLabel` (`City — Neighbourhood`, falling back to raw `city`), `address` (full), `createdAt`, `type`, `overallStatus` (single shared status, else `"MIXED"`), `totalBids` (Σ bidCount), `asap` (any item urgency ASAP).

**Given/When/Then:**
- Given several requests sharing a `requestGroupId` / When grouped / Then they form one `RequestGroup` with `items.length === N`.
- Given items with mixed statuses / Then `overallStatus === "MIXED"`; all-equal → that status.
- Given a standard address "…, Al Olaya, Riyadh 12331, Saudi Arabia" / Then `locationLabel === "Riyadh — Al Olaya"`; given an unparseable label / Then it falls back to the raw label (no crash).

### T2 — `groupId` passthrough for the group-detail fetch
**Scope:** api-integration
**Files:** `src/lib/api/client.ts`, `src/app/api/me/requests/route.ts`
**Description:**
Add an optional `groupId` to `fetchMyRequests({ status?, type?, groupId? })` and forward it as `?groupId=` through the BFF route to backend `my-requests` (handler already supports it). Add `fetchRequestGroup(groupId)` returning the group's requests (full list-row shape incl. all request fields + the single `equipmentItems[0]` + `bidCount`) for the group-detail page.

**Given/When/Then:**
- Given a `groupId` / When `fetchRequestGroup` runs / Then only that group's requests return.
- Given no `groupId` / Then the list endpoint behaves exactly as today (no regression).

## Web — My Requests UI

### T3 — Grouped My Requests list (the circled view)
**Scope:** web-requests-ui
**Files:** `src/components/requests/RequestsList.tsx`
**Description:**
Restructure the **My Requests** segment around `groupRequests(items)` with `activeGroupId` state:
- **Level-1 location chips** (`.flevel/.flab/.chips-row/.req-chip`): one per group, `"{City — Neighbourhood} · {N} items"`, ASAP dot when any item is ASAP; selecting sets the active group.
- **Group context strip** (`.gctx`): location title, full address, `date · group display id`, overall-status badge, type badge, total-bids count, and a "View full request details" link → `/requests/group/{id}` (T4).
- **Content**: the existing per-item request cards for the active group only (each card still routes to its own `/requests/{itemId}`).
The seg-tabs (My Requests / My Bids) and the My Bids segment are unchanged in Phase 1.

**Given/When/Then:**
- Given requests across 3 groups / When My Requests renders / Then 3 location chips show, the first group is active, and its item cards render with the group strip above.
- Given a single-item submission / Then it appears as a one-item group (chip shows "· 1 item").
- Given a group with mixed item statuses / Then the strip shows the "Mixed" status badge.

### T4 — Multi-item group detail page (Decision B)
**Scope:** web-requests-ui
**Files:** `src/app/requests/group/[groupId]/page.tsx` (new), `src/components/requests/RequestGroupDetail.tsx` (new)
**Description:**
New route + component that fetches `fetchRequestGroup(groupId)` and renders **all the group's requests on one screen** as a multi-item view: shared request info **once** (location + `LocationMap`, timing/period, commercial terms — identical across the group), then **each item as a card/section** (reuse the item-spec rendering from `RequestDetail`) with its own status badge + bid count + link to that item's bids/detail. Title = the location label. Handles loading/error/empty.

**Given/When/Then:**
- Given a group of 3 requests / When the detail page opens / Then one screen shows shared info once + 3 item sections.
- Given the shared fields differ unexpectedly / Then the shared block uses the first request's values (they should match by construction) and per-item fields render per card.
- Given an invalid/empty groupId / Then a friendly empty/error state shows.

## Web — styling & i18n

### T5 — Port grouped CSS classes
**Scope:** web-styling
**Files:** `src/components/requests/requests-proto.css`
**Description:**
Add the grouped classes from the prototype not yet present: `.flevel`, `.flab`, `.chips-row` (scrollable), `.gctx` + `.gx-*` (icon/title/count/meta/badges/bids/link), `.level2` (reserved for Phase 2), `.st-mixed`, `.contentbar`. Reuse existing tokens; keep RTL correctness (`.gx-link`/chevrons mirror).

**Given/When/Then:**
- Given the grouped list / Then chips, the navy group strip, and badges match the prototype in both LTR and RTL.

### T6 — i18n strings (EN/AR)
**Scope:** web-i18n
**Files:** `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`
**Description:**
Add: "items" / "{n} items", "{n} items in this request", "Mixed", "View full request details", group-strip labels, and any list labels introduced. Bilingual; keep the existing `requests`/list keys.

**Given/When/Then:**
- Given `ar` locale / Then group chips, strip, and counts render in Arabic, RTL; given a language switch / Then it persists.

## Testing

### T7 — Unit tests for grouping + address parse
**Scope:** testing
**Files:** `tests/unit/requests.test.ts` (new or extend)
**Description:**
Vitest coverage for the pure helpers: `parseAddress` (standard SA address → city/neighbourhood; messy/short → graceful fallback), `groupRequests` (bucketing by `requestGroupId`, order preservation, single-item group, `overallStatus` single vs MIXED, `totalBids` sum, `asap` any), and `mapRequestListItem` surfacing `requestGroupId`.

**Given/When/Then:**
- Given each helper case above / When its test runs / Then the asserted shape holds.
- Given the suite / When `npm test` runs / Then all new tests pass alongside the existing 79.

---

---

# Phase 2 — My Bids grouped

Reshape the **My Bids** segment to mirror the prototype: Level-1 **location/group chips** (reused from Phase 1) → group context strip → Level-2 **supplier filter** → **equipment-focused** bid cards across all the group's items → sticky `qbar` quotation select. `getBidList` is per-request, so a group's bids are fetched per request id and merged.

### T8 — Bid contract: supplier id + item scope
**Scope:** contract · **Files:** `src/lib/contract/bids.ts`
Add `supplierId: string | null` to `BidCard` (Level-2 key) and map it (`sup.id`). Add pure helpers: `bidSuppliers(bids)` → distinct `{ id, name, verified, count }`, and a stable sort that keeps competing offers on the same item together.

### T9 — Group bids fetch + tag
**Scope:** api · **Files:** `src/components/requests/GroupBids.tsx` (or `client.ts`)
For the active group, `Promise.all` `fetchBids(requestId)` over every request id; tag each bid with its `requestId` + `itemLabel` (from the group item). Merge into one list.

### T10 — `GroupBids` component
**Scope:** web-requests-ui · **Files:** `src/components/requests/GroupBids.tsx` (new)
Level-2 supplier chips ("All suppliers" + one per supplier with count); equipment-focused bid cards (class label header + supplier line + offered-equipment row with "View details" → `EquipmentDetailModal`, terms donut, price breakdown, lifecycle chips, negotiate footer → deal room); select-for-quotation `qbar` + the PDF/print export (reused from `RequestBids`).

### T11 — Wire My Bids to grouped
**Scope:** web-requests-ui · **Files:** `src/components/requests/RequestsList.tsx`
Replace the flat My Bids segment with: group (location) chips + group context strip (reuse Phase 1) + `<GroupBids group={activeGroup} />`. Seg count = total bids across groups.

### T12 — CSS for equipment-focused bid card + supplier chips
**Scope:** styling · **Files:** `requests-proto.css`
Port `.bid-eq`, `.bid-by`, `.eqv-ok/.eqv-no`, `.sup-chip`, `.level2`, `.bid-for-line` from the prototype (the rest of `.bid*` already exists).

### T13 — Tests
**Scope:** testing · **Files:** `tests/unit/bids.test.ts`
Cover the pure helpers: `supplierId` mapping, `bidSuppliers` distinctness/counts, and the item-stable sort.
