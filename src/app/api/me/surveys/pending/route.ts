import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { PendingResponse } from "@/lib/contract/survey";

/**
 * GET /api/me/surveys/pending — the renter's next due Outcome Survey (one unit at a time).
 * Proxies `GET /api/surveys/pending` as the signed-in renter. The survey endpoints are scoped by
 * userId (no role guard), so no rentee-role flip is needed. Returns `{ pending: PendingUnit | null }`.
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<PendingResponse>("/api/surveys/pending");
      return NextResponse.json({ pending: data?.pending ?? null });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
