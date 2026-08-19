import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, AppAuthError } from "@/lib/api/app-backend-authed";

interface BackendDocUrls {
  crDocUrl?: string | null;
  vatDocUrl?: string | null;
  nationalAddressDocUrl?: string | null;
  localContentDocUrl?: string | null;
  sasoHeavyEquipDocUrl?: string | null;
  otherDocUrls?: string[] | null;
}

/**
 * GET /api/verification/docs — presigned download URLs for the renter's own company documents
 * (CR / VAT / National Address / local content / SASO), so the profile and the verification screen can
 * show them as viewable "View" tiles like the app's company-details screen.
 *
 * Backend `GET /users/me/verification-docs` serves **anyone who has submitted** — pending (1),
 * approved (2) or rejected (3) — and refuses only `supplierStatus === 0` with
 * VERIFICATION_NOT_SUBMITTED, because there is nothing on file to read. It used to demand approval,
 * which locked the read to the one state where the renter needs it least: under the pile flow a
 * pending renter has documents on file, no way to see which ones landed, and no route back into the
 * upload screen either.
 *
 * A 403 therefore means "nothing submitted", not "not allowed", and still answers with nulls — the
 * caller decides whether that reads as "no documents received yet" (pending) or as no panel at all.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const d = await call<BackendDocUrls>("/users/me/verification-docs");
      return NextResponse.json({
        submitted: true,
        crDocUrl: d.crDocUrl ?? null,
        vatDocUrl: d.vatDocUrl ?? null,
        nationalAddressDocUrl: d.nationalAddressDocUrl ?? null,
        localContentDocUrl: d.localContentDocUrl ?? null,
        sasoHeavyEquipDocUrl: d.sasoHeavyEquipDocUrl ?? null,
        otherDocUrls: Array.isArray(d.otherDocUrls) ? d.otherDocUrls : [],
      });
    } catch (err) {
      // "Nothing has ever been submitted" (E8017) is a state, not a failure: the verification screen
      // asks for this on every load and a 403 in the console for a renter who simply has not applied
      // yet is noise. Anything else — an expired session, the backend being down — still surfaces.
      if (err instanceof AppAuthError && err.code === "E8017") {
        return NextResponse.json({
          submitted: false,
          crDocUrl: null,
          vatDocUrl: null,
          nationalAddressDocUrl: null,
          localContentDocUrl: null,
          sasoHeavyEquipDocUrl: null,
          otherDocUrls: [],
        });
      }
      return appAuthErrorResponse(err);
    }
  });
}
