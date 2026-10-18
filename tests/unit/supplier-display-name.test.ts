import { describe, expect, it } from "vitest";
import { mapBid, readSupplierDisplayName } from "@/lib/contract/bids";

/**
 * A firm's bid as `GET /marketplace/received-bids` sends it on staging (firm 2272421e, user 47):
 * the backend names the firm in `supplierDisplayName`, then deletes `supplier.company`, and the
 * colleague who sent it rides in `submittedByName`.
 */
const firmBid = {
  supplierDisplayName: "banana",
  submittedByName: "habiballa awab",
  supplier: { id: "47", firstName: "habiballa", lastName: "awab", supplierProfile: { companyName: null } },
};

describe("the supplier's name: firm, then the backend's name, then the person", () => {
  it("names the firm the backend resolved, never the person, when the company row was stripped", () => {
    expect(readSupplierDisplayName(firmBid)).toBe("banana");
  });

  it("never reads submittedByName as the supplier", () => {
    expect(readSupplierDisplayName({ ...firmBid, supplierDisplayName: null })).toBe("habiballa awab");
    expect(readSupplierDisplayName({ submittedByName: "someone", supplier: {} })).toBe("Supplier");
  });

  it("keeps the payload's own firm first, legal name ahead of the profile's", () => {
    const raw = {
      supplierDisplayName: "backend says",
      supplier: { firstName: "a", lastName: "b", company: { legalName: "Registered Co" }, supplierProfile: { companyName: "Trade Co" } },
    };
    expect(readSupplierDisplayName(raw)).toBe("Registered Co");
  });

  it("falls to the person only when neither the payload nor the backend names a firm", () => {
    expect(readSupplierDisplayName({ supplier: { firstName: "Murad", lastName: "alabdullah" } })).toBe("Murad alabdullah");
  });

  it("the bid card's mapper reads the same order", () => {
    expect(mapBid(firmBid as Record<string, unknown>, false).supplierName).toBe("banana");
  });
});
