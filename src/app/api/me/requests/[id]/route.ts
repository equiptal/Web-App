import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapRequestDetail } from "@/lib/contract/requests";

/**
 * GET /api/me/requests/:id — full detail for one of the renter's requests
 * (web-app/request-details-bids). Proxies `GET /rentees/me/requests/{requestId}`, which returns the
 * entire request record (every field from the create body) + enriched equipment item + dealRoomId.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/rentees/me/requests/${encodeURIComponent(id)}`);
      return NextResponse.json(mapRequestDetail(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}

/**
 * DELETE /api/me/requests/:id — cancel one of the renter's requests (web-app/request-details-bids).
 * Proxies `DELETE /rentees/me/requests/{requestId}` (cancelRequest). Allowed while OPEN/ACTIVE.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/rentees/me/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}

/**
 * PATCH /api/me/requests/:id — edit one of the renter's requests (web-app/request-details-bids).
 * Proxies `PATCH /rentees/me/requests/{requestId}` (updateRequest). Allowed while OPEN with 0 bids.
 * Body: a partial of the create fields (startDate/endDate/workingHoursPerDay/paymentTerms/…).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/rentees/me/requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
