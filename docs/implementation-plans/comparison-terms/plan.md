# Implementation Plan — Comparison table ↔ terms-journey alignment

**Source:** free-form (compairson.md) + terms-journey doc
**Generated:** 2026-06-25

## Summary
Align the bid-comparison table rows with the canonical terms journey (Request T2 → Bid T3 → Deal Room T4). Move the verified/company-docs into the column identity, lock the cost math (rate × duration × qty; mob/demob × qty), gate cost-adding by the request side with deal-room conflict colouring, and source the equipment safety certs + ownership + operator cert from the deal-room terms — handling the Acknowledge→Negotiable transition gracefully with a "confirm in the deal room" link.

## Scope
- **In:** comparison table UI (`BidComparisonWorkspace.tsx`), cost math (`comparison.ts`), term/cert sourcing (`bids.ts`), tests.
- **Out (backend-dependency):** the backend moving `operator_included` / `operator_certification` / equipment-safety-certs from Acknowledge to **Negotiable** (supplier-declarable with a value + state). Until then, Phase A (acknowledged + on-file + link) is correct.
- **Assumption:** mob/demob are per-unit when on the supplier (× quantity), not × duration.

## Terms-journey facts driving this
- Buckets: **Acknowledge → `fixed`**, **Negotiable → `soft_accepted`/`disputed`**, **Priced → `pending`**.
- Today `operator_included`, `operator_certification`, equipment safety certs are **Acknowledge-only** (no declared value to conflict on). 🔀 planned to become Negotiable.
- Negotiable terms that can conflict and are relevant to the cost row: `fat_food`, `fat_accommodation_transport` (operator-only).

## Phases
- **Phase A (front-end only — ships now):** Tickets T1–T5 + T6-A.
- **Phase B (gated on backend):** T6-B — read declared value + state once those terms are Negotiable.

## Risks & dependencies
- T6-B blocked on Moedatech-App moving the three terms to Negotiable and exposing the declared value + state in the bid/deal-room payload (track via `/web:link-backend`).
- Mob/demob × quantity changes the "one-time" assumption — confirm with product (Q1).
