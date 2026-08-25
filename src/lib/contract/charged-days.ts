/**
 * What the renter will actually be charged for (MREQ-AC-32/33/34/36/37).
 *
 * **This module does no arithmetic of its own.** Every figure comes from `lib/pricing/rental.ts`,
 * which is the same code the bid form, the deal room and the quotation price against. That is the
 * whole point: the number quoted at creation and the number billed later cannot be allowed to
 * disagree, and they disagree the moment two surfaces each work it out for themselves.
 *
 * Two things the create flow got wrong before, both already solved there:
 *
 *  - **The end date is inclusive.** `durationDaysBetween` is `(end − start) + 1`, matching the
 *    backend's `inclusiveDurationDays` and the app's `_computeDurationDays`. Dropping the `+ 1` — as
 *    the prototype does — prices a day short, and because the Friday window is anchored on the
 *    length, sometimes two.
 *  - **Dates are calendar days in UTC.** Reading them locally shifts the weekday for anyone west of
 *    UTC and silently changes which days are Fridays.
 *
 * Fridays are excluded for every price unit, including per-day: this platform does not bill Fridays.
 */

import { billableDays, countFridays, durationDaysBetween } from "@/lib/pricing/rental";
import type { RentalBasis } from "./options";
import type { TimingHours } from "./draft";

export interface ChargedDays {
  /** Both dates present — the figures below mean nothing without it. */
  known: boolean;
  /** Calendar days from start to end, both ends inclusive. */
  totalDays: number;
  /** Fridays inside that window. */
  fridays: number;
  /** Days suppliers actually price: `totalDays − fridays`. */
  chargedDays: number;
  /** Which end is missing, for the nudge (MREQ-AC-10). */
  missing: "none" | "start" | "end" | "both";
  /**
   * The chosen billing basis needs a longer window than the dates cover (MREQ-AC-36/37). `null` when
   * the basis is fine, or when there are no dates to judge. Carries the DAY count, never a month
   * count — the prototype divided by 30 inside a branch that only ran below 30, so its warning could
   * only ever read "0 months".
   */
  tooShort: { basis: Extract<RentalBasis, "weekly" | "monthly">; days: number; needs: number } | null;
}

/** The minimum window each recurring basis is normally quoted over. Daily has none. */
const BASIS_MINIMUM: Record<string, number> = { weekly: 7, monthly: 30 };

export function computeChargedDays(timing: Pick<TimingHours, "startDate" | "endDate" | "rentalBasis">): ChargedDays {
  const { startDate, endDate, rentalBasis } = timing;
  const missing: ChargedDays["missing"] = !startDate && !endDate ? "both" : !startDate ? "start" : !endDate ? "end" : "none";

  const totalDays = durationDaysBetween(startDate, endDate);
  if (totalDays == null) {
    return { known: false, totalDays: 0, fridays: 0, chargedDays: 0, missing, tooShort: null };
  }

  const fridays = countFridays(startDate, totalDays);
  const chargedDays = billableDays(startDate, totalDays);

  const needs = rentalBasis ? BASIS_MINIMUM[rentalBasis] : undefined;
  const tooShort =
    needs != null && totalDays < needs
      ? { basis: rentalBasis as Extract<RentalBasis, "weekly" | "monthly">, days: totalDays, needs }
      : null;

  return { known: true, totalDays, fridays, chargedDays, missing, tooShort };
}
