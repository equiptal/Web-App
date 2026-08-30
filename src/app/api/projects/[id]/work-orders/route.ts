import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";
import { listWorkOrdersFixture } from "@/lib/projects/fixture";

export const dynamic = "force-dynamic";

/**
 * GET  /api/projects/:id/work-orders — the site's own machines, as rows sharing a group id.
 * POST /api/projects/:id/work-orders — save one order: N machines, and its awards with them.
 *
 * A work order has no row of its own — it is a group id its machines share, the same shape a
 * fanned-out RFQ already uses. The response is the machines; the caller groups them by
 * `workOrderGroupId` and reads the header from the lowest `sortOrder` (`groupWorkOrderItems`).
 *
 * **It is awarded the moment it exists**, because there was never anything to award, so the create
 * writes the machines and their awards in one call.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(`/projects/${encodeURIComponent(id)}/work-orders`);
  return NextResponse.json(listWorkOrdersFixture(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/projects/${encodeURIComponent(id)}/work-orders`, { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
