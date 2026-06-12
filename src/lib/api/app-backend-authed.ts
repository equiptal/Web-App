import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/config/env";
import { authPost } from "@/lib/api/app-backend";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  localeFromRequest,
  setAccessCookie,
} from "@/lib/api/auth-server";

/**
 * SERVER-ONLY client for AUTHENTICATED Moedatech-App backend endpoints (web-app/003). Unlike the
 * unauthenticated `/auth/*` client (`app-backend.ts`), these calls act AS the signed-in renter:
 * the web-app/001 session's Cognito access token (`mt_access` cookie) is sent as `Authorization:
 * Bearer`. On a 401 (expired token) it refreshes once via `POST /auth/refresh` (the `mt_refresh`
 * cookie), retries, and re-sets the access cookie on the response. Import only from route handlers.
 */
export type AppAuthErrorKind =
  | "unauthorized" // E2000/E2001 / HTTP 401 — token missing/expired (triggers refresh)
  | "forbidden" // E2004
  | "validation" // E3000/E3004/VALIDATION_ERROR — map to field errors
  | "not_found" // E4001
  | "conflict" // E5002
  | "offline" // fetch rejected
  | "unknown";

const CODE_TO_KIND: Record<string, AppAuthErrorKind> = {
  E2000: "unauthorized",
  E2001: "unauthorized",
  E2004: "forbidden",
  E3000: "validation",
  E3004: "validation",
  VALIDATION_ERROR: "validation",
  E4001: "not_found",
  E5002: "conflict",
};

const KIND_STATUS: Record<AppAuthErrorKind, number> = {
  unauthorized: 401,
  forbidden: 403,
  validation: 400,
  not_found: 404,
  conflict: 409,
  offline: 503,
  unknown: 502,
};

export class AppAuthError extends Error {
  kind: AppAuthErrorKind;
  status: number;
  code?: string;
  detail?: string;
  messageAr?: string;
  constructor(kind: AppAuthErrorKind, opts: { status?: number; code?: string; detail?: string; messageAr?: string } = {}) {
    super(opts.detail ?? kind);
    this.name = "AppAuthError";
    this.kind = kind;
    this.status = opts.status ?? KIND_STATUS[kind];
    this.code = opts.code;
    this.detail = opts.detail;
    this.messageAr = opts.messageAr;
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string; messageAr?: string };
}

/** One authenticated call with a given access token. Throws AppAuthError (incl. `unauthorized` on 401). */
async function rawCall<T>(path: string, init: RequestInit, accessToken: string, locale: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverEnv.appApiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Tenant-Id": serverEnv.tenantId,
        "Accept-Language": locale,
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new AppAuthError("offline");
  }

  let body: Envelope<T> | undefined;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON */
  }

  if (res.status === 401) {
    throw new AppAuthError("unauthorized", { status: 401, code: body?.error?.code });
  }
  if (!res.ok || body?.success === false) {
    const code = body?.error?.code;
    const kind: AppAuthErrorKind = (code && CODE_TO_KIND[code]) || "unknown";
    throw new AppAuthError(kind, {
      status: res.status,
      code,
      detail: body?.error?.message ?? `app ${path} → HTTP ${res.status}`,
      messageAr: body?.error?.messageAr,
    });
  }
  return (body && "data" in body ? (body.data as T) : (body as unknown as T));
}

async function tryRefresh(
  refreshToken: string,
  locale: string,
): Promise<{ accessToken: string; idToken?: string; expiresIn?: number } | null> {
  try {
    return await authPost<{ accessToken: string; idToken?: string; expiresIn?: number }>(
      "/auth/refresh",
      { refreshToken },
      locale,
    );
  } catch {
    return null;
  }
}

/** A call function bound to the current (possibly refreshed) access token. */
export type AuthedCall = <T>(path: string, init?: RequestInit) => Promise<T>;

/**
 * Run an authenticated operation as the signed-in renter. `op` receives a `call(path, init)` that
 * hits the backend with the user's Bearer token; this wrapper handles the 401→refresh→retry and
 * re-sets the access cookie on the response it returns. `op` must build and return a NextResponse
 * (handling its own AppAuthError via `appAuthErrorResponse`). Returns 401 (cookies cleared) when
 * there's no usable session.
 */
export async function withAuthedBackend(
  req: Request,
  op: (call: AuthedCall) => Promise<NextResponse>,
): Promise<NextResponse> {
  const jar = await cookies();
  let access = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const locale = localeFromRequest(req);
  let refreshed: { accessToken: string; idToken?: string; expiresIn?: number } | null = null;

  // No live access token but a refresh token → refresh up-front.
  if (!access && refreshToken) {
    refreshed = await tryRefresh(refreshToken, locale);
    access = refreshed?.accessToken;
  }
  if (!access) {
    const res = NextResponse.json({ code: "unauthorized" }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }

  const call: AuthedCall = async <T>(path: string, init: RequestInit = {}) => {
    try {
      return await rawCall<T>(path, init, access as string, locale);
    } catch (err) {
      // Access token rejected mid-flight → refresh once and retry.
      if (err instanceof AppAuthError && err.kind === "unauthorized" && refreshToken && !refreshed) {
        refreshed = await tryRefresh(refreshToken, locale);
        if (!refreshed) throw err;
        access = refreshed.accessToken;
        return await rawCall<T>(path, init, access, locale);
      }
      throw err;
    }
  };

  const res = await op(call);
  if (refreshed) setAccessCookie(res, refreshed.accessToken, refreshed.expiresIn, refreshed.idToken);
  return res;
}

/** Map an AppAuthError (or anything) to a typed JSON error response the screens can read by `code`. */
export function appAuthErrorResponse(err: unknown): NextResponse {
  if (err instanceof AppAuthError) {
    const res = NextResponse.json(
      { code: err.kind, detail: err.detail, backendCode: err.code, messageAr: err.messageAr },
      { status: err.status },
    );
    if (err.kind === "unauthorized") clearAuthCookies(res);
    return res;
  }
  console.error("[app-authed] unexpected error:", err);
  return NextResponse.json({ code: "unknown" }, { status: 502 });
}
