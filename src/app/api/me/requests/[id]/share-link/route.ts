import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { AgentsBackendError } from "@/lib/api/agents-backend";
import { USER_COOKIE } from "@/lib/api/auth-server";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * PUT /api/me/requests/:id/share-link — set/clear the request's bid-submission deadline (AC-04/05/06).
 * Proxies the agents service-token endpoint `PUT /agents/requests/{id}/share-link`, forwarding the
 * renter's id for the owner guard. Body: `{ deadline: ISO | null }`.
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

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!serverEnv.agentsApiUrl || !serverEnv.agentsApiToken) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const userId = (await sessionUserId()) ?? serverEnv.agentsTestUserId;
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const body = await req.text();
  try {
    const res = await fetch(`${serverEnv.agentsApiUrl}/agents/requests/${encodeURIComponent(id)}/share-link${qs}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serverEnv.agentsApiToken}` },
      body,
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) return NextResponse.json(json ?? { error: "failed" }, { status: res.status });
    const data = json && typeof json === "object" && "data" in json ? (json as { data: unknown }).data : json;
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof AgentsBackendError ? err.status || 502 : 502;
    return NextResponse.json({ error: "upstream" }, { status });
  }
}
