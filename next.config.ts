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
};

export default nextConfig;
