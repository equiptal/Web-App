import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/release — reopen an ACCEPTED (CLOSED) deal for re-negotiation (app parity:
 * the "release" action). Backend `POST /api/deal-rooms/{id}/release` flips CLOSED → NEGOTIATING and
 * re-arms the bid (isWinner=false, OPEN_FOR_NEGOTIATION); the renter can then re-negotiate and re-confirm,
 * which re-issues the quotation. Body: { reason? }.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let reason: string | undefined;
  try {
    const b = (await req.json()) as { reason?: string };
    if (typeof b?.reason === "string" && b.reason.trim()) reason = b.reason.trim();
  } catch {
    /* no body */
  }
  const body: Record<string, unknown> = {};
  if (reason) body.reason = reason;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/release`, { method: "POST", body: JSON.stringify(body) });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
