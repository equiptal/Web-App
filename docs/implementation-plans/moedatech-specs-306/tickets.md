# Tickets — Bid-comparison procurement workspace (renter web)

Card: https://github.com/equiptal/moedatech-specs/issues/306
Plan: ./plan.md

Scope decision (2026-06-21): this round builds the **deterministic web half** only. The Agent/judgement
ACs (17–27, 36 judgement side, 22, 24, 25) are deferred — see plan.md "Out of scope". Implement top to bottom.

> Note: 007 is a renter-**web** epic — there is no admin or mobile work, and no web DB. The scope
> groups below are web areas. The standard Backend/admin · Backend/mobile · API headings are kept at
> the end with their status for the board.

## Web — workspace shell & navigation

### T1 — Workspace route + location → request → item navigation
**Scope:** web
**ACs:** AC-01, AC-03, AC-04
**Description:**
Build the Bid Comparison workspace at `/compare` (the sidebar `compare` nav already points here; evolve `src/components/compare/CompareBids.tsx` / add `src/app/compare`). Top-nav grouped by **location** (each location shows its item count); selecting a location shows the request as a header card with a **tab per equipment item**; selecting an item tab shows that item's bids. A multi-quantity item is **one** tab priced for all units. Source data from the renter's requests (`fetchMyRequests` / `fetchRequestGroup`) + per-request bids (`fetchBids`).

**Given/When/Then:**
- Given a signed-in basic/verified renter with ≥1 request that has bids · When they open the sidebar `Bid Comparison` · Then the workspace opens grouped by location (with item counts) and the first location's request + item tabs show. (AC-01)
- Given the workspace open · When they select a location tab · Then that location's request shows as a header card with a tab per equipment item, and selecting an item tab shows that item's bids. (AC-03)
- Given an item with quantity > 1 (e.g. 2 units) · When the renter opens its tab · Then it is one tab priced for all units (e.g. `rate/day × 90 × 2`), not one tab per unit. (AC-04)

### T2 — "Select → Compare" entry from My Bids
**Scope:** web
**ACs:** AC-02
**Description:**
On the existing My Bids view (grouped by supplier), add a multi-select + `Compare` affordance that opens the workspace with the selected bids **reorganized by item** under their request.

**Given/When/Then:**
- Given the renter on My Bids (bids grouped by supplier) · When they select one or more bids and choose `Compare` · Then the workspace opens with those bids reorganized by item (not by supplier), under their request. (AC-02)

## Web — comparison engine (deterministic, data-only)

### T3 — All-in cost from stated data + cash-upfront + cost bar / +X% vs lowest + not-stated
**Scope:** web
**ACs:** AC-09, AC-10, AC-13, AC-35
**Description:**
Add `src/lib/contract/comparison.ts` that builds per-item bid columns from `BidCard[]`. All-in = rate **normalized to the rental period** (per `priceUnit`) + stated mob/demob only, labelled `All-in · stated only`; show a cost bar + `+X% vs lowest` (or `lowest`) + `Cash upfront`. A missing **cost** figure → `not stated` (never `0`/`free`); missing duration → rate-per-unit + a prompt to set a duration; missing distance → `distance unknown`; missing expiry → `no expiry`; missing listing capacity → `size can't be verified` (do not auto-exclude on size). **Only stated data or deterministic math — no fabricated values.**

**Given/When/Then:**
- Given a bid stating a rate (+ optional mob/demob) · When the all-in shows · Then it equals rate-normalized-to-period + stated mob/demob, labelled `All-in · stated only`, with a cost bar + `+X% vs lowest` + `Cash upfront`. (AC-09)
- Given a bid missing a cost figure (rate/mob/demob/duration/distance) · Then it shows `not stated`, never `0`/`free`. (AC-10)
- Given any cell · Then its value is stated data or deterministic math on it; no agent-estimated monetary value appears. (AC-13, web side)
- Given missing data · Then each missing field degrades per AC-35 (rate-per-unit + duration prompt, computed all-in, `distance unknown`, `no expiry`, `size can't be verified`) and nothing shows as `0`/`free`. (AC-35)

### T4 — Requirement qualification (red/green) + cost-responsibility alignment + renter-entered cost
**Scope:** web
**ACs:** AC-08, AC-11, AC-12, AC-34, AC-37
**Description:**
Qualify each bid against the request's requirements (size, year, required certs, required-included costs, required docs): cell **red** on conflict, **green** on match (reuse the request-vs-bid compare already in `bids.ts buildBidTerms`). The five cost-responsibility items (fuel, maintenance, overtime, operator food, operator transport & accommodation): green when the bid's responsibility matches the request's assignment, red on conflict either way. For a responsibility landing on the renter, a renter-entered expected cost adjusts the comparable total (no agent estimate). A request with no requirements → no red framing (pure ranking). A required field a bid doesn't state → `needs confirmation`, not auto-excluded.

**Given/When/Then:**
- Given a request that set a requirement · When a bid shows · Then the cell is red on conflict, green on match. (AC-08)
- Given one of the 5 cost-responsibility items · Then it's green when bid responsibility matches the request assignment, red on conflict in either direction. (AC-11)
- Given a responsibility that lands on the renter · When they enter their own expected cost · Then it adjusts the comparable total, and no agent-estimated value is added for any responsibility they didn't provide. (AC-12)
- Given a request that set no requirements · Then no `fails requirement` red framing shows; bids present by pure ranking. (AC-34)
- Given a request requires a field a bid doesn't state · Then it shows `needs confirmation` and the bid is **not** auto-excluded. (AC-37)

## Web — rendering & interaction

### T5 — Three-block side-by-side layout + per-bid verdict + collapsible sections
**Scope:** web
**ACs:** AC-05, AC-06, AC-07
**Description:**
Render selected bids side by side, grouped into `Cost`, `Equipment`, `Trust & documents` (equipment & operator certs under Equipment; company certs/docs under Trust). Each bid header shows a verdict: `Meets every requirement` (0 conflicts) or `N things to check`. Each block is collapsible to a one-line summary.

**Given/When/Then:**
- Given an item with ≥1 bid · When viewed · Then bids show side by side in `Cost`/`Equipment`/`Trust & documents`, certs folded per the rule. (AC-05)
- Given a bid · Then its header shows `Meets every requirement` or `N things to check` naming the conflict count. (AC-06)
- Given the comparison · When a section is collapsed · Then it shows a one-line summary and re-expands. (AC-07)

### T6 — Supplier selector, excluded chip, and population states
**Scope:** web
**ACs:** AC-14, AC-15, AC-16, AC-31, AC-32, AC-33
**Description:**
Supplier selector of bid chips: tap to add/remove a bid from the table (AC-14). All removed → empty state, re-addable (AC-15). A bid failing **every** requirement → `excluded` chip with `Negotiate` (→ deal room) + `Bring back` (adds it, still flagged) (AC-16). States: 0 bids → `No bids yet` + re-broadcast prompt (AC-31); exactly 1 bid (incl. DIRECT) → shown alone, no ranking / no `+X% vs lowest` (AC-32); all bids fail → `no qualifying bids — relax a rule or re-broadcast`, nothing ranked (AC-33).

**Given/When/Then:**
- Given the comparison · When a supplier chip is tapped · Then that bid is added/removed accordingly. (AC-14)
- Given every bid removed · Then an empty state shows and any bid is re-addable. (AC-15)
- Given a bid failing every requirement · Then it's an `excluded` chip with `Negotiate` + `Bring back`; `Bring back` adds it still flagged. (AC-16)
- Given 0 bids · Then `No bids yet` + re-broadcast prompt, no table. (AC-31)
- Given exactly 1 bid · Then it's shown alone with no winner/ranking and no `+X% vs lowest`. (AC-32)
- Given all bids fail a requirement · Then `no qualifying bids — relax a rule or re-broadcast` and nothing ranked. (AC-33)

### T7 — Deterministic preset sort + deal-room hand-off + per-item award marking
**Scope:** web
**ACs:** AC-20 (web/deterministic side), AC-28, AC-29, AC-30 (web side)
**Description:**
Preset bar (`Best overall` / `Lowest cost` / `Newest machine` / `Most trusted`) re-sorts the columns **deterministically** (lowest = all-in asc; newest = year desc; most trusted = verified/rating display order; best overall = a deterministic composite) and highlights the best column. (The Mansour "pick" flag + free-text + reasons are deferred.) `Award` and `Negotiate` on any bid (or excluded chip) open that supplier's **deal room** (`startDealRoom` / route to `/deal-room/{id}`); the accept happens there. An awarded item is marked and its bids aren't re-offered; different items can go to different suppliers.

**Given/When/Then:**
- Given the comparison · When the renter taps a preset · Then columns re-sort and the best-matching column is highlighted. (AC-20, deterministic side)
- Given a bid · When the renter chooses `Award` · Then that supplier's deal room opens and the accept completes there. (AC-28)
- Given a bid or excluded chip · When the renter chooses `Negotiate` · Then that supplier's deal room opens for negotiation. (AC-29)
- Given a multi-item request · When the renter awards an item · Then other items stay independently awardable, the awarded item is marked, and its bids aren't re-offered. (AC-30, web side)

### T8 — Edge population + trust/finance display rules + type/size flag
**Scope:** web
**ACs:** AC-38, AC-39, AC-40, AC-41, AC-42, AC-36 (display side)
**Description:**
Show only a supplier's **latest** round, never twice, only live (pending) bids (expired/withdrawn excluded/greyed) (AC-38). A bid on an inactive/deleted listing → `no longer active` warning (AC-39). Trial requests not available in the tool (AC-40). A grouped (fanned-out) request → offer to regroup under one request with item tabs (AC-41). Display rules: supplier rating not used as knockout/weight, amounts pre-VAT unless VAT known, renter's currency (AC-42). Display a `type/size needs check` flag on subtype/size drift; exclude only on a confirmed mismatch — for now never auto-exclude on a raw id mismatch (the confirmed-mismatch judgement is deferred) (AC-36, display side).

**Given/When/Then:**
- Given a supplier with multiple rounds on an item · Then only the latest live round shows, never twice; expired/withdrawn excluded or greyed. (AC-38)
- Given a bid on a no-longer-active listing · Then a `no longer active` warning shows. (AC-39)
- Given a trial request · Then it is not available in the tool. (AC-40)
- Given a fanned-out grouped request · Then the renter is offered to regroup under one request with item tabs. (AC-41)
- Given trust/finance values · Then rating isn't a knockout/weight, amounts are pre-VAT unless VAT known, in the renter's currency. (AC-42)
- Given subtype/size drift · Then `type/size needs check` shows and the bid is not auto-excluded on a raw id mismatch. (AC-36, display side)

## Web — localization

### T9 — English + Arabic (RTL) for the workspace
**Scope:** web
**ACs:** AC-43
**Description:**
All new workspace strings in EN + AR (ar.ts typed from en.ts); Arabic lays out right-to-left. (Mansour chat reasoning localization is deferred with the chat.)

**Given/When/Then:**
- Given the renter in English or Arabic · When they open the workspace · Then every label renders in the active language, Arabic right-to-left. (AC-43)

## Backend — admin
_No tickets in this scope._

## Backend — mobile
_No tickets in this scope._

## API integration
_No new web→backend contract this round — the workspace reads existing endpoints (`fetchMyRequests`, `fetchBids`, `fetchRequestDetail`, `startDealRoom`). The Agent contract (scoring/recommendation, Ask-Mansour chat, supplier-quote parse) + the saved-preference & award-history backends are **deferred** (plan.md Out of scope) and land via `/epic-agent-fanout` before the Agent ACs can be built._
