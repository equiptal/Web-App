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
 * Guests have no token, and read `GET /public/equipment/{id}` — the PII-safe projection (no account
 * ids, no documents, no operating hours, city but no yard coordinates). `?storeId=` is no longer
 * needed to answer them and is only a hint for the page's back link.
 *
 * ⚠️ The fallback below is the OLD guest path and stays until every environment has the public
 * equipment route deployed: it resolves the listing by scanning that store's public equipment pages.
 * It needs a `storeId`, reads up to 1000 rows to answer about one, and is why a shared equipment link
 * without a store id used to 401. Delete it once staging and prod both answer `/public/equipment/{id}`.
 */
const PUBLIC_LIMIT = 200; // the public equipment route caps `limit` at 200
const PUBLIC_MAX_PAGES = 5; // 1000 listings; stop rather than page a huge store forever

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storeId = new URL(req.url).searchParams.get("storeId");

  if (!(await hasAppSession())) {
    const locale = localeFromRequest(req);
    try {
      const raw = await appPublicCall(`/public/equipment/${encodeURIComponent(id)}`, locale);
      return NextResponse.json(mapEquipmentDetail(raw as Record<string, unknown>));
    } catch {
      // Not deployed yet (or a genuine 404) → the store-scan fallback, when we have a store to scan.
      if (!storeId) return NextResponse.json({ code: "not_found" }, { status: 404 });
    }
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
