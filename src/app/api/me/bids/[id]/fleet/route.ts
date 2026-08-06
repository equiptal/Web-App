import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapFleet } from "@/lib/contract/fleet";

/**
 * GET /api/me/bids/:id/fleet — every machine of the requested type the BID's supplier owns, located
 * for the renter's map (RMAP T16). Proxies `GET /marketplace/bids/{bidId}/fleet`
 * (`supplier-fleet.service.getSupplierFleetForBid`), which derives the supplier FROM the bid and
 * re-checks that this renter can reach the bid's request — no supplier id is ever accepted from a
 * client, here or there.
 *
 * The web never calls the app backend directly: `withAuthedBackend` is what carries the renter's
 * session, refreshes an expired id token once, and flips a sticky supplier `activeRole` back to rentee
 * — none of which a browser fetch can do. `appAuthErrorResponse` forwards the backend's bilingual
 * `{ code, detail, messageAr }` envelope so the caller can show the Arabic reason it already sent.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/bids/${encodeURIComponent(id)}/fleet`);
      return NextResponse.json({ machines: mapFleet(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
