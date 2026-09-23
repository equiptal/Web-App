/**
 * **What the renter's bid card SAYS at the foot of the card** — one caption per card.
 *
 * A port of the app's `bid_band_state.dart` (`c9af28a3`, 2026-09-21), renter half only: this client
 * has no supplier side, so `SupplierBandState` and its resolver are deliberately absent rather than
 * ported dead.
 *
 * ── Why the decision lives here and not in the card ──────────────────────────────────────────────
 * The part that can be WRONG is the ORDERING, not the drawing. So the ordering is a pure function,
 * testable without rendering anything, and the card does nothing but map the returned value to a
 * string, a glyph and a tone.
 *
 * ⚠️ **The wording is deliberately NOT here.** This module imports no i18n and no React, exactly as
 * `bid-counter-delta.ts` beside it does not — and the app's own file gives the reason: a resolver
 * that reaches for the dictionary cannot be unit-tested without a render, and the caption is the
 * half that is cheap to change.
 *
 * 🔴 **The band REPLACED the news pill on the renter's card** (owner, on the app, 2026-09-21): it is
 * the card's news channel, not just its state readout, and on this side it is the ONLY channel.
 * Which is why «awaiting» and «new message» share a slot with «counter this price» — they are not
 * three kinds of thing, they are one answer to "what is the state of this offer and what do I do".
 */

import type { BidLiveStatusKind } from "./bid-live-status";
import type { CounterSide } from "./bid-counter-delta";

/** The renter's band caption, in the order the resolver tries them. */
export type RenteeBandState =
  /** No deal room yet. The band is the ACT: «Counter this price».
   *  ⚠️ Read and unread share this caption (owner, on the app, 2026-09-21), so the `new` / `fresh`
   *  distinction `uiState` carries is no longer drawn anywhere on the card. */
  | "counterThisPrice"
  /** A room exists and nobody has proposed a price. Same act, second wording, which the owner asked
   *  for explicitly. */
  | "counterThisOffer"
  /** He moved last: a counter of his own, or any term action. */
  | "awaitingSupplier"
  /** The supplier's counter is on the table. Draws the delta, and the price row keeps the original
   *  figure. */
  | "newCounterOffer"
  /** The supplier wrote in the room. */
  | "newMessage"
  /** The supplier answered an ask. **One caption for every combination** of kind and resolution
   *  (owner, on the app): the renter does not remember which question he asked, and the room shows
   *  him when he opens it. It is also what makes a PARTIAL answer safe to report — this wording
   *  claims nothing about what is on file. */
  | "supplierAnswered"
  /** The offer itself moved with no new price: units, terms. */
  | "offerUpdated"
  /** He accepted; the supplier has not confirmed yet. */
  | "awaitingConfirmation"
  /** Confirmed and the room closed. */
  | "dealClosed"
  /** Accepted, with no room status on the row to tell the two above apart. */
  | "accepted"
  /** Terminal. Drawn dead. */
  | "withdrawn"
  | "expired";

/** Terminal: drawn pale, and unpressable. */
export const renteeBandIsDead = (s: RenteeBandState): boolean => s === "withdrawn" || s === "expired";

/**
 * 🔴 **The figures ride the WAITING caption too**, not only the incoming counter (app parity).
 * Without this a renter who countered would see his own number nowhere on the card: the price row
 * holds the supplier's ORIGINAL rate until the bid is accepted, and the caption alone says only that
 * he is waiting.
 */
export const renteeBandShowsDelta = (s: RenteeBandState): boolean =>
  s === "newCounterOffer" || s === "awaitingSupplier";

/**
 * The renter's caption.
 *
 * `deltaSide` is `bidCounterDelta`'s own answer for `viewerRole: "rentee"`, already null on every
 * status that must keep its lifecycle word (that function refuses ACCEPTED / EXPIRED / WITHDRAWN /
 * SUPERSEDED).
 *
 * Order, highest first:
 *   1. terminal — an offer that is over says so and nothing else;
 *   2. accepted — where the deal got to outranks anything said along the way;
 *   3. the supplier's counter — money before reading (the app's shipped rule);
 *   4. what the supplier did or said;
 *   5. whose turn it is.
 */
export function resolveRenteeBandState(input: {
  bidStatus: string;
  hasDealRoom: boolean;
  dealRoomStatus?: string | null;
  deltaSide?: CounterSide | null;
  liveStatusKind?: BidLiveStatusKind | null;
  lastCounterBy?: string | null;
}): RenteeBandState {
  const status = (input.bidStatus ?? "").toUpperCase();
  if (status === "WITHDRAWN") return "withdrawn";
  if (status === "EXPIRED") return "expired";

  if (status === "ACCEPTED") {
    switch ((input.dealRoomStatus ?? "").toUpperCase()) {
      case "AWAITING_SUPPLIER_CONFIRMATION": return "awaitingConfirmation";
      case "CLOSED": return "dealClosed";
      // Older accepted rows carry no room status. The plain word stands rather than a guess at
      // which of the two above this is.
      default: return "accepted";
    }
  }

  // The other side's number is on the table. His OWN counter is not news — it is the same fact as
  // "waiting on the supplier", and reads better that way.
  if (input.deltaSide === "theirs") return "newCounterOffer";
  if (input.deltaSide === "mine") return "awaitingSupplier";

  switch (input.liveStatusKind) {
    case "ask-answered": return "supplierAnswered";
    case "rentee-message": return "newMessage";
    case "bid-changed": return "offerUpdated";
    // Belt and braces: the status is WITHDRAWN on any row that carries this, and the terminal check
    // above has already returned.
    case "bid-withdrawn": return "withdrawn";
    // The engagement kinds say nothing about whose turn it is, so they fall through to the turn.
    case "request-changed":
    case "quotation-viewed":
    case "quotation-downloaded":
    case undefined:
    case null:
      break;
  }

  if (!input.hasDealRoom) return "counterThisPrice";
  // A renter action with no price move — he locked or countered a term — still leaves the ball with
  // the supplier.
  if ((input.lastCounterBy ?? "").trim().toLowerCase() === "rentee") return "awaitingSupplier";
  return "counterThisOffer";
}
