import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapQuotation } from "@/lib/contract/deal-room";

/**
 * GET /api/me/deal-rooms/:id/quotation — the official quotation for a closed deal (app parity).
 * Proxies `GET /api/deal-rooms/{id}/quotation`, which returns the backend-generated PDF (presigned
 * `pdfUrl`) built from the admin-configured template — the same document the mobile quotation screen
 * downloads. `pdfStatus` is `PENDING` until generation finishes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/quotation`);
      return NextResponse.json(mapQuotation(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
