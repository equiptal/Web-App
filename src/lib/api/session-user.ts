import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { ID_COOKIE, REFRESH_COOKIE } from "@/lib/api/auth-server";
import { fetchMeWithToken } from "@/lib/api/app-backend-authed";
import { authPost } from "@/lib/api/app-backend";

/**
 * SERVER-ONLY: the signed-in renter's backend user id, for BFF routes that proxy an
 * agents-backend endpoint.
 *
 * Those endpoints authenticate with a SERVICE token rather than the renter's own Cognito session, so
 * the ACTOR has to be named in the request — which makes this function the whole authorization story
 * for every route that uses it. It therefore takes the id from a token the BACKEND has verified, never
 * from anything the caller can author.
 *
 * ⚠️ DO NOT go back to reading the `mt_user` identity cookie here. That cookie is plain
 * `JSON.stringify(user)` (see `setAuthCookies`) with no signature, and `httpOnly` only stops *browser
 * JavaScript* from touching it — it does nothing about a request that simply sends its own. Any HTTP
 * client could send `Cookie: mt_user={"id":<victim>}` with no token at all and act as that user:
 * dissolve their company, remove their members, read their bids. The agents backend's ownership check
 * does not save us, because it answers "may user N do this?", never "is the caller user N?".
 *
 * Identity resolution order:
 *   1. `mt_id` (the Cognito ID token) → `GET /users/me` AS that token. The backend verifies the JWT
 *      signature, so a forged or edited token yields nothing. The id in the response is the truth.
 *   2. Token missing or expired but `mt_refresh` present → refresh once and verify the new ID token,
 *      so a session that has merely gone stale (idle over an hour) still works rather than 401ing.
 *   3. LOCAL DEV ONLY → `AGENTS_TEST_USER_ID`, which is how `next dev` runs against staging without a
 *      real sign-in. Gated on `NODE_ENV !== "production"`, so it is inert on BOTH deployed
 *      environments — staging and prod are built with NODE_ENV=production. Before this gate existed,
 *      any deployment with that variable set accepted wholly unauthenticated calls as the test user.
 *   4. Otherwise `null` → the caller MUST refuse the request (401). That branch is now reachable.
 *
 * Cost: one extra backend round-trip per call, and a second one when the token needed refreshing. The
 * refreshed token is deliberately NOT persisted here — this helper has no response object to set a
 * cookie on, and the routes that care re-stamp it themselves via `withAuthedBackend`.
 */

/** Local `next dev` only — never true on staging or production (both build with NODE_ENV=production). */
const LOCAL_DEV = process.env.NODE_ENV !== "production";

/** Ask the backend who a token belongs to. Returns null for any invalid/expired/unverifiable token. */
async function verifiedId(token: string): Promise<number | null> {
  try {
    const me = await fetchMeWithToken(token, "en");
    return typeof me?.id === "number" && Number.isFinite(me.id) ? me.id : null;
  } catch {
    // Invalid, expired, or backend unreachable → no identity. Never fall back to an unverified source.
    return null;
  }
}

export async function sessionUserId(): Promise<number | null> {
  const jar = await cookies();

  const idToken = jar.get(ID_COOKIE)?.value;
  if (idToken) {
    const id = await verifiedId(idToken);
    if (id != null) return id;
  }

  // Stale ID token but a live refresh envelope → mint a fresh one and verify that.
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      const t = await authPost<{ accessToken: string; idToken?: string }>("/auth/refresh", { refreshToken }, "en");
      if (t?.idToken) {
        const id = await verifiedId(t.idToken);
        if (id != null) return id;
      }
    } catch {
      /* refresh rejected → treat as signed out */
    }
  }

  if (LOCAL_DEV && serverEnv.agentsTestUserId) {
    const fallback = Number(serverEnv.agentsTestUserId);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }

  return null;
}
