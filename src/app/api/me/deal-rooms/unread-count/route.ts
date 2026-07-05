import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";

/**
 * GET /api/me/deal-rooms/unread-count — total unread deal-room messages for the renter (role-scoped).
 * Proxies `GET /api/deal-rooms/unread-count`, which returns `{ total }` (NOT `count`).
 */
export async function GET(req: Request) {
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = (await call<{ total?: number }>("/api/deal-rooms/unread-count")) ?? {};
      return NextResponse.json({ total: raw.total ?? 0 });
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
