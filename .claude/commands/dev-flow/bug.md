---
description: Pick a Bugs & Support card assigned to me, diagnose, generate a plan + tickets, then implement.
---

# /dev-flow:bug — Bugs & Support pipeline

You are running the **dev-flow bug/support pipeline** for the Moedatech roadmap (org `equiptal`, project number **3**, project URL https://github.com/orgs/equiptal/projects/3).

Source = the **Bugs & Support** view on that project. You will mirror the view's intent client-side: items assigned to me whose Card type / labels mark them as bugs or support requests.

The lifecycle field is the same `Status` field used by Kitchen. Unlike an epic (whose Status is automation-driven), **you walk a bug's `Status` yourself** (dev implementation interface §5, §8).

Every bug carries an **`Environment`** field, set before it reaches you:
- **`Production`** = live, user-facing — candidate for a **hotfix**.
- **`Dev`** = caught pre-release — folds into the in-flight release; normal priority.

**You make the hotfix call** (interface §5). Two paths, decided in Step 6.5:
- **Hotfix** — set **`Assignment: Hotfix`** + apply the **`hotfix`** label; walk `Status: Drafting → Implementing → UAT needed → Ready to ship`. It **auto-closes at `Ready to ship`** (a reconciler closes `hotfix`-labelled issues at that status) — you don't close it manually.
- **Release-bound** — leave **`Assignment`** in its `Admin Backlog` / `Mobile Backlog` bucket; walk `Status` to `Ready to ship` and stop (the spec side rides it on a release).

---

## Step 1 — Discover project + status field IDs

```bash
gh project field-list 3 --owner equiptal --format json --limit 50
```

Extract (you walk a bug through several statuses, so grab every option id you'll need):
- `STATUS_FIELD_ID` — id of the field where `name == "Status"`
- `STATUS_OPT_IMPLEMENTING` — option id where `name == "Implementing"`
- `STATUS_OPT_UAT_NEEDED` — option id where `name == "UAT needed"`
- `STATUS_OPT_READY_TO_SHIP` — option id where `name == "Ready to ship"`
- `ASSIGNMENT_FIELD_ID` — id of the field where `name == "Assignment"`
- `ASSIGNMENT_OPT_HOTFIX` — option id where `name == "Hotfix"` (only needed on the hotfix path)
- `CARD_TYPE_FIELD_NAME` — exact name of the "Card type" field
- `ENVIRONMENT_FIELD_NAME` — exact name of the "Environment" field

```bash
gh project view 3 --owner equiptal --format json
```

- `PROJECT_ID` — `id` from this response

Stop and report if any are missing.

## Step 2 — List eligible bug/support cards

```bash
gh project item-list 3 --owner equiptal --format json --limit 200
```

Filter the items client-side. **Keep an item only if all of these are true:**

1. `content.type == "Issue"` (not a draft, not a PR)
2. `Fadwahigga` appears in the issue's assignees.
3. The item qualifies as a bug or support request — **any** of:
   - `Card type` value contains `"Bug"` or `"Support"` (case-insensitive substring)
   - Issue title starts with `[Bug]` or `[Support]`
   - Issue labels include `bug`, `support`, or `bugs-and-support`

If zero items survive, tell me "No Bugs & Support items are assigned to you." and stop.

## Step 3 — Ask which one to work on

Print a numbered list:

```
[N] <repo>#<number> — <title>   (<bug|support>)
```

Where the parenthesized tag is your best guess at type (bug vs support) based on the signal that matched in step 2.

Use `AskUserQuestion` (or a plain numbered prompt if more than 4) and wait for my pick.

## Step 4 — Note the status (don't move it yet)

You walk a bug's `Status` yourself (interface §5), but diagnosis and planning happen at **`Drafting`** — you don't move to `Implementing` until you actually start building (Step 12). Note the current `Status` and `Assignment` so you know the starting point. If the bug is already at `Implementing` (e.g. you're resuming), that's fine — carry on. Don't move it here.

## Step 5 — Read the card

```bash
gh issue view <number> --repo equiptal/<repo> --json title,body,url,labels,comments,assignees
```

Read the body and **all comments** — bug repros and discussion often live in comments.

Also read the item's **`Environment`** value from the `item-list` payload (or the project UI) — `Production` or `Dev`. You need it for the hotfix decision in Step 6.5. If it's unset, note that and ask me which it is before the hotfix call.

If the issue body references a spec (e.g., links to `moedatech-specs/.../acceptance.md` or names an AC id), fetch the relevant spec file via `gh api repos/equiptal/moedatech-specs/contents/...` for context — the bug may be a deviation from a documented AC, in which case the AC is the source of truth.

## Step 6 — Diagnose (bugs only)

If the item is a **bug**:

1. Identify the affected surface from the title/body (admin panel, mobile app, backend endpoint, etc.).
2. Use `Grep`/`Read` (or spawn an `Explore` agent for broader searches) to locate the relevant code in this repo. Look for:
   - The endpoint, screen, or component named in the bug
   - Recent commits that touched it (`git log -p --follow -- <path>`)
   - Existing tests covering the area
3. Form a **root-cause hypothesis** and tell me, in this exact shape, before writing a plan:

   ```
   ## Diagnosis: <repo>#<number>

   **Symptom:** <one sentence>
   **Affected files:** <path:line, ...>
   **Root cause hypothesis:** <one paragraph>
   **Confidence:** <high | medium | low — and why>
   ```

If the item is a **support request** (no bug, just a question or config ask), skip diagnosis. Briefly answer the question in chat. If it requires a code change, note that and proceed to step 7. If it doesn't, stop here and ask if I want to close/reply to the issue.

## Step 6.5 — The hotfix decision (bugs only)

**You make the call** (interface §5), using the `Environment` value from Step 5. Tell me your recommendation and confirm with `AskUserQuestion` (options: `Hotfix`, `Release-bound`):

- **`Production` + urgent / user-facing breakage → recommend Hotfix.**
- **`Dev`, or low-severity → recommend Release-bound.**

Once decided:

- **Hotfix:** set `Assignment: Hotfix` and apply the `hotfix` label:
  ```bash
  gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" \
    --field-id "$ASSIGNMENT_FIELD_ID" --single-select-option-id "$ASSIGNMENT_OPT_HOTFIX"
  gh issue edit <number> --repo equiptal/<repo> --add-label hotfix
  ```
  Remember: it will **auto-close at `Ready to ship`** — never close it by hand.
- **Release-bound:** leave `Assignment` in its `Admin Backlog` / `Mobile Backlog` bucket. Don't take its `Status` past `Ready to ship`.

Record the decision (Hotfix vs Release-bound) in `plan.md` under a `**Disposition:**` line so later steps know which path to walk.

## Step 7 — Generate the plan

Compute `<card-id>` as `<repo>-<number>`.

Create `docs/implementation-plans/<card-id>/` and write `plan.md`:

```markdown
# Implementation Plan — <Title>

**Card:** <issue url>
**Type:** <Bug | Support>
**Card id:** <card-id>
**Generated:** <YYYY-MM-DD>

## Summary
<what's wrong and what we're going to do about it>

## Diagnosis
<copy the diagnosis block from step 6 — bugs only>

## Acceptance criteria
<for bugs that contradict an AC: cite the AC id and quote it. For bugs without a documented AC: state the expected behavior in Given/When/Then form. For support requests: list the user-facing requirements.>

## Approach
<how the fix will work>

## Backend — admin
<changes; "none" if N/A>

## Backend — mobile
<changes; "none" if N/A>

## API integration
<changes; "none" if N/A>

## Regression risk
<what else could this fix break — areas to test>

## Open questions
<list any unresolved questions — ambiguous expected behavior, scope boundaries (admin too?), affected locales/users, etc. Each item: status emoji + Q-id + the question + (optional) Action. Status legend: 🔴 blocks ticket creation, 🟡 doesn't block tickets but blocks shipping/UAT, ✅ resolved. Leave the section as `_None._` for clear-cut bug fixes. Do NOT guess answers — Step 9 will walk this list.>

## Out of scope
<related issues we are NOT fixing here>
```

Tell me: `Plan written to docs/implementation-plans/<card-id>/plan.md.`

## Step 8 — Pause for plan review

Ask exactly:

> Plan ready. Reply **`reviewed`** when ready to generate tickets, or tell me what to change.

Wait. Edit if asked. If I describe a different root cause or scope, update the plan accordingly. If I say `reviewed`, continue to **Step 9 (Resolve open questions)** — do NOT skip ahead to ticket generation.

## Step 9 — Resolve open questions before tickets

Bugs typically have fewer open questions than features, but the same gate applies. Once I say `reviewed`, walk every item in the plan's **Open questions** section. If the section is empty or `_None._`, skip straight to Step 10.

For each question, classify it and act:

| Type | What you do |
|---|---|
| **Dev-resolvable** — answerable from the codebase, git history, logs, or a read-only DB query | Resolve yourself. Update the plan: ✅ + finding inline. |
| **Decision required from me** — which behavior to restore, which area to bound the fix, whether admin is also affected | Ask me directly. Update the plan with my answer. |
| **Bug contradicts a documented AC and the AC itself looks wrong / unimplementable** | Raise the **`[SPEC?]` signal** (see below). Show me the comment first; post with my approval + `spec-input-needed` label. State the working assumption (typically: restore the AC as written) and downgrade to 🟡. |
| **PM call** (e.g., is this even a bug or is the current behavior intended) | Ask me first; if I don't know, recommend raising `[SPEC?]` and pause. |

**The `[SPEC?]` signal (dev implementation interface §6) — the one and only way to ask the spec side anything:**

- Post **one** comment prefixed `[SPEC?]` on the **bug/impl issue**, stating plainly what you need and why.
- `@`-mention **the author of the affected Epic tracker** (if the bug isn't under an epic, or the tracker was opened by a bot, fall back to `@awabmoedaetch`). Apply the **`spec-input-needed`** label.
- **Do not classify it**, **do not edit `moedatech-specs`**, and **do not file a separate `spec-feedback` issue** — `[SPEC?]` replaces that. The spec owner triages it; if the spec needs to change, the PM opens a Change request and the bug only fixes the **code** (interface §5).
- Can't code without the answer → hard-stop the ticket and wait. Can proceed on an assumption → do so, but state it in the `[SPEC?]` comment.

Status legend:
- 🔴 blocks ticket creation — must resolve before Step 10.
- 🟡 doesn't block tickets, but blocks shipping or UAT.
- ✅ resolved by investigation or my reply.

Read-only DB access only during this step. Never INSERT/UPDATE/DELETE.

Rollup format:

```
Open questions resolution:
- Q1: ✅ resolved by code search — <finding>
- Q2: 🔴 needs your call — <options>
```

**Do not auto-continue if any item is non-✅.** Only continue to Step 10 silently when every item is ✅.

If ANY item is 🔴 or 🟡, pause and present my options. For each non-✅ item, ask me via `AskUserQuestion` (cap of 4 questions per round; if more than 4, do multiple rounds, in order: 🔴 first, then 🟡).

**For 🔴 items (block ticket creation):**

- **Answer now** — I'll provide the decision; you fold it into the plan and re-classify to ✅.
- **Proceed under assumption** — I'll provide the assumption; you generate tickets with `**⚠ Pending:** Q<N>` markers and a `## Pending decisions` section at the top of `tickets.md`.
- **Raise `[SPEC?]`** — only if spec-flavored; draft, show, post with my approval + `spec-input-needed` label, re-classify to 🟡.
- **Hold pipeline** — stop here; no tickets generated. I'll resolve and re-run `/dev-flow:bug`.

**For 🟡 items (don't block tickets but block shipping/UAT):**

- **Resolve now** — try harder: re-run audit, fetch fresh data, ask me to chase. Describe what you'll do before doing it.
- **Raise `[SPEC?]`** — only if spec-flavored; draft, show, post with my approval + `spec-input-needed` label.
- **Accept and proceed** — keep as 🟡 in the plan; you'll surface this item again at Step 14 (per-AC check) and Step 15 (final summary).
- **Hold pipeline** — stop here.

After each round, fold the answers into `plan.md` before asking the next round. When all rounds are done:
- **If any answer was "Hold pipeline"** — stop. Tell me: `Pipeline held at Step 9 by your instruction on <Q-id>. Re-run /dev-flow:bug when ready.`
- **Otherwise** — continue to Step 10. Carry forward any remaining 🟡 items.

## Step 10 — Generate tickets

Write `docs/implementation-plans/<card-id>/tickets.md`:

```markdown
# Tickets — <Title>

Card: <issue url>
Plan: ./plan.md

## Backend — admin

### T1 — <ticket title>
**Scope:** backend-admin
**Description:** <what>
**Given/When/Then:**
- Given … When … Then …

### T2 — ...

## Backend — mobile

### T3 — ...

## API integration

### T4 — ...
```

For a single-file bug fix, it's fine to have one ticket in one scope and `_No tickets in this scope._` in the others — keep all three headers.

Tell me: `Tickets written to docs/implementation-plans/<card-id>/tickets.md.`

## Step 11 — Pause for ticket review

Ask exactly:

> Tickets ready. Reply **`tickets reviewed`** to begin implementation, or tell me what to change.

Wait. Edit if asked.

## Step 12 — Implement

Once I say `tickets reviewed`:

1. Move the bug to **`Status: Implementing`** if it isn't already (you walk a bug's status yourself — interface §5):
   ```bash
   gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" \
     --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPT_IMPLEMENTING"
   ```
2. Use `TaskCreate` to create one task per ticket from `tickets.md`, in order.
3. Implement them. For each ticket:
   - Mark in_progress, do the work, run/extend tests, mark completed.
   - Add a regression test that would have caught this bug — for bugs only.
4. **Do not** create `Impl ticket` sub-issues here. Interface §3 breaks an **epic** into impl tickets; a **bug** is its own card and is the unit of work — `tickets.md` is just your internal breakdown. (Only `/dev-flow:feature` creates impl-ticket sub-issues.)
5. **Do not** close the issue by hand. Closure depends on the disposition (Step 6.5): a **hotfix auto-closes at `Ready to ship`**; a **release-bound** bug closes when its fix PR merges with `Closes <repo>#<number>` (or rides a release). Never `Closes` an epic tracker.
6. When all tickets are done, tell me: `Implementation complete. Reply `check ac` to verify acceptance criteria against the implementation.`

## Step 13 — Pause for AC check

Wait for me to reply `check ac`. Don't proceed until I do.

## Step 14 — Verify ACs against the implementation

The "ACs" for a bug/support card come from one of two sources — pick the right one:

- **If the bug contradicts a documented AC** (the plan cites an AC id from `acceptance.md`): the documented AC is the source of truth.
- **Otherwise** (bug in unspecced area, or support change): the **Given/When/Then** statements in `plan.md` under "Acceptance criteria" are the source of truth.

Plus, **always** verify these implicit ACs for any bug fix:
- A regression test exists that fails on the buggy code and passes after the fix.
- No new failures in tests adjacent to the fix.

For each AC (documented or G/W/T from the plan), audit the implementation:
- Locate the code that satisfies it (`Grep`/`Read` — don't trust memory).
- Locate the test that exercises it.
- Verdict: **Met** / **Partial** / **Not met** / **Out of scope**.

Write the audit to `docs/implementation-plans/<card-id>/ac-check.md`:

```markdown
# AC Verification — <Title>

**Card:** <issue url>
**Type:** <Bug | Support>
**Audited:** <YYYY-MM-DD>
**Branch:** <git branch name>
**HEAD:** <short SHA>

## Summary
- Met: <count>
- Partial: <count>
- Not met: <count>
- Out of scope: <count>

## Regression test
- File: `<path:line-range>`
- Test name: `<name>`
- Pre-fix behavior: <fail / N/A — explain how you verified it would have caught the bug>
- Post-fix behavior: <pass>

## Per-AC findings

### <AC-ID or G/W/T-1> — <one-line label>
**Source:** <acceptance.md AC-ID | plan.md G/W/T>

**AC text (verbatim):**
> <copied verbatim>

**Verdict:** Met | Partial | Not met | Out of scope

**Evidence:**
- Implementation: `<path:line-range>` — <one-liner>
- Test: `<path:line-range>` (`<test name>`) — <pass/fail>

**Notes:** <only if Partial / Not met / Out of scope>

**Pending question:** <only if a 🟡 item in plan.md's Open questions references this AC. Otherwise omit.>

---

### <next> — ...
```

Print the same compact one-line summary to chat:

```
AC-001  ✓ Met       src/foo.ts:42-67  test/foo.spec.ts:12
GWT-1   ⚠ Partial   src/bar.ts:88     — missing locale fallback
RegTest ✓ Met       test/foo.spec.ts:55 (regression-yard-assignment-deselect)
```

Then ask exactly:

> AC check written to docs/implementation-plans/<card-id>/ac-check.md.
> Verdicts: <N met / N partial / N not met / N OOS>. Regression test: <present/missing>.
> Reply with what to do next: fix gaps, accept and ship, or revise an AC interpretation.

Wait. **Do not** auto-fix Partial/Not-met without me confirming.

## Step 15 — Final summary

Once I tell you to wrap up:
- Recap the fix (root cause, files touched, regression test added).
- List any related issues surfaced during the fix that we explicitly deferred — remind me to file follow-up issues for them.
- **Re-read `plan.md` Open questions section. List every still-🟡 item under a `## Pending before ship` heading**, with the action required for each. These block shipping or UAT — chase them before walking the status further.
- **Walk the bug's `Status`** per its disposition (Step 6.5) — you own this status (interface §5). After the fix is verified, move it to **`UAT needed`**:
  ```bash
  gh project item-edit --project-id "$PROJECT_ID" --id "$ITEM_ID" \
    --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_OPT_UAT_NEEDED"
  ```
  Then, when it's cleared, move it to **`Ready to ship`** (`$STATUS_OPT_READY_TO_SHIP`). **Stop at `Ready to ship`** — never take it further:
  - **Hotfix:** it **auto-closes** at `Ready to ship` (reconciler job). Don't close it yourself.
  - **Release-bound:** it rides a release on the spec side. Don't push it past `Ready to ship`.
- Remind me to open the fix PR **into `staging`** (`gh pr create --base staging`) with `Closes <repo>#<number>` (the **bug** issue) in the body. **Never `Closes` an epic tracker** (interface §7) — reference any related epic with `Part of equiptal/moedatech-specs#<epic>`.

## Guardrails

- For bugs that contradict a merged AC: the AC wins. The fix should restore the documented behavior, not the deviation.
- For bugs in unspecced areas: state the expected behavior explicitly in the plan (Given/When/Then). If the expected behavior is itself ambiguous, surface it under **Open questions** so Step 9 can resolve it (ask me, or raise `[SPEC?]` if it's actually a spec gap). Don't guess.
- **If a bug reveals the spec itself was wrong** (not just the code): fix the **code** in the bug, then raise the **`[SPEC?]` signal** (`@`-mention the affected epic tracker's author, `spec-input-needed` label). The spec owner opens a separate Change request to fix the spec — you never edit `moedatech-specs` (interface §5).
- If diagnosis points to a deeper issue than the ticket scope, surface it in **Out of scope** and ask whether to expand or leave it for a follow-up.
- **Cut a fix branch off `staging`** (the team's integration branch) — one branch + one PR for the fix, don't develop directly on `staging`. (Exception: a `Production` hotfix you deploy straight off the prod branch — stay where the user already is.)
- Plan and tickets files are committed (under `docs/`). Stage them in the fix PR.
