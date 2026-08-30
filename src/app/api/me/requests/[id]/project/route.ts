import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/me/requests/:id/project — file a request under a site, move it, or unfile it.
 *
 * **Its own route, deliberately not `PATCH /api/me/requests/:id`.** That one is the EDIT, which the
 * app backend refuses once a request has bids and which consumes the renter's single edit
 * (`renteeEditUsed`). Filing is not an edit: it changes no value on the request, and a renter must
 * be able to organise a site long after suppliers have bid on it. Sharing a route would mean one
 * accidental merge quietly spends an edit the renter never asked to spend.
 *
 * Body: `{ projectId: string | null }`. `null` unfiles.
 *
 * Moving between sites drops the request's awards — the confirm that names what is lost lives in
 * the UI, where the renter can read it before this is called.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/requests/${encodeURIComponent(id)}`, { method: "PATCH", body });
  return NextResponse.json({ ok: true });
}
