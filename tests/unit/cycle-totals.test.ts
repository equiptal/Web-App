import { describe, it, expect } from "vitest";
import { computeCycleTotals, cycleDays, cyclesIn } from "@/lib/contract/cycle-totals";

/** The bid in the owner's mockup: 80,210/month, nothing to deliver, 1,500 to return, over 180 days. */
const MOCKUP = {
  rate: 80210,
  priceUnit: "PER_MONTH",
  mob: { amount: 0 },
  demob: { amount: 1500 },
  durationDays: 180,
};

describe("cycleDays", () => {
  it("counts calendar days per cycle, not working days", () => {
    expect(cycleDays("PER_DAY")).toBe(1);
    expect(cycleDays("PER_WEEK")).toBe(7);
    // 30, not 26: this answers how often you are billed, and a month is billed per month.
    expect(cycleDays("PER_MONTH")).toBe(30);
    expect(cycleDays("PER_JOB")).toBe(0);
  });

  it("falls back to a day for an unstated or unknown unit", () => {
    expect(cycleDays(null)).toBe(1);
    expect(cycleDays("PER_FORTNIGHT")).toBe(1);
  });
});

describe("cyclesIn", () => {
  it("divides the duration by the cycle", () => {
    expect(cyclesIn(180, "PER_MONTH")).toBe(6);
    expect(cyclesIn(28, "PER_WEEK")).toBe(4);
  });

  it("charges a started cycle in full", () => {
    expect(cyclesIn(45, "PER_MONTH")).toBe(2);
    expect(cyclesIn(31, "PER_MONTH")).toBe(2);
  });

  it("never charges less than one cycle", () => {
    expect(cyclesIn(3, "PER_MONTH")).toBe(1);
    expect(cyclesIn(0, "PER_MONTH")).toBe(1);
  });

  it("bills a job once, whatever the duration", () => {
    expect(cyclesIn(365, "PER_JOB")).toBe(1);
  });
});

describe("computeCycleTotals — the mockup's own numbers", () => {
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

  it("spreads the rate across the horizon and charges the legs once", () => {
    expect(t.horizon?.days).toBe(180);
    expect(t.horizon?.cycles).toBe(6);
    expect(t.horizon?.rental).toBe(481260);
    expect(t.horizon?.oneOff).toBe(1500);
    expect(t.horizon?.subtotal).toBe(482760);
    expect(t.horizon?.vat).toBe(72414);
    expect(Math.round(t.horizon!.total)).toBe(555174);
  });
});

describe("computeCycleTotals — the rest", () => {
  it("ignores an excluded leg however much price is stored against it", () => {
    const t = computeCycleTotals({ ...MOCKUP, demob: { amount: 1500, excluded: true } });
    expect(t.firstCycle.oneOff).toBe(0);
    expect(t.firstCycle.subtotal).toBe(80210);
  });

  it("multiplies every figure by the units offered", () => {
    const t = computeCycleTotals({ ...MOCKUP, units: 3 });
    expect(t.firstCycle.rental).toBe(240630);
    expect(t.firstCycle.oneOff).toBe(4500);
    expect(t.horizon?.rental).toBe(1443780);
  });

  it("shows no horizon when the request never stated a duration", () => {
    expect(computeCycleTotals({ ...MOCKUP, durationDays: null }).horizon).toBeNull();
    expect(computeCycleTotals({ ...MOCKUP, durationDays: 0 }).horizon).toBeNull();
  });

  it("has no second cycle on a per-job quote", () => {
    const t = computeCycleTotals({ ...MOCKUP, priceUnit: "PER_JOB" });
    expect(t.everyCycleAfter).toBeNull();
    // The job is billed once, so its horizon is the job itself, legs included.
    expect(t.horizon?.cycles).toBe(1);
    expect(t.horizon?.rental).toBe(80210);
  });

  it("treats a missing rate as nothing rather than crashing", () => {
    const t = computeCycleTotals({ ...MOCKUP, rate: null });
    expect(t.firstCycle.rental).toBe(0);
    expect(t.firstCycle.subtotal).toBe(1500);
  });
});
