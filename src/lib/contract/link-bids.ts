import type { BidCard, CertCode, TermRow, TermState } from "@/lib/contract/bids";

/**
 * web-app/006 (expanded) — off-platform bid submissions captured through a request's shared link.
 * Stored independently (the agents `LinkBidSubmission` table); NEVER a real `bid`. These map into a
 * `BidCard`-compatible shape so My Bids + the comparison reuse existing rendering, tagged
 * `viaSharedLink` so the UI shows the off-platform card (no deal room, flat quoted total, read-only).
 */

export interface LinkBidConfirmations {
  /** Each is the supplier's Yes/No answer to a required term; undefined = not asked for this item. */
  operator?: boolean;
  nationality?: boolean;
  fatFood?: boolean;
  fatTransport?: boolean;
  fuel?: boolean;
  fuelType?: boolean;
  year?: boolean;
  operatorCert?: boolean;
  equipmentCert?: boolean;
  // Project terms (merged into each item's confirmations by the form — they apply to all items).
  payment?: boolean;
  overtime?: boolean;
  breakdownSla?: boolean;
  maintenance?: boolean;
  // Per-cert-code answers are also carried, keyed `${certTerm}::${code}` (e.g. "equipmentCert::TUV") —
  // set when a cert term lists 2+ certs so the supplier can confirm one but not another. The plain
  // `equipmentCert` / `operatorCert` above stay the aggregate (true only when every code is Yes). The
  // backend stores confirmations as pass-through JSON (validator: z.record(z.boolean())), so these
  // round-trip. They live under composite string keys; readers/writers access them via a
  // `Record<string, boolean | undefined>` cast (kept off this interface to avoid a template-literal
  // index signature, which Next's SWC transform mishandles).
}

/** Cert terms can list several required certs; each is confirmed on its own key. Kept here so the
 *  supplier form (write) and the renter's viewers (read) agree on the exact composite-key format. */
export const CERT_TERM_KEYS = new Set(["operatorCert", "equipmentCert"]);
export const certCodesFromValue = (v: string | null | undefined): string[] =>
  String(v ?? "").split(/[,/]/).map((s) => s.trim()).filter(Boolean);
export const certConfKey = (term: string, code: string) => `${term}::${code}`;
// Known cert codes → clean display labels (2026-07 rule: TÜV + Aramco are the offered equipment certs;
// legacy SPSP/SASO still render for old data). Unknown codes fall back to prettified uppercase.
const CERT_LABEL: Record<string, string> = {
  tuv: "TÜV", aramco: "Aramco Certified", aramco_certified: "Aramco Certified", aramco_certificate: "Aramco Certified",
  spsp: "SPSP", saso: "SASO", saso_technical_inspection: "SASO technical inspection", saso_registration: "SASO registration",
};
export const prettyCert = (code: string) => {
  const norm = code.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CERT_LABEL[norm] ?? code.trim().replace(/_/g, " ").toUpperCase();
};

/** Equipment photo kinds — each photo the supplier adds is classified as one of these. */
export type BidPhotoKind = "front_photo" | "serial_photo" | "hours_photo";
/** Per-item document kinds: proof-of-ownership (free-classify) + equipment/operator cert (request-driven,
 *  TÜV/SPSP/SASO — operator prefixed to stay distinct). */
export type BidDocKind =
  | "istimara" | "customs_card" | "sales_contract" | "saso_registration" | "combined"
  | "tuv" | "spsp" | "saso" | "other"
  | "operator_tuv" | "operator_spsp" | "operator_saso" | "operator_other";
/** Submission-level company-verification document kinds (aligned to the app's company doc set). */
export type CompanyDocKind = "cr" | "vat_cert" | "national_address" | "local_content" | "saso_heavy_equip" | "other";

/** An uploaded attachment — `key` is the plain S3 key on submit, a presigned URL on read. */
export interface BidAttachment { key: string; type: string; filename?: string | null }

export interface LinkBidItem {
  requestItemId: string;
  /** The request (fan-out) this item belongs to — used to pick the right item in the per-item comparison. */
  requestId?: string | null;
  label?: string | null;
  numberOfUnits?: number;
  /** Units the supplier offered on this line (partial bid) — ≤ numberOfUnits. Backend (PR #465) falls back
   *  to the requested count; on staging it's absent, so the mapper falls back to numberOfUnits. */
  offeredUnits?: number;
  /** Rental basis carried from the request (PER_DAY/PER_WEEK/PER_MONTH/PER_JOB) so totals normalize. */
  priceUnit?: string | null;
  rentalRate?: number | null;
  deliveryPrice?: number | null;
  returnPrice?: number | null;
  total?: number | null;
  confirmations?: LinkBidConfirmations;
  /** The renter's required VALUE per term (operator, nationality, fatFood, fuel, fuelType, year, certs,
   *  payment, overtime, breakdownSla) — drives the "Renter: X · Supplier: Y" conflict detail. */
  requiredTerms?: Record<string, string | null> | null;
  /** Equipment photos (classified: front/serial/hours) — presigned URLs on read. */
  photos?: BidAttachment[];
  /** Per-item documents (ownership / equipment cert / operator cert) — presigned URLs on read. */
  documents?: BidAttachment[];
}

export interface LinkBidSubmission {
  id: string;
  requestId: string;
  /** Human-citable quotation number (Q-YYYY-<reqShortCode>-<hash>) — same format as app bids. */
  quotationRef?: string | null;
  /** The RFQ this quotation answers (REQ-XXXXX). */
  rfqRef?: string | null;
  /** Per-group RFQ code shared by all items in the group (RFQ-NNNNN). The backend generates + returns it
   *  (live-verified on staging, per-submission); shown on the RFQ tabs + quotation. See [[web-groupref-handoff]]. */
  groupRef?: string | null;
  createdAt: string | null;
  companyName: string;
  crNumber?: string | null;
  vatNumber?: string | null;
  nationalAddress?: string | null;
  contactInfo?: string | null;
  /** Supplier's city — captured on the form; feeds the account the admin creates on convert. */
  city?: string | null;
  /** Rentee's pre-conversion "Negotiate" messages (append-only `{ text, at }`) — rendered as a chat
   *  thread in the submission viewer. Absent/empty until the renter messages the supplier. */
  renteeMessages?: { text: string; at: string }[];
  notes?: string | null;
  /** Supplier-set quote expiry (ISO) — how long THEIR price holds. Separate from the renter's bid
   *  deadline. Drives the quotation's "Valid until" when present. */
  validUntil?: string | null;
  items: LinkBidItem[];
  /** Submission-level company-verification docs (CR / VAT / national address) — presigned URLs. */
  companyDocuments?: BidAttachment[];
  grandTotal?: number | null;
}

/** Public form-render payload (agents `GET /public/bid-form/{token}`) — what the supplier form needs. */
export interface BidFormItem {
  requestItemId: string;
  label: string | null;
  labelAr?: string | null;
  /** Equipment size/capacity (e.g. "30 ton") — shown next to the item name. */
  size?: string | null;
  sizeAr?: string | null;
  numberOfUnits: number;
  /** Taxonomy image — same source the in-app bid/request cards render via EquipImg. Optional: the public
   *  bid-form endpoint doesn't send it yet (backend gap), so the item falls back to the name-derived glyph. */
  imageUrl?: string | null;
  /** Rental basis (PER_DAY/PER_WEEK/PER_MONTH/PER_JOB) shown read-only + carried into the submission. */
  priceUnit: string | null;
  /** Read-only context: who handles delivery / return + the renter's per-item note. */
  deliveryBy?: string | null;
  returnBy?: string | null;
  notes?: string | null;
  /** The required terms the supplier confirms Yes/No (value = what the request asks for, or null). */
  requiredTerms: { operator?: string | null; nationality?: string | null; fatFood?: string | null; fatTransport?: string | null; fuel?: string | null; fuelType?: string | null; year?: string | null; operatorCert?: string | null; equipmentCert?: string | null };
}
/** Read-only project context shown above the items (Layout B "Project terms"). */
export interface BidFormProjectTerms {
  location: string | null;
  lat: number | null;
  lng: number | null;
  rentalBasis: string | null;
  startDate: string | null;
  endDate: string | null;
  hoursPerDay: number | null;
  workingDaysPerWeek: number | null;
}
export interface BidFormData {
  token: string;
  /** open = show the form; closed = AC-11 (deadline passed) / AC-12 (request closed/cancelled). */
  status: "open" | "closed";
  closedReason: "deadline" | "closed_request" | null;
  /** ISO bid-submission deadline (AC-04/10); null = no expiry (AC-05). */
  deadline: string | null;
  /** Renter identity shown on the form (AC-09) — each field only when present. */
  renter: { name: string | null; contactName: string | null; city: string | null; verified: boolean; logoUrl: string | null };
  /** Read-only project terms + contract terms (for-all-items), from the request. */
  projectTerms: BidFormProjectTerms | null;
  contractTerms: { key: string; label: string; value: string }[];
  /** The renter's free-text notes for the whole request (read-only). */
  notes: string | null;
  items: BidFormItem[];
}

/** Body the supplier form POSTs (agents `POST /public/bid-form/{token}/submissions`). */
export interface SubmitBidFormPayload {
  companyName: string;
  crNumber: string;
  vatNumber: string;
  nationalAddress: string;
  /** Supplier phone — the account key. Stored normalized (E.164) in the existing `contact_info`
   *  column on the backend; the form collects it via a structured phone input. */
  contactInfo: string;
  /** Supplier's city — optional. */
  city?: string;
  notes?: string;
  /** Supplier-set quote expiry (ISO) — optional. */
  validUntil?: string;
  /** Submission-level company-verification docs (CR / VAT / national address). `key` = the S3 key
   *  returned by /upload-urls (NOT a URL). Optional. */
  companyDocuments?: { key: string; type: CompanyDocKind; filename?: string }[];
  /** `offeredUnits` (partial bid) is optional — omit → backend defaults to the full requested count.
   *  When sent it must be 1..numberOfUnits (backend 400s otherwise). Live on staging: submitBidForm
   *  persists + prices on it and getRequestSubmissions returns it.
   *  `photos`/`documents` carry the S3 keys from /upload-urls (classified by `type`). Optional. */
  items: {
    requestItemId: string;
    confirmations: LinkBidConfirmations;
    offeredUnits?: number;
    rentalRate: number;
    deliveryPrice?: number;
    returnPrice?: number;
    photos?: { key: string; type: BidPhotoKind; filename?: string }[];
    documents?: { key: string; type: BidDocKind; filename?: string }[];
  }[];
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const b = (v: unknown): boolean | undefined => (v === true || v === "yes" || v === 1 ? true : v === false || v === "no" || v === 0 ? false : undefined);
const has = (v?: string | null) => !!(v && v.trim());
/** Parse an attachments array ({key,type,filename}); key is a presigned URL on read. Undefined if empty. */
const attList = (v: unknown): BidAttachment[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = (v as Record<string, unknown>[])
    .map((e) => ({ key: s(e?.key) ?? "", type: s(e?.type) ?? "", filename: s(e?.filename) }))
    .filter((a) => a.key);
  return out.length ? out : undefined;
};

/** Parse the agents `GET /agents/requests/{id}/bid-submissions` payload into typed submissions. */
export function mapLinkSubmissions(raw: unknown): LinkBidSubmission[] {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.submissions) ? r.submissions : Array.isArray(raw) ? (raw as unknown[]) : [];
  return list.map((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
    return {
      id: s(o.id) ?? "",
      requestId: s(o.requestId) ?? "",
      quotationRef: s(o.quotationRef),
      rfqRef: s(o.rfqRef),
      groupRef: s(o.groupRef), // RFQ-NNNNN group short code (backend returns it per-submission); shown on the RFQ tabs + quotation
      createdAt: s(o.createdAt),
      companyName: s(o.companyName) ?? "Supplier",
      crNumber: s(o.crNumber),
      vatNumber: s(o.vatNumber),
      nationalAddress: s(o.nationalAddress),
      contactInfo: s(o.contactInfo),
      city: s(o.city),
      renteeMessages: (Array.isArray(o.renteeMessages) ? (o.renteeMessages as Record<string, unknown>[]) : [])
        .map((m) => ({ text: s(m?.text) ?? "", at: s(m?.at) ?? "" }))
        .filter((m) => m.text),
      notes: s(o.notes),
      validUntil: s(o.validUntil),
      companyDocuments: attList(o.companyDocuments),
      grandTotal: n(o.grandTotal),
      items: items.map((i) => {
        const c = (i.confirmations ?? {}) as Record<string, unknown>;
        return {
          requestItemId: s(i.requestItemId) ?? "",
          requestId: s(i.requestId),
          label: s(i.label),
          numberOfUnits: n(i.numberOfUnits) ?? 1,
          offeredUnits: n(i.offeredUnits) ?? (n(i.numberOfUnits) ?? 1), // partial bid (live on staging); falls back to the requested count only for older submissions with no stored value
          priceUnit: s(i.priceUnit),
          rentalRate: n(i.rentalRate),
          deliveryPrice: n(i.deliveryPrice),
          returnPrice: n(i.returnPrice),
          total: n(i.total),
          requiredTerms: i.requiredTerms && typeof i.requiredTerms === "object" ? (i.requiredTerms as Record<string, string | null>) : null,
          photos: attList(i.photos),
          documents: attList(i.documents),
          confirmations: (() => {
            const out: LinkBidConfirmations = { operator: b(c.operator), nationality: b(c.nationality), fatFood: b(c.fatFood), fatTransport: b(c.fatTransport), fuel: b(c.fuel), fuelType: b(c.fuelType), year: b(c.year), operatorCert: b(c.operatorCert), equipmentCert: b(c.equipmentCert), payment: b(c.payment), overtime: b(c.overtime), breakdownSla: b(c.breakdownSla), maintenance: b(c.maintenance) };
            // Preserve per-cert-code keys (e.g. "equipmentCert::TUV") the form sent — the renter's viewers read them.
            for (const [k, v] of Object.entries(c)) if (k.includes("::")) (out as Record<string, boolean | undefined>)[k] = b(v);
            return out;
          })(),
        };
      }),
    };
  });
}

/** Parse the agents `GET /public/bid-form/{token}` payload for the public supplier form. */
export function mapBidFormData(raw: unknown): BidFormData {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
  const renter = (r.renter ?? {}) as Record<string, unknown>;
  const reason = s(r.closedReason);
  const pt = r.projectTerms ? (r.projectTerms as Record<string, unknown>) : null;
  const ct = Array.isArray(r.contractTerms) ? (r.contractTerms as Record<string, unknown>[]) : [];
  return {
    token: s(r.token) ?? "",
    status: r.status === "closed" ? "closed" : "open",
    closedReason: reason === "deadline" || reason === "closed_request" ? reason : null,
    deadline: s(r.deadline),
    renter: { name: s(renter.name), contactName: s(renter.contactName), city: s(renter.city), verified: renter.verified === true, logoUrl: s(renter.logoUrl) },
    projectTerms: pt
      ? { location: s(pt.location), lat: n(pt.lat), lng: n(pt.lng), rentalBasis: s(pt.rentalBasis), startDate: s(pt.startDate), endDate: s(pt.endDate), hoursPerDay: n(pt.hoursPerDay), workingDaysPerWeek: n(pt.workingDaysPerWeek) }
      : null,
    // Exclude `maintenance` (not a supplier-confirmed term here) + `overtime` when it's effectively none (0).
    contractTerms: ct.map((c) => ({ key: s(c.key) ?? "", label: s(c.label) ?? "", value: s(c.value) ?? "" }))
      .filter((c) => c.key && c.value && c.key !== "maintenance" && !(c.key === "overtime" && ["0", "0×", "none", "without"].includes(c.value.toLowerCase()))),
    notes: s(r.notes),
    items: items.map((i) => {
      const rt = (i.requiredTerms ?? {}) as Record<string, unknown>;
      return {
        requestItemId: s(i.requestItemId) ?? "",
        label: s(i.label),
        labelAr: s(i.labelAr),
        size: s(i.size),
        sizeAr: s(i.sizeAr),
        numberOfUnits: n(i.numberOfUnits) ?? 1,
        imageUrl: s(i.imageUrl),
        priceUnit: s(i.priceUnit),
        deliveryBy: s(i.deliveryBy),
        returnBy: s(i.returnBy),
        notes: s(i.notes),
        requiredTerms: { operator: s(rt.operator), nationality: s(rt.nationality), fatFood: s(rt.fatFood), fatTransport: s(rt.fatTransport), fuel: s(rt.fuel), fuelType: s(rt.fuelType), year: s(rt.year), operatorCert: s(rt.operatorCert), equipmentCert: s(rt.equipmentCert) },
      };
    }),
  };
}

const termRow = (key: string, en: string, ar: string, ok?: boolean, reqVal?: string | null): TermRow => ({
  key,
  labelEn: en,
  labelAr: ar,
  // Yes → matches the request, No → conflict, undefined (not asked) → grey.
  state: (ok == null ? "grey" : ok ? "matched" : "conflict") as TermState,
  // What the renter required vs what the supplier answered (shown on conflicts in the terms panel).
  detail:
    ok == null
      ? undefined
      : { en: `Renter: ${reqVal || "—"} · Supplier: ${ok ? "Yes" : "No"}`, ar: `المستأجر: ${reqVal || "—"} · المؤجّر: ${ok ? "نعم" : "لا"}` },
});

/**
 * Map a submission (optionally scoped to one request item for the per-item comparison) into a
 * `BidCard`. Off-platform: no supplier id/rating/distance/verified, no deal room; compliance comes
 * from the typed CR/VAT/national fields; per-item Yes/No confirmations become term states.
 */
export function submissionToBidCard(sub: LinkBidSubmission, item?: LinkBidItem): BidCard {
  const it = item ?? sub.items[0] ?? null;
  const c = it?.confirmations ?? {};
  const rt = (it?.requiredTerms ?? {}) as Record<string, string | null>;
  const up = (v: string | null | undefined) => (v ? v.toUpperCase() : v ?? null); // cert acronyms (TUV/SASO)
  // Equipment-section enrichment for the comparison matrix. Off-platform bids have no equipment listing
  // or docs — only the supplier's Yes/No confirmations — so populate Year / Equipment certs / Operator
  // cert from those (showing the requested VALUE the supplier confirmed, e.g. TÜV), not blanks.
  const toCertCode = (raw: string): CertCode | null => { const u = raw.toUpperCase(); return u.includes("TUV") || u.includes("TÜV") ? "TUV" : u.includes("SPSP") ? "SPSP" : u.includes("SASO") ? "SASO" : u.includes("LC") || u.includes("LOCAL") ? "LC" : null; };
  const cc = c as Record<string, boolean | undefined>;
  const reqEqRaw = certCodesFromValue(rt.equipmentCert);
  const reqEqCertCodes = reqEqRaw.map((x) => toCertCode(x)).filter((x): x is CertCode => !!x);
  // Held per cert code when the form sent per-code answers (confirm TÜV but not SPSP); else fall back
  // to the aggregate boolean (older submissions / single-cert requests).
  const eqCertConfirmed = reqEqRaw
    .filter((raw) => { const v = cc[certConfKey("equipmentCert", raw)]; return v !== undefined ? v === true : c.equipmentCert === true; })
    .map((x) => toCertCode(x)).filter((x): x is CertCode => !!x);
  // Extract the required manufacture year from `rt.year` — tolerant of strings like "2018", "≥ 2018",
  // or "2018 or newer" (a bare Number() fails on those, which is why the comparison used to show
  // "Confirmed" instead of the year). Grab the first 4-digit year.
  const reqYearNum = rt.year ? (Number.parseInt(String(rt.year).match(/\d{4}/)?.[0] ?? "", 10) || null) : null;
  return {
    id: `link-${sub.id}`,
    status: "PENDING",
    // Unique synthetic supplier id so the comparison treats each submission as its own column.
    supplierId: `link-${sub.id}`,
    supplierName: sub.companyName || "Supplier",
    verified: false,
    rating: null,
    distanceKm: null, // the form captures no supplier location
    submittedAt: sub.createdAt,
    validUntil: sub.validUntil ?? null, // supplier-set quote expiry → bid-card chip + quotation "Valid until"
    price: it?.rentalRate ?? null,
    mobPrice: it?.deliveryPrice ?? null,
    demobPrice: it?.returnPrice ?? null,
    priceUnit: it?.priceUnit ?? null,
    duration: null, // open-ended; the comparison falls back to the request duration
    numberOfUnits: it?.numberOfUnits ?? 1,
    // Partial bid: the units this line offered — live end-to-end (form sends it, backend persists +
    // returns it). Falls back to the requested count only for older submissions with no stored value.
    unitsOffered: it?.offeredUnits ?? it?.numberOfUnits ?? 1,
    reqMinYear: reqYearNum,
    equipment: null, // the form confirms "meets the requested year", not a specific make/model/year
    eqVerified: false,
    compliance: {
      entityType: has(sub.companyName) ? "company" : "individual",
      activityLicense: has(sub.crNumber),
      taxNumber: has(sub.vatNumber),
      nationalAddress: has(sub.nationalAddress),
      safety: false,
      saso: false,
      localContent: false,
    },
    matchCount: 0,
    conflictCount: 0,
    dealRoomId: null,
    expired: false,
    note: sub.notes ?? null,
    requiredCerts: reqEqCertCodes,
    heldCertCodes: eqCertConfirmed,
    equipmentCertCodes: eqCertConfirmed,
    ownershipDocs: [],
    operatorCertReq: up(rt.operatorCert) ?? null,
    // Show the confirmed VALUE (e.g. the requested license level) when the supplier said Yes, else "Not confirmed".
    operatorCertDeclared: c.operatorCert == null ? null : c.operatorCert ? (up(rt.operatorCert) ?? "Confirmed") : "Not confirmed",
    mobLeadTime: null,
    demobLeadTime: null,
    terms: {
      // Only include terms the renter actually asked (undefined = not asked → omitted, keeping it dynamic).
      equipment: [
        c.year != null && termRow("year", "Equipment year", "سنة الصنع", c.year, rt.year),
        c.equipmentCert != null && termRow("certs", "Equipment certificate", "شهادة المعدة", c.equipmentCert, up(rt.equipmentCert)),
      ].filter(Boolean) as TermRow[],
      contract: [
        c.operator != null && termRow("operator_included", "Operator", "المشغّل", c.operator, rt.operator),
        c.nationality != null && termRow("nationality", "Operator nationality", "جنسية المشغّل", c.nationality, rt.nationality),
        c.fatFood != null && termRow("fat_food", "Food (F.A.T)", "الطعام", c.fatFood, rt.fatFood),
        c.fatTransport != null && termRow("fat_transport", "Accommodation & transport", "السكن والمواصلات", c.fatTransport, rt.fatTransport),
        c.fuel != null && termRow("fuel_responsibility", "Fuel responsibility", "مسؤولية الوقود", c.fuel, rt.fuel),
        c.fuelType != null && termRow("fuel_type", "Fuel type", "نوع الوقود", c.fuelType, rt.fuelType),
        c.operatorCert != null && termRow("operator_cert", "Operator certificate", "شهادة المشغّل", c.operatorCert, up(rt.operatorCert)),
        c.payment != null && termRow("payment", "Payment type", "نوع الدفع", c.payment, rt.payment),
        c.overtime != null && termRow("overtime", "Overtime rate", "أجر العمل الإضافي", c.overtime, rt.overtime),
        c.breakdownSla != null && termRow("breakdown_sla", "Breakdown response", "زمن الاستجابة للأعطال", c.breakdownSla, rt.breakdownSla),
        c.maintenance != null && termRow("maintenance", "Maintenance", "الصيانة", c.maintenance, rt.maintenance),
      ].filter(Boolean) as TermRow[],
      supplier: [
        termRow("cr", "CR", "السجل التجاري", has(sub.crNumber)),
        termRow("vat", "VAT", "الرقم الضريبي", has(sub.vatNumber)),
      ],
    },
    requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
    // Request-assigned cost sides (from the required terms) so the comparison's cost-terms rows render
    // even for a link-only comparison, and maintenance mirrors the request (T5/T9).
    requestResponsibilities: (() => {
      const side = (v: string | null | undefined): "supplier" | "me" | null =>
        !v ? null : /(supplier|مؤجّر)/i.test(v) ? "supplier" : /(renter|rentee|me|مستأجر|أنت)/i.test(v) ? "me" : null;
      const rr: Partial<Record<"fuel" | "maintenance" | "operator_food" | "operator_transport_accommodation", "supplier" | "me">> = {};
      const f = side(rt.fuel); if (f) rr.fuel = f;
      const mn = side(rt.maintenance); if (mn) rr.maintenance = mn;
      const ff = side(rt.fatFood); if (ff) rr.operator_food = ff;
      const ftr = side(rt.fatTransport); if (ftr) rr.operator_transport_accommodation = ftr;
      return rr;
    })(),
    lockedTerms: [],
    unreadTerms: [],
    progress: { agreed: 0, total: 0 },
    lastEventAr: null,
    round: 1,
    uiState: null,
    viaSharedLink: true,
    // Per-item card → that item's total (incl VAT); whole-submission card → the grand total.
    quotedTotal: item ? (it?.total ?? null) : (sub.grandTotal ?? null),
    submissionKey: sub.id,
    requestItemId: it?.requestItemId,
    // Captured company-doc VALUES (off-platform has no files) — keyed by the comparison's doc hints.
    linkDocs: {
      ...(has(sub.crNumber) ? { commercial: sub.crNumber as string } : {}),
      ...(has(sub.vatNumber) ? { vat: sub.vatNumber as string } : {}),
      ...(has(sub.nationalAddress) ? { national: sub.nationalAddress as string } : {}),
      ...(has(sub.contactInfo) ? { contact: sub.contactInfo as string } : {}),
    },
  };
}
