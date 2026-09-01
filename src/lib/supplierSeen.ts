/**
 * When this person last opened each supplier — the unseen dot, and nothing else.
 *
 * ── Why it is here and not on the backend ───────────────────────────────────────────────────────
 *
 * The backend has no per-user seen state and deliberately none: a write on every tap, for a dot
 * (backend delivery note §3.2, and the same rule the suggestions band already follows). So the
 * cut-off is local, exactly like a dismissed suggestion.
 *
 * ── The dot and the count answer different questions ────────────────────────────────────────────
 *
 * `rollup.newBids` is **the last 24 hours**, the same number for everyone in the firm — a fact about
 * the bid. This is **since YOU last looked** — a fact about the reader. So the badge says *New* and
 * the dot says *you have not seen this*, and a renter who reads a bid and comes back an hour later
 * loses the dot while the badge stays until tomorrow. Both are true.
 *
 * ── Its limit, stated rather than hidden ────────────────────────────────────────────────────────
 *
 * Per device. Clearing site data resets it, and a renter who reads on his phone still sees the dot on
 * his laptop. That is precisely why the COUNT is not built on this — a number that disagrees between
 * two of a person's own screens is a number nobody trusts again.
 */

const KEY = "moedatech.suppliers.seen.v1";

type SeenMap = Record<string, string>;

/** Never throws: a locked-down browser means "no dot", not a broken list. */
function read(): SeenMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : {};
  } catch {
    return {};
  }
}

export function loadSeen(): SeenMap {
  return typeof window === "undefined" ? {} : read();
}

/** Stamp now against one row. Returns the new map so a caller can set state without re-reading. */
export function markSeen(id: string): SeenMap {
  if (typeof window === "undefined") return {};
  const next = { ...read(), [id]: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode, quota, a browser that refuses — the dot is not worth an error */
  }
  return next;
}

/**
 * Is there a bid this reader has not seen?
 *
 * A supplier never opened has no dot on an old bid: the alternative is a screen that arrives covered
 * in dots on a renter's first visit, which teaches him to ignore all of them. So the dot needs BOTH
 * a bid and a previous look — `newBids` is what speaks for a firm he has never opened.
 */
export function hasUnseenBid(lastBidAt: string | null | undefined, seenAt: string | undefined): boolean {
  if (!lastBidAt || !seenAt) return false;
  const bid = Date.parse(lastBidAt);
  const seen = Date.parse(seenAt);
  return Number.isFinite(bid) && Number.isFinite(seen) && bid > seen;
}
