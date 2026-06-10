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
  agentsApiUrl: process.env.AGENTS_API_URL?.trim() || null,
  agentsApiToken: process.env.AGENTS_API_TOKEN?.trim() || null,
  /** Test rentee user id for submissions while web-app/001 auth is bypassed (create_request needs one). */
  agentsTestUserId: process.env.AGENTS_TEST_USER_ID?.trim() || null,
};

/** True when the real Mansour parse endpoint is configured (else stand-in mock). */
export const useRealAgent = Boolean(serverEnv.mansourUrl);

/** True when the real app catalogue + submit endpoints are configured (need URL + token). */
export const useRealApp = Boolean(serverEnv.agentsApiUrl && serverEnv.agentsApiToken);
