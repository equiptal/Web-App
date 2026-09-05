/**
 * web notifications (bell) — wire types + deep-link mapper.
 * Source: shared app backend `GET /notifications/me` (list, already localized by `language`),
 * `PUT /notifications/{id}/read`, `PUT /notifications/read-all`. There is NO unread-count endpoint —
 * the badge reads `meta.total` from a `filter=unread&page=1` list call.
 */

export type NotificationFilter = "all" | "read" | "unread";

/** One notification row (mirrors the app's NotificationItem; `title`/`body` are pre-localized). */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  roleContext: "rentee" | "supplier" | "both" | string;
  isRead: boolean;
  createdAt: string; // ISO
  data?: Record<string, unknown>;
}

export interface NotificationList {
  data: NotificationItem[];
  meta: { page: number; limit: number; total: number };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function mapNotification(raw: unknown): NotificationItem {
  const n = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(n.id ?? ""),
    type: str(n.type) ?? "",
    title: str(n.title) ?? "",
    body: str(n.body) ?? "",
    roleContext: str(n.roleContext) ?? "both",
    isRead: n.isRead === true,
    createdAt: str(n.createdAt) ?? "",
    data: (n.data && typeof n.data === "object" ? (n.data as Record<string, unknown>) : undefined),
  };
}

export function mapNotificationList(raw: unknown): NotificationList {
  // IMPORTANT: `withAuthedBackend`'s call() unwraps the backend `{ success, data, meta }` envelope to
  // `body.data`, so for a paginated list `raw` arrives as the ITEMS ARRAY and the envelope `meta` is
  // dropped. Accept BOTH shapes — the unwrapped array, or a `{ data, meta }` object — otherwise the list
  // is always empty (`raw.data` is undefined on an array) and the badge count is always 0.
  const r = (raw ?? {}) as Record<string, unknown>;
  const arr: unknown[] = Array.isArray(raw) ? raw : Array.isArray(r.data) ? (r.data as unknown[]) : [];
  const data = arr.map(mapNotification);
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
  return {
    data,
    // `meta` is dropped by the envelope unwrap for lists → fall back to the page's item count (the
    // unread page length ≤ 20 is a good-enough badge; there is no separate unread-count endpoint).
    meta: {
      page: num(meta.page, 1),
      limit: num(meta.limit, data.length),
      total: num(meta.total, data.length),
    },
  };
}

/**
 * Web route a notification should open, derived from its `type` + `data` (app parity, renter-only —
 * `roleContext` is ignored because the web is the rentee surface). `null` → display-only (no target),
 * the bell just marks it read on click.
 */
export function notificationHref(n: NotificationItem): string | null {
  const d = n.data ?? {};
  // `d.requestId` is deliberately not read any more — see the note on the switch below.
  const dealRoomId = str(d.dealRoomId);
  // Every one of these used to name a page of its own — `/requests/{id}`, its `?view=bids` variant,
  // and `/compare`. All three are the one workspace now (docs/requests-workspace-disabled.md), which
  // opens on the renter's newest request and holds its bids and the comparison as tabs. The id is
  // dropped rather than carried through a redirect: the workspace resolves its own selection, and a
  // stale id would point at a request that may no longer be there to show.
  switch (n.type) {
    case "request.broadcast":
    case "request.direct":
    case "bid.received":
    case "bid.accepted":
    case "RFQ_CLOSED_FOMO":
      return "/requests";
    default:
      break;
  }
  if (n.type.startsWith("deal.")) return dealRoomId ? `/deal-room/${dealRoomId}` : "/inbox";
  if (n.type.startsWith("verification.")) return "/verify";
  // company.join_requested / join_approved / member_left / removed / promoted / demoted / dissolved.
  // All open the hub — including `removed`/`dissolved`, where it correctly shows the join form and so
  // explains why the firm's shared requests and equipment just vanished. Without this the owner's
  // "New join request" would be a dead, unclickable row with no route to the Approve button.
  //
  // `/profile`, not `/company`: the hub is a block on the profile since 2026-09-04. The old route
  // still 308s there from the edge, so an already-delivered notification is not broken either.
  if (n.type.startsWith("company.")) return "/profile";
  // equipment.* / job.* / support.reply / admin.* / message.new / referral.* → display-only.
  return null;
}
