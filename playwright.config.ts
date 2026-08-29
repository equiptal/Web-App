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

const baseURL = process.env.PW_BASE_URL ?? "http://localhost:3000";
const external = Boolean(process.env.PW_BASE_URL);

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
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        // A cold Next dev boot compiles on first request; two minutes is the honest ceiling.
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
