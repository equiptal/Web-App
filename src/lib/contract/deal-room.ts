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
  /** Contact number. Server-gated: supplier.phone is always present; rentee.phone only once CLOSED. */
  phone: string | null;
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
  /** The platform's default/fallback value for this term (app parity — shown as a third reference row). */
  platformDefault: unknown;
  /** Mandatory terms must be resolved to close the deal (app shows a red "Mandatory" badge). */
  isMandatory: boolean;
  itemLabel: string | null;
  /** Inline choices for this term (from the resolved T3 platform default) — drives the pill picker
   *  when countering a non-binary / non-price term. */
  options: { value: string; labelEn: string; labelAr: string }[];
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
  /** Mobilization/demobilization RESPONSIBILITY (from the request item). When true the rentee arranges
   *  it (supplier charges nothing) — the quotation must still state it. */
  mobByRentee: boolean | null;
  demobByRentee: boolean | null;
  periods: number | null;
  priceUnit: string | null;
  /** Units the RFQ asked for — the rate is PER-UNIT, so the rental total multiplies by this
   *  (consistent with the bid cards + quotations + the backend deal quotation). */
  numberOfUnits: number;
  // ── deal-room/negotiation — per-type units + leg exclusion (shared backend) ──
  /** Matched RENTAL count (drives coverage); `null` = single-supplier/single-unit "full request". */
  agreedUnits: number | null;
  /** Matched mob/demob unit counts (each ≤ rental); `null` = not yet negotiated. */
  mobUnits: number | null;
  demobUnits: number | null;
  /** Persisted leg exclusion (both-sided) — render the excluded state from these, NOT local UI state. */
  mobExcluded: boolean;
  demobExcluded: boolean;
  /** The requested rental count — the stepper cap for all three unit types (both roles). */
  requestedUnits: number;
  /** Request short code (REQ-NNNNN) for the room header label. */
  shortCode: string | null;
  /** Who made the last counter ("rentee" | "supplier" | null). The renter is the rentee. */
  lastCounterBy: string | null;
  /** Convenience: is it the renter's turn to act (accept/counter)? */
  myTurn: boolean;
  /** Negotiable terms (excluding the implicit PRICE term, which the rate card handles). */
  terms: DealTerm[];
  /** True when a non-PRICE term is still disputed — the backend blocks accept-all until resolved. */
  hasDisputedTerms: boolean;
  /** True when the supplier opened the room first (chatted before the renter entered) — drives the
   *  "Supplier started this conversation" banner. Pairs with status==="OPEN" before the renter enters. */
  supplierFirstEntry: boolean;
  /** Structured rental/equipment/operator details from the request item — surfaced on the quotation
   *  (the negotiated Agreed/Fixed terms are separate). All optional; the quotation skips empty rows. */
  details: DealItemDetails;
}

/** Request-item details for the quotation (mapped tolerantly from the raw deal-room payload's
 *  `request` + `equipmentItems[0]`; field names best-effort, empties dropped by the renderer). */
export interface DealItemDetails {
  equipmentLabel: string | null;
  equipmentLabelAr: string | null;
  /** Capacity/size (e.g. "30 ton") — shown next to the equipment name, mirroring the request/bid cards. */
  equipmentSize: string | null;
  equipmentSizeAr: string | null;
  location: string | null;
  rentalType: string | null;
  startDate: string | null;
  endDate: string | null;
  workingHoursPerDay: number | null;
  workingDaysPerWeek: number | null;
  fulfillment: string | null;
  urgency: string | null;
  subletting: boolean | null;
  localContent: boolean | null;
  overtimeRate: string | null;
  additionalNotes: string | null;
  extendable: boolean | null;
  operatorIncluded: boolean | null;
  operatorNationality: string | null;
  numberOfOperators: number | null;
  nightShift: boolean | null;
  equipmentCerts: string[];
  operatorCerts: string[];
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
    // The signed link is normally `url`; `toSignedStructured`-based payloads put it under `key`.
    url: s(raw.url) ?? s(raw.key) ?? "",
    fileType: s(raw.fileType) ?? "pdf",
  };
}

/**
 * The official quotation for a closed deal (app parity — `GET /api/deal-rooms/{id}/quotation`). The
 * backend generates the PDF from an admin-configured template and stores it in S3; `pdfUrl` is a
 * fresh presigned download link. `pdfStatus` is `PENDING` while the PDF is still being generated
 * (the app polls until it's ready), then ready.
 */
/** One agreed term snapshotted on the confirmed Quotation row (backend `agreedTerms` JSON). */
export interface QuotationTerm {
  key: string;
  label: string;
  labelAr: string;
  value: unknown;
}

export interface QuotationView {
  pdfUrl: string | null;
  pdfStatus: string | null;
  quotationNumber: string | null;
  // Agreed snapshot from the Quotation row — the server PDF is DISABLED, so the web renders the
  // quotation client-side from these (+ the DealRoomView) the way the app does (extractQuotationData).
  agreedRate: number | null;
  priceUnit: string | null;
  contractType: string | null;
  agreedTerms: QuotationTerm[];
  renteePhone: string | null;
  supplierPhone: string | null;
  renteeEmail: string | null;
  supplierEmail: string | null;
}

export function mapQuotation(raw: unknown): QuotationView {
  const q = (raw ?? {}) as Record<string, unknown>;
  const agreedTermsRaw = Array.isArray(q.agreedTerms) ? (q.agreedTerms as Record<string, unknown>[]) : [];
  return {
    pdfUrl: s(q.pdfUrl),
    pdfStatus: s(q.pdfStatus),
    // The backend Quotation model has no human quotation number — fall back to its id (uuid) so the
    // doc still carries a stable reference. (/web:link-backend deal-room: quotationNumber gap.)
    quotationNumber: s(q.quotationNumber) ?? s(q.number) ?? s(q.id),
    agreedRate: n(q.agreedRate),
    priceUnit: s(q.priceUnit),
    contractType: s(q.contractType),
    agreedTerms: agreedTermsRaw.map((t) => ({
      key: s(t.key) ?? "",
      label: s(t.label) ?? s(t.key) ?? "",
      labelAr: s(t.labelAr) ?? s(t.label) ?? "",
      value: t.value,
    })),
    renteePhone: s(q.renteePhone),
    supplierPhone: s(q.supplierPhone),
    renteeEmail: s(q.renteeEmail),
    supplierEmail: s(q.supplierEmail),
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
  // Rentee's turn (app parity, deal_card_vm.dart): the renter can act whenever the deal is live and the
  // last move wasn't theirs — that INCLUDES an OPEN room (the opening bid on the table, no counter yet),
  // not just NEGOTIATING. Terminal (CLOSED/ABANDONED) and AWAITING_SUPPLIER_CONFIRMATION are not actionable.
  const myTurn = (status === "OPEN" || status === "NEGOTIATING") && lastCounterBy !== "rentee";

  // Terms — surface the negotiable ones (drop PRICE; the rate card owns it). Keep the rest so the
  // renter can see matches and resolve any differing (disputed) term before accepting all.
  const rawTerms = Array.isArray(d.terms) ? (d.terms as Record<string, unknown>[]) : [];
  // The backend still emits the RETIRED combined `fat` term ("Operator FAT") alongside the newer split
  // `fat_food` / `fat_accommodation_transport` rows (kept for in-flight rooms). On older bids the legacy
  // control carried a stale default (e.g. `fat = supplier`) while the split values were correct, so the
  // legacy row disputes and shows a PHANTOM "Operator FAT" conflict. When the split rows are present they
  // are the real per-item FAT — drop the stale combined row so it can't manufacture a conflict.
  const hasSplitFat = rawTerms.some((t) => { const k = s(t.key); return k === "fat_food" || k === "fat_accommodation_transport"; });
  // Priced line items (mob/demob PRICING) are NOT negotiable term cards — they're settled on the counter
  // flow's Price page (rate card mobPrice/demobPrice), so drop them from the term rows.
  // `mobilization_lead_time` is CONFLICT_ELIGIBLE in the app (deal-room.service CONFLICT_ELIGIBLE_KEYS —
  // moved Priced → Negotiable), so it MUST render as a negotiable term and is NOT dropped here.
  const PRICE_LINE_KEYS = new Set(["mobilization_pricing", "demobilization_pricing"]);
  const terms: DealTerm[] = rawTerms
    .filter((t) => s(t.key) !== "PRICE")
    .filter((t) => !PRICE_LINE_KEYS.has(s(t.key) ?? ""))
    .filter((t) => !(hasSplitFat && s(t.key) === "fat"))
    .map((t) => ({
      key: s(t.key) ?? "",
      label: s(t.label) ?? s(t.key) ?? "",
      labelAr: s(t.labelAr) ?? s(t.label) ?? "",
      state: (s(t.state) as TermState) ?? "pending",
      value: t.value,
      renteePreference: t.renteePreference,
      supplierDeclared: t.supplierDeclared,
      platformDefault: t.platformDefault ?? t.platform_default ?? t.defaultValue ?? null,
      isMandatory: t.isMandatory === true || t.mandatory === true,
      itemLabel: s(t.itemLabel),
      options: (Array.isArray(t.options) ? (t.options as Record<string, unknown>[]) : []).map((o) => ({
        value: s(o.value) ?? "",
        labelEn: s(o.labelEn) ?? s(o.label) ?? s(o.value) ?? "",
        labelAr: s(o.labelAr) ?? s(o.labelEn) ?? s(o.value) ?? "",
      })),
    }));
  const hasDisputedTerms = terms.some((t) => t.state === "disputed");

  // Price-basis units (app parity: quotation.service extractQuotationData) — the deal total scales by
  // the SUPPLIER'S OFFERED count, NOT the requested count. Precedence: agreedUnits → bid.unitsOffered
  // length → request numberOfUnits → 1.
  const reqObj = (d.request ?? {}) as Record<string, unknown>;
  const firstReqItem = (Array.isArray(reqObj.equipmentItems) ? (reqObj.equipmentItems as Record<string, unknown>[])[0] : undefined) ?? {};
  const requestedUnits = n(firstReqItem.numberOfUnits) ?? 1;
  const offeredUnits = Array.isArray(bid.unitsOffered) && bid.unitsOffered.length > 0 ? bid.unitsOffered.length : null;
  const priceUnits = n(d.agreedUnits) ?? offeredUnits ?? requestedUnits;

  // Structured item details for the quotation — read from the item first, then the request. Field
  // names are best-effort (tolerant fallbacks); the quotation renderer skips whatever comes back empty.
  const pick = (...keys: string[]): unknown => {
    for (const k of keys) {
      if (firstReqItem[k] != null && firstReqItem[k] !== "") return firstReqItem[k];
      if (reqObj[k] != null && reqObj[k] !== "") return reqObj[k];
    }
    return null;
  };
  const bl = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  const details: DealItemDetails = {
    // Equipment name = subtype (matches the request/bid cards); capacity = size. Fall back to the older keys.
    equipmentLabel: s(pick("subtypeName", "label", "equipmentName", "name", "subcategoryName", "categoryName")),
    equipmentLabelAr: s(pick("subtypeNameAr")),
    equipmentSize: s(pick("capacityName", "size", "capacity")),
    equipmentSizeAr: s(pick("capacityNameAr")),
    location: s(pick("location", "city", "projectLocation", "siteLocation", "deliveryLocation")),
    rentalType: s(pick("rentalType", "rentalBasis")),
    startDate: s(pick("startDate", "deliveryDate", "estimatedStartDate", "requiredDate")),
    endDate: s(pick("endDate", "returnDate")),
    workingHoursPerDay: n(pick("workingHoursPerDay", "workingHours")),
    workingDaysPerWeek: n(pick("workingDaysPerWeek", "workingDays")),
    fulfillment: s(pick("fulfillmentType", "fulfillment")),
    urgency: s(pick("urgency", "urgencyLevel")),
    subletting: bl(pick("subletting", "sublettingAllowed")),
    localContent: bl(pick("localContent", "localContentRequired", "requiresLocalContent")),
    overtimeRate: s(pick("overtimeRate")),
    additionalNotes: s(pick("additionalNotes", "notes", "additionalRequirements")),
    extendable: bl(pick("extendable", "rentalExtendable")),
    operatorIncluded: bl(pick("operatorIncluded", "operator", "withOperator")),
    operatorNationality: s(pick("operatorNationality")),
    numberOfOperators: n(pick("numberOfOperators", "operatorsCount", "operatorCount")),
    nightShift: bl(pick("nightShiftRequired", "nightShift")),
    equipmentCerts: arr(pick("safetyCertifications", "equipmentSafetyCertifications", "equipmentCerts")),
    operatorCerts: arr(pick("operatorSafetyCertifications", "operatorCerts", "operatorCertifications")),
  };

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
      phone: s(sup.phone),
    },
    rate: n(d.lastProposedRate) ?? n(bid.priceAmount),
    mobPrice: n(d.lastProposedMobPrice) ?? n(bid.mobPrice),
    demobPrice: n(d.lastProposedDemobPrice) ?? n(bid.demobPrice),
    mobByRentee: bl(pick("mobilizationByRentee", "mobByRentee")),
    demobByRentee: bl(pick("demobilizationByRentee", "demobByRentee")),
    // The Bid model has no `duration` (confirmed via /web:link-backend) — the request's estimated
    // duration is the source of truth.
    periods: n((d.request as Record<string, unknown>)?.estimatedDurationDays),
    priceUnit: s(d.lastProposedPriceUnit) ?? s(bid.priceUnit),
    numberOfUnits: priceUnits,
    // deal-room/negotiation — per-type units + exclusion + header code (from the widened payload).
    agreedUnits: n(d.agreedUnits),
    mobUnits: n(d.mobUnits),
    demobUnits: n(d.demobUnits),
    mobExcluded: d.mobExcluded === true,
    demobExcluded: d.demobExcluded === true,
    requestedUnits,
    shortCode: s(reqObj.shortCode),
    lastCounterBy,
    myTurn,
    terms,
    hasDisputedTerms,
    supplierFirstEntry: d.supplierFirstEntry === true,
    details,
  };
}
