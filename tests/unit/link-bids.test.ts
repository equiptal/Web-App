import { describe, it, expect } from "vitest";
import { mapLinkSubmissions, submissionToBidCard, type LinkBidSubmission } from "@/lib/contract/link-bids";

const sub = (p: Partial<LinkBidSubmission> = {}): LinkBidSubmission => ({
  id: "s1",
  requestId: "r1",
  createdAt: "2026-06-25T10:00:00Z",
  companyName: "Gulf Heavy Equipment Co.",
  crNumber: "1010101010",
  vatNumber: "300000000000003",
  nationalAddress: "Bldg 1, Riyadh",
  contactInfo: "0500000000",
  notes: "available next week",
  grandTotal: 13800,
  items: [
    {
      requestItemId: "i1",
      label: "Excavator",
      numberOfUnits: 2,
      priceUnit: "PER_MONTH",
      rentalRate: 6000,
      deliveryPrice: 800,
      returnPrice: 800,
      total: 13600,
      confirmations: { operator: true, fuel: true, year: true, operatorCert: true, equipmentCert: false },
    },
  ],
  ...p,
});

describe("mapLinkSubmissions", () => {
  it("parses the agents payload (booleans from yes/no, numbers from strings)", () => {
    const out = mapLinkSubmissions({
      submissions: [
        { id: "s1", requestId: "r1", companyName: "Co", crNumber: "1", grandTotal: "5000", items: [
          { requestItemId: "i1", rentalRate: "200", numberOfUnits: 3, confirmations: { operator: "yes", fuel: "no" } },
        ] },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].grandTotal).toBe(5000);
    expect(out[0].items[0].rentalRate).toBe(200);
    expect(out[0].items[0].confirmations).toMatchObject({ operator: true, fuel: false });
  });
  it("accepts a bare array too", () => {
    expect(mapLinkSubmissions([{ id: "s2", requestId: "r", companyName: "X", items: [] }])).toHaveLength(1);
  });
});

describe("submissionToBidCard", () => {
  it("flags it off-platform: viaSharedLink, not verified, no distance, no deal room", () => {
    const c = submissionToBidCard(sub());
    expect(c.viaSharedLink).toBe(true);
    expect(c.verified).toBe(false);
    expect(c.distanceKm).toBeNull();
    expect(c.dealRoomId).toBeNull();
    expect(c.supplierName).toBe("Gulf Heavy Equipment Co.");
  });

  it("maps pricing from the (active) item + quoted total", () => {
    const c = submissionToBidCard(sub());
    expect(c.price).toBe(6000);
    expect(c.mobPrice).toBe(800);
    expect(c.demobPrice).toBe(800);
    expect(c.priceUnit).toBe("PER_MONTH");
    expect(c.numberOfUnits).toBe(2);
    expect(c.quotedTotal).toBe(13800);
  });

  it("compliance comes from the typed CR/VAT/national fields (no safety/saso/lc)", () => {
    const c = submissionToBidCard(sub());
    expect(c.compliance).toMatchObject({ activityLicense: true, taxNumber: true, nationalAddress: true, safety: false, saso: false, localContent: false });
    // missing CR → that chip is false
    expect(submissionToBidCard(sub({ crNumber: null })).compliance.activityLicense).toBe(false);
  });

  it("maps per-item Yes/No confirmations to term states (yes→matched, no→conflict)", () => {
    const c = submissionToBidCard(sub());
    const eqCerts = c.terms.equipment.find((t) => t.key === "certs")!;
    const year = c.terms.equipment.find((t) => t.key === "year")!;
    const operator = c.terms.contract.find((t) => t.key === "operator_included")!;
    expect(year.state).toBe("matched"); // confirmed
    expect(eqCerts.state).toBe("conflict"); // equipmentCert: false
    expect(operator.state).toBe("matched");
  });

  it("undefined confirmation → term omitted (not asked for this item)", () => {
    // submissionToBidCard only emits terms the renter actually asked: an undefined confirmation
    // is dropped entirely (kept dynamic), rather than shown as a grey "not documented" row.
    const c = submissionToBidCard(sub({ items: [{ requestItemId: "i1", rentalRate: 100 }] }));
    expect(c.terms.equipment.find((t) => t.key === "year")).toBeUndefined();
  });

  it("scopes to a passed item for the per-item comparison", () => {
    const two = sub({ items: [
      { requestItemId: "i1", rentalRate: 100, priceUnit: "PER_DAY" },
      { requestItemId: "i2", rentalRate: 500, priceUnit: "PER_DAY", confirmations: { year: false } },
    ] });
    const c2 = submissionToBidCard(two, two.items[1]);
    expect(c2.price).toBe(500);
    expect(c2.terms.equipment.find((t) => t.key === "year")!.state).toBe("conflict");
  });
});
