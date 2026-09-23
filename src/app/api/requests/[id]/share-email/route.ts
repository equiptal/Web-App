import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter, rawBody } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * `/api/requests/{id}/share-email` — SUP-BE-23. **We put the message on the wire, as the renter.**
 *
 * Everything else in this feature opens the renter's own compose window with a URL, and a query
 * string is characters with no MIME type. That one fact is why the body could only ever be text — so
 * Gmail builds no card — and why Outlook silently discards `bcc`. Both symptoms, one cause: nothing
 * client-side can hand a mail server an HTML part. This route can.
 *
 * ⚠️ **A domain we cannot yet send as answers 200 with `sent: false`, not an error**, and the panel
 * falls back to the compose window on that FIELD rather than on a status code. A 4xx here would make
 * "your IT has not added the records yet" indistinguishable from "your request is malformed", and
 * the client would have to guess which by reading an error string.
 *
 * ⚠️ The recipients are NOT sent from here. The backend derives them from the supplier rows this
 * renter owns — see `addressesFor` in `handlers/agents/requests/shareEmail.ts`. Once a domain is
 * verified this endpoint can put a real company's address in a `From` line, so a caller-supplied
 * list would be an open relay signed with that company's DKIM.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await rawBody(req);
  if (useRealApp) return relayAsRenter(`/requests/${encodeURIComponent(id)}/share-email`, { method: "POST", body });
  // Not wired up locally: say so as a refusal to send, which is the same shape as an unverified
  // domain — so the panel opens the compose window and the renter's share still goes out.
  return NextResponse.json({ sent: false, reason: "UNAVAILABLE", dns: [] });
}
