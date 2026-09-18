import { describe, it, expect } from "vitest";
import { renderQuotationSection, wrapQuotationPage, quotationLegal, type QuotationDoc } from "@/lib/quotation/render";
import { quotationDownloadName } from "@/lib/compare/quotation-token";

/**
 * The `q3` template, ported from the app (`quotation_document.dart`). What is pinned here is the
 * SHAPE the owner handed over — eight columns with delivery and return among them, the three money
 * cell states, one numbered terms list, the navy supplier footer — plus the two rules that are the
 * web's own: the draft marking, and that nothing on this paper can be injected through a value.
 */

const L = (en: string) => en;

function baseDoc(): QuotationDoc {
  return {
    lang: "en",
    title: "Quotation",
    quotationNumber: "Q-REQ-1-SUP1",
    dateStr: "5 July 2026",
    refs: [
      { label: "NO.", value: "Q-REQ-1-SUP1" },
      { label: "DATE", value: "5 July 2026" },
      { label: "VALID UNTIL", value: "12 Jul 2026" },
      { label: "WORK SITE", value: "" }, // absent → must not draw an empty pair
      { label: "CURRENCY", value: "SAR" },
    ],
    supplier: {
      label: "SUPPLIER",
      name: "Acme Cranes",
      verified: true,
      rows: [
        { label: "C.R.", value: "1010101010" },
        { label: "VAT", value: "300000000000003" },
        { label: "Phone", value: "+966500000000" },
      ],
    },
    rentee: {
      label: "RENTER",
      name: "Sigma Almimariya Contracting Co.",
      rows: [{ label: "Renter", value: "Yara Fadwa" }, { label: "Phone", value: "+966511111111" }],
    },
    lineItems: [
      {
        equipment: "Crawler Excavator",
        description: [
          { label: "Size", value: "20 ton" },
          { label: "Year", value: "2021" },
          { label: "Model", value: "PC200-8" },
          { label: "Manufacturer", value: "Komatsu" },
        ],
        units: "1",
        duration: "Daily",
        rental: { kind: "amount", text: "1,750.00" },
        delivery: { kind: "amount", text: "1,500.00" },
        ret: { kind: "unpriced" },
        total: "24,000.00",
        totalNote: "÷ 26 days a month",
      },
    ],
    currency: "SAR",
    totals: { subtotal: 13000, vat: 1950, total: 14950 },
    clauses: [
      { title: "Payment", body: "Payment terms Net 30 days. A formal purchase order is issued on approval of this quotation", agreed: true },
      { title: "Maintenance", body: "Routine maintenance is carried by the supplier for the rental period" },
    ],
    legal: quotationLegal(L),
    footer: {
      name: "Acme Cranes",
      address: "Riyadh, Saudi Arabia",
      crNumber: "1010101010",
      vatNumber: "300000000000003",
      phone: "+966500000000",
      supportLine: "support@moedatech.com",
    },
  };
}

describe("the q3 quotation renderer", () => {
  it("renders the sheet and wraps a printable page", () => {
    const page = wrapQuotationPage(renderQuotationSection(baseDoc()), { lang: "en", title: "Quotation" });
    expect(page).toContain("<!doctype html>");
    expect(page).toContain('class="q-doc"');
    expect(page).toContain("Acme Cranes");
    expect(page).toContain("14,950"); // whole riyals print whole; halalas show only when there are any
    expect(page).toContain("window.print()");
  });

  /* The design's own faces. This file is exempt from `font-drift` because it renders where this app's
     `:root` does not exist, so it has to NAME them — and the link that fetches them has to be there. */
  it("loads the design's own faces and falls back to a real system stack", () => {
    const page = wrapQuotationPage(renderQuotationSection(baseDoc()), { lang: "ar", title: "عرض سعر" });
    expect(page).toContain("family=Inter");
    expect(page).toContain("Tajawal");
    expect(page).toMatch(/font-family:'Tajawal','Inter',system-ui/);
  });

  /* 🔴 EIGHT columns, one row per machine. The old sheet put the two transport legs on rows of their
     own under the rental; on a multi-item bid that read as a list of charges rather than a quotation. */
  it("draws the eight columns with delivery and return among them, one row per machine", () => {
    const html = renderQuotationSection(baseDoc());
    for (const head of ["Equipment", "Description", "Units", "Period", "Rental", "Delivery", "Return", "Total"]) {
      expect(html).toContain(`>${head}<`);
    }
    expect(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr>/g)?.length).toBe(1);
    // The per-unit sub-label is what stops the three money columns reading as line totals.
    expect(html.match(/\/unit/g)?.length).toBe(3);
  });

  /* 🔴 Three money states, and the difference is the point: a figure is a price, `–` is a leg that is
     not the supplier's, and «Not priced» is a leg nobody put a number on. Collapsing the last two
     tells a renter a price is still coming when it never was. */
  it("tells a priced leg from an excluded one from an unpriced one", () => {
    const doc = baseDoc();
    doc.lineItems[0].delivery = { kind: "excluded" };
    const html = renderQuotationSection(doc);
    expect(html).toContain("–"); // excluded
    expect(html).toContain("Not priced"); // nobody priced it
    expect(html).toContain("1,750.00"); // a real price
  });

  it("states the specs as labelled pairs and escapes the values in them", () => {
    const doc = baseDoc();
    doc.lineItems[0].description = [{ label: "Model", value: "<b>320</b>" }];
    const html = renderQuotationSection(doc);
    expect(html).toContain("<b>Model:</b>");
    expect(html).toContain("&lt;b&gt;320&lt;/b&gt;");
  });

  /* Settled in the deal room. The app dropped the padlock with the redesign and the owner put the mark
     back on 2026-09-18, inline in the clause rather than as a badge in the margin. */
  it("marks a clause the two sides settled, and leaves the others unmarked", () => {
    const html = renderQuotationSection(baseDoc());
    expect(html.match(/q-agreed/g)?.length).toBe(1);
    expect(html).toContain("✓ Agreed");
  });

  /* ONE numbered list: the term sentences, then the legal clauses after a hairline. */
  it("prints the terms and the legal clauses in one list, ruled between them", () => {
    const html = renderQuotationSection(baseDoc());
    const items = html.match(/<li/g)?.length ?? 0;
    expect(items).toBe(2 + quotationLegal(L).length);
    expect(html.match(/class="rule"/g)?.length).toBe(1);
  });

  it("drops a reference pair and a party row with no value rather than printing a blank", () => {
    const html = renderQuotationSection(baseDoc());
    expect(html).not.toContain("WORK SITE");
    expect(html).toContain("C.R.");
  });

  /* A preview has no formal number yet and falls back to the request's own code, which then stood
     twice in a row under two headings saying the same thing. */
  it("drops a reference pair that repeats a value already in the strip", () => {
    const doc = baseDoc();
    doc.refs = [
      { label: "NO.", value: "REQ-00042" },
      { label: "REQUEST", value: "REQ-00042" },
      { label: "CURRENCY", value: "SAR" },
    ];
    const html = renderQuotationSection(doc);
    expect(html).toContain("NO.");
    expect(html).not.toContain("REQUEST");
    expect(html.match(/REQ-00042/g)?.length).toBe(1);
  });

  it("carries the supplier's own registration into the navy footer", () => {
    const html = renderQuotationSection(baseDoc());
    expect(html).toContain('class="q-foot"');
    expect(html).toContain("C.R. 1010101010");
    expect(html).toContain("VAT 300000000000003");
    expect(html).toContain("support@moedatech.com");
  });

  /* A live quotation gets NO stamp: a sheet that stamps its own normal state teaches the reader to
     ignore the stamp, and then the terminal one is ignored too. */
  it("stamps a terminal quotation beside the title and a live one not at all", () => {
    expect(renderQuotationSection(baseDoc())).not.toContain("q-stamp");
    const doc = baseDoc();
    doc.statusStamp = { label: "Accepted", tone: "ok" };
    const html = renderQuotationSection(doc);
    expect(html).toContain("q-stamp is-ok");
    expect(html).toContain("Accepted");
  });

  it("shows halalas + an open-ended suffix and reframes the grand total", () => {
    const doc = baseDoc();
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

  // A pre-confirmation draft must be unmistakable once it leaves the browser as a PDF — the whole
  // failure mode is a renter (or a third party they forward it to) reading it as a committed deal.
  it("marks a draft with a badge + watermark and suppresses the signed block", () => {
    const doc = baseDoc();
    doc.draftLabel = "Draft, not final";
    const html = renderQuotationSection(doc);
    expect(html).toContain('class="q-draft"');
    expect(html).toContain('class="q-wm"');
    expect(html).toContain("Draft, not final");
    expect(html).not.toContain("signed electronically");
  });

  it("keeps the signed block on a final quotation (draft marking is opt-in)", () => {
    const html = renderQuotationSection(baseDoc());
    expect(html).not.toContain('class="q-draft"');
    expect(html).not.toContain('class="q-wm"');
    expect(html).toContain("signed electronically");
  });

  it("suppresses the signed block for a draft even when showSigned is explicitly true", () => {
    const doc = baseDoc();
    doc.draftLabel = "Draft";
    doc.showSigned = true;
    expect(renderQuotationSection(doc)).not.toContain("signed electronically");
  });

  it("escapes HTML in values (no injection)", () => {
    const doc = baseDoc();
    doc.supplier.name = "<script>alert(1)</script>";
    const html = renderQuotationSection(doc);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
