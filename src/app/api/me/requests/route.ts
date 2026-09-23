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
      /* ── A TRIAL request belongs to the app, and is dropped here ─────────────────────────────
         Trials are switched off on the web (`TRIAL_REQUESTS_ENABLED`), but that flag only stops
         this app CREATING one. The database is shared with the mobile app, which still offers
         them, so a renter who tried the trial on his phone was seeing it here as an ORDINARY
         request: no ribbon, no caption, sample bids from the demo supplier reading as real
         offers, and the whole row gone an hour later when the 60-minute TTL expired.

         🔴 Dropped at the BFF rather than in each surface. The workspace, the request rail, the
         dashboard and every bid count read this one route, so a filter in any one of them would
         leave a trial counted where it is not drawn — which is worse than showing it.

         ⚠️ `=== true`, never truthy. An older backend that does not send the field leaves it
         `undefined`, and guessing the other way would hide every real request on that build.

         ⚠️ When trials come to the web, this goes and the app's ribbon comes with it. Hiding is
         right only while the web has no way to say what a trial is. */
      const requests = extractRequestList(raw)
        .filter((r) => r.isTrial !== true)
        .map(mapRequestListItem);
      return NextResponse.json({ requests });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
