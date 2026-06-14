import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET /api/me/activity — the renter's home activity counters (web-app/request-details-bids).
 * Proxies `GET /users/me/profile-status` and surfaces the rentee counts that drive the home hub:
 * new bids, open/total requests, completed deals. `newBidsCount` is role-dependent on the backend
 * (rentee = PENDING/ACCEPTED bids on the renter's requests), so if the account is currently in
 * supplier mode we flip it to rentee first — this is the renter-only web app.
 */
interface BackendStatus {
  activeRole?: number | null;
  newBidsCount?: number | null;
  openRequestCount?: number | null;
  totalRequestCount?: number | null;
  completedDealsCount?: number | null;
}

export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      let status = await call<BackendStatus>("/users/me/profile-status");
      if (status.activeRole === 2) {
        await call("/users/me/role", { method: "PUT", body: JSON.stringify({ role: "rentee" }) });
        status = await call<BackendStatus>("/users/me/profile-status");
      }
      return NextResponse.json({
        newBids: status.newBidsCount ?? 0,
        openRequests: status.openRequestCount ?? 0,
        totalRequests: status.totalRequestCount ?? 0,
        completedDeals: status.completedDealsCount ?? 0,
      });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
