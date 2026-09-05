/**
 * Inbox / deal-room-per-bid (renter web). Maps the app-backend `GET /marketplace/received-bids` feed —
 * every bid offered to the renter across all their RFQs, enriched with the per-bid deal-room status +
 * unread count — into a lean row the inbox renders. A room may already exist (supplier opened it and
 * chatted first) before the renter ever taps: `dealRoomStatus === "OPEN"` + `unreadCount > 0` is the
 * "supplier started" signal. Reuses the app-backend; no new backend.
 */
import { readSupplierCompanyId, readSupplierId } from "./bids";

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
  /** The bidding MEMBER, and the FIRM behind him. The chat dock groups its tabs by
   *  `bidSupplierKey` (company → member → name), because two colleagues of one firm are ONE
   *  counterparty — the backend puts them in the same Stream channel (004a §2, RM3-AC-45). Both are
   *  raw `Bid` columns the received-bids projection spreads, and both read null on an older payload,
   *  in which case the grouping falls back to the name. */
  supplierId: string | null;
  supplierCompanyId: string | null;
  supplierLogoUrl: string | null;
  equipmentName: string | null;
  /** For 2-level inbox grouping: RFQ group (fan-out `requestGroupId`) then equipment type. `groupId`
   *  is null until the backend projects it on received-bids — grouping falls back to the request id. */
  request: { id: string; displayId: string | null; shortCode: string | null; equipmentSummary: string | null; groupId: string | null; location: string | null };
  equipmentType: { id: string | null; name: string | null };
  /**
   * The machine as the REQUEST names it: its SUBTYPE and its SIZE, in both locales (owner,
   * 2026-09-05: *"show equipment subtype and size, not model and year"*).
   *
   * `equipmentName` above is the supplier's LISTING — «Caterpillar 320» — which answers a different
   * question: it says which machine he is offering, not which machine was asked for. On a renter's
   * rail of incoming bids the second is what he is scanning for, and two suppliers offering the same
   * 20-ton excavator under different model numbers read as two unrelated machines.
   *
   * Both halves come off the request's own enriched item (`subtypeName` / `capacityName`), so they
   * are the same words the request card and the workspace print.
   */
  equipment: { subtype: string | null; subtypeAr: string | null; size: string | null; sizeAr: string | null };
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
    // The SAME derivation the bid list uses (`mapBid`), not a second one that reads the flat keys
    // only. The chat dock keys its anchor tab from a `BidCard` and its rows from these `InboxBid`s
    // (004a §2); on any projection that nests the company id, a narrower reader here made the anchor
    // resolve a company key while the rows fell back to `supplierId` — the two never matched, and
    // every sibling bid of the same firm vanished from the tab strip.
    supplierId: readSupplierId(raw),
    supplierCompanyId: readSupplierCompanyId(raw),
    supplierLogoUrl: s(raw.supplierLogoUrl),
    equipmentName,
    request: {
      id: s(req.id) ?? "",
      displayId: s(req.displayId),
      shortCode: s(req.shortCode),
      equipmentSummary: s(item0.subtypeName) ?? equipmentName,
      // `requestGroupId` collapses a multi-item RFQ's fan-out siblings — null until the backend adds it.
      groupId: s(req.requestGroupId) ?? s(req.groupId),
      location: s(req.projectAddressLabel),
    },
    equipmentType: { id: s(item0.subtypeId) ?? s(item0.categoryId), name: s(item0.subtypeName) ?? s(item0.categoryName) ?? equipmentName },
    equipment: {
      subtype: s(item0.subtypeName) ?? s(item0.categoryName),
      subtypeAr: s(item0.subtypeNameAr) ?? s(item0.categoryNameAr),
      size: s(item0.capacityName),
      sizeAr: s(item0.capacityNameAr),
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
