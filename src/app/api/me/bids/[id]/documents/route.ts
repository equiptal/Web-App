import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { agentsGet, AgentsBackendError } from "@/lib/api/agents-backend";
import { USER_COOKIE } from "@/lib/api/auth-server";
import { mapDealRoomDocuments } from "@/lib/contract/deal-room";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * GET /api/me/bids/:id/documents — ALL of a bid's documents (supplier company verification + equipment)
 * as PRESIGNED URLs, so the comparison can show "has doc" chips and view the actual files WITHOUT a
 * deal room. Proxies the agents backend `GET /agents/bids/{bidId}/documents` (service-token authed),
 * forwarding the signed-in renter's id so the backend can enforce the bid/request-owner guard.
 *
 * Response → `{ companyDocuments, equipmentDocuments }`, mapped via `mapDealRoomDocuments`.
 */

/** The signed-in renter's real backend id (web-app/001), or null when there's no session. */
async function sessionUserId(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(USER_COOKIE)?.value;
    if (!raw) return null;
    const user = JSON.parse(raw) as RenterUser;
    return typeof user.id === "number" ? String(user.id) : null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = (await sessionUserId()) ?? serverEnv.agentsTestUserId;
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  try {
    const raw = await agentsGet<unknown>(`/agents/bids/${encodeURIComponent(id)}/documents${qs}`);
    return NextResponse.json(mapDealRoomDocuments(raw));
  } catch (err) {
    // Degrade gracefully — the comparison falls back to the bid-list flags when docs don't load.
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    return NextResponse.json({ companyDocuments: [], equipmentDocuments: [] }, { status });
  }
}
