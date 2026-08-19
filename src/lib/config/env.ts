/**
 * Server-side environment + the real/mock switch. Import ONLY in server code (route handlers) —
 * these values (esp. the token) must never be bundled into client components.
 *
 * Each external service is independently switchable: set its env var to go real, leave it blank to
 * use the built-in stand-in mock. So staging can run fully mock, fully real, or a mix (e.g. real
 * catalogue + mock parse while Mansour's contract is still in flux — see plan.md Q5/Q6).
 */
export const serverEnv = {
  mansourUrl: process.env.MANSOUR_URL?.trim() || null,
  /** Optional bearer for Mansour's `/bids/*` routes — sent only if the agent has enabled BIDS_API_TOKEN. */
  bidsApiToken: process.env.BIDS_API_TOKEN?.trim() || null,
  /**
   * Optional bearer for Mansour's `/rfq/*` + `/normalize` routes — the SEPARATE secret from
   * bidsApiToken (Mansour gates the two surfaces independently). Sent only when set, so this is a
   * no-op until MANSOUR_API_TOKEN is provisioned on the agent; once it is, the `/rfq/*` surface is
   * closed to the public internet and only this BFF can reach it. Must be deployed (and the Amplify
   * branch rebuilt — env is baked at build time) BEFORE the agent sets its side, or every parse 401s.
   */
  mansourApiToken: process.env.MANSOUR_API_TOKEN?.trim() || null,
  agentsApiUrl: process.env.AGENTS_API_URL?.trim() || null,
  agentsApiToken: process.env.AGENTS_API_TOKEN?.trim() || null,
  /** Fallback rentee user id for submissions when no signed-in session is present (create_request needs one). */
  agentsTestUserId: process.env.AGENTS_TEST_USER_ID?.trim() || null,
  /**
   * web-app/001 auth: base URL of the main Moedatech-App backend (the same `/auth/*` the mobile app
   * uses). Staging: https://c4tupvmckc.execute-api.eu-central-1.amazonaws.com. No mock — auth is real.
   */
  appApiUrl: process.env.APP_API_URL?.trim() || null,
  /** Multi-tenancy header value for backend calls; everything uses "default" today. */
  tenantId: process.env.TENANT_ID?.trim() || "default",
};

/** True when the real Mansour parse endpoint is configured (else stand-in mock). */
export const useRealAgent = Boolean(serverEnv.mansourUrl);

/** True when the real app catalogue + submit endpoints are configured (need URL + token). */
export const useRealApp = Boolean(serverEnv.agentsApiUrl && serverEnv.agentsApiToken);

/**
 * Export templates fall back to an in-memory dev store.
 *
 * Has its OWN switch rather than riding on `useRealApp`, because the two are needed in
 * opposite directions at the same time: the comparison page needs the real agents backend for
 * requests and bids, while export-templates may not be deployed there yet. Tying them together
 * forced a choice between real data and a working template UI.
 *
 * Set `EXPORT_TEMPLATES_MOCK=1` for that combination; otherwise it follows `useRealApp`, so a
 * fully-configured environment is never accidentally mocked.
 */
export const mockExportTemplates =
  process.env.EXPORT_TEMPLATES_MOCK === "1" || !useRealApp;

/** True when the renter-auth backend (web-app/001 `/auth/*`) is configured. */
export const useRealAuth = Boolean(serverEnv.appApiUrl);
