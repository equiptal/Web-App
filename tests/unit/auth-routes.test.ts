import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/config/env", () => ({
  serverEnv: { appApiUrl: "https://test.example", tenantId: "default" },
  useRealAuth: true,
}));

import { POST as requestCode } from "@/app/api/auth/request-code/route";
import { POST as verify } from "@/app/api/auth/verify/route";

afterEach(() => vi.unstubAllGlobals());

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/auth/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/request-code (specs#235 AC-01/02/06)", () => {
  it("sends role:rentee, +966 and SMS to /auth/login", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { success: true, userId: 1, isNewUser: true } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestCode(jsonReq({ phone: "+966512345678" }));
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/auth/login");
    expect(JSON.parse(init.body)).toMatchObject({
      phone: "+966512345678",
      countryCode: "+966",
      otpMethod: "SMS",
      role: "rentee",
    });
  });

  it("rejects an empty phone without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await requestCode(jsonReq({ phone: "" }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/verify (specs#235 AC-03/04/05)", () => {
  it("returns the safe user with tier and sets token cookies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: { id: 7, phone: "+966500000000", tier: "basic" },
            accessToken: "acc",
            refreshToken: "ref",
            idToken: "idt",
            expiresIn: 3600,
          },
        }),
      }),
    );

    const res = await verify(jsonReq({ phone: "+966500000000", code: "1234" }));
    const json = (await res.json()) as { user: unknown };
    expect(json.user).toEqual({ id: 7, phone: "+966500000000", tier: "basic" });
    expect(res.cookies.get("mt_access")?.value).toBe("acc");
    expect(res.cookies.get("mt_refresh")?.value).toBe("ref");
    expect(res.cookies.get("mt_user")?.value).toContain("\"id\":7");
  });

  it("threads accountDeleted through for a self-deleted account, with cookies still set", async () => {
    // The backend authenticates a deleted account on purpose (restore is an authed call), so the tokens
    // must be set — but the flag has to reach the client, or the renter gets a session that looks healthy
    // while every tier-gated call 403s (the prod "suspended due to policy violations" report).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: { id: 2668, phone: "+966500000000", tier: "basic" },
            accessToken: "acc",
            refreshToken: "ref",
            idToken: "idt",
            expiresIn: 3600,
            accountDeleted: true,
          },
        }),
      }),
    );

    const res = await verify(jsonReq({ phone: "+966500000000", code: "1234" }));
    const json = (await res.json()) as { accountDeleted?: boolean; user: { id: number } };
    expect(json.accountDeleted).toBe(true);
    expect(json.user.id).toBe(2668);
    expect(res.cookies.get("mt_id")?.value).toBe("idt"); // restore needs the bearer
  });

  it("omits accountDeleted for a healthy account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user: { id: 7, phone: "+966500000000", tier: "basic" }, accessToken: "acc" },
        }),
      }),
    );
    const res = await verify(jsonReq({ phone: "+966500000000", code: "1234" }));
    expect((await res.json()).accountDeleted).toBeUndefined();
  });

  it("maps a wrong code to the invalid_code error (specs#235 AC-09)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: { code: "E6000", message: "bad" } }),
      }),
    );
    const res = await verify(jsonReq({ phone: "+966500000000", code: "0000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_code");
  });
});
