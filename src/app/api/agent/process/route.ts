import { NextResponse } from "next/server";
import { buildMockDraft } from "@/lib/api/mock-draft";

/**
 * POST /api/agent/process — the [Mansour] boundary (mock).
 * Body: { text?: string, files?: {name,type}[], simulateError?: boolean }
 *  - simulateError → 503 (exercises AC-10 network failure)
 *  - no text and no files → 400 { code: "empty" } (exercises AC-09)
 *  - otherwise → 200 AgentDraft
 */
export async function POST(req: Request) {
  let body: { text?: string; files?: { name: string; type: string }[]; simulateError?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  if (body.simulateError) {
    return NextResponse.json({ code: "network" }, { status: 503 });
  }

  const hasText = Boolean(body.text && body.text.trim().length > 0);
  const hasFiles = Boolean(body.files && body.files.length > 0);
  if (!hasText && !hasFiles) {
    return NextResponse.json({ code: "empty" }, { status: 400 });
  }

  // Simulate parse latency so the progressive-population UI is observable.
  await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json(buildMockDraft(), { status: 200 });
}
