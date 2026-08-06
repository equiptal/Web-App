import { describe, it, expect } from "vitest";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { isPlottable, unitAvailability } from "@/lib/contract/bid-map";
import { computeBidReadiness, computeUnitReadiness, readinessInputsFor } from "@/lib/contract/bid-readiness";
import { mapBidList, type BidCard } from "@/lib/contract/bids";

/**
 * RMAP T16 — the fleet payload (`GET /marketplace/bids/{bidId}/fleet`) and the per-machine readiness
 * scorer the map's pins are built from.
 *
 * Every assertion here is a rule the PIN depends on: what gets drawn, what colour it takes, and how
 * many segments its readiness bar has. A break means the map has started asserting something the
 * payload does not say.
 */

const row = (p: Record<string, unknown> = {}) => ({
  equipmentId: "eq-1",
  serialNumber: "SN-9",
  manufacturer: "Cat",
  modelName: "320D",
  year: 2021,
  documentKeys: [],
  photoKeys: [],
  yardId: "y1",
  yardName: "Dammam yard",
  yardCity: "Dammam",
  yardConfirmed: true,
  lat: 26.4,
  lng: 50.1,
  distanceKm: 12,
  locationSource: "unit_yard",
  inBid: true,
  ...p,
});

describe("mapFleet — envelope shapes", () => {
  it("parses a bare array", () => {
    expect(mapFleet([row()])).toHaveLength(1);
  });

  it("parses the {fleet} / {machines} / {data} wrappers a different projection could send", () => {
    expect(mapFleet({ fleet: [row()] })).toHaveLength(1);
    expect(mapFleet({ machines: [row()] })).toHaveLength(1);
    expect(mapFleet({ data: [row()] })).toHaveLength(1);
  });

  it("returns an empty list for anything it cannot read — never throws onto the map", () => {
    expect(mapFleet(null)).toEqual([]);
    expect(mapFleet(undefined)).toEqual([]);
    expect(mapFleet({})).toEqual([]);
    expect(mapFleet("nope")).toEqual([]);
  });
});

describe("mapFleet — the three fleet-only fields", () => {
  it("reads serialNumber / inBid / yardConfirmed in camelCase", () => {
    const [m] = mapFleet([row({ inBid: false, yardConfirmed: false })]);
    expect(m.serialNumber).toBe("SN-9");
    expect(m.inBid).toBe(false);
    expect(m.yardConfirmed).toBe(false);
  });

  it("reads them in snake_case too", () => {
    const [m] = mapFleet([
      { equipmentId: "eq-2", serial_number: "SN-2", in_bid: true, yard_confirmed: true, documentKeys: [], photoKeys: [] },
    ]);
    expect(m.serialNumber).toBe("SN-2");
    expect(m.inBid).toBe(true);
    expect(m.yardConfirmed).toBe(true);
  });

  it("defaults inBid to FALSE when the field is absent — a missing flag must never promote a machine into an offer", () => {
    const { inBid, ...noFlag } = row();
    void inBid;
    const [m] = mapFleet([noFlag]);
    expect(m.inBid).toBe(false);
  });

  it("defaults yardConfirmed to false and serialNumber to null when absent", () => {
    const [m] = mapFleet([{ equipmentId: "eq-3" }]);
    expect(m.yardConfirmed).toBe(false);
    expect(m.serialNumber).toBeNull();
  });

  it("treats a non-boolean inBid as false rather than truthy", () => {
    const [m] = mapFleet([row({ inBid: "yes" })]);
    expect(m.inBid).toBe(false);
  });
});

describe("mapFleet — the machine half is the SAME parse as offeredUnitsDetail", () => {
  it("carries documents, photos, coordinates and the location level through", () => {
    const [m] = mapFleet([
      row({
        document_keys: [{ type: "TUV", key: "k1", url: "u1", verify_status: "VERIFIED", expiry_date: "2027-01-01" }],
        photo_keys: [{ slot: "front", key: "p1", url: "pu1" }],
        documentKeys: undefined,
        photoKeys: undefined,
      }),
    ]);
    expect(m.documentKeys).toEqual([{ type: "TUV", key: "k1", url: "u1", verifyStatus: "VERIFIED", expiryDate: "2027-01-01" }]);
    expect(m.photoKeys).toEqual([{ slot: "front", key: "p1", url: "pu1" }]);
    expect(m.lat).toBe(26.4);
    expect(m.lng).toBe(50.1);
    expect(m.locationSource).toBe("unit_yard");
  });

  it("refuses an unrecognised location level rather than guessing one", () => {
    const [m] = mapFleet([row({ locationSource: "supplier_hq" })]);
    // Undefined, not `unit_yard` — the only value that could turn a pin green.
    expect(m.locationSource).toBeUndefined();
    expect(unitAvailability(m)).toBe("unconfirmed");
  });
});

describe("mapFleet — rows the map cannot represent", () => {
  it("drops a row with no equipmentId (the pin's identity, selection key and de-collision key)", () => {
    expect(mapFleet([row({ equipmentId: "" }), row({ equipmentId: undefined, id: undefined })])).toEqual([]);
  });

  it("keeps the FIRST of two rows sharing an equipmentId — two pins on one machine is not representable", () => {
    const out = mapFleet([row({ serialNumber: "first" }), row({ serialNumber: "second" })]);
    expect(out).toHaveLength(1);
    expect(out[0].serialNumber).toBe("first");
  });
});

describe("the pin's colour comes from unitAvailability, never from yardConfirmed", () => {
  it("is RED for a listing_yard machine even when yardConfirmed is true", () => {
    const [m] = mapFleet([row({ locationSource: "listing_yard", yardConfirmed: true })]);
    expect(m.yardConfirmed).toBe(true);
    expect(unitAvailability(m)).toBe("unconfirmed");
  });

  it("is GREEN for a unit_yard machine even when yardConfirmed is false", () => {
    const [m] = mapFleet([row({ locationSource: "unit_yard", yardConfirmed: false })]);
    expect(unitAvailability(m)).toBe("confirmed");
  });
});

describe("what gets plotted (AC-19) — coordinates only", () => {
  it("plots a machine with both coordinates", () => {
    expect(isPlottable(mapFleet([row()])[0])).toBe(true);
  });

  it("does NOT plot a half-resolved point (AC-06)", () => {
    expect(isPlottable(mapFleet([row({ lat: 26.4, lng: null })])[0])).toBe(false);
    expect(isPlottable(mapFleet([row({ lat: null, lng: 50.1 })])[0])).toBe(false);
  });

  it("does NOT plot a registered machine whose every level resolved to none", () => {
    const [m] = mapFleet([row({ locationSource: "none", lat: null, lng: null })]);
    expect(isPlottable(m)).toBe(false);
    // …but it is still `unconfirmed`, not `absent`: it is a real machine with documents to score.
    expect(unitAvailability(m)).toBe("unconfirmed");
  });
});

describe("computeUnitReadiness — one scorer for machines with and without a bid", () => {
  const inputs = readinessInputsFor({ reqEquipmentCerts: ["tuv", "saso_technical_inspection"], operatorCertReq: "grade-1", reqMinYear: 2020 });

  it("normalises the request-side asks exactly as computeBidReadiness does", () => {
    expect(inputs.equipCerts).toEqual(["tuv", "saso"]);
    expect(inputs.operatorCerts).toEqual(["grade-1"]);
    expect(inputs.minYear).toBe(2020);
  });

  it("scores a fleet machine the bid never offered (it has no BidCard of its own)", () => {
    const [m] = mapFleet([
      row({
        inBid: false,
        documentKeys: [{ type: "tuv", key: "k", url: "u" }],
        photoKeys: [{ slot: "front", key: "a", url: "ua" }, { slot: "serial_plate", key: "b", url: "ub" }],
      }),
    ]);
    const r = computeUnitReadiness(m, inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
    // 1 photos slot + 2 equipment certs + 1 operator cert = 4; photos + TÜV held = 2.
    expect(r.total).toBe(4);
    expect(r.done).toBe(2);
    expect(r.band).toBe("yellow");
  });

  it("gives a fully documented machine a green band and a full bar", () => {
    const [m] = mapFleet([
      row({
        documentKeys: [
          { type: "tuv", key: "k1" },
          { type: "saso", key: "k2" },
          { type: "operator_grade-1", key: "k3" },
        ],
        photoKeys: [{ slot: "front", key: "a" }, { slot: "serial", key: "b" }],
      }),
    ]);
    const r = computeUnitReadiness(m, inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
    expect(r.done).toBe(r.total);
    expect(r.band).toBe("green");
  });

  it("gives an undocumented machine a red band — the bar is empty, the pin is still drawn", () => {
    const [m] = mapFleet([row()]);
    const r = computeUnitReadiness(m, inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
    expect(r.done).toBe(0);
    expect(r.band).toBe("red");
    expect(r.total).toBeGreaterThan(0); // always ≥1 — the mandatory-photos slot
  });
});

describe("computeBidReadiness is unchanged by the extraction (the mobile app mirrors it)", () => {
  const bid: BidCard = mapBidList({
    activeBids: [
      {
        id: "b1",
        request: { equipmentItems: [{ numberOfUnits: 2, safetyCertifications: ["TUV"], operatorLicenseLevel: "grade-1", minimumEquipmentYear: 2020 }] },
        offeredUnitsDetail: [
          {
            equipmentId: "eq-1",
            year: 2021,
            documentKeys: [{ type: "tuv", key: "k1" }],
            photoKeys: [{ slot: "front", key: "a" }, { slot: "serial", key: "b" }],
          },
        ],
      },
    ],
  })[0];

  it("still returns the same aggregate for a bid's own units", () => {
    const r = computeBidReadiness(bid);
    expect(r).not.toBeNull();
    expect(r!.units).toHaveLength(1);
    expect(r!.units[0].done).toBe(2); // photos + TÜV
    expect(r!.units[0].total).toBe(3); // photos + TÜV + operator grade-1
    expect(r!.percent).toBe(67);
  });

  it("returns null for an off-platform bid, which has no offeredUnitsDetail (AC-59)", () => {
    expect(computeBidReadiness({ ...bid, offeredUnitsDetail: undefined })).toBeNull();
  });

  it("scores a bid's own unit identically through the exported per-unit scorer", () => {
    const inputs = readinessInputsFor(bid);
    const direct = computeUnitReadiness(bid.offeredUnitsDetail![0], inputs.equipCerts, inputs.operatorCerts, bid.reqMinYear);
    expect(direct).toEqual(computeBidReadiness(bid)!.units[0]);
  });
});

describe("the fleet type is assignable where an offered unit is expected", () => {
  it("lets a FleetMachine flow into every bid-map selector unchanged", () => {
    const m: FleetMachine = mapFleet([row()])[0];
    // Compile-time proof as much as a runtime one: these all take `Pick<OfferedUnitDetail, …>`.
    expect(unitAvailability(m)).toBe("confirmed");
    expect(isPlottable(m)).toBe(true);
  });
});
