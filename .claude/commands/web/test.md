---
description: Run the test runbook against a chosen environment. Asks which environment (prod/staging/local), resolves what to test (a module, a new feature, or everything), then runs unit + API + browser layers and reports pass/fail per case. Mutates nothing on prod.
---

# /web:test — Runbook-driven testing

You are running the **Moedatech renter web app** test runbook (`C:\Users\yaraf\OneDrive\Desktop\Web-App`, Next.js 15 App Router + TypeScript + vitest).

The runbook has one ID space. Every case has an ID like `AUTH-03`. A case is covered by an automated spec or it is a manual check — never both, never neither. The report says which.

Three layers, always in this order. Do not skip a cheap layer because a later one is more interesting.

1. **Unit** — pure logic in memory (`npx vitest run`). Fast, no environment needed.
2. **API** — the app's own route handlers, over HTTP, against the chosen environment.
3. **Browser** — the rendered page. Playwright when installed, otherwise the Chrome tools.

A green unit suite is **not** a passing run. It tested the source, not the environment.

## Arguments

`$ARGUMENTS` selects target and environment. Both may be omitted — then you ask.

| Arg | Meaning |
|---|---|
| *(empty)* | Ask what to test, then ask the environment |
| `<module>` | One module from the registry below (e.g. `/web:test deal-room`) |
| `<module> <module> …` | Several modules |
| `all` | Every module in the registry |
| `feature <name>` | A new feature — no registry entry yet; derive cases from its spec or its diff |
| `--env prod` / `--env staging` / `--env local` | Skip the environment question |
| `--layer unit\|api\|browser` | Run only that layer |
| `--manual` | Produce the manual checklist only, run nothing |
| `--since <ref>` | Scope to modules touched since `<ref>` (default `origin/staging`) |

Echo the resolved target, environment and layer set in one line before starting.

---

## Step 0 — Resolve the environment (ask, always)

If `--env` was not passed, **ask before doing anything else**. Use `AskUserQuestion` with these options:

- **staging** — full run, mutations allowed
- **prod** — read-only run, mutations forbidden
- **local** — `next dev` on this machine, mutations allowed

| Environment | Base URL | Mutations |
|---|---|---|
| prod | `https://g0a44yhbki.execute-api.eu-central-1.amazonaws.com` | **forbidden** |
| staging | `https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com` | allowed |
| local | `http://localhost:3000` | allowed |

Once you learn a URL, edit this file so the next run does not ask again.

### The prod rule

On **prod** you may only read. No creating a request, no submitting a bid, no sending a quotation, no cancelling a deal room, no uploading a document, no editing a profile. Any case marked `mutating` in the registry is reported `SKIPPED (prod, mutating)`, not silently dropped. If the user asks for a mutating case on prod anyway, say plainly that it writes real data to a live tenant and get an explicit go-ahead first.

On **local**, start the server yourself if it is not up: `npm run dev`, wait for the port, and stop it when done.

## Step 1 — Resolve authentication

Most cases need a signed-in renter. Login is OTP, so pick a strategy for the environment and say which one you used in the report — a run that silently tested logged-out pages is a false pass.

**staging — the known-good route.** Log in as the renter test account `0508150219` using the staging OTP bypass. Read `STAGING_OTP_BYPASS_CODE` from `Moedatech-App/apps/backend/.env.staging` at call time; never copy it into a file, a commit, or the transcript. The bypass skips Unifonic entirely (`auth.service.ts:204` — *"skip Unifonic to avoid sending SMS to real prod-snapshot phone numbers"*), so **no SMS is sent** to a real handset.

```
POST /auth/login      { phone: "0508150219", countryCode: "+966", role: "rentee", otpMethod: "SMS" }
POST /auth/verify-otp { phone: "0508150219", code: <bypass code> }
```

Then send **`data.idToken`** as `Authorization: Bearer`. Two traps, both of which cost a run to rediscover:

- **The access token is refused.** The API Gateway Cognito authorizer validates the ID token — it carries `aud` and `custom:dbUserId`. `accessToken` returns `401` on every endpoint. The web already gets this right (`app-backend-authed.ts:209`) and so does the app.
- **Responses are gzipped.** A client that does not decompress fails with an invalid-UTF-8 error that looks like a server fault and is not.

**prod — read-only, no session.** Do not log in to prod. Authentication is a write: it sends an SMS and can create an account. Probe prod with unauthenticated GETs only, and assert that renter endpoints answer `401`.

**local** — auth has no mock (`appApiUrl` is the one service in `env.ts` with no stand-in), so authenticated journeys cannot run locally. Stub `/api/auth/*` and `/api/me/*` for browser cases, or point at staging.

If no strategy is available, run the public surfaces and the unit layer, and report every authenticated case as `BLOCKED (no session)`. Do not invent a pass.

## Step 2 — Resolve the target to cases

**A registry module** — take its case table from `TESTING.md`.

**A new feature** — there is no table yet. Build one:
- read its spec (`docs/`) if it exists, else read the diff (`git diff origin/staging...HEAD`)
- one case per acceptance criterion, plus the edge cases the criteria imply (empty state, error state, Arabic)
- write the new table into `TESTING.md` under a new module heading before running it

Print the resolved case list before running anything. The user sees what will be checked.

## Step 3 — Layer 1 · Unit

Run the module's mapped spec files:

```bash
npx vitest run <specs>
```

Report the actual failure line, never a paraphrase. A unit failure in the module under test is blocking — report it and stop that module's remaining layers, because the browser failure that follows is the same bug twice.

## Step 4 — Layer 2 · API

For each of the module's API cases, call the route on the resolved base URL with the session from Step 1. Check three things every time, not just the first:

- **status** — the expected code, and that an unauthenticated call is refused
- **shape** — the fields the UI actually reads are present and the right type
- **content** — the values are right, not merely non-empty

An endpoint that answers `200 {}` looks healthy and breaks the page. Say what you compared against.

## Step 5 — Layer 3 · Browser

If `@playwright/test` is in `devDependencies`, run its specs for the module:

```bash
npx playwright test tests/e2e/<module> --reporter=line
```

If Playwright is not installed, drive the Chrome tools instead (`mcp__claude-in-chrome__*`) and say in the report that the run was manual-driven and therefore not repeatable. Offer to install Playwright once; do not install it mid-run without asking.

Every browser case checks the rendered content, not just that the route responded. An error boundary and an empty state both return 200.

Run these on every module, not only the ones whose cases name them:

- **Console clean** — `read_console_messages` after first paint. Hydration errors, missing chunks and CSP violations mean a broken page even when the HTML renders.
- **Arabic** — repeat the module's primary journey with the locale set to `ar`. Check the direction flips and that no string falls back to English. Compare `src/lib/i18n/ar.ts` against `en.ts` for missing keys in the module's namespace.

## Step 6 — Manual cases

Some cases cannot be automated cheaply — a real OTP SMS, a document upload a human must eyeball, a map interaction, a payment. Output them as a checklist the user ticks:

```
[ ] DEAL-07 · Quotation PDF opens and the totals match the deal room · ar + en
```

Do not mark a manual case passed. It is `MANUAL (awaiting user)` until the user says otherwise.

## Step 7 — Report

Three parts, in this order. Do not merge them — the first is what happened, the second is what to do, the third is what you could not reach.

### 7a · Results, per module

One table per module, cases in ID order:

| ID | Case | Layer | Result | Evidence |
|---|---|---|---|---|

Results are `PASS`, `FAIL`, `SKIPPED (prod, mutating)`, `BLOCKED (no session)`, or `MANUAL (awaiting user)`. Nothing else. Evidence is a file:line, a status code, a quoted string, or a screenshot path — never "looks fine".

Head each module table with its counts: `AUTH — 11 pass · 2 fail · 3 blocked`.

### 7b · Fix list, per module

**Every `FAIL` becomes a numbered fix entry, under the module it belongs to.** A failure with no fix entry is a report that tells the reader nothing they can act on. Each entry carries exactly these fields:

| Field | What goes in it |
|---|---|
| **ID** | `FIX-<MODULE>-<n>`, e.g. `FIX-DEAL-2`. Stable across runs — a fix that reappears keeps its number. |
| **Case** | The case ID(s) that failed. |
| **Severity** | `blocker` · `major` · `minor`. See the scale below. |
| **Where** | `file:line`. The line to change, not the file it was noticed in. |
| **Expected / Actual** | Two concrete values. `81,000` vs `93,000`, not "wrong total". |
| **Cause** | One sentence on why it happens. If unknown, write `unknown` — never guess in this field. |
| **Fix** | The change, in one or two sentences. Name the function. |
| **Risk** | What else the change touches. `none known` is a valid answer, but look first. |
| **Ruling** | The `RULINGS.md` entry that makes this a defect rather than a preference, if there is one. |

Severity scale, in order — the first one that applies wins:

1. **blocker** — money is wrong, a contract term is wrong, data is lost, or someone sees another tenant's data.
2. **major** — a renter cannot finish a journey, or two surfaces state different facts about the same thing.
3. **minor** — cosmetic, copy, or a rough edge that does not change what the renter decides.

Order the fix list by severity, then by module order. Put the total at the top: `7 fixes — 2 blocker, 3 major, 2 minor`.

**A failure you have not confirmed is a `PLAUSIBLE` fix entry, marked as such.** Do not present a suspicion as a defect.

### 7c · What this run could not prove

Close with the honest edges, because a report that omits them reads as broader than it is:

- cases `BLOCKED` and why (no session, no environment URL, mutating on prod)
- cases with **no coverage at all** — the `—` rows
- anything asserted by one surface only, where the agreement matrix has no second surface to compare against

## Step 8 — Persist

**`TESTING.md`** — the run date, the environment, and the pass/fail counts at the top of each module's section; any new case found during the run, added with no result yet; a manual case you automated this run flips to a spec path.

**`FINDINGS.md`** — the fix list from 7b, and nothing else. It is the working queue for the fixing session that follows, so it holds only open entries. When a fix lands, strike the entry through with the commit that closed it rather than deleting it, so a reappearing defect is visibly a regression and not a new discovery.

**`RULINGS.md`** — if the run turned up a question only a person can answer (two surfaces disagree and neither is obviously right; the app contradicts itself; a written spec and the code disagree), add it to the Open section rather than picking an answer. Check the app, the backend and git history first — most apparent open questions are already settled somewhere and only look open from the web alone.

Fix nothing without approval. Report the failures, propose the fix, and wait — unless the user invoked this with an explicit instruction to fix.

---

## Module registry

Ten modules. The case tables live in `TESTING.md` under the matching prefix; this table is only the routing — which name resolves to which routes, specs and risk.

| Module | Prefix | Routes | Unit specs | Mutating |
|---|---|---|---|---|
| `guest` | `GUEST` | home while signed out, `api/agent/process`, middleware | `middleware.test.ts` (thin — `guest-quota-server.ts` has none) | no |
| `auth` | `AUTH` | `/login`, `/verify`, `api/auth/*` | `auth-routes`, `auth-session`, `auth-i18n`, `session-user`, `onboarding` | yes |
| `create` | `CREATE` | `/create`, `api/requests`, `api/taxonomy`, `api/agent/*` | `canvas-*`, `when-panel`, `where-panel`, `machine-panel`, `operator-rail`, `submit-payload`, `create-canvas-wiring`, `agent-*`, `ready-to-send` | yes |
| `bid-in` | `BIDIN` | `/bid/[token]`, `/bid/[token]/og`, `api/bid-form/[token]` | `bid-form`, `bid-form-routes`, `bid-preview`, `bid-card-html`, `link-bids` | yes |
| `bid-view` | `BIDVIEW` | `/bids/[bidId]`, `/bids/[bidId]/equipment`, `api/me/received-bids` | `bid-card-*`, `bids`, `bid-map`, `bid-equipment-access`, `equipment-*`, `cert-rule`, `fleet`, `availability-chip`, `price-footer`, `map-no-quality-score` | no |
| `company` | `COMPANY` | `/company`, `/profile`, `api/verification/*`, `api/profile/*` | `company-documents`, `company-panel-source`, `company-pile`, `gates` | yes |
| `request` | `REQ` | `/requests`, `/dashboard`, `/inbox`, `api/me/requests` | `requests`, `request-card`, `dashboard-access`, `page-back`, `deal-room-cancel`, `deal-system-event` | yes |
| `deal-room` | `DEAL` | `/deal-room/[id]` | `deal-room-*`, `chat-dock`, `chat-attachments`, `stream-connection`, `rentee-request*` | yes |
| `accept` | `ACCEPT` | `/deal-room/[id]` (accepted state), quotation link | `quotation-*`, `deal-room-quotation*` | yes |
| `compare` | `COMPARE` | comparison workspace | `comparison`, `quick-compare`, `workspace`, `workspace-export` | no |
| `off` | `OFF` | `api/me/surveys/*` | `survey`, `survey-routes` (both test the DISABLED state) | no |

Cross-cutting specs that any module may pull in: `rental-pricing`, `vat-inclusive`, `charged-days`, `cycle-totals`, `labels`, `provenance`, `gates`.

### Aliases

`bids` ⇒ `bid-in` + `bid-view`. `verification` ⇒ `company`. `negotiation` ⇒ `deal-room`. `quotation` ⇒ `accept`. `agent` ⇒ `create`.
