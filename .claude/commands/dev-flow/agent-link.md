---
description: Map a web epic's agent-owned ACs to the agent work — write the handoff, cross-link the epic tracker, and point to /agent-flow:fanout — so the Mansour side of any web feature is never dropped.
---

# /dev-flow:agent-link — connect web work to the agent (Mansour)

Every renter-web epic has a slice that **Mansour (the agent)** owns — scoring/recommendation, the Ask-Mansour chat, quote-file parsing, learning, recognition — that the web **cannot build alone**. The web dev-flow (`/dev-flow:feature`) defers that slice; this skill is the **bridge** that records it, cross-links it on the board, and hands it to the agent-side pipeline (`/agent-flow:fanout`) so it never falls through the gap (exactly what happened to 007's Mansour layer).

Run it **after** `/dev-flow:feature` has produced `plan.md` (the plan's "Out of scope / deferred to agent" + the spec's owner tags are the inputs). Argument: an epic id (`web-app/007-bid-comparison`), a tracker number (`306`), or nothing (infer from the current branch / newest `docs/implementation-plans/*/plan.md`).

---

## Step 1 — Resolve the epic

- If given an epic id `<product>/<NNN-slug>` or a tracker `#<number>`, use it. Otherwise infer: the current git branch named `<product>/<NNN-slug>`, else the most recently edited `docs/implementation-plans/<card-id>/plan.md` (read its `Card:` + `Spec:` headers).
- Derive: `<card-id>` (`<repo>-<number>`), the epic tracker number in `equiptal/moedatech-specs`, and the spec dir `products/<product>/epics/<NNN-slug>/`.
- Fetch the tracker to learn its **author** (for the @-mention later):
  ```bash
  gh issue view <number> --repo equiptal/moedatech-specs --json title,author,url
  ```

## Step 2 — Extract the agent-owned scope

Pull `acceptance.md` and identify every agent-owned AC across **both** spec styles:
```bash
gh api "repos/equiptal/moedatech-specs/contents/products/<product>/epics/<NNN-slug>/acceptance.md" --jq '.content' | base64 -d
```
- **007-style:** lines `**Owner:** Agent (Mansour)` or `**Owner:** Shared` under an AC heading.
- **older style:** AC titles carrying the **`[Mansour]`** tag.
- **Also** read the web `plan.md` "Out of scope" — any AC explicitly **deferred to the agent/backend** (e.g. "Agent/backend not ready"). These are the same ACs from the web's side; reconcile the two lists (the spec owner tag is authoritative for *what's* agent-owned; the plan tells you *what the web deferred*).

For each agent AC capture: **AC id**, verbatim title, **owner** (`Agent` vs `Shared` — Shared means the web built its half and the agent owes the other half), and the deferred reason from the plan if any.

**Do not invent ACs.** Only what the spec tags `Agent`/`Shared`/`[Mansour]` (plus plan-deferred) is in scope for the handoff.

## Step 3 — Map the web↔agent contract

For each agent AC, name the **contract point the web calls** — the endpoint/shape the web expects the agent side to provide (pull these from the plan's "API integration" + "Open questions"; if absent, state "contract TBD — define with the agent team"). Typical points:
- per-item **scoring/recommendation** (pick + confidence + reasons)
- **Ask-Mansour chat** (reasons, what-if recompute, interpretation echo)
- **quote-file parse** (Excel/PDF → comparable bid)
- **saved preference** read/write · **award-history** read (recognition/learning)

Flag each contract point's status: **not built** (no backend endpoint found — confirm with a quick `gh api .../git/trees` + code search of `equiptal/Moedatech-App`) or **built**.

## Step 4 — Write the handoff doc

Write `docs/implementation-plans/<card-id>/agent-handoff.md`:

```markdown
# Agent handoff — <Epic title>

**Epic:** <tracker url>  ·  **Spec:** <spec dir url>  ·  **Generated:** <YYYY-MM-DD>
**Web plan:** ./plan.md  ·  **Agent-side pipeline:** /agent-flow:fanout

## Agent-owned ACs (deferred from the web build)
| AC | Owner | What the agent owes | Web↔agent contract point | Contract status | Web ticket(s) that consume it |
|----|-------|---------------------|--------------------------|-----------------|-------------------------------|
| AC-17 | Agent | Mansour's pick + confidence | per-item scoring endpoint | not built | T7 (preset sort stands in until then) |
| AC-25 | Shared | supplier recognition | award-history read | not built | T8 |
| … | | | | | |

## Hand-off
- Run **`/agent-flow:fanout`** on `<product>/<NNN-slug>` to generate the Mansour-side plan + impl tickets (Normalization-Agent + Training-Academy) against the eval gate.
- The web tickets above stay shippable now (deterministic half); they light up the moment the contract lands.

## Contract notes
<any shape/versioning notes — the scoring/chat/parse contract must be stable across web + the later mobile re-skin>
```

Keep the web ticket column accurate — it's what tells the agent team which web surface consumes each endpoint, and tells the web side what unlocks when the agent ships.

## Step 5 — Cross-link the epic tracker (GitHub)

Draft **one** comment that connects the web work to the agent scope. **Show me the text first; post only on my approval.**

```
**[agent-link]** Web build for this epic shipped its deterministic half (see web PR / branch `<product>/<NNN-slug>`).
The agent-owned scope is deferred to Mansour and tracked in `agent-handoff.md`:
- AC-17, AC-18, AC-19, AC-21, AC-23 — recommendation + Ask-Mansour chat
- AC-22, AC-24, AC-25 — saved preference, award-learning, recognition
- AC-26, AC-27 — off-platform quote parse
Next: run `/agent-flow:fanout` to build the Normalization-Agent + Training-Academy side. @<tracker-author>
```
- Post on the **epic tracker** (where the spec side sees it); `@`-mention the tracker's author (Step 1), else `@awabmoedaetch`.
- Apply a label if the repo has one for this (`agent-fanout` / `agent-input-needed`); if none exists, skip the label rather than inventing one.
- This is **not** a `[SPEC?]` signal (no spec ambiguity) — don't use the `spec-input-needed` label.

```bash
gh issue comment <number> --repo equiptal/moedatech-specs --body "<approved text>"
```

## Step 6 — Report

Print: the agent ACs found (count + ids), the contract points + their built/not-built status, the handoff doc path, and the cross-link comment URL. End with the explicit action item: **"Run `/agent-flow:fanout` on `<product>/<NNN-slug>` to build the agent side."**

## Guardrails
- Never invent agent ACs — only spec-tagged `Agent`/`Shared`/`[Mansour]` (+ plan-deferred) count.
- This skill **connects + records**; it does **not** build the agent code (that's `/agent-flow:fanout`) and does **not** move any tracker Status (automation-driven).
- Don't post the cross-link comment without showing me the text first.
- Reconcile, don't duplicate: if a prior `[agent-link]` comment exists on the tracker, update the handoff doc and note it rather than posting a second comment.
