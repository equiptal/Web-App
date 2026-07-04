# Tickets — deal-room-negotiation-parity

App-parity rework: web deal-room negotiation moves from per-term immediate PATCH to the app's
**collect-locally → submit-once (batched)** model. All implemented (uncommitted) except T6 (testing).

## T1 — `terms/batch` BFF proxy  [DONE]
**Scope:** BFF. New `src/app/api/me/deal-rooms/[id]/terms/batch/route.ts` — POST → backend
`POST /api/deal-rooms/{id}/terms/batch`, forwards `{ updates:[{termKey,action,value}], note? }`.
- **G/W/T:** Given staged term resolutions, When Counter is sent, Then one POST carries all term updates.

## T2 — Client: batchUpdateTerms + acceptDeal payload  [DONE]
**Scope:** `src/lib/api/client.ts`. Add `batchUpdateTerms(id, updates, note?)` + `TermUpdate`; rework
`acceptDeal(id, contractType="formal", { termResolutions?, agreedUnits? })` (default `formal`;
`agreedUnits` omitted for the web).
- **G/W/T:** Given accept, When submitted, Then body = `{contractType:"formal", termResolutions}` (no agreedUnits).

## T3 — Accept route forwards termResolutions  [DONE]
**Scope:** BFF. `src/app/api/me/deal-rooms/[id]/accept/route.ts` — default `contractType` `"formal"`;
forward optional `termResolutions` to backend `accept-all-terms`.

## T4 — DealRoomTerms: local resolutions (no per-term PATCH)  [DONE]
**Scope:** Web UI. Accept / Keep-mine / Counter write to a local resolutions map via
`resolutions`/`onResolveLocal`/`onReopenLocal` props; a "You'll send" group with **Undo**; server
`reopen` removed; server-agreed terms read-only.
- **G/W/T:** Given a disputed term, When I accept/counter it, Then it stages locally (no network call) and can be undone.

## T5 — DealRoom: batched Counter + Accept  [DONE]
**Scope:** Web UI. Holds `resolutions` state; **Counter** = `batchUpdateTerms` then `proposeRate`;
**Accept** = `acceptDeal(id,"formal",{termResolutions})`; both clear local state + reload; Accept gated
on unresolved disputed terms.

## T6 — Testing / UAT on staging  [TODO]
**Scope:** QA. Verify the batched flow end-to-end on `https://webstaging.moedatech.net`.
**Preconditions:** renter account (OTP bypass `1234`) with an **open deal room on your turn** that has
≥1 **disputed** term.

Checklist:
- **Local staging:** tap Accept / Keep-mine / Counter on a disputed term → it moves to **"You'll send"** with **Undo**; **no network call fires** (check the Network tab — nothing until you submit).
- **Undo / reopen:** Undo removes the staged choice; a term already **agreed on the server** shows read-only (no reopen-to-server).
- **Counter submit:** open Counter (price modal) → send → **one** `terms/batch` call carries all staged term choices **+** a `rate-proposal` call for rate/mob/demob. Room reloads; local staging clears.
- **Accept submit:** resolve all disputed terms → Accept → **one** `accept-all-terms` call with
  `contractType:"formal"` + `termResolutions`, **no `agreedUnits`**. Deal moves to
  awaiting-supplier-confirmation.
- **Gating:** Accept stays disabled while any term is still disputed/unresolved.
- **No regressions:** chat, documents sheet, quotation download, price breakdown all still work.
- **Backend accepts the payloads** (the real check — see `/web:link-backend`): `terms/batch` and
  `accept-all-terms` with `termResolutions` return 200, not 4xx.
- **⚠ Known deviations to confirm are acceptable:** (a) Counter re-sends the rate even if unchanged;
  (b) Accept blocks only on *disputed* (locally-resolved *pending* terms are sent but don't block).

## ⚠ Backend (Moedatech-App) — verify contract, carried by `/web:link-backend`
Confirm `POST /api/deal-rooms/{id}/terms/batch` accepts `{updates:[{termKey,action,value}], note?}` and
`POST /api/deal-rooms/{id}/accept-all-terms` accepts `{contractType, termResolutions:[{termKey,action,value}]}`
with rentee action strings `accept`/`counter` — matching the mobile repo calls. No backend change
expected (endpoints exist); this is a contract-alignment check.
