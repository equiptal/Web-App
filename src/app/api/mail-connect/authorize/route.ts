import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * `GET /api/mail-connect/authorize` — where to send the renter to grant consent (SUP-BE-23).
 *
 * ⚠️ **`returnTo` is forwarded and is checked against a host allow-list on the backend.** An
 * off-domain value is refused and the renter is left on a bare page on the API host, so this must
 * carry a real product URL. It is passed through rather than derived here because only the caller
 * knows which screen the renter was on.
 *
 * `available: false` with `reason: "NOT_CONFIGURED"` means this stage has no app registration. The
 * panel reads that as "draw no button" rather than as an error.
 */
export async function GET(req: Request) {
  const returnTo = new URL(req.url).searchParams.get("returnTo") ?? "";
  if (useRealApp) {
    const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    return relayAsRenter(`/mail-connect/authorize${q}`);
  }
  return NextResponse.json({ available: false, reason: "NOT_CONFIGURED", provider: null, url: null });
}
