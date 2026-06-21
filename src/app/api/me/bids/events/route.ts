import { NextResponse } from "next/server";
import { relayToMansour, userIdFromRequest } from "@/lib/api/bids-relay";

/**
 * POST /api/me/bids/events — capture renter actions on the comparison page (award/choice/chat) for
 * learning. Body: { events: BidEventInput[] }. user_id attached server-side. Fire-and-forget: always
 * returns ok so a capture failure never disrupts the UI.
 */
export async function POST(req: Request) {
  let body: { events?: unknown[] } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const user_id = userIdFromRequest(req);
  if (!user_id || !Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
  const data = await relayToMansour<unknown>("events", { user_id, events: body.events });
  return NextResponse.json({ ok: data != null }, { status: 200 });
}
