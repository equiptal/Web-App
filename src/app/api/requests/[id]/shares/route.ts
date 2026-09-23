import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * `/api/requests/{id}/shares` — the record of who a request was declared sent to.
 *
 * SUP-T41 / SUP-BE-14. `id` may be a fanned group's key or a single request's id; the backend takes
 * either and records the group's own key, which is what the renter actually shared.
 *
 * **Declared, not observed.** The renter's mail client sends the message, so this says who he chose
 * to send it to — not who received it and not who opened it. Every recipient of one request gets the
 * SAME link, so the public bid page sees a visit but never whose.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/requests/${encodeURIComponent(id)}/shares`, { method: "POST", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(`/requests/${encodeURIComponent(id)}/shares`);
  return NextResponse.json({ shares: [] });
}
