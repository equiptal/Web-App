import { cookies } from "next/headers";
import { serverEnv } from "@/lib/config/env";
import { USER_COOKIE } from "@/lib/api/auth-server";
import type { RenterUser } from "@/lib/contract/auth";

/**
 * SERVER-ONLY: the signed-in renter's backend user id, for BFF routes that proxy an
 * agents-backend endpoint.
 *
 * Those endpoints authenticate with a service token rather than the renter's Cognito session, so the
 * ACTOR has to be named in the request. The id comes from the httpOnly `mt_user` identity cookie —
 * set only by the auth routes after the backend verified the Cognito tokens — so the browser can't
 * nominate someone else by editing a request body. The agents endpoints additionally verify the
 * named user's own ownership/membership server-side, so this is naming an actor, not granting one.
 *
 * Falls back to `AGENTS_TEST_USER_ID` when there's no session, which is how local development runs
 * against staging without a real sign-in. Returns null when neither is available → the caller 401s.
 */
export async function sessionUserId(): Promise<number | null> {
  try {
    const raw = (await cookies()).get(USER_COOKIE)?.value;
    if (raw) {
      const user = JSON.parse(raw) as RenterUser;
      if (typeof user.id === "number" && Number.isFinite(user.id)) return user.id;
    }
  } catch {
    /* malformed cookie → fall through to the dev fallback */
  }
  const fallback = serverEnv.agentsTestUserId ? Number(serverEnv.agentsTestUserId) : null;
  return fallback && Number.isFinite(fallback) ? fallback : null;
}
