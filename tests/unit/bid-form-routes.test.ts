import { describe, it, expect, vi, afterEach } from "vitest";

// Integration test for the public off-platform bid-form submit route (web → agents). Confirms the
// supplier's submission — including the quote expiry `validUntil` — is forwarded to the agents
// service `POST /public/bid-form/{token}/submissions` and the `{ data }` envelope is unwrapped.
vi.mock("@/lib/config/env", () => ({
  serverEnv: { agentsApiUrl: "https://agents.test", agentsApiToken: "tok", tenantId: "default", agentsTestUserId: "46" },
}));

import { POST } from "@/app/api/bid-form/[token]/submissions/route";

afterEach(() => vi.unstubAllGlobals());

function jsonReq(body: unknown) {
  return new Request("http://localhost/api/bid-form/abc/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bid-form/:token/submissions", () => {
  it("forwards the submission (incl validUntil) to the agents public endpoint and returns 201", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: "sub_1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      jsonReq({ companyName: "Gulf", crNumber: "1", vatNumber: "2", nationalAddress: "x", contactInfo: "0500000000", validUntil: "2026-07-12T00:00:00.000Z", items: [] }),
      { params: Promise.resolve({ token: "abc" }) },
    );
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe("sub_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/public/bid-form/abc/submissions");
    expect(JSON.parse(init.body as string).validUntil).toBe("2026-07-12T00:00:00.000Z");
  });

  it("surfaces an upstream validation error status (422)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ error: "bad" }) }));
    const res = await POST(jsonReq({ companyName: "Gulf" }), { params: Promise.resolve({ token: "abc" }) });
    expect(res.status).toBe(422);
  });
});
