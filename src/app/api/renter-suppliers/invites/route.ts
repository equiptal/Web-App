import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/renter-suppliers/invites — record an invitation to join Moedatech.
 *
 * SUP-T42 / SUP-BE-15. The same record as a share with `kind: "invite"` and no request id, which is
 * why it has a route of its own: there is nothing to hang it under.
 *
 * `{ renterSupplierIds: string[], channel: "email" | "whatsapp" }`. An id the caller does not own is
 * filtered out rather than failing the batch, and the response says how many landed — so a renter
 * whose colleague deleted a row mid-flow still gets his other four recorded.
 */
export async function POST(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/renter-suppliers/invites", { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
