import { NextResponse } from "next/server";
import { relayToMansour } from "@/lib/api/bids-relay";
import type { BidParseResult } from "@/lib/contract/agent-bids";

/**
 * POST /api/me/bids/parse — Mansour extracts ONE uploaded supplier quote into a NormalizedBid
 * (AC-26/27). Body: { message?, attachments?: {type,filename,data(base64)}[], request_context? }.
 * Returns the BidParseResult ({ ok:true, bid } | { ok:false, reason }); a parse failure adds no bid.
 * `{ agent: false }` when Mansour is unconfigured/unreachable.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const data = await relayToMansour<BidParseResult>("parse", body);
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
