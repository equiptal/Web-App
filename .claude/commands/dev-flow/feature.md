---
description: Pick a Kitchen card in 'Implementing' assigned to me, generate a plan + tickets, then implement.
---

# /dev-flow:feature — Kitchen pipeline

You are running the **dev-flow feature pipeline** for the Moedatech roadmap (org `equiptal`, project number **3**, project URL https://github.com/orgs/equiptal/projects/3).

The Kitchen view filter is:
`-status:"Idea","Old issues" -card-type:"Ops request","Release tracker" -is:pr has:status`

You will mirror that filter client-side, then narrow further to **Status = "Implementing"** and **assigned to the current dev (`yfa245`)**.

The lifecycle is `Drafting → Specced → Implementing → UAT needed → … → Completed` (dev implementation interface §0). An epic reaches you **already at `Status: Implementing`** — the PM's spec-PR merge flips it there automatically and assigns it to you (interface §1). **You never move the epic tracker's Status by hand** — it is automation-driven (interface §7). You plan and build while it sits at `Implementing`.

---

## Step 1 — Discover project + field/option IDs

You **never** edit the epic's Status (automation-driven — interface §7), but you **do** create `Impl ticket` sub-issues and walk *their* `Card type` and `Status` fields, so you need those option IDs. Cache them for the run.

```bash
gh project field-list 3 --owner equiptal --format json --limit 50
gh project view 3 --owner equiptal --format json
```

From the results, extract:
- `PROJECT_ID` — `id` from `project view`
- `STATUS_FIELD_ID` — id of the field where `name == "Status"`
- `STATUS_OPT_TODO_IMPL` — option id where `name == "To do (impl)"`
- `STATUS_OPT_IMPLEMENTING` — option id where `name == "Implementing"`
- `STATUS_OPT_IN_REVIEW_IMPL` — option id where `name == "In review (impl)"`
- `CARD_TYPE_FIELD_ID` — id of the field where `name == "Card type"`
- `CARD_TYPE_OPT_IMPL_TICKET` — option id where `name == "Impl ticket"`

You still filter the epic list (Step 2) on the `Status` / `Card type` **values** in `item-list`, not these IDs. If any of the above are missing, stop and report what's missing.

## Step 2 — List eligible cards

```bash
gh project item-list 3 --owner equiptal --format json --limit 200
```

Filter the items client-side. **Keep an item only if all of these are true:**

1. `content.type == "Issue"` (not a draft, not a PR)
2. The issue is open. If `state` isn't in the item payload, fall back to `gh issue view` for verification only when you've already narrowed to the picked card.
3. `Fadwahigga` appears in the issue's assignees. (`gh project item-list` returns assignees as a comma-separated string in some versions — split on commas/whitespace and check.)
4. The item's `Status` value equals `"Implementing"`.
5. The item's `Card type` value is **not** `"Ops request"` and **not** `"Release tracker"`.
6. The item has a `Status` value at all (Kitchen requires `has:status`).

If zero items survive the filter, tell me "No Kitchen cards in Implementing are assigned to you." and stop.

## Step 3 — Ask which card to work on

Print a numbered list, one per line, in this exact form:

```
[N] <repo-without-owner>#<number> — <title>
```

Where `<repo-without-owner>` is the repo name only (e.g., `moedatech-specs` or `Moedatech-App`).

Then use `AskUserQuestion` with each surviving card as an option (cap at 4 — if there are more than 4, group/truncate or fall back to a plain prompt asking me to type the number). Wait for my pick.

## Step 4 — Confirm the card (do NOT move it)

The epic is already at `Status: Implementing` (automation set it when the spec PR merged). **Do not change the epic tracker's Status by hand** — it is automation-driven and advances only via merge automation (dev implementation interface §3, §7).

Confirm to me: `<repo>#<number> is at Implementing — proceeding to plan. (Epic Status is automation-driven; I won't move it.)`

## Step 5 — Read the card and its spec

1. Fetch the full issue:
   ```bash
   gh issue view <number> --repo equiptal/<repo> --json title,body,url,labels,comments,assignees
   ```

2. If the issue lives in `equiptal/moedatech-specs` and the title starts with `Epic:`, derive the **epic id** from the title or body. Format is `<product>/<NNN-slug>` (e.g., `mobile/005-broadcast-equipment-step2`).

3. Pull every spec file in that epic directory:
   ```bash
   for f in brief.md core-flows.md acceptance.md dependencies.md changelog.md; do
     gh api "repos/equiptal/moedatech-specs/contents/products/<product>/epics/<NNN-slug>/$f" --jq '.content' | base64 -d
   done
   ```
   If any file 404s, note it and proceed with what you have.

4. If the issue is in `Moedatech-App` (rare for Kitchen, but possible), use its body as the spec.

**Do not invent acceptance criteria.** If something needed for implementation isn't covered by `acceptance.md`, surface it under "Open questions" in the plan — never silently fill in.

## Step 6 — Cut the epic branch, then generate the implementation plan

First, **cut the epic branch** — interface §2's one-branch-per-epic + one-final-PR model, but cut off **`staging`** (the team's integration branch), not `main`:

```bash
git checkout staging && git pull
git checkout -b <product>/<NNN-slug>   # the spec branch name without the `spec/` prefix
```

Name it exactly the epic ID `<product>/<NNN-slug>` (e.g. spec branch `spec/mobile/016-foo` → your branch `mobile/016-foo`). **All** impl tickets for this epic land on this **one** branch and ship in **one** final PR — never a branch or PR per ticket. The `plan.md` / `tickets.md` docs you write below are committed here too. If the card isn't an epic tracker (no derivable epic id), branch off `staging` named for the `<card-id>` instead.

Compute `<card-id>` as `<repo>-<number>` (e.g., `moedatech-specs-47`).

Create directory `docs/implementation-plans/<card-id>/` (use `mkdir -p`).

Write `docs/implementation-plans/<card-id>/plan.md` with this template — fill every section, leave headers in place even if a section is empty:

```markdown
# Implementation Plan — <Title>

**Card:** <issue url>
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/<product>/epics/<NNN-slug>/  (omit if not an epic tracker)
**Card id:** <card-id>
**Generated:** <today's date YYYY-MM-DD>

## Summary
<one paragraph: what we're building and why, derived from brief.md + the issue body>

## Acceptance criteria covered
<bulleted list of AC IDs from acceptance.md, each followed by the AC text verbatim — no paraphrasing>

## Architecture overview
<high-level approach: components touched, data flow>

## Backend — admin
<endpoints, services, schema/migrations affecting the admin panel surface>

## Backend — mobile
<same, but for the mobile app surface>

## Backend — mobile
<same, but for the web app surface>

## API integration
<contract changes, integration points, breaking-change notes, versioning>

## Data model / migrations
<tables, columns, migrations needed; "none" if N/A>

## Risks & dependencies
<from dependencies.md + anything you discovered>

## Open questions
<list any ambiguity in the spec or unknown that affects implementation. Each item: status emoji + Q-id + AC reference + the unanswered question + (optional) Action. Status legend: 🔴 blocks ticket creation, 🟡 doesn't block tickets but blocks shipping/UAT, ✅ resolved. Do NOT guess answers — Step 8 will walk this list and resolve what it can before tickets are written.>

## Out of scope
<items the spec excludes or defers>
```

Tell me: `Plan written to docs/implementation-plans/<card-id>/plan.md.`

## Step 7 — Pause for plan review

Ask exactly:

> Plan ready. Reply **`reviewed`** when ready to generate tickets, or tell me what to change.

Wait for my reply.
- If I describe changes, edit `plan.md` and re-pause with the same prompt.
- If I say `reviewed`, continue to **Step 8 (Resolve open questions)** — do NOT skip ahead to ticket generation. Step 8 will walk the plan's Open questions and resolve / decide / raise `[SPEC?]` before any tickets are written.

## Step 8 — Resolve open questions before tickets

Once I say `reviewed`, do **not** jump straight to tickets. Walk every item in the plan's **Open questions** section first. The goal: every question lands as 🔴 / 🟡 / ✅ before tickets are written, and you (the agent) handle as many of them as possible without bouncing them back to me.

For each question, classify it and act:

| Type | What you do |
|---|---|
| **Dev-resolvable** — answerable from the codebase, git history, project board, or a read-only DB query | Execute the resolution yourself. Update the plan: change status to ✅ and embed the finding (numbers, paths, samples) inline. |
| **Decision required from me** — sink choice, library choice, scope call between alternatives, naming | Ask me directly (`AskUserQuestion` if 2-4 options, plain prompt otherwise). Update the plan with my answer. |
| **Spec ambiguity / contradicts existing data / silent on a needed behavior** | Raise the **`[SPEC?]` signal** (see below) — the one way to ask the spec side anything. Do **not** classify it. Show me the comment text first; on approval, post it and apply the `spec-input-needed` label. Add the comment URL to the plan, state the working assumption explicitly, downgrade the question to 🟡. |

**The `[SPEC?]` signal (dev implementation interface §6) — the one and only way to ask the spec side anything (question, ambiguity, or a change that would differ from the spec):**

- Post **one** comment prefixed `[SPEC?]` stating plainly what you need and why. Put it on the **impl issue** if one exists; before impl tickets exist (i.e. at this step), post it on the **epic tracker**.
- `@`-mention **the GitHub user who opened the epic tracker** (that person owns the spec and triages your signal). If the tracker was opened by a bot, or the work isn't under an epic, fall back to `@awabmoedaetch`.
- Apply the **`spec-input-needed`** label.
- **Do not classify it** (don't decide whether it's a clarification vs. a spec change — that's the PM's job). **Do not edit `moedatech-specs`** and **do not file a separate `spec-feedback` issue** — the `[SPEC?]` comment replaces that.
- If you **can't write the code without the answer**, hard-stop that ticket and wait. If you **can proceed on a reasonable assumption**, do so but **state the assumption explicitly in the `[SPEC?]` comment**.
| **PM / process question** — release tracker number, editorial list to confirm with PM, sequencing | Mark 🟡 (doesn't block tickets; blocks shipping or UAT). Note the action item. Don't pause for it. |

Status legend (use these emoji throughout the plan):
- 🔴 blocks ticket creation — must resolve before Step 9.
- 🟡 doesn't block tickets, but blocks shipping or UAT.
- ✅ resolved by investigation or my reply.

Common dev-resolvable patterns — try these before asking me:

- **"Is column X populated?"** → tiny ts-node script using `prisma.$queryRawUnsafe` against the appropriate `.env.{dev,staging}` DATABASE_URL. **SELECT only**; never INSERT/UPDATE/DELETE during this step.
- **"Does file X exist?"** → `find`, `git log --all --diff-filter=A`, branch listing.
- **"What does dependency Y look like in code?"** → `Grep` / `Read`.
- **"Is the API contract for Z documented?"** → search `packages/shared`, `docs/`, `posthog-events.md`, etc.

After walking the list, give me a concise rollup in this exact shape:

```
Open questions resolution:
- Q1: 🟡 deferred — needs PM (Awab)
- Q2: ✅ resolved by audit — <one-line finding>
- Q3: ✅ resolved by repo search — <one-line finding>
- Q4: 🔴 needs your call — <options>
- Q5: 🟡 deferred — process
- Q6: 🟡 raised `[SPEC?]` on <impl-issue-or-epic-tracker URL>, working assumption: <X>
```

Then check the rollup. **Do not auto-continue if any item is non-✅.** Only continue to Step 9 silently when every item is ✅.

If ANY item is 🔴 or 🟡, pause and present my options. For each non-✅ item, ask me via `AskUserQuestion` (cap of 4 questions per round — if there are more than 4 non-✅ items, do multiple rounds, in order: 🔴 first, then 🟡).

**For 🔴 items (block ticket creation), the options are:**

- **Answer now** — I'll provide the decision in my next reply; you fold it into the plan and re-classify to ✅.
- **Proceed under assumption** — I'll provide the assumption; you generate tickets with `**⚠ Pending:** Q<N>` markers under affected ticket Descriptions and a `## Pending decisions` section at the top of `tickets.md`.
- **Raise `[SPEC?]`** — only if the question is spec-flavored; you draft the comment, show me, post with my approval + `spec-input-needed` label, then re-classify the question as 🟡 with a working assumption.
- **Hold pipeline** — stop here; no tickets generated. I'll resolve and re-run `/dev-flow:feature`.

**For 🟡 items (don't block tickets but block shipping/UAT), the options are:**

- **Resolve now** — try harder: re-run audit, ask me to chase the PM, or fetch fresh data. Describe what you'll do before doing it.
- **Raise `[SPEC?]`** — only if spec-flavored; draft, show, post with my approval + `spec-input-needed` label.
- **Accept and proceed** — keep as 🟡 in the plan; you'll generate tickets and surface this item again at Step 13 (per-AC check) and Step 14 (final summary) so I know to chase it before shipping.
- **Hold pipeline** — stop here; don't generate tickets until I've resolved this 🟡.

After each round of answers, fold the answers into `plan.md` (update statuses, embed answers, link `[SPEC?]` comment URLs) before asking the next round.

When all rounds are done:
- **If any answer was "Hold pipeline"** — stop the pipeline. Tell me exactly: `Pipeline held at Step 8 by your instruction on <Q-id>. Re-run /dev-flow:feature when ready, and pick this card again.` Do not generate tickets.
- **Otherwise** — continue to Step 9. Carry forward any remaining 🟡 items into `plan.md`.

## Step 9 — Generate tickets

Write `docs/implementation-plans/<card-id>/tickets.md` with this structure. Each ticket lists scope, AC IDs satisfied, and Given/When/Then test cases — language mirrors `acceptance.md` so the third-party tester can write tests directly:

```markdown
# Tickets — <Title>

Card: <issue url>
Plan: ./plan.md

Tickets are grouped by scope. Implement in the order listed (top to bottom).

## Backend — admin

### T1 — <ticket title>
**Scope:** backend-admin
**ACs:** <AC1>, <AC2>
**Description:**
<what changes, where in the codebase>

**Given/When/Then:**
- Given <state>
- When <action>
- Then <expected>

### T2 — ...

## Backend — mobile

### T3 — ...

## API integration

### T4 — ...
```

If the plan implies no work in one of the three scopes, still keep the heading and write `_No tickets in this scope._` underneath.

Tell me: `Tickets written to docs/implementation-plans/<card-id>/tickets.md.`

## Step 10 — Pause for ticket review

Ask exactly:

> Tickets ready. Reply **`tickets reviewed`** to begin implementation, or tell me what to change.

Wait. Edit if asked.

## Step 11 — Implement

Once I say `tickets reviewed`:

**1. Create one `Impl ticket` sub-issue per ticket** (interface §3). `tickets.md` stays your working doc; these issues are its mirror on the board so the spec side can see progress. For each ticket in `tickets.md`, in order:

   a. Create the issue in this repo (don't set the native GitHub Type — typing is via the project `Card type` field, interface §7):
   ```bash
   gh issue create --repo equiptal/Moedatech-App \
     --title "<ticket id> — <ticket title>" \
     --body "Part of <epic tracker url>. Scope: <scope>. ACs: <AC ids>.

   <the ticket's Description + Given/When/Then, copied from tickets.md>"
   ```
   Capture the new issue's **number** and **node/database id** (`gh issue view <n> --json number,id`).

   b. Add it to the project and set its fields:
   ```bash
   gh project item-add 3 --owner equiptal --url <new issue url>
   # then, using the returned item id ($IMPL_ITEM_ID):
   gh project item-edit --project-id "$PROJECT_ID" --id "$IMPL_ITEM_ID" \
     --field-id "$CARD_TYPE_FIELD_ID" --single-select-option-id "$CARD_TYPE_OPT_IMPL_TICKET"
   gh project item-edit --project-id "$PROJECT_ID" --id "$IMPL_ITEM_ID" \
     --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPT_TODO_IMPL"
   ```

   c. Attach it as a **sub-issue of the epic tracker** (cross-repo is fine — the tracker lives in `moedatech-specs`). **This is a hard requirement, not optional.** The `Part of <epic tracker url>` line you put in the body (step a) is human-readable context only — it does **not** create the sub-issue relationship the board automation reads. A ticket that is only text-linked is an **orphan**: the reconciler and the "all impl tickets done → UAT" automation are blind to it (this is exactly what happened to T16/#273 on epic `shared/004`).

   Use the impl issue's **REST database id** (the integer `id` from `gh api repos/equiptal/Moedatech-App/issues/<n> --jq .id`), **not** the GraphQL node id — the sub-issues API rejects the node id:
   ```bash
   gh api --method POST repos/equiptal/moedatech-specs/issues/<epic_tracker_number>/sub_issues \
     -f sub_issue_id=<impl issue's database id>
   ```

   **Then verify the link landed** — don't trust the POST's exit code alone. Read the tracker's children back and confirm this ticket is among them:
   ```bash
   gh api repos/equiptal/moedatech-specs/issues/<epic_tracker_number>/sub_issues \
     --jq '[.[].number]'   # the new impl issue's number MUST appear in this list
   ```
   If the new ticket's number is **not** in that list, the attachment silently failed — **stop, do not create the next ticket**, and report it to me with the impl issue number so we fix the orphan before continuing. Never leave a ticket behind that's only referenced in body text.

   Record each ticket's impl-issue number next to it in `tickets.md` (e.g. `### T1 — … (#1234)`) so the ship PR can `Closes` them later.

**2.** Use `TaskCreate` to create one task per ticket, in the listed order.

**3. Implement the tickets one by one.** For each:
   - Set its sub-issue `Status: Implementing` (`$STATUS_OPT_IMPLEMENTING`); mark the task in_progress.
   - Do the work, run relevant tests. Reference the ticket id and AC ids in commit messages.
   - When the build is done and you've reviewed it, set the sub-issue `Status: In review (impl)` (`$STATUS_OPT_IN_REVIEW_IMPL`); mark the task completed.

**4. Never touch the epic tracker's Status** — it stays at `Implementing` the whole time; you only move the *tickets* through the three sub-stages (interface §3). Automation advances the epic `Implementing → UAT needed` on PR merge.

**5.** The ship PR (later) carries **`Closes #<impl-ticket>` for every impl ticket** and **`Part of equiptal/moedatech-specs#<epic>`** for the epic — **never `Closes` the epic** (interface §4, §7). Don't move the card to UAT yourself.

**6.** When all tickets are `In review (impl)`, tell me: `Implementation complete. Reply `check ac` to verify acceptance criteria against the implementation.`

## Step 12 — Pause for AC check

Wait for me to reply `check ac`. Don't proceed until I do. (If I reply with anything else, address it and re-pause with the same prompt.)

## Step 13 — Verify ACs against the implementation

Re-read the AC list from `acceptance.md` (use the cached content from Step 5 — don't re-fetch unless I tell you the spec changed) and the issue body if it contains AC-shaped requirements not covered there.

For **each AC id**, audit the actual implementation:
- Locate the code that satisfies it (use `Grep`/`Read` — don't trust your memory of what you wrote).
- Locate the test that exercises it, if any.
- Decide a verdict: **Met** / **Partial** / **Not met** / **Out of scope** (if the AC is explicitly deferred per the plan's "Out of scope").

Write the audit to `docs/implementation-plans/<card-id>/ac-check.md` in this exact shape:

```markdown
# AC Verification — <Title>

**Card:** <issue url>
**Audited:** <YYYY-MM-DD>
**Branch:** <git branch name>
**HEAD:** <short SHA>

## Summary
- Met: <count>
- Partial: <count>
- Not met: <count>
- Out of scope: <count>

## Per-AC findings

### <AC-ID> — <one-line AC label>
**AC text (verbatim):**
> <copied from acceptance.md, no paraphrasing>

**Verdict:** Met | Partial | Not met | Out of scope

**Evidence:**
- Implementation: `<path:line-range>` — <one-line what this code does>
- Test: `<path:line-range>` (`<test name>`) — <pass/fail>

**Notes:** <only if Partial / Not met / Out of scope — explain the gap>

**Pending question:** <only if a 🟡 item in plan.md's Open questions references this AC id — list as `Q<N> — <action>`. Otherwise omit this line.>

---

### <next AC-ID> — ...
```

After writing the file, also print a compact one-line-per-AC summary to chat so I can scan it without opening the file:

```
AC-001  ✓ Met       src/foo.ts:42-67  test/foo.spec.ts:12
AC-002  ⚠ Partial   src/bar.ts:88     — missing locale fallback
AC-003  ✗ Not met   —                 — no code touches this path
AC-004  · Out of scope (per plan)
```

Then ask exactly:

> AC check written to docs/implementation-plans/<card-id>/ac-check.md.
> Verdicts: <N met / N partial / N not met / N OOS>.
> Reply with what to do next: fix gaps, accept and ship, or revise an AC interpretation.

Wait for my call. **Do not** auto-fix Partial/Not-met ACs without me confirming — Partial often means the AC was misread, not that more code is needed.

## Step 14 — Final summary

Once I tell you to wrap up:
- Recap what shipped (files touched, tests added).
- List any AC still flagged Partial/Not-met that I accepted to defer — and remind me to file follow-up issues for them.
- **Re-read `plan.md` Open questions section. List every still-🟡 item under a `## Pending before ship` heading**, with the action required for each (e.g., "Q1 🟡 — Awab to confirm editorial default category list", "Q6 🟡 — awaiting `[SPEC?]` reply on <impl-issue-or-epic-tracker URL>"). These block shipping or UAT — I need to chase them before opening the ship PR.
- Remind me to open the **one** ship PR for the epic branch **into `staging`** (`gh pr create --base staging`) with, in the body: **`Closes #<impl-ticket>` for every impl ticket** (so they auto-close on merge) **and `Part of equiptal/moedatech-specs#<number>`** for the epic (reference only). **Never `Closes` the epic tracker** (interface §4, §7) — the epic stays open and closes on the spec side at `Completed`. On merge into `staging`, automation advances the epic to `UAT needed`.
- **The UAT report is opened automatically — verify it landed, don't open it.** When the ship PR merges and the epic flips to `UAT needed`, the **UAT-report reconciler** (a GitHub Action in `moedatech-specs`, cron every ~30 min, idempotent) opens the `uat-report` sub-issue (`Card type: UAT report`, `Status: UAT needed`, assignee `yfa245`) with the AC checklist from `acceptance.md`. **You don't open it** (that's the spec side — `workflows/uat.md`) and you no longer ask the PM to open it by hand. The May-2026 failure mode (epic at `UAT needed`, no report, shipped with ACs failing) is what the reconciler now prevents. Your job is just to **confirm it landed**: after merge, check the epic tracker's sub-issues for a `uat-report` child. If one is there → note it in this summary and stop. If it's still missing after ~30 min (reconciler not yet wired, or its run failed), fall back to the old handoff — post a one-line comment on the **epic tracker** `@`-mentioning the tracker's author (else `@awabmoedaetch`): _"Implementation merged to staging; epic is at UAT needed but no `uat-report` sub-issue opened yet — please open it / check the reconciler, then run the AC walk (`acceptance.md`)."_ Show me the comment text first; post on my approval. Either way, surface the report's state as an explicit action item so it isn't dropped.
- Stop. Do not move the project card.

## Guardrails

- Never invent acceptance criteria. If a behavior isn't in `acceptance.md`, it isn't part of this epic.
- If ambiguity surfaces during implementation (after Step 9), stop and surface it via the **`[SPEC?]` signal** (see Step 8): draft the comment, show me, post with my approval + `spec-input-needed` label, `@`-mentioning the epic tracker's author. Don't reinterpret an AC silently, and don't file a separate `spec-feedback` issue — `[SPEC?]` is the one signal (interface §6).
- The plan and tickets files are committed to the repo (per the dev-flow choice to store them under `docs/`). Stage them in the implementation PR.
- Don't mock external services in tests if the AC implies a real integration path — see `CLAUDE.md`.
