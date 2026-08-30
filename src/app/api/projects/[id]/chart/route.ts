import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";
import { chartFixture } from "@/lib/projects/fixture";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/:id/chart — everything the site's timeline draws, in ONE call.
 *
 * One call on purpose: the chart is a union of the project's requests, its work-order machines and
 * the awards held on the project row. Assembling it from three fetches in the browser means three
 * chances to half-load, and a renter reading a partial site cannot tell that is what they have.
 *
 * The response carries `version`, which every award write sends back.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(`/projects/${encodeURIComponent(id)}/chart`);
  const chart = chartFixture(id);
  return chart ? NextResponse.json(chart) : NextResponse.json({ code: "not_found" }, { status: 404 });
}
