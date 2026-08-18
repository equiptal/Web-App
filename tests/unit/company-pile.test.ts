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

import {
  COMPANY_PILE_MAX_FILES,
  uploadCompanyPile,
  validateCompanyPileFile,
  type PileSession,
} from "@/lib/api/company-pile";
import { POST as pilePresign } from "@/app/api/verification/pile/presign/route";
import { POST as pileComplete } from "@/app/api/verification/pile/[id]/complete/route";

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

const doc = (name: string, type = "application/pdf", size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

const jsonReq = (body: unknown) =>
  new Request("http://localhost/api/verification/pile/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** A presign response with one target per name, mirroring the backend's ordered `uploads`. */
const presignBody = (names: string[], submissionId = "sub_1") => ({
  submissionId,
  uploads: names.map((n, i) => ({ fileName: n, key: `k/${i}/${n}`, mode: "put", url: `https://s3.test/${i}` })),
});

afterEach(() => {
  vi.unstubAllGlobals();
  h.jar = { mt_id: "idt", mt_access: "acc", mt_refresh: "ref" };
});

describe("validateCompanyPileFile", () => {
  it("accepts the four types the ingest lane takes", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(validateCompanyPileFile(doc("f", type))).toBeNull();
    }
  });

  it("rejects anything else, an empty file, and one over 100 MB", () => {
    expect(validateCompanyPileFile(doc("a.docx", "application/msword"))).toBe("unsupported_type");
    expect(validateCompanyPileFile(doc("a.pdf", "application/pdf", 0))).toBe("empty");
    const huge = new File([], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(huge, "size", { value: 101 * 1024 * 1024 });
    expect(validateCompanyPileFile(huge)).toBe("too_large");
  });
});

describe("uploadCompanyPile — presign → PUT → complete", () => {
  it("uploads every file and completes once, echoing the presigned keys", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.endsWith("/presign")) return reply(200, presignBody(["a.pdf", "b.pdf"]));
      if (u.startsWith("https://s3.test/")) return reply(200, {});
      if (u.includes("/complete")) return reply(200, { ok: true, fileCount: 2 });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await uploadCompanyPile([doc("a.pdf"), doc("b.pdf")]);
    expect(res.ok).toBe(true);
    expect(res.failedIndexes.size).toBe(0);
    expect(calls.filter((c) => c.startsWith("PUT"))).toHaveLength(2);
    expect(calls.filter((c) => c.includes("/complete"))).toHaveLength(1);
  });

  it("refuses an 11th file and a bad type before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const many = Array.from({ length: COMPANY_PILE_MAX_FILES + 1 }, (_, i) => doc(`f${i}.pdf`));
    await expect(uploadCompanyPile(many)).rejects.toThrow("too_many_files");
    await expect(uploadCompanyPile([doc("x.docx", "application/msword")])).rejects.toThrow("unsupported_type");
    await expect(uploadCompanyPile([])).rejects.toThrow("no_files");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the session and the failed index when one PUT fails, and does not complete", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/presign")) return reply(200, presignBody(["a.pdf", "b.pdf"]));
      if (u === "https://s3.test/1") return reply(500, {});
      if (u.startsWith("https://s3.test/")) return reply(200, {});
      if (u.includes("/complete")) return reply(200, { ok: true });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await uploadCompanyPile([doc("a.pdf"), doc("b.pdf")]);
    expect(res.ok).toBe(false);
    expect([...res.failedIndexes]).toEqual([1]);
    expect(res.session.submissionId).toBe("sub_1");
    expect([...res.session.uploadedIndexes]).toEqual([0]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/complete"))).toBe(false);
  });

  it("re-PUTs only the failure on retry, reusing the presign, and completes once", async () => {
    let presigns = 0;
    const puts: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/presign")) {
        presigns += 1;
        return reply(200, presignBody(["a.pdf", "b.pdf"]));
      }
      if (u.startsWith("https://s3.test/")) {
        puts.push(u);
        return reply(u === "https://s3.test/1" && puts.filter((x) => x === u).length === 1 ? 500 : 200, {});
      }
      if (u.includes("/complete")) return reply(200, { ok: true });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const files = [doc("a.pdf"), doc("b.pdf")];
    const first = await uploadCompanyPile(files);
    expect(first.ok).toBe(false);

    const second = await uploadCompanyPile(files, first.session);
    expect(second.ok).toBe(true);
    expect(presigns).toBe(1); // the session was reused
    expect(puts).toEqual(["https://s3.test/0", "https://s3.test/1", "https://s3.test/1"]);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/complete"))).toHaveLength(1);
  });

  it("presigns afresh when the pile changed, even if a session is passed", async () => {
    let presigns = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/presign")) {
        presigns += 1;
        return reply(200, presignBody(["a.pdf"], "sub_2"));
      }
      if (u.startsWith("https://s3.test/")) return reply(200, {});
      if (u.includes("/complete")) return reply(200, { ok: true });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const stale: PileSession = {
      submissionId: "sub_1",
      uploads: [{ fileName: "a.pdf", key: "k/0/a.pdf", url: "https://s3.test/0" }],
      signature: ["a.pdf:1024"],
      uploadedIndexes: new Set([0]),
    };
    const res = await uploadCompanyPile([doc("different.pdf")], stale);
    expect(res.ok).toBe(true);
    expect(presigns).toBe(1);
    expect(res.session.submissionId).toBe("sub_2");
  });

  it("treats a 409 from complete as success — a lost response must not read as a lost pile", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/presign")) return reply(200, presignBody(["a.pdf"]));
      if (u.startsWith("https://s3.test/")) return reply(200, {});
      if (u.includes("/complete")) return reply(409, { code: "conflict" });
      return reply(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await uploadCompanyPile([doc("a.pdf")]);
    expect(res.ok).toBe(true);
  });

  it("throws presign_failed and never PUTs when the presign is refused", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/presign")) return reply(502, { code: "unknown" });
      return reply(200, {});
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadCompanyPile([doc("a.pdf")])).rejects.toThrow("presign_failed");
    expect(fetchMock.mock.calls.some(([u]) => String(u).startsWith("https://s3.test/"))).toBe(false);
  });
});

describe("POST /api/verification/pile/presign", () => {
  it("pins source + docLane server-side and forwards only the files", async () => {
    const fetchMock = vi.fn(async () =>
      reply(200, { success: true, data: presignBody(["a.pdf"]) }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await pilePresign(jsonReq({ files: [{ name: "a.pdf", type: "application/pdf", size: 10 }] }));
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/suppliers/me/relay-submissions/presign");
    expect(JSON.parse(String(init.body))).toEqual({
      files: [{ name: "a.pdf", type: "application/pdf", size: 10 }],
      source: "web_company_submission",
      docLane: "company",
    });
  });

  it("ignores a client-supplied source and docLane — both are claims the browser cannot make", async () => {
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: presignBody(["a.pdf"]) }));
    vi.stubGlobal("fetch", fetchMock);

    await pilePresign(
      jsonReq({ files: [{ name: "a.pdf", type: "application/pdf", size: 10 }], source: "mobile", docLane: "equipment" }),
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.source).toBe("web_company_submission");
    expect(body.docLane).toBe("company");
  });

  it("passes a backend failure through with its own status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(502, { success: false, error: { code: "RELAY_UNAVAILABLE", message: "down" } })),
    );
    const res = await pilePresign(jsonReq({ files: [{ name: "a.pdf", type: "application/pdf", size: 10 }] }));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/verification/pile/{id}/complete", () => {
  it("forwards the echoed keys and reports ok", async () => {
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: { ok: true, fileCount: 2 } }));
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost/api/verification/pile/sub_1/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ key: "k/0", name: "a.pdf" }, { key: "k/1", name: "b.pdf" }] }),
    });
    const res = await pileComplete(req, { params: Promise.resolve({ id: "sub_1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, fileCount: 2 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/relay-submissions/sub_1/complete");
  });

  it("reports a 409 as already received, not as a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(409, { success: false, error: { code: "E5002", message: "already received" } })),
    );
    const req = new Request("http://localhost/api/verification/pile/sub_1/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ key: "k/0" }] }),
    });
    const res = await pileComplete(req, { params: Promise.resolve({ id: "sub_1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alreadyReceived: true });
  });
});

describe("GET /api/verification — the reviewer's reason reaches the screen", () => {
  it("projects verificationRejectionReason alongside the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, {
          success: true,
          data: { supplierStatus: 3, verificationRejectionReason: "The CR is expired.", authorityRole: "owner" },
        }),
      ),
    );
    const { GET } = await import("@/app/api/verification/route");
    const res = await GET(new Request("http://localhost/api/verification"));
    const json = (await res.json()) as { status: string; rejectionReason: string | null };
    expect(json.status).toBe("rejected");
    expect(json.rejectionReason).toBe("The CR is expired.");
  });

  it("reports null when no reason was typed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { success: true, data: { supplierStatus: 1 } })),
    );
    const { GET } = await import("@/app/api/verification/route");
    const json = (await (await GET(new Request("http://localhost/api/verification"))).json()) as {
      rejectionReason: string | null;
    };
    expect(json.rejectionReason).toBeNull();
  });
});

describe("GET /api/verification/docs — readable once submitted", () => {
  it("returns the presigned URLs with submitted: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, { success: true, data: { crDocUrl: "https://s3/cr", vatDocUrl: null, otherDocUrls: null } }),
      ),
    );
    const { GET } = await import("@/app/api/verification/docs/route");
    const json = (await (await GET(new Request("http://localhost/api/verification/docs"))).json()) as {
      submitted: boolean;
      crDocUrl: string | null;
      otherDocUrls: string[];
    };
    expect(json).toMatchObject({ submitted: true, crDocUrl: "https://s3/cr", otherDocUrls: [] });
  });

  it("answers submitted: false for a renter who never applied (E8017), not an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(403, { success: false, error: { code: "E8017", message: "No verification has been submitted" } }),
      ),
    );
    const { GET } = await import("@/app/api/verification/docs/route");
    const res = await GET(new Request("http://localhost/api/verification/docs"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ submitted: false, crDocUrl: null });
  });

  it("still surfaces any other failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(502, { success: false, error: { code: "E9999", message: "boom" } })),
    );
    const { GET } = await import("@/app/api/verification/docs/route");
    const res = await GET(new Request("http://localhost/api/verification/docs"));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/verification/submit — the pile shape and the member guard", () => {
  it("forwards the identity body untouched, with no document keys", async () => {
    const fetchMock = vi.fn(async () => reply(200, { success: true, data: { supplierStatus: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/verification/submit/route");
    const res = await POST(
      new Request("http://localhost/api/verification/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorityRole: "owner", companyCity: "Riyadh" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ authorityRole: "owner", companyCity: "Riyadh" });
    for (const k of ["crDocKey", "vatDocKey", "nationalAddressDocKey", "otherDocKeys"]) {
      expect(body).not.toHaveProperty(k);
    }
  });

  it("passes CO1013 through with its 409 and its own bilingual copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(409, {
          success: false,
          error: { code: "CO1013", message: "You belong to a company you do not own.", messageAr: "أنت عضو في شركة لا تملكها." },
        }),
      ),
    );
    const { POST } = await import("@/app/api/verification/submit/route");
    const res = await POST(
      new Request("http://localhost/api/verification/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ authorityRole: "owner" }),
      }),
    );
    expect(res.status).toBe(409);
    const json = (await res.json()) as { backendCode?: string; detail?: string; messageAr?: string };
    expect(json.backendCode).toBe("CO1013");
    expect(json.detail).toContain("do not own");
    expect(json.messageAr).toBeTruthy();
  });
});
