import { NextResponse } from "next/server";
import { AuthError, type AuthErrorKind } from "@/lib/api/app-backend";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * SERVER-ONLY helpers for the auth route handlers (web-app/001): httpOnly token cookies, request
 * locale, and a typed error→response mapper. Import only from route handlers.
 *
 * Session model: the access token (~1h) gates a live session; the refresh token (~30 days) is the
 * "remembered" envelope (AC-18). `mt_user` carries the safe identity so `/api/auth/session` can
 * rehydrate it across an access-token refresh (the backend's `/auth/refresh` returns tokens only).
 */
export const ACCESS_COOKIE = "mt_access";
export const REFRESH_COOKIE = "mt_refresh";
export const ID_COOKIE = "mt_id";
export const USER_COOKIE = "mt_user";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const baseCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

interface Tokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
}

/** Set all auth cookies after a successful verify (AC-18: refresh cookie carries the 30-day window). */
export function setAuthCookies(res: NextResponse, tokens: Tokens, user: RenterUser): void {
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...baseCookie, maxAge: tokens.expiresIn ?? 3600 });
  if (tokens.refreshToken) res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, { ...baseCookie, maxAge: THIRTY_DAYS });
  if (tokens.idToken) res.cookies.set(ID_COOKIE, tokens.idToken, { ...baseCookie, maxAge: THIRTY_DAYS });
  res.cookies.set(USER_COOKIE, JSON.stringify(user), { ...baseCookie, maxAge: THIRTY_DAYS });
}

/**
 * Set a mobile→web HANDOFF session (mobile/017 AC-08): the carried Cognito idToken is both the
 * Bearer (`mt_id`, used by the authed backend client) and the access cookie, plus the safe identity.
 * No refresh token — so the cookies expire WITH the token (~1h); once it lapses the gate fails and
 * the renter is sent to normal sign-in (rather than being let in with a dead token).
 */
export function setHandoffSession(res: NextResponse, idToken: string, user: RenterUser, ttlSeconds = 3600): void {
  res.cookies.set(ACCESS_COOKIE, idToken, { ...baseCookie, maxAge: ttlSeconds });
  res.cookies.set(ID_COOKIE, idToken, { ...baseCookie, maxAge: ttlSeconds });
  res.cookies.set(USER_COOKIE, JSON.stringify(user), { ...baseCookie, maxAge: ttlSeconds });
}

/** Refresh just the access (and optionally id) cookie after `/auth/refresh` (AC-17). */
export function setAccessCookie(res: NextResponse, accessToken: string, expiresIn?: number, idToken?: string): void {
  res.cookies.set(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: expiresIn ?? 3600 });
  if (idToken) res.cookies.set(ID_COOKIE, idToken, { ...baseCookie, maxAge: THIRTY_DAYS });
}

/** Refresh the `mt_user` identity cookie (e.g. after a profile-complete flips tier guest→basic). */
export function setUserCookie(res: NextResponse, user: RenterUser): void {
  res.cookies.set(USER_COOKIE, JSON.stringify(user), { ...baseCookie, maxAge: THIRTY_DAYS });
}

/** Clear all auth cookies on sign-out / failed refresh (AC-19/20). */
export function clearAuthCookies(res: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, ID_COOKIE, USER_COOKIE]) {
    res.cookies.set(name, "", { ...baseCookie, maxAge: 0 });
  }
}

/** Forward the renter's language to the backend `Accept-Language` (en/ar). */
export function localeFromRequest(req: Request): string {
  const header = req.headers.get("accept-language") ?? "";
  return header.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** HTTP status for each auth error kind. */
const KIND_STATUS: Record<AuthErrorKind, number> = {
  invalid_phone: 400,
  invalid_code: 400,
  expired: 410,
  locked: 423,
  send_failed: 502,
  email_ambiguous: 409,
  email_taken: 409,
  phone_taken: 409,
  offline: 503,
  not_configured: 500,
  unknown: 502,
};

/** Map a thrown AuthError (or anything) to a typed JSON error response the screens can read by `code`. */
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json(
      { code: err.kind, detail: err.message, backendCode: err.code },
      { status: KIND_STATUS[err.kind] ?? 502 },
    );
  }
  console.error("[auth] unexpected error:", err);
  return NextResponse.json({ code: "unknown" }, { status: 502 });
}
