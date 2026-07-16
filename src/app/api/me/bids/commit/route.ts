import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";
import type { NormalizedBid } from "@/lib/contract/agent-bids";

/**
 * POST /api/me/bids/commit — the renter-verified draft → a comparison-ready bid. Body:
 * { source_file, extracted: NormalizedBid, corrected: NormalizedBid, vat_mode }. The renter's user_id is
 * attached server-side (feeds the learn-on-feed loop). Mansour strips 15% VAT (incl→excl) and records a
 * correction only when corrected ≠ extracted. Returns { bid, changed }; `{ agent:false }` on a miss.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  const data = await relayToMansour<{ bid: NormalizedBid; changed: boolean }>("commit", { ...body, user_id });
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
