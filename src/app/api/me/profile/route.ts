import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { setUserCookie } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

/**
 * PUT /api/me/profile — edit the signed-in renter's profile (basic+), app parity (`PUT /profile/me`,
 * updateProfileSchema / requireTier basic). Body: { firstName, lastName, city, jobTitle, email?,
 * whatsapp?, companyName? }. Empty optionals are dropped (the schema treats them as nullable). After a
 * successful update we re-read `/users/me` so the `mt_user` cookie reflects any tier recompute.
 */
export async function PUT(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  return withAuthedBackend(req, async (call) => {
    try {
      const payload: Record<string, string> = {
        firstName: str(body.firstName),
        lastName: str(body.lastName),
        city: str(body.city),
        jobTitle: str(body.jobTitle),
      };
      if (str(body.email)) payload.email = str(body.email);
      if (str(body.whatsapp)) payload.whatsapp = str(body.whatsapp);
      if (str(body.companyName)) payload.companyName = str(body.companyName);

      const result = await call<{ message?: string; messageAr?: string; tier?: string }>("/profile/me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      // Re-read the live user so the session identity cookie tracks the (possibly recomputed) tier.
      const me = await call<{ id: number; phone: string; tier?: string }>("/users/me");
      const user: RenterUser = { id: me.id, phone: me.phone, tier: normalizeTier(me.tier ?? result.tier) };
      const res = NextResponse.json({ ok: true, user, message: result.message, messageAr: result.messageAr });
      setUserCookie(res, user);
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
