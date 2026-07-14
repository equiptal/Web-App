import { NextResponse } from "next/server";
import { useRealAgent, serverEnv } from "@/lib/config/env";
import { userIdFromRequest } from "@/lib/api/bids-relay";

/**
 * POST /api/agent/rfq/:id/correct — relay a renter's draft-vs-final edit to Mansour's RFQ learning loop
 * (`POST {MANSOUR_URL}/rfq/:id/correct`, source "web_review"). Fire-and-forget: the client never awaits
 * this on the request-creation path, and the route is lenient (always resolves) so a learning miss can
 * never surface as a submit error. Mirrors the transport of /api/agent/process (token-free /rfq/*).
 *
 * Body: { patch: { rfq_header?, line_items? }, reason? }. `corrector_id` is injected server-side from
 * the `mt_user` cookie; `source` is fixed to "web_review".
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { patch?: unknown; reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (!body.patch) return NextResponse.json({ ok: false, skipped: "no-patch" });
  // Mock / unconfigured agent → nothing to learn from; succeed silently.
  if (!useRealAgent || !serverEnv.mansourUrl) return NextResponse.json({ ok: true, skipped: "agent-unconfigured" });

  const correctorId = userIdFromRequest(req) ?? undefined;
  try {
    const res = await fetch(`${serverEnv.mansourUrl}/rfq/${encodeURIComponent(id)}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patch: body.patch,
        reason: body.reason ?? "renter edited before submit",
        corrector_id: correctorId,
        source: "web_review",
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[agent] /rfq/:id/correct HTTP", res.status);
      return NextResponse.json({ ok: false });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[agent] rfq correct failed:", err);
    return NextResponse.json({ ok: false });
  }
}
