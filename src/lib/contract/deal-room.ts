/**
 * web-app/request-details-bids — deal-room wire types + mapper.
 * Source: app backend `GET /api/deal-rooms/{id}` (deal-room.service.getDealRoom). The renter is the
 * rentee party. Live chat runs over GetStream (channel = streamChannelId; token via stream-token).
 */

export type DealRoomStatus = "OPEN" | "NEGOTIATING" | "AWAITING_SUPPLIER_CONFIRMATION" | "CLOSED" | "ABANDONED" | string;

export interface DealParty {
  id: number | null;
  name: string;
  isVerified: boolean;
}

export type TermState = "fixed" | "soft_accepted" | "disputed" | "pending" | "agreed" | string;

/** One negotiable term in the deal room (mirrors the app's term list). */
export interface DealTerm {
  key: string;
  label: string;
  labelAr: string;
  state: TermState;
  value: unknown;
  renteePreference: unknown;
  supplierDeclared: unknown;
  itemLabel: string | null;
}

export interface DealRoomView {
  id: string;
  status: DealRoomStatus;
  contractType: string | null;
  streamChannelId: string | null;
  renteeId: number | null;
  supplierId: number | null;
  supplier: DealParty;
  /** Current price (last proposed in the room, falling back to the original bid). */
  rate: number | null;
  mobPrice: number | null;
  demobPrice: number | null;
  periods: number | null;
  priceUnit: string | null;
  /** Units the RFQ asked for — the rate is PER-UNIT, so the rental total multiplies by this
   *  (consistent with the bid cards + quotations + the backend deal quotation). */
  numberOfUnits: number;
  /** Who made the last counter ("rentee" | "supplier" | null). The renter is the rentee. */
  lastCounterBy: string | null;
  /** Convenience: is it the renter's turn to act (accept/counter)? */
  myTurn: boolean;
  /** Negotiable terms (excluding the implicit PRICE term, which the rate card handles). */
  terms: DealTerm[];
  /** True when a non-PRICE term is still disputed — the backend blocks accept-all until resolved. */
  hasDisputedTerms: boolean;
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * One document the renter can view in the deal room. The backend (`GET /api/deal-rooms/{id}/documents`)
 * returns the OTHER party's documents only — for the renter (rentee), that's the supplier's company
 * docs (CR, municipal license, insurance) and equipment docs (TÜV/SPSP/istimara/… + photos).
 * `url` is a backend presigned link; `fileType` is "pdf" or "image".
 */
export interface DealRoomDocument {
  type: string;
  label: string;
  labelAr: string | null;
  url: string;
  fileType: "pdf" | "image" | string;
}

/** Two groups, matching the app's documents sheet. */
export interface DealRoomDocuments {
  companyDocuments: DealRoomDocument[];
  equipmentDocuments: DealRoomDocument[];
}

function mapDoc(raw: Record<string, unknown>): DealRoomDocument {
  return {
    type: s(raw.type) ?? "",
    label: s(raw.label) ?? s(raw.type) ?? "Document",
    labelAr: s(raw.labelAr),
    url: s(raw.url) ?? "",
    fileType: s(raw.fileType) ?? "pdf",
  };
}

/**
 * The official quotation for a closed deal (app parity — `GET /api/deal-rooms/{id}/quotation`). The
 * backend generates the PDF from an admin-configured template and stores it in S3; `pdfUrl` is a
 * fresh presigned download link. `pdfStatus` is `PENDING` while the PDF is still being generated
 * (the app polls until it's ready), then ready.
 */
export interface QuotationView {
  pdfUrl: string | null;
  pdfStatus: string | null;
  quotationNumber: string | null;
}

export function mapQuotation(raw: unknown): QuotationView {
  const q = (raw ?? {}) as Record<string, unknown>;
  return {
    pdfUrl: s(q.pdfUrl),
    pdfStatus: s(q.pdfStatus),
    quotationNumber: s(q.quotationNumber) ?? s(q.number),
  };
}

export function mapDealRoomDocuments(raw: unknown): DealRoomDocuments {
  const r = (raw ?? {}) as Record<string, unknown>;
  const company = Array.isArray(r.companyDocuments) ? (r.companyDocuments as Record<string, unknown>[]) : [];
  const equipment = Array.isArray(r.equipmentDocuments) ? (r.equipmentDocuments as Record<string, unknown>[]) : [];
  return {
    companyDocuments: company.map(mapDoc).filter((d) => d.url),
    equipmentDocuments: equipment.map(mapDoc).filter((d) => d.url),
  };
}

export function mapDealRoom(raw: unknown): DealRoomView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const sup = (d.supplier ?? {}) as Record<string, unknown>;
  const bid = (d.bid ?? {}) as Record<string, unknown>;
  const status = (s(d.status) as DealRoomStatus) ?? "NEGOTIATING";
  const lastCounterBy = s(d.lastCounterBy);
  // Rentee's turn when negotiating and the last move wasn't the rentee's (supplier countered, or
  // the opening bid is on the table). Other statuses are not actionable by the renter.
  const myTurn = status === "NEGOTIATING" && lastCounterBy !== "rentee";

  // Terms — surface the negotiable ones (drop PRICE; the rate card owns it). Keep the rest so the
  // renter can see matches and resolve any differing (disputed) term before accepting all.
  const rawTerms = Array.isArray(d.terms) ? (d.terms as Record<string, unknown>[]) : [];
  const terms: DealTerm[] = rawTerms
    .filter((t) => s(t.key) !== "PRICE")
    .map((t) => ({
      key: s(t.key) ?? "",
      label: s(t.label) ?? s(t.key) ?? "",
      labelAr: s(t.labelAr) ?? s(t.label) ?? "",
      state: (s(t.state) as TermState) ?? "pending",
      value: t.value,
      renteePreference: t.renteePreference,
      supplierDeclared: t.supplierDeclared,
      itemLabel: s(t.itemLabel),
    }));
  const hasDisputedTerms = terms.some((t) => t.state === "disputed");

  return {
    id: String(d.id ?? ""),
    status,
    contractType: s(d.contractType),
    streamChannelId: s(d.streamChannelId),
    renteeId: n(d.renteeId),
    supplierId: n(d.supplierId),
    supplier: {
      id: n(sup.id),
      name: s(sup.companyName) ?? s(sup.storeName) ?? ([s(sup.firstName), s(sup.lastName)].filter(Boolean).join(" ") || "Supplier"),
      isVerified: sup.isVerified === true,
    },
    rate: n(d.lastProposedRate) ?? n(bid.priceAmount),
    mobPrice: n(d.lastProposedMobPrice) ?? n(bid.mobPrice),
    demobPrice: n(d.lastProposedDemobPrice) ?? n(bid.demobPrice),
    periods: n(bid.duration) ?? n((d.request as Record<string, unknown>)?.estimatedDurationDays),
    priceUnit: s(d.lastProposedPriceUnit) ?? s(bid.priceUnit),
    numberOfUnits:
      n((Array.isArray((d.request as Record<string, unknown>)?.equipmentItems) ? ((d.request as Record<string, unknown>).equipmentItems as Record<string, unknown>[])[0] : undefined)?.numberOfUnits) ?? 1,
    lastCounterBy,
    myTurn,
    terms,
    hasDisputedTerms,
  };
}
