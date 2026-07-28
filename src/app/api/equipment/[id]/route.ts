import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse, appPublicCall, hasAppSession } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { extractStoreList, mapEquipmentDetail } from "@/lib/contract/stores";

/**
 * GET /api/equipment/:id — full equipment detail for the renter's equipment sheet (web-app/004
 * follow-up; mirrors the app's public equipment detail). Signed-in renters proxy the shared backend
 * `GET /equipment/{equipmentId}` (read-only); photos come back as backend-signed URLs, documents as
 * type labels only (no contents surfaced to the renter).
 *
 * Guests (public store browse, public-web-auth-and-stores / T7) have no token, and the backend has
 * no public equipment-detail route — so with `?storeId=` we resolve the listing out of the PII-safe
 * `GET /public/stores/{storeId}/equipment` projection instead of 401-ing the equipment modal. That
 * projection carries every detail field except `operatingHours` (absent → null for guests).
 */
const PUBLIC_LIMIT = 200; // the public equipment route caps `limit` at 200
const PUBLIC_MAX_PAGES = 5; // 1000 listings; stop rather than page a huge store forever

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storeId = new URL(req.url).searchParams.get("storeId");

  if (!(await hasAppSession())) {
    if (!storeId) return NextResponse.json({ code: "unauthorized" }, { status: 401 });
    const locale = localeFromRequest(req);
    const key = encodeURIComponent(storeId);
    try {
      for (let page = 1; page <= PUBLIC_MAX_PAGES; page++) {
        const raw = await appPublicCall(`/public/stores/${key}/equipment?page=${page}&limit=${PUBLIC_LIMIT}`, locale);
        const list = extractStoreList(raw);
        const hit = list.find((e) => String(e.id ?? "") === id);
        if (hit) return NextResponse.json(mapEquipmentDetail(hit));
        if (list.length < PUBLIC_LIMIT) break; // last page
      }
      return NextResponse.json({ code: "not_found" }, { status: 404 });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  }

  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/equipment/${encodeURIComponent(id)}`);
      return NextResponse.json(mapEquipmentDetail(raw as Record<string, unknown>));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
