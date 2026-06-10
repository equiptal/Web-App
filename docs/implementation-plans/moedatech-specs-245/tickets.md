# Tickets — Renter web RFQ creation (agent-assisted)

Card: https://github.com/equiptal/moedatech-specs/issues/245
Plan: ./plan.md

> **Status note (be honest about "done"):** these tickets are all **OPEN**. The frontend is built
> and runs end-to-end against the **stand-in mock**. The **real agent + app connection is wired but
> switched OFF** (no `MANSOUR_URL` / `AGENTS_API_URL` / token set, and Mansour's contract is still in
> flux). So "implemented" here means *frontend built + relay ready behind an env switch* — **not**
> connected to live services. See T9 + plan.md Q5/Q6.

This is a frontend-only repo, so tickets are grouped by **web surface** (not the admin/mobile/API
scopes). Each lists the GitHub impl-ticket issue, the ACs, the files, and Given/When/Then.

---

## Foundation

### T1 — Project scaffold + Design System v3 theme + EN/AR i18n (RTL-ready) — `Web-App#1`
**ACs:** AC-45, AC-46
**Files:** `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/i18n/{en,ar,config,index}.tsx`, `src/components/ui.tsx`, `src/components/AppShell.tsx`
**Description:** Next.js 15 + TS + Tailwind scaffold; DS v3 palette/fonts/icons; EN+AR dictionaries; layout RTL-capable, visual mirror flag-gated (`RTL_ENABLED`) until STANDARDS resolves AC-46.
**Given/When/Then:**
- Given the renter's language is Arabic, When the flow renders, Then all strings are Arabic (AC-45) and the layout is RTL-ready (flag-gated, AC-46).

## Intake & access

### T2 — Intake: RFQ/Manual tabs, paste + file upload, guest block — `Web-App#2`
**ACs:** AC-01, AC-02, AC-03, AC-05, AC-06, AC-07, AC-08
**Files:** `src/components/screens/Intake.tsx`, `GuestBlock.tsx`, `src/lib/session/index.tsx`
**Given/When/Then:**
- Given a basic/verified renter, When they open the create surface, Then `RFQ` and `Manual` tabs show and the RFQ tab has a paste field + upload (AC-01).
- Given a guest-tier renter, When they try to start, Then an account-creation prompt blocks entry (AC-02/03).
- Given a non-PDF/image/Word/Excel file, When attached, Then it's rejected with the accepted-types message (AC-07); no size/count/length limit blocks otherwise (AC-08).

### T3 — Processing state + summary counts + empty/network errors — `Web-App#3`
**ACs:** AC-04, AC-09, AC-10, AC-56
**Files:** `src/components/screens/Processing.tsx`
**Given/When/Then:**
- Given the renter starts processing, When parsing runs, Then a processing state shows and items populate progressively (AC-04) with summary counts (AC-56).
- Given empty/unreadable input, Then an error offering retry/Manual is shown, no request created (AC-09).
- Given a network failure, Then a retry error shows and input is preserved (AC-10).

## Wizard

### T4 — Step 1 Project details — `Web-App#4`
**ACs:** AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-27, AC-28, AC-47, AC-48, AC-50
**Files:** `src/components/wizard/Step1Project.tsx`
**Given/When/Then:**
- Given Step 1, Then four cards show (Location, Timing & Hours, Advanced, Certificates) (AC-11).
- Given location unconfirmed or rental basis unset, When advancing, Then it's blocked (AC-12/16); start date never blocks (AC-14).
- Given text and file disagree on location, Then a conflict picker shows both sources (AC-47); multiple sites → one-location prompt (AC-48).

### T5 — Step 2 Equipment triage — `Web-App#5`
**ACs:** AC-17–AC-34, AC-51, AC-53, AC-54, AC-55, AC-57
**Files:** `src/components/wizard/Step2Equipment.tsx`, `ItemRow.tsx`
**Given/When/Then:**
- Given a confident item, Then it shows ready/Matched, editable (AC-17/21/54).
- Given a needs-validation item or a nearest-measurement suggestion, When advancing, Then it's blocked until Approved/Edited (AC-18/19/20/29).
- Given a no-match item, Then `Provide it for me?` (WhatsApp) / `Cancel` both remove it (AC-30/31/32/33); mapped items still post (AC-34).

### T6 — Step 3 Preferences — `Web-App#6`
**ACs:** AC-35, AC-36, AC-37, AC-38, AC-39, AC-40
**Files:** `src/components/wizard/Step3Preferences.tsx`
**Given/When/Then:**
- Given Step 3, Then Core Terms + Optional Extras groups show, no fulfillment banner (AC-35); SLA shows only when maintenance = Supplier (AC-37); budget in SAR (AC-39).

### T7 — Step 4 Preview + spec-sheet export + post broadcast + confirmation — `Web-App#7`
**ACs:** AC-41, AC-42, AC-43, AC-52
**Files:** `src/components/wizard/Step4Preview.tsx`, `src/lib/export/spec-sheet.ts`
**Given/When/Then:**
- Given Step 4, Then a full summary + all-items table show (AC-41/52); `Open in Excel` exports the spec sheet excluding Not-available items (AC-52).
- Given the renter posts, Then all items submit as one broadcast (AC-43) and a web confirmation shows, staying on web (AC-42).

### T8 — Wizard navigation + advance gates — `Web-App#8`
**ACs:** AC-44
**Files:** `src/components/wizard/Wizard.tsx`, `src/lib/contract/gates.ts`
**Given/When/Then:**
- Given the four-step wizard, Then back-navigation is free and forward is blocked on unmet required fields (AC-44).

## Integration (relay)

### T9 — Agent/app relay (BFF) + env switch + staging scaffolding — `Web-App#9`
**ACs:** AC-25, AC-26 (mapping); infra for AC-04→AC-43
**Files:** `src/app/api/**/route.ts`, `src/lib/api/{client,agent-adapters,app-adapters,agents-backend,mock-draft}.ts`, `src/lib/config/env.ts`, `amplify.yml`, `.env.example`
**Description:** Server-side relay. When env vars are set: agent parse → Mansour `POST /rfq`; catalogue → `GET /agents/taxonomy`; submit → `POST /agents/requests`. Otherwise → stand-in mock. me/supplier ↔ mobilization/demobilization booleans (AC-25/26).
**Given/When/Then:**
- Given `MANSOUR_URL`/`AGENTS_API_URL`+token are set, When the renter processes/submits, Then the relay calls the real services and adapts the contract; When unset, Then the mock serves so the app still runs.

> **NOT yet connected:** no real URLs/token configured; Mansour's contract is a dated snapshot
> (`src/lib/contract/agent.ts`, 2026-06-10) pending its freeze. This ticket stays open until the
> real connection is verified on staging.
