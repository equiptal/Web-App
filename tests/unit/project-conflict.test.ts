import { describe, it, expect } from "vitest";
import { periodConflicts } from "@/components/projects/ConflictDialog";
import { whenDiffers, effectiveWhen, EMPTY_WHEN } from "@/lib/contract/work-order";

/**
 * W-T20 — what counts as differing from the site.
 *
 * One distinction carries the whole thing: on a row's period, **`null` means INHERIT, not unset.**
 * Treat a null as a difference and every row that simply follows its site is flagged as a conflict,
 * the chip appears everywhere, and it stops meaning anything.
 */

const SITE = { startDate: "2026-09-01", endDate: "2026-12-31" };
const LABELS = { start: "Start date", end: "End date" };

describe("which fields differ", () => {
  it("finds nothing when the row inherits", () => {
    expect(periodConflicts({ startDate: null, endDate: null }, SITE, LABELS)).toEqual([]);
    // No period at all is the same answer: there is nothing to disagree with.
    expect(periodConflicts(null, SITE, LABELS)).toEqual([]);
  });

  it("finds nothing when the row states the same dates", () => {
    // A renter who typed the site's own dates has not created a conflict.
    expect(periodConflicts({ startDate: "2026-09-01", endDate: "2026-12-31" }, SITE, LABELS)).toEqual([]);
  });

  it("lists only the field that actually differs", () => {
    const out = periodConflicts({ startDate: null, endDate: "2027-03-31" }, SITE, LABELS);
    // Listing both would bury the one that matters.
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "endDate", project: "2026-12-31", row: "2027-03-31" });
  });

  it("lists both when both differ", () => {
    const out = periodConflicts({ startDate: "2026-10-01", endDate: "2027-03-31" }, SITE, LABELS);
    expect(out.map((f) => f.key)).toEqual(["startDate", "endDate"]);
  });

  it("shows an em dash where the site itself has no date", () => {
    const out = periodConflicts({ startDate: "2026-10-01", endDate: null }, { startDate: null, endDate: null }, LABELS);
    // The row states something the site never did. That is still a difference worth showing.
    expect(out[0].project).toBe("—");
    expect(out[0].row).toBe("2026-10-01");
  });
});

/**
 * The same rule on the work-order side, where the chip is computed from `whenDiffers`. The two must
 * agree, or a row shows a chip that opens a dialog listing nothing.
 */
describe("the work order's own chip", () => {
  const project = { rentalBasis: null, extendable: false, startDate: "2026-09-01", endDate: "2026-12-31", hoursPerDay: 10 };

  it("says nothing for a fully inheriting order", () => {
    expect(whenDiffers(EMPTY_WHEN, project)).toEqual([]);
  });

  it("names the field that differs, and only that one", () => {
    expect(whenDiffers({ ...EMPTY_WHEN, endDate: "2027-03-31" }, project)).toEqual(["endDate"]);
  });

  it("draws from the site wherever the order is silent", () => {
    const eff = effectiveWhen({ ...EMPTY_WHEN, endDate: "2027-03-31" }, project);
    expect(eff.startDate).toBe("2026-09-01");
    expect(eff.endDate).toBe("2027-03-31");
    expect(eff.hoursPerDay).toBe(10);
  });

  it("agrees with the dialog about when there is something to show", () => {
    for (const when of [
      EMPTY_WHEN,
      { ...EMPTY_WHEN, endDate: "2027-03-31" },
      { ...EMPTY_WHEN, startDate: "2026-09-01" }, // same as the site — not a difference
    ]) {
      const chip = whenDiffers(when, project).filter((k) => k === "startDate" || k === "endDate");
      const dialog = periodConflicts({ startDate: when.startDate, endDate: when.endDate }, SITE, LABELS);
      // A chip that opens a dialog listing nothing is the bug this pins.
      expect(dialog.length).toBe(chip.length);
    }
  });
});
