/**
 * web-app — "Quote → Bid-Form Transform + Renter Verify" (Option A). Mansour emits a raw enriched
 * `NormalizedBid` + `term_matches` from `/bids/transform`; the WEB builds this `BidFormDraft` view-model
 * + per-field `status` here (sibling of `normalizedBidToBidCard`, mirroring how `agentOutputToDraft`
 * shapes the RFQ draft). The renter verifies every field in-app, then `/bids/commit` turns the corrected
 * draft into a comparison-ready bid + feeds the learn-on-feed loop.
 */
import type { NormalizedBid, TermMatch, BidTermKey } from "@/lib/contract/agent-bids";

export type DraftStatus = "extracted" | "assumed" | "needs_verification";

export interface DraftField<T> {
  value: T | null;
  status: DraftStatus;
  required?: boolean;
  evidence?: string | null;
}

export interface TermAnswer {
  key: BidTermKey;
  label: string;
  renter_wants: string | null;
  answer: "yes" | "no" | null;
  status: DraftStatus;
}

export interface DraftItem {
  index: number;
  label: string;
  size: string | null;
  units_requested: number | null;
  units_offered: DraftField<number>;
  delivery_by: string | null;
  return_by: string | null;
  item_notes: string | null;
  terms: TermAnswer[];
  pricing: {
    vat_mode: DraftField<"excl" | "incl">;
    rental_price: DraftField<number>;
    delivery_price: DraftField<number>;
    return_price: DraftField<number>;
  };
}

export interface BidFormDraft {
  meta: { has_request: boolean; source_file: string | null; lang_hint?: "en" | "ar" };
  company: {
    company_name: DraftField<string>;
    cr_number: DraftField<string>;
    vat_number: DraftField<string>;
    national_address: DraftField<string>;
    contact: DraftField<string>;
    valid_until: DraftField<string>;
    notes: DraftField<string>;
  };
  contract_terms: TermAnswer[];
  project_terms: Record<string, string> | null;
  renter_notes: string | null;
  items: DraftItem[];
  /** Non-canonical clauses/fees/conditions the agent pulled from the quote that don't map to a field —
   *  surfaced (editable) so nothing is dropped, and folded into the bid's note for the compare "Notes" row. */
  extras: { label: string; value: string; status: DraftStatus }[];
}

/** The request context the web sends to `/bids/transform` so the agent can pre-answer the terms. */
export interface TransformRequestCtx {
  subtype?: string | null;
  capacity?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  terms?: Partial<Record<BidTermKey, string | number | boolean | null>>;
}

/** EN/AR labels for the 9 verifiable terms (same set as the shared bid form). */
export const BID_TERM_LABEL: Record<BidTermKey, [string, string]> = {
  operator: ["Operator", "المشغّل"],
  nationality: ["Operator nationality", "جنسية المشغّل"],
  fatFood: ["Food (F.A.T)", "الطعام"],
  fatTransport: ["Accommodation & transport", "السكن والمواصلات"],
  fuel: ["Fuel responsibility", "مسؤولية الوقود"],
  fuelType: ["Fuel type", "نوع الوقود"],
  year: ["Equipment year", "سنة الصنع"],
  operatorCert: ["Operator certificate", "شهادة المشغّل"],
  equipmentCert: ["Equipment certificate", "شهادة المعدة"],
};

const strField = (v: string | null | undefined, status: DraftStatus, required = false): DraftField<string> => ({
  value: v != null && String(v).trim() ? String(v) : null,
  status,
  required,
});

/** Map one agent `TermMatch` → a verifiable `TermAnswer`. yes/no → extracted; unknown → needs_verification. */
function termFromMatch(m: TermMatch): TermAnswer {
  const label = BID_TERM_LABEL[m.key]?.[0] ?? m.key;
  if (m.satisfies === "yes") return { key: m.key, label, renter_wants: m.renter_wants, answer: "yes", status: "extracted" };
  if (m.satisfies === "no") return { key: m.key, label, renter_wants: m.renter_wants, answer: "no", status: "extracted" };
  return { key: m.key, label, renter_wants: m.renter_wants, answer: null, status: "needs_verification" };
}

/**
 * Build the renter-verify draft from Mansour's raw transform output. Every field carries a `status`:
 *  - `extracted` — pulled from the quote (green, confirm)
 *  - `assumed`   — a safe default the agent guessed (amber, e.g. VAT excl)
 *  - `needs_verification` — empty/unknown, or a legal ID we always re-check (red, renter must fill)
 */
export function bidQuoteToFormDraft(bid: NormalizedBid, termMatches: TermMatch[], request?: TransformRequestCtx | null): BidFormDraft {
  const has_request = !!request;
  const hasPrice = bid.price_amount != null;

  // Company. Legal IDs (CR / VAT / National Address) are ALWAYS needs_verification even when extracted.
  const company = {
    company_name: strField(bid.supplier_name, bid.supplier_name ? "extracted" : "needs_verification", true),
    cr_number: strField(bid.supplier_cr, "needs_verification", true),
    vat_number: strField(bid.supplier_vat, "needs_verification", true),
    national_address: strField(bid.supplier_national_address, "needs_verification", true),
    contact: strField(bid.supplier_contact, bid.supplier_contact ? "extracted" : "needs_verification", true),
    valid_until: strField(bid.valid_until, bid.valid_until ? "extracted" : "needs_verification", false),
    notes: strField(bid.notes, bid.notes ? "extracted" : "needs_verification", false),
  };

  const unitsOffered = bid.units_offered ?? null;
  const item: DraftItem = {
    index: 0,
    label: bid.equipment_subtype ?? request?.subtype ?? "Equipment",
    size: bid.equipment_capacity ?? request?.capacity ?? null,
    units_requested: unitsOffered,
    units_offered: { value: unitsOffered ?? 1, status: unitsOffered != null ? "extracted" : "assumed" },
    delivery_by: null,
    return_by: null,
    item_notes: null,
    terms: termMatches.map(termFromMatch),
    pricing: {
      vat_mode: { value: "excl", status: "assumed" }, // unstated → excl, renter confirms
      rental_price: { value: bid.price_amount, status: hasPrice ? "extracted" : "needs_verification", required: true },
      delivery_price: { value: bid.mobilization_amount, status: bid.mobilization_amount != null ? "extracted" : "needs_verification" },
      return_price: { value: bid.demobilization_amount, status: bid.demobilization_amount != null ? "extracted" : "needs_verification" },
    },
  };

  const project_terms: Record<string, string> | null = has_request
    ? Object.fromEntries(
        Object.entries({
          subtype: request?.subtype, capacity: request?.capacity, location: request?.location,
          start_date: request?.start_date, end_date: request?.end_date,
        }).filter(([, v]) => v != null && String(v).trim()) as [string, string][],
      )
    : null;

  const extras = (bid.extra_terms ?? [])
    .filter((e) => e?.label != null && String(e.label).trim())
    .map((e) => ({ label: String(e.label), value: e.value != null ? String(e.value) : "", status: "extracted" as DraftStatus }));

  return {
    meta: { has_request, source_file: bid.source_file ?? null, lang_hint: undefined },
    company,
    contract_terms: [], // the transform contract carries per-item term_matches only; §2 stays empty
    project_terms,
    renter_notes: null,
    items: [item],
    extras,
  };
}

/** Assemble the renter-verified `corrected` NormalizedBid from the edited draft, over the extracted bid.
 *  The agent diffs extracted vs corrected for the learn loop (records a correction only when they differ). */
export function bidFormDraftToNormalized(draft: BidFormDraft, extracted: NormalizedBid): NormalizedBid {
  const it = draft.items[0];
  const num = (f: DraftField<number>) => (f.value != null && Number.isFinite(f.value) ? f.value : null);
  return {
    ...extracted,
    supplier_name: draft.company.company_name.value ?? extracted.supplier_name,
    supplier_cr: draft.company.cr_number.value,
    supplier_vat: draft.company.vat_number.value,
    supplier_national_address: draft.company.national_address.value,
    supplier_contact: draft.company.contact.value,
    valid_until: draft.company.valid_until.value ?? null,
    notes: draft.company.notes.value ?? extracted.notes,
    price_amount: it ? num(it.pricing.rental_price) : extracted.price_amount,
    mobilization_amount: it ? num(it.pricing.delivery_price) : extracted.mobilization_amount,
    demobilization_amount: it ? num(it.pricing.return_price) : extracted.demobilization_amount,
    units_offered: it ? num(it.units_offered) ?? extracted.units_offered : extracted.units_offered,
    // Carry the (renter-edited) extras back so the committed bid keeps every non-canonical clause.
    extra_terms: draft.extras.filter((e) => e.label && String(e.label).trim()).map((e) => ({ label: e.label, value: e.value })),
  };
}

/** Same validation the shared bid form enforces: 5 company fields + a rental price per item + every
 *  shown term answered yes/no. Gates the verify screen's submit. */
export function isBidFormDraftValid(draft: BidFormDraft): boolean {
  const c = draft.company;
  const companyOk = [c.company_name, c.cr_number, c.vat_number, c.national_address, c.contact].every((f) => !!f.value && String(f.value).trim());
  const itemsOk = draft.items.every((i) => i.pricing.rental_price.value != null && i.pricing.rental_price.value > 0);
  const termsOk = draft.items.every((i) => i.terms.every((t) => t.answer === "yes" || t.answer === "no")) && draft.contract_terms.every((t) => t.answer === "yes" || t.answer === "no");
  return companyOk && itemsOk && termsOk;
}

/** The VAT mode chosen on the draft (all items share one on this single-bid form). */
export function draftVatMode(draft: BidFormDraft): "incl" | "excl" {
  return draft.items[0]?.pricing.vat_mode.value ?? "excl";
}
