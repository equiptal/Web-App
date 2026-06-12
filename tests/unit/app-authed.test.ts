import { describe, it, expect, vi, afterEach } from "vitest";

const h = vi.hoisted(() => ({ jar: { mt_id: "idt", mt_access: "acc", mt_refresh: "ref" } as Record<string, string> }));

vi.mock("@/lib/config/env", () => ({
  serverEnv: {
    appApiUrl: "https://test.example",
    tenantId: "default",
    agentsApiUrl: null,
    agentsApiToken: null,
    mansourUrl: null,
    agentsTestUserId: null,
  },
  useRealApp: false,
  useRealAuth: true,
  useRealAgent: false,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n in h.jar ? { value: h.jar[n] } : undefined) }),
}));

import { GET as me } from "@/app/api/me/route";
import { POST as completeProfile } from "@/app/api/profile/complete/route";
import { POST as submitVerification } from "@/app/api/verification/submit/route";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

afterEach(() => {
  vi.unstubAllGlobals();
  h.jar = { mt_id: "idt", mt_access: "acc", mt_refresh: "ref" };
});

describe("GET /api/me (authenticated)", () => {
  it("forwards the Bearer access token and maps tier + verification status", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/users/me/profile-status")) return reply(200, { success: true, data: { supplierStatus: 1 } });
      if (u.includes("/users/me"))
        return reply(200, {
          success: true,
          data: { id: 7, phone: "+966500000000", tier: "basic", firstName: "A", lastName: "B", city: "Riyadh", jobTitle: "Eng" },
        });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await me(new Request("http://localhost/api/me"));
    const json = (await res.json()) as { user: { id: number; tier: string }; verification: { status: string } };
    expect(json.user.id).toBe(7);
    expect(json.user.tier).toBe("basic");
    expect(json.verification.status).toBe("pending");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer idt" });
  });

  it("refreshes on 401, retries, and re-sets the access cookie", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/auth/refresh")) return reply(200, { success: true, data: { accessToken: "new", idToken: "newid", expiresIn: 3600 } });
      if (u.includes("/users/me/profile-status")) return reply(200, { success: true, data: { supplierStatus: 2 } });
      if (u.includes("/users/me")) {
        meCalls++;
        return meCalls === 1
          ? reply(401, { success: false, error: { code: "E2001" } })
          : reply(200, { success: true, data: { id: 7, phone: "p", tier: "verified" } });
      }
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await me(new Request("http://localhost/api/me"));
    const json = (await res.json()) as { user: { id: number } };
    expect(json.user.id).toBe(7);
    expect(res.cookies.get("mt_access")?.value).toBe("new");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/auth/refresh"))).toBe(true);
  });
});

describe("POST /api/profile/complete", () => {
  it("maps a backend validation error to code:validation (AC-02/03)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, _init?: RequestInit) =>
        String(url).includes("/users/me/profile")
          ? reply(400, { success: false, error: { code: "E3000", message: "too short" } })
          : reply(200, { success: true, data: {} }),
      ),
    );
    const req = new Request("http://localhost/api/profile/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "A", lastName: "B", city: "X", jobTitle: "Y" }),
    });
    const res = await completeProfile(req);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("validation");
  });
});

describe("POST /api/verification/submit", () => {
  it("forwards the company payload and returns supplierStatus (AC-09/10/13)", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      String(url).includes("/users/me/company")
        ? reply(200, { success: true, data: { supplierStatus: 1 } })
        : reply(200, { success: true, data: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const req = new Request("http://localhost/api/verification/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authorityRole: "owner", companyName: "Acme", crDocKey: "k1", vatDocKey: "k2" }),
    });
    const res = await submitVerification(req);
    expect((await res.json()).supplierStatus).toBe(1);
    const sent = JSON.parse((fetchMock.mock.calls.find((c) => String(c[0]).includes("/users/me/company"))![1] as RequestInit).body as string);
    expect(sent).toMatchObject({ authorityRole: "owner", companyName: "Acme", crDocKey: "k1", vatDocKey: "k2" });
  });
});
