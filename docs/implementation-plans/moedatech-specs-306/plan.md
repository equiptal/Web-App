# Implementation Plan — Bid-comparison procurement workspace (renter web)

**Card:** https://github.com/equiptal/moedatech-specs/issues/306
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/007-bid-comparison/
**Card id:** moedatech-specs-306
**Generated:** 2026-06-21

## Summary
A signed-in basic/verified renter opens a **procurement workspace** for one of their requests and compares every bid on a fair, like-for-like basis — organized **location → request → item**, rendered in three blocks (**Cost · Equipment · Trust & documents**), with each bid **qualified against the renter's own requirements** (size, year, required certs, required-included costs, required docs) so conflicting cells go **red** and matching cells **green**. Cost is an **all-in figure built only from stated data** (rate normalized to the rental period + stated mob/demob), plus a cash-upfront figure; the five cost-responsibility items show **who handles them** with green/red alignment, and the renter can enter their own expected cost for a responsibility that lands on them. **Mansour** flags a recommended bid ("Mansour's pick") with transparent reasons in an **Ask-Mansour chat**, re-ranks on presets / free-text preferences (saved to profile), answers what-ifs, learns from awards, and recognizes suppliers the renter has history with. Off-platform quotes (Excel/PDF) can be uploaded and parsed into the same comparison. Award / Negotiate hand off to the existing **deal room**. The goal: replace the renter's in-head / spreadsheet comparison with a fair, transparent, data-only workspace.

## Acceptance criteria covered
_Full Given/When/Then text in the linked `acceptance.md`. AC titles below are verbatim; **Owner** tag routes the Web vs Agent(Mansour) vs Shared split._

- **AC-01** (Web) — Open the workspace from the sidebar
- **AC-02** (Web) — Open the workspace from the My Bids view
- **AC-03** (Web) — Location → request → item navigation
- **AC-04** (Web) — Multi-quantity item stays one comparison
- **AC-05** (Web) — Three-block side-by-side layout
- **AC-06** (Web) — At-a-glance verdict per bid
- **AC-07** (Web) — Collapsible sections
- **AC-08** (Web) — Requirement qualification (red / green)
- **AC-09** (Web) — All-in cost from stated data
- **AC-10** (Web) — Not-stated split
- **AC-11** (Web) — Cost-responsibility alignment
- **AC-12** (Web) — Renter-entered cost adjusts the total
- **AC-13** (Shared) — Data-only — no fabricated values
- **AC-14** (Web) — Supplier selector add / remove
- **AC-15** (Web) — All bids deselected — empty state
- **AC-16** (Web) — Excluded bid — Negotiate and Bring back
- **AC-17** (Agent) — Mansour's pick flagged
- **AC-18** (Agent) — Transparent reasons in the Ask-Mansour chat
- **AC-19** (Agent) — A cost-shift bid is weighed down
- **AC-20** (Shared) — Preset re-ranks and highlights the best column
- **AC-21** (Agent) — Free-text preference with interpretation echo
- **AC-22** (Agent) — Preference saved to the profile
- **AC-23** (Agent) — What-if in the chat
- **AC-24** (Agent) — Award-learning nudge
- **AC-25** (Shared) — Supplier recognition across items
- **AC-26** (Shared) — Upload an off-platform quote
- **AC-27** (Shared) — Upload parse failure
- **AC-28** (Web) — Award opens the deal room
- **AC-29** (Web) — Negotiate opens the deal room
- **AC-30** (Shared) — Per-item awards, marked and recorded
- **AC-31** (Web) — Empty — no bids
- **AC-32** (Web) — Single bid (incl. DIRECT request)
- **AC-33** (Web) — All bids fail requirements
- **AC-34** (Shared) — Request set no requirements
- **AC-35** (Web) — Missing data handled gracefully
- **AC-36** (Agent) — Type / size drift
- **AC-37** (Web) — Missing-but-required field
- **AC-38** (Web) — Multiple rounds from one supplier
- **AC-39** (Web) — Bid on an inactive / deleted listing
- **AC-40** (Web) — Trial requests excluded
- **AC-41** (Web) — Grouped request
- **AC-42** (Shared) — Trust / finance display rules
- **AC-43** (Web) — English and Arabic (RTL)

## Architecture overview
Net-new renter-web surface. Reuses the existing app shell, the bids data already wired for request-details (`GET /marketplace/requests/{id}/bids` → `getBidList`, mapped in `src/lib/contract/bids.ts`), the request/requirements data (`fetchRequestDetail`), and the existing **deal room** as the award/negotiate hand-off target (`startDealRoom` / `/deal-room/{id}`).

New web pieces (the **deterministic** half — Web-owned ACs):
- **Route + workspace shell** — `src/app/compare/*` (a `Bid Comparison` surface; the sidebar already has a `compare` nav item → `/compare`, and `CompareBids.tsx` exists as a stub to evolve). Location → request → item nav (AC-01/03/04), entry from My Bids `select → Compare` (AC-02).
- **Comparison contract + builder** (`src/lib/contract/comparison.ts`, new) — assembles per-item bid columns from `BidCard[]` + the request's requirements; computes: all-in cost = rate normalized to the rental period + stated mob/demob (AC-09); `+X% vs lowest`, cash-upfront (AC-09); `not stated` handling (AC-10/35); requirement qualification red/green per cell (AC-08); cost-responsibility alignment for the 5 items (AC-11); renter-entered-cost adjustment (AC-12); latest-round-only + live-only filtering (AC-38); inactive-listing warning (AC-39); type/size "needs check" display (AC-36 display side); trial exclusion (AC-40); grouped-request regroup (AC-41). **All deterministic math on stated data — no fabricated values (AC-13).**
- **Comparison UI** — three collapsible blocks (Cost/Equipment/Trust, AC-05/07), per-bid verdict header (AC-06), supplier selector chips + add/remove + excluded chip with Bring back/Negotiate (AC-14/15/16), empty/single/all-fail/no-requirements states (AC-31/32/33/34), award/negotiate buttons → deal room (AC-28/29), per-item award marking (AC-30 web side), EN/AR + RTL (AC-43).

New pieces that depend on **Mansour** (the judgement half — Agent/Shared ACs): recommendation + "Mansour's pick" (AC-17), Ask-Mansour chat reasons + confidence (AC-18), cost-shift weighting (AC-19), preset/free-text re-rank + interpretation echo (AC-20/21), saved preference (AC-22), what-if (AC-23), award-learning nudge (AC-24), supplier recognition (AC-25), off-platform quote parse (AC-26/27), type/size confirmed-mismatch (AC-36 judgement side). These need **new backend/agent endpoints** the web will call (a recommendation/scoring endpoint, a chat endpoint, a saved-preference store, a quote-parse endpoint, award-history read).

## Backend — admin
_No admin surface changes (spec: admin impact `None`)._

## Backend — mobile
_No mobile UI changes (spec: mobile impact `None` this epic; mobile re-skins onto the same basis in a later epic). The scoring/comparison backend is intended surface-agnostic so the two don't diverge._

## Backend — web app
The deterministic comparison (cost math, qualification, selector, states, hand-off) is **web-buildable now** against the existing bids + request data. The judgement layer requires backend/agent endpoints that **do not yet exist on the web's backend**:
- **Recommendation / scoring** endpoint (per-item: ranked bids + pick + confidence + reasons) — feeds AC-17/18/19/20.
- **Ask-Mansour chat** endpoint (reasons, what-if recompute, interpretation echo) — AC-18/21/23.
- **Saved renter preference** read/write — AC-22 (and the award-learning default, AC-24).
- **Award history** read (which supplier the renter awarded, per item/request) — AC-24/25/30.
- **Off-platform quote parse** (Excel/PDF → comparable bid) — AC-26/27; the spec flags this as a **hard agent dependency** (extend Mansour's RFQ parsing to supplier quotes).
- **Data-quality prerequisites** — taxonomy alignment (listing subtype vs request subtype) and unit-aware totals — flagged **unconfirmed** in the spec; a dev/agent fix-first dependency that AC-08/09/36 rest on.

## API integration
- **Reads (exist):** `getBidList` (bids enriched with supplier/equipment/terms — already mapped in `bids.ts`), `fetchRequestDetail` (request + requirements + items), deal-room create/open.
- **New contracts needed:** recommendation/scoring, Ask-Mansour chat, saved-preference, award-history, quote-parse. These are the **agent↔web contract** and must be defined with the agent team (fan-out). Breaking-change risk: the scoring contract must be stable across web + the later mobile re-skin (spec: "surface-agnostic").
- Versioning: net-new endpoints; no existing contract changes.

## Data model / migrations
- **Web app:** none (web is a read/decide surface; no web DB).
- **Backend (out of web scope, flagged for the agent/backend team):** saved renter preference (new), uploaded-quote artifact (new, AC-26), award-history readability (confirmed available per spec). No migration authored in this web epic.

## Risks & dependencies
From `dependencies.md` + discovery:
- **Implementation is *deliberately delayed*** (dependencies.md): "this epic is standalone with **no release scheduled yet**." → building now is ahead of the spec's own sequencing.
- **Hard agent dependency — Mansour quote-file parsing must be extended** from RFQs to supplier quotes before the upload flow (AC-26/27) can ship.
- **Hard data-quality prerequisites — taxonomy alignment + unit-aware totals — status "unconfirmed"** (a dev fix-first dependency to confirm before build). AC-08/09/36 rest on them.
- **Agent capabilities (recommendation/scoring/chat/learning/recognition)** — the entire judgement layer (AC-17–25, AC-36) needs agent endpoints that aren't on the web backend today; these are sequenced via `/epic-agent-fanout`, **not within this spec PR**.
- **Prereqs confirmed shipped:** web-app/001 (sign-in), 002 (RFQ creation + requirements), 004 (My Bids entry), the deal room, recorded award history.
- **Prototype is build reference, not contract** — `acceptance.md` wins; known divergences (Bring-back, recognition badge, chat Award) to fold back into the HTML.

## Open questions
> Statuses set by Step 8. 🔴 blocks ticket creation · 🟡 doesn't block tickets but blocks shipping/UAT · ✅ resolved.

- 🟡 **Q1 (AC-17/18/19/20/21/23 — recommendation + chat layer):** **Corrected 2026-06-21 (Yara).** The agent endpoints exist on the **in-progress agent branch** (not yet on `staging` — that's why a staging code search came back empty). Status as of that branch:
  - **`/bids/recommend`** (with `user_id` → learned profile) — powers Mansour's pick + auto-personalized rank (AC-17/20). 🟡 **Needs migration 0016 + the nightly award-read job**; the non-personalized recommend path is live.
  - **`/bids/preferences`** + **`/bids/award-learning`** ("Make this my default", AC-22/24). 🟡 **Work but in-memory** until migration 0016.
  - **Ask-Mansour chat / what-if / free-text** (AC-18/21/23) — not confirmed available; treat as still pending.
  → So the judgement layer is **partially callable once the agent branch deploys to the staging agents stack**; the web can wire against these contracts with a **deterministic fallback** (the preset sort already stands in for the ranking). Wiring is gated on the agent branch + migration 0016 + the nightly job landing.
- 🟡 **Q2 (AC-26/27 — off-platform quote parse):** **Corrected 2026-06-21 (Yara).** Built on the agent branch — **`POST /bids/parse`** (LLM extraction) is ✅ live there. Wiring is gated only on that branch deploying + the web getting Mansour's base URL/auth/CORS.

**Scope correction (2026-06-21) — adopt the "third option":** 4 of 5 visible agent features have **live** endpoints (`POST /bids/recommend` → pick + tagged reasons + what-if + free-text; `POST /bids/parse` → quote upload). So wire the agent panel to those, and **soft-stub only the two infra-gated bits** (`/bids/preferences` + `/bids/award-learning` "Make this my default" → in-memory until migration 0016; auto-personalization via `/bids/recommend?user_id` → lights up silently when the nightly award-read job runs after 0016). The deterministic matrix is the **input** to `/bids/recommend` (`all_in_total` / `qualified` / `requirement_conflicts`), so it's a prerequisite, not an alternative. Web wiring depends on: the agent branch merged + deployed, Mansour base URL + auth/CORS on the web, and the agent-side integration note (endpoint contracts).
- ✅ **Q3 (AC-08/09/36 — data-quality the WEB needs):** **Resolved by payload audit.** The bids payload (`bids.ts`) already carries `priceUnit` (so unit-aware totals = rate normalized to the rental period is computable on the web) and `request.equipmentItems[0].capacityId` vs `equipment.measurementId` + category/subcategory (so taxonomy alignment / size match is computable — `buildBidTerms` already derives the measurement match red/green). The fields the deterministic comparison needs are present.
- 🟡 **Q4 (AC-22/24 — saved comparison preference):** **Resolved by search — net-new backend.** No saved-comparison-preference store exists (only notification preferences). AC-22 (preference saved to profile) + the AC-24 default need a net-new backend store + endpoint — part of the agent/backend build, not web-buildable alone.
- 🟡 **Q5 (AC-24/25/30 — award history / recognition):** **Resolved by search — no aggregate endpoint.** No `award`-named record/endpoint; an award is a deal-room **accept** (derivable from deal-room CLOSED status). The web could derive per-request accepted deals, but there is **no aggregate "suppliers this renter awarded across requests" endpoint** for the recognition badge (AC-25) — net-new backend.
- ✅ **Q6 (sequencing — the scope decision): RESOLVED 2026-06-21 (Yara).** Build the **deterministic web half now** (Web-owned ACs: 01–16, 28–43 + the web side of the Shared ACs). **Defer to a follow-up** (Agent/backend not ready, per Q1/Q2/Q4/Q5): AC-17, 18, 19, 21, 23 (Mansour pick/reasons/cost-shift/free-text/what-if), AC-22 (saved preference), AC-24 (award-learning), AC-25 (recognition), AC-26/27 (quote upload), and the agent-judgement side of AC-20 and AC-36. Q1/Q2/Q4/Q5 therefore don't block this round — they document why those ACs are out of scope now (see Out of scope).
- 🟡 **Q7 (tentative strings + prototype divergences):** several strings are `(tentative — PM-confirm)` (`Bid Comparison`, `Compare`, `Mansour's pick`, `excluded`, verdict copy) and there are known prototype divergences (Bring-back, recognition badge, chat Award) to fold back. Confirm copy before UAT. PM/process (Yara).

## Out of scope
- **Deferred to a follow-up round (Agent/backend prerequisites not built — per the Q6 decision 2026-06-21):** AC-17, AC-18, AC-19, AC-21, AC-23 (Mansour's pick + Ask-Mansour chat reasons/confidence + cost-shift weighting + free-text re-rank + what-if), AC-22 (preference saved to profile), AC-24 (award-learning nudge), AC-25 (supplier recognition badge), AC-26/AC-27 (off-platform quote upload + parse), and the **agent-judgement side** of AC-20 (the pick highlight beyond a deterministic preset sort) and AC-36 (confirmed type/size mismatch). These ship once `/epic-agent-fanout` lands the scoring/chat/quote-parse contract + the saved-preference & award-history backends.
- Shared-link (web-app/006) external bids — deferred, not pulled into the comparison.
- In-app award/accept — actions only **open** the deal room; accepting/negotiating stays there.
- v2 (market-benchmark pricing, negotiation-headroom/pre-loaded deal room, supply alerts, real review trust) and v3 (multi-item award optimizer, re-quote-on-standard-scope, decision-justification PDF).
- Estimating/imputing any value a bid didn't state (data-only).
- Supplier rating as a knockout or weight (no usable data).
- Trial requests (excluded from the tool).
- Mobile comparison surface (unchanged this epic; mobile re-skins later).
- The agent-side build (Normalization-Agent + Training-Academy) — propagated via `/epic-agent-fanout`, not built here.
