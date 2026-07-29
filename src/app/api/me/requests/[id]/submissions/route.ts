import { NextResponse } from "next/server";
import { agentsGet, AgentsBackendError } from "@/lib/api/agents-backend";
import { sessionUserId } from "@/lib/api/session-user";

/**
 * GET /api/me/requests/:id/submissions — the request's off-platform shared-link submissions + link
 * tracker (opened/submitted counts + share token). Proxies the agents service-token endpoint
 * `GET /agents/requests/{id}/bid-submissions`, forwarding the signed-in renter's id for the owner guard.
 *
 * The id comes from the SHARED `sessionUserId()` (a backend-verified token — never the unsigned
 * `mt_user` cookie), and no session is refused rather than proxied without a `userId`: this returns
 * another renter's incoming bids, so the guard is a confidentiality boundary, not a convenience.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await sessionUserId();
  if (userId == null) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  const qs = `?userId=${userId}`;
  try {
    const raw = await agentsGet<unknown>(`/agents/requests/${encodeURIComponent(id)}/bid-submissions${qs}`);
    return NextResponse.json(raw);
  } catch (err) {
    // Degrade gracefully — My Bids still renders app bids when submissions can't load.
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    return NextResponse.json({ renterName: null, openedCount: 0, submittedCount: 0, bidDeadline: null, submissions: [] }, { status });
  }
}
