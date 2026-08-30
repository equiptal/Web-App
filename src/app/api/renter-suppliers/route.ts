import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET /api/renter-suppliers — the renter's own supplier list, for the award picker.
 *
 * **Another feature owns this**, and it ships before projects reach production. We build the one
 * read and no writes: no management screen, and no upsert when a bid is accepted.
 *
 * While it does not answer, an empty list is returned rather than an error, and the award dialog
 * falls back to a typed supplier name. That is a development condition, not a product mode — which
 * is why an award always stores `supplierName`, even when it has a supplier id.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/renter-suppliers");
  return NextResponse.json([]);
}
