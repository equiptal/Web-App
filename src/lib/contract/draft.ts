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
  SiteAccessRestriction,
  SafetyCertificate,
  OtherCertificate,
  Party,
  OperatorNeeded,
  OperatorCertificate,
  Accommodation,
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
  hoursPerDay: number; // AC-14 default 8
}

export interface AdvancedSettings {
  workingDaysPerWeek: number; // AC-15 stepper 1–7, default 6
  overtimeRate: OvertimeRate; // AC-15 default "without"
  equipmentYear: string | null; // AC-28 "any" | "2020".."2026" | custom; optional
  siteAccessRestrictions: SiteAccessRestriction[]; // AC-27 multi-select
}

export interface Certificates {
  safety: SafetyCertificate[]; // AC-50; a pick sets each item's operator certificate (AC-24)
  other: OtherCertificate[]; // AC-50
}

export interface ProjectDetails {
  location: ProjectLocation;
  timing: TimingHours;
  advanced: AdvancedSettings;
  certificates: Certificates;
  // Request-wide, per-item overridable (AC-25/26):
  deliveryToSite: Party; // AC-25 default "me"
  returnFromSite: Party; // AC-25 default "me"
  fuelResponsibility: Party; // AC-26 default "me"
}

/* ----------------------------- Equipment item ----------------------------- */

export interface OperatorDetails {
  nightShift: boolean;
  nationality: string | null;
  certificate: OperatorCertificate | null; // defaulted from project Safety cert (AC-24/50)
  transfer: boolean;
  accommodation: Accommodation | null;
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
  ref: TaxonomyRef;
  verdict: Verdict; // from the agent
  /** AC-19: nearest-measurement suggestion when the RFQ measurement isn't in the taxonomy. */
  suggestion?: MeasurementSuggestion;
  /** AC-19/20: free-text capacity advisory from the agent (unit mismatch / snap explanation). */
  advisory?: string | null;
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
  additionalNotes: string; // AC-53 agent-extracted free-text qualifiers, editable

  // Per-item overrides of request-wide settings (AC-25/26):
  deliveryOverride: Party | null;
  returnOverride: Party | null;
  fuelResponsibilityOverride: Party | null;

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
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null, hoursPerDay: 8 },
    advanced: {
      workingDaysPerWeek: 6,
      overtimeRate: "without",
      equipmentYear: null,
      siteAccessRestrictions: [],
    },
    certificates: { safety: [], other: [] },
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
  return { nightShift: false, nationality: null, certificate: null, transfer: false, accommodation: null };
}

/** Build a blank item (used when the renter adds a missed item — AC-22). */
export function newManualItem(id: string): EquipmentItem {
  return {
    id,
    rawLabel: null,
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
