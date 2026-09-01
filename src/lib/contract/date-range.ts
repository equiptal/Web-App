/**
 * One rule for "these two dates are the wrong way round", read by every form that asks for a period.
 *
 * ── Why it is shared ────────────────────────────────────────────────────────────────────────────
 *
 * A project, a work order and a request each ask for a start and an end, and each one used to answer
 * differently: the request's inputs carried `min`/`max` so the PICKER refused it silently, the other
 * two accepted it and let the backend decide. A renter who typed the dates rather than picking them
 * got a period running backwards, and found out — if at all — from a 400 with no field named
 * (owner, 2026-09-01).
 *
 * ── Same day is fine ────────────────────────────────────────────────────────────────────────────
 *
 * A one-day hire is a real hire. Only `end < start` is wrong, and `end === start` must never be
 * refused — that is the shape of half the day-rate work on the platform.
 */

/**
 * True when both dates are set and the end falls before the start.
 *
 * Two unset dates are not an error: a form the renter has not finished is not a form he got wrong,
 * and marking it red before he has answered teaches him to ignore the colour.
 *
 * Compared as ISO `YYYY-MM-DD` strings rather than through `Date`: both inputs are `type="date"`, so
 * the format is fixed, the comparison is lexicographic and correct, and no timezone gets a chance to
 * move a date across midnight on its way through a parser.
 */
export function endBeforeStart(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  return end < start;
}
