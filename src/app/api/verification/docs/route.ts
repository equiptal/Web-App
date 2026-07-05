import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

interface BackendDocUrls {
  crDocUrl?: string | null;
  vatDocUrl?: string | null;
  nationalAddressDocUrl?: string | null;
  localContentDocUrl?: string | null;
  sasoHeavyEquipDocUrl?: string | null;
  otherDocUrls?: string[] | null;
}

/**
 * GET /api/verification/docs — presigned download URLs for the verified renter's company documents
 * (CR / VAT / National Address / local content / SASO), so the profile can show them as viewable
 * "View" tiles like the app's company-details screen. Backend `GET /users/me/verification-docs` is
 * verified-only (supplierStatus === 2) → a non-verified caller 403s and we return nulls.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const d = await call<BackendDocUrls>("/users/me/verification-docs");
      return NextResponse.json({
        crDocUrl: d.crDocUrl ?? null,
        vatDocUrl: d.vatDocUrl ?? null,
        nationalAddressDocUrl: d.nationalAddressDocUrl ?? null,
        localContentDocUrl: d.localContentDocUrl ?? null,
        sasoHeavyEquipDocUrl: d.sasoHeavyEquipDocUrl ?? null,
        otherDocUrls: Array.isArray(d.otherDocUrls) ? d.otherDocUrls : [],
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
