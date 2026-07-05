"use client";

/** Client helper for the auth BFF: POSTs JSON, normalises errors to a typed kind (incl. offline). */
export type AuthKind =
  | "invalid_phone"
  | "invalid_code"
  | "expired"
  | "locked"
  | "send_failed"
  | "phone_exists"
  | "offline"
  | "unknown";

type AuthResult = { ok: true; data: Record<string, unknown> } | { ok: false; kind: AuthKind };

/** OTP channel chosen at the phone step. Phase B — the channel used to sign in IS the login identity:
 *  SMS/WhatsApp key the account+OTP by phone; EMAIL keys them by `email`. The chosen channel must be
 *  carried through to BOTH resend AND verify (the OTP is keyed by whichever identifier was used). */
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
