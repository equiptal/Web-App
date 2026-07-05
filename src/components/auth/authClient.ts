"use client";

/** Client helper for the auth BFF: POSTs JSON, normalises errors to a typed kind (incl. offline). */
export type AuthKind =
  | "invalid_phone"
  | "invalid_code"
  | "expired"
  | "locked"
  | "send_failed"
  | "offline"
  | "unknown";

type AuthResult = { ok: true; data: Record<string, unknown> } | { ok: false; kind: AuthKind };

/** OTP delivery channel chosen at the phone step (T5). Phone stays the account identity; when the
 *  channel is EMAIL the code is delivered to `email`. Carried to the code step so Resend uses it too. */
export type OtpChannel = { method: "SMS" | "EMAIL"; email?: string };

export async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, kind: "offline" }; // AC-24: no connectivity
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const kind = typeof data.code === "string" ? (data.code as AuthKind) : "unknown";
    return { ok: false, kind };
  }
  return { ok: true, data };
}
