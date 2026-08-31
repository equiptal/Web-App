import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * GET    /api/renter-suppliers/:id — the profile: the row, its bids, its awards, what was sent.
 * PATCH  /api/renter-suppliers/:id — the vendor flag, the contact the renter keeps, the groups.
 * DELETE /api/renter-suppliers/:id — the LINK, and only the link.
 *
 * SUP-T12. `id` is the LINK's id, never the supplier's — two renters hold two different rows for the
 * same firm, and neither can address the other's.
 *
 * ── PATCH is idempotent by contract ──────────────────────────────────────────────────────────────
 *
 * The vendor toggle is optimistic: it flips on click and the request follows. A renter who taps twice
 * sends two writes, and the second must not be an error — it is the same fact stated again.
 *
 * ── DELETE says what it did NOT do ───────────────────────────────────────────────────────────────
 *
 * Removing a link removes the renter's flag, groups and notes. The supplier's account, their store,
 * the bids they sent and the awards they won all stay. The response carries those counts so the
 * confirmation can say so in the renter's own numbers rather than a generic reassurance.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(`/renter-suppliers/${encodeURIComponent(id)}`);
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/renter-suppliers/${encodeURIComponent(id)}`, { method: "PATCH", body });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (useRealApp) return relayAsRenter(`/renter-suppliers/${encodeURIComponent(id)}`, { method: "DELETE" });
  return NextResponse.json({ code: "not_configured" }, { status: 503 });
}
