import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/** DELETE /api/projects/:id/awards/:awardId/documents/:docId — remove one attached paper. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; awardId: string; docId: string }> },
) {
  const { id, awardId, docId } = await params;
  const path =
    `/projects/${encodeURIComponent(id)}/awards/${encodeURIComponent(awardId)}` +
    `/documents/${encodeURIComponent(docId)}`;
  if (useRealApp) return relayAsRenter(path, { method: "DELETE" });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
