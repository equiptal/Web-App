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

/** What {@link StreamLease.connect} rejects with when the lease was released mid-flight. Not a
 *  failure to report: the caller asked for a connection and then went away, which is ordinary. */
export const STREAM_LEASE_RELEASED = "stream: lease released";

/**
 * One caller's reference on the shared client, given back **exactly once** — including when the
 * caller goes away while the connect is still in flight.
 *
 * ── The defect this exists to prevent ────────────────────────────────────────────────────────────
 * A React effect cannot take the reference synchronously: the token has to be fetched first. The
 * obvious shape is therefore
 *
 * ```ts
 * let held = false;
 * const client = await acquireStream(id, token);
 * held = true;                                  // ← after the await
 * return () => { if (held) releaseStream(); };  // ← runs synchronously at unmount
 * ```
 *
 * and it is wrong. Cleanup runs **synchronously at unmount**, so leaving the room while the token
 * fetch or `connectUser` is still pending — slow network, a fast back-tap, StrictMode's double
 * effect in dev — reads `held === false`, releases nothing, and the reference is taken a moment
 * later with nobody left to give it back.
 *
 * The consequence is worse than the leak. With `refCount` stuck above zero, `connecting` is never
 * cleared, so **every later visit gets the cached client and never calls `connectUser` again with a
 * freshly fetched token**. Once the cached token expires the thread simply goes quiet, and there is
 * no error path for it.
 *
 * A lease inverts the ordering: the *intent to release* is recorded synchronously, and whichever of
 * the two runs last honours it. Create it before the first await, release it in cleanup or a
 * `finally`, and no interleaving can leak.
 */
export interface StreamLease {
  /** Connect (or join an existing connection) under this lease. Rejects with
   *  {@link STREAM_LEASE_RELEASED} if the lease was released before or during the attempt — in the
   *  latter case the reference it took has already been given back. */
  connect(userId: string, token: string): Promise<StreamChat>;
  /** Give back whatever this lease holds — now, or the moment an in-flight {@link connect} lands.
   *  Idempotent, and safe to call before `connect` was ever reached. */
  release(): void;
  /** Whether {@link release} has been called. */
  readonly released: boolean;
}

/** Open a lease. Call this **synchronously**, before any await, so cleanup always has it to release. */
export function leaseStream(): StreamLease {
  let released = false;
  let held = false;
  return {
    get released() {
      return released;
    },
    async connect(userId: string, token: string): Promise<StreamChat> {
      if (released) throw new Error(STREAM_LEASE_RELEASED);
      const client = await acquireStream(userId, token);
      // THE case the old shape got wrong: `release()` ran while this was in flight. The reference is
      // real now and the only code that could have given it back has already run — so give it back
      // here rather than pinning `refCount` above zero for the rest of the session.
      if (released) {
        releaseStream();
        throw new Error(STREAM_LEASE_RELEASED);
      }
      held = true;
      return client;
    },
    release(): void {
      if (released) return;
      released = true;
      // Nothing taken yet — `connect` will give back whatever it ends up taking.
      if (!held) return;
      held = false;
      releaseStream();
    },
  };
}

/** Watch one deal room's channel on the shared client. */
export async function watchDealRoom(client: StreamChat, dealRoomId: string): Promise<Channel> {
  const channel = client.channel("messaging", dealRoomChannelId(dealRoomId));
  await channel.watch();
  return channel;
}
