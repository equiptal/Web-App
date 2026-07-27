import { NextResponse } from "next/server";
import { useRealAgent, serverEnv } from "@/lib/config/env";
import { unwrapEnvelope, mansourReason } from "@/lib/api/agent-adapters";
import { mansourHeaders } from "@/lib/api/mansour-relay";
import { GUEST_PARSE_LIMIT, guestParseCookie, guestParseCount, hasSession } from "@/lib/access/guest-quota-server";
import { userIdFromRequest } from "@/lib/api/bids-relay";
import type { NormalizeRequest } from "@/lib/contract/agent";

/**
 * POST /api/agent/process — START an RFQ parse job. Returns `{ jobId }`; the client then polls
 * GET /api/agent/jobs/:id. Async because a 15–20-item RFQ is a 30–60s LLM call that would blow the
 * gateway timeout on a sync request.
 *  - Real (MANSOUR_URL set): POST {MANSOUR_URL}/rfq/jobs with source "web_rfq" → returns its job id.
 *  - Mock: returns jobId "mock" (the poll route serves the fixture).
 * Body: { text?, files?: {name,type,data?}[], simulateError? }
 */
export async function POST(req: Request) {
  let body: { text?: string; files?: { name: string; type: string; data?: string }[]; simulateError?: boolean; locale?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (body.simulateError) return NextResponse.json({ code: "network" }, { status: 503 });

  const hasText = Boolean(body.text && body.text.trim().length > 0);
  const files = body.files ?? [];
  if (!hasText && files.length === 0) return NextResponse.json({ code: "empty" }, { status: 400 }); // AC-09

  // Guest parse cap (server backstop): a signed-out visitor gets GUEST_PARSE_LIMIT real parses, then must
  // sign in. Signed-in users are NEVER capped (any auth cookie → skip). Only real-agent runs count; the
  // mock/dev path is unlimited. Blocked → { guestLimit:true } (the client shows the account prompt, not
  // an error). The count is incremented ONLY on a successful job start below.
  const guest = useRealAgent && !hasSession(req);
  const usedParses = guest ? guestParseCount(req) : 0;
  if (guest && usedParses >= GUEST_PARSE_LIMIT) {
    return NextResponse.json({ guestLimit: true }, { status: 200 });
  }

  if (useRealAgent && serverEnv.mansourUrl) {
    try {
      const payload: NormalizeRequest = {
        message: body.text || undefined,
        attachments: files.filter((f) => f.data).map((f) => ({ type: f.type, filename: f.name, data: stripDataUrl(f.data as string) })),
        source: "web_rfq", // triggers the web policy (non-blocking optional fields, basis constrained)
        // Who this RFQ belongs to, from the mt_user cookie (same helper the correct
        // route already uses). Two reasons this matters: the corpus previously
        // attributed every web RFQ to the "web-app" default, and Mansour's per-caller
        // rate limiter keys on created_by — without it, ALL website traffic arriving
        // through this one BFF looks like a single caller and would be throttled
        // together. Guests have no cookie and correctly fall through to the
        // GUEST_PARSE_LIMIT cap above.
        ...(userIdFromRequest(req) ? { created_by: userIdFromRequest(req)! } : {}),
        language: body.locale === "ar" ? "ar" : undefined, // free-text in Arabic when the UI is Arabic
      };
      const res = await fetch(`${serverEnv.mansourUrl}/rfq/jobs`, {
        method: "POST",
        headers: mansourHeaders(),
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!res.ok) {
        // Forward the agent's REAL failure reason + status so the UI can show it (not a bare "network").
        const reason = await mansourReason(res);
        console.error("[agent] /rfq/jobs HTTP", res.status, reason ?? "");
        return NextResponse.json({ code: "network", detail: reason, backendStatus: res.status }, { status: 503 });
      }
      const a = unwrapEnvelope(await res.json());
      const jobId = a.job_id ?? a.jobId ?? a.id;
      if (!jobId) return NextResponse.json({ code: "network", detail: "The AI assistant did not start a job.", backendStatus: res.status }, { status: 503 });
      // Success → burn one guest credit (only for guests; signed-in users set no cookie).
      const started = NextResponse.json({ jobId: String(jobId) }, { status: 202 });
      if (guest) started.headers.append("Set-Cookie", guestParseCookie(usedParses + 1));
      return started;
    } catch (err) {
      console.error("[agent] start job failed:", err);
      return NextResponse.json({ code: "network", detail: err instanceof Error ? err.message : undefined }, { status: 503 });
    }
  }

  return NextResponse.json({ jobId: "mock" }, { status: 200 });
}

function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + "base64,".length) : s;
}
