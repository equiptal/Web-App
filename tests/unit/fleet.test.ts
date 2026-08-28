import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { isPlottable, unitAvailability } from "@/lib/contract/bid-map";
import { canonicalCertCode, computeBidReadiness, computeUnitReadiness, readinessInputsFor } from "@/lib/contract/bid-readiness";
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
    // `in_offer` since 2026-08-13: the fixture is on the offer, so orange. Red now means "he never
    // offered this one", which an unrecognised level says nothing about either way.
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
  it("is NOT GREEN for a listing_yard machine even when yardConfirmed is true", () => {
    // ~~"is RED"~~ — orange since 2026-08-13, because the machine IS offered and only its yard is
    // unnamed. What this test defends is untouched and is the half that matters: the boolean cannot
    // turn a pin green, whatever it says.
    const [m] = mapFleet([row({ locationSource: "listing_yard", yardConfirmed: true })]);
    expect(m.yardConfirmed).toBe(true);
    expect(unitAvailability(m)).toBe("unconfirmed");
    expect(unitAvailability(m)).not.toBe("confirmed");
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
    // …but it is still colourable, not `absent`: it is a real machine with documents to score.
    expect(unitAvailability(m)).toBe("unconfirmed");
    expect(unitAvailability(m)).not.toBe("absent");
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

/* ───────── proof of ownership — scored by CALLER, never by constant (owner, 2026-08-12) ─────────
 *
 * Owner's ruling, 2026-08-12: *"for the percentage use existing bid readiness in the app as source of
 * truth."* That withdraws the "accepted divergence" recorded against **004a §10** — the web scored
 * `total = 1 + certs` unconditionally while the app scores `2 + certs`, so one machine with one set of
 * papers read **50% to the supplier and 100% to the renter**.
 *
 * The fix is NOT a flipped constant, because the exclusion's stated reason is true of exactly one of
 * the two input families this scorer serves:
 *
 *   · **fleet-backed** — `GET /marketplace/bids/{bidId}/fleet`, served UNSTRIPPED by
 *     `supplier-fleet.service.ts` (owner, 2026-08-10). The ownership paper is there. It is scored.
 *   · **bid-backed** — `bid.offeredUnitsDetail`, stripped of `RENTEE_HIDDEN_DOC_TYPES` by
 *     `rentee.service.ts`. The paper can never arrive, so scoring it would hold every supplier
 *     permanently short on evidence the renter is not allowed to see. It stays out.
 *
 * The app models both halves already — `total`/`done` vs `renteeTotal`/`renteeDone` — and these tests
 * pin the web to the same two numbers, chosen by an explicit argument with the SAFE default.
 */
describe("proof of ownership in the fraction — the 2026-08-12 ruling", () => {
  /** A fleet row holding `types`, with both mandatory photos so the only variable is the paperwork. */
  const holding = (...types: string[]): FleetMachine =>
    mapFleet([
      row({
        documentKeys: types.map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
        photoKeys: [{ slot: "front", key: "a", url: "ua" }, { slot: "serial", key: "b", url: "ub" }],
      }),
    ])[0];
  const tuvAsk = readinessInputsFor({ reqEquipmentCerts: ["tuv"] });
  /** The FLEET reading — unstripped rows, so ownership counts (`FLEET_READINESS_OPTS`). */
  const fleetScore = (m: FleetMachine) =>
    computeUnitReadiness(m, tuvAsk.equipCerts, tuvAsk.operatorCerts, tuvAsk.minYear, { scoreOwnership: true });
  /** The default reading — the app's rentee subset, which every unopted caller keeps. */
  const defaultScore = (m: FleetMachine) =>
    computeUnitReadiness(m, tuvAsk.equipCerts, tuvAsk.operatorCerts, tuvAsk.minYear);

  it("the FLEET path scores ownership and reaches 100% with the paper held (the app's `2 + certs`)", () => {
    const r = fleetScore(holding("tuv", "istimara"));
    expect(r.ownershipScored).toBe(true);
    expect(r.ownershipPresent).toBe(true);
    expect(r.total).toBe(3); // photos + ownership + the requested TÜV — `bid_readiness.dart`'s `total`
    expect(r.done).toBe(3);
    expect(r.percent).toBe(100);
    expect(r.band).toBe("green");
  });

  it("a machine missing ONLY its ownership paper is short by exactly one on the fleet path", () => {
    const held = fleetScore(holding("tuv", "istimara"));
    const missing = fleetScore(holding("tuv"));
    expect(missing.ownershipPresent).toBe(false);
    expect(missing.total).toBe(held.total); // the DENOMINATOR does not move — the key is always asked
    expect(missing.done).toBe(held.done - 1); // …exactly one key short, and no more
    expect(missing.percent).toBe(67);
    expect(missing.band).toBe("yellow"); // no longer the green 100% of 004a §10
  });

  it("the BID path is unchanged — ownership is not a key, and the renter's numbers do not move", () => {
    const bid: BidCard = mapBidList({
      activeBids: [
        {
          id: "b1",
          request: { equipmentItems: [{ numberOfUnits: 1, safetyCertifications: ["TUV"] }] },
          offeredUnitsDetail: [
            {
              equipmentId: "eq-1",
              // The wire can never carry these on a bid (`RENTEE_HIDDEN_DOC_TYPES` strips them); one is
              // planted anyway to prove the BID path would not score it even if the strip regressed.
              documentKeys: [{ type: "tuv", key: "k1" }, { type: "istimara", key: "k2" }],
              photoKeys: [{ slot: "front", key: "a" }, { slot: "serial", key: "b" }],
            },
          ],
        },
      ],
    })[0];
    const r = computeBidReadiness(bid)!;
    expect(r.units[0].ownershipScored).toBe(false);
    expect(r.units[0].total).toBe(2); // photos + TÜV — the app's `renteeTotal`, `1 + certs`
    expect(r.units[0].done).toBe(2);
    expect(r.percent).toBe(100);
    // …and the paper's PRESENCE is still reported, so a surface can say "no ownership on file" without
    // reading it out of the fraction.
    expect(r.units[0].ownershipPresent).toBe(true);
  });

  it("defaults to NOT scoring it — an unopted caller keeps the exact fraction it had", () => {
    const m = holding("tuv", "istimara");
    const d = defaultScore(m);
    expect(d.ownershipScored).toBe(false);
    expect(d.total).toBe(2); // photos + TÜV, ownership excluded — the pre-ruling behaviour, preserved
    expect(d.done).toBe(2);
    // Explicit `false` and omitted are the same reading, so a caller can state the safe choice.
    expect(computeUnitReadiness(m, tuvAsk.equipCerts, tuvAsk.operatorCerts, tuvAsk.minYear, { scoreOwnership: false })).toEqual(d);
  });

  it("counts ownership exactly as the app's `kPooDocTypes` does — ANY ONE of the four resolves it", () => {
    // Verbatim from `bid_readiness.dart:11`; the app's `hasPoo` is `docTypes.any(kPooDocTypes.contains)`,
    // so a machine needs one of these, not all of them.
    for (const paper of ["istimara", "customs", "sale_contract", "saso_registration"]) {
      const r = fleetScore(holding("tuv", paper));
      expect(r.ownershipPresent, paper).toBe(true);
      expect(r.percent, paper).toBe(100);
    }
    // Held vocabulary is folded the way every other branch of this scorer folds it, so a spelling
    // difference in whitespace or case cannot silently cost the supplier a key.
    expect(fleetScore(holding("tuv", " Istimara ")).ownershipPresent).toBe(true);
    // A paper that is not one of the four is not ownership — a spec sheet must not close this key.
    expect(fleetScore(holding("tuv", "spec_sheet")).ownershipPresent).toBe(false);
  });

  it("does not let the ownership paper answer a CERTIFICATE ask as well (one paper, one key)", () => {
    // `saso_registration` is ownership (owner, 2026-08-09) and is now scored as such — which must not
    // reopen the fold that once let it satisfy a requested SASO certificate.
    const sasoAsk = readinessInputsFor({ reqEquipmentCerts: ["saso"] });
    const r = computeUnitReadiness(holding("saso_registration"), sasoAsk.equipCerts, sasoAsk.operatorCerts, null, {
      scoreOwnership: true,
    });
    expect(r.ownershipPresent).toBe(true);
    expect(r.equipmentCerts[0].present).toBe(false); // still NOT the certificate
    expect(r.total).toBe(3); // photos + ownership + the requested SASO cert
    expect(r.done).toBe(2); // photos + ownership; the certificate is genuinely missing
  });
});

/**
 * **Which call sites opt in** — the half of the 2026-08-12 ruling no pure-function test can observe.
 *
 * The scorer's default is safe, so a fleet-backed caller that forgets the option produces the renter's
 * smaller fraction over unstripped rows and silently reopens 004a §10 — the failure this ticket exists
 * to close, and it is invisible to a unit test of the scorer itself. Asserted against the source,
 * matching whole CALL EXPRESSIONS rather than the bare word `scoreOwnership`, because every one of
 * these files explains the rule in prose using exactly that word.
 */
describe("the ownership option is wired at the call sites, not just offered", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

  it("both FLEET-backed scorer calls in the machine panel pass `FLEET_READINESS_OPTS`", () => {
    const src = read("src/components/map/panel/machine-panel-model.ts");
    // `matchGrid` and `equipmentDocGroups` — one shared constant so the two cannot answer differently.
    expect(src.match(/computeUnitReadiness\([^)]*FLEET_READINESS_OPTS\)/g)).toHaveLength(2);
    expect(src).toMatch(/const FLEET_READINESS_OPTS = \{ scoreOwnership: true \} as const;/);
    // Positive control: those two ARE every scorer call in the file — none is left on the default.
    // Matched on `(machine,`, the first argument, so the prose reference to `computeUnitReadiness()`
    // in the documents-tab block is not counted as a third call site.
    expect(src.match(/computeUnitReadiness\(machine,/g)).toHaveLength(2);
  });

  it("the equipment card and the filter groups — also fleet rows — pass it too", () => {
    expect(read("src/components/map/equipment-card-model.ts")).toMatch(
      /computeUnitReadiness\(\s*machine,[\s\S]{0,220}?\{ scoreOwnership: true \},?\s*\)/,
    );
    expect(read("src/lib/contract/equipment-list.ts")).toMatch(
      /computeUnitReadiness\(m,[\s\S]{0,120}?\{ scoreOwnership: true \}\)/,
    );
  });

  // NOTE: this file is DISABLED — line-commented in place with the rest of the old requests
  // surfaces (docs/requests-workspace-disabled.md). The assertions still hold because commenting
  // preserves the text, and they are kept deliberately: they are the rule the code must satisfy on
  // the day it is switched back on. They do NOT describe a surface a renter can reach today.
  it("the BID-backed comparison workspace scores no ownership and cannot reach the option", () => {
    const src = read("src/components/compare/BidComparisonWorkspace.tsx");
    expect(src.match(/computeBidReadiness\(/g)).toHaveLength(3); // positive control — the file still scores
    // `computeBidReadiness` is the whole of its access to readiness: it never reaches the per-unit
    // scorer, so it has nowhere to pass an option even by accident.
    expect(src).not.toContain("computeUnitReadiness");
  });

  it("`computeBidReadiness` itself never forwards one — the renter's projection has nothing to score", () => {
    expect(read("src/lib/contract/bid-readiness.ts")).toMatch(
      /computeUnitReadiness\(u, reqEquipCerts, reqOperatorCerts, bid\.reqMinYear\)/,
    );
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

/* ───────── SASO: the registration is OWNERSHIP, the technical inspection is the CERTIFICATE ─────────
 *
 * Owner's ruling, 2026-08-09: *"`saso_registration` is PROOF OF OWNERSHIP. `saso_technical_inspection`
 * is the CERTIFICATE."*
 *
 * `canonicalCertCode` used to fold every `saso*` token into the `saso` family with one `startsWith`
 * test, so a machine carrying nothing but its registration paper scored a held SASO **safety
 * certificate** — a paper it does not have, on a surface whose whole job is to say which papers exist.
 *
 * SASO is no longer offerable as an ask on either client (`options.ts`), so only LEGACY requests reach
 * here; the ask below is spelled `saso`, the way those requests store it. Bare `saso` on the HELD side
 * remains the certificate too — no upload path emits it, but nothing else can mean it.
 *
 * Every assertion in this block passes only after the fix.
 */
describe("SASO — registration vs. certificate (owner's ruling, 2026-08-09)", () => {
  const sasoAsk = readinessInputsFor({ reqEquipmentCerts: ["saso"] });
  const holding = (...types: string[]): FleetMachine =>
    mapFleet([
      row({
        documentKeys: types.map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
        photoKeys: [{ slot: "front", key: "a", url: "ua" }, { slot: "serial", key: "b", url: "ub" }],
      }),
    ])[0];
  const score = (m: FleetMachine) => computeUnitReadiness(m, sasoAsk.equipCerts, sasoAsk.operatorCerts, sasoAsk.minYear);

  it("the ask still normalises to the one SASO family", () => {
    expect(sasoAsk.equipCerts).toEqual(["saso"]);
    expect(readinessInputsFor({ reqEquipmentCerts: ["saso_technical_inspection"] }).equipCerts).toEqual(["saso"]);
  });

  it("a machine holding ONLY saso_registration does NOT satisfy a requested SASO certificate", () => {
    const r = score(holding("saso_registration"));
    expect(r.equipmentCerts).toHaveLength(1);
    expect(r.equipmentCerts[0].code).toBe("saso");
    expect(r.equipmentCerts[0].present).toBe(false);
    // …and the ownership paper is never handed over as the certificate's file to open.
    expect(r.equipmentCerts[0].url).toBeNull();
    expect(r.done).toBe(1); // photos only
    expect(r.total).toBe(2); // photos + the requested SASO cert
    expect(r.band).toBe("yellow"); // not green — the certificate is genuinely missing
  });

  it("a machine holding saso_technical_inspection DOES satisfy it", () => {
    const r = score(holding("saso_technical_inspection"));
    expect(r.equipmentCerts[0].present).toBe(true);
    expect(r.equipmentCerts[0].url).toBe("https://x/saso_technical_inspection");
    expect(r.done).toBe(2);
    expect(r.band).toBe("green");
  });

  it("bare `saso` is read as the certificate — the legacy spelling of the same paper", () => {
    expect(score(holding("saso")).equipmentCerts[0].present).toBe(true);
  });

  it("holding BOTH satisfies the certificate exactly ONCE — one ask, one scored key", () => {
    const r = score(holding("saso_registration", "saso_technical_inspection"));
    expect(r.equipmentCerts).toHaveLength(1);
    expect(r.equipmentCerts[0].present).toBe(true);
    expect(r.equipmentCerts[0].url).toBe("https://x/saso_technical_inspection");
    expect(r.done).toBe(2);
    expect(r.total).toBe(2);
    expect(r.band).toBe("green");
  });

  it("the registration keeps a code of its own — it can never collide with the cert family", () => {
    expect(canonicalCertCode("saso_registration")).toBe("saso_registration");
    expect(canonicalCertCode("SASO Registration")).toBe("saso_registration");
    expect(canonicalCertCode("saso")).toBe("saso");
    expect(canonicalCertCode("saso_technical_inspection")).toBe("saso");
  });
});
