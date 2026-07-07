import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest } from "@/lib/api/auth-server";

/**
 * POST /api/auth/resend — resend the OTP with no cooldown (AC-12).
 * Proxies backend `POST /auth/resend-otp`. Mirrors request-code: resends over the SAME identity the
 * code was first sent on — `{ phone }`, `{ otpEmail }` (email-first), or `{ onboardingToken }` (Modal 2).
 */
export async function POST(req: Request) {
  let body: { phone?: string; countryCode?: string; otpMethod?: "SMS" | "WHATSAPP" | "EMAIL"; otpEmail?: string; onboardingToken?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  const otpEmail = (body.otpEmail ?? "").trim();
  const onboardingToken = (body.onboardingToken ?? "").trim();
  if (!phone && !otpEmail && !onboardingToken) return NextResponse.json({ code: "invalid_phone" }, { status: 400 });

  try {
    const data = await authPost<{ success?: boolean; expiresAt?: string }>(
      "/auth/resend-otp",
      // The live backend's resend schema requires `role` (the docs omitted it) — same as login.
      {
        ...(phone ? { phone, countryCode: body.countryCode ?? "+966" } : {}),
        ...(otpEmail ? { otpEmail } : {}),
        ...(onboardingToken ? { onboardingToken } : {}),
        otpMethod: body.otpMethod ?? (phone ? "SMS" : "EMAIL"),
        role: body.role ?? "rentee",
      },
      localeFromRequest(req),
    );
    return NextResponse.json({ success: true, expiresAt: data.expiresAt });
  } catch (err) {
    return authErrorResponse(err);
  }
}
