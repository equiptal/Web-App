/**
 * **RM3-AC-30 — the unconfirmed chip states that availability is not confirmed, and no reason.**
 *
 * ── Why this AC is delicate, and why it was unproven ─────────────────────────────────────────────
 * `locationSource` **is** the reason. It names, precisely, why availability is unconfirmed: the
 * lessor pinned the bid rather than the unit (`bid_pin`), or the machine is sitting on its listing's
 * registered yard with no per-bid commitment (`listing_yard`), or its yard row was deleted (`none`).
 * And the backend must serve it — RM3-AC-19 and RM3-AC-27 both derive the chip's own COLOUR from it.
 *
 * So the field this AC forbids the chip from surfacing is the same field the AC above it requires the
 * chip to be built on. That is not a contradiction, it is the whole design: `unitAvailability` is
 * **information-losing on purpose**. It takes the reason and returns a three-state enum, and the chip
 * is drawn from the enum. The renter is told the state; the cause is between him and the lessor.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────────────────────────
 * Section E's "prove the negative through the model" is satisfied structurally here: there is no
 * channel a reason could travel down. Four distinct unconfirmed sources collapse to one identical
 * primitive; the per-unit view model carries two keys and neither is a cause; the dictionary holds ONE
 * unconfirmed label rather than one per source; and neither chip renderer reads `locationSource` at
 * all.
 *
 * **Scope note (a decision, recorded):** the audit's "the chip's model exposes `{label}`" is
 * ambiguous between two chips on this surface — the availability STATUS chip (the pin's caption and
 * the panel's `mp-chip`) and the availability FILTER chip (§6.4a). Both are asserted, because the
 * safest reading of a negative AC is the wider one.
 *
 * **Not asserted (and deliberately so):** the panel's line renders `availability · distance · yard`,
 * and the yard NAME is a sibling element of the chip, not part of it. §6.6 specifies that line, so it
 * is not treated as a reason smuggled into the chip.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unitAvailability, unitIndicators } from "@/lib/contract/bid-map";
import { equipmentFilters } from "@/lib/contract/equipment-list";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import type { UnitLocationSource } from "@/lib/contract/bids";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Source with its comments removed. These files EXPLAIN the rule at length, using the very words the
 * rule forbids — `MachinePin`'s own doc block says *"`bid-map.ts` records the full reason"*. A rule
 * stated in prose must not fail its own test, so the assertions below read code, not commentary.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Every §7.3 level that reads as unconfirmed — four different reasons, one chip. */
const UNCONFIRMED_SOURCES: UnitLocationSource[] = ["bid_pin", "bid_yard", "listing_yard", "none"];

/* ───────────────────────────── the model cannot carry a reason ───────────────────────────── */

describe("the chip's model collapses the reason away (RM3-AC-30)", () => {
  it("maps FOUR distinct causes onto ONE identical value — a primitive, not a shape", () => {
    const results = UNCONFIRMED_SOURCES.map((locationSource) => unitAvailability({ locationSource }));
    // The fixture must actually cover four different sources, or "they all agree" is trivial.
    expect(new Set(UNCONFIRMED_SOURCES).size).toBe(4);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("unconfirmed");
    // A primitive has nowhere to hang a `reason` on. If this ever became an object the chip would be
    // able to state a cause without a single change to the copy.
    for (const r of results) expect(typeof r).toBe("string");
  });

  it("returns a THREE-state enum and nothing wider — no per-cause state to render", () => {
    /* A fourth briefly existed (`in_offer`, 2026-08-13) and was withdrawn the same day: the owner
       ruled offer membership independent of availability, so it left this enum entirely and became a
       badge. Every location level below still collapses to ONE value per question, which is what
       AC-30 is about — the renter is never told WHY a yard is unnamed. */
    const every: UnitLocationSource[] = [...UNCONFIRMED_SOURCES, "unit_yard", "unidentified"];
    const states = new Set(every.map((locationSource) => unitAvailability({ locationSource })));
    expect([...states].sort()).toEqual(["absent", "confirmed", "unconfirmed"]);
  });

  it("hands the chip a view model with exactly two keys, neither of them a cause", () => {
    const indicators = unitIndicators({ locationSource: "listing_yard" }, null);
    expect(Object.keys(indicators).sort()).toEqual(["availability", "readinessBand"]);
    for (const forbidden of ["reason", "cause", "locationSource", "why", "detail", "explanation"]) {
      expect(forbidden in indicators).toBe(false);
    }
  });

  it("gives the same view model for every unconfirmed cause — deep-equal, not merely same-state", () => {
    const models = UNCONFIRMED_SOURCES.map((locationSource) => unitIndicators({ locationSource }, null));
    for (const model of models) expect(model).toEqual(models[0]);
  });
});

/* ───────────────────────────── the copy cannot state a reason ───────────────────────────── */

describe("the chip's copy names a state, never a source (RM3-AC-30)", () => {
  const dicts = { en: src("src/lib/i18n/en.ts"), ar: src("src/lib/i18n/ar.ts") };

  const bidMapBlock = (dict: string): string => {
    const at = dict.indexOf("bidMap: {");
    expect(at).toBeGreaterThan(-1);
    return dict.slice(at, dict.indexOf("\n  },", at));
  };

  const copy = (dict: string, key: string): string => {
    const m = new RegExp(`\\n\\s*${key}:\\s*"([^"]*)"`).exec(bidMapBlock(dict));
    expect(m, `bidMap.${key} not found`).not.toBeNull();
    return (m as RegExpExecArray)[1];
  };

  /** Every label the chip can render, in both locales. */
  const CHIP_KEYS = ["pinAvailable", "pinUnconfirmed", "confirmed", "assumed"];

  it("holds ONE unconfirmed label, not one per §7.3 level", () => {
    // Four causes, one string. A dictionary with `pinUnconfirmedListingYard` beside
    // `pinUnconfirmedBidPin` would be the shape this AC forbids, arriving through i18n rather than
    // through the model.
    for (const [name, locale] of Object.entries(dicts)) {
      const block = bidMapBlock(locale);
      // The four unconfirmed levels, and the field itself. `unidentified` is deliberately NOT here:
      // it is `absent`, a state of its own with its own spec'd copy (`unitsUnidentifiedLine`), not a
      // reason offered for an unconfirmed chip.
      for (const level of ["unit_yard", "bid_pin", "bid_yard", "listing_yard", "locationSource"]) {
        expect(block, `${name}.bidMap should not name §7.3 level ${level}`).not.toContain(level);
      }
      // Exactly one key on the unconfirmed side, so there is no per-cause variant to select between.
      const variants = [...block.matchAll(/\n\s*(pinUnconfirmed\w*)\s*:/g)].map((m) => m[1]);
      expect(variants).toEqual(["pinUnconfirmed"]);
    }
    // Asserted by pattern, not by exact string: the wording is the product owner's to tune, and a
    // test that reddens on a benign reword teaches people to weaken it. What may not change is that
    // it is ONE label about confirmation, in both locales.
    expect(copy(dicts.en, "pinUnconfirmed")).toMatch(/^[^.]*confirm/i);
    expect(copy(dicts.ar, "pinUnconfirmed")).toContain("توفرها");
  });

  it("uses no causal vocabulary in either locale", () => {
    // "because", "since", "no yard", «لأن», «بسبب», «الحظيرة» — each turns a state into an accusation
    // about how the lessor filled his listing.
    const CAUSAL = [/because/i, /\bsince\b/i, /\breason\b/i, /\byard\b/i, /\blisting\b/i, /لأن/, /بسبب/, /السبب/, /الحظيرة/, /المستودع/];
    for (const [name, dict] of Object.entries(dicts)) {
      for (const key of CHIP_KEYS) {
        const value = copy(dict, key);
        for (const bad of CAUSAL) expect(value, `${name}.bidMap.${key}`).not.toMatch(bad);
      }
    }
  });

  it("still says the one thing it IS for — that availability is not confirmed", () => {
    // The negative above would also pass on an empty string. This is what stops that.
    expect(copy(dicts.en, "pinUnconfirmed")).toMatch(/confirm/i);
    expect(copy(dicts.en, "pinAvailable")).toMatch(/confirm/i);
    expect(copy(dicts.ar, "pinUnconfirmed")).toContain("توفرها");
  });
});

/* ───────────────────────────── neither renderer reads the reason ───────────────────────────── */

describe("no chip renderer can reach `locationSource` at all (RM3-AC-30)", () => {
  it("the pin's caption is drawn from the availability state alone", () => {
    const canvas = src("src/components/map/MapCanvas.tsx");
    expect(canvas).toContain('pin.availability === "confirmed"');
    // Not in a comment, not in a prop, not anywhere: the marker's code cannot see the reason.
    expect(stripComments(canvas)).not.toContain("locationSource");
  });

  it("the panel's chip is drawn from the availability state alone", () => {
    const detail = src("src/components/map/panel/EquipmentDetail.tsx");
    expect(detail).toContain('availability !== "absent"');
    expect(stripComments(detail)).not.toContain("locationSource");
  });

  it("the pin model carries a two-state availability and no source field", () => {
    // `MachinePin` is what `BidMapWorkspace` builds and `MapCanvas` paints. A `locationSource` on it
    // would put the reason inside the marker's own props, one interpolation from the caption.
    const canvas = src("src/components/map/MapCanvas.tsx");
    const at = canvas.indexOf("export interface MachinePin");
    expect(at).toBeGreaterThan(-1);
    const body = stripComments(canvas.slice(at, canvas.indexOf("\n}", at)));
    // TWO paintable states — an enum of STATES with no field for a cause, which is the whole of what
    // this test defends. `inOffer` beside it is a separate BOOLEAN fact, deliberately not a state on
    // this scale: a third enum value is exactly what the owner withdrew on 2026-08-13.
    expect(body).toContain('availability: "confirmed" | "unconfirmed"');
    for (const forbidden of ["locationSource", "reason", "cause"]) expect(body).not.toContain(forbidden);
    // Five declared fields and no sixth — the pin has no room for a cause.
    expect([...body.matchAll(/\n\s*(\w+)\s*:/g)].map((m) => m[1]).sort()).toEqual([
      "availability", "distanceKm", "id", "inOffer", "lat", "lng",
    ]);
  });
});

/* ───────────────────────────── the FILTER chip, for the same reason ───────────────────────────── */

const fleet = (rows: { id: string; source: string }[]): FleetMachine[] =>
  mapFleet(
    rows.map((r) => ({
      equipmentId: r.id,
      manufacturer: "Caterpillar",
      modelName: "320D",
      year: 2022,
      locationSource: r.source,
      distanceKm: 10,
      lat: 24.7,
      lng: 46.7,
      inBid: true,
      photoKeys: [],
      documentKeys: [],
    })),
  );

describe("the availability FILTER chip exposes a label and nothing else (RM3-AC-30)", () => {
  it("carries `{ id, kind, label, matches }` — no reason, no cause, no source", () => {
    const listed = fleet([
      { id: "m1", source: "unit_yard" },
      { id: "m2", source: "listing_yard" },
    ]);
    const group = equipmentFilters(listed, {}).find((g) => g.kind === "availability");
    expect(group, "the fixture must mix confirmed and unconfirmed, or no chip renders").toBeTruthy();
    const option = (group as NonNullable<typeof group>).options[0];
    expect(Object.keys(option).sort()).toEqual(["id", "kind", "label", "matches"]);
    expect(Object.keys(option.label).sort()).toEqual(["ar", "en"]);
    for (const forbidden of ["reason", "cause", "locationSource"]) expect(forbidden in option).toBe(false);
  });

  it("selects for what a machine HAS and never names the level it lacks", () => {
    const listed = fleet([
      { id: "m1", source: "unit_yard" },
      { id: "m2", source: "bid_pin" },
    ]);
    const group = equipmentFilters(listed, {}).find((g) => g.kind === "availability");
    const option = (group as NonNullable<typeof group>).options[0];
    expect(option.id).toBe("availability:confirmed");
    expect(`${option.label.en} ${option.label.ar}`).not.toMatch(/yard|pin|listing|الحظيرة/i);
  });
});
