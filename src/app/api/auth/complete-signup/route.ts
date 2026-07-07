import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest, setAuthCookies } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

interface CompleteSignupResponse {
  user: { id: number; phone: string; tier?: string; email?: string | null };
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

/**
 * POST /api/auth/complete-signup — create the email-first account ATOMICALLY (Modal 2c).
 * Proxies backend `POST /auth/complete-signup`. Takes the phone✓ `onboardingToken` (from the Modal-2b
 * verify) + the full profile, and creates the account (phone + email-from-token + profile) in ONE
 * transaction, returning a session. Nothing is written before this call — an abandoned signup leaves
 * no account (no false "phone already exists"). Guarded: `PHONE_NOT_VERIFIED` (E4003) if the token
 * isn't phone-verified; `PHONE_ALREADY_EXISTS`/`EMAIL_ALREADY_EXISTS` on collision.
 */
export async function POST(req: Request) {
  let body: {
    onboardingToken?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    jobTitle?: string;
    companyName?: string;
    whatsapp?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const onboardingToken = s(body.onboardingToken);
  if (!onboardingToken) return NextResponse.json({ code: "phone_not_verified" }, { status: 400 });

  try {
    const data = await authPost<CompleteSignupResponse>(
      "/auth/complete-signup",
      {
        onboardingToken,
        firstName: s(body.firstName),
        lastName: s(body.lastName),
        city: s(body.city),
        jobTitle: s(body.jobTitle),
        ...(s(body.companyName) ? { companyName: s(body.companyName) } : {}),
        ...(s(body.whatsapp) ? { whatsapp: s(body.whatsapp) } : {}),
        role: "rentee",
      },
      localeFromRequest(req),
    );
    const user: RenterUser = {
      id: data.user.id,
      phone: data.user.phone,
      tier: normalizeTier(data.user.tier),
    };
    const res = NextResponse.json({ ok: true, user });
    setAuthCookies(res, data, user);
    return res;
  } catch (err) {
    return authErrorResponse(err);
  }
}
