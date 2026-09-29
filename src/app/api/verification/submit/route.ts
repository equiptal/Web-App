import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * POST /api/verification/submit — submit company verification (basic → pending) (AC-09/10/13/21).
 * Proxies backend `POST /users/me/company` (companyDetailsSchema: authorityRole, companyName,
 * crDocKey, vatDocKey required + optional fields). The backend validates, sets `supplierStatus` to
 * pending, and enters the existing admin review queue. The body is forwarded as-is (the backend's
 * Zod schema is the contract; it rejects a pending/approved resubmit with VERIFICATION_ALREADY_*).

 * ⚠️ **No longer called by the UI (2026-09-27).** `VerificationFlow` used to post here first,
 * which opened the platform's verification case before a single file had been uploaded — the
 * write that left seven accounts PENDING with nothing behind them. The renter now sends the pile
 * and nothing else, and RelayPanel opens the case from its own `/complete` once the bytes are
 * confirmed in storage.
 *
 * Kept rather than deleted: it is covered by `tests/unit/{app-authed,company-pile}.test.ts` and
 * still proxies the LABELLED shape. Since the backend stopped opening a case for a pile payload
 * it cannot re-create the old defect on its own. **Do not wire it back into the submit flow.**
 * See `docs/plans/company-verification-relay-only/` in `equiptal/Moedatech-App`.
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
