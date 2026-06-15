import {
  AgentDraft,
  EquipmentItem,
  ProjectDetails,
  Preferences,
  defaultProjectDetails,
  defaultPreferences,
  defaultOperatorDetails,
  defaultOperatorNeeded,
  computeSummary,
  SAFETY_CERTIFICATES,
  PAYMENT_TERMS,
  PAYMENT_METHODS,
  MAINTENANCE_RESPONSIBILITIES,
  BID_WINDOWS,
  type FuelType,
  type RentalBasis,
  type OvertimeRate,
  type Verdict,
  type Party,
  type OperatorCertificate,
  type OtherCertificate,
  type PaymentTerm,
  type PaymentMethod,
  type MaintenanceResponsibility,
  type MaintenanceSla,
  type BidWindow,
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
    // justifications sit beside `data` (sibling of missing_required_fields), so read b then a.
    justifications: (Array.isArray(b.justifications)
      ? b.justifications
      : Array.isArray(a.justifications)
        ? a.justifications
        : []) as string[],
    field_notes: (Array.isArray(b.field_notes)
      ? b.field_notes
      : Array.isArray(a.field_notes)
        ? a.field_notes
        : []) as { field: string; note: string }[],
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
  // Surface the agent's per-item capacity guidance (the question it raised for an unresolved size)
  // next to "pick a size to approve". Keyed by the same line-item index toItem used (id "a<idx>").
  const mrf = out.missing_required_fields ?? [];
  items.forEach((it, idx) => {
    const cap = mrf.find((m) => m?.field === `line_items[${idx}].capacity`);
    if (cap?.question_for_customer) it.sizeNote = cap.question_for_customer;
  });
  const project = toProject(out.rfq_header ?? {});
  // AC-25/26: reconcile the agent's per-item mob/demob/fuel-responsibility with the request-wide
  // "Settings for all items": all items same → lift to request-wide + clear the per-item overrides;
  // items differ → request-wide shows no selection (null), per-item overrides kept.
  reconcileRequestWide(items, "deliveryOverride", (v) => (project.deliveryToSite = v));
  reconcileRequestWide(items, "returnOverride", (v) => (project.returnFromSite = v));
  reconcileRequestWide(items, "fuelResponsibilityOverride", (v) => (project.fuelResponsibility = v));
  // AC-50: equipment-level safety certs the agent detected (per-item safety_certifications, e.g. the
  // equipment must hold SASO/TÜV) → project-level Safety field. Tolerates single value or array.
  const equipSafety = (out.line_items ?? []).flatMap((li) => safetyList(li.safety_certifications));
  // AC-50: if the items that HAVE an agent-set operator certificate all share the same set (e.g. all
  // TÜV), also reflect it at project level and let that control them. No-operator items (no cert)
  // don't block this — they just aren't counted.
  const certLists = items.map((i) => i.operator.certificate).filter((c) => c.length > 0);
  const certKey = (c: OperatorCertificate[]) => [...c].sort().join(",");
  const sharedOperatorCerts =
    certLists.length > 0 && certLists.every((c) => certKey(c) === certKey(certLists[0])) ? certLists[0] : [];
  if (sharedOperatorCerts.length) for (const i of items) i.operator.certByAgent = false;
  const projectSafety = [...new Set([...equipSafety, ...sharedOperatorCerts])];
  if (projectSafety.length) project.certificates.safety = projectSafety;
  // Field-keyed agent notes (dotted path → note) for inline rendering beside each field.
  const fieldNotes: Record<string, string> = {};
  for (const fn of out.field_notes ?? []) {
    if (fn?.field && typeof fn.note === "string" && fn.note.trim()) fieldNotes[fn.field] = fn.note.trim();
  }
  return {
    project,
    items,
    preferences: toPreferences(out.rfq_header ?? {}), // AC-36/37/39/40: prefill Step-3 from the agent
    // Mansour now returns an explicit detected_locations list (AC-48); fall back to the single
    // address label for older/flattened payloads that omit it.
    detectedLocations: (Array.isArray(out.rfq_header?.detected_locations) && out.rfq_header.detected_locations.length
      ? out.rfq_header.detected_locations
      : [out.rfq_header?.project_address_label]
    ).filter(Boolean) as string[],
    summary: computeSummary(items),
    justifications: out.justifications ?? [],
    fieldNotes,
  };
}

type OverrideKey = "deliveryOverride" | "returnOverride" | "fuelResponsibilityOverride";
/**
 * Reconcile per-item agent values with the request-wide control (AC-25/26):
 *  - every item shares one explicit value → set request-wide to it, clear the per-item overrides;
 *  - items disagree (or a mix of set/unset) → request-wide = null (no selection), keep overrides;
 *  - the agent set none → leave the request-wide default untouched.
 */
function reconcileRequestWide(items: EquipmentItem[], key: OverrideKey, set: (v: Party | null) => void): void {
  if (!items.length) return;
  const vals = items.map((i) => i[key]);
  if (vals.every((v) => v == null)) return; // agent set none → keep default
  if (vals.every((v) => v === vals[0])) {
    set(vals[0]); // all items the same explicit value → lift to request-wide
    for (const i of items) i[key] = null;
  } else {
    set(null); // items disagree → no selection on the shared control
  }
}

const RENTAL_IN: Record<string, RentalBasis> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" };
const FUEL_IN: Record<string, FuelType> = { DIESEL: "diesel", PETROL: "petrol", ELECTRIC: "electric" };
const OVERTIME_IN: Record<string, OvertimeRate> = { "0": "without", "1.5X": "1.5x", "2X": "2x" };
// Agent cert enum → our UI option. Mansour emits SPSP / TUV / TUV_INSPECTION / SASO; the UI uses
// tuv / spsp / saso-technical. Both operator license levels AND equipment safety certs go through this,
// so "SASO" and "TUV_INSPECTION" stop getting silently dropped (they matched no UI option before).
const CERT_NORM: Record<string, OperatorCertificate> = {
  SPSP: "spsp",
  TUV: "tuv",
  TUV_INSPECTION: "tuv",
  SASO: "saso-technical",
};
const SLA_IN: Record<string, MaintenanceSla> = { FOUR_HR: "4h", EIGHT_HR: "8h", TWENTY_FOUR_HR: "24h", FORTY_EIGHT_HR: "48h", SEVENTY_TWO_HR: "72h" };
const CAP_NEEDS_CHECK = new Set(["snapped", "converted", "range", "not_specified", "new"]);

/** Keep a Mansour-emitted value only if it maps to a known UI option. Tolerant of case and
 *  space/underscore vs hyphen (e.g. "NET_30" / "Net 30" → "net-30"); ignores anything unmatched. */
function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  const a = allowed as readonly string[];
  const lower = value.toLowerCase().trim();
  const norm = lower.replace(/[\s_]+/g, "-");
  if (a.includes(lower)) return lower as T;
  return a.includes(norm) ? (norm as T) : undefined;
}

function normCert(value: string | null | undefined): OperatorCertificate | undefined {
  if (!value) return undefined;
  const up = value.toUpperCase().trim();
  if (CERT_NORM[up]) return CERT_NORM[up];
  return pick(value, SAFETY_CERTIFICATES) as OperatorCertificate | undefined; // tolerate already-UI-form values
}
/** Coerce the agent's safety_certifications (single value OR array OR null) to a normalized list. */
function safetyList(v: string[] | string | null | undefined): OperatorCertificate[] {
  const raw = Array.isArray(v) ? v : v ? [v] : [];
  return raw.map((c) => normCert(c)).filter((c): c is OperatorCertificate => c != null);
}
/** Mansour's per-item operator cert(s) from the OPERATOR license level(s): prefer the full array
 *  (operator_license_levels), fall back to the singular. The chip is multi-select, so we return ALL.
 *  Equipment safety certs (safety_certifications) are surfaced at the PROJECT level, not here. */
function toOperatorCert(li: RFQLineItem): OperatorCertificate[] {
  const levels = li.operator_license_levels?.length
    ? li.operator_license_levels
    : li.operator_license_level
      ? [li.operator_license_level]
      : [];
  return [...new Set(levels.map((c) => normCert(c)).filter((c): c is OperatorCertificate => c != null))];
}

function deriveVerdict(li: RFQLineItem): { verdict: Verdict; resolved: boolean } {
  const isNew = li.category_match === "new" || li.subtype_match === "new" || li.category === "No Equipment Found";
  if (isNew || !li.category_id || !li.subtype_id) return { verdict: "no-match", resolved: false };
  // A genuine NEW size — an on-axis value above the taxonomy that resolved to NO measurement id —
  // is "Not available / add as new", NOT a Need-your-OK suggestion (per the size rule). Off-axis /
  // wrong-unit sizes now resolve to an existing entry (capacity_match "converted" + id), so they
  // don't reach here; only a true above-the-catalog size does.
  if (li.capacity_match === "new" && !li.capacity_id) return { verdict: "no-match", resolved: false };
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
  const agentCert = toOperatorCert(li); // AC-50: operator cert(s) the agent set from the RFQ (empty if none)
  return {
    id: `a${idx}`,
    rawLabel: li.input_equipment ?? null,
    // ONLY the size the renter literally typed (capacity_input_value) — so "FROM YOUR RFQ" never
    // shows a size they didn't write. NEVER fall back to li.capacity (that's the agent's RESOLVED
    // size; it belongs in "MATCHED TO", not the raw input). null when the renter stated no size.
    rawSize: li.capacity_input_value ?? null,
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
      certificate: agentCert, // AC-24/50: operator license level(s) (multi-select)
      certByAgent: agentCert.length > 0, // agent set it → project-level Safety cert won't override
      // AC-24: F.A.T — who covers the operator's Food/Accommodation/Transport. Mansour emits
      // operator_accommodation_by_rentee (true = rentee/me, false = supplier); supplier only when
      // explicitly false, else me (matches the default). Merges the old transfer+accommodation pair.
      fat: li.operator_accommodation_by_rentee === false ? "supplier" : "me",
    },
    fuelType: (li.fuel_type_preference && FUEL_IN[li.fuel_type_preference]) || "diesel",
    additionalNotes: li.additional_notes ?? "", // AC-53: agent-extracted per-item notes (was dropped)
    deliveryOverride: li.mobilization_by_rentee == null ? null : li.mobilization_by_rentee ? "me" : "supplier",
    returnOverride: li.demobilization_by_rentee == null ? null : li.demobilization_by_rentee ? "me" : "supplier",
    // AC-26: supplier provides fuel ⇒ fuel responsibility = supplier (else me); null when Mansour didn't say.
    fuelResponsibilityOverride: li.diesel_included == null ? null : li.diesel_included ? "supplier" : "me",
  };
}

function toProject(h: RFQHeader): ProjectDetails {
  const p = defaultProjectDetails();
  // AC-47: map an agent location conflict (text↔file) into the renter's pick-one resolver.
  // The agent labels candidates "pasted text" vs "file:<name>"; collapse to fromText/fromFile.
  const locConflict = (h.conflicts ?? []).find((c) => c?.field === "rfq_header.project_address_label");
  let conflict: ProjectDetails["location"]["conflict"];
  if (locConflict && Array.isArray(locConflict.candidates) && locConflict.candidates.length >= 2) {
    const fromText = locConflict.candidates.find((c) => !/^file:/i.test(c.source))?.value;
    const fromFile = locConflict.candidates.find((c) => /^file:/i.test(c.source))?.value;
    if (fromText && fromFile) conflict = { fromText, fromFile };
  }
  p.location = {
    label: h.project_address_label ?? null,
    lat: h.project_lat ?? undefined,
    lng: h.project_lng ?? undefined,
    confirmed: false, // AC-16: always re-confirmed by the renter, even when extracted
    source: "agent",
    conflict, // AC-47: unresolved conflict → Step 1 shows the From-text/From-file picker
  };
  p.timing.rentalBasis = h.rental_type ? RENTAL_IN[h.rental_type] ?? null : null;
  p.timing.extendable = h.extendable ?? false; // AC-13 (was dropped)
  p.timing.startDate = h.start_date ?? null;
  p.timing.endDate = h.end_date ?? null;
  p.timing.hoursPerDay = h.working_hours_per_day ?? 10;
  p.advanced.workingDaysPerWeek = h.working_days_per_week ?? 6;
  p.advanced.overtimeRate = h.overtime_rate ? OVERTIME_IN[h.overtime_rate] ?? "without" : "without";
  // AC-50: project "Other" certificates from the local-content / saso-registration flags.
  p.certificates.other = [
    h.local_content ? "local-content" : null,
    h.saso_registration ? "saso-registration" : null,
  ].filter(Boolean) as OtherCertificate[];
  return p;
}

/** AC-36/37/39/40: Step-3 preferences Mansour inferred. Defaults for anything it didn't emit. */
function toPreferences(h: RFQHeader): Preferences {
  const p = defaultPreferences();
  p.payment.terms = (pick(h.payment_terms, PAYMENT_TERMS) as PaymentTerm | undefined) ?? null;
  p.payment.method = (pick(h.payment_method, PAYMENT_METHODS) as PaymentMethod | undefined) ?? null;
  p.maintenance.responsibility =
    (pick(h.maintenance_responsibility, MAINTENANCE_RESPONSIBILITIES) as MaintenanceResponsibility | undefined) ?? "supplier";
  p.maintenance.sla = h.breakdown_response_sla ? SLA_IN[h.breakdown_response_sla] ?? null : null;
  p.additionalNotes = h.additional_notes ?? ""; // AC-38 request-level notes
  p.budgetSar = h.budget_ceiling ?? null; // AC-39
  p.supplierFilters.verifiedOnly = h.verified_suppliers_only ?? false;
  p.supplierFilters.sublettingAllowed = h.subletting ?? false;
  p.supplierFilters.bidWindow = (pick(h.offer_duration, BID_WINDOWS) as BidWindow | undefined) ?? null;
  return p;
}
