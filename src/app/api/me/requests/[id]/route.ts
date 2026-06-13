import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapRequestDetail } from "@/lib/contract/requests";

/**
 * GET /api/me/requests/:id — full detail for one of the renter's requests
 * (web-app/request-details-bids). Proxies `GET /rentees/me/requests/{requestId}`, which returns the
 * entire request record (every field from the create body) + enriched equipment item + dealRoomId.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/rentees/me/requests/${encodeURIComponent(id)}`);
      return NextResponse.json(mapRequestDetail(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
