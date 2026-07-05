import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { setUserCookie } from "@/lib/api/auth-server";
import { normalizeTier, type RenterUser } from "@/lib/contract/auth";

/**
 * POST /api/profile/complete — complete the renter's profile (guest → basic) (AC-02/03/04/05).
 * Proxies backend `POST /users/me/profile` (completeProfileSchema). The backend recomputes the tier
 * (`basic` once firstName + lastName + city + jobTitle are set) and validates lengths server-side.
 * Body: { firstName, lastName, city, jobTitle, email?, whatsapp? }.
 */
export async function POST(req: Request) {
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
      if (str(body.companyName)) payload.companyName = str(body.companyName); // profile display company name

      await call<Record<string, unknown>>("/users/me/profile", {
        method: "PUT", // completeProfile is PUT /users/me/profile (POST 404s)
        body: JSON.stringify(payload),
      });
      // Re-read the live user so the session's mt_user cookie reflects the new tier (guest→basic),
      // which unblocks 002's canCreate after the client calls session.refresh() (AC-05).
      const me = await call<{ id: number; phone: string; tier?: string }>("/users/me");
      const user: RenterUser = { id: me.id, phone: me.phone, tier: normalizeTier(me.tier) };
      const res = NextResponse.json({ ok: true, user });
      setUserCookie(res, user);
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
