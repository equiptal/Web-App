/**
 * **When does this request stop taking bids?** — one answer, from two sources, in that order.
 *
 * The renter can set a deadline himself on the shared bid link (`PUT …/share-link { deadline }`,
 * surfaced as `bidDeadline` on `GET …/submissions`). Most never do. So the fallback is the bid
 * WINDOW he chose when the request was created — `offerDuration`, one of `24H` / `48H` / `72H` /
 * `1W` — counted from `createdAt`, which is the same window the backend broadcasts against.
 *
 * The order is not arbitrary: the link deadline is a decision the renter made about THIS request
 * after posting it, and it is the date the supplier's own form closes on (`BidFormData.deadline`,
 * `closedReason: "deadline"`). A fallback that outranked it would tell the two sides different
 * things about the same request.
 *
 * When neither exists the request has no deadline, and that is a legitimate answer (AC-05) — not a
 * zero, not "today". Callers render nothing rather than inventing a date.
 *
 * NO React, NO i18n: this returns a kind and a number, and the surface picks the words.
 */

/** The bid window as the request stores it (`app.ts`: `offerDuration`), plus the lowercase spellings
 *  the draft/preferences layer uses before `OFFER_DURATION_MAP` canonicalises them. */
const WINDOW_MS: Record<string, number> = {
  "24H": 24 * 3600_000,
  "48H": 48 * 3600_000,
  "72H": 72 * 3600_000,
  "1W": 7 * 24 * 3600_000,
  "24h": 24 * 3600_000,
  "48h": 48 * 3600_000,
  "72h": 72 * 3600_000,
  "1-week": 7 * 24 * 3600_000,
};

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * The window's own end: `createdAt + offerDuration`. Null when either is missing or unrecognised —
 * an unknown window is not a reason to guess a date.
 */
export function windowDeadline(createdAt: string | null | undefined, offerDuration: string | null | undefined): string | null {
  const start = ms(createdAt);
  const span = offerDuration ? WINDOW_MS[offerDuration] ?? WINDOW_MS[offerDuration.toUpperCase()] : undefined;
  if (start == null || span == null) return null;
  return new Date(start + span).toISOString();
}

/** Which of the two sources answered — worth keeping, because one is the renter's own decision. */
export type ExpirySource = "link" | "window" | "none";

export interface RequestExpiry {
  /** The date bidding closes, ISO — or null when the request has no deadline at all. */
  deadline: string | null;
  source: ExpirySource;
}

/**
 * The effective deadline: the renter's link deadline if he set one, otherwise the bid window.
 *
 * `bidDeadline` is taken as authoritative even when it falls outside the window, in either
 * direction: shortening it is the point of the control, and extending it is the renter deliberately
 * keeping a request open — the supplier's form honours the same field, so the two agree.
 */
export function requestExpiry(input: {
  bidDeadline?: string | null;
  createdAt?: string | null;
  offerDuration?: string | null;
}): RequestExpiry {
  if (ms(input.bidDeadline) != null) return { deadline: input.bidDeadline as string, source: "link" };
  const w = windowDeadline(input.createdAt, input.offerDuration);
  return w ? { deadline: w, source: "window" } : { deadline: null, source: "none" };
}

export type ExpiryKind = "none" | "expired" | "today" | "left";

export interface ExpiryState {
  kind: ExpiryKind;
  /** Whole days remaining, ≥ 1, and only when `kind === "left"`. */
  days: number;
  source: ExpirySource;
}

/**
 * How that date reads right now.
 *
 * Days are counted by CEILING on the remaining milliseconds, so a deadline eleven hours away is
 * "1 day left" rather than "0" — a renter with most of a day to act should not be told the day is
 * spent. Under an hour is "today"; past is "expired". Rounding down would round a live request into
 * a dead one, which is the one error this must not make.
 */
export function expiryState(expiry: RequestExpiry, now: number = Date.now()): ExpiryState {
  const at = ms(expiry.deadline);
  if (at == null) return { kind: "none", days: 0, source: expiry.source };
  const left = at - now;
  if (left <= 0) return { kind: "expired", days: 0, source: expiry.source };
  if (left < 3600_000) return { kind: "today", days: 0, source: expiry.source };
  const days = Math.ceil(left / 86_400_000);
  return days <= 0 ? { kind: "today", days: 0, source: expiry.source } : { kind: "left", days, source: expiry.source };
}
