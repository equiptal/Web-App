import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest } from "@/lib/api/auth-server";

/**
 * POST /api/auth/resend — resend the OTP with no cooldown (AC-12).
 * Proxies backend `POST /auth/resend-otp`. Body: { phone }.
 */
export async function POST(req: Request) {
  let body: { phone?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  if (!phone) return NextResponse.json({ code: "invalid_phone" }, { status: 400 });

  try {
    const data = await authPost<{ success?: boolean; expiresAt?: string }>(
      "/auth/resend-otp",
      { phone, countryCode: "+966", otpMethod: "SMS" },
      localeFromRequest(req),
    );
    return NextResponse.json({ success: true, expiresAt: data.expiresAt });
  } catch (err) {
    return authErrorResponse(err);
  }
}
