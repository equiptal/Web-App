/**
 * The RFQ draft + broadcast request model — the editable state the wizard operates on, and the
 * payload posted to /api/requests. The agent (`/api/agent/process`, mocked) returns the project +
 * items portion as an {@link AgentDraft}; preferences are renter-set and default-initialized here.
 */

import { Verdict, Extracted, ValueConflict } from "./verdict";
import { TaxonomyRef, EMPTY_REF } from "./taxonomy";
import {
  RentalBasis,
  OvertimeRate,
  SafetyCertificate,
  OtherCertificate,
  Party,
  OperatorNeeded,
  OperatorCertificate,
  FuelType,
  PaymentTerm,
  PaymentMethod,
  MaintenanceResponsibility,
  MaintenanceSla,
  BidWindow,
} from "./options";

/* ----------------------------- Project (request-wide) ----------------------------- */

export interface ProjectLocation {
  label: string | null;
  lat?: number;
  lng?: number;
  /** AC-16: always starts unconfirmed, even when extracted; renter must confirm to advance. */
  confirmed: boolean;
  source?: "agent" | "gps" | "manual" | "map";
  /** AC-47: text↔file disagreement on the location, if any. */
  conflict?: ValueConflict<string>;
}

export interface TimingHours {
  rentalBasis: RentalBasis | null; // AC-13 required to advance Step 1
  extendable: boolean; // AC-13 flag on the chosen basis
  startDate: string | null; // AC-14 optional, bypassable
  endDate: string | null; // AC-14 optional
  hoursPerDay: number; // AC-14 default 10
}

export interface AdvancedSettings {
  workingDaysPerWeek: number; // AC-15 stepper 1–7, default 6
  overtimeRate: OvertimeRate; // AC-15 default "without"
  equipmentYear: string | null; // AC-28 "any" | "2015+".."2022+" (matches app); optional
}

export interface Certificates {
  safety: SafetyCertificate[]; // AC-50; a pick sets each item's operator certificate (AC-24)
  /** web-app/002: free-text name when "other" is selected in `safety` (optional). */
  safetyOther: string;
  other: OtherCertificate[]; // AC-50
}

export interface ProjectDetails {
  location: ProjectLocation;
  timing: TimingHours;
  advanced: AdvancedSettings;
  certificates: Certificates;
  // Request-wide, per-item overridable (AC-25/26). `null` = no selection: the agent found differing
  // per-item values (each item carries its own), or nothing chosen yet. A value applies to every
  // item without a per-item override.
  deliveryToSite: Party | null;
  returnFromSite: Party | null;
  fuelResponsibility: Party | null;
}

/* ----------------------------- Equipment item ----------------------------- */

export interface OperatorDetails {
  nightShift: boolean;
  nationality: string | null;
  /** Part 3: free-text nationalities the rentee allows — shown only when `nationality === "restricted"`.
   *  Sent as operatorNationalityCustom (≤100). */
  nationalityCustom?: string | null;
  certificate: OperatorCertificate[]; // multi-select; defaulted from project Safety certs (AC-24/50)
  /** AC-50: true when the agent set the cert per-item from the RFQ — the project-level Safety cert
   *  then leaves it untouched (only fills items the agent didn't mention). */
  certByAgent?: boolean;
  /** AC-24: F.A.T split — who covers the operator's Food vs Accommodation & Transport (supplier / me).
   *  Per-item; both become negotiable deal-room terms. (Superseded the old single `fat` choice.) */
  fatFood: Party | null;
  fatAccommodationTransport: Party | null;
}

/** AC-19/20: nearest-measurement + optional unit conversion the agent suggests. */
export interface MeasurementSuggestion {
  /** The taxonomy measurement id suggested as nearest. */
  measurementId: string;
  unitConversion?: {
    fromUnit: string;
    fromValue: number;
    toUnit: string;
    toValue: number;
  };
}

export interface EquipmentItem {
  id: string;
  /** Free-text label as it appeared in the RFQ (display aid). */
  rawLabel: string | null;
  /**
   * Verbatim capacity/size as stated in the RFQ (e.g. "30 ton", "2.5 m³"), kept even when it
   * doesn't resolve to a taxonomy measurement id. Display fallback so a stated-but-off-taxonomy
   * (or "Not Specified") size still shows instead of "—". null when the RFQ stated no size.
   */
  rawSize: string | null;
  ref: TaxonomyRef;
  verdict: Verdict; // from the agent
  /** AC-19: nearest-measurement suggestion when the RFQ measurement isn't in the taxonomy. */
  suggestion?: MeasurementSuggestion;
  /** AC-19/20: free-text capacity advisory from the agent (unit mismatch / snap explanation). */
  advisory?: string | null;
  /** Agent's plain-language size guidance when the size is unresolved — the question/options it
   *  raised for this item's capacity (from missing_required_fields[line_items[i].capacity]). Shown
   *  beside "pick a size to approve" so the renter sees what the agent is asking. null when none. */
  sizeNote?: string | null;
  /**
   * AC-18/19/29: whether a needs-validation match or measurement suggestion has been resolved
   * (Approved or Edited). Confident/no-match items are not gated by this.
   */
  resolved: boolean;
  /** AC-30/32: a no-match item the renter removed/actioned is excluded from the broadcast (AC-33). */
  removed: boolean;

  // Per-item options:
  quantity: number; // AC-55 default 1, min 1
  operatorNeeded: OperatorNeeded; // AC-24
  operator: OperatorDetails;
  fuelType: FuelType; // AC-26 default "diesel"
  /** Part 1: optional free-text "work type" — surfaced only for crane subtypes (mirrors mobile). ≤255. */
  workType?: string;
  additionalNotes: string; // AC-53 agent-extracted free-text qualifiers, editable

  // Per-item overrides of request-wide settings (AC-25/26):
  deliveryOverride: Party | null;
  returnOverride: Party | null;
  fuelResponsibilityOverride: Party | null;
  /** AC-28: per-item equipment year override. null ⇒ inherit the request-wide year
   *  (`project.advanced.equipmentYear`). Value is "any" | a 4-digit year | "custom:<text>". */
  equipmentYear?: string | null;
  /** Per-item equipment attachments/accessories. `attachmentIds` are admin-defined SubtypeAttachment
   *  ids for this subtype; `customAttachments` are renter free-text additions. Stored on the request
   *  item as `attachment_ids` / `custom_attachments` (Json arrays). */
  attachmentIds?: string[];
  customAttachments?: string[];

  /** AC-57: confidence on agent-prefilled per-item fields (UI badges). */
  fieldConfidence?: {
    quantity?: Extracted<number>["confidence"];
    operator?: Extracted<number>["confidence"];
    fuelType?: Extracted<number>["confidence"];
  };
}

/* ----------------------------- Preferences (Step 3) ----------------------------- */

export interface Preferences {
  payment: { terms: PaymentTerm | null; method: PaymentMethod | null }; // AC-36
  maintenance: { responsibility: MaintenanceResponsibility; sla: MaintenanceSla | null }; // AC-37
  additionalNotes: string; // AC-38 (request-level; distinct from per-item notes AC-53)
  budgetSar: number | null; // AC-39 setting only
  supplierFilters: {
    verifiedOnly: boolean;
    sublettingAllowed: boolean;
    bidWindow: BidWindow | null;
  }; // AC-40
}

/* ----------------------------- Agent draft + full draft ----------------------------- */

/** What the agent (mock /api/agent/process) returns — the renter-observable draft. */
export interface AgentDraft {
  project: ProjectDetails;
  items: EquipmentItem[];
  /** Step-3 preferences the agent inferred (payment/maintenance/budget/filters). Renter edits in Step 3. */
  preferences?: Preferences;
  /** AC-48: every distinct site the agent detected; >1 ⇒ prompt that others need separate requests. */
  detectedLocations: string[];
  /** AC-56: processing summary counts. */
  summary: ProcessingSummary;
  /** DEPRECATED flat notes (lumped Step-4 box). Prefer fieldNotes. */
  justifications?: string[];
  /** Field-keyed agent notes (dotted path → note), rendered inline beside each field. */
  fieldNotes?: Record<string, string>;
}

export interface ProcessingSummary {
  totalItems: number;
  needsValidation: number;
  notAvailable: number;
}

/** The full editable RFQ: agent-drafted project+items plus renter preferences. */
export interface RfqDraft {
  project: ProjectDetails;
  items: EquipmentItem[];
  preferences: Preferences;
  detectedLocations: string[];
  summary: ProcessingSummary;
  /** DEPRECATED flat notes (lumped Step-4 box). Prefer fieldNotes. */
  justifications?: string[];
  /** Field-keyed agent notes (dotted path → note), rendered inline beside each field. */
  fieldNotes?: Record<string, string>;
}

/** Posted to /api/requests (AC-42/43). Mirrors the shared app request shape. */
export interface RfqRequestPayload {
  project: ProjectDetails;
  /** Excludes items flagged not-available / removed (AC-33/34). */
  items: EquipmentItem[];
  preferences: Preferences;
}

/* ----------------------------- Defaults / factories ----------------------------- */

export function defaultProjectDetails(): ProjectDetails {
  return {
    location: { label: null, confirmed: false },
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null, hoursPerDay: 10 },
    advanced: {
      workingDaysPerWeek: 6,
      overtimeRate: "without",
      equipmentYear: null,
    },
    certificates: { safety: [], safetyOther: "", other: [] },
    deliveryToSite: "me",
    returnFromSite: "me",
    fuelResponsibility: "me",
  };
}

export function defaultPreferences(): Preferences {
  return {
    payment: { terms: null, method: null },
    maintenance: { responsibility: "supplier", sla: null }, // AC-37 default supplier
    additionalNotes: "",
    budgetSar: null,
    supplierFilters: { verifiedOnly: false, sublettingAllowed: false, bidWindow: null },
  };
}

export function defaultOperatorDetails(): OperatorDetails {
  return { nightShift: false, nationality: null, nationalityCustom: null, certificate: [], fatFood: "me", fatAccommodationTransport: "me" };
}

/** Build a blank item (used when the renter adds a missed item — AC-22). */
export function newManualItem(id: string): EquipmentItem {
  return {
    id,
    rawLabel: null,
    rawSize: null,
    ref: { ...EMPTY_REF },
    // Manually added: starts unresolved (Need-OK) with an empty match so the renter picks
    // category → subtype → size; it auto-resolves to Matched once the ref is complete (AC-22).
    verdict: "needs-validation",
    resolved: false,
    removed: false,
    quantity: 1,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    equipmentYear: null, // inherit request-wide year unless overridden
    attachmentIds: [],
    customAttachments: [],
  };
}

/** Recompute the processing summary from the current item list (AC-56). */
export function computeSummary(items: EquipmentItem[]): ProcessingSummary {
  const live = items.filter((i) => !i.removed);
  return {
    totalItems: live.length,
    needsValidation: live.filter((i) => i.verdict === "needs-validation").length,
    notAvailable: live.filter((i) => i.verdict === "no-match").length,
  };
}
