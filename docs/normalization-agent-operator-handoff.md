# Normalization Agent: a stated operator is labelled "suggested", dropped, or misread

**For:** the Normalization-Agent repo (Mansour), `/rfq/jobs` with `source: "web_rfq"`, `evidence_only: true`
**From:** the renter web app, 2026-10-05
**Reported by the owner:** *"when i write with operator to the agent the operator panel is not open"*

## Summary

When the renter writes that they want an operator, the agent either reads it and labels it as its own
guess, or does not read it at all. Arabic is worse than English. The web has a stop-gap for one of the
four cases below; the rest can only be fixed here.

## Evidence (live production agent, 2026-10-05)

All sent to `https://normalization-agent-production.up.railway.app/rfq/jobs` with
`{"source": "web_rfq", "evidence_only": true}`.

| # | Renter typed | Agent returned | Should be |
|---|---|---|---|
| 1 | `crawler excavator 20 ton with operator` | `operator_included: true` **plus** `field_notes: [{field: "line_items[0].operator_included", note: "suggested"}]` (job `8b53366a-5cc2-4a94-9e52-6189a7ed853a`) | `true`, **no** note |
| 2 | `2 forklifts with operator for 3 months in Riyadh` | `operator_included: true`, no note (job `691dcd66-18c9-4c36-9bb1-b1ff42a5263a`) | correct |
| 3 | `حفار جنزير 20 طن مع مشغل` (crawler excavator 20 ton **with operator**) | `operator_included: false` **plus** the "suggested" note (job `2deced23-213d-4dba-a56d-f5654fb56598`) | `true`, no note |
| 4 | `مولد كهربائي 250 كيلو فولت أمبير مع مشغل` (250 kVA generator with operator) | matched as **All-Terrain Crane, 250 ton**; operator in `missing_required_fields` (job `b1dd3386-c9fc-4ec7-aa77-6cb9e144bf40`) | Generator, 250 kVA, operator `true` |
| 5 | `مولد 250 كيلو مع مشغل والوقود على المورد` (generator 250 kVA with operator, fuel on the supplier) | `No Equipment Found (new)`, operator and fuel both absent | Generator, operator `true`, `diesel_included: true` |

Cases 1 and 2 are the same sentence shape. Whether the note appears is not stable, which is why the
owner saw it as random.

## Why it matters

The note `"suggested"` on `operator_included` is the agent's contract for *"the text was silent and I
filled this from the OPERATOR SUGGESTION MAP"* (`src/constants/rfq-prompt.ts:1444-1446`). The web
trusts it: a suggested operator is turned off, because an operator nobody asked for puts a priced term
on every bid (web `agent-adapters.ts`, rule from 2026-08-26). So a wrong "suggested" label on a
**stated** operator turns the renter's own request off.

## Root cause

1. **The note is model output, not code.** The prompt says to emit it only on a silent line, but the
   model emits it on a line that says "with operator" (case 1) and even inverts the value (case 3).
   Nothing after the model checks the label against the text.
2. **The deterministic operator reader is English only and not used on the full path.**
   `equipment-quick-match.ts:231-233` has `OPERATOR_YES` / `OPERATOR_NO`, which would have answered
   cases 1 and 3 correctly if they covered Arabic and ran after the LLM on Tier 2.
3. **Arabic generator lines mis-resolve** (cases 4 and 5): `مولد` is not reaching the generator
   subtype, and `كيلو فولت أمبير` / `كيلو` is read as tons.

## Asked changes

1. **Post-process `operator_included` from the text, after the model, on every path.** In
   `rfq.service.ts`, where `field_notes` is normalised (around line 725):
   - read the renter's input (message plus attachment transcripts) with a stated-operator test;
   - **stated yes** (EN `with operator|with driver|operated|wet hire|operator included`, AR
     `مع مشغل|مع مشغّل|مع سائق|بمشغل|بسائق|شامل المشغل|شامل السائق`): set `true`, delete the
     "suggested" note for that line;
   - **stated no** (EN `without operator|no operator|no driver|equipment only|dry hire|bare rental`,
     AR `بدون مشغل|بلا مشغل|من غير مشغل|بدون سائق|بلا سائق`): set `false`, delete the note;
   - both or neither: leave the model's answer and note alone.
   For a multi-line message, apply it per line when the line can be located, otherwise only when
   every line agrees.
2. **Add the Arabic forms to `OPERATOR_YES` / `OPERATOR_NO`** in `equipment-quick-match.ts`, so Tier 0
   and Tier 1 agree with item 1.
3. **Arabic generator matching:** `مولد` / `مولد كهربائي` → Generator, and `كيلو فولت أمبير`,
   `ك.ف.أ`, `kva` → kVA, never tons.
4. **Fuel in Arabic:** `الوقود على المورد` → `diesel_included: true`; `الوقود علينا` /
   `الوقود على المستأجر` → `false`.

## Acceptance tests

| Input | `operator_included` | Note on it |
|---|---|---|
| `crawler excavator 20 ton with operator` | `true` | none |
| `forklift with driver` | `true` | none |
| `crawler excavator 20 ton without operator` | `false` | none |
| `forklift, dry hire` | `false` | none |
| `حفار جنزير 20 طن مع مشغل` | `true` | none |
| `حفار جنزير 20 طن بدون مشغل` | `false` | none |
| `tower crane 10 ton` (silent, SUGGEST true) | `true` | `suggested` |
| `excavator 20 ton` (silent, NO SUGGESTION) | absent | none |
| `مولد كهربائي 250 كيلو فولت أمبير مع مشغل` | `true`, subtype Generator, capacity 250 kVA | none |
| `مولد 250 كيلو مع مشغل والوقود على المورد` | `true`, `diesel_included: true` | none |

Run each at least five times: case 1 vs case 2 shows the label is not stable from run to run.

## What the web already did (do not undo)

The web now sends a flag when the renter's text asks for an operator (and does not refuse one). With
it, the web keeps an agent `true` even if it carries the "suggested" note. That covers case 1 only. It
cannot fix case 3 (the agent says `false`), 4 or 5, and it is request-wide, so for a multi-line
message a suggested operator on another line is kept too. Once item 1 above ships, the web flag
becomes a no-op and can stay as a guard.
