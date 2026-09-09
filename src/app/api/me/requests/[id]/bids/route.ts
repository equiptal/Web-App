import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { bidSizeCounts, mapBidList } from "@/lib/contract/bids";

/**
 * GET /api/me/requests/:id/bids — the bids a renter received on one of their requests
 * (web-app/request-details-bids). Proxies `GET /marketplace/requests/{requestId}/bids`
 * (renteeService.getBidList; verifies ownership server-side, marks the request viewed).
 *
 * `?sizeMatch=exact_or_larger` is passed straight through. Omitted means `exact` server-side, and
 * `exact` DROPS every bid offering a machine larger than the one asked for — so the renter sees a
 * shorter list than the one dispatch notified him about. `sizeCounts` comes back with the answer,
 * whichever way the filter is set, which is how the surface can say how many are being held.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sizeMatch = new URL(req.url).searchParams.get("sizeMatch") === "exact_or_larger" ? "exact_or_larger" : null;
  const suffix = sizeMatch ? `?sizeMatch=${sizeMatch}` : "";
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/requests/${encodeURIComponent(id)}/bids${suffix}`);
      return NextResponse.json({ bids: mapBidList(raw), sizeCounts: bidSizeCounts(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
