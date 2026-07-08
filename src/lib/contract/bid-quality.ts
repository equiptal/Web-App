/**
 * Bid-quality score for shared-link submissions — a 0–100 indicator of how well a bid matches the
 * renter's request and how complete its supporting docs are. Computed CLIENT-SIDE (no backend) so it
 * renders identically on the supplier's live form and the renter's read-only viewer.
 *
 * Balanced weighting (product decision): Terms-match 40% · Documents 40% · Completeness 20%.
 *   - Terms-match: of the renter's required per-item terms, the fraction the supplier confirmed "yes".
 *   - Documents: coverage of the expected doc buckets — equipment photos + proof of ownership +
 *     company verification (always), plus equipment / operator certificates when the request needs them.
 *   - Completeness: every item priced + all company details filled.
 */

import type { LinkBidSubmission } from "@/lib/contract/link-bids";

/** The per-item terms the form asks the supplier to confirm (matches the form's TERM_KEYS). */
const ITEM_TERM_KEYS = ["operator", "nationality", "fatFood", "fatTransport", "fuel", "fuelType", "year", "operatorCert", "equipmentCert"] as const;

const OWNERSHIP_TYPES = new Set(["istimara", "customs_card", "sales_contract", "saso_registration"]);
const EQUIP_CERT_TYPES = new Set(["tuv", "spsp", "saso_inspection", "insurance"]);
const OPERATOR_CERT_TYPES = new Set(["operator_tuv", "operating_license", "operator_spsp", "operator_id", "operator_insurance"]);

export interface QualityItemInput {
  requiredTerms: Record<string, string | null> | null | undefined;
  confirmations: Record<string, boolean | undefined>;
  priced: boolean;
  photoCount: number;
  ownershipCount: number;
  equipCertCount: number;
  operatorCertCount: number;
}
export interface QualityInput {
  items: QualityItemInput[];
  companyDocCount: number;
  companyComplete: boolean;
}

export type QualityBand = "low" | "mid" | "high";
export interface BidQuality {
  score: number; // 0–100
  band: QualityBand;
  parts: { terms: number; documents: number; completeness: number }; // each 0–1
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

  // ── Documents: fraction of the expected buckets that have ≥1 file.
  const anyNeedsEquipCert = items.some((it) => (it.requiredTerms ?? {}).equipmentCert != null);
  const anyNeedsOperator = items.some((it) => { const rt = it.requiredTerms ?? {}; return rt.operator != null || rt.operatorCert != null; });
  const sum = (f: (it: QualityItemInput) => number) => items.reduce((s, it) => s + f(it), 0);
  const buckets: boolean[] = [
    sum((it) => it.photoCount) > 0,      // equipment photos (always expected)
    sum((it) => it.ownershipCount) > 0,  // proof of ownership (always expected)
    input.companyDocCount > 0,           // company verification (always expected)
  ];
  if (anyNeedsEquipCert) buckets.push(sum((it) => it.equipCertCount) > 0);
  if (anyNeedsOperator) buckets.push(sum((it) => it.operatorCertCount) > 0);
  const documents = buckets.length ? buckets.filter(Boolean).length / buckets.length : 1;

  // ── Completeness: priced items + company details.
  const pricedFraction = items.length ? items.filter((it) => it.priced).length / items.length : 1;
  const completeness = 0.6 * pricedFraction + 0.4 * (input.companyComplete ? 1 : 0);

  const score = Math.round(100 * (0.4 * clamp01(terms) + 0.4 * clamp01(documents) + 0.2 * clamp01(completeness)));
  return { score, band: bandOf(score), parts: { terms: clamp01(terms), documents: clamp01(documents), completeness: clamp01(completeness) } };
}

/** Adapter: build the quality input from a renter-side submission (classifying documents by type). */
export function qualityFromSubmission(sub: LinkBidSubmission): BidQuality {
  const items: QualityItemInput[] = (sub.items ?? []).map((it) => {
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
  });
  const companyComplete = !!(sub.companyName && sub.crNumber && sub.vatNumber && sub.nationalAddress && sub.contactInfo);
  return computeBidQuality({ items, companyDocCount: (sub.companyDocuments ?? []).length, companyComplete });
}
