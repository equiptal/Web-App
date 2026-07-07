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
}

/**
 * POST /api/auth/verify — verify the OTP and start a session (AC-03/04/05/06/09/10/11/15).
 * Proxies backend `POST /auth/verify-otp`. On success sets httpOnly token cookies and returns the
 * safe `user` (incl. `tier` straight from the backend — the web reflects it, never sets it). Body:
 * { phone, code }.
 */
export async function POST(req: Request) {
  let body: { phone?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const phone = (body.phone ?? "").trim();
  const code = (body.code ?? "").trim();
  if (!phone || !code) return NextResponse.json({ code: "invalid_code" }, { status: 400 });

  try {
    const data = await authPost<VerifyResponse>("/auth/verify-otp", { phone, code }, localeFromRequest(req));
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
