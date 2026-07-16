/**
 * Client-side feature flags.
 *
 * web-app/006 — off-platform negotiate visibility. No env vars: gated by HOST so the feature stays DARK
 * on the prod domain and is visible everywhere else (staging, Amplify preview builds, localhost). We
 * match the prod host only (canonical) rather than enumerating staging domains, so new preview/staging
 * URLs light up automatically. Evaluated in the browser; during SSR it defaults off — safe because the
 * off-platform bid cards (the only place these gates apply) render client-side after their data loads,
 * so there is no hydration flash.
 *
 * To LAUNCH on prod: set `NEGOTIATE_ENABLED = true` (or remove the host check).
 */
const PROD_HOSTS = new Set(["web.moedatech.net", "www.moedatech.net"]);

export const NEGOTIATE_ENABLED =
  typeof window !== "undefined" && !PROD_HOSTS.has(window.location.hostname);
