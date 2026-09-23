import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET · PATCH · DELETE /api/work-orders/:groupId
 *
 * `:groupId` is the shared `workOrderGroupId`, not a row id — there is no work-order row to fetch.
 *
 * Two backend rules are worth knowing here, because a UI that breaks either loses a renter's data
 * silently:
 *
 *  - **Header fields write to every machine in the group.** Title, period and the project pin are
 *    duplicated across the rows, so a change to "the work order" is a change to all of them.
 *  - **Machines are upserted by id.** Sending the set without ids recreates them, and every award,
 *    mark and purchase order keyed to the old ids is scrubbed — because the renter renamed a
 *    machine. Always send the id of a machine that already exists.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (useRealApp) return relayAsRenter(GROUP(groupId));
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(GROUP(groupId), { method: "PATCH", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (useRealApp) return relayAsRenter(GROUP(groupId), { method: "DELETE" });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

const GROUP = (groupId: string) => `/work-orders/${encodeURIComponent(groupId)}`;
