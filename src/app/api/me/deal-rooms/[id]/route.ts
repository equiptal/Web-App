import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapDealRoom } from "@/lib/contract/deal-room";

/**
 * GET /api/me/deal-rooms/:id — a deal room the renter is party to (web-app/request-details-bids).
 * Proxies `GET /api/deal-rooms/{id}` (verifies party + transitions OPEN→NEGOTIATING server-side).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}`);
      return NextResponse.json(mapDealRoom(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
