import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/bids/:id/accept — accept a supplier's bid (web-app/request-details-bids).
 * Proxies `POST /marketplace/bids/{bidId}/accept` (authed as the renter).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/bids/${encodeURIComponent(id)}/accept`, { method: "POST" });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
