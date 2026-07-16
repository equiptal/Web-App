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
  // Email-first NEW user (Modal 1 email verify): backend verifies the email, creates NO account, and
  // returns a short-lived onboardingToken the web carries into Modal 2. No session here.
  needsSignup?: boolean;
  // Email-first phone verify (Modal 2b): backend verifies the phone against the onboardingToken and
  // returns a NEW token carrying `phone ✓`. Still creates NOTHING — the account is made at complete-signup.
  phoneVerified?: boolean;
  onboardingToken?: string;
  email?: string | null;
}

/**
 * POST /api/auth/verify — verify an OTP. Proxies backend `POST /auth/verify-otp`. Three identities:
 * `{ phone }` / `{ otpEmail }` (Modal 1), or `{ onboardingToken, phone }` (Modal 2b — verify the phone
 * for an email-first signup). **Verify ≠ create:**
 *  - normal phone/email of an existing (or new-phone) account → session set, returns `user` (+ storedEmail, W-1).
 *  - new email → `needsSignup` + onboardingToken (no session).
 *  - Modal 2b phone verify → `{ phoneVerified, onboardingToken }` (no session, no account) — the web
 *    threads that phone✓ token into `/api/auth/complete-signup`.
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
        ...(onboardingToken ? { onboardingToken } : {}),
        code,
      },
      localeFromRequest(req),
    );
    // Modal 2b — phone verified against the onboarding token: hand back the phone✓ token, NO session.
    if (data.phoneVerified) {
      return NextResponse.json({ phoneVerified: true, onboardingToken: data.onboardingToken });
    }
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
