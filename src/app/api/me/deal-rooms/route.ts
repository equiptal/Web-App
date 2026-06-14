import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms — create (or fetch) the deal room for a bid (web-app/request-details-bids).
 * Proxies `POST /api/deal-rooms` with `{ bidId }`. Returns the room's id.
 */
export async function POST(req: Request) {
  let bidId = "";
  try {
    bidId = ((await req.json()) as { bidId?: string }).bidId ?? "";
  } catch {
    /* empty body */
  }
  if (!bidId) return NextResponse.json({ code: "bad_request" }, { status: 400 });
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call(`/api/deal-rooms`, { method: "POST", body: JSON.stringify({ bidId }) })) as Record<string, unknown>;
      return NextResponse.json({ id: String(raw?.id ?? "") });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
