/**
 * Spec 004 §6.9 + 004a §2 — **V12's chat dock, as rules only.**
 *
 * ── Why tabs, and why one per item ───────────────────────────────────────────────────────────────
 * `DealRoom.bidId` is `@unique`, and the backend fans a multi-item RFQ into one request per item, so
 * **one bid = one item = one deal room = one Stream channel**. A supplier bidding on three items has
 * three channels. Merging them would mean inventing a fourth channel and re-parenting messages;
 * tabbing them presents the same rooms honestly.
 *
 * ── One counterparty, not two people ─────────────────────────────────────────────────────────────
 * Grouped by `bidSupplierKey` — company → member → name. Two members of one firm are ONE
 * counterparty because the backend already treats them so: `supplierBidScopeWhere` scopes bids by
 * company, and the deal room adds every active colleague of both firms to the same channel, so the
 * two members are literally reading and writing the same conversation (RM3-AC-45).
 *
 * ── Unread is REST, not a socket ─────────────────────────────────────────────────────────────────
 * Per-tab counts come from `GET /marketplace/received-bids` rows (`bidId` + `unreadCount`), which is
 * also why the arrival notice below is **refresh-timed** and its copy may never imply immediacy
 * (RM3-AC-64).
 *
 * **NO React, NO DOM, NO i18n.**
 */

import { bidSupplierKey } from "./bids";
import type { InboxBid } from "./inbox";

/** One item's conversation. */
export interface DockTab {
  bidId: string;
  /** Null = **compose-only**. The tab still appears; the room is created by the SEND, never by
   *  opening the tab (RM3-AC-47) — a `DealRoom` row freezes the supplier's offered count. */
  dealRoomId: string | null;
  /** The ITEM, because that is what distinguishes one tab from another — never the supplier, who is
   *  the same across every tab in the strip. */
  label: string | null;
  unreadCount: number;
  /** The bid this surface is scoped to. Exactly one tab carries it. */
  current: boolean;
}

/** The bid the surface is open on, as the dock needs to identify its counterparty and its item. */
export interface DockAnchor {
  bidId: string;
  supplierCompanyId: string | null;
  supplierId: string | null;
  supplierName: string;
  dealRoomId: string | null;
  label: string | null;
  /** The RFQ group the bid's request belongs to (`requestGroupId`), falling back to the request id. */
  groupKey: string | null;
}

/** The RFQ group a row belongs to. `requestGroupId` collapses a multi-item RFQ's fan-out siblings;
 *  without it the request's own id is the group, which simply means the row has no siblings. */
export function inboxGroupKey(row: InboxBid): string {
  return row.request.groupId ?? row.request.id ?? row.bidId;
}

const rowLabel = (row: InboxBid): string | null =>
  row.equipmentType.name ?? row.request.equipmentSummary ?? row.equipmentName;

/**
 * The dock's tabs: every bid **this counterparty** holds in **this RFQ group**, in the order the feed
 * returned them.
 *
 * The anchor bid always gets a tab, even when the received-bids page did not contain it — a dock that
 * could not open the conversation for the bid the renter is looking at would be a worse failure than
 * a strip with one tab in it.
 *
 * **A single-bid supplier gets one tab and no strip** (RM3-AC-44). The caller reads that off
 * `tabs.length > 1` rather than a flag, so the two can never disagree.
 */
export function dockTabs(anchor: DockAnchor, rows: InboxBid[]): DockTab[] {
  const key = bidSupplierKey(anchor);
  // The anchor's own group, preferred from the feed's row for it (which carries `requestGroupId`
  // straight from the backend) and falling back to whatever the caller resolved.
  const anchorRow = rows.find((r) => r.bidId === anchor.bidId) ?? null;
  const group = anchorRow ? inboxGroupKey(anchorRow) : anchor.groupKey;

  const tabs: DockTab[] = [];
  for (const row of rows) {
    if (bidSupplierKey(row) !== key) continue;
    // A null group on both sides would match every ungrouped row of the same supplier, so an
    // unresolved group is treated as "no siblings" rather than "all of them".
    if (group == null || inboxGroupKey(row) !== group) {
      if (row.bidId !== anchor.bidId) continue;
    }
    tabs.push({
      bidId: row.bidId,
      dealRoomId: row.dealRoomId,
      label: rowLabel(row),
      unreadCount: row.unreadCount > 0 ? row.unreadCount : 0,
      current: row.bidId === anchor.bidId,
    });
  }
  if (!tabs.some((t) => t.current)) {
    tabs.unshift({
      bidId: anchor.bidId,
      dealRoomId: anchor.dealRoomId,
      label: anchor.label,
      unreadCount: 0,
      current: true,
    });
  }
  return tabs;
}

/** The badge on the dock control: everything unread across this counterparty's tabs. */
export function dockUnreadTotal(tabs: DockTab[]): number {
  return tabs.reduce((sum, t) => sum + t.unreadCount, 0);
}

/**
 * The rooms {@link dockTabs} could not know about, folded in.
 *
 * `dockTabs` reads the received-bids feed, and a room created a moment ago is not on it yet. Two
 * sources fill that gap, and the second one is the owner's UAT of 2026-08-11:
 *
 *  · **`fresh`** — rooms this dock created by sending a message;
 *  · **`surfaceRoomId`** — the ANCHOR bid's room as the surface knows it, which includes the one the
 *    ask-send created. Sending a request card creates the room, and until this existed the dock had
 *    no way to hear about it: the card was posted into a conversation the dock was still calling
 *    compose-only, so it rendered «لا رسائل بعد» and the renter's ask was nowhere. On a bid that the
 *    feed's first page does not contain, that wait never ends at all.
 *
 * **Only ever ADDS.** A tab that already has a room keeps it, so a stale value cannot disconnect a
 * live conversation, and the feed — which is the authority — always wins.
 */
export function dockTabsWithKnownRooms(
  tabs: DockTab[],
  known: { fresh?: Record<string, string>; anchorBidId: string; surfaceRoomId?: string | null },
): DockTab[] {
  return tabs.map((tab) => {
    if (tab.dealRoomId) return tab;
    const extra =
      known.fresh?.[tab.bidId] ?? (tab.bidId === known.anchorBidId ? known.surfaceRoomId ?? null : null);
    return extra ? { ...tab, dealRoomId: extra } : tab;
  });
}

/* ── which conversation the dock reads (owner's UAT, 2026-08-11) ─────────────────────────────────
 *
 * **`open` is not a term of this, and that is the whole fix.**
 *
 * The channel is the ONLY record of a request card — there is no table and no status column (§7.3) —
 * so the surface's ask controls are gated on what the dock reads out of it. Until now the dock
 * connected only while it was open, which made that record exist only while the renter was looking
 * at it: he sent an ask, reloaded the page, and every control came back live because the set that
 * blocks them is rebuilt from messages the dock no longer held. Pressing one then reached the
 * backend's own guard and came back 409 — proof the ask had been sent and only the UI had forgotten.
 *
 * So the anchor bid's room is watched from mount whether the dock is open or shut. His ruling:
 * *"remain blocked and will never open it again for the renter if asked once, and only change when
 * the supplier replied."* A closed dock is not a reason to forget.
 */
export function dockWatchRoomId(input: {
  /** The tab the renter is reading — only meaningful while the dock is open. */
  activeRoomId: string | null;
  /** The room belonging to the bid this surface resolves. Its asks are what the controls are gated
   *  on, so it is what a closed dock reads. */
  anchorRoomId: string | null;
  open: boolean;
}): string | null {
  return input.open ? input.activeRoomId : input.anchorRoomId;
}

/**
 * Whether the dock may report the outstanding asks it has read.
 *
 * Silence, never an empty set, when it cannot say: an empty set is a claim that the supplier owes
 * nothing, and made out of our own ignorance it re-enables a control the renter has already used.
 * Two conditions, and only two — the messages in hand came from the ANCHOR bid's own room, and there
 * are some. Neither of them is "the dock is open".
 */
export function dockMayReportAsks(input: {
  /** The room the messages currently held were loaded from. */
  loadedRoomId: string | null;
  anchorRoomId: string | null;
  messageCount: number;
}): boolean {
  return (
    input.loadedRoomId != null && input.loadedRoomId === input.anchorRoomId && input.messageCount > 0
  );
}

/* ── what a message HAS, so the dock cannot drop one silently ───────────────────────────────────── */

/**
 * One attachment, classified the way **both** chat surfaces classify it.
 *
 * The dock and `/deal-room/[id]` read the same Stream channel, so a message that renders in one and
 * vanishes in the other is not a difference in chrome — it is the renter seeing an unread badge,
 * opening the dock, and finding nothing there. Unread counts every message; the dock must therefore
 * be able to show something for every message.
 */
export interface DockAttachment {
  /** `image` gets a thumb, `audio` a player, everything else a named link. */
  kind: "image" | "audio" | "file";
  /** What the element opens — the full image, the audio source, the file itself. */
  url: string | null;
  /** Stream's small preview, when it minted one. Images only. */
  thumbUrl: string | null;
  /** The sender's own title for it, when there is one; the caller localises a fallback. */
  title: string | null;
  mimeType: string | null;
}

/** A shared point, as the app and the deal room send it (`custom.kind === "location"`). */
export interface DockLocation {
  lat: number;
  lng: number;
}

/** Everything a dock bubble can carry. `empty` is the ONLY case the dock may render nothing for. */
export interface DockMessageView {
  text: string | null;
  location: DockLocation | null;
  attachments: DockAttachment[];
  empty: boolean;
}

/** The raw Stream message shape both surfaces receive. */
export interface DockRawMessage {
  text?: string;
  attachments?: {
    type?: string;
    image_url?: string;
    thumb_url?: string;
    asset_url?: string;
    title?: string;
    mime_type?: string;
    fallback?: string;
  }[];
  custom?: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

/**
 * Read one message into what the dock has to show for it.
 *
 * The dock used to render `if (!m.text) return null` — an attachment-only or location-only message
 * became a silent gap that the unread count still included. The classification lives here rather
 * than in the component so it is the SAME classification the deal room applies, and so a message
 * kind that neither surface can show is a failing assertion rather than an invisible bubble.
 */
export function dockMessageView(m: DockRawMessage): DockMessageView {
  const custom = m.custom ?? {};
  const lat = num(custom.lat);
  const lng = num(custom.lng);
  const location = custom.kind === "location" && lat != null && lng != null ? { lat, lng } : null;

  const attachments: DockAttachment[] = (m.attachments ?? []).map((a) => {
    const mimeType = a.mime_type ?? null;
    const kind: DockAttachment["kind"] =
      a.type === "image" ? "image" : a.type === "audio" || (mimeType ?? "").startsWith("audio/") ? "audio" : "file";
    return {
      kind,
      url: (kind === "image" ? a.image_url || a.thumb_url : a.asset_url) || a.asset_url || a.image_url || null,
      thumbUrl: kind === "image" ? a.thumb_url || a.image_url || null : null,
      title: a.title ?? a.fallback ?? null,
      mimeType,
    };
  });

  const text = m.text && m.text.trim() ? m.text : null;
  return { text, location, attachments, empty: !text && !location && attachments.length === 0 };
}

/* ── what the bubble QUOTES (owner, 2026-08-11) ──────────────────────────────────────────────────
 *
 * *"The bubble never shows what was actually said."* It read «رسالة جديدة» + the supplier's name +
 * the item's type — three things the renter already knew — and the one thing he opened the dock to
 * find out, the words themselves, were not on it.
 *
 * The dock CAN say them, and could all along: since `dockWatchRoomId` the anchor bid's channel is
 * watched open or shut, so the messages the bubble is announcing are already in hand. Unread is
 * still REST and the notice is still refresh-timed — quoting a message the dock is holding claims
 * no recency the badge does not already claim.
 *
 * **The LAST INCOMING message, and only it.** Walking further back to find something with words in
 * it would quote a remark the supplier made an hour ago as though it were the arrival, so a card- or
 * attachment-only message answers `{ text: null }` and the caller falls back to naming the kind of
 * arrival rather than putting the wrong sentence in quotes.
 */
export interface DockNoticeMessage extends DockRawMessage {
  user?: { id?: string };
}

/** What the bubble has to show for the arrival. `text` null with `attachment` true is a file or a
 *  point — something was said, just not in words. */
export interface DockNoticeQuote {
  text: string | null;
  attachment: boolean;
}

/**
 * The words the arrival bubble quotes, out of the conversation the dock is already watching.
 *
 * **Null when it cannot tell whose message is whose** (`myUserId == null`, i.e. the connection has
 * not resolved yet): quoting the renter's own last line back at him as the supplier's arrival is
 * worse than the generic copy the caller falls back to. Null too when this side of the conversation
 * has said nothing at all — there is no arrival to quote.
 */
export function dockNoticeQuote(
  messages: readonly DockNoticeMessage[],
  myUserId: string | null,
): DockNoticeQuote | null {
  if (!myUserId) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    // Mine are skipped, never quoted: a bubble about an arrival must not read back what I sent.
    if (m.user?.id === myUserId) continue;
    const view = dockMessageView(m);
    return { text: view.text, attachment: view.attachments.length > 0 || view.location != null };
  }
  return null;
}

/**
 * The reply detail a notice quotes — `↩ ref · serial`, taken from the ASK the supplier answered
 * rather than from his reply, because only the ask carries the machine's serial (§7.3 stamps it
 * server-side from the resolved listing).
 */
export interface DockReplyDigest {
  ref: string;
  serial: string | null;
  /** `partial` — he sent something OTHER than what was asked (owner ruling, 2026-08-11, §8). It is
   *  an answer, so it raises the bubble like any other; it is not a refusal, so it must not take the
   *  bubble's refusal tone — see `ChatDock`'s `refusal`. */
  resolution: "provided" | "declined" | "unavailable" | "partial";
}

/** The bubble on the dock (004a §2.1). */
export interface DockNotice {
  bidId: string;
  label: string | null;
  unreadCount: number;
  /** Null when the unread is ordinary chat rather than an answer to a request. */
  reply: DockReplyDigest | null;
}

/**
 * The arrival notice, **refresh-timed** (004a §2.1).
 *
 * There is no socket behind this: unread comes from `GET /marketplace/received-bids`, so the notice
 * appears on mount · focus · post-send · the poll. The copy the caller renders must therefore read
 * *"you have a reply"* and never *"just arrived"* (RM3-AC-64) — a notice that claims a recency it
 * cannot know is worse than a quiet badge.
 *
 * **Nothing is shown for the tab the renter is reading** (RM3-AC-63): unread on an open, connected
 * tab is being cleared as he looks at it, and a bubble about it would announce a message already on
 * screen.
 */
export function arrivalNotice(
  tabs: DockTab[],
  replies: Record<string, DockReplyDigest | undefined>,
  reading: { open: boolean; bidId: string | null },
): DockNotice | null {
  for (const tab of tabs) {
    if (tab.unreadCount <= 0) continue;
    if (reading.open && tab.bidId === reading.bidId) continue;
    return {
      bidId: tab.bidId,
      label: tab.label,
      unreadCount: tab.unreadCount,
      reply: replies[tab.bidId] ?? null,
    };
  }
  return null;
}
