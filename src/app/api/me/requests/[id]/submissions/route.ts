import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { agentsGet, AgentsBackendError } from "@/lib/api/agents-backend";
import { USER_COOKIE } from "@/lib/api/auth-server";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * GET /api/me/requests/:id/submissions — the request's off-platform shared-link submissions + link
 * tracker (opened/submitted counts + share token). Proxies the agents service-token endpoint
 * `GET /agents/requests/{id}/bid-submissions`, forwarding the signed-in renter's id for the owner guard.
 */
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
    const raw = await agentsGet<unknown>(`/agents/requests/${encodeURIComponent(id)}/bid-submissions${qs}`);
    return NextResponse.json(raw);
  } catch (err) {
    // Degrade gracefully — My Bids still renders app bids when submissions can't load.
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    return NextResponse.json({ renterName: null, openedCount: 0, submittedCount: 0, bidDeadline: null, submissions: [] }, { status });
  }
}
