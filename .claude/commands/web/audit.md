---
description: Run every mechanical check (typecheck, lint, tests, build) then sweep the code for logic errors, contract mismatches, and inconsistencies. Reports findings; fixes nothing without approval.
---

# /web:audit — Full-code health audit

You are auditing the **Moedatech renter web app** (`D:\Web-App`, Next.js 15 App Router + TypeScript + vitest) for logic errors, bugs, and inconsistencies.

Two halves, always in this order:

1. **Mechanical gates** — the tooling finds what tooling can find (types, lint, tests, build).
2. **Semantic sweep** — you find what tooling cannot: wrong logic that compiles, contract drift between layers, and inconsistencies between parallel code paths.

A green test suite is **not** a passing audit. Half the real bugs in this repo type-check and pass tests.

## Arguments

`$ARGUMENTS` selects scope. Default (empty) = **full repo**.

| Arg | Scope |
|---|---|
| *(empty)* | Everything — all gates + full semantic sweep |
| `diff` | Only code changed vs `origin/staging` (`git diff --name-only origin/staging...HEAD`) — fast pre-PR check |
| `<path>` | Scope the sweep to a path (e.g. `/web:audit src/components/deal-room`) — gates still run repo-wide |
| `gates` | Mechanical gates only, skip the semantic sweep |
| `deep` | Full sweep, and spawn parallel `Explore` agents per hazard class in Step 5 instead of grepping serially |

Echo the resolved scope in one line before starting.

---

## Step 1 — Typecheck

```bash
npm run typecheck
```

Clean output = pass. Any error is a **blocking** finding — report the file:line and the actual message, never a paraphrase.

## Step 2 — Lint

```bash
npm run lint
```

This repo's baseline is **warnings-only** (fonts, `<img>`, and a few `react-hooks/exhaustive-deps` in `src/app/bid/[token]/page.tsx` and `src/app/layout.tsx`). Treat that baseline as known.

Do **not** dismiss the whole warning list as noise. `react-hooks/exhaustive-deps` is the one rule here that flags genuine stale-closure bugs — for each such warning, open the hook and decide whether the missing dep actually causes a stale value to be rendered. If it does, that is a real logic finding, not a lint nit. Any *new* error (not warning) is blocking.

## Step 3 — Unit tests

```bash
npm test
```

(26 files / ~280 tests, runs in seconds. `npx vitest run tests/unit/<file>.test.ts` to isolate one.)

**Every failure must be triaged into exactly one of two buckets — this is the most important judgment in the whole command:**

- **CODE BUG** — the test encodes correct intended behavior and the implementation broke it. Fix the implementation.
- **STALE TEST** — the implementation changed deliberately and the test/fixture was never updated. Fix the test.

To tell them apart, do not guess from the assertion text. Check `git log -p -- <impl-file>` for a commit that intentionally changed the behavior, and read the implementation's own comments — this codebase documents deliberate parity decisions inline (e.g. "app parity: v3_bid_card `_liveRentalUnits`"). A shared test fixture that hardcodes a field the test then forgets to override is the classic stale-fixture shape here.

**Never edit a test just to make it green.** If you cannot prove which bucket a failure belongs to, report it as `UNRESOLVED` and ask.

If the run dies with `ENOSPC` or "Jest worker exceeding retry limit", that is not a code problem — the `C:` drive is full (it runs close to the line on this machine). Clear `%TEMP%`, npm cache, and the recycle bin, then re-run.

## Step 4 — Build

```bash
npm run build
```

Run this via the **Bash** tool, not PowerShell — the script is `NODE_OPTIONS=--no-experimental-webstorage next build`, POSIX env-prefix syntax that cmd.exe cannot parse.

The build catches what `tsc --noEmit` misses: server/client boundary violations, bad `use client` placement, invalid route exports, and prerender-time crashes in Server Components. Skip only for `/web:audit gates` on a tight loop.

## Step 5 — Semantic sweep

This is the part that finds the bugs. Work the hazard classes below — they are this repo's *actual* recurring defect patterns, not generic advice. For each one, grep the named surface, read the hits, and decide whether the invariant holds.

Skip a class only if the resolved scope provably excludes it.

1. **BFF envelope unwrapping.** `withAuthedBackend`'s `call()` already unwraps `{success, data, meta}` down to `body.data`. So a paginated response's `meta.total` is **gone** before the route handler sees it. Any route in `src/app/api/**` that reads `raw.data` or `raw.meta` after an authed call is reading `undefined`. Build list responses from the array itself. (This shipped broken once — the notifications bell.)

2. **Pagination caps silently truncating.** Backend list endpoints default to ~20 newest and drop the total. Any UI that filters client-side over a capped fetch will silently hide older records. Look for single-page fetches feeding a filter/compare view; the fix pattern is a `fetchAll*()` pager (see `fetchAllMyRequests()`).

3. **Contract mapper field drops.** `src/lib/contract/*.ts` maps backend payloads to view models. A field the backend returns but the mapper omits is invisible until someone asks where it went (this is how `groupRef` went missing). Diff each mapper against the shape its route actually receives; flag silently-dropped fields.

4. **Middleware gating public pages.** `middleware.ts` gates *every* page. Any genuinely account-less route (e.g. `/bid/<token>`) must be listed in `PUBLIC_PREFIXES` or it 307s to `/login`. Cross-check every page under `src/app` that is meant to work without a session.

5. **Money math parity.** `computeBidQuote` in `src/lib/contract/comparison.ts` is the single source of quote math, shared by the comparison matrix and the quotation render. Verify no component recomputes price, VAT (15%), or mob/demob totals inline with its own arithmetic — a second copy will drift. Check unit resolution precedence (`agreedUnits` → `currentRentalUnits` → `unitsOffered` → `numberOfUnits`) is not re-implemented differently anywhere.

6. **Verified-badge source.** "Verified" is canonically `supplierStatus === 2`, **not** `isVerified` — they are independent columns. Flag every badge/pill deriving verification from `isVerified`.

7. **i18n key parity.** `src/lib/i18n/en.ts` and `ar.ts` must have identical key sets. A key in one but not the other renders raw or blank for that locale. Compare the two key lists mechanically and report the symmetric difference.

8. **Route handler consistency.** Across `src/app/api/**`: does each handler validate input, forward the auth token, and return the same error envelope shape as its siblings? An outlier handler is usually an outlier bug. Note any handler missing auth forwarding entirely.

9. **Access gates.** `src/lib/access/dashboard.ts` and `start-request-gate.ts` decide what a user may reach. Check the gate conditions against the states they claim to cover, especially the default/fallthrough branch — a gate that defaults to *open* is a security finding, and one that defaults to *closed* on unknown state is a lockout bug.

10. **Cross-path inconsistency.** Where the same concept renders in two places (bid card ↔ deal room ↔ request detail; group bids ↔ single bids), confirm they agree on status derivation, empty states, and date/currency formatting. Divergence here is the most common "the web doesn't match the app" complaint.

For `deep`, fan these out as parallel `Explore` agents (one per class, ~3 classes per agent) and merge their reports. Otherwise work them serially with `Grep`/`Read`.

## Step 6 — Verify before reporting

For every candidate finding, prove it before it reaches the report:

- Name the concrete failure: **inputs/state → wrong output**. If you cannot write that sentence, it is a hunch — drop it or label it `PLAUSIBLE`.
- Confirm the code path is actually reachable (not dead code, not behind a disabled flag — check `docs/surveys-disabled.md` and `src/lib/config/env.ts` for intentionally-off features).
- Re-read the surrounding code for a guard you may have missed upstream.

Discard anything you cannot substantiate. A short verified list beats a long speculative one — false findings cost more than missed ones here, because they burn trust in the whole audit.

## Step 7 — Report: discuss every finding, one at a time

The report is the deliverable, and **its job is to be understood** — not to prove the audit was thorough. A finding I cannot explain in plain language is a finding I have not really understood myself.

### 7a — The scoreboard (short)

```
## Audit: <scope>

Typecheck: <clean | N errors>
Lint:      <baseline warnings only | N new errors>
Tests:     <N passed / M failed>  (<X code bugs, Y stale tests, Z unresolved>)
Build:     <pass | fail | skipped>

Found <N> things worth discussing, worst first.
```

### 7b — One section per finding (the main event)

Walk through **every** finding individually, worst first, in this exact shape. Never merge two findings into one section, and never replace a section with a table row — each one gets its own discussion.

```
### <N>. <plain-language title — what's wrong, in everyday words>

**Severity:** <Critical | High | Medium | Low> — <half a sentence on why that level>
**Where:** `<path:line>`
**Confidence:** <Certain | Likely — and what would settle it>

**What this is.** Two or three sentences, in plain English, explaining the thing
itself as if to someone who knows the product well but not this code. Define every
technical term the first time it appears.

**What goes wrong in practice.** A concrete story with a real actor: who does what,
and what they see or lose. Name actual screens, buttons, or accounts — not "the
client" or "the consumer".

**Why it's happening.** The underlying cause in one short paragraph. If the code was
deliberately written this way and the problem is that the world changed around it,
say so plainly — that changes how you'd fix it.

**What I'd do.** The fix in two or three sentences of plain description, and a
one-line note on anything it might disturb. No code unless a single line genuinely
says it best.

**Does it need a decision from you?** <No — mechanical fix | Yes — and the exact
question, with the options and which one I'd pick>
```

Plain-language rules for these sections, non-negotiable:

- **Spell out jargon on first use.** Not "the BFF drops `meta`" but "our own `/api` routes — the thin server layer between the browser and the real backend — throw away the page-count information". Never leave a bare acronym, `camelCaseIdentifier`, or HTTP status code standing in for an explanation.
- **Lead with the consequence, not the mechanism.** "Anyone can delete another company's account without logging in" comes before any discussion of cookies.
- **Quantify the blast radius** — how many routes, screens, or accounts, and whether it affects prod, staging, or only local.
- **Separate "is broken" from "reads as broken."** A stale comment and a live security hole must never be described in the same register. Say explicitly when something is a documentation defect with no behaviour change.
- **No finding without a named victim and a named loss.** If you can't say who is harmed and how, it belongs in a closing "minor notes" line, not a numbered section.

### 7c — Close

After the sections, add:

- **If you only fix one thing:** `<the single highest-value fix, one line>`
- **What I did not check:** any hazard class swept only partially, stated plainly.
- Anything needing a decision or an external check you cannot perform (an Amplify variable, a backend deploy, a PM call), as a short list.

Then also file the findings with the **`ReportFindings`** tool — most severe first, each with `file`, `line`, `summary`, `failure_scenario`, `category`, `verdict` (`CONFIRMED` | `PLAUSIBLE`) — so they show up in the host UI. The tool call is the *machine* record; the Step 7b sections are the *human* one, and 7b is never skipped in favour of the tool call. Pass an empty array if nothing survived verification — do not pad.

Finally ask exactly:

> Want me to fix these? Reply **`fix all`**, **`fix <numbers>`**, or **`more on <number>`** to go deeper on one.

**Write no code until I answer.**

## Step 8 — Fix (only after approval)

For each approved finding: make the change, add or repair a regression test that fails before the fix and passes after, then re-run `npm test` plus `npm run typecheck`. Report what changed as `path:line — what changed`.

If a fix turns out bigger than the audit implied, stop and re-report rather than expanding scope silently.

---

## Guardrails

- **Never fix without approval.** Step 7 → Step 8 is a hard stop, every run.
- **Never commit or push.** Working tree only, no PRs, no branch moves — even after a clean audit.
- **Never green a test by weakening it.** Deleting an assertion, loosening `toBe` to `toBeCloseTo`, or `skip`-ing a failure is forbidden unless I explicitly approve it as a stale test with a stated reason.
- **Report honestly.** If a gate was skipped, say skipped. If a hazard class was not swept, say so. Never imply coverage you did not achieve.
- **Don't restart the dev server** to verify — verify via tests, the build, or the staging deploy.
- **Don't touch prod.** Any data lookup during the audit defaults to staging; ask before a prod read.
- **Distinguish "inconsistent" from "different on purpose."** This codebase carries deliberate app-parity divergences and documented backend wrinkles (e.g. the known stale-quotation-after-reopen issue is backend-only and the web is already correctly aligned). Read the inline comments before calling something a bug.
