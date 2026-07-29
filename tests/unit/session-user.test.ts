import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * `sessionUserId()` is the entire authorization story for every BFF route that proxies an
 * agents-backend (service-token) endpoint: the backend trusts whatever `userId` we name, so if this
 * function can be talked into naming the wrong one, callers can act as that user.
 *
 * These tests pin the security property that used to be missing: the id must come from a token the
 * BACKEND verified, and NEVER from the unsigned `mt_user` identity cookie. The first test is the
 * regression guard — it fails against the old implementation, which read `mt_user` directly and would
 * happily return 999 for a request that carried no token at all.
 */

const h = vi.hoisted(() => ({
  jar: {} as Record<string, string>,
  testUserId: null as string | null,
}));

vi.mock("@/lib/config/env", () => ({
  serverEnv: {
    appApiUrl: "https://test.example",
    tenantId: "default",
    agentsApiUrl: "https://agents.example",
    agentsApiToken: "svc-token",
    mansourUrl: null,
    mansourApiToken: null,
    bidsApiToken: null,
    // Read through a getter so individual tests can flip it without re-mocking the module.
    get agentsTestUserId() {
      return h.testUserId;
    },
  },
  useRealApp: true,
  useRealAuth: true,
  useRealAgent: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n in h.jar ? { value: h.jar[n] } : undefined) }),
}));

import { sessionUserId } from "@/lib/api/session-user";
import { GET as companyGet } from "@/app/api/me/company/route";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const forgedCookie = (id: number) => JSON.stringify({ id, phone: "+966500000000", tier: "verified" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  h.jar = {};
  h.testUserId = null;
});

describe("sessionUserId — identity comes from a verified token, never the mt_user cookie", () => {
  it("REGRESSION: refuses a forged mt_user cookie carrying no token", async () => {
    // Exactly the old attack: `Cookie: mt_user={"id":999}` and nothing else. Previously → 999.
    h.jar = { mt_user: forgedCookie(999) };
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: { id: 999 } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sessionUserId()).toBeNull();
    // And it must not even ask the backend — there is no token to ask about.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("REGRESSION: a forged cookie cannot override the real token's id", async () => {
    h.jar = { mt_id: "idt", mt_user: forgedCookie(999) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { success: true, data: { id: 7 } })),
    );

    expect(await sessionUserId()).toBe(7);
  });

  it("resolves the id by asking the backend AS the ID token", async () => {
    h.jar = { mt_id: "idt" };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => reply(200, { success: true, data: { id: 7 } }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await sessionUserId()).toBe(7);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/users/me");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer idt" });
  });

  it("refreshes a stale token rather than 401ing an idle session", async () => {
    h.jar = { mt_refresh: "ref" };
    const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
      const u = String(url);
      if (u.includes("/auth/refresh")) return reply(200, { success: true, data: { accessToken: "a", idToken: "newid" } });
      if (u.includes("/users/me")) return reply(200, { success: true, data: { id: 7 } });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await sessionUserId()).toBe(7);
    // The verification must use the FRESHLY minted token.
    const meCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("/users/me"));
    expect(meCall?.[1].headers).toMatchObject({ Authorization: "Bearer newid" });
  });

  it("returns null when the token is rejected and there is nothing to refresh", async () => {
    h.jar = { mt_id: "expired" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, { success: false, error: { code: "E2001" } })),
    );

    expect(await sessionUserId()).toBeNull();
  });

  it("keeps the AGENTS_TEST_USER_ID shortcut for local dev", async () => {
    // NODE_ENV is "test" here, i.e. not a production build — the local-dev workflow must still work.
    h.jar = {};
    h.testUserId = "42";
    vi.stubGlobal("fetch", vi.fn(async () => reply(404, {})));

    expect(await sessionUserId()).toBe(42);
  });

  it("REGRESSION: ignores AGENTS_TEST_USER_ID on a deployed build (staging AND prod)", async () => {
    // Both deployed environments build with NODE_ENV=production. Previously a set variable meant
    // wholly unauthenticated callers were accepted as that user.
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    h.jar = {};
    h.testUserId = "42";
    vi.stubGlobal("fetch", vi.fn(async () => reply(404, {})));

    const { sessionUserId: fresh } = await import("@/lib/api/session-user");
    expect(await fresh()).toBeNull();
  });
});

describe("company routes refuse an unverified caller", () => {
  it("GET /api/me/company 401s on a forged cookie without reaching the agents backend", async () => {
    h.jar = { mt_user: forgedCookie(999) };
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await companyGet();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
