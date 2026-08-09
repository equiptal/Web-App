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

/* RMAP-AC-19 — spec 001 v2's "no resolvable location, no pin". NOT RM3-AC-19, which is the criterion
   that a pin and its card chip take colour from the same derivation; nothing links the two but the
   integer. The live analogue of what this asserts is RM3-AC-22, and it is proved — including the
   `unidentified` case this file has no fixture for — in `bid-map.test.ts`. */
describe("what gets plotted (RMAP-AC-19) — coordinates only", () => {
  it("plots a machine with both coordinates", () => {
    expect(isPlottable(mapFleet([row()])[0])).toBe(true);
  });

  it("does NOT plot a half-resolved point (RMAP-AC-06)", () => {
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
  const inputs = readinessInputsFor({ reqEquipmentCerts: ["tuv", "saso_technical_inspection"], operatorCertReq: "SPSP", reqMinYear: 2020 });

  it("normalises the request-side asks exactly as computeBidReadiness does", () => {
    expect(inputs.equipCerts).toEqual(["tuv", "saso"]);
    // The operator ask is a request CODE translated into the document kind a machine carries — it is
    // not passed through as a token the way the equipment families are.
    expect(inputs.operatorCerts).toEqual(["operator_spsp"]);
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
          { type: "operator_spsp", key: "k3" },
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

/* ─────────── operator certificates — parity with the app's table ───────────
 *
 * Owner's ruling, 2026-08-08: *"fix the web to be like the app — always align with the app."* The app's
 * `bid_readiness.dart` translates the renter's request CODE into the document KIND a machine actually
 * carries, through an explicit table, and matches that kind EXACTLY against the unit's own
 * `documentKeys[].type`:
 *
 *     const kOperatorReqCodeToDocKind = {
 *       'TUV': 'operator_tuv',
 *       'SPSP': 'operator_spsp',
 *       'CERTIFIED': 'operating_license',
 *       'SAFETY_CERT': 'operating_license',
 *       'SAFETY': 'operating_license',
 *     };
 *
 * **The old web behaviour, which these tests exist to keep out.** The web had no table: `canonicalCertCode`
 * stripped an `operator_` prefix and compared strings. So an asked-for `CERTIFIED` became `certified` and
 * hunted for a document called `certified` that no machine has ever carried, and `operating_license` — the
 * paper the lessor had actually filed — carried no `operator_` prefix to strip and never lined up either.
 * The renter's panel read RED on an operator certificate the lessor's own app read GREEN, on the same
 * machine with the same papers.
 */
describe("operator certs — the app's `kOperatorReqCodeToDocKind`, case by case", () => {
  const unitWith = (types: string[]) =>
    mapFleet([
      row({
        documentKeys: types.map((type, i) => ({ type, key: `k${i}` })),
        photoKeys: [{ slot: "front", key: "a" }, { slot: "serial", key: "b" }],
      }),
    ])[0];
  /** Score a machine holding `held` against a request asking `ask`, with no equipment certs and no year. */
  const score = (ask: string, held: string[]) => {
    const inputs = readinessInputsFor({ reqEquipmentCerts: [], operatorCertReq: ask, reqMinYear: null });
    return computeUnitReadiness(unitWith(held), inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
  };
  const codes = (ask: string) => readinessInputsFor({ operatorCertReq: ask }).operatorCerts;

  it("TUV is satisfied by a held `operator_tuv`", () => {
    expect(codes("TUV")).toEqual(["operator_tuv"]);
    expect(score("TUV", ["operator_tuv"]).operatorCerts.map((c) => c.present)).toEqual([true]);
  });

  it("SPSP is satisfied by a held `operator_spsp`", () => {
    expect(codes("SPSP")).toEqual(["operator_spsp"]);
    expect(score("SPSP", ["operator_spsp"]).operatorCerts.map((c) => c.present)).toEqual([true]);
  });

  it("CERTIFIED, SAFETY_CERT and SAFETY are all satisfied by a held `operating_license`", () => {
    for (const ask of ["CERTIFIED", "SAFETY_CERT", "SAFETY"]) {
      expect(codes(ask)).toEqual(["operating_license"]);
      expect(score(ask, ["operating_license"]).operatorCerts.map((c) => c.present)).toEqual([true]);
    }
  });

  it("THE REGRESSION — an asked-for CERTIFIED against a filed `operating_license` now reads GREEN", () => {
    // Before the port this machine read RED on the renter's panel while the lessor's app read GREEN:
    // the ask normalised to `certified`, a document nobody carries. Photos + the licence = everything
    // this request scores.
    const r = score("CERTIFIED", ["operating_license"]);
    expect(r.operatorCerts.map((c) => [c.code, c.present])).toEqual([["operating_license", true]]);
    expect(r.done).toBe(r.total);
    expect(r.band).toBe("green");
  });

  it("an unmapped code produces NO cert row at all — never a permanently red one", () => {
    // `GRADE-1` names no document a lessor could ever upload, so scoring it would hold him one key short
    // for good. The app drops it; so does this. The machine is then complete on its photos alone.
    expect(codes("GRADE-1")).toEqual([]);
    const r = score("GRADE-1", []);
    expect(r.operatorCerts).toEqual([]);
    expect(r.total).toBe(1); // the mandatory photos, and nothing else
    expect(r.band).toBe("green");
  });

  it("keeps the mapped codes out of a list that also carries an unmapped one", () => {
    expect(codes("TUV, GRADE-1, SPSP")).toEqual(["operator_tuv", "operator_spsp"]);
  });

  it("splits a comma-separated list and scores every mapped code", () => {
    const r = score("TUV,SPSP,CERTIFIED", ["operator_tuv", "operating_license"]);
    expect(r.operatorCerts.map((c) => [c.code, c.present])).toEqual([
      ["operator_tuv", true],
      ["operator_spsp", false],
      ["operating_license", true],
    ]);
    expect(r.total).toBe(4); // photos + three operator certs
    expect(r.done).toBe(3);
  });

  it("uppercases and trims each code, and folds the licence's three names into ONE key", () => {
    expect(codes(" tuv , Spsp ")).toEqual(["operator_tuv", "operator_spsp"]);
    expect(codes("CERTIFIED,SAFETY_CERT,SAFETY")).toEqual(["operating_license"]);
    expect(codes("")).toEqual([]);
    expect(codes(",,")).toEqual([]);
  });

  it("still reads RED for a mapped cert the machine does not hold", () => {
    const r = score("SPSP", ["operator_tuv"]);
    expect(r.operatorCerts.map((c) => c.present)).toEqual([false]);
    expect(r.band).toBe("yellow"); // photos only: 1 of 2
  });

  it("does NOT move the equipment certs — a held `operator_tuv` still cannot answer an equipment TÜV", () => {
    const inputs = readinessInputsFor({ reqEquipmentCerts: ["tuv"], operatorCertReq: null });
    const r = computeUnitReadiness(unitWith(["operator_tuv"]), inputs.equipCerts, inputs.operatorCerts, null);
    expect(r.equipmentCerts.map((c) => [c.code, c.present])).toEqual([["tuv", false]]);
    expect(r.operatorCerts).toEqual([]);
  });

  /**
   * **The HELD side, which `bids.ts` copies off the wire verbatim.**
   *
   * Given a machine holds an operator paper, When the wire spells its `type` in any case or with
   * stray spacing, Then the paper scores in the operator bucket — and never falls between the two.
   *
   * The regression this pins: the `isOp` router lowercased its copy before testing `startsWith
   * ("operator")`, so `OPERATOR_TUV` was pushed OUT of the equipment bucket; but `docTypeUrl` was
   * keyed by the raw string, so the operator bucket's exact-equality lookup for `operator_tuv` missed
   * it too. **The paper scored in NEITHER** — the machine read red on `GroupBids`, `RequestBids`,
   * `BidComparisonWorkspace` and `BidReadiness` for a certificate it holds.
   */
  describe("a held paper is folded the same way the ask is, so the two meet", () => {
    const spellings = ["OPERATOR_TUV", " operator_tuv", "operator_tuv ", "Operator_TUV", "operator-tuv", "Operator TUV"];

    it.each(spellings)("a held %j answers an asked-for TUV", (held) => {
      const r = score("TUV", [held]);
      expect(r.operatorCerts.map((c) => [c.code, c.present])).toEqual([["operator_tuv", true]]);
      expect(r.done).toBe(r.total);
      expect(r.band).toBe("green");
    });

    it("the licence and SPSP spellings fold too", () => {
      expect(score("CERTIFIED", ["OPERATING_LICENSE"]).operatorCerts.map((c) => c.present)).toEqual([true]);
      expect(score("CERTIFIED", [" Operating License "]).operatorCerts.map((c) => c.present)).toEqual([true]);
      expect(score("SPSP", ["Operator-SPSP"]).operatorCerts.map((c) => c.present)).toEqual([true]);
    });

    it("scores in exactly ONE bucket — an odd-cased operator paper is still not an equipment cert", () => {
      // The other half of the bug: whichever way `isOp` goes, the paper must land somewhere. It must
      // NOT land in both, or a held `OPERATOR_TUV` would start answering an equipment TÜV ask.
      const inputs = readinessInputsFor({ reqEquipmentCerts: ["tuv"], operatorCertReq: "TUV" });
      const r = computeUnitReadiness(unitWith(["OPERATOR_TUV"]), inputs.equipCerts, inputs.operatorCerts, null);
      expect(r.equipmentCerts.map((c) => [c.code, c.present])).toEqual([["tuv", false]]);
      expect(r.operatorCerts.map((c) => [c.code, c.present])).toEqual([["operator_tuv", true]]);
    });

    it("an oddly-cased EQUIPMENT cert still answers its own ask", () => {
      // `heldDocType` runs ahead of `canonicalCertCode`, which already normalised; folding twice must
      // not move the equipment side at all.
      const inputs = readinessInputsFor({ reqEquipmentCerts: ["tuv"], operatorCertReq: null });
      const r = computeUnitReadiness(unitWith([" TUV "]), inputs.equipCerts, inputs.operatorCerts, null);
      expect(r.equipmentCerts.map((c) => [c.code, c.present])).toEqual([["tuv", true]]);
    });

    it("a paper the machine does not hold is still absent, however it is spelled", () => {
      expect(score("SPSP", ["OPERATOR_TUV"]).operatorCerts.map((c) => c.present)).toEqual([false]);
    });
  });
});

describe("computeBidReadiness is unchanged by the extraction (the mobile app mirrors it)", () => {
  const bid: BidCard = mapBidList({
    activeBids: [
      {
        id: "b1",
        request: { equipmentItems: [{ numberOfUnits: 2, safetyCertifications: ["TUV"], operatorLicenseLevel: "SPSP", minimumEquipmentYear: 2020 }] },
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
    expect(r!.units[0].total).toBe(3); // photos + TÜV + operator SPSP
    expect(r!.percent).toBe(67);
  });

  it("returns null for an off-platform bid, which has no offeredUnitsDetail (RMAP-AC-59)", () => {
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
