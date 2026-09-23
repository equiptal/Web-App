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
  searchSupplierDirectory,
  fetchTemplateTerms,
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
    timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
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
  it("sends only the six fields on create, plus an explicit empty propagation list on edit", async () => {
    stub(() => reply(200, rawProject));
    const p = await fetchProject("p1");

    calls.length = 0;
    await createProject(p);
    const created = JSON.parse(String(calls[0].init?.body));
    expect(Object.keys(created).sort()).toEqual(["defaults", "location", "title"]);

    calls.length = 0;
    await updateProject("p1", 3, p);
    const edited = JSON.parse(String(calls[0].init?.body));
    // Empty, not absent: nothing propagates unless the renter ticked something.
    expect(edited.applyToRequests).toEqual([]);
    /* An EDIT is a checked write and the backend requires the version — without it the schema
       rejects the body before any handler runs, so every save of an existing site answered 422
       while creating a new one worked. */
    expect(edited.expectedVersion).toBe(3);
  });

  it("treats a 204 as success, not as a network failure", async () => {
    /* Found against staging, 2026-08-30. `deleteProject` answers 204 with no body. `res.json()` on
       an empty body rejects, so a delete that HAD removed the row threw its way out as a network
       error — the renter was told the server could not be reached by an action that had just
       succeeded, and a reload showed the site gone.

       The relay had the mirror of the same fault: `NextResponse.json` throws when handed a body at
       204, and that throw landed in its catch as `upstream_unreachable`. */
    stub(() => new Response(null, { status: 204 }));

    await expect(deleteProject("p1")).resolves.toBeUndefined();
    expect(calls[0].init?.method).toBe("DELETE");
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
    /* The field is required and non-nullable on the way out, while the dialog lets it sit empty.
       Monthly is the backend's own default for the same field on a work order. */
    expect(JSON.parse(String(calls[0].init?.body)).rentalBasis).toBe("monthly");

    await markAward("p1", "aw1", 8, { mobilizedAt: "2026-09-04" });
    expect(JSON.parse(String(calls[1].init?.body)).expectedVersion).toBe(8);

    // DELETE has no body, so the version rides in the query — dropping it would make every
    // un-award an unchecked write.
    await deleteAward("p1", "aw1", 9);
    expect(calls[2].url).toContain("expectedVersion=9");
  });

  it("PATCHes an existing work order by group id and POSTs a new one", async () => {
    stub(() => reply(200, {}));

    await saveWorkOrder("p1", 4, { groupId: "g1", body: { items: [] } });
    expect(calls[0].url).toBe("/api/work-orders/g1");
    expect(calls[0].init?.method).toBe("PATCH");
    const patched = JSON.parse(String(calls[0].init?.body));
    // The update schema has no `expectedVersion` and is strict, so sending one would fail the save.
    expect("expectedVersion" in patched).toBe(false);
    expect("groupId" in patched).toBe(false);

    await saveWorkOrder("p1", 4, { body: { items: [] } });
    expect(calls[1].url).toBe("/api/projects/p1/work-orders");
    expect(calls[1].init?.method).toBe("POST");
    // Create writes awards into the project blob, so it IS a checked write.
    expect(JSON.parse(String(calls[1].init?.body)).expectedVersion).toBe(4);
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

/* ============================================================================================== *
 * The work-order list, whose shape nobody was checking
 * ============================================================================================== */

describe("reading a project's work orders", () => {
  /* The backend ALREADY groups these: `{ version, workOrders: [{ workOrderGroupId, items }] }`. The
     client handed that object to `groupWorkOrderItems`, which expects a flat array of machines each
     carrying its own `workOrderGroupId` — so it re-grouped grouped data and read a key that does not
     exist at item level.

     The damage was quiet, which is why it lasted: every group came back with no id, so
     `fetchTemplateTerms` never matched one and a work-order template silently copied NO terms. It
     surfaced only when `startEditOrder` refused to open the form, because that is the one path that
     says so out loud rather than doing nothing. */

  it("keeps the group id, and each machine's terms", async () => {
    stub(() =>
      reply(200, {
        version: 3,
        workOrders: [
          {
            workOrderGroupId: "g1",
            projectId: "p1",
            title: "Own fleet",
            when: { rentalBasis: "MONTHLY", startDate: "2026-09-01", endDate: "2026-12-31" },
            items: [
              { id: "m1", rawLabel: "Excavator", quantity: 3, terms: { delivery: "supplier", year: "2019" } },
              { id: "m2", rawLabel: "Generator", quantity: 2, terms: { delivery: "me" } },
            ],
          },
        ],
      }),
    );

    const groups = await listWorkOrders("p1");

    expect(groups).toHaveLength(1);
    expect(groups[0].id, "the group id is the ONLY place the backend puts it").toBe("g1");
    expect(groups[0].title).toBe("Own fleet");
    expect(groups[0].items.map((i) => i.id)).toEqual(["m1", "m2"]);

    // Every machine carries the group id back, because callers key on it.
    expect(groups[0].items.every((i) => i.workOrderGroupId === "g1")).toBe(true);

    /* And the terms, per machine — the thing the edit form reads back and the template copies. Two
       machines on one order legitimately differ. */
    expect(groups[0].items[0].terms.deliveryOverride).toBe("supplier");
    expect(groups[0].items[0].terms.equipmentYear).toBe("2019");
    expect(groups[0].items[1].terms.deliveryOverride).toBe("me");
  });

  it("still groups a flat array, for whatever sends one", async () => {
    // Tolerant rather than brittle: a flat list is grouped the old way instead of dropped.
    stub(() => reply(200, []));
    await expect(listWorkOrders("p1")).resolves.toEqual([]);
  });
});

/* ============================================================================================== *
 * Copying a work order's terms onto a new request
 * ============================================================================================== */

describe("the terms a work-order template copies", () => {
  /* Two bugs lived on this path, one behind the other.

     First the group ids were lost, so the lookup matched nothing and this returned `null` — a
     template that copied no terms at all, silently.

     Fixing that exposed the second: `listWorkOrders` maps the stored blob into `MachineTerms`, and
     this function ran `termsFromWire` over that result. Wire keys (`delivery`, `ret`, `operator`)
     read off an object carrying the app's (`deliveryOverride`, `returnOverride`, `operatorNeeded`)
     match nothing, so it answered a fully BLANK terms object. Non-null, so the intake rendered its
     pills — every one of them empty, with OPERATOR reading *Yes* because the pill treats null as
     yes, under a label saying «terms copied». Worse than the null it replaced.

     So this asserts values, not merely that something came back. A shape-only check passes on both
     bugs. */

  const twoMachines = () =>
    reply(200, {
      version: 4,
      workOrders: [
        {
          workOrderGroupId: "g1",
          title: "Own fleet",
          when: { rentalBasis: "MONTHLY" },
          items: [
            { id: "crawler", rawLabel: "Crawler Excavator 30 ton", quantity: 3,
              terms: { delivery: "supplier", ret: "me", year: "2019", safety: ["tuv"], operator: "yes" } },
            { id: "generator", rawLabel: "Generator 250 kVA", quantity: 2,
              terms: { delivery: "me", ret: "me", year: "2022", safety: [], operator: "no" } },
          ],
        },
      ],
    });

  it("copies THAT machine's answers, not the first machine's", async () => {
    stub(twoMachines);
    const terms = await fetchTemplateTerms("p1", { kind: "work_order", id: "g1", itemId: "generator", ref: "Own fleet", machine: "Generator 250 kVA", quantity: 2, when: null });

    expect(terms).toBeTruthy();
    expect(terms!.deliveryOverride, "the generator's own delivery, not the crawler's").toBe("me");
    expect(terms!.equipmentYear).toBe("2022");
    expect(terms!.operatorNeeded).toBe("no");
    expect(terms!.safetyCertsOverride).toEqual([]);
  });

  it("copies the other machine's when the other is asked for", async () => {
    stub(twoMachines);
    const terms = await fetchTemplateTerms("p1", { kind: "work_order", id: "g1", itemId: "crawler", ref: "Own fleet", machine: "Crawler Excavator 30 ton", quantity: 3, when: null });

    expect(terms!.deliveryOverride).toBe("supplier");
    expect(terms!.equipmentYear).toBe("2019");
    expect(terms!.operatorNeeded).toBe("yes");
    expect(terms!.safetyCertsOverride).toEqual(["tuv"]);
  });

  it("answers null when the machine is gone, rather than a blank that reads as answered", async () => {
    // `null` puts the intake back to no pills at all, which is honest. A blank object renders four
    // empty pills under a label claiming the terms were copied.
    stub(() => reply(200, { version: 4, workOrders: [] }));
    await expect(
      fetchTemplateTerms("p1", { kind: "work_order", id: "gone", itemId: "gone", ref: "gone", machine: "x", quantity: 1, when: null }),
    ).resolves.toBeNull();
  });
});

/* ----------------------- The Moedatech directory ----------------------- */

/**
 * SUP — the picker showed 2 rows out of 1,492 (owner, 2026-09-03: *"why are only 2 shown?"*).
 *
 * Probed against staging: `/agents/suppliers` answers `{ id, name, company_name, city, is_verified,
 * has_store }`. One display NAME, not a `firstName`/`lastName` pair — and `company_name` is null on
 * all but a handful of accounts. The mapper read only the pair and the company, so eighteen rows of
 * every twenty were read as nameless and dropped.
 *
 * This is the shape the backend actually sends, verbatim from that probe.
 */
describe("searchSupplierDirectory", () => {
  const wire = (rows: unknown[]) => ({ data: rows, meta: { page: 1, limit: 20, total: 1492, totalPages: 75 } });

  it("keeps a row whose only name is `name`, which is most of the directory", async () => {
    stub(() =>
      reply(200, wire([
        { id: 638, name: "Hani Al Bassam", company_name: null, city: "Riyadh", is_verified: 0, has_store: 0 },
        { id: 9, name: "Bandar", company_name: "Zahid Tractor", city: "Riyadh", is_verified: 1, has_store: 1 },
      ])),
    );

    const page = await searchSupplierDirectory("", 1);

    expect(page.rows.map((r) => r.name)).toEqual(["Zahid Tractor", "Hani Al Bassam"]);
    expect(page.total).toBe(1492);
    // The company keeps the person as its contact; a person alone is the row's own name.
    expect(page.rows[0].contactName).toBe("Bandar");
    expect(page.rows[1].contactName).toBeNull();
  });

  it("still drops a row with nothing nameable at all", async () => {
    stub(() => reply(200, wire([{ id: 5, name: null, company_name: null, city: "Riyadh" }])));
    expect((await searchSupplierDirectory("", 1)).rows).toEqual([]);
  });

  it("floats the verified, then the ones with a shopfront", async () => {
    stub(() =>
      reply(200, wire([
        { id: 1, name: "Plain Co", company_name: null, is_verified: 0, has_store: 0 },
        { id: 2, name: "Shop Co", company_name: null, is_verified: 0, has_store: 1 },
        { id: 3, name: "Verified Co", company_name: null, is_verified: 1, has_store: 0 },
      ])),
    );

    expect((await searchSupplierDirectory("", 1)).rows.map((r) => r.name)).toEqual([
      "Verified Co",
      "Shop Co",
      "Plain Co",
    ]);
  });
});
