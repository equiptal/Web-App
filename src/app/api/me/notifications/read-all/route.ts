import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * PUT /api/me/notifications/read-all — mark every notification read.
 * Proxies `PUT /notifications/read-all` → `{ count }`.
 */
export async function PUT(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call<{ count?: number }>("/notifications/read-all", { method: "PUT" })) ?? {};
      return NextResponse.json({ count: raw.count ?? 0 });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
