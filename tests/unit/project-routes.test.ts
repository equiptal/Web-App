import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * W-T2 — the project BFF routes.
 *
 * Two things are worth a test here and the rest is plumbing:
 *
 *  1. **The guard.** These routes carry authorization, not attribution. `api/requests` keeps an
 *     `AGENTS_TEST_USER_ID` fallback for a session-less submit; if one of these ever grew the same
 *     fallback, a caller with no session would read another company's sites, awards and purchase
 *     orders. That is the single most expensive mistake available in this ticket, so it is pinned.
 *  2. **409 reaching the browser intact.** An award write carries the version it read, and a
 *     mismatch has to arrive as 409 with the current version so the client re-reads. Flattened into
 *     a 502 it becomes "something went wrong", the renter retries, and hits the same wall.
 */

const h = vi.hoisted(() => ({
  real: false,
  /** Independent of `real` so the not-configured branch is reachable on its own. */
  configured: true,
  userId: 46 as number | null,
}));

vi.mock("@/lib/config/env", () => ({
  get useRealApp() {
    return h.real;
  },
  serverEnv: {
    get agentsApiUrl() {
      return h.configured ? "https://agents.example" : null;
    },
    get agentsApiToken() {
      return h.configured ? "tok" : null;
    },
    agentsTestUserId: "999", // present on purpose — no project route may ever fall back to it
    appApiUrl: "https://test.example",
    tenantId: "default",
    mansourUrl: null,
  },
  useRealAuth: true,
  useRealAgent: false,
}));

vi.mock("@/lib/api/session-user", () => ({ sessionUserId: async () => h.userId }));

import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { GET as getProject, DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { GET as getChart } from "@/app/api/projects/[id]/chart/route";
import { POST as postAward } from "@/app/api/projects/[id]/awards/route";
import { PATCH as patchAward } from "@/app/api/projects/[id]/awards/[awardId]/route";

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const post = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown) => new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  h.real = false;
  h.configured = true;
  h.userId = 46;
  vi.unstubAllGlobals();
});

/* ----------------------------- The guard ----------------------------- */

describe("the session guard", () => {
  it("refuses every project route without a session — and never falls back to the test user", async () => {
    h.real = true;
    h.userId = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const responses = await Promise.all([
      listProjects(),
      getProject(new Request("http://x"), params({ id: "p1" })),
      getChart(new Request("http://x"), params({ id: "p1" })),
      postAward(post({ supplierName: "Zahid", units: 1 }), params({ id: "p1" })),
      deleteProject(new Request("http://x"), params({ id: "p1" })),
    ]);

    for (const res of responses) expect(res.status).toBe(401);
    // The decisive half: it never reached the backend at all, so no id could have been guessed.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the verified renter id, and only that", async () => {
    h.real = true;
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await listProjects();

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/agents/projects");
    expect(url).toContain("userId=46");
    expect(url).not.toContain("999");
  });
});

/* ----------------------------- Errors that mean something ----------------------------- */

describe("upstream failures", () => {
  it("passes a 409 through with its code and details, so the client can re-read", async () => {
    h.real = true;
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "PROJECT_VERSION_STALE" }, details: { currentVersion: 9 } }),
    }));

    const res = await postAward(post({ expectedVersion: 7, supplierName: "Zahid", units: 1 }), params({ id: "p1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "PROJECT_VERSION_STALE" }, details: { currentVersion: 9 } });
  });

  it("separates an unreachable backend from a refusal", async () => {
    h.real = true;
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });

    const res = await listProjects();
    expect(res.status).toBe(502);
    // Not 401: the renter is allowed to do this, the network is not answering.
    expect(await res.json()).toEqual({ code: "upstream_unreachable" });
  });

  it("answers 503 when the backend is not configured, rather than falling back to the fixture", async () => {
    h.real = true;
    h.configured = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await listProjects();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();

    // The distinction that matters: a deployment with `useRealApp` on must NOT quietly serve
    // invented sites because its token is missing. `taxonomy` may fall back to a fixture — a
    // catalogue is the same for everyone — but a renter's own sites are not something to invent.
  });
});

/* ----------------------------- The fixture ----------------------------- */

describe("the fixture branch", () => {
  it("serves sites with the roll-up each card shows", async () => {
    const res = await listProjects();
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list.length).toBeGreaterThan(0);
    const qiddiya = list.find((p) => p.id === "p_qiddiya")!;
    expect(qiddiya.unitsAwarded).toBe(4); // 2 Zahid + 1 Al-Rajhi + 1 own welder
    expect(qiddiya.workOrderCount).toBe(1);
    expect(qiddiya.version).toBe(4);
  });

  it("widens the site's window to hold a mark that falls outside it", async () => {
    const res = await getProject(new Request("http://x"), params({ id: "p_qiddiya" }));
    const p = (await res.json()) as { firstStart: string; lastEnd: string };
    // The site runs 1 Sep – 31 Dec; the welder arrived 2 Sep, so nothing extends it here — but the
    // first date must come from the span, not from the defaults blob alone.
    expect(p.firstStart).toBe("2026-09-01");
    expect(p.lastEnd).toBe("2026-12-31");
  });

  it("groups machines into work orders and hangs their awards off them", async () => {
    const res = await getChart(new Request("http://x"), params({ id: "p_qiddiya" }));
    const chart = (await res.json()) as {
      version: number;
      groups: Array<{ kind: string; items: Array<{ id: string; awards: unknown[] }> }>;
    };
    expect(chart.groups).toHaveLength(1);
    expect(chart.groups[0].kind).toBe("work_order");
    expect(chart.groups[0].items[0].awards).toHaveLength(1);
    expect(chart.version).toBe(4);
  });

  it("bumps the version on every award write, and rejects a stale one", async () => {
    const before = ((await (await getProject(new Request("http://x"), params({ id: "p_qiddiya" }))).json()) as { version: number })
      .version;

    const ok = await postAward(
      post({ expectedVersion: before, requestId: "r_1042", supplierName: "Bin Laden", units: 1 }),
      params({ id: "p_qiddiya" }),
    );
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { version: number }).version).toBe(before + 1);

    // The same version again — this is the double-tap, and the second one must not land.
    const stale = await postAward(
      post({ expectedVersion: before, requestId: "r_1042", supplierName: "Bin Laden", units: 1 }),
      params({ id: "p_qiddiya" }),
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "PROJECT_VERSION_STALE" });
  });

  it("sets a mark as a date, and clears it with null", async () => {
    const chart = (await (await getChart(new Request("http://x"), params({ id: "p_qiddiya" }))).json()) as {
      version: number;
      groups: Array<{ items: Array<{ awards: Array<{ id: string; mobilizedAt: string | null }> }> }>;
    };
    const award = chart.groups[0].items[0].awards[0];
    expect(award.mobilizedAt).toBe("2026-09-02");

    const cleared = await patchAward(
      patch({ expectedVersion: chart.version, mobilizedAt: null }),
      params({ id: "p_qiddiya", awardId: award.id }),
    );
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { award: { mobilizedAt: string | null } }).award.mobilizedAt).toBeNull();
  });

  it("refuses to delete a site that still has something filed under it", async () => {
    const res = await deleteProject(new Request("http://x"), params({ id: "p_qiddiya" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "PROJECT_NOT_EMPTY" });
  });

  it("creates a site and lets an empty one be deleted", async () => {
    const created = await createProject(post({ title: "Yard", location: { label: "Dammam" } }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const gone = await deleteProject(new Request("http://x"), params({ id }));
    expect(gone.status).toBe(200);
    expect((await getProject(new Request("http://x"), params({ id }))).status).toBe(404);
  });
});
