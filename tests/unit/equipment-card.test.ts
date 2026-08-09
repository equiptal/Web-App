/**
 * **V5 · the machine card, and the marker that is the same machine** — RM3-AC-12, RM3-AC-13,
 * RM3-AC-19, RM3-AC-21, RM3-AC-32, RM3-AC-33.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────────────────────────
 * Every criterion here was previously "covered" by a test that could not go red.
 *
 * **RM3-AC-19** — *the pin and the card chip take their colour from `unitAvailability`, never from
 * `yardConfirmed`* — was named by three tests, none of which touched either surface; one of them
 * called `unitAvailability()` **inside the test**, on a list the test had itself filtered, and then
 * asserted the answer. That is a claim about `unitAvailability`, which is separately and properly
 * tested; it says nothing whatever about the card or the marker. Rewriting `EquipmentList` to read
 * `machine.yardConfirmed` left all three green.
 *
 * **RM3-AC-12 / RM3-AC-32 / RM3-AC-33** are negatives about what a card may state, and a negative cannot be
 * observed on a render this suite never mounts. They are asserted here the way `map-no-quality-score`
 * asserts RM3-AC-29: an `Object.keys` sweep over **populated** model output. A populated model is the
 * whole point — `expect("serialNumber" in ({} as EquipmentCardModel)).toBe(false)` is vacuous at
 * runtime, because Vitest transpiles without typechecking and the type is erased before the assertion
 * runs. `price-footer.test.ts`'s RM3-AC-67 test is written that way and proves nothing.
 *
 * ── The fixture carries the forbidden values on purpose ──────────────────────────────────────────
 * Every machine below has a real `serialNumber` and a real `measurementName` (the load capacity). The
 * sweeps look for those VALUES as well as for key names, so a card that leaked the serial under an
 * innocent key — `subtitle`, `line2` — is caught as readily as one that named it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AVAILABILITY_COLOUR,
  REQUEST_ACTION_COLOUR,
  availabilityView,
  unitAvailability,
} from "@/lib/contract/bid-map";
import { machineMarkers, offeredMachines } from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel } from "@/components/map/equipment-card-model";

/* ─────────────────────────────────── fixtures ─────────────────────────────────── */

interface RawMachine {
  id: string;
  inBid?: boolean;
  /** §7.3 precedence level — `unit_yard` is the only one that reads as confirmed. */
  source?: string;
  /** The boolean RM3-AC-19 forbids either surface from reading. */
  yardConfirmed?: boolean;
  km?: number | null;
  lat?: number | null;
  lng?: number | null;
  docs?: string[];
}

/** The serial and the capacity every fixture carries, so the RM3-AC-12 sweep has something to find. */
const SERIAL = "SN-CAT-320D-88117";
const CAPACITY = "20 ton";

/** Through `mapFleet`, because the parser is the only thing that produces a `FleetMachine` in
 *  production — a hand-built literal could pass on a shape the wire cannot make. */
const fleet = (rows: RawMachine[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      serialNumber: SERIAL,
      measurementName: CAPACITY,
      measurementNameAr: CAPACITY,
      subcategoryName: "Excavator",
      subcategoryNameAr: "حفّارة",
      locationSource: r.source ?? "listing_yard",
      yardConfirmed: r.yardConfirmed ?? false,
      distanceKm: r.km === undefined ? 10 : r.km,
      lat: r.lat === undefined ? 24.7 : r.lat,
      lng: r.lng === undefined ? 46.7 : r.lng,
      inBid: r.inBid !== false,
      photoKeys: [{ slot: "front", key: "p0", url: "https://x/front.jpg" }],
      documentKeys: (r.docs ?? []).map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
    })),
  );

const one = (r: RawMachine) => equipmentCardModel(fleet([r])[0]);

/** Every key at every depth of a model's output — arrays walked, so a key on a chip is caught as
 *  readily as one on the root. Borrowed from `map-no-quality-score.test.ts`, deliberately. */
function keysDeep(value: unknown, seen = new Set<object>()): string[] {
  if (value == null || typeof value !== "object") return [];
  if (seen.has(value as object)) return [];
  seen.add(value as object);
  if (Array.isArray(value)) return value.flatMap((v) => keysDeep(v, seen));
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [k, ...keysDeep(v, seen)]);
}

/** Every primitive value at every depth, stringified — the other half of the sweep. */
function valuesDeep(value: unknown, seen = new Set<object>()): string[] {
  if (value == null) return [];
  if (typeof value !== "object") return [String(value)];
  if (seen.has(value as object)) return [];
  seen.add(value as object);
  const entries = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  return entries.flatMap((v) => valuesDeep(v, seen));
}

/* ══════════════════════ RM3-AC-19 · the chip and the marker are ONE fact ══════════════════════ */

describe("the card's chip and the machine's marker are one derivation (RM3-AC-19)", () => {
  /**
   * **The trap.** `yardConfirmed: true` on an INFERRED level — the case where the boolean and the
   * truth disagree. Supplier-side `yardConfirmed` is derived from `yardId != null` and is pre-filled
   * from the machine's registered yard, so it is true for every readiness-written entry: a surface
   * reading it for colour turns the whole map green while the offer carries no per-unit commitment
   * at all. `listing_yard` is level 4, so the honest answer is `unconfirmed`.
   */
  const trap = fleet([{ id: "trap", source: "listing_yard", yardConfirmed: true }])[0];
  /** The mirror image: the boolean says no, the precedence says the supplier named this machine's
   *  yard for this bid. The honest answer is `confirmed`. */
  const mirror = fleet([{ id: "mirror", source: "unit_yard", yardConfirmed: false }])[0];

  it("has a fixture whose boolean and precedence really do disagree — the positive control", () => {
    // Without this, both assertions below could pass on a machine where every reading agrees, and the
    // test would be green over a fixture that cannot distinguish the right rule from the wrong one.
    expect(trap.yardConfirmed).toBe(true);
    expect(unitAvailability(trap)).toBe("unconfirmed");
    expect(mirror.yardConfirmed).toBe(false);
    expect(unitAvailability(mirror)).toBe("confirmed");
  });

  it("gives the card chip and the marker the SAME state and the SAME colour for the trap machine", () => {
    const card = equipmentCardModel(trap);
    const [marker] = machineMarkers([trap]);

    // Not "both happen to be unconfirmed" — both are the same value, produced by the same call.
    expect(card.chip).toEqual(availabilityView(trap));
    expect(marker.availability).toBe(card.chip.availability);
    expect(card.chip).toEqual({ availability: "unconfirmed", colour: AVAILABILITY_COLOUR.unconfirmed });
  });

  it("agrees the other way too — the boolean says no and both surfaces still say confirmed", () => {
    const card = equipmentCardModel(mirror);
    const [marker] = machineMarkers([mirror]);
    expect(marker.availability).toBe(card.chip.availability);
    expect(card.chip).toEqual({ availability: "confirmed", colour: AVAILABILITY_COLOUR.confirmed });
  });

  it("agrees across a whole mixed offer, machine by machine", () => {
    const listed = offeredMachines(
      fleet([
        { id: "a", source: "unit_yard", yardConfirmed: false },
        { id: "b", source: "listing_yard", yardConfirmed: true },
        { id: "c", source: "bid_pin", yardConfirmed: true },
        { id: "d", source: "bid_yard", yardConfirmed: true },
      ]),
    );
    const byId = new Map(machineMarkers(listed).map((m) => [m.id, m]));
    expect(byId.size).toBe(4); // the sweep is not vacuous

    for (const machine of listed) {
      const card = equipmentCardModel(machine);
      expect(byId.get(machine.equipmentId)?.availability, machine.equipmentId).toBe(card.chip.availability);
    }
    // …and the mixed offer really is mixed, or "they agree" would be trivially true.
    expect(new Set(listed.map((m) => equipmentCardModel(m).chip.availability))).toEqual(
      new Set(["confirmed", "unconfirmed"]),
    );
  });

  it("carries only the two availability colours, and only one of them per machine", () => {
    // A third colour anywhere on a card is a third state the surface is not allowed to have.
    const card = equipmentCardModel(trap);
    const palette = valuesDeep(card).filter((v) => /^#[0-9a-f]{6}$/i.test(v));
    expect(palette.filter((v) => v.toUpperCase() === AVAILABILITY_COLOUR.unconfirmed.toUpperCase())).toHaveLength(1);
    expect(palette.filter((v) => v.toUpperCase() === AVAILABILITY_COLOUR.confirmed.toUpperCase())).toHaveLength(0);
  });
});

/* ── the other half of RM3-AC-19: the boolean is not reachable from either drawing surface ──────────
   The model assertions above prove the two surfaces agree TODAY. This proves they cannot be made to
   disagree by the one edit that would do it — reading `yardConfirmed` at a render.

   **Comments are stripped first.** These files explain the rule using the words the rule forbids —
   `EquipmentList.tsx`'s header says "never from the `yardConfirmed` boolean" in as many words — so a
   naive grep reports a violation on the sentence that states the prohibition. */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

/** Block comments, line comments and JSX comments removed; string literals are left alone, since a
 *  string containing `yardConfirmed` would be a real read waiting to happen. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("neither drawing surface can reach the yardConfirmed boolean (RM3-AC-19)", () => {
  /** The three files that decide or draw a machine's colour. */
  const DRAWS_COLOUR = [
    "src/components/map/equipment-card-model.ts",
    "src/components/map/EquipmentList.tsx",
    "src/components/map/MapCanvas.tsx",
    "src/components/map/BidMapWorkspace.tsx",
  ];

  it("strips comments without eating code — the positive control on the stripper", () => {
    // The trap the first pass walked into. Without this, every assertion below could be passing
    // because the stripper deleted the file.
    expect(stripComments("const a = 1; // yardConfirmed\nconst b = 2;")).toContain("const b = 2");
    expect(stripComments("/* yardConfirmed */ const a = 1;")).toContain("const a = 1");
    expect(stripComments("/* yardConfirmed */ const a = 1;")).not.toContain("yardConfirmed");
    // A url is not a line comment.
    expect(stripComments('const u = "https://x/y";')).toContain("https://x/y");
  });

  it("has files that DO mention the boolean in prose — so the strip is doing real work", () => {
    // If these ever stop explaining the rule, the assertion below weakens silently to a tautology.
    const explaining = DRAWS_COLOUR.filter((f) => read(f).includes("yardConfirmed"));
    expect(explaining.length).toBeGreaterThan(0);
  });

  it("references it in no executable line of any of them", () => {
    for (const file of DRAWS_COLOUR) {
      expect(stripComments(read(file)), file).not.toMatch(/yardConfirmed/);
    }
  });

  it("routes the card's colour through `equipmentCardModel` and the marker's through `machineMarkers`", () => {
    // The rule is not just "does not read the boolean" — it is "reads the ONE derivation". A card
    // that re-derived its own `unitAvailability(...) ? … : …` would satisfy the negative above and
    // still be a second spelling of the fact.
    const list = stripComments(read("src/components/map/EquipmentList.tsx"));
    expect(list).toMatch(/equipmentCardModel\(/);
    expect(list).not.toMatch(/unitAvailability|AVAILABILITY_COLOUR/);

    const workspace = stripComments(read("src/components/map/BidMapWorkspace.tsx"));
    expect(workspace).toMatch(/machineMarkers\(/);
    expect(workspace).not.toMatch(/unitAvailability|AVAILABILITY_COLOUR/);

    // And the model itself resolves it exactly once.
    const model = stripComments(read("src/components/map/equipment-card-model.ts"));
    expect(model.match(/availabilityView\(/g) ?? []).toHaveLength(1);
  });
});

/* ══════════════════════ RM3-AC-12 · no serial number and no load capacity ══════════════════════ */

describe("the card states neither the serial number nor the load capacity (RM3-AC-12)", () => {
  const card = one({ id: "eq", docs: ["tuv"] });

  it("is built from a machine that HAS both — the positive control on the sweep", () => {
    const machine = fleet([{ id: "eq" }])[0];
    expect(machine.serialNumber).toBe(SERIAL);
    expect(machine.measurementName).toBe(CAPACITY);
    // And the model really is populated, so the sweeps below are over something.
    expect(card.title.en).toContain("Caterpillar 320D");
    expect(card.certs.length).toBeGreaterThan(0);
    expect(card.photo).not.toBeNull();
  });

  it("exposes no key that is or carries a serial or a capacity", () => {
    expect(keysDeep(card).filter((k) => /serial|capacity|measurement|plate|vin|chassis/i.test(k))).toEqual([]);
  });

  it("carries neither VALUE, under any key — a serial smuggled into a subtitle is still a serial", () => {
    // The sharper half. A key sweep alone would miss `{ line2: "SN-CAT-320D-88117" }`.
    const values = valuesDeep(card);
    expect(values.filter((v) => v.includes(SERIAL))).toEqual([]);
    expect(values.filter((v) => v.includes(CAPACITY))).toEqual([]);
  });

  it("keeps the type word it IS allowed to state — the taxonomy name is not the capacity", () => {
    // A machine whose listing has no make/model falls back to the taxonomy word, which §6.4 asks for.
    // It must not drag the measurement in behind it.
    const bare = equipmentCardModel(
      mapFleet([
        {
          equipmentId: "bare",
          subcategoryName: "Excavator",
          measurementName: CAPACITY,
          serialNumber: SERIAL,
          year: 2019,
          inBid: true,
          locationSource: "unit_yard",
          photoKeys: [],
          documentKeys: [],
        },
      ])[0],
    );
    expect(bare.title.en).toBe("Excavator · 2019");
    expect(valuesDeep(bare).filter((v) => v.includes(CAPACITY))).toEqual([]);
  });
});

/* ══════════════ RM3-AC-13 · the ask exists exactly when there is something to ask ══════════════ */

describe("«اطلب التأكيد» is offered iff availability is unconfirmed (RM3-AC-13)", () => {
  it("offers it on every unconfirmed level, without opening the detail", () => {
    for (const source of ["listing_yard", "bid_yard", "bid_pin", "none"]) {
      const card = one({ id: "eq", source, lat: source === "none" ? null : 24.7, lng: source === "none" ? null : 46.7 });
      expect(card.chip.availability, source).toBe("unconfirmed");
      expect(card.askAvailability, source).not.toBeNull();
    }
  });

  it("offers nothing on a confirmed card — there is no control, not a disabled one", () => {
    const card = one({ id: "eq", source: "unit_yard" });
    expect(card.chip.availability).toBe("confirmed");
    expect(card.askAvailability).toBeNull();
  });

  it("is an IFF, machine by machine, across a mixed offer", () => {
    // The mutation this catches: `askAvailability` rendered unconditionally, or gated on something
    // else — a missing document, a distance — that happens to correlate on a two-machine fixture.
    const listed = offeredMachines(
      fleet([
        { id: "a", source: "unit_yard", docs: ["tuv"] },
        { id: "b", source: "listing_yard", docs: ["tuv"] },
        { id: "c", source: "unit_yard", docs: [], km: 900 },
        { id: "d", source: "bid_pin", docs: [], km: null },
      ]),
    );
    expect(listed).toHaveLength(4);
    for (const machine of listed) {
      const card = equipmentCardModel(machine);
      expect(card.askAvailability !== null, machine.equipmentId).toBe(card.chip.availability === "unconfirmed");
    }
  });
});

/* ══════════════ RM3-AC-32 · one chip, and no second commitment field anywhere ══════════════ */

describe("availability and commitment are ONE chip value (RM3-AC-32)", () => {
  const card = one({ id: "eq", source: "unit_yard", docs: ["tuv", "spsp"] });

  it("carries exactly one commitment state in the whole model, at any depth", () => {
    // The strongest form of "one chip": count the STATES, not the fields. A second band arriving as
    // `readiness: { availability: "confirmed" }` would be a second field with an innocent name and
    // would still be caught here.
    const states = valuesDeep(card).filter((v) => v === "confirmed" || v === "unconfirmed" || v === "absent");
    expect(states).toEqual(["confirmed"]);
  });

  it("carries exactly one availability colour, so the chip and the hairline are one value", () => {
    const colours = valuesDeep(card).filter((v) =>
      Object.values(AVAILABILITY_COLOUR).some((c) => c.toUpperCase() === v.toUpperCase()),
    );
    expect(colours).toHaveLength(1);
  });

  it("exposes no readiness band, no percent and no second commitment field", () => {
    expect(keysDeep(card).filter((k) => /band|readiness|percent|score|commit|yardConfirmed|status/i.test(k))).toEqual([]);
  });

  it("has the chip it says it has — exactly two keys, and both are the chip's own", () => {
    expect(Object.keys(card.chip).sort()).toEqual(["availability", "colour"]);
  });

  it("still carries the certificates, which are a fact about DOCUMENTS and not a second chip", () => {
    // The positive control on the rule: RM3-AC-32 forbids a second COMMITMENT signal, not row 4.
    expect(card.certs.map((c) => c.en)).toEqual(["TÜV", "SPSP"]);
  });
});

/* ══════════════════════ RM3-AC-33 · the ask is blue, and never navy ══════════════════════ */

describe("the request action is blue, never navy (RM3-AC-33)", () => {
  /** The navies this surface actually draws — the card title, the distance figure, the empty state's
   *  heading. Any of them on the ask would read as disabled beside a red chip. */
  const NAVY = ["#16304F", "#1C3550", "#0F2238", "#16304f"];

  it("gives the ask the blue token and nothing else", () => {
    const card = one({ id: "eq", source: "listing_yard" });
    expect(card.askAvailability?.colour).toBe(REQUEST_ACTION_COLOUR);
    expect(REQUEST_ACTION_COLOUR.toUpperCase()).toBe("#2563EB");
  });

  it("is not any navy on the surface, and not the availability red beside it", () => {
    const token = REQUEST_ACTION_COLOUR.toUpperCase();
    for (const navy of NAVY) expect(token).not.toBe(navy.toUpperCase());
    expect(token).not.toBe(AVAILABILITY_COLOUR.unconfirmed.toUpperCase());
    expect(token).not.toBe(AVAILABILITY_COLOUR.confirmed.toUpperCase());
  });

  it("is blue by measurement, not by name — its blue channel dominates", () => {
    // The mutation this catches is `REQUEST_ACTION_COLOUR = "#16304F"`, which is still "a colour
    // called blue" by the constant's name. Navy is dark and near-neutral; this token is neither.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(REQUEST_ACTION_COLOUR.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(200);
    expect(b - r).toBeGreaterThan(120);
    expect(b - g).toBeGreaterThan(120);
  });
});

/* ══════════ RM3-AC-21 / RM3-AC-15 · one marker per plottable offered machine ══════════ */

describe("machineMarkers — one marker per plottable offered machine (RM3-AC-21, RM3-AC-15, RM3-AC-22)", () => {
  const listed = offeredMachines(
    fleet([
      { id: "near", source: "unit_yard", km: 8 },
      { id: "far", source: "listing_yard", km: 300 },
      { id: "no-coords", source: "none", lat: null, lng: null, km: null },
      { id: "owned-only", inBid: false },
      { id: "claimed", source: "unidentified" },
    ]),
  );

  it("draws one marker for each machine that has a card AND coordinates, and no others", () => {
    expect(listed.map((m) => m.equipmentId)).toEqual(["near", "far", "no-coords"]);
    expect(machineMarkers(listed).map((m) => m.id)).toEqual(["near", "far"]);
  });

  it("never invents a marker for a machine that has no card", () => {
    // A supplier-owned machine he did not offer, and a claimed count with no machine at all.
    const cardIds = new Set(listed.map((m) => m.equipmentId));
    for (const marker of machineMarkers(listed)) expect(cardIds.has(marker.id)).toBe(true);
    expect(machineMarkers(listed).map((m) => m.id)).not.toContain("owned-only");
    expect(machineMarkers(listed).map((m) => m.id)).not.toContain("claimed");
  });

  it("takes each marker's availability from `unitAvailability`, not from the boolean", () => {
    const markers = machineMarkers(listed);
    expect(markers.map((m) => m.availability)).toEqual(["confirmed", "unconfirmed"]);
    for (const marker of markers) {
      const machine = listed.find((m) => m.equipmentId === marker.id) as FleetMachine;
      expect(marker.availability).toBe(unitAvailability(machine));
    }
  });

  it("carries a real distance or null — never a 0 standing in for 'unknown'", () => {
    const withUnknown = offeredMachines(fleet([{ id: "u", km: null }]));
    expect(machineMarkers(withUnknown)[0].distanceKm).toBeNull();
    expect(machineMarkers(listed)[0].distanceKm).toBe(8);
  });

  it("exposes no `inBid`, no readiness and no `yardConfirmed` on a marker", () => {
    // The pin says what it is and nothing else (§6.8). "Not in this offer" is not a state this type
    // can represent, which is stronger than a branch that happens never to be taken.
    expect(Object.keys(machineMarkers(listed)[0]).sort()).toEqual(["availability", "distanceKm", "id", "lat", "lng"]);
  });
});
