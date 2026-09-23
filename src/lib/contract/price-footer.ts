/**
 * Spec 004 §6.10 / 004a §4a.1 + §4a.4 — **V12's price footer, as numbers only.**
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────────────────────────
 * It is not the deal room's bar. What §6.10 calls a bar is `qp-foot` (`DealRoom.tsx:1608`) — the
 * footer of a **three-page negotiation wizard**, bound to that component's `page` / `editable` /
 * `canNext` / `canSubmit` / `busy` / `doSubmit`. It is not embeddable, and re-implementing it here
 * would put two negotiation surfaces over one room (004a §4a.2).
 *
 * So the footer **shows figures and hands off**: the figures come from `computeDealTotals` — the one
 * function the deal-room bar, the quotation and the signed PDF all price from, which is what makes
 * "every figure matches the existing bar for the same room" (RM3-AC-24) true by construction rather
 * than by inspection. Negotiate/accept navigates to `/deal-room/[dealRoomId]`.
 *
 * ── The two numbers that are both correct (004a §4a.4) ───────────────────────────────────────────
 * | Surface | Number | Meaning |
 * |---|---|---|
 * | count pills + shortfall (§6.2, §6.3) | `unitsOffered` | what the offer is made of |
 * | this footer | `liveRentalUnits` — agreed, then the latest proposed, then offered, capped | what the money is based on |
 *
 * When they differ the footer **says so once** (RM3-AC-66) — two unexplained figures on one screen is
 * the defect that rule exists to stop.
 *
 * 🔴 ~~It never reads `currentRentalUnits` (the backend's `lastProposedRentalUnits`): an unapproved
 * counter must not rewrite what the offer says (RM3-AC-67).~~ Withdrawn (owner, 2026-09-22: *"use
 * same price as in bid card… all prices appear in all screens the same as bid card"*, and on the
 * units rule *"check the app"*). The app withdrew RM3-AC-67 on 2026-08-14 (APP-RDR-25,
 * `bid_map_price.dart`): its bid card and its deal room both read the live count, so a footer that
 * did not was the one screen quoting a different total for the same bid. The web's bid card already
 * reads `liveRentalUnits`; this footer now calls the same function. The count PILLS still describe
 * the offer.
 *
 * **NO React, NO DOM, NO i18n.**
 */

import { computeDealTotals, type DealTotals } from "./deal-room";
import type { BidCard } from "./bids";
import { liveRentalUnits } from "./comparison";

/**
 * The price basis, exactly.
 *
 * A `Pick` of `BidCard` rather than a fresh shape, so a caller holding a bid passes it straight
 * through. It carries `currentRentalUnits` and `numberOfUnits` since 2026-09-22, because
 * `liveRentalUnits` reads both.
 */
export type PriceFooterBid = Pick<
  BidCard,
  | "price" | "priceUnit" | "unitsOffered" | "agreedUnits" | "currentRentalUnits" | "numberOfUnits"
  | "mobPrice" | "demobPrice" | "mobUnits" | "demobUnits" | "mobExcluded" | "demobExcluded"
  | "dealRoomId"
>;

export interface PriceFooterModel {
  /** A room exists, so the figures may have moved since the opening offer and negotiation resumes
   *  rather than starts. Null `dealRoomId` is the COMMON case — most bids have no room. */
  hasRoom: boolean;
  /** Every figure the collapsed bar and the expanded breakdown render. */
  totals: DealTotals;
  /** What the count pills describe (`unitsOffered`) — restated here only to explain the difference. */
  offeredUnits: number;
  /** What the money is based on. */
  pricedUnits: number;
  /**
   * The two disagree, so the footer must state it — once, here (RM3-AC-66).
   *
   * The bid card's own test: the priced count is not the offered count.
   */
  unitsDiffer: boolean;
  /** The rate's provenance: an untouched opening offer, or a figure the room has moved. */
  source: "opening_offer" | "deal_room";
}

/**
 * The footer's numbers for one bid.
 *
 * `durationDays` is the request's `estimatedDurationDays` — **the same field the deal room maps into
 * `periods`** (`deal-room.ts:402`), passed in rather than read off the bid because a bid does not
 * carry the project's duration and the two must not be allowed to diverge. Null is legitimate: no
 * duration means one full period, which is what `computeDealTotals` already does.
 */
export function priceFooterModel(
  bid: PriceFooterBid,
  durationDays: number | null,
  /** The request's start date — the anchor the shared rental maths counts Fridays from. Omit it and
   *  the rental can only be shown at its raw rate (mobile §3), so pass it wherever it is known. */
  startDate: string | null = null,
): PriceFooterModel {
  // Both counts exactly as the bid card reads them (`BidCards.tsx`), so the two surfaces price one bid
  // on one number.
  const offeredUnits = bid.unitsOffered > 0 ? bid.unitsOffered : bid.numberOfUnits > 0 ? bid.numberOfUnits : 1;
  const agreed = bid.agreedUnits ?? null;
  const pricedUnits = liveRentalUnits(bid);
  return {
    hasRoom: bid.dealRoomId != null,
    totals: computeDealTotals({
      rate: bid.price,
      priceUnit: bid.priceUnit,
      periods: durationDays,
      startDate,
      // The live count, handed in as the priced count so `computeDealTotals` uses it as given.
      agreedUnits: pricedUnits,
      numberOfUnits: offeredUnits,
      mobUnits: bid.mobUnits ?? null,
      demobUnits: bid.demobUnits ?? null,
      mobPrice: bid.mobPrice,
      demobPrice: bid.demobPrice,
      mobExcluded: bid.mobExcluded === true,
      demobExcluded: bid.demobExcluded === true,
    }),
    offeredUnits,
    pricedUnits,
    unitsDiffer: pricedUnits !== offeredUnits,
    // A room whose price has not moved still reads as the opening offer — the source describes the
    // FIGURE, not whether a conversation exists.
    source: bid.dealRoomId != null && agreed != null ? "deal_room" : "opening_offer",
  };
}
