import { describe, it, expect } from "vitest";
import {
  billableDays,
  countFridays,
  durationDaysBetween,
  computeRentalTotal,
  rentalDivisor,
} from "@/lib/pricing/rental";
import { computeCycleTotals } from "@/lib/contract/cycle-totals";
import { grossToNet, priceToStore, vatLines } from "@/lib/contract/vat-inclusive";
import { GOLDEN, WINDOW, DIVISOR, VAT, money } from "../fixtures/golden";

/**
 * The rulings, asserted against the code.
 *
 * Expected values come from `tests/fixtures/golden.ts` — computed from a calendar and the rulings in
 * `RULINGS.md`, never from running the implementation. A failure here means the code disagrees with a
 * decision someone made on purpose, which is the only kind of pricing failure worth waking up for.
 */

describe("the window itself (S-03, S-02)", () => {
  it("counts both ends of the window", () => {
    // 15 Aug → 15 Oct is 62 days, not 61. Backend `inclusiveDurationDays`, app `_computeDurationDays`.
    expect(durationDaysBetween(WINDOW.start, WINDOW.end)).toBe(WINDOW.days);
  });

  it("finds every Friday in the window", () => {
    expect(countFridays(WINDOW.start, WINDOW.days)).toBe(WINDOW.fridays);
  });

  it("bills the window minus its Fridays", () => {
    expect(billableDays(WINDOW.start, WINDOW.days)).toBe(WINDOW.billable);
  });

  it("reads dates as UTC calendar days (S-04)", () => {
    // A bare YYYY-MM-DD and its explicit UTC midnight must give the same length. Reading either
    // locally shifts the weekday west of UTC and changes which days are Fridays.
    expect(durationDaysBetween("2026-08-15", "2026-10-15")).toBe(
      durationDaysBetween("2026-08-15T00:00:00Z", "2026-10-15T00:00:00Z"),
    );
  });
});

describe("divisors (S-01)", () => {
  it("prices a week at six days, not seven", () => {
    expect(rentalDivisor("PER_WEEK")).toBe(DIVISOR.PER_WEEK);
  });

  it("prices a month at 26 working days", () => {
    expect(rentalDivisor("PER_MONTH")).toBe(DIVISOR.PER_MONTH);
  });

  it("prices a day at one", () => {
    expect(rentalDivisor("PER_DAY")).toBe(DIVISOR.PER_DAY);
  });
});

describe("per-unit rental (S-05)", () => {
  const cases = [
    ["daily", GOLDEN.dailySingle],
    ["monthly", GOLDEN.monthlySingle],
  ] as const;

  for (const [name, g] of cases) {
    it(`prices a ${name} bid over the window`, () => {
      const r = computeRentalTotal({
        rate: g.rate,
        priceUnit: g.unit,
        startDate: WINDOW.start,
        durationDays: WINDOW.days,
      });
      expect(money(r.total)).toBe(money(g.rental));
      expect(r.billable).toBe(WINDOW.billable);
      expect(r.raw).toBe(false);
    });
  }

  it("prices a weekly bid per unit, leaving the count to the caller", () => {
    // Everything in pricing/rental.ts is PER UNIT — multiplying by the count is the caller's job,
    // because the rental and the two transport legs each carry their own independent counts.
    const g = GOLDEN.weeklyMultiUnit;
    const r = computeRentalTotal({
      rate: g.rate,
      priceUnit: g.unit,
      startDate: WINDOW.start,
      durationDays: WINDOW.days,
    });
    expect(money(r.total)).toBe(money(g.perUnit));
  });

  it("falls back to the bare rate when the duration is unknown (S-06)", () => {
    // NOT one day. Under proration a defaulted single day shows a near-zero total for an open-ended
    // monthly bid.
    const r = computeRentalTotal({ rate: 16_000, priceUnit: "PER_MONTH", startDate: WINDOW.start, durationDays: null });
    expect(r.total).toBe(16_000);
    expect(r.raw).toBe(true);
  });

  it("falls back to the bare rate when the start date is missing", () => {
    // Without a start date the Fridays cannot be located, so there is nothing honest to prorate over.
    const r = computeRentalTotal({ rate: 16_000, priceUnit: "PER_MONTH", startDate: null, durationDays: WINDOW.days });
    expect(r.total).toBe(16_000);
    expect(r.raw).toBe(true);
  });
});

describe("cycle totals", () => {
  it("bills each transport leg at its own count (S-08)", () => {
    // Three machines rented, five mobilization trips and three demobilization trips settled in the
    // room. The legs bill at 5 and 3 — not at the rental's 3, and not capped by it.
    const g = GOLDEN.legsOwnCounts;
    const t = computeCycleTotals({
      rate: g.rate,
      priceUnit: g.unit,
      units: g.units,
      mob: { amount: g.mob.amount, units: g.mob.units },
      demob: { amount: g.demob.amount, units: g.demob.units },
      durationDays: WINDOW.days,
      startDate: WINDOW.start,
    });
    expect(t.duration).not.toBeNull();
    expect(money(t.duration!.rental)).toBe(money(g.rental));
    expect(money(t.duration!.oneOff)).toBe(money(g.oneOff));
    expect(money(t.duration!.subtotal)).toBe(money(g.subtotal));
    expect(money(t.duration!.vat)).toBe(money(g.vat));
    expect(money(t.duration!.total)).toBe(money(g.total));
  });

  it("bills nothing for an excluded leg, whatever count it still carries (G-7)", () => {
    const g = GOLDEN.mobExcluded;
    const t = computeCycleTotals({
      rate: g.rate,
      priceUnit: g.unit,
      units: g.units,
      mob: { amount: g.mob.amount, units: g.mob.units, excluded: true },
      demob: { amount: g.demob.amount, units: g.demob.units },
      durationDays: WINDOW.days,
      startDate: WINDOW.start,
    });
    expect(money(t.duration!.oneOff)).toBe(money(g.oneOff));
    expect(money(t.duration!.total)).toBe(money(g.total));
  });

  it("drops the legs from the recurring column, rather than showing them as zero (S-09)", () => {
    // Stating them as 0 would read as "this supplier delivers free", which is a different claim.
    const t = computeCycleTotals({
      rate: 3_000,
      priceUnit: "PER_WEEK",
      units: 3,
      mob: { amount: 500, units: 5 },
      demob: { amount: 400, units: 3 },
      durationDays: WINDOW.days,
      startDate: WINDOW.start,
    });
    expect(t.everyCycleAfter).not.toBeNull();
    expect(t.everyCycleAfter!.oneOff).toBe(0);
    expect(money(t.firstCycle.oneOff)).toBe(3_700);
  });

  it("carries full precision into the total, rounding only at the end (R-02)", () => {
    // The app's rule, and the bug it removed: rounding each component mid-computation made the same
    // deal read a riyal apart between the deal room and the card that opened it.
    //
    // 16,000 ÷ 26 × 54 = 33,230.769230…  VAT on that is 4,984.615384…  Total 38,215.384615…
    // Rounding the subtotal to 33,230.77 first gives a VAT of 4,984.6155 → a different total.
    const t = computeCycleTotals({
      rate: 16_000,
      priceUnit: "PER_MONTH",
      units: 1,
      mob: {},
      demob: {},
      durationDays: WINDOW.days,
      startDate: WINDOW.start,
    });
    const exactRental = (16_000 / 26) * WINDOW.billable;
    const exactTotal = exactRental * (1 + VAT);
    expect(money(t.duration!.total)).toBe(money(exactTotal));
  });
});

describe("VAT (R-01, R-01b, S-13)", () => {
  it("strips 15% back out of a VAT-inclusive quote on submit", () => {
    const g = GOLDEN.vatInclusiveSubmission;
    expect(grossToNet(g.enteredGross)).toBe(g.net);
    expect(priceToStore(g.enteredGross, true)).toBe(g.net);
    expect(priceToStore(g.enteredGross, false)).toBe(g.enteredGross);
  });

  it("multiplies, even where a gross was stored (R-01b, ruled)", () => {
    // Ruled: one rule across the platform. `vatLines` must not derive VAT from the stored gross.
    //
    // The stored gross here is 4,600.01 against net components of 4,000 — chosen precisely because the
    // two rules give different answers on it. On clean numbers (G-8) both give 600 and the assertion
    // would pass whichever rule were in force, proving nothing.
    const g = GOLDEN.vatStoredGrossDisagrees;
    const lines = vatLines(g.subtotal, g.storedGross);
    expect(money(lines.subtotal)).toBe(money(g.subtotal));
    expect(money(lines.vat)).toBe(money(g.vat)); // 600.00 — deriving would give 600.01
    expect(money(lines.total)).toBe(money(g.total));
  });

  it("still multiplies when no gross was stored", () => {
    const lines = vatLines(4_000, null);
    expect(money(lines.vat)).toBe(600);
    expect(money(lines.total)).toBe(4_600);
  });
});
