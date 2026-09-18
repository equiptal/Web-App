import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mapDealRoom, mapQuotation, quotationLinkKind, buildDealRoomQuotationDoc, isHiddenDealRoomTermKey,
  type DealRoomView, type QuotationView,
} from "@/lib/contract/deal-room";
import { renderQuotationSection } from "@/lib/quotation/render";

/**
 * The deal-room quotation, aligned to the APP (owner's ruling: the app's behaviour is correct).
 *
 * The app (`quotation_button.dart`, `deal_room_page.dart`, `bid_quotation_page.dart`) shows the rentee a
 * quotation link at EVERY status except abandoned — «معاينة»/Preview before the deal closes, «النهائي»/
 * Final after — and the document it opens is re-rendered from a fresh fetch every time. No snapshot, no
 * stored PDF, no verification gate.
 *
 * The web was CLOSED-only, rendered a HYBRID of the frozen `Quotation` row and the live room, kept the
 * terms the app retired, printed four request facts twice under two names, and preferred a stored PDF
 * over rendering at all. These cover each of those.
 *
 * Rendering is asserted through `renderQuotationSection` (a pure string builder) because this repo has
 * no component-test harness — vitest runs in `node`, with no DOM.
 *
 * ⚠️ The document is the app's `q3` template since 2026-09-18: ONE ROW for the machine with delivery and
 * return as COLUMNS, and ONE numbered terms list in place of the cards. Every figure below is the one
 * this suite has always asserted; the fields they are read out of moved.
 */

/** A money cell as a comparable string: its state, or the figure it carries. */
const cellText = (c: { kind: string; text?: string }) => (c.kind === "amount" ? c.text! : c.kind);
/** Every sentence on the paper, so a fact can be looked for without caring which clause holds it. */
const clauseText = (d: ReturnType<typeof buildDealRoomQuotationDoc>) =>
  d.clauses.map((c) => `${c.title ?? ""}: ${c.body}`).join(" | ");

/** The English document — the builder's `L(en, ar)` picker. */
const L = (en: string) => en;
const count = (haystack: string, re: RegExp) => (haystack.match(re) ?? []).length;

/** The deal-room payload as the backend sends it (`GET /api/deal-rooms/{id}`). */
function rawRoom(over: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    status: "NEGOTIATING",
    contractType: "platform",
    streamChannelId: "ch-1",
    renteeId: 1,
    supplierId: 2,
    supplier: { id: 2, companyName: "Acme Cranes", isVerified: true, phone: "+966500000000" },
    bid: { priceAmount: 3000, priceUnit: "PER_DAY", unitsOffered: ["u1", "u2"] },
    lastProposedRate: 2800,
    lastProposedPriceUnit: "PER_DAY",
    lastProposedMobPrice: 500,
    lastProposedDemobPrice: 400,
    agreedUnits: 2,
    mobUnits: 2,
    demobUnits: 2,
    request: {
      shortCode: "REQ-00042",
      estimatedDurationDays: 10,
      projectAddressLabel: "Riyadh",
      startDate: "2026-09-01",
      endDate: "2026-09-11",
      rentalType: "DRY",
      workingHoursPerDay: 10,
      workingDaysPerWeek: 6,
      subletting: true,
      localContent: false,
      equipmentItems: [{ numberOfUnits: 3, subtypeName: "Mobile crane", capacityName: "30 ton" }],
    },
    terms: [
      { key: "PRICE", label: "Price", labelAr: "السعر", state: "agreed", value: 2800 },
      { key: "payment_terms", label: "Payment Terms", labelAr: "شروط الدفع", state: "agreed", value: "NET_30" },
      { key: "fuel_responsibility", label: "Fuel Responsibility", labelAr: "مسؤولية الوقود", state: "agreed", value: "supplier" },
      // Retired from the deal-room surface — the app never renders these two.
      { key: "operator_nationality", label: "Operator nationality", labelAr: "جنسية المشغل", state: "agreed", value: "SAUDI" },
      { key: "safety_certifications", label: "Safety certifications", labelAr: "شهادات السلامة", state: "fixed", value: ["TUV"] },
      // ACKNOWLEDGE terms — the backend copies these straight off the request columns below.
      { key: "working_hours", label: "Working Hours", labelAr: "ساعات العمل", state: "fixed", value: 10 },
      { key: "working_days", label: "Working Days", labelAr: "أيام العمل", state: "fixed", value: 6 },
      { key: "local_content", label: "Local Content", labelAr: "المحتوى المحلي", state: "fixed", value: false },
      { key: "crosshire", label: "Crosshire", labelAr: "التأجير من الباطن", state: "fixed", value: true },
      { key: "night_shift", label: "Night Shift", labelAr: "العمل الليلي", state: "fixed", value: false },
    ],
    ...over,
  };
}

const room = (over: Record<string, unknown> = {}): DealRoomView => mapDealRoom(rawRoom(over));

/**
 * The confirmed `Quotation` row, deliberately DISAGREEING with the room on every field the renderer
 * used to take from it — and still carrying the two retired terms, exactly as every deal closed before
 * the retirement does (the snapshot is frozen at close and never rewritten).
 */
const staleSnapshot = (): QuotationView =>
  mapQuotation({
    id: "quot-abcd1234-9999",
    pdfUrl: "https://s3.example.test/quotations/room-1.pdf",
    pdfStatus: "READY",
    agreedRate: 9999,
    priceUnit: "PER_MONTH",
    contractType: "off_platform",
    renteePhone: "+966599999999",
    supplierPhone: "+966588888888",
    renteeEmail: "stale@rentee.test",
    supplierEmail: "sales@acme.test",
    agreedTerms: [
      { key: "payment_terms", label: "Payment Terms", labelAr: "شروط الدفع", value: "NET_90" },
      { key: "operator_nationality", label: "Operator nationality", labelAr: "جنسية المشغل", value: "SAUDI" },
      { key: "safety_certifications", label: "Safety certifications", labelAr: "شهادات السلامة", value: ["TUV"] },
    ],
  });

const RENTEE = { name: "Moedatech Renter", phone: "+966511111111", email: "renter@moedatech.test" };
const html = (r: DealRoomView, q: QuotationView | null) =>
  renderQuotationSection(buildDealRoomQuotationDoc(r, q, RENTEE, false, L));

// ── 1 · Availability + the label ────────────────────────────────────────────────────────────────────

describe("the quotation link is available at every status except abandoned (app parity)", () => {
  it("labels every pre-close status a PREVIEW — an agreed price is not a signed deal", () => {
    // Given a room that has not closed / When the rentee looks for the quotation / Then it is offered,
    // as a preview.
    for (const status of ["OPEN", "NEGOTIATING", "AWAITING_SUPPLIER_CONFIRMATION"]) {
      expect(quotationLinkKind(status), status).toBe("preview");
    }
  });

  it("labels a CLOSED room's quotation FINAL", () => {
    expect(quotationLinkKind("CLOSED")).toBe("final");
  });

  it("offers nothing on an ABANDONED room — there is no deal to quote", () => {
    expect(quotationLinkKind("ABANDONED")).toBeNull();
  });

  it("says on the paper itself that a preview is a draft, and does not say it on the final", () => {
    // The link label doesn't survive a print-out or a forward, so the document carries the distinction
    // too — in the app's own words (`dealViewQuotationDraftHint`).
    const preview = buildDealRoomQuotationDoc(room(), null, RENTEE, false, L);
    const final = buildDealRoomQuotationDoc(room({ status: "CLOSED" }), staleSnapshot(), RENTEE, false, L);
    expect(preview.legal.join(" ")).toMatch(/draft/i);
    expect(final.legal.join(" ")).not.toMatch(/draft/i);
  });
});

// ── 2 · The document reads LIVE ─────────────────────────────────────────────────────────────────────

describe("the document reads the live room, not the frozen snapshot", () => {
  it("builds with no snapshot at all — the Quotation row does not exist before the deal closes", () => {
    // `GET /api/deal-rooms/{id}/quotation` 404s until close, so a preview has nothing to read.
    const doc = buildDealRoomQuotationDoc(room(), null, RENTEE, false, L);
    expect(cellText(doc.lineItems[0].rental)).toBe("2,800");
    // No formal quotation number exists yet — fall back to the reference the rentee knows the room by.
    expect(doc.quotationNumber).toBe("REQ-00042");
  });

  it("prices off the room's rate and price unit, not the snapshot's", () => {
    const doc = buildDealRoomQuotationDoc(room({ status: "CLOSED" }), staleSnapshot(), RENTEE, false, L);
    expect(cellText(doc.lineItems[0].rental)).toBe("2,800"); // not the snapshot's 9,999
    expect(doc.lineItems[0].duration).toBe("Daily"); // not the snapshot's PER_MONTH
  });

  it("prints the rental exactly as the bid card does — raw rate, billable days, divisor", () => {
    // 2,800/day × 2 units over 1 Sep – 11 Sep. Ten days, one of them a Friday, so nine are charged.
    const doc = buildDealRoomQuotationDoc(room(), null, RENTEE, false, L);
    const rental = doc.lineItems[0];

    expect(cellText(rental.rental)).toBe("2,800"); // the per-unit rate, as the column says
    expect(rental.duration).toBe("Daily");
    expect(rental.units).toBe("2");
    /* The days the rate is charged across — not the calendar span, which counts a Friday the total
       excludes. q3 has no quantity column, so this note is the only place the figure is stated. */
    expect(rental.totalNote).toBe("9 days");
    /* The row's own TOTAL is the whole row — rental plus the two transport columns beside it — because
       q3 gives each leg a column rather than a charge line of its own. */
    expect(rental.total).toBe("52,200"); // 2,800 × 9 × 2, + (500 + 400) × 2
  });

  it("states the divisor behind a weekly or monthly rate, as the card does", () => {
    const monthly = buildDealRoomQuotationDoc(
      room({ lastProposedPriceUnit: "PER_MONTH", lastProposedRate: 30_000 }), null, RENTEE, false, L,
    );
    expect(cellText(monthly.lineItems[0].rental)).toBe("30,000");
    expect(monthly.lineItems[0].duration).toBe("Monthly");
    expect(monthly.lineItems[0].totalNote).toBe("9 days · 26 working days/month");
    expect(monthly.lineItems[0].total).toBe(Math.round((30_000 / 26) * 9 * 2 + 1_800).toLocaleString("en-US"));
  });

  /* 🔴 The rental WINDOW, which the q3 template has no card for and which this document used to carry
     in its "Rental & equipment details" block. A quotation that does not say when the machine is wanted
     states less than the deal contains, so it is a clause of its own. */
  it("states the rental window and the scope on the paper", () => {
    const doc = buildDealRoomQuotationDoc(room(), null, RENTEE, false, L);
    expect(clauseText(doc)).toMatch(/Rental period: 1 Sept? 2026 to 11 Sept? 2026/);
    expect(clauseText(doc)).toContain("2 × Mobile crane (30 ton), for 10 days");
  });

  it("takes the agreed terms from the room", () => {
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    // ⚠️ As WORDS, not as the backend's code: `payment_terms` goes through the shared value labels.
    expect(out).toContain("Net 30 days"); // the room's live value
    expect(out).not.toContain("Net 90 days"); // the snapshot's frozen one
    expect(out).not.toMatch(/NET_\d/); // and never the raw enum
  });

  it("takes the supplier's phone and the rentee's contacts live, and only the supplier's email from the snapshot", () => {
    const doc = buildDealRoomQuotationDoc(room({ status: "CLOSED" }), staleSnapshot(), RENTEE, false, L);
    const val = (p: { rows: { label: string; value: string }[] }, label: string) =>
      p.rows.find((r) => r.label === label)?.value ?? null;
    expect(val(doc.supplier, "Phone")).toBe("+966500000000"); // room.supplier.phone
    expect(val(doc.rentee, "Phone")).toBe("+966511111111"); // /api/me
    expect(val(doc.rentee, "Email")).toBe("renter@moedatech.test"); // /api/me
    // Snapshot-only — nothing on the live room payload carries it.
    expect(val(doc.supplier, "Email")).toBe("sales@acme.test");
  });
});

// ── 3 · Retired terms never reach the paper ─────────────────────────────────────────────────────────

describe("terms the app retired are stripped from the snapshot too", () => {
  it("filters the hidden keys at parse, the way the app does", () => {
    const keys = staleSnapshot().agreedTerms.map((t) => t.key);
    expect(keys).toEqual(["payment_terms"]);
    expect(isHiddenDealRoomTermKey("operator_nationality")).toBe(true);
    expect(isHiddenDealRoomTermKey("Safety_Certifications")).toBe(true); // case-insensitive, app parity
    expect(isHiddenDealRoomTermKey("payment_terms")).toBe(false);
  });

  it("prints neither retired term for a deal closed BEFORE the retirement", () => {
    // Same contract, two documents was the bug: the snapshot still carried both, so the web printed
    // them and the app did not.
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    expect(out).not.toMatch(/operator nationality/i);
    expect(out).not.toMatch(/safety certifications/i);
  });
});

// ── 4 · One fact, one row ───────────────────────────────────────────────────────────────────────────

describe("no request fact is printed twice under two names", () => {
  it("prints subletting once, and never as 'Crosshire'", () => {
    // `crosshire` IS `request.subletting` — one field the details card and the terms card were each
    // printing under a different name. The card is gone; the TERM is relabelled to the renter's word.
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    expect(count(out, /subletting/gi)).toBe(1);
    expect(count(out, /crosshire/gi)).toBe(0);
  });

  it("prints working hours, working days and local content once each", () => {
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    expect(count(out, /working hours/gi)).toBe(1);
    expect(count(out, /working days/gi)).toBe(1);
    expect(count(out, /local content/gi)).toBe(1);
  });

  it("keeps the AGREED terms that are not request facts", () => {
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    expect(out).toMatch(/payment terms/i);
  });

  /* 🔴 REVERSED on 2026-09-18 (owner, on the app: *"just make sure agreed and all terms of deal room is
     mentioned, we will not miss anything"*). ~~No FIXED term reached the paper, on the 2026-08-19 ruling
     that the app's quotation has no such section.~~ That ruling's own note already said the reason it
     existed was still true — a fixed term IS part of the contract, accepted by the act of bidding, and a
     quotation that omits it states less than the deal contains. Every term the room holds now prints. */
  it("prints a FIXED term too, with no section of its own", () => {
    const out = html(room({ status: "CLOSED" }), staleSnapshot());
    expect(out).toMatch(/night shift/i);
    expect(out).not.toMatch(/fixed terms/i);
  });
});

// ── 5 · A stored PDF no longer short-circuits the live document ─────────────────────────────────────

describe("a deal that has a stored PDF still renders live", () => {
  it("renders the live document even when the snapshot carries a pdfUrl", () => {
    const q = staleSnapshot();
    expect(q.pdfUrl).toBeTruthy(); // a pre-2026-06-23 deal, or one that hit `POST /quotation/retry-pdf`
    const out = html(room({ status: "CLOSED" }), q);
    expect(out).toContain("2,800"); // the LIVE rate, not whatever the frozen file says
    expect(out).not.toContain(q.pdfUrl as string);
  });

  it("has no branch in the deal room that opens the stored file in preference to rendering", () => {
    // The app never downloads a stored file — its own PDF export rasterizes the document it has just
    // rendered. `POST /quotation/retry-pdf` stays (owner's call) and can still mint a file for any deal,
    // so the renderer, not the endpoint, is what has to stop deferring to one. Source-level because
    // there is no DOM harness here.
    const src = readFileSync("src/components/deal-room/DealRoom.tsx", "utf8");
    expect(src).not.toMatch(/if\s*\(\s*q\.pdfUrl\s*\)/);
    expect(src).not.toMatch(/window\.open\(\s*q\.pdfUrl/);
  });
});
