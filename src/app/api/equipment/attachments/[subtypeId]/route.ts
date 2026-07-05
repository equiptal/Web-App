import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import type { SubtypeAttachmentOption } from "@/lib/contract/app";

/**
 * GET /api/equipment/attachments/:subtypeId — the admin-configured attachment list for an equipment
 * subtype, used by the request wizard's per-item "Attachments" picker. Proxies the shared backend
 * `GET /equipment/attachments/{subtypeId}` (read-only), which returns `[{ id, name, nameAr, preSelected }]`.
 * The renter selects from these (ids → `attachment_ids`) and may add free-text ones (`custom_attachments`).
 */
export async function GET(req: Request, { params }: { params: Promise<{ subtypeId: string }> }) {
  const { subtypeId } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      const data = await call<SubtypeAttachmentOption[]>(`/equipment/attachments/${encodeURIComponent(subtypeId)}`);
      return NextResponse.json(Array.isArray(data) ? data : []);
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
