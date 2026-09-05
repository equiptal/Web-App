/**
 * Rental pricing — the ONE place the web computes a rental total.
 *
 * Mirrors the mobile app's `computeRentalTotal()` (`core/utils/rental_pricing.dart`), which the bid
 * card, the deal room and the quotation documents all price against. Before this module the web had
 * three hand-rolled copies of the divisor table (`comparison.ts`, `deal-room.ts`, `GroupBids.tsx`),
 * two of which used a 7-day week where mobile uses 6, and none of which excluded Fridays — so the same
 * bid showed a different total in the app and on the web. The mobile hand-off doc calls out that
 * duplication explicitly and asks the web to centralize instead of repeating it.
 *
 * Everything here is PER UNIT. Multiplying by a unit count is the caller's job, because the rental,
 * mobilization and demobilization legs each carry their own independent counts.
 */

import { VAT_RATE } from "@/lib/contract/vat-inclusive";

export type RentalPriceUnit = "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_JOB";

/**
 * Billable days in one billing period. A month is 26 working days and a week is **6** — Friday is the
 * weekend, so a "week" of work is six days. `PER_JOB` is flat (no period concept) and is signalled by 0.
 */
export const RENTAL_DIVISOR: Record<string, number> = { PER_DAY: 1, PER_WEEK: 6, PER_MONTH: 26, PER_JOB: 0 };

export function rentalDivisor(unit: string | null | undefined): number {
  const key = (unit ?? "PER_DAY").toUpperCase();
  return key in RENTAL_DIVISOR ? RENTAL_DIVISOR[key] : 1;
}

/**
 * Whether the unit is one the divisor table actually prices.
 *
 * `rentalDivisor` answers 1 for anything it doesn't know, which silently prices a garbage unit as
 * PER_DAY. The app instead routes an unrecognized unit to its `rate × durationDays` fallback, so the
 * two need to be told apart. Null/empty counts as PER_DAY, matching `rentalDivisor`'s own default.
 */
export function isKnownRentalUnit(unit: string | null | undefined): boolean {
  return (unit ?? "PER_DAY").toUpperCase() in RENTAL_DIVISOR;
}

/**
 * Fridays in the inclusive window `[start, start + durationDays − 1]`.
 *
 * Counted arithmetically rather than by iterating, so an open-ended multi-year duration can't turn a
 * render into a loop. UTC throughout: these dates are calendar days, and reading them in the viewer's
 * local zone would shift the weekday for anyone west of UTC and silently change the total.
 */
export function countFridays(startDate: string | Date | null | undefined, durationDays: number): number {
  if (startDate == null || !Number.isFinite(durationDays) || durationDays <= 0) return 0;
  const d = startDate instanceof Date ? startDate : new Date(startDate);
  if (Number.isNaN(d.getTime())) return 0;
  const FRIDAY = 5; // getUTCDay: 0=Sun … 5=Fri
  const offset = (FRIDAY - d.getUTCDay() + 7) % 7; // days from start to the first Friday
  if (offset >= durationDays) return 0;
  return 1 + Math.floor((durationDays - 1 - offset) / 7);
}

/**
 * The rental window's length in days, from the request's start + end dates.
 *
 * BOTH ENDS INCLUSIVE — 15 Aug → 15 Oct is **62** days, not 61. This is the backend's
 * `inclusiveDurationDays` (`bid.service.ts`: `(endUTC − startUTC) / DAY + 1`), which is the figure both
 * clients price against, and the app's own `_computeDurationDays`
 * (`create_request_bloc.dart`: `end.difference(start).inDays + 1`) stamps the same count onto the
 * request at creation.
 *
 * It used to drop the `+ 1`, on a comment claiming to mirror `end.difference(start).inDays` — the app
 * expression WITHOUT the `+ 1` the app actually applies to it. Every surface that derives its own
 * duration (the supplier's bid form and the off-platform submission viewer always do; the request
 * mapper only when the backend omits `estimatedDurationDays`) was therefore pricing a day short of the
 * backend's own estimate for the same bid — and, because the Friday window is anchored on this length,
 * sometimes two days short.
 *
 * Both dates are read as calendar days in UTC so the length can't shift with the viewer's timezone. A
 * bare `YYYY-MM-DD` (which `Date` would otherwise parse as UTC midnight anyway) is pinned explicitly.
 *
 * Returns null when either end is missing — an open-ended request has no period to prorate over, and
 * `computeRentalTotal` correctly falls back to the raw quoted rate.
 */
export function durationDaysBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const s = new Date(start.length <= 10 ? `${start}T00:00:00Z` : start).getTime();
  const e = new Date(end.length <= 10 ? `${end}T00:00:00Z` : end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const d = Math.round((e - s) / 86_400_000) + 1;
  return d < 1 ? 1 : d;
}

/** Duration minus its Fridays. Friday-off applies to EVERY price unit, including PER_DAY. */
export function billableDays(startDate: string | Date | null | undefined, durationDays: number): number {
  if (!Number.isFinite(durationDays) || durationDays <= 0) return 0;
  return durationDays - countFridays(startDate, durationDays);
}

export interface RentalTotal {
  /** Per-unit rental for the whole period. */
  total: number;
  /** Days actually charged (duration − Fridays); 0 when the duration is unknown. */
  billable: number;
  /** True when the total is just the raw rate — no duration, no start date, or a degenerate window. */
  raw: boolean;
  /**
   * True when proration produced exactly the quoted rate (e.g. a clean 6-day week on a PER_WEEK bid).
   * The bid card omits its rental breakdown row in this case for single-unit bids: the headline
   * already shows the real total, so there is nothing left to explain.
   */
  exact: boolean;
}

/**
 * Per-unit rental total: `(rate / divisor) × billableDays`.
 *
 * Falls back to the bare `rate` — never 0, never an error — when the duration is unknown, the start
 * date is missing (Fridays can't be located without it), or the billable window collapses to ≤ 0
 * (a one-day booking that lands on a Friday). Mobile is explicit that an unset duration must NOT be
 * defaulted to one day: under continuous proration that would show a near-zero total for an
 * open-ended weekly or monthly bid.
 */
export function computeRentalTotal(args: {
  rate: number | null | undefined;
  priceUnit: string | null | undefined;
  startDate?: string | Date | null;
  durationDays?: number | null;
}): RentalTotal {
  const rate = Number.isFinite(Number(args.rate)) ? Number(args.rate) : 0;
  const divisor = rentalDivisor(args.priceUnit);
  const bare: RentalTotal = { total: rate, billable: 0, raw: true, exact: true };

  const duration = Number(args.durationDays);
  const hasDuration = Number.isFinite(duration) && duration > 0;

  // PER_JOB and any unrecognized unit take the app's UNRECOGNIZED-UNIT fallback: `rate × durationDays`,
  // every calendar day, no divisor and no Friday exclusion. Both app copies do this
  // (`rental_pricing.dart` / `deal_room_pricing.dart`: `if (divisor == null) return rate * durationDays`)
  // because PER_JOB was retired on 2026-08-05 and now falls through their divisor lookup.
  //
  // ⚠ This is NOT "flat, never prorated" — spec 005 §2 says that, and this deliberately overrides it on
  // the owner's instruction to match the app in every case. A 7,700 job price over a 62-day window now
  // reads 477,400, per unit. There is no PER_JOB data path left in the app, so this only reaches legacy
  // rows; if those exist in prod, this is the line to revisit.
  if (divisor === 0 || !isKnownRentalUnit(args.priceUnit)) {
    return hasDuration ? { total: rate * duration, billable: duration, raw: false, exact: rate * duration === rate } : bare;
  }
  if (!hasDuration) return bare;

  // No start date ⇒ the Fridays can't be located ⇒ the bare rate, exactly as mobile §3 specifies.
  //
  // This looks dangerous (it prices a 10-day rental as one period) but is unreachable on real data:
  // `equipment_requests.start_date` is NOT NULL in the schema, and the create endpoint defaults an
  // omitted date to "now" rather than storing nothing. A request that reaches here with no date also
  // has no duration — the web only derives `durationDays` from start+end together — so it would have
  // returned `bare` on the duration check above anyway. Both routes agree; this is belt and braces.
  // No start date ⇒ the Fridays can't be located ⇒ the bare rate (mobile §3, exact).
  //
  // Reads as dangerous — it prices a 10-day rental as one period — but is unreachable on real data:
  // `equipment_requests.start_date` is NOT NULL, and the create endpoint defaults an omitted date to
  // "now" rather than storing nothing. Every caller threads the date (`computeBidQuote` takes it as an
  // option, `computeDealTotals` reads `details.startDate`, `priceFooterModel` takes an argument), so a
  // NEW call site that forgets it will understate silently. Pass the date even when the duration looks
  // sufficient on its own.
  if (args.startDate == null) return bare;

  const billable = billableDays(args.startDate, duration);
  if (billable <= 0) return bare;

  const total = (rate / divisor) * billable;
  return { total, billable, raw: false, exact: total === rate };
}

/**
 * The number shown on the collapsed bid card.
 *
 * NOT simply "the total": weekly and monthly bids show the supplier's RAW QUOTED RATE so they compare
 * like-for-like on what was actually quoted, and the prorated figure appears only in the expanded
 * breakdown. Daily bids show the prorated total for the period.
 */
export function headlineAmount(priceUnit: string | null | undefined, rate: number, proratedTotal: number): number {
  const key = (priceUnit ?? "PER_DAY").toUpperCase();
  return key === "PER_WEEK" || key === "PER_MONTH" ? rate : proratedTotal;
}

/**
 * The fixed-divisor assumption shown as a subtitle under the collapsed headline — "6 working
 * days/week" / "26 working days/month". Mirrors `rentalPeriodSubtitle()` in the app's
 * `rental_pricing.dart`, which renders it for PER_WEEK/PER_MONTH **always**, whether or not this
 * particular booking's period turns out exact (the app's own comment: "independent of whether this
 * particular booking's period turns out to be exact or custom").
 *
 * Returns a discriminator, not copy — the strings live in the i18n bundles like every other label.
 * The hand-off doc lists the two strings under its label table but never says they are a permanent
 * part of the card, so this was verified against the widget rather than the doc.
 */
export function rentalPeriodSubtitle(unit: string | null | undefined): "weekly" | "monthly" | null {
  const key = (unit ?? "").toUpperCase();
  if (key === "PER_WEEK") return "weekly";
  if (key === "PER_MONTH") return "monthly";
  return null;
}

/**
 * That subtitle as the words the bid card prints — "6 working days/week" / "26 working days/month".
 *
 * Takes the caller's `L` rather than reading a bundle because every surface that prints it (the bid
 * card, the deal room's price bar and counter sheet, both quotation documents) carries its copy inline
 * the same way. One function so the divisor a reader is told about can never disagree with the divisor
 * `RENTAL_DIVISOR` actually applied. Null for daily and per-job — there is no divisor to explain.
 */
export function divisorNote(unit: string | null | undefined, L: (en: string, ar: string) => string): string | null {
  const p = rentalPeriodSubtitle(unit);
  if (p === "weekly") return L("6 working days/week", "6 أيام عمل/أسبوع");
  if (p === "monthly") return L("26 working days/month", "26 يوم عمل/شهر");
  return null;
}

/** How one transport leg reads when it has no number to show (priority order, mobile §7). */
export type LegDisplay = { kind: "amount"; amount: number } | { kind: "excluded" | "bundled" | "not_quoted" };

export function legDisplay(leg: {
  excluded?: boolean | null;
  bundled?: boolean | null;
  amount?: number | null;
}): LegDisplay {
  if (leg.excluded) return { kind: "excluded" };
  if (leg.bundled) return { kind: "bundled" };
  if (leg.amount == null || !Number.isFinite(Number(leg.amount))) return { kind: "not_quoted" };
  return { kind: "amount", amount: Number(leg.amount) };
}

export interface QuoteTotals {
  /** Per-unit figures — what the breakdown rows show. */
  perUnit: { rental: number; mob: number; demob: number; subtotal: number; vat: number; total: number };
  /** All-units figures — the "Overall total" row, shown only for multi-unit bids. */
  overall: { rental: number; mob: number; demob: number; subtotal: number; vat: number; total: number };
}

/**
 * Assemble the breakdown from a per-unit rental plus the two transport legs.
 *
 * The all-units total is NOT "per-unit total × units": mobilization and demobilization carry their own
 * counts, which merely DEFAULT to the rental count. An excluded leg contributes zero however much
 * price is still stored against it.
 */
export function computeQuoteTotals(args: {
  perUnitRental: number;
  rentalUnits: number;
  mob: { amount?: number | null; units?: number | null; excluded?: boolean | null };
  demob: { amount?: number | null; units?: number | null; excluded?: boolean | null };
}): QuoteTotals {
  const units = args.rentalUnits > 0 ? args.rentalUnits : 1;
  const legPerUnit = (l: { amount?: number | null; excluded?: boolean | null }) =>
    l.excluded || l.amount == null || !Number.isFinite(Number(l.amount)) ? 0 : Number(l.amount);
  // A leg's own count defaults to the rental count and is NOT capped by it. The web used to cap
  // ("a bid can't mobilize more machines than it rents"), but the app doesn't — `effectiveMobUnits`
  // is `mobExcluded ? 0 : (mobUnits ?? numberOfUnits)`, no clamp — so a room storing 5 mob trips
  // against 3 rented machines billed 5 in the app and 3 here. Whatever count the parties negotiated
  // onto the leg is the count both clients now charge.
  const legUnits = (l: { units?: number | null; excluded?: boolean | null }) =>
    l.excluded ? 0 : (l.units ?? units);

  const mobEach = legPerUnit(args.mob);
  const demobEach = legPerUnit(args.demob);
  const perUnitSubtotal = args.perUnitRental + mobEach + demobEach;
  const perUnitVat = perUnitSubtotal * VAT_RATE;

  const rentalAll = args.perUnitRental * units;
  const mobAll = mobEach * legUnits(args.mob);
  const demobAll = demobEach * legUnits(args.demob);
  const overallSubtotal = rentalAll + mobAll + demobAll;
  const overallVat = overallSubtotal * VAT_RATE;

  return {
    perUnit: {
      rental: args.perUnitRental, mob: mobEach, demob: demobEach,
      subtotal: perUnitSubtotal, vat: perUnitVat, total: perUnitSubtotal + perUnitVat,
    },
    overall: {
      rental: rentalAll, mob: mobAll, demob: demobAll,
      subtotal: overallSubtotal, vat: overallVat, total: overallSubtotal + overallVat,
    },
  };
}

/**
 * Whole riyals with comma thousands separators — no decimals, matching the bid card.
 *
 * `en-US` is pinned deliberately: mobile inserts an ASCII comma by hand and shows it unchanged in the
 * Arabic UI, so an Arabic-locale formatter here (which would emit ٣٬٤٠٠ with an Arabic-Indic separator)
 * would make the same bid read differently on the two clients. The currency glyph is rendered by the
 * caller AFTER the numeral, which places it visually left of the number under RTL.
 */
export function formatSar(value: number | null | undefined): string {
  // `Number(null)` is 0, so null/undefined are rejected BEFORE coercion — otherwise a price the bid
  // never stated would render as a confident "0", which reads as free rather than unknown.
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export { VAT_RATE };
