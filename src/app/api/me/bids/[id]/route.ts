import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapBid } from "@/lib/contract/bids";
import { mapRequestDetail } from "@/lib/contract/requests";

/**
 * GET /api/me/bids/:id — ONE bid, plus the request it answers (spec 004 V1).
 *
 * The equipment-verification surface is addressable by `bidId` and by nothing else: a bid may have no
 * deal room, and creating one to open a read-only view would freeze the supplier's offered count
 * (`BID_OFFER_LOCKED`). Every other bid read in this app is keyed by REQUEST (`/requests/:id/bids`),
 * so a deep link — a notification, an inbox row, a supplier's reply — had no way in. This is that way
 * in, and it **creates nothing**: `getBidDetail` is a read.
 *
 * Proxies `GET /marketplace/bids/{bidId}` (`renteeService.getBidDetail`), which already returns the
 * bid AND its request with taxonomy-enriched items and the project coordinates — so the surface's two
 * subjects (the offer, and the project pin it is measured from) arrive in one call rather than two.
 * Access is checked server-side against both firms; a SUPERSEDED bid answers 404 rather than leaking.
 *
 * No new backend endpoint, no new field (spec §7).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      // `call` already unwraps the backend's `{ data }` envelope, so this is the bid row itself.
      const row = ((await call(`/marketplace/bids/${encodeURIComponent(id)}`)) ?? {}) as Record<string, unknown>;
      return NextResponse.json({
        // The list parser, deliberately: `mapBidList` marks a bid expired by which envelope it arrived
        // in, and this endpoint has no envelope — so the backend's own `isExpired` is the source.
        bid: mapBid(row, row.isExpired === true),
        // Null rather than a fabricated record when the bid carries no request: the project pin is
        // then absent and the map says so (AC-21), which is the honest state.
        request: row.request ? mapRequestDetail(row.request) : null,
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
