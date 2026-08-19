import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/deal-rooms/:id/close — the renter abandons this negotiation (app parity).
 *
 * Proxies `POST /api/deal-rooms/{id}/close`, which either party may call: it moves the room to
 * ABANDONED and posts the reason into the conversation, so the supplier learns why rather than
 * watching a room go quiet.
 *
 * The reason travels as `reasonText` — the backend's own field name, capped at 1000 there. It is
 * optional on the wire and required by the UI, which is the right way round: a renter who picks
 * "Other" and writes nothing still closes the room, and a schema that refused him would leave the
 * room open for want of a sentence.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let reasonText: string | undefined;
  try {
    const b = (await req.json()) as { reasonText?: string };
    if (typeof b?.reasonText === "string" && b.reasonText.trim()) reasonText = b.reasonText.trim().slice(0, 1000);
  } catch {
    /* no body — closing without a stated reason is allowed */
  }
  const body: Record<string, unknown> = {};
  if (reasonText) body.reasonText = reasonText;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/api/deal-rooms/${encodeURIComponent(id)}/close`, { method: "POST", body: JSON.stringify(body) });
      return NextResponse.json(raw ?? { ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
