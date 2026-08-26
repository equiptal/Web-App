# The Request Experience — Full Flow, Case by Case

This document describes the whole request experience as it works today: every stage, what the
renter does, what the AI agent does, what the system does, and how each case ends. It is the
baseline for the redesign, so it records behaviour rather than intentions.

It complements `docs/request-create-flow.md`, which explains the topology and the happy path. This
document goes wider: all entry points, all identity cases, all agent outcomes, all errors, and the
life of the request after it goes live.

Every claim points at a file so it can be checked.

---

## 1. Words this document uses

| Word | Meaning |
|---|---|
| **Request / RFQ** | A Request For Quotation: what the renter posts so suppliers bid on it. |
| **Renter (rentee)** | The person who needs equipment and creates the request. |
| **Mansour** | The normalization agent. The AI that reads free text and files, and later judges bids. |
| **Agents-backend** | The service that stores requests and serves the equipment catalogue. |
| **BFF** | The Next.js server layer in this repo. It holds the tokens; the browser never calls a backend directly. |
| **Draft** | The request being edited in the browser, before submit. |
| **Taxonomy** | The equipment catalogue: category → subcategory → measurement. |
| **Verdict** | The per-item review state the UI derives: confident, needs-validation, or no-match. |
| **Fan-out** | One submitted RFQ becomes one backend request per equipment item, sharing a `requestGroupId`. |
| **Tier** | The renter's account level: `guest`, `basic`, or `verified` (`src/lib/session/index.tsx`). |

One name collision is worth flagging. In the deal room, "request" also means a question a renter
sends a supplier (availability, documents, alternatives) — see `src/lib/contract/rentee-request.ts`.
That is a different feature and is out of scope here.

---

## 2. Who does what

| Actor | Responsibility in this flow |
|---|---|
| Renter | Describes the need, reviews everything the agent produced, decides, submits. |
| Web app (BFF) | Screens, state, validation, mapping to backend enums, token handling, mock fallbacks. |
| Mansour | Extraction and inference only. It reads text and files and returns a structured draft. It never submits anything. |
| Agents-backend | Stores the request, fans it out per item, serves the taxonomy, holds bids and documents. |
| App-backend | Sign-in, marketplace reads, deal room. It is not on the create path. |

The routing rule is fixed:

```
Browser → Next.js /api/* → Mansour (parse, judge) or Agents-backend (catalogue, submit)
```

---

## 3. The journey in one view

```
   ENTRY                     CREATE FLOW (/create, one state machine)                 AFTER IT IS LIVE
┌───────────┐   ┌────────────────────────────────────────────────────────┐   ┌──────────────────────┐
│ home hub  │   │ intake ──► processing ──► wizard 1·2·3·4 ──► confirmation│   │ /requests list       │
│ sidebar   ├──►│   ▲            │  agent       renter reviews    share    ├──►│ group view + bids    │
│ handoff   │   │   └────────────┘  parses      and completes     the link │   │ compare (agent again)│
│ bookmark  │   │      error / back      auto-advance 1.4s                 │   │ award → deal room    │
└───────────┘   └────────────────────────────────────────────────────────┘   └──────────────────────┘
```

The four phases are `intake → processing → wizard → confirmation`, held in one reducer
(`src/lib/store/rfq-store.tsx`) and routed by `src/components/CreateSurface.tsx`.

---

## 4. Ways in

| Entry | URL it lands on | What the renter sees first |
|---|---|---|
| Home hub, create-request action | `/create` or `/create?mode=trial\|real` | The hub raises the trial/real pop-up first, then stamps the choice in the URL (`src/components/home/HomeHub.tsx:79,86`). |
| Sidebar "Request" action | `/create` | The create page raises the trial/real pop-up itself when the renter has nothing live (`src/app/create/page.tsx`, `FirstRequestGate`). |
| Sign-up handoff | `/create?new=1` | A fresh start: any saved draft is deleted and the flag is stripped from the URL (`src/app/api/auth/handoff/route.ts:32`, store hydration effect). |
| Account modal, after creating an account | `/create` | Same as the sidebar path. |
| `/requests` empty state, signed out | `/create` | Guests are nudged to create a first request; the account gate waits at submit (`src/app/requests/page.tsx`). |
| Bookmark or reload of `/create` | `/create` | Draft prompt if a saved draft exists; otherwise the pop-up rule applies. |

Two rules decide what happens on entry:

1. **The URL owns the mode.** If `mode` is present, the choice was already made, so the pop-up never
   appears and the store is forced to match the URL — even after a saved draft rehydrates and tries
   to restore its own `isTrial` (`src/app/create/page.tsx`).
2. **A saved draft outranks the pop-up.** A renter with a draft is resuming, not starting, so the
   continue / start-over prompt owns the screen.

---

## 5. Stage 0 — Trial or real

**Renter behaviour.** Picks "Trial Request" or a real request, or closes the pop-up.

**Agent behaviour.** None. The agent is not involved yet.

**System behaviour.** `useStartRequestGate()` (`src/lib/access/start-request-gate.ts`) decides whether
to offer the choice at all. It answers `true` when the renter has never used their first-request slot
(`hasUsedFirstRequestSlot === false`) **or** currently has zero open requests. It answers `null` while
anything is still unknown, and callers treat `null` as "do not offer".

| Case | Outcome |
|---|---|
| Signed out or guest tier | Never offered. A trial needs a real account to own it; guests meet the account gate at submit instead. |
| Gate unknown (loading, failed read) | Not offered. The renter goes straight into intake. |
| Picks trial | `isTrial: true`, URL becomes `?mode=trial`, and an amber ribbon stays above every phase. |
| Picks real | `isTrial: false`, URL becomes `?mode=real`. |
| Closes the pop-up | The renter is sent home. The slot stays open, so the choice returns next time. |
| Switches mid-flow | The ribbon's "switch to a real request" navigates to `?mode=real`; the URL, not the store, carries the change. |

A trial request is created but never dispatched to suppliers. The backend attaches sample bids and
deletes it after 60 minutes. `isTrial` is persisted with the draft, so a mid-flow reload cannot turn
a trial into a real, dispatched request.

---

## 6. Stage 1 — Intake

**File:** `src/components/screens/Intake.tsx`

**Renter behaviour.** Pastes free text, attaches files, or both. Then presses continue.

**Agent behaviour.** None yet.

**System behaviour.** Files are read in the browser and base64-encoded into store state. Accepted
types are PDF, image, Word, and Excel — checked by MIME type first, then by file extension. There is
no size or count limit.

| Case | What happens |
|---|---|
| Text only | Allowed. |
| Files only | Allowed. |
| Text and files | Allowed; both go to the agent. |
| Nothing entered | Continue stays disabled. The BFF also rejects an empty body with `code: "empty"`. |
| Unsupported file | Silently dropped from the batch, and one red line explains the rejection. Other files in the same batch still attach. |
| File fails to read | It is kept in the list with empty data, and the BFF drops it before sending (only files with data are forwarded). |
| A draft already exists (renter came back from a wizard step) | The primary button becomes "re-analyze" and a secondary "back to review" returns to the wizard without re-parsing. |
| Guest over the device allowance | The account modal opens instead of a parse. On account creation, the parse starts automatically. |
| Guest over the server allowance | The parse request returns `{ guestLimit: true }`; the store bounces back to intake with a flag, and the same account modal opens. No error screen. |

**Two caps, both three runs.**

| Cap | Where | Limit | Notes |
|---|---|---|---|
| Client nudge | `src/lib/access/agent-quota.ts` | `GUEST_AGENT_LIMIT = 3` per device | Counted in `localStorage`; clearing storage resets it. |
| Server backstop | `src/lib/access/guest-quota-server.ts` | `GUEST_PARSE_LIMIT = 3` | Counted in a signed HttpOnly cookie; only real-agent runs count, and only a successful job start burns a credit. |

Signed-in renters are never capped. Any auth cookie counts as a session, deliberately failing open so
a real user is never mistaken for a guest.

---

## 7. Stage 2 — Processing: the agent's first act

**Files:** `src/components/screens/Processing.tsx`, `src/app/api/agent/process/route.ts`,
`src/app/api/agent/jobs/[id]/route.ts`, `src/lib/api/client.ts`, `src/lib/api/agent-adapters.ts`

### The sequence

1. The client posts `/api/agent/process` with the text, the files, and the UI locale.
2. The BFF forwards to `POST {MANSOUR_URL}/rfq/jobs` with `source: "web_rfq"`, the renter id as
   `created_by` when a session cookie exists, and `language: "ar"` when the UI is Arabic.
3. Mansour answers with a job id (HTTP 202).
4. The client polls `GET /api/agent/jobs/{id}` every 2 seconds, for up to 4 minutes
   (`PROCESS_TIMEOUT_MS = 240_000`). The long window covers a cold start plus 30–60 seconds of LLM
   work.
5. When the job finishes, the BFF unwraps the envelope, adapts the output into an `AgentDraft`, and
   returns `{ status: "done", draft }`.

`created_by` matters twice: it attributes the RFQ to the right renter, and it keys Mansour's
per-caller rate limit. Without it, all website traffic through one BFF looks like a single caller.

### What the renter sees

A four-stage progress list paced by a timer (2.2 seconds per stage), then summary badges — total
items, how many need a check, how many are unavailable — and an automatic jump into the wizard after
1.4 seconds.

The stage list is an animation, not real progress. There is no per-stage signal from the agent.

### What the agent contributes

| Output | Used for |
|---|---|
| `rfq_header` | Project-level fields: address label, detected locations, rental basis hints, and Step 3 preferences. |
| `line_items` | One per piece of equipment: real taxonomy ids, quantity, operator and fuel guesses, certificates, F.A.T sides, notes. |
| `missing_required_fields` | What is still missing; a capacity entry becomes the per-item size question. |
| `justifications` | Why the agent read the RFQ the way it did; shown in the preview step. |
| `field_notes` | Field-keyed notes rendered inline next to the field they describe. |
| `capacity_advisory`, match annotations | Inputs to the derived per-item verdict. |
| `rfq_id` | The anchor for the learning correction fired after submit. |

The agent does not submit, price, or decide. The renter is always in the loop.

### Every outcome of a parse

| Case | Detection | Renter sees |
|---|---|---|
| Success | `status: done` with a draft | Summary badges, then the wizard. |
| Still working | Mansour returns 202, or the body says pending | The stage animation continues. |
| Nothing extractable | `isExtractionEmpty(raw)` | "Nothing found" modal (`code: "empty"`), with retry. |
| Job flagged error but items exist | job status error **and** `line_items.length > 0` | Treated as success and salvaged. A post-parse hiccup does not throw away a complete parse. |
| Job flagged error, no items | job status error, no items | Error modal with the agent's own reason forwarded. |
| Mansour returns 429 | `backendStatus === 429` | "Busy" wording — the agent is rate-limited. |
| Mansour returns 402 or 403 | `backendStatus === 402 \|\| 403` | "Unavailable" wording — usage, credits, or auth. |
| Any other non-OK | `code: "network"` plus the forwarded reason | "Connection problem" wording, with the raw reason in a monospace block. |
| No job id returned | Missing `job_id` | Connection-problem modal. |
| Over 4 minutes | Poll deadline passes | Connection-problem modal. |
| Guest over the server cap | `{ guestLimit: true }` | Account modal, not an error. |
| Dev error switch | `simulateError` in the body | Forced 503 for testing the error path. |
| Mock mode | `MANSOUR_URL` unset, or job id `mock` | The fixture draft returns immediately. |

Every error modal keeps the renter's text and files, so retry costs nothing (`GO_INTAKE` preserves
input). Closing the modal or clicking outside it returns to intake.

---

## 8. Stage 3 — The review wizard

**Files:** `src/components/wizard/*`, `src/lib/contract/gates.ts`

The agent's draft pre-fills everything. Any value still equal to what the agent supplied carries an
orange AI marker; the marker clears as soon as the renter edits it (`agentMatches()` in the store).

Backward navigation is always free. Only forward navigation is gated, and only in Step 1.

### Step 1 — Project

| Renter must | Renter may | Agent already did |
|---|---|---|
| Confirm the location as a real map point | Move the pin, search, or use GPS | Proposed an address label and coordinates, and listed every location it detected |
| Choose the rental basis (daily, weekly, monthly) | Mark the rental extendable | Hinted at the basis from the RFQ |
| — | Set start and end dates, hours per day (default 10) | Filled dates when the RFQ stated them |
| — | Set a minimum equipment year and safety certificates | Lifted a uniform year or certificate set to request level |
| — | Set request-wide delivery, return, and fuel responsibility | Lifted these when every item agreed |

Cases:

- **Editing the location un-confirms it.** Any patch clears `confirmed` unless it sets it explicitly.
- **Text and file disagree about the location.** The renter picks a source before confirming
  (`RESOLVE_LOCATION_CONFLICT`). Until then, Step 1 is blocked.
- **Several locations detected.** A dismissible banner lists them. One request still carries one
  location.
- **Agent location note.** Shown only while the pin is still the agent's and unconfirmed. Moving or
  confirming clears it.
- **Request-wide beats per-item.** Choosing a request-wide value clears that field's per-item
  overrides, so every line follows the shared setting. The same applies to certificates, and the
  request-wide year is written onto every item.

Step 1 blocks forward navigation until: the location is confirmed, a rental basis is chosen, and any
location conflict is resolved (`gateStep1`).

### Step 2 — Equipment items

Items are triaged into four filters with counts: needs your OK, matched, not available, all.

**How the verdict is derived** (`deriveVerdict()` in `src/lib/api/agent-adapters.ts` — the agent does
not emit it):

| Condition | Verdict |
|---|---|
| Category or subtype is new, or either id is missing, or the category reads "No Equipment Found" | `no-match` |
| Capacity is genuinely new and resolved to no measurement id | `no-match` |
| Capacity match needs a check, fuel type was defaulted, a capacity advisory exists, or no capacity id | `needs-validation` |
| Everything resolved | `confident` (and `resolved: true`) |

**What the renter can do per item:**

| Action | Effect |
|---|---|
| Pick category | Clears subcategory and measurement, resets fuel to diesel, clears the per-item certificate, and drops the stale agent fuel note. |
| Pick subcategory | Clears measurement and re-applies the operator default for that subcategory. |
| Pick measurement | Fills the size but does not change the verdict. A needs-OK item stays needs-OK until approved. |
| Approve | Marks the item resolved. |
| Approve the agent's suggestion | Takes the suggested measurement and resolves the item. |
| Approve all | Resolves every needs-OK item that has a suggestion or a complete reference. Items still missing a size stay in needs-OK. |
| Add an item | A blank line with the operator on and no certificates. |
| Remove an item | Marked removed; excluded from the post. |
| Request sourcing (no-match only) | Opens WhatsApp to support with a pre-filled message. The item **stays on screen** so it does not look silently dropped — but it still never posts. |

Per item the renter also sets quantity, operator need (and then nationality, certificates, night
shift), the F.A.T split (food, accommodation, transport — who pays), fuel type, work type for cranes,
a year override, attachments, and notes.

**No certificate is ever seeded.** Every seeding rule was removed deliberately, in the app first and
then here: choosing nothing in Step 1 must leave every line blank. A line with no override inherits
the request-wide pick at submit time. Resuming a draft does not re-stamp a certificate either — an
empty certificate is a valid, deliberate answer.

**Silence stays silence for F.A.T too.** When the agent says nothing about who covers food or
accommodation, the field stays null rather than defaulting to the renter. A default here would have
been shown to suppliers as the renter's choice.

**Gate:** `gateStep2` blocks forward navigation while any live item has an incomplete taxonomy
reference, no operator answer, no fuel type, or a quantity below 1. Removed and no-match items never
block — and never post.

### Step 3 — Preferences

Prefilled by the agent where the RFQ said something. Nothing here blocks: `gateStep3()` always
passes.

Fields: payment terms and method, maintenance responsibility and SLA, budget ceiling in SAR,
verified-suppliers-only, subletting, bid window (24 hours to one week), and request-level notes.

### Step 4 — Preview and submit

Shows the full summary, the agent's justifications, and a spec table that hides any column empty for
every item. The renter can export the spec sheet as CSV.

Submit is disabled while busy, while no item would post, or while no rental basis is chosen.

### Navigation and start-over

- Forward moves push a browser history entry, so browser Back steps through the wizard.
- The step chips and the Back button both route through `window.history`, so in-app and browser
  navigation stay in sync.
- The "your request" chip returns to the intake screen from any step, with the draft preserved.
- "Start over" is available on every wizard step. It asks for confirmation, then deletes the saved
  draft and resets to a fresh intake.

---

## 9. Stage 4 — Submit

**Files:** `src/components/wizard/Step4Preview.tsx`, `src/app/api/requests/route.ts`,
`src/lib/api/app-adapters.ts`

### Identity cases

| Tier | What happens on submit |
|---|---|
| `guest` | The account modal opens first. When the account is created, the request posts automatically. |
| `basic` | Posts. If the backend rejects with `E8009` (request cap), a verify pop-up appears instead of inline red text. |
| `verified` | Posts. |
| No session at all, on the server | The BFF falls back to `AGENTS_TEST_USER_ID`. This is creator attribution, not authorisation. The code notes that a session-less submit on a deployed environment should probably return 401 so the auth gate opens. |

Only backend-verified ids are accepted for attribution, so a forged cookie cannot file a request
under someone else's name.

### What is sent

`draftToCreateRequest()` maps UI values to canonical backend enums: rental basis to upper case, an
equipment year like `2015+` to a manufacture year, certificate slugs to backend names, maintenance
`renter` to `rentee`, payment terms and methods, SLA, and offer duration. Per item it emits the
taxonomy ids, unit count, operator fields, fuel preference, mobilisation and demobilisation, night
shift, operator nationality and licence level, safety certificates, F.A.T fields, notes, work type,
and attachments.

Urgency (`ASAP`, `SOON`, `FAR_FUTURE`) is computed from the start date on the client to match the
mobile app. The backend also derives it, so the web value is at best redundant.

Only `postableItems()` are sent: not removed, not no-match.

### Outcomes

| Case | Result |
|---|---|
| Success | The backend fans out one request per item, all sharing a `requestGroupId`. The response carries every short code and every UUID; the store clears the saved draft and shows the confirmation phase. |
| Trial success | Same, plus `trialExpiresAt`. No supplier dispatch; sample bids attached; deleted after 60 minutes. |
| Backend rejection | The real backend status, code, and message are forwarded (HTTP 502 from the BFF) and shown for diagnosis. |
| Basic-tier cap (`E8009`) | Verify pop-up. |
| Transport failure | `code: "network"` and the network error wording. |
| Mock mode | A fabricated `RFQ-XXXXXX` code after a short delay. |

### The learning signal

If the draft came from the real agent (`rfqId` present) **and** the renter changed the project or the
posted items, the web posts a correction to `/api/agent/rfq/{rfqId}/correct` **after** a successful
create. It is fire-and-forget with `keepalive`, so it survives the navigation and can never block or
fail a request.

---

## 10. Stage 5 — Confirmation

**File:** `src/components/screens/Confirmation.tsx`

**Renter behaviour.** Copies or shares the bid link, optionally sets a deadline, previews the
supplier form, or goes to the request.

**Agent behaviour.** None.

**System behaviour.** The saved draft is deleted. The screen builds the shareable link as
`{origin}/bid/{renter-slug}-{requestUuid}`, polls the submission counters for that request, and
writes a deadline through `setBidDeadline()`. "View request" opens the group view for the request
UUID.

The screen also runs a four-scene explainer — share, supplier fills, bid submitted, compare — so the
renter knows what happens next.

Cases: with no UUID (mock submit, for example) the share link cannot be built and the view falls back
to `/requests`. In trial mode the ribbon stays visible, without the switch-to-real action.

---

## 11. Stage 6 — After the request is live

**Files:** `src/components/requests/*`, `src/lib/contract/requests.ts`,
`src/components/compare/BidComparisonWorkspace.tsx`

### The list

`/requests` shows the renter's requests grouped back into RFQs by `requestGroupId`, because the
backend stores one request per item. Guests see an empty state that points at `/create`.

The list reads every page (100 per page) rather than the default 20, so a renter with many requests
never has bids hidden on older ones.

Two segments: requests and bids. A group appears under bids when it received an on-platform bid or an
off-platform shared-link bid.

### Statuses and what they allow

Statuses: `OPEN`, `ACTIVE`, `PARTIALLY_ACCEPTED`, `ACCEPTED`, `EXPIRED`, `FORCE_EXPIRED`,
`HUB_CLOSED`, `CLOSED`.

| Action | Allowed when |
|---|---|
| Cancel | Status is `OPEN` or `ACTIVE` (`isCancellable`). |
| Edit | Status is `OPEN` with zero bids. |

Because one RFQ is several requests, a group can hold several statuses at once. The UI handles that
explicitly: `statusSummary()` reads as one label when items agree and splits with counts when they do
not, and `representativeStatus()` prefers a live status for the badge colour.

Cancel cases:

- Cancelling from the RFQ chip cancels every cancellable member and skips the rest, so one accepted
  sibling cannot strand the open lines.
- Cancelling one item cancels only that item.
- Partial failures are reported as a count ("2 of 3 items were withdrawn").
- A blocked item keeps its control visible but greyed, with the reason from
  `cancelBlockedReason()`.

### The agent's second act — bid comparison

The web computes all the money: all-in totals, qualification, and percentage against the lowest.
Mansour only returns judgement — ranking, a recommended pick, and reasons. It never returns a price.

Every relay degrades gracefully. On any failure the route answers `{ agent: false }` and the UI falls
back to its own deterministic ranking.

| Web route | Mansour endpoint | Purpose |
|---|---|---|
| `POST /api/me/bids/recommend` | `/bids/recommend` | Rank bids and recommend a pick |
| `POST /api/me/bids/ask` | `/bids/ask` | Conversational questions about the bids |
| `POST /api/me/bids/parse` | `/bids/parse` | Read an uploaded off-platform quote into a bid |
| `POST /api/me/bids/preferences` | `/bids/preferences` | Save the ranking preference |
| `POST /api/me/bids/award-learning` | `/bids/award-learning` | The "make this my default" nudge after awarding |
| `POST /api/me/bids/events` | `/bids/events` | Fire-and-forget capture of comparison actions |

Verification documents come from the agents-backend, not Mansour.

---

## 12. Case matrices

### A. Identity across the flow

| Stage | Guest | Basic | Verified |
|---|---|---|---|
| Trial/real pop-up | Never offered | Offered when nothing is live | Offered when nothing is live |
| Intake | Allowed | Allowed | Allowed |
| Parse | 3 per device, 3 per cookie | Unlimited | Unlimited |
| Wizard | Full access | Full access | Full access |
| Submit | Account modal first, then auto-post | Posts; may hit the `E8009` cap | Posts |
| `/requests` | Empty state with a nudge | Full list | Full list |

### B. Errors and recovery

| Where | Case | Renter sees | Recovery |
|---|---|---|---|
| Intake | Empty input | Disabled button; `code: "empty"` from the BFF | Type or attach something |
| Intake | Bad file type | One red line | Attach a supported file |
| Processing | Nothing extracted | "Nothing found" modal | Retry, or edit the input |
| Processing | Agent busy (429) | Busy modal | Retry |
| Processing | Agent unavailable (402/403) | Unavailable modal | Retry later |
| Processing | Network, no job id, or timeout | Connection modal with the raw reason | Retry; input is preserved |
| Processing | Job error but items exist | Nothing — the parse is salvaged | — |
| Wizard | Step 1 incomplete | Next disabled, reasons listed | Confirm location, choose basis, resolve conflict |
| Wizard | Step 2 items incomplete | Next disabled, reasons listed | Complete each blocking item |
| Wizard | Taxonomy unreachable | Empty dropdowns | Reload; the route also has a fixture fallback |
| Submit | Backend rejection | The backend's real message and code | Fix and retry |
| Submit | Basic cap `E8009` | Verify pop-up | Verify the account |
| Submit | Network | Connection wording | Retry; the draft is intact |
| Confirmation | No request UUID | No share link | Open `/requests` |

### C. Persistence and navigation

| Case | Behaviour |
|---|---|
| Reload mid-flow | The draft, step, text, and trial flag are restored from `localStorage` (`rfq-draft-v2`), and the continue / start-over prompt appears. |
| Uploaded files after reload | Not restored. Browsers cannot recreate them; the renter re-attaches if needed. |
| Draft owned by another account | Discarded. The draft is stamped with the owner's id, so nothing leaks on a shared device. |
| Guest signs in mid-flow | The draft survives. The persist effect re-stamps it with the new id. |
| Old draft shape (`rfq-draft-v1`) | Deleted, not rehydrated. The old single-value certificate field would crash the render. |
| `?new=1` | Any saved draft is deleted and the flag is stripped, so a later reload cannot wipe fresh work. |
| Successful submit | The saved draft is deleted. |
| Start over | The saved draft is deleted, then the state resets, keeping only the loaded taxonomy. |
| Browser Back | Steps back through the wizard; from Step 1 it returns to intake. |
| Corrupt or blocked storage | Ignored; the flow starts fresh. |

### D. Real versus mock

| Switch | Condition | Effect when unset |
|---|---|---|
| `useRealAgent` | `MANSOUR_URL` set | The parse returns a canned draft, and the guest cap is not applied. |
| `useRealApp` | `AGENTS_API_URL` **and** `AGENTS_API_TOKEN` set | Taxonomy comes from a fixture and submit returns a fabricated code. |

The known trap: Mansour returns real taxonomy UUIDs. If the catalogue is on the fixture (slug ids),
parsed item ids will not match the dropdowns. Real dropdowns and id parity only line up when the
agents-backend URL and token are both set.

---

## 13. Agent behaviour reference

| Property | Behaviour |
|---|---|
| Trigger | Only the renter's explicit continue or re-analyze. The agent never runs on its own. |
| Input | Pasted text, base64 files, `source: "web_rfq"`, `created_by`, and `language: "ar"` when the UI is Arabic. |
| Policy | `source: "web_rfq"` makes optional fields non-blocking and constrains the rental basis. |
| Mode | Asynchronous job plus polling. A large RFQ is a 30–60 second call. |
| Authority | None. Every value it produces is editable, and nothing posts without the renter. |
| Marking | Agent-supplied values are marked orange until edited. |
| Silence | Absence means "not stated". No certificate seeding, no F.A.T default. |
| Verdicts | Derived in the web from the agent's match annotations, not emitted by the agent. |
| Reconciliation | Uniform per-item values for delivery, return, fuel responsibility, year, and certificates are lifted to request level; mixed values keep per-item overrides. |
| Learning | A `web_review` correction is posted after a successful submit when the renter changed the draft. Best-effort only. |
| Money | The agent never returns a price. On the comparison screen the web computes every number. |
| Failure | Every agent call has a fallback: a fixture on the create path, deterministic ranking on the compare path. |

---

## 14. What the redesign has to answer

These are observations from the current code, not decisions.

1. **Two guest caps, two paths to the same modal.** A client cap of three and a server cap of three
   both open the account modal, but through different states (`agent-quota.ts`,
   `guest-quota-server.ts`). The renter cannot tell which one fired.
2. **The processing screen shows invented progress.** Four stages advance on a 2.2-second timer with
   no signal from the agent, and the screen auto-advances 1.4 seconds after the result arrives
   (`Processing.tsx:27-31`) — too fast to read the summary counts it just rendered.
3. **No-match items disappear quietly.** They never block Step 2 and never post (`gates.ts:58`), and
   the sourcing action hands off to WhatsApp while leaving the item on screen
   (`ItemRow.tsx:178-185`). A renter can submit believing that equipment was included.
4. **One RFQ becomes many requests.** Fan-out is invisible at submit but visible everywhere after:
   split statuses, per-item cancel, group re-assembly by `requestGroupId`. The create flow and the
   list flow do not describe the request the same way.
5. **A session-less submit lands on a test user.** The code names this as an open question:
   attribution falls back to `AGENTS_TEST_USER_ID` rather than returning 401 and opening the auth
   gate (`src/app/api/requests/route.ts:38-46`).
6. **The basic-tier request cap only surfaces as a failure.** The renter learns about it after
   completing the whole flow and pressing submit (`E8009` → verify pop-up).
7. **Urgency is computed twice.** The web derives it from the start date to match the app, and the
   backend derives it as well.
8. **Trial mode lives in the URL.** The store, the persisted draft, and the URL all carry it, and the
   URL wins. Any redesigned entry point must keep that ordering or trials and real requests can swap.
9. **Wizard navigation borrows the browser history stack.** Step chips call `window.history.go()`. A
   redesigned shell has to keep that contract or replace it wholesale.
10. **Empty taxonomy fails silently.** If the catalogue cannot load, dropdowns are simply empty; no
    message explains why.

---

## 15. File map

**Flow and screens**
- `src/app/create/page.tsx` — the route, the trial/real gate
- `src/components/CreateSurface.tsx` — phase router, trial ribbon, draft prompt
- `src/components/home/StartYourRequestModal.tsx` — the trial/real choice
- `src/components/screens/Intake.tsx` · `Processing.tsx` · `Confirmation.tsx`
- `src/components/wizard/Wizard.tsx` · `Step1Project.tsx` · `Step2Equipment.tsx` · `ItemRow.tsx` · `Step3Preferences.tsx` · `Step4Preview.tsx`
- `src/components/requests/RequestsList.tsx` · `RequestDetail.tsx` · `RequestGroupDetail.tsx` · `RequestBids.tsx`
- `src/components/compare/BidComparisonWorkspace.tsx`

**State, rules, access**
- `src/lib/store/rfq-store.tsx` — the reducer, persistence, history sync
- `src/lib/contract/gates.ts` — advance gates and `postableItems`
- `src/lib/contract/draft.ts` — draft shapes and `computeSummary`
- `src/lib/contract/requests.ts` — statuses, grouping, cancel rules
- `src/lib/access/start-request-gate.ts` — trial/real offer rule
- `src/lib/access/agent-quota.ts` · `guest-quota-server.ts` — guest caps
- `src/lib/session/index.tsx` — tier

**BFF routes**
- `src/app/api/agent/process/route.ts` — start the parse
- `src/app/api/agent/jobs/[id]/route.ts` — poll the parse
- `src/app/api/agent/rfq/[id]/correct/route.ts` — the learning correction
- `src/app/api/taxonomy/route.ts` — the catalogue
- `src/app/api/requests/route.ts` — submit
- `src/app/api/me/requests/**` — list, detail, cancel, edit, bids
- `src/app/api/me/bids/**` — agent judgement and documents

**Adapters and client**
- `src/lib/api/client.ts` — `processRfq()`, `submitRequest()`, list and bid reads
- `src/lib/api/agent-adapters.ts` — agent output to draft, verdict derivation
- `src/lib/api/app-adapters.ts` — draft to backend payload
- `src/lib/api/agents-backend.ts` · `bids-relay.ts` · `mansour-relay.ts`
- `src/lib/config/env.ts` — backend URLs and the real-versus-mock switches
