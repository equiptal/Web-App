import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapBidList } from "@/lib/contract/bids";

/**
 * GET /api/me/requests/:id/bids — the bids a renter received on one of their requests
 * (web-app/request-details-bids). Proxies `GET /marketplace/requests/{requestId}/bids`
 * (renteeService.getBidList; verifies ownership server-side, marks the request viewed).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/requests/${encodeURIComponent(id)}/bids`);
      return NextResponse.json({ bids: mapBidList(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
