import { NextResponse } from "next/server";
import { agentsPost } from "@/lib/api/agents-backend";
import { requireActor, companyErrorResponse } from "@/lib/api/company-server";
import { withAuthedBackend, hasAppSession } from "@/lib/api/app-backend-authed";
import { setUserCookie } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

/**
 * POST /api/me/company/dissolve — no body; the actor is the session.
 *
 * Sole-member close-down: the firm's records come back to the renter's personal account, in-flight
 * deal rooms are closed (counterparty notified, their bid reactivated), the invite code stops
 * working, and — because a company only ever exists as the product of a verification — the CR/VAT
 * verification is retired and the account drops to Basic.
 *
 * Refused with `CO1006` when other active members remain (leave / promote instead), `CO1011` for a
 * pending joiner. Irreversible, so the UI confirms with the full consequences spelled out.
 *
 * ── Why this route isn't just `companyAction` ──
 * Dissolving is the ONE company action that changes the caller's own TIER: the backend clears
 * `supplierStatus`, so `getUserTier` drops them verified → basic. The web session's tier lives in the
 * `mt_user` cookie and `/api/auth/session` reads it straight from there — it never re-reads
 * `/users/me` — so without re-stamping the cookie here the shell badge, the tier banner and every
 * verified-gated affordance would keep claiming "Verified" for a verification that no longer exists.
 * Same pattern as `PUT /api/me/profile`. Leave/join/approve don't need this: none of them touches the
 * acting user's `supplierStatus`.
 */
export async function POST(req: Request) {
  const actor = await requireActor();
  if ("response" in actor) return actor.response;

  let data: Record<string, unknown>;
  try {
    data = (await agentsPost<Record<string, unknown>>("/agents/companies/dissolve", { userId: actor.userId })) ?? {};
  } catch (err) {
    return companyErrorResponse(err, "POST /api/me/company/dissolve");
  }

  const body = { ok: true, ...data };
  // No real session (local dev running on AGENTS_TEST_USER_ID) → skip the re-stamp. `withAuthedBackend`
  // would 401 AND clear the cookies, masking a dissolve that actually succeeded.
  if (!(await hasAppSession())) return NextResponse.json(body);

  return withAuthedBackend(req, async (call) => {
    const res = NextResponse.json(body);
    try {
      const me = await call<{ id: number; phone: string; tier?: string }>("/users/me");
      const user: RenterUser = { id: me.id, phone: me.phone, tier: normalizeTier(me.tier) };
      setUserCookie(res, user);
    } catch {
      // Best-effort: the dissolve is already committed and must be reported as success. A stale tier
      // badge self-corrects on the next sign-in; failing the call here would be far worse.
    }
    return res;
  });
}
