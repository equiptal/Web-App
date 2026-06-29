# QA / Test ticket — Outcome Survey (renter web)

Feature: the renter Outcome Survey — an on-load modal (+ sidebar item + topbar icon) that asks
"Who did you rent from?" (Q1) or "Still need this?" (Q2) and submits the answer to the app-backend.
Web is renter-only; supplier flow + admin are out of scope.

## Environment & preconditions
- **Staging** web (Amplify), signed in as a **renter** (the survey API is behind the mobile Cognito
  pool the web already forwards). OTP bypass on staging: `1234`.
- **Getting a survey to appear is the hard part** — surveys are created by a backend cron, not on
  demand:
  - **Flow A (Q1 "Who did you rent from?")** = a request with ≥1 bid, **48h** after the first bid.
  - **Flow B (Q2 "Still need this?")** = a BROADCAST request with **0 bids, 72h** after posting.
  - So either (a) use a renter account that already has a due survey on staging, (b) ask backend to
    seed/trigger one (run the `surveyDetect` job or insert an `ACTIVE` `outcome_surveys` row for the
    test user), or (c) backfill timestamps so the 48h/72h window has elapsed.
- Confirm there's a pending survey first: `GET /api/me/surveys/pending` (via the app, while signed in)
  should return a non-null `pending` of type `RENTEE_OUTCOME` or `RENTEE_NO_BIDS`.

## Entry points
- [ ] **Sidebar** shows a **"Surveys"** item (assignment icon); navigates to `/surveys`.
- [ ] **Topbar icon** (assignment) is present when signed in; shows a **presence dot** when a survey
  is pending, no dot when none.
- [ ] Tapping the topbar icon **with** a pending survey opens the modal; **without** one navigates to
  `/surveys`.
- [ ] `/surveys` page: opens the modal when a survey is pending; shows the **empty state**
  ("No surveys right now") when none.
- [ ] **Auto-open:** on first app load of the session with a pending survey, the modal opens by
  itself **once**; navigating between pages does **not** re-pop it (once-per-session).

## Q1 — "Who did you rent from?" (RENTEE_OUTCOME)
- [ ] Title "How did your request go?"; question names the equipment (`equipmentSummary`).
- [ ] Each **bidder row** shows supplier name + `price SAR · equipment` (text-only — no thumbnail /
  verified badge / rating, matching the app).
- [ ] Below the bidders: **"Someone else (not listed)"** and **"No one — I didn't rent"**.
- [ ] **Confirm is disabled** until a choice is selected (every item in a multi-item unit answered).
- [ ] Select a **listed bidder** → a **price field** appears (empty, *not* prefilled); typing is
  optional. Confirm → modal resolves (drains to next or closes). Re-open app → that survey is **gone**.
- [ ] Select **"Someone else"** → price field + an optional "Tell us more" reason; Confirm submits
  `won_elsewhere`.
- [ ] Select **"No one"** → **no price field**; an optional "what happened?" reason; Confirm submits
  `no_winner`.
- [ ] **Multi-item (fan-out) unit:** if the unit has several items, each needs its own choice before
  Confirm enables; all are submitted.
- [ ] **Skip for now** closes the modal without resolving.

## Q2 — "Still need this?" (RENTEE_NO_BIDS)
- [ ] Title + body match the copy ("hasn't received any bids… loosen requirements… otherwise we'll
  close it").
- [ ] **Edit my requirements** → navigates to the request detail (`/requests/{id}`); the survey is
  **not** closed (it re-arms server-side on an actual edit).
- [ ] **Close the request** → submits `close`; modal drains/closes.
- [ ] **Skip for now** → closes the modal.

## Drain / lifecycle
- [ ] With **two** pending surveys: answering the first **auto-opens the next**; modal closes only
  when none remain.
- [ ] **Skip** does not resolve: the survey reappears in a later session (server re-prompts ~24h —
  may need a wait/backfill to observe; functionally, skip must not loop within the same session).
- [ ] **Idempotency:** if a survey was already answered elsewhere, submitting again returns success
  (no error toast); next poll shows it gone.

## Cross-platform (shared backend)
- [ ] Answer a survey **on web** → open the **mobile app** → it is **not** shown again.
- [ ] Answer a survey **on mobile** → open **web** → it is **not** shown again.
- [ ] **Skip on web** → it **can still appear on mobile** (skip is a defer, not an answer).

## Localization / RTL
- [ ] Switch to **Arabic**: all modal chrome (title, question, options, buttons, empty state, sidebar
  label, icon tooltip) is Arabic.
- [ ] Layout mirrors correctly in RTL (radio/icon alignment, footer buttons).
- [ ] Note: the **equipment name** in the question is backend-supplied and currently **English** even
  in AR (parity with the app — known, accepted for v1).

## Edge / resilience
- [ ] **SUPPLIER_CONFIRM ignored:** if the signed-in account also has a supplier price-confirm survey
  due, the **web does not show it** (mobile owns it).
- [ ] **Submit failure** (kill network, then Confirm): the modal **stays open** so the renter can
  retry; no crash, app remains usable.
- [ ] No survey pending → no auto-open, no dot, `/surveys` shows the empty state.

## Out of scope (do not test here)
- Supplier "Is this price right?" flow (mobile). c-hub admin controls (`/outcomes`). Push
  notifications (web shows the in-app pop-up only). Numeric badge count (web uses a presence dot —
  there's no renter pending-count endpoint).

---
**Publishing (optional):** to put this on the QA board, open a GitHub issue in `equiptal/moedatech-specs`
titled `uat-report: outcome-survey (web)` with this checklist, then set Card type "UAT report" /
Status "UAT needed" on project 3 (see the `uat-report-convention`). Say the word and I'll do it.
