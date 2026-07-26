/**
 * Moedatech app (agents-backend) wire types — the STABLE app side (per agent ALIGNMENT.md, the
 * app schema is the source of truth). Mirrors `GET /agents/taxonomy` and `POST /agents/requests`
 * from `Normalization-Agent/docs/mansour-integration-handoff.md`. Kept out of the contract barrel.
 */

export type TaxonomyLevel = "CATEGORY" | "SUBCATEGORY" | "MEASUREMENT" | "ATTACHMENT";

/** Flat taxonomy node as returned by GET /agents/taxonomy. */
export interface TaxonomyNode {
  id: string;
  level: TaxonomyLevel;
  name: string;
  name_ar: string | null;
  parent_id: string | null;
  aliases: string[];
  tag: string | null;
  sort_order?: number;
}

export interface TaxonomyResponse {
  nodes: TaxonomyNode[];
}

/** An admin-configured equipment attachment for a subtype (GET /equipment/attachments/{subtypeId}).
 *  `preSelected` ⇒ checked by default when the renter picks this subtype. */
export interface SubtypeAttachmentOption {
  id: string;
  name: string;
  nameAr: string;
  preSelected?: boolean;
}

/** One equipment line in POST /agents/requests. All 3 ids required (422 if null). */
export interface CreateRequestItem {
  categoryId: string;
  subtypeId: string;
  capacityId: string;
  /** Per-item equipment attachments: admin-defined SubtypeAttachment ids selected for this item.
   *  Backend `attachment_ids` (Json); the agents create schema defaults to []. */
  attachmentIds?: string[];
  /** Renter free-text attachments not in the admin list. Backend `custom_attachments` (Json). */
  customAttachments?: string[];
  numberOfUnits: number;
  operatorIncluded: "YES" | "NO";
  fuelTypePreference?: "DIESEL" | "PETROL" | "ELECTRIC";
  mobilizationByRentee: boolean;
  demobilizationByRentee: boolean;
  /** AC-53 per-item free-text qualifier. Requires the `additional_notes` item column (rule 6 migration). */
  additionalNotes?: string;
  /** Part 1: optional free-text work type (crane subtypes only). Backend `work_type` VARCHAR(255). */
  workType?: string;
  // Project-level fields fanned out onto every item (ALIGNMENT rule 4):
  /** AC-28: a minimum MANUFACTURE YEAR (a misnomer — NOT an age). e.g. 2024. Omitted for "any". */
  maxEquipmentAge?: number;
  /** AC-26: supplier provides fuel. supplier⇒true, me⇒false. Omitted unless fuel is diesel/petrol. */
  dieselIncluded?: boolean;
  /** AC-24 (legacy): single F.A.T flag — supplier covers ⇒ true. Kept for back-compat; superseded by
   *  fatFood + fatAccommodationTransport. Only when an operator is included. */
  fatRequired?: boolean;
  /** Part 2: F.A.T split — supplier covers Food ⇒ true / rentee ⇒ false. Operator-only. Negotiable. */
  fatFood?: boolean;
  /** Part 2: F.A.T split — supplier covers Accommodation & Transport ⇒ true / rentee ⇒ false. */
  fatAccommodationTransport?: boolean;
  // §4.2 per-item fields (operator sub-fields + fanned project safety certs):
  /** AC-24: per-item night-shift flag (operator sub-field). */
  nightShiftRequired?: boolean;
  /** AC-24: per-item operator nationality (≤100). */
  operatorNationality?: string;
  /** Part 3: free-text nationalities when operatorNationality === "restricted". Backend ≤100. */
  operatorNationalityCustom?: string;
  /** AC-50: project Safety certificates fanned onto each item (equipment certs; gating). */
  safetyCertifications?: string[];
  /** Operator certification — the app's NON-gating license level(s), comma-joined (CERTIFIED/TUV/SPSP). */
  operatorLicenseLevel?: string;
}

export interface CreateRequestPayload {
  userId: number; // agents-backend schema: z.number().int().positive()
  type: "BROADCAST" | "DIRECT";
  rentalType: "DAILY" | "WEEKLY" | "MONTHLY" | "PER_JOB" | "LONG_TERM";
  /** Optional — omit and the server defaults to "now". Never invent one (ALIGNMENT rule 3). */
  startDate?: string;
  endDate?: string | null;
  /** Whole-day rental duration (end − start), client-derived like the mobile app's CR-017 rule — the
   *  backend stores it verbatim (it does NOT compute it from the dates) and needs it ≥ 1. Omitted when
   *  the dates don't yield a full day. Drives all duration-based pricing (quotation / deal room / compare). */
  estimatedDurationDays?: number;
  /** AC-13 rental extendable flag. Requires the `extendable` column (rule 6 migration). */
  extendable?: boolean;
  /**
   * Client-derived from startDate, mirroring the mobile app's CR-017 rule (<2d ASAP, 2–14d SOON, 14+d
   * or no/invalid date FAR_FUTURE). The app backend stores the client value verbatim; the agents
   * endpoint is aligning to require it too — so the web sends it (see `computeUrgency` in app-adapters).
   */
  urgency: "ASAP" | "SOON" | "FAR_FUTURE";
  projectLat?: number;
  projectLng?: number;
  projectAddressLabel?: string;
  additionalNotes?: string;
  // §4.2 header fields (AC-15 hours/days/overtime, AC-27 access, AC-36/37 terms, AC-39/40 filters):
  workingHoursPerDay?: number; // int 1–24
  workingDaysPerWeek?: number; // int 1–7
  overtimeRate?: "0" | "1X" | "1.5X" | "2X"; // UI "without" → "0"
  paymentTerms?: string; // ≤100
  paymentMethod?: string; // ≤100
  maintenanceResponsibility?: string; // ≤50
  breakdownResponseSla?: "FOUR_HR" | "EIGHT_HR" | "TWENTY_FOUR_HR" | "FORTY_EIGHT_HR" | "SEVENTY_TWO_HR";
  budgetCeiling?: number; // > 0
  verifiedSuppliersOnly?: boolean;
  subletting?: boolean;
  offerDuration?: string; // ≤10 — the bid window
  requiredCerts?: string[]; // project "Other" certs (open string[])
  localContent?: boolean; // the local-content flag, split out of "Other"
  equipmentItems: CreateRequestItem[];
}

/** One request created by POST /agents/requests (the server fans out one per equipment item). */
export interface CreatedRequest {
  requestId: string;
  shortCode?: string;
  status?: string;
  matchedSupplierCount?: number;
  /** mobile/016 — true when this was created as a trial (never dispatched to suppliers). */
  isTrial?: boolean;
}

/** POST /agents/requests response — an ARRAY, one entry per equipment item (server-side fan-out). */
export interface CreateRequestResult {
  requests: CreatedRequest[];
  /** mobile/016 — echoed by the backend; `trialExpiresAt` is the ISO 60-min TTL (null for real). */
  isTrial?: boolean;
  trialExpiresAt?: string | null;
}
