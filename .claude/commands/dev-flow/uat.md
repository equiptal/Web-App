---
description: Pick a card in 'UAT' assigned to me, audit every AC against the implementation, ask on each gap, then fix.
---

# /dev-flow:uat — UAT pipeline

You are running the **dev-flow UAT pipeline** for the Moedatech roadmap (org `equiptal`, project number **3**, project URL https://github.com/orgs/equiptal/projects/3).

This is the **post-implementation audit**. The card has already been implemented (its Status was walked from `Implementing` → `UAT`). Your job is to verify that every acceptance criterion in the merged spec is actually satisfied by code in this repo, then close gaps — asking the user for direction on every non-Met AC before changing code.

The Kitchen filter (mirrored client-side):
`-status:"Idea","Old issues" -card-type:"Ops request","Release tracker" -is:pr has:status`

You will narrow further to **Status = "UAT needed"** and **assigned to `Fadwahigga`**. (Automation walks the epic `Implementing → UAT needed` when the final PR merges — interface §4. If your board labels this stage just "UAT", match that string instead.)

The lifecycle is `Drafting → Specced → Implementing → UAT needed → … → Completed` (interface §0). **Do not move the card.** The epic's Status is automation-driven (interface §7); `UAT needed → … → Completed` happens on the spec side after QA / PM sign-off and the release ship (interface §4).

---

## Step 1 — Discover project + status field/option IDs

```bash
gh project field-list 3 --owner equiptal --format json --limit 50
```

From the result, extract:
- `STATUS_FIELD_ID` — id of the field where `name == "Status"`
- `STATUS_OPT_UAT` — option id where `name == "UAT needed"` (or `"UAT"` if that's how your board labels the stage)
- `CARD_TYPE_FIELD_NAME` — exact name of the "Card type" field (case-sensitive)

Then get the project node id:

```bash
gh project view 3 --owner equiptal --format json
```

- `PROJECT_ID` — `id` from this response

If any of these are missing, stop and report what's missing.

## Step 2 — List eligible UAT cards

```bash
gh project item-list 3 --owner equiptal --format json --limit 200
```

Filter client-side. **Keep an item only if all of these are true:**

1. `content.type == "Issue"` (not a draft, not a PR).
2. The issue is open. If `state` isn't in the item payload, verify with `gh issue view` once narrowed.
3. `Fadwahigga` appears in the issue's assignees. (`gh project item-list` may return assignees as a comma-separated string — split on commas/whitespace and check.)
4. The item's `Status` value equals `"UAT needed"` (or `"UAT"` if that's the board's label for this stage).
5. The item's `Card type` value is **not** `"Ops request"` and **not** `"Release tracker"`.
6. The item has a `Status` value at all (Kitchen requires `has:status`).

If zero items survive, tell me `No UAT cards are assigned to you.` and stop.

## Step 3 — Ask which card to audit

Print a numbered list, one per line, in this exact form:

```
[N] <repo-without-owner>#<number> — <title>
```

Then use `AskUserQuestion` with each surviving card as an option (cap at 4 — if there are more than 4, group/truncate or fall back to a plain prompt asking me to type the number). Wait for my pick.

## Step 4 — Read the card and its spec

1. Fetch the full issue:
   ```bash
   gh issue view <number> --repo equiptal/<repo> --json title,body,url,labels,comments,assignees
   ```

2. If the issue lives in `equiptal/moedatech-specs` and the title starts with `Epic:`, derive the epic id (`<product>/<NNN-slug>`).

3. Pull every spec file in that epic directory:
   ```bash
   for f in brief.md core-flows.md acceptance.md dependencies.md changelog.md; do
     gh api "repos/equiptal/moedatech-specs/contents/products/<product>/epics/<NNN-slug>/$f" --jq '.content' | base64 -d
   done
   ```
   If any file 404s, note it and proceed with what you have. `acceptance.md` is mandatory — if it 404s, stop and tell me.

4. If the issue is in `Moedatech-App`, use its body as the spec (rare for UAT cards).

5. Compute `<card-id>` as `<repo>-<number>` (e.g., `moedatech-specs-47`).

6. Check whether `docs/implementation-plans/<card-id>/plan.md`, `tickets.md`, and `ac-check.md` exist. Read any that do — they tell you what scope was implemented, what was deferred under "Out of scope", and what was flagged 🟡 / 🔴 in the original Open questions. Carry those flags forward into the UAT audit.

**Do not invent acceptance criteria. Do not reinterpret an AC.** If the AC text doesn't match what you see in the code, the answer is *audit*, not *rewrite*.

## Step 5 — Audit every AC against the implementation

Always audit **all ACs** from `acceptance.md` (per user pref — even ACs marked Met in a prior `ac-check.md`, since code may have regressed).

For **each AC id**:
- Locate the code that satisfies it (`Grep`/`Read` — don't trust your memory or the prior `ac-check.md`).
- Locate the test that exercises it, if any.
- Decide a verdict: **Met** / **Partial** / **Not met** / **Out of scope** (only "Out of scope" if `plan.md`'s "Out of scope" section explicitly defers it).

Write the audit to `docs/implementation-plans/<card-id>/uat-check.md` in this exact shape:

```markdown
# UAT Verification — <Title>

**Card:** <issue url>
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/<product>/epics/<NNN-slug>/  (omit if not an epic tracker)
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
- Test: `<path:line-range>` (`<test name>`) — <pass/fail / "no test">

**Notes:** <only if Partial / Not met / Out of scope — explain the gap concretely: what the AC requires, what the code actually does, the delta>

**Pending question:** <only if a 🟡 item in plan.md's Open questions references this AC id — list as `Q<N> — <action>`. Otherwise omit this line.>

---

### <next AC-ID> — ...
```

After writing the file, print a compact one-line-per-AC summary to chat:

```
AC-001  ✓ Met       src/foo.ts:42-67  test/foo.spec.ts:12
AC-002  ⚠ Partial   src/bar.ts:88     — missing locale fallback
AC-003  ✗ Not met   —                 — no code touches this path
AC-004  · Out of scope (per plan)
```

Then tell me:

> UAT audit written to docs/implementation-plans/<card-id>/uat-check.md.
> Verdicts: <N met / N partial / N not met / N OOS>.
> I'll walk every non-Met AC with you now — no code changes yet.

## Step 6 — Walk every non-Met AC before changing code

Collect every AC whose verdict is **Partial** or **Not met** (Met and Out of scope are done — skip them silently).

For each non-Met AC, present it to me via `AskUserQuestion`. **Do not auto-fix.** The user's standing instruction is *always ask before any fix* — Partial often means the AC was misread, not that more code is needed.

Cap of 4 questions per round — if there are more than 4 non-Met ACs, do multiple rounds. Process **Not met first**, then **Partial**.

For each AC, ask in this exact shape:

> **<AC-ID>** — <verdict>: <one-line gap>
>
> AC text: > <verbatim AC>
> Current code: `<path:line-range>` — <what it actually does>
> Expected: <what the AC requires>
>
> What should I do?

Options (use `AskUserQuestion`):

- **Fix now** — proceed to Step 7 for this AC. I'll outline the change before touching code.
- **Spec misread** — the AC is actually satisfied; update the verdict in `uat-check.md` to Met and embed the corrected interpretation in the Notes. No code change.
- **Defer to follow-up** — accept the gap for now; I'll surface it in the final summary so you can file a follow-up issue. Verdict stays as-is in `uat-check.md`, with a `**Deferred:** <reason>` line added.
- **Raise `[SPEC?]`** — the AC is ambiguous or contradicts existing data. This is the **one signal** to the spec side (interface §6): post a single `[SPEC?]` comment on the impl issue (or the epic tracker), `@`-mention **the epic tracker's author** (else `@awabmoedaetch`), and apply the **`spec-input-needed`** label. Do **not** classify it, do **not** edit `moedatech-specs`, and do **not** file a separate `spec-feedback` issue. Show me the comment text first; post on approval. Link the comment URL in the AC's Notes. Mark as deferred until the PM replies.

After each round of answers, fold the answers into `uat-check.md` (update verdicts, add Notes, link `[SPEC?]` comment URLs) **before** asking the next round or moving to fixes.

When all rounds are done, summarize:

```
Decisions:
- AC-001: Fix now
- AC-002: Spec misread — re-verdicted as Met
- AC-003: Defer — follow-up issue
- AC-004: `[SPEC?]` raised on <impl-issue-or-epic-tracker URL>
```

If **zero** ACs were marked "Fix now", skip to **Step 9 (Final summary)**.

## Step 7 — Implement fixes one AC at a time

For each AC marked "Fix now":

1. Use `TaskCreate` to create a task: `Fix <AC-ID>: <one-line gap>`.
2. Before changing code, post a one-paragraph plan: what file(s) you'll touch, what the change is, what test you'll add or update. **Pause** if the change touches more than one file or introduces a new dependency — ask me to confirm with `AskUserQuestion` (options: `Proceed`, `Narrow the change`, `Cancel this AC`).
3. Implement the change. Reference the AC id in the commit message (don't commit unless I asked — follow the standard "only commit when requested" rule).
4. Run the relevant test(s). If a test was missing for this AC, add one whose name mirrors the Given/When/Then language from `acceptance.md` (so the third-party tester's test names align).
5. Mark the task completed.
6. Update `uat-check.md` for this AC: re-verdict (typically Met), update Evidence with the new path:line-range and the test path:line-range.

If a fix opens up a new question that wasn't in the original `acceptance.md` (e.g., the spec is silent on an edge case the fix exposes), **stop and ask**. Don't reinterpret. Either ask me directly (`AskUserQuestion`) or — if it's spec-shaped ambiguity — raise the **`[SPEC?]` signal** (same flow as Step 6) and pause for my approval before posting.

## Step 8 — Re-audit after fixes

Once every "Fix now" AC has been worked:

1. Re-run the audit (Step 5) for **only the ACs you touched**. The rest stand.
2. Update `uat-check.md`'s Summary counts.
3. Print a refreshed compact summary.

If any "Fix now" AC is still non-Met after the fix attempt, **stop and ask**. Don't keep iterating silently. Options via `AskUserQuestion`: `Try a different approach` (re-plan), `Defer this AC`, `Raise [SPEC?]` (if the gap is actually spec-shaped — interface §6).

## Step 9 — Final summary

Print, in this exact shape:

```
UAT audit complete for <repo>#<number>.

Final verdicts: <N met / N partial / N not met / N OOS>
Report: docs/implementation-plans/<card-id>/uat-check.md

Fixed this run:
- <AC-ID> — <one-line of what changed>
- ...

Deferred (open follow-ups):
- <AC-ID> — <reason> → file follow-up issue
- ...

Pending [SPEC?] signals:
- <impl-issue-or-epic-tracker URL> — <AC-ID>: <one-line>
- ...

Reminders:
- Card stays in UAT — don't move it (epic Status is automation-driven, interface §7).
- Open a fix PR **into `staging`** (`gh pr create --base staging`) with `Part of equiptal/moedatech-specs#<spec-tracker-number>` (reference only). **Never `Closes` the epic tracker** (interface §4, §7) — the epic stays open until the spec side closes it at `Completed`. `Closes` is only ever used on `Impl ticket` / bug issues, not the epic.
- File follow-up issues for each Deferred item before stepping away.
```

Stop. **Do not move the project card.**

## Guardrails

- **Never invent acceptance criteria.** If a behavior isn't in `acceptance.md`, it isn't part of this epic. Don't add tests for unspecified behavior.
- **Never reinterpret an AC silently.** If the code doesn't match the AC text, ask. If the AC text is ambiguous, raise the **`[SPEC?]` signal** (interface §6) — never edit `moedatech-specs` or file a separate `spec-feedback` issue.
- **Never auto-fix.** Always pause at Step 6 and let the user decide per AC. Partial usually means the AC was misread, not that more code is needed.
- **Never move the card status.** `UAT needed → … → Completed` is manual on the spec side, after QA / PM sign-off and the release ship (interface §4, §7).
- **Never `Closes` the epic tracker from this command** (interface §4, §7) — the epic stays open and closes on the spec side at `Completed`, not via any PR here. Fix PRs from this command reference it with `Part of` / `Refs` only.
- **Cut UAT fixes on a branch off `staging`** (the team's integration branch) — don't develop directly on `staging`. UAT fixes ride the epic's single final PR where the epic branch is still open; otherwise cut a fix branch off `staging`.
- **Don't touch prod** — read or write — without explicit per-operation approval (per user pref). Default any DB lookup needed during the audit to staging.
- The audit and any updated plan/tickets/uat-check files are committed to the repo. Stage them in the fix PR.
- Don't mock external services in tests if the AC implies a real integration path — see `CLAUDE.md`.
