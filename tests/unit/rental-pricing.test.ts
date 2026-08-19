import { describe, it, expect } from "vitest";
import {
  billableDays,
  computeQuoteTotals,
  computeRentalTotal,
  countFridays,
  durationDaysBetween,
  formatSar,
  headlineAmount,
  legDisplay,
  rentalDivisor,
  rentalPeriodSubtitle,
} from "@/lib/pricing/rental";
import { computeDealTotals } from "@/lib/contract/deal-room";

/**
 * Parity with the mobile app's `computeRentalTotal()` (`core/utils/rental_pricing.dart`) — the maths
 * the rentee's bid card, the deal room and the quotation all price against.
 *
 * The two divergences this module exists to close: the web used a 7-day week where mobile uses 6, and
 * the web never excluded Fridays. Both are pinned below.
 */

const SUNDAY = "2026-08-09T00:00:00.000Z"; // getUTCDay() === 0

describe("rentalDivisor", () => {
  it("uses a SIX-day week (Friday is the weekend) and a 26-day month", () => {
    expect(rentalDivisor("PER_WEEK")).toBe(6);
    expect(rentalDivisor("PER_MONTH")).toBe(26);
    expect(rentalDivisor("PER_DAY")).toBe(1);
  });

  it("signals PER_JOB as 0 (flat, nothing to prorate) and defaults unknown units to daily", () => {
    expect(rentalDivisor("PER_JOB")).toBe(0);
    expect(rentalDivisor(null)).toBe(1);
    expect(rentalDivisor("per_week")).toBe(6); // case-insensitive
  });
});

describe("countFridays", () => {
  it("counts Fridays inclusively across the window", () => {
    // 13 days from a Sunday → day 6 and day 13 are Fridays.
    expect(countFridays(SUNDAY, 13)).toBe(2);
  });

  it("counts a start date that is itself a Friday", () => {
    expect(countFridays("2026-08-14T00:00:00.000Z", 1)).toBe(1); // a Friday
  });

  it("returns 0 when the window ends before the first Friday", () => {
    expect(countFridays(SUNDAY, 5)).toBe(0); // Sun–Thu
    expect(countFridays(SUNDAY, 6)).toBe(1); // …+Fri
  });

  it("is safe with no date, a bad date, or a non-positive duration", () => {
    expect(countFridays(null, 30)).toBe(0);
    expect(countFridays("not-a-date", 30)).toBe(0);
    expect(countFridays(SUNDAY, 0)).toBe(0);
    expect(countFridays(SUNDAY, -3)).toBe(0);
  });

  it("counts a long window arithmetically, not by iterating", () => {
    expect(countFridays(SUNDAY, 364)).toBe(52);
    expect(billableDays(SUNDAY, 364)).toBe(312);
  });

  it("reads the date in UTC, so the weekday cannot shift with the viewer's timezone", () => {
    // Late-evening UTC on a Sunday is already Monday in Riyadh; the count must follow the calendar date.
    expect(countFridays("2026-08-09T23:30:00.000Z", 13)).toBe(2);
  });
});

describe("durationDaysBetween", () => {
  it("counts BOTH ends — the backend's inclusiveDurationDays, which is what the money is priced on", () => {
    // `bid.service.ts`: `(endUTC − startUTC) / DAY + 1`, and the app stamps the same count onto the
    // request at creation (`_computeDurationDays`: `end.difference(start).inDays + 1`). This used to
    // drop the `+ 1`, pricing every self-derived window a day short of the backend's own estimate.
    expect(durationDaysBetween("2026-08-15", "2026-10-15")).toBe(62);
    expect(durationDaysBetween("2026-08-09", "2026-08-22")).toBe(14);
  });

  it("accepts bare dates and full ISO timestamps alike, reading both in UTC", () => {
    expect(durationDaysBetween("2026-08-09T00:00:00.000Z", "2026-08-22T00:00:00.000Z")).toBe(14);
    // Late-evening UTC is already the next day in Riyadh; the length must follow the calendar.
    expect(durationDaysBetween("2026-08-09T23:00:00.000Z", "2026-08-22T23:00:00.000Z")).toBe(14);
  });

  it("clamps a same-day or reversed window to one day, never 0 or negative", () => {
    expect(durationDaysBetween("2026-08-09", "2026-08-09")).toBe(1);
    expect(durationDaysBetween("2026-08-22", "2026-08-09")).toBe(1);
  });

  it("returns null when either end is missing — an open-ended request has no period to prorate", () => {
    expect(durationDaysBetween("2026-08-09", null)).toBeNull();
    expect(durationDaysBetween(null, "2026-08-22")).toBeNull();
    expect(durationDaysBetween(undefined, undefined)).toBeNull();
    expect(durationDaysBetween("not-a-date", "2026-08-22")).toBeNull();
  });
});

describe("the supplier bid form's worked example (public /bid/{token} page)", () => {
  // 15 Aug 2026 is a Saturday. 15 Aug → 15 Oct = 62 days (both ends) with 8 Fridays → 54 billable.
  const START = "2026-08-15";
  const days = durationDaysBetween(START, "2026-10-15");

  it("turns a monthly RATE into the period's money — the form's whole reason to change", () => {
    const r = computeRentalTotal({ rate: 30000, priceUnit: "PER_MONTH", startDate: START, durationDays: days });
    expect(days).toBe(62);
    expect(r.billable).toBe(54);
    expect(Math.round(r.total)).toBe(62308); // (30,000 ÷ 26) × 54
    // What the form showed before it knew about the calendar: one month's money for a two-month job.
    expect(Math.round(r.total)).not.toBe(30000);
  });

  it("multiplies by the offered units while transport legs stay flat per unit", () => {
    const rental = computeRentalTotal({ rate: 30000, priceUnit: "PER_MONTH", startDate: START, durationDays: days });
    const t = computeQuoteTotals({ perUnitRental: rental.total, rentalUnits: 2, mob: { amount: 1500 }, demob: { amount: 0 } });
    expect(Math.round(t.overall.rental)).toBe(124615);
    expect(t.overall.mob).toBe(3000); // 1,500 per unit — a trip, not a period
    expect(Math.round(t.overall.subtotal)).toBe(127615);
    expect(Math.round(t.overall.vat)).toBe(19142);
    expect(Math.round(t.overall.total)).toBe(146758);
  });

  it("VAT-inclusive entry lands back exactly on the gross the supplier typed", () => {
    // The form strips the 15% off the inputs, prorates, then re-adds it. Proration is linear, so
    // stripping before or after must agree to the riyal — otherwise the supplier's own number moves.
    const gross = 30000;
    const strippedFirst = computeRentalTotal({ rate: gross / 1.15, priceUnit: "PER_MONTH", startDate: START, durationDays: days }).total * 1.15;
    const strippedLast = computeRentalTotal({ rate: gross, priceUnit: "PER_MONTH", startDate: START, durationDays: days }).total;
    expect(Math.round(strippedFirst)).toBe(Math.round(strippedLast));
  });

  it("an open-ended request (no end date) still shows the quoted rate, unchanged", () => {
    const openEnded = durationDaysBetween(START, null);
    const r = computeRentalTotal({ rate: 30000, priceUnit: "PER_MONTH", startDate: START, durationDays: openEnded });
    expect(r.raw).toBe(true);
    expect(r.total).toBe(30000);
  });
});

describe("computeRentalTotal — the doc's worked example", () => {
  it("4,200/week over 13 days from a Sunday → 7,700 (÷6 over 11 billable days)", () => {
    const r = computeRentalTotal({ rate: 4200, priceUnit: "PER_WEEK", startDate: SUNDAY, durationDays: 13 });
    expect(r.billable).toBe(11);
    expect(r.total).toBe(7700);
    expect(r.raw).toBe(false);
    // The old web maths (÷7, no Friday exclusion) gave 7,800 — pinned so a revert is visible.
    expect(r.total).not.toBe((4200 / 7) * 13);
  });

  it("Friday-off applies to PER_DAY too", () => {
    expect(computeRentalTotal({ rate: 600, priceUnit: "PER_DAY", startDate: SUNDAY, durationDays: 13 }).total).toBe(600 * 11);
  });

  it("monthly prorates over 26", () => {
    const r = computeRentalTotal({ rate: 26000, priceUnit: "PER_MONTH", startDate: SUNDAY, durationDays: 13 });
    expect(r.total).toBe(1000 * 11);
  });
});

describe("computeRentalTotal — falls back to the bare rate, never 0", () => {
  const bare = (over: Record<string, unknown>) =>
    computeRentalTotal({ rate: 4200, priceUnit: "PER_WEEK", startDate: SUNDAY, durationDays: 13, ...over });

  it("with no duration — an unset duration must NOT be treated as one day", () => {
    const r = bare({ durationDays: null });
    expect(r.total).toBe(4200);
    expect(r.raw).toBe(true);
    // ÷6 of one day would have been 700 — a near-zero total on an open-ended weekly bid.
    expect(r.total).not.toBe(700);
  });

  it("with no start date — the bare rate, exactly as mobile §3 specifies", () => {
    // Unreachable on real data (`start_date` is NOT NULL), so this pins the contract rather than a
    // behaviour users will hit. A caller that forgets to thread the date gets the rate, not a
    // Friday-blind total — the app makes the same trade.
    const r = bare({ startDate: null });
    expect(r.total).toBe(4200);
    expect(r.raw).toBe(true);
  });

  it("when the billable window collapses (a 1-day booking landing on a Friday)", () => {
    const r = computeRentalTotal({ rate: 600, priceUnit: "PER_DAY", startDate: "2026-08-14T00:00:00.000Z", durationDays: 1 });
    expect(r.billable).toBe(0);
    expect(r.total).toBe(600);
    expect(r.raw).toBe(true);
  });

  it("PER_JOB takes the app's unrecognized-unit fallback: rate × every calendar day", () => {
    // Both app copies drop PER_JOB out of their divisor lookup (retired 2026-08-05) and land on
    // `rate × durationDays`. Deliberately NOT spec 005's "flat, never prorated" — matching the app in
    // every case was the instruction, and this is the one case where the two rules disagree.
    expect(bare({ priceUnit: "PER_JOB", durationDays: 10 }).total).toBe(42_000);
    expect(bare({ priceUnit: "PER_JOB", durationDays: 10 }).billable).toBe(10); // calendar days, Fridays and all
    // An unrecognized unit follows the same path instead of being silently priced as PER_DAY.
    expect(bare({ priceUnit: "WHATEVER", durationDays: 10 }).total).toBe(42_000);
    // With no duration there is nothing to multiply — the bare rate, as before.
    expect(bare({ priceUnit: "PER_JOB", durationDays: null }).total).toBe(4200);
  });

  it("marks an exact period, which lets the card drop its rental row", () => {
    // A clean 6 billable days on a weekly bid → proration returns exactly the quoted rate.
    const r = computeRentalTotal({ rate: 4200, priceUnit: "PER_WEEK", startDate: SUNDAY, durationDays: 7 });
    expect(r.billable).toBe(6);
    expect(r.total).toBe(4200);
    expect(r.exact).toBe(true);
    expect(r.raw).toBe(false); // genuinely prorated, it just landed on the rate
  });
});

describe("headlineAmount — rate vs prorated total", () => {
  it("weekly and monthly show the RAW quoted rate", () => {
    expect(headlineAmount("PER_WEEK", 4200, 7700)).toBe(4200);
    expect(headlineAmount("PER_MONTH", 26000, 11000)).toBe(26000);
  });

  it("daily shows the prorated total", () => {
    expect(headlineAmount("PER_DAY", 600, 6600)).toBe(6600);
    expect(headlineAmount(null, 600, 6600)).toBe(6600);
  });
});

describe("rentalPeriodSubtitle — the fixed-divisor assumption under the headline", () => {
  it("states the assumption for weekly and monthly, always", () => {
    expect(rentalPeriodSubtitle("PER_WEEK")).toBe("weekly"); // "6 working days/week"
    expect(rentalPeriodSubtitle("PER_MONTH")).toBe("monthly"); // "26 working days/month"
  });

  it("says nothing for daily or job bids — there is no divisor to explain", () => {
    expect(rentalPeriodSubtitle("PER_DAY")).toBeNull();
    expect(rentalPeriodSubtitle("PER_JOB")).toBeNull();
    expect(rentalPeriodSubtitle(null)).toBeNull();
  });
});

describe("legDisplay — excluded → bundled → not quoted → amount", () => {
  it("bundled is unreachable in prod — the app hardcodes it false, so we keep it inert", () => {
    // `my_offers_v3_tab_content.dart:787` is the ONLY construction site and passes a literal false;
    // no bid field or backend column feeds it. Kept wired so a real field is a one-line change.
    expect(legDisplay({ bundled: false, amount: 300 })).toEqual({ kind: "amount", amount: 300 });
  });

  it("excluded wins over everything, even a stored price", () => {
    expect(legDisplay({ excluded: true, bundled: true, amount: 300 })).toEqual({ kind: "excluded" });
  });

  it("bundled wins over a stored price", () => {
    expect(legDisplay({ bundled: true, amount: 300 })).toEqual({ kind: "bundled" });
  });

  it("a missing amount is 'not quoted', but a real 0 is an amount", () => {
    expect(legDisplay({ amount: null })).toEqual({ kind: "not_quoted" });
    expect(legDisplay({})).toEqual({ kind: "not_quoted" });
    expect(legDisplay({ amount: 0 })).toEqual({ kind: "amount", amount: 0 });
  });
});

describe("computeQuoteTotals — per-unit vs overall", () => {
  const base = { perUnitRental: 7700, rentalUnits: 1, mob: { amount: 300 }, demob: { amount: 300 } };

  it("per-unit: subtotal → 15% VAT → grand total (the doc's example)", () => {
    const t = computeQuoteTotals(base);
    expect(t.perUnit.subtotal).toBe(8300);
    expect(t.perUnit.vat).toBe(1245);
    expect(t.perUnit.total).toBe(9545);
  });

  it("single unit: overall equals per-unit, so only one number is shown", () => {
    const t = computeQuoteTotals(base);
    expect(t.overall.total).toBe(t.perUnit.total);
  });

  it("multi-unit: legs default to the rental count", () => {
    const t = computeQuoteTotals({ ...base, rentalUnits: 2 });
    expect(t.overall.rental).toBe(15400);
    expect(t.overall.subtotal).toBe(15400 + 600 + 600);
    expect(t.overall.total).toBe(t.overall.subtotal * 1.15);
  });

  it("legs carry their OWN counts — overall is not per-unit × units", () => {
    // 3 machines rented, but only one delivery run charged.
    const t = computeQuoteTotals({ ...base, rentalUnits: 3, mob: { amount: 300, units: 1 }, demob: { amount: 300, units: 1 } });
    expect(t.overall.rental).toBe(23100);
    expect(t.overall.mob).toBe(300);
    expect(t.overall.demob).toBe(300);
    expect(t.overall.total).not.toBe(t.perUnit.total * 3);
  });

  it("a leg's count is NOT capped by the rental count — the app doesn't cap either", () => {
    // `effectiveMobUnits` is `mobExcluded ? 0 : (mobUnits ?? numberOfUnits)`, no clamp. The web used to
    // cap here, so a room carrying more trips than machines billed differently on the two clients.
    const t = computeQuoteTotals({ ...base, rentalUnits: 2, mob: { amount: 300, units: 99 }, demob: { amount: 0 } });
    expect(t.overall.mob).toBe(29_700);
  });

  it("an excluded leg contributes zero however much price is stored on it", () => {
    const t = computeQuoteTotals({ ...base, rentalUnits: 2, mob: { amount: 300, excluded: true }, demob: { amount: 300 } });
    expect(t.perUnit.mob).toBe(0);
    expect(t.overall.mob).toBe(0);
    expect(t.overall.demob).toBe(600);
  });
});

describe("formatSar", () => {
  it("whole riyals with comma separators, ASCII, no decimals", () => {
    expect(formatSar(7700)).toBe("7,700");
    expect(formatSar(9545.25)).toBe("9,545");
    expect(formatSar(600)).toBe("600");
    expect(formatSar(0)).toBe("0");
  });

  it("renders a dash rather than NaN for a missing number", () => {
    expect(formatSar(null)).toBe("—");
    expect(formatSar(undefined)).toBe("—");
    expect(formatSar(Number.NaN)).toBe("—");
  });
});

/**
 * ── ONE breakdown across every price surface (owner, 2026-08-19) ─────────────────────────────────
 *
 * *"use bid card in all prices surface."*
 *
 * The renter reaches the deal room from a bid card that breaks the offer down PER MACHINE and then
 * totals it across the count. The room used to print all-units rows only, so the two screens put two
 * different figures against one offer and neither said which was which. The room now draws the card's
 * shape — `DealRoom.tsx` feeds `computeQuoteTotals` the per-unit rental `computeDealTotals` already
 * computed, and prints `perUnit` above an overall row.
 *
 * That rests on ONE claim, pinned here: **the two engines price the same basis identically**, so
 * changing which rows are drawn cannot change what is owed. `computeDealTotals` rounds its VAT and
 * `computeQuoteTotals` does not, which is the only arithmetic that differs between them — and since
 * every subtotal is a sum of stated riyal prices, `round(S + 0.15S)` and `S + round(0.15S)` land on
 * the same figure.
 */
describe("the deal room's per-unit block IS the bid card's (owner, 2026-08-19)", () => {
  const BASES = [
    { name: "PER_DAY · 14 days · 2 units", rate: 3000, priceUnit: "PER_DAY", periods: 14, units: 2, mob: 1500, demob: 1500, mobU: null, demobU: null, start: "2026-08-15" },
    { name: "PER_WEEK · 30 days · 3 units · 5 delivery runs", rate: 21000, priceUnit: "PER_WEEK", periods: 30, units: 3, mob: 2200, demob: 0, mobU: 5, demobU: null, start: "2026-09-01" },
    { name: "PER_MONTH · 61 days · 1 unit · 2 returns", rate: 78000, priceUnit: "PER_MONTH", periods: 61, units: 1, mob: 0, demob: 3333, mobU: null, demobU: 2, start: "2026-10-03" },
    { name: "PER_JOB · open-ended · 4 units", rate: 45000, priceUnit: "PER_JOB", periods: null, units: 4, mob: 1111, demob: 999, mobU: null, demobU: null, start: null },
    { name: "fractional rate and leg · 3 units", rate: 1234.5, priceUnit: "PER_DAY", periods: 7, units: 3, mob: 777.7, demob: 0, mobU: 1, demobU: null, start: "2026-08-16" },
  ];

  for (const b of BASES) {
    it(`agrees to the riyal — ${b.name}`, () => {
      const deal = computeDealTotals({
        rate: b.rate, priceUnit: b.priceUnit, periods: b.periods, startDate: b.start,
        agreedUnits: null, numberOfUnits: b.units,
        mobUnits: b.mobU, demobUnits: b.demobU, mobPrice: b.mob, demobPrice: b.demob,
        mobExcluded: false, demobExcluded: false,
      });
      // Exactly what `DealRoom.tsx` does to draw the per-unit block.
      const q = computeQuoteTotals({
        perUnitRental: deal.perUnitRental,
        rentalUnits: deal.rentalUnits,
        mob: { amount: b.mob, units: deal.mobUnitsN, excluded: false },
        demob: { amount: b.demob, units: deal.demobUnitsN, excluded: false },
      });
      // The money is untouched: the overall block the room still reads off `totals` is the same money
      // the card's engine reaches from the same basis.
      expect(Math.round(q.overall.subtotal)).toBe(Math.round(deal.subtotal));
      expect(Math.round(q.overall.total)).toBe(Math.round(deal.grand));
      // …and the per-unit rental the block is built from is the room's own, not a division.
      expect(q.perUnit.rental).toBe(deal.perUnitRental);
      expect(deal.perUnitRental * deal.rentalUnits).toBe(deal.rentalTotal);
    });
  }

  it("the OVERALL row is never per-unit × units when a leg carries its own count", () => {
    // 3 machines, 5 delivery runs — the case the row's `sub` names, and the reason the room reads the
    // overall figure off `computeDealTotals` rather than multiplying the block above it.
    const deal = computeDealTotals({
      rate: 21000, priceUnit: "PER_WEEK", periods: 30, startDate: "2026-09-01",
      agreedUnits: null, numberOfUnits: 3,
      mobUnits: 5, demobUnits: null, mobPrice: 2200, demobPrice: 0,
      mobExcluded: false, demobExcluded: false,
    });
    const q = computeQuoteTotals({
      perUnitRental: deal.perUnitRental, rentalUnits: deal.rentalUnits,
      mob: { amount: 2200, units: deal.mobUnitsN, excluded: false },
      demob: { amount: 0, units: deal.demobUnitsN, excluded: false },
    });
    expect(deal.mobUnitsN).toBe(5);
    expect(Math.round(q.perUnit.total * 3)).not.toBe(Math.round(deal.grand));
  });
});
