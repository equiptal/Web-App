import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/:id/documents/:docId/url — a short-lived link to one of the site's papers.
 *
 * The paper was write-only before this. `chart` publishes `{ id, kind, filename }` and never the S3
 * key — deliberately, because a stored URL either expires or is permanently public — so a renter
 * could attach a purchase order, read its name off the chart, and never open it again.
 *
 * The DOCUMENT id travels, never the key. The backend resolves the id against that site's own
 * documents and presigns what it finds, so no caller can name an object outside the site.
 *
 * Not cached, at any layer: the answer is a credential with ten minutes on it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (useRealApp) {
    return relayAsRenter(
      `/projects/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}/url`,
      { method: "GET" },
    );
  }
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
