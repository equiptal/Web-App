import { defineConfig, devices } from "@playwright/test";

/**
 * Browser layer. Runs against a **locally mocked** build by default.
 *
 * Every external service in `src/lib/config/env.ts` falls back to a built-in stand-in when its env var
 * is blank, so `npm run dev` with no `.env` boots the whole app with no backend, no credentials and no
 * OTP to intercept. That is what makes this suite runnable on a laptop and in CI.
 *
 * **The one thing that has no mock is auth** (`appApiUrl`). So the specs here cover the surfaces a
 * signed-out visitor reaches — the home hub, the public supplier bid link, the sign-in screens
 * themselves — and stop at the session boundary. Authenticated journeys need a real environment and a
 * session strategy; they are reported `BLOCKED (no session)` by `/web:test` rather than skipped
 * silently, so the gap stays visible.
 *
 * Point it elsewhere with `PW_BASE_URL=https://…`, which also suppresses the local server.
 */

/* A BLANK `PW_BASE_URL` is not a base url. It used to be read with `??`, which only rejects
   null/undefined — so an env that exported the name with an empty value (a shell profile, a CI step
   that defaults it) gave every spec `baseURL: ""`, and `page.goto("/dev/preview")` resolved against
   the working DIRECTORY and reported «File not found … Web-App\dev\preview». Trimmed and falsy-
   checked, an empty value means "not set", which is what it reads as. */
const configuredBaseURL = process.env.PW_BASE_URL?.trim() || null;
/* ── `PW_PORT` — a server of OUR OWN, on a port nothing else is on ──────────────────────────────
   `reuseExistingServer` is what makes the default run cheap: a dev server already up is used as is.
   It is also a trap, and it fired on 2026-09-08 — something else was serving :3000 (a static file
   server), Playwright reused it, and every spec navigated into a «File not found» page naming a
   path on disk. Naming a port means the run OWNS it: nothing is reused, so the server behind the
   pictures is this app and not whatever answered first. */
const port = process.env.PW_PORT?.trim() || null;
const baseURL = configuredBaseURL ?? `http://localhost:${port ?? "3000"}`;
const external = configuredBaseURL != null;

export default defineConfig({
  testDir: "./tests/e2e",
  // A failing browser test that passes on a retry is a flaky test, and a flaky test is a lie. Retries
  // stay off locally so flakiness surfaces while it is cheap to fix; CI gets one, to absorb genuine
  // infrastructure noise without hiding a real race.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : [["line"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    // Kept only for failures: a trace for every pass is gigabytes nobody reads.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "en", use: { ...devices["Desktop Chrome"], locale: "en-US" } },
    // Arabic is a full run, not a spot check: the whole app mirrors, and a layout that breaks under
    // RTL breaks for most of the userbase.
    { name: "ar", use: { ...devices["Desktop Chrome"], locale: "ar-SA" } },
  ],

  webServer: external
    ? undefined
    : {
        /* `dev:preview` rather than `dev` on a named port: the `dev` script exports
           `NODE_OPTIONS=--no-experimental-webstorage`, which a Node that HAS no web storage rejects
           outright («not allowed in NODE_OPTIONS», exit 9) — so the shot lane could not boot a server
           on the machine it was written on. The flag exists to keep Node ≥22's own `localStorage` off
           the SERVER, and nothing the preview page renders reads storage while rendering: the yard
           explainer touches it on a press, not on paint. */
        command: port ? `npm run dev:preview -- --port ${port}` : "npm run dev",
        url: baseURL,
        // A named port is ours (see `PW_PORT` above); the default port may be anybody's.
        reuseExistingServer: port == null,
        // A cold Next dev boot compiles on first request; two minutes is the honest ceiling.
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
