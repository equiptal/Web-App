import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/terms/batch — submit all locally-collected term resolutions at once
 * (app parity: the renter resolves terms locally, then batches them with the rate counter). Proxies
 * `POST /api/deal-rooms/{id}/terms/batch`. Body: { updates: [{ termKey, action, value? }], note? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { updates?: { termKey: string; action: string; value?: unknown }[]; note?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty */
  }
  const updates = Array.isArray(body.updates) ? body.updates : [];
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/terms/batch`, {
        method: "POST",
        body: JSON.stringify({ updates, note: body.note }),
      });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
