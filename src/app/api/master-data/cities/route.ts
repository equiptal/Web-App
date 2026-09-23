import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";

/**
 * GET /api/master-data/cities — the city list, for the onboarding selector and the browse filter.
 *
 * A guest gets the PUBLIC twin (`/public/master-data/cities`, guest-browse T3) rather than a 401.
 * The browse screen used to hide the City filter when signed out for want of this call — a signed-out
 * visitor could see every store in the country and had no way to narrow it to his own city, which is
 * the first question anyone browsing suppliers asks.
 */
export async function GET(req: Request) {
  if (!(await hasAppSession())) {
    try {
      return NextResponse.json(await appPublicCall("/public/master-data/cities", localeFromRequest(req)));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call("/master-data/cities");
      return NextResponse.json(data);
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
