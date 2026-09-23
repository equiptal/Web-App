import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";

/**
 * GET /api/support/intercom — who the messenger should say this person is.
 *
 * Two jobs, and both of them have to happen on the server.
 *
 * **The signature.** Intercom's identity verification is an HMAC-SHA256 of the user id under the
 * workspace's secret, and it exists precisely so a browser cannot claim to be someone else — a
 * messenger booted with a bare `user_id` will happily accept any id the page hands it. So the secret
 * never reaches the client, and neither does the choice of WHICH id gets signed: the subject is
 * `me.id` as the backend just reported it, not a value posted in from the page and not the id inside
 * the session cookie. Signing a client-supplied id would rebuild the hole the hash closes.
 *
 * **The name and the address.** The web session is `{ id, phone, tier }`, so the messenger has been
 * introducing everyone as «User 42» with a phone-derived email. The real name, email and company are
 * on `GET /users/me`, which needs the renter's own token — so it is read here and handed down with
 * the signature in one call rather than making the widget fan out to two.
 *
 * Verification is OPTIONAL and off until configured. `INTERCOM_IDENTITY_SECRET` unset answers
 * `userHash: null` with `verified: false`, which is the state the mobile app runs in today — it calls
 * `loginIdentifiedUser` with no hash at all, so the workspace cannot have it enforced for mobile. Web
 * is a separate switch in the same dashboard, and this way the web works whichever way that switch is
 * set: unsigned while it is off, signed the moment the secret lands, with no code change either way.
 */
interface BackendMe {
  id: number;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  companyName?: string | null;
  supplierProfile?: { companyName?: string | null } | null;
}

export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    const me = await call<BackendMe>("/users/me");
    const userId = String(me.id);
    const secret = process.env.INTERCOM_IDENTITY_SECRET ?? "";
    const name = [me.firstName, me.lastName].filter(Boolean).join(" ").trim();

    return NextResponse.json({
      userId,
      name: name || null,
      email: me.email ?? null,
      phone: me.phone ?? null,
      company: me.companyName ?? me.supplierProfile?.companyName ?? null,
      // Hex, and over the id alone — Intercom's own rule. Never logged: the digest is a credential
      // for this identity, and a support conversation is not the place to leak one.
      userHash: secret ? createHmac("sha256", secret).update(userId).digest("hex") : null,
      verified: Boolean(secret),
    });
  });
}
