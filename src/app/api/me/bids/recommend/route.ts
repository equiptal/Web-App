import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";
import type { RecommendResult } from "@/lib/contract/agent-bids";

/**
 * POST /api/me/bids/recommend — Mansour ranks + recommends over the WEB-computed bids (AC-17–25, 34, 42).
 * Body: { request?, bids: ComputedBid[], preference?, previous_ranking? }. The renter's user_id is
 * attached server-side (drives the learned behavioral profile). Returns the RecommendResult, or
 * `{ agent: false }` when Mansour is unconfigured/unreachable so the UI keeps its deterministic sort.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  const data = await relayToMansour<RecommendResult>("recommend", { ...body, user_id });
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
