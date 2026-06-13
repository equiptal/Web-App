import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapStoreDetail } from "@/lib/contract/stores";

/**
 * GET /api/stores/:id — a single store's detail + its active equipment (web-app/004, AC-18/19/20/24).
 * Proxies the shared backend `GET /stores/{storeId}` (read-only); the backend increments the store's
 * view count as a side effect. Equipment pagination/filtering params are forwarded.
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
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/stores/${encodeURIComponent(id)}${suffix}`);
      return NextResponse.json(mapStoreDetail(raw as Record<string, unknown>));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
