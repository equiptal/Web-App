import { describe, it, expect } from "vitest";
import { renderQuotationSection, wrapQuotationPage, quotationLegal, type QuotationDoc } from "@/lib/quotation/render";

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
    expect(page).toContain("460 SAR");
    expect(page).toContain("window.print()");
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
