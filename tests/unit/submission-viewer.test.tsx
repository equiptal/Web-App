import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n";
import { SharedBidSubmissionModal } from "@/components/requests/SharedBidSubmissionModal";
import type { BidCard } from "@/lib/contract/bids";
import type { BidFormData, LinkBidSubmission } from "@/lib/contract/link-bids";
import { computeRentalTotal, durationDaysBetween } from "@/lib/pricing/rental";
import { vatLines } from "@/lib/contract/vat-inclusive";

/**
 * «View quote» — the off-platform submission, drawn as the bid form the supplier filled (owner,
 * 2026-09-04: *"I want the view bid submission on the bid card to render the same UI as this form
 * but with the filled values of the supplier answers"*).
 *
 * The form's spine is three numbered steps and a rail. These pin that spine, and the four things the
 * old markup got to state and this one must not lose: what the renter asked beside every answer, a
 * term the supplier never answered reading as neither Yes nor No, the rate prorated over the
 * request's own period, and VAT as `total − subtotal` rather than a fresh 15%.
 */

const form: BidFormData = {
  token: "tok",
  status: "open",
  closedReason: null,
  deadline: "2026-09-20T00:00:00Z",
  renter: { name: "EQ Rental", contactName: null, city: "Riyadh", verified: true, logoUrl: null },
  projectTerms: {
    location: "An Narjis, Riyadh",
    lat: 24.9,
    lng: 46.6,
    rentalBasis: "MONTHLY",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
    hoursPerDay: 10,
    workingDaysPerWeek: 6,
    extendable: true,
  },
  contractTerms: [{ key: "payment", label: "Payment Terms", labelAr: "شروط الدفع", value: "net_30", valueAr: null }],
  notes: "Gate access before 7am",
  items: [
    {
      requestItemId: "m1",
      label: "Crawler excavator",
      labelAr: null,
      size: "20 ton",
      sizeAr: null,
      numberOfUnits: 2,
      priceUnit: "PER_MONTH",
      deliveryBy: "RENTER",
      returnBy: "SUPPLIER",
      notes: null,
      // `fuelType` is no longer shown to a supplier, so it can no longer be the unanswered term.
      // `nationality` takes its place: asked by the renter, left unconfirmed by the supplier.
      requiredTerms: { operator: "YES", nationality: "any", fuel: "RENTER", year: "2020", equipmentCert: "tuv" },
    },
  ],
};

const submission: LinkBidSubmission = {
  id: "s1",
  requestId: "r1",
  quotationRef: "Q-2026-CEX-4F21",
  rfqRef: "REQ-030992",
  groupRef: null,
  createdAt: "2026-09-03T09:00:00Z",
  companyName: "Al Faisal Heavy Equipment",
  crNumber: "1010101010",
  vatNumber: null,
  nationalAddress: null,
  contactInfo: "+966501112233",
  contactEmail: "bids@alfaisal.sa",
  city: "Riyadh",
  notes: "Mobilisation within 48 hours",
  validUntil: "2026-10-15T00:00:00Z",
  grandTotal: null,
  companyDocuments: [{ key: "https://files.test/vat.pdf", type: "vat_cert", filename: "vat.pdf" }],
  items: [
    {
      requestItemId: "m1",
      label: "Crawler excavator",
      numberOfUnits: 2,
      offeredUnits: 1,
      priceUnit: "PER_MONTH",
      rentalRate: 18000,
      deliveryPrice: 1500,
      returnPrice: null,
      total: null,
      // `fuelType` is deliberately absent: a term the supplier never answered.
      confirmations: { operator: true, fuel: false, year: true, equipmentCert: true, payment: true },
      // `fuelType` is no longer shown to a supplier, so it can no longer be the unanswered term.
      // `nationality` takes its place: asked by the renter, left unconfirmed by the supplier.
      requiredTerms: { operator: "YES", nationality: "any", fuel: "RENTER", year: "2020", equipmentCert: "tuv" },
      photos: [{ key: "https://files.test/front.jpg", type: "front_photo", filename: "front.jpg" }],
      documents: [{ key: "https://files.test/istimara.pdf", type: "istimara", filename: "istimara.pdf" }],
    },
  ],
};

const card = { bidId: "b1", supplierName: "Al Faisal Heavy Equipment" } as unknown as BidCard;

vi.mock("@/lib/api/client", () => ({ fetchBidFormData: () => Promise.resolve(form) }));

beforeEach(() => vi.stubGlobal("print", vi.fn()));
afterEach(cleanup);

const L = (e: string) => e;
const draw = (over: Partial<LinkBidSubmission> = {}) =>
  render(
    <LocaleProvider initialLocale="en">
      <SharedBidSubmissionModal bid={card} submission={{ ...submission, ...over }} ar={false} L={L} onClose={() => {}} />
    </LocaleProvider>,
  );

/** Draw, then hand back the numbered step whose heading this is. */
const step = async (title: string) => {
  draw();
  return (await screen.findByRole("heading", { name: title })).closest("section")!;
};

/** What this fixture's money must come to, from the same pricing contract the viewer uses. */
const money = (() => {
  const rental = computeRentalTotal({
    rate: 18000,
    priceUnit: "PER_MONTH",
    startDate: "2026-09-01",
    durationDays: durationDaysBetween("2026-09-01", "2026-12-31"),
  });
  const units = 2;
  const subtotal = (rental.total + 1500) * units;
  return { rental, ...vatLines(subtotal, null) };
})();

describe("it is the bid form's own shape", () => {
  it("draws the three steps, in the form's order", async () => {
    draw();
    const headings = [...document.querySelectorAll("section h3")].map((h) => h.textContent);
    expect(headings).toEqual(["Terms", "The price", "The supplier's details"]);
  });

  it("names who the bid is from, with the quotation's own code", async () => {
    draw();
    expect(await screen.findByText("Bid from")).toBeTruthy();
    // The dialog's own title says it too, so the name is on the page twice by design.
    expect(screen.getAllByText("Al Faisal Heavy Equipment").length).toBeGreaterThan(1);
    expect(screen.getByText("Q-2026-CEX-4F21")).toBeTruthy();
  });

  it("carries the rail: the request, then the quotation", async () => {
    draw();
    expect(await screen.findByText("The request")).toBeTruthy();
    expect(screen.getByText("The quotation")).toBeTruthy();
    // The request's own facts, as the form's rail states them.
    expect(screen.getByText("Rental basis")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("Working days / week")).toBeTruthy();
    expect(screen.getByText("An Narjis, Riyadh").getAttribute("href")).toContain("maps?q=24.9,46.6");
  });
});

describe("the terms step reads back as answered", () => {
  it("counts the answered terms over the asked ones", async () => {
    // Six asked (one contract term + five item terms); `nationality` was never answered.
    const terms = await step("Terms");
    expect(within(terms).getByText("5 / 6")).toBeTruthy();
    expect(within(terms).getByText("answered")).toBeTruthy();
  });

  it("puts the contract term in the group the form marks «Applies to every item»", async () => {
    const terms = await step("Terms");
    expect(within(terms).getByText("Applies to every item")).toBeTruthy();
    const row = within(terms).getByText("Payment Terms").closest("div")!;
    expect(row.textContent).toContain("net_30");
  });

  it("states what the renter asked beside every answer", async () => {
    const terms = await step("Terms");
    const row = within(terms).getByText("Fuel responsibility").closest("div")!;
    expect(row.textContent).toContain("you asked");
    expect(row.textContent).toContain("On renter");
    // He declined this one, and it says so rather than colouring the whole row.
    expect(within(row as HTMLElement).getByText("No")).toBeTruthy();
  });

  it("leaves a term the supplier never answered as neither Yes nor No", async () => {
    const terms = await step("Terms");
    const row = within(terms).getByText("Operator nationality").closest("div")!;
    expect(within(row as HTMLElement).queryByText("Yes")).toBeNull();
    expect(within(row as HTMLElement).queryByText("No")).toBeNull();
    expect(row.textContent).toContain("—");
  });
});

describe("the price step is the form's, frozen", () => {
  it("shows the units offered against the units asked for", async () => {
    const price = await step("The price");
    expect(within(price).getByText("Units offered")).toBeTruthy();
    expect(within(price).getByText(/^1$/)).toBeTruthy();
    expect(within(price).getByText("/ 2")).toBeTruthy();
  });

  it("shows the rate with its unit, and the days it was prorated over", async () => {
    const price = await step("The price");
    expect(within(price).getByText("18,000")).toBeTruthy();
    expect(within(price).getByText(/SAR \/ month/)).toBeTruthy();
    // 1 Sept → 31 Dec is 122 days; the rate is monthly, so the form prorates rather than charging one month.
    expect(within(price).getAllByText(/billable days/).length).toBeGreaterThan(0);
  });

  it("adds the transport leg the supplier priced, and no leg he did not", async () => {
    const price = await step("The price");
    expect(within(price).getByText("Delivery to site")).toBeTruthy();
    expect(within(price).queryByText("Return from site")).toBeNull();
  });
});

describe("the money", () => {
  it("prorates the rate over the request's own period", async () => {
    const price = await step("The price");
    // A monthly rate on a 1 Sept → 31 Dec hire is not one month's money: the form prorated it, and
    // the viewer states the same day count under the rate so the two pages reconcile.
    expect(money.rental.raw).toBe(false);
    expect(within(price).getAllByText(new RegExp(`${money.rental.billable} billable days`)).length).toBeGreaterThan(0);
  });

  it("prints three rows that add up, to the riyal", async () => {
    // `vatLines` derives VAT as `total − subtotal`; rounding the three ends independently for display
    // would undo that and print rows a renter cannot add. Read the printed figures back and add them.
    draw();
    await screen.findByText("The quotation");
    const card = screen.getByText("The quotation").closest("div")!.parentElement!;
    const text = (card.textContent ?? "").replace(/\s+/g, " ");
    // The first figure printed after each label. Each of the three appears once in this card.
    const figure = (label: string) => {
      const after = text.split(label)[1] ?? "";
      const digits = after.match(/[0-9,]+/)?.[0] ?? "";
      return Number(digits.replace(/,/g, ""));
    };
    const subtotal = figure("Subtotal");
    const vat = figure("VAT 15%");
    const total = figure("Total incl. VAT");
    expect(subtotal).toBe(Math.round(money.subtotal));
    expect(total).toBe(Math.round(money.total));
    expect(subtotal + vat).toBe(total);
  });

  it("splits the quotation into the lines the supplier priced", async () => {
    draw();
    await screen.findByText("The quotation");
    const card = screen.getByText("The quotation").closest("div")!.parentElement!;
    const text = (card.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Rental");
    expect(text).toContain("Delivery to site");
    // He priced no return leg, and an unpriced leg is left out rather than shown as zero.
    expect(text).not.toContain("Return from site");
  });
});

describe("the details step", () => {
  it("fills the form's fields, and says «not entered» where the supplier left one blank", async () => {
    const details = await step("The supplier's details");
    expect(within(details).getByText("+966501112233")).toBeTruthy();
    expect(within(details).getByText("bids@alfaisal.sa")).toBeTruthy();
    expect(within(details).getByText("1010101010")).toBeTruthy();
    // No national address was given, as text or as a file.
    const na = within(details).getByText("National address").parentElement!;
    expect(na.textContent).toContain("not entered");
  });

  it("renders a field the supplier answered with a FILE as that file", async () => {
    const details = await step("The supplier's details");
    // He gave no VAT number but attached the certificate.
    expect(within(details).getByText(/vat\.pdf/).closest("a")!.getAttribute("href")).toBe("https://files.test/vat.pdf");
  });

  it("groups the attachments the way the form uploads them", async () => {
    const details = await step("The supplier's details");
    expect(within(details).getByText("Photos and documents")).toBeTruthy();
    expect(within(details).getByText("Equipment photos")).toBeTruthy();
    expect(within(details).getByText("Proof of ownership")).toBeTruthy();
    expect(within(details).getByAltText("Front photo").getAttribute("src")).toBe("https://files.test/front.jpg");
  });

  it("keeps the supplier's own notes", async () => {
    const details = await step("The supplier's details");
    expect(within(details).getByText("Mobilisation within 48 hours")).toBeTruthy();
  });
});

describe("nothing on it can be changed", () => {
  it("offers no input, no select and no textarea — it is a read-only document", async () => {
    draw();
    await screen.findByText("The price");
    expect(document.querySelectorAll("input, select, textarea").length).toBe(0);
    // And none of the form's own actions: no «Yes to all», no «Send bid», no «Change».
    for (const word of ["Yes to all", "Send bid", "Change"]) expect(screen.queryByText(word)).toBeNull();
  });
});
