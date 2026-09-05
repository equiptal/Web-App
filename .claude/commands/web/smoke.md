---
description: Post-deploy smoke + regression check. Verifies the deployed build is alive and that the money, the contracts and the critical renter journeys still behave. Reports pass/fail per check; fixes nothing without approval.
---

# /web:smoke — Post-deploy smoke & regression

You are verifying a **deployment that has already happened**. The question is not "does the code compile" — it is "is the thing that is now serving real users correct, and did this deploy break something that used to work".

Two halves, always in this order. Do not skip the first because the second is more interesting.

1. **Smoke** — is the deployed build up, serving, and wired to the right backend? Fast, shallow, against the live URL.
2. **Regression** — do the invariants that have broken before still hold? Deeper, mostly local, driven by what this deploy actually changed.

A green local test suite is **not** a passing smoke test. The suite ran against the source; smoke runs against what shipped.

## Arguments

`$ARGUMENTS` selects the target. Default = **prod**.

| Arg | Target |
| --- | --- |
| (empty) / `prod` | The production deployment |
| `staging` | The staging deployment |
| `<url>` | An explicit deployment URL (preview builds, a PR deploy) |
| `--quick` | Smoke only, skip the regression half |
| `--since <ref>` | Scope the regression half to what changed since `<ref>` (default: the previous deploy's merge commit) |

If you do not know the target URL, **ask once** and then write it into this file's table below so the next run does not ask again.

| Environment | URL |
| --- | --- |
| prod | https://web.moedatech.net |
| staging | https://webstaging.moedatech.net |

## Part 1 — Smoke

Run these against the deployed URL, not localhost. Use the Chrome tools (`mcp__claude-in-chrome__*`) for anything that needs a rendered page; use plain HTTP for the rest.

**S1 · The build that shipped is the build you merged.** Fetch the site and confirm it responds 200. Check the deployment actually picked up the merge — a deploy that silently reused a cached build is the single most common false "it's fine".

**S2 · No console errors on first paint.** Load the home route, read the console (`read_console_messages`). Hydration errors, missing chunks and CSP violations all surface here and all mean a broken deploy even when the HTML renders.

**S3 · The critical routes render.** Walk them, confirming each paints its real content and not an error boundary or an empty state that should have data:
   - `/requests` — the renter's request list
   - `/requests/[id]` — one request with its bids
   - `/compare` — the comparison workspace
   - `/deal-room/[id]` — a live room
   - `/bid/[token]` — the **public** supplier bid form (no auth; the surface outside users hit)

**S4 · The API layer answers.** Confirm the app's own routes reach the backend rather than 500ing — `/api/me/requests` and one deal-room read. A frontend that renders with an empty store looks identical to a healthy one until someone tries to work.

**S5 · Auth still gates.** One authenticated route while signed out must redirect, not render. A deploy that loosens a middleware matcher exposes data silently.

Stop and report immediately if S1 or S2 fails — everything after it is noise.

## Part 2 — Regression

Pick the checks from **what this deploy changed** (`git log <previous-deploy>..HEAD`). Always run R1 and R2; add the rest by relevance.

**R1 · The suite, on the deployed ref.** `npx vitest run` at the merge commit. Not the branch you were working on — the thing that shipped.

**R2 · Typecheck.** `npx tsc --noEmit`. Cheap, and catches a bad merge resolution that tests miss.

**R3 · The money.** This repo's most-broken invariant, by a distance. Whenever a deploy touches pricing, quotations, the deal room or the comparison, verify by hand that **one bid shows the same total on every surface**:
   - the bid card (`/requests/[id]`)
   - the comparison workspace
   - the deal-room price bar
   - the counter/accept sheet
   - the exported quotation (both the group and single-request downloads)
   - the supplier's own `/bid/[token]` form

   They have disagreed four ways at once before. The rules they must all follow live in `src/lib/pricing/rental.ts` — six-day week, 26-day month, Fridays excluded, both duration ends counted, transport legs flat per unit and uncapped, VAT 15%. Any surface that computes its own is a bug regardless of whether its answer is right today.

**R4 · App parity.** The mobile app (`../Moedatech-App/apps/mobile`) and the backend (`../Moedatech-App/apps/backend`) are the authority, in that order of proximity — but the **backend** wins outright, since both clients price against it. When a web number differs from the app's, check the backend before assuming the web is wrong. Read the real source; do not trust a code comment describing another repo's behaviour, which is exactly how the duration off-by-one survived.

**R5 · Contract drift.** For anything the deploy touched in `src/lib/contract/`, confirm the fields it reads are the fields the backend sends. A tolerant mapper turns a renamed field into a silent zero.

**R6 · What the deploy deliberately left out.** Backports drop hunks that don't apply to prod. Re-read the merge and confirm each omission was intentional and is recorded — an accidentally-dropped hunk looks exactly like a deliberate one a week later.

## Reporting

One line per check, `✅` / `❌` / `⚠️`, with the observed value on anything numeric. No prose padding.

Then, in order:
1. **Broken by this deploy** — regressions. These are rollback candidates; say so.
2. **Broken before this deploy** — pre-existing, found along the way. Not a rollback reason.
3. **Not verified** — anything you could not check, and why. Never let an unrun check read as a pass.

End with an explicit verdict: **safe / watch / roll back**. If you cannot justify one, say that instead of picking the comfortable option.

## Rules

- Read-only by default. Report findings; **fix nothing without approval**.
- Never smoke-test by mutating production data. No test bids, no test requests, no deleting anything. If a check needs write access, describe it and hand it to the user.
- Do not trigger browser dialogs (`alert`/`confirm`) — they freeze the extension for the rest of the session.
- If the environment fights you (build hangs, locked files, a concurrent session in the same worktree), say so plainly and report what you did and did not verify. A blocked check is a `⚠️`, never a `✅`.
