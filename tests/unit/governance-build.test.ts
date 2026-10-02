import { describe, expect, it } from "vitest";
import { buildGovernance, type GovernanceInput } from "@/lib/governance/build";
import type { RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";

/**
 * The governance board holds no numbers of its own: every card, every figure and every drill-down
 * reads the object `buildGovernance` returns. So this file is the only place the arithmetic is
 * checked, and the cases below are the ones that actually went wrong in the prototype before the
 * fold was pulled out of the page.
 */

const bid = (over: Partial<BidCard> & Pick<BidCard, "supplierName">): BidCard =>
  ({
    id: "b-" + over.supplierName,
    status: "SUBMITTED",
    supplierId: "sup-" + over.supplierName,
    supplierCompanyId: "co-" + over.supplierName,
    supplierLogoUrl: null,
    verified: true,
    rating: null,
    distanceKm: null,
    submittedAt: "2026-09-07T10:20:00Z",
    validUntil: null,
    price: 1000,
    mobPrice: null,
    demobPrice: null,
    priceUnit: "DAY",
    duration: null,
    numberOfUnits: 1,
    unitsOffered: 1,
    openingPrice: null,
    requestChangedAt: null,
    liveStatus: null,
    lastCounterBy: null,
    reqMinYear: null,
    equipment: null,
    eqVerified: true,
    compliance: {
      entityType: "company",
      activityLicense: true,
      taxNumber: true,
      nationalAddress: true,
      safety: true,
      saso: true,
      localContent: true,
    },
    matchCount: 6,
    conflictCount: 0,
    dealRoomId: null,
    dealRoomStatus: null,
    expired: false,
    note: null,
    ...over,
  }) as BidCard;

const request = (over: Partial<RequestListItem> = {}): RequestListItem =>
  ({
    id: "r1",
    requestGroupId: null,
    projectId: null,
    displayId: "r1",
    code: null,
    groupRef: "RFQ-1042",
    type: "BROADCAST",
    status: "ACCEPTED",
    urgency: null,
    rentalType: null,
    city: null,
    /* 1 to 10 Sep 2026: ten calendar days holding one Friday, the 4th. */
    startDate: "2026-09-01",
    endDate: "2026-09-10",
    durationDays: 10,
    createdAt: "2026-08-28T08:00:00Z",
    expiresAt: null,
    bidCount: 1,
    renteeEditUsed: false,
    requiredCerts: [],
    mobByRentee: null,
    demobByRentee: null,
    item: { name: "Crawler Excavator 20 ton", nameAr: "", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: "sub-exc" },
    ...over,
  }) as RequestListItem;

const input = (over: Partial<GovernanceInput> = {}): GovernanceInput => ({
  requests: [],
  bidsByRequest: {},
  sharesByRequest: {},
  heldByRequest: {},
  marketBySubtype: {},
  projectNames: {},
  registeredSupplierIds: new Set<string>(),
  ...over,
});

describe("buildGovernance", () => {
  it("prices the hire with Fridays out, not rate times calendar days", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" })] },
      }),
    );
    const row = out.R.r1;
    // 10 calendar days, one Friday (4 Sep), so nine are billable.
    expect(row.days).toBe(10);
    expect(row.fri).toBe(1);
    expect(row.billable).toBe(9);
    expect(row.total).toBe("9,000");
  });

  it("drops a request nobody awarded, and says why instead of drawing an empty row", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })],
          r2: [bid({ supplierName: "Nesma" })],
        },
      }),
    );
    expect(Object.keys(out.R)).toEqual(["r1"]);
    expect(out.skipped).toEqual([{ ref: "RFQ-1043", why: "no bid accepted yet" }]);
  });

  it("drops a request with no dates rather than pricing it from a guess", () => {
    const out = buildGovernance(
      input({
        requests: [request({ startDate: null })],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })] },
      }),
    );
    expect(out.R).toEqual({});
    expect(out.skipped[0].why).toMatch(/cannot be priced/);
  });

  it("counts a survey-reported winner, not only a deal-room accept", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", wonViaSurvey: true })] },
      }),
    );
    expect(out.R.r1.winner?.name).toBe("Zahid");
    expect(out.R.r1.bids[0][4]).toBe(1);
  });

  it("marks a bid non-compliant on any conflict, never a share of terms", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({ supplierName: "Cheap", price: 800, conflictCount: 1, matchCount: 5 }),
            bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" }),
          ],
        },
      }),
    );
    expect(out.R.r1.bids.find((b) => b[0] === "Cheap")?.[3]).toBe(0);
    expect(out.R.r1.bids.find((b) => b[0] === "Zahid")?.[3]).toBe(1);
  });

  it("leaves marketplace reach null, and never zero", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1051" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })],
          r2: [bid({ supplierName: "Faisal", status: "ACCEPTED" })],
        },
        sharesByRequest: { r2: { sent: 5, opened: 5 } },
      }),
    );
    // A marketplace request: the platform computes the match and keeps no count of it.
    expect(out.R.r1.opened).toBeNull();
    expect(out.R.r1.channel).toBe("Moedatech marketplace");
    // A link share counts opens, so the denominator is real.
    expect(out.R.r2.opened).toBe(5);
    expect(out.R.r2.channel).toBe("Your own shared link");
  });

  it("calls a direct request what it is: one firm, reach of one", () => {
    const out = buildGovernance(
      input({
        requests: [request({ type: "DIRECT" })],
        bidsByRequest: { r1: [bid({ supplierName: "Al Faisal", status: "ACCEPTED" })] },
      }),
    );
    expect(out.R.r1.channel).toBe("Direct to one named firm");
    expect(out.R.r1.opened).toBe(1);
  });

  it("keeps a registration number a later thinner bid would have erased", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCrNumber: "1010223344" })],
          r2: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCrNumber: null })],
        },
      }),
    );
    expect(out.SUPMETA.Zahid.cr).toBe("1010223344");
  });

  it("reads the minimum-year term off the bid, where the legacy alias is already resolved", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({
              supplierName: "Zahid",
              status: "ACCEPTED",
              reqMinYear: 2018,
              equipment: { id: "e1", make: null, model: null, year: 2015, imageUrl: null },
            }),
          ],
        },
      }),
    );
    expect(out.R.r1.terms).toContainEqual(["Minimum year 2018", "2015", 0]);
  });

  it("treats a certificate that lapsed before the hire began as expired, and one after as expiring", () => {
    const unit = (expiry: string) => ({
      equipmentId: "e1",
      manufacturer: null,
      modelName: null,
      year: null,
      fuelType: null,
      licensePlateNumber: null,
      subcategoryName: null,
      subcategoryNameAr: null,
      measurementName: null,
      measurementNameAr: null,
      documentKeys: [{ type: "TUV", key: "k", url: null, verifyStatus: null, expiryDate: expiry }],
      photoKeys: [],
    });
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", offeredUnitsDetail: [unit("2026-08-20")] as never })],
          r2: [bid({ supplierName: "Nesma", status: "ACCEPTED", offeredUnitsDetail: [unit("2026-12-01")] as never })],
        },
      }),
    );
    expect(Object.values(out.CERT).find((c) => c.firm === "Zahid")?.state).toBe("Expired");
    expect(Object.values(out.CERT).find((c) => c.firm === "Nesma")?.state).toBe("Expiring");
  });

  it("produces no papers for a link bid, because the platform stores none", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        // An off-platform submission carries no offeredUnitsDetail at all.
        bidsByRequest: { r1: [bid({ supplierName: "Faisal", status: "ACCEPTED", offeredUnitsDetail: undefined })] },
        sharesByRequest: { r1: { sent: 5, opened: 3 } },
      }),
    );
    expect(out.CERT).toEqual({});
  });
});
