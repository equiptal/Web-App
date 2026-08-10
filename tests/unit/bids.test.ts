import { describe, it, expect } from "vitest";
import { mapBidList, bidSuppliers, mapOfferedUnit, type BidCard } from "@/lib/contract/bids";

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
  it("treats an EMPTY units_offered array as 'bid the request as posted' (not 0)", () => {
    // Regression: empty array → 0 made the header tile read 0/N while the card said 'covers N of N'.
    const out = mapBidList({ activeBids: [{ id: "b1", unitsOffered: [], ...req }] });
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

describe("mapBidList — supplierName precedence", () => {
  it("shows the supplier's profile company name over the verification-queue company row", () => {
    const out = mapBidList({
      activeBids: [{
        id: "b1",
        supplierDisplayName: "Ops Typo Co", // backend resolves company.name first — we don't
        supplier: {
          id: 7, firstName: "Yara", lastName: "Test", supplierStatus: 2,
          supplierProfile: { companyName: "Al Ghadeer Est." },
          company: { name: "Ops Typo Co", isVerified: true },
        },
      }],
    });
    expect(out[0].supplierName).toBe("Al Ghadeer Est.");
    expect(out[0].verified).toBe(true); // name source doesn't touch the verified signal
  });

  it("falls back to the verified firm's brand, then the person's name", () => {
    const brand = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 7, firstName: "Yara", lastName: "Test", company: { name: "Gulf Co", isVerified: true } } }] });
    expect(brand[0].supplierName).toBe("Gulf Co");
    const person = mapBidList({ activeBids: [{ id: "b1", supplier: { id: 7, firstName: "Yara", lastName: "Test" } }] });
    expect(person[0].supplierName).toBe("Yara Test");
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
    id: "b", status: "PENDING", supplierId: null, supplierCompanyId: null, supplierName: "S", verified: false, rating: null,
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

/**
 * The backend signs a document by OVERWRITING `key` — `toSignedStructured` returns
 * `{...entry, key: <presigned URL>}` and never fills `url`. Every consumer on this side reads
 * `url`, so before this was resolved a real document rendered with no view control, no thumbnail,
 * and could not be put in the download batch.
 *
 * The payloads below are the shape staging actually returned on 2026-08-10 with seeded documents.
 */
describe("mapOfferedUnit — the openable link (backend signs into `key`, not `url`)", () => {
  const SIGNED =
    "https://moedatech-staging-eu.s3.eu-central-1.amazonaws.com/default/equipment/documents/1786381128000-istimara-seed.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fa6f";

  it("resolves a document's url from the presigned key when url is null", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara", key: SIGNED, url: null }] });
    expect(u.documentKeys[0].url).toBe(SIGNED);
    // `key` stays as-is — it is still the row's identity for dedupe.
    expect(u.documentKeys[0].key).toBe(SIGNED);
  });

  it("resolves a photo's url the same way", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", photoKeys: [{ slot: "front", key: SIGNED, url: null }] });
    expect(u.photoKeys[0].url).toBe(SIGNED);
  });

  it("passes an explicit url through verbatim — it is the backend's own answer", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "tuv", key: SIGNED, url: "https://cdn/explicit.pdf" }] });
    expect(u.documentKeys[0].url).toBe("https://cdn/explicit.pdf");
  });

  it("does not second-guess an explicit url's shape — the http test is for the key fallback only", () => {
    // `fleet.test.ts` has always asserted a bare "u1" passes through. Applying the absolute-link
    // test to the explicit url too silently nulled it, which is how this was caught.
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "tuv", key: "k1", url: "u1" }] });
    expect(u.documentKeys[0].url).toBe("u1");
  });

  it("does NOT invent a url from a bare S3 key", () => {
    // No bucket origin is known here, so a fabricated link would look live and 404. Null keeps the
    // row rendering without a view action, which is what an unopenable paper should do.
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara", key: "default/equipment/documents/x.pdf", url: null }] });
    expect(u.documentKeys[0].url).toBeNull();
    expect(u.documentKeys[0].key).toBe("default/equipment/documents/x.pdf");
  });

  it("leaves a row with neither url nor key unopenable", () => {
    const u = mapOfferedUnit({ equipmentId: "eq-1", documentKeys: [{ type: "istimara" }] });
    expect(u.documentKeys[0].url).toBeNull();
  });
});
