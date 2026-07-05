# Deal-room negotiation parity — batched counter-offer flow

**Slug:** `deal-room-negotiation-parity` · **Driver:** Yara (2026-07-04) — "why is web negotiation/counter
different from the app? use the app exactly." · **Source of truth:** mobile `apps/mobile/.../deal_room`.

## Goal
Make the web deal-room negotiation behave/logic-match the mobile app: **collect term resolutions
locally and submit once** (batched) at Counter/Accept, instead of the web's per-term immediate PATCH.

## Audit — web vs app (what differed)
| Aspect | App (truth) | Web (before) |
|---|---|---|
| Term resolution | Collected **locally**, submitted **once** at Counter/Accept | **Immediate PATCH** per term click |
| Counter payload | `batchUpdateTerms` (`/terms/batch`) **+** `proposeRate` together | price-only `proposeRate`; terms resolved separately |
| Accept payload | `accept-all-terms` `{contractType, termResolutions?, agreedUnits?}` | `{contractType:"platform", agreedUnits}` — no termResolutions |
| Reopen | **Local only** (drop the staged edit) | Sent `action:"reopen"` to the backend (web-only invention) |
| `agreedUnits` | Only for **assembled** multi-supplier deals | Sent for **every** deal |
| `contractType` default | `"formal"` | `"platform"` |
| Counter price fields | rate + mobilization + demobilization | rate + mob + demob ✅ (already matched) |

The **counter *price* logic already matched**; the divergence was the term-resolution architecture and
the reopen/agreedUnits/contractType details — all of which flow from per-term-vs-batched.

## What shipped (implemented, uncommitted)
Local-resolution model reusing the existing term-card UI:
1. Tapping Accept / Keep-mine / Counter on a term stores the choice in a **local resolutions map** (no
   server call). It moves to a "You'll send" group with **Undo**. Reopen is local-only.
2. **Counter** → `batchUpdateTerms(local resolutions)` then `proposeRate(rate, mob, demob)` — one move.
3. **Accept** → `accept-all-terms` `{ contractType:"formal", termResolutions }`, **no** `agreedUnits`
   (web has no assembled deals → matches the app's single-supplier path).
4. Reload after submit clears local state (server term states take over). No server-side reopen.

## Files
- **NEW** `src/app/api/me/deal-rooms/[id]/terms/batch/route.ts` — POST proxy → backend `/terms/batch`.
- `src/lib/api/client.ts` — `batchUpdateTerms` + `TermUpdate`; `acceptDeal(id, "formal", {termResolutions?, agreedUnits?})`.
- `src/app/api/me/deal-rooms/[id]/accept/route.ts` — default `formal`; forwards `termResolutions`.
- `src/components/deal-room/DealRoomTerms.tsx` — local resolutions (`resolutions`/`onResolveLocal`/`onReopenLocal`); "You'll send" group + Undo; server `reopen` removed.
- `src/components/deal-room/DealRoom.tsx` — `resolutions` state; batched Counter + Accept; gating on unresolved disputed terms.

## Verification
`tsc --noEmit` ✅ · `eslint` (5 files) ✅ · `next build` ✅ · `vitest` 211 ✅. Backend `/terms/batch` +
`accept-all-terms` with `termResolutions` confirmed to exist on `staging` serverless.yml; runtime not
yet exercised (needs staging deploy).

## Open items (flagged for review)
1. **Counter always calls `proposeRate`** even if the rate is unchanged (the web's Counter *is* the
   price modal). Harmless (re-proposes same rate) but not identical to the app's "terms-only counter"
   path. A true match needs a separate "send term counters (no price)" action.
2. **Accept gating** blocks only on `disputed` terms (as before); locally-resolved `pending` terms are
   sent but don't block accept.
3. Backend runtime behavior of the batched endpoints not yet tested end-to-end (staging).
