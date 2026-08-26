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
  IN_OFFER_BADGE_COLOUR,
  REQUEST_ACTION_COLOUR,
  arabicIndicDigits,
  availabilityView,
  distanceDigits,
  unitAvailability,
} from "@/lib/contract/bid-map";
import { machineMarkers, listedMachines } from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { equipmentCardModel } from "@/components/map/equipment-card-model";
import { channels, NAVY_TOKENS } from "../setup/ds";

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
  /** The listing's admin verification state — the ONLY thing the title's ✓ may read. Absent from
   *  every other fixture on purpose, so a tick anywhere else in this file is a bug by construction. */
  verificationStatus?: string;
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
      verificationStatus: r.verificationStatus,
      photoKeys: [{ slot: "front", key: "p0", url: "https://x/front.jpg" }],
      documentKeys: (r.docs ?? []).map((type, i) => ({ type, key: `d${i}`, url: `https://x/${type}` })),
    })),
  );

/** The request a card is read against. Certificates on the card are the REQUESTED ones (owner,
 *  2026-08-11), so every fixture that expects chips has to say what was asked for. */
const asking = (certs: string[]) => ({ reqEquipmentCerts: certs }) as never;

const one = (r: RawMachine, req: string[] = ["tuv", "spsp"]) =>
  equipmentCardModel(fleet([r])[0], asking(req));

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
    const listed = listedMachines(
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

  it("carries ONE availability colour per machine, and never a second", () => {
    /* ~~there are three since 2026-08-13~~ — back to TWO on 2026-08-17, aligning with the app. The
       rule this test defends never changed: a card wears exactly ONE availability colour, so it
       cannot state two states at once. The trap fixture's yard is inferred, so its one colour is red.

       The orange is NOT in this palette and must not be: it is the in-offer badge, a different
       question, and the moment it appears among the availability colours it has become a third
       state again. */
    const card = equipmentCardModel(trap);
    // The model states colours as tokens now, not as hex.
    const palette = valuesDeep(card).filter((v) => /^var\(--[a-z0-9-]+\)$/i.test(v));
    expect(palette.filter((v) => v.toUpperCase() === AVAILABILITY_COLOUR.unconfirmed.toUpperCase())).toHaveLength(1);
    expect(palette.filter((v) => v.toUpperCase() === AVAILABILITY_COLOUR.confirmed.toUpperCase())).toHaveLength(0);
    expect(palette.filter((v) => v.toUpperCase() === IN_OFFER_BADGE_COLOUR.toUpperCase())).toHaveLength(0);
  });

  it("says membership as a flag, not as a colour", () => {
    // The badge is a boolean on the model. If it ever arrives carrying a hex, the split has collapsed.
    expect(equipmentCardModel(trap).inOffer).toBe(true);
    expect(equipmentCardModel({ ...trap, inBid: false }).inOffer).toBe(false);
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
  const card = one({ id: "eq", docs: ["tuv"] }, ["tuv"]);

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
    const listed = listedMachines(
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
      // The ask is offered on BOTH unsettled states since 2026-08-13 — «اطلب التأكيد» answers the
      // orange "where is it?" and the red "will you offer it?" alike. Only a confirmed card has
      // nothing left to ask.
      expect(card.askAvailability !== null, machine.equipmentId).toBe(card.chip.availability !== "confirmed");
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
    expect(card.certs.map((c) => c.label.en)).toEqual(["TÜV", "SPSP"]);
  });
});

/* ═════════ the certificate line answers the REQUEST, not the machine (owner, 2026-08-11) ═════════ */

describe("row 4 lists the certificates the REQUEST asked for, held or not", () => {
  it("names a requested certificate the machine has, as held", () => {
    const card = one({ id: "eq", docs: ["tuv"] }, ["tuv"]);
    expect(card.certs).toEqual([{ code: "tuv", label: { en: "TÜV", ar: "TÜV" }, held: true }]);
  });

  it("names a requested certificate the machine LACKS, as missing", () => {
    // The case the old card was silent about: the renter asked for a TÜV, the machine has none, and
    // the line said nothing at all because it only listed what was on the file.
    const card = one({ id: "eq", docs: [] }, ["tuv"]);
    expect(card.certs).toEqual([{ code: "tuv", label: { en: "TÜV", ar: "TÜV" }, held: false }]);
  });

  it("does NOT name a certificate the machine holds that nobody asked for", () => {
    // The owner's words: "not requested docs, the renter will not be interested to see it here."
    // It is still on the documents tab — this line is the answer to his request, not an inventory.
    const card = one({ id: "eq", docs: ["insurance", "tuv"] }, ["tuv"]);
    expect(card.certs.map((c) => c.code)).toEqual(["tuv"]);
  });

  it("is empty when the request asked for no certificates at all", () => {
    // Which the card states as "none requested" — a different sentence from "the machine has none",
    // and the only one this line is entitled to make.
    expect(one({ id: "eq", docs: ["tuv", "spsp"] }, []).certs).toEqual([]);
  });

  it("is empty when no request is supplied, rather than falling back to the machine's own papers", () => {
    expect(equipmentCardModel(fleet([{ id: "eq", docs: ["tuv"] }])[0]).certs).toEqual([]);
  });
});

/* ═════ the title's ✓ is the MACHINE's verification, not a proxy for it (owner, 2026-08-11) ═════
   *"For equipment verification ticked make sure it is read the equipment status is it verified really
   or not."*

   The defect: the mark was rendered on `certs.length > 0`. `certs` is one entry per certificate the
   REQUEST named — held or not — so the condition was a fact about the request, identical for every
   card in the list. A request that asked for a TÜV put the platform's trust mark on every machine in
   the supplier's fleet, admin-REJECTED ones included; a request that asked for none left the mark off
   machines the platform genuinely had verified. On staging (2026-08-11) 455 of the 1104 listings this
   map is eligible to plot are not VERIFIED, so the wrong green was the common case, not the edge.

   Every test below is written so that the OLD rule fails it: each fixture's certificate list and each
   fixture's verification state are set INDEPENDENTLY, and the two disagree. A card whose tick still
   came from `certs` would go red here rather than pass on a fixture where the two happen to line up. */

describe("the verified mark reads `verificationStatus`, never the certificate line", () => {
  it("has fixtures where the two really do disagree — the positive control", () => {
    // Without this, "verified is false" below could be true because the card has no certs at all,
    // and the test would prove nothing about which of the two it read.
    const unverifiedButAsked = one({ id: "a", docs: ["tuv"], verificationStatus: "UNVERIFIED" }, ["tuv"]);
    const verifiedButUnasked = one({ id: "b", docs: ["tuv"], verificationStatus: "VERIFIED" }, []);
    expect(unverifiedButAsked.certs.length).toBeGreaterThan(0);
    expect(verifiedButUnasked.certs).toEqual([]);
  });

  it("does NOT tick an UNVERIFIED machine, however many certificates the request named", () => {
    // The exact shape of the bug: a full certificate line and no verification.
    expect(one({ id: "a", docs: ["tuv"], verificationStatus: "UNVERIFIED" }, ["tuv", "spsp"]).verified).toBe(false);
  });

  it("DOES tick a VERIFIED machine on a request that named no certificate at all", () => {
    // The other half, and the half a renter loses silently: the platform checked this machine's
    // papers and the card said nothing, because the request happened to ask for nothing.
    expect(one({ id: "b", docs: [], verificationStatus: "VERIFIED" }, []).verified).toBe(true);
  });

  it("ticks VERIFIED and nothing else — ACCEPTED is a shopfront stage, not a verdict on the papers", () => {
    // `equipment-where.ts` folds VERIFIED ∪ ACCEPTED into `ACCEPTED_STATUSES`, but that fold answers
    // "may renters see this listing"; borrowing it would put the trust mark on 271 of staging's
    // map-eligible machines that nobody verified.
    expect(verifiedOf("VERIFIED")).toBe(true);
    for (const status of ["ACCEPTED", "PENDING_REVIEW", "UNVERIFIED", "REJECTED"]) {
      expect(verifiedOf(status), status).toBe(false);
    }
  });

  it("treats an absent status as NOT verified — an unknown draws no tick, never an assumed one", () => {
    // Older projections and previews carry no status. "We don't know" and "we checked and it failed"
    // render the same way, which is the only safe direction for a trust mark.
    expect(verifiedOf(undefined)).toBe(false);
    // …and it is not case-forgiving either: the parser passes the wire value through verbatim, so a
    // lowercase spelling is an unrecognised state, not a quiet synonym.
    expect(verifiedOf("verified")).toBe(false);
  });

  function verifiedOf(status?: string) {
    return one({ id: "eq", docs: ["tuv"], verificationStatus: status }, ["tuv"]).verified;
  }

  it("varies machine by machine across one list — it is not a property of the request", () => {
    // The mutation this catches and the per-machine assertions above do not: any rule derived from
    // the REQUEST gives every card in a list the same answer. This list is read against ONE request
    // and must still come back mixed.
    const cards = fleet([
      { id: "a", docs: ["tuv"], verificationStatus: "VERIFIED" },
      { id: "b", docs: ["tuv"], verificationStatus: "UNVERIFIED" },
      { id: "c", docs: ["tuv"], verificationStatus: "ACCEPTED" },
      { id: "d", docs: ["tuv"], verificationStatus: "VERIFIED" },
    ]).map((m) => equipmentCardModel(m, asking(["tuv"])));

    expect(cards.map((c) => c.verified)).toEqual([true, false, false, true]);
    // …and every one of them carries the SAME certificate line, so the old rule would have said
    // `true` four times over.
    expect(new Set(cards.map((c) => c.certs.length))).toEqual(new Set([1]));
  });

  it("survives the wire: `mapFleet` carries the status through, camel or snake", () => {
    // The model can only be right if the parser hands it the field. `mapOfferedUnit` is where a
    // dropped key would silently turn the whole map's ticks off with every unit test still green.
    const [camel, snake] = mapFleet([
      { equipmentId: "a", inBid: true, verificationStatus: "VERIFIED", photoKeys: [], documentKeys: [] },
      { equipmentId: "b", inBid: true, verification_status: "VERIFIED", photoKeys: [], documentKeys: [] },
    ]);
    expect(camel.verificationStatus).toBe("VERIFIED");
    expect(snake.verificationStatus).toBe("VERIFIED");
    expect(equipmentCardModel(camel).verified).toBe(true);
    expect(equipmentCardModel(snake).verified).toBe(true);
  });

  it("is decided in ONE place, and the card paints what it is handed", () => {
    // The rule is not only "does not read `certs`" — it is "reads the one derivation", the same
    // shape RM3-AC-19 is guarded in above. A component re-deriving `verificationStatus === "VERIFIED"`
    // inline would satisfy the negative and still be a second spelling of the word.
    const model = stripComments(read("src/components/map/equipment-card-model.ts"));
    expect(model).toMatch(/isEquipmentVerified\(/);
    expect(model.match(/isEquipmentVerified\(/g) ?? []).toHaveLength(1);

    const list = stripComments(read("src/components/map/EquipmentList.tsx"));
    // The renderer knows the WORD verified only as the model's field; it may not name the status,
    // the enum members, or the helper.
    expect(list).not.toMatch(/verificationStatus|VERIFIED|isEquipmentVerified/);
  });
});

/* ═══════ the distance is never rounded to a whole kilometre (owner, 2026-08-11) ═══════
   *"Do not round, always keep one decimal."*

   The defect he caught: a supplier moved a machine to a genuinely nearer yard, the fleet read went
   **8.2 → 7.5 km**, and `Math.round` rendered both as «8 km» — so the move was invisible. And because
   `Math.round(7.5)` is 8, a yard 700 m closer displayed as *the same distance* as the one it replaced.
   These machines are usually inside one city; whole kilometres are coarser than the differences the
   renter is deciding on. */

describe("the card states the distance to one decimal, never rounded to a whole kilometre", () => {
  const km = (v: number | null) => equipmentCardModel(fleet([{ id: "eq", km: v }])[0]).km;

  it("keeps 7.5 and 8.2 DIFFERENT — the exact regression the owner reported", () => {
    // Under `Math.round` both of these were 8, which is what made a real move invisible. This is the
    // one assertion that goes red the moment the rounding comes back.
    expect(km(7.5)).toBe(7.5);
    expect(km(8.2)).toBe(8.2);
    expect(km(7.5)).not.toBe(km(8.2));
  });

  it("rounds to the decimal rather than past it, and does so at every magnitude", () => {
    expect(km(7.46)).toBe(7.5);
    expect(km(7.44)).toBe(7.4);
    expect(km(140.28)).toBe(140.3);
    // A whole number stays a whole number as a VALUE — the trailing `.0` is the formatter's job, not
    // the model's, because this model holds no locale and both scripts write the separator differently.
    expect(km(8)).toBe(8);
  });

  it("leaves an unknown distance null — it must never become 0 or 0.0", () => {
    // The one way "always one decimal" could have been read as "always a number".
    expect(km(null)).toBeNull();
    expect(equipmentCardModel(mapFleet([{ equipmentId: "x", inBid: true, locationSource: "unit_yard", photoKeys: [], documentKeys: [] }])[0]).km).toBeNull();
  });
});

describe("distanceDigits — the one formatter every surface's distance goes through", () => {
  it("always shows one decimal, trailing zero and all, so a column is one shape to scan", () => {
    expect(distanceDigits(8, false)).toBe("8.0");
    expect(distanceDigits(7.5, false)).toBe("7.5");
    expect(distanceDigits(140.3, false)).toBe("140.3");
  });

  it("writes Arabic-Indic digits with the ARABIC decimal separator, U+066B — not a Latin full stop", () => {
    // Checked against `Intl.NumberFormat('ar-SA-u-nu-arab')`, which formats 7.5 as ٧٫٥. A Latin `.`
    // would have LOOKED correct on screen — both characters are bidi class AN inside the `dir="ltr"`
    // isolate the numeral carries — while being the wrong character in every string copied off it.
    const arabic = distanceDigits(7.5, true);
    expect(arabic).toBe("٧٫٥");
    expect([...arabic].map((c) => c.codePointAt(0))).toEqual([0x0667, 0x066b, 0x0665]);
    expect(arabic).not.toContain(".");
    expect(distanceDigits(8, true)).toBe("٨٫٠");
    // …and it agrees with the platform's own answer, so the separator is not our invention.
    expect(arabic).toBe(new Intl.NumberFormat("ar-SA-u-nu-arab", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(7.5));
  });

  it("is NOT `arabicIndicDigits`, which truncates — the mutation this whole rule exists to stop", () => {
    // The count formatter is right for counts and silently wrong for a measurement: it would state a
    // 7.5 km yard as «٧». The two being separate functions is the fix.
    expect(arabicIndicDigits(7.5)).toBe("٧");
    expect(distanceDigits(7.5, true)).not.toBe(arabicIndicDigits(7.5));
  });

  it("is what ALL THREE surfaces state a distance through — the whole point of one formatter", () => {
    /* The card, the marker's distance chip and the machine detail's own line describe one machine's
       distance, and the failure this rule guards against is two of them disagreeing about it. So each
       is proved to call the shared formatter, and proved NOT to hold a private one — the marker's
       chip did, a truncating copy of `toArabicIndic`, which is why it could never have shown a
       decimal however carefully the model carried one. */
    const surfaces = [
      "src/components/map/EquipmentList.tsx",
      "src/components/map/MapCanvas.tsx",
      "src/components/map/panel/EquipmentDetail.tsx",
    ];
    for (const file of surfaces) {
      const src = stripComments(read(file));
      expect(src, file).toMatch(/distanceDigits\(/);
      // No second formatter, and no re-rounding at the render — either would be this rule written a
      // second time, in the one place it has already been got wrong.
      expect(src, file).not.toMatch(/ARABIC_INDIC|toArabicIndic/);
      expect(src, file).not.toMatch(/Math\.round\((?:km|distanceKm)\)/);
      expect(src, file).not.toMatch(/arabicIndicDigits\(km\)|arDigits\(.*km/);
    }
  });
});

/* ══════════════════════ RM3-AC-33 · the ask is blue, and never navy ══════════════════════ */

describe("the request action is blue, never navy (RM3-AC-33)", () => {
  /** The navies this surface actually draws — the card title, the distance figure, the empty state's
   *  heading. Any of them on the ask would read as disabled beside a red chip. */
  const NAVY = NAVY_TOKENS;

  it("gives the ask the blue token and nothing else", () => {
    const card = one({ id: "eq", source: "listing_yard" });
    expect(card.askAvailability?.colour).toBe(REQUEST_ACTION_COLOUR);
    expect(REQUEST_ACTION_COLOUR).toBe("var(--info)");
  });

  it("is not any navy on the surface, and not the availability red beside it", () => {
    const token = REQUEST_ACTION_COLOUR.toUpperCase();
    for (const navy of NAVY) expect(token).not.toBe(navy.toUpperCase());
    expect(token).not.toBe(AVAILABILITY_COLOUR.unconfirmed.toUpperCase());
    expect(token).not.toBe(AVAILABILITY_COLOUR.confirmed.toUpperCase());
  });

  it("is blue by measurement, not by name — its blue channel dominates", () => {
    // The mutation this catches is `REQUEST_ACTION_COLOUR = "var(--navy-deep)"`, which is still "a
    // colour called blue" by the constant's name. Navy is dark and near-neutral; this token is
    // neither. Resolved through the palette first, because a token NAME proves nothing about what
    // the reader sees — `--info` could be pointed anywhere tomorrow and the AC would go on passing.
    const { r, g, b } = channels(REQUEST_ACTION_COLOUR)!;
    expect(b).toBeGreaterThan(180);
    expect(b - r).toBeGreaterThan(120);
    expect(b - g).toBeGreaterThan(50);
  });
});

/* ══════════ RM3-AC-21 / RM3-AC-15 · one marker per plottable offered machine ══════════ */

describe("machineMarkers — one marker per plottable offered machine (RM3-AC-21, RM3-AC-15, RM3-AC-22)", () => {
  const listed = listedMachines(
    fleet([
      { id: "near", source: "unit_yard", km: 8 },
      { id: "far", source: "listing_yard", km: 300 },
      { id: "no-coords", source: "none", lat: null, lng: null, km: null },
      { id: "owned-only", inBid: false },
      { id: "claimed", source: "unidentified" },
    ]),
  );

  it("draws one marker for each machine that has a card AND coordinates, and no others", () => {
    // `owned-only` has a card since 2026-08-13 and it has coordinates, so it is drawn. Only `claimed`
    // (no machine at all) and `no-coords` (no point) are not. The rule is untouched: a marker needs a
    // card AND coordinates.
    //
    // ~~`["near", "owned-only", "far", "no-coords"]`~~ — distance-only order. Superseded 2026-08-19:
    // the offer sorts first (app parity), so `owned-only` drops below the three offered machines
    // including the one with no distance at all. WHICH machines are drawn is unchanged, which is what
    // this case is about.
    expect(listed.map((m) => m.equipmentId)).toEqual(["near", "far", "no-coords", "owned-only"]);
    expect(machineMarkers(listed).map((m) => m.id)).toEqual(["near", "far", "owned-only"]);
  });

  it("never invents a marker for a machine that has no card", () => {
    // A claimed count names no machine, so it has neither a card nor a marker. (A machine he owns and
    // did not offer now has BOTH — 2026-08-13 — which is why it is no longer named here.)
    const cardIds = new Set(listed.map((m) => m.equipmentId));
    for (const marker of machineMarkers(listed)) expect(cardIds.has(marker.id)).toBe(true);
    expect(machineMarkers(listed).map((m) => m.id)).not.toContain("claimed");
  });

  it("takes each marker's availability from `unitAvailability`, not from the boolean", () => {
    const markers = machineMarkers(listed);
    expect(markers.map((m) => m.availability)).toEqual(["confirmed", "unconfirmed", "unconfirmed"]);
    for (const marker of markers) {
      const machine = listed.find((m) => m.equipmentId === marker.id) as FleetMachine;
      expect(marker.availability).toBe(unitAvailability(machine));
    }
  });

  it("carries a real distance or null — never a 0 standing in for 'unknown'", () => {
    const withUnknown = listedMachines(fleet([{ id: "u", km: null }]));
    expect(machineMarkers(withUnknown)[0].distanceKm).toBeNull();
    expect(machineMarkers(listed)[0].distanceKm).toBe(8);
  });

  it("exposes no `inBid`, no readiness and no `yardConfirmed` on a marker", () => {
    // The pin says what it is and nothing else (§6.8). "Not in this offer" is not a state this type
    // can represent, which is stronger than a branch that happens never to be taken.
    expect(Object.keys(machineMarkers(listed)[0]).sort()).toEqual(["availability", "distanceKm", "id", "lat", "lng"]);
  });
});
