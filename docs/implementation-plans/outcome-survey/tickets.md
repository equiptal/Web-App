# Outcome Survey — tickets

Backend-dependency tickets: **none** (consume-only on staging).

## T1 — Contract + client  · scope: Contract
`src/lib/contract/survey.ts`: types `OutcomeSurveyType`, `SurveyAction`, `Bidder`, `PendingItem`, `PendingUnit`, `RespondBody`, `RespondResult`, `PendingResponse` + `unitLabel(raw, ar)` (§8 unit table). `client.ts`: `fetchPendingSurvey()`, `respondSurvey(id, body)`.
- **Given** a renter, **when** the client calls pending, **then** it returns `{ pending: PendingUnit | null }` typed.
- **Given** an answer, **when** `respondSurvey` posts, **then** it returns `RespondResult`.

## T2 — BFF routes  · scope: BFF
`src/app/api/me/surveys/pending/route.ts` (GET → `/api/surveys/pending`); `src/app/api/me/surveys/[id]/respond/route.ts` (POST → `/api/surveys/{id}/respond`). `withAuthedBackend` + `appAuthErrorResponse`.
- **Given** the signed-in renter, **when** GET pending, **then** the backend `data` (`{ pending }`) is forwarded.
- **Given** a respond body, **when** POST, **then** it's forwarded to `{id}/respond` and the result returned; errors map via the bilingual envelope.

## T3 — i18n  · scope: Web UI
`survey` block in `en.ts` + `ar.ts` (verbatim §8 copy) + `shell.surveys`.
- **Given** AR locale, **when** the modal renders, **then** all chrome strings are Arabic.

## T4 — SurveyModal  · scope: Web UI
`src/components/surveys/SurveyModal.tsx`. Q1 (`RENTEE_OUTCOME`): per-item bidder radios + Someone-else/No-one, conditional empty price field + reason; submit maps confirm/won_elsewhere/no_winner. Q2 (`RENTEE_NO_BIDS`): edit/close/skip. RTL, silent drain, multi-item loop, Confirm gated until all answered.
- **Given** Q1 with bidders, **when** a bidder + price chosen and confirmed, **then** `confirm` with `winners:[{winnerSupplierId, price}]` is submitted.
- **Given** Q2, **when** edit/close/skip tapped, **then** the matching action is submitted.

## T5 — Entry + poll  · scope: Web UI
`src/components/surveys/SurveyProvider.tsx` (poll on authed mount, once-per-session auto-open via `sessionStorage`, drain, context `pending`/`openSurvey`/`refresh`); mount in `layout.tsx`. `AppShell` sidebar item + topbar icon (presence dot). `src/app/surveys/page.tsx`.
- **Given** a pending renter survey on load, **when** authed, **then** the modal auto-opens once; the topbar dot shows while pending; the sidebar item / `/surveys` open the same modal.
- **Given** a `SUPPLIER_CONFIRM` unit, **when** received, **then** the web ignores it (no modal).

## T6 — Flow-B wiring  · scope: Web UI
In the modal/provider: `edit` → `respondSurvey(id,{action:'edit'})` then `router.push('/requests/{requestId}')`; `close` → `respondSurvey(id,{action:'close'})` then drain.

## T7 — Tests  · scope: Contract
`tests/unit/survey.test.ts`: `unitLabel` mapping (EN/AR), submit-body mapping per choice (bidder/someone-else/no-one), action gating per type, drain (next pending after resolve, close on null).
