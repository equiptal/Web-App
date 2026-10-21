import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * **A build directory that can be pointed elsewhere** (2026-09-08).
   *
   * Default `.next`, exactly as before. `NEXT_DIST_DIR` exists for one case and is set by one
   * caller: the UI screenshot lane (`npm run ui:shots`), which boots its own dev server while a
   * build, another dev server or an OneDrive sync may already hold `.next` — on Windows that is a
   * hard `EPERM` on `.next/trace` and the server exits 1, so the pictures could not be taken at all.
   * A second directory means the lane never contends for the first one.
   *
   * Nothing else reads it: `dev`, `build` and `start` are unchanged, and CI sets nothing.
   */
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",

  /**
   * **The governance board is never cached** (2026-10-03).
   *
   * It is a static file in `/public`, so it is served with a long-lived cache like any asset — but
   * it is not an asset. It is a PAGE that talks to `/api/me/governance`, and the two have to move
   * together: a cached copy keeps calling a route whose shape has changed under it, and the
   * symptom is a board that renders and then does nothing, with no error anywhere, because the
   * code that would have handled the new payload is the code the browser did not fetch.
   *
   * That cost an afternoon. `no-store` rather than a revalidation header, because the file is one
   * request on a surface two accounts can open, so there is nothing to save and a wrong answer
   * here is expensive.
   */
  async headers() {
    return [
      {
        source: "/governance-dashboard.html",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },

  /**
   * **PostHog reverse proxy** (2026-10-21), as PostHog's Next.js guide sets it up
   * (`src/instrumentation-client.ts`). Ad blockers drop `*.posthog.com`; through our own domain
   * the events arrive. Under `/api` because the middleware matcher skips `/api`.
   */
  async rewrites() {
    return [
      {
        source: "/api/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/api/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      { source: "/api/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },

  /**
   * ⚠️ Required by the proxy above: PostHog's endpoints end in a slash (`/e/`) and Next's default
   * 308 to the slashless URL breaks them. Side effect, app wide: a URL typed with a trailing slash
   * is no longer redirected to the one without.
   */
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
