import { describe, it, expect } from "vitest";
import { mapBidList, bidSuppliers, type BidCard } from "@/lib/contract/bids";

describe("mapBidList — unitsOffered (supplier's chosen quantity)", () => {
  const req = { request: { equipmentItems: [{ numberOfUnits: 10 }] } };
  it("reads units_offered array length as the offered count", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", unitsOffered: [1, 2, 3], ...req }] });
    expect(out[0].unitsOffered).toBe(3);
    expect(out[0].numberOfUnits).toBe(10); // still the request's needed units
  });
  it("falls back to the request's units when the bid omits units_offered", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", ...req }] });
    expect(out[0].unitsOffered).toBe(10);
  });
});

describe("mapBidList — supplierId", () => {
  it("maps a numeric supplier.id to a string", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 42, companyName: "Al Rajhi" } }] });
    expect(out[0].supplierId).toBe("42");
    expect(out[0].supplierName).toBe("Al Rajhi");
  });

  it("maps a missing supplier id to null", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { companyName: "X" } }] });
    expect(out[0].supplierId).toBeNull();
  });
});

describe("mapBidList — compliance block", () => {
  it("maps supplier credentials (CR/VAT/certs/company) + equipment verification", () => {
    const out = mapBidList({
      activeBids: [{
        id: "b1",
        supplier: { id: 1, supplierProfile: { companyName: "Al Rajhi", crNumber: "1010", vatNumber: "300V" }, certs: { TUV: true, SASO: false, SPSP: false }, heldCerts: ["TUV", "local-content"] },
        equipment: { verificationStatus: "VERIFIED" },
      }],
    });
    const c = out[0].compliance;
    expect(c.entityType).toBe("company");
    expect(c.activityLicense).toBe(true);
    expect(c.taxNumber).toBe(true);
    expect(c.safety).toBe(true);
    expect(c.localContent).toBe(true);
    expect(c.saso).toBe(false);
    expect(out[0].eqVerified).toBe(true);
  });

  it("falls back to individual / unmet when the profile is empty", () => {
    const out = mapBidList({ activeBids: [{ id: "b1", supplier: { supplierProfile: {} } }] });
    expect(out[0].compliance.entityType).toBe("individual");
    expect(out[0].compliance.activityLicense).toBe(false);
    expect(out[0].eqVerified).toBe(false);
  });
});

describe("bidSuppliers", () => {
  const bc = (p: Partial<BidCard>): BidCard => ({
    id: "b", status: "PENDING", supplierId: null, supplierName: "S", verified: false, rating: null,
    distanceKm: null, submittedAt: null, validUntil: null, price: null, mobPrice: null, demobPrice: null,
    priceUnit: null, duration: null, numberOfUnits: 1, unitsOffered: 1, reqMinYear: null, equipment: null, eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
    note: null, requiredCerts: [], heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
    terms: { equipment: [], contract: [], supplier: [] },
    requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
    lockedTerms: [], unreadTerms: [], progress: { agreed: 0, total: 0 }, lastEventAr: null, round: 1,
    uiState: null,
    ...p,
  });

  it("returns distinct suppliers in first-appearance order with counts", () => {
    const s = bidSuppliers([
      bc({ supplierId: "1", supplierName: "A" }),
      bc({ supplierId: "2", supplierName: "B" }),
      bc({ supplierId: "1", supplierName: "A" }),
    ]);
    expect(s.map((x) => x.key)).toEqual(["1", "2"]);
    expect(s[0].count).toBe(2);
    expect(s[1].count).toBe(1);
  });

  it("falls back to name when there's no id, and ORs the verified flag", () => {
    const s = bidSuppliers([
      bc({ supplierId: null, supplierName: "A", verified: false }),
      bc({ supplierId: null, supplierName: "A", verified: true }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].key).toBe("A");
    expect(s[0].verified).toBe(true);
    expect(s[0].count).toBe(2);
  });
});
