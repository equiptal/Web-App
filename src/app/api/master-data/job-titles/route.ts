import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/** GET /api/master-data/job-titles — proxy the backend job-title list for the onboarding selector. */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call("/master-data/job-titles");
      return NextResponse.json(data);
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
