import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest } from "@/lib/api/auth-server";

/**
 * POST /api/auth/request-code — send an OTP (AC-01/02/06/15).
 * Proxies backend `POST /auth/login` (unified login: auto-registers an unknown number as a `rentee`
 * and sends the code in one call — so AC-06 needs no separate sign-up). Body: { phone }.
 */
export async function POST(req: Request) {
  let body: { phone?: string; otpMethod?: "SMS" | "WHATSAPP" | "EMAIL"; otpEmail?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  if (!phone) return NextResponse.json({ code: "invalid_phone" }, { status: 400 });

  try {
    const data = await authPost<{ success?: boolean; userId?: number; isNewUser?: boolean; expiresAt?: string }>(
      "/auth/login",
      // Delivery channel chosen in the UI; EMAIL carries otpEmail (phone stays the account identity).
      { phone, countryCode: "+966", otpMethod: body.otpMethod ?? "SMS", otpEmail: body.otpEmail, role: "rentee" },
      localeFromRequest(req),
    );
    return NextResponse.json({ success: true, isNewUser: data.isNewUser ?? false, expiresAt: data.expiresAt });
  } catch (err) {
    return authErrorResponse(err);
  }
}
