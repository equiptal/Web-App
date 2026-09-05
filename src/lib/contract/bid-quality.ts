/**
 * Bid-quality score for shared-link submissions — a 0–100 indicator of how well a bid matches the
 * renter's request and how complete its supporting docs are. Computed CLIENT-SIDE (no backend) so it
 * renders identically on the supplier's live form and the renter's read-only viewer.
 *
 * Weighting (product decision): Terms-match 40% · Equipment docs 30% · Company details 30%.
 *   - Terms-match: of the renter's required per-item terms, the fraction the supplier confirmed "yes".
 *   - Equipment docs: coverage of the expected equipment doc buckets — equipment photos + proof of
 *     ownership (always), plus equipment / operator certificates when the request needs them.
 *   - Company details: fraction of the OPTIONAL company slots provided — CR, VAT, national address,
 *     and other company documents — each satisfiable as text OR a document. (Company name + contact
 *     are required to submit and pricing gates submission, so neither is part of the quality score.)
 */

import type { LinkBidSubmission } from "@/lib/contract/link-bids";

/** The per-item terms the form asks the supplier to confirm (matches the form's TERM_KEYS). */
// `fuelType` dropped with the forms' own TERM_KEYS — a term the supplier is never shown cannot be
// counted against the completeness of their answer.
const ITEM_TERM_KEYS = ["operator", "nationality", "fatFood", "fatTransport", "fuel", "year", "operatorCert", "equipmentCert"] as const;

const OWNERSHIP_TYPES = new Set(["istimara", "customs_card", "sales_contract", "saso_registration", "combined"]);
const EQUIP_CERT_TYPES = new Set(["tuv", "spsp", "saso", "other"]);
const OPERATOR_CERT_TYPES = new Set(["operator_tuv", "operator_spsp", "operator_saso", "operator_other"]);
const COMPANY_EXTRA_DOC_TYPES = new Set(["local_content", "saso_heavy_equip", "other"]);

export interface QualityItemInput {
  requiredTerms: Record<string, string | null> | null | undefined;
  confirmations: Record<string, boolean | undefined>;
  priced: boolean;
  photoCount: number;
  ownershipCount: number;
  equipCertCount: number;
  operatorCertCount: number;
}
/** The optional company slots — each satisfied by text input OR an attached document. */
export interface QualityCompanyInput {
  cr: boolean;            // commercial registration (number or doc)
  vat: boolean;           // VAT (number or doc)
  address: boolean;       // national address (text or doc)
  otherDocs: boolean;     // ≥1 "other company document" attached
}
export interface QualityInput {
  items: QualityItemInput[];
  company: QualityCompanyInput;
}

export type QualityBand = "low" | "mid" | "high";
export interface BidQuality {
  score: number; // 0–100
  band: QualityBand;
  parts: { terms: number; equipment: number; company: number }; // each 0–1
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const bandOf = (score: number): QualityBand => (score >= 80 ? "high" : score >= 50 ? "mid" : "low");

export function computeBidQuality(input: QualityInput): BidQuality {
  const items = input.items ?? [];

  // ── Terms-match: matched / required, across every item's required terms.
  let required = 0, matched = 0;
  for (const it of items) {
    const rt = it.requiredTerms ?? {};
    for (const k of ITEM_TERM_KEYS) {
      if (rt[k] == null) continue; // not required for this item
      required += 1;
      if (it.confirmations?.[k] === true) matched += 1;
    }
  }
  const terms = required ? matched / required : 1;

  // ── Equipment docs: fraction of the expected equipment buckets that have ≥1 file.
  const anyNeedsEquipCert = items.some((it) => (it.requiredTerms ?? {}).equipmentCert != null);
  const anyNeedsOperator = items.some((it) => { const rt = it.requiredTerms ?? {}; return rt.operator != null || rt.operatorCert != null; });
  const sum = (f: (it: QualityItemInput) => number) => items.reduce((s, it) => s + f(it), 0);
  const equipBuckets: boolean[] = [
    sum((it) => it.photoCount) > 0,      // equipment photos (always expected)
    sum((it) => it.ownershipCount) > 0,  // proof of ownership (always expected)
  ];
  if (anyNeedsEquipCert) equipBuckets.push(sum((it) => it.equipCertCount) > 0);
  if (anyNeedsOperator) equipBuckets.push(sum((it) => it.operatorCertCount) > 0);
  const equipment = equipBuckets.length ? equipBuckets.filter(Boolean).length / equipBuckets.length : 1;

  // ── Company details: fraction of the optional company slots provided (text OR document).
  const c = input.company ?? { cr: false, vat: false, address: false, otherDocs: false };
  const companySlots = [c.cr, c.vat, c.address, c.otherDocs];
  const company = companySlots.filter(Boolean).length / companySlots.length;

  const score = Math.round(100 * (0.4 * clamp01(terms) + 0.3 * clamp01(equipment) + 0.3 * clamp01(company)));
  return { score, band: bandOf(score), parts: { terms: clamp01(terms), equipment: clamp01(equipment), company: clamp01(company) } };
}

type SubItem = LinkBidSubmission["items"][number];
/** One submission item → quality input (classifying its documents by type). */
function toItemInput(it: SubItem): QualityItemInput {
  const docs = it.documents ?? [];
  return {
    requiredTerms: it.requiredTerms,
    confirmations: (it.confirmations ?? {}) as Record<string, boolean | undefined>,
    priced: (it.rentalRate ?? 0) > 0,
    photoCount: (it.photos ?? []).length,
    ownershipCount: docs.filter((d) => OWNERSHIP_TYPES.has(d.type)).length,
    equipCertCount: docs.filter((d) => EQUIP_CERT_TYPES.has(d.type)).length,
    operatorCertCount: docs.filter((d) => OPERATOR_CERT_TYPES.has(d.type)).length,
  };
}
/** The submission's (shared) company details → quality input. */
function toCompanyInput(sub: LinkBidSubmission): QualityCompanyInput {
  const coDocs = sub.companyDocuments ?? [];
  return {
    cr: !!sub.crNumber || coDocs.some((d) => d.type === "cr"),
    vat: !!sub.vatNumber || coDocs.some((d) => d.type === "vat_cert"),
    address: !!sub.nationalAddress || coDocs.some((d) => d.type === "national_address"),
    otherDocs: coDocs.some((d) => COMPANY_EXTRA_DOC_TYPES.has(d.type)),
  };
}
/** Whole-submission quality (all items + company). Use for a single-item bid or a submission-level view. */
export function qualityFromSubmission(sub: LinkBidSubmission): BidQuality {
  return computeBidQuality({ items: (sub.items ?? []).map(toItemInput), company: toCompanyInput(sub) });
}
/** Per-ITEM quality — this one item's terms/docs + the submission's (shared) company details. Used on a
 *  multi-item bid so each item card shows its own score. */
export function qualityFromSubmissionItem(sub: LinkBidSubmission, item: SubItem): BidQuality {
  return computeBidQuality({ items: [toItemInput(item)], company: toCompanyInput(sub) });
}
