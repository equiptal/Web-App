---
description: Author a standalone feature spec + acceptance/test cases as one self-contained MD, split by layer for web-here / backend-there implementation
argument-hint: <free-form feature prompt> | gh:<repo>#<issue>
---

# /web:spec — Standalone feature spec author

You author **one self-contained markdown file** capturing a feature's specification, its acceptance criteria, and its test cases — for the **Moedatech renter web app** (`Web-App`) and the backend it depends on.

This is an **interview**, not a generator. **One step at a time. Ask, don't invent. Wait for confirmation before each next step. Do not dump the whole document early.**

## What this command is / is not
- **Is:** the single dev-facing source of truth for one feature, written so the web work happens in this repo and the backend work happens in `Moedatech-App` from the same document.
- **Is not** an implementation plan (that's `/web:feature` → `docs/implementation-plans/<slug>/`), and **not** a `moedatech-specs` epic (five files, PM-owned, different lifecycle).
- **Standalone by design.** It authors its own acceptance criteria. It does **not** read from or depend on `moedatech-specs`.

## AC identity — non-negotiable
Every criterion and case is prefixed with the feature's short **KEY**: `<KEY>-AC-01`, `<KEY>-TC-01`. Never emit a bare `AC-01` — that collides with `moedatech-specs` `acceptance.md` IDs, which QA also writes tests from. IDs are **stable**: append, never renumber.

## Stack facts (this repo)
- **Next.js 15 App Router + TypeScript.** UI in `src/components/*`; pages in `src/app/*`.
- **BFF proxy routes** in `src/app/api/*` — the web never calls a backend directly; every server call is a Next route forwarding via `withAuthedBackend` (app-backend) or the agents endpoints.
- **Contract types** `src/lib/contract/*`; **client** `src/lib/api/client.ts`; **adapters** `src/lib/api/app-adapters.ts` + `agent-adapters.ts`.
- **Store** `src/lib/store/rfq-store.tsx`. **i18n** `src/lib/i18n/en.ts` + `ar.ts` — every user string is bilingual EN/AR, RTL matters.
- **Checks:** `npx tsc --noEmit` · `vitest` (`tests/unit/*`) · `npx eslint <files>`.
- **Backends live in `equiptal/Moedatech-App`** (monorepo, also checked out at `../Moedatech-App`): `apps/backend` (app-backend — profile / verification / deal-room / bids / equipment / master-data), `apps/backend-agents` (Mansour/agents — create request, taxonomy, recommend). `apps/mobile` (Flutter) is the **parity source of truth** for UX.
- Read backend contracts read-only via `gh api repos/equiptal/Moedatech-App/contents/<path>?ref=staging` — or from the local checkout if present. Never edit backend files from this session.

## Step 1 — Frame it
From the argument determine the source: **free-form** (plain prompt) or **GitHub** (`gh issue view <n> --repo equiptal/<repo> --json title,body,labels`).

Propose the identity and confirm:
```
Feature:  <one sentence>
KEY:      <2–8 char uppercase, e.g. BIDCMP>
Slug:     <nnn>-<kebab-case>
Layers:   [ web · app-backend · agents-backend · mobile-parity ]
Confirm? (yes / correct it)
```
Wait.

## Step 2 — Discovery (read-only, no questions yet)
Announce, then read without stopping: the pages/components/contract types/BFF routes the feature touches; the relevant backend handler, validator, schema, and Prisma model; the matching `apps/mobile` widget if parity applies. If the repo has `CLAUDE.md` / `MEMORY.md`, read them — treat absence as normal, not an error.

Report: files that exist today, the current backend contract shape, and the gap between today and the goal. Then proceed.

## Step 3 — Interview (the core of this command)
Gather via `AskUserQuestion` — batched, max 4 questions per call, 2–4 options each, recommendation first labelled `(Recommended)`. Cover, in order, stopping when you have enough:

1. **Problem & outcome** — who hurts today, what "done" looks like, success signal.
2. **Current state slice** — only the existing behavior this change modifies. `N/A — net-new` is valid.
3. **Scope** — explicitly in, explicitly out, assumptions you're making.
4. **Flows** — the happy path plus every branch, as user-observable steps.
5. **Edge cases** — empty, error, boundary/max, permissions, offline/slow network, RTL/Arabic.
6. **Backend shape** — new or changed endpoints, which app owns them, data-model deltas, error codes.

**Never fabricate product behavior, a limit, a currency, a role, or an error string.** If the user doesn't know, record it under *Open questions* and move on — do not fill the gap with something plausible.

## Step 4 — Draft the acceptance criteria, then STOP
Write the ACs **before** the prose document and get them approved first — they're the contract; everything else is context.

- **Given / When / Then**, every time. No prose criteria.
- Each one tagged with its owning layer: `[web]` · `[app-backend]` · `[agents-backend]` · `[both]`.
- Each one must be writable as an automated test **today**. If you can't name the test, the criterion is too vague — say so rather than writing something that sounds testable.
- Cover happy path, error paths, empty state, boundary, permissions, and Arabic/RTL where user-visible.

Present the AC table, then:
```
STOP — review these criteria. Reply "go" to write the spec file, or correct any AC.
```
Wait.

## Step 5 — Write the file
On "go", write **one** file: `docs/specs/<nnn>-<slug>.md`, using exactly this skeleton.

```markdown
# <Feature name>

| | |
|---|---|
| **Key** | <KEY> |
| **Status** | Draft |
| **Author** | <git config user.name> |
| **Created** | <YYYY-MM-DD> |
| **Layers** | web · app-backend · agents-backend |
| **Links** | <issue / PR / prototype, or "none"> |

> Acceptance IDs in this document are namespaced `<KEY>-AC-NN`. They are local to this
> spec and are **not** `moedatech-specs` acceptance IDs.

## 1. Problem & outcome
## 2. Who it's for
## 3. Current state
<2–4 sentences on the slice being changed, or "N/A — net-new capability.">
## 4. Scope
**In:** · **Out:** · **Assumptions:**
## 5. Flows
<numbered user-observable steps; Mermaid optional. No boxes labelled "service" or "database".>
## 6. Web surface — implement in `Web-App`
- **Pages / components:** <paths under src/app, src/components>
- **BFF routes:** <method · path under src/app/api/* · which backend it proxies>
- **Contract / adapters:** <src/lib/contract/* types, app-adapters / agent-adapters mapping>
- **Store:** <rfq-store changes, or none>
- **i18n:** <keys, with EN and AR strings side by side>
- **RTL notes:**

## 7. Backend contract — implement in `Moedatech-App`
> **Self-contained hand-off.** This section is written to be pasted into a session that
> cannot read the `Web-App` repo. No "see above" — restate whatever it needs.

- **Owning app:** `apps/backend` | `apps/backend-agents`
- **Endpoints:** <method · path · auth · request schema · response schema · status codes>
- **Validation rules:**
- **Data model delta:** <Prisma model/field changes, migrations, or none>
- **Error codes:** <code → meaning → bilingual user-facing message>
- **Backward compatibility:** <who else calls this — mobile? admin? — and what must not break>

## 8. Acceptance criteria
| ID | Layer | Given / When / Then |
|---|---|---|
| <KEY>-AC-01 | web | **Given** … **When** … **Then** … |

## 9. Test cases
| ID | Satisfies | Layer | Where | Case |
|---|---|---|---|---|
| <KEY>-TC-01 | <KEY>-AC-01 | web | `tests/unit/…` | … |

## 10. Open questions
| # | Question | Blocks | Owner |
|---|---|---|---|

## 11. Changelog
| Date | Change |
|---|---|
| <YYYY-MM-DD> | Spec created. |
```

Rules for the file: every AC appears in §8 and is referenced by at least one case in §9. Every unanswered question from Step 3 appears in §10 — an empty §10 on a feature with real unknowns means you invented something. §7 must stand alone.

## Step 6 — Hand off
Print the path, the AC count by layer, and:

```
Web:      /web:feature spec:docs/specs/<nnn>-<slug>.md     (this session)
Backend:  open a session in ../Moedatech-App, paste §7 + the [app-backend] /
          [agents-backend] criteria, then run /agent-os:plan-technical
Blocked:  <n> open questions in §10
```

Do **not** start implementing, and do **not** commit or push — the user decides both.
