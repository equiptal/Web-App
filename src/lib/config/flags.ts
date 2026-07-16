/**
 * Client-side feature flags (inlined at build via NEXT_PUBLIC_*).
 *
 * web-app/006 — off-platform negotiate. Gates the user-visible negotiate surface: the card's Negotiate
 * button, the masked-contact Negotiate CTA in the submission viewer, and the deal-room-style negotiate
 * view. OFF by default so it stays dark in prod until the supplier onboarding/convert flow is live.
 * Enable per-environment: set `NEXT_PUBLIC_ENABLE_NEGOTIATE=1` (Amplify staging env / local `.env.local`).
 * When off, the viewer shows the supplier's contact info as before — no behaviour change.
 */
export const NEGOTIATE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_NEGOTIATE === "1";
