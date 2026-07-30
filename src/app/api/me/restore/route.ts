import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/me/restore — undo a self-deletion. Proxies backend `POST /users/me/restore`, which clears
 * `deletedAt`, puts `status` back to 1 and re-activates the renter's own store/listings.
 *
 * Reached from the restore prompt the code step shows when verify comes back `accountDeleted` (app
 * parity: otp_verification_page.dart's restore dialog). Authed, because the backend keys the restore
 * off the session — which is exactly why a deleted account is allowed to sign in at all.
 *
 * Backend refuses with `E12003` (409 ACCOUNT_ALREADY_DELETED's sibling) if there is nothing to
 * restore; the prompt treats any failure as "try again", never as a silent success.
 */
export async function POST(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      await call("/users/me/restore", { method: "POST" });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
