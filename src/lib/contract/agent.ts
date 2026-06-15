/**
 * Mansour wire types — snapshot of `Normalization-Agent/src/types/rfq.types.ts` (the `POST /rfq`
 * output). Mansour is under active development; if its output changes, re-sync this file + the
 * adapter in src/lib/api/agent-adapters.ts. Kept out of the contract barrel to avoid clashing with
 * the UI's own enums. Snapshot date: 2026-06-10.
 */

export type AgentRentalType = "DAILY" | "WEEKLY" | "MONTHLY" | "PER_JOB" | "LONG_TERM";
export type AgentFuelType = "DIESEL" | "PETROL" | "ELECTRIC";
export type AgentOvertimeRate = "0" | "1.5X" | "2X";
export type AgentOperatorLicenseLevel = "SPSP" | "TUV" | "SASO" | "CERTIFIED";

export type FuelTypeMatch = "stated" | "defaulted" | null;
export type CategoryMatch = "exact" | "new";
export type SubtypeMatch = "exact" | "new";
export type CapacityMatch = "exact" | "snapped" | "converted" | "range" | "new" | "not_specified";

export interface RFQLineItem {
  input_equipment: string;
  category: string;
  subtype: string;
  capacity: string;
  capacity_input_value?: string | null; // verbatim size phrase the renter stated (e.g. "30 ton")
  quantity: number | null;
  operator_included: boolean | null;
  fuel_type_preference: AgentFuelType | null;
  mobilization_by_rentee: boolean | null;
  demobilization_by_rentee: boolean | null;
  max_equipment_age?: number | null;
  night_shift_required?: boolean | null;
  number_of_operators?: number | null;
  operator_nationality?: string | null;
  operator_license_level?: AgentOperatorLicenseLevel | null; // back-compat: first of the array
  operator_license_levels?: AgentOperatorLicenseLevel[] | null; // ALL operator certs the RFQ named
  // Emitted by Mansour but previously dropped by the adapter — now consumed:
  additional_notes?: string | null; // AC-53 per-item free-text qualifiers ("silent", "breaker")
  diesel_included?: boolean | null; // AC-26 supplier provides fuel
  fat_required?: boolean | null; // AC-24 FAT applies (operator included)
  operator_accommodation_by_rentee?: boolean | null; // AC-24 who covers FAT: true = rentee/me, false = supplier
  safety_certifications?: string[] | string | null; // AC-50 — agent emits a single value; tolerate both
  capacity_advisory?: string | null;
  fuel_type_match?: FuelTypeMatch;
  category_match?: CategoryMatch;
  subtype_match?: SubtypeMatch;
  capacity_match?: CapacityMatch;
  // Resolved against the live taxonomy server-side; null when off-taxonomy ("(new)").
  category_id?: string | null;
  subtype_id?: string | null;
  capacity_id?: string | null;
}

export interface RFQHeader {
  rental_type?: AgentRentalType | null;
  extendable?: boolean | null; // AC-13: rental basis can run beyond the period
  start_date?: string | null;
  end_date?: string | null;
  project_lat?: number | null;
  project_lng?: number | null;
  project_address_label?: string | null;
  detected_locations?: string[] | null; // AC-48: every distinct site Mansour found
  /** AC-47: cross-source disagreements. Each entry: a dotted field path + candidates labelled by
   *  source ("pasted text" / "file:<name>"). The web renders a pick-one resolver (location today). */
  conflicts?: { field: string; candidates: { value: string; source: string }[] }[] | null;
  working_hours_per_day?: number | null;
  working_days_per_week?: number | null;
  overtime_rate?: AgentOvertimeRate | null;
  site_access_restrictions?: string[] | null; // AC-27
  additional_notes?: string | null; // AC-38 request-level notes
  budget_ceiling?: number | null; // AC-39
  // Step-3 preferences Mansour can infer (previously dropped):
  payment_terms?: string | null; // AC-36
  payment_method?: string | null; // AC-36
  maintenance_responsibility?: string | null; // AC-37
  breakdown_response_sla?: string | null; // AC-37
  verified_suppliers_only?: boolean | null; // AC-40
  subletting?: boolean | null; // AC-40
  offer_duration?: string | null; // AC-40 bid window
  local_content?: boolean | null; // AC-50
  saso_registration?: boolean | null; // AC-50
}

export interface MissingFieldEntry {
  field: string;
  label: string;
  required: boolean;
  suggested_value?: unknown;
  question_for_customer: string;
}

export interface SenderContact {
  email?: string | null;
  phone?: string | null;
  named_person?: string | null;
  company_name?: string | null;
}

/** Full agent output for `POST /rfq` (unwrapped from the `{ success, data }` envelope). */
export interface RFQAgentOutput {
  sender_contact?: SenderContact;
  rfq_header: RFQHeader;
  line_items: RFQLineItem[];
  missing_required_fields: MissingFieldEntry[];
  /** DEPRECATED flat conversational notes (lumped Step-4 box). Prefer field_notes. */
  justifications?: string[];
  /** Field-keyed notes on values the agent assumed/inferred — { field, note } keyed by dotted path
   *  ("rfq_header.<name>" | "line_items[<i>].<name>"). Rendered inline beside each field. */
  field_notes?: { field: string; note: string }[];
}

/** Request body for `POST /rfq` and `POST /rfq/jobs`. Attachments are base64 (no `data:` prefix). */
export interface NormalizeRequest {
  message?: string;
  attachments?: { type: string; filename?: string; data: string }[];
  /** "web_rfq" triggers the web policy (start_date/delivery/fulfillment → optional, rental_type
   *  constrained to daily/weekly/monthly, extendable mapping). "api" = hard app policy. */
  source?: "web_rfq" | "api";
  /** UI locale → the agent writes free-text (notes/advisories/questions) in Arabic when "ar". */
  language?: "ar" | "en";
}
