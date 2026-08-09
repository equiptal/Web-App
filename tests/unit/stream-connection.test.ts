import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * **004a §4a.3 — one owner for the Stream connection, reference-counted.**
 *
 * `StreamChat.getInstance(key)` is a singleton, so two surfaces (`/deal-room/[id]` and the map's chat
 * dock) share one client and the LAST release disconnects, never the first. Everything below is about
 * one thing: **a reference that is taken must come back exactly once.**
 *
 * The case that matters, and the one the shipped code got wrong, is *unmount during connect* — the
 * renter leaves while the token fetch or `connectUser` is still in flight. React runs effect cleanup
 * **synchronously** at unmount, so a `held = true` set *after* the await is still false when cleanup
 * reads it; the reference is then taken a moment later with nobody left to give it back. `refCount`
 * sticks above zero, `connecting` is never cleared, and every later visit is handed the cached client
 * and **never re-authenticated with a freshly fetched token** — after which the thread goes quiet with
 * no error path at all.
 *
 * The env is `node` with no component harness, so the unmount is modelled exactly as React performs
 * it: the lease is opened, the connect is left pending, `release()` is called synchronously, and only
 * then is `connectUser` allowed to land.
 */

// Hoisted above the imports so the module under test reads a key at load (it captures
// `process.env.NEXT_PUBLIC_STREAM_API_KEY` once, at module scope).
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_STREAM_API_KEY = "test-key";
});

const stream = vi.hoisted(() => ({
  /** Every `connectUser`, with the handle that lets a test decide WHEN it lands. */
  connects: [] as { userId: string; token: string; settle: (ok?: boolean) => void }[],
  disconnects: 0,
  /** When false, a connect stays pending until the test settles it — i.e. the renter is still waiting. */
  auto: true,
}));

vi.mock("stream-chat", () => {
  const client = {
    connectUser(user: { id: string }, token: string) {
      return new Promise<void>((resolve, reject) => {
        const settle = (ok = true) => (ok ? resolve() : reject(new Error("connect failed")));
        stream.connects.push({ userId: user.id, token, settle });
        if (stream.auto) settle();
      });
    },
    disconnectUser() {
      stream.disconnects += 1;
      return Promise.resolve();
    },
    channel: () => ({ watch: () => Promise.resolve() }),
  };
  return { StreamChat: { getInstance: () => client } };
});

/** Fresh module state per test — `refCount` / `connecting` live at module scope by design. */
async function load() {
  vi.resetModules();
  return import("@/lib/chat/stream-connection");
}

/** Let the release's `then(c => c.disconnectUser())` microtask run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  stream.connects.length = 0;
  stream.disconnects = 0;
  stream.auto = true;
});

describe("leaseStream — unmount DURING connect (the regression)", () => {
  it("gives the reference back when release() lands before connectUser resolves, and the NEXT visit re-authenticates", async () => {
    const m = await load();
    stream.auto = false; // connectUser is in flight and stays there

    // Given: the surface mounted and started connecting.
    const lease = m.leaseStream();
    const connecting = lease.connect("u1", "token-1").then(
      () => "resolved",
      (e: Error) => e.message,
    );
    await Promise.resolve(); // the async fn has reached its await, exactly as a real one would

    // When: the renter leaves. Cleanup is SYNCHRONOUS and runs before the connect can land.
    lease.release();
    expect(stream.disconnects).toBe(0); // nothing taken yet, so nothing to disconnect

    // ...and only now does connectUser resolve.
    stream.connects[0].settle();
    await expect(connecting).resolves.toBe(m.STREAM_LEASE_RELEASED);
    await flush();

    // Then: the reference came back — the last release disconnected.
    expect(stream.disconnects).toBe(1);

    // And the consequence the leak caused is gone: the next visit connects AGAIN, with the fresh
    // token it just fetched, rather than being handed a cached client on an expiring credential.
    stream.auto = true;
    const lease2 = m.leaseStream();
    await expect(lease2.connect("u1", "token-2")).resolves.toBeTruthy();
    expect(stream.connects.map((c) => c.token)).toEqual(["token-1", "token-2"]);
    lease2.release();
    await flush();
    expect(stream.disconnects).toBe(2);
  });

  it("takes no reference at all when release() lands before connect is even reached (token fetch still pending)", async () => {
    const m = await load();
    const lease = m.leaseStream();

    // The token fetch was still in flight at unmount, so `connect` is called after the release.
    lease.release();
    expect(lease.released).toBe(true);

    await expect(lease.connect("u1", "token-1")).rejects.toThrow(m.STREAM_LEASE_RELEASED);
    expect(stream.connects).toHaveLength(0);
    await flush();
    expect(stream.disconnects).toBe(0);

    // The module is untouched, so a later mount authenticates normally.
    const lease2 = m.leaseStream();
    await expect(lease2.connect("u1", "token-2")).resolves.toBeTruthy();
    expect(stream.connects).toHaveLength(1);
  });

  it("survives StrictMode's double effect: mount → unmount → mount leaves exactly one live reference", async () => {
    const m = await load();
    stream.auto = false;

    const first = m.leaseStream();
    const p1 = first.connect("u1", "token-1").catch((e: Error) => e.message);
    await Promise.resolve();
    first.release(); // React tears the first effect down immediately in dev

    const second = m.leaseStream();
    const p2 = second.connect("u1", "token-1");
    await Promise.resolve();

    // Both are waiting on the SAME in-flight connect — one `connectUser`, two leases.
    expect(stream.connects).toHaveLength(1);
    stream.connects[0].settle();
    await p1;
    await p2;
    await flush();

    // The abandoned lease gave its reference back; the live one still holds the client.
    expect(stream.disconnects).toBe(0);
    second.release();
    await flush();
    expect(stream.disconnects).toBe(1);
  });
});

describe("leaseStream — the reference-count contract", () => {
  it("the LAST release disconnects, never the first (two surfaces, one client)", async () => {
    const m = await load();
    const room = m.leaseStream();
    const dock = m.leaseStream();
    await room.connect("u1", "token-1");
    await dock.connect("u1", "token-1");
    expect(stream.connects).toHaveLength(1); // one connection shared, not two

    room.release();
    await flush();
    expect(stream.disconnects).toBe(0); // the dock is still reading it

    dock.release();
    await flush();
    expect(stream.disconnects).toBe(1);
  });

  it("release() is idempotent, so a double cleanup cannot disconnect a live owner", async () => {
    const m = await load();
    const room = m.leaseStream();
    const dock = m.leaseStream();
    await room.connect("u1", "token-1");
    await dock.connect("u1", "token-1");

    room.release();
    room.release();
    room.release();
    await flush();
    expect(stream.disconnects).toBe(0);
  });

  it("a throw AFTER the connect still releases when the caller uses finally (the dock's send path)", async () => {
    const m = await load();
    const lease = m.leaseStream();
    await expect(
      (async () => {
        try {
          await lease.connect("u1", "token-1");
          throw new Error("watch/send blew up");
        } finally {
          lease.release();
        }
      })(),
    ).rejects.toThrow("watch/send blew up");
    await flush();
    expect(stream.disconnects).toBe(1);

    // ...and the module is clean, so the next send re-authenticates rather than reusing a dead client.
    const lease2 = m.leaseStream();
    await lease2.connect("u1", "token-2");
    expect(stream.connects.map((c) => c.token)).toEqual(["token-1", "token-2"]);
  });

  it("a FAILED connect takes no reference, so a caller that throws cannot pin the client open", async () => {
    const m = await load();
    stream.auto = false;
    const lease = m.leaseStream();
    const p = lease.connect("u1", "token-1").catch((e: Error) => e.message);
    await Promise.resolve();
    stream.connects[0].settle(false);
    await expect(p).resolves.toBe("connect failed");

    lease.release();
    await flush();
    expect(stream.disconnects).toBe(0); // nothing was ever held

    // The failed attempt cleared itself, so a retry actually retries.
    stream.auto = true;
    const retry = m.leaseStream();
    await expect(retry.connect("u1", "token-2")).resolves.toBeTruthy();
    expect(stream.connects).toHaveLength(2);
  });

  it("a different user drops the stale session rather than handing back someone else's client", async () => {
    const m = await load();
    const a = m.leaseStream();
    await a.connect("u1", "token-1");

    const b = m.leaseStream();
    await b.connect("u2", "token-2");
    await flush();

    expect(stream.connects.map((c) => c.userId)).toEqual(["u1", "u2"]);
    expect(stream.disconnects).toBe(1); // u1's session was dropped, not shared
  });
});
