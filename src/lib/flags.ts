/**
 * Feature flags (build-inlined via NEXT_PUBLIC_ env vars, per-environment on Amplify).
 *
 * PUBLIC_WEB_ENABLED — the public-web + one-step-auth-gate epic. ON (default): the site is public to
 * browse, there is NO /login page (auth is an in-app modal form: phone + email → OTP → register if
 * new), sign-in offers SMS/Email OTP, and guest surfaces (open tabs, request-free compare, the submit
 * modal) are live. This is now the DEFAULT behaviour. Set NEXT_PUBLIC_PUBLIC_WEB_ENABLED=0 to fall
 * back to the legacy gated behaviour (whole app requires a session, standalone /login, SMS-only) —
 * e.g. a kill-switch to hold it back on a specific environment (prod). Same pattern as BID_VERIFY_ENABLED.
 *
 * NOTE: the edge middleware reads this env var directly at call time (for test toggling); keep both in
 * sync on the same NEXT_PUBLIC_PUBLIC_WEB_ENABLED variable (default ON, `=0` disables).
 */
export const PUBLIC_WEB_ENABLED = process.env.NEXT_PUBLIC_PUBLIC_WEB_ENABLED !== "0";

/**
 * BID_VERIFY_ENABLED — the "quote → transform → renter-verify → commit" flow. ON (default): a quote upload
 * runs /bids/transform and opens the verify screen; the renter confirms/edits each field (optional) before
 * the bid is committed into the comparison. Set NEXT_PUBLIC_BID_VERIFY_ENABLED=0 to fall back to the legacy
 * path (upload → parse → add straight to the matrix with the match-warning popup) — e.g. if the agent's
 * /bids/transform isn't available in an environment.
 */
export const BID_VERIFY_ENABLED = process.env.NEXT_PUBLIC_BID_VERIFY_ENABLED !== "0";

/**
 * EMAIL_FIRST_AUTH_ENABLED — Modal 1's Email tab + the email-first onboarding (verify email → add
 * phone). OFF by default: the deployed `/auth/login` still requires a phone, so a phone-less email
 * login returns VALIDATION_ERROR (400). When off, Modal 1 is phone-only (email is collected in Modal 2)
 * — the fully-working path. Set NEXT_PUBLIC_EMAIL_FIRST_AUTH=1 once the backend accepts an email-only
 * login (look up the account by email → send code / EMAIL_AMBIGUOUS / needsSignup).
 */
export const EMAIL_FIRST_AUTH_ENABLED = process.env.NEXT_PUBLIC_EMAIL_FIRST_AUTH === "1";
