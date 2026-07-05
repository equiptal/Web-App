# Implementation plan — Bid‑comparison consistency & polish

**Source:** free‑form (Yara, 2026‑07‑02 screenshot review of My Requests + Bid Comparison).
**Goal:** make the bid‑comparison and requests surfaces consistent with the rest of the web app and with each other — shared page margins, matching source labels, downloadable docs, correct conflict/cert rendering, and consistent bid‑count + term semantics across in‑app and shared‑link bids.

## Scope boundaries
- **In:** web UI/adapters only — layout margins, comparison tabs, doc‑viewer download, source‑label styling, cost‑term (maintenance) derivation for link bids, "Not met"/conflict cell colour, merging conflict‑detail notes, surfacing a shared‑link conflict term, and reconciling the "X bids" count. Plus written answers for the two "how is this derived" questions (cert logic, maintenance).
- **Out:** the real cross‑supplier coverage engine (off‑platform partials assembling into true fulfilment — separate, larger piece, per earlier scope decision); any backend change unless a ticket is explicitly flagged `⚠ Backend`.
- **Assumptions:** My Requests (`RequestsList` / `.rproto`) is the **reference** for spacing/margins. The bids‑card banners (orange "Off‑platform · via your request link" / blue "Via Moedatech app") are the **reference** for source labels.

## Requirements map (ask → deliverable)
| # | Ask (screenshot) | Deliverable |
|---|---|---|
| T1 | 222936 — more margin between cards and page edge/sidebar | Small consistent gutter on My Requests cards vs page edge + sidebar |
| T2 | 223059 — comparison group‑id tabs like the request screen; same margins everywhere | Comparison RFQ tabs match My Requests tab UI; shared page‑container margin across pages |
| T3 | 223236 — must be able to download any viewable file | Download icon/action in the comparison doc‑viewer modal |
| T4 | 223429 — in‑app / shared‑link labels match the card UI | Comparison column source labels reuse the card banner style/wording |
| T5 | 223620 — how is maintenance = supplier derived for app but not link? | Answer + derive maintenance for link bids from the request (not "—") |
| T6 | 223718 — "Not met" must be red even in a green column | Conflict/not‑met cell always renders red, overriding column tint |
| T7 | 223808 — where is the TÜV ✓/✗ for app bids read from? | Written explanation of the equipment‑cert logic (+ optional inline doc) |
| T8 | note merge — "Renter wants / Supplier's answer" into 1, multi‑unit aware | Single well‑worded conflict‑detail note; multi‑unit phrasing |
| T9 | shared‑link conflict term ("Accommodation & transport = No") not shown | Surface the fat_transport (and peer) conflict from link bids in the terms table |
| T10 | 222936 vs 223059 — fulfilment "2 bids" vs comparison "3 bids" | Define + reconcile the bid‑count semantics across both surfaces |

## Architecture & data
- **Layout (T1, T2):** `AppShell` `<main>` (`src/components/AppShell.tsx:246`) sets page gutter (`px-4 sm:px-7 … max-w-6xl` / `max-w-none`). My Requests renders inside `.rproto` (`requests-proto.css`, `max-width:1440px`). Compare uses `AppShell` default. Standardise a single container rule and apply the reference margins; add a small gutter to `.bids-snap`/cards.
- **Comparison tabs (T2):** `BidComparisonWorkspace.tsx:705‑722` already renders RFQ tabs with a `groupRef` chip; align markup/spacing to the My Requests tab pill (`RequestsList` "REQUESTS FOR QUOTE" strip) so the RFQ‑NNNNN code reads identically.
- **Doc viewer (T3):** the file‑preview modal opened from a column's document cell (VAT/CR/…); add a download control next to the existing `open_in_new`. Reuse the presigned URL already used for viewing.
- **Source labels (T4):** `BidComparisonWorkspace.tsx:950‑952` renders link/smartphone icon + muted text. Replace with the card's banner chip (orange link / blue app) + same wording ("Off‑platform · via your request link" / "Via Moedatech app").
- **Maintenance (T5):** cost‑terms row derives from `bid.costResponsibilities` (`requestSide`/`bidSide`). Link bids have no maintenance answer → "—". Derive the link bid's maintenance from the **request assignment** (`maintenanceResponsibility`) in `link-bids.ts` so it mirrors the app.
- **Conflict/cert cells (T6, T9):** `Td` `ok`/`fail` styling + the term derivation in `submissionToBidCard` (`link-bids.ts`) and the comparison's negotiable/required‑term filter. T6 = force red on `fail` regardless of column tone; T9 = ensure link `fat_transport`/`fat_food` conflict rows reach the terms table.
- **Notes (T8):** `termRow` `detail` ("Renter: X · Supplier: Y") in `link-bids.ts` + the terms modal rendering; merge into one sentence, multi‑unit aware.
- **Count (T10):** `RequestsList` fulfilment header = `group.totalBids + link.submittedCount` (distinct submissions); per‑item + comparison tab count submission‑items (a 2‑item link submission counts on both items). Decide one definition ("distinct bids" vs "bid lines") and apply everywhere.
- **Backend dependency:** none expected for T1–T8, T10. **T9** may be backend if `submitBidForm` doesn't persist the `fat_transport` confirmation — flagged in the ticket; verify via `/web:link-agents` before assuming web‑only.

## Phases
1. **Layout consistency** — T1, T2 (margins + tabs). Low risk, visual.
2. **Comparison correctness** — T5, T6, T9 (maintenance, red conflict, missing conflict term). Adapter + cell logic.
3. **Polish + affordances** — T3, T4, T8 (download, labels, note wording).
4. **Semantics + docs** — T10 (count) + T7 answer (cert logic).

## Risks & dependencies
- **T10** is a product decision (what "X bids" means) — must be settled before coding, else the two surfaces stay inconsistent.
- **T9** may cross into the agents backend (`submitBidForm` confirmations) — could be a `⚠ Backend` handoff.
- Margin changes touch shared `AppShell`/`.rproto` — regression‑check every page (create, deal room, inbox, profile, compare) for width.

---

## Batch 2 — source & colour model + price sync (T11–T16)

A follow‑up spec that unifies **how the comparison colours cells** and **which source each row reads from**, plus a real price‑sync bug. Full tickets in `tickets.md` (Batch 2).

**3‑colour rule (every cert/term/cost cell):** 🟢 green = matches what the request required (incl. a term on **you** when it matches) · 🔵 blue = shown but **not required** (an extra) · 🔴 red = required but not met · grey/`—` = n/a.

**3 source layers (each row reads its own source):**
- **Company** — CR / VAT / National address (top) ← company‑verification docs.
- **Equipment** — safety cert · proof of ownership ← the equipment's `documentKeys` (what it physically carries).
- **Terms** — operator cert · equipment cert (required) · cost terms ← negotiable deal‑room terms, **live/real‑time**.

**Deliverables:** T11 (green=match incl. "you"), T12 (held‑not‑required safety cert → blue, required‑unmet → red), T13 (proof of ownership = any equipment doc, blue, never red), T14 (per‑row source correctness + inline docs), T15 (operator/equipment‑cert term rows update live from the deal room), T16 (**bug** — comparison + bid card price must reflect the agreed‑by‑both deal‑room rate), T17 (**decided state**, THREE cases: A accepted in deal room · B awarded in UI only · C awarded via survey — mark the winner + closed banner, losers unchanged; precedence A>C>B).

**Batch‑2 risks / decisions:**
- **T16 price** — product decision: show the **latest proposed** rate (pending counter → full app parity) or **only agreed/locked**. Backend already projects `dealRoom.lastProposedRate` in `findByRequest`, so it's expected **web‑fixable** in `bids.ts` — but verify the per‑request bid‑list actually returns `currentPrice` (only `received-bids` is confirmed to map it); if not → `⚠ Backend` handoff.
- **T11** changes `responsibilityTone` — regression‑check the cost‑terms colours across in‑app + link bids.
- **Equipment cert appears in two layers** (a held **doc** vs a negotiable **term**) — T12/T14 must keep them distinct (doc row = equipment source; required‑cert term row = terms source).
