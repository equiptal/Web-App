import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { extractStoreList, mapStoreCard } from "@/lib/contract/stores";

/**
 * GET /api/stores — browse verified suppliers (web-app/004, AC-05/10/11/12/13/14/15/16/24).
 * Signed-in renters hit the authed `GET /stores`; signed-out visitors hit the PUBLIC directory
 * `GET /public/stores` (public-web-auth-and-stores / T7) — same visibility + featured ordering,
 * enforced server-side, on a PII-safe projection. The web only forwards the filters and maps the
 * cards. Accepts `page,limit,search,category,city,measurement,verified`.
 */
const PASS = ["page", "limit", "search", "category", "city", "measurement", "verified"] as const;

/*
 * ⚠️ **`meta` cannot be forwarded from here, and it was tried.**
 *
 * Both backends answer `{ success, data, meta: { page, total, totalPages } }`, but `appPublicCall`
 * and `withAuthedBackend`'s `call` both unwrap to `.data` before this handler sees anything — so a
 * `meta` read here is always null. Rather than widen those helpers for one screen, the directory
 * decides from what it received: a page that comes back FULL means there is probably another, and a
 * page that comes back short is the end. See the note in `BrowseSurface`.
 */

export async function GET(req: Request) {
  const inUrl = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of PASS) {
    const v = inUrl.searchParams.get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  // Guests read the public directory; no session ⇒ no authed 401.
  if (!(await hasAppSession())) {
    try {
      const raw = await appPublicCall(`/public/stores${suffix}`, localeFromRequest(req));
      return NextResponse.json({ stores: extractStoreList(raw).map(mapStoreCard) });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

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
