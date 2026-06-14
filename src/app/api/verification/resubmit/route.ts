import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/verification/resubmit — resubmit after a rejection (AC-18). Proxies backend
 * `POST /profile/resubmit-verification` (same companyDetailsSchema). Returns to `pending`,
 * superseding the prior rejected submission.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<{ supplierStatus?: number }>("/profile/resubmit-verification", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return NextResponse.json({ ok: true, supplierStatus: data.supplierStatus });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
