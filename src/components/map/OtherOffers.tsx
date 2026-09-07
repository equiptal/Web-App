"use client";

import { useRouter } from "next/navigation";
import type { OtherOffer } from "@/lib/contract/other-offers";
import { useT } from "@/lib/i18n";
// The strip's own rules moved out of `.bidmap` with it: it no longer renders inside that surface.
import "./map-proto.css";

/**
 * ── The other SUPPLIERS bidding on this request (owner, 2026-09-04, corrected 2026-09-07) ────────
 *
 * A row of the firms that offered on the request whose map is on screen, and a press travels to that
 * firm's own equipment map — so a renter compares suppliers here instead of walking back to the bid
 * cards between each one.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────────────────────────
 * *"This must show other offers' suppliers on this request, not other offers from this supplier…
 * and these tabs must be in the back header, not on the company header."*
 *
 * Two faults, one screenshot. The strip listed BIDS, not suppliers: one firm that answered a
 * multi-item request line by line appeared once per bid, so «Murad alabdullah» sat there twice and
 * read as that supplier's own other offers. And it printed the bidding MEMBER while the header above
 * it named the FIRM, which made the duplicate impossible to interpret — see
 * `readSupplierDisplayName` for that half. It is one chip per counterparty now, keyed the way every
 * other surface keys one (`company → member → name`), and the chip carries the firm's name.
 *
 * ── Why it moved out of the panel ────────────────────────────────────────────────────────────────
 * It sat in the panel's identity band, under the supplier's name — which made it look like a
 * property OF that supplier. In the page's back header it reads as what it is: the way across the
 * offers on this request, on the same line as the way out.
 *
 * Names alone, no prices: this is a way to travel, not a comparison, and the comparison already
 * exists one screen back with every figure on it. The supplier being read stays in the row and is
 * marked rather than removed from it — a row that dropped him would renumber itself under his feet
 * each time he moved.
 */
export function OtherOffers({ offers, currentBidId }: { offers: OtherOffer[]; currentBidId: string }) {
  const t = useT();
  const router = useRouter();
  // Nothing renders for a single offer: a strip naming only the supplier already on screen is
  // furniture.
  if (offers.length < 2) return null;

  return (
    <div className="bm-sibs" role="tablist" aria-label={t.bidMap.otherBids}>
      <span className="bm-sibs-l">{t.bidMap.otherBids}</span>
      <div className="bm-sibs-row">
        {offers.map((o) => {
          const here = o.bidId === currentBidId;
          return (
            <button
              key={o.bidId}
              type="button"
              role="tab"
              aria-selected={here}
              className={`bm-sib${here ? " on" : ""}`}
              title={o.supplierName}
              /* The one being read is not a link to itself: pressing it would refetch the bid and the
                 fleet and land the renter exactly where he stands.

                 ── `replace`, not `push` (owner, 2026-09-07) ──────────────────────────────────────
                 *"I have a loop of back in the map view: in viewing offers, back just takes me to the
                 other offer in a loop."* Exactly that — each press of a sibling pushed a history
                 entry, so Back walked offer A → B → A → B and never left the map. Reading another
                 supplier's offer on the same request is a lateral move across one surface, not a step
                 into a new place: it replaces the entry, and Back goes where the map was entered
                 from. */
              onClick={() => { if (!here) router.replace(`/bids/${encodeURIComponent(o.bidId)}/equipment`); }}
            >
              <span className="bm-sib-av">
                {o.supplierLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.supplierLogoUrl} alt="" />
                ) : (
                  o.supplierName.trim().slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="bm-sib-n">{o.supplierName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
