import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { clearAuthCookies } from "@/lib/api/auth-server";

/**
 * POST /api/me/profile/verify-phone-change — verify the OTP and switch the account phone (app parity,
 * `POST /profile/verify-phone-change`, verifyPhoneChangeSchema / requireTier basic). Body:
 * { newPhone, otp }. The backend returns `requireReLogin: true` — the phone (identity) changed, so the
 * current session tokens no longer match. We CLEAR the auth cookies on the response; the client then
 * redirects to /login to re-authenticate with the new number.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const newPhone = typeof body.newPhone === "string" ? body.newPhone.trim() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ message?: string; messageAr?: string; requireReLogin?: boolean }>(
        "/profile/verify-phone-change",
        { method: "POST", body: JSON.stringify({ newPhone, otp }) },
      );
      const res = NextResponse.json({ ok: true, requireReLogin: data.requireReLogin !== false, ...data });
      // Identity changed → the session no longer matches. Drop cookies so the client re-logs in.
      clearAuthCookies(res);
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
