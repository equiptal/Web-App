# AC Verification — Renter web RFQ creation (agent-assisted)

**Card:** https://github.com/equiptal/moedatech-specs/issues/245
**Audited:** 2026-06-10
**Branch:** web-app/002-rfq-creation
**HEAD:** f5e88eb

> **Scope of this audit:** code-level verification against the spec + the **stand-in mock / agent↔web
> contract**. The app is **not yet connected to live Mansour or the agents-backend** (T9/#9), so the
> renter-observable behavior is verified in the UI, but **not end-to-end against the real agent**.
> `[Mansour]`-produced values are the agent's responsibility (out of scope here); this audit checks
> that the **web renders/consumes them correctly**.

## Summary
- Met: 52
- Partial: 4 (AC-45, AC-46, AC-57, AC-28)
- Not met: 0
- Out of scope: 1 (AC-49, retired)

## Per-AC findings (compact)

```
AC-01  ✓ Met       Intake.tsx (RFQ/Manual tabs + paste + upload)
AC-02  ✓ Met       CreateSurface.tsx:16 + GuestBlock.tsx (guest blocked at entry)
AC-03  ✓ Met       session/index.tsx (canCreate gate; account form OOS)
AC-04  ✓ Met       Processing.tsx (progressive populate) — agent production mocked
AC-05  ✓ Met       Intake.tsx (file upload→base64) + api/agent/process route
AC-06  ✓ Met       client.ts processRfq sends text+files together
AC-07  ✓ Met       Intake.tsx:35 isAccepted + :98 fileRejected
AC-08  ✓ Met       Intake.tsx (no size/count/length cap)
AC-09  ✓ Met       api/agent/process route :27 (code:"empty") + Processing.tsx:38
AC-10  ✓ Met       client.ts ApiError("network") + Processing.tsx retry; input preserved (GO_INTAKE)
AC-11  ✓ Met       Step1Project.tsx (Location/Timing/Advanced/Certificates cards)
AC-12  ✓ Met       gates.ts gateStep1 (confirm loc + rental basis) wired in Wizard.tsx
AC-13  ✓ Met       Step1Project.tsx rental basis + extendable + quote note
AC-14  ✓ Met       Step1Project.tsx dates optional; hoursPerDay default 8
AC-15  ✓ Met       Step1Project.tsx Advanced (working days/overtime/year/site access)
AC-16  ✓ Met       Step1Project.tsx:97 confirmLocation; starts unconfirmed even if extracted
AC-17  ✓ Met       ItemRow.tsx (confident→Matched, still editable)
AC-18  ✓ Met       gates.ts itemBlocksAdvance (needs-validation blocks until approve/edit)
AC-19  ✓ Met       ItemRow.tsx nearest suggestion + approveSuggestion
AC-20  ✓ Met       ItemRow.tsx:99 unitConversion + agent advisory line
AC-21  ✓ Met       rfq-store SET_ITEM_CATEGORY/SUBCATEGORY cascade; taxonomy-bound selects
AC-22  ✓ Met       Step2Equipment.tsx addItem → newManualItem (nested taxonomy)
AC-23  ✓ Met       ItemRow.tsx remove confirm Modal
AC-24  ✓ Met       options.ts defaultOperatorNeeded + ItemRow operator sub-fields
AC-25  ✓ Met       Step2 "Settings for all items" + per-item OverrideField
AC-26  ✓ Met       fuel type per item + fuel responsibility request-wide + override
AC-27  ✓ Met       Step1Project.tsx site access MultiChips
AC-28  ⚠ Partial   Step1 equipment year present; app uses max_equipment_age (Q6 mapping)
AC-29  ✓ Met       gates.ts gateStep2 blocks advance until items resolved
AC-30  ✓ Met       ItemRow.tsx no-match: Provide it for me? / Cancel
AC-31  ✓ Met       ItemRow.tsx:63 wa.me open + removeItem
AC-32  ✓ Met       ItemRow.tsx Cancel → removeItem
AC-33  ✓ Met       gates.ts postableItems excludes no-match/removed
AC-34  ✓ Met       postableItems → mapped items still post
AC-35  ✓ Met       Step3Preferences.tsx Core Terms + Optional Extras, no banner
AC-36  ✓ Met       Step3 payment terms + method
AC-37  ✓ Met       Step3 maintenance + conditional SLA (supplier only)
AC-38  ✓ Met       Step3 additional notes
AC-39  ✓ Met       Step3 budget in SAR
AC-40  ✓ Met       Step3 supplier filters (verified/subletting/bid window)
AC-41  ✓ Met       Step4Preview.tsx project + preferences + items summary
AC-42  ✓ Met       Step4 submit → Confirmation.tsx (stay on web)
AC-43  ✓ Met       app-adapters BROADCAST single request; postableItems
AC-44  ✓ Met       Wizard.tsx back-free, forward-gated
AC-45  ⚠ Partial   EN+AR UI strings Met; Arabic *parsing* is agent-side (external/mock)
AC-46  ⚠ Partial   RTL-capable but flag-gated OFF (RTL_ENABLED=false) — deferred, plan Q1
AC-47  ✓ Met       Step1Project.tsx resolveLocationConflict (text/file picker)
AC-48  ✓ Met       Step1Project.tsx multi-location prompt (detectedLocations>1)
AC-49  · OOS       retired AC (per changelog) — no code
AC-50  ✓ Met       rfq-store SET_CERTIFICATES propagates safety→operator cert
AC-51  ✓ Met       project settings vs per-item options split (draft model)
AC-52  ✓ Met       spec-sheet.ts buildSpecRows + downloadCsv (excludes Not available)
AC-53  ✓ Met       per-item additionalNotes editable; agent advisory shown
AC-54  ✓ Met       verdictToStatus mapping; details editable only once Matched
AC-55  ✓ Met       ItemRow quantity stepper (min 1, default 1)
AC-56  ✓ Met       Processing.tsx summary counts (computeSummary)
AC-57  ⚠ Partial   agent prefill consumed (operator/fuel/qty); confidence badge minimal
```

## Notes on the 4 Partials / 1 OOS
- **AC-28** — UI offers `Any/2020–2026`; the app schema field is `max_equipment_age` (number). The
  relay maps it. Faithful to the spec text; flagged in plan.md Q6 for PM reconciliation.
- **AC-45** — The web is fully EN+AR (strings + RTL-ready). Arabic *RFQ parsing* is Mansour's job
  (external); verifiable only once the agent is connected.
- **AC-46** — Layout is RTL-capable (logical CSS + `dir`), but the visual mirror is gated OFF until
  STANDARDS resolves RTL (plan.md Q1). Tentative AC.
- **AC-57** — The UI consumes agent-prefilled operator/fuel/quantity; the per-field *confidence*
  display is minimal (a badge on quantity). Could be richened once real confidences flow in.
- **AC-49** — Retired during pre-merge authoring; intentionally no code.

## Overarching caveat
Every "Met" above is verified at the **web/UI layer against the mock + contract**. Full end-to-end
sign-off (especially the `[Mansour]` ACs: 04, 05, 06, 09, 19, 20, 45, 47, 48, 53, 55, 56, 57)
requires the **real agent + agents-backend connection** (T9/#9), which is built-but-off pending
`MANSOUR_URL` / `AGENTS_API_URL` + token and Mansour's contract freeze.
