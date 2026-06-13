/**
 * web-app/request-details-bids — wire types + mappers for the renter's own requests (read side).
 *
 * Source: the shared app backend.
 *   - list:   GET /marketplace/my-requests        → renteeService.getMyRequests
 *   - detail: GET /rentees/me/requests/{requestId} → requestService.getRequestDetail
 *
 * NOTE (fan-out): a request is ALWAYS single-item on this side. When a renter submits an RFQ with
 * several items, the backend fans it out into one EquipmentRequest per item — so each row/detail
 * here carries exactly one equipment line. The UI never shows a multi-item request.
 */

export type RequestStatus = "OPEN" | "ACTIVE" | "ACCEPTED" | "EXPIRED" | "CLOSED" | string;
export type RequestType = "BROADCAST" | "DIRECT" | string;
export type Urgency = "ASAP" | "SOON" | "FAR_FUTURE" | string;

/** One enriched equipment line as the backend returns it (taxonomy names folded in). */
export interface RequestItem {
  id?: string;
  categoryId: string | null;
  subtypeId: string | null;
  capacityId: string | null;
  categoryName: string | null;
  categoryNameAr: string | null;
  subtypeName: string | null;
  subtypeNameAr: string | null;
  capacityName: string | null;
  capacityNameAr: string | null;
  subtypeImageUrl: string | null;
  categoryImageUrl: string | null;
  numberOfUnits: number;
  operatorIncluded: "YES" | "NO" | null;
  fuelTypePreference: string | null;
  mobilizationByRentee: boolean | null;
  demobilizationByRentee: boolean | null;
  nightShiftRequired: boolean | null;
  operatorNationality: string | null;
  maxEquipmentAge: number | null;
  dieselIncluded: boolean | null;
  fatRequired: boolean | null;
  safetyCertifications: string[] | null;
  additionalNotes: string | null;
}

/** The full request record from the backend (every stored field) — kept open so detail can show all. */
export interface RequestRecord {
  id: string;
  displayId?: string | null;
  shortCode?: string | null;
  type: RequestType;
  status: RequestStatus;
  urgency?: Urgency | null;
  rentalType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  estimatedDurationDays?: number | null;
  workingHoursPerDay?: number | null;
  workingDaysPerWeek?: number | null;
  jobEstimatedHours?: number | null;
  overtimeRate?: string | null;
  terrainType?: string | null;
  fulfillmentType?: string | null;
  projectLat?: number | null;
  projectLng?: number | null;
  projectAddressLabel?: string | null;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  verifiedSuppliersOnly?: boolean | null;
  minimumSupplierRating?: number | null;
  budgetCeiling?: number | null;
  deliveryLeadTime?: string | null;
  equipmentStorageOnSite?: boolean | null;
  breakdownResponseSla?: string | null;
  maintenanceResponsibility?: string | null;
  subletting?: boolean | null;
  localContent?: boolean | null;
  offerDuration?: string | null;
  additionalNotes?: string | null;
  extendable?: boolean | null;
  requiredCerts?: string[] | null;
  supplierId?: number | null;
  isTrial?: boolean | null;
  createdAt?: string | null;
  dealRoomId?: string | null;
  bidCount?: number | null;
  unreadBidCount?: number | null;
  equipmentItems: RequestItem[];
  /** Every other field the backend returns, so the detail screen can render them all. */
  [key: string]: unknown;
}

/** Compact row for the list. */
export interface RequestListItem {
  id: string;
  displayId: string;
  type: RequestType;
  status: RequestStatus;
  urgency: Urgency | null;
  rentalType: string | null;
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  createdAt: string | null;
  bidCount: number;
  /** The single fanned-out item (name + qty), used as the card title. */
  item: { name: string; nameAr: string; qty: number; imageUrl: string | null } | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Best-effort item display name from the enriched taxonomy names (EN or AR). */
function itemName(it: RequestItem, ar: boolean): string {
  const parts = ar
    ? [it.subtypeNameAr ?? it.subtypeName, it.capacityNameAr ?? it.capacityName]
    : [it.subtypeName, it.capacityName];
  return parts.filter(Boolean).join(" · ") || (ar ? it.categoryNameAr ?? "" : it.categoryName ?? "") || "—";
}

/** Pull the list array out of whatever envelope the backend uses. */
export function extractRequestList(raw: unknown): RequestRecord[] {
  const r = raw as Record<string, unknown>;
  const list = (r?.data ?? r?.requests ?? r?.items ?? raw) as unknown;
  return Array.isArray(list) ? (list as RequestRecord[]) : [];
}

export function mapRequestListItem(r: RequestRecord): RequestListItem {
  const it = r.equipmentItems?.[0] ?? null;
  return {
    id: r.id,
    displayId: str(r.displayId) ?? str(r.shortCode) ?? r.id,
    type: r.type,
    status: r.status,
    urgency: (str(r.urgency) as Urgency) ?? null,
    rentalType: str(r.rentalType),
    city: str(r.projectAddressLabel),
    startDate: str(r.startDate),
    endDate: str(r.endDate),
    durationDays: num(r.estimatedDurationDays),
    createdAt: str(r.createdAt),
    bidCount: num(r.bidCount) ?? 0,
    item: it
      ? { name: itemName(it, false), nameAr: itemName(it, true), qty: it.numberOfUnits ?? 1, imageUrl: it.subtypeImageUrl ?? it.categoryImageUrl ?? null }
      : null,
  };
}

/** Detail passes the record through largely intact (the screen renders every field). */
export function mapRequestDetail(raw: unknown): RequestRecord {
  return raw as RequestRecord;
}
