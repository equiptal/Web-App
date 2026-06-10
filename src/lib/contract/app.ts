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

/** One equipment line in POST /agents/requests. All 3 ids required (422 if null). */
export interface CreateRequestItem {
  categoryId: string;
  subtypeId: string;
  capacityId: string;
  numberOfUnits: number;
  operatorIncluded: "YES" | "NO";
  fuelTypePreference?: "DIESEL" | "PETROL" | "ELECTRIC";
  mobilizationByRentee: boolean;
  demobilizationByRentee: boolean;
  // Project-level fields fanned out onto every item (ALIGNMENT rule 4):
  /** AC-28: a minimum MANUFACTURE YEAR (a misnomer — NOT an age). e.g. 2024. Omitted for "any". */
  maxEquipmentAge?: number;
  /** AC-26: supplier provides fuel. supplier⇒true, me⇒false. Omitted unless fuel is diesel/petrol. */
  dieselIncluded?: boolean;
  /** AC-24: from the operator "transfer" sub-field; only when an operator is included. */
  fatRequired?: boolean;
}

export interface CreateRequestPayload {
  userId: number; // agents-backend schema: z.number().int().positive()
  type: "BROADCAST" | "DIRECT";
  rentalType: "DAILY" | "WEEKLY" | "MONTHLY" | "PER_JOB" | "LONG_TERM";
  /** Optional — omit and the server defaults to "now". Never invent one (ALIGNMENT rule 3). */
  startDate?: string;
  endDate?: string | null;
  // `urgency` intentionally absent: the server derives it from startDate (ALIGNMENT rule 2 / mobile
  // CR-017); any value sent is ignored, so the web never sends it.
  projectLat?: number;
  projectLng?: number;
  projectAddressLabel?: string;
  additionalNotes?: string;
  equipmentItems: CreateRequestItem[];
}

export interface CreateRequestResult {
  requestId: string;
  shortCode?: string;
  status?: string;
  matchedSupplierCount?: number;
}
