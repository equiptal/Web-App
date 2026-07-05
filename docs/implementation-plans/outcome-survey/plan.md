# Outcome Survey — Web implementation plan

**Source:** free-form (product doc `survey.html`/§2,§8 + `/web:link-backend` dry-run).
**Goal:** Add a renter-facing Outcome Survey to the web — a modal (auto-opened once per session, plus a discoverable sidebar item + topbar icon) that shows the next pending survey ("Who did you rent from?" with bidder options, or "Still need this?" when no bids) and submits the renter's answer, consuming the existing app-backend `/api/surveys` endpoints. **No backend changes.**

## Decisions (locked)
- **Reuse app-backend**, wrapped in the web's own BFF routes + client + contract (the decoupling seam). No web-specific backend endpoint, no duplication in the agent.
- **Renter flows only:** `RENTEE_OUTCOME` (Q1) + `RENTEE_NO_BIDS` (Q2). `SUPPLIER_CONFIRM` (Q3) and c-hub admin are out — if `pending` ever returns a `SUPPLIER_CONFIRM` unit, the web ignores it (mobile owns it).
- **Parity with the mobile app** (`apps/mobile/.../survey/`): bidder rows are **text-only** (name + `price · equipment`), price field is **empty/typed (not prefilled)**, **no "Thank you" screen** (silent drain), Flow-B `edit` → post `action:'edit'` then navigate to `/requests/{requestId}`, `close` → `action:'close'`, `skip` → `action:'skip'`.
- **Entry points (web-only, mobile has none):** auto-open once per browser session on load; a sidebar nav item; a topbar icon with a **presence dot** (no count endpoint exists for renters); a thin `/surveys` page that opens the same modal / shows an empty state.
- **AR:** all chrome/§8 copy bilingual via i18n; the backend `equipmentSummary` renders as-is (English — same as the app).

## Architecture
- **Contract** `src/lib/contract/survey.ts` — `PendingUnit`/`PendingItem`/`Bidder`/`SurveyAction`/`RespondBody`/`RespondResult` + `unitLabel()` helper (§8 unit table).
- **Client** `src/lib/api/client.ts` — `fetchPendingSurvey()`, `respondSurvey(id, body)`.
- **BFF** `src/app/api/me/surveys/pending/route.ts` (GET → `/api/surveys/pending`), `src/app/api/me/surveys/[id]/respond/route.ts` (POST → `/api/surveys/{id}/respond`). Both via `withAuthedBackend` + `appAuthErrorResponse`.
- **UI** `src/components/surveys/SurveyModal.tsx` (Tailwind, design tokens, RTL via `dir`; Q1 + Q2 bodies; multi-item loop), `src/components/surveys/SurveyProvider.tsx` (context: poll on authed mount, once-per-session auto-open via `sessionStorage`, drain after each submit, expose `pending`/`openSurvey`). Mounted in `layout.tsx` inside `SessionProvider`.
- **Chrome** `AppShell.tsx` — sidebar nav item + topbar icon (presence dot) → `useSurvey().openSurvey()`. `src/app/surveys/page.tsx` thin page.
- **i18n** `en.ts`/`ar.ts` — new `survey` block + `shell.surveys`.

## Backend dependency
None. (Optional v2 via `/web:link-backend`: add `subtypeNameAr`/`subtypeImageUrl` + `supplierStatus`/`imageKey` to the survey projections for richer rows + a renter unread-count endpoint for a numeric badge.)

## Risks
- `pending` can be a multi-item fan-out unit → loop items; submit each; Confirm gated until all answered.
- Idempotency: treat `{alreadyResolved:true}` as success (poll/submit race).
- Skip must not loop: `skip` closes the modal; server reprompts next session.
- No role flip needed (survey endpoints are userId-scoped, no role guard) — but auth token forwarding is the same as other authed routes.
