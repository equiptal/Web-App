import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";
import { listProjectsFixture, createProjectFixture } from "@/lib/projects/fixture";

// A renter who just created a site must see it. Nothing here may be statically cached.
export const dynamic = "force-dynamic";

/**
 * GET  /api/projects — the renter's sites, with the roll-up each card shows.
 * POST /api/projects — create one.
 *
 * Real: relays to `/agents/projects` as the signed-in renter (see `agents-relay.ts` for why these
 * routes keep no test-user fallback). Otherwise the in-memory fixture.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/projects");
  return NextResponse.json(listProjectsFixture());
}

export async function POST(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/projects", { method: "POST", body });
  return NextResponse.json(createProjectFixture(JSON.parse(body ?? "{}")), { status: 201 });
}
