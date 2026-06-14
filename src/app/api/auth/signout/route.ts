import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authPost } from "@/lib/api/app-backend";
import { clearAuthCookies, localeFromRequest, REFRESH_COOKIE } from "@/lib/api/auth-server";

/**
 * POST /api/auth/signout — end the session (AC-19/20).
 * Revokes the refresh token server-side (`POST /auth/logout`, best-effort) and clears all auth cookies.
 */
export async function POST(req: Request) {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await authPost("/auth/logout", { refreshToken }, localeFromRequest(req));
    } catch {
      // Best-effort: even if the backend revoke fails, we still clear local cookies below.
    }
  }
  const res = NextResponse.json({ success: true });
  clearAuthCookies(res);
  return res;
}
