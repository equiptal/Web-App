import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";

/**
 * POST /api/me/bids/preferences — save the renter's ranking preference to their profile (AC-22).
 * Body: { preset, require_supplier?, free_text? }. user_id attached server-side. Durable once the
 * agent's migration 0016 lands (in-memory until then). `{ ok:false }` when unconfigured / no user.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  if (!user_id) return NextResponse.json({ ok: false, reason: "no-session" }, { status: 200 });
  const data = await relayToMansour<unknown>("preferences", { ...body, user_id });
  return NextResponse.json({ ok: data != null, result: data ?? null }, { status: 200 });
}
