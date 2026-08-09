import { describe, it, expect } from "vitest";
import {
  buildBidQuotationDoc,
  quotationSupplierKey,
  type QuotationBidEntry,
} from "@/lib/quotation/bid-quotation";
import { renderQuotationSection, quotationLegal } from "@/lib/quotation/render";
import type { BidCard } from "@/lib/contract/bids";

/**
 * The web used to render the quotation from THREE places. Two of them are the renter's two download
 * buttons — the grouped bid view and the single-request bid view — and they disagreed: the request view
 * ran its own inline HTML builder with no parties block, no terms, no legal clauses, no reference, and,
 * worst, it added mobilisation and demobilisation to the total even after the parties EXCLUDED those
 * legs in the deal room, using the rental unit count for both regardless of each leg's own negotiated
 * count. These tests pin the unified builder that both now go through.
 */

const bc = (p: Partial<BidCard>): BidCard => ({
  id: "b1", status: "PENDING", supplierId: "sup-1", supplierCompanyId: null, supplierName: "Acme Cranes",
  verified: true, rating: null, distanceKm: null, submittedAt: null, validUntil: "2026-09-01T00:00:00.000Z",
  price: 1200, mobPrice: 500, demobPrice: 400, priceUnit: "PER_DAY", duration: null,
  numberOfUnits: 3, unitsOffered: 3, reqMinYear: null,
  equipment: { id: "e1", make: "Cat", model: "320", year: 2022, imageUrl: null }, eqVerified: true,
  compliance: { entityType: "company", activityLicense: true, taxNumber: true, nationalAddress: true, safety: true, saso: false, localContent: false },
  matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
  note: null, requiredCerts: [], heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
  terms: { equipment: [], contract: [], supplier: [] },
  requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: "NET-30", breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
  lockedTerms: [], unreadTerms: [], progress: { agreed: 0, total: 0 }, lastEventAr: null, round: 1,
  uiState: null,
  ...p,
});

const RENTEE = {
  companyName: "Wadi Contracting",
  personName: "Yara F",
  crNumber: "1010101010",
  vatNumber: null,
  nationalAddress: null,
  phone: "+966511111111",
  email: "yara@example.com",
  verified: true,
};

const NOW = new Date("2026-08-09T09:00:00.000Z");

/** The entry the GROUPED bid view builds: a supplier's bid plus its request line's context. */
const groupEntry = (bid: BidCard, over: Partial<QuotationBidEntry> = {}): QuotationBidEntry => ({
  bid,
  itemLabel: "Excavator · 20 ton",
  requestCode: "REQ-00042",
  startDate: "2026-09-01",
  endDate: "2026-09-11",
  durationDays: 10,
  rentalType: "DAILY",
  mobByRentee: false,
  demobByRentee: false,
  ...over,
});

const build = (entries: QuotationBidEntry[], over: Partial<Parameters<typeof buildBidQuotationDoc>[0]> = {}) =>
  buildBidQuotationDoc({
    lang: "en",
    entries,
    quotationNumber: "Q-REQ-00042-ACM1",
    reference: null,
    rentee: RENTEE,
    now: NOW,
    ...over,
  });

/** The row the document prints for one transport leg. */
const legRow = (doc: ReturnType<typeof build>, label: string) => doc.lineItems.find((l) => l.label === label)!;

/**
 * The arithmetic the request view's inline builder used, reproduced here as the regression witness.
 * Every assertion below that says "not this" is describing a document renters actually received.
 */
const legacyRequestViewTotal = (b: BidCard) => {
  const periods = b.duration ?? 1;
  const units = b.numberOfUnits || 1;
  const rental = (b.price ?? 0) * periods * units;
  return rental + (b.mobPrice ?? 0) + (b.demobPrice ?? 0); // legs added unconditionally
};

describe("excluded transport legs never print as a charge", () => {
  it("an excluded mobilisation leg prints 'Excluded', not money", () => {
    const bid = bc({ mobExcluded: true });
    const doc = build([groupEntry(bid)]);
    const mob = legRow(doc, "Delivery to site");

    expect(mob.total).toBe("Excluded");
    expect(mob.price).toBe("—");
    expect(mob.qty).toBe("—");
    // The struck-out leg's price must appear NOWHERE in the rendered document.
    expect(renderQuotationSection(doc)).not.toContain("500.00");
  });

  it("keeps the excluded leg out of the subtotal, VAT and total", () => {
    const bid = bc({ mobExcluded: true });
    const doc = build([groupEntry(bid)]);

    // rental 1200/day × 10 days (per unit, app parity) = 12,000; demob 400 × 3 units = 1,200. No mob.
    expect(doc.totals.subtotal).toBe(13_200);
    expect(doc.totals.vat).toBeCloseTo(1_980, 6);
    expect(doc.totals.total).toBeCloseTo(15_180, 6);

    // The old request-view builder charged the excluded 500 anyway — this is the defect, pinned.
    expect(legacyRequestViewTotal(bid)).toBe(4_500); // 1200×1×3 + 500 + 400, mob included
    expect(doc.totals.subtotal).not.toBe(legacyRequestViewTotal(bid));
  });

  it("excludes each leg independently", () => {
    const both = build([groupEntry(bc({ mobExcluded: true, demobExcluded: true }))]);
    expect(legRow(both, "Delivery to site").total).toBe("Excluded");
    expect(legRow(both, "Return from site").total).toBe("Excluded");
    expect(both.totals.subtotal).toBe(12_000); // rental only

    const demobOnly = build([groupEntry(bc({ demobExcluded: true }))]);
    expect(legRow(demobOnly, "Delivery to site").total).toBe("1,500.00"); // 500 × 3 units, still charged
    expect(legRow(demobOnly, "Return from site").total).toBe("Excluded");
  });

  it("exclusion beats a price still stored against the leg", () => {
    // The deal room strikes a leg out without clearing its price — the old builder read the price and
    // billed it. Exclusion is checked first, so the stored 500 is never reached.
    const doc = build([groupEntry(bc({ mobPrice: 500, mobExcluded: true }))]);
    expect(legRow(doc, "Delivery to site").total).toBe("Excluded");
  });

  it("says 'Excluded' in Arabic too", () => {
    const doc = build([groupEntry(bc({ mobExcluded: true }))], { lang: "ar" });
    expect(legRow(doc, "النقل إلى الموقع").total).toBe("مستبعد");
  });
});

describe("per-leg unit counts are honoured", () => {
  it("a leg with its own negotiated count uses it, not the rental count", () => {
    // 3 units rented, but the parties agreed the supplier delivers only 1 of them.
    const doc = build([groupEntry(bc({ mobUnits: 1 }))]);
    const mob = legRow(doc, "Delivery to site");

    expect(mob.qty).toBe("1");
    expect(mob.total).toBe("500.00"); // 500 × 1, NOT 500 × 3
    // rental 12,000 + mob 500 + demob 400×3
    expect(doc.totals.subtotal).toBe(13_700);
  });

  it("caps a leg count at the rental count — you can't mobilise more than you rent", () => {
    const doc = build([groupEntry(bc({ mobUnits: 9 }))]);
    expect(legRow(doc, "Delivery to site").qty).toBe("3");
    expect(legRow(doc, "Delivery to site").total).toBe("1,500.00");
  });

  it("defaults an un-negotiated leg to the rental count (the un-negotiated bid is unchanged)", () => {
    const doc = build([groupEntry(bc({}))]);
    expect(legRow(doc, "Delivery to site").qty).toBe("3");
    expect(legRow(doc, "Delivery to site").total).toBe("1,500.00");
    expect(legRow(doc, "Return from site").total).toBe("1,200.00");
    expect(doc.totals.subtotal).toBe(14_700); // 12,000 + 1,500 + 1,200
  });

  it("an unpriced leg still prints its reason rather than vanishing", () => {
    const byRentee = build([groupEntry(bc({ mobPrice: 0 }), { mobByRentee: true })]);
    expect(legRow(byRentee, "Delivery to site").total).toBe("By rentee");

    const included = build([groupEntry(bc({ mobPrice: 0 }), { mobByRentee: false })]);
    expect(legRow(included, "Delivery to site").total).toBe("Included");
  });
});

describe("both entry points produce the same document for the same deal", () => {
  // The grouped view passes a supplier's bids with their request lines; the single-request view passes
  // exactly one. Same bid, same request context → the documents must be indistinguishable.
  const bid = bc({ mobExcluded: true, demobUnits: 2 });

  const fromGroupView = build([groupEntry(bid)]);
  const fromRequestView = build([
    {
      bid,
      itemLabel: "Excavator · 20 ton",
      requestCode: "REQ-00042",
      startDate: "2026-09-01",
      endDate: "2026-09-11",
      durationDays: 10,
      rentalType: "DAILY",
      mobByRentee: false,
      demobByRentee: false,
    },
  ]);

  it("agrees on every figure", () => {
    expect(fromRequestView.totals).toEqual(fromGroupView.totals);
    expect(fromRequestView.lineItems).toEqual(fromGroupView.lineItems);
  });

  it("agrees on the whole rendered document, byte for byte", () => {
    expect(renderQuotationSection(fromRequestView)).toBe(renderQuotationSection(fromGroupView));
  });

  it("cuts documents by the same supplier key", () => {
    expect(quotationSupplierKey(bc({ supplierId: "sup-1" }))).toBe("sup-1");
    // A supplier with no account id still groups — by name — instead of collapsing to one document.
    expect(quotationSupplierKey(bc({ supplierId: null, supplierName: "Nafisa Rentals" }))).toBe("Nafisa Rentals");
  });
});

describe("the document carries the content the request view used to omit", () => {
  const html = renderQuotationSection(build([groupEntry(bc({}))]));

  it("prints the parties block — both sides, with their identity rows", () => {
    expect(html).toContain("Supplier");
    expect(html).toContain("Acme Cranes");
    expect(html).toContain("Rentee");
    expect(html).toContain("Wadi Contracting"); // company primary
    expect(html).toContain("Yara F"); // person demoted to the subtitle
    expect(html).toContain("1010101010"); // CR value
    expect(html).toContain("pill-ver"); // value-less rows fall back to the "Verified" pill
  });

  it("prints all five legal clauses", () => {
    const clauses = quotationLegal((en: string) => en);
    expect(clauses).toHaveLength(5);
    for (const c of clauses) expect(html).toContain(c.slice(0, 60));
  });

  it("prints the quotation reference — a document that can be cited in a dispute", () => {
    expect(html).toContain("Q-REQ-00042-ACM1");
    expect(html).toContain("REQ-00042"); // the request line, in the Project-terms card
  });

  it("prints the terms cards and the listed equipment", () => {
    expect(html).toContain("Project terms");
    expect(html).toContain("Contract terms");
    expect(html).toContain("Net 30 days");
    expect(html).toContain("Listed equipment");
  });

  it("defaults the Request # to the request codes it covers, and takes an RFQ override", () => {
    expect(build([groupEntry(bc({}))]).meta.find((m) => m.label === "Request #")!.value).toBe("REQ-00042");
    const multi = build([groupEntry(bc({}), { requestCode: "REQ-1" }), groupEntry(bc({ id: "b2" }), { requestCode: "REQ-2" })]);
    expect(multi.meta.find((m) => m.label === "Request #")!.value).toBe("REQ-1 +1");
    const grouped = build([groupEntry(bc({}))], { reference: "RFQ-00007" });
    expect(grouped.meta.find((m) => m.label === "Request #")!.value).toBe("RFQ-00007");
  });
});

describe("the grouped view's document is unchanged where nothing was negotiated", () => {
  // Every assertion here is the behaviour BEFORE unification. An un-negotiated bid carries no exclusion
  // and no per-leg counts, so the shared leg maths is arithmetically identical to the old `price × units`
  // — which is why moving the grouped download onto it does not move the document renters already get.
  it("prices a multi-item supplier group exactly as before", () => {
    const doc = build([
      groupEntry(bc({ id: "b1", price: 1000, priceUnit: "PER_DAY", mobPrice: 300, demobPrice: 200, unitsOffered: 2, numberOfUnits: 2 })),
      groupEntry(bc({ id: "b2", price: 5000, priceUnit: "PER_WEEK", mobPrice: 0, demobPrice: 0, unitsOffered: 1, numberOfUnits: 1 }), { requestCode: "REQ-00043", itemLabel: "Loader · 5 ton" }),
    ]);
    // b1: 1000 × 10 days = 10,000 + (300 + 200) × 2 = 1,000 → 11,000
    // b2: 5000 ÷ 6 × 10 days = 8,333.33… , legs 0
    expect(doc.totals.subtotal).toBeCloseTo(11_000 + (5000 / 6) * 10, 6);
    expect(doc.lineItems.filter((l) => l.num != null)).toHaveLength(2); // one numbered rental row per bid
    expect(doc.lineItems).toHaveLength(6); // + two leg rows each
  });

  it("still reframes an open-ended bid as a per-period rate", () => {
    const doc = build([groupEntry(bc({ price: 900, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0 }), { durationDays: null })]);
    expect(doc.lineItems[0].qty).toBe("∞");
    expect(doc.lineItems[0].totalNote).toBe("As operated");
    expect(doc.totals.label).toBe("Total / unit · day");
    expect(doc.totals.valueOverride).toBe("900.00 SAR");
    expect(doc.amountWordsSuffix).toContain("as operated");
  });
});
