import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/rate-proposal — the renter counters with a new rate
 * (web-app/request-details-bids). Proxies `POST /api/deal-rooms/{id}/rate-proposal`.
 * Body: { proposedRate, priceUnit, mobPrice?, demobPrice?, message? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/rate-proposal`, { method: "POST", body: JSON.stringify(body) });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
