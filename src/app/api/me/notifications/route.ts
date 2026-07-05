import { NextResponse } from "next/server";
import { withAuthedBackend, appAuthErrorResponse } from "@/lib/api/app-backend-authed";
import { localeFromRequest } from "@/lib/api/auth-server";
import { mapNotificationList, type NotificationFilter } from "@/lib/contract/notifications";

/**
 * GET /api/me/notifications?page=<int≥1>&filter=<all|read|unread> — the renter's notifications
 * (web bell). Proxies `GET /notifications/me`, forwarding the UI locale as `language` so titles/bodies
 * come back localized. The badge uses this with `filter=unread&page=1` and reads `meta.total`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const f = url.searchParams.get("filter");
  const filter: NotificationFilter = f === "read" || f === "unread" ? f : "all";
  const language = localeFromRequest(req) === "ar" ? "ar" : "en";
  const qs = new URLSearchParams({ page: String(page), filter, language });
  return withAuthedBackend(req, async (call) => {
    try {
      const raw = await call(`/notifications/me?${qs.toString()}`);
      return NextResponse.json(mapNotificationList(raw));
    } catch (err) {
      return appAuthErrorResponse(err);
    }
  });
}
