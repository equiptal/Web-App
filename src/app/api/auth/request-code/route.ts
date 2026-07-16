import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest } from "@/lib/api/auth-server";

/**
 * POST /api/auth/request-code — send an OTP (AC-01/02/06/15).
 * Proxies backend `POST /auth/login` (unified login: auto-registers an unknown number as a `rentee`
 * and sends the code in one call — so AC-06 needs no separate sign-up). Accepts `{ phone }` (SMS/Email
 * delivery), `{ otpEmail }` (email-first), or `{ onboardingToken }` (email-first phone-add: send a
 * phone OTP with NO account created yet — Modal 2). countryCode rides with the phone (E.164).
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
    const data = await authPost<{ success?: boolean; userId?: number; isNewUser?: boolean; expiresAt?: string }>(
      "/auth/login",
      {
        ...(phone ? { phone, countryCode: body.countryCode ?? "+966" } : {}),
        ...(otpEmail ? { otpEmail } : {}),
        ...(onboardingToken ? { onboardingToken } : {}), // Modal 2: send phone OTP, no account created
        otpMethod: body.otpMethod ?? (phone ? "SMS" : "EMAIL"),
        role: body.role ?? "rentee",
      },
      localeFromRequest(req),
    );
    return NextResponse.json({ success: true, isNewUser: data.isNewUser ?? false, expiresAt: data.expiresAt });
  } catch (err) {
    return authErrorResponse(err);
  }
}
