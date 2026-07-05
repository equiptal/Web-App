import { describe, it, expect } from "vitest";
import { renderQuotationSection, wrapQuotationPage, quotationLegal, type QuotationDoc } from "@/lib/quotation/render";
import { quotationDownloadName } from "@/lib/compare/quotation-token";

const L = (en: string) => en;

/** A bid-card-style quotation (multi line items + terms cards). */
function bidDoc(): QuotationDoc {
  return {
    lang: "en",
    title: "Equipment rental quotation",
    quotationNumber: "Q-REQ-1-SUP1",
    dateStr: "5 July 2026",
    supplier: {
      label: "Supplier",
      name: "Acme Cranes",
      idRows: [
        { label: "CR #", value: "1010101010" },
        { label: "VAT #", verified: true },
        { label: "Phone", value: "+966500000000" },
      ],
      chips: ["Verified"],
    },
    rentee: { label: "Rentee", name: "Moedatech renter", idRows: [{ label: "Phone", value: "+966511111111" }], chips: [] },
    meta: [
      { label: "Request #", value: "REQ-00001" },
      { label: "Issue date", value: "5 July 2026" },
      { label: "Valid until", value: "12 Jul 2026" },
    ],
    listed: [{ label: "Item 1", detail: "Cat · 320 · 2022", units: 2, verified: true, certs: ["TÜV"] }],
    lineItems: [
      { num: 1, label: "Rental — Item 1", detail: "Cat · 320", unit: "day", qty: "30 day × 2", price: "200 / day", total: "12,000" },
      { num: null, label: "Delivery to site", detail: "Item 1", unit: "Trip", qty: "2", price: "500", total: "1,000" },
    ],
    currency: "SAR",
    totals: { subtotal: 13000, vat: 1950, total: 14950 },
    cards: [{ title: "Contract terms", rows: [{ label: "Payment terms", value: "Net 30 days" }] }],
    legal: quotationLegal(L),
  };
}

/** A deal-room-style confirmed quotation (single rental + agreed terms). */
function dealDoc(): QuotationDoc {
  return {
    lang: "en",
    title: "Equipment rental quotation",
    quotationNumber: "AB12CD34",
    dateStr: "5 July 2026",
    supplier: { label: "Supplier", name: "Acme Cranes", idRows: [{ label: "VAT #", verified: true }], chips: ["Verified"] },
    rentee: { label: "Rentee", name: "Moedatech renter", idRows: [], chips: [] },
    meta: [{ label: "Reference", value: "AB12CD34" }, { label: "Contract", value: "formal" }],
    lineItems: [{ num: 1, label: "Rental", detail: "Acme Cranes", unit: "month", qty: "1 × 2", price: "200 / month", total: "400" }],
    currency: "SAR",
    totals: { subtotal: 400, vat: 60, total: 460 },
    cards: [{ title: "Agreed terms", rows: [{ label: "Payment terms", value: "Net 30" }] }],
    legal: quotationLegal(L),
  };
}

describe("shared quotation renderer", () => {
  it("renders a bid-style quotation to non-empty HTML", () => {
    const html = renderQuotationSection(bidDoc());
    expect(html).toContain('class="q-doc"');
    expect(html).toContain("Equipment rental quotation");
    expect(html).toContain("Acme Cranes");
    expect(html).toContain("14,950");
    expect(html.length).toBeGreaterThan(800);
  });

  it("renders a deal-style quotation and wraps a printable page", () => {
    const page = wrapQuotationPage(renderQuotationSection(dealDoc()), { lang: "en", title: "Confirmed Quotation" });
    expect(page).toContain("<!doctype html>");
    expect(page).toContain('class="q-doc"');
    expect(page).toContain("460.00 SAR");
    expect(page).toContain("window.print()");
  });

  it("renders party avatar initials (app parity)", () => {
    const html = renderQuotationSection(bidDoc());
    expect(html).toContain('class="pava"');
    expect(html).toContain(">A<"); // Acme → "A"
  });

  it("shows halalas + an open-ended suffix and reframes the grand total", () => {
    const doc = bidDoc();
    doc.totals = { subtotal: 250, vat: 37.5, total: 287.5, label: "Total / unit · day", valueOverride: "50.00 SAR" };
    doc.amountWordsSuffix = "Estimate for one day · Final amount as operated";
    const html = renderQuotationSection(doc);
    expect(html).toContain("and Fifty halalas");
    expect(html).toContain("Estimate for one day");
    expect(html).toContain("Total / unit · day");
    expect(html).toContain("50.00 SAR"); // grand-row override, not the summed total
  });

  it("builds a human download name: RFQ group code, else REQ single, stamping covered codes", () => {
    expect(quotationDownloadName("RFQ-00228", ["REQ-00228"])).toBe("RFQ-00228__items__REQ-00228");
    expect(quotationDownloadName("REQ-00228", ["REQ-00228"])).toBe("REQ-00228");
    expect(quotationDownloadName(null)).toBe("quotation");
  });

  it("shows the Verified pill when a party id-row has no value but is verified", () => {
    const html = renderQuotationSection(bidDoc());
    expect(html).toContain("pill-ver");
  });

  it("escapes HTML in values (no injection)", () => {
    const doc = bidDoc();
    doc.supplier.name = "<script>alert(1)</script>";
    const html = renderQuotationSection(doc);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
