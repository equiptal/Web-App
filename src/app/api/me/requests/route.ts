import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { extractRequestList, mapRequestListItem } from "@/lib/contract/requests";

/**
 * GET /api/me/requests — the renter's own requests (web-app/request-details-bids).
 * Proxies the shared backend `GET /marketplace/my-requests` (read-only, authed as the renter).
 * Each row is single-item (the backend fans multi-item RFQs into one request per item).
 * Forwards `status`, `type`, `groupId` filters + pagination.
 */
const PASS = ["status", "type", "groupId", "page", "limit"] as const;

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of PASS) {
    const v = inUrl.searchParams.get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/marketplace/my-requests${suffix}`);
      const requests = extractRequestList(raw).map(mapRequestListItem);
      return NextResponse.json({ requests });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
