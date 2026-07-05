import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { clearAuthCookies } from "@/lib/api/auth-server";
import { normalizeTier } from "@/lib/contract/auth";
import { supplierStatusToVerification, type RenterProfile } from "@/lib/contract/onboarding";

interface BackendMe {
  id: number;
  phone: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  city?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  tier?: string;
  crNumber?: string | null;
  commercialRegistrationNumber?: string | null;
  vatNumber?: string | null;
  taxNumber?: string | null;
  nationalAddress?: string | null;
  // Saudi National Address parts (the backend returns these, not a composed string).
  buildingNumber?: string | null;
  shortAddress?: string | null;
  district?: string | null;
  companyCity?: string | null;
  postalCode?: string | null;
  supplierProfile?: {
    companyName?: string | null; crNumber?: string | null; commercialRegistrationNumber?: string | null;
    vatNumber?: string | null; taxNumber?: string | null; nationalAddress?: string | null;
    buildingNumber?: string | null; shortAddress?: string | null; district?: string | null;
    companyCity?: string | null; postalCode?: string | null;
  } | null;
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
        companyName: me.companyName ?? me.supplierProfile?.companyName ?? null,
        city: me.city ?? null,
        jobTitle: me.jobTitle ?? null,
        email: me.email ?? null,
        whatsapp: me.whatsapp ?? null,
        // Company identity for the quotation Rentee block — read from either the user or its profile,
        // tolerant of the backend's field naming. Null when absent (quotation falls back to the pill).
        crNumber: me.crNumber ?? me.commercialRegistrationNumber ?? me.supplierProfile?.crNumber ?? me.supplierProfile?.commercialRegistrationNumber ?? null,
        vatNumber: me.vatNumber ?? me.taxNumber ?? me.supplierProfile?.vatNumber ?? me.supplierProfile?.taxNumber ?? null,
        // Backend returns the National Address as structured parts, not a string — compose it
        // (building no. · short address · district · city · postal code) so the quotation shows the real
        // address instead of always falling back to the "Verified" pill (mobile composes it the same way).
        nationalAddress:
          me.nationalAddress ??
          me.supplierProfile?.nationalAddress ??
          ([
            me.buildingNumber ?? me.supplierProfile?.buildingNumber,
            me.shortAddress ?? me.supplierProfile?.shortAddress,
            me.district ?? me.supplierProfile?.district,
            me.companyCity ?? me.supplierProfile?.companyCity,
            me.postalCode ?? me.supplierProfile?.postalCode,
          ]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean)
            .join(", ") || null),
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

/**
 * DELETE /api/me — delete (soft-delete) the signed-in renter's account (app parity, `DELETE /users/me`).
 * On success the account is gone, so we clear the auth cookies; the client drops to anon and returns
 * home. Guarded behind an explicit typed-confirm modal on the client.
 */
export async function DELETE(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      await call<void>("/users/me", { method: "DELETE" });
      const res = NextResponse.json({ ok: true });
      clearAuthCookies(res);
      return res;
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
