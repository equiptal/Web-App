import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * PUT /api/me/notifications/{id}/read — mark one notification read.
 * Proxies `PUT /notifications/{id}/read`.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withAuthedBackend(req, async (call) => {
    try {
      await call(`/notifications/${encodeURIComponent(id)}/read`, { method: "PUT" });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
