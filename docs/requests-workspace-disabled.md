# The old requests surfaces — disabled

The renter's requests list, the two request-detail pages with their bid lists, and the bid-comparison
workspace are switched off. They are replaced by a single page at `/requests` — the requests
workspace — built in `docs/implementation-plans/requests-workspace/plan.md`.

**Nothing was deleted.** Every original file is preserved in place, line-commented, so re-enabling is
a mechanical revert. Same pattern as `docs/surveys-disabled.md`.

## What was disabled

| # | File | Was | How |
|---|---|---|---|
| 1 | `src/components/requests/RequestsList.tsx` | `/requests` and its Requests / Bids / Deals tabs | whole file line-commented |
| 2 | `src/components/requests/RequestDetail.tsx` | `/requests/[id]` | whole file line-commented — **two exports moved out first, see below** |
| 3 | `src/components/requests/RequestBids.tsx` | one request's bid list | whole file line-commented |
| 4 | `src/components/requests/RequestGroupDetail.tsx` | `/requests/group/[groupId]` | whole file line-commented |
| 5 | `src/components/requests/GroupBids.tsx` | a submission group's bid list | whole file line-commented |
| 6 | `src/components/compare/BidComparisonWorkspace.tsx` | `/compare` | whole file line-commented |
| 7 | `src/components/compare/CompareBids.tsx` | the quote-upload comparison | whole file line-commented — it already had **no callers** |

### The routes

All four now redirect to `/requests` rather than 404:

- `src/app/compare/page.tsx`
- `src/app/requests/[id]/page.tsx`
- `src/app/requests/group/[groupId]/page.tsx`

They are kept because the routes are in notification deep links and in whatever people bookmarked. A
404 would say the feature is gone; it has only moved. **The id is dropped rather than carried** — the
workspace resolves its own selection from the rail, and a stale or foreign id would land the renter
on a request that is not theirs to see.

### What moved out before the lights went off

`RequestDetail.tsx` exported two things that are not part of the retired page:

- `EditRequestModal` — the request's edit form
- `ConfirmCancelModal` (and its `CancelScope` type) — the cancel confirmation

The workspace drawer raises both. They now live in
`src/components/requests/RequestEditModals.tsx`, moved **verbatim** rather than rebuilt: a second
edit form for one request would drift from this one, and the copy is asserted by tests.

`Ditem` and `requestDetailRows` were exported too, but only `RequestGroupDetail` used them, and that
went as well — so they stayed with the commented file.

### Entry points repointed

| Where | Was | Now |
|---|---|---|
| `AppShell.tsx` account menu | a `Compare bids` item | removed — Compare is a tab of the workspace, reached from the dock's Requests |
| `HomeHub.tsx` new-bids banner | `/requests?tab=bids` | `/requests` |
| `HomeHub.tsx` Price Bids card | `/requests?tab=bids` | `/requests` |
| `HomeHub.tsx` Completed Deals card | `/requests?tab=deals` | `/inbox` — deal rooms already live there |
| `notifications.ts` deep links | `/requests/{id}`, `/requests/{id}?view=bids`, `/compare` | `/requests` |

`src/app/bids/[bidId]/equipment/page.tsx` already linked back to `/requests` and needed no change.

## Deliberately left alone

**The equipment-verification map.** `/bids/[bidId]/equipment` and everything under
`src/components/map/` is untouched and still live. It was never part of this cull — the workspace's
dark strip links straight into it.

**Every modal and card the workspace reuses**, all still live and imported: `BidTermsModal`,
`BidEquipmentModal`, `SharedBidSubmissionModal`, `SharedLinkBidCard`, `ShareForBidsSheet`,
`ExportTemplateDialog`, `BidVerifyModal`, `QuotationVerifyGate`, `SharedBidNegotiateRoom`.

**Every contract and pricing module.** `contract/comparison.ts`, `contract/bids.ts`,
`contract/link-bids.ts`, `contract/export-templates.ts`, `contract/agent-bids.ts` and
`pricing/rental.ts` are all read by the workspace. Commenting a component out never means retiring
what it computed with.

**The `/api/me/requests/[id]` and `/api/me/bids/[id]` routes**, and the rest of the BFF. The
workspace calls the same endpoints; only the screens changed.

## Two tests worth knowing about

Line-commenting preserves a file's text, so tests that assert against **source** rather than
behaviour keep passing. Two do, and both were annotated in place rather than left to mislead:

1. `tests/unit/fleet.test.ts` — "the BID-backed comparison workspace scores no ownership" reads
   `BidComparisonWorkspace.tsx` as text. The assertion still holds and is kept on purpose: it is the
   rule that file must satisfy on the day it is switched back on. It does **not** describe a surface
   a renter can reach today.
2. `tests/unit/map-no-quality-score.test.ts` — its positive control named
   `BidComparisonWorkspace.tsx` and `RequestBids.tsx` as surfaces that *do* render a bid-quality
   score, proving the map's "no quality score" rule is not vacuously true. A commented file imports
   nothing, so both were replaced with live surfaces that still render one —
   `SharedBidSubmissionModal.tsx` and `SharedLinkBidCard.tsx`. Replaced, not dropped: losing an entry
   quietly shrinks the control until it proves nothing.

## Re-enabling

1. Strip the leading `// ` from the seven files, and delete the three-line `// DISABLED` banner at the
   top of each.
2. Restore the four page files from git history (they are now three-line redirects).
3. Decide what to do about `EditRequestModal` / `ConfirmCancelModal`: either re-export them from
   `RequestDetail.tsx` and delete `RequestEditModals.tsx`, or leave them where they are and have the
   revived page import them. **Do not end up with two copies.**
4. Put back the entry points in the table above.
5. Re-point the two tests in the section above at whatever is live again.
6. `npm run typecheck && npm run lint && npm test && npm run build`.
