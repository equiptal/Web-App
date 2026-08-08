/**
 * 004a §4a.3 — **one owner for the Stream connection, reference-counted.**
 *
 * ── The defect this exists to prevent ────────────────────────────────────────────────────────────
 * `StreamChat.getInstance(key)` is a **singleton**, and `DealRoom.tsx`'s cleanup used to call
 * `client?.disconnectUser()` unconditionally on unmount (`:394`). One component owning a process-wide
 * singleton is safe only while exactly one component ever mounts it. The chat dock (V12) breaks that
 * assumption: the moment two surfaces are connected at once — or one unmounts while the other is
 * still reading — the leaver disconnects the stayer's client, and the stayer's channels go silent
 * with no error anywhere.
 *
 * So connect/release live here, and **the last release disconnects, never the first**.
 *
 * ── The token ────────────────────────────────────────────────────────────────────────────────────
 * `GET /api/me/deal-rooms/{id}/stream-token` is addressed by room, but the token it returns is a
 * **user** token — Stream's own model. So N tabs need ONE token, fetched from any room the renter is
 * party to, and each tab then watches its own channel on the shared client (004a §4a.3.3). Fetching
 * one token per tab would be N round-trips for one credential.
 */

import { StreamChat, type Channel } from "stream-chat";

export const STREAM_API_KEY = process.env.NEXT_PUBLIC_STREAM_API_KEY ?? "";

/** Deal-room channel id, as the backend mints it (`deal-room.service.ts:951`). Derived rather than
 *  fetched per room: the stream-token route would otherwise be called once per tab purely to learn a
 *  string that is a pure function of the room id. */
export function dealRoomChannelId(dealRoomId: string): string {
  return `deal_room_${dealRoomId}`;
}

let refCount = 0;
let connecting: Promise<StreamChat> | null = null;
let connectedUserId: string | null = null;

/**
 * Connect (or join an existing connection) and take a reference. **Every successful call must be
 * paired with exactly one {@link releaseStream}** — the connection lives until the last one releases.
 *
 * A failure takes no reference, so a caller that throws does not pin the client open forever.
 */
export async function acquireStream(userId: string, token: string): Promise<StreamChat> {
  if (!STREAM_API_KEY) throw new Error("stream: no api key");
  // A different user means the previous session is stale, not shareable — drop it rather than hand
  // back a client authenticated as someone else.
  if (connecting && connectedUserId !== userId) {
    const stale = connecting;
    connecting = null;
    connectedUserId = null;
    refCount = 0;
    void stale.then((c) => c.disconnectUser()).catch(() => {});
  }
  if (!connecting) {
    connectedUserId = userId;
    const client = StreamChat.getInstance(STREAM_API_KEY);
    connecting = client.connectUser({ id: userId }, token).then(() => client);
  }
  const pending = connecting;
  try {
    const client = await pending;
    refCount += 1;
    return client;
  } catch (err) {
    // Only the attempt that owns the failed promise clears it; a later caller that already replaced
    // it must not have its own connection torn out from under it.
    if (connecting === pending) {
      connecting = null;
      connectedUserId = null;
    }
    throw err;
  }
}

/** Give up one reference. Disconnects only when it was the last. Safe to call more than once — an
 *  extra release cannot push the count below zero and so cannot disconnect a live owner. */
export function releaseStream(): void {
  if (refCount === 0) return;
  refCount -= 1;
  if (refCount > 0) return;
  const pending = connecting;
  connecting = null;
  connectedUserId = null;
  void pending?.then((c) => c.disconnectUser()).catch(() => {});
}

/** Watch one deal room's channel on the shared client. */
export async function watchDealRoom(client: StreamChat, dealRoomId: string): Promise<Channel> {
  const channel = client.channel("messaging", dealRoomChannelId(dealRoomId));
  await channel.watch();
  return channel;
}
