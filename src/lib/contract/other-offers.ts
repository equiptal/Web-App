import { bidSupplierKey } from "./bids";
import type { InboxBid } from "./inbox";


/** One other supplier's offer, in the few fields a chip can show. */
export interface OtherOffer {
  bidId: string;
  supplierName: string;
  supplierLogoUrl: string | null;
  currentPrice: number | null;
  priceUnit: string | null;
}

/**
 * The other SUPPLIERS who bid on one request — the map's back-header strip.
 *
 * ── The correction (owner, 2026-09-07) ──────────────────────────────────────────────────────────
 * *"This must show other offers' suppliers on this request, not other offers from this supplier."*
 *
 * The route filtered the renter's received bids by request and mapped them straight to chips, and a
 * firm that answers a multi-item request submits one bid per line — so the same supplier appeared
 * twice and the strip read as HIS other offers. One chip per counterparty, keyed by `bidSupplierKey`
 * (company → member → name), which is how every other surface in this app counts suppliers: two
 * colleagues of one firm are one counterparty, because the backend already models them that way
 * (they share the deal room's Stream channel).
 *
 * Which bid a chip travels to: the one being READ when it belongs to that supplier — it has to be the
 * chip that marks itself — else his cheapest, which is the offer a renter opening a supplier's map
 * means to look at.
 *
 * Ordered cheapest first, and an offer with no price sits at the end rather than at an invented zero.
 *
 * Lives here rather than in the route so it can be tested without a map, a fetch or a fleet.
 */
export function otherOffers(bids: InboxBid[], requestId: string, currentBidId: string): OtherOffer[] {
  const mine = bids
    .filter((b) => b.request.id === requestId)
    .sort((a, b) => (a.currentPrice ?? Infinity) - (b.currentPrice ?? Infinity));

  const bySupplier = new Map<string, OtherOffer>();
  for (const b of mine) {
    const key = bidSupplierKey(b);
    const kept = bySupplier.get(key);
    // Cheapest first above, so a supplier's first row is already his cheapest. The one thing that
    // outranks it is the bid ON SCREEN, which must be the chip that marks itself.
    if (kept && (kept.bidId === currentBidId || b.bidId !== currentBidId)) continue;
    bySupplier.set(key, {
      bidId: b.bidId,
      supplierName: b.supplierName,
      supplierLogoUrl: b.supplierLogoUrl,
      currentPrice: b.currentPrice,
      priceUnit: b.priceUnit,
    });
  }
  return [...bySupplier.values()];
}
