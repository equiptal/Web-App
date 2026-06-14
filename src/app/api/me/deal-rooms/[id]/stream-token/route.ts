import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET /api/me/deal-rooms/:id/stream-token — a server-signed GetStream token for the live chat
 * (web-app/request-details-bids). Proxies `GET /api/deal-rooms/{id}/stream-token` →
 * `{ token, userId, channelId }`. The public Stream API key is NEXT_PUBLIC_STREAM_API_KEY.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call(`/api/deal-rooms/${encodeURIComponent(id)}/stream-token`)) as Record<string, unknown>;
      return NextResponse.json({ token: raw?.token ?? null, userId: raw?.userId ?? null, channelId: raw?.channelId ?? null });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
