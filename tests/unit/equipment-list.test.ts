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
import { isInOffer, isPlottable, unitAvailability } from "@/lib/contract/bid-map";
import {
  DISTANCE_BANDS_KM,
  equipmentFilters,
  equipmentListView,
  filterMachines,
  landingSelectionId,
  listEmptyState,
  machineMarkers,
  nextSelection,
  listedMachines,
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
  /** The maker's own spelling. Undefined keeps the fixture's default, null means the file names none. */
  make?: string | null;
}

const fleet = (rows: RawMachine[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: r.make === undefined ? "Caterpillar" : r.make,
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

describe("listedMachines — RM3-AC-09 / RM3-AC-10", () => {
  it("keeps EVERY matching machine, offered or not (owner, 2026-08-13)", () => {
    const list = listedMachines(
      fleet([
        { id: "offered-a" },
        { id: "owned-only", inBid: false },
        { id: "offered-b" },
      ]),
    );
    /* ~~Machines he owns but did not offer are NOT a second list — they are reachable only as an
       «اطلب معدّة أخرى» request, so they are not represented here at all.~~

       Withdrawn 2026-08-13. They ARE listed, told apart by COLOUR rather than by absence: without them
       the renter reads "3 registered" above a list of one and cannot tell "he owns one" from "he
       offered one". */
    /* ~~`["offered-a", "owned-only", "offered-b"]` — the fleet's own order, under a distance-only
       sort.~~ Superseded 2026-08-19: the offer sorts FIRST (app parity, `equipment_list.dart`, owner
       2026-08-15). All three are still LISTED, which is what this case is about. */
    expect(ids(list)).toEqual(["offered-a", "offered-b", "owned-only"]);
    /* ~~told apart by COLOUR~~ — told apart by the in-offer BADGE since 2026-08-17 (app parity). The
       colour answers the yard, which none of these three has named, so all three read unconfirmed;
       what distinguishes them on the card is `isInOffer`. */
    expect(list.map((m) => unitAvailability(m))).toEqual(["unconfirmed", "unconfirmed", "unconfirmed"]);
    expect(list.map((m) => isInOffer(m))).toEqual([true, true, false]);
  });

  it("sorts nearest first", () => {
    const list = listedMachines(fleet([{ id: "far", km: 180 }, { id: "near", km: 4 }, { id: "mid", km: 42 }]));
    expect(ids(list)).toEqual(["near", "mid", "far"]);
  });

  it("puts a machine with no distance LAST, never first", () => {
    // A null read as 0 would put the one machine whose location is unknown at the top of a list
    // ordered by how close it is.
    const list = listedMachines(fleet([{ id: "unknown", km: null }, { id: "near", km: 3 }]));
    expect(ids(list)).toEqual(["near", "unknown"]);
  });

  it("keeps equal distances in the response's own order", () => {
    const list = listedMachines(fleet([{ id: "a", km: 10 }, { id: "b", km: 10 }, { id: "c", km: 10 }]));
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  it("drops an `absent` unit — it has nothing for a card to state", () => {
    const list = listedMachines(fleet([{ id: "real" }, { id: "claimed", source: "unidentified" }]));
    expect(ids(list)).toEqual(["real"]);
    expect(unitAvailability({ locationSource: "unidentified" })).toBe("absent");
  });

  it("keeps a machine that cannot be PLOTTED — the list is the offer, the map is what can be drawn", () => {
    // `locationSource: none` (its yard was deleted) is `unconfirmed`, not `absent`: it still has
    // photos and documents, so the card is meaningful even though the marker is not.
    const list = listedMachines(fleet([{ id: "no-coords", source: "none", lat: null, lng: null }]));
    expect(ids(list)).toEqual(["no-coords"]);
    expect(unitAvailability(list[0])).toBe("unconfirmed");
  });

  it("does not reorder the caller's array in place", () => {
    const source = fleet([{ id: "far", km: 90 }, { id: "near", km: 1 }]);
    listedMachines(source);
    expect(ids(source)).toEqual(["far", "near"]);
  });

  it("returns nothing for a supplier who registered no machines (RM3-AC-26)", () => {
    expect(listedMachines([])).toEqual([]);
    // A machine he owns and did not offer IS listed since 2026-08-13, so an empty list now means an
    // empty FLEET — which is the only thing AC-26 was ever about.
    expect(ids(listedMachines(fleet([{ id: "owned", inBid: false }])))).toEqual(["owned"]);
  });
});

/* ────────────────────────── V6 · what is selected on arrival ────────────────────────── */

describe("landingSelectionId — RM3-AC-34", () => {
  it("selects the bid's PRIMARY machine even when another is nearer and confirmed", () => {
    const list = listedMachines(
      fleet([
        { id: "near-confirmed", km: 2, source: "unit_yard" },
        { id: "primary", km: 90, source: "listing_yard" },
      ]),
    );
    // The primary is what the supplier committed and what the deal room is about.
    expect(landingSelectionId("primary", list)).toBe("primary");
  });

  it("falls back to the first CONFIRMED machine when the primary is absent from the fleet", () => {
    const list = listedMachines(
      fleet([
        { id: "near-unconfirmed", km: 2, source: "listing_yard" },
        { id: "mid-confirmed", km: 20, source: "unit_yard" },
        { id: "far-confirmed", km: 80, source: "unit_yard" },
      ]),
    );
    expect(landingSelectionId("not-in-this-fleet", list)).toBe("mid-confirmed");
  });

  it("lands on the primary even when it is not offered — it is on screen now (2026-08-13)", () => {
    /* ~~"falls back when the primary was owned but not offered"~~ — the fallback existed because such
       a machine had no card to land on. It has one now, so landing on it is the honest answer: the
       renter is oriented on the machine the BID names, whatever colour that machine wears.

       The fallback itself is untouched and still covers the case that can really strand it — a primary
       missing from the fleet response entirely, which the test above this one pins. */
    const list = listedMachines(fleet([{ id: "primary", inBid: false }, { id: "offered", source: "unit_yard" }]));
    expect(landingSelectionId("primary", list)).toBe("primary");
  });

  it("selects nothing when there is no primary and nothing is confirmed", () => {
    // An accent and a nine-second pulse on an arbitrary card read as a recommendation.
    const list = listedMachines(fleet([{ id: "a", source: "listing_yard" }, { id: "b", source: "bid_yard" }]));
    expect(landingSelectionId(null, list)).toBeNull();
    expect(landingSelectionId("", list)).toBeNull();
    expect(landingSelectionId(undefined, list)).toBeNull();
  });

  it("selects nothing from an empty list", () => {
    expect(landingSelectionId("primary", [])).toBeNull();
  });

  it("ignores surrounding whitespace on the primary id", () => {
    const list = listedMachines(fleet([{ id: "primary" }]));
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

describe("composeMachineRequest — RM3-AC-17 / RM3-AC-07", () => {
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

describe("the marker set is the list minus what cannot be drawn — RM3-AC-15 / RM3-AC-22", () => {
  /** **Production's own predicate**, not a local re-statement of it. What this file used to define
   *  here — `m.lat != null && m.lng != null` — is a plausible reading of `isPlottable`, and a test
   *  that asserts its own reading is a claim about the test. `isPlottable` rejects a HALF-resolved
   *  point and downgrades it, which the local one would have accepted. */
  const plottable = (m: FleetMachine) => isPlottable(m);

  it("uses the same predicate the map does — and it is not the obvious one", () => {
    // The positive control on the swap. A machine with a latitude and no longitude is NOT plottable:
    // a point at (24.7, 0) is somewhere in the Gulf of Guinea. The local predicate this replaced
    // would have called it drawable.
    const half = fleet([{ id: "half", lat: 24.7, lng: null }])[0];
    expect(half.lat != null && half.lng != null).toBe(false);
    const halfLng = fleet([{ id: "half2", lat: null, lng: 46.7 }])[0];
    expect(isPlottable(halfLng)).toBe(false);
    expect(isPlottable(fleet([{ id: "whole" }])[0])).toBe(true);
  });

  it("draws a marker only for a machine that is in the list", () => {
    const all = fleet([
      { id: "offered-plottable" },
      { id: "offered-no-coords", source: "none", lat: null, lng: null },
      { id: "owned-only", inBid: false },
      { id: "claimed", source: "unidentified" },
    ]);
    const list = listedMachines(all);
    const drawn = list.filter(plottable);

    // The whole matching fleet is listed since 2026-08-13, so `owned-only` has a card too; only
    // `claimed` — a count naming no machine — is still absent. The map is then the list minus what has
    // no coordinates, which is the rule this test defends and is unchanged.
    expect(ids(list)).toEqual(["offered-plottable", "offered-no-coords", "owned-only"]);
    expect(ids(drawn)).toEqual(["offered-plottable", "owned-only"]);
    // Every drawn machine has a card; the reverse is not required, and the one difference is stated.
    for (const m of drawn) expect(ids(list)).toContain(m.equipmentId);
  });

  it("gives every drawn machine a colour that came from `unitAvailability`, never `yardConfirmed`", () => {
    const drawn = listedMachines(
      mapFleet([
        // The trap: `yardConfirmed: true` on an inferred level. Supplier-side the boolean is just
        // `yardId != null`, so reading it for colour turns the whole map green.
        { equipmentId: "trap", locationSource: "listing_yard", yardConfirmed: true, lat: 24, lng: 46, inBid: true },
        { equipmentId: "real", locationSource: "unit_yard", yardConfirmed: false, lat: 24, lng: 46, inBid: true },
      ]),
    ).filter(plottable);

    // What the test defends is untouched: the `yardConfirmed` boolean did NOT turn the trap green.
    expect(drawn.map((m) => unitAvailability(m))).toEqual(["unconfirmed", "confirmed"]);
  });
});

/* ────────────────────── V5 / V10 · the selection, as one rule (RM3-AC-15) ──────────────────────
   RM3-AC-15 as rewritten on 2026-08-08: *"the same `selectedMachineId` reaches the map and the list …
   exactly ONE machine id is selected on both surfaces at any moment and re-selecting the current one
   clears it."*

   The test that used to carry this number checked SET MEMBERSHIP — that the drawn machines are a
   subset of the listed ones — which is RM3-AC-22's claim, not RM3-AC-15's, and says nothing about focus.
   These are the focus rules themselves. The structural half — that this one value is what both
   surfaces are handed — is in `rentee-map-surface.test.ts`, because it is a fact about the host. */

describe("nextSelection — one selection rule for both surfaces (RM3-AC-15)", () => {
  it("selects a machine that was not selected", () => {
    expect(nextSelection(null, { kind: "press", id: "eq-1" })).toBe("eq-1");
    expect(nextSelection("eq-2", { kind: "press", id: "eq-1" })).toBe("eq-1");
  });

  it("CLEARS on a re-press — the only way back to an unselected map", () => {
    // The mutation this catches: a press that assigns rather than toggles. Every other test in this
    // block still passes under it.
    expect(nextSelection("eq-1", { kind: "press", id: "eq-1" })).toBeNull();
  });

  it("round-trips: press · re-press · press again", () => {
    let sel: string | null = null;
    sel = nextSelection(sel, { kind: "press", id: "eq-1" });
    expect(sel).toBe("eq-1");
    sel = nextSelection(sel, { kind: "press", id: "eq-1" });
    expect(sel).toBeNull();
    sel = nextSelection(sel, { kind: "press", id: "eq-1" });
    expect(sel).toBe("eq-1");
  });

  it("clears on a bid change — a ring on a machine no longer on the map (RMAP-AC-177 — spec 001 v2, no RM3 equivalent)", () => {
    expect(nextSelection("eq-1", { kind: "bid-change" })).toBeNull();
    expect(nextSelection(null, { kind: "bid-change" })).toBeNull();
  });

  it("clears when a filter hides the selected machine — a ring with no card and no pin (RM3-AC-28e)", () => {
    expect(nextSelection("eq-1", { kind: "hidden" })).toBeNull();
  });

  it("FOCUSES on open without toggling — «التفاصيل» on the selected card must not deselect it", () => {
    // A detail opening on a machine the press had just cleared would leave the panel describing a
    // machine with no accent and no lifted marker.
    expect(nextSelection("eq-1", { kind: "open", id: "eq-1" })).toBe("eq-1");
    expect(nextSelection("eq-2", { kind: "open", id: "eq-1" })).toBe("eq-1");
    expect(nextSelection(null, { kind: "open", id: "eq-1" })).toBe("eq-1");
  });

  it("never returns anything but a single id or null — two rings are not representable", () => {
    const outcomes = [
      nextSelection("a", { kind: "press", id: "b" }),
      nextSelection("a", { kind: "press", id: "a" }),
      nextSelection("a", { kind: "open", id: "b" }),
      nextSelection("a", { kind: "bid-change" }),
      nextSelection("a", { kind: "hidden" }),
    ];
    for (const out of outcomes) expect(out === null || typeof out === "string").toBe(true);
  });
});

/* ──────────────── RM3-AC-26 · the lessor's empty state, and the filter's ────────────────
   Two states that must never be mistakable for each other. RM3-AC-26 was proven only as
   `listedMachines([])` returning `[]` — an array, which is not a state, and which stays green if
   the explanatory branch is deleted outright. `listEmptyState` is the branch, as a value. */

describe("listEmptyState — the two empty states, told apart (RM3-AC-26 / RM3-AC-28e)", () => {
  const view = (over: Partial<{ total: number; machines: FleetMachine[]; emptiedByFilter: boolean }>) => ({
    total: 0,
    machines: [] as FleetMachine[],
    emptiedByFilter: false,
    ...over,
  });

  it("says `no-machines` for an offer the lessor registered nothing against", () => {
    // The fact about the LESSOR: a price and a count were given, and that is the whole statement.
    expect(listEmptyState(equipmentListView([], asking(), []))).toBe("no-machines");
  });

  it("says `filtered` when chips emptied a real offer", () => {
    const crossed = listedMachines(
      fleet([
        { id: "near-bare", km: 10, docs: [] },
        { id: "far-tuv", km: 500, docs: ["tuv"] },
        { id: "far-bare", km: 600, docs: [] },
      ]),
    );
    const ask = asking({ reqEquipmentCerts: ["tuv"] });
    const emptied = equipmentListView(crossed, ask, ["distance:50", "cert:equipment:tuv"]);
    expect(emptied.shown).toBe(0);
    expect(listEmptyState(emptied)).toBe("filtered");
  });

  it("says nothing at all when there are cards to draw", () => {
    const list = listedMachines(fleet([{ id: "a" }, { id: "b" }]));
    expect(listEmptyState(equipmentListView(list, asking(), []))).toBeNull();
  });

  it("never reads a filter's empty list as the LESSOR's — the two are not the same answer", () => {
    // The mutation this catches: collapsing the two branches into one. A renter told «لا توجد
    // نتائج» over an offer that really is empty reads it as a verdict on the lessor; a renter given
    // «امسح التصفية» over an offer with no machines is offered an escape from nothing.
    expect(listEmptyState(view({ total: 0 }))).not.toBe(listEmptyState(view({ total: 8 })));
    expect(listEmptyState(view({ total: 0, emptiedByFilter: true }))).toBe("no-machines");
  });

  it("agrees with `emptiedByFilter`, which is the model's own name for the same fact", () => {
    const list = listedMachines(fleet([{ id: "a", km: 10 }, { id: "b", km: 500 }]));
    for (const selection of [[], ["distance:50"], ["distance:9999"]]) {
      const v = equipmentListView(list, asking(), selection);
      expect(listEmptyState(v) === "filtered", JSON.stringify(selection)).toBe(v.emptiedByFilter);
    }
  });
});

/* ────────────────────────── V17 · the list's filters (§6.4a) ──────────────────────────
   RM3-AC-28a→28e. The four rules, each asserted on the MODEL rather than on a render: a control that
   renders is not the same claim as a control the view model offers, and it is the model the map reads.

   **RM3-AC-28 was reversed by the owner on 2026-08-08** — v3 forbade a distance filter and its test
   asserted the ABSENCE of band state. That assertion now inverts: bands exist, under stated
   conditions, and the conditions are what these tests hold. */

/** The request the surface actually passes: a `BidCard` carrying the request's asks. */
const asking = (over: Partial<EquipmentFilterRequest> = {}): EquipmentFilterRequest => ({ ...over });

const groupKinds = (gs: ReturnType<typeof equipmentFilters>) => gs.map((g) => g.kind);
const optionIds = (gs: ReturnType<typeof equipmentFilters>) => gs.flatMap((g) => g.options.map((o) => o.id));

describe("rule 1 — only criteria the request asked for (RM3-AC-28a)", () => {
  const mixed = listedMachines(
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
    const list = listedMachines(
      fleet([
        { id: "papers", docs: ["tuv", "aramco"] },
        { id: "bare", docs: [] },
      ]),
    );
    const certs = equipmentFilters(list, asking({ reqEquipmentCerts: ["tuv"] })).find((g) => g.kind === "certificate");
    expect(certs?.options.map((o) => o.id)).toEqual(["cert:equipment:tuv"]);
  });

  it("offers the year control only once the request asked for a minimum year", () => {
    const list = listedMachines(
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
    const list = listedMachines(fleet([{ id: "a" }, { id: "b" }]));
    const ask = asking({ attachmentIds: ["bucket"], customAttachments: ["hammer"] });
    expect(groupKinds(equipmentFilters(list, ask))).not.toContain("attachments");
  });
});

describe("rule 2 — a control appears only when it would split the list (RM3-AC-28b)", () => {
  it("drops the availability chip when every machine is confirmed, and again when none is", () => {
    const allConfirmed = listedMachines(fleet([{ id: "a", source: "unit_yard" }, { id: "b", source: "unit_yard" }]));
    const noneConfirmed = listedMachines(fleet([{ id: "a" }, { id: "b" }]));
    expect(groupKinds(equipmentFilters(allConfirmed, asking()))).not.toContain("availability");
    expect(groupKinds(equipmentFilters(noneConfirmed, asking()))).not.toContain("availability");
  });

  it("offers the availability chip exactly when the list mixes the two states", () => {
    const list = listedMachines(fleet([{ id: "yes", source: "unit_yard" }, { id: "no" }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "availability");
    expect(group?.options).toHaveLength(1);
    expect(group?.options[0]).toMatchObject({ id: "availability:confirmed", matches: 1 });
  });

  it("drops a certificate chip that every machine satisfies, and one that none satisfies", () => {
    const everyone = listedMachines(fleet([{ id: "a", docs: ["tuv"] }, { id: "b", docs: ["tuv"] }]));
    const nobody = listedMachines(fleet([{ id: "a", docs: [] }, { id: "b", docs: [] }]));
    const ask = asking({ reqEquipmentCerts: ["tuv"] });
    expect(groupKinds(equipmentFilters(everyone, ask))).not.toContain("certificate");
    expect(groupKinds(equipmentFilters(nobody, ask))).not.toContain("certificate");
  });

  it("drops the whole distance row when every machine is inside the tightest band", () => {
    const close = listedMachines(fleet([{ id: "a", km: 5 }, { id: "b", km: 12 }]));
    expect(groupKinds(equipmentFilters(close, asking()))).not.toContain("distance");
  });

  it("offers no controls at all for an empty list", () => {
    expect(equipmentFilters([], asking({ reqMinYear: 2020, reqEquipmentCerts: ["tuv"] }))).toEqual([]);
  });
});

describe("the distance bands v2 shipped, reinstated (RM3-AC-28, RM3-AC-28c)", () => {
  it("uses ≤50 / ≤100 / ≤200 km and nothing else", () => {
    expect(DISTANCE_BANDS_KM).toEqual([50, 100, 200]);
  });

  it("collapses bands that hide exactly the same machines down to the tightest one", () => {
    // 10 · 60 · 300 km: ≤100 and ≤200 keep the same two, so only ≤50 and ≤100 are worth a chip.
    const list = listedMachines(fleet([{ id: "a", km: 10 }, { id: "b", km: 60 }, { id: "c", km: 300 }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options.map((o) => o.id)).toEqual(["distance:50", "distance:100"]);
    expect(group?.options.map((o) => o.matches)).toEqual([1, 2]);
  });

  it("labels a band in both locales, with Arabic-Indic numerals in the Arabic one", () => {
    const list = listedMachines(fleet([{ id: "a", km: 10 }, { id: "c", km: 300 }]));
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options[0].label).toEqual({ en: "≤ 50 km", ar: "≤ ٥٠ كم" });
  });
});

describe("a machine with no distance is kept by every band, never hidden (RM3-AC-28c)", () => {
  // `locationSource: 'none'` means UNKNOWN, not FAR. Hiding it would silently delete a real offered
  // machine on the strength of a fact nobody has — v2's own rule for this control, restated.
  const list = listedMachines(
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

  // These two used to read the group's `keepsUnknownDistance` flag. The flag existed only to feed a
  // chip-row note that was withdrawn (owner, 2026-08-08), and once the note went nothing read it — so
  // it is gone, along with `.bm-eqf-note` and `eqFilterUnknownDistance`. The RULE it reported is not
  // gone, so these now assert it where it actually lives: `filterMachines`.
  it("is kept by EVERY band the group offers, not just the tightest — unknown is not far", () => {
    const group = equipmentFilters(list, asking()).find((g) => g.kind === "distance");
    expect(group?.options.length).toBeGreaterThan(0); // the loop below must not pass vacuously
    for (const o of group!.options) {
      expect(ids(filterMachines(list, asking(), [o.id]))).toContain("unknown");
    }
  });

  it("does not keep a MEASURED machine that the band excludes — the rule is about unknown only", () => {
    const measured = listedMachines(fleet([{ id: "near", km: 10 }, { id: "far", km: 900 }]));
    expect(ids(filterMachines(measured, asking(), ["distance:50"]))).toEqual(["near"]);
  });
});

describe("the year chip — a machine with no year on file does not satisfy a year ask", () => {
  it("filters it out, agreeing with the match grid's red on the same machine", () => {
    const list = listedMachines(
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
    const list = listedMachines(fleet([{ id: "a", year: 2022 }, { id: "b", year: 2010 }]));
    expect(groupKinds(equipmentFilters(list, asking({ reqMinYear: 5 })))).not.toContain("year");
  });
});

describe("the certificate chips — both families, matched by the one scorer", () => {
  const list = listedMachines(
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
  const list = listedMachines(
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
  const list = listedMachines(
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

describe("rule 4 — the marker set is the FILTERED list minus what cannot be plotted (RM3-AC-15 / RM3-AC-28e)", () => {
  it("takes a filtered-out machine off the map with its card", () => {
    const list = listedMachines(
      fleet([
        { id: "near", km: 10 },
        { id: "far", km: 500 },
        { id: "near-unplottable", km: 20, lat: null, lng: null, source: "none" },
      ]),
    );
    const view = equipmentListView(list, asking(), ["distance:50"]);
    // `machineMarkers` is what the workspace actually hands the canvas — the map's real derivation,
    // not a local predicate the test invented and then agreed with.
    const drawn = machineMarkers(view.machines);

    expect(ids(view.machines)).toEqual(["near", "near-unplottable"]);
    expect(drawn.map((m) => m.id)).toEqual(["near"]);
    // The only difference between the cards and the pins is still plottability — never the filter.
    for (const m of drawn) expect(ids(view.machines)).toContain(m.id);
    expect(ids(view.machines)).not.toContain("far");
  });
});

describe("the filtered empty state is not RM3-AC-26's (RM3-AC-28e)", () => {
  // Rule 2 makes ONE chip incapable of emptying the list — an option that keeps nothing never became
  // an option. Only a combination can, which is why the empty state names every active chip and not
  // just the last one pressed.
  const crossed = listedMachines(
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

/* ─────────────────── the manufacturer filter (app parity, 2026-08-17) ─────────────────── */

describe("manufacturer filter — الصانع", () => {
  const mixedMakes = fleet([
    { id: "cat-1", make: "Caterpillar" },
    { id: "cat-2", make: "Caterpillar" },
    { id: "komatsu", make: "Komatsu" },
  ]);

  it("draws one chip per maker the fleet holds, sorted, counting its own machines", () => {
    const group = equipmentFilters(mixedMakes, asking()).find((g) => g.kind === "manufacturer");
    expect(group?.options.map((o) => o.id)).toEqual(["make:Caterpillar", "make:Komatsu"]);
    expect(group?.options.map((o) => o.matches)).toEqual([2, 1]);
  });

  it("names the chip in the supplier's own spelling, the same in both languages", () => {
    const group = equipmentFilters(mixedMakes, asking()).find((g) => g.kind === "manufacturer");
    // A brand is a name, not a word to translate.
    expect(group?.options[0].label).toEqual({ en: "Caterpillar", ar: "Caterpillar" });
  });

  it("draws nothing when every machine shares one maker — rule 2, it splits nothing", () => {
    const oneMake = fleet([{ id: "a" }, { id: "b" }]); // both default to Caterpillar
    expect(groupKinds(equipmentFilters(oneMake, asking()))).not.toContain("manufacturer");
  });

  it("draws nothing when no machine names a maker", () => {
    const noMakes = fleet([{ id: "a", make: null }, { id: "b", make: null }]);
    expect(groupKinds(equipmentFilters(noMakes, asking()))).not.toContain("manufacturer");
  });

  it("ignores the machines that name no maker rather than grouping them together", () => {
    // An empty maker is not a maker. Two unnamed machines are not "the same brand".
    const some = fleet([{ id: "a", make: "Volvo" }, { id: "b", make: null }, { id: "c", make: "Hitachi" }]);
    const group = equipmentFilters(some, asking()).find((g) => g.kind === "manufacturer");
    expect(group?.options.map((o) => o.id)).toEqual(["make:Hitachi", "make:Volvo"]);
  });

  it("never normalises two spellings into one maker", () => {
    // Guessing that «كوماتسو» and `Komatsu` are one brand is how a filter starts hiding machines.
    const spellings = fleet([{ id: "a", make: "Komatsu" }, { id: "b", make: "كوماتسو" }]);
    const group = equipmentFilters(spellings, asking()).find((g) => g.kind === "manufacturer");
    expect(group?.options).toHaveLength(2);
  });

  it("keeps only that maker's machines when its chip is picked", () => {
    const group = equipmentFilters(mixedMakes, asking()).find((g) => g.kind === "manufacturer");
    const kept = filterMachines(mixedMakes, asking(), [group!.options[1].id]);
    expect(ids(kept)).toEqual(["komatsu"]);
  });
});

/* ══════════════ V18 · the offer first, the rest on request (owner, 2026-08-19) ══════════════
   *"only show at beginning the ones in the offer and then at bottom option to show all equipments
   … and show others on map."*

   The third position this list has held. What is guarded here is not just the narrowing but the two
   things that make it safe: the MAP follows the same array (so a pin can never appear for a card that
   is not there), and a surface with nothing to collapse to never collapses. */
describe("equipmentListView — the offer first (owner, 2026-08-19)", () => {
  const mixed = listedMachines(
    fleet([
      { id: "offered-near", km: 10 },
      { id: "fleet-nearest", km: 1, inBid: false },
      { id: "offered-far", km: 50 },
      { id: "fleet-far", km: 90, inBid: false },
    ]),
  );

  it("shows only the offered machines on arrival, and counts the rest", () => {
    const v = equipmentListView(mixed, asking(), []);
    expect(ids(v.machines)).toEqual(["offered-near", "offered-far"]);
    expect(v.beyondOffer).toBe(2);
    expect(v.showingAll).toBe(false);
  });

  it("appends the others BELOW the offer when asked, keeping each group nearest-first", () => {
    // `fleet-nearest` is 1km away — nearer than either offered machine — and still sorts below them.
    // The question this surface answers first is what is being offered, not what is closest.
    const v = equipmentListView(mixed, asking(), [], { showAll: true });
    expect(ids(v.machines)).toEqual(["offered-near", "offered-far", "fleet-nearest", "fleet-far"]);
    expect(v.showingAll).toBe(true);
    expect(v.beyondOffer).toBe(2);
  });

  it("states the count against the whole fleet either way — a collapsed list is not a smaller offer", () => {
    expect(equipmentListView(mixed, asking(), []).total).toBe(4);
    expect(equipmentListView(mixed, asking(), []).shown).toBe(2);
    expect(equipmentListView(mixed, asking(), [], { showAll: true }).shown).toBe(4);
  });

  it("the MAP follows the list, collapsed and expanded", () => {
    // Rule 4, which the narrowing had to preserve: the marker set is derived from `machines` and
    // nothing else, so a machine that is not in the list cannot have a pin.
    const collapsed = equipmentListView(mixed, asking(), []);
    expect(machineMarkers(collapsed.machines).map((m) => m.id)).toEqual(["offered-near", "offered-far"]);
    const opened = equipmentListView(mixed, asking(), [], { showAll: true });
    expect(machineMarkers(opened.machines).map((m) => m.id)).toEqual([
      "offered-near", "offered-far", "fleet-nearest", "fleet-far",
    ]);
  });

  it("never collapses to nothing when the supplier offered nothing matching", () => {
    // Collapsing here would render an empty panel under a control offering to reveal the rest —
    // which states the opposite of the truth.
    const noneOffered = listedMachines(fleet([{ id: "a", inBid: false }, { id: "b", inBid: false }]));
    const v = equipmentListView(noneOffered, asking(), []);
    expect(ids(v.machines)).toEqual(["a", "b"]);
    expect(v.showingAll).toBe(true);
    expect(v.beyondOffer).toBe(0);
  });

  it("offers no expander when the supplier offered his whole matching fleet", () => {
    const allOffered = listedMachines(fleet([{ id: "a" }, { id: "b" }]));
    const v = equipmentListView(allOffered, asking(), []);
    expect(v.beyondOffer).toBe(0);
    expect(v.showingAll).toBe(true);
  });

  it("collapses on its own when the chips leave none of the others standing", () => {
    // The renter asked to see the fleet, then filtered it down to the offer. The flag is still set,
    // but there is nothing left for it to reveal, so the expander has nothing to say.
    const list = listedMachines(
      fleet([
        { id: "offered-near", km: 10 },
        { id: "fleet-far", km: 900, inBid: false },
      ]),
    );
    const v = equipmentListView(list, asking(), ["distance:50"], { showAll: true });
    expect(ids(v.machines)).toEqual(["offered-near"]);
    expect(v.beyondOffer).toBe(0);
  });

  it("reads emptiedByFilter against the FILTERED set, never against the collapse", () => {
    // A collapsed list is not "emptied by filter" — that state names the chips, and blaming them for
    // the offer being folded away would send the renter to clear filters that are doing nothing.
    const list = listedMachines(
      fleet([
        { id: "offered-near-bare", km: 10, docs: [] },
        { id: "fleet-far-tuv", km: 500, docs: ["tuv"], inBid: false },
      ]),
    );
    const ask = asking({ reqEquipmentCerts: ["tuv"] });
    // Collapsed, with the offer standing: not emptied.
    expect(equipmentListView(list, ask, []).emptiedByFilter).toBe(false);
    // A combination that leaves nothing at all: emptied, and it is the chips that did it.
    expect(equipmentListView(list, ask, ["distance:50", "cert:equipment:tuv"]).emptiedByFilter).toBe(true);
  });
});

/* ══════════ the offer sorts first — and what that fixes downstream (app parity, 2026-08-15) ══════════
   The app changed this on 2026-08-15 (*"always show the one in the offer at top and other below it"*)
   and the web ran four days without it. The reading order was the visible half; the half that matters
   more is `landingSelectionId`, which falls back to *the first confirmed machine in list order*. */
describe("listedMachines — the offer sorts before distance", () => {
  it("puts an offered machine above a nearer one the supplier merely owns", () => {
    const list = listedMachines(
      fleet([
        { id: "fleet-1km", km: 1, inBid: false },
        { id: "offered-50km", km: 50 },
        { id: "fleet-2km", km: 2, inBid: false },
        { id: "offered-10km", km: 10 },
      ]),
    );
    expect(ids(list)).toEqual(["offered-10km", "offered-50km", "fleet-1km", "fleet-2km"]);
  });

  it("keeps nearest-first WITHIN each group, so RM3-AC-09 holds where it still means anything", () => {
    const list = listedMachines(
      fleet([{ id: "off-far", km: 90 }, { id: "off-near", km: 3 }, { id: "own-far", km: 80, inBid: false }, { id: "own-near", km: 5, inBid: false }]),
    );
    expect(ids(list)).toEqual(["off-near", "off-far", "own-near", "own-far"]);
  });

  it("still sorts a machine with no distance last, inside its own group", () => {
    const list = listedMachines(
      fleet([{ id: "own-known", km: 40, inBid: false }, { id: "off-unknown", km: null }, { id: "off-known", km: 60 }]),
    );
    expect(ids(list)).toEqual(["off-known", "off-unknown", "own-known"]);
  });

  it("pre-selects an OFFERED machine rather than a nearer one that was never offered", () => {
    // The bug the distance-only sort left behind. With no primary on the bid, the fallback takes the
    // first confirmed machine in list order — which under the old sort was whichever confirmed machine
    // happened to be closest, offered or not. The renter landed on a machine nobody had sold him, with
    // the accent and the nine-second pulse on its card.
    const list = listedMachines(
      fleet([
        { id: "fleet-confirmed-1km", km: 1, source: "unit_yard", inBid: false },
        { id: "offered-confirmed-40km", km: 40, source: "unit_yard" },
      ]),
    );
    expect(landingSelectionId(null, list)).toBe("offered-confirmed-40km");
  });

  it("still prefers the bid's primary machine over both", () => {
    const list = listedMachines(
      fleet([{ id: "offered-near", km: 2, source: "unit_yard" }, { id: "primary", km: 300, source: "unit_yard" }]),
    );
    expect(landingSelectionId("primary", list)).toBe("primary");
  });
});
