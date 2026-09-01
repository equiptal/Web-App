import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET    /api/renter-suppliers/groups — every group in the company's list, with its count.
 * PATCH  /api/renter-suppliers/groups — rename one across every row that carries it.
 * DELETE /api/renter-suppliers/groups?name=… — remove the label. **Never a supplier.**
 *
 * SUP-T12. A group is a flat label on the row, not a table: a group with no members does not exist,
 * and there is nothing to create — it comes into being when the first supplier is given it.
 *
 * **Delete is the one worth being careful about.** The word sits next to a list of companies, and a
 * renter has every reason to fear it. The response says how many rows lost the label, so the
 * confirmation can be specific — the suppliers stay, they simply end up ungrouped.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/renter-suppliers/groups");
  return NextResponse.json([]);
}

export async function PATCH(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/renter-suppliers/groups", { method: "PATCH", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

/**
 * The name is a PATH segment, not a query parameter.
 *
 * ⚠️ It was a query, and the backend never had that route — `agents-contract.test.ts` had it waived
 * as `DELETE /agents/renter-suppliers/groups`, so deleting a group 404'd and the renter read it as
 * "it broke" (found 2026-09-01, against the backend's own delivery note §3.7).
 *
 * Percent-encoded, because group names hold spaces and Arabic.
 */
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  if (!name.trim()) return NextResponse.json({ code: "group_name_required" }, { status: 400 });
  if (useRealApp) return relayAsRenter(`/renter-suppliers/groups/${encodeURIComponent(name)}`, { method: "DELETE" });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
