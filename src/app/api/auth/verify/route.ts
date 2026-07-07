import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest, setAuthCookies } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

interface VerifyResponse {
  user: { id: number; phone: string; tier?: string; email?: string | null };
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  // Email-first NEW user: the backend verifies the email but creates NO account yet — it returns a
  // short-lived onboardingToken the web carries into the phone-add step (Modal 2). No session here.
  needsSignup?: boolean;
  onboardingToken?: string;
  email?: string | null;
}

/**
 * POST /api/auth/verify — verify the OTP and (usually) start a session (AC-03/04/05/06/09/10/11/15).
 * Proxies backend `POST /auth/verify-otp`. Accepts three identities: `{ phone }` (normal), `{ otpEmail }`
 * (email-first), or `{ onboardingToken, role }` (email-first phone-add). On a normal success it sets
 * httpOnly token cookies and returns the safe `user` (+ `storedEmail` for W-1). For an email-first NEW
 * user the backend returns `needsSignup` (no account/session) → the web collects a phone next.
 */
export async function POST(req: Request) {
  let body: { phone?: string; code?: string; otpEmail?: string; onboardingToken?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  const code = (body.code ?? "").trim();
  const otpEmail = (body.otpEmail ?? "").trim();
  const onboardingToken = (body.onboardingToken ?? "").trim();
  // Need a code plus at least one identity (phone, email, or an onboarding token).
  if ((!phone && !otpEmail && !onboardingToken) || !code) {
    return NextResponse.json({ code: "invalid_code" }, { status: 400 });
  }

  try {
    const data = await authPost<VerifyResponse>(
      "/auth/verify-otp",
      {
        ...(phone ? { phone } : {}),
        ...(otpEmail ? { otpEmail } : {}),
        ...(onboardingToken ? { onboardingToken, role: body.role } : {}),
        code,
      },
      localeFromRequest(req),
    );
    // Email-first NEW user → no account/session yet; hand the onboarding token back so the web can
    // collect a phone and finish signup (Modal 2). Do NOT set cookies.
    if (data.needsSignup) {
      return NextResponse.json({ needsSignup: true, onboardingToken: data.onboardingToken, email: data.email ?? null });
    }
    const user: RenterUser = {
      id: data.user.id,
      phone: data.user.phone,
      tier: normalizeTier(data.user.tier), // AC-04/05: reflect the mobile tier, never mutate it
    };
    // `storedEmail` is the email already ON the account (backend never overwrites it at login) — the
    // web compares it to the one typed this login to offer a keep/switch prompt (W-1). Not part of the
    // session identity (RenterUser), so it doesn't touch the mt_user cookie.
    const storedEmail = typeof data.user.email === "string" && data.user.email.trim() ? data.user.email.trim() : null;
    const res = NextResponse.json({ user, storedEmail });
    setAuthCookies(res, data, user);
    return res;
  } catch (err) {
    return authErrorResponse(err);
  }
}
