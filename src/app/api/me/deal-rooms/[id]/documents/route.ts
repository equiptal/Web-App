import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapDealRoomDocuments } from "@/lib/contract/deal-room";

/**
 * GET /api/me/deal-rooms/:id/documents — documents shared in a deal room the renter is party to
 * (web-app/request-details-bids). Proxies `GET /api/deal-rooms/{id}/documents` so the renter can
 * view the other side's (supplier's) documents, mirroring the app's deal room.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/documents`);
      return NextResponse.json(mapDealRoomDocuments(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
