/**
 * Server-only transport helpers for Mansour's `/rfq/*` surface.
 *
 * SERVER ONLY — this module reads `serverEnv`, so importing it from a client component would bundle
 * the shared secret into the browser. It deliberately lives apart from `agent-adapters.ts`, which is
 * imported by `rfq-store.tsx` (a client component) and must stay env-free.
 *
 * Mirrors the pattern already used for the bid surface in `bids-relay.ts`: attach the bearer only
 * when the secret is configured. Mansour gates `/rfq/*` and `/bids/*` with SEPARATE tokens
 * (MANSOUR_API_TOKEN vs BIDS_API_TOKEN) — don't cross them, a crossed pair reads as a missing token.
 *
 * Rollout note: this must be deployed — and the Amplify branch rebuilt, since env is baked at build
 * time — BEFORE Mansour sets MANSOUR_API_TOKEN on its side. While the var is unset here and there,
 * every call behaves exactly as it does today.
 */
import { serverEnv } from "@/lib/config/env";

/** JSON headers for a Mansour `/rfq/*` call, with the bearer when one is configured. */
export function mansourHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  if (serverEnv.mansourApiToken) headers.Authorization = `Bearer ${serverEnv.mansourApiToken}`;
  return headers;
}

/**
 * Headers for a GET (no body) — same bearer, no content-type.
 * Kept separate so a GET doesn't advertise a JSON body it doesn't have.
 */
export function mansourGetHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (serverEnv.mansourApiToken) headers.Authorization = `Bearer ${serverEnv.mansourApiToken}`;
  return headers;
}
