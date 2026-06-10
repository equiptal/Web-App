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
}

export interface CreateRequestPayload {
  userId: number; // agents-backend schema: z.number().int().positive()
  type: "BROADCAST" | "DIRECT";
  rentalType: "DAILY" | "WEEKLY" | "MONTHLY" | "PER_JOB" | "LONG_TERM";
  startDate: string;
  endDate?: string | null;
  urgency: "ASAP" | "SOON" | "FAR_FUTURE";
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
