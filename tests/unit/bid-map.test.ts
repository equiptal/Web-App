import { describe, it, expect } from "vitest";
import {
  AVAILABILITY_COLOUR,
  MIN_PIN_GAP_PX,
  colourKeyModel,
  compositionBuckets,
  decollide,
  isPlottable,
  resolveUnitLocation,
  sortBids,
  unitAvailability,
  unitCountLabel,
  unitCounts,
  unitIndicators,
} from "@/lib/contract/bid-map";
import { bidSuppliers, bidSupplierKey, mapBidList, type BidCard, type OfferedUnitDetail, type UnitLocationSource } from "@/lib/contract/bids";
import type { UnitReadiness } from "@/lib/contract/bid-readiness";

/**
 * S2 — the pure selectors behind the deal-room rentee map (spec 001 §6.2, §6.3.2, §6.6, §6.9, §6.11).
 * Covers RMAP-TC-12, TC-27 and the sort half of TC-17, plus the colour-key and de-collision rules the
 * spec states in prose. Every assertion here is a rule three surfaces share, so a break means the pin,
 * the chip and the bar have started to disagree.
 */

const unit = (p: Partial<OfferedUnitDetail> = {}): OfferedUnitDetail => ({
  equipmentId: "eq-1",
  manufacturer: null,
  modelName: null,
  year: null,
  fuelType: null,
  licensePlateNumber: null,
  subcategoryName: null,
  subcategoryNameAr: null,
  measurementName: null,
  measurementNameAr: null,
  documentKeys: [],
  photoKeys: [],
  ...p,
});

/** A unit at a real point, so the location rules are exercised separately from the colour rules. */
const located = (source: UnitLocationSource, p: Partial<OfferedUnitDetail> = {}): OfferedUnitDetail =>
  unit({ locationSource: source, lat: 24.7, lng: 46.7, distanceKm: 12.5, ...p });

const bid = (p: Partial<BidCard> = {}): BidCard =>
  ({ id: "b1", unitsOffered: 1, price: null, distanceKm: null, ...p }) as BidCard;

const readiness = (band: UnitReadiness["band"]): UnitReadiness =>
  ({ equipmentId: "eq-1", band, done: 1, total: 1, percent: 100 }) as UnitReadiness;

describe("unitAvailability — the single source of the map's colour (AC-18, §6.9.1)", () => {
  it("is confirmed for unit_yard and ONLY unit_yard — the one level that means 'committed to this bid'", () => {
    expect(unitAvailability(located("unit_yard"))).toBe("confirmed");
  });

  it("is unconfirmed for every inferred level — bid_pin, bid_yard, listing_yard", () => {
    expect(unitAvailability(located("bid_pin"))).toBe("unconfirmed");
    expect(unitAvailability(located("bid_yard"))).toBe("unconfirmed");
    expect(unitAvailability(located("listing_yard"))).toBe("unconfirmed");
  });

  it("a unit_yard unit is confirmed while a listing_yard unit is not, however precise the coordinate", () => {
    // Same yard, same point: only the level differs, and the level is the whole signal.
    const committed = located("unit_yard", { equipmentId: "a" });
    const registered = located("listing_yard", { equipmentId: "b" });
    expect(unitAvailability(committed)).toBe("confirmed");
    expect(unitAvailability(registered)).toBe("unconfirmed");
  });

  it("is absent ONLY for unidentified — there is no machine to colour (AC-58, §6.6)", () => {
    expect(unitAvailability(unit({ locationSource: "unidentified" }))).toBe("absent");
  });

  it("is unconfirmed for none — a REGISTERED machine whose yard was deleted still has documents", () => {
    // §7.3 distinguishes the two deliberately: `unidentified` is no machine, `none` is a real machine
    // with an unknown location. It cannot be plotted (isPlottable), but it is not indicator-less.
    expect(unitAvailability(unit({ locationSource: "none" }))).toBe("unconfirmed");
  });

  it("never turns green off the yardConfirmed boolean — supplier-side it is just yardId != null", () => {
    // AC-10 / the 2026-08-05 colour decision: the flag is reported verbatim and rendered nowhere.
    expect(unitAvailability(located("listing_yard", { yardConfirmed: true, yardId: "y-1" }))).toBe("unconfirmed");
    expect(unitAvailability(located("unit_yard", { yardConfirmed: false }))).toBe("confirmed");
  });

  it("defaults a missing locationSource to the WEAKEST level, so an absent field cannot read as green", () => {
    expect(unitAvailability(unit())).toBe("unconfirmed");
  });

  it("stays confirmed regardless of dates — the accepted approximation of §6.9.4 (TC-111)", () => {
    // Green means "he told us where it is", not "it is free on your dates". Documented, not a defect.
    expect(unitAvailability(located("unit_yard", { yardName: "Yard 1" }))).toBe("confirmed");
  });
});

describe("resolveUnitLocation — position, kept separate from commitment", () => {
  it("passes a whole point through with its level and distance", () => {
    expect(resolveUnitLocation(located("unit_yard"))).toEqual({ lat: 24.7, lng: 46.7, distanceKm: 12.5, locationSource: "unit_yard" });
  });

  it("voids a HALF-resolved point and downgrades it to none (AC-06)", () => {
    expect(resolveUnitLocation(unit({ locationSource: "unit_yard", lat: 24.7, lng: null }))).toEqual({
      lat: null,
      lng: null,
      distanceKm: null,
      locationSource: "none",
    });
  });

  it("keeps unidentified distinct from none — no machine is not the same as an unlocatable machine", () => {
    expect(resolveUnitLocation(unit({ locationSource: "unidentified" })).locationSource).toBe("unidentified");
    expect(resolveUnitLocation(unit({ locationSource: "listing_yard" })).locationSource).toBe("none");
  });

  it("rejects a non-finite distance rather than passing NaN to a label (AC-21: '—', never 0)", () => {
    expect(resolveUnitLocation(located("bid_yard", { distanceKm: Number.NaN })).distanceKm).toBeNull();
  });

  it("excludes unlocatable units from the pin set (AC-19)", () => {
    expect(isPlottable(located("bid_pin"))).toBe(true);
    expect(isPlottable(unit({ locationSource: "none" }))).toBe(false);
    expect(isPlottable(unit({ locationSource: "unidentified" }))).toBe(false);
  });
});

describe("unitCounts — offered vs identified, deliberately unreconciled (AC-37, AC-184, TC-27)", () => {
  it("a padded array [A,A,B] reads identified 2 / offered 3 / unidentified 1", () => {
    const counts = unitCounts(
      bid({
        unitsOffered: 3,
        offeredUnitsDetail: [unit({ equipmentId: "A" }), unit({ equipmentId: "A" }), unit({ equipmentId: "B" })],
      }),
    );
    expect(counts).toEqual({ offered: 3, identified: 2, unidentified: 1 });
  });

  it("reports offered 4 / identified 2 / unidentified 2 — the count and the inspectable set may disagree", () => {
    const counts = unitCounts(bid({ unitsOffered: 4, offeredUnitsDetail: [unit({ equipmentId: "A" }), unit({ equipmentId: "B" })] }));
    expect(counts).toEqual({ offered: 4, identified: 2, unidentified: 2 });
  });

  it("never reports a negative gap when more machines are named than were quoted", () => {
    const counts = unitCounts(bid({ unitsOffered: 1, offeredUnitsDetail: [unit({ equipmentId: "A" }), unit({ equipmentId: "B" })] }));
    expect(counts.unidentified).toBe(0);
  });

  it("an off-platform bid with no detail reads every quoted unit as unidentified", () => {
    expect(unitCounts(bid({ unitsOffered: 2 }))).toEqual({ offered: 2, identified: 0, unidentified: 2 });
  });
});

describe("compositionBuckets — zero buckets omitted (AC-143/144/145)", () => {
  it("splits a 3-unit offer into ready / unconfirmed / unregistered with the counts printed", () => {
    const buckets = compositionBuckets(
      bid({
        unitsOffered: 3,
        offeredUnitsDetail: [located("unit_yard", { equipmentId: "A" }), located("listing_yard", { equipmentId: "B" })],
      }),
    );
    expect(buckets).toEqual([
      { kind: "ready", count: 1 },
      { kind: "unconfirmed", count: 1 },
      { kind: "unregistered", count: 1 },
    ]);
  });

  it("OMITS a zero-count bucket entirely rather than emitting a zero-width segment", () => {
    const buckets = compositionBuckets(bid({ unitsOffered: 1, offeredUnitsDetail: [located("unit_yard", { equipmentId: "A" })] }));
    expect(buckets).toEqual([{ kind: "ready", count: 1 }]);
    expect(buckets.map((b) => b.kind)).not.toContain("unconfirmed");
    expect(buckets.every((b) => b.count > 0)).toBe(true);
  });

  it("emits no buckets at all for an offer of zero units", () => {
    expect(compositionBuckets(bid({ unitsOffered: 0 }))).toEqual([]);
  });

  it("puts a registered-but-unlocatable machine in unconfirmed, not in the unregistered hatch", () => {
    // `none` IS a registered machine the supplier did not confirm; it simply has no pin to compare to.
    const buckets = compositionBuckets(bid({ unitsOffered: 1, offeredUnitsDetail: [unit({ equipmentId: "A", locationSource: "none" })] }));
    expect(buckets).toEqual([{ kind: "unconfirmed", count: 1 }]);
  });

  it("gives an off-platform submission its own fourth state, distinct from count-only padding (AC-198)", () => {
    const buckets = compositionBuckets(bid({ unitsOffered: 2, viaSharedLink: true }));
    expect(buckets).toEqual([{ kind: "offPlatform", count: 2 }]);
  });

  it("keeps the bar's segments summing to the quoted count", () => {
    const b = bid({
      unitsOffered: 5,
      offeredUnitsDetail: [located("unit_yard", { equipmentId: "A" }), located("bid_pin", { equipmentId: "B" })],
    });
    expect(compositionBuckets(b).reduce((sum, x) => sum + x.count, 0)).toBe(5);
  });
});

describe("sortBids — price and nearest only, nulls last (AC-24, TC-17)", () => {
  const rows = [
    bid({ id: "far-cheap", price: 100, distanceKm: 300 }),
    bid({ id: "no-distance", price: 150, distanceKm: null }),
    bid({ id: "near-dear", price: 400, distanceKm: 10 }),
  ];

  it("puts null-distance bids LAST under nearest, never first", () => {
    expect(sortBids(rows, "nearest").map((b) => b.id)).toEqual(["near-dear", "far-cheap", "no-distance"]);
  });

  it("leaves the price order unaffected by a null distance", () => {
    expect(sortBids(rows, "price").map((b) => b.id)).toEqual(["far-cheap", "no-distance", "near-dear"]);
  });

  it("puts a null price last too — unknown is never cheapest", () => {
    const withNullPrice = [bid({ id: "unknown", price: null }), bid({ id: "cheap", price: 50 })];
    expect(sortBids(withNullPrice, "price").map((b) => b.id)).toEqual(["cheap", "unknown"]);
  });

  it("returns the input order when every distance is null (no project location — AC-21)", () => {
    const noSite = [bid({ id: "a" }), bid({ id: "b" }), bid({ id: "c" })];
    expect(sortBids(noSite, "nearest").map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("is stable on ties and does not mutate the caller's array", () => {
    const tied = [bid({ id: "a", price: 100 }), bid({ id: "b", price: 100 }), bid({ id: "c", price: 90 })];
    expect(sortBids(tied, "price").map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(tied.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("unitIndicators — two independent signals (AC-55→58)", () => {
  it("shows BOTH for a single-unit bid — neither is conditional on being multi-unit (AC-56)", () => {
    expect(unitIndicators(located("unit_yard"), readiness("green"))).toEqual({ readinessBand: "green", availability: "confirmed" });
  });

  it("lets the two disagree without either masking the other (AC-57)", () => {
    // Fully documented, yard unconfirmed…
    expect(unitIndicators(located("listing_yard"), readiness("green"))).toEqual({ readinessBand: "green", availability: "unconfirmed" });
    // …and the reverse.
    expect(unitIndicators(located("unit_yard"), readiness("red"))).toEqual({ readinessBand: "red", availability: "confirmed" });
  });

  it("shows NEITHER indicator for an unidentified unit (AC-58)", () => {
    expect(unitIndicators(unit({ locationSource: "unidentified" }), readiness("red"))).toEqual({ readinessBand: null, availability: "absent" });
  });

  it("KEEPS the readiness band for a registered machine with no resolvable location (AC-58 is about unidentified only)", () => {
    // Its yard was deleted, so it cannot be plotted — but it still holds photos and documents, so the
    // band is meaningful and the pair stays visible in the panel and the list.
    expect(unitIndicators(unit({ locationSource: "none" }), readiness("green"))).toEqual({ readinessBand: "green", availability: "unconfirmed" });
  });

  it("reports readiness as UNAVAILABLE, never red, when there is nothing to score (AC-59)", () => {
    expect(unitIndicators(located("bid_yard"), null).readinessBand).toBeNull();
    expect(unitIndicators(located("bid_yard")).readinessBand).toBeNull();
  });
});

describe("decollide — screen-space fan-out (§6.2)", () => {
  // A metre-per-pixel projection: coordinate deltas become pixel deltas, so the fixtures read as pixels.
  const project = (lat: number, lng: number) => ({ x: lng, y: lat });
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

  it("separates two pins 10 px apart to at least the minimum gap", () => {
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 10 }], project);
    expect(placed).toHaveLength(2);
    expect(dist(placed[0], placed[1])).toBeCloseTo(MIN_PIN_GAP_PX, 6);
    expect(placed.every((p) => p.displaced)).toBe(true);
  });

  it("anchors each displaced pin back at its TRUE yard, so the leader line points at the real location", () => {
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 10 }], project);
    expect({ x: placed[0].anchorX, y: placed[0].anchorY }).toEqual({ x: 0, y: 0 });
    expect({ x: placed[1].anchorX, y: placed[1].anchorY }).toEqual({ x: 10, y: 0 });
    // And the drawn position really did move off the anchor.
    expect(dist(placed[0], { x: placed[0].anchorX, y: placed[0].anchorY })).toBeGreaterThan(0);
  });

  it("leaves pins 200 px apart untouched, with the anchor equal to the position", () => {
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 200 }], project);
    expect(placed.map((p) => p.displaced)).toEqual([false, false]);
    expect(placed[0]).toMatchObject({ x: 0, y: 0, anchorX: 0, anchorY: 0 });
    expect(placed[1]).toMatchObject({ x: 200, y: 0, anchorX: 200, anchorY: 0 });
  });

  it("fans machines that are METRES apart, not only coordinate-identical ones", () => {
    // Two machines in one yard: never equal in the data, always on top of each other on screen.
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0.4, lng: 0.7 }], project);
    expect(placed.every((p) => p.displaced)).toBe(true);
    expect(dist(placed[0], placed[1])).toBeGreaterThanOrEqual(MIN_PIN_GAP_PX - 1e-6);
  });

  it("separates every member of a 3-machine yard, not just the first pair", () => {
    const placed = decollide(
      [{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 8 }, { id: "c", lat: 8, lng: 4 }],
      project,
    );
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(dist(placed[i], placed[j])).toBeGreaterThanOrEqual(MIN_PIN_GAP_PX - 1e-6);
      }
    }
  });

  it("preserves the caller's order, since the pin list is also the panel's machine list", () => {
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 5 }, { id: "c", lat: 0, lng: 400 }], project);
    expect(placed.map((p) => p.point.id)).toEqual(["a", "b", "c"]);
    expect(placed[2].displaced).toBe(false);
  });

  it("honours an injected threshold, so pins separate on their own as the renter zooms in", () => {
    const placed = decollide([{ id: "a", lat: 0, lng: 0 }, { id: "b", lat: 0, lng: 10 }], project, 8);
    expect(placed.every((p) => p.displaced)).toBe(false);
  });

  it("handles a single pin and an empty fleet", () => {
    expect(decollide([], project)).toEqual([]);
    expect(decollide([{ id: "a", lat: 1, lng: 2 }], project)).toEqual([
      { point: { id: "a", lat: 1, lng: 2 }, x: 2, y: 1, anchorX: 2, anchorY: 1, displaced: false },
    ]);
  });
});

describe("colourKeyModel — exactly one scale (AC-129/130/167/168)", () => {
  it("exposes ONE scale, whose subject is a machine", () => {
    const key = colourKeyModel();
    expect(key.scales).toHaveLength(1);
    expect(key.scales[0].subject).toBe("machine");
  });

  it("teaches green = confirmed and red = not confirmed, and nothing else", () => {
    const [scale] = colourKeyModel().scales;
    expect(scale.entries).toEqual([
      { availability: "confirmed", meaning: "confirmed", colour: AVAILABILITY_COLOUR.confirmed },
      { availability: "unconfirmed", meaning: "not_confirmed", colour: AVAILABILITY_COLOUR.unconfirmed },
    ]);
  });

  it("maps no meaning to two colours and no colour to two meanings — never red then amber", () => {
    const entries = colourKeyModel().scales.flatMap((s) => s.entries);
    const byMeaning = new Map<string, Set<string>>();
    const byColour = new Map<string, Set<string>>();
    for (const e of entries) {
      (byMeaning.get(e.meaning) ?? byMeaning.set(e.meaning, new Set()).get(e.meaning)!).add(e.colour);
      (byColour.get(e.colour) ?? byColour.set(e.colour, new Set()).get(e.colour)!).add(e.meaning);
    }
    for (const colours of byMeaning.values()) expect(colours.size).toBe(1);
    for (const meanings of byColour.values()) expect(meanings.size).toBe(1);
  });

  it("carries no amber and no supplier-level aggregate", () => {
    const entries = colourKeyModel().scales.flatMap((s) => s.entries);
    expect(entries).toHaveLength(2);
    // The PROTOTYPE's pair, not §6.3.1's `#12904A`/`#C62A2A` (design.md §7 decision 1, 2026-08-06):
    // AC-168 requires all four surfaces to be the same red, so exactly one pair can exist, and this is
    // the one the pin, the machine chip and the composition bar already draw.
    expect(entries.map((e) => e.colour.toLowerCase())).toEqual(["#16a34a", "#d9362a"]);
  });

  it("colours a pin and its panel chip from the same table, so the four surfaces cannot diverge (AC-168)", () => {
    const unconfirmed = located("listing_yard");
    const colourFor = (u: OfferedUnitDetail) => {
      const a = unitAvailability(u);
      return a === "absent" ? null : AVAILABILITY_COLOUR[a];
    };
    expect(colourFor(unconfirmed)).toBe(AVAILABILITY_COLOUR.unconfirmed);
    expect(colourFor(located("unit_yard"))).toBe(AVAILABILITY_COLOUR.confirmed);
    expect(colourFor(unit({ locationSource: "unidentified" }))).toBeNull();
  });
});

describe("unitCountLabel — one literal Arabic form (AC-146)", () => {
  it("returns the three literal forms, with no dual and no plural", () => {
    expect(unitCountLabel(1)).toBe("١ وحدة");
    expect(unitCountLabel(2)).toBe("٢ وحدة");
    expect(unitCountLabel(11)).toBe("١١ وحدة");
  });

  it("never inflects — 3 and 10 read exactly like 1", () => {
    expect(unitCountLabel(3)).toBe("٣ وحدة");
    expect(unitCountLabel(10)).toBe("١٠ وحدة");
    expect(unitCountLabel(0)).toBe("٠ وحدة");
  });
});

/* ── T8's contract additions, asserted through the mapper the browser actually uses ── */

describe("bids contract — per-unit location reaches the client (T8, §7.2)", () => {
  it("maps every §7.2 field with camel/snake tolerance", () => {
    const [b] = mapBidList({
      activeBids: [
        {
          id: "b1",
          unitsOffered: [{ equipmentId: "eq-1" }],
          offeredUnitsDetail: [
            {
              equipment_id: "eq-1",
              yard_id: "y-9",
              yard_name: "Dammam yard",
              yard_city: "Dammam",
              yard_confirmed: true,
              lat: 26.4,
              lng: 50.1,
              distance_km: 41.2,
              location_source: "unit_yard",
            },
          ],
        },
      ],
    });
    expect(b.offeredUnitsDetail?.[0]).toMatchObject({
      equipmentId: "eq-1",
      yardId: "y-9",
      yardName: "Dammam yard",
      yardCity: "Dammam",
      yardConfirmed: true,
      lat: 26.4,
      lng: 50.1,
      distanceKm: 41.2,
      locationSource: "unit_yard",
    });
    expect(unitAvailability(b.offeredUnitsDetail![0])).toBe("confirmed");
  });

  it("keeps parsing an OLD payload that carries none of them, and never reads it as confirmed", () => {
    const [b] = mapBidList({ activeBids: [{ id: "b1", offeredUnitsDetail: [{ equipmentId: "eq-1", year: 2020 }] }] });
    const u = b.offeredUnitsDetail![0];
    expect(u.year).toBe(2020);
    expect(u.locationSource).toBeUndefined();
    expect(u.yardConfirmed).toBeUndefined(); // absent ≠ "the supplier declined to confirm"
    expect(unitAvailability(u)).toBe("unconfirmed");
  });

  it("ignores an unrecognised locationSource instead of inventing a level", () => {
    const [b] = mapBidList({ activeBids: [{ id: "b1", offeredUnitsDetail: [{ equipmentId: "eq-1", locationSource: "somewhere" }] }] });
    expect(b.offeredUnitsDetail![0].locationSource).toBeUndefined();
  });

  it("adds bid-level lat/lng/locationSource without disturbing distanceKm (AC-09)", () => {
    const req = { request: { projectLat: 24.7, projectLng: 46.7, equipmentItems: [{ numberOfUnits: 1 }] } };
    const [pin] = mapBidList({ activeBids: [{ id: "b1", equipmentLat: 26.4, equipmentLng: 50.1, ...req }] });
    expect(pin).toMatchObject({ lat: 26.4, lng: 50.1, locationSource: "bid_pin" });
    expect(pin.distanceKm).toBeGreaterThan(0);

    const [yard] = mapBidList({ activeBids: [{ id: "b2", yard: { latitude: 26.4, longitude: 50.1 }, ...req }] });
    expect(yard.locationSource).toBe("bid_yard");

    const [listing] = mapBidList({ activeBids: [{ id: "b3", equipment: { yard: { latitude: 26.4, longitude: 50.1 } }, ...req }] });
    expect(listing.locationSource).toBe("listing_yard");

    const [nowhere] = mapBidList({ activeBids: [{ id: "b4", ...req }] });
    expect(nowhere).toMatchObject({ lat: null, lng: null, locationSource: "none", distanceKm: null });
  });

  it("never emits a half-resolved bid point", () => {
    const [b] = mapBidList({ activeBids: [{ id: "b1", equipmentLat: 26.4 }] });
    expect(b).toMatchObject({ lat: null, lng: null, locationSource: "none" });
  });
});

describe("bidSuppliers — one firm is one counterparty (AC-70)", () => {
  it("groups two colleagues of the same company as ONE counterparty", () => {
    const [b] = mapBidList({ activeBids: [{ id: "b1", supplierCompanyId: 77, supplier: { id: 1 } }] });
    const [c] = mapBidList({ activeBids: [{ id: "b2", supplier: { id: 2, companyId: 77 } }] });
    expect(b.supplierCompanyId).toBe("77");
    expect(c.supplierCompanyId).toBe("77");

    const grouped = bidSuppliers([b, c]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
  });

  it("still separates two suppliers with no company, and keeps the member → name fallback", () => {
    const withId = bid({ supplierCompanyId: null, supplierId: "9", supplierName: "A" });
    const nameOnly = bid({ supplierCompanyId: null, supplierId: null, supplierName: "B" });
    expect(bidSupplierKey(withId)).toBe("9");
    expect(bidSupplierKey(nameOnly)).toBe("B");
    expect(bidSuppliers([withId, nameOnly])).toHaveLength(2);
  });

  it("prefers the company over the member, so the chip key and the row filter agree", () => {
    expect(bidSupplierKey(bid({ supplierCompanyId: "77", supplierId: "1", supplierName: "A" }))).toBe("77");
  });
});
