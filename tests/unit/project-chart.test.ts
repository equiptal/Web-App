import { describe, it, expect } from "vitest";
import { awardWindow, chartSpan, chartDates, isUnawarded, awardedUnits, type Award, type ChartGroup } from "@/lib/contract/award";
import { pct } from "@/components/projects/ChartRow";

/**
 * W-T13 / W-T14 — what the chart draws.
 *
 * An award has no period of its own, so every bar on this chart is derived. That makes `awardWindow`
 * the one place a wrong answer becomes a wrong picture: a bar that ends before its own pin, or one
 * clipped off the axis, is a renter reading their site incorrectly with nothing on screen admitting
 * it.
 */

const SITE = { startDate: "2026-09-01", endDate: "2026-12-31" };

const award = (over: Partial<Award> = {}): Award => ({
  id: "a1",
  supplierId: null,
  supplierName: "Zahid Tractor",
  units: 2,
  mobilizationAmount: null,
  demobilizationAmount: null,
  rentalBasis: "monthly",
  rateAmount: 8600,
  mobilizedAt: null,
  demobilizedAt: null,
  documents: [],
  awardedAt: null,
  ...over,
});

const group = (when: ChartGroup["when"] = null): ChartGroup => ({
  kind: "request",
  id: "g1",
  ref: "RFQ-1042",
  title: null,
  when,
  items: [],
});

/* ============================================================================================== *
 * The bar
 * ============================================================================================== */

describe("the window a bar is drawn across", () => {
  it("is the site's own period when the group inherits it", () => {
    expect(awardWindow(group(), award(), SITE)).toEqual({ start: "2026-09-01", end: "2026-12-31" });
  });

  it("is the group's period when it has one of its own", () => {
    const own = group({ startDate: "2026-10-01", endDate: "2027-03-31" });
    expect(awardWindow(own, award(), SITE)).toEqual({ start: "2026-10-01", end: "2027-03-31" });
  });

  /* ── A mark never moves the bar ────────────────────────────────────────────────────────────────

     ~~The bar stretched to meet a mark outside it, so it never contradicted a pin beside it.~~
     Reversed by the owner on 2026-08-31: *"for mebo and demo doesnt change strat or end date of the
     work order or the request or the project so they are different dates in the chart"*.

     The old behaviour printed the moved dates on the bar, so marking a machine arrived on the 31st
     made a work order starting on the 1st read «2026-08-31 → 2026-12-31» — a period nobody agreed
     to. The plan and what happened are two facts; the bar is the first, the diamonds are the second.

     These four cases are the old ones inverted, kept rather than deleted so the reversal is legible
     to whoever reads them next. */

  it("does not stretch back for a machine that arrived before the period opened", () => {
    const w = awardWindow(group(), award({ mobilizedAt: "2026-08-20" }), SITE);
    expect(w).toEqual({ start: "2026-09-01", end: "2026-12-31" });
  });

  it("does not stretch forward for one still standing there after it closed", () => {
    const w = awardWindow(group(), award({ demobilizedAt: "2027-02-10" }), SITE);
    expect(w).toEqual({ start: "2026-09-01", end: "2026-12-31" });
  });

  it("keeps the planned end even when the machine arrived after it", () => {
    // The renegotiation case: the request said Sep–Dec, the machine turned up in February. The bar
    // still says Sep–Dec, because that is what was agreed; the diamond says February.
    const w = awardWindow(group(), award({ mobilizedAt: "2027-02-01" }), SITE);
    expect(w.end).toBe("2026-12-31");
  });

  it("leaves a mark inside the period alone", () => {
    const w = awardWindow(group(), award({ mobilizedAt: "2026-09-04", demobilizedAt: "2026-11-28" }), SITE);
    expect(w).toEqual({ start: "2026-09-01", end: "2026-12-31" });
  });

  it("has no window at all on a site with no dates, mark or no mark", () => {
    const none = { startDate: null, endDate: null };
    expect(awardWindow(group(), award(), none)).toEqual({ start: null, end: null });
    /* And a mark does NOT invent one. The row draws its *pending* chip plus the diamond, which is
       honest: somebody has arrived, and nobody has said for how long. */
    expect(awardWindow(group(), award({ mobilizedAt: "2026-09-04" }), none)).toEqual({ start: null, end: null });
  });

  it("still keeps every mark inside the AXIS, so a pin outside the bar has room", () => {
    // This is what makes the reversal safe: the bar no longer moves, but the timeline still spans
    // far enough to draw a diamond that falls outside it.
    const g: ChartGroup = {
      ...group(),
      items: [
        { id: "i1", label: "Excavator 20t", labelAr: null, quantity: 1, awards: [award({ demobilizedAt: "2027-02-10" })] },
      ],
    };
    expect(chartDates([g])).toContain("2027-02-10");
  });
});

/* ============================================================================================== *
 * The axis
 * ============================================================================================== */

describe("the axis", () => {
  it("holds an un-awarded work order that runs past the site's end", () => {
    const ghost = group({ startDate: "2026-10-01", endDate: "2027-03-31" });
    const span = chartSpan([ghost], SITE)!;
    // Otherwise its bar is clipped off the right edge and the renter cannot see the overrun at all.
    expect(span.to).toBe("2027-03-31");
    expect(span.from).toBe("2026-09-01");
  });

  it("holds a mark that falls outside every period", () => {
    const g: ChartGroup = {
      ...group(),
      items: [{ id: "i1", label: "Excavator 20t", labelAr: null, quantity: 3, awards: [award({ demobilizedAt: "2027-01-15" })] }],
    };
    expect(chartDates([g])).toContain("2027-01-15");
    expect(chartSpan([g], SITE)!.to).toBe("2027-01-15");
  });

  it("has nothing to draw when there is neither a period nor a mark", () => {
    // An Unassigned row has no project, so no inherited dates and no bar.
    expect(chartSpan([group()], { startDate: null, endDate: null })).toBeNull();
  });
});

/* ============================================================================================== *
 * Positioning
 * ============================================================================================== */

describe("placing a date on the axis", () => {
  const axis = { from: "2026-09-01", to: "2026-12-31" };

  it("puts the ends at the ends", () => {
    expect(pct("2026-09-01", axis)).toBe(0);
    expect(pct("2026-12-31", axis)).toBe(100);
  });

  it("clamps anything outside rather than pushing a bar off-screen", () => {
    expect(pct("2026-01-01", axis)).toBe(0);
    expect(pct("2028-01-01", axis)).toBe(100);
  });

  it("returns a left edge for a missing date instead of NaN", () => {
    // A NaN percentage renders as an invisible element with no error anywhere.
    expect(pct(null, axis)).toBe(0);
  });

  it("does not divide by zero on a single-day axis", () => {
    expect(pct("2026-09-01", { from: "2026-09-01", to: "2026-09-01" })).toBe(0);
  });
});

/* ============================================================================================== *
 * Rows
 * ============================================================================================== */

describe("rows", () => {
  it("counts the units promised, across a split", () => {
    const item = { awards: [award({ units: 2 }), award({ id: "a2", units: 1 })] };
    expect(awardedUnits(item)).toBe(3);
  });

  it("calls an item with no award un-awarded", () => {
    expect(isUnawarded({ awards: [] })).toBe(true);
    expect(isUnawarded({ awards: [award()] })).toBe(false);
  });
});

/* ============================================================================================== *
 * The site's own papers, and the marks as events
 * ============================================================================================== */

describe("what the marks draw", () => {
  /* The reversal, asserted at the level a reader will check it: the bar PRINTS its dates, so a bar
     that moved was a bar that lied about the agreed period. */

  it("keeps the bar on the agreed period while the marks sit at their own dates", () => {
    const g = group({ startDate: "2026-09-01", endDate: "2026-12-31" });
    const a = award({ mobilizedAt: "2026-08-20", demobilizedAt: "2027-01-15" });

    // The bar: the plan, unmoved by either event.
    expect(awardWindow(g, a, SITE)).toEqual({ start: "2026-09-01", end: "2026-12-31" });

    // The axis: wide enough for both diamonds, so neither is clipped off an edge.
    const withMarks: ChartGroup = {
      ...g,
      items: [{ id: "i1", label: "Excavator 20t", labelAr: null, quantity: 1, awards: [a] }],
    };
    const dates = chartDates([withMarks]);
    expect(dates).toContain("2026-08-20");
    expect(dates).toContain("2027-01-15");
  });
});
