/**
 * The three grand totals in the comparison matrix, and what each is built from.
 *
 * A rental quote is two different kinds of money in one figure: a rate that recurs, and transport
 * legs that are paid once. Comparing suppliers on a single number hides that — a supplier who
 * charges nothing to deliver looks dearer than one who charges 6,500 for it, right up until the
 * second month. So the matrix states three:
 *
 * | Column | What it is |
 * |---|---|
 * | First cycle | the rate plus both legs — what leaving the yard actually costs |
 * | Every cycle after | the rate alone; the legs were paid once, in cycle 1 |
 * | The duration | the whole request: rent across every billable day, plus the legs once |
 *
 * **The first two columns are the quoted rate, untouched**, which is what `headlineAmount` shows on
 * a weekly or monthly bid card: the renter is comparing what suppliers actually quoted.
 *
 * **The duration column is `computeRentalTotal`, and deliberately not whole cycles.** The owner's
 * mockup drew it as `rate × 6 months` for a 180-day request. That is 481,260 where the platform's own
 * equation gives 475,090 — 180 days holds 26 Fridays, and this platform does not bill Fridays, so
 * the rental runs over 154 billable days at `rate ÷ 26` a day. Whole cycles would have made the same
 * rental cost one number here and a different one in the deal room, on the quotation and on the bid
 * card, which all share that module. Ruled 2026-08-12: the pricing module wins, and the popover says
 * billable days out loud rather than claiming a count of months.
 *
 * **NO React, NO DOM, NO i18n.**
 */

import { computeRentalTotal, rentalDivisor } from "@/lib/pricing/rental";
import { VAT_RATE } from "./vat-inclusive";

/** One column of the matrix, with the lines its popover lists. */
export interface CycleTotal {
  rental: number;
  /** Delivery and return together, as they are charged in this column — zero once already paid. */
  oneOff: number;
  subtotal: number;
  vat: number;
  total: number;
}

export interface DurationTotal extends CycleTotal {
  /** The request's own duration, which is what the column is named after. */
  days: number;
  /** Days actually charged: the duration minus its Fridays. */
  billableDays: number;
  /** True when the rental is the bare quoted rate because it could not be prorated — no start date,
   *  a per-job price, or a window that collapses. The popover must not then claim a day count. */
  raw: boolean;
}

export interface CycleTotals {
  firstCycle: CycleTotal;
  /** Null on a `PER_JOB` quote: a job is billed once, so there is no second cycle to describe. */
  everyCycleAfter: CycleTotal | null;
  /** Null when the request never stated a duration — a horizon nobody set is not a number to show. */
  duration: DurationTotal | null;
}

export interface CycleInput {
  /** The live rate, per unit, per cycle. */
  rate: number | null;
  priceUnit: string | null;
  mob: { amount?: number | null; excluded?: boolean | null };
  demob: { amount?: number | null; excluded?: boolean | null };
  /** The request's duration. Null or zero → no duration column. */
  durationDays?: number | null;
  /** The request's start date. Without it the Fridays cannot be located and the rental cannot be
   *  prorated at all — `computeRentalTotal` then returns the bare rate, and so does this. */
  startDate?: string | null;
  /** Units the offer covers; every figure is multiplied by it. */
  units?: number | null;
}

const money = (v: number) => Math.round(v * 100) / 100;
const leg = (l: { amount?: number | null; excluded?: boolean | null }) =>
  l.excluded || l.amount == null || !Number.isFinite(Number(l.amount)) ? 0 : Number(l.amount);

function withVat(rental: number, oneOff: number): CycleTotal {
  const subtotal = money(rental + oneOff);
  const vat = money(subtotal * VAT_RATE);
  return { rental: money(rental), oneOff: money(oneOff), subtotal, vat, total: money(subtotal + vat) };
}

/** A per-job price is billed once, entire — there is no second cycle and nothing recurs. */
export function hasRecurringCycle(priceUnit: string | null | undefined): boolean {
  return rentalDivisor(priceUnit) > 0;
}

export function computeCycleTotals(input: CycleInput): CycleTotals {
  const units = input.units && input.units > 0 ? input.units : 1;
  const rate = (input.rate ?? 0) * units;
  const oneOff = (leg(input.mob) + leg(input.demob)) * units;

  const firstCycle = withVat(rate, oneOff);
  // The legs are gone from here — that is the whole point of the column. Stating them as zero would
  // read as "this supplier delivers free", which is a different claim entirely.
  const everyCycleAfter = hasRecurringCycle(input.priceUnit) ? withVat(rate, 0) : null;

  const days = input.durationDays ?? 0;
  let duration: DurationTotal | null = null;
  if (days > 0) {
    // The shared equation: (rate ÷ divisor) × billable days, Fridays excluded. Same call the deal
    // room and the quotation make, so the three surfaces cannot state different totals.
    const r = computeRentalTotal({
      rate: input.rate ?? 0,
      priceUnit: input.priceUnit,
      startDate: input.startDate ?? null,
      durationDays: days,
    });
    duration = { ...withVat(r.total * units, oneOff), days, billableDays: r.billable, raw: r.raw };
  }

  return { firstCycle, everyCycleAfter, duration };
}
