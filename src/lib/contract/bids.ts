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
 * Equipment `documentKeys[].type` → cert, EXACT match only — so ownership docs (istimara, customs,
 * sale_contract, saso_registration, saso_technical_inspection) are ignored, exactly like the backend's
 * resolveHeldCerts (keeps LC/SASO/TUV/SPSP only). A loose /SASO/ test would wrongly treat
 * `saso_registration`/`saso_technical_inspection` as a SASO cert.
 */
function eqDocTypeToCert(type: string): CertCode | null {
  const t = type.trim().toLowerCase();
  if (t === "tuv" || t === "tüv") return "TUV";
  if (t === "spsp") return "SPSP";
  if (t === "saso") return "SASO";
  if (t === "lc" || t === "local_content") return "LC";
  return null;
}

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
  /** Certs this supplier actually holds (app: supplier.heldCerts) — ✓/✗ vs requiredCerts. */
  heldCertCodes: CertCode[];
  /** Lead times for the price breakdown's mobilization/return rows (013 AC-11 inline tags). */
  mobLeadTime: string | null;
  demobLeadTime: string | null;
  /** Per-class term status for the card badges + Terms modal (app parity — Equipment / Project /
   *  Supplier). Equipment + contract(=Project) are the request-vs-offer compare (deal-room-overlaid);
   *  supplier = the verification docs held (CR / VAT / National address). */
  terms: { equipment: TermRow[]; contract: TermRow[]; supplier: TermRow[] };
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
  /* ── web-app/006 shared-link demo (STAGING MOCK ONLY — never set by the real backend mapper) ──
   * An off-platform bid a supplier submitted through the renter's shared link (no account). These
   * render as a distinct "via shared link" card (no deal room) with a flat quoted total and a
   * read-only "view submission" viewer instead of the negotiate footer. See lib/mock/shared-link-bids. */
  viaSharedLink?: boolean;
  /** Flat quoted total (incl VAT) for a link bid — shown instead of the rate/period breakdown. */
  quotedTotal?: number | null;
  /** Which sample submission the read-only viewer opens (off-platform supplier key). */
  submissionKey?: string;
  /** "submitted N days ago" for the link-bid card (avoids non-deterministic date math). */
  agoDays?: number;
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
function buildBidTerms(raw: Record<string, unknown>, eqVerified: boolean, requiredCerts: CertCode[], heldCertCodes: CertCode[]): { equipment: TermRow[]; contract: TermRow[] } {
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

  const maxAge = n(reqItem.maxEquipmentAge);
  const bidYear = n(eq.year) ?? 0;
  const year: TermState = maxAge == null || bidYear === 0 ? "grey" : unverified ? "grey" : new Date().getFullYear() - bidYear > maxAge ? "conflict" : "matched";

  const reqFuel = s(reqItem.fuelTypePreference)?.toUpperCase();
  const bidFuel = s(eq.fuelType)?.toUpperCase();
  const fuel: TermState = !reqFuel || !bidFuel ? "grey" : unverified ? "grey" : reqFuel === bidFuel ? "matched" : "conflict";

  // Operator (spec 128): conflict on a nationality deviation or when the RFQ needs an operator the bid omits; else grey/unverified.
  const reqOperator = s(reqItem.operatorIncluded)?.toUpperCase() === "YES";
  const bidOperator = s(raw.operatorIncluded)?.toUpperCase() === "YES";
  const operator: TermState = deviationKeys.has("operator_nationality") || (reqOperator && !bidOperator) ? "conflict" : "grey";

  const contractState = (key: string, reqVal: string | null): TermState => (!reqVal ? "grey" : deviationKeys.has(key) ? "conflict" : "matched");
  const t3 = (raw.t3Declarations ?? {}) as Record<string, unknown>;
  const reqMaint = s(req.maintenanceResponsibility)?.toLowerCase();
  const bidMaint = s(t3.maintenance_responsibility)?.toLowerCase();
  const maintenance: TermState = !reqMaint ? "grey" : !bidMaint ? "grey" : reqMaint === bidMaint ? "matched" : "conflict";

  return {
    equipment: [
      { key: "measurement", labelEn: "Measurement", labelAr: "القياس", state: measurement },
      { key: "certs", labelEn: "Certificates", labelAr: "الشهادات", state: certs },
      { key: "year", labelEn: "Year of manufacture", labelAr: "سنة الصنع", state: year },
      { key: "fuel", labelEn: "Fuel type", labelAr: "نوع الوقود", state: fuel },
      { key: "operator", labelEn: "Operator", labelAr: "المشغّل", state: operator },
      { key: "attachments", labelEn: "Attachments", labelAr: "الملحقات", state: "grey" },
    ],
    contract: [
      { key: "payment_method", labelEn: "Payment method", labelAr: "طريقة الدفع", state: contractState("payment_method", s(req.paymentMethod)) },
      { key: "payment_terms", labelEn: "Payment terms", labelAr: "شروط الدفع", state: contractState("payment_terms", s(req.paymentTerms)) },
      { key: "breakdown_response_sla", labelEn: "Breakdown response", labelAr: "زمن الاستجابة للأعطال", state: contractState("breakdown_response_sla", s(req.breakdownResponseSla)) },
      { key: "overtime", labelEn: "Overtime", labelAr: "العمل الإضافي", state: contractState("overtime", s(req.overtimeRate)) },
      { key: "maintenance", labelEn: "Maintenance", labelAr: "الصيانة", state: maintenance },
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
  // Supplier's held certs (app parity): heldCerts list ∪ certs flags ∪ profile doc keys ∪ the
  // EQUIPMENT listing's document_keys (TÜV/SASO live on equipment_listings.document_keys = [{key,type}]).
  const held = certList(heldCerts);
  if (certs.TUV && !held.includes("TUV")) held.push("TUV");
  if (certs.SASO && !held.includes("SASO")) held.push("SASO");
  if (certs.SPSP && !held.includes("SPSP")) held.push("SPSP");
  if (docKey("sasoHeavyEquipDocKey", "saso_heavy_equip_doc_key") && !held.includes("SASO")) held.push("SASO");
  if (docKey("localContentDocKey", "local_content_doc_key") && !held.includes("LC")) held.push("LC");
  // Company-wide typed cert-docs map: heldCertDocs = { TUV: "key", SASO: "key", ... } on the profile.
  for (const src of profSources) {
    const map = src.heldCertDocs ?? src.held_cert_docs;
    if (map && typeof map === "object" && !Array.isArray(map)) {
      for (const [type, val] of Object.entries(map as Record<string, unknown>)) {
        if (val) { const c = toCert(type); if (c && !held.includes(c)) held.push(c); }
      }
    }
  }
  // Equipment-level certs: equipment_listings.documentKeys = [{ key, type }] (type = tuv/saso/spsp/…).
  // Ownership types (istimara/customs/sale_contract/saso_registration) aren't certs → toCert ignores them.
  const eqDocs = (Array.isArray(eq?.documentKeys) ? eq!.documentKeys : Array.isArray(eq?.document_keys) ? eq!.document_keys : []) as unknown[];
  for (const d of eqDocs) {
    const dk = d as Record<string, unknown>;
    const c = eqDocTypeToCert(String((typeof d === "string" ? d : (dk.type ?? dk.code ?? "")) ?? ""));
    if (c && !held.includes(c)) held.push(c);
  }
  const eqVerified = eq ? eq.verificationStatus === "VERIFIED" || eq.isVerified === true || eq.verified === true : false;
  const supVerified = sup.supplierStatus === 2 || prof.verified === true;
  // App parity (counterparty_identity_row): a company doc is "held" only when the supplier ACTUALLY
  // uploaded it in their verification submission — check the document keys that submission stores
  // (crDocKey / vatDocKey / nationalAddressDocKey), with the raw values as fallbacks. No static
  // "verified ⇒ has all docs" assumption.
  const hasCr = docKey("crDocKey", "cr_doc_key", "crNumber", "commercialRegistrationNumber", "commercial_registration_number", "crFileKey");
  const hasVat = docKey("vatDocKey", "vat_doc_key", "vatNumber", "taxNumber", "tax_number", "vatFileKey");
  const hasNationalAddr = docKey("nationalAddressDocKey", "national_address_doc_key", "nationalId", "national_id", "companyAddress", "company_address", "shortAddress", "short_address", "postalCode", "postal_code", "buildingNumber", "building_number");
  const requiredCerts = certList((raw.request as Record<string, unknown> | undefined)?.requiredCerts);
  const rq = (raw.request ?? {}) as Record<string, unknown>;
  const rqItem = (Array.isArray(rq.equipmentItems) ? (rq.equipmentItems as Record<string, unknown>[]) : [])[0] ?? {};

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
    price: n(raw.currentPrice) ?? n(raw.priceAmount),
    mobPrice: n(negMobPrice) ?? n(raw.mobPrice),
    demobPrice: n(negDemobPrice) ?? n(raw.demobPrice),
    priceUnit: s(raw.priceUnit),
    duration: n(raw.duration),
    numberOfUnits: n(rqItem.numberOfUnits) ?? 1,
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
    heldCertCodes: held,
    mobLeadTime: negMobLead ?? s(raw.mobLeadTime),
    demobLeadTime: s(raw.demobLeadTime),
    terms: {
      equipment: overlayLocked(baseTerms.equipment),
      contract: overlayLocked(baseTerms.contract),
      // Supplier verification docs the supplier holds (CR / VAT / National address) — informational.
      supplier: [
        { key: "cr", labelEn: "Commercial registration", labelAr: "السجل التجاري", state: (hasCr ? "matched" : "grey") as TermState },
        { key: "vat", labelEn: "VAT registration", labelAr: "الرقم الضريبي", state: (hasVat ? "matched" : "grey") as TermState },
        { key: "national_address", labelEn: "National address", labelAr: "العنوان الوطني", state: (hasNationalAddr ? "matched" : "grey") as TermState },
      ],
    },
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
