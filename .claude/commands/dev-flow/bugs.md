---
description: Pull bugs from the GitHub project Bugs tab, pick one, audit the codebase, propose the fix, then implement.
---

# /dev-flow:bugs — Quick bug audit & fix

You are running the **dev-flow quick bug pipeline** for the Moedatech roadmap (org `equiptal`, project number **3**, project URL https://github.com/orgs/equiptal/projects/3).

Source = the **Bugs** tab on that project. You will mirror its intent client-side: items whose `Card type` (or labels) mark them as bugs, across all repos linked to the project.

Unlike `/dev-flow:bug`, this command is **light-weight**:
- No `plan.md`, `tickets.md`, or `ac-check.md` paperwork.
- No project-card status moves.
- Just: list bugs → pick one → audit the code → propose a fix → fix it once approved.

Use this when you want to triage and crush a bug quickly. Use `/dev-flow:bug` instead when the bug is large enough to warrant a plan, tickets, and a regression-test gate.

---

## Step 1 — Discover project ID

```bash
gh project view 3 --owner equiptal --format json
```

Extract `PROJECT_ID` (`id` from the response). If missing, stop and report.

You do **not** need to look up Status field/option IDs — this command never moves the card.

## Step 2 — List items in the Bug column

```bash
gh project item-list 3 --owner equiptal --format json --limit 300
```

**Important:** the project has >200 items — use `--limit 300` (or higher) so you don't truncate before reaching the Bug-status items, which tend to be newer.

Filter the items client-side. **Keep an item only if all of these are true:**

1. `content.type == "Issue"` (skip drafts and PRs).
2. The item's `status` field equals `"Bug"` exactly.

This is the GitHub project's **Bug column** — items the PM/team have explicitly triaged into the `Status = Bug` bucket. Do **not** widen the filter to `Card type = Bug` or `labels include bug`; those produce a much larger set (every bug ever filed, including Completed/Old/Implementing items) and that's not what we want here.

Do **not** filter by assignee — the user wants to see the whole Bug column. Surface assignment info in the next step instead.

If zero items survive, tell me `No items in the Bug column right now.` and stop.

## Step 3 — Ask which bug to work on

Print a numbered list, one line per bug, in this exact shape:

```
[N] <repo-without-owner>#<number> — <title>   (<assignee or "unassigned">)
```

Mark items assigned to `Fadwahigga` with a trailing `← me` so they're easy to spot:

```
[3] Moedatech-App#412 — Marketplace filter resets on locale switch   (Fadwahigga ← me)
```

Use `AskUserQuestion` if there are 4 or fewer bugs. If more than 4, print the numbered list and ask me to type the number. Wait for my pick.

## Step 4 — Read the bug

```bash
gh issue view <number> --repo equiptal/<repo> --json title,body,url,labels,comments,assignees,state
```

Read the body and **all comments** — repro steps, screenshots, and discussion often live in comments, not the body.

If the issue body references a spec (links to `moedatech-specs/.../acceptance.md` or names an AC id), fetch the relevant spec section via `gh api repos/equiptal/moedatech-specs/contents/...` for context. The AC is the source of truth if the bug is a deviation from documented behavior.

## Step 5 — Audit the codebase

1. Identify the affected surface from the title/body/comments (admin panel, mobile app, backend endpoint, specific screen/component).
2. Locate the relevant code using `Grep` / `Read`. For broader exploration (unclear surface, cross-cutting concerns), spawn an `Explore` agent.
3. Check recent commits that touched the area: `git log -p --follow -- <path>` — the bug may be a regression with a clear culprit commit.
4. Check existing tests for the area — they tell you the intended behavior and may reveal a gap.

## Step 6 — Propose the fix

Tell me, in this exact shape, **before writing any code**:

```
## Bug audit: <repo>#<number>

**Symptom:** <one sentence — what the user sees go wrong>
**Affected files:** <path:line, path:line, ...>
**Root cause:** <one paragraph — why it's happening>
**Proposed fix:** <one paragraph — the change you'd make, in plain English>
**Files to touch:** <path:line, path:line, ...>
**Tests to add or update:** <path — and a one-line description of the regression test>
**Confidence:** <high | medium | low — and why>
**Risk:** <what else this change could affect — areas to keep an eye on>
```

Then ask exactly:

> Ready to fix? Reply **`fix`** to implement, **`narrow`** to scope the change down first, or tell me what to change in the diagnosis.

**Do not write code yet.** Wait for my reply.

## Step 7 — Implement the fix

Once I say `fix`:

1. Use `TaskCreate` to create a single task: `Fix <repo>#<number>: <one-line symptom>`. (Add subtasks only if the fix legitimately spans multiple files or layers — don't pad.)
2. Make the change exactly as described in Step 6. If implementation reveals a deeper problem than the audit suggested, **stop and re-audit** — don't expand scope silently.
3. Add the regression test from Step 6. Its name should describe the buggy behavior in past tense (e.g., `marketplaceFilterPersistsAcrossLocaleSwitch`) so future readers see what it's guarding against.
4. Run the test(s) you added/updated. If they fail, fix the implementation — not the test.
5. Mark the task completed.

**Do not** commit unless I ask. **Do not** push, open a PR, or move the project card.

## Step 8 — Recap

When the fix is in, tell me, in this exact shape:

```
Fixed <repo>#<number>.

Symptom: <one sentence>
Root cause: <one sentence>
Files touched:
  - <path:line-range> — <one-line what changed>
  - ...
Regression test: <path:line-range> (<test name>)

Next: open a fix PR into `staging` (`gh pr create --base staging`) with `Closes <repo>#<number>` in the body. Card stays where it is — don't move it.
```

Stop.

## Guardrails

- **Don't invent acceptance criteria.** If the bug contradicts a documented AC, the AC wins — restore documented behavior, not the deviation. If the AC itself looks wrong, raise the **`[SPEC?]` signal** — post one `[SPEC?]` comment on the issue, `@`-mention the affected epic tracker's author (else `@awabmoedaetch`), apply the `spec-input-needed` label. Don't edit `moedatech-specs` and don't file a separate `spec-feedback` issue (interface §6).
- **Don't auto-fix without approval.** The Step 6 → Step 7 pause is the contract. The user's standing instruction is to always ask before changing code.
- **Don't move the project card.** This command never touches `Status`. The fix PR's merge (with `Closes`) closes the issue; status walks are manual.
- **Don't skip the regression test.** If the bug is real, a test should have caught it. Add one.
- **Don't touch prod.** Default any DB lookups during the audit to staging. Ask before any prod read or write.
- **Cut a fix branch off `staging`** (the team's integration branch) — one branch + one PR for the fix, don't develop directly on `staging`.
- If the audit points to a deeper issue than the bug's scope, surface it in the Step 6 audit under **Risk** and ask whether to expand the fix or file a follow-up issue. Don't silently widen.
