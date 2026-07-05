import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapReceivedBids } from "@/lib/contract/inbox";

/**
 * GET /api/me/received-bids — the renter's inbox feed: every bid offered to them across all RFQs,
 * each enriched with deal-room status + unread count. Proxies `GET /marketplace/received-bids`
 * (rentee-role-guarded; withAuthedBackend auto-switches role on E9009). Passes `?status=` + paging.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const status = url.searchParams.get("status");
  const page = url.searchParams.get("page");
  const limit = url.searchParams.get("limit");
  if (status) qs.set("status", status);
  if (page) qs.set("page", page);
  if (limit) qs.set("limit", limit);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call<unknown>(`/marketplace/received-bids${suffix}`);
      return NextResponse.json({ bids: mapReceivedBids(raw) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
