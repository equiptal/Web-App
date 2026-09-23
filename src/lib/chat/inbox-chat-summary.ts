/**
 * **Reads each inbox row's last line of conversation out of Stream**, in as few calls as Stream
 * allows for the whole screen. The web half of the app's
 * `features/inbox/data/inbox_chat_summary.dart` (owner, 2026-09-22: *"align the web with"*).
 *
 * ── Why Stream and not the API ───────────────────────────────────────────────────────────────────
 * The received-bids feed carries `unreadCount` and nothing else about the conversation, because the
 * backend stores no message: **the channel IS the record**. Adding `lastMessageText` / `lastMessageAt`
 * to the feed would make the API re-read Stream on every list load, and this client already holds a
 * credential that can ask Stream directly.
 *
 * ── Failure is silent, by design ─────────────────────────────────────────────────────────────────
 * The list paints BEFORE this read and never waits for it. A room this reader knows nothing about —
 * or a Stream outage — keeps the `equipment · REQ-xxxxx` subtitle, which is exactly the pre-chat
 * row. The chat line is decoration over a list that already works, so {@link readInboxChatSummaries}
 * never throws.
 */

import type { StreamChat } from "stream-chat";
import { dealRoomChannelId } from "@/lib/chat/stream-connection";
import {
  summarizeChannelMessages,
  type InboxChatSummary,
  type SummarizableMessage,
  type SummarizableRead,
} from "@/lib/contract/inbox-chat";

/**
 * How many recent messages per room are searched for the newest survivor.
 *
 * ⚠️ Deleted messages still arrive in channel state, so the walk goes backwards from the end. A
 * whole page of recent deletions in one room is the only way this window comes up short, and the
 * failure is the benign one: that row keeps its equipment subtitle.
 */
const SUMMARY_MESSAGE_WINDOW = 30;

/**
 * How many rooms ONE Stream query may return.
 *
 * 🔴 **A hard ceiling, not a tuning knob** — Stream caps a channel query's `limit` at 30. The inbox
 * loads every received bid, so the ids are CHUNKED and queried in ceil(n/30) sequential calls;
 * without that, rooms 31 and after would silently keep the pre-chat subtitle for ever. The app
 * records the same trap, having shipped the single-query version first.
 */
const CHANNEL_PAGE_LIMIT = 30;

/**
 * The last-message summary of each of `dealRoomIds`, keyed by deal-room id.
 *
 * Returns an empty map — touching no network at all — when there is nothing to ask about. A room
 * absent from the result has no messages, or only deleted ones: its row keeps the subtitle it
 * already shows.
 *
 * ⚠️ **Never throws.** Stream being unreachable means every row keeps its equipment subtitle, which
 * is the correct degradation for a presentation-only line.
 */
export async function readInboxChatSummaries({
  client,
  currentUserId,
  dealRoomIds,
}: {
  client: StreamChat;
  currentUserId: string;
  dealRoomIds: string[];
}): Promise<Map<string, InboxChatSummary>> {
  const out = new Map<string, InboxChatSummary>();
  const ids = [...new Set(dealRoomIds.filter(Boolean))];
  if (!ids.length || !currentUserId) return out;

  /** Stream's channel id ↔ our deal-room id. The prefix is a pure function of the room id
   *  (`dealRoomChannelId`), so no per-room token call is needed to learn it. */
  const byChannelId = new Map(ids.map((id) => [dealRoomChannelId(id), id]));
  const channelIds = [...byChannelId.keys()];

  try {
    for (let start = 0; start < channelIds.length; start += CHANNEL_PAGE_LIMIT) {
      const slice = channelIds.slice(start, start + CHANNEL_PAGE_LIMIT);
      const channels = await client.queryChannels(
        {
          // Stream requires a query scoped to the caller's own channels, and it is true
          // independently: these are his rooms.
          members: { $in: [currentUserId] },
          id: { $in: slice },
        },
        [{ last_message_at: -1 }],
        {
          // No interest to register and no presence to deliver: this is a list read, not a room
          // the renter is staring at. The open conversation does its own watching.
          watch: false,
          state: true,
          message_limit: SUMMARY_MESSAGE_WINDOW,
          limit: CHANNEL_PAGE_LIMIT,
        },
      );

      for (const channel of channels) {
        const dealRoomId = byChannelId.get(channel.id ?? "");
        if (!dealRoomId) continue;
        const messages: SummarizableMessage[] = (channel.state?.messages ?? []).map((m) => ({
          type: m.type,
          text: m.text ?? null,
          deletedAt: m.deleted_at ?? null,
          createdAt: m.created_at ?? null,
          user: m.user ? { id: m.user.id } : null,
        }));
        const reads: SummarizableRead[] = Object.values(channel.state?.read ?? {}).map((r) => ({
          userId: r.user?.id ?? "",
          lastRead: r.last_read,
        }));
        const otherMemberIds = new Set(
          Object.values(channel.state?.members ?? {})
            .map((m) => m.user_id ?? m.user?.id ?? "")
            .filter((id) => id && id !== currentUserId),
        );
        const summary = summarizeChannelMessages({ messages, reads, otherMemberIds, currentUserId });
        if (summary) out.set(dealRoomId, summary);
      }
    }
  } catch {
    // Presentation-only line: give up. The rows keep the equipment subtitle rather than showing a
    // broken one, and whatever this call already resolved is kept rather than thrown away.
  }
  return out;
}
