import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/** GET /api/master-data/cities — proxy the backend city list for the onboarding city selector. */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call("/master-data/cities");
      return NextResponse.json(data);
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
