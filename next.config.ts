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
   * **`/go/subscription` forwards to the app's subscription page** (2026-10-15).
   *
   * Meta (WhatsApp templates, ads) refuses link shorteners, and `moedatech.chottu.link` counts as
   * one, so Meta gets this own-domain URL and the ChottuLink link does the app opening. The app
   * itself only opens `moedatech.chottu.link` links, so the hop cannot be skipped.
   *
   * ⚠️ Not `permanent`: a 308 is cached by browsers for good, so a later change of target would not
   * reach anyone who tapped it once.
   */
  async redirects() {
    return [
      {
        source: "/go/subscription",
        destination: "https://moedatech.chottu.link/subscription",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
