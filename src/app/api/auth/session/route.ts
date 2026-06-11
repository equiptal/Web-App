import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authPost } from "@/lib/api/app-backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  USER_COOKIE,
  clearAuthCookies,
  localeFromRequest,
  setAccessCookie,
} from "@/lib/api/auth-server";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * GET /api/auth/session — the gate/hydration read (AC-16/17/18).
 * Returns `{ user }` for a live session, refreshing the access token from the refresh cookie when
 * it has lapsed (within the 30-day window); returns `{ user: null }` once the refresh token is gone
 * (≥30 days or signed out).
 */
export async function GET(req: Request) {
  const jar = await cookies();

  const userRaw = jar.get(USER_COOKIE)?.value;
  if (!userRaw) return NextResponse.json({ user: null });

  let user: RenterUser;
  try {
    user = JSON.parse(userRaw) as RenterUser;
  } catch {
    const res = NextResponse.json({ user: null });
    clearAuthCookies(res);
    return res;
  }

  // Access token still live → authenticated, no refresh needed (AC-17).
  if (jar.get(ACCESS_COOKIE)?.value) {
    return NextResponse.json({ user });
  }

  // Access lapsed: refresh from the 30-day refresh token (AC-18).
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    const res = NextResponse.json({ user: null });
    clearAuthCookies(res);
    return res;
  }

  try {
    const data = await authPost<{ accessToken: string; idToken?: string; expiresIn?: number }>(
      "/auth/refresh",
      { refreshToken },
      localeFromRequest(req),
    );
    const res = NextResponse.json({ user });
    setAccessCookie(res, data.accessToken, data.expiresIn, data.idToken);
    return res;
  } catch {
    // Refresh token expired/revoked → fully signed out.
    const res = NextResponse.json({ user: null });
    clearAuthCookies(res);
    return res;
  }
}
