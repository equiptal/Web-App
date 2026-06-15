import { NextResponse } from "next/server";
import { useRealAgent, serverEnv } from "@/lib/config/env";
import { unwrapEnvelope } from "@/lib/api/agent-adapters";
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

  if (useRealAgent && serverEnv.mansourUrl) {
    try {
      const payload: NormalizeRequest = {
        message: body.text || undefined,
        attachments: files.filter((f) => f.data).map((f) => ({ type: f.type, filename: f.name, data: stripDataUrl(f.data as string) })),
        source: "web_rfq", // triggers the web policy (non-blocking optional fields, basis constrained)
        language: body.locale === "ar" ? "ar" : undefined, // free-text in Arabic when the UI is Arabic
      };
      const res = await fetch(`${serverEnv.mansourUrl}/rfq/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[agent] /rfq/jobs HTTP", res.status);
        return NextResponse.json({ code: "network" }, { status: 503 });
      }
      const a = unwrapEnvelope(await res.json());
      const jobId = a.job_id ?? a.jobId ?? a.id;
      if (!jobId) return NextResponse.json({ code: "network" }, { status: 503 });
      return NextResponse.json({ jobId: String(jobId) }, { status: 202 });
    } catch (err) {
      console.error("[agent] start job failed:", err);
      return NextResponse.json({ code: "network" }, { status: 503 });
    }
  }

  return NextResponse.json({ jobId: "mock" }, { status: 200 });
}

function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + "base64,".length) : s;
}
