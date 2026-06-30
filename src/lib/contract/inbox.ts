/**
 * Inbox / deal-room-per-bid (renter web). Maps the app-backend `GET /marketplace/received-bids` feed —
 * every bid offered to the renter across all their RFQs, enriched with the per-bid deal-room status +
 * unread count — into a lean row the inbox renders. A room may already exist (supplier opened it and
 * chatted first) before the renter ever taps: `dealRoomStatus === "OPEN"` + `unreadCount > 0` is the
 * "supplier started" signal. Reuses the app-backend; no new backend.
 */
export type InboxDealRoomStatus = "OPEN" | "NEGOTIATING" | "AWAITING_SUPPLIER_CONFIRMATION" | "CLOSED" | "ABANDONED" | string;

export interface InboxBid {
  bidId: string;
  status: string;
  dealRoomId: string | null;
  dealRoomStatus: InboxDealRoomStatus | null;
  unreadCount: number;
  currentPrice: number | null;
  priceUnit: string | null;
  agreedUnits: number | null;
  unitsOffered: number;
  supplierName: string;
  supplierLogoUrl: string | null;
  equipmentName: string | null;
  request: { id: string; displayId: string | null; shortCode: string | null; equipmentSummary: string | null };
  createdAt: string | null;
  /** Derived: a supplier opened the room and messaged before the renter entered (OPEN + unread). */
  supplierStarted: boolean;
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};

function mapRow(raw: Record<string, unknown>): InboxBid {
  const req = (raw.request ?? {}) as Record<string, unknown>;
  const eq = (raw.equipment ?? {}) as Record<string, unknown>;
  const items = Array.isArray(req.equipmentItems) ? (req.equipmentItems as Record<string, unknown>[]) : [];
  const item0 = items[0] ?? {};
  const equipmentName =
    [s(eq.manufacturer), s(eq.modelName)].filter(Boolean).join(" ") ||
    s(item0.subtypeName) ||
    s(item0.categoryName) ||
    null;
  const dealRoomStatus = (s(raw.dealRoomStatus) as InboxDealRoomStatus | null) ?? null;
  const unreadCount = n(raw.unreadCount) ?? 0;
  return {
    bidId: s(raw.id) ?? s(raw.bidId) ?? "",
    status: s(raw.status) ?? "PENDING",
    dealRoomId: s(raw.dealRoomId),
    dealRoomStatus,
    unreadCount,
    currentPrice: n(raw.currentPrice) ?? n(raw.priceAmount),
    priceUnit: s(raw.priceUnit),
    agreedUnits: n(raw.agreedUnits),
    unitsOffered: Array.isArray(raw.unitsOffered) ? raw.unitsOffered.length : (n(raw.unitsOffered) ?? 1),
    supplierName: s(raw.supplierDisplayName) ?? s(raw.supplierName) ?? "Supplier",
    supplierLogoUrl: s(raw.supplierLogoUrl),
    equipmentName,
    request: {
      id: s(req.id) ?? "",
      displayId: s(req.displayId),
      shortCode: s(req.shortCode),
      equipmentSummary: s(item0.subtypeName) ?? equipmentName,
    },
    createdAt: s(raw.createdAt) ?? s(raw.lastUpdatedAt),
    supplierStarted: dealRoomStatus === "OPEN" && unreadCount > 0,
  };
}

/** Parse the `GET /marketplace/received-bids` payload (an array, or `{ data: [...] }`) into InboxBid[]. */
export function mapReceivedBids(raw: unknown): InboxBid[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown>)?.data)
      ? ((raw as Record<string, unknown>).data as unknown[])
      : Array.isArray((raw as Record<string, unknown>)?.bids)
        ? ((raw as Record<string, unknown>).bids as unknown[])
        : [];
  return list.map((e) => mapRow((e ?? {}) as Record<string, unknown>)).filter((b) => b.bidId);
}
