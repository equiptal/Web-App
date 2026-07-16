import { NextResponse } from "next/server";
import { relayToMansour } from "@/lib/api/bids-relay";
import type { BidTransformResult } from "@/lib/api/client";

/**
 * POST /api/me/bids/transform — Mansour extracts ONE uploaded supplier quote into a raw NormalizedBid
 * (+ compliance fields) and per-term match signals, for the renter-verify screen. Body:
 * { attachments:[{type,filename,data(base64)}], message?, request? } (request OPTIONAL → bare quote).
 * Returns { bid, term_matches, match, has_request }; `{ agent:false }` when Mansour is unreachable.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const data = await relayToMansour<BidTransformResult>("transform", body);
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
