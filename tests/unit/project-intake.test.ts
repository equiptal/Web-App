import { describe, it, expect } from "vitest";
import { reducer, initialState, type RfqState } from "@/lib/store/rfq-store";
import type { AgentDraft } from "@/lib/contract";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract";
import type { ProjectSummary } from "@/lib/contract/project";
import { fieldSource } from "@/lib/contract/provenance";
import { filingFor, leftTheSite } from "@/lib/contract/project";

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
  awards: { requests: {}, workOrderItems: {}, labels: {}, marks: {} },
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

/* ============================================================================================== *
 * The filing labels, and the one difference that cancels them
 * ============================================================================================== */

describe("what reaches the wire", () => {
  /* ⚠️ These exist because the coverage above stopped ONE STEP SHORT of the wire.
     `draft.projectId` was asserted and passed; the submit call never put it in the payload, so every
     request created from a site was filed nowhere — all of them, not only the ones whose location
     moved. Nothing failed: the chart simply never drew a row that had never been filed. */

  it("carries the site id into the payload", () => {
    const draft = {
      projectId: "p_qiddiya",
      workOrderGroupId: "wo_1",
      project: { location: { ...QIDDIYA.location } },
    };
    expect(filingFor({ location: QIDDIYA.location }, draft)).toEqual({
      projectId: "p_qiddiya",
      workOrderGroupId: "wo_1",
    });
  });

  it("sends nothing at all when the renter never picked a site", () => {
    // The whole feature stays invisible to a renter not using it: the payload is byte-identical.
    const draft = { project: { location: { label: "Al Malaz District, Riyadh", lat: 24.68, lng: 46.74 } } };
    expect(filingFor(null, draft)).toEqual({});
  });

  it("unfiles it when the location moved, id or no id", () => {
    const draft = {
      projectId: "p_qiddiya",
      workOrderGroupId: "wo_1",
      project: { location: { label: "Al Malaz District, Riyadh", lat: 24.68, lng: 46.74 } },
    };
    expect(filingFor({ location: QIDDIYA.location }, draft)).toEqual({});
  });

  it("drops the filing when the renter moves the location off the site", () => {
    /* A site IS a place. Every other value it supplies is a default a request may differ on, and the
       chart shows the difference — but a request for Riyadh drawn on the Qiddiya timeline says a
       machine is going somewhere it is not. The intake says so in the location panel and again beside
       the send button before this runs, so nothing here is a surprise. */
    const moved = leftTheSite(QIDDIYA.location, { label: "Al Malaz District, Riyadh", lat: 24.68, lng: 46.74 });
    expect(moved).toBe(true);
  });

  it("does not call a nudged pin a different place", () => {
    // ~90 m. A renter dragging a pin across a yard has not moved to another city, and re-geocoding
    // the same point to a differently-worded address is common enough to matter.
    const nudged = leftTheSite(QIDDIYA.location, {
      label: "Qiddiya Zone 4, Qiddiya City",
      lat: QIDDIYA.location.lat! + 0.0008,
      lng: QIDDIYA.location.lng!,
    });
    expect(nudged).toBe(false);
  });

  it("falls back to the label only when there are no coordinates", () => {
    const site = { label: "Qiddiya Zone 4, Riyadh 13513", lat: null, lng: null };
    expect(leftTheSite(site, { label: "qiddiya zone 4,  riyadh 13513" })).toBe(false); // spacing and case
    expect(leftTheSite(site, { label: "Al Malaz District, Riyadh" })).toBe(true);
    // An emptied box is not a move: the renter has not said anywhere else yet.
    expect(leftTheSite(site, { label: null })).toBe(false);
  });
});

/* ============================================================================================== *
 * A second machine starts from the first
 * ============================================================================================== */

describe("adding a machine", () => {
  /* *"The first item values selected in the request are number 1 priority to be passed to the next
     item terms — and in case of conflict with the project or the text, priority to what he selected
     in the request."*

     ⚠️ It did not happen at all. The work-order form has copied the first machine's terms since it
     was built; the REQUEST added a blank line — so a renter who set delivery, fuel, operator and a
     certificate on machine 1 answered all four again on machine 2, on a screen that had just shown
     them the answers. */

  const withFirst = (over: Partial<EquipmentItem>): RfqState => {
    const first = { ...newManualItem("i1"), ...over } as EquipmentItem;
    const draft = { project: defaultProjectDetails(), items: [first], preferences: defaultPreferences() };
    return reducer(initialState, { t: "PROCESS_SUCCESS", draft: draft as never });
  };

  it("copies the first machine's terms onto the new one", () => {
    let s = withFirst({
      deliveryOverride: "supplier",
      returnOverride: "supplier",
      fuelResponsibilityOverride: "supplier",
      operatorNeeded: "yes",
      equipmentYear: "2019",
      safetyCertsOverride: ["aramco"],
    });
    s = reducer(s, { t: "ADD_ITEM" });

    const second = s.draft!.items[1];
    expect(second.deliveryOverride).toBe("supplier");
    expect(second.returnOverride).toBe("supplier");
    expect(second.fuelResponsibilityOverride).toBe("supplier");
    expect(second.operatorNeeded).toBe("yes");
    expect(second.equipmentYear).toBe("2019");
    expect(second.safetyCertsOverride).toEqual(["aramco"]);
  });

  it("never copies the EQUIPMENT — that is why a second line is being added", () => {
    let s = withFirst({ rawLabel: "Crawler Excavator", rawSize: "30 ton", quantity: 4 });
    s = reducer(s, { t: "ADD_ITEM" });

    const second = s.draft!.items[1];
    expect(second.rawLabel ?? null).not.toBe("Crawler Excavator");
    expect(second.ref.subcategoryId ?? null).toBeNull();
    expect(second.quantity).not.toBe(4);
  });

  it("copies the operator's own answers, not a shared reference", () => {
    // A shared object would make editing machine 2's food change machine 1's.
    let s = withFirst({ operatorNeeded: "yes" });
    s = reducer(s, { t: "ADD_ITEM" });
    expect(s.draft!.items[1].operator).not.toBe(s.draft!.items[0].operator);
  });
});
