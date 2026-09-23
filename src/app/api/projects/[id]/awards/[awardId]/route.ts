import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";
import { patchAwardFixture, deleteAwardFixture } from "@/lib/projects/fixture";

export const dynamic = "force-dynamic";

/**
 * PATCH · DELETE /api/projects/:id/awards/:awardId
 *
 * `PATCH` sets the two marks: `{ expectedVersion, mobilizedAt }`, or `null` to undo. They are
 * ordinary dates — no state machine, no ordering rule between them — because *when* is the only
 * thing a timeline can draw, and the only thing worth comparing against the agreed date.
 *
 * `DELETE` (un-award) is never refused, including with documents attached: its papers and marks go
 * with it. The confirm that names them lives in the UI, where a renter can read it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; awardId: string }> }) {
  const { id, awardId } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(AWARD(id, awardId), { method: "PATCH", body });

  const result = patchAwardFixture(id, awardId, JSON.parse(body ?? "{}"));
  if (!result.ok) return NextResponse.json({ code: result.code, details: result.details }, { status: result.status });
  return NextResponse.json({ award: result.award, version: result.version });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; awardId: string }> }) {
  const { id, awardId } = await params;
  // The version rides in the query on a DELETE (no body), so it has to be carried across explicitly
  // — dropping it here would turn every un-award into an unchecked write.
  const expected = new URL(req.url).searchParams.get("expectedVersion");
  const path = AWARD(id, awardId) + (expected ? `?expectedVersion=${encodeURIComponent(expected)}` : "");
  if (useRealApp) return relayAsRenter(path, { method: "DELETE" });

  const result = deleteAwardFixture(id, awardId);
  if (!result.ok) return NextResponse.json({ code: result.code }, { status: result.status });
  return NextResponse.json({ ok: true, version: result.version });
}

const AWARD = (id: string, awardId: string) =>
  `/projects/${encodeURIComponent(id)}/awards/${encodeURIComponent(awardId)}`;
