import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { composeRenteeRequest } from "@/lib/contract/rentee-request";

/**
 * POST /api/me/deal-rooms/:id/requests — the renter's ask about ONE machine (spec 004 §6.7, V11).
 *
 * Proxies `POST /marketplace/deal-rooms/{dealRoomId}/requests` → `{ ref, messageId }`.
 *
 * **Why the route exists at all, when the card is "just a message".** Ordinary chat is posted
 * client-side through the Stream SDK; this card cannot be, because four things must happen that a
 * client posting directly cannot do: `ref` is minted server-side so it cannot be threaded onto
 * another conversation's question, `equipmentId` ownership is checked **before** the message exists
 * (a Stream message naming a foreign machine could never be deleted), the message id comes back for
 * threading, and the supplier's unread + notification are dispatched.
 *
 * The body is re-composed through `composeRenteeRequest` rather than forwarded verbatim: the retired
 * `add_to_offer` kind and the scope/equipmentId/docTypes coherence rules are then enforced on this
 * side too, so a malformed ask is a 400 the surface can explain instead of one the backend returns.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let raw: Record<string, unknown> = {};
  try {
    raw = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    /* empty body — falls through to the invalid_request below */
  }

  const draft = composeRenteeRequest({
    kind: String(raw.kind ?? ""),
    equipmentId: typeof raw.equipmentId === "string" ? raw.equipmentId : null,
    scope: raw.scope === "company" ? "company" : raw.scope === "equipment" ? "equipment" : undefined,
    docTypes: Array.isArray(raw.docTypes) ? raw.docTypes.map((t) => String(t)) : undefined,
  });
  if (!draft) return NextResponse.json({ code: "invalid_request" }, { status: 400 });

  return withAuthedBackend(req, async (call) => {
    try {
      const out = (await call(`/marketplace/deal-rooms/${encodeURIComponent(id)}/requests`, {
        method: "POST",
        body: JSON.stringify(draft),
      })) as Record<string, unknown>;
      return NextResponse.json({ ref: String(out?.ref ?? ""), messageId: String(out?.messageId ?? "") });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
