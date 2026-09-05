import { NextResponse } from "next/server";
import { useRealApp } from "@/lib/config/env";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * `GET /api/mail-connect/status` — has this renter connected their Outlook (SUP-BE-23)?
 *
 * ⚠️ **`configured` and `connected` are two different facts.** `configured: false` means the stage
 * has no Azure app registration, so there is nothing to connect to and the panel offers nothing.
 * `connected: false` on a configured stage is an ordinary renter who has not pressed it yet. Reading
 * them as one draws a Connect button that leads to a dead end.
 *
 * Not configured locally is the same answer as a stage without a registration, so the panel behaves
 * identically in both: it offers nothing and the compose window carries on.
 */
export async function GET() {
  if (useRealApp) return relayAsRenter("/mail-connect/status");
  return NextResponse.json({ configured: false, connected: false, provider: null, accountEmail: null, connectedAt: null });
}
