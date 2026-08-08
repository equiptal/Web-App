/**
 * **V5 / V6 / V10** — the equipment list, the landing pre-selection and the certificate chips
 * (spec 004 v3 §6.4, §6.8).
 *
 * Everything these three tickets *decide* is pure: which machines appear, in what order, which one is
 * already selected on arrival, which certificates print as chips, and what an ask looks like on the
 * wire. The components paint what these return and decide nothing of their own, which is what makes
 * V5's list and V10's marker set provably the same set (RM3-AC-15).
 *
 * Fixtures go through `mapFleet` rather than being hand-built `FleetMachine` literals: the parser is
 * the only thing that ever produces one in production, so a test that skipped it could pass on a shape
 * the wire cannot make.
 */

import { describe, expect, it } from "vitest";
import { unitAvailability } from "@/lib/contract/bid-map";
import { landingSelectionId, offeredMachines } from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { composeMachineRequest, isSendableKind } from "@/lib/contract/rentee-request";
import { certificateChips } from "@/components/map/panel/machine-panel-model";

/* ─────────────────────────────────── fixtures ─────────────────────────────────── */

interface RawMachine {
  id: string;
  inBid?: boolean;
  /** §7.2 precedence level — `unit_yard` is the only one that reads as confirmed. */
  source?: string;
  km?: number | null;
  lat?: number | null;
  lng?: number | null;
  docs?: string[];
}

const fleet = (rows: RawMachine[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      locationSource: r.source ?? "listing_yard",
      distanceKm: r.km === undefined ? 10 : r.km,
      lat: r.lat === undefined ? 24.7 : r.lat,
      lng: r.lng === undefined ? 46.7 : r.lng,
      inBid: r.inBid !== false,
      photoKeys: [],
      documentKeys: (r.docs ?? []).map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
    })),
  );

const ids = (ms: readonly FleetMachine[]) => ms.map((m) => m.equipmentId);

/* ────────────────────────── V5 · which machines the list shows ────────────────────────── */

describe("offeredMachines — RM3-AC-09 / AC-10", () => {
  it("keeps only machines this bid offered", () => {
    const list = offeredMachines(
      fleet([
        { id: "offered-a" },
        { id: "owned-only", inBid: false },
        { id: "offered-b" },
      ]),
    );
    // Machines he owns but did not offer are NOT a second list — they are reachable only as an
    // «اطلب معدّة أخرى» request, so they are not represented here at all.
    expect(ids(list)).toEqual(["offered-a", "offered-b"]);
  });

  it("sorts nearest first", () => {
    const list = offeredMachines(fleet([{ id: "far", km: 180 }, { id: "near", km: 4 }, { id: "mid", km: 42 }]));
    expect(ids(list)).toEqual(["near", "mid", "far"]);
  });

  it("puts a machine with no distance LAST, never first", () => {
    // A null read as 0 would put the one machine whose location is unknown at the top of a list
    // ordered by how close it is.
    const list = offeredMachines(fleet([{ id: "unknown", km: null }, { id: "near", km: 3 }]));
    expect(ids(list)).toEqual(["near", "unknown"]);
  });

  it("keeps equal distances in the response's own order", () => {
    const list = offeredMachines(fleet([{ id: "a", km: 10 }, { id: "b", km: 10 }, { id: "c", km: 10 }]));
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  it("drops an `absent` unit — it has nothing for a card to state", () => {
    const list = offeredMachines(fleet([{ id: "real" }, { id: "claimed", source: "unidentified" }]));
    expect(ids(list)).toEqual(["real"]);
    expect(unitAvailability({ locationSource: "unidentified" })).toBe("absent");
  });

  it("keeps a machine that cannot be PLOTTED — the list is the offer, the map is what can be drawn", () => {
    // `locationSource: none` (its yard was deleted) is `unconfirmed`, not `absent`: it still has
    // photos and documents, so the card is meaningful even though the marker is not.
    const list = offeredMachines(fleet([{ id: "no-coords", source: "none", lat: null, lng: null }]));
    expect(ids(list)).toEqual(["no-coords"]);
    expect(unitAvailability(list[0])).toBe("unconfirmed");
  });

  it("does not reorder the caller's array in place", () => {
    const source = fleet([{ id: "far", km: 90 }, { id: "near", km: 1 }]);
    offeredMachines(source);
    expect(ids(source)).toEqual(["far", "near"]);
  });

  it("returns nothing for a supplier who registered no machines (RM3-AC-26)", () => {
    expect(offeredMachines([])).toEqual([]);
    expect(offeredMachines(fleet([{ id: "owned", inBid: false }]))).toEqual([]);
  });
});

/* ────────────────────────── V6 · what is selected on arrival ────────────────────────── */

describe("landingSelectionId — RM3-AC-34", () => {
  it("selects the bid's PRIMARY machine even when another is nearer and confirmed", () => {
    const list = offeredMachines(
      fleet([
        { id: "near-confirmed", km: 2, source: "unit_yard" },
        { id: "primary", km: 90, source: "listing_yard" },
      ]),
    );
    // The primary is what the supplier committed and what the deal room is about.
    expect(landingSelectionId("primary", list)).toBe("primary");
  });

  it("falls back to the first CONFIRMED machine when the primary is absent from the fleet", () => {
    const list = offeredMachines(
      fleet([
        { id: "near-unconfirmed", km: 2, source: "listing_yard" },
        { id: "mid-confirmed", km: 20, source: "unit_yard" },
        { id: "far-confirmed", km: 80, source: "unit_yard" },
      ]),
    );
    expect(landingSelectionId("not-in-this-fleet", list)).toBe("mid-confirmed");
  });

  it("falls back when the primary was owned but not offered", () => {
    const list = offeredMachines(fleet([{ id: "primary", inBid: false }, { id: "offered", source: "unit_yard" }]));
    expect(landingSelectionId("primary", list)).toBe("offered");
  });

  it("selects nothing when there is no primary and nothing is confirmed", () => {
    // An accent and a nine-second pulse on an arbitrary card read as a recommendation.
    const list = offeredMachines(fleet([{ id: "a", source: "listing_yard" }, { id: "b", source: "bid_yard" }]));
    expect(landingSelectionId(null, list)).toBeNull();
    expect(landingSelectionId("", list)).toBeNull();
    expect(landingSelectionId(undefined, list)).toBeNull();
  });

  it("selects nothing from an empty list", () => {
    expect(landingSelectionId("primary", [])).toBeNull();
  });

  it("ignores surrounding whitespace on the primary id", () => {
    const list = offeredMachines(fleet([{ id: "primary" }]));
    expect(landingSelectionId("  primary  ", list)).toBe("primary");
  });
});

/* ────────────────────────── V5 · the certificate chips ────────────────────────── */

describe("certificateChips — RM3-AC-11", () => {
  const chips = (docs: string[]) => certificateChips(fleet([{ id: "eq", docs }])[0]);

  it("prints the safety certificates the MACHINE holds", () => {
    expect(chips(["tuv", "spsp"]).map((c) => c.en)).toEqual(["TÜV", "SPSP"]);
  });

  it("prints nothing for a machine with none — the card then states the absence explicitly", () => {
    expect(chips([])).toEqual([]);
  });

  it("never prints a proof-of-ownership or an operator paper as a certificate", () => {
    // The allow-list is deliberate: a chip reading "ISTIMARA" beside TÜV would tell the renter a
    // safety paper is on file when a registration document is.
    expect(chips(["istimara", "customs_certificate", "operator_tuv", "spec_sheet", "other"])).toEqual([]);
  });

  it("collapses the SASO family onto one chip", () => {
    expect(chips(["saso", "saso_technical_inspection", "saso_technical"]).map((c) => c.en)).toEqual(["SASO"]);
  });

  it("prints one chip for a certificate uploaded twice", () => {
    expect(chips(["tuv", "TUV", "tüv"]).map((c) => c.en)).toEqual(["TÜV"]);
  });

  it("carries both locales on every chip", () => {
    for (const chip of chips(["tuv", "aramco", "insurance"])) {
      expect(chip.en.trim()).not.toBe("");
      expect(chip.ar.trim()).not.toBe("");
    }
  });
});

/* ────────────────────────── V5 / V7 · the ask, on the wire ────────────────────────── */

describe("composeMachineRequest — RM3-AC-17 / AC-07", () => {
  it("scopes a named machine to `equipment`", () => {
    expect(composeMachineRequest("availability", "eq-1")).toEqual({
      scope: "equipment",
      equipmentId: "eq-1",
      kind: "availability",
    });
  });

  it("scopes an ask with no machine to `company` — the pair the backend accepts", () => {
    expect(composeMachineRequest("alternative", null)).toEqual({
      scope: "company",
      equipmentId: null,
      kind: "alternative",
    });
    expect(composeMachineRequest("alternative", "   ")).toEqual({
      scope: "company",
      equipmentId: null,
      kind: "alternative",
    });
  });

  it("carries the machine as DATA, not only in prose", () => {
    const draft = composeMachineRequest("availability", "eq-9");
    expect(draft.equipmentId).toBe("eq-9");
  });

  it("puts several document types on ONE card, deduped and blank-free", () => {
    const draft = composeMachineRequest("document", "eq-1", ["tuv", "tuv", " ", "istimara"]);
    expect(draft.docTypes).toEqual(["tuv", "istimara"]);
  });

  it("adds no `docTypes` to a kind that has none", () => {
    expect(composeMachineRequest("availability", "eq-1").docTypes).toBeUndefined();
  });

  it("cannot emit the retired kind", () => {
    // `add_to_offer` is rejected with a 400 server-side; nothing on this surface may compose it.
    expect(isSendableKind("add_to_offer")).toBe(false);
    for (const kind of ["availability", "document", "alternative"] as const) {
      expect(isSendableKind(composeMachineRequest(kind, "eq-1").kind)).toBe(true);
    }
  });
});

/* ────────────────────────── V10 · the list and the marker set agree ────────────────────────── */

describe("the marker set is the list minus what cannot be drawn — RM3-AC-15 / AC-22", () => {
  const plottable = (m: FleetMachine) => m.lat != null && m.lng != null;

  it("draws a marker only for a machine that is in the list", () => {
    const all = fleet([
      { id: "offered-plottable" },
      { id: "offered-no-coords", source: "none", lat: null, lng: null },
      { id: "owned-only", inBid: false },
      { id: "claimed", source: "unidentified" },
    ]);
    const list = offeredMachines(all);
    const drawn = list.filter(plottable);

    expect(ids(list)).toEqual(["offered-plottable", "offered-no-coords"]);
    expect(ids(drawn)).toEqual(["offered-plottable"]);
    // Every drawn machine has a card; the reverse is not required, and the one difference is stated.
    for (const m of drawn) expect(ids(list)).toContain(m.equipmentId);
  });

  it("gives every drawn machine a colour that came from `unitAvailability`, never `yardConfirmed`", () => {
    const drawn = offeredMachines(
      mapFleet([
        // The trap: `yardConfirmed: true` on an inferred level. Supplier-side the boolean is just
        // `yardId != null`, so reading it for colour turns the whole map green.
        { equipmentId: "trap", locationSource: "listing_yard", yardConfirmed: true, lat: 24, lng: 46, inBid: true },
        { equipmentId: "real", locationSource: "unit_yard", yardConfirmed: false, lat: 24, lng: 46, inBid: true },
      ]),
    ).filter(plottable);

    expect(drawn.map((m) => unitAvailability(m))).toEqual(["unconfirmed", "confirmed"]);
  });
});
