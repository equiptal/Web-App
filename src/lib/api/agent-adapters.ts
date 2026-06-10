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
import type { RFQAgentOutput, RFQHeader, RFQLineItem } from "@/lib/contract/agent";

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
    detectedLocations: [out.rfq_header?.project_address_label].filter(Boolean) as string[],
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
