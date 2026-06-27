import type { BidCard, TermRow, TermState } from "@/lib/contract/bids";

/**
 * web-app/006 (expanded) — off-platform bid submissions captured through a request's shared link.
 * Stored independently (the agents `LinkBidSubmission` table); NEVER a real `bid`. These map into a
 * `BidCard`-compatible shape so My Bids + the comparison reuse existing rendering, tagged
 * `viaSharedLink` so the UI shows the off-platform card (no deal room, flat quoted total, read-only).
 */

export interface LinkBidConfirmations {
  /** Each is the supplier's Yes/No answer to a required term; undefined = not asked for this item. */
  operator?: boolean;
  fat?: boolean;
  fuel?: boolean;
  year?: boolean;
  operatorCert?: boolean;
  equipmentCert?: boolean;
}

export interface LinkBidItem {
  requestItemId: string;
  /** The request (fan-out) this item belongs to — used to pick the right item in the per-item comparison. */
  requestId?: string | null;
  label?: string | null;
  numberOfUnits?: number;
  /** Rental basis carried from the request (PER_DAY/PER_WEEK/PER_MONTH/PER_JOB) so totals normalize. */
  priceUnit?: string | null;
  rentalRate?: number | null;
  deliveryPrice?: number | null;
  returnPrice?: number | null;
  total?: number | null;
  confirmations?: LinkBidConfirmations;
}

export interface LinkBidSubmission {
  id: string;
  requestId: string;
  createdAt: string | null;
  companyName: string;
  crNumber?: string | null;
  vatNumber?: string | null;
  nationalAddress?: string | null;
  contactInfo?: string | null;
  notes?: string | null;
  items: LinkBidItem[];
  grandTotal?: number | null;
}

/** Public form-render payload (agents `GET /public/bid-form/{token}`) — what the supplier form needs. */
export interface BidFormItem {
  requestItemId: string;
  label: string | null;
  labelAr?: string | null;
  numberOfUnits: number;
  /** Rental basis (PER_DAY/PER_WEEK/PER_MONTH/PER_JOB) shown read-only + carried into the submission. */
  priceUnit: string | null;
  /** The required terms the supplier confirms Yes/No (value = what the request asks for, or null). */
  requiredTerms: { operator?: string | null; fat?: string | null; fuel?: string | null; year?: string | null; operatorCert?: string | null; equipmentCert?: string | null };
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
  renter: { name: string | null; contactName: string | null; city: string | null; verified: boolean };
  /** Read-only project terms + contract terms (for-all-items), from the request. */
  projectTerms: BidFormProjectTerms | null;
  contractTerms: { key: string; label: string; value: string }[];
  items: BidFormItem[];
}

/** Body the supplier form POSTs (agents `POST /public/bid-form/{token}/submissions`). */
export interface SubmitBidFormPayload {
  companyName: string;
  crNumber: string;
  vatNumber: string;
  nationalAddress: string;
  contactInfo: string;
  notes?: string;
  items: { requestItemId: string; confirmations: LinkBidConfirmations; rentalRate: number; deliveryPrice?: number; returnPrice?: number }[];
}

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const b = (v: unknown): boolean | undefined => (v === true || v === "yes" || v === 1 ? true : v === false || v === "no" || v === 0 ? false : undefined);
const has = (v?: string | null) => !!(v && v.trim());

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
      createdAt: s(o.createdAt),
      companyName: s(o.companyName) ?? "Supplier",
      crNumber: s(o.crNumber),
      vatNumber: s(o.vatNumber),
      nationalAddress: s(o.nationalAddress),
      contactInfo: s(o.contactInfo),
      notes: s(o.notes),
      grandTotal: n(o.grandTotal),
      items: items.map((i) => {
        const c = (i.confirmations ?? {}) as Record<string, unknown>;
        return {
          requestItemId: s(i.requestItemId) ?? "",
          requestId: s(i.requestId),
          label: s(i.label),
          numberOfUnits: n(i.numberOfUnits) ?? 1,
          priceUnit: s(i.priceUnit),
          rentalRate: n(i.rentalRate),
          deliveryPrice: n(i.deliveryPrice),
          returnPrice: n(i.returnPrice),
          total: n(i.total),
          confirmations: { operator: b(c.operator), fat: b(c.fat), fuel: b(c.fuel), year: b(c.year), operatorCert: b(c.operatorCert), equipmentCert: b(c.equipmentCert) },
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
    renter: { name: s(renter.name), contactName: s(renter.contactName), city: s(renter.city), verified: renter.verified === true },
    projectTerms: pt
      ? { location: s(pt.location), lat: n(pt.lat), lng: n(pt.lng), rentalBasis: s(pt.rentalBasis), startDate: s(pt.startDate), endDate: s(pt.endDate), hoursPerDay: n(pt.hoursPerDay), workingDaysPerWeek: n(pt.workingDaysPerWeek) }
      : null,
    contractTerms: ct.map((c) => ({ key: s(c.key) ?? "", label: s(c.label) ?? "", value: s(c.value) ?? "" })).filter((c) => c.key && c.value),
    items: items.map((i) => {
      const rt = (i.requiredTerms ?? {}) as Record<string, unknown>;
      return {
        requestItemId: s(i.requestItemId) ?? "",
        label: s(i.label),
        labelAr: s(i.labelAr),
        numberOfUnits: n(i.numberOfUnits) ?? 1,
        priceUnit: s(i.priceUnit),
        requiredTerms: { operator: s(rt.operator), fat: s(rt.fat), fuel: s(rt.fuel), year: s(rt.year), operatorCert: s(rt.operatorCert), equipmentCert: s(rt.equipmentCert) },
      };
    }),
  };
}

const termRow = (key: string, en: string, ar: string, ok?: boolean): TermRow => ({
  key,
  labelEn: en,
  labelAr: ar,
  // Yes → matches the request, No → conflict, undefined (not asked) → grey.
  state: (ok == null ? "grey" : ok ? "matched" : "conflict") as TermState,
});

/**
 * Map a submission (optionally scoped to one request item for the per-item comparison) into a
 * `BidCard`. Off-platform: no supplier id/rating/distance/verified, no deal room; compliance comes
 * from the typed CR/VAT/national fields; per-item Yes/No confirmations become term states.
 */
export function submissionToBidCard(sub: LinkBidSubmission, item?: LinkBidItem): BidCard {
  const it = item ?? sub.items[0] ?? null;
  const c = it?.confirmations ?? {};
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
    validUntil: null,
    price: it?.rentalRate ?? null,
    mobPrice: it?.deliveryPrice ?? null,
    demobPrice: it?.returnPrice ?? null,
    priceUnit: it?.priceUnit ?? null,
    duration: null, // open-ended; the comparison falls back to the request duration
    numberOfUnits: it?.numberOfUnits ?? 1,
    reqMinYear: null,
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
    requiredCerts: [],
    heldCertCodes: [],
    ownershipDocs: [],
    operatorCertReq: null,
    operatorCertDeclared: c.operatorCert == null ? null : c.operatorCert ? "Confirmed" : "Not confirmed",
    mobLeadTime: null,
    demobLeadTime: null,
    terms: {
      equipment: [
        termRow("year", "Equipment year", "سنة الصنع", c.year),
        termRow("certs", "Equipment certificate", "شهادة المعدة", c.equipmentCert),
      ],
      contract: [
        termRow("operator_included", "Operator", "المشغّل", c.operator),
        termRow("fat", "F.A.T", "الإعاشة والسكن", c.fat),
        termRow("fuel_responsibility", "Fuel responsibility", "مسؤولية الوقود", c.fuel),
      ],
      supplier: [
        termRow("cr", "CR", "السجل التجاري", has(sub.crNumber)),
        termRow("vat", "VAT", "الرقم الضريبي", has(sub.vatNumber)),
      ],
    },
    requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
    lockedTerms: [],
    unreadTerms: [],
    progress: { agreed: 0, total: 0 },
    lastEventAr: null,
    round: 1,
    uiState: null,
    viaSharedLink: true,
    quotedTotal: sub.grandTotal ?? null,
    submissionKey: sub.id,
  };
}
