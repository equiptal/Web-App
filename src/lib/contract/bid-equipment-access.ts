/**
 * "May this bid open the equipment-verification surface?" — one opinion, in one place (spec 004
 * §6.11, RM3-AC-25).
 *
 * §6.11 places exactly one requirement on off-platform offers: **route them away from here.** They
 * keep `SharedBidSubmissionModal` + `SharedBidNegotiateRoom` exactly as they ship — this spec adds
 * nothing to them and removes nothing from them. So the rule this module encodes is a *refusal*, and
 * nothing about an off-platform bid changes because of it.
 *
 * It is a pure predicate rather than an inline condition in JSX because it has **two** enforcement
 * points that must agree: the entry point that decides whether to render the link, and the route
 * itself, which a deep link, a bookmark or a notification can reach without passing any entry point.
 * Entry points are not a security boundary; two copies of this condition drifting apart is exactly
 * how a link that 404s gets shipped.
 */

/** The subject the predicate needs. Deliberately structural, not `BidCard`: the route knows a bid
 *  **id** before it knows a bid, and must be able to refuse on the id alone. */
export type BidEquipmentSubject = {
  id: string;
  /** Set by `submissionToBidCard` (lib/contract/link-bids) and by nothing else in this codebase. */
  viaSharedLink?: boolean;
};

/**
 * The off-platform tell that survives a page load.
 *
 * `submissionToBidCard` mints `id: \`link-${sub.id}\`` for every shared-link submission, and a
 * `LinkBidSubmission` is **not** a `Bid` row — `GET /marketplace/bids/link-…` cannot resolve one.
 * The prefix is therefore not a heuristic: it is the id of a different entity in the same namespace,
 * and it is the only off-platform signal available *before* a fetch.
 *
 * This matters more than it looks. `mapBid` — the mapper behind `GET /api/me/bids/:id`, the route's
 * only source of a bid — never sets `viaSharedLink`; only `submissionToBidCard` does, and that mapper
 * runs on the submissions list, never on this route. So a guard that waits for `bid.viaSharedLink`
 * never fires here: the fetch 404s first and the renter is told the offer "couldn't be loaded", which
 * is the one thing the refusal must never say. Judging the **id** is what makes the rule reachable.
 */
export function isOffPlatformBidId(bidId: string): boolean {
  return bidId.startsWith("link-");
}

/**
 * Whether this bid is an off-platform submission, and so must not open the surface.
 *
 * Two signals, either sufficient: the id (available before any fetch) and the flag (available after
 * one, and the only signal a future mapper is likely to set). Neither is redundant — see above.
 *
 * **`converted` is deliberately NOT off-platform here.** A converted submission is a first-class app
 * bid with real registered machines and a real deal room; only its *labelling* stays off-platform
 * (AC-203). Excluding it would hide the surface from a bid that has everything the surface reads.
 *
 * **`upload:` ids are deliberately NOT covered.** They are minted by `normalizedBidToBidCard` for a
 * quote parsed out of an uploaded file inside the comparison workspace — never a row in the renter's
 * bids list, and never linked here. Refusing them would attach the shared-link copy ("came in through
 * your shared link") to something that did not, which is a false statement made to avoid an
 * unreachable case.
 */
export function isOffPlatformBid(bid: BidEquipmentSubject): boolean {
  return bid.viaSharedLink === true || isOffPlatformBidId(bid.id);
}

/**
 * The positive form, for the entry points: render the link only when following it lands somewhere.
 * A link that 404s is a worse answer than no link.
 */
export function mayOpenEquipmentSurface(bid: BidEquipmentSubject): boolean {
  return !isOffPlatformBid(bid);
}
