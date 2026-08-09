import { describe, it, expect, vi, afterEach } from "vitest";

// Configure the auth backend base so the client doesn't short-circuit on "not_configured".
vi.mock("@/lib/config/env", () => ({
  serverEnv: { appApiUrl: "https://test.example", tenantId: "default" },
  useRealAuth: true,
}));

import { authPost, AuthError } from "@/lib/api/app-backend";

function fetchOk(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

afterEach(() => vi.unstubAllGlobals());

describe("app-backend authPost — error-code mapping (specs#235 AC-09/10/11/15)", () => {
  it.each([
    ["E6000", "invalid_code"],
    ["E6001", "expired"],
    ["E6002", "locked"],
    ["E6003", "send_failed"],
    ["E3004", "invalid_phone"],
    ["VALIDATION_ERROR", "invalid_phone"],
  ])("maps backend %s → kind %s", async (code, kind) => {
    vi.stubGlobal("fetch", fetchOk(400, { success: false, error: { code, message: "x" } }));
    await expect(authPost("/auth/login", {})).rejects.toMatchObject({ kind });
  });

  it("unknown backend code → unknown kind", async () => {
    vi.stubGlobal("fetch", fetchOk(500, { success: false, error: { code: "E9999" } }));
    const err = await authPost("/auth/login", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).kind).toBe("unknown");
  });

  it("fetch rejection → offline (specs#235 AC-24)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(authPost("/auth/login", {})).rejects.toMatchObject({ kind: "offline" });
  });

  it("unwraps the { success, data } envelope", async () => {
    vi.stubGlobal("fetch", fetchOk(200, { success: true, data: { userId: 7, isNewUser: true } }));
    await expect(authPost("/auth/login", {})).resolves.toEqual({ userId: 7, isNewUser: true });
  });
});
