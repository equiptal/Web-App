"use client";

/**
 * Client helpers for the company BFF (docs/plans/company-shared-visibility.md — the web twin of the
 * app's company hub). Each returns a discriminated result the UI branches on; failures carry the
 * backend's own `CO1xxx` code plus its bilingual message, so the screen can show the real reason
 * ("promote another owner first") instead of a generic error.
 */
import { toMyCompany, type MyCompany, type MyCompanyPayload } from "@/lib/contract/company";

type Ok<T = Record<string, unknown>> = { ok: true } & T;
type Err = { ok: false; code?: string; message?: string; messageAr?: string };
export type CompanyResult<T = Record<string, unknown>> = Ok<T> | Err;

async function send<T = Record<string, unknown>>(path: string, body?: unknown): Promise<CompanyResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
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
    /* non-JSON (e.g. a gateway error page) → fall back to the status below */
  }
  if (!res.ok) {
    return {
      ok: false,
      code: typeof data.code === "string" ? data.code : `http_${res.status}`,
      message: typeof data.message === "string" ? data.message : undefined,
      messageAr: typeof data.messageAr === "string" ? data.messageAr : undefined,
    };
  }
  return { ok: true, ...(data as T) };
}

/**
 * The renter's company, or null when they have none (the join-form state). Returns `undefined` on a
 * failed read so the caller can distinguish "no company" from "couldn't load" — the join form must
 * not appear just because the network blipped.
 */
export async function fetchMyCompany(): Promise<MyCompany | null | undefined> {
  try {
    const res = await fetch("/api/me/company", { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = (await res.json()) as MyCompanyPayload;
    return toMyCompany(data);
  } catch {
    return undefined;
  }
}

/**
 * Preview the firm behind an invite code. `companyName` may be an empty string (a valid code for a
 * firm with no name set) — which is why the result is a discriminated union rather than
 * `string | null`: "" is success, not failure.
 */
export const validateInviteCode = (inviteCode: string) =>
  send<{ valid?: boolean; companyName?: string }>("/api/me/company/validate-code", { inviteCode });

/** Request to join. Creates a PENDING membership; an owner still has to approve. */
export const joinCompany = (inviteCode: string) =>
  send<{ status?: string; companyName?: string; message?: string; messageAr?: string }>(
    "/api/me/company/join",
    { inviteCode },
  );

/**
 * Withdraw your own PENDING join request — the escape hatch from a valid-but-wrong invite code
 * (the pending row otherwise blocks every re-join with `CO1003`).
 */
export const cancelJoinRequest = () => send("/api/me/company/cancel-join");

/** Leave the firm. Records stay with it. Refused (`CO1006`) for the last active owner. */
export const leaveCompany = () => send("/api/me/company/leave");

/** Sole-member close-down — irreversible; also retires the company verification. */
export const dissolveCompany = () => send("/api/me/company/dissolve");

/** Owner roster actions on ANOTHER member (`memberUserId` is that member's user id). */
export const approveMember = (memberUserId: number) => send(`/api/me/company/members/${memberUserId}/approve`);
export const removeMember = (memberUserId: number) => send(`/api/me/company/members/${memberUserId}/remove`);
export const promoteMember = (memberUserId: number) => send(`/api/me/company/members/${memberUserId}/promote`);
export const demoteMember = (memberUserId: number) => send(`/api/me/company/members/${memberUserId}/demote`);
