import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { normalizeTier } from "@/lib/contract/auth";
import { supplierStatusToVerification, type RenterProfile } from "@/lib/contract/onboarding";

interface BackendMe {
  id: number;
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  tier?: string;
}
interface BackendStatus {
  supplierStatus?: number | null;
}

/**
 * GET /api/me — the signed-in renter's profile + tier + verification status (web-app/003).
 * Reads the shared backend (`GET /users/me` + `GET /users/me/profile-status`) as the renter, so
 * tier/status reflect changes made on either surface (AC-07/24/25/26). Drives gating + revisit states.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const me = await call<BackendMe>("/users/me");
      const status = await call<BackendStatus>("/users/me/profile-status");
      const user: RenterProfile = {
        id: me.id,
        phone: me.phone,
        tier: normalizeTier(me.tier),
        firstName: me.firstName ?? null,
        lastName: me.lastName ?? null,
        city: me.city ?? null,
        jobTitle: me.jobTitle ?? null,
        email: me.email ?? null,
        whatsapp: me.whatsapp ?? null,
      };
      return NextResponse.json({
        user,
        verification: { status: supplierStatusToVerification(status.supplierStatus) },
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
