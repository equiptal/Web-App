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
 * The reply detail a notice quotes — `↩ ref · serial`, taken from the ASK the supplier answered
 * rather than from his reply, because only the ask carries the machine's serial (§7.3 stamps it
 * server-side from the resolved listing).
 */
export interface DockReplyDigest {
  ref: string;
  serial: string | null;
  resolution: "provided" | "declined" | "unavailable";
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
