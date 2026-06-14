import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * PATCH /api/me/deal-rooms/:id/terms/:key — the renter resolves one negotiable term
 * (web-app/request-details-bids). Proxies `PATCH /api/deal-rooms/{id}/terms/{key}`. The rentee may
 * `accept` (take the supplier's value), `counter` (propose a value), or `reopen`. Body: { action, value? }.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  let body: { action?: string; value?: unknown } = {};
  try {
    body = (await req.json()) as { action?: string; value?: unknown };
  } catch {
    /* empty */
  }
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/terms/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: body.action, value: body.value }),
      });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
