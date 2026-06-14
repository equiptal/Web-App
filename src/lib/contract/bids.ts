/**
 * web-app/request-details-bids — wire types + mapper for the bids a renter received on a request.
 * Source: app backend `GET /marketplace/requests/{requestId}/bids` → renteeService.getBidList,
 * which returns `{ activeBids: [...], expiredBids: [...] }` (each bid enriched with supplier,
 * equipment, distance, match/conflict counts, current price, lifecycle status, dealRoomId).
 */

export type BidStatus =
  | "PENDING"
  | "OPEN_FOR_NEGOTIATION"
  | "COUNTER_OFFERED"
  | "ACCEPTED"
  | "EXPIRED"
  | "WITHDRAWN"
  | string;

export interface BidCard {
  id: string;
  status: BidStatus;
  supplierName: string;
  verified: boolean;
  rating: number | null;
  distanceKm: number | null;
  submittedAt: string | null;
  validUntil: string | null;
  /** Current price (deal-room-adjusted when negotiating, else the bid amount). */
  price: number | null;
  mobPrice: number | null;
  demobPrice: number | null;
  priceUnit: string | null;
  duration: number | null;
  equipment: { make: string | null; model: string | null; year: number | null; imageUrl: string | null } | null;
  matchCount: number;
  conflictCount: number;
  dealRoomId: string | null;
  expired: boolean;
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function mapBid(raw: Record<string, unknown>, expired: boolean): BidCard {
  const sup = (raw.supplier ?? {}) as Record<string, unknown>;
  const prof = (sup.supplierProfile ?? {}) as Record<string, unknown>;
  const eq = (raw.equipment ?? null) as Record<string, unknown> | null;
  return {
    id: String(raw.id ?? ""),
    status: (s(raw.status) as BidStatus) ?? "PENDING",
    supplierName: s(raw.supplierDisplayName) ?? s(sup.companyName) ?? ([s(sup.firstName), s(sup.lastName)].filter(Boolean).join(" ") || "Supplier"),
    verified: sup.supplierStatus === 2 || prof.verified === true,
    rating: n(sup.rating) ?? n(prof.rating),
    distanceKm: n(raw.distanceKm),
    submittedAt: s(raw.createdAt),
    validUntil: s(raw.validUntil),
    price: n(raw.currentPrice) ?? n(raw.priceAmount),
    mobPrice: n(raw.mobPrice),
    demobPrice: n(raw.demobPrice),
    priceUnit: s(raw.priceUnit),
    duration: n(raw.duration),
    equipment: eq
      ? { make: s(eq.make), model: s(eq.model), year: n(eq.year), imageUrl: s(eq.imageUrl) ?? s(eq.primaryPhotoUrl) }
      : null,
    matchCount: n(raw.matchCount) ?? 0,
    conflictCount: n(raw.conflictCount) ?? 0,
    dealRoomId: s(raw.dealRoomId),
    expired: expired || raw.isExpired === true || raw.status === "EXPIRED",
  };
}

/** Flatten the `{activeBids, expiredBids}` envelope → active first, then expired. */
export function mapBidList(raw: unknown): BidCard[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  const active = Array.isArray(r.activeBids) ? (r.activeBids as Record<string, unknown>[]) : [];
  const expired = Array.isArray(r.expiredBids) ? (r.expiredBids as Record<string, unknown>[]) : [];
  // Fallbacks for other possible envelopes.
  const flat = Array.isArray(r.bids) ? (r.bids as Record<string, unknown>[]) : Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  if (!active.length && !expired.length && flat.length) return flat.map((b) => mapBid(b, false));
  return [...active.map((b) => mapBid(b, false)), ...expired.map((b) => mapBid(b, true))];
}
