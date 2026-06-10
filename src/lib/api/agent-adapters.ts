import {
  AgentDraft,
  EquipmentItem,
  ProjectDetails,
  defaultProjectDetails,
  defaultOperatorDetails,
  defaultOperatorNeeded,
  computeSummary,
  type FuelType,
  type RentalBasis,
  type OvertimeRate,
  type Verdict,
} from "@/lib/contract";
import type { RFQAgentOutput, RFQHeader, RFQLineItem, MissingFieldEntry } from "@/lib/contract/agent";

/**
 * Mansour's `POST /rfq` envelope is double-nested and uses `ok` (not `success`):
 *   { ok, data: { rfq_id, data: { rfq_header, line_items }, missing_required_fields,
 *                 summary_counts, sender_contact, extraction_empty? } }
 * It may also arrive flattened to { ok, data: { rfq_header, line_items, missing_required_fields } }.
 * These helpers read BOTH shapes so Mansour needn't reshape while its contract is in flux.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object";

/** Unwrap the `{ ok|success, data }` envelope → the inner "A" object. */
export function unwrapEnvelope(raw: unknown): Obj {
  if (!isObj(raw)) return {};
  if (("ok" in raw || "success" in raw) && isObj(raw.data)) return raw.data;
  return raw;
}

/** Extract the agent output from the envelope, wherever the payload sits. */
export function extractAgentOutput(raw: unknown): RFQAgentOutput {
  const a = unwrapEnvelope(raw);
  // The agent output may live at the top, under `data` (flattened), or under `result` — the async
  // job-poll wrapper is `{ data: { status, result: { rfq_header, line_items, ... } } }`, so after
  // unwrapEnvelope the payload is one level deeper, under `result`. Pick the level that actually
  // carries rfq_header / line_items.
  const candidates: Obj[] = [a];
  if (isObj(a.result)) candidates.push(a.result);
  if (isObj(a.data)) {
    candidates.push(a.data);
    if (isObj(a.data.result)) candidates.push(a.data.result);
  }
  const b = candidates.find((c) => "rfq_header" in c || "line_items" in c) ?? a;
  return {
    rfq_header: (b.rfq_header ?? {}) as RFQHeader,
    line_items: (Array.isArray(b.line_items) ? b.line_items : []) as RFQLineItem[],
    missing_required_fields: (Array.isArray(b.missing_required_fields)
      ? b.missing_required_fields
      : Array.isArray(a.missing_required_fields)
        ? a.missing_required_fields
        : []) as MissingFieldEntry[],
  };
}

/** AC-09: did the agent extract nothing usable? */
export function isExtractionEmpty(raw: unknown): boolean {
  const a = unwrapEnvelope(raw);
  if (a.extraction_empty === true) return true;
  return extractAgentOutput(raw).line_items.length === 0;
}

/** Job status from a `GET /rfq/jobs/:id` body (best-effort across status vocabularies). */
export function jobStatus(raw: unknown): "pending" | "done" | "error" {
  const a = unwrapEnvelope(raw);
  const s = String(a.status ?? a.state ?? "").toLowerCase();
  if (["failed", "error", "errored"].includes(s)) return "error";
  if (["pending", "processing", "queued", "running", "in_progress"].includes(s)) return "pending";
  if (["done", "completed", "succeeded", "success"].includes(s)) return "done";
  // No explicit status (or a done-ish one) → done iff a result is present.
  return extractAgentOutput(raw).line_items.length > 0 || a.extraction_empty === true || isObj(a.data) ? "done" : "pending";
}

/**
 * Adapt Mansour's `RFQAgentOutput` → the UI view-model (`AgentDraft`).
 *
 * The renter-facing verdict isn't a field Mansour emits — it's DERIVED here from the match
 * annotations (`category_match` / `subtype_match` / `capacity_match` / `fuel_type_match`) plus
 * `capacity_advisory` and `missing_required_fields`. See plan.md Q5 for the mapping rationale.
 * SNAPSHOT (2026-06-10): re-sync with src/lib/contract/agent.ts if Mansour's output changes.
 */
export function agentOutputToDraft(out: RFQAgentOutput): AgentDraft {
  const items = (out.line_items ?? []).map((li, idx) => toItem(li, idx));
  return {
    project: toProject(out.rfq_header ?? {}),
    items,
    // Mansour now returns an explicit detected_locations list (AC-48); fall back to the single
    // address label for older/flattened payloads that omit it.
    detectedLocations: (Array.isArray(out.rfq_header?.detected_locations) && out.rfq_header.detected_locations.length
      ? out.rfq_header.detected_locations
      : [out.rfq_header?.project_address_label]
    ).filter(Boolean) as string[],
    summary: computeSummary(items),
  };
}

const RENTAL_IN: Record<string, RentalBasis> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" };
const FUEL_IN: Record<string, FuelType> = { DIESEL: "diesel", PETROL: "petrol", ELECTRIC: "electric" };
const OVERTIME_IN: Record<string, OvertimeRate> = { "0": "without", "1.5X": "1.5x", "2X": "2x" };
const CAP_NEEDS_CHECK = new Set(["snapped", "converted", "range", "not_specified", "new"]);

function deriveVerdict(li: RFQLineItem): { verdict: Verdict; resolved: boolean } {
  const isNew = li.category_match === "new" || li.subtype_match === "new" || li.category === "No Equipment Found";
  if (isNew || !li.category_id || !li.subtype_id) return { verdict: "no-match", resolved: false };
  const needsCheck =
    (li.capacity_match && CAP_NEEDS_CHECK.has(li.capacity_match)) ||
    li.fuel_type_match === "defaulted" ||
    Boolean(li.capacity_advisory) ||
    !li.capacity_id; // capacity not resolved → renter must pick
  return needsCheck ? { verdict: "needs-validation", resolved: false } : { verdict: "confident", resolved: true };
}

function toItem(li: RFQLineItem, idx: number): EquipmentItem {
  const { verdict, resolved } = deriveVerdict(li);
  const ref = {
    categoryId: li.category_id ?? null,
    subcategoryId: li.subtype_id ?? null,
    measurementId: li.capacity_id ?? null,
  };
  const operatorNeeded = li.operator_included == null ? defaultOperatorNeeded(ref.subcategoryId) : li.operator_included ? "yes" : "no";
  return {
    id: `a${idx}`,
    rawLabel: li.input_equipment ?? null,
    ref,
    verdict,
    resolved,
    removed: false,
    suggestion: li.capacity_id && li.capacity_match && CAP_NEEDS_CHECK.has(li.capacity_match) ? { measurementId: li.capacity_id } : undefined,
    advisory: li.capacity_advisory ?? null,
    quantity: li.quantity ?? 1,
    operatorNeeded,
    operator: {
      ...defaultOperatorDetails(),
      nightShift: li.night_shift_required ?? false,
      nationality: li.operator_nationality ?? null,
    },
    fuelType: (li.fuel_type_preference && FUEL_IN[li.fuel_type_preference]) || "diesel",
    additionalNotes: "",
    deliveryOverride: li.mobilization_by_rentee == null ? null : li.mobilization_by_rentee ? "me" : "supplier",
    returnOverride: li.demobilization_by_rentee == null ? null : li.demobilization_by_rentee ? "me" : "supplier",
    fuelResponsibilityOverride: null,
  };
}

function toProject(h: RFQHeader): ProjectDetails {
  const p = defaultProjectDetails();
  p.location = {
    label: h.project_address_label ?? null,
    lat: h.project_lat ?? undefined,
    lng: h.project_lng ?? undefined,
    confirmed: false, // AC-16: always re-confirmed by the renter, even when extracted
    source: "agent",
  };
  p.timing.rentalBasis = h.rental_type ? RENTAL_IN[h.rental_type] ?? null : null;
  p.timing.startDate = h.start_date ?? null;
  p.timing.endDate = h.end_date ?? null;
  p.timing.hoursPerDay = h.working_hours_per_day ?? 8;
  p.advanced.workingDaysPerWeek = h.working_days_per_week ?? 6;
  p.advanced.overtimeRate = h.overtime_rate ? OVERTIME_IN[h.overtime_rate] ?? "without" : "without";
  return p;
}
