import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/:id/documents/upload-url — a presigned PUT, and the key it will land under.
 *
 * The file never passes through this app or the agents backend. The browser asks for a URL, PUTs the
 * bytes straight to storage, and then attaches the KEY to the award. That is how the equipment lane
 * already works, and it is why a 40 MB scan does not become a 40 MB JSON body crossing two hops.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/projects/${encodeURIComponent(id)}/documents/upload-url`, { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
