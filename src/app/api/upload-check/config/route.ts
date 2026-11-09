import { NextResponse } from "next/server";
import { withAuthedBackend } from "@/lib/api/app-backend-authed";
import {
  UPLOAD_CHECK_BASE,
  UPLOAD_CHECK_FLOW,
  UPLOAD_CHECK_HEADERS,
  refusalResponse,
} from "@/lib/api/upload-check-server";
import type { UploadCheckConfig } from "@/lib/upload-check/types";

/**
 * GET /api/upload-check/config — is the company documents check on for this renter, and the copy
 * sizes and timings the browser must use (contract-v4 §1, §7).
 *
 * Proxies `GET /upload-check/v1/config?flow=company`: the company gate (BASIC tier, any role) and
 * the company switch (`upload_check_v4_company`). Without the query the backend answers the
 * EQUIPMENT switch behind the supplier gate, so the query is pinned here.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<UploadCheckConfig>(`${UPLOAD_CHECK_BASE}/config?flow=${UPLOAD_CHECK_FLOW}`, {
        method: "GET",
        headers: UPLOAD_CHECK_HEADERS,
      });
      return NextResponse.json(data);
    } catch (err) {
      return refusalResponse(err);
    }
  });
}
