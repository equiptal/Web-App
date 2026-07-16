import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { extractStoreList, mapStoreDetail } from "@/lib/contract/stores";

/**
 * GET /api/stores/:id — a single store's detail + its active equipment (web-app/004, AC-18/19/20/24).
 * Signed-in renters hit the authed `GET /stores/{storeId}` (which also bumps the view count); guests
 * hit the PUBLIC `GET /public/stores/{storeId}` (+ `/equipment` when the detail doesn't inline it) —
 * a PII-safe projection (public-web-auth-and-stores / T7). Equipment paging/filter params are forwarded.
 */
const PASS = ["page", "limit", "yardId", "categoryId", "subcategoryId", "measurementId"] as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inUrl = new URL(req.url);
  const qs = new URLSearchParams();
  for (const k of PASS) {
    const v = inUrl.searchParams.get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  // Guests read the public store detail. The public detail may not inline `equipment` (it has its
  // own `/equipment` route), so fetch that separately and merge before mapping.
  if (!(await hasAppSession())) {
    const locale = localeFromRequest(req);
    const key = encodeURIComponent(id);
    try {
      const detail = (await appPublicCall(`/public/stores/${key}`, locale)) as Record<string, unknown>;
      let equipment = detail.equipment;
      if (!Array.isArray(equipment)) {
        const eqRaw = await appPublicCall(`/public/stores/${key}/equipment${suffix}`, locale);
        equipment = extractStoreList(eqRaw);
      }
      return NextResponse.json(mapStoreDetail({ ...detail, equipment }));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/stores/${encodeURIComponent(id)}${suffix}`);
      return NextResponse.json(mapStoreDetail(raw as Record<string, unknown>));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
