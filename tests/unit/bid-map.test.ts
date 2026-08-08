import { describe, it, expect } from "vitest";
import {
  AVAILABILITY_COLOUR,
  LANDING_CUE_MS,
  MIN_PIN_GAP_PX,
  SHORTFALL_COLOUR,
  arabicIndicDigits,
  countCase,
  decollide,
  englishTypePlural,
  isPlottable,
  requestTypeWord,
  resolveUnitLocation,
  shortfallAlert,
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

/** One fleet row, reduced to the single field the counts read: is this machine IN this bid? The fleet
 *  endpoint returns every qualifying machine the supplier owns, offered or not (§7.1). */
const fleet = (inBid: boolean) => ({ inBid });

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

describe("unitCounts — the three numbers behind the pills and the shortfall (RM3-AC-31, TC-15)", () => {
  it("counts REGISTERED as `inBid === true` rows only — the fleet also carries machines he did not offer", () => {
    // 4 qualifying machines in the yard, 2 of them actually in this offer, 3 units quoted.
    const counts = unitCounts(bid({ unitsOffered: 3 }), [fleet(true), fleet(true), fleet(false), fleet(false)]);
    // Counting all four rows would have made `claimed` 0 and hidden a real shortfall of 1 — the exact
    // defect 004a §4.2 names.
    expect(counts).toEqual({ offered: 3, registered: 2, claimed: 1, owned: 4 });
  });

  it("computes claimed as offered − registered, never from the fleet total (RM3-AC-31)", () => {
    const counts = unitCounts(bid({ unitsOffered: 5 }), [fleet(true), fleet(false), fleet(false), fleet(false), fleet(false), fleet(false)]);
    expect(counts.claimed).toBe(4); // 5 − 1, and NOT 5 − 6 (the fleet total) which would clamp to 0
    expect(counts.owned).toBe(6);
  });

  it("clamps to zero rather than rendering a negative shortfall (RM3-AC-31)", () => {
    // More machines registered against the bid than units quoted — possible, and not a shortfall.
    expect(unitCounts(bid({ unitsOffered: 1 }), [fleet(true), fleet(true)]).claimed).toBe(0);
  });

  it("reads every quoted unit as claimed when the offer names no machine at all", () => {
    expect(unitCounts(bid({ unitsOffered: 2 }), [fleet(false)])).toEqual({ offered: 2, registered: 0, claimed: 2, owned: 1 });
  });

  it("owns the OFFER's count — an agreed or mid-negotiation count never reaches it (RM3-AC-65/67)", () => {
    // The footer prices on `agreedUnits`; the pills describe what was offered. Both are on the bid, and
    // only one is read here.
    const counts = unitCounts(bid({ unitsOffered: 3, agreedUnits: 2, currentRentalUnits: 1 }), [fleet(true)]);
    expect(counts.offered).toBe(3);
    expect(counts.claimed).toBe(2);
  });

  it("survives an empty fleet without inventing a machine", () => {
    expect(unitCounts(bid({ unitsOffered: 1 }), [])).toEqual({ offered: 1, registered: 0, claimed: 1, owned: 0 });
  });
});

describe("countCase — §6.2's three cases, decided once (RM3-AC-03, 04, 05)", () => {
  it("is `single` for an offer of one unit — the owned pill alone", () => {
    expect(countCase({ offered: 1, claimed: 0 })).toBe("single");
    expect(countCase({ offered: 0, claimed: 0 })).toBe("single");
  });

  it("is `multi` for more than one unit with nothing claimed — two pills, NO alert", () => {
    expect(countCase({ offered: 4, claimed: 0 })).toBe("multi");
  });

  it("is `short` only when something is claimed, so the alert's absence means nothing is claimed", () => {
    expect(countCase({ offered: 4, claimed: 1 })).toBe("short");
  });

  it("never reports `short` for a single-unit offer, whatever the arithmetic says", () => {
    // A one-unit offer with no registered machine is still the single case: §6.2 keys the branch on the
    // OFFERED count, so a lone unit never gets the multi-unit comparison pill.
    expect(countCase({ offered: 1, claimed: 1 })).toBe("single");
  });
});

/* ──────────────── V4 · the shortfall alert's CONTENT and its COLOUR (RM3-AC-05 / AC-06) ────────────────
   `countCase` above proves the TRIGGER — when the alert appears. That was the whole of AC-05's
   coverage, and it left the criterion's real claim untested: the alert states the **difference**, not
   the offered total. Swapping `counts.claimed` for `counts.offered` in the render kept every test in
   this file green. AC-06 — orange, never red — had no test at all; it is not visual-only, because the
   colours on this surface are exported constants. */

describe("shortfallAlert — the alert states the DIFFERENCE, not the offer (RM3-AC-05)", () => {
  /** 5 quoted, 2 machines named, 4 qualifying machines in the yard: 3 units have no machine behind
   *  them. **All four numbers are distinct**, so no wrong derivation can coincide with the right one
   *  — a fixture where `claimed` happened to equal `owned` would let one of them through. */
  const short = unitCounts(bid({ unitsOffered: 5 }), [fleet(true), fleet(true), fleet(false), fleet(false)]);

  it("has a fixture whose four numbers are all different — the positive control", () => {
    expect(short).toEqual({ offered: 5, registered: 2, claimed: 3, owned: 4 });
    expect(new Set(Object.values(short)).size).toBe(4);
  });

  it("carries the claimed count and NOT the offered total", () => {
    const alert = shortfallAlert(short);
    expect(alert?.claimed).toBe(3);
    expect(alert?.claimed).not.toBe(short.offered);
    expect(alert?.claimed).not.toBe(short.registered);
    expect(alert?.claimed).not.toBe(short.owned);
  });

  it("puts the offered total out of the copy's reach entirely", () => {
    // Not "the model happens to state the right one" — the wrong one is not on the model to reach
    // for. A sentence built from this object cannot say «٥ وحدة» however it is written.
    const alert = shortfallAlert(short) as NonNullable<ReturnType<typeof shortfallAlert>>;
    expect(Object.keys(alert).sort()).toEqual(["claimed", "colour"]);
    expect(Object.values(alert)).not.toContain(short.offered);
  });

  it("holds the difference across a range of offers, so no single fixture can be a coincidence", () => {
    for (const [offered, registered, claimed] of [[2, 1, 1], [4, 1, 3], [9, 2, 7], [3, 0, 3]]) {
      const counts = unitCounts(bid({ unitsOffered: offered }), Array.from({ length: registered }, () => fleet(true)));
      expect(shortfallAlert(counts)?.claimed, `${offered}/${registered}`).toBe(claimed);
    }
  });

  it("is null on every case that is not `short`, so its absence means nothing is claimed", () => {
    // `multi` — every quoted unit has a machine.
    expect(shortfallAlert(unitCounts(bid({ unitsOffered: 3 }), [fleet(true), fleet(true), fleet(true)]))).toBeNull();
    // `single` — a one-unit offer is never a shortfall however the arithmetic lands.
    expect(shortfallAlert(unitCounts(bid({ unitsOffered: 1 }), [fleet(false)]))).toBeNull();
    // More machines named than units quoted — possible, and not a shortfall.
    expect(shortfallAlert(unitCounts(bid({ unitsOffered: 2 }), [fleet(true), fleet(true), fleet(true)]))).toBeNull();
    // …and the alert really does render on the one case that is left.
    expect(shortfallAlert({ offered: 4, claimed: 1 })).not.toBeNull();
  });
});

describe("the shortfall is ORANGE, and never availability's red (RM3-AC-06)", () => {
  it("wears its own token, which is neither availability colour", () => {
    expect(shortfallAlert({ offered: 4, claimed: 1 })?.colour).toBe(SHORTFALL_COLOUR);
    expect(SHORTFALL_COLOUR.toUpperCase()).not.toBe(AVAILABILITY_COLOUR.unconfirmed.toUpperCase());
    expect(SHORTFALL_COLOUR.toUpperCase()).not.toBe(AVAILABILITY_COLOUR.confirmed.toUpperCase());
  });

  it("is orange by measurement, not by name — red and green are both excluded", () => {
    // The mutation this catches is `SHORTFALL_COLOUR = "#D9362A"`, which is still a constant called
    // SHORTFALL_COLOUR. Orange has a substantial green channel between the two; red does not.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(SHORTFALL_COLOUR.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(150); // warm
    expect(g).toBeGreaterThan(90); // …and not red, which has almost no green
    expect(g).toBeLessThan(r); // …and not yellow or green either
    expect(b).toBeLessThan(60);

    const [rr, rg] = [1, 3].map((i) => parseInt(AVAILABILITY_COLOUR.unconfirmed.slice(i, i + 2), 16));
    expect(rg).toBeLessThan(90); // the positive control: availability's red really is green-poor
    expect(rr).toBeGreaterThan(150);
  });
});

/* ───────────────────── V6 · the landing cue is finite (RM3-AC-35, first half) ─────────────────────
   The stylesheet's half — exactly 6 iterations and no `infinite` — is in
   `rentee-map-surface.test.ts`, where the CSS is read. This is the constant that takes the class back
   off, which is the half that lives in code. */

describe("LANDING_CUE_MS — the cue ends (RM3-AC-35)", () => {
  it("is a finite number of milliseconds, and it is the spec's 9_400", () => {
    expect(Number.isFinite(LANDING_CUE_MS)).toBe(true);
    expect(LANDING_CUE_MS).toBe(9_400);
  });

  it("outlasts the animation it is taking down — 6 × 1.5s, plus a beat", () => {
    // Shorter than the keyframes' own budget would cut the cue short; unboundedly longer would leave
    // a resting card carrying a class that can be restarted by an unrelated re-render.
    expect(LANDING_CUE_MS).toBeGreaterThanOrEqual(6 * 1500);
    expect(LANDING_CUE_MS).toBeLessThan(6 * 1500 + 2000);
  });
});

describe("englishTypePlural — the type word agrees with the count (RM3-AC-08)", () => {
  it("leaves the singular alone for a count of one", () => {
    expect(englishTypePlural("Forklift", 1)).toBe("Forklift");
  });

  it("inflects the head noun of a multi-word taxonomy name", () => {
    expect(englishTypePlural("Mobile crane", 3)).toBe("Mobile cranes");
    expect(englishTypePlural("Boom lift", 2)).toBe("Boom lifts");
  });

  it("handles the sibilant and consonant-y endings", () => {
    expect(englishTypePlural("Bus", 2)).toBe("Buses");
    expect(englishTypePlural("Winch", 2)).toBe("Winches");
    expect(englishTypePlural("Lorry", 2)).toBe("Lorries");
  });

  it("leaves a name that does not end in a word exactly as the taxonomy wrote it", () => {
    expect(englishTypePlural("Loader 3T", 4)).toBe("Loader 3T");
    expect(englishTypePlural(null, 4)).toBe("");
  });
});

/* ── the other half of AC-08, which nothing asserted: the word comes from the REQUEST ──────────
   Five tests proved the pluralisation. None proved the source — re-pointing the pills at
   `machine.subcategoryName` inflected just as correctly and kept all five green. The claim is that
   the pills describe what the RENTER asked for: a supplier answering a forklift request with a
   machine the taxonomy files under a neighbouring subtype must not rename the renter's own request in
   front of him, and «٠ لدى المؤجّر» has no machine to read a word off at all. */

describe("requestTypeWord — the type word comes from the REQUEST's own type (RM3-AC-08)", () => {
  /** The trap: one object carrying BOTH vocabularies, with different words in each. The request calls
   *  it a Forklift; the fleet row calls it an Excavator. Only one of them may reach the pill. */
  const trap = {
    subtypeName: "Forklift",
    subtypeNameAr: "رافعة شوكية",
    capacityName: "3 ton",
    capacityNameAr: "٣ طن",
    // What a `FleetMachine` would offer instead. Present at runtime precisely so a mutant that reads
    // it has something plausible to find — a type-level negative would prove nothing here, because
    // Vitest transpiles without typechecking and the type is erased before the test runs.
    subcategoryName: "Excavator",
    subcategoryNameAr: "حفّارة",
    measurementName: "20 ton",
    measurementNameAr: "٢٠ طن",
  };

  it("reads the request's subtype, never the machine's subcategory", () => {
    expect(requestTypeWord(trap, 3).en).toBe("Forklifts 3 ton");
    expect(requestTypeWord(trap, 1).en).toBe("Forklift 3 ton");
    expect(requestTypeWord(trap, 3).en).not.toContain("Excavator");
  });

  it("reads the request's capacity, never the machine's measurement", () => {
    expect(requestTypeWord(trap, 2).en).not.toContain("20 ton");
    expect(requestTypeWord(trap, 2).ar).not.toContain("٢٠ طن");
  });

  it("does the same in Arabic, where one literal form serves every count", () => {
    expect(requestTypeWord(trap, 1).ar).toBe("رافعة شوكية ٣ طن");
    expect(requestTypeWord(trap, 7).ar).toBe("رافعة شوكية ٣ طن");
    expect(requestTypeWord(trap, 7).ar).not.toContain("حفّارة");
  });

  it("returns an empty word for a shape that only a MACHINE could satisfy", () => {
    // The structural half of the same claim. A fleet row handed to this function produces nothing —
    // loudly wrong rather than plausibly wrong, which is the whole point of the parameter type.
    const machineOnly = { subcategoryName: "Excavator", subcategoryNameAr: "حفّارة", measurementName: "20 ton" };
    expect(requestTypeWord(machineOnly, 3)).toEqual({ en: "", ar: "" });
  });

  it("says nothing when the request has no item at all, rather than inventing a noun", () => {
    expect(requestTypeWord(null, 3)).toEqual({ en: "", ar: "" });
    expect(requestTypeWord(undefined, 0)).toEqual({ en: "", ar: "" });
    expect(requestTypeWord({}, 3)).toEqual({ en: "", ar: "" });
  });

  it("falls back across locales within the REQUEST, never across to the machine", () => {
    // A request node with only one of the two names filled in still answers — from the request.
    expect(requestTypeWord({ subtypeNameAr: "رافعة شوكية", subcategoryName: "Excavator" }, 3).en).toBe("رافعة شوكية");
    expect(requestTypeWord({ subtypeName: "Forklift", subcategoryNameAr: "حفّارة" }, 3).ar).toBe("Forklift");
  });

  it("keeps a capacity that is not a word intact, exactly as the taxonomy wrote it", () => {
    expect(requestTypeWord({ subtypeName: "Boom lift", capacityName: "18 m" }, 4).en).toBe("Boom lifts 18 m");
  });
});

describe("arabicIndicDigits — the pill's numeral, without `unitCountLabel`'s noun", () => {
  it("converts per digit and never appends a word", () => {
    expect(arabicIndicDigits(3)).toBe("٣");
    expect(arabicIndicDigits(11)).toBe("١١");
    expect(arabicIndicDigits(0)).toBe("٠");
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
