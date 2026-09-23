import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET /api/renter-suppliers/suggestions — firms that bid on this company's requests but hold no link
 * row yet (SUP-T24).
 *
 * **Derived, never stored.** It is a join over bids and link submissions, not a table of pending
 * invitations, so a supplier who is added stops being suggested by definition rather than by a
 * cleanup nobody remembers to run.
 *
 * An empty array is the honest answer while the read does not exist: the band simply does not
 * appear, which is also what a renter with no unmatched bidders should see.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/renter-suppliers/suggestions");
  return NextResponse.json([]);
}
