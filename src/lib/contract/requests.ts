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

export type RequestStatus = "OPEN" | "ACTIVE" | "PARTIALLY_ACCEPTED" | "ACCEPTED" | "EXPIRED" | "FORCE_EXPIRED" | "HUB_CLOSED" | "CLOSED" | string;
export type RequestType = "BROADCAST" | "DIRECT" | string;

/**
 * Single source of truth for request-status display — badge class + bilingual label — mirroring the app
 * marketplace (rentee_requests_page.dart). Admin/system variants collapse to the renter view:
 * FORCE_EXPIRED → Expired, HUB_CLOSED → Closed, ABANDONED/CANCELLED → Cancelled. Used by the requests
 * list, request detail, and group detail so every surface reads the same.
 */
export const REQUEST_STATUS: Record<string, { cls: string; en: string; ar: string }> = {
  OPEN: { cls: "st-open", en: "Open", ar: "مفتوح" },
  ACTIVE: { cls: "st-active", en: "Active", ar: "نشط" },
  PARTIALLY_ACCEPTED: { cls: "st-active", en: "Partially accepted", ar: "مقبول جزئياً" },
  ACCEPTED: { cls: "st-accepted", en: "Accepted", ar: "مقبول" },
  EXPIRED: { cls: "st-expired", en: "Expired", ar: "منتهٍ" },
  FORCE_EXPIRED: { cls: "st-expired", en: "Expired", ar: "منتهٍ" },
  HUB_CLOSED: { cls: "st-closed", en: "Closed", ar: "مغلق" },
  CLOSED: { cls: "st-closed", en: "Closed", ar: "مغلق" },
  ABANDONED: { cls: "st-closed", en: "Cancelled", ar: "ملغى" },
  CANCELLED: { cls: "st-closed", en: "Cancelled", ar: "ملغى" },
};
/** Status badge class + bilingual label, with a safe fallback for any unknown status. */
export function statusMeta(s: string): { cls: string; en: string; ar: string } {
  return REQUEST_STATUS[s] ?? { cls: "st-mixed", en: s, ar: s };
}

/**
 * The backend accepts `DELETE /rentees/me/requests/{id}` only while a request is OPEN or ACTIVE —
 * anything else throws REQUEST_CANCEL_NOT_ALLOWED (app backend `request.service.ts:cancelRequest`).
 * Every cancel affordance gates on THIS, per item. It must never gate on a group-level roll-up: a
 * fanned-out RFQ where one item was accepted still has cancellable siblings, and rolling the statuses
 * up to a single value used to hide the ✕ for the whole RFQ and strand them.
 */
export function isCancellable(status: RequestStatus | null | undefined): boolean {
  return status === "OPEN" || status === "ACTIVE";
}

/** The members of a group the backend will actually cancel. Empty ⇒ nothing to cancel. */
export function cancellableItems<T extends { status: RequestStatus }>(items: T[]): T[] {
  return items.filter((i) => isCancellable(i.status));
}

/** One status present in a group, with how many of the group's items carry it. */
export interface StatusCount {
  status: RequestStatus;
  count: number;
}

/** Distinct statuses in a group with item counts, most-common first (first appearance breaks ties). */
export function statusCounts(items: { status: RequestStatus }[]): StatusCount[] {
  const order: RequestStatus[] = [];
  const n = new Map<RequestStatus, number>();
  for (const i of items) {
    if (!n.has(i.status)) order.push(i.status);
    n.set(i.status, (n.get(i.status) ?? 0) + 1);
  }
  // Array.prototype.sort is stable, so equal counts keep first-appearance order.
  return order.map((status) => ({ status, count: n.get(status)! })).sort((a, b) => b.count - a.count);
}

/**
 * The status label for a whole RFQ. A uniform group reads exactly as one request does ("Open"); a group
 * whose items differ spells the split out — "Open (2) · Accepted (1)" — instead of the old opaque
 * "Mixed", which told the renter nothing and hid that something live was still inside. Two segments max,
 * overflow as "· +N".
 */
export function statusSummary(items: { status: RequestStatus }[], ar: boolean, maxSegments = 2): string {
  const counts = statusCounts(items);
  if (!counts.length) return "—";
  const label = (s: RequestStatus) => (ar ? statusMeta(s).ar : statusMeta(s).en);
  if (counts.length === 1) return label(counts[0].status);
  const shown = counts.slice(0, maxSegments).map((c) => `${label(c.status)} (${c.count})`);
  const hidden = counts.length - shown.length;
  return hidden > 0 ? `${shown.join(" · ")} · +${hidden}` : shown.join(" · ");
}

/** The status a group's badge/dot takes its colour from: a live (cancellable) one when present — the
 *  actionable signal — else the most common. Null for an empty group. */
export function representativeStatus(items: { status: RequestStatus }[]): RequestStatus | null {
  const counts = statusCounts(items);
  return counts.find((c) => isCancellable(c.status))?.status ?? counts[0]?.status ?? null;
}

/** Why one item can't be cancelled — shown inline when the renter taps its disabled ✕, so a greyed-out
 *  control always explains itself (a tooltip wouldn't, on touch). */
export function cancelBlockedReason(status: RequestStatus, ar: boolean): string {
  switch (status) {
    case "ACCEPTED":
    case "PARTIALLY_ACCEPTED":
      return ar ? "تم قبول عرض لهذا البند، لذلك لا يمكن إلغاؤه." : "A bid was accepted for this item, so it can’t be cancelled.";
    case "EXPIRED":
    case "FORCE_EXPIRED":
      return ar ? "انتهت صلاحية هذا البند، لذلك لا يمكن إلغاؤه." : "This item has expired, so it can’t be cancelled.";
    case "CANCELLED":
    case "ABANDONED":
      return ar ? "هذا البند ملغى بالفعل." : "This item is already cancelled.";
    default: {
      const m = statusMeta(status);
      return ar ? `لا يمكن إلغاء بند حالته "${m.ar}".` : `An item that is “${m.en}” can’t be cancelled.`;
    }
  }
}
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
  /** Multi-item submission group — all fanned-out requests from one submit share this (null = solo). */
  requestGroupId: string | null;
  displayId: string;
  /** RFQ group short code (`RFQ-NNNNN`) from my-requests once the backend returns it (T19); null until then. */
  groupRef: string | null;
  type: RequestType;
  status: RequestStatus;
  urgency: Urgency | null;
  rentalType: string | null;
  /** Full project address label (Google-formatted); parsed into city/neighbourhood for the group label. */
  city: string | null;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  createdAt: string | null;
  bidCount: number;
  /** Who the request assigned mobilization / demobilization to (true = renter bears it, false = supplier). */
  mobByRentee: boolean | null;
  demobByRentee: boolean | null;
  /** The single fanned-out item (name + qty), used as the card title. */
  item: { name: string; nameAr: string; qty: number; imageUrl: string | null; categoryId: string | null } | null;
}

/** A submission group — one or more single-item requests that share a `requestGroupId`. */
export interface RequestGroup {
  /** The group id (or the lone request's id when it has no group). */
  id: string;
  /** RFQ group short code (`RFQ-NNNNN`) from my-requests, if the backend returns it (T19); else null. */
  groupRef: string | null;
  items: RequestListItem[];
  city: string | null;
  neighbourhood: string | null;
  /** "City — Neighbourhood" for the chip/strip (falls back to city, then the raw address). */
  locationLabel: string;
  /** Full address (shown in the group context strip). */
  address: string | null;
  createdAt: string | null;
  type: RequestType;
  totalBids: number;
  /** Sum of every item's unit count across the group ("N total equipment"). */
  totalUnits: number;
  asap: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * Rental duration in whole days from start/end — the fallback when the backend didn't store
 * `estimatedDurationDays` (it's an optional create field the backend never derives from the dates, so
 * older/agent-created requests lack it). Matches the mobile app: `end.difference(start).inDays` with the
 * deal-room clamp `d < 1 ? 1`. Lets the comparison's duration-based "Est. rental" show for those requests.
 */
function durationDaysBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const s = new Date(start.length <= 10 ? `${start}T00:00:00Z` : start).getTime();
  const e = new Date(end.length <= 10 ? `${end}T00:00:00Z` : end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const d = Math.floor((e - s) / 86_400_000);
  return d < 1 ? 1 : d;
}

/**
 * Taxonomy images live in a constant, publicly-readable bucket (the mobile app's `S3Url._bucket`).
 * The backend returns them as URLs on a per-env bucket that the web can't read, so — exactly like the
 * app — we strip to the key and rebuild against the public bucket. Pass a key or a full URL.
 */
const TAXONOMY_ASSET_BASE = "https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com";
export function publicTaxonomyUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http")) {
    try {
      const key = new URL(value).pathname.replace(/^\/+/, "");
      return key ? `${TAXONOMY_ASSET_BASE}/${key}` : value; // pathname is already percent-encoded
    } catch {
      return value;
    }
  }
  const enc = value.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
  return `${TAXONOMY_ASSET_BASE}/${enc}`;
}

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

/** Clean short handle for a request/group with no backend RFQ-/REQ- code (old requests): the first 8
 *  hex of the UUID, uppercased (e.g. "B51D4CA8"), so the UI shows a tidy id instead of a raw UUID. */
export function shortRef(id: string | null | undefined): string {
  return (id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase() || "—";
}

/** The RFQ group short code (`RFQ-NNNNN`) off a raw record — defensive on the field name the backend
 *  uses (T19). Null for an old record that predates it; callers fall back to the REQ id. */
export function groupRefOf(r: RequestRecord): string | null {
  return str(r.groupRef) ?? str(r.requestGroupShortCode) ?? str(r.groupShortCode) ?? str(r.rfqRef) ?? null;
}

export function mapRequestListItem(r: RequestRecord): RequestListItem {
  const it = r.equipmentItems?.[0] ?? null;
  return {
    id: r.id,
    requestGroupId: str(r.requestGroupId),
    displayId: str(r.displayId) ?? str(r.shortCode) ?? shortRef(r.id),
    groupRef: groupRefOf(r),
    type: r.type,
    status: r.status,
    urgency: (str(r.urgency) as Urgency) ?? null,
    rentalType: str(r.rentalType),
    city: str(r.projectAddressLabel),
    startDate: str(r.startDate),
    endDate: str(r.endDate),
    // Prefer the stored value; else derive from start/end (backend never computes it from the dates).
    durationDays: num(r.estimatedDurationDays) ?? durationDaysBetween(str(r.startDate), str(r.endDate)),
    createdAt: str(r.createdAt),
    bidCount: num(r.bidCount) ?? 0,
    mobByRentee: it?.mobilizationByRentee ?? null,
    demobByRentee: it?.demobilizationByRentee ?? null,
    item: it
      ? { name: itemName(it, false), nameAr: itemName(it, true), qty: it.numberOfUnits ?? 1, imageUrl: publicTaxonomyUrl(it.subtypeImageUrl ?? it.categoryImageUrl), categoryId: it.categoryId }
      : null,
  };
}

/**
 * Best-effort split of a Google-formatted address into city + neighbourhood for the group label.
 * Heuristic: drop a trailing country, treat the last remaining segment (minus any postcode) as the
 * city and the one before it as the neighbourhood. Tolerant — returns nulls when it can't parse.
 * e.g. "7194 Ibn Barakah, Al Olaya, Riyadh 12331, Saudi Arabia" → { city: "Riyadh", neighbourhood: "Al Olaya" }
 */
export function parseAddress(label: string | null | undefined): { city: string | null; neighbourhood: string | null } {
  if (!label || !label.trim()) return { city: null, neighbourhood: null };
  const COUNTRY = /^(saudi arabia|ksa|kingdom of saudi arabia|المملكة العربية السعودية|السعودية)$/i;
  const POSTCODE = /[\s,-]*[\d٠-٩]{4,}(?:[\s-][\d٠-٩]{4})?\s*$/; // trailing 4+ digit code
  const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && COUNTRY.test(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return { city: null, neighbourhood: null };
  const cityRaw = parts[parts.length - 1];
  const city = cityRaw.replace(POSTCODE, "").trim() || cityRaw;
  const neighbourhood = parts.length >= 2 ? parts[parts.length - 2] : null;
  return { city: city || null, neighbourhood: neighbourhood || null };
}

/**
 * Cluster fanned-out requests by `requestGroupId` (a multi-item submission). Requests with no group
 * id become a group of one. Order is preserved (first appearance). Group-level fields come from the
 * first member — they're identical across a group by construction (shared submission).
 */
export function groupRequests(items: RequestListItem[]): RequestGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, RequestListItem[]>();
  for (const it of items) {
    const key = it.requestGroupId ?? `solo:${it.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(it);
  }
  return order.map((key) => {
    const groupItems = buckets.get(key)!;
    const first = groupItems[0];
    const address = first.city; // RequestListItem.city holds the full project address label
    const { city, neighbourhood } = parseAddress(address);
    const locationLabel = prettyLocation(city ? (neighbourhood ? `${city} — ${neighbourhood}` : city) : (address ?? "—"));
    return {
      id: first.requestGroupId ?? first.id,
      groupRef: groupItems.find((i) => i.groupRef)?.groupRef ?? null,
      items: groupItems,
      city,
      neighbourhood,
      locationLabel,
      address,
      createdAt: first.createdAt,
      type: first.type,
      totalBids: groupItems.reduce((s, i) => s + i.bidCount, 0),
      totalUnits: groupItems.reduce((s, i) => s + (i.item?.qty ?? 1), 0),
      asap: groupItems.some((i) => i.urgency === "ASAP"),
    };
  }).sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0)); // latest → oldest
}

/** Demo label fix: show the airport project by its real name ("Airport" → "King Khalid Airport"). */
export function prettyLocation(s: string): string {
  return /king\s*khalid/i.test(s) ? s : s.replace(/\bairport\b/gi, "King Khalid Airport");
}

/** Fulfillment math: units covered for an equipment line = supplier-offered (on-platform) + off-platform
 *  covered units, never below 0 or above what the line needs. Drives the "X / total" tracking bar. */
export function cappedFilled(needed: number, onUnits: number, offUnits: number): number {
  return Math.max(0, Math.min(needed, (onUnits || 0) + (offUnits || 0)));
}

/** Demo ordering: pin the Airport project's group(s) to the front, keeping the rest in order. */
export function pinAirportFirst(groups: RequestGroup[]): RequestGroup[] {
  const isAir = (g: RequestGroup) => /airport|مطار/i.test(g.locationLabel || g.city || "");
  return [...groups.filter(isAir), ...groups.filter((g) => !isAir(g))];
}

/** Detail passes the record through largely intact (the screen renders every field). */
export function mapRequestDetail(raw: unknown): RequestRecord {
  return raw as RequestRecord;
}
