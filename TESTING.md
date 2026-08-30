# TESTING.md — Moedatech renter web runbook

The single source of test cases for this app. Run it with `/web:test`.

## How to read a case

| Column | Meaning |
|---|---|
| **ID** | Stable. Never renumber. A retired case is struck through, not deleted. |
| **Case** | The behaviour under test, from the renter's point of view. |
| **Expected** | What makes it a pass. Never "works" — a value, a state, a code. |
| **L** | Layer: `U` unit · `A` api · `B` browser · `M` manual only. |
| **Mut** | `yes` = writes data. Skipped on prod. |
| **Coverage** | The spec that proves it, or `manual`, or `—` for no coverage at all. |

`—` in Coverage is a real gap, not a formatting placeholder. The coverage line at the end of each run counts them.

## Environments

| Environment | Base URL | Mutations |
|---|---|---|
| prod | `https://g0a44yhbki.execute-api.eu-central-1.amazonaws.com` | **forbidden** |
| staging | `https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com` | allowed |
| local | `http://localhost:3000` | allowed |

The table above is the **app backend** — where `/auth/*` lives. The API layer of a run does not call
it directly: it calls the **web app's own routes**, which relay onward, because that is the path a
renter's browser takes and the only one that exercises the BFF.

| | URL | Session |
|---|---|---|
| web · staging | `https://webstaging.moedatech.net` | `mt_id` + `mt_refresh` cookies, from `POST /api/auth/request-code` then `POST /api/auth/verify` |

Log in to the **web app**, not the app backend, and keep the cookie jar — the project routes read a
session cookie, not a bearer token. The dashboard is served at `/`; `/dashboard` redirects to it.

## Modules

| # | Module | Prefix |
|---|---|---|
| 1 | Guest browsing & parse quota | `GUEST` |
| 2 | Auth — phone or email | `AUTH` |
| 3 | Create request & agent processing | `CREATE` |
| 4 | Bids in — shareable link & app | `BIDIN` |
| 5 | Bid viewing — terms, price, equipment, map | `BIDVIEW` |
| 6 | Company verification & documents | `COMPANY` |
| 7 | Request details — view, edit, cancel | `REQ` |
| 8 | Deal room — chat & negotiation | `DEAL` |
| 9 | Accept deal & quotation | `ACCEPT` |
| 10 | Bid comparison | `COMPARE` |
| 11 | Features that must stay off | `OFF` |

---

## 1 · GUEST — guest browsing & parse quota

_Last run: never._

A signed-out visitor may use Mansour a few times, then must sign in. The cap lives in a signed HttpOnly cookie (`mt_gq`) because localStorage can be cleared. `GUEST_PARSE_LIMIT = 3`.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| GUEST-01 | Guest opens the home route | Page paints real content, no redirect to `/login` | B | no | — |
| GUEST-02 | Guest parses once | Parse returns a result; `mt_gq` cookie set to 1 | A | no | — |
| GUEST-03 | Guest parses up to the limit | Parses 1–3 all succeed | A | no | — |
| GUEST-04 | Guest parses past the limit | 4th parse refused, sign-in required | A | no | — |
| GUEST-05 | Guest clears localStorage and retries | Still refused — the cookie, not localStorage, decides | A | no | — |
| GUEST-06 | Guest forges the `mt_gq` cookie value | Bad HMAC rejected, not treated as a fresh allowance | A | no | — |
| GUEST-07 | Signed-in user is never counted | Any auth cookie present ⇒ quota never applies | A | no | — |
| GUEST-08 | Guest hits an authed route | Redirect to login, no data rendered | B | no | `middleware.test.ts` |
| GUEST-09 | Guest reaches the account gate inside the create flow | Sign-in prompt appears in-flow, draft is not lost | B | no | — |
| GUEST-10 | Guest quota in Arabic | Refusal copy is Arabic, layout RTL | B | no | — |

> **Known gap:** `src/lib/access/guest-quota-server.ts` has no unit spec and is not imported by any test. Every case here is uncovered. Highest-value place to add unit tests first.

---

## 2 · AUTH — phone or email

_Last run: never._

`POST /auth/login` on the backend is unified: an unknown number auto-registers as a `rentee` and the code is sent in one call. Three entry shapes: `{ phone }`, `{ otpEmail }`, `{ onboardingToken }` (email-first phone-add, no account created yet).

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| AUTH-01 | Request a code by phone | `200 {success:true}`, `isNewUser` present, `expiresAt` present | A | yes | `auth-routes.test.ts` |
| AUTH-02 | Country code defaults | No `countryCode` sent ⇒ backend receives `+966` | U | no | `auth-routes.test.ts` |
| AUTH-03 | Request a code by email | `{ otpEmail }` ⇒ `otpMethod` defaults to `EMAIL` | A | yes | `auth-routes.test.ts` |
| AUTH-04 | Request with neither phone nor email | `400 {code:"invalid_phone"}` | A | no | `auth-routes.test.ts` |
| AUTH-05 | Phone-add via onboarding token | Phone OTP sent, **no account created** | A | yes | — |
| AUTH-06 | New number self-registers | First-time number gets a code, `isNewUser:true` | A | yes | — |
| AUTH-07 | Verify with the right code | Session cookies set, `/api/auth/session` reports authed | A | yes | `auth-session.test.ts` |
| AUTH-08 | Verify with a wrong code | Refused; no session cookie set | A | no | `auth-routes.test.ts` |
| AUTH-09 | Verify with an expired code | Refused with the expiry reason, not a generic error | A | no | — |
| AUTH-10 | Resend | New code issued; the old one no longer verifies | A | yes | `auth-routes.test.ts` |
| AUTH-11 | Complete signup | Profile completes; renter lands on the home hub, not back at login | A | yes | `onboarding.test.ts` |
| AUTH-12 | Sign out | Every session cookie cleared; authed route now redirects | A | yes | `auth-session.test.ts` |
| AUTH-13 | Handoff from the app | A handoff link lands signed in, same identity | A | yes | — |
| AUTH-14 | Error copy in Arabic | Backend error surfaces Arabic per `localeFromRequest` | U | no | `auth-i18n.test.ts` |
| AUTH-15 | Real OTP arrives | SMS/email actually delivered, code works | M | yes | manual |
| AUTH-16 | Session survives reload | Refresh keeps the renter signed in | B | no | `session-user.test.ts` |

---

## 3 · CREATE — create request & agent processing

_Last run: never._

The canvas builds the request; Mansour parses free text into it. Two hard axes: **multi-unit** (N of the same machine) and **multi-item** (several different machines in one request).

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| CREATE-01 | Canvas renders empty | All panels present, no error boundary | B | no | `canvas-render.test.tsx` |
| CREATE-02 | Parse one machine from free text | Machine, dates and location land in the right panels | A | no | `agent-adapters.test.ts` |
| CREATE-03 | Parse sets provenance | Every agent-filled field is marked agent-sourced, not user-typed | U | no | `canvas-provenance.test.tsx`, `provenance.test.ts` |
| CREATE-04 | User overrides an agent value | Provenance flips to user; a re-parse does not clobber it | U | no | `canvas-provenance.test.tsx` |
| CREATE-05 | **Multi-item** — several machines in one prompt | One item per machine, each independently editable | U | no | `canvas-multi-item.test.tsx` |
| CREATE-06 | **Multi-item** — add an item by hand | New item appended, existing items untouched | B | yes | `canvas-multi-item.test.tsx` |
| CREATE-07 | **Multi-item** — remove one item | Only that item goes; totals recompute | U | no | `canvas-multi-item.test.tsx` |
| CREATE-08 | **Multi-unit** — ask for N of one machine | Unit count on the item = N, not N items | U | no | — |
| CREATE-09 | **Multi-unit** — unit count drives the price | Totals scale with units, not with items | U | no | `cycle-totals.test.ts` |
| CREATE-10 | **Multi-unit + multi-item** together | 2 excavators + 1 loader ⇒ 2 items, units 2 and 1, totals correct | U | no | — |
| CREATE-11 | When panel — dates | Start before end enforced; charged days match the rule | U | no | `when-panel.test.tsx`, `charged-days.test.ts` |
| CREATE-12 | Where panel — location | Map pin and typed address agree; a pasted map URL parses | U | no | `where-panel.test.tsx` |
| CREATE-13 | Machine panel — taxonomy | Category/type/size come from the live taxonomy, not hardcoded | A | no | `machine-panel.test.ts` |
| CREATE-14 | Readiness gating | Submit stays disabled until every required field is filled | U | no | `canvas-gating.test.tsx`, `ready-to-send.test.tsx` |
| CREATE-15 | Submit payload shape | Payload matches the backend contract field for field | U | no | `submit-payload.test.ts` |
| CREATE-16 | Submit creates the request | `201`, request appears in the renter's list | A | yes | `create-canvas-wiring.test.ts` |
| CREATE-17 | Undo / history | Undo restores the previous canvas state exactly | U | no | `canvas-history.test.tsx` |
| CREATE-18 | Agent quota for a signed-in renter | Per-account cap, not the guest cookie cap | U | no | `agent-quota.test.ts` |
| CREATE-19 | Agent fails or times out | Canvas stays usable, error shown, draft not lost | B | no | — |
| CREATE-20 | Parse an Arabic prompt | Arabic free text fills the same fields correctly | A | no | — |
| CREATE-21 | Start-request gate | Trial-vs-real choice offered only when nothing is live | U | no | — |
| CREATE-22 | Operator / attachments options | Operator rail and attachment choices ride into the payload | U | no | `operator-rail.test.tsx`, `submit-payload.test.ts` |

---

## 4 · BIDIN — bids arriving, by link and from the app

_Last run: never._

Two doors: the tokenized public form a supplier opens with no account, and bids submitted from the supplier app. Both must land as the same shape.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| BIDIN-01 | Open a valid bid token | Form paints with the real request — machine, dates, location | B | no | `bid-form.test.ts` |
| BIDIN-02 | Open an invalid token | Clean refusal, no request data leaked | A | no | `bid-form-routes.test.ts` |
| BIDIN-03 | Open an expired token | Expiry stated; no submit control | A | no | — |
| BIDIN-04 | Token needs no session | The form works fully signed out | A | no | `bid-form-routes.test.ts` |
| BIDIN-05 | Submit a bid through the link | `201`; the bid appears on the renter's side | A | yes | `bid-form-routes.test.ts` |
| BIDIN-06 | Submit with a missing required field | Refused with the field named, nothing partially saved | A | no | `bid-form.test.ts` |
| BIDIN-07 | Preview before submit | Preview totals equal the submitted totals exactly | U | no | `bid-preview.test.ts` |
| BIDIN-08 | Multi-unit bid through the link | Units offered and units priced both recorded | U | no | — |
| BIDIN-09 | Multi-item bid | One line per requested item, each priced | U | no | — |
| BIDIN-10 | Partial bid | Supplier prices fewer units than requested — accepted and flagged as partial | U | no | — |
| BIDIN-11 | Bid from the app lands identically | App-submitted and link-submitted bids render the same card | A | yes | `link-bids.test.ts` |
| BIDIN-12 | Duplicate submit | Second submit does not create a second bid | A | yes | — |
| BIDIN-13 | Link OG image | `/bid/[token]/og` returns an image with the right request in it | A | no | `bid-card-html.test.ts` |
| BIDIN-14 | Bid form in Arabic | Whole form Arabic and RTL, numbers still Latin digits where the app uses them | B | no | — |

---

## 5 · BIDVIEW — terms, price, equipment, map verification

_Last run: never._

A bid card owes the reader the truth about three different counts — machines named, units offered, units priced. Only the last one prices anything.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| BIDVIEW-01 | Bid list renders | Every received bid shown, none dropped | A | no | `bids.test.ts` |
| BIDVIEW-02 | Card height fits its content | No clipped content, no dead space | B | no | `bid-card-rules.test.ts` |
| BIDVIEW-03 | Price footer totals | Footer total equals the line items plus fees | U | no | `price-footer.test.ts`, `cycle-totals.test.ts` |
| BIDVIEW-04 | VAT | VAT-inclusive and VAT-exclusive prices never mixed in one total | U | no | `vat-inclusive.test.ts` |
| BIDVIEW-05 | Charged days | Billed days match the rule for the requested window | U | no | `charged-days.test.ts` |
| BIDVIEW-06 | Rental pricing per unit | Rate × units × days, using **priced** units | U | no | `rental-pricing.test.ts` |
| BIDVIEW-07 | Counts agree | All three counts equal ⇒ no note shown | U | no | `bid-card-rules.test.ts` |
| BIDVIEW-08 | Priced below offered | Partial-acceptance sentence owed, with both numbers | U | no | `bid-card-rules.test.ts` |
| BIDVIEW-09 | Priced above offered | Legal — a counter may step up to the **requested** count | U | no | `bid-card-rules.test.ts` |
| BIDVIEW-10 | Terms shown | Mob/demob, inclusions and exclusions render, exclusions not silently dropped | U | no | `bid-card-details.test.ts` |
| BIDVIEW-11 | Equipment list | Each named machine listed with its real identity | U | no | `equipment-list.test.ts`, `equipment-card.test.ts` |
| BIDVIEW-12 | Equipment verification badge | Verified machines badged; unverified ones are **not** | U | no | `bid-map.test.ts`, `equipment-card.test.ts` |
| BIDVIEW-13 | Certificate rule | Certificate state drives the badge, not the supplier's claim | U | no | `cert-rule.test.ts` |
| BIDVIEW-14 | Map shows equipment | Pins land at the equipment's real coordinates | B | no | `bid-map.test.ts`, `rentee-map-surface.test.ts` |
| BIDVIEW-15 | No quality score on the map | Quality score is never surfaced on the map | U | no | `map-no-quality-score.test.ts` |
| BIDVIEW-16 | Availability chip | Availability reflects the bid's real window | U | no | `availability-chip.test.ts` |
| BIDVIEW-17 | Fleet view | Fleet grouping matches the machines actually offered | U | no | `fleet.test.ts` |
| BIDVIEW-18 | Equipment access control | A renter cannot read equipment on a bid that is not theirs | A | no | `bid-equipment-access.test.ts` |
| BIDVIEW-19 | Bid detail page loads live | `/bids/[bidId]` paints real data, console clean | B | no | — |
| BIDVIEW-20 | Bid view in Arabic | Terms, units and totals all Arabic; no English fallback | B | no | — |

---

## 6 · COMPANY — verification & documents

_Last run: never._

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| COMPANY-01 | Company panel renders | Real company data, sourced from the backend not a stub | U | no | `company-panel-source.test.ts` |
| COMPANY-02 | Submit verification | `POST /api/verification/submit` accepted, state moves to pending | A | yes | — |
| COMPANY-03 | Upload a document | Signed upload URL issued and the file attaches to the right company | A | yes | `company-documents.test.ts` |
| COMPANY-04 | Wrong file type or oversized file | Refused before upload, reason named | A | no | — |
| COMPANY-05 | Document list shows **this** company's docs | No document from another company ever appears | A | no | `company-documents.test.ts` |
| COMPANY-06 | Document opens | The link opens the real file, not a 403 or an expired URL | B | no | — |
| COMPANY-07 | Missing required document | Submission blocked, the missing document named | U | no | — |
| COMPANY-08 | Resubmit after rejection | `POST /api/verification/resubmit` reopens the case, prior docs kept | A | yes | — |
| COMPANY-09 | Verification pile | `/api/verification/pile` returns this company's pile only | A | no | `company-pile.test.ts` |
| COMPANY-10 | Verified state gates features | An unverified company sees the gate; a verified one does not | U | no | `gates.test.ts` |
| COMPANY-11 | Document eyeball check | Uploaded file is the right document, right way up, readable | M | yes | manual |
| COMPANY-12 | Verification copy in Arabic | Status and rejection reasons Arabic, RTL | B | no | — |

---

## 7 · REQ — request details, edit, cancel

_Last run: never._

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| REQ-01 | Request list | Every open request listed with its live bid count | A | no | `requests.test.ts` |
| REQ-02 | Request detail | Machines, window, location and bids all render | U | no | `request-card.test.ts` |
| REQ-03 | Multi-item request detail | Every item shown separately with its own units | U | no | — |
| REQ-04 | Edit a field | Change persists and the request card reflects it | A | yes | — |
| REQ-05 | Edit is blocked once bidding is live | Locked fields refuse the edit and say why | U | no | — |
| REQ-06 | Cancel a request | State moves to cancelled; no new bids accepted | A | yes | `deal-room-cancel.test.ts` |
| REQ-07 | Cancel notifies the other side | Cancellation event reaches the supplier | U | no | `deal-system-event.test.ts` |
| REQ-08 | Cancelled request stays readable | History still viewable, not a 404 | B | no | — |
| REQ-09 | Hidden requests | A hidden request stays out of the list | U | no | — |
| REQ-10 | Access control | A renter cannot open another renter's request | A | no | `dashboard-access.test.ts` |
| REQ-11 | Back navigation | Back returns where the renter came from, not to the hub | U | no | `page-back.test.tsx` |
| REQ-12 | Empty state | No requests ⇒ real empty state, not a spinner forever | B | no | — |

> **Known gap:** `src/lib/access/hidden-requests.ts` is imported by no test. REQ-09 is uncovered.

---

## 8 · DEAL — deal room, chat, terms & units negotiation

_Last run: never._

There is **no rounds endpoint**. Price and unit history is rebuilt from GetStream `rate_proposal` messages, read defensively from both `message.custom` and the message root, falling back to the room payload.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| DEAL-01 | Deal room opens | Room paints with the real deal, console clean | B | no | `deal-room-cards.test.ts` |
| DEAL-02 | Chat connects | Stream connection established; messages load | U | no | `stream-connection.test.ts`, `chat-dock.test.ts` |
| DEAL-03 | Send a message | Message appears for both sides | B | yes | — |
| DEAL-04 | Attachment in chat | File attaches, renders, opens | U | yes | `chat-attachments.test.ts` |
| DEAL-05 | Routes with no chat | A route that must not show chat does not show it | U | no | `deal-room-no-chat.test.ts` |
| DEAL-06 | Round reconstruction | Rounds rebuilt from `rate_proposal` in the right order | U | no | `deal-room-cards.test.ts` |
| DEAL-07 | Payload nested under `custom` | Round read correctly when nested | U | no | `deal-room-request-cards.test.ts` |
| DEAL-08 | Payload spread on the root | Round read correctly when flattened — both shapes work | U | no | `deal-room-request-cards.test.ts` |
| DEAL-09 | Nothing reachable | Falls back to the room payload, never breaks the flow | U | no | `deal-room-live-position.test.ts` |
| DEAL-10 | **Terms** — counter the rate | New rate recorded as a round with the right role | U | yes | `deal-room-quotation-terms.test.ts` |
| DEAL-11 | **Terms** — mob / demob | Mob and demob prices and units carry through a counter | U | yes | `deal-room-quotation-terms.test.ts` |
| DEAL-12 | **Terms** — exclude mob or demob | `mobExcluded` / `demobExcluded` honoured in the total | U | no | `cycle-totals.test.ts` |
| DEAL-13 | **Units** — renter steps the count down | Rental units drop; total recomputes from the new count | U | yes | — |
| DEAL-14 | **Units** — supplier steps the count up | Allowed, capped at the **requested** count, not at the offer | U | yes | — |
| DEAL-15 | **Units** — step past the requested count | Refused at the cap | U | no | — |
| DEAL-16 | Term provenance | Each live term shows which side last set it | U | no | `deal-room-term-provenance.test.ts` |
| DEAL-17 | Live position | The current position reflects the latest round from either side | U | no | `deal-room-live-position.test.ts` |
| DEAL-18 | Cancel from the room | Deal cancels; system event posted to the thread | U | yes | `deal-room-cancel.test.ts` |
| DEAL-19 | Multi-item negotiation | Countering one item leaves the other items unchanged | U | yes | — |
| DEAL-20 | Two counters in a row | Order preserved; the later one is the live position | U | yes | — |
| DEAL-21 | Deal room in Arabic | Round cards, terms and system events all Arabic, RTL | B | no | — |

---

## 9 · ACCEPT — accept the deal & view the quotation

_Last run: never._

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| ACCEPT-01 | Accept the live position | Deal moves to accepted; no further counters allowed | A | yes | — |
| ACCEPT-02 | Accepted totals equal the live position | Not the original bid — the negotiated numbers | U | yes | `quotation-unified.test.ts` |
| ACCEPT-03 | Quotation renders | Every line item, rate, unit count and total present | U | no | `quotation-render.test.ts` |
| ACCEPT-04 | Quotation matches the deal room | Line for line, no drift between the two surfaces | U | no | `deal-room-quotation.test.ts` |
| ACCEPT-05 | Quotation terms | Mob, demob, exclusions and VAT all stated | U | no | `deal-room-quotation-terms.test.ts` |
| ACCEPT-06 | Quotation token | A quotation link resolves only for its own deal | A | no | `quotation-token.test.ts` |
| ACCEPT-07 | Quotation token is not guessable | A tampered token is refused | A | no | `quotation-token.test.ts` |
| ACCEPT-08 | Multi-item quotation | One block per item, grand total = sum of blocks | U | no | — |
| ACCEPT-09 | Multi-unit quotation | Unit count on each line is the **priced** count | U | no | — |
| ACCEPT-10 | Quotation in Arabic | Fully Arabic and RTL; the numbers still add up | B | no | — |
| ACCEPT-11 | Quotation opens as a document | Opens, prints, totals legible | M | no | manual |
| ACCEPT-12 | Accept twice | Second accept is a no-op, not a second deal | A | yes | — |

---

## 10 · COMPARE — bid comparison

_Last run: never._

The comparison must state the same numbers as the cards. A card saying one thing and a comparison row another is the bug this module exists to catch.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| COMPARE-01 | Compare two bids | Both columns render every compared field | U | no | `comparison.test.ts` |
| COMPARE-02 | Compare rows match the cards | Every value equals the bid card's value | U | no | `comparison.test.ts`, `bid-card-details.test.ts` |
| COMPARE-03 | Totals are comparable | All columns on the same VAT basis and the same day count | U | no | `vat-inclusive.test.ts`, `charged-days.test.ts` |
| COMPARE-04 | Differing unit counts | The priced count is compared, and the difference is stated | U | no | `quick-compare.test.ts` |
| COMPARE-05 | Missing field in one bid | Shown as absent, never as zero | U | no | `comparison.test.ts` |
| COMPARE-06 | Quick compare | The quick view and the full view agree | U | no | `quick-compare.test.ts` |
| COMPARE-07 | Workspace holds the selection | Selected bids survive a reload | U | no | `workspace.test.ts` |
| COMPARE-08 | Export the comparison | Export contains every visible row with the same values | U | no | `workspace-export.test.ts` |
| COMPARE-09 | Compare three or more | Layout holds, no column dropped | B | no | — |
| COMPARE-10 | Compare across multi-item bids | Items line up item to item, not blindly by position | U | no | — |
| COMPARE-11 | Comparison in Arabic | Column order mirrors; labels Arabic | B | no | — |

---

## 11 · OFF — features that must stay switched off

_Last run: never._

The Outcome Survey was disabled in commit `2962151`. The code was **commented out, not deleted**, so it can come back by accident — a merge, a revert, or someone uncommenting the provider. See `docs/surveys-disabled.md`.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| OFF-01 | Survey never renders | No survey modal on any screen; `SurveyProvider` still commented out in `AppShell.tsx` | U | no | — |
| OFF-02 | Survey pending endpoint | `GET /api/me/surveys/pending` ⇒ `404 {code:"not_found"}`, and the app backend is never called | A | no | — |
| OFF-03 | Survey respond endpoint | `POST /api/me/surveys/[id]/respond` ⇒ refused, nothing written | A | no | — |

## 12 · PROJ — renter projects (sites, work orders, awards)

_Last run: 2026-08-30 · staging · **14 pass · 2 fail · 3 blocked**._

A site holds the terms a renter would otherwise retype per request, and the chart of what is on it.
Awards live in a keyed JSON dictionary on the project row — `awards.requests[requestId]` and
`awards.workOrderItems[itemId]` — so there is no foreign key and deleting a machine means deleting a
key. Every write carries `expectedVersion`.

Two facts govern nearly every case here, and both cost a run to learn:

- **`userId` goes in the query for GET and DELETE, and in the BODY for POST and PATCH.** The relay
  sends both.
- **Two 409 codes mean the same thing.** Awards answer `PROJECT_VERSION_STALE`; the project and
  work-order writes answer `PROJECT_VERSION_CONFLICT`.

| ID | Case | Expected | L | Mut | Coverage |
|---|---|---|---|---|---|
| PROJ-API-01 | List the renter's sites | `200`, array, each with `defaults` flat and `version` | A | no | PASS |
| PROJ-API-02 | Create a site | `201`, `version: 1` | A | yes | PASS |
| PROJ-API-03 | Read one back | `200`, `awards: {requests:{}, workOrderItems:{}}` | A | no | PASS |
| PROJ-API-04 | Edit a site | `200` — needs `expectedVersion`, which is **required** | A | yes | PASS |
| PROJ-API-05 | The chart | `200`, `{project, version, groups}` | A | no | PASS |
| PROJ-API-06 | Work order **with** its awards | `201` | A | yes | **FAIL — FIX-PROJ-2** |
| PROJ-API-06b | Work order without awards | `201`, `{workOrderGroupId, itemIds, version}` | A | yes | PASS |
| PROJ-API-07 | Delete a work order | `200`, `{deletedMachines, scrubbedAwards}` | A | yes | PASS |
| PROJ-API-09 | Award a machine | `201`, `{award, version}` | A | yes | **FAIL — FIX-PROJ-1** |
| PROJ-API-10 | Award more units than the line holds | `409 UNITS_EXCEED_QUANTITY` | A | yes | BLOCKED by FIX-PROJ-1 |
| PROJ-API-11 | Un-award | `200`, version moves | A | yes | BLOCKED by FIX-PROJ-1 |
| PROJ-API-12 | Presign a document | `200`, `{key, url}`, key under `…/projects/{id}/documents/` | A | yes | PASS |
| PROJ-API-13 | Attach the key to an award | `200` | A | yes | BLOCKED by FIX-PROJ-1 |
| PROJ-API-14 | File a request under a site | `200`, `{projectId, scrubbedAwards, moved}` | A | yes | PASS |
| PROJ-API-14b | Unfile it again (`projectId: null`) | `200`, `projectId: null` | A | yes | PASS |
| PROJ-API-15 | Write with a stale version | `409 PROJECT_VERSION_CONFLICT` + `currentVersion` | A | yes | PASS |
| PROJ-API-16 | No session | `401 {code:"unauthorized"}` | A | no | PASS |
| PROJ-API-17 | Delete a site that still holds rows | `409 PROJECT_NOT_EMPTY` with the counts | A | yes | PASS |
| PROJ-API-18 | Delete an empty site | `204`, and it leaves the list | A | yes | PASS (was FIX-PROJ-3) |
| PROJ-UI-01 | Sites render on the dashboard, under My requests | Both on one page; no separate route | B | no | `tests/e2e/renter-projects.spec.ts` |
| PROJ-UI-02 | The form is When, then Where, then Payment | Six fields, no hours/day; Save disabled with no location | B | no | `tests/e2e/renter-projects.spec.ts` |
| PROJ-UI-03 | A site offers *Add work order* and *New request* | Both visible; no *Units awarded* roll-up | B | no | **BLOCKED — deploy pending** |
| PROJ-UI-04 | Arabic | `dir="rtl"`, no English fallback in the namespace | B | no | `tests/e2e/renter-projects.spec.ts` |
| PROJ-CT-01 | The contract matches the backend's own schemas | Paths, key sets, enums, required fields, both 409 codes | U | no | `tests/unit/agents-contract.test.ts` |

**Not covered at all.** Moving a request between sites with awards attached (the scrub path);
propagation of a site's defaults onto its filed requests; the *own dates* conflict dialog; the
document list after an attach. Each needs an award to exist first, so all four are downstream of
FIX-PROJ-1.

---

---

## Who runs each case

Every case carries an `L`. The layer is not a preference — it follows from what the case actually needs.

| L | Runner | Use it when | Count |
|---|---|---|---|
| `U` | **vitest** (`npx vitest run`) | The answer is a pure function of inputs — money, counts, rules, contract shapes, provenance. No server, no browser. | 77 |
| `A` | **HTTP against the chosen environment** | The case is about a route's status, response shape, or access control. Needs an environment; needs no rendering. | 46 |
| `B` | **Playwright** (or Chrome tools until it is installed) | The case is about what the renter sees — rendering, navigation, layout, RTL, console cleanliness. | 24 |
| `M` | **A person — UAT** | Automation cannot see it or cannot reach it: a real OTP arriving, a document being the right document, a printed quotation. | 3 |

### The rule that decides the layer

Push each case to the cheapest layer that can actually prove it.

- If the truth is arithmetic or a rule, it is `U`. `BIDVIEW-06` (rate × units × days on the **priced** count) never needs a browser.
- If the truth is "the server answered correctly", it is `A`. `BIDIN-02` (invalid token leaks no request data) is a status code and a body, not a page.
- Only if the truth is visual or navigational is it `B`. `BIDVIEW-14` (pins at the equipment's real coordinates) has to render.
- `M` is the last resort, and every `M` case is a standing cost. `AUTH-15` (the SMS actually arrives) will always be manual; `COMPANY-11` (the uploaded file is the right document, right way up) will too.

### So, in numbers

**150 cases: 123 automatable, 3 permanently manual, and 24 more that need the browser layer standing up.** The 77 unit cases mostly run today — 93 of the 150 already map to an existing spec. The gap is not "we need Playwright for everything"; it is 57 uncovered cases, most of which are `U` or `A` and need no browser at all.

Do the cheap layers first. A Playwright suite bolted on top of untested rules just moves the failure later and makes it harder to read.

## Coverage at a glance

| Module | Cases | With coverage | Gaps |
|---|---|---|---|
| GUEST | 10 | 1 | 9 |
| AUTH | 16 | 11 | 5 |
| CREATE | 22 | 17 | 5 |
| BIDIN | 14 | 7 | 7 |
| BIDVIEW | 20 | 17 | 3 |
| COMPANY | 12 | 5 | 7 |
| REQ | 12 | 5 | 7 |
| DEAL | 21 | 14 | 7 |
| ACCEPT | 12 | 7 | 5 |
| COMPARE | 11 | 9 | 2 |
| OFF | 3 | 0 | 3 |
| **Total** | **153** | **93** | **60** |

Two libraries are imported by no test at all: `src/lib/access/guest-quota-server.ts` and `src/lib/access/hidden-requests.ts`.
