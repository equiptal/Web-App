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
import {
  DISTANCE_BANDS_KM,
  equipmentFilters,
  equipmentListView,
  filterMachines,
  landingSelectionId,
  offeredMachines,
  type EquipmentFilterRequest,
} from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { composeDocumentRequest, composeMachineRequest, isSendableKind } from "@/lib/contract/rentee-request";
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
  year?: number | null;
}

const fleet = (rows: RawMachine[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: r.year === undefined ? 2022 : r.year,
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

  it("scopes an `alternative` with no machine to `company` — the pair the backend accepts", () => {
    // The shortfall's sibling, and the ONLY surviving company-scope ask (product owner, 2026-08-08):
    // it asks FOR a machine, so there is none to name.
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

  it("refuses an availability ask that names no machine — there is nothing to confirm", () => {
    expect(composeMachineRequest("availability", null)).toBeNull();
  });

  it("carries the machine as DATA, not only in prose", () => {
    const draft = composeMachineRequest("availability", "eq-9");
    expect(draft?.equipmentId).toBe("eq-9");
  });

  it("puts several document types on ONE card, deduped and blank-free", () => {
    // `composeDocumentRequest` and not `composeMachineRequest`: a document ask names a machine, so its
    // id parameter is non-nullable and it has its own composer (2026-08-08).
    const draft = composeDocumentRequest("eq-1", ["tuv", "tuv", " ", "istimara"]);
    expect(draft?.docTypes).toEqual(["tuv_cert", "istimara"]);
  });

  it("adds no `docTypes` to a kind that has none", () => {
    expect(composeMachineRequest("availability", "eq-1")?.docTypes).toBeUndefined();
  });

  it("cannot emit the retired kind", () => {
    // `add_to_offer` is rejected with a 400 server-side; nothing on this surface may compose it.
    expect(isSendableKind("add_to_offer")).toBe(false);
    for (const kind of ["availability", "alternative"] as const) {
      expect(isSendableKind(composeMachineRequest(kind, "eq-1")!.kind)).toBe(true);
    }
    expect(isSendableKind(composeDocumentRequest("eq-1", ["tuv"])!.kind)).toBe(true);
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

/* ────────────────────────── V17 · the list's filters (§6.4a) ──────────────────────────
   RM3-AC-28a→28e. The four rules, each asserted on the MODEL rather than on a render: a control that
   renders is not the same claim as a control the view model offers, and it is the model the map reads.

   **AC-28 was reversed by the owner on 2026-08-08** — v3 forbade a distance filter and its test
   asserted the ABSENCE of band state. That assertion now inverts: bands exist, under stated
   conditions, and the conditions are what these tests hold. */

/** The request the surface actually passes: a `BidCard` carrying the request's asks. */
const asking = (over: Partial<EquipmentFilterRequest> = {}): EquipmentFilterRequest => ({ ...over });

const groupKinds = (gs: ReturnType<typeof equipmentFilters>) => gs.map((g) => g.kind);
const optionIds = (gs: ReturnType<typeof equipmentFilters>) => gs.flatMap((g) => g.options.map((o) => o.id));

describe("rule 1 — only criteria the request asked for (RM3-AC-28a)", () => {
  const mixed = offeredMachines(
    fleet([
      { id: "near-confirmed", km: 10, source: "unit_yard", year: 2022, docs: ["tuv"] },
      { id: "far-unconfirmed", km: 300, year: 2010, docs: [] },
    ]),
  );

  it("offers no year, certificate or attachment control when the request named none", () => {
    expect(groupKinds(equipmentFilters(mixed, asking()))).toEqual(["distance", "availability"]);
  });

  it("offers a certificate chip only for a certificate the request named", () => {
    // The machine holds a TÜV and an ARAMCO; only the TÜV was asked for, so only the TÜV is offered.
    const list = offeredMachines(
      fleet([
        { id: "papers", docs: ["tuv", "aramco"] },
        { id: "bare", docs: [] },
      ]),
    );
    const certs = equipmentFilters(list, asking({ reqEquipmentCerts: ["tuv"] })).find((g) => g.kind === "certificate");
    expect(certs?.options.map((o) => o.id)).toEqual(["cert:equipment:tuv"]);
  });

  it("offers the year control only once the request asked for a minimum year", () => {
    const list = offeredMachines(
      fleet([
        { id: "new", year: 2022 },
        { id: "old", year: 2010 },
      ]),
    );
    expect(groupKinds(equipmentFilters(list, asking()))).not.toContain("year");
    expect(groupKinds(equipmentFilters(list, asking({ reqMinYear: 2020 })))).toContain("year");
  });

  it("never offers the attachments control — the request can ask, but no machine's file can answer", () => {
    // `FleetMachine`/`OfferedUnitDetail` carries no attachments field, so a chip here would empty the
    // list and read as a verdict on the lessor drawn entirely from OUR missing column. Rule 2 drops it.
    const list = offeredMachines(fleet([{ id: "a" }, { id: "b" }]));
    const ask = asking({ attachmentIds: ["bucket"], customAttachments: ["hammer"] });
    expect(groupKinds(equipmentFilters(list, ask))).not.toContain("attachments");
  });
});

describe("rule 2 — a control appears only when it would split the list (RM3-AC-28b)", () => {
  it("drops the availability chip when every machine is confirmed, and again when none is", () => {
    const allConfirmed = offeredMachines(fleet([{ id: "a", source: "unit_yard" }, { id: "b", source: "unit_yard" }]));
    const noneConfirmed = offeredMachines(fleet([{ id: "a" }, { id: "b" }]));
    expect(groupKinds(equipmentFilters(allConfirmed, asking()))).not.toContain("availability");
    expect(groupKinds(equipmentFilters(noneConfirmed, asking()))).not.toContain("availability");
  });

  it("offers the availability chip exactly when the list mixes the two states", () => {
    const list = offeredMachines(fleet([{ id: "yes", source: "unit_yard" }, { id: "no" }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "availability");
    expect(group?.options).toHaveLength(1);
    expect(group?.options[0]).toMatchObject({ id: "availability:confirmed", matches: 1 });
  });

  it("drops a certificate chip that every machine satisfies, and one that none satisfies", () => {
    const everyone = offeredMachines(fleet([{ id: "a", docs: ["tuv"] }, { id: "b", docs: ["tuv"] }]));
    const nobody = offeredMachines(fleet([{ id: "a", docs: [] }, { id: "b", docs: [] }]));
    const ask = asking({ reqEquipmentCerts: ["tuv"] });
    expect(groupKinds(equipmentFilters(everyone, ask))).not.toContain("certificate");
    expect(groupKinds(equipmentFilters(nobody, ask))).not.toContain("certificate");
  });

  it("drops the whole distance row when every machine is inside the tightest band", () => {
    const close = offeredMachines(fleet([{ id: "a", km: 5 }, { id: "b", km: 12 }]));
    expect(groupKinds(equipmentFilters(close, asking()))).not.toContain("distance");
  });

  it("offers no controls at all for an empty list", () => {
    expect(equipmentFilters([], asking({ reqMinYear: 2020, reqEquipmentCerts: ["tuv"] }))).toEqual([]);
  });
});

describe("the distance bands v2 shipped, reinstated (RM3-AC-28, AC-28c)", () => {
  it("uses ≤50 / ≤100 / ≤200 km and nothing else", () => {
    expect(DISTANCE_BANDS_KM).toEqual([50, 100, 200]);
  });

  it("collapses bands that hide exactly the same machines down to the tightest one", () => {
    // 10 · 60 · 300 km: ≤100 and ≤200 keep the same two, so only ≤50 and ≤100 are worth a chip.
    const list = offeredMachines(fleet([{ id: "a", km: 10 }, { id: "b", km: 60 }, { id: "c", km: 300 }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options.map((o) => o.id)).toEqual(["distance:50", "distance:100"]);
    expect(group?.options.map((o) => o.matches)).toEqual([1, 2]);
  });

  it("labels a band in both locales, with Arabic-Indic numerals in the Arabic one", () => {
    const list = offeredMachines(fleet([{ id: "a", km: 10 }, { id: "c", km: 300 }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options[0].label).toEqual({ en: "≤ 50 km", ar: "≤ ٥٠ كم" });
  });
});

describe("a machine with no distance is kept by every band, never hidden (RM3-AC-28c)", () => {
  // `locationSource: 'none'` means UNKNOWN, not FAR. Hiding it would silently delete a real offered
  // machine on the strength of a fact nobody has — v2's own rule for this control, restated.
  const list = offeredMachines(
    fleet([
      { id: "near", km: 10 },
      { id: "far", km: 900 },
      { id: "unknown", km: null, source: "none", lat: null, lng: null },
    ]),
  );

  it("survives the tightest band", () => {
    expect(ids(filterMachines(list, asking(), ["distance:50"]))).toEqual(["near", "unknown"]);
  });

  it("is counted in the band's own figure", () => {
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options[0].matches).toBe(2);
  });

  it("makes the group say so, so the renter is told rather than left to notice", () => {
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.keepsUnknownDistance).toBe(true);
  });

  it("does not claim an unknown distance when every machine has one", () => {
    const measured = offeredMachines(fleet([{ id: "near", km: 10 }, { id: "far", km: 900 }]));
    const group = equipmentFilters(measured, asking()).find((g) => g.kind === "distance");
    expect(group?.keepsUnknownDistance).toBe(false);
  });
});

describe("the year chip — a machine with no year on file does not satisfy a year ask", () => {
  it("filters it out, agreeing with the match grid's red on the same machine", () => {
    const list = offeredMachines(
      fleet([
        { id: "meets", year: 2022 },
        { id: "older", year: 2010 },
        { id: "silent", year: null },
      ]),
    );
    expect(ids(filterMachines(list, asking({ reqMinYear: 2020 }), ["year:2020"]))).toEqual(["meets"]);
  });

  it("offers no year control when the ask reads as an AGE rather than a year", () => {
    // `reqMinYear: 5` is "at most five years old". The one scorer already refuses to read it as a
    // year, and re-deriving that test here is the second scorer `bid-readiness.ts` refuses to be.
    const list = offeredMachines(fleet([{ id: "a", year: 2022 }, { id: "b", year: 2010 }]));
    expect(groupKinds(equipmentFilters(list, asking({ reqMinYear: 5 })))).not.toContain("year");
  });
});

describe("the certificate chips — both families, matched by the one scorer", () => {
  const list = offeredMachines(
    fleet([
      { id: "eq-only", docs: ["tuv"] },
      { id: "op-only", docs: ["operator_spsp"] },
      { id: "neither", docs: [] },
    ]),
  );
  const ask = asking({ reqEquipmentCerts: ["tuv"], operatorCertReq: "SPSP" });

  it("offers one chip per named certificate, equipment first", () => {
    expect(optionIds(equipmentFilters(list, ask)).filter((id) => id.startsWith("cert:"))).toEqual([
      "cert:equipment:tuv",
      "cert:operator:operator_spsp",
    ]);
  });

  it("never lets a held operator paper answer an equipment ask", () => {
    expect(ids(filterMachines(list, ask, ["cert:equipment:tuv"]))).toEqual(["eq-only"]);
    expect(ids(filterMachines(list, ask, ["cert:operator:operator_spsp"]))).toEqual(["op-only"]);
  });
});

describe("the predicate — AND between groups, OR within one (RM3-AC-28a)", () => {
  const list = offeredMachines(
    fleet([
      { id: "near-tuv", km: 10, docs: ["tuv"], year: 2022 },
      { id: "near-spsp", km: 20, docs: ["spsp"], year: 2022 },
      { id: "near-old-tuv", km: 30, docs: ["tuv"], year: 2010 },
      { id: "far-tuv", km: 400, docs: ["tuv"], year: 2022 },
      { id: "near-bare", km: 15, docs: [], year: 2022 },
    ]),
  );
  const ask = asking({ reqEquipmentCerts: ["tuv", "spsp"], reqMinYear: 2020 });

  it("ORs two chips inside the certificate group", () => {
    expect(ids(filterMachines(list, ask, ["cert:equipment:tuv", "cert:equipment:spsp"]))).toEqual([
      "near-tuv",
      "near-spsp",
      "near-old-tuv",
      "far-tuv",
    ]);
  });

  it("ANDs distance, year and the OR-ed certificates together", () => {
    expect(
      ids(filterMachines(list, ask, ["distance:50", "year:2020", "cert:equipment:tuv", "cert:equipment:spsp"])),
    ).toEqual(["near-tuv", "near-spsp"]);
  });

  it("imposes nothing for a group with no chip pressed", () => {
    // Nearest first throughout — the filter narrows the list, it never reorders it.
    expect(ids(filterMachines(list, ask, ["year:2020"]))).toEqual(["near-tuv", "near-bare", "near-spsp", "far-tuv"]);
  });

  it("returns the whole list, unmutated, when nothing is pressed", () => {
    const out = filterMachines(list, ask, []);
    expect(ids(out)).toEqual(ids(list));
    expect(out).not.toBe(list);
  });

  it("ignores an id that names no rendered option, so a stale selection cannot hide a machine", () => {
    // Carried over from another bid, or from a band that stopped splitting after a refetch.
    expect(ids(filterMachines(list, ask, ["distance:9999", "cert:equipment:aramco"]))).toEqual(ids(list));
  });
});

describe("rule 3 — the count states the WHOLE offer (RM3-AC-28d)", () => {
  const list = offeredMachines(
    fleet([
      { id: "a", km: 10 },
      { id: "b", km: 20 },
      { id: "c", km: 500 },
    ]),
  );

  it("reports the unfiltered total beside the filtered figure", () => {
    const view = equipmentListView(list, asking(), ["distance:50"]);
    expect({ shown: view.shown, total: view.total }).toEqual({ shown: 2, total: 3 });
  });

  it("reports total === shown when nothing is pressed", () => {
    const view = equipmentListView(list, asking(), []);
    expect({ shown: view.shown, total: view.total }).toEqual({ shown: 3, total: 3 });
  });

  it("drops a stale id out of `active` so the empty state cannot name a chip that is not on screen", () => {
    const view = equipmentListView(list, asking(), ["distance:50", "distance:9999"]);
    expect(view.active.map((o) => o.id)).toEqual(["distance:50"]);
  });
});

describe("rule 4 — the marker set is the FILTERED list minus what cannot be plotted (RM3-AC-15 / AC-28e)", () => {
  const plottableUnit = (m: FleetMachine) => m.lat != null && m.lng != null;

  it("takes a filtered-out machine off the map with its card", () => {
    const list = offeredMachines(
      fleet([
        { id: "near", km: 10 },
        { id: "far", km: 500 },
        { id: "near-unplottable", km: 20, lat: null, lng: null, source: "none" },
      ]),
    );
    const view = equipmentListView(list, asking(), ["distance:50"]);
    const drawn = view.machines.filter(plottableUnit);

    expect(ids(view.machines)).toEqual(["near", "near-unplottable"]);
    expect(ids(drawn)).toEqual(["near"]);
    // The only difference between the cards and the pins is still plottability — never the filter.
    for (const m of drawn) expect(ids(view.machines)).toContain(m.equipmentId);
    expect(ids(view.machines)).not.toContain("far");
  });
});

describe("the filtered empty state is not RM3-AC-26's (RM3-AC-28e)", () => {
  // Rule 2 makes ONE chip incapable of emptying the list — an option that keeps nothing never became
  // an option. Only a combination can, which is why the empty state names every active chip and not
  // just the last one pressed.
  const crossed = offeredMachines(
    fleet([
      { id: "near-bare", km: 10, docs: [] },
      { id: "far-tuv", km: 500, docs: ["tuv"] },
      { id: "far-bare", km: 600, docs: [] },
    ]),
  );
  const ask = asking({ reqEquipmentCerts: ["tuv"] });

  it("cannot be reached by pressing a single chip", () => {
    expect(equipmentListView(crossed, ask, ["distance:50"]).emptiedByFilter).toBe(false);
    expect(equipmentListView(crossed, ask, ["cert:equipment:tuv"]).emptiedByFilter).toBe(false);
  });

  it("flags a list emptied by a COMBINATION, and names every chip that did it", () => {
    const emptied = equipmentListView(crossed, ask, ["distance:50", "cert:equipment:tuv"]);
    expect(emptied.shown).toBe(0);
    expect(emptied.emptiedByFilter).toBe(true);
    // Rule 3 survives the empty state: the whole offer is still stated.
    expect(emptied.total).toBe(3);
    expect(emptied.active.map((o) => o.label.ar)).toEqual(["≤ ٥٠ كم", "TÜV"]);
  });

  it("never flags an offer that registered no machine — that is a fact about the LESSOR", () => {
    const view = equipmentListView([], asking(), ["distance:50"]);
    expect({ total: view.total, emptied: view.emptiedByFilter, groups: view.groups }).toEqual({
      total: 0,
      emptied: false,
      groups: [],
    });
  });
});
