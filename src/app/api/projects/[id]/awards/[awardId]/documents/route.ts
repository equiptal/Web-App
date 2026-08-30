import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/:id/awards/:awardId/documents — attach a PO, contract or supplier quotation.
 *
 * Straight onto the document storage the product already has, with the award as the owner. No new
 * table, and no URL string on the row: a file needs an id you can presign, delete and audit by, and
 * the product should have one kind of file rather than two.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; awardId: string }> }) {
  const { id, awardId } = await params;
  const body = await rawBody(req);
  const path = `/projects/${encodeURIComponent(id)}/awards/${encodeURIComponent(awardId)}/documents`;
  if (useRealApp) return relayAsRenter(path, { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
