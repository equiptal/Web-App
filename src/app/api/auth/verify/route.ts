import { NextResponse } from "next/server";
import { authPost } from "@/lib/api/app-backend";
import { authErrorResponse, localeFromRequest, setAuthCookies } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

interface VerifyResponse {
  user: { id: number; phone: string; tier?: string };
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

/**
 * POST /api/auth/verify — verify the OTP and start a session (AC-03/04/05/06/09/10/11/15).
 * Proxies backend `POST /auth/verify-otp`. On success sets httpOnly token cookies and returns the
 * safe `user` (incl. `tier` straight from the backend — the web reflects it, never sets it). Body:
 * { phone, code }.
 */
export async function POST(req: Request) {
  let body: { phone?: string; code?: string; otpMethod?: "SMS" | "WHATSAPP" | "EMAIL"; otpEmail?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  const code = (body.code ?? "").trim();
  if (!phone || !code) return NextResponse.json({ code: "invalid_code" }, { status: 400 });

  try {
    // Phase B: verify with the SAME channel used at request-code — the OTP + account are keyed by the
    // login identity (phone for SMS/WhatsApp, the email for EMAIL). Omitting it fails an email login.
    const data = await authPost<VerifyResponse>(
      "/auth/verify-otp",
      { phone, code, otpMethod: body.otpMethod ?? "SMS", otpEmail: body.otpEmail },
      localeFromRequest(req),
    );
    const user: RenterUser = {
      id: data.user.id,
      phone: data.user.phone,
      tier: normalizeTier(data.user.tier), // AC-04/05: reflect the mobile tier, never mutate it
    };
    const res = NextResponse.json({ user });
    setAuthCookies(res, data, user);
    return res;
  } catch (err) {
    return authErrorResponse(err);
  }
}
