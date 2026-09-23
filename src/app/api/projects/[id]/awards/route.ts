import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";
import { createAwardFixture } from "@/lib/projects/fixture";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/:id/awards — record who supplies how many of one line.
 *
 * The body carries `expectedVersion`, the project version the client last read. Awards live in one
 * blob on the project row, so a write replaces the whole thing: without the check, two people on one
 * site — or one person double-tapping Save — silently lose an award. A mismatch comes back **409
 * `PROJECT_VERSION_STALE`** with the current version, and the relay passes that through untouched,
 * so the client re-reads and re-applies instead of being told "something went wrong".
 *
 * Two other 409s arrive the same way and mean different things: `UNITS_EXCEED_QUANTITY` (more units
 * promised than the line holds) and `REQUEST_NOT_FILED` (an unfiled request has no project to hold
 * an award, so the UI opens the project picker rather than showing an error).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/projects/${encodeURIComponent(id)}/awards`, { method: "POST", body });

  const result = createAwardFixture(id, JSON.parse(body ?? "{}"));
  if (!result.ok) return NextResponse.json({ code: result.code, details: result.details }, { status: result.status });
  return NextResponse.json({ award: result.award, version: result.version }, { status: 201 });
}
