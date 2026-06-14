import { NextResponse } from "next/server";
import { useRealAgent, serverEnv } from "@/lib/config/env";
import { buildMockDraft } from "@/lib/api/mock-draft";
import { agentOutputToDraft, extractAgentOutput, isExtractionEmpty, jobStatus } from "@/lib/api/agent-adapters";

/**
 * GET /api/agent/jobs/:id — poll an RFQ parse job.
 * Returns { status: "pending" } | { status: "done", draft } | { status: "error", code }.
 *  - Real: proxies GET {MANSOUR_URL}/rfq/jobs/:id, adapts the result → UI view-model when done.
 *  - Mock (id "mock" / unconfigured): returns the fixture draft immediately.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "mock" || !useRealAgent || !serverEnv.mansourUrl) {
    return NextResponse.json({ status: "done", draft: buildMockDraft() });
  }

  try {
    const res = await fetch(`${serverEnv.mansourUrl}/rfq/jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 202) return NextResponse.json({ status: "pending" });
    if (!res.ok) return NextResponse.json({ status: "error", code: "network" });

    const raw = await res.json();
    const st = jobStatus(raw);
    if (st === "pending") return NextResponse.json({ status: "pending" });
    if (st === "error") return NextResponse.json({ status: "error", code: "network" });
    if (isExtractionEmpty(raw)) return NextResponse.json({ status: "error", code: "empty" }); // AC-09
    return NextResponse.json({ status: "done", draft: agentOutputToDraft(extractAgentOutput(raw)) });
  } catch (err) {
    console.error("[agent] poll job failed:", err);
    return NextResponse.json({ status: "error", code: "network" });
  }
}
