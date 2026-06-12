import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { mapEquipmentDetail } from "@/lib/contract/stores";

/**
 * GET /api/equipment/:id — full equipment detail for the renter's equipment sheet (web-app/004
 * follow-up; mirrors the app's public equipment detail). Proxies the shared backend
 * `GET /equipment/{equipmentId}` (read-only); photos come back as backend-signed URLs, documents
 * as type labels only (no contents surfaced to the renter).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/equipment/${encodeURIComponent(id)}`);
      return NextResponse.json(mapEquipmentDetail(raw as Record<string, unknown>));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
