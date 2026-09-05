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
 * ── What the home page's bubble may show (owner, 2026-09-05) ─────────────────────────────────────
 * *"I want these to have the home page bubble."*
 *
 * Six types, and the rule behind the six is that each one means **a supplier just moved on your
 * money**: an offer arrived, its price changed, it was edited, a counter was answered, a rate was
 * proposed or answered. Everything else a renter receives — a term edited inside a room he is
 * already reading, a company roster change, a referral reward — stays in the bell, where it still
 * gets an exact link.
 *
 * The bubble reads UNREAD only, so a renter who has opened the bell is not told twice.
 */
export const HOME_BUBBLE_TYPES: readonly string[] = [
  "bid.received",
  "bid.price_changed",
  "bid.updated",
  "bid.countered",
  "deal.rate_proposed",
  "deal.rate_response",
];

/** Is this row one the home bubble may raise? Unread is the caller's filter, not this one's. */
export function isBubbleWorthy(n: NotificationItem): boolean {
  return HOME_BUBBLE_TYPES.includes(n.type);
}

/**
 * Web route a notification should open, derived from its `type` + `data`. `null` → nothing to open,
 * and the bell only marks it read.
 *
 * ── Rewritten 2026-09-05, because almost nothing was wired ────────────────────────────────────────
 * *"Notifications are view-only and not wired to anything. Each bid must go directly to the exact
 * request, and every other notification must be wired to where it belongs too."*
 *
 * Two faults, and they compounded:
 *
 *  1. **Six types were handled and the rest fell through to `null`** — a renter's whole bid
 *     lifecycle (`bid.updated`, `bid.price_changed`, `bid.countered`, `bid.expired`) and every
 *     `deal.*` past the prefix test were inert rows.
 *  2. **The links that did exist pointed at retired routes.** `/requests/<id>` and `/compare` were
 *     replaced by the one workspace on 2026-08-25, and `middleware.ts` 308s them to `/requests`
 *     WITH THE ID AND THE QUERY DROPPED. So «a supplier bid on your request» landed on whichever
 *     request the workspace happened to resolve — the exact complaint.
 *
 * The workspace takes `?r=<requestId>` and resolves the group and the item from it
 * (`RequestsWorkspace.tsx`), so that is the shape every request-scoped link uses now.
 *
 * **Half the old map was for the wrong audience.** `request.broadcast`, `request.direct`,
 * `bid.accepted`, `RFQ_CLOSED_FOMO`, `verification.*` and `equipment.*` are all emitted with
 * `roleContext: 'supplier'` — a renter never receives one. They are kept, deliberately: the same
 * account can hold both roles, and a supplier row landing somewhere sane costs one line.
 */
export function notificationHref(n: NotificationItem): string | null {
  const d = n.data ?? {};
  const requestId = str(d.requestId);
  const dealRoomId = str(d.dealRoomId) ?? str(d.conversationId);
  const bidId = str(d.bidId);

  /** The one request, in the workspace that replaced the per-request pages. */
  const request = requestId ? `/requests?r=${encodeURIComponent(requestId)}` : null;
  /** The conversation. It lives in the MAP's dock now (owner, 2026-08-26: the deal room is no longer
   *  somewhere a renter is sent to talk), so a bid id beats a room id when both are on the row. */
  const chat = bidId
    ? `/bids/${encodeURIComponent(bidId)}/equipment?chat=1`
    : dealRoomId
      ? `/deal-room/${encodeURIComponent(dealRoomId)}`
      : null;
  /** The three-styles negotiation sheet, which is what `?act=counter` opens. */
  const sheet = dealRoomId ? `/deal-room/${encodeURIComponent(dealRoomId)}?act=counter` : null;
  const room = dealRoomId ? `/deal-room/${encodeURIComponent(dealRoomId)}` : null;

  switch (n.type) {
    /* ── The bid lifecycle · every one of these is ABOUT a request, so it opens that request ───── */
    case "bid.received":
    case "bid.updated":
    case "bid.price_changed":
    case "bid.expired":
    case "bid.withdrawn":
      return request;

    /* The supplier answered a counter. That is a move on the sheet, not news about the request, so
       it opens the sheet — and falls back to the request when the row predates `dealRoomId`. */
    case "bid.countered":
      return sheet ?? request;

    /* ── The negotiation ─────────────────────────────────────────────────────────────────────── */
    case "deal.rate_proposed":
    case "deal.rate_response":
    case "deal.renegotiation_requested":
      return sheet ?? room;
    case "deal.created":
    case "deal.message":
    case "deal.term_updated":
    case "deal.abandoned":
    case "deal.released":
      return chat;
    /* The quotation is a view INSIDE the room, not a route — so the room is the deepest link there
       is, and it opens on the document it just closed. */
    case "deal.closed":
    case "deal.awaiting_confirmation":
    case "deal.acceptance_withdrawn":
      return room ?? "/inbox";

    /* ── Supplier-side rows, kept for a dual-role account ─────────────────────────────────────── */
    case "request.broadcast":
    case "request.direct":
    case "request.details_changed":
    case "request.fully_covered":
    case "bid.accepted":
      return request;
    case "RFQ_CLOSED_FOMO":
      return "/browse";

    default:
      break;
  }

  // Anything else in the deal family — the backend adds to it faster than this file learns the
  // names, and every one of them carries `dealRoomId`.
  if (n.type.startsWith("deal.")) return chat ?? "/inbox";
  if (n.type.startsWith("verification.")) return "/verify";
  // The firm's papers and its roster are a block on the profile since 2026-09-04; `/company` is
  // retired and 308s there, so linking to it would be one redirect for nothing.
  if (n.type.startsWith("company.")) return "/profile";
  if (n.type.startsWith("referral.")) return "/profile";
  // `post_deal_review_prompt` (jobs are off on the web), `equipment.*`, `admin.*`, `support.reply`,
  // `message.new`, `submission.rejected` → nothing on this product to open.
  return null;
}
