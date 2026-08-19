import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { supplierStatusToVerification } from "@/lib/contract/onboarding";

interface BackendProfileStatus {
  supplierStatus?: number | null;
  /**
   * What the reviewer typed when they refused the submission — set only while `supplierStatus === 3`,
   * and only when whoever reviewed the documents gave a reason. A bare "not approved" tells a renter
   * to try again without telling them what to change, so they re-send the same papers.
   * `submitCompanyDetails` clears it when they resubmit, so it never travels with a pending row.
   */
  verificationRejectionReason?: string | null;
  authorityRole?: string | null;
  companyName?: string | null;
  nationalId?: string | null;
  companyCity?: string | null;
  companyAddress?: string | null;
  companyLat?: number | null;
  companyLng?: number | null;
  vatDocKey?: string | null;
  crDocKey?: string | null;
  nationalAddressDocKey?: string | null;
  localContentDocKey?: string | null;
  sasoHeavyEquipDocKey?: string | null;
  companyLogoKey?: string | null;
  companyLogoUrl?: string | null;
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
        rejectionReason: s.verificationRejectionReason ?? null,
        submission: {
          authorityRole: s.authorityRole ?? null,
          companyName: s.companyName ?? null,
          nationalId: s.nationalId ?? null,
          companyCity: s.companyCity ?? null,
          companyAddress: s.companyAddress ?? null,
          companyLat: s.companyLat ?? null,
          companyLng: s.companyLng ?? null,
          crDocKey: s.crDocKey ?? null,
          vatDocKey: s.vatDocKey ?? null,
          nationalAddressDocKey: s.nationalAddressDocKey ?? null,
          localContentDocKey: s.localContentDocKey ?? null,
          sasoHeavyEquipDocKey: s.sasoHeavyEquipDocKey ?? null,
          // Logo: the key (to re-submit unchanged) + a presigned URL (to show the existing one).
          companyLogoKey: s.companyLogoKey ?? null,
          companyLogoUrl: s.companyLogoUrl ?? null,
        },
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
