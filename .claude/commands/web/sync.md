---
description: Sync all three apps (web · agents-backend · app-backend) for a feature/contract and produce an alignment report + per-repo punch list
argument-hint: <feature/contract, e.g. "deal-room terms" | "company documents" | "create request">
---

# /web:sync — Sync the three apps and verify alignment

The umbrella check across **Web-App**, the **agents backend** (`Moedatech-App/apps/backend-agents`), and the **app backend** (`Moedatech-App/apps/backend`) — plus the **mobile app** (`apps/mobile`) as the parity reference. Use it before shipping a cross-cutting feature, or to audit drift.

## Procedure
1. **Define the contract surface** for the argument: the term keys / field names / enums / doc keys / endpoints involved (e.g. for "deal-room terms": the 3 buckets, the 5 states, the term keys, declared-value + state fields).
2. **Gather each side** (read-only, `?ref=staging` for the backends):
   - **Web**: contract types + adapters + BFF routes (this repo).
   - **App backend**: handler/service/Prisma `select` (run `/web:link-backend` internally if helpful).
   - **Agents backend**: validators/handlers (run `/web:link-agents` internally if helpful).
   - **Mobile**: the matching widget/model so the web's UX + labels match the app (this is the parity authority — e.g. term-state labels, bid-card term set, doc types).
3. **Build a 3-(or 4-)column alignment matrix**: each field/term/enum × {Web, App-backend, Agents-backend, Mobile} with ✅ aligned / ⚠ differs / ❌ missing, plus a one-line note on the canonical value where they differ.
4. **Punch list per repo**: what Web must change, what the app backend must change (draft PR/`[SPEC?]`), what the agents backend must change, and any mobile mismatch to raise with the spec owner. Mark which are blocking vs cosmetic.
5. **Verdict**: aligned ✅ / drift found ⚠ + the top fixes. If invoked from `/web:feature`, attach the punch list to the plan so nothing ships half-wired.

Rules: read-only across `Moedatech-App`; propose backend/agents changes as PRs or `[SPEC?]` comments (`spec-input-needed`) only **with explicit confirmation**; never push to `main`. The mobile app wins ties on UX/labels; the backend wins ties on data shape; the web adapts to both.
