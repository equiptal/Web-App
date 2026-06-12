import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { supplierStatusToVerification } from "@/lib/contract/onboarding";

interface BackendProfileStatus {
  supplierStatus?: number | null;
  authorityRole?: string | null;
  companyName?: string | null;
  nationalId?: string | null;
  companyCity?: string | null;
  vatDocKey?: string | null;
  crDocKey?: string | null;
}

/**
 * GET /api/verification — current verification status + a prefill for resubmit (AC-14/17/18/19/20).
 * Reads backend `GET /users/me/profile-status`; maps `supplierStatus` to the lifecycle state and
 * returns the previously-submitted company fields so a rejected renter can adjust + resubmit.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const s = await call<BackendProfileStatus>("/users/me/profile-status");
      return NextResponse.json({
        status: supplierStatusToVerification(s.supplierStatus),
        submission: {
          authorityRole: s.authorityRole ?? null,
          companyName: s.companyName ?? null,
          nationalId: s.nationalId ?? null,
          companyCity: s.companyCity ?? null,
          crDocKey: s.crDocKey ?? null,
          vatDocKey: s.vatDocKey ?? null,
        },
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
