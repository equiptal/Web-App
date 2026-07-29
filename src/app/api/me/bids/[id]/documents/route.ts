import { NextResponse } from "next/server";
import { agentsGet, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";
import { mapDealRoomDocuments } from "@/lib/contract/deal-room";

/**
 * GET /api/me/bids/:id/documents — ALL of a bid's documents (supplier company verification + equipment)
 * as PRESIGNED URLs, so the comparison can show "has doc" chips and view the actual files WITHOUT a
 * deal room. Proxies the agents backend `GET /agents/bids/{bidId}/documents` (service-token authed),
 * forwarding the signed-in renter's id so the backend can enforce the bid/request-owner guard.
 *
 * Response → `{ companyDocuments, equipmentDocuments }`, mapped via `mapDealRoomDocuments`.
 *
 * The id comes from the SHARED `sessionUserId()` (a backend-verified token — never the unsigned
 * `mt_user` cookie), and no session is refused rather than proxied without a `userId`: these are a
 * supplier's CR/VAT and equipment documents, so the owner guard is a confidentiality boundary.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  const qs = `?userId=${userId}`;
  try {
    const raw = await agentsGet<unknown>(`/agents/bids/${encodeURIComponent(id)}/documents${qs}`);
    return NextResponse.json(mapDealRoomDocuments(raw));
  } catch (err) {
    // Degrade gracefully — the comparison falls back to the bid-list flags when docs don't load.
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    return NextResponse.json({ companyDocuments: [], equipmentDocuments: [] }, { status });
  }
}
