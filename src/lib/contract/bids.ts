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

/** Safety/credential cert codes (app parity: CertType — LC/SASO/TÜV/SPSP). */
// ARAMCO added per the 2026-07 cert rule (TÜV + Aramco are the offered equipment certs; SPSP/SASO stay
// for legacy data). Labels per 013 acceptance (AC-01/02): LC → "محتوى محلي", SASO → "شهادة SASO".
export type CertCode = "TUV" | "ARAMCO" | "SPSP" | "SASO" | "LC";
export const CERT_LABEL: Record<CertCode, { en: string; ar: string }> = {
  TUV: { en: "TÜV", ar: "TÜV" },
  ARAMCO: { en: "Aramco Certified", ar: "معتمد من أرامكو" },
  SPSP: { en: "SPSP", ar: "SPSP" },
  SASO: { en: "SASO certificate", ar: "شهادة SASO" },
  LC: { en: "Local content", ar: "محتوى محلي" },
};
function toCert(raw: string): CertCode | null {
  const u = raw.trim().toUpperCase();
  if (u === "LC" || /LOCAL.?CONTENT/.test(u)) return "LC";
  if (/ARAMCO/.test(u)) return "ARAMCO";
  if (/SASO/.test(u)) return "SASO";
  if (/TUV|TÜV/.test(u)) return "TUV";
  if (/SPSP/.test(u)) return "SPSP";
  return null;
}
function certList(v: unknown): CertCode[] {
  const out: CertCode[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const c = toCert(String(x));
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}
/**
 * Equipment `documentKeys[].type` → EQUIPMENT safety cert (Level 2), EXACT match only. The equipment
 * safety certs are tuv / spsp / saso / saso_technical_inspection. Ownership/PoO types (istimara,
 * customs, sale_contract, saso_registration) return null here — they're handled as ownership docs.
 * LC is NOT an equipment doc: Local Content is a COMPANY (Level 1) cert (`localContentDocKey`), so it
 * is intentionally absent here.
 */
function eqDocTypeToCert(type: string): CertCode | null {
  const t = type.trim().toLowerCase();
  if (t === "tuv" || t === "tüv") return "TUV";
  if (t === "aramco" || t === "aramco_certified" || t === "aramco_certificate") return "ARAMCO";
  if (t === "spsp") return "SPSP";
  // saso AND saso_technical_inspection are the SASO safety cert (NOT ownership, NOT company SASO reg).
  if (t === "saso" || t === "saso_technical_inspection" || t === "saso-technical" || t === "saso_technical") return "SASO";
  return null;
}
/** Equipment proof-of-ownership / registration doc types → labels (Business-documents row).
 *  NOTE: saso_technical_inspection is a SASO CERT (see eqDocTypeToCert), so it's NOT listed here;
 *  only true ownership docs are. */
const OWNERSHIP_DOC_LABELS: Record<string, { key: string; labelEn: string; labelAr: string }> = {
  istimara: { key: "istimara", labelEn: "Istimara", labelAr: "استمارة" },
  customs: { key: "customs", labelEn: "Customs", labelAr: "بيان جمركي" },
  sale_contract: { key: "sale_contract", labelEn: "Sale contract", labelAr: "عقد بيع" },
  saso_registration: { key: "saso_registration", labelEn: "SASO registration", labelAr: "تسجيل ساسو" },
};

/**
 * Which level of the §7.3 location precedence produced a unit's (or a bid's) coordinates. Highest
 * wins: anything the supplier did for THIS BID outranks a fleet default, and anything done per UNIT
 * outranks anything done per bid.
 *
 * `unit_yard` is the ONLY level that counts as confirmed — it is the one the supplier can reach only
 * by committing this machine to this bid through the readiness card, naming the yard it leaves from.
 * Levels 2–4 are inferred, so they are all "not confirmed" no matter how precise the coordinate is.
 *
 * `unidentified` and `none` must NEVER be merged: `unidentified` means there is no machine at all
 * (the offered count exceeds the machines named — array padding), so there is nothing to document,
 * inspect or locate; `none` means a real, registered machine whose every location level is null
 * (e.g. its yard row was deleted). The renter's exposure differs completely.
 */
export type UnitLocationSource = "unit_yard" | "bid_pin" | "bid_yard" | "listing_yard" | "unidentified" | "none";

/** A document on an offered unit (bid-readiness). URL is a short-lived presigned link (server-signed). */
export interface OfferedUnitDoc { type: string; key: string; url: string | null; verifyStatus: string | null; expiryDate: string | null; }
/** A photo on an offered unit — `slot` ∈ {front, serial, hours, …}. `url` is presigned. */
export interface OfferedUnitPhoto { slot: string; key: string; url: string | null; }
/** One equipment unit a supplier offered on a NATIVE app bid (bid-readiness — `offeredUnitsDetail`).
 *  Ownership docs are stripped server-side for the renter. Absent on off-platform shared-link bids. */
export interface OfferedUnitDetail {
  equipmentId: string;
  manufacturer: string | null;
  modelName: string | null;
  year: number | null;
  fuelType: string | null;
  licensePlateNumber: string | null;
  subcategoryName: string | null;
  subcategoryNameAr: string | null;
  measurementName: string | null;
  measurementNameAr: string | null;
  documentKeys: OfferedUnitDoc[];
  photoKeys: OfferedUnitPhoto[];
  /* ── §7.2 per-unit location. ADDITIVE and OPTIONAL on purpose: the backend change (RMAP T1) has not
   * shipped, and the mobile app parses the same payload, so every reader must treat "absent" as a
   * legitimate answer rather than a malformed unit. `bid-map.ts` normalises the absences in one place. */
  /** The yard this unit leaves from, per §7.3 level 1. */
  yardId?: string | null;
  yardName?: string | null;
  yardCity?: string | null;
  /**
   * The supplier ticked this unit's yard on the readiness card. **Reported verbatim (§7.7 / AC-10),
   * never rendered.** Supplier-side it is derived from `yardId != null`
   * (`bid_readiness_bloc.dart:442` sets it from the yard's presence, `:245` pre-fills that yard from
   * the machine's registered one), so it is true for every readiness-written entry and carries nothing
   * `locationSource === 'unit_yard'` does not already say. Colour comes from `unitAvailability()` in
   * `bid-map.ts` — do not read this for it.
   */
  yardConfirmed?: boolean;
  lat?: number | null;
  lng?: number | null;
  /** This unit's own distance to the request's project site, from the same `haversineKm` the bid's
   *  distance uses — so a unit's distance is directly comparable to its bid's. */
  distanceKm?: number | null;
  locationSource?: UnitLocationSource;
}

const OFFERED_UNIT_LOCATION_SOURCES: UnitLocationSource[] = ["unit_yard", "bid_pin", "bid_yard", "listing_yard", "unidentified", "none"];
/** An unrecognised level reads as ABSENT, not as a made-up one: a level we can't name must never be
 *  guessed into `unit_yard`, which is the only value that turns a pin green. */
function offeredUnitLocationSource(v: unknown): UnitLocationSource | undefined {
  const t = String(v ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return OFFERED_UNIT_LOCATION_SOURCES.find((x) => x === t);
}

/**
 * ONE raw `offeredUnitsDetail` entry → a typed unit, camel/snake tolerant.
 *
 * Exported because the §7.12 fleet endpoint (`GET /marketplace/bids/{bidId}/fleet`) serves rows of
 * exactly this shape — the backend projects both through the same `projectOfferedUnit` — plus three
 * extra fields. `fleet.ts` extends this rather than re-deriving it, so a bid's units and its supplier's
 * fleet can never be parsed into two subtly different objects.
 */
export function mapOfferedUnit(raw: unknown): OfferedUnitDetail {
  const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
  const num = (v: unknown): number | null => (typeof v === "number" ? v : v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
  const o = (raw ?? {}) as Record<string, unknown>;
  const docs = (Array.isArray(o.documentKeys) ? o.documentKeys : Array.isArray(o.document_keys) ? o.document_keys : []) as unknown[];
  const photos = (Array.isArray(o.photoKeys) ? o.photoKeys : Array.isArray(o.photo_keys) ? o.photo_keys : []) as unknown[];
  const yard = ((o.yard ?? {}) as Record<string, unknown>) ?? {};
  return {
    equipmentId: String(o.equipmentId ?? o.equipment_id ?? o.id ?? ""),
    manufacturer: str(o.manufacturer ?? o.make),
    modelName: str(o.modelName ?? o.model_name ?? o.model),
    year: num(o.year),
    fuelType: str(o.fuelType ?? o.fuel_type),
    licensePlateNumber: str(o.licensePlateNumber ?? o.license_plate_number ?? o.plate),
    subcategoryName: str(o.subcategoryName ?? o.subcategory_name),
    subcategoryNameAr: str(o.subcategoryNameAr ?? o.subcategory_name_ar),
    measurementName: str(o.measurementName ?? o.measurement_name),
    measurementNameAr: str(o.measurementNameAr ?? o.measurement_name_ar),
    documentKeys: docs.map((d) => { const x = (d ?? {}) as Record<string, unknown>; return { type: String(x.type ?? x.code ?? ""), key: String(x.key ?? ""), url: str(x.url), verifyStatus: str(x.verifyStatus ?? x.verify_status), expiryDate: str(x.expiryDate ?? x.expiry_date) }; }),
    photoKeys: photos.map((p) => { const x = (p ?? {}) as Record<string, unknown>; return { slot: String(x.slot ?? x.type ?? ""), key: String(x.key ?? ""), url: str(x.url) }; }),
    // §7.2 per-unit location, camel/snake tolerant like every other field here. The backend flattens
    // the yard onto the unit; a nested `yard: {…}` is accepted too so an older/other projection of the
    // same data still parses. `yardConfirmed` stays undefined when absent — `false` would assert the
    // supplier declined to confirm, which is not what a missing field means.
    yardId: str(o.yardId ?? o.yard_id ?? yard.id),
    yardName: str(o.yardName ?? o.yard_name ?? yard.name),
    yardCity: str(o.yardCity ?? o.yard_city ?? yard.city),
    yardConfirmed: typeof (o.yardConfirmed ?? o.yard_confirmed) === "boolean" ? Boolean(o.yardConfirmed ?? o.yard_confirmed) : undefined,
    lat: num(o.lat ?? o.latitude ?? yard.latitude ?? yard.lat),
    lng: num(o.lng ?? o.longitude ?? yard.longitude ?? yard.lng),
    distanceKm: num(o.distanceKm ?? o.distance_km),
    locationSource: offeredUnitLocationSource(o.locationSource ?? o.location_source),
  };
}

/** Parse the raw `offeredUnitsDetail` array (getBidList / getBidDetail) → typed units. undefined when
 *  absent/empty (off-platform bids), so the readiness surface only renders for native app bids. */
function mapOfferedUnits(raw: unknown): OfferedUnitDetail[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map(mapOfferedUnit);
}

export interface BidCard {
  id: string;
  status: BidStatus;
  /** Won via a RENTEE_OUTCOME survey (app parity: `wonViaSurvey`) — the rentee reported this supplier
   *  as the winner. Distinct from a deal-room accept (`status === "ACCEPTED"`); both = a decided winner. */
  wonViaSurvey?: boolean;
  supplierId: string | null;
  /**
   * The FIRM behind the bidding member (`Bid.supplierCompanyId`). Two colleagues of one company are ONE
   * counterparty (AC-70) — the backend already models it that way: `supplierBidScopeWhere` scopes bids
   * by company, and the deal room adds every active colleague of both firms to the same Stream channel.
   * Group by this FIRST (see `bidSupplierKey`), never by `supplierId` alone. Null for a supplier with no
   * company, and on older payloads.
   */
  supplierCompanyId: string | null;
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
  /** Units the RFQ asked for (request.equipmentItems[0].numberOfUnits). The bid price is PER-UNIT, so
   *  totals on the card + quotation multiply by this (app parity: v3_bid_card.dart). */
  numberOfUnits: number;
  /** Units THIS supplier offered to cover (bid.units_offered length). ≤ numberOfUnits. Drives
   *  fulfillment ("covers X of Y units"); defaults to numberOfUnits when the bid doesn't specify. */
  unitsOffered: number;
  /** Live deal-room unit overlay (app parity: v3_bid_card `_liveRentalUnits`/`_buildPriceArgs`). The
   *  negotiated rental count (agreedUnits, else the mid-negotiation currentRentalUnits) + per-leg mob/
   *  demob counts + exclusion. null → not negotiated. Drives the card price so it tracks the deal room. */
  agreedUnits?: number | null;
  currentRentalUnits?: number | null;
  mobUnits?: number | null;
  demobUnits?: number | null;
  mobExcluded?: boolean;
  demobExcluded?: boolean;
  /** The request's equipment-year requirement (raw maxEquipmentAge — a min year like 2020, or an age). */
  reqMinYear: number | null;
  equipment: { id: string | null; make: string | null; model: string | null; year: number | null; imageUrl: string | null } | null;
  /** Whether the offered equipment is verified (for the comparison's compliance block). */
  eqVerified: boolean;
  /** Supplier credentials for the comparison's compliance block (from the bid's supplier projection). */
  compliance: {
    entityType: "company" | "individual";
    activityLicense: boolean; // commercial registration (crNumber)
    taxNumber: boolean; // VAT (vatNumber)
    nationalAddress: boolean; // national address doc on file
    safety: boolean; // TÜV / SPSP
    saso: boolean;
    localContent: boolean;
  };
  /** Supplier's real company-doc VALUES (bid-list supplierProfile) — used by the quotation identity
   *  rows. null when not provided → the quotation shows the app's "Verified" pill instead. */
  supplierCrNumber?: string | null;
  supplierVatNumber?: string | null;
  supplierNationalAddress?: string | null;
  /** Supplier contact for the quotation party block (app parity). Phone ships today (bid-list sends it);
   *  email is null until the bid-list projection adds it (backend), then the Email row lights up. */
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  matchCount: number;
  conflictCount: number;
  dealRoomId: string | null;
  expired: boolean;
  /** Free-text note the supplier attached to this bid (app: BidModel.note). */
  note: string | null;
  /** Certs the RFQ asked for (app: request.requiredCerts) — drives the credential pills. */
  requiredCerts: CertCode[];
  /** FLAT held-cert union (backend resolveHeldCerts parity) — used for required-cert matching. Mixes
   *  Level 1 + Level 2; for level-accurate display use companyCertCodes / equipmentCertCodes. */
  heldCertCodes: CertCode[];
  /** LEVEL 1 (Company): certs held in the supplier's verification — LC (localContentDocKey) + SASO
   *  registration (sasoHeavyEquipDocKey) + heldCertDocs. Rendered in the Company documents group. */
  companyCertCodes?: CertCode[];
  /** LEVEL 2 (Equipment): safety certs from equipment.documentKeys (TÜV/SPSP/SASO/saso_technical) —
   *  the equipment-level cert pills. */
  equipmentCertCodes?: CertCode[];
  /** LEVEL 2 (Equipment) proof-of-ownership docs the equipment carries (istimara / customs /
   *  sale_contract / saso_registration) — held documents, never a cert pill. */
  ownershipDocs: { key: string; labelEn: string; labelAr: string }[];
  /** bid-readiness: the equipment units this supplier offered, with presigned doc/photo links. Only on
   *  NATIVE app bids (getBidList / getBidDetail `offeredUnitsDetail`); undefined for off-platform bids. */
  offeredUnitsDetail?: OfferedUnitDetail[];
  /* ── §7.4 bid-level coordinates (RMAP T3). The BID is never plotted (AC-169 — every pin is a machine);
   * these exist so a unit with no location of its own can fall back down the §7.3 chain inside the
   * panel, and so `distanceKm` has a stated origin. Levels 2–4 only: a bid can never be `unit_yard`. */
  lat?: number | null;
  lng?: number | null;
  locationSource?: UnitLocationSource;
  /** Raw requested equipment-cert codes from the request item (lowercase, e.g. ["aramco","tuv"]) — kept
   *  alongside `requiredCerts` (CertCode[]) so readiness can count certs the CertCode enum can't name. */
  reqEquipmentCerts?: string[];
  /** LEVEL 3 (Operator): a declared deal-room term, NOT a held-doc pill. Rentee's required operator
   *  license level (request operatorLicenseLevel) + the supplier's declared position (t3Declarations). */
  operatorCertReq?: string | null;
  operatorCertDeclared?: string | null;
  /** Lead times for the price breakdown's mobilization/return rows (013 AC-11 inline tags). */
  mobLeadTime: string | null;
  demobLeadTime: string | null;
  /** Per-class term status for the card badges + Terms modal — MIRRORS THE MOBILE APP'S BID CARD:
   *  Equipment (6), Project/contract (4), Supplier (CR + VAT, 2). Equipment + contract are the
   *  request-vs-offer compare (deal-room-overlaid). */
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
  /** Web comparison-only: the full deal-room negotiable + acknowledge terms (overlaid live). Feeds the
   *  side-by-side "Negotiable terms" section; NOT shown on the bid card so the card matches the app. */
  negotiableTerms?: TermRow[];
  /** Who the RENTEE asked to bear each cost (from the request) — drives the comparison's add-cost
   *  gating (add only when it's on the rentee) and conflict colouring. supplier / me. */
  requestResponsibilities?: Partial<Record<"fuel" | "maintenance" | "overtime" | "operator_food" | "operator_transport_accommodation", "supplier" | "me">>;
  /** The renter's RFQ term values (raw) — rendered as Equipment-terms + Contract-terms cards in the
   *  generated quotation. Request-level (payment/maintenance) + first-item operator/fuel. */
  requestTerms: {
    operatorIncluded: string | null;
    operatorNationality: string | null;
    fuelType: string | null;
    paymentMethod: string | null;
    paymentTerms: string | null;
    breakdownResponseSla: string | null;
    overtimeRate: string | null;
    maintenanceResponsibility: string | null;
  };
  /** The SUPPLIER's DECLARED (T3) term values — the app's quotation shows these, not the renter's
   *  (often-blank) request terms. Null when the supplier didn't declare that term. Absent on
   *  off-platform (shared-link) bids, which carry no T3 declarations. */
  declaredTerms?: {
    paymentTerms: string | null;
    breakdownResponseSla: string | null;
    overtimeRate: string | null;
    operatorNationality: string | null;
    fuelResponsibility: string | null;
  };
  /** Normalized keys of terms AGREED/locked in the deal room — drives the quotation's "Agreed" badge. */
  agreedTermKeys?: string[];
  /** 014 lifecycle, server-enriched in getBidList (same source the mobile bid card reads). Drives the
   *  live deal-terms strip + overlays locked terms onto the Terms modal / quotation. */
  lockedTerms: { key: string; value: unknown }[]; // agreed terms + their negotiated value
  unreadTerms: string[]; // term keys with a counter the renter hasn't seen
  progress: { agreed: number; total: number }; // agreed-terms meter
  lastEventAr: string | null; // last-event copy (e.g. "منذ ٣ دقائق")
  round: number; // negotiation round
  /** Deal-room turn state (app parity — getBidList `uiState`): drives the top status banner.
   *  `new` = just submitted, `fresh` = updated, `your-turn` = supplier countered (renter acts),
   *  `waiting` = renter countered (awaiting supplier). null when no room/derivation. */
  uiState: "new" | "fresh" | "your-turn" | "waiting" | null;
  /* ── web-app/006 (expanded) shared-link bids ──
   * An off-platform bid a supplier submitted through the renter's shared link (no account). Mapped
   * from a real `LinkBidSubmission` via `submissionToBidCard` (lib/contract/link-bids). Renders as a
   * distinct "via shared link" card (no deal room) with a flat quoted total and a read-only
   * "view submission" viewer instead of the negotiate footer. */
  viaSharedLink?: boolean;
  /** web-app/006 (convert): a real app bid that was MATERIALIZED from an off-platform shared-link
   *  submission (backend `Bid.converted`). It's a first-class app bid (has a deal room), but the
   *  renter UI keeps labelling + counting it as **off-platform** — its origin. */
  converted?: boolean;
  /** Flat quoted total (incl VAT) for a link bid — shown instead of the rate/period breakdown. */
  quotedTotal?: number | null;
  /** The submission id the read-only viewer opens (off-platform supplier submission). */
  submissionKey?: string;
  /** The request item this link-bid card represents — lets the viewer focus a single item. */
  requestItemId?: string;
  /** "submitted N days ago" for the link-bid card (avoids non-deterministic date math). */
  agoDays?: number;
  /** Off-platform bids capture company-doc VALUES (not files) — keyed by the comparison's doc hint
   *  ("commercial"/"vat"/"national"). The comparison shows the value instead of opening a document. */
  linkDocs?: Record<string, string> | null;
}

/** A Terms-modal row state: green (matches RFQ) / red (conflicts) / grey (unverified or undeclared). */
/**
 * A unified Terms-row state. `matched`/`conflict`/`grey` come from the static request-vs-offer
 * compare; `agreed`/`negotiating` are overlaid live from the deal room (a locked term → agreed; a
 * term with an unseen counter → negotiating). Deal-room state takes precedence over the compare.
 */
export type TermState = "matched" | "conflict" | "grey" | "agreed" | "negotiating";
export interface TermRow {
  key: string;
  labelEn: string;
  labelAr: string;
  state: TermState;
  /** Optional one-line explainer shown under the term (e.g. the supplier's answer vs the renter's request). */
  detail?: { en: string; ar: string };
  /** The negotiated value once the term is AGREED in the deal room (from lockedTerms) — lets the cost
   *  responsibilities reflect what was actually settled, not the renter's original request side. */
  value?: string | null;
  /** The RENTEE's required value for this term — used by the deal-room overlay to decide whether a
   *  pending counter (counter.newValue) matches the renter's ask (→ matched) or differs (→ conflict),
   *  matching the app's `contractState` (dealRoomValue vs rentee value). Only populated on counted terms. */
  renteeValue?: string | null;
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
/** An ID that may arrive as a string OR a number (Prisma int columns) → a string, or null. Deliberately
 *  rejects booleans and objects, which would otherwise stringify into a plausible-looking key. */
const sid = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : typeof v === "string" && v.trim() ? v : null;
/** First present number across several candidate keys (camelCase + snake_case payloads). */
const pickNum = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) { const x = n(o[k]); if (x != null) return x; }
  return null;
};
/** Great-circle distance in km between two lat/lng points; null if either is missing. */
function haversineKm(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
/** Normalize a term key for fuzzy matching across the request, deal-room, and Terms-modal vocabularies. */
const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Per-term request-vs-offer comparison for the Terms modal (013 AC-04/05, spec 128) — a faithful
 * port of the app's `buildBidTermsArgs`. State rules:
 *  - grey  → the equipment listing is unverified, or the value is undeclared
 *  - red   → declared and conflicts (capacity/year/fuel mismatch, missing cert, or a deviation key)
 *  - green → declared and matches
 */
function buildBidTerms(raw: Record<string, unknown>, eqVerified: boolean, requiredCerts: CertCode[], heldCertCodes: CertCode[]): { equipment: TermRow[]; contract: TermRow[]; negotiable: TermRow[] } {
  const req = (raw.request ?? {}) as Record<string, unknown>;
  const reqItems = Array.isArray(req.equipmentItems) ? (req.equipmentItems as Record<string, unknown>[]) : [];
  const reqItem = reqItems[0] ?? {};
  const eq = (raw.equipment ?? {}) as Record<string, unknown>;
  const unverified = !eqVerified; // listing unverified → measurement/year/fuel forced grey
  const deviationKeys = new Set(
    (Array.isArray(raw.deviations) ? (raw.deviations as Record<string, unknown>[]) : []).map((d) => String(d.key ?? "")),
  );

  const reqCap = s(reqItem.capacityId);
  const measurement: TermState = !reqCap ? "grey" : unverified ? "grey" : reqCap === s(eq.measurementId) ? "matched" : "conflict";

  const heldSet = new Set(heldCertCodes);
  const certs: TermState = requiredCerts.length === 0 ? "grey" : requiredCerts.every((c) => heldSet.has(c)) ? "matched" : "conflict";

  // The column holds a MINIMUM MANUFACTURE YEAR (e.g. 2018), not an age — match by comparing years
  // directly (terms-journey doc). Read `minimumEquipmentYear` (the renamed/exposed field); fall back to
  // the legacy `maxEquipmentAge` key only for old payloads. Conflict = bid older than the minimum year.
  const minYear = n(reqItem.minimumEquipmentYear) ?? n(reqItem.maxEquipmentAge);
  const bidYear = n(eq.year) ?? 0;
  const year: TermState = minYear == null || bidYear === 0 ? "grey" : unverified ? "grey" : bidYear < minYear ? "conflict" : "matched";

  const reqFuel = s(reqItem.fuelTypePreference)?.toUpperCase();
  const bidFuel = s(eq.fuelType)?.toUpperCase();
  const fuel: TermState = !reqFuel || !bidFuel ? "grey" : unverified ? "grey" : reqFuel === bidFuel ? "matched" : "conflict";

  const contractState = (key: string, reqVal: string | null): TermState => (!reqVal ? "grey" : deviationKeys.has(key) ? "conflict" : "matched");
  // Contract NEGOTIABLES (payment / SLA / overtime): app parity (terms_modal.dart `contractState`) — an
  // un-negotiated supplier declaration is NOT "matched", it stays PENDING (grey → Pending review) until
  // it's locked/agreed in the deal room (overlayLocked upgrades a locked term → agreed). Only a
  // backend-flagged deviation → conflict. This is why overtime shows "Pending review", not "Matched".
  const negContractState = (key: string): TermState => (deviationKeys.has(key) ? "conflict" : "grey");

  // Operator (spec 128). operator_included is CONFLICT_ELIGIBLE / Negotiable — the app moved it
  // Acknowledge → Negotiable (deal-room.service CONFLICT_ELIGIBLE_KEYS): it conflicts when the RFQ needs
  // an operator the bid omits OR on a backend-flagged deviation, and is countered in the deal room.
  // operator_nationality is its own CONFLICT_ELIGIBLE term.
  const reqOperator = s(reqItem.operatorIncluded)?.toUpperCase() === "YES";
  const bidOperator = s(raw.operatorIncluded)?.toUpperCase() === "YES";
  const operatorIncluded: TermState = !reqOperator ? "grey" : (!bidOperator || deviationKeys.has("operator_included")) ? "conflict" : "matched";
  const opNat = reqOperator
    ? (s(reqItem.operatorNationality) === "restricted" ? (s(reqItem.operatorNationalityCustom) ?? "restricted") : s(reqItem.operatorNationality))
    : null;

  // FAT split + fuel responsibility — request prefs map to supplier/rentee (term-matching.ts parity).
  // fat_food / fat_accommodation_transport AND fuel_responsibility are all CONFLICT_ELIGIBLE / Negotiable
  // (terms-journey doc + CONFLICT_ELIGIBLE_KEYS): the supplier declares them and they can dispute.
  const toResp = (camel: string, snake: string): string | null => { const v = reqItem[camel] ?? reqItem[snake]; return v === true ? "supplier" : v === false ? "rentee" : null; };
  const fatFood = toResp("fatFood", "fat_food");
  const fatAccom = toResp("fatAccommodationTransport", "fat_accommodation_transport");
  const fuelResp = toResp("dieselIncluded", "diesel_included");

  // maintenance_responsibility is ACKNOWLEDGE → fixed (terms-journey doc; NOT in CONFLICT_ELIGIBLE_KEYS):
  // the supplier accepts it by bidding, it never disputes. Matched once the rentee set it, else grey.
  const reqMaint = s(req.maintenanceResponsibility)?.toLowerCase();
  const maintenance: TermState = !reqMaint ? "grey" : "matched";

  // Single "operator" row for the BID CARD's equipment bucket (mobile app parity): conflict on a
  // nationality deviation or when the RFQ needs an operator the bid omits; matched when included.
  // App parity (terms_modal.dart): the single operator term also conflicts on a missing operator cert.
  const operator: TermState = !reqOperator ? "grey" : deviationKeys.has("operator_nationality") || deviationKeys.has("operator_certification") || !bidOperator ? "conflict" : "matched";

  // operator_certification & safety_certifications — CONFLICT_ELIGIBLE / Negotiable in the app
  // (term-matching.ts: "Moved Acknowledge → Negotiable"). They live in the comparison's negotiable
  // set ONLY (never the bid card), so deal-room agreements overlay them live via overlayLocked().
  const reqOpCert = s(reqItem.operatorLicenseLevel) ?? s(req.operatorLicenseLevel);
  const operatorCertState: TermState = !reqOpCert ? "grey" : deviationKeys.has("operator_certification") ? "conflict" : "matched";
  const safetyCertState: TermState = requiredCerts.length === 0 ? "grey" : deviationKeys.has("safety_certifications") ? "conflict" : certs;

  // Project rows reused by both the bid-card "Project" bucket and the comparison's negotiable set.
  const rPayment: TermRow = { key: "payment_terms", labelEn: "Payment terms", labelAr: "شروط الدفع", state: negContractState("payment_terms"), renteeValue: s(req.paymentTerms) };
  const rSla: TermRow = { key: "breakdown_response_sla", labelEn: "Breakdown response", labelAr: "زمن الاستجابة للأعطال", state: negContractState("breakdown_response_sla"), renteeValue: s(req.breakdownResponseSla) };
  const rOvertime: TermRow = { key: "overtime_rate", labelEn: "Overtime", labelAr: "العمل الإضافي", state: negContractState("overtime_rate"), renteeValue: s(req.overtimeRate) };
  const rMaint: TermRow = { key: "maintenance_responsibility", labelEn: "Maintenance", labelAr: "الصيانة", state: maintenance };

  // Conflict detail (Renter: X · Supplier: Y) — app parity with link bids, so an in-app conflict in
  // the Terms modal names BOTH sides, not just the term. Cert terms carry the exact codes.
  const t3 = (raw.t3Declarations ?? {}) as Record<string, unknown>;
  const opDeclared = s(t3.operator_certification) ?? s(t3.operatorCertification);
  const certName = (c: CertCode) => CERT_LABEL[c]?.en ?? c;
  const certNameAr = (c: CertCode) => CERT_LABEL[c]?.ar ?? c;
  const dash = "—";
  const opCertDetail = reqOpCert
    ? { en: `Renter: ${reqOpCert} · Supplier: ${opDeclared ?? dash}`, ar: `المستأجر: ${reqOpCert} · المؤجّر: ${opDeclared ?? dash}` }
    : undefined;
  const safetyDetail = requiredCerts.length
    ? {
        en: `Renter: ${requiredCerts.map(certName).join("/")} · Supplier: ${heldCertCodes.length ? heldCertCodes.map(certName).join("/") : dash}`,
        ar: `المستأجر: ${requiredCerts.map(certNameAr).join("/")} · المؤجّر: ${heldCertCodes.length ? heldCertCodes.map(certNameAr).join("/") : dash}`,
      }
    : undefined;
  // The lumped `operator` bid-card row shows only "Conflict" with no values today. Give it the same
  // Renter/Supplier detail as the specific rows (app parity) — pick the reason that drove the conflict:
  // a missing operator, an operator-certification deviation, or an operator-nationality deviation.
  const opNatDeclared = s(t3.operator_nationality) ?? s(t3.operatorNationality);
  const operatorDetail: { en: string; ar: string } | undefined = !reqOperator
    ? undefined
    : !bidOperator
      ? { en: "Renter: operator required · Supplier: not included", ar: "المستأجر: مطلوب مشغّل · المؤجّر: غير مشمول" }
      : deviationKeys.has("operator_certification") && opCertDetail
        ? opCertDetail
        : deviationKeys.has("operator_nationality")
          ? { en: `Renter: ${opNat ?? dash} · Supplier: ${opNatDeclared ?? dash}`, ar: `المستأجر: ${opNat ?? dash} · المؤجّر: ${opNatDeclared ?? dash}` }
          : undefined;

  return {
    // BID-CARD buckets — mirror the mobile app's bid card exactly: Equipment 6 · Project 4. Operator is
    // ONE row (nationality/FAT are informational, not separate counted terms). Keys stay canonical so
    // the deal-room overlay still matches.
    equipment: [
      { key: "measurement", labelEn: "Measurement", labelAr: "القياس", state: measurement },
      { key: "certs", labelEn: "Certificates", labelAr: "الشهادات", state: certs },
      { key: "year", labelEn: "Year of manufacture", labelAr: "سنة الصنع", state: year },
      { key: "fuel", labelEn: "Fuel type", labelAr: "نوع الوقود", state: fuel },
      { key: "attachments", labelEn: "Attachments", labelAr: "الملحقات", state: "grey" },
      { key: "operator", labelEn: "Operator", labelAr: "المشغّل", state: operator, detail: operatorDetail },
    ],
    contract: [rPayment, rSla, rOvertime, rMaint],
    // COMPARISON-only expanded set (the web side-by-side "Negotiable terms" section) — NOT on the bid
    // card. Carries the full deal-room negotiable + acknowledge terms with live overlay states.
    negotiable: [
      { key: "operator_included", labelEn: "Operator included", labelAr: "تشمل مشغّل", state: operatorIncluded, renteeValue: reqOperator ? "yes" : null },
      { key: "operator_nationality", labelEn: "Operator nationality", labelAr: "جنسية المشغّل", state: contractState("operator_nationality", opNat), renteeValue: opNat },
      { key: "operator_certification", labelEn: "Operator certification", labelAr: "شهادة المشغّل", state: operatorCertState, detail: opCertDetail, renteeValue: reqOpCert },
      { key: "safety_certifications", labelEn: "Equipment safety certificates", labelAr: "شهادات سلامة المعدة", state: safetyCertState, detail: safetyDetail, renteeValue: requiredCerts.length ? requiredCerts.join(",") : null },
      { key: "fat_food", labelEn: "Operator FAT — Food", labelAr: "الإعاشة (F.A.T) — الطعام", state: contractState("fat_food", fatFood), renteeValue: fatFood },
      { key: "fat_accommodation_transport", labelEn: "Operator FAT — Accommodation/Transport", labelAr: "الإعاشة (F.A.T) — الإقامة/النقل", state: contractState("fat_accommodation_transport", fatAccom), renteeValue: fatAccom },
      { key: "fuel_responsibility", labelEn: "Fuel responsibility", labelAr: "مسؤولية الوقود", state: contractState("fuel_responsibility", fuelResp), renteeValue: fuelResp },
      rPayment, rSla, rOvertime, rMaint,
      // mobilization_lead_time — CONFLICT_ELIGIBLE / Negotiable (app moved it Priced → Negotiable).
      { key: "mobilization_lead_time", labelEn: "Mobilization lead time", labelAr: "مهلة التعبئة", state: negContractState("mobilization_lead_time") },
      { key: "mobilization_pricing", labelEn: "Mobilization pricing", labelAr: "تسعير النقل", state: "grey" },
      { key: "demobilization_pricing", labelEn: "Demobilization pricing", labelAr: "تسعير الإرجاع", state: "grey" },
    ],
  };
}

/** Exported for the single-bid read (`GET /api/me/bids/:id`), which the equipment-verification surface
 *  resolves itself: that surface is addressable by `bidId` alone (RM3-AC-01, V1), so it cannot go
 *  through `mapBidList` — there is no request id to list by. Same parser, so one bid can never read
 *  differently on its own route than it does in the list. */
export function mapBid(raw: Record<string, unknown>, expired: boolean): BidCard {
  const sup = (raw.supplier ?? {}) as Record<string, unknown>;
  const prof = (sup.supplierProfile ?? {}) as Record<string, unknown>;
  // The company-verification docs (CR/VAT/national address) can hang off several shapes depending on
  // the projection — scan every plausible profile object so we read them wherever they live.
  const profSources = [prof, sup, sup.profile, sup.company, sup.companyProfile, raw.supplierProfile, raw.profile]
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object");
  const docKey = (...keys: string[]) => profSources.some((o) => keys.some((k) => !!s(o[k])));
  const eq = (raw.equipment ?? null) as Record<string, unknown> | null;
  const certs = (sup.certs ?? {}) as { TUV?: boolean; SASO?: boolean; SPSP?: boolean };
  const heldCerts = Array.isArray(sup.heldCerts) ? (sup.heldCerts as string[]) : [];
  const push = (arr: CertCode[], c: CertCode | null) => { if (c && !arr.includes(c)) arr.push(c); };

  // LEVEL 1 — Company certs (supplier verification): LC (`localContentDocKey`) + SASO registration
  // (`sasoHeavyEquipDocKey`) + the company-wide typed `heldCertDocs` map. These are company-held docs,
  // NOT equipment docs — they belong in the Company documents group.
  const companyCertCodes: CertCode[] = [];
  if (docKey("localContentDocKey", "local_content_doc_key")) push(companyCertCodes, "LC");
  if (docKey("sasoHeavyEquipDocKey", "saso_heavy_equip_doc_key")) push(companyCertCodes, "SASO");
  for (const src of profSources) {
    const map = src.heldCertDocs ?? src.held_cert_docs;
    if (map && typeof map === "object" && !Array.isArray(map)) {
      for (const [type, val] of Object.entries(map as Record<string, unknown>)) {
        if (val) push(companyCertCodes, toCert(type));
      }
    }
  }

  // LEVEL 2 — Equipment docs: equipment_listings.documentKeys = [{ key, type }]. Split into safety
  // CERTS (tuv/spsp/saso/saso_technical_inspection → cert pills) and proof-of-ownership DOCS
  // (istimara/customs/sale_contract/saso_registration). Both live at the Equipment level.
  const eqDocs = (Array.isArray(eq?.documentKeys) ? eq!.documentKeys : Array.isArray(eq?.document_keys) ? eq!.document_keys : []) as unknown[];
  const equipmentCertCodes: CertCode[] = [];
  const ownershipDocs: { key: string; labelEn: string; labelAr: string }[] = [];
  for (const d of eqDocs) {
    const dk = d as Record<string, unknown>;
    const rawType = String((typeof d === "string" ? d : (dk.type ?? dk.code ?? "")) ?? "");
    push(equipmentCertCodes, eqDocTypeToCert(rawType));
    const own = OWNERSHIP_DOC_LABELS[rawType.trim().toLowerCase()];
    if (own && !ownershipDocs.some((o) => o.key === own.key)) ownershipDocs.push(own);
  }

  // The FLAT held-cert union (backend resolveHeldCerts parity) — used for required-cert MATCHING and
  // the legacy single "Certificates" term state. Level-accurate display uses companyCertCodes /
  // equipmentCertCodes above; this union deliberately merges both levels plus the projected flags.
  const held = certList(heldCerts);
  if (certs.TUV) push(held, "TUV");
  if (certs.SASO) push(held, "SASO");
  if (certs.SPSP) push(held, "SPSP");
  for (const c of companyCertCodes) push(held, c);
  for (const c of equipmentCertCodes) push(held, c);
  const eqVerified = eq ? eq.verificationStatus === "VERIFIED" || eq.isVerified === true || eq.verified === true : false;
  // CANONICAL verified signal across the platform (bid card / profile / limits): supplierStatus === 2
  // (1=pending, 2=verified/approved, 3=rejected — see onboarding.ts supplierStatusToVerification).
  // `isVerified` is an INDEPENDENT column that can diverge from the verification tier, so we do NOT
  // OR it in here — that produced false "Verified" badges.
  //
  // Verification is ROLE-AGNOSTIC and, since company-shared visibility, INHERITED: an active member
  // of a verified company is verified without their own ops approval. `supplier.company` is the
  // company relation the backend now selects; unlike `isVerified` it can't diverge, because it IS the
  // firm's approved verification. Dissolving a company nulls the member's `companyId`, so a closed
  // firm stops conferring this on its own.
  const supCompany = (sup.company ?? null) as { id?: unknown; name?: unknown; isVerified?: unknown; deletedAt?: unknown } | null;
  const supVerified =
    n(sup.supplierStatus) === 2 || (supCompany?.isVerified === true && !supCompany.deletedAt);
  // The firm's brand, used only when that firm is actually verified — same G5 precedence the backend
  // applies in `resolveCounterpartyDisplayName` (company identity wins over the actor's own
  // SupplierProfile). A supplier who joined by invite code has no `supplierProfile.companyName` of
  // their own, so without this they'd render under their PERSONAL name and be classified as an
  // individual, with no sign they bid on behalf of a verified company.
  const supCompanyBrand =
    supCompany?.isVerified === true && !supCompany.deletedAt ? s(supCompany.name) : undefined;
  // The supplier's OWN company-name field (`supplierProfile.companyName` — what they typed in their
  // profile), scanned across the projection shapes like the doc keys above. This is the name we display:
  // `supplier.company.name` is the row ops created in the VERIFICATION queue, and the two drift (an ops
  // typo / a placeholder / a legal-entity string), so the profile field is the supplier's own identity.
  const supProfileCompanyName = profSources.map((o) => s(o.companyName) ?? s(o.company_name)).find(Boolean);
  // Company docs are read from the supplier's REAL verification fields projected in the bid list
  // (crNumber / vatNumber / national-address parts / localContentDocKey / sasoHeavyEquipDocKey). Show a
  // doc ONLY when its actual field is present — NEVER inferred from "verified" (a verified supplier can
  // still lack an optional doc), so the table + card match the admin panel exactly.
  const hasCr = docKey("crDocKey", "cr_doc_key", "crNumber", "commercialRegistrationNumber", "commercial_registration_number", "crFileKey");
  const hasVat = docKey("vatDocKey", "vat_doc_key", "vatNumber", "taxNumber", "tax_number", "vatFileKey");
  const hasNationalAddr = docKey("nationalAddressDocKey", "national_address_doc_key", "nationalId", "national_id", "companyAddress", "company_address", "companyCity", "shortAddress", "short_address", "postalCode", "postal_code", "buildingNumber", "building_number", "district");
  // Real company-doc VALUES for the quotation identity rows (first present across the profile shapes).
  const profVal = (...keys: string[]): string | null => { for (const o of profSources) for (const k of keys) { const v = s(o[k]); if (v) return v; } return null; };
  const supplierCrNumber = profVal("crNumber", "commercialRegistrationNumber", "commercial_registration_number");
  const supplierVatNumber = profVal("vatNumber", "taxNumber", "tax_number");
  // National address: a single field if present, else composed from its Saudi-address parts (app parity).
  const supplierNationalAddress =
    profVal("nationalAddress", "national_address", "companyAddress", "company_address") ||
    ([profVal("buildingNumber", "building_number"), profVal("shortAddress", "short_address"), profVal("district"), profVal("postalCode", "postal_code"), profVal("companyCity", "company_city")].filter(Boolean).join(" ") || null);
  const rq = (raw.request ?? {}) as Record<string, unknown>;
  const rqItem = (Array.isArray(rq.equipmentItems) ? (rq.equipmentItems as Record<string, unknown>[]) : [])[0] ?? {};
  // Who the RENTEE asked to bear each cost (request side): diesel-included / FAT split → supplier|me.
  const respSide = (v: unknown): "supplier" | "me" | undefined => {
    if (v === true) return "supplier";
    if (v === false) return "me";
    const sv = typeof v === "string" ? v.toLowerCase() : "";
    if (sv === "supplier") return "supplier";
    if (sv === "rentee" || sv === "me") return "me";
    return undefined;
  };
  const requestResponsibilities: NonNullable<BidCard["requestResponsibilities"]> = {};
  {
    const fuel = respSide(rqItem.dieselIncluded ?? rqItem.diesel_included);
    const food = respSide(rqItem.fatFood ?? rqItem.fat_food);
    const trans = respSide(rqItem.fatAccommodationTransport ?? rqItem.fat_accommodation_transport);
    const m = s(rq.maintenanceResponsibility)?.toLowerCase();
    if (fuel) requestResponsibilities.fuel = fuel;
    if (m) requestResponsibilities.maintenance = m.includes("supplier") || m.includes("مؤجّر") ? "supplier" : "me";
    if (food) requestResponsibilities.operator_food = food;
    if (trans) requestResponsibilities.operator_transport_accommodation = trans;
  }
  // The safety-cert requirement (TÜV/SPSP/SASO) lives ONLY in the item's `safetyCertifications` — the
  // documented source. The request-level `requiredCerts` field is not used by the backend/app (per the
  // API docs), so we no longer read it.
  const requiredCerts = certList(
    Array.isArray(rqItem.safetyCertifications) ? (rqItem.safetyCertifications as unknown[]) : [],
  );
  // LEVEL 3 — Operator certification is a DECLARED deal-room term, not a verified held-doc pill. The
  // rentee's requirement is the request item's operatorLicenseLevel; the supplier's position comes
  // from the bid's t3Declarations (operator_certification). Both are plain strings for a term row.
  const t3decl = (raw.t3Declarations ?? {}) as Record<string, unknown>;
  const operatorCertReq = s(rqItem.operatorLicenseLevel) ?? s(rq.operatorLicenseLevel);
  const operatorCertDeclared = s(t3decl.operator_certification) ?? s(t3decl.operatorCertification);

  // 014 lifecycle — server-enriched in getBidList (the same source the mobile bid card reads): each
  // locked (agreed) term carries its negotiated value, so they overlay the Terms-modal state + the
  // request-term values + mob/demob/lead-time. `currentPrice` already carries the live negotiated rate.
  const lockedTerms = (Array.isArray(raw.lockedTerms) ? (raw.lockedTerms as Record<string, unknown>[]) : [])
    .map((t) => ({ key: s(t.termKey) ?? "", value: t.lockedValue }))
    .filter((t) => t.key);
  const unreadTerms = (Array.isArray(raw.unreadTerms) ? (raw.unreadTerms as unknown[]) : []).map(String);
  // Pending counters WITH their proposed values (getBidList `counters: [{termKey, newValue}]`) — the
  // deal-room overlay compares each to the rentee's ask to decide matched vs conflict (app parity).
  const counters = (Array.isArray(raw.counters) ? (raw.counters as Record<string, unknown>[]) : [])
    .map((c) => ({ key: s(c.termKey) ?? "", value: c.newValue }))
    .filter((c) => c.key);
  const pm = (raw.progressMeter ?? {}) as Record<string, unknown>;
  const progress = { agreed: n(pm.agreed) ?? 0, total: n(pm.total) ?? 0 };
  // Distance — app parity (bid.service.ts:134-137): a bid's location is its custom pin
  // (equipmentLat/Lng) if the supplier dropped one, otherwise its selected YARD's coordinates —
  // never the equipment listing's own lat/lng. Falls back to the listing's yard, then a
  // server-computed value. Measured to the request's project location; null → "—" (no location).
  // Keeping this the single source keeps every surface (comparison, cards, modal) consistent.
  const eqObj = (eq ?? {}) as Record<string, unknown>;
  const bidYard = (raw.yard ?? {}) as Record<string, unknown>;
  const eqYard = (eqObj.yard ?? {}) as Record<string, unknown>;
  const bidLat = pickNum(raw, "equipmentLat", "equipment_lat") ?? pickNum(bidYard, "latitude", "lat") ?? pickNum(eqYard, "latitude", "lat");
  const bidLng = pickNum(raw, "equipmentLng", "equipment_lng") ?? pickNum(bidYard, "longitude", "lng") ?? pickNum(eqYard, "longitude", "lng");
  const reqLat = pickNum(rq, "projectLat", "project_lat", "lat");
  const reqLng = pickNum(rq, "projectLng", "project_lng", "lng");
  const distanceKm = n(raw.distanceKm) ?? haversineKm(bidLat, bidLng, reqLat, reqLng);
  // §7.4 — prefer the server's own resolution; fall back to the chain ABOVE, which is already the §7.3
  // level 2→4 ladder the distance is measured on. Deriving the level here (rather than leaving it
  // undefined until T3 ships) keeps `lat`/`lng`/`locationSource` in step with `distanceKm` on today's
  // payloads. A bid can never be `unit_yard` — that level is per-unit and per-bid commitment, which is
  // exactly why a bid's coordinates can never turn a pin green.
  const bidLocationSource: UnitLocationSource | undefined =
    ((): UnitLocationSource | undefined => {
      const reported = s(raw.locationSource ?? raw.location_source);
      if (reported === "bid_pin" || reported === "bid_yard" || reported === "listing_yard" || reported === "none") return reported;
      if (pickNum(raw, "equipmentLat", "equipment_lat") != null && pickNum(raw, "equipmentLng", "equipment_lng") != null) return "bid_pin";
      if (pickNum(bidYard, "latitude", "lat") != null && pickNum(bidYard, "longitude", "lng") != null) return "bid_yard";
      if (pickNum(eqYard, "latitude", "lat") != null && pickNum(eqYard, "longitude", "lng") != null) return "listing_yard";
      return "none";
    })();
  // Never a half-resolved point (AC-06): one missing side voids both.
  const bidHasPoint = bidLat != null && bidLng != null;

  const lockedKeys = new Set(lockedTerms.map((t) => normKey(t.key)));
  const lockedValByKey = new Map(lockedTerms.map((t) => [normKey(t.key), t.value != null && t.value !== "" ? String(t.value) : null]));
  const unreadKeys = new Set(unreadTerms.map(normKey));
  const counterValByKey = new Map(counters.map((c) => [normKey(c.key), c.value != null && c.value !== "" ? String(c.value) : null]));
  // Enum-insensitive equality for the counter overlay (app parity: normalizeTermEnum) — case/underscore
  // agnostic + boolean/party synonyms (yes=true=included, no=false=excluded/not-included, renter=rentee).
  const normTok = (v: string): string => {
    let t = v.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["true", "yes", "included"].includes(t)) t = "yes";
    else if (["false", "no", "excluded", "notincluded"].includes(t)) t = "no";
    else if (t === "renter") t = "rentee";
    return t;
  };
  // Multi-value terms (cert sets, e.g. "TUV,ARAMCO") compare order-INSENSITIVELY (app parity: set
  // equality on the backend) — split on separators, normalize each token, sort, rejoin. Single-value
  // terms are a 1-token no-op, so party/enum comparisons are unchanged.
  const normVal = (v: string | null | undefined): string =>
    (v ?? "").split(/[,/;|]+/).map(normTok).filter(Boolean).sort().join(",");
  const lockedVal = (pred: (k: string) => boolean): string | null => {
    const t = lockedTerms.find((x) => pred(normKey(x.key)));
    return t && t.value != null && t.value !== "" ? String(t.value) : null;
  };
  // Overlay the deal-room state onto each compare row: locked → "agreed" (AC-08), unseen counter →
  // "negotiating"; otherwise keep the static compare state. One unified Terms list, deal-room-aware.
  const overlayLocked = (rows: TermRow[]): TermRow[] =>
    rows.map((r) => {
      const k = normKey(r.key);
      // Locked → "agreed", and carry the negotiated value so the cost responsibilities reflect what was
      // actually settled in the deal room (e.g. accepting the supplier's FAT flips the side to supplier).
      if (lockedKeys.has(k)) return { ...r, state: "agreed" as TermState, value: lockedValByKey.get(k) ?? r.value ?? null };
      // Pending counter (app parity: dealRoomValue = counter.newValue): compare to the rentee's ask —
      // equal → matched, differ → conflict. Without a rentee value to compare, fall back to "negotiating".
      const cv = counterValByKey.get(k);
      if (cv != null) {
        if (r.renteeValue != null && r.renteeValue !== "") {
          return { ...r, value: cv, state: (normVal(cv) === normVal(r.renteeValue) ? "matched" : "conflict") as TermState };
        }
        return { ...r, value: cv, state: "negotiating" as TermState };
      }
      if (unreadKeys.has(k)) return { ...r, state: "negotiating" as TermState };
      return r;
    });
  const baseTerms = buildBidTerms(raw, eqVerified, requiredCerts, held);
  const negMobLead = lockedVal((k) => k.includes("leadtime"));
  const negMobPrice = lockedVal((k) => k.includes("mobilizationpricing"));
  const negDemobPrice = lockedVal((k) => k.includes("demobilizationpricing"));
  // Rate (T16): show the LIVE deal-room rate, matching the mobile bid card. The backend already
  //  computes `currentPrice = dealRoom.lastProposedRate ?? priceAmount` (getBidList/received-bids), so
  //  it reflects the latest negotiated rate and falls back to the original when there's no deal room.
  //  Prefer it; keep the locked PRICE term + the raw offer as fallbacks.
  const negRate = lockedVal((k) => k === "price");

  return {
    id: String(raw.id ?? ""),
    status: (s(raw.status) as BidStatus) ?? "PENDING",
    wonViaSurvey: raw.wonViaSurvey === true, // survey-reported winner (app parity) — decided even if status isn't ACCEPTED
    converted: raw.converted === true, // web-app/006: materialized from an off-platform submission → labelled/counted off-platform

    supplierId: readSupplierId(raw),
    // AC-70. `Bid.supplierCompanyId` already reaches the browser — `getBidList` spreads the bid row —
    // it was simply never read, so two colleagues of one firm read as two counterparties. The scan over
    // every shape that can carry it lives in `readSupplierCompanyId`, shared with `mapReceivedBids`:
    // ONE counterparty key needs one derivation, or the chat dock's anchor and its rows disagree.
    supplierCompanyId: readSupplierCompanyId(raw),
    // Company name FIRST — the supplier's own profile field, not the verification-queue company row
    // (nor the backend's `supplierDisplayName`, which resolves that row ahead of the profile). Falls
    // back to the verified firm's brand, then the backend's resolved name, then the person's name.
    supplierName:
      supProfileCompanyName ??
      supCompanyBrand ??
      s(raw.supplierDisplayName) ??
      ([s(sup.firstName), s(sup.lastName)].filter(Boolean).join(" ") || "Supplier"),
    verified: supVerified,
    rating: n(sup.rating) ?? n(prof.rating),
    distanceKm,
    submittedAt: s(raw.createdAt),
    validUntil: s(raw.validUntil),
    price: n(raw.currentPrice) ?? n(negRate) ?? n(raw.priceAmount), // live deal-room rate (app parity) → locked rate → original offer (T16)
    mobPrice: n(negMobPrice) ?? n(raw.mobPrice),
    demobPrice: n(negDemobPrice) ?? n(raw.demobPrice),
    priceUnit: s(raw.priceUnit),
    duration: n(raw.duration),
    numberOfUnits: n(rqItem.numberOfUnits) ?? 1,
    // Supplier's chosen quantity (bid.units_offered is an array; its length = offered unit count).
    // An EMPTY array means the supplier didn't pick a subset → they bid the request as posted (covers
    // its full unit count), NOT 0 — otherwise the header tile reads 0/1 while the card says "covers 1 of 1".
    unitsOffered: Array.isArray(raw.unitsOffered) && raw.unitsOffered.length > 0 ? raw.unitsOffered.length : (n(raw.unitsOffered) ?? n(rqItem.numberOfUnits) ?? 1),
    // Live deal-room unit overlay (app parity) — camel/snake, null when not negotiated.
    agreedUnits: n(raw.agreedUnits ?? raw.agreed_units),
    currentRentalUnits: n(raw.currentRentalUnits ?? raw.current_rental_units),
    mobUnits: n(raw.mobUnits ?? raw.mob_units),
    demobUnits: n(raw.demobUnits ?? raw.demob_units),
    mobExcluded: raw.mobExcluded === true || raw.mob_excluded === true,
    demobExcluded: raw.demobExcluded === true || raw.demob_excluded === true,
    reqMinYear: n(rqItem.maxEquipmentAge),
    equipment: eq
      ? { id: s(eq.id) ?? s(eq.equipmentId), make: s(eq.manufacturer) ?? s(eq.make), model: s(eq.model), year: n(eq.year), imageUrl: s(eq.imageUrl) ?? s(eq.primaryPhotoUrl) }
      : null,
    eqVerified,
    compliance: {
      // A member of a verified firm IS a company entity, even with no company name of their own.
      entityType: (supProfileCompanyName ?? supCompanyBrand) ? "company" : "individual",
      activityLicense: hasCr,
      taxNumber: hasVat,
      nationalAddress: hasNationalAddr,
      safety: certs.TUV === true || certs.SPSP === true || heldCerts.some((c) => /tuv|spsp|safety/i.test(c)),
      saso: certs.SASO === true || docKey("sasoHeavyEquipDocKey", "saso_heavy_equip_doc_key") || held.includes("SASO") || heldCerts.some((c) => /saso/i.test(c)),
      localContent: docKey("localContentDocKey", "local_content_doc_key") || held.includes("LC") || heldCerts.some((c) => /local.?content/i.test(c)),
    },
    supplierCrNumber,
    supplierVatNumber,
    supplierNationalAddress,
    supplierPhone: s(sup.phone),
    supplierEmail: s(sup.email), // not in the bid-list projection yet → null until the backend adds it
    matchCount: n(raw.matchCount) ?? 0,
    conflictCount: n(raw.conflictCount) ?? 0,
    dealRoomId: s(raw.dealRoomId),
    expired: expired || raw.isExpired === true || raw.status === "EXPIRED",
    note: s(raw.note),
    requiredCerts,
    requestResponsibilities,
    heldCertCodes: held,
    companyCertCodes,
    equipmentCertCodes,
    ownershipDocs,
    offeredUnitsDetail: mapOfferedUnits(raw.offeredUnitsDetail ?? raw.offered_units_detail),
    lat: bidHasPoint ? bidLat : null,
    lng: bidHasPoint ? bidLng : null,
    locationSource: bidHasPoint ? bidLocationSource : "none",
    reqEquipmentCerts: (Array.isArray(rqItem.safetyCertifications) ? (rqItem.safetyCertifications as unknown[]) : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean),
    operatorCertReq,
    operatorCertDeclared,
    mobLeadTime: negMobLead ?? s(raw.mobLeadTime),
    demobLeadTime: s(raw.demobLeadTime),
    terms: {
      equipment: overlayLocked(baseTerms.equipment),
      contract: overlayLocked(baseTerms.contract),
      // Supplier identity bucket — CR + VAT only, matching the mobile app's bid card (2 informational
      // rows). National address / LC / SASO are surfaced in the web comparison's Company-documents row,
      // not on the bid card.
      supplier: [
        { key: "cr", labelEn: "Commercial registration", labelAr: "السجل التجاري", state: (hasCr ? "matched" : "grey") as TermState },
        { key: "vat", labelEn: "VAT registration", labelAr: "الرقم الضريبي", state: (hasVat ? "matched" : "grey") as TermState },
      ],
    },
    // Comparison-only expanded negotiable/acknowledge terms (live deal-room overlay) — not on the bid card.
    negotiableTerms: overlayLocked(baseTerms.negotiable),
    requestTerms: {
      operatorIncluded: s(rqItem.operatorIncluded),
      operatorNationality: lockedVal((k) => k.includes("nationality")) ?? s(rqItem.operatorNationality),
      fuelType: lockedVal((k) => k.includes("fuel")) ?? s(rqItem.fuelTypePreference),
      paymentMethod: lockedVal((k) => k === "paymentmethod") ?? s(rq.paymentMethod),
      paymentTerms: lockedVal((k) => k === "paymentterms") ?? s(rq.paymentTerms),
      breakdownResponseSla: lockedVal((k) => k.includes("breakdown") || k.includes("sla")) ?? s(rq.breakdownResponseSla),
      overtimeRate: lockedVal((k) => k.includes("overtime")) ?? s(rq.overtimeRate),
      maintenanceResponsibility: lockedVal((k) => k.includes("maintenance")) ?? s(rq.maintenanceResponsibility),
    },
    declaredTerms: {
      paymentTerms: s(t3decl.payment_terms),
      breakdownResponseSla: s(t3decl.breakdown_response_sla),
      overtimeRate: s(t3decl.overtime_rate),
      operatorNationality: s(t3decl.operator_nationality) ?? s(t3decl.operatorNationality),
      fuelResponsibility: s(t3decl.fuel_responsibility),
    },
    agreedTermKeys: lockedTerms.map((t) => normKey(t.key)),
    lockedTerms,
    unreadTerms,
    progress,
    lastEventAr: s(raw.lastEventAr),
    round: n(raw.round) ?? 1,
    uiState: ((): BidCard["uiState"] => {
      const u = s(raw.uiState)?.toLowerCase();
      return u === "new" || u === "fresh" || u === "your-turn" || u === "waiting" ? (u as BidCard["uiState"]) : null;
    })(),
  };
}

/** One COUNTERPARTY in a group's bid set (Level-2 filter chip) — a firm where one exists, else the
 *  individual, else the name. See `bidSupplierKey`. */
export interface BidSupplier {
  key: string;
  name: string;
  verified: boolean;
  count: number;
}

/** A nested payload object, or `{}` — so a reader can walk a shape that may not be there. */
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

/**
 * **`Bid.supplierCompanyId`, read out of ANY projection that carries it.** (AC-70)
 *
 * The bid list nests the supplier (`raw.supplier.company.id`); received-bids spreads the bid row flat
 * (`raw.supplierCompanyId`); which of the joined profile shapes carries the id depends on the
 * projection. `bidSupplierKey` is only one key while **every** consumer resolves the company the same
 * way — the moment one side reads four sources and another reads one, a nested company id makes the
 * chat dock's anchor resolve a company key while its rows fall back to `supplierId`, the two never
 * match, and every sibling bid of the same firm disappears from the tab strip. So the derivation lives
 * here, once, and both `mapBid` and `mapReceivedBids` call it.
 *
 * Ids can arrive as numbers (Prisma int columns), so `sid` rather than `s`.
 */
export function readSupplierCompanyId(raw: Record<string, unknown>): string | null {
  const sup = obj(raw.supplier);
  const company = obj(sup.company);
  // `supplier.company` IS the firm, so its own `id` is the company id — every other source names it.
  const profiles = [obj(sup.supplierProfile), sup, obj(sup.profile), company, obj(sup.companyProfile), obj(raw.supplierProfile), obj(raw.profile)];
  return (
    sid(raw.supplierCompanyId ?? raw.supplier_company_id) ??
    sid(sup.supplierCompanyId ?? sup.supplier_company_id) ??
    sid(sup.companyId ?? sup.company_id) ??
    sid(company.id) ??
    profiles.map((o) => sid(o.companyId ?? o.company_id) ?? sid(o.supplierCompanyId ?? o.supplier_company_id)).find((x) => x != null) ??
    null
  );
}

/** The bidding MEMBER, likewise read out of either shape — nested `raw.supplier.id` on the bid list,
 *  flat `raw.supplierId` on received-bids. The fallback below `supplierCompanyId` in `bidSupplierKey`,
 *  so it has to agree across projections for the same reason. */
export function readSupplierId(raw: Record<string, unknown>): string | null {
  const sup = obj(raw.supplier);
  return sid(sup.id) ?? sid(raw.supplierId ?? raw.supplier_id) ?? sid(sup.userId ?? sup.user_id) ?? null;
}

/**
 * The single counterparty key for a bid: **company → member → name** (AC-70).
 *
 * A firm is one counterparty even when two of its members each submitted a bid, because that is how the
 * backend already models it — `supplierBidScopeWhere` scopes a supplier's bids by company, and the deal
 * room adds every active colleague of both firms to the same Stream channel, so the two members are
 * literally reading and writing the same conversation. Grouping by `supplierId` showed them as two
 * separate counterparties the renter had to negotiate with twice.
 *
 * Every surface that groups, filters or counts suppliers must key off THIS function, or the chip counts
 * and the rows behind them will disagree.
 *
 * Structurally typed rather than `BidCard`-typed: the chat dock groups its tabs from `InboxBid` rows
 * (004a §2), and one counterparty key with two implementations is exactly how a firm becomes two
 * counterparties on one screen and one on another.
 */
export function bidSupplierKey(bid: Pick<BidCard, "supplierCompanyId" | "supplierId" | "supplierName">): string {
  return bid.supplierCompanyId ?? bid.supplierId ?? bid.supplierName;
}

/** Distinct counterparties across a bid list, in first-appearance order, with per-counterparty counts. */
export function bidSuppliers(bids: BidCard[]): BidSupplier[] {
  const order: string[] = [];
  const map = new Map<string, BidSupplier>();
  for (const b of bids) {
    const key = bidSupplierKey(b);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.verified = existing.verified || b.verified;
    } else {
      map.set(key, { key, name: b.supplierName, verified: b.verified, count: 1 });
      order.push(key);
    }
  }
  return order.map((k) => map.get(k)!);
}

/**
 * Bucket a bid's terms into Conflict / Pending review / Matched — the SINGLE source of truth for both
 * the Terms modal tabs AND the bid card's "Conflict N · Matched N" tally, so the two always agree.
 * Merges the specific negotiable rows + equipment/contract/supplier, de-dups by key, drops the vague
 * rows a specific one supersedes (certs→safety_certifications, operator→operator_included) and the n/a
 * (grey) rows (grey = no requirement → excluded, never counted).
 */
export type TermBucket = "conflict" | "pending" | "matched";
// App parity (mobile terms_modal.dart `_negotiableTermKeys`): the bid-card chips AND the Terms-modal tabs
// count EXACTLY these 6 LUMPED negotiable terms — nothing else. Excluded (informational / acknowledge /
// identity, never counted): equipment identity (measurement/year/fuel/attachments), maintenance, CR/VAT,
// mob/demob pricing, and the SPLIT operator_*/fat_* rows (operator + FAT fold into the single `operator`
// term). `safety_certifications` is the one cert term; `operator` is the single lumped operator row.
// The app's 6 counted negotiable terms, as GROUPS — with the off-platform (link-bid) key aliases
// mapped to the same group so a shared-link bid counts the same terms as an in-app bid (the two
// mappers emit different key names for the same term, e.g. link "certs" == in-app "safety_certifications",
// link "operator_included" == in-app "operator"). Counting one row per GROUP keeps in-app bids at the
// same total (operator + operator_included fold to one). Without this, off-platform bids showed
// "Conflict 0 · Matched 0" because none of their keys matched the in-app names.
const COUNTED_TERM_GROUP: Record<string, string> = {
  operator: "operator", operator_included: "operator",
  safety_certifications: "certs", certs: "certs",
  fuel_responsibility: "fuel",
  payment_terms: "payment", payment: "payment",
  overtime_rate: "overtime", overtime: "overtime",
  breakdown_response_sla: "breakdown", breakdown_sla: "breakdown",
};
// App parity (`_TermsStateCounts`): 5 row-states collapse to 3 — `matched`; `conflict`; everything else
// (pending / negotiating / grey / open-value) → Pending, so the three counts always sum to the row total.
const bucketOfTermState = (s: TermState): TermBucket =>
  s === "conflict" ? "conflict" : s === "matched" || s === "agreed" ? "matched" : "pending";

export function bucketBidTerms(
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] },
  negotiable?: TermRow[],
  opts?: { all?: boolean },
): { rows: TermRow[]; byBucket: Record<TermBucket, TermRow[]>; counts: Record<TermBucket, number> } {
  // `all` (off-platform shared-link bids): count EVERY required term the supplier answered — Yes = matched,
  // No = conflict — so the card's tally matches the full submission view, not just the app's 6 negotiable
  // terms. Excludes the CR/VAT `supplier` rows (those are company details, not term conflicts).
  const merged = opts?.all
    ? [...(negotiable ?? []), ...terms.equipment, ...terms.contract]
    : [...(negotiable ?? []), ...terms.equipment, ...terms.contract, ...terms.supplier];
  const seen = new Set<string>();
  const rows = merged.filter((r) => {
    if (opts?.all) return r.state !== "grey"; // every answered term (no COUNTED_TERM_GROUP gate, no group dedup)
    const group = COUNTED_TERM_GROUP[r.key];
    if (!group) return false; // only the app's 6 negotiable terms (in-app OR link-bid key name)
    // App parity: fuel_responsibility is counted only when the rentee actually declared it (an
    // undeclared/open — grey — row is dropped, not shown as Pending).
    if (group === "fuel" && r.state === "grey") return false;
    if (seen.has(group)) return false; // one row per GROUP (keep the first — negotiable carries live deal-room state)
    seen.add(group);
    return true;
  });
  const byBucket: Record<TermBucket, TermRow[]> = { conflict: [], pending: [], matched: [] };
  for (const r of rows) byBucket[bucketOfTermState(r.state)].push(r);
  return { rows, byBucket, counts: { conflict: byBucket.conflict.length, pending: byBucket.pending.length, matched: byBucket.matched.length } };
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
