# UAT Verification — Renter web RFQ creation (agent-assisted)

**Card:** https://github.com/equiptal/moedatech-specs/issues/245
**Spec:** https://github.com/equiptal/moedatech-specs/tree/main/products/web-app/epics/002-rfq-creation/
**Audited:** 2026-06-10
**Branch:** web-app/002-rfq-creation
**HEAD:** 955968f

> **Re-audit context.** This supersedes `ac-check.md` (audited against the stand-in mock). Since then:
> real Mansour parse is wired and the adapter is synced to the live flat `data.result` contract;
> the real agents-backend catalogue is reachable (id-parity with Mansour confirmed); and the
> `create_request` payload now implements all 6 ALIGNMENT rules + every §4.2 field.
> **Live end-to-end submit now verified** (2026-06-10): after the backend create handler was fixed,
> a full draft posted through the BFF relay (`POST /api/requests` → `draftToCreateRequest` → staging)
> returned **201 `requestId: 00088`** — every rule-4/6 + §4.2 field accepted (custom-year, overtime
> enum, dieselIncluded, fatRequired, nightShiftRequired, operatorNationality, fanned
> safetyCertifications, localContent/requiredCerts split). AC-42/43 confirmed against a real create.

## Summary
- Met: 55
- Partial: 1 (AC-46 — deferred, blocked on STANDARDS § RTL)
- Not met: 0
- Out of scope: 1 (AC-49, retired)

> Updated 2026-06-10 after the Step-6 walk: AC-28 fixed (Customize… added) → Met; AC-57 re-verdicted
> Met (status = renter-facing confidence, per PM); AC-46 deferred pending STANDARDS § RTL.

## Per-AC findings

Met entries are compact (verdict + evidence). Partial / OOS entries carry the verbatim AC text and a
gap note, since those are the ones walked in Step 6.

```
AC-01  ✓ Met       components/screens/Intake.tsx:60-96            RFQ/Manual tabs + paste + upload
AC-02  ✓ Met       components/CreateSurface.tsx:15 + screens/GuestBlock.tsx   guest blocked at entry
AC-03  ✓ Met       lib/session/index.tsx:27-30                    canCreate gate persists; account form OOS per AC
AC-04  ✓ Met       components/screens/Processing.tsx:18-31,76-82  progressive reveal (real agent)
AC-05  ✓ Met       components/screens/Intake.tsx:11-19,30-52       file→base64; accepted types
AC-06  ✓ Met       app/api/agent/process/route.ts:30-34            text+files in one NormalizeRequest
AC-07  ✓ Met       components/screens/Intake.tsx:11-19,98           reject + accepted-types message
AC-08  ✓ Met       components/screens/Intake.tsx (no caps)          no size/count/length limit
AC-09  ✓ Met       app/api/agent/process/route.ts:26 + jobs/[id]/route.ts:28  empty→error retry/manual
AC-10  ✓ Met       lib/store/rfq-store.tsx:143-149                  network error; GO_INTAKE preserves text/files
AC-11  ✓ Met       components/wizard/Step1Project.tsx:41-198        4 cards
AC-12  ✓ Met       lib/contract/gates.ts:17-25                      gateStep1
AC-13  ✓ Met       components/wizard/Step1Project.tsx:104-117       daily/weekly/monthly + extendable + quote note
AC-14  ✓ Met       components/wizard/Step1Project.tsx:119-135       dates optional; hours default 8
AC-15  ✓ Met       components/wizard/Step1Project.tsx:138-179       Advanced + collapsed summary
AC-16  ✓ Met       components/wizard/Step1Project.tsx:95-100; store CONFIRM_LOCATION  starts unconfirmed
AC-17  ✓ Met       components/wizard/ItemRow.tsx:118-131            confident→Matched, still editable
AC-18  ✓ Met       lib/contract/gates.ts:31-42                      needs-validation blocks until approve/edit
AC-19  ✓ Met       components/wizard/ItemRow.tsx:116,140; store APPROVE_SUGGESTION  nearest suggested + gate
AC-20  ✓ Met       components/wizard/ItemRow.tsx:99-115             unit conversion / advisory shown (see note)
AC-21  ✓ Met       lib/store/rfq-store.tsx:192-217                  taxonomy-bound cascade
AC-22  ✓ Met       components/wizard/Step2Equipment.tsx:108; store ADD_ITEM  add via nested taxonomy
AC-23  ✓ Met       components/wizard/ItemRow.tsx:197-206            remove confirm modal
AC-24  ✓ Met       components/wizard/ItemRow.tsx:170-183; options.ts:68  operator default + sub-fields
AC-25  ✓ Met       components/wizard/Step2Equipment.tsx:53-67 + ItemRow OverrideField  request-wide + override
AC-26  ✓ Met       Step2Equipment.tsx:63-65 + ItemRow.tsx:163-165,192  fuel per item + responsibility request-wide
AC-27  ✓ Met       components/wizard/Step1Project.tsx:170-176       site access multi-select
AC-28  ✓ Met       components/wizard/Step1Project.tsx:162-189       Any + 2020–2026 + Customize… → custom:<year>
AC-29  ✓ Met       lib/contract/gates.ts:45-51                      gateStep2
AC-30  ✓ Met       components/wizard/ItemRow.tsx:51-74              no-match two actions
AC-31  ✓ Met       components/wizard/ItemRow.tsx:60-68              WhatsApp + remove
AC-32  ✓ Met       components/wizard/ItemRow.tsx:69-71              cancel removes
AC-33  ✓ Met       lib/contract/gates.ts:59-61                      postableItems excludes no-match
AC-34  ✓ Met       lib/api/app-adapters.ts:81 (postableItems)       remaining items still post
AC-35  ✓ Met       components/wizard/Step3Preferences.tsx:33,89     Core Terms + Optional Extras, no banner
AC-36  ✓ Met       components/wizard/Step3Preferences.tsx:37-54     payment terms + method
AC-37  ✓ Met       components/wizard/Step3Preferences.tsx:59-79     maintenance + conditional SLA (supplier only)
AC-38  ✓ Met       components/wizard/Step3Preferences.tsx:82-84     additional notes
AC-39  ✓ Met       components/wizard/Step3Preferences.tsx:91-98     budget in SAR
AC-40  ✓ Met       components/wizard/Step3Preferences.tsx:100-121   verified / subletting / bid window
AC-41  ✓ Met       components/wizard/Step4Preview.tsx:51-88         project + preferences + items
AC-42  ✓ Met       components/wizard/Step4Preview.tsx:93-97 + screens/Confirmation.tsx  submit→confirmation, stay on web
AC-43  ✓ Met       lib/api/app-adapters.ts:96 (equipmentItems[])    single broadcast, all items
AC-44  ✓ Met       components/wizard/Wizard.tsx:26-27,43-45,77      back free, forward gated
AC-45  ✓ Met       lib/i18n/{en,ar}.ts + live Mansour                EN+AR UI; Arabic parse now live (see note)
AC-46  ⚠ Partial   (RTL_ENABLED gated off)                          STANDARDS § RTL unresolved (see below)
AC-47  ✓ Met       components/wizard/Step1Project.tsx:65-80; store RESOLVE_LOCATION_CONFLICT  conflict picker
AC-48  ✓ Met       Step1Project.tsx:31,49-63 + agent-adapters detected_locations  multi-location prompt (now real)
AC-49  · OOS       retired (changelog 2026-06-09) — no code
AC-50  ✓ Met       lib/store/rfq-store.tsx:175-185                  Safety+Other; safety→item certificate
AC-51  ✓ Met       lib/contract/draft.ts (project vs per-item split)  request-wide vs per-item
AC-52  ✓ Met       lib/export/spec-sheet.ts:29-71 + Step4Preview     table + CSV export, excludes Not available
AC-53  ✓ Met       components/wizard/ItemRow.tsx:128,186-188         per-item notes editable; agent advisory
AC-54  ✓ Met       components/wizard/ItemRow.tsx:43,160-161,240-251  verdict→status; details editable once Matched
AC-55  ✓ Met       components/wizard/ItemRow.tsx:123 (Stepper min 1)  quantity, default 1
AC-56  ✓ Met       components/screens/Processing.tsx:69-74           processing summary counts
AC-57  ✓ Met       lib/api/agent-adapters.ts:99-129 (toItem)         prefill+edit+fallback; status = renter-facing confidence
```

---

### AC-28 — Equipment year (project-level)
**AC text (verbatim):**
> **Given** Step 1 `Advanced`
> **Then** `Equipment year` applies to all items (not per item) with values `Any` + `2020`–`2026` + `Customize…`
> **And** it is optional
> **And** safety certification is a project-level setting (see AC-50), not a per-item field.

**Verdict:** Met

**Evidence:**
- Implementation: `components/wizard/Step1Project.tsx:162-189` — the `Equipment year` Select offers `Any` + `2020`–`2026` + **`Customize…`**; picking `Customize…` reveals a year number-input that stores `custom:<year>`. Project-level, optional, applies to all items. Safety cert is project-level (AC-50). ✅
- Backend mapping: `lib/api/app-adapters.ts:49-53` `toManufactureYear` → `maxEquipmentAge` stores the *year*; `any`/empty-custom ⇒ omitted, `custom:<year>` ⇒ the int. Verified: `custom:2019` → `2019`. ✅
- Test: no test.

**Notes (fixed 2026-06-10):** `Customize…` affordance added this run, closing the only gap. The `ac-check.md` year-vs-age mapping concern was already resolved (we store the year, matching mobile rows).

---

### AC-46 — Right-to-left rendering in Arabic
**AC text (verbatim):**
> **Given** the renter's language is Arabic
> **Then** the RFQ flow renders right-to-left (tentative — PM-confirm; [STANDARDS § RTL] is unresolved).

**Verdict:** Partial

**Evidence:**
- Implementation: layout uses logical CSS properties and is RTL-capable, but the visual mirror is gated **off** (`RTL_ENABLED=false`).
- Test: no test.

**Notes:** The AC is explicitly tentative and the brief's own Open question records that STANDARDS § RTL is **TBD**. The flow is RTL-ready but the mirror is deliberately disabled pending that standards decision. Unchanged since `ac-check.md`; blocked on a spec/standards resolution, not on web code.

**Deferred:** blocked on STANDARDS § RTL resolution (out of web-app/002's control). File a follow-up to flip `RTL_ENABLED` + QA the Arabic mirror once standards settle.

---

### AC-57 — Agent pre-populates per-item fields from the RFQ
**AC text (verbatim):**
> **Given** an RFQ that implies per-item values (e.g. operator need, fuel type)
> **When** the agent processes it
> **Then** it pre-fills the per-item fields it can infer (operator, fuel type, and other inferable fields), each shown with its confidence
> **And** the renter can confirm or edit any pre-filled value
> **And** fields it cannot infer fall back to their defaults (operator per AC-24, fuel `diesel` per AC-26).

**Verdict:** Met

**Evidence:**
- Implementation: `lib/api/agent-adapters.ts:99-129` (`toItem`) consumes Mansour's `operator_included`, `fuel_type_preference`, `quantity`, `night_shift_required`, `operator_nationality`, `mobilization/demobilization_by_rentee` into the item, and falls back to defaults (`defaultOperatorNeeded`, fuel `diesel`) when null. Renter can edit every value in `ItemRow`. The renter-facing confidence is the per-item status `Matched` / `Needs your OK` / `Not available` (`ItemRow.tsx:43,240-251`, AC-54).
- Test: no test.

**Notes (re-verdicted from Partial, 2026-06-10):** Per PM (Yara): the verdict-level status — `Matched` / `Needs your OK` / `Not available` — *is* the renter-facing confidence the AC means by "shown with its confidence". A finer per-field confidence signal is owned on the **Mansour side** (Yara will handle), not a web-app gap. Prefill + edit + default-fallback are all implemented, so the web AC is Met. `EquipmentItem.fieldConfidence` remains in the model as a forward hook if Mansour later emits per-field confidence.

---

### AC-49 — (removed) Per-item model field
**Verdict:** Out of scope — retired during pre-merge authoring (changelog 2026-06-09); ID retained, not reused. No code.
