import { describe, it, expect } from "vitest";
import { computeCycleTotals, hasRecurringCycle } from "@/lib/contract/cycle-totals";

/**
 * The bid in the owner's mockup: 80,210/month, nothing to deliver, 1,500 to return, over the
 * request's 180 days starting 12 Aug 2026.
 */
const MOCKUP = {
  rate: 80210,
  priceUnit: "PER_MONTH",
  mob: { amount: 0 },
  demob: { amount: 1500 },
  durationDays: 180,
  startDate: "2026-08-12",
};

describe("hasRecurringCycle", () => {
  it("is true for every rate that repeats", () => {
    for (const u of ["PER_DAY", "PER_WEEK", "PER_MONTH"]) expect(hasRecurringCycle(u)).toBe(true);
  });

  it("is false for a job, which is billed once and entire", () => {
    expect(hasRecurringCycle("PER_JOB")).toBe(false);
  });
});

describe("computeCycleTotals — the first two columns are the quoted rate, untouched", () => {
  const t = computeCycleTotals(MOCKUP);

  it("builds the first cycle from the rate and both legs", () => {
    expect(t.firstCycle.rental).toBe(80210);
    expect(t.firstCycle.oneOff).toBe(1500);
    expect(t.firstCycle.subtotal).toBe(81710);
    expect(t.firstCycle.vat).toBe(12256.5);
    expect(Math.round(t.firstCycle.total)).toBe(93967);
  });

  it("drops the legs from every cycle after — they were paid once", () => {
    expect(t.everyCycleAfter?.oneOff).toBe(0);
    expect(t.everyCycleAfter?.rental).toBe(80210);
    expect(Math.round(t.everyCycleAfter!.total)).toBe(92242);
  });
});

describe("computeCycleTotals — the duration column follows the platform's own equation", () => {
  const t = computeCycleTotals(MOCKUP);

  it("charges billable days, not whole months", () => {
    // 180 days from 12 Aug 2026 holds 26 Fridays, and Fridays are not billed.
    expect(t.duration?.days).toBe(180);
    expect(t.duration?.billableDays).toBe(154);
    // (80,210 ÷ 26) × 154 — NOT 80,210 × 6, which the mockup drew and which would have made this
    // rental cost 6,170 more here than in the deal room and on the quotation.
    expect(Math.round(t.duration!.rental)).toBe(475090);
    expect(Math.round(t.duration!.rental)).not.toBe(481260);
  });

  it("still charges the legs once across the whole duration", () => {
    expect(t.duration?.oneOff).toBe(1500);
    expect(Math.round(t.duration!.subtotal)).toBe(476590);
    expect(Math.round(t.duration!.total)).toBe(548079);
  });

  it("prorates a part-period rather than rounding a started month up to a whole one", () => {
    const short = computeCycleTotals({ ...MOCKUP, durationDays: 45 });
    // 45 days from 12 Aug 2026 holds 7 Fridays → 38 billable. Rounding a started month up would
    // have charged two whole months, 160,420, for 38 days of work.
    expect(short.duration?.billableDays).toBe(38);
    expect(short.duration?.rental).toBe((80210 / 26) * 38);
    expect(short.duration?.rental).toBeLessThan(80210 * 2);
  });
});

describe("computeCycleTotals — the edges", () => {
  it("falls back to the bare rate when there is no start date to find the Fridays in", () => {
    const t = computeCycleTotals({ ...MOCKUP, startDate: null });
    expect(t.duration?.raw).toBe(true);
    expect(t.duration?.rental).toBe(80210);
    expect(t.duration?.billableDays).toBe(0);
  });

  it("ignores an excluded leg however much price is stored against it", () => {
    const t = computeCycleTotals({ ...MOCKUP, demob: { amount: 1500, excluded: true } });
    expect(t.firstCycle.oneOff).toBe(0);
    expect(t.firstCycle.subtotal).toBe(80210);
  });

  it("multiplies every figure by the units offered", () => {
    const t = computeCycleTotals({ ...MOCKUP, units: 3 });
    expect(t.firstCycle.rental).toBe(240630);
    expect(t.firstCycle.oneOff).toBe(4500);
    // 80,210 ÷ 26 is exactly 3,085, so the duration rental is exact: 3,085 × 154 × 3.
    expect(t.duration?.rental).toBe(475090 * 3);
  });

  it("shows no duration column when the request never stated one", () => {
    expect(computeCycleTotals({ ...MOCKUP, durationDays: null }).duration).toBeNull();
    expect(computeCycleTotals({ ...MOCKUP, durationDays: 0 }).duration).toBeNull();
  });

  it("has no second cycle on a per-job quote, and never prorates it", () => {
    const t = computeCycleTotals({ ...MOCKUP, priceUnit: "PER_JOB" });
    expect(t.everyCycleAfter).toBeNull();
    expect(t.duration?.raw).toBe(true);
    expect(t.duration?.rental).toBe(80210);
  });

  it("treats a missing rate as nothing rather than crashing", () => {
    const t = computeCycleTotals({ ...MOCKUP, rate: null });
    expect(t.firstCycle.rental).toBe(0);
    expect(t.firstCycle.subtotal).toBe(1500);
  });
});
