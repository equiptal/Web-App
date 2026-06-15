import { NextResponse } from "next/server";
import { fetchMeWithToken } from "@/lib/api/app-backend-authed";
import { setHandoffSession, localeFromRequest } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

/**
 * GET /api/auth/handoff?token=<idToken> — mobile→web sign-in handoff (mobile/017 AC-08).
 *
 * The mobile app's "Continue on web app" opens `<web>/?handoff=<idToken>`; middleware forwards the
 * carried Cognito idToken here. We validate it against the backend (`GET /users/me` as that token —
 * a forged token 401s and never establishes a session), then set the session cookies so the renter
 * opens already authenticated, and land on a FRESH RFQ from page 1 (`?new=1`). The in-progress
 * mobile request is untouched (it lives on the device; the web carries only the session, not a draft).
 *
 * The handoff carries only the idToken (no refresh token), so the web session lasts the idToken's
 * lifetime (~1h); after that the renter signs in again. `mt_id` is the Bearer the authed backend
 * client already uses, so the token drops straight into the existing session model.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const loginUrl = new URL("/login", url.origin);

  if (!token) return NextResponse.redirect(loginUrl);

  try {
    const me = await fetchMeWithToken(token, localeFromRequest(req));
    const user: RenterUser = { id: me.id, phone: me.phone, tier: normalizeTier(me.tier) };
    const res = NextResponse.redirect(new URL("/create?new=1", url.origin));
    setHandoffSession(res, token, user);
    return res;
  } catch {
    // Invalid/expired carried token → fall back to normal sign-in.
    return NextResponse.redirect(loginUrl);
  }
}
