import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The three `/api/mail-connect` routes (SUP-BE-23, the Graph path).
 *
 * They are four-line relays, and all four lines are the kind that fail silently. A dropped
 * `returnTo` lands the renter on a bare page on the API host after consent. A wrong upstream path
 * answers 404, which the client reads as `UNAVAILABLE`, which looks exactly like "not connected" and
 * so hides itself. And a deployment with no agents backend must answer the NOT-CONFIGURED shape
 * rather than an error, or the panel draws a Connect button that leads nowhere.
 *
 * Measured against the deployed backend on 2026-09-05, and these are the shapes pinned below:
 *   GET /agents/mail-connect/status    -> { configured: false, connected: false, provider: "microsoft", … }
 *   GET /agents/mail-connect/authorize -> { available: false, reason: "NOT_CONFIGURED", url: null }
 */

const relay = vi.hoisted(() => ({
  calls: [] as { path: string; method?: string }[],
  real: true,
}));

vi.mock("@/lib/api/agents-relay", () => ({
  relayAsRenter: (path: string, init?: { method?: string }) => {
    relay.calls.push({ path, method: init?.method });
    return new Response(JSON.stringify({ relayed: path }), { status: 200 });
  },
  rawBody: async () => undefined,
}));

vi.mock("@/lib/config/env", () => ({
  get useRealApp() {
    return relay.real;
  },
  serverEnv: { agentsApiUrl: null, agentsApiToken: null },
}));

beforeEach(() => {
  relay.calls = [];
  relay.real = true;
});

describe("GET /api/mail-connect/status", () => {
  it("Given a real backend, Then it relays to the agents route", async () => {
    const { GET } = await import("@/app/api/mail-connect/status/route");
    await GET();

    expect(relay.calls).toEqual([{ path: "/mail-connect/status", method: undefined }]);
  });

  it("Given no agents backend, Then it answers NOT CONFIGURED rather than failing", async () => {
    /**
     * ⚠️ `configured` and `connected` are two different facts, and this route is where the
     * difference first has to hold. A local deployment has no Azure app registration to reach, so it
     * must look identical to a stage that has none: the panel offers nothing and the compose window
     * carries on. An error here would be caught by the client and turned into the same answer, but
     * by accident rather than by design.
     */
    relay.real = false;
    const { GET } = await import("@/app/api/mail-connect/status/route");
    const body = await (await GET()).json();

    expect(body).toEqual({
      configured: false,
      connected: false,
      provider: null,
      accountEmail: null,
      connectedAt: null,
    });
    expect(relay.calls).toHaveLength(0);
  });
});

describe("GET /api/mail-connect/authorize", () => {
  it("Given a returnTo, Then it is FORWARDED and re-encoded", async () => {
    /**
     * ⚠️ This is the parameter the whole round trip hangs on. The backend checks it against a host
     * allow-list and then sends the browser there after consent; dropped, the renter is left on a
     * bare page on the API host with his share half-finished and no way back to it.
     */
    const { GET } = await import("@/app/api/mail-connect/authorize/route");
    await GET(new Request("http://localhost/api/mail-connect/authorize?returnTo=https%3A%2F%2Fweb.moedatech.net%2Fcreate%3Fx%3D1"));

    expect(relay.calls[0].path).toBe(
      "/mail-connect/authorize?returnTo=https%3A%2F%2Fweb.moedatech.net%2Fcreate%3Fx%3D1",
    );
  });

  it("Given no returnTo, Then no empty parameter is sent", async () => {
    // An empty `returnTo` is not the same as none: it would fail the allow-list check on a value the
    // caller never gave.
    const { GET } = await import("@/app/api/mail-connect/authorize/route");
    await GET(new Request("http://localhost/api/mail-connect/authorize"));

    expect(relay.calls[0].path).toBe("/mail-connect/authorize");
  });

  it("Given no agents backend, Then it says NOT CONFIGURED with no url", async () => {
    relay.real = false;
    const { GET } = await import("@/app/api/mail-connect/authorize/route");
    const body = await (await GET(new Request("http://localhost/api/mail-connect/authorize"))).json();

    expect(body.available).toBe(false);
    expect(body.reason).toBe("NOT_CONFIGURED");
    expect(body.url).toBeNull();
  });
});

describe("DELETE /api/mail-connect", () => {
  it("Given a real backend, Then it relays a DELETE", async () => {
    const { DELETE } = await import("@/app/api/mail-connect/route");
    await DELETE();

    expect(relay.calls).toEqual([{ path: "/mail-connect", method: "DELETE" }]);
  });

  it("Given no agents backend, Then it answers disconnected and claims NO revocation", async () => {
    /**
     * ⚠️ `revokedAtProvider: false` is the honest half. This deletes the token WE hold; the grant
     * lives in the renter's own Microsoft account and only he can withdraw it there. A UI that read
     * this as a revocation would tell him Moedatech's access was removed when it was not.
     */
    relay.real = false;
    const { DELETE } = await import("@/app/api/mail-connect/route");
    const body = await (await DELETE()).json();

    expect(body).toEqual({ connected: false, revokedAtProvider: false });
  });
});
