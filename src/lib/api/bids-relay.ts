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
  const res = await mansourCall<T>("POST", path, body);
  return res.ok ? res.data : null;
}

/**
 * The same call, but it says WHY it failed.
 *
 * `mansourPost` collapses every failure into `null`, which is right for the `/bids/*` callers —
 * they all fall back to the deterministic comparison and the reason is noise. It is wrong for
 * export templates, where the reason is shown to a user: a `MANSOUR_URL` pointing at the wrong
 * environment and a template the mapper genuinely could not read both arrived as
 * "we couldn't read that template's layout", and only one of those is about the template.
 *
 * Distinguishes three failures the caller must treat differently:
 *   - `unconfigured` — nothing was sent; an ops problem, not the user's file.
 *   - `http`         — reached Mansour and it refused (404 = wrong env or an undeployed route).
 *   - `network`      — never arrived (DNS, refused, timeout).
 */
export type MansourResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unconfigured" | "http" | "network" | "declined"; reason: string; status?: number };

export async function mansourCall<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<MansourResult<T>> {
  if (!useRealAgent || !serverEnv.mansourUrl) {
    return { ok: false, kind: "unconfigured", reason: "MANSOUR_URL is not configured" };
  }
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (serverEnv.bidsApiToken) headers.Authorization = `Bearer ${serverEnv.bidsApiToken}`;
    const res = await fetch(`${serverEnv.mansourUrl}${path}`, {
      method,
      headers,
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[mansour] ${method} ${path} HTTP`, res.status);
      return {
        ok: false,
        kind: "http",
        status: res.status,
        reason:
          res.status === 404
            ? `the agent has no ${path} route (HTTP 404) — check MANSOUR_URL points at this environment`
            : `the agent returned HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { ok?: boolean; data?: T; error?: { message?: string } } | T;
    if (json && typeof json === "object" && "ok" in json) {
      const env = json as { ok?: boolean; data?: T; error?: { message?: string } };
      if (!env.ok) {
        return { ok: false, kind: "declined", reason: env.error?.message ?? "the agent declined" };
      }
      return { ok: true, data: (env.data ?? null) as T };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    console.error(`[mansour] ${method} ${path} failed:`, err);
    return {
      ok: false,
      kind: "network",
      reason: err instanceof Error ? `could not reach the agent (${err.message})` : "could not reach the agent",
    };
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
