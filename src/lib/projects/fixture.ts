/**
 * The stand-in projects store (web-app/007, W-T2).
 *
 * Serves every project route while `useRealApp` is false, exactly as `taxonomy/fixture.ts` serves
 * the catalogue — **but mutable**, because a read-only fixture cannot exercise this feature. The
 * whole page is award, mark, file, move and delete; a frozen list would leave every one of those
 * untestable until the backend lands, and the UI tickets that come after this one need to run.
 *
 * In-memory and per-process on purpose: it resets when the dev server restarts, and it is never
 * reachable on a deployment where `useRealApp` is true. It is a development convenience, **not a
 * product mode** — nothing here is a fallback for a real backend that failed, which would quietly
 * show a renter somebody else's invented site.
 *
 * The shapes are the BACKEND's, not the contract's: this stands in for the wire, so `mapProject`
 * and `mapAwardBook` run over it just as they do over the real thing. That is what makes the
 * fixture worth having — it exercises the adapters instead of bypassing them.
 */

let seq = 100;
const nextId = (prefix: string) => `${prefix}_${++seq}`;

type RawAward = {
  id: string;
  supplierId: string | null;
  supplierName: string;
  units: number;
  rentalBasis: "daily" | "weekly" | "monthly" | null;
  rateAmount: number | null;
  mobilizedAt: string | null;
  demobilizedAt: string | null;
  awardedAt: string;
  awardedBy: number;
  documents: { id: string; kind: string; filename: string; uploadedAt: string | null }[];
};

type RawProject = {
  id: string;
  title: string | null;
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  defaults: {
    timing: {
      rentalBasis: string | null;
      extendable: boolean;
      startDate: string | null;
      endDate: string | null;
    };
    paymentTerms: string | null;
  };
  version: number;
  awards: { requests: Record<string, RawAward[]>; workOrderItems: Record<string, RawAward[]> };
  ownerUserId: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

type RawMachine = {
  id: string;
  workOrderGroupId: string;
  sortOrder: number;
  projectId: string | null;
  title: string | null;
  rentalBasis: string | null;
  extendable: boolean | null;
  startDate: string | null;
  endDate: string | null;
  hoursPerDay: number | null;
  whenConflictAck: boolean;
  categoryId: string | null;
  subcategoryId: string | null;
  measurementId: string | null;
  rawLabel: string | null;
  rawSize: string | null;
  quantity: number;
  attachmentIds: string[];
  customAttachments: string[];
  terms: Record<string, unknown>;
  notes: string | null;
};

const award = (over: Partial<RawAward> & { supplierName: string; units: number }): RawAward => ({
  id: nextId("aw"),
  supplierId: null,
  rentalBasis: "monthly",
  rateAmount: null,
  mobilizedAt: null,
  demobilizedAt: null,
  awardedAt: "2026-08-20T09:00:00.000Z",
  awardedBy: 46,
  documents: [],
  ...over,
});

/* ----------------------------- The seed ----------------------------- */

const projects: RawProject[] = [
  {
    id: "p_qiddiya",
    title: null, // falls back to the site's short name — exercises `projectTitle`
    locationLabel: "Qiddiya Zone 4, Qiddiya City, Riyadh 13513",
    locationLat: 24.6408,
    locationLng: 46.5731,
    defaults: {
      timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
      paymentTerms: "net-30",
    },
    version: 4,
    awards: {
      requests: {
        r_1042: [
          award({ supplierName: "Zahid Tractor", units: 2, rateAmount: 8600, mobilizedAt: "2026-09-04" }),
          award({ supplierName: "Al-Rajhi Equipment", units: 1, rateAmount: 9100 }),
        ],
      },
      workOrderItems: {
        m_welder: [award({ supplierName: "Own fleet", units: 1, mobilizedAt: "2026-09-02" })],
      },
    },
    ownerUserId: "46",
    ownerName: "Ahmed",
    createdAt: "2026-08-12T07:30:00.000Z",
    updatedAt: "2026-08-28T11:05:00.000Z",
  },
  {
    id: "p_neom",
    title: "NEOM — The Line, Sector 3",
    locationLabel: "Sector 3, The Line, NEOM 49643",
    locationLat: 28.0,
    locationLng: 35.3,
    defaults: {
      timing: { rentalBasis: "monthly", extendable: false, startDate: "2026-03-01", endDate: "2026-07-31" },
      paymentTerms: "net-60",
    },
    version: 1,
    awards: { requests: {}, workOrderItems: {} },
    ownerUserId: "46",
    ownerName: "Ahmed",
    createdAt: "2026-02-02T08:00:00.000Z",
    updatedAt: "2026-02-02T08:00:00.000Z",
  },
];

const machines: RawMachine[] = [
  {
    id: "m_welder",
    workOrderGroupId: "wo_1",
    sortOrder: 0,
    projectId: "p_qiddiya",
    title: "Own fleet — Qiddiya",
    rentalBasis: null,
    extendable: null,
    startDate: null,
    endDate: null,
    hoursPerDay: null,
    whenConflictAck: false,
    categoryId: null,
    subcategoryId: null,
    measurementId: null,
    rawLabel: "Welding machine",
    rawSize: "400A",
    quantity: 1,
    attachmentIds: [],
    customAttachments: [],
    terms: { delivery: "me", ret: "me", fuelResp: "me" },
    notes: null,
  },
];

/* ----------------------------- Reads ----------------------------- */

/**
 * `firstStart` / `lastEnd` widen the project's own window to hold everything under it — including
 * the marks, since a machine that arrived late or has not left yet must stay on the axis rather
 * than being clipped off its edge (see `chartSpan`).
 */
function span(p: RawProject): { firstStart: string | null; lastEnd: string | null } {
  const dates = [p.defaults.timing.startDate, p.defaults.timing.endDate];
  for (const m of machines.filter((x) => x.projectId === p.id)) dates.push(m.startDate, m.endDate);
  for (const list of [...Object.values(p.awards.requests), ...Object.values(p.awards.workOrderItems)]) {
    for (const a of list) dates.push(a.mobilizedAt, a.demobilizedAt);
  }
  const kept = dates.filter((d): d is string => !!d).sort();
  return { firstStart: kept[0] ?? null, lastEnd: kept[kept.length - 1] ?? null };
}

function summarize(p: RawProject) {
  const unitsAwarded = [...Object.values(p.awards.requests), ...Object.values(p.awards.workOrderItems)]
    .flat()
    .reduce((n, a) => n + a.units, 0);
  const groups = new Set(machines.filter((m) => m.projectId === p.id).map((m) => m.workOrderGroupId));
  return {
    ...p,
    requestCount: Object.keys(p.awards.requests).length,
    workOrderCount: groups.size,
    unitsAwarded,
    ...span(p),
  };
}

export const listProjectsFixture = () => projects.map(summarize);

export const getProjectFixture = (id: string) => {
  const p = projects.find((x) => x.id === id);
  return p ? summarize(p) : null;
};

export const listWorkOrdersFixture = (projectId: string) =>
  machines.filter((m) => m.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);

/** The chart, assembled the way the real `GET /projects/{id}/chart` assembles it. */
export function chartFixture(projectId: string) {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return null;

  const byGroup = new Map<string, RawMachine[]>();
  for (const m of listWorkOrdersFixture(projectId)) {
    if (!byGroup.has(m.workOrderGroupId)) byGroup.set(m.workOrderGroupId, []);
    byGroup.get(m.workOrderGroupId)!.push(m);
  }

  const groups = [...byGroup.entries()].map(([groupId, rows]) => {
    const head = rows[0];
    return {
      kind: "work_order" as const,
      id: groupId,
      ref: head.title ?? "Work order",
      title: head.title,
      when: head.startDate || head.endDate ? { startDate: head.startDate, endDate: head.endDate } : null,
      items: rows.map((m) => ({
        id: m.id,
        label: [m.rawLabel, m.rawSize].filter(Boolean).join(" "),
        labelAr: null,
        quantity: m.quantity,
        awards: p.awards.workOrderItems[m.id] ?? [],
      })),
    };
  });

  return { project: summarize(p), version: p.version, groups };
}

/* ----------------------------- Writes ----------------------------- */

type ProjectBody = {
  title?: string | null;
  location?: { label?: string; lat?: number | null; lng?: number | null };
  defaults?: RawProject["defaults"];
};

export function createProjectFixture(body: ProjectBody) {
  const now = new Date().toISOString();
  const p: RawProject = {
    id: nextId("p"),
    title: body.title ?? null,
    locationLabel: body.location?.label ?? "",
    locationLat: body.location?.lat ?? null,
    locationLng: body.location?.lng ?? null,
    defaults: body.defaults ?? {
      timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null },
      paymentTerms: null,
    },
    version: 1,
    awards: { requests: {}, workOrderItems: {} },
    ownerUserId: "46",
    ownerName: "You",
    createdAt: now,
    updatedAt: now,
  };
  projects.unshift(p);
  return summarize(p);
}

export function updateProjectFixture(id: string, body: ProjectBody) {
  const p = projects.find((x) => x.id === id);
  if (!p) return null;
  if ("title" in body) p.title = body.title ?? null;
  if (body.location) {
    p.locationLabel = body.location.label ?? p.locationLabel;
    p.locationLat = body.location.lat ?? p.locationLat;
    p.locationLng = body.location.lng ?? p.locationLng;
  }
  if (body.defaults) p.defaults = body.defaults;
  p.version += 1;
  p.updatedAt = new Date().toISOString();
  return summarize(p);
}

/**
 * Deleting is refused while anything is filed under the project — the same rule the backend keeps
 * (PROJ-AC-24). A fixture that allowed it would let the UI be built against a rule the real thing
 * does not have.
 */
export function deleteProjectFixture(id: string): "ok" | "not_found" | "not_empty" {
  const i = projects.findIndex((x) => x.id === id);
  if (i < 0) return "not_found";
  const p = projects[i];
  const hasAwards = Object.keys(p.awards.requests).length + Object.keys(p.awards.workOrderItems).length > 0;
  if (hasAwards || machines.some((m) => m.projectId === id)) return "not_empty";
  projects.splice(i, 1);
  return "ok";
}

type AwardBody = {
  expectedVersion?: number;
  requestId?: string | null;
  workOrderItemId?: string | null;
  supplierId?: string | null;
  supplierName?: string;
  units?: number;
  rentalBasis?: RawAward["rentalBasis"];
  rateAmount?: number | null;
  mobilizedAt?: string | null;
  demobilizedAt?: string | null;
};

export type AwardResult =
  | { ok: true; award: RawAward; version: number }
  | { ok: false; status: number; code: string; details?: unknown };

/**
 * The one write path for awards, mirroring the backend's `mutateAwards` — including the version
 * check, so the client's 409 handling is exercised here rather than first meeting it in production.
 */
export function createAwardFixture(projectId: string, body: AwardBody): AwardResult {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { ok: false, status: 404, code: "NOT_FOUND" };
  if (body.expectedVersion != null && body.expectedVersion !== p.version) {
    return { ok: false, status: 409, code: "PROJECT_VERSION_STALE", details: { currentVersion: p.version } };
  }
  const kind = body.requestId ? "requests" : "workOrderItems";
  const key = body.requestId ?? body.workOrderItemId;
  if (!key) return { ok: false, status: 422, code: "NO_PARENT" };
  if (!body.supplierName?.trim()) return { ok: false, status: 422, code: "NO_SUPPLIER" };

  const a = award({
    supplierName: body.supplierName,
    units: body.units ?? 1,
    supplierId: body.supplierId ?? null,
    rentalBasis: body.rentalBasis ?? null,
    rateAmount: body.rateAmount ?? null,
  });
  (p.awards[kind][key] ??= []).push(a);
  p.version += 1;
  p.updatedAt = new Date().toISOString();
  return { ok: true, award: a, version: p.version };
}

export function patchAwardFixture(projectId: string, awardId: string, body: AwardBody): AwardResult {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { ok: false, status: 404, code: "NOT_FOUND" };
  if (body.expectedVersion != null && body.expectedVersion !== p.version) {
    return { ok: false, status: 409, code: "PROJECT_VERSION_STALE", details: { currentVersion: p.version } };
  }
  for (const map of [p.awards.requests, p.awards.workOrderItems]) {
    for (const list of Object.values(map)) {
      const a = list.find((x) => x.id === awardId);
      if (!a) continue;
      if ("mobilizedAt" in body) a.mobilizedAt = body.mobilizedAt ?? null;
      if ("demobilizedAt" in body) a.demobilizedAt = body.demobilizedAt ?? null;
      if ("units" in body && body.units != null) a.units = body.units;
      if ("rateAmount" in body) a.rateAmount = body.rateAmount ?? null;
      if ("rentalBasis" in body) a.rentalBasis = body.rentalBasis ?? null;
      p.version += 1;
      return { ok: true, award: a, version: p.version };
    }
  }
  return { ok: false, status: 404, code: "AWARD_NOT_FOUND" };
}

export function deleteAwardFixture(projectId: string, awardId: string): AwardResult | { ok: true; version: number } {
  const p = projects.find((x) => x.id === projectId);
  if (!p) return { ok: false, status: 404, code: "NOT_FOUND" };
  for (const map of [p.awards.requests, p.awards.workOrderItems]) {
    for (const [key, list] of Object.entries(map)) {
      const i = list.findIndex((x) => x.id === awardId);
      if (i < 0) continue;
      list.splice(i, 1);
      if (!list.length) delete map[key]; // an empty key is not a thing — same as the backend's scrub
      p.version += 1;
      return { ok: true, version: p.version };
    }
  }
  return { ok: false, status: 404, code: "AWARD_NOT_FOUND" };
}
