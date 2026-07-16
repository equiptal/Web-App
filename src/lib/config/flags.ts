/**
 * Client-side feature flags.
 *
 * web-app/006 — off-platform negotiate visibility. No env vars: gated by HOST. The feature is now
 * DEV-ONLY — dark on prod (web/www.moedatech.net) AND staging, and only visible on localhost for
 * development. (It was previously visible on staging too, but is hidden there until it's ready.)
 * Evaluated in the browser; during SSR it defaults off — safe because the off-platform bid cards (the
 * only place these gates apply) render client-side after their data loads, so there is no hydration flash.
 *
 * To LAUNCH: add the target host to `DEV_HOSTS`, or set `NEGOTIATE_ENABLED = true` outright.
 */
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

export const NEGOTIATE_ENABLED =
  typeof window !== "undefined" && DEV_HOSTS.has(window.location.hostname);
