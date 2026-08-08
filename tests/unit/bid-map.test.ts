import { describe, it, expect } from "vitest";
import {
  MIN_PIN_GAP_PX,
  decollide,
  isPlottable,
  resolveUnitLocation,
  unitAvailability,
  unitCountLabel,
  unitCounts,
  unitIndicators,
} from "@/lib/contract/bid-map";
import { bidSuppliers, bidSupplierKey, mapBidList, type BidCard, type OfferedUnitDetail, type UnitLocationSource } from "@/lib/contract/bids";
import type { UnitReadiness } from "@/lib/contract/bid-readiness";

/**
 * The pure selectors behind the deal-room equipment-verification surface (spec 004 §6.4, §6.8, §7.2).
 *
 * Trimmed for **v3**: `compositionBuckets`, `sortBids` and `colourKeyModel` were retired with the
 * rescope — v3 shows one bid, so there is no offers list to sort, the composition bar is replaced by
 * count pills plus a shortfall alert, and the colour scale is stated in copy rather than a legend.
 *
 * What remains is a rule that several surfaces share, so a break here means the pin and the card's
 * chip have started to disagree about the same machine.
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
