import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { extractStoreList, mapStoreCard } from "@/lib/contract/stores";

/**
 * GET /api/stores — browse verified suppliers (web-app/004, AC-05/10/11/12/13/14/15/16/24).
 * Proxies the shared backend `GET /stores` (read-only). The backend enforces the visibility rule
 * (visible + active supplier + ≥1 active equipment) and featured/pinned ordering server-side, so
 * the web only forwards the renter's filters and maps the cards. Accepts:
 * `page,limit,search,category,city,measurement,verified`.
 */
const PASS = ["page", "limit", "search", "category", "city", "measurement", "verified"] as const;

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
      const raw = await call(`/stores${suffix}`);
      const stores = extractStoreList(raw).map(mapStoreCard);
      return NextResponse.json({ stores });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
