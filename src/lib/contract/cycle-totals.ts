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
 * | The horizon | the whole request: the rate across every cycle, plus the legs once |
 *
 * **Cycles here are calendar periods, not working days.** A monthly rate over 180 days is six
 * cycles, not 180 ÷ 26. That is deliberate and it is why this does not reuse `computeRentalTotal`,
 * which prorates a part-period across Friday-excluded working days: these columns answer *how many
 * times will I be billed*, and a lessor bills a month per month however many days it worked.
 *
 * **NO React, NO DOM, NO i18n.**
 */

import { VAT_RATE } from "./vat-inclusive";

/** Calendar days in one billing cycle. `PER_JOB` has no cycle — the job is billed once, entire. */
const CYCLE_DAYS: Record<string, number> = { PER_DAY: 1, PER_WEEK: 7, PER_MONTH: 30, PER_JOB: 0 };

export function cycleDays(priceUnit: string | null | undefined): number {
  return CYCLE_DAYS[(priceUnit ?? "PER_DAY").toUpperCase()] ?? 1;
}

/** One column of the matrix, with the lines its popover lists. */
export interface CycleTotal {
  rental: number;
  /** Delivery and return together, as they are charged in this column — zero once already paid. */
  oneOff: number;
  subtotal: number;
  vat: number;
  total: number;
}

export interface HorizonTotal extends CycleTotal {
  /** The request's own duration, which is what the column is named after. */
  days: number;
  /** How many times the rate is charged across it. */
  cycles: number;
}

export interface CycleTotals {
  firstCycle: CycleTotal;
  /** Null on a `PER_JOB` quote: a job is billed once, so there is no second cycle to describe. */
  everyCycleAfter: CycleTotal | null;
  /** Null when the request never stated a duration — a horizon nobody set is not a number to show. */
  horizon: HorizonTotal | null;
}

export interface CycleInput {
  /** The live rate, per unit, per cycle. */
  rate: number | null;
  priceUnit: string | null;
  mob: { amount?: number | null; excluded?: boolean | null };
  demob: { amount?: number | null; excluded?: boolean | null };
  /** The request's duration. Null or zero → no horizon column. */
  durationDays?: number | null;
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

/**
 * How many times a rate is charged across a duration. A started cycle is a charged cycle — 45 days
 * on a monthly rate is two months, not one and a half — so this rounds up, and never below one:
 * a request shorter than a single cycle is still one cycle of rent.
 */
export function cyclesIn(durationDays: number, priceUnit: string | null | undefined): number {
  const per = cycleDays(priceUnit);
  if (per <= 0) return 1; // PER_JOB — billed once, entire
  return Math.max(1, Math.ceil(durationDays / per));
}

export function computeCycleTotals(input: CycleInput): CycleTotals {
  const units = input.units && input.units > 0 ? input.units : 1;
  const rate = (input.rate ?? 0) * units;
  const oneOff = (leg(input.mob) + leg(input.demob)) * units;
  const perJob = cycleDays(input.priceUnit) <= 0;

  const firstCycle = withVat(rate, oneOff);
  // The legs are gone from here — that is the whole point of the column. Stating them as zero would
  // read as "this supplier delivers free", which is a different claim entirely.
  const everyCycleAfter = perJob ? null : withVat(rate, 0);

  const days = input.durationDays ?? 0;
  let horizon: HorizonTotal | null = null;
  if (days > 0) {
    const cycles = cyclesIn(days, input.priceUnit);
    horizon = { ...withVat(rate * cycles, oneOff), days, cycles };
  }

  return { firstCycle, everyCycleAfter, horizon };
}
