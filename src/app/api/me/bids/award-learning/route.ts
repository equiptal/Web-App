import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";
import type { AwardNudgeResult } from "@/lib/contract/agent-bids";

/**
 * POST /api/me/bids/award-learning — the post-award "make this my default" nudge (AC-24). Body either
 * { awarded, bids } (single award) or { history: [{awarded,bids}] } (cross-award pattern), plus
 * optional { confirm:true } to persist the inferred preset. user_id attached server-side.
 * Returns the AwardNudgeResult, or `{ agent:false }` when unconfigured/unreachable.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  const data = await relayToMansour<AwardNudgeResult>("award-learning", { ...body, user_id });
  if (!data) return NextResponse.json({ agent: false }, { status: 200 });
  return NextResponse.json({ agent: true, result: data }, { status: 200 });
}
