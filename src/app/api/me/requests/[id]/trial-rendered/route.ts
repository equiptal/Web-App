import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { agentsPost, AgentsBackendError } from "@/lib/api/agents-backend";
import { USER_COOKIE } from "@/lib/api/auth-server";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * POST /api/me/requests/:id/trial-rendered — mobile/016 (AC-09).
 *
 * Called ONCE, after a trial request's sample bids have actually rendered for the renter: it consumes
 * the account's first-request slot so the home "Start Your Request" pop-up stops appearing. If the bids
 * never render we never call this, so the slot stays open and the pop-up returns next visit (AC-15).
 *
 * Proxies the agents service-token endpoint `POST /agents/requests/{id}/trial-rendered`, forwarding the
 * signed-in renter's id — that endpoint verifies ownership against the request row, so a mismatch 403s.
 * Idempotent server-side: repeat calls, and calls on a non-trial request, are safe no-ops.
 */
async function sessionUserId(): Promise<number | null> {
  try {
    const raw = (await cookies()).get(USER_COOKIE)?.value;
    if (!raw) return null;
    const user = JSON.parse(raw) as RenterUser;
    return typeof user.id === "number" ? user.id : null;
  } catch {
    return null;
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = serverEnv.agentsTestUserId ? Number(serverEnv.agentsTestUserId) : null;
  const userId = (await sessionUserId()) ?? fallback;
  if (!userId || Number.isNaN(userId)) {
    return NextResponse.json({ code: "unauthorized" }, { status: 401 });
  }
  try {
    const data = await agentsPost<{ consumed?: boolean; reason?: string }>(
      `/agents/requests/${encodeURIComponent(id)}/trial-rendered`,
      { userId },
    );
    return NextResponse.json(data ?? { consumed: true });
  } catch (err) {
    // Never user-facing: the caller fires this in the background and ignores failures. Losing it only
    // means the slot stays open, which is the safe direction (the pop-up reappears).
    const status = err instanceof AgentsBackendError ? err.status || 502 : 500;
    return NextResponse.json({ consumed: false, code: "trial_rendered_failed" }, { status });
  }
}
