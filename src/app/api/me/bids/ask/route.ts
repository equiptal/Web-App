import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";
import type { BidAskResult } from "@/lib/contract/agent-bids";

/**
 * POST /api/me/bids/ask — the conversational "Ask your assistant" chat. Body: { message, request?,
 * bids: ComputedBid[], current_ranking? }. The renter's user_id is attached server-side. Returns the
 * LLM reply + the (possibly re-ranked) ranking/pick so the web can re-render the table. `{ agent:false }`
 * when the agent is unconfigured/unreachable so the UI degrades gracefully.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  const data = await relayToMansour<BidAskResult>("ask", { ...body, user_id });
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
