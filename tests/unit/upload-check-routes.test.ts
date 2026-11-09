/**
 * The upload check proxy (company doc check CC-12): the flow is pinned server side, the calls say
 * `X-Client-Platform: web`, refusals come back as codes, and the pile presign passes the check id
 * through only when it is a UUID.
 */
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

import { GET as config } from "@/app/api/upload-check/config/route";
import { POST as start } from "@/app/api/upload-check/checks/route";
import { POST as addFiles } from "@/app/api/upload-check/checks/[checkId]/files/route";
import { DELETE as removeFile } from "@/app/api/upload-check/checks/[checkId]/files/[fileId]/route";
import { POST as run } from "@/app/api/upload-check/checks/[checkId]/run/route";
import { POST as sharp } from "@/app/api/upload-check/checks/[checkId]/sharp/route";
import { POST as pilePresign } from "@/app/api/verification/pile/presign/route";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const ok = (data: unknown) => reply(200, { success: true, data });
const CHECK = "3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b";
const SHA = "a".repeat(64);
const goodFile = { id: 0, name: "cr.pdf", mime: "application/pdf", bytes: 10, sha256: SHA, pages: 2 };

const req = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T>(p: T) => ({ params: Promise.resolve(p) });

function stub(answer: unknown = ok({})) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sent = (m: ReturnType<typeof stub>, i = 0) => {
  const [url, init] = m.mock.calls[i] as [string, RequestInit];
  return {
    url: String(url),
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  h.jar = { mt_id: "idt", mt_access: "acc", mt_refresh: "ref" };
});

describe("GET /api/upload-check/config", () => {
  it("asks for the COMPANY config, as web", async () => {
    const m = stub(ok({ enabled: true, smallEdge: 512 }));
    const res = await config(req("/api/upload-check/config", "GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, smallEdge: 512 });
    const c = sent(m);
    expect(c.url).toBe("https://test.example/upload-check/v1/config?flow=company");
    expect(c.headers["X-Client-Platform"]).toBe("web");
  });

  it("Given a guest (403 tier), Then not_allowed, which the page reads as no check", async () => {
    stub(reply(403, { success: false, error: { code: "TIER_INSUFFICIENT", message: "x" } }));
    const res = await config(req("/api/upload-check/config", "GET"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_allowed" });
  });
});

describe("POST /api/upload-check/checks", () => {
  it("pins flow: company and ignores the browser's flow and equipmentId", async () => {
    const m = stub(ok({ checkId: CHECK, known: [{ id: 0 }], upload: [{ id: 0, page: 0, small: "s" }], progressUrl: "p" }));
    const res = await start(
      req("/api/upload-check/checks", "POST", { flow: "new", equipmentId: CHECK, files: [{ ...goodFile, extra: 1 }] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkId: CHECK, upload: [{ id: 0, page: 0, small: "s" }], progressUrl: "p" });
    const c = sent(m);
    expect(c.url).toBe("https://test.example/upload-check/v1/checks");
    expect(c.headers["X-Client-Platform"]).toBe("web");
    expect(c.body).toEqual({ flow: "company", files: [goodFile] });
  });

  it("Given a malformed file list, Then bad_input and no backend call", async () => {
    const m = stub();
    for (const files of [[], [{ ...goodFile, sha256: "nothex" }], [{ ...goodFile, pages: 0 }], "x"]) {
      const res = await start(req("/api/upload-check/checks", "POST", { files }));
      expect(res.status).toBe(422);
      expect(await res.json()).toEqual({ code: "bad_input" });
    }
    expect(m).not.toHaveBeenCalled();
  });

  it.each([
    ["UPLOAD_CHECK_DISABLED", 403, "disabled"],
    ["UPLOAD_CHECK_DAILY_LIMIT", 429, "daily_limit"],
    ["UPLOAD_CHECK_BUSY", 429, "busy"],
    ["UPLOAD_CHECK_NOT_FOUND", 404, "not_found"],
    ["SOMETHING_ELSE", 500, "unavailable"],
  ])("Given the backend refuses with %s, Then the code %s", async (code, status, refusal) => {
    stub(reply(status as number, { success: false, error: { code, message: "words never shown" } }));
    const res = await start(req("/api/upload-check/checks", "POST", { files: [goodFile] }));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ code: refusal });
  });
});

describe("the routes that name a check", () => {
  it("files, run, sharp and remove reach their backend route as web, and pass no flow", async () => {
    const m = stub(ok({ upload: [], progressUrl: "p" }));
    await addFiles(req("/x", "POST", { files: [{ ...goodFile, id: 3 }] }), params({ checkId: CHECK }));
    await run(req("/x", "POST", {}), params({ checkId: CHECK }));
    await sharp(req("/x", "POST", { files: [{ id: 3, pages: [0] }] }), params({ checkId: CHECK }));
    m.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error("no body"); } });
    const del = await removeFile(req("/x", "DELETE"), params({ checkId: CHECK, fileId: "3" }));
    expect(del.status).toBe(204);

    const calls = m.mock.calls.map((_, i) => sent(m, i));
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://test.example", "")}`)).toEqual([
      `POST /upload-check/v1/checks/${CHECK}/files`,
      `POST /upload-check/v1/checks/${CHECK}/run`,
      `POST /upload-check/v1/checks/${CHECK}/sharp`,
      `DELETE /upload-check/v1/checks/${CHECK}/files/3`,
    ]);
    expect(calls.every((c) => c.headers["X-Client-Platform"] === "web")).toBe(true);
    expect(calls[0].body).toEqual({ files: [{ ...goodFile, id: 3 }] });
    expect(calls[2].body).toEqual({ files: [{ id: 3, pages: [0] }] });
  });

  it("Given a check id that is not a UUID, or a bad file id, Then bad_input and no backend call", async () => {
    const m = stub();
    expect((await run(req("/x", "POST"), params({ checkId: "../admin" }))).status).toBe(422);
    expect((await removeFile(req("/x", "DELETE"), params({ checkId: CHECK, fileId: "1e3" }))).status).toBe(422);
    expect((await sharp(req("/x", "POST", { files: [{ id: 0, pages: [] }] }), params({ checkId: CHECK }))).status).toBe(422);
    expect(m).not.toHaveBeenCalled();
  });
});

describe("POST /api/verification/pile/presign: scanAttemptId", () => {
  const files = [{ name: "a.pdf", type: "application/pdf", size: 10 }];
  const presignOk = ok({ submissionId: "sub_1", uploads: [] });

  it("passes a UUID check id through, keeping source and docLane pinned", async () => {
    const m = stub(presignOk);
    await pilePresign(req("/api/verification/pile/presign", "POST", { files, scanAttemptId: CHECK, source: "mobile" }));
    expect(sent(m).body).toEqual({ files, source: "web_company_submission", docLane: "company", scanAttemptId: CHECK });
  });

  it("drops anything that is not a UUID string", async () => {
    for (const scanAttemptId of ["not-a-uuid", 42, { id: CHECK }, `${CHECK}x`]) {
      const m = stub(presignOk);
      await pilePresign(req("/api/verification/pile/presign", "POST", { files, scanAttemptId }));
      expect(sent(m).body).toEqual({ files, source: "web_company_submission", docLane: "company" });
    }
  });
});
