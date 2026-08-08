/**
 * V14 (RM3-AC-68 / AC-70) — the wire type + mapper for a bid supplier's company papers.
 *
 * Source: app backend `GET /marketplace/bids/{bidId}/company-documents` →
 * `company-documents.service.getCompanyDocumentsForBid`, which derives the supplier FROM the bid
 * (no company id is ever accepted from a client) and gates it with the same `canAccessRequest`
 * predicate the fleet read uses.
 *
 * **This is the read that did not exist.** `CompanyPanel` takes its rows as a `docs` prop and nothing
 * could fill it: `getMyCompany` serves a supplier his OWN company, `partner/company.ts` is the
 * partner/admin surface, and neither is reachable by a renter looking at a bid. V9 therefore rendered
 * four rows that were structurally always "no document yet".
 *
 * **The output shape IS `CompanyDocsSource`** — structurally, not by import. A contract module must
 * not depend on a component directory (the same rule `rentee-request.ts` holds for `PanelRequestDraft`),
 * so the two types are declared independently and the host spreads this straight onto the panel:
 *
 *     const src = await fetchCompanyDocuments(bid.id);
 *     <CompanyPanel companyName={…} verified={src.verified} docs={src.docs} … />
 *
 * **NO React, NO DOM, NO i18n** — same rule as `bid-map.ts`, for the same reason.
 */

/** The four company papers, keyed as the CATALOGUE keys them (`EquipmentDocumentType.documentKey`) —
 *  which is also what a document request names, so a row and the ask raised from it are one string. */
export type CompanyDocumentKey = "cr" | "vat_cert" | "national_address" | "local_content";

/** The panel's own vocabulary. It predates the catalogue and says `vat`; the two are reconciled here
 *  once rather than at every call site. */
export type PanelCompanyDocKey = "cr" | "vat" | "national_address" | "local_content";

const PANEL_KEY: Record<CompanyDocumentKey, PanelCompanyDocKey> = {
  cr: "cr",
  vat_cert: "vat",
  national_address: "national_address",
  local_content: "local_content",
};

/** One paper as the panel needs it. Structurally `CompanyDocInput` from `machine-panel-model.ts`. */
export interface CompanyDocEntry {
  present: boolean;
  /** ISO date. Rendered as "valid until …". Null where the platform stores no expiry for the kind —
   *  VAT (reissued, not dated) and local content (no column exists). */
  expiryDate: string | null;
  /** True for a paper the issuer reissues every year. VAT alone, and it is stated here rather than in
   *  the panel so the row's second line never has to be guessed from an absent date. */
  renewsAnnually?: boolean;
  /** The presigned url the backend signed through `batchSignItems`. **Never null on a present row** —
   *  the backend omits a paper it has no file for, so a row that exists can always be opened. */
  downloadUrl: string | null;
  /** The CATALOGUE key, carried so a request raised from this row names the type the backend will
   *  accept — `vat_cert`, not the panel's `vat`. */
  docType: CompanyDocumentKey;
}

/** The company as the panel needs it. Structurally `CompanyDocsSource`. */
export interface CompanyDocsPayload {
  companyName: string | null;
  /** The firm's verification. A paper on a verified firm's file has been checked; there is no
   *  per-document review on this platform. */
  verified: boolean;
  docs: Partial<Record<PanelCompanyDocKey, CompanyDocEntry>>;
  /** The same rows in wire order, for a caller that wants the list rather than the map. */
  documents: CompanyDocument[];
}

/** One row, verbatim from the wire (after the panel-key reconciliation above). */
export interface CompanyDocument {
  documentKey: CompanyDocumentKey;
  name: string;
  nameAr: string;
  /** Presigned url. Named `key` on the wire because `batchSignItems` signs a key IN PLACE. */
  downloadUrl: string | null;
  verified: boolean;
  expiryDate: string | null;
}

const CATALOGUE_KEYS: readonly CompanyDocumentKey[] = ["cr", "vat_cert", "national_address", "local_content"];

const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A wire `documentKey` → one of the four, or null. Tolerates the panel's `vat` and the legacy
 *  `commercial_register` / `municipal_license` names `getDealRoomDocuments` still emits, so a payload
 *  from either projection lands on the same row instead of being silently dropped. */
function catalogueKey(raw: unknown): CompanyDocumentKey | null {
  const k = String(raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((CATALOGUE_KEYS as readonly string[]).includes(k)) return k as CompanyDocumentKey;
  if (k === "vat") return "vat_cert";
  if (k === "commercial_register" || k === "commercial_registration") return "cr";
  if (k === "municipal_license") return "national_address";
  return null;
}

/**
 * An ISO date, or null.
 *
 * **Only ISO is trusted**, mirroring the backend's `parseLegacyExpiry` and for its reason: Saudi
 * paperwork often prints HIJRI dates, and `new Date('1448/07/15')` yields something — just not the
 * date on the document. Anything else becomes a GAP, which renders as a missing line rather than as a
 * "valid until" the renter would act on, or a false "expired" on a certificate that is very likely
 * fine.
 */
function isoDate(v: unknown): string | null {
  const raw = s(v);
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const d = new Date(raw.slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : raw.slice(0, 10);
}

/**
 * Parse the company-documents payload.
 *
 * Tolerant of the row being wrapped (`{data: …}`) and of the url arriving as `key` (which is what
 * `batchSignItems` produces — it replaces the S3 key with the signed url in place) or as `url` /
 * `downloadUrl` from a different projection of the same data.
 *
 * **A row with no url is dropped.** The backend does not emit one, and if some future projection did,
 * rendering it would produce exactly the dead control AC-69 forbids — while dropping it leaves the
 * panel saying "no document yet", which is honest and is the one row the renter can act on.
 */
export function mapCompanyDocuments(raw: unknown): CompanyDocsPayload {
  const root = (raw ?? {}) as Record<string, unknown>;
  const body = (root.data && typeof root.data === "object" && !Array.isArray(root.data)
    ? (root.data as Record<string, unknown>)
    : root) as Record<string, unknown>;

  const rows = Array.isArray(body.documents) ? (body.documents as unknown[]) : [];
  const verified = body.verified === true;

  const documents: CompanyDocument[] = [];
  const docs: Partial<Record<PanelCompanyDocKey, CompanyDocEntry>> = {};
  const seen = new Set<CompanyDocumentKey>();

  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>;
    const key = catalogueKey(o.documentKey ?? o.document_key ?? o.type);
    if (!key || seen.has(key)) continue;
    const downloadUrl = s(o.key) ?? s(o.downloadUrl) ?? s(o.url);
    if (!downloadUrl) continue;
    seen.add(key);

    const expiryDate = isoDate(o.expiryDate ?? o.expiry_date);
    documents.push({
      documentKey: key,
      name: s(o.name) ?? key,
      nameAr: s(o.nameAr) ?? s(o.name_ar) ?? key,
      downloadUrl,
      // Per-row verification defaults to the FIRM's, which is what it means — a company paper is
      // checked as part of the firm's verification, not on its own.
      verified: o.verified === undefined ? verified : o.verified === true,
      expiryDate,
    });

    docs[PANEL_KEY[key]] = {
      present: true,
      expiryDate,
      // VAT alone renews rather than expires; the others either carry a date or say nothing.
      ...(key === "vat_cert" && !expiryDate ? { renewsAnnually: true } : {}),
      downloadUrl,
      docType: key,
    };
  }

  return {
    companyName: s(body.companyName) ?? s(body.company_name),
    verified,
    docs,
    documents,
  };
}
