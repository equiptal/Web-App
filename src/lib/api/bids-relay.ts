/**
 * web-app/007 — server-only relay to Mansour's `/bids/*` judgement endpoints.
 *
 * Same transport shape as the RFQ relay (`/api/agent/process`): POST to `{MANSOUR_URL}/bids/<path>`,
 * unwrap the `{ ok, data }` envelope, and return `null` when the agent is unconfigured / errors / says
 * `ok:false` — so every caller falls back to the deterministic comparison instead of breaking.
 *
 * Import ONLY from route handlers (uses the server env / token-free Railway service).
 */
import { serverEnv, useRealAgent } from "@/lib/config/env";

/** POST a body to `{MANSOUR_URL}/bids/<path>`; returns the unwrapped `data`, or null on any miss. */
export async function relayToMansour<T>(path: string, body: unknown): Promise<T | null> {
  return mansourPost<T>(`/bids/${path}`, body);
}

/**
 * POST to any Mansour path (leading slash included) — same transport and credentials as the
 * `/bids/*` relay above.
 *
 * Generalized because export-template mapping lives at `/templates/map`, not under `/bids`.
 * Reusing the credentials this app already holds is the whole point: nothing new has to be
 * provisioned for a call the web can already make.
 *
 * Returns `null` on any miss (unconfigured / HTTP error / `ok:false`), the same contract every
 * other Mansour caller here relies on.
 */
export async function mansourPost<T>(path: string, body: unknown): Promise<T | null> {
  if (!useRealAgent || !serverEnv.mansourUrl) return null;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (serverEnv.bidsApiToken) headers.Authorization = `Bearer ${serverEnv.bidsApiToken}`;
    const res = await fetch(`${serverEnv.mansourUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mansour] ${path} HTTP`, res.status);
      return null;
    }
    const json = (await res.json()) as { ok?: boolean; data?: T } | T;
    if (json && typeof json === "object" && "ok" in json) {
      return (json as { ok?: boolean; data?: T }).ok ? ((json as { data?: T }).data ?? null) : null;
    }
    return json as T;
  } catch (err) {
    console.error(`[mansour] ${path} failed:`, err);
    return null;
  }
}

/** The signed-in renter's id from the `mt_user` cookie (the safe identity envelope). null when absent. */
export function userIdFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)mt_user=([^;]+)/);
  if (!m) return null;
  try {
    const user = JSON.parse(decodeURIComponent(m[1])) as { id?: number | string };
    return user.id != null ? String(user.id) : null;
  } catch {
    return null;
  }
}
