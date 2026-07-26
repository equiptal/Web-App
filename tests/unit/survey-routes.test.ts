// NOTE — Outcome Survey is DISABLED (see docs/surveys-disabled.md). The two proxy suites below are
// `describe.skip`: they assert the old backend-proxy behaviour and are kept verbatim so restoring the
// feature is a matter of removing `.skip`. The active suite at the bottom pins the disabled contract.

import { describe, it, expect, vi, afterEach } from "vitest";

// Integration test for the Outcome Survey BFF routes: exercise the real `withAuthedBackend` proxy
// path (cookie → Bearer ID token → app-backend fetch → envelope unwrap), with the backend stubbed.
vi.mock("@/lib/config/env", () => ({
  serverEnv: { appApiUrl: "https://test.example", tenantId: "default" },
  useRealAuth: true,
  useRealApp: true,
}));
// withAuthedBackend reads the signed-in renter's ID token from cookies — hand it one.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "idtok" }) }),
}));

import { GET as getPending } from "@/app/api/me/surveys/pending/route";
import { POST as respond } from "@/app/api/me/surveys/[id]/respond/route";

afterEach(() => vi.unstubAllGlobals());

const SURVEY_ID = "11111111-1111-1111-1111-111111111111";

const backend = (body: unknown, opts: { ok?: boolean; status?: number } = {}) =>
  vi.fn().mockResolvedValue({ ok: opts.ok ?? true, status: opts.status ?? 200, json: async () => body });

function jsonReq(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe.skip("GET /api/me/surveys/pending", () => {
  it("proxies GET /api/surveys/pending as the renter and returns the pending unit", async () => {
    const unit = {
      groupId: null,
      type: "RENTEE_OUTCOME",
      items: [
        {
          surveyId: SURVEY_ID,
          type: "RENTEE_OUTCOME",
          requestId: "r1",
          rentalType: "DAILY",
          allowedActions: ["confirm", "won_elsewhere", "no_winner", "skip"],
          requestContext: { shortCode: "REQ-001", equipmentSummary: "Excavator" },
          bidders: [{ supplierId: 5, supplierName: "Gulf", bidId: "b1", priceAmount: 5000, priceUnit: "DAILY", status: "ACTIVE", equipmentName: "CAT 320" }],
        },
      ],
    };
    const fetchMock = backend({ success: true, data: { pending: unit } });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getPending(new Request("http://localhost/api/me/surveys/pending"));
    expect(res.status).toBe(200);
    expect((await res.json()).pending).toEqual(unit);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/surveys/pending");
    expect(init.headers.Authorization).toBe("Bearer idtok");
    expect(init.headers["X-Tenant-Id"]).toBe("default");
  });

  it("returns { pending: null } when nothing is due", async () => {
    vi.stubGlobal("fetch", backend({ success: true, data: { pending: null } }));
    const res = await getPending(new Request("http://localhost/api/me/surveys/pending"));
    expect(res.status).toBe(200);
    expect((await res.json()).pending).toBeNull();
  });
});

describe.skip("POST /api/me/surveys/{id}/respond", () => {
  it("forwards the answer to /api/surveys/{id}/respond and returns the result", async () => {
    const fetchMock = backend({ success: true, data: { status: "CONFIRMED" } });
    vi.stubGlobal("fetch", fetchMock);

    const body = { action: "confirm", winners: [{ winnerSupplierId: 5, price: 5000 }] };
    const res = await respond(jsonReq(`http://localhost/api/me/surveys/${SURVEY_ID}/respond`, body), {
      params: Promise.resolve({ id: SURVEY_ID }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("CONFIRMED");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/surveys/${SURVEY_ID}/respond`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ action: "confirm", winners: [{ winnerSupplierId: 5, price: 5000 }] });
  });

  it("returns the RENTEE_NO_BIDS edit deep-link from the backend", async () => {
    vi.stubGlobal("fetch", backend({ success: true, data: { status: "ACTIVE", deepLinkEditRequestId: "r1" } }));
    const res = await respond(jsonReq(`http://localhost/api/me/surveys/${SURVEY_ID}/respond`, { action: "edit" }), {
      params: Promise.resolve({ id: SURVEY_ID }),
    });
    expect((await res.json()).deepLinkEditRequestId).toBe("r1");
  });

  it("rejects a body with no action without calling the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await respond(jsonReq(`http://localhost/api/me/surveys/${SURVEY_ID}/respond`, {}), {
      params: Promise.resolve({ id: SURVEY_ID }),
    });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a backend error with its status + backendCode", async () => {
    vi.stubGlobal("fetch", backend({ success: false, error: { code: "SURVEY_NOT_FOUND", message: "not found" } }, { ok: false, status: 404 }));
    const res = await respond(jsonReq(`http://localhost/api/me/surveys/${SURVEY_ID}/respond`, { action: "confirm", winners: [{ winnerSupplierId: 5 }] }), {
      params: Promise.resolve({ id: SURVEY_ID }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).backendCode).toBe("SURVEY_NOT_FOUND");
  });
});

// ---- Active: the disabled contract -------------------------------------------------------------
describe("Outcome Survey routes are disabled", () => {
  it("GET /api/me/surveys/pending returns 404 and never calls the backend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await getPending(new Request("https://web.test/api/me/surveys/pending"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_found" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POST /api/me/surveys/{id}/respond returns 404 and never calls the backend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await respond(
      jsonReq(`https://web.test/api/me/surveys/${SURVEY_ID}/respond`, { action: "confirm" }),
      { params: Promise.resolve({ id: SURVEY_ID }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "not_found" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
