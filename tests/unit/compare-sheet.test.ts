import { describe, expect, it } from "vitest";
import { buildCompareSheet, type SheetMoneyCol } from "@/lib/export/compare-sheet";
import type { BidCard, TermRow } from "@/lib/contract/bids";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import { en } from "@/lib/i18n/en";

/**
 * The printed comparison (owner, 2026-09-09): *"i wanna the export template for compare table to be
 * as full table with all but grouped by section price or terms but showing moedatech logo at top and
 * showing green and red too"*.
 *
 * It replaced a four-column sheet — supplier, rate, transport, grand total — that carried none of
 * the terms the renter had spent the afternoon reading, and none of the verdicts he was choosing by.
 */
const term = (key: string, labelEn: string, value: string | null, extra?: Partial<TermRow>): TermRow => ({
  key,
  labelEn,
  labelAr: labelEn,
  state: "matched",
  value,
  ...extra,
});

const bc = (p: Partial<BidCard>): BidCard =>
  ({
    id: "b", status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName: "S", verified: false,
    rating: null, distanceKm: null, submittedAt: null, validUntil: null, price: 1000, mobPrice: null,
    demobPrice: null, priceUnit: "PER_MONTH", duration: null, numberOfUnits: 1, unitsOffered: 1,
    openingPrice: null, lastCounterBy: null, requestChangedAt: null, liveStatus: null, reqMinYear: null,
    equipment: null, eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false, note: null, requiredCerts: [],
    heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
    terms: { equipment: [], contract: [], supplier: [] },
    ...p,
  }) as BidCard;

const wb = (card: BidCard, source: "app" | "offline" = "app"): WorkspaceBid => ({ card, source }) as WorkspaceBid;

const rate: SheetMoneyCol = { label: "Rate", cell: (b) => (b.card.price == null ? null : `${b.card.price} SAR`), win: "b1" };
const total: SheetMoneyCol = { label: "Delivered cost", sub: "for one cycle", cell: () => "9,000 SAR" };

function sheet(bids?: WorkspaceBid[]) {
  return buildCompareSheet({
    bids: bids ?? [
      wb(bc({
        id: "b1",
        supplierName: "Al Faisal",
        terms: {
          equipment: [],
          contract: [
            term("payment_terms", "Payment", "net_30", { renteeValue: "net_30" }),
            term("fuel_responsibility", "Fuel", "supplier", { renteeValue: "supplier" }),
          ],
          supplier: [],
        },
      })),
      wb(bc({
        id: "link-s1",
        supplierName: "Al Jazira",
        price: 1400,
        terms: {
          equipment: [],
          contract: [
            // Refused, with no counter-value: the sheet must SAY so, not tint an identical word.
            term("payment_terms", "Payment", null, { renteeValue: "net_30", state: "conflict" }),
            term("fuel_responsibility", "Fuel", "supplier", { renteeValue: "supplier" }),
          ],
          supplier: [],
        },
      }), "offline"),
    ],
    ar: false,
    t: en,
    L: (e) => e,
    title: "Crawler excavator · 20 ton",
    subtitle: "Riyadh · RFQ-10021",
    logoUrl: "https://web.example/moedatech-logo.svg",
    perCycle: [rate],
    grandTotal: [total],
  });
}

describe("the printed comparison carries the whole table", () => {
  it("draws the three section bands, each spanning its own columns", () => {
    const html = sheet();
    // The bands are the screen's own: money in two halves, then the terms.
    expect(html).toContain(`colspan="1" class="band">${en.workspace.perCycle}`);
    expect(html).toContain(`class="band"`);
    expect(html).toContain(en.workspace.groupTerms);
    // Two term columns were earned by the fixture, so the terms band spans two.
    expect(html).toMatch(/colspan="2" class="band">Terms/);
  });

  it("carries every TERM column, which the four-column sheet had none of", () => {
    const html = sheet();
    expect(html).toContain("Payment");
    expect(html).toContain("Fuel");
  });

  it("prints the money under its own heads, and marks the cheapest", () => {
    const html = sheet();
    expect(html).toContain("Rate");
    expect(html).toContain("Delivered cost");
    // The sub-line rides under the head rather than being appended to it.
    expect(html).toContain('<span class="sub">for one cycle</span>');
    expect(html).toContain('class="num win"');
  });

  it("says green and red with a CLASS, so the same verdict prints as it renders", () => {
    const html = sheet();
    expect(html).toContain('class="good"');
    expect(html).toContain('class="bad"');
    // The refusal is said as well as tinted: a sheet may be read in black and white.
    expect(html).toContain("✗ ");
  });

  it("puts the Moedatech logo at the top, on an ABSOLUTE url", () => {
    const html = sheet();
    expect(html).toContain('<img class="logo" src="https://web.example/moedatech-logo.svg"');
    // It sits in the header block, above the table.
    expect(html.indexOf("logo")).toBeLessThan(html.indexOf("<table"));
  });

  it("carries the palette in the DOCUMENT, because a blank window inherits none", () => {
    const html = sheet();
    // The old sheet wrote `var(--navy)` with nothing defining it and printed browser defaults.
    expect(html).toContain(":root{");
    expect(html).toContain("--ok-soft:");
    expect(html).toContain("--danger-soft:");
  });

  it("names each row's source, and says «Didn't say» rather than 0 for an unstated figure", () => {
    const html = sheet([
      wb(bc({ id: "b1", supplierName: "Al Faisal", price: null, terms: { equipment: [], contract: [term("payment_terms", "Payment", "net_30", { renteeValue: "net_30" })], supplier: [] } })),
      wb(bc({ id: "link-s1", supplierName: "Al Jazira", terms: { equipment: [], contract: [term("payment_terms", "Payment", "net_60", { renteeValue: "net_30" })], supplier: [] } }), "offline"),
    ]);
    expect(html).toContain(en.workspace.sourceApp);
    expect(html).toContain(en.workspace.offlineInvite);
    // A rate the bid never stated is a blank, never a zero — on paper 0 SAR reads as free.
    expect(html).toContain(`class="q">${en.workspace.didntSay}`);
  });

  it("escapes what it prints — a supplier name is not markup", () => {
    const html = sheet([
      wb(bc({ id: "b1", supplierName: '<script>x</script>', terms: { equipment: [], contract: [term("payment_terms", "Payment", "net_30", { renteeValue: "net_30" })], supplier: [] } })),
    ]);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("draws the legend, because the colours cannot explain themselves on paper", () => {
    expect(sheet()).toContain(en.workspace.exportLegend);
  });
});
