import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/verification/submit — submit company verification (basic → pending) (AC-09/10/13/21).
 * Proxies backend `POST /users/me/company` (companyDetailsSchema: authorityRole, companyName,
 * crDocKey, vatDocKey required + optional fields). The backend validates, sets `supplierStatus` to
 * pending, and enters the existing admin review queue. The body is forwarded as-is (the backend's
 * Zod schema is the contract; it rejects a pending/approved resubmit with VERIFICATION_ALREADY_*).
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
      const data = await call<{ supplierStatus?: number }>("/users/me/company", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return NextResponse.json({ ok: true, supplierStatus: data.supplierStatus });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
