import { describe, it, expect } from "vitest";
import { bidQuoteToFormDraft, bidFormDraftToNormalized, isBidFormDraftValid } from "@/lib/contract/bid-form";
import type { NormalizedBid, TermMatch } from "@/lib/contract/agent-bids";

const bid = (o: Partial<NormalizedBid> = {}): NormalizedBid => ({
  bid_id: null, source: "uploaded_quote", supplier_name: "Gulf Co", supplier_user_id: null,
  price_amount: 500, price_unit: "PER_DAY", mobilization_amount: 200, demobilization_amount: null,
  currency: "SAR", cost_responsibilities: {}, equipment_subtype: "Forklift", equipment_capacity: "3 ton",
  equipment_year: 2021, equipment_condition: null, fuel_type: "diesel", certificates: [],
  type_size_match: "exact", type_size_note: null, valid_until: null, source_file: "quote.pdf", notes: null,
  supplier_cr: "1010", supplier_vat: "3001", supplier_national_address: "Riyadh 12345", supplier_contact: "0500000000",
  units_offered: 2, ...o,
});

describe("bidQuoteToFormDraft", () => {
  it("with request: pre-answers terms from term_matches (yes/no → extracted, unknown → needs_verification)", () => {
    const tm: TermMatch[] = [
      { key: "year", renter_wants: "2021", satisfies: "yes" },
      { key: "fuelType", renter_wants: "diesel", satisfies: "no" },
      { key: "operator", renter_wants: "true", satisfies: "unknown" },
    ];
    const d = bidQuoteToFormDraft(bid(), tm, { subtype: "Forklift", terms: { year: 2021 } });
    expect(d.meta.has_request).toBe(true);
    expect(d.project_terms).not.toBeNull();
    const t = (k: string) => d.items[0].terms.find((x) => x.key === k);
    expect(t("year")).toMatchObject({ answer: "yes", status: "extracted" });
    expect(t("fuelType")).toMatchObject({ answer: "no", status: "extracted" });
    expect(t("operator")).toMatchObject({ answer: null, status: "needs_verification" });
  });

  it("legal IDs (cr/vat/national address) are ALWAYS needs_verification even when extracted", () => {
    const d = bidQuoteToFormDraft(bid(), [], null);
    expect(d.company.cr_number.value).toBe("1010");
    expect(d.company.cr_number.status).toBe("needs_verification");
    expect(d.company.vat_number.status).toBe("needs_verification");
    expect(d.company.national_address.status).toBe("needs_verification");
    expect(d.company.company_name).toMatchObject({ value: "Gulf Co", status: "extracted" });
    expect(d.company.contact.status).toBe("extracted");
  });

  it("bare quote (no request): has_request false, null project/notes, unknown terms → needs_verification", () => {
    const tm: TermMatch[] = [{ key: "year", renter_wants: null, satisfies: "unknown" }];
    const d = bidQuoteToFormDraft(bid(), tm, undefined);
    expect(d.meta.has_request).toBe(false);
    expect(d.project_terms).toBeNull();
    expect(d.renter_notes).toBeNull();
    expect(d.items[0].terms[0]).toMatchObject({ answer: null, status: "needs_verification" });
  });

  it("vat_mode defaults to excl + assumed; rental extracted; missing price → needs_verification", () => {
    const d = bidQuoteToFormDraft(bid(), [], null);
    expect(d.items[0].pricing.vat_mode).toMatchObject({ value: "excl", status: "assumed" });
    expect(d.items[0].pricing.rental_price).toMatchObject({ value: 500, status: "extracted" });
    const d2 = bidQuoteToFormDraft(bid({ price_amount: null }), [], null);
    expect(d2.items[0].pricing.rental_price.status).toBe("needs_verification");
  });
});

describe("isBidFormDraftValid + bidFormDraftToNormalized", () => {
  it("valid when company + rental + every term filled; corrected carries the edits", () => {
    const tm: TermMatch[] = [{ key: "year", renter_wants: "2021", satisfies: "yes" }];
    const d = bidQuoteToFormDraft(bid(), tm, { subtype: "Forklift" });
    expect(isBidFormDraftValid(d)).toBe(true);
    const corrected = bidFormDraftToNormalized(d, bid());
    expect(corrected.supplier_cr).toBe("1010");
    expect(corrected.price_amount).toBe(500);
    expect(corrected.units_offered).toBe(2);
  });

  it("invalid when a term is unanswered", () => {
    const tm: TermMatch[] = [{ key: "operator", renter_wants: "true", satisfies: "unknown" }];
    const d = bidQuoteToFormDraft(bid(), tm, null);
    expect(isBidFormDraftValid(d)).toBe(false);
  });
});
