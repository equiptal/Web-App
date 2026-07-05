# How "Create a Request" Works — End to End (with the Agent)

This doc walks through what happens when a renter creates a rental request (an **RFQ** —
Request For Quotation) on the web app, from the moment they paste their requirements to the
moment a request exists in the backend and bids start coming in.

It is written to be readable without diving into the code. Jargon is defined inline. File
paths are given so an engineer can jump straight to the relevant piece.

---

## 1. The big picture (who talks to whom)

The Web-App is a **Next.js app**. It has **no database or business logic of its own** — it is a
"BFF" (Backend-For-Frontend): a thin server layer that the browser talks to, which in turn
relays to the real backends and holds the secret tokens so the browser never sees them.

There are **three** services behind it, and they each do a different job:

| Service | Nickname | What it does for request-create | Talks to it via env var |
|---|---|---|---|
| **Normalization Agent** | **Mansour** | The AI. Reads the renter's pasted text / uploaded files and turns them into a structured draft (equipment items, quantities, requirements). Also powers bid-comparison later. | `MANSOUR_URL` |
| **Agents-Backend** | "agent door" | Stores the actual request. The web submits the finished RFQ here. Also serves the equipment catalogue (taxonomy). Token-authenticated. | `AGENTS_API_URL` + `AGENTS_API_TOKEN` |
| **App-Backend** | "app door" | Auth/sign-in, marketplace reads, deal room. (Used by other flows, not the core create.) | `APP_API_URL` |

**The golden rule of the topology:**

```
Browser  →  Next.js /api/* route (the BFF, holds the token)  →  Mansour (parse) / Agents-Backend (submit)
```

The browser never calls Mansour or the agents-backend directly. Every external call goes
through a Next.js route handler under `src/app/api/**`, which attaches the bearer token
server-side. That keeps the token out of the browser.

> **Mock fallback:** every external call has a built-in fixture. If `MANSOUR_URL` is unset the
> parser returns a canned draft; if `AGENTS_API_URL`/token are unset, taxonomy and submit return
> mock data. This is why the app runs end-to-end locally even with nothing wired.

---

## 2. The two ways a request can start

There are two entry paths into request creation:

1. **Agent path (web/002)** — the renter pastes/uploads their requirements, **Mansour parses
   them into a draft**, and the renter reviews/edits before submitting. This is the path this doc
   focuses on, and it submits to the **agent door** (`/agents/requests`).
2. **Manual path (web/005)** — the renter fills the form by hand with no AI parsing (paused/
   separate work). It submits to the **rentee door** (`/rentees/me/requests`) instead, because that
   door keeps a multi-item request as one request rather than fanning it out.

Everything below describes the **agent path**.

---

## 3. Step-by-step: the agent create flow

### Route & shell
- Entry route: `/create` → `src/app/create/page.tsx`
- It wraps everything in an `RfqProvider` (the state context) and an `AppShell` layout.
- The screen router (which screen shows for the current phase) is `src/components/CreateSurface.tsx`.
- All shared state lives in **one context store**: `src/lib/store/rfq-store.tsx` (a Redux-style
  `useReducer`). Its `phase` field drives which screen is visible:
  `intake → processing → wizard → confirmation`.

---

### STEP 1 — Intake (renter describes what they need)
**File:** `src/components/screens/Intake.tsx`

The renter can:
- **Paste free text** describing the job, and/or
- **Attach files** (PDF, Word, Excel, images). Files are read into memory and base64-encoded.

Clicking **Continue** dispatches `process()` on the store. Empty input (no text, no files) is
rejected (AC-09).

---

### STEP 2 — Processing (Mansour parses it)
**File:** `src/components/screens/Processing.tsx` (shows a 4-stage progress animation)

This is the **agent step**. Here's the exact relay:

1. **Client** (`processRfq()` in `src/lib/api/client.ts`) calls **`POST /api/agent/process`**.
2. **BFF route** `src/app/api/agent/process/route.ts` forwards to Mansour:
   ```
   POST {MANSOUR_URL}/rfq/jobs
   {
     "message": "<pasted text>",
     "attachments": [{ "type": "application/pdf", "filename": "...", "data": "<base64>" }],
     "source": "web_rfq",          // tells Mansour to use web policy (optional fields are non-blocking)
     "language": "ar"              // set when the renter's locale is Arabic; free-text parsing in Arabic
   }
   ```
   Mansour returns a **job id** (this is async — HTTP 202).
3. **Client polls** `GET /api/agent/jobs/{jobId}` every **2 seconds**.
4. **BFF route** `src/app/api/agent/jobs/[id]/route.ts` forwards to `GET {MANSOUR_URL}/rfq/jobs/{id}`.
5. When Mansour is done, the response carries the parsed result. The agent output is nested at
   `data.result` and contains:
   - `rfq_header` — project-level info (locations, rental basis hints, etc.)
   - `line_items` — one per piece of equipment, with **real taxonomy ids**, quantities, and
     inferred requirements
   - `missing_required_fields` — what the renter still needs to fill in
   - plus `summary_counts`, `sender_contact`, `detected_locations`
6. The BFF normalizes this into an **`AgentDraft`** and returns
   `{ status: "done", draft }` (or `{ status: "pending" }` / `{ status: "error", code }`).

**Timeout:** the poll loop waits up to **4 minutes** — this covers Railway cold-start plus
30–60s of LLM work.

The adapter that digs the agent output out of the envelope (it searches `a` / `a.result` /
`a.data` / `a.data.result`) is `src/lib/api/agent-adapters.ts`.

Once `draft` arrives, the store moves `phase → wizard` and the renter reviews it.

> **What the agent actually contributes:** it does the *extraction and inference* — turning
> "I need 3 air compressors and a forklift in Dammam for two weeks" into structured line items
> with the right catalogue ids, quantities, operator/fuel/cert guesses, and a list of what's still
> missing. It does **not** submit anything; the renter is always in the loop to confirm/edit.

---

### STEP 3 — The 4-step wizard (renter reviews & completes)
**File:** `src/components/wizard/Wizard.tsx`

The agent's draft pre-fills the wizard. Anything the agent inferred is marked (the orange "AI"
markers come from `agentOrigin`, a snapshot of the agent's original values). The renter can edit
everything.

**Step 1 — Project** (`Step1Project.tsx`)
- Location (map picker or manual; must be confirmed — AC-16)
- Rental basis: DAILY / WEEKLY / MONTHLY (**required to advance** — AC-13) + extendable flag
- Start/end date (optional), hours per day (default 10)
- Equipment year ("any" or 2015+…2022+), safety certificates (multi-select + free text)
- Request-wide responsibilities: delivery to site, return from site, fuel (me vs supplier)

**Step 2 — Equipment items** (`Step2Equipment.tsx`) — per item:
- Category / subcategory / measurement (the **taxonomy** hierarchy, fetched from the catalogue — see below)
- Quantity (default 1), operator needed (yes/no/optional) → nationality, operator certs (TÜV/SPSP/SASO), night shift
- **F.A.T split** (Food, Accommodation & Transport — who pays: supplier or me)
- Fuel type, work type (cranes only), per-item year override
- Attachments/accessories, additional notes (editable, agent-extracted — AC-53)
- A **verdict** badge per item: confident / needs-validation / no-match
- Items are grouped into filters: *Needs your OK · Matched · Not available · All*

**Step 3 — Preferences** (`Step3Preferences.tsx`)
- Payment terms + payment method, maintenance responsibility + SLA
- Budget ceiling (SAR), verified-suppliers-only, subletting allowed, bid window (24h…1 week)
- Request-level notes

**Step 4 — Preview & submit** (`Step4Preview.tsx`)
- Full summary (project + items + preferences), agent justifications, CSV export
- Submit is disabled until: not busy **and** at least one item **and** rental basis chosen
- **Guest gate:** if not signed in, an `AccountModal` appears first, then auto-submits after sign-up

#### Where the equipment catalogue (taxonomy) comes from
The dropdowns in Step 2 are populated by **`GET /api/taxonomy`** →
`src/app/api/taxonomy/route.ts` → `GET {AGENTS_API_URL}/agents/taxonomy?tenant=default` (bearer
token). The flat node list is adapted into a nested tree. Falls back to a fixture if the
agents-backend is unreachable.

> **Subtle gotcha:** Mansour returns *real* taxonomy UUIDs. If the catalogue is on the mock
> fixture (slug ids like `generators`), parsed item ids won't match the dropdowns. Real
> dropdowns + id-parity only line up when `AGENTS_API_URL` + token are set.

---

### STEP 4 — Submit (create the real request)
This goes to the **agent door**, not Mansour.

1. **Client** `submitRequest()` (`src/lib/api/client.ts`) calls **`POST /api/requests`**.
2. **BFF route** `src/app/api/requests/route.ts`:
   - Resolves the **userId**: from the signed-in `mt_user` cookie, or falls back to
     `AGENTS_TEST_USER_ID` (staging only).
   - Calls **`draftToCreateRequest(draft, userId)`** (`src/lib/api/app-adapters.ts`) to map the
     UI's draft into the backend payload.
   - Forwards to:
     ```
     POST {AGENTS_API_URL}/agents/requests
     Authorization: Bearer {AGENTS_API_TOKEN}
     X-Tenant-Id: default
     ```
3. The agents-backend **fans out one request per equipment item** (3 items → 3 single-item
   requests), all sharing a `requestGroupId`.
4. Response is re-mapped to:
   ```
   { requestId, requestIds: [shortCode…], requestUuids: [UUID…] }
   ```
   - `requestIds` = the human short codes (one per item)
   - `requestUuids` = the real UUIDs (used to build supplier bid-link tokens)
5. Store dispatches `SUBMIT_SUCCESS`, clears the saved draft, and shows the confirmation phase.

#### The mapping layer (`app-adapters.ts`) — UI values → backend enums
This is where UI-friendly values become canonical backend enums. Highlights:
- Rental basis `daily/weekly/monthly` → `DAILY/WEEKLY/MONTHLY`
- Equipment year `"2015+"` → `maxEquipmentAge` (an integer manufacture year)
- **Urgency** (`ASAP/SOON/FAR_FUTURE`) is **computed client-side from the start date** to match
  the mobile app's rule — it is *not* a field the renter enters. (The backend also derives it; the
  web value is at best redundant.)
- Fuel type, certs (`saso-technical` → `saso_technical_inspection`), payment terms/methods,
  maintenance responsibility (`renter` → `rentee`), SLA, offer duration — all normalized here.
- Per item it emits: `categoryId/subtypeId/capacityId`, `numberOfUnits`, `operatorIncluded`,
  `fuelTypePreference`, mobilization/demobilization, `maxEquipmentAge`, `dieselIncluded`,
  `nightShiftRequired`, `operatorNationality`(+Custom), `operatorLicenseLevel`,
  `safetyCertifications`, F.A.T fields, `additionalNotes`, `workType`, `attachmentIds`,
  `customAttachments`.

> **Field parity is full** on the staging agent door — FAT / nationality / certs / year / all the
> header fields persist. There is no dropped-field bug on this path.

---

## 4. State & persistence

`src/lib/store/rfq-store.tsx` holds it all:
- **phase / step**, the **draft**, intake **text/files**, **busy/error**, the **submission result**
  (`requestId(s)/Uuids`), and `agentOrigin` (for the AI markers).
- **Persistence:** the draft is saved to `localStorage` under `rfq-draft-v2` (user-scoped, with a
  v1-compat check). Browser back/forward is supported via `window.history`. The draft is cleared
  on successful submit. If a saved draft exists on return, the renter is offered
  *Continue / Start over* (`draftPrompt`).

---

## 5. After creation — the agent shows up again (bid comparison)

Once the request is live and suppliers bid, **Mansour** returns for a second act on the
bid-comparison screen (web/007). Important boundary: **the web computes all the money**
(all-in totals, qualification, % vs lowest) and sends those to Mansour; **Mansour only returns
judgement — ranking, a recommended pick, reasons — never a price.**

These are all BFF relays to `{MANSOUR_URL}/bids/*` (via `src/lib/api/bids-relay.ts`), each of
which **degrades gracefully** — on any error they return `{ agent: false }` and the UI falls back
to its own deterministic ranking:

| Web route | Mansour endpoint | Purpose |
|---|---|---|
| `POST /api/me/bids/recommend` | `/bids/recommend` | Rank bids + recommend a pick (deterministic ranker) |
| `POST /api/me/bids/ask` | `/bids/ask` | Conversational "Ask Mansour" chat about the bids |
| `POST /api/me/bids/parse` | `/bids/parse` | Extract an uploaded off-platform supplier quote into a bid |
| `POST /api/me/bids/preferences` | `/bids/preferences` | Save the renter's ranking preference |
| `POST /api/me/bids/award-learning` | `/bids/award-learning` | "Make this my default" nudge after awarding |
| `POST /api/me/bids/events` | `/bids/events` | Fire-and-forget capture of comparison actions for learning |

Bid/company verification documents come from the **agents-backend** (not Mansour):
`GET /api/me/bids/{id}/documents` → `GET {AGENTS_API_URL}/agents/bids/{id}/documents?presign=true`.

The comparison UI lives in `src/components/compare/BidComparisonWorkspace.tsx`.

---

## 6. Environment variables (what flips real vs mock)

Set in `.env` (prod defaults) / `.env.local` (staging/local overrides):

```
MANSOUR_URL=https://normalization-agent-production.up.railway.app   # the AI parser (and /bids/*)
AGENTS_API_URL=https://kge3xspt36.execute-api.eu-central-1.amazonaws.com  # taxonomy + submit
AGENTS_API_TOKEN=<bearer>          # auth for the agent door
AGENTS_TEST_USER_ID=46             # fallback rentee when nobody is signed in (staging)
BIDS_API_TOKEN=<optional>          # optional gate on Mansour /bids/* (open when unset)
```

Logic (`src/lib/config/env.ts`):
- `useRealAgent = Boolean(MANSOUR_URL)` — real parsing on, else fixture.
- `useRealApp = Boolean(AGENTS_API_URL && AGENTS_API_TOKEN)` — real taxonomy + submit, else mock.

> Note: `MANSOUR_URL` pointing at the **production** Railway deploy serves `/rfq/*` but `404`s
> `/bids/*` if the bid-comparison agent branch hasn't been merged/deployed. That's the only thing
> gating the bid-comparison agent panel from lighting up.

---

## 7. One-screen summary of the whole journey

```
Renter pastes text / uploads files            (Intake.tsx)
        │
        ▼  POST /api/agent/process → POST {MANSOUR_URL}/rfq/jobs   (start async parse)
   Mansour parses (poll every 2s, up to 4 min)  (Processing.tsx)
        │  GET /api/agent/jobs/:id → GET {MANSOUR_URL}/rfq/jobs/:id
        ▼  returns AgentDraft (line_items + header + missing fields)
Renter reviews & edits in 4-step wizard         (Wizard.tsx, Step1–4)
   • taxonomy dropdowns ← GET /api/taxonomy ← GET {AGENTS_API_URL}/agents/taxonomy
        │
        ▼  POST /api/requests → draftToCreateRequest() → POST {AGENTS_API_URL}/agents/requests
   Agents-backend creates request(s), one per item, shared requestGroupId
        │
        ▼  returns { requestId, requestIds[], requestUuids[] }  → confirmation
        ┄┄ later, when bids arrive ┄┄
   Bid comparison: web computes money, Mansour /bids/* returns judgement only  (BidComparisonWorkspace.tsx)
```

---

## 8. Key files cheat-sheet

**Flow & UI**
- `src/app/create/page.tsx` — `/create` route
- `src/components/CreateSurface.tsx` — screen router
- `src/lib/store/rfq-store.tsx` — central state + persistence
- `src/components/screens/Intake.tsx` · `Processing.tsx`
- `src/components/wizard/Wizard.tsx` · `Step1Project.tsx` · `Step2Equipment.tsx` · `Step3Preferences.tsx` · `Step4Preview.tsx`
- `src/components/compare/BidComparisonWorkspace.tsx` — bid-comparison + Ask-Mansour panel

**BFF API routes**
- `src/app/api/agent/process/route.ts` — start parse (→ Mansour)
- `src/app/api/agent/jobs/[id]/route.ts` — poll parse (→ Mansour)
- `src/app/api/taxonomy/route.ts` — equipment catalogue (→ agents-backend)
- `src/app/api/requests/route.ts` — submit RFQ (→ agents-backend)
- `src/app/api/me/bids/*/route.ts` — bid judgement (→ Mansour `/bids/*`)

**Client / contract / adapters**
- `src/lib/api/client.ts` — `processRfq()`, `submitRequest()`
- `src/lib/api/agent-adapters.ts` — unwrap Mansour's parse output → `AgentDraft`
- `src/lib/api/app-adapters.ts` — `draftToCreateRequest()` (UI → backend enums)
- `src/lib/api/agents-backend.ts` — server-only bearer-token client
- `src/lib/api/bids-relay.ts` — server-only relay to Mansour `/bids/*`
- `src/lib/contract/draft.ts` — `RfqDraft` / `ProjectDetails` / `EquipmentItem` / `Preferences`
- `src/lib/config/env.ts` — backend URLs + real-vs-mock switches
```
