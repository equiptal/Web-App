import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
  assignToProject,
  fetchChart,
  listWorkOrders,
  saveWorkOrder,
  saveAward,
  markAward,
  deleteAward,
  withFreshVersion,
  listRenterSuppliers,
  ProjectVersionConflict,
  AwardRefused,
  ApiError,
} from "@/lib/api/client";

/**
 * W-T3 — the client functions.
 *
 * What is worth testing here is the part a generic helper would have thrown away: **which 409 this
 * is**. A stale version, a units overrun and an unfiled request are three different things a renter
 * can act on, and all three arrive with the same status. Collapsed into one error the UI can only
 * say "something went wrong", and the renter retries into the same wall.
 */

const calls: Array<{ url: string; init?: RequestInit }> = [];

const reply = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

function stub(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  });
}

const rawProject = {
  id: "p1",
  title: null,
  locationLabel: "Qiddiya Zone 4, Riyadh 13513",
  locationLat: 24.6,
  locationLng: 46.5,
  defaults: {
    timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31", hoursPerDay: 10 },
    paymentTerms: "net_30",
  },
  version: 7,
  requestCount: 2,
  workOrderCount: 1,
  unitsAwarded: 4,
  firstStart: "2026-09-01",
  lastEnd: "2026-12-31",
};

beforeEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

/* ----------------------------- Reads ----------------------------- */

describe("reads", () => {
  it("maps the backend's rows through the contract adapter, not around it", async () => {
    stub(() => reply(200, [rawProject]));
    const [p] = await listProjects();

    // `title` is null on the wire; the short site name is the fallback the UI shows.
    expect(p.title).toBeNull();
    expect(p.location.label).toBe("Qiddiya Zone 4, Riyadh 13513");
    expect(p.defaults.timing.hoursPerDay).toBe(10);
    expect(p.unitsAwarded).toBe(4);
  });

  it("reads the chart's version from the chart, not from the project card", async () => {
    // These deliberately disagree: a card can be stale while the chart was just fetched.
    stub(() => reply(200, { project: { ...rawProject, version: 7 }, version: 9, groups: [] }));
    const chart = await fetchChart("p1");
    expect(chart.version).toBe(9);
  });

  it("groups work-order machines by their group id, header from the lowest sortOrder", async () => {
    stub(() =>
      reply(200, [
        { id: "m2", workOrderGroupId: "g1", sortOrder: 1, title: "IGNORED", when: {}, projectId: "p1", quantity: 1 },
        { id: "m1", workOrderGroupId: "g1", sortOrder: 0, title: "Own fleet", when: {}, projectId: "p1", quantity: 1 },
      ]),
    );
    const groups = await listWorkOrders("p1");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Own fleet");
    expect(groups[0].items.map((i) => i.id)).toEqual(["m1", "m2"]);
  });

  it("treats an empty supplier list as a normal answer, and a failure as the same", async () => {
    stub(() => reply(503, { code: "not_configured" }));
    // That feature ships before this one reaches production; until it does the award dialog falls
    // back to a typed name. An error here would block awarding on a working system.
    await expect(listRenterSuppliers()).resolves.toEqual([]);
  });
});

/* ----------------------------- Writes ----------------------------- */

describe("writes", () => {
  it("sends only the seven fields on create, plus an explicit empty propagation list on edit", async () => {
    stub(() => reply(200, rawProject));
    const p = await fetchProject("p1");

    calls.length = 0;
    await createProject(p);
    const created = JSON.parse(String(calls[0].init?.body));
    expect(Object.keys(created).sort()).toEqual(["defaults", "location", "title"]);

    calls.length = 0;
    await updateProject("p1", p);
    const edited = JSON.parse(String(calls[0].init?.body));
    // Empty, not absent: nothing propagates unless the renter ticked something.
    expect(edited.applyToRequests).toEqual([]);
  });

  it("files through its own route, never through the request edit", async () => {
    stub(() => reply(200, { ok: true }));
    await assignToProject("r1", "p1");

    expect(calls[0].url).toBe("/api/me/requests/r1/project");
    expect(calls[0].init?.method).toBe("PATCH");
    // The edit route refuses after bids and spends the renter's one edit. Filing must reach neither.
    expect(calls[0].url).not.toMatch(/\/api\/me\/requests\/r1$/);
  });

  it("carries the version on every award write", async () => {
    stub(() => reply(200, { version: 8 }));

    await saveAward("p1", 7, { supplierName: "Zahid", units: 2, requestId: "r1" });
    expect(JSON.parse(String(calls[0].init?.body)).expectedVersion).toBe(7);

    await markAward("p1", "aw1", 8, { mobilizedAt: "2026-09-04" });
    expect(JSON.parse(String(calls[1].init?.body)).expectedVersion).toBe(8);

    // DELETE has no body, so the version rides in the query — dropping it would make every
    // un-award an unchecked write.
    await deleteAward("p1", "aw1", 9);
    expect(calls[2].url).toContain("expectedVersion=9");
  });

  it("PATCHes an existing work order by group id and POSTs a new one", async () => {
    stub(() => reply(200, {}));

    await saveWorkOrder("p1", { groupId: "g1", items: [] });
    expect(calls[0].url).toBe("/api/work-orders/g1");
    expect(calls[0].init?.method).toBe("PATCH");

    await saveWorkOrder("p1", { items: [] });
    expect(calls[1].url).toBe("/api/projects/p1/work-orders");
    expect(calls[1].init?.method).toBe("POST");
  });
});

/* ----------------------------- The three 409s ----------------------------- */

describe("conflicts keep their meaning", () => {
  it("a stale version arrives as its own error, carrying the current one", async () => {
    stub(() => reply(409, { code: "PROJECT_VERSION_STALE", details: { currentVersion: 12 } }));

    await expect(markAward("p1", "aw1", 7, { mobilizedAt: null })).rejects.toMatchObject({
      name: "ProjectVersionConflict",
      currentVersion: 12,
    });
  });

  it("a units overrun and an unfiled request are told apart", async () => {
    stub(() => reply(409, { code: "UNITS_EXCEED_QUANTITY", details: { awarded: 3, quantity: 3 } }));
    await expect(saveAward("p1", 7, { supplierName: "Zahid", units: 1 })).rejects.toMatchObject({
      name: "AwardRefused",
      reason: "units_exceed_quantity",
      details: { awarded: 3, quantity: 3 },
    });

    stub(() => reply(409, { code: "REQUEST_NOT_FILED" }));
    await expect(saveAward("p1", 7, { supplierName: "Zahid", units: 1, requestId: "r9" })).rejects.toMatchObject({
      reason: "request_not_filed",
    });
  });

  it("anything else stays an ordinary ApiError with the backend's code attached", async () => {
    stub(() => reply(500, { code: "BOOM" }));
    const err = await deleteProject("p1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(ProjectVersionConflict);
    expect(err.backendCode).toBe("BOOM");
  });

  it("a network failure is a network failure, not a conflict", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    await expect(listProjects()).rejects.toMatchObject({ kind: "network" });
  });
});

/* ----------------------------- Retrying, carefully ----------------------------- */

describe("withFreshVersion", () => {
  it("re-runs once against the version the conflict named", async () => {
    const seen: number[] = [];
    const write = vi.fn(async (v: number) => {
      seen.push(v);
      if (v === 7) throw new ProjectVersionConflict(12);
      return { version: v + 1 };
    });

    const result = await withFreshVersion("p1", 7, write);
    expect(seen).toEqual([7, 12]);
    expect(result).toEqual({ version: 13 });
  });

  it("re-reads the chart when the conflict did not name a version", async () => {
    stub(() => reply(200, { project: rawProject, version: 20, groups: [] }));
    const write = vi.fn(async (v: number) => {
      if (v === 7) throw new ProjectVersionConflict(null);
      return { version: v };
    });

    await expect(withFreshVersion("p1", 7, write)).resolves.toEqual({ version: 20 });
  });

  it("does not swallow anything that is not a version conflict", async () => {
    const write = vi.fn(async () => {
      throw new AwardRefused("units_exceed_quantity", null);
    });
    await expect(withFreshVersion("p1", 7, write)).rejects.toBeInstanceOf(AwardRefused);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
