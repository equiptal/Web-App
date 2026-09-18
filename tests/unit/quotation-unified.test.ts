import { describe, it, expect } from "vitest";
import {
  buildBidQuotationDoc,
  quotationSupplierKey,
  type QuotationBidEntry,
} from "@/lib/quotation/bid-quotation";
import { renderQuotationSection, quotationLegal, type QuotationMoneyCell } from "@/lib/quotation/render";
import type { BidCard } from "@/lib/contract/bids";

/**
 * The web used to render the quotation from THREE places. Two of them are the renter's two download
 * buttons — the grouped bid view and the single-request bid view — and they disagreed: the request view
 * ran its own inline HTML builder with no parties block, no terms, no legal clauses, no reference, and,
 * worst, it added mobilisation and demobilisation to the total even after the parties EXCLUDED those
 * legs in the deal room, using the rental unit count for both regardless of each leg's own negotiated
 * count. These tests pin the unified builder that both now go through.
 *
 * ⚠️ The document is the app's `q3` template since 2026-09-18: ONE ROW PER MACHINE, with delivery and
 * return as COLUMNS rather than as sub-rows. The ARITHMETIC below did not move — every total is the
 * figure this suite has always asserted — but the shape it is read out of did.
 */

const bc = (p: Partial<BidCard>): BidCard => ({
  id: "b1", status: "PENDING", supplierId: "sup-1", supplierCompanyId: null, supplierName: "Acme Cranes",
  verified: true, rating: null, distanceKm: null, submittedAt: null, validUntil: "2026-09-01T00:00:00.000Z",
  price: 1200, mobPrice: 500, demobPrice: 400, priceUnit: "PER_DAY", duration: null,
  numberOfUnits: 3, unitsOffered: 3, openingPrice: null, lastCounterBy: null, requestChangedAt: null, liveStatus: null, reqMinYear: null,
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

/** A money cell as a comparable string: its state, or the figure it carries. */
const cell = (c: QuotationMoneyCell) => (c.kind === "amount" ? c.text : c.kind);
const ref = (doc: ReturnType<typeof build>, label: string) => doc.refs.find((r) => r.label === label)?.value;

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
  it("an excluded mobilisation leg prints the dash, not money", () => {
    const bid = bc({ mobExcluded: true });
    const doc = build([groupEntry(bid)]);

    expect(cell(doc.lineItems[0].delivery)).toBe("excluded");
    // The struck-out leg's price must appear NOWHERE in the rendered document.
    expect(renderQuotationSection(doc)).not.toContain("500.00");
  });

  it("keeps the excluded leg out of the subtotal, VAT and total", () => {
    const bid = bc({ mobExcluded: true });
    const doc = build([groupEntry(bid)]);

    // rental 1200/day × 9 BILLABLE days (10 − one Friday) × 3 units = 32,400; demob 400 × 3 = 1,200. No mob.
    expect(doc.totals.subtotal).toBe(33_600);
    expect(doc.totals.vat).toBeCloseTo(5_040, 6);
    expect(doc.totals.total).toBeCloseTo(38_640, 6);

    // The old request-view builder charged the excluded 500 anyway — this is the defect, pinned.
    expect(legacyRequestViewTotal(bid)).toBe(4_500); // 1200×1×3 + 500 + 400, mob included
    expect(doc.totals.subtotal).not.toBe(legacyRequestViewTotal(bid));
  });

  it("excludes each leg independently", () => {
    const both = build([groupEntry(bc({ mobExcluded: true, demobExcluded: true }))]);
    expect(cell(both.lineItems[0].delivery)).toBe("excluded");
    expect(cell(both.lineItems[0].ret)).toBe("excluded");
    expect(both.totals.subtotal).toBe(32_400); // rental only — 1200 × 9 billable days × 3 units

    const demobOnly = build([groupEntry(bc({ demobExcluded: true }))]);
    expect(cell(demobOnly.lineItems[0].delivery)).toBe("500.00"); // the per-unit price, still charged
    expect(cell(demobOnly.lineItems[0].ret)).toBe("excluded");
    expect(demobOnly.totals.subtotal).toBe(33_900); // 32,400 + 500 × 3
  });

  it("exclusion beats a price still stored against the leg", () => {
    // The deal room strikes a leg out without clearing its price — the old builder read the price and
    // billed it. Exclusion is checked first, so the stored 500 is never reached.
    const doc = build([groupEntry(bc({ mobPrice: 500, mobExcluded: true }))]);
    expect(cell(doc.lineItems[0].delivery)).toBe("excluded");
    expect(doc.totals.subtotal).toBe(33_600);
  });
});

describe("per-leg unit counts are honoured", () => {
  /* ⚠️ The COLUMN states the per-unit price; the negotiated trip count is folded into the row's total,
     because q3 gives transport one cell per leg and no quantity of its own. The counts are therefore
     asserted on the money they produce, which is the half a renter is held to. */
  it("a leg with its own negotiated count uses it, not the rental count", () => {
    // 3 units rented, but the parties agreed the supplier delivers only 1 of them.
    const doc = build([groupEntry(bc({ mobUnits: 1 }))]);
    expect(cell(doc.lineItems[0].delivery)).toBe("500.00"); // per unit, as the column says
    // rental 32,400 + mob 500 × 1 + demob 400 × 3
    expect(doc.totals.subtotal).toBe(34_100);
  });

  it("does NOT cap a leg count at the rental count — the app charges what was negotiated", () => {
    // `effectiveMobUnits` has no clamp, so a leg carrying more trips than machines bills all of them.
    const doc = build([groupEntry(bc({ mobUnits: 9, demobExcluded: true }))]);
    expect(doc.totals.subtotal).toBe(32_400 + 4_500);
  });

  it("defaults an un-negotiated leg to the rental count (the un-negotiated bid is unchanged)", () => {
    const doc = build([groupEntry(bc({}))]);
    expect(cell(doc.lineItems[0].delivery)).toBe("500.00");
    expect(cell(doc.lineItems[0].ret)).toBe("400.00");
    expect(doc.totals.subtotal).toBe(35_100); // 32,400 + 1,500 + 1,200
  });

  /* 🔴 THREE cell states, never two. A leg the REQUEST put on the renter is not the supplier's to
     price, so it is a dash; a leg the supplier simply never priced says so. Collapsing them would tell
     a renter a price is still coming when it never was — and a `0` would say the trip is free. */
  it("tells a leg that is not the supplier's from one nobody priced", () => {
    const byRentee = build([groupEntry(bc({ mobPrice: 0 }), { mobByRentee: true })]);
    expect(cell(byRentee.lineItems[0].delivery)).toBe("excluded");

    const nobodyPriced = build([groupEntry(bc({ mobPrice: 0 }), { mobByRentee: false })]);
    expect(cell(nobodyPriced.lineItems[0].delivery)).toBe("unpriced");
    expect(renderQuotationSection(nobodyPriced)).toContain("Not priced");
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

  it("prints both parties, the company first and the person as a labelled row", () => {
    expect(html).toContain("SUPPLIER");
    expect(html).toContain("Acme Cranes");
    expect(html).toContain("RENTER");
    expect(html).toContain("Wadi Contracting"); // company primary
    expect(html).toContain("Yara F"); // the person, on a row of his own
    expect(html).toContain("1010101010"); // the CR value
  });

  /* 🔴 The tick, and never a pill standing in for a number. A quotation is filed with a renter's own
     accounts and forwarded to his client, and «✓ Verified» where the C.R. should be is not a number
     anyone can check — so a registration that is simply not on the payload prints no row at all. */
  it("carries verification as a tick beside the name, not as a value", () => {
    expect(html).toContain("q-tick");
    expect(html).not.toContain("pill-ver");
  });

  it("prints all five legal clauses", () => {
    const clauses = quotationLegal((en: string) => en);
    expect(clauses).toHaveLength(5);
    for (const c of clauses) expect(html).toContain(c.slice(0, 60));
  });

  it("prints the quotation reference — a document that can be cited in a dispute", () => {
    expect(html).toContain("Q-REQ-00042-ACM1");
    expect(html).toContain("REQ-00042"); // the request line, in the reference strip
  });

  it("states the supplier's own terms as sentences, not as a key/value dump", () => {
    expect(html).toContain("Payment terms Net 30 days");
    expect(html).toContain("A formal purchase order is issued on approval");
    // The machine's own specs ride in the table's description column.
    expect(html).toContain("<b>Model:</b> 320");
    expect(html).toContain("<b>Manufacturer:</b> Cat");
  });

  it("defaults the request reference to the codes it covers, and takes an RFQ override", () => {
    expect(ref(build([groupEntry(bc({}))]), "REQUEST")).toBe("REQ-00042");
    const multi = build([groupEntry(bc({}), { requestCode: "REQ-1" }), groupEntry(bc({ id: "b2" }), { requestCode: "REQ-2" })]);
    expect(ref(multi, "REQUEST")).toBe("REQ-1 +1");
    const grouped = build([groupEntry(bc({}))], { reference: "RFQ-00007" });
    expect(ref(grouped, "REQUEST")).toBe("RFQ-00007");
  });
});

describe("the terms ladder: locked beats a counter beats the declaration beats the request", () => {
  /* The app's own resolution (`_clausesForBid`), so a clause can never state a term the deal room
     contradicts — and «Agreed» marks the settled ones, which is `lockedTerms` and never the room's
     soft-accepted set. */
  const withTerms = (p: Partial<BidCard>) => build([groupEntry(bc(p))]);

  it("prints the SETTLED value and marks it agreed", () => {
    const doc = withTerms({
      lockedTerms: [{ key: "payment_terms", value: "net_90" }],
      counters: [{ key: "payment_terms", value: "net_60" }],
      t3Declarations: { payment_terms: "net_0" },
    });
    const pay = doc.clauses.find((c) => c.title === "Payment")!;
    expect(pay.body).toContain("Net 90 days");
    expect(pay.agreed).toBe(true);
  });

  it("falls to the counter, then the declaration, then the request — unmarked each time", () => {
    const counter = withTerms({ counters: [{ key: "payment_terms", value: "net_60" }], t3Declarations: { payment_terms: "net_0" } });
    expect(counter.clauses.find((c) => c.title === "Payment")!.body).toContain("Net 60 days");
    expect(counter.clauses.find((c) => c.title === "Payment")!.agreed).toBe(false);

    const declared = withTerms({ t3Declarations: { payment_terms: "net_0" } });
    expect(declared.clauses.find((c) => c.title === "Payment")!.body).toContain("Net 0");

    // Nothing declared and nothing settled: the REQUEST's own side, which the fixture sets to NET-30.
    expect(withTerms({}).clauses.find((c) => c.title === "Payment")!.body).toContain("Net 30 days");
  });

  /* 🔴 NO TERM MAY BE MISSING (owner, 2026-09-18). A term nobody wrote a sentence for used to fall off
     the document entirely — including terms the two sides had settled. */
  it("sweeps up every other term the room holds, agreed ones first", () => {
    const doc = withTerms({
      lockedTerms: [{ key: "working_hours", value: "10" }],
      t3Declarations: { insurance: "supplier", working_hours: "8" },
    });
    const swept = doc.clauses.filter((c) => c.title === "Working Hours" || c.title === "Insurance");
    expect(swept.map((c) => c.title)).toEqual(["Working Hours", "Insurance"]); // settled first
    expect(swept[0].body).toBe("10"); // the locked value, not the declared 8
    expect(swept[0].agreed).toBe(true);
    expect(swept[1].agreed).toBe(false);
  });

  it("never prints a retired or priced term key", () => {
    const doc = withTerms({
      lockedTerms: [{ key: "PRICE", value: "1200" }, { key: "overtime_rate", value: "1.5x" }],
      t3Declarations: { mobilization_pricing: "500", offer_duration: "7" },
    });
    const titles = doc.clauses.map((c) => c.title);
    expect(titles).not.toContain("Price");
    expect(titles).not.toContain("Overtime Rate");
    expect(titles).not.toContain("Mobilization Pricing");
  });

  it("states which transport legs the price actually covers", () => {
    const both = withTerms({}).clauses.find((c) => c.title === "Transport")!;
    expect(both.body).toBe("The price covers delivery to site and return from it");
    const none = build([groupEntry(bc({ mobExcluded: true, demobExcluded: true }))]).clauses.find((c) => c.title === "Transport")!;
    expect(none.body).toContain("are the renter's responsibility");
  });
});

describe("the leg maths leaves an un-negotiated bid's legs where they were", () => {
  // An un-negotiated bid carries no exclusion and no per-leg counts, so the shared leg maths is
  // arithmetically identical to the old `price × units` — moving the grouped download onto it does not
  // move the transport charges. The RENTAL did move, and deliberately: see below.
  it("prices a multi-item supplier group across both bids", () => {
    const doc = build([
      groupEntry(bc({ id: "b1", price: 1000, priceUnit: "PER_DAY", mobPrice: 300, demobPrice: 200, unitsOffered: 2, numberOfUnits: 2 })),
      groupEntry(bc({ id: "b2", price: 5000, priceUnit: "PER_WEEK", mobPrice: 0, demobPrice: 0, unitsOffered: 1, numberOfUnits: 1 }), { requestCode: "REQ-00043", itemLabel: "Loader · 5 ton" }),
    ]);
    // b1: 1000 × 9 billable days × 2 units = 18,000 + (300 + 200) × 2 = 1,000 → 19,000
    // b2: 5000 ÷ 6 × 9 billable days × 1 unit = 7,500, legs 0
    expect(doc.totals.subtotal).toBeCloseTo(19_000 + (5000 / 6) * 9, 6);
    expect(doc.lineItems).toHaveLength(2); // ONE row per machine, legs in their own columns
    expect(doc.lineItems[1].equipment).toBe("Loader");
  });

  it("prints the rental exactly as the bid card does — raw per-unit rate, charged days, divisor", () => {
    const doc = build([groupEntry(bc({ price: 30_000, priceUnit: "PER_MONTH", mobPrice: 0, demobPrice: 0, unitsOffered: 2, numberOfUnits: 2 }))]);
    const row = doc.lineItems[0];

    // The RENTAL column: the supplier's RAW quoted rate, per unit — never a derived per-day figure.
    expect(cell(row.rental)).toBe("30,000.00");
    expect(row.units).toBe("2");
    expect(row.duration).toBe("Monthly");
    // The days actually charged (10 − one Friday) and the divisor that turns the rate into them. The
    // table has no quantity column, so this note is the only place either fact is stated.
    expect(row.totalNote).toBe("9 days · 26 working days/month");
    // TOTAL: (30,000 ÷ 26) × 9 × 2 — Fridays out, and every unit's rent in.
    expect(row.total).toBe("20,769.23");
    expect(doc.totals.subtotal).toBeCloseTo((30_000 / 26) * 9 * 2, 6);
  });

  it("charges every unit's rent, not one unit's beside all-units transport", () => {
    // The defect this replaced: the rental row priced ONE machine while the legs beside it were already
    // multiplied by the unit count, so the grand total was neither per-unit nor the whole deal.
    const one = build([groupEntry(bc({ price: 1000, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0, unitsOffered: 1, numberOfUnits: 1 }))]);
    const three = build([groupEntry(bc({ price: 1000, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0, unitsOffered: 3, numberOfUnits: 3 }))]);
    expect(three.totals.subtotal).toBe(one.totals.subtotal * 3);
  });

  it("charges a PER_JOB bid over the calendar window, as the app's fallback does", () => {
    // NOT flat. PER_JOB fell out of the app's divisor lookup when it was retired, landing on
    // `rate × durationDays × units` — 10 calendar days here, Fridays included.
    const doc = build([groupEntry(bc({ price: 7_700, priceUnit: "PER_JOB", mobPrice: 0, demobPrice: 0, unitsOffered: 2, numberOfUnits: 2 }))]);
    expect(doc.lineItems[0].duration).toBe("Per job");
    expect(doc.lineItems[0].totalNote).toBe("10 days");
    expect(doc.totals.subtotal).toBe(154_000);
  });

  it("falls back to one full period, never a Friday-blind proration, with no start date", () => {
    // No start date ⇒ the Fridays cannot be located ⇒ the bare quoted rate (mobile §3), NOT rate × days.
    const doc = build([groupEntry(bc({ price: 5_000, priceUnit: "PER_WEEK", mobPrice: 0, demobPrice: 0, unitsOffered: 1, numberOfUnits: 1 }), { startDate: null })]);
    expect(doc.lineItems[0].totalNote).toContain("1 week");
    expect(doc.totals.subtotal).toBe(5_000);
  });

  it("still reframes an open-ended bid as a per-period rate", () => {
    const doc = build([groupEntry(bc({ price: 900, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0 }), { durationDays: null })]);
    expect(doc.lineItems[0].totalNote).toBe("As operated");
    expect(doc.lineItems[0].total).toBe("900.00 / day");
    expect(doc.totals.label).toBe("Total / unit · day");
    expect(doc.totals.valueOverride).toBe("900.00 SAR");
    expect(doc.amountWordsSuffix).toContain("as operated");
  });
});
