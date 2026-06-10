/**
 * Mansour wire types — snapshot of `Normalization-Agent/src/types/rfq.types.ts` (the `POST /rfq`
 * output). Mansour is under active development; if its output changes, re-sync this file + the
 * adapter in src/lib/api/agent-adapters.ts. Kept out of the contract barrel to avoid clashing with
 * the UI's own enums. Snapshot date: 2026-06-10.
 */

export type AgentRentalType = "DAILY" | "WEEKLY" | "MONTHLY" | "PER_JOB" | "LONG_TERM";
export type AgentFuelType = "DIESEL" | "PETROL" | "ELECTRIC";
export type AgentOvertimeRate = "0" | "1.5X" | "2X";
export type AgentOperatorLicenseLevel = "CERTIFIED" | "TUV" | "SPSP";

export type FuelTypeMatch = "stated" | "defaulted" | null;
export type CategoryMatch = "exact" | "new";
export type SubtypeMatch = "exact" | "new";
export type CapacityMatch = "exact" | "snapped" | "converted" | "range" | "new" | "not_specified";

export interface RFQLineItem {
  input_equipment: string;
  category: string;
  subtype: string;
  capacity: string;
  quantity: number | null;
  operator_included: boolean | null;
  fuel_type_preference: AgentFuelType | null;
  mobilization_by_rentee: boolean | null;
  demobilization_by_rentee: boolean | null;
  max_equipment_age?: number | null;
  night_shift_required?: boolean | null;
  number_of_operators?: number | null;
  operator_nationality?: string | null;
  operator_license_level?: AgentOperatorLicenseLevel | null;
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
  start_date?: string | null;
  end_date?: string | null;
  project_lat?: number | null;
  project_lng?: number | null;
  project_address_label?: string | null;
  working_hours_per_day?: number | null;
  working_days_per_week?: number | null;
  overtime_rate?: AgentOvertimeRate | null;
  additional_notes?: string | null;
  budget_ceiling?: number | null;
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
}

/** Request body for `POST /rfq` and `POST /rfq/jobs`. Attachments are base64 (no `data:` prefix). */
export interface NormalizeRequest {
  message?: string;
  attachments?: { type: string; filename?: string; data: string }[];
  /** "web_rfq" triggers the web policy (start_date/delivery/fulfillment → optional, rental_type
   *  constrained to daily/weekly/monthly, extendable mapping). "api" = hard app policy. */
  source?: "web_rfq" | "api";
}
