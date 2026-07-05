"use client";

/**
 * Client helpers for the profile BFF (web-app profile tab). Each returns a discriminated result the UI
 * can branch on. Field validation is mirrored client-side by the form; these surface backend errors
 * (e.g. phone already in use, invalid OTP) via the `detail`/`messageAr` the BFF forwards.
 */
import type { Locale } from "@/lib/i18n";

export interface ProfileUpdatePayload {
  firstName: string;
  lastName: string;
  city: string;
  jobTitle: string;
  email?: string;
  whatsapp?: string;
  companyName?: string;
}

type Ok<T = Record<string, unknown>> = { ok: true } & T;
type Err = { ok: false; detail?: string; messageAr?: string; code?: string };

async function send<T = Record<string, unknown>>(
  path: string,
  method: string,
  body?: unknown,
): Promise<Ok<T> | Err> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, code: "offline" };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* 204/empty */
  }
  if (!res.ok) {
    return {
      ok: false,
      detail: typeof data.detail === "string" ? data.detail : undefined,
      messageAr: typeof data.messageAr === "string" ? data.messageAr : undefined,
      code: typeof data.code === "string" ? data.code : undefined,
    };
  }
  return { ok: true, ...(data as T) };
}

export function updateProfile(payload: ProfileUpdatePayload) {
  return send<{ user?: { tier?: string }; message?: string }>("/api/me/profile", "PUT", payload);
}

export function requestPhoneChange(newPhone: string) {
  return send<{ message?: string }>("/api/me/profile/change-phone", "POST", { newPhone });
}

export function verifyPhoneChange(newPhone: string, otp: string) {
  return send<{ requireReLogin?: boolean; message?: string }>(
    "/api/me/profile/verify-phone-change",
    "POST",
    { newPhone, otp },
  );
}

export function updateLanguage(language: Locale) {
  return send<{ language?: string }>("/api/me/language", "PATCH", { language });
}

export function deleteAccount() {
  return send("/api/me", "DELETE");
}
