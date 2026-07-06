/**
 * Feature flags (build-inlined via NEXT_PUBLIC_ env vars, per-environment on Amplify).
 *
 * PUBLIC_WEB_ENABLED — the public-web + one-step-auth-gate epic. ON (staging, when
 * NEXT_PUBLIC_PUBLIC_WEB_ENABLED=1): the site is public to browse, sign-in offers email-OR-SMS OTP,
 * and guest surfaces (open tabs, request-free compare, the OTP submit modal) are live. OFF (default →
 * production, and staging until we opt in): the legacy behaviour — the whole app requires a session
 * and sign-in is SMS-only, exactly as production is today. Same env-flag pattern as LOGO_UPLOAD_ENABLED.
 *
 * NOTE: the edge middleware reads this env var directly at call time (for test toggling); keep both in
 * sync on the same NEXT_PUBLIC_PUBLIC_WEB_ENABLED variable.
 */
export const PUBLIC_WEB_ENABLED = process.env.NEXT_PUBLIC_PUBLIC_WEB_ENABLED === "1";

/**
 * BID_VERIFY_ENABLED — the "quote → transform → renter-verify → commit" flow. ON (default): a quote upload
 * runs /bids/transform and opens the verify screen; the renter confirms/edits each field (optional) before
 * the bid is committed into the comparison. Set NEXT_PUBLIC_BID_VERIFY_ENABLED=0 to fall back to the legacy
 * path (upload → parse → add straight to the matrix with the match-warning popup) — e.g. if the agent's
 * /bids/transform isn't available in an environment.
 */
export const BID_VERIFY_ENABLED = process.env.NEXT_PUBLIC_BID_VERIFY_ENABLED !== "0";
