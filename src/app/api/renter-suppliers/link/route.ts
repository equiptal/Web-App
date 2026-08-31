import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * POST /api/renter-suppliers/link — link suppliers who already have Moedatech accounts.
 *
 * SUP-T12. The directory picker's write: `{ items: [{ supplierId, vendorRegistered }] }`.
 *
 * **A supplier already in the list is skipped, not an error.** A renter ticking down a directory does
 * not remember which of thirty firms he added last month, and refusing the batch because one was
 * already there would make him find it himself. The response names what was skipped so the dialog can
 * say so, and the rest are created.
 *
 * The link carries the SUPPLIER's id, never a store's — a firm can hold two shopfronts, and a row
 * pointing at one of them would follow the wrong thing when the other changed.
 */
export async function POST(req: Request) {
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter("/renter-suppliers/link", { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
