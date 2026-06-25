import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET /api/me/bids/:id/documents — the bid's equipment documents as PRESIGNED URLs, so the comparison
 * can view certs / ownership files WITHOUT a deal room. Proxies `GET /marketplace/bids/{bidId}`
 * (getBidDetail), which signs `equipment.documentKeys` into `{ type, url }` entries. Company docs
 * (CR/VAT/national) aren't signed here — those still come from the deal-room documents endpoint.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call(`/marketplace/bids/${encodeURIComponent(id)}`)) as Record<string, unknown>;
      const eq = (raw?.equipment ?? {}) as Record<string, unknown>;
      const docs = Array.isArray(eq.documentKeys) ? eq.documentKeys : [];
      return NextResponse.json({ documents: docs });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
