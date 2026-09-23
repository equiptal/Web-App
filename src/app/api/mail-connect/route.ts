import { useRealApp } from "@/lib/config/env";
import { NextResponse } from "next/server";
import { relayAsRenter } from "@/lib/api/agents-relay";

export const dynamic = "force-dynamic";

/**
 * `DELETE /api/mail-connect` — forget the Outlook token we hold for this renter (SUP-BE-23).
 *
 * ⚠️ **Not a revocation, and the UI must never word it as one.** This deletes OUR copy. The grant
 * itself lives in the renter's Microsoft account and only the renter can withdraw it there, which is
 * why the backend answers `revokedAtProvider: false` rather than claiming otherwise.
 */
export async function DELETE() {
  if (useRealApp) return relayAsRenter("/mail-connect", { method: "DELETE" });
  return NextResponse.json({ connected: false, revokedAtProvider: false });
}
