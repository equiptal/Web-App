/**
 * **The price move a bid card's CTA reports: from → to, and whose it was.**
 *
 * A mechanical port of the app's `bid_counter_delta.dart`, which the web never had. With nothing
 * moved the button names the lifecycle step — "Counter this price ›". Once a number has moved it
 * names the MOVE instead:
 *
 *   Counter        ~~80,210~~ → 76,440 SAR    (the viewer's own counter, still unanswered)
 *   Their counter  ~~80,210~~ → 78,900 SAR    (the other side's, waiting on the viewer)
 *
 * **NO React, NO DOM, NO i18n imports.** Both roles render this off models with different field
 * names, so the rule lives apart from either of them.
 *
 * Four things it deliberately refuses to report, each because the wrong version is worse than
 * nothing (the app's list, kept verbatim because each is a real payload it met):
 *
 *  · **A move by nobody.** `lastCounterBy` absent or unrecognised → null. Labelling the supplier's
 *    number as the renter's own is worse than showing no chip.
 *  · **A move that never happened.** The backend defaults `currentPrice` to `priceAmount`, so
 *    "unchanged" arrives as two identical numbers rather than as a null.
 *  · **A move on a dead offer.** EXPIRED / WITHDRAWN / SUPERSEDED keep their terminal label; a
 *    struck-out price under "Expired" invites a negotiation that cannot happen.
 *  · **A move on a settled one.** ACCEPTED shows the deal price. The agreed number is no longer a
 *    proposal to weigh, and drawing the old one struck through reopens a question the parties closed.
 */

/** Whose move this describes, from the READER's side. */
export type CounterSide =
  /** The viewer's own last counter — they are waiting on a reply. */
  | "mine"
  /** The other party's counter — the ball is with the viewer. */
  | "theirs";

export interface BidCounterDelta {
  /** The supplier's ORIGINAL bid rate — where the negotiation started, struck through on the card. */
  from: number;
  /** The live proposed rate. */
  to: number;
  side: CounterSide;
  /**
   * True when the move went DOWN from the opening price. Deliberately not used for wording — a
   * cheaper price is not automatically good news, since it may be the renter's own ask still
   * unanswered — but available to whoever tints it.
   */
  isDown: boolean;
}

/** Terminal or settled: a bid whose CTA must keep its lifecycle label. */
const NO_DELTA_STATUSES = new Set(["EXPIRED", "WITHDRAWN", "SUPERSEDED", "ACCEPTED"]);

/**
 * The delta for one bid, or null when the card should keep its lifecycle label.
 *
 * `viewerRole` is the side READING the card, not the side that moved. `lastCounterBy` is the deal
 * room's own value in the same vocabulary ("rentee" | "supplier").
 */
export function bidCounterDelta(input: {
  originalPrice: number | null | undefined;
  currentPrice: number | null | undefined;
  lastCounterBy: string | null | undefined;
  viewerRole: string;
  status: string | null | undefined;
}): BidCounterDelta | null {
  if (NO_DELTA_STATUSES.has((input.status ?? "").trim().toUpperCase())) return null;

  const from = input.originalPrice;
  const to = input.currentPrice;
  // A zero or negative rate is not a counter anybody made — it is a parse failure or an empty
  // column, and it would draw "80,210 → 0".
  if (from == null || to == null || to <= 0 || from <= 0) return null;
  if (to === from) return null;

  const by = (input.lastCounterBy ?? "").trim().toLowerCase();
  if (by !== "rentee" && by !== "supplier") return null;

  return { from, to, side: by === input.viewerRole.trim().toLowerCase() ? "mine" : "theirs", isDown: to < from };
}

/**
 * Whether the CTA carries the delta rather than its own label.
 *
 * **A price move outranks an open ask** (owner, 2026-08-16: *"when 2 happen, priority to the counter
 * offer event"*).
 *
 * ~~The ask won.~~ The withdrawn reasoning: an ask is a QUESTION the renter is waiting on and names
 * the one thing the supplier can settle from this row, where a delta is a number he must open the
 * room to answer either way — so showing the number would hide the question. That assumed the button
 * was the only place the ask appears. It is not: every one of these events fires a paired push, and
 * the ask is still on the card the moment the money is dealt with. A price on the table is the one
 * thing that expires and that costs real money to answer late.
 *
 * `hasOpenAsk` is unused and deliberately still a parameter. The caller must keep deciding what the
 * button says when there is NO delta, and dropping the argument would let a future edit forget the
 * ask exists at all. On the renter's card it is always false anyway — his asks live in the room —
 * so the delta wins there for the simpler reason that nothing competes with it.
 */
export function ctaShowsCounterDelta(_input: { hasOpenAsk: boolean; delta: BidCounterDelta | null }): boolean {
  return _input.delta != null;
}
