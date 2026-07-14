import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/withdraw — the renter withdraws a pending acceptance (app parity:
 * "withdraw acceptance"). Backend `POST /api/deal-rooms/{id}/withdraw-acceptance` flips
 * AWAITING_SUPPLIER_CONFIRMATION → NEGOTIATING, clears the reserved units (agreedUnits → null) and
 * re-arms the bid so the renter can keep negotiating. Distinct from `release` (which reopens a CLOSED
 * deal). No body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/withdraw-acceptance`, { method: "POST", body: "{}" });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
