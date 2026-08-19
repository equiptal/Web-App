import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({
  serverEnv: { appApiUrl: "https://test.example", tenantId: "default" },
  useRealAuth: true,
}));

// A signed-in renter with a live access token: the session read returns the user, no refresh needed.
vi.mock("next/headers", () => {
  const jar: Record<string, string> = {
    mt_user: JSON.stringify({ id: 7, phone: "+966500000000", tier: "verified" }),
    mt_access: "acc",
    mt_refresh: "ref",
  };
  return {
    cookies: async () => ({ get: (name: string) => (name in jar ? { value: jar[name] } : undefined) }),
  };
});

import { GET as session } from "@/app/api/auth/session/route";

describe("GET /api/auth/session (specs#235-AC-17)", () => {
  it("returns the user from a live session without refreshing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await session(new Request("http://localhost/api/auth/session"));
    const json = (await res.json()) as { user: { id: number; tier: string } | null };

    expect(json.user).toEqual({ id: 7, phone: "+966500000000", tier: "verified" });
    expect(fetchMock).not.toHaveBeenCalled(); // access token still valid → no /auth/refresh
    vi.unstubAllGlobals();
  });
});
