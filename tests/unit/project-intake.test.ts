import { describe, it, expect } from "vitest";
import { reducer, initialState, type RfqState } from "@/lib/store/rfq-store";
import type { AgentDraft } from "@/lib/contract";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract";
import type { ProjectSummary } from "@/lib/contract/project";
import { fieldSource } from "@/lib/contract/provenance";

/**
 * W-T7 / W-T8 — picking a site at intake, and what reaches the draft when the agent returns.
 *
 * The whole point of the design lives at one moment: **the merge happens after the parse, in the
 * browser.** The agent is never sent a project value and never returns one, so a site's terms cannot
 * come back altered by a model that never saw them — and a field the renter actually stated in their
 * own words is never replaced by the site.
 *
 * The second thing worth pinning is that the copy goes one way. Nothing on this screen writes to the
 * project, which is what lets a request and its site drift apart safely.
 */

const QIDDIYA: ProjectSummary = {
  id: "p_qiddiya",
  title: null, // falls back to the site's short name
  location: { label: "Qiddiya Zone 4, Qiddiya City, Riyadh 13513", lat: 24.6408, lng: 46.5731 },
  defaults: {
    timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
    paymentTerms: "net-30",
  },
  version: 4,
  awards: { requests: {}, workOrderItems: {}, labels: {} },
  ownerUserId: "46",
  ownerName: "Ahmed",
  createdAt: null,
  updatedAt: null,
  requestCount: 2,
  workOrderCount: 1,
  unitsAwarded: 4,
  firstStart: "2026-09-01",
  lastEnd: "2026-12-31",
};

/** What the agent returns for "2 excavators 20t", optionally having read a date or a place. */
function agentDraft(over: { startDate?: string; detected?: string[] } = {}): AgentDraft {
  const project = defaultProjectDetails();
  return {
    rfqId: "rfq_1",
    project: {
      ...project,
      timing: { ...project.timing, startDate: over.startDate ?? project.timing.startDate },
    },
    items: [newManualItem("i1")],
    preferences: defaultPreferences(),
    detectedLocations: over.detected ?? [],
    summary: "",
    justifications: [],
    fieldNotes: {},
  } as unknown as AgentDraft;
}

const pick = (s: RfqState) => reducer(s, { t: "SELECT_PROJECT", project: QIDDIYA });
const parse = (s: RfqState, draft: AgentDraft) => reducer(s, { t: "PROCESS_SUCCESS", draft });

/* ============================================================================================== *
 * Selecting
 * ============================================================================================== */

describe("selecting a site", () => {
  it("copies its values in, and names it from the address when it has no title", () => {
    const s = pick(initialState);
    expect(s.project?.id).toBe("p_qiddiya");
    expect(s.project?.title).toBe("Qiddiya Zone 4");
    expect(s.projectDirty).toEqual([]);
  });

  it("holds a copy, not a reference — a pill edit cannot move the project", () => {
    const s = reducer(pick(initialState), { t: "PATCH_PROJECT_DEFAULTS", patch: { endDate: "2027-03-31" }, keys: ["timing.end_date"] });

    expect(s.project?.defaults.timing.endDate).toBe("2027-03-31");
    // The site itself is untouched. This is PROJ-AC-25, and it is structural: the reducer never
    // holds the object it was handed.
    expect(QIDDIYA.defaults.timing.endDate).toBe("2026-12-31");
    expect(s.projectDirty).toContain("timing.end_date");
  });

  it("drops everything on deselect — no prefill outlives the project", () => {
    const edited = reducer(pick(initialState), { t: "PATCH_PROJECT_DEFAULTS", patch: { endDate: "2027-03-31" }, keys: ["timing.end_date"] });
    const cleared = reducer(edited, { t: "CLEAR_PROJECT" });

    // PROJ-AC-26. A half state here would leave the renter with values from a site they removed and
    // no way to see where they came from.
    expect(cleared.project).toBeNull();
    expect(cleared.projectDirty).toEqual([]);
    expect(cleared.workOrderGroupId).toBeNull();
  });

  it("ignores a pill edit when no site is selected", () => {
    const s = reducer(initialState, { t: "PATCH_PROJECT_DEFAULTS", patch: { endDate: "2027-03-31" }, keys: ["x"] });
    expect(s).toBe(initialState);
  });
});

/* ============================================================================================== *
 * The merge, at PROCESS_SUCCESS
 * ============================================================================================== */

describe("what reaches the draft when the agent returns", () => {
  it("fills from the site, and stamps the filing label", () => {
    const s = parse(pick(initialState), agentDraft());

    expect(s.draft?.project.timing.startDate).toBe("2026-09-01");
    expect(s.draft?.project.timing.endDate).toBe("2026-12-31");
    expect(s.draft?.project.location.label).toBe(QIDDIYA.location.label);
    expect(s.draft?.preferences.payment.terms).toBe("net-30");
    expect(s.draft?.projectId).toBe("p_qiddiya");
  });

  it("keeps a date the renter stated in their own words", () => {
    // "2 excavators 20t from Oct 1" — the site says 1 September and must not win.
    const s = parse(pick(initialState), agentDraft({ startDate: "2026-10-01" }));

    expect(s.draft?.project.timing.startDate).toBe("2026-10-01");
    expect(s.draft?.projectFields).not.toContain("timing.start_date");
    // Per field, not per block: the end date was not stated, so it still fills.
    expect(s.draft?.project.timing.endDate).toBe("2026-12-31");
    expect(s.draft?.projectFields).toContain("timing.end_date");
  });

  it("marks a pill the renter already changed as theirs, not the site's", () => {
    const edited = reducer(pick(initialState), { t: "PATCH_PROJECT_DEFAULTS", patch: { endDate: "2027-03-31" }, keys: ["timing.end_date"] });
    const s = parse(edited, agentDraft());

    expect(s.draft?.project.timing.endDate).toBe("2027-03-31");
    expect(s.draft?.touchedFields).toContain("timing.end_date");

    // And the canvas agrees: renter beats project.
    expect(fieldSource({ current: "2027-03-31", key: "timing.end_date", draft: s.draft! })).toBe("renter");
  });

  it("never fills hours per day — that is a per-hire question, not a site fact", () => {
    // Ruled 2026-08-30. A crane on night shift and a generator running around the clock are the
    // same site in the same week, so the site cannot answer it. It stays in *More details*.
    const s = parse(pick(initialState), agentDraft());
    expect(s.draft?.projectFields).not.toContain("timing.hours_per_day");
  });

  it("says `project` for a value the site supplied, and `default` for one it did not", () => {
    const s = parse(pick(initialState), agentDraft());
    const draft = s.draft!;

    expect(fieldSource({ current: draft.project.timing.endDate, key: "timing.end_date", draft })).toBe("project");
    expect(fieldSource({ current: "whatever", key: "not.from.the.site", draft })).toBe("default");
  });

  it("changes nothing about a projectless run", () => {
    const withSite = parse(pick(initialState), agentDraft());
    const without = parse(initialState, agentDraft());

    // The whole feature must be invisible to a renter who is not using it: no projectId, no
    // projectFields, and the same values the agent returned.
    expect(without.draft?.projectId).toBeUndefined();
    expect(without.draft?.projectFields).toBeUndefined();
    expect(without.draft?.project.timing.startDate).toBeNull();
    expect(withSite.draft?.project.timing.startDate).toBe("2026-09-01");
  });

  it("keeps the agent snapshot as the agent's, not as the merged result", () => {
    const s = parse(pick(initialState), agentDraft());

    // If the snapshot were taken after the merge, every project value would read as agent-filled and
    // the marks on the canvas would all be wrong.
    expect(s.agentOrigin?.project.timing.endDate).toBeNull();
    expect(s.draft?.project.timing.endDate).toBe("2026-12-31");
  });
});
