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
export type CertCode = "TUV" | "SPSP" | "SASO" | "LC";
// Labels per 013 acceptance (AC-01/02): LC → "محتوى محلي", SASO → "شهادة SASO".
export const CERT_LABEL: Record<CertCode, { en: string; ar: string }> = {
  TUV: { en: "TÜV", ar: "TÜV" },
  SPSP: { en: "SPSP", ar: "SPSP" },
  SASO: { en: "SASO certificate", ar: "شهادة SASO" },
  LC: { en: "Local content", ar: "محتوى محلي" },
};
function toCert(raw: string): CertCode | null {
  const u = raw.trim().toUpperCase();
  if (u === "LC" || /LOCAL.?CONTENT/.test(u)) return "LC";
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

export interface BidCard {
  id: string;
  status: BidStatus;
  supplierId: string | null;
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
  /** Flat quoted total (incl VAT) for a link bid — shown instead of the rate/period breakdown. */
  quotedTotal?: number | null;
  /** The submission id the read-only viewer opens (off-platform supplier submission). */
  submissionKey?: string;
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
}

const n = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && !Number.isNaN(x) ? x : null;
};
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
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

  // Operator (spec 128). operator_included is an ACKNOWLEDGE term (matched, or conflict only when the
  // RFQ needs an operator the bid omits); operator_nationality is its own CONFLICT_ELIGIBLE term.
  const reqOperator = s(reqItem.operatorIncluded)?.toUpperCase() === "YES";
  const bidOperator = s(raw.operatorIncluded)?.toUpperCase() === "YES";
  const operatorIncluded: TermState = !reqOperator ? "grey" : bidOperator ? "matched" : "conflict";
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
  const operator: TermState = !reqOperator ? "grey" : deviationKeys.has("operator_nationality") || !bidOperator ? "conflict" : "matched";

  // operator_certification & safety_certifications — CONFLICT_ELIGIBLE / Negotiable in the app
  // (term-matching.ts: "Moved Acknowledge → Negotiable"). They live in the comparison's negotiable
  // set ONLY (never the bid card), so deal-room agreements overlay them live via overlayLocked().
  const reqOpCert = s(reqItem.operatorLicenseLevel) ?? s(req.operatorLicenseLevel);
  const operatorCertState: TermState = !reqOpCert ? "grey" : deviationKeys.has("operator_certification") ? "conflict" : "matched";
  const safetyCertState: TermState = requiredCerts.length === 0 ? "grey" : deviationKeys.has("safety_certifications") ? "conflict" : certs;

  // Project rows reused by both the bid-card "Project" bucket and the comparison's negotiable set.
  const rPayment: TermRow = { key: "payment_terms", labelEn: "Payment terms", labelAr: "شروط الدفع", state: contractState("payment_terms", s(req.paymentTerms)) };
  const rSla: TermRow = { key: "breakdown_response_sla", labelEn: "Breakdown response", labelAr: "زمن الاستجابة للأعطال", state: contractState("breakdown_response_sla", s(req.breakdownResponseSla)) };
  const rOvertime: TermRow = { key: "overtime_rate", labelEn: "Overtime", labelAr: "العمل الإضافي", state: contractState("overtime_rate", s(req.overtimeRate)) };
  const rMaint: TermRow = { key: "maintenance_responsibility", labelEn: "Maintenance", labelAr: "الصيانة", state: maintenance };

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
      { key: "operator", labelEn: "Operator", labelAr: "المشغّل", state: operator },
    ],
    contract: [rPayment, rSla, rOvertime, rMaint],
    // COMPARISON-only expanded set (the web side-by-side "Negotiable terms" section) — NOT on the bid
    // card. Carries the full deal-room negotiable + acknowledge terms with live overlay states.
    negotiable: [
      { key: "operator_included", labelEn: "Operator included", labelAr: "تشمل مشغّل", state: operatorIncluded },
      { key: "operator_nationality", labelEn: "Operator nationality", labelAr: "جنسية المشغّل", state: contractState("operator_nationality", opNat) },
      { key: "operator_certification", labelEn: "Operator certification", labelAr: "شهادة المشغّل", state: operatorCertState },
      { key: "safety_certifications", labelEn: "Equipment safety certificates", labelAr: "شهادات سلامة المعدة", state: safetyCertState },
      { key: "fat_food", labelEn: "Operator FAT — Food", labelAr: "الإعاشة (F.A.T) — الطعام", state: contractState("fat_food", fatFood) },
      { key: "fat_accommodation_transport", labelEn: "Operator FAT — Accommodation/Transport", labelAr: "الإعاشة (F.A.T) — الإقامة/النقل", state: contractState("fat_accommodation_transport", fatAccom) },
      { key: "fuel_responsibility", labelEn: "Fuel responsibility", labelAr: "مسؤولية الوقود", state: contractState("fuel_responsibility", fuelResp) },
      rPayment, rSla, rOvertime, rMaint,
      { key: "mobilization_pricing", labelEn: "Mobilization pricing", labelAr: "تسعير النقل", state: "grey" },
      { key: "demobilization_pricing", labelEn: "Demobilization pricing", labelAr: "تسعير الإرجاع", state: "grey" },
    ],
  };
}

function mapBid(raw: Record<string, unknown>, expired: boolean): BidCard {
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
  // OR it in here — that produced false "Verified" badges. A supplier is verified iff status === 2.
  const supVerified = n(sup.supplierStatus) === 2;
  // Company docs are read from the supplier's REAL verification fields projected in the bid list
  // (crNumber / vatNumber / national-address parts / localContentDocKey / sasoHeavyEquipDocKey). Show a
  // doc ONLY when its actual field is present — NEVER inferred from "verified" (a verified supplier can
  // still lack an optional doc), so the table + card match the admin panel exactly.
  const hasCr = docKey("crDocKey", "cr_doc_key", "crNumber", "commercialRegistrationNumber", "commercial_registration_number", "crFileKey");
  const hasVat = docKey("vatDocKey", "vat_doc_key", "vatNumber", "taxNumber", "tax_number", "vatFileKey");
  const hasNationalAddr = docKey("nationalAddressDocKey", "national_address_doc_key", "nationalId", "national_id", "companyAddress", "company_address", "companyCity", "shortAddress", "short_address", "postalCode", "postal_code", "buildingNumber", "building_number", "district");
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
  // The safety-cert requirement (TUV/SPSP/SASO) lives in the item's `safetyCertifications`; request-level
  // `requiredCerts` carries LC / SASO-registration etc. Union both so the cert rows reflect what the
  // request actually asks for (new web/agent requests put safety certs only in safetyCertifications).
  const requiredCerts = certList([
    ...(Array.isArray(rq.requiredCerts) ? (rq.requiredCerts as unknown[]) : []),
    ...(Array.isArray(rqItem.safetyCertifications) ? (rqItem.safetyCertifications as unknown[]) : []),
  ]);
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
  const pm = (raw.progressMeter ?? {}) as Record<string, unknown>;
  const progress = { agreed: n(pm.agreed) ?? 0, total: n(pm.total) ?? 0 };
  // Distance: use a server-computed value if present, else derive it from the bid's equipment
  // coordinates (bids.equipment_lat/lng) vs the request's project location. Null → "—" (no location).
  const eqObj = (eq ?? {}) as Record<string, unknown>;
  const bidLat = pickNum(raw, "equipmentLat", "equipment_lat", "bidLat", "lat") ?? pickNum(eqObj, "lat", "latitude");
  const bidLng = pickNum(raw, "equipmentLng", "equipment_lng", "bidLng", "lng") ?? pickNum(eqObj, "lng", "longitude");
  const reqLat = pickNum(rq, "projectLat", "project_lat", "lat");
  const reqLng = pickNum(rq, "projectLng", "project_lng", "lng");
  const distanceKm = n(raw.distanceKm) ?? haversineKm(bidLat, bidLng, reqLat, reqLng);

  const lockedKeys = new Set(lockedTerms.map((t) => normKey(t.key)));
  const unreadKeys = new Set(unreadTerms.map(normKey));
  const lockedVal = (pred: (k: string) => boolean): string | null => {
    const t = lockedTerms.find((x) => pred(normKey(x.key)));
    return t && t.value != null && t.value !== "" ? String(t.value) : null;
  };
  // Overlay the deal-room state onto each compare row: locked → "agreed" (AC-08), unseen counter →
  // "negotiating"; otherwise keep the static compare state. One unified Terms list, deal-room-aware.
  const overlayLocked = (rows: TermRow[]): TermRow[] =>
    rows.map((r) => {
      const k = normKey(r.key);
      if (lockedKeys.has(k)) return { ...r, state: "agreed" as TermState };
      if (unreadKeys.has(k)) return { ...r, state: "negotiating" as TermState };
      return r;
    });
  const baseTerms = buildBidTerms(raw, eqVerified, requiredCerts, held);
  const negMobLead = lockedVal((k) => k.includes("leadtime"));
  const negMobPrice = lockedVal((k) => k.includes("mobilizationpricing"));
  const negDemobPrice = lockedVal((k) => k.includes("demobilizationpricing"));
  // Rate: only reflect a deal-room change once it's CONFIRMED — i.e. the synthetic PRICE term is
  // locked/agreed (both sides accepted). `raw.currentPrice` is the deal room's lastProposedRate (the
  // latest PENDING counter), so we ignore it; show the agreed rate if locked, else the supplier's
  // original submitted offer (`priceAmount`). Same lock-gating as mob/demob above.
  const negRate = lockedVal((k) => k === "price");

  return {
    id: String(raw.id ?? ""),
    status: (s(raw.status) as BidStatus) ?? "PENDING",
    supplierId: sup.id != null ? String(sup.id) : null,
    supplierName: s(raw.supplierDisplayName) ?? s(sup.companyName) ?? ([s(sup.firstName), s(sup.lastName)].filter(Boolean).join(" ") || "Supplier"),
    verified: supVerified,
    rating: n(sup.rating) ?? n(prof.rating),
    distanceKm,
    submittedAt: s(raw.createdAt),
    validUntil: s(raw.validUntil),
    price: n(negRate) ?? n(raw.priceAmount), // confirmed (locked) rate, else the original offer — never the pending counter
    mobPrice: n(negMobPrice) ?? n(raw.mobPrice),
    demobPrice: n(negDemobPrice) ?? n(raw.demobPrice),
    priceUnit: s(raw.priceUnit),
    duration: n(raw.duration),
    numberOfUnits: n(rqItem.numberOfUnits) ?? 1,
    // Supplier's chosen quantity (bid.units_offered is an array; its length = offered unit count).
    unitsOffered: Array.isArray(raw.unitsOffered) ? raw.unitsOffered.length : (n(raw.unitsOffered) ?? n(rqItem.numberOfUnits) ?? 1),
    reqMinYear: n(rqItem.maxEquipmentAge),
    equipment: eq
      ? { id: s(eq.id) ?? s(eq.equipmentId), make: s(eq.manufacturer) ?? s(eq.make), model: s(eq.model), year: n(eq.year), imageUrl: s(eq.imageUrl) ?? s(eq.primaryPhotoUrl) }
      : null,
    eqVerified,
    compliance: {
      entityType: s(prof.companyName) ? "company" : "individual",
      activityLicense: hasCr,
      taxNumber: hasVat,
      nationalAddress: hasNationalAddr,
      safety: certs.TUV === true || certs.SPSP === true || heldCerts.some((c) => /tuv|spsp|safety/i.test(c)),
      saso: certs.SASO === true || docKey("sasoHeavyEquipDocKey", "saso_heavy_equip_doc_key") || held.includes("SASO") || heldCerts.some((c) => /saso/i.test(c)),
      localContent: docKey("localContentDocKey", "local_content_doc_key") || held.includes("LC") || heldCerts.some((c) => /local.?content/i.test(c)),
    },
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

/** One supplier in a group's bid set (Level-2 filter chip) — keyed by id, falling back to name. */
export interface BidSupplier {
  key: string;
  name: string;
  verified: boolean;
  count: number;
}

/** Distinct suppliers across a bid list, in first-appearance order, with per-supplier counts. */
export function bidSuppliers(bids: BidCard[]): BidSupplier[] {
  const order: string[] = [];
  const map = new Map<string, BidSupplier>();
  for (const b of bids) {
    const key = b.supplierId ?? b.supplierName;
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
