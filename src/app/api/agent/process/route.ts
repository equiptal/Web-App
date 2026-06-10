import { NextResponse } from "next/server";
import { buildMockDraft } from "@/lib/api/mock-draft";
import { useRealAgent, serverEnv } from "@/lib/config/env";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import type { RFQAgentOutput, NormalizeRequest } from "@/lib/contract/agent";

/**
 * POST /api/agent/process — the agent (Mansour) boundary.
 * Real (MANSOUR_URL set): POSTs to Mansour `POST /rfq` and adapts the output → UI view-model.
 *   Mansour needs no token (no auth on /rfq). Body: { message, attachments[], source }.
 * Otherwise: stand-in mock.
 * Body in: { text?, files?: {name,type,data?}[], simulateError? }
 */
export async function POST(req: Request) {
  let body: { text?: string; files?: { name: string; type: string; data?: string }[]; simulateError?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  if (body.simulateError) return NextResponse.json({ code: "network" }, { status: 503 });

  const hasText = Boolean(body.text && body.text.trim().length > 0);
  const files = body.files ?? [];
  const hasFiles = files.length > 0;
  if (!hasText && !hasFiles) return NextResponse.json({ code: "empty" }, { status: 400 });

  if (useRealAgent && serverEnv.mansourUrl) {
    try {
      const payload: NormalizeRequest = {
        message: body.text || undefined,
        attachments: files.filter((f) => f.data).map((f) => ({ type: f.type, filename: f.name, data: stripDataUrl(f.data as string) })),
        source: "api",
      };
      const res = await fetch(`${serverEnv.mansourUrl}/rfq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!res.ok) {
        console.error("[agent] Mansour /rfq HTTP", res.status);
        return NextResponse.json({ code: "network" }, { status: 503 });
      }
      const json: unknown = await res.json();
      const out = (json && typeof json === "object" && "data" in json ? (json as { data: RFQAgentOutput }).data : (json as RFQAgentOutput));
      if (!out?.line_items?.length) return NextResponse.json({ code: "empty" }, { status: 400 }); // AC-09
      return NextResponse.json(agentOutputToDraft(out), { status: 200 });
    } catch (err) {
      console.error("[agent] Mansour call failed:", err);
      return NextResponse.json({ code: "network" }, { status: 503 });
    }
  }

  // Stand-in mock (Mansour in flux / not configured).
  await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json(buildMockDraft(), { status: 200 });
}

/** Strip a `data:<mime>;base64,` prefix if present, leaving raw base64. */
function stripDataUrl(s: string): string {
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + "base64,".length) : s;
}
