import { NextResponse } from "next/server";

/**
 * GET /api/me/surveys/pending — DISABLED (Outcome Survey feature switched off).
 *
 * The route still exists and still exports GET: Next.js fails the build on a `route.ts` with no
 * HTTP-method export, and an explicit 404 is easier to diagnose than a missing handler. It now
 * answers 404 `{ code: "not_found" }` without touching the app backend.
 *
 * Original proxy preserved below. To restore, see docs/surveys-disabled.md.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
export async function GET(_req: Request) {
  return NextResponse.json({ code: "not_found", detail: "surveys disabled" }, { status: 404 });
}

/* ---- ORIGINAL IMPLEMENTATION (disabled) ------------------------------------------------
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { PendingResponse } from "@/lib/contract/survey";

/**
 * GET /api/me/surveys/pending — the renter's next due Outcome Survey (one unit at a time).
 * Proxies `GET /api/surveys/pending` as the signed-in renter. The survey endpoints are scoped by
 * userId (no role guard), so no rentee-role flip is needed. Returns `{ pending: PendingUnit | null }`.
 *\/
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
------------------------------------------------------------------------------------------ */
