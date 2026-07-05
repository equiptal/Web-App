import { serverEnv } from "@/lib/config/env";

/**
 * SERVER-ONLY client for the Moedatech-App backend `/auth/*` endpoints — the same Cognito-backed
 * phone+OTP flow the mobile app uses (web-app/001). Import only from route handlers. The backend
 * wraps responses in `{ success, data }` (and errors in `{ success:false, error:{ code, message } }`),
 * matching `agents-backend.ts`.
 */

/** Auth error kinds the sign-in UI distinguishes — derived from the backend's auth error codes. */
export type AuthErrorKind =
  | "invalid_phone" // E3004 — bad phone format (AC-01)
  | "invalid_code" // E6000 — wrong OTP (AC-09)
  | "expired" // E6001 — OTP older than 5 min (AC-11)
  | "locked" // E6002 — 5-attempt lockout (AC-10)
  | "send_failed" // E6003 — SMS could not be sent (AC-15)
  | "phone_exists" // PHONE_ALREADY_EXISTS (409) — EMAIL login but the phone is on another account
  | "offline" // fetch rejected — no connectivity (AC-24)
  | "not_configured" // APP_API_URL missing
  | "unknown";

/**
 * Backend auth error code → UI kind. Codes from apps/backend/docs/auth.md, plus the live backend's
 * generic `VALIDATION_ERROR` (the validation middleware returns this for a malformed phone on
 * /auth/login & /auth/resend-otp — the only validated field there — which the docs labelled E3004).
 */
const CODE_TO_KIND: Record<string, AuthErrorKind> = {
  E3004: "invalid_phone",
  VALIDATION_ERROR: "invalid_phone",
  E6000: "invalid_code",
  E6001: "expired",
  E6002: "locked",
  E6003: "send_failed",
  // Phase B: an EMAIL login whose phone already belongs to another account (backend won't hijack it).
  PHONE_ALREADY_EXISTS: "phone_exists",
};

/** Carries the mapped kind plus the backend status/code/message so handlers can surface detail. */
export class AuthError extends Error {
  kind: AuthErrorKind;
  status: number;
  code?: string;
  messageAr?: string;
  constructor(
    kind: AuthErrorKind,
    opts: { status?: number; code?: string; message?: string; messageAr?: string } = {},
  ) {
    super(opts.message ?? kind);
    this.name = "AuthError";
    this.kind = kind;
    this.status = opts.status ?? 0;
    this.code = opts.code;
    this.messageAr = opts.messageAr;
  }
}

interface BackendEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string; messageAr?: string };
}

async function authFetch<T>(path: string, init: RequestInit, locale?: string): Promise<T> {
  if (!serverEnv.appApiUrl) {
    throw new AuthError("not_configured", { message: "APP_API_URL not configured" });
  }

  let res: Response;
  try {
    res = await fetch(`${serverEnv.appApiUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": serverEnv.tenantId,
        ...(locale ? { "Accept-Language": locale } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
  } catch {
    // Network/DNS failure reaching the backend — treated as offline (AC-24).
    throw new AuthError("offline");
  }

  let body: BackendEnvelope<T> | undefined;
  try {
    body = (await res.json()) as BackendEnvelope<T>;
  } catch {
    /* non-JSON body (e.g. gateway error) */
  }

  if (!res.ok || body?.success === false) {
    const code = body?.error?.code;
    // AC-09/10/11/15: map the backend's auth code to a UI kind; no extra throttle is applied (AC-14).
    const kind: AuthErrorKind = (code && CODE_TO_KIND[code]) || "unknown";
    throw new AuthError(kind, {
      status: res.status,
      code,
      message: body?.error?.message ?? `auth ${path} → HTTP ${res.status}`,
      messageAr: body?.error?.messageAr,
    });
  }

  // Unwrap the `{ success, data }` envelope when present.
  return (body && "data" in body ? (body.data as T) : (body as unknown as T));
}

export const authPost = <T>(path: string, payload: unknown, locale?: string) =>
  authFetch<T>(path, { method: "POST", body: JSON.stringify(payload) }, locale);

export const authGet = <T>(path: string, locale?: string) => authFetch<T>(path, { method: "GET" }, locale);
