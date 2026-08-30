import { describe, it, expect } from "vitest";
import { applyProjectDefaults, applyMachineTerms, machineTermsOf } from "@/lib/contract/project-apply";
import { fieldSource, isSystemChosen } from "@/lib/contract/provenance";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract/draft";
import { defaultProjectDefaults } from "@/lib/contract/project";
import type { RfqDraft, EquipmentItem, ProjectDetails } from "@/lib/contract/draft";
import type { ProjectDefaults } from "@/lib/contract/project";

/**
 * W-T4 — the merge, and where a value says it came from.
 *
 * The whole feature's correctness sits in one rule: **a field the agent filled is never overwritten
 * by a project.** If a renter writes "from Oct 1" and their site says 1 September, a request that
 * quietly reads September is worse than having no project at all — they will not re-read a field the
 * page already shows as answered, and the RFQ goes out with the wrong month.
 *
 * Everything else here follows from that, so it is tested from the outside: what the draft holds
 * afterwards, and what the canvas would say about each field.
 */

const QIDDIYA: ProjectDefaults = {
  timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
  paymentTerms: "net-30",
};

const SITE = { label: "Qiddiya Zone 4, Riyadh 13513", lat: 24.6408, lng: 46.5731 };

/** A blank draft, assembled from the same factories the store uses. */
function blankDraft(): RfqDraft {
  return {
    project: defaultProjectDetails(),
    items: [],
    preferences: defaultPreferences(),
    touchedFields: [],
  } as unknown as RfqDraft;
}

/** A draft as it stands after the agent has run but before any project is applied. */
function draftWith(agentProject: Partial<ProjectDetails> = {}): { draft: RfqDraft; agentOrigin: { project: ProjectDetails; items: EquipmentItem[] } } {
  const base = blankDraft();
  const project: ProjectDetails = {
    ...base.project,
    ...agentProject,
    timing: { ...base.project.timing, ...(agentProject.timing ?? {}) },
    location: { ...base.project.location, ...(agentProject.location ?? {}) },
  };
  const draft: RfqDraft = { ...base, project };
  return { draft, agentOrigin: { project, items: draft.items } };
}

/* ============================================================================================== *
 * The rule that must never break
 * ============================================================================================== */

describe("a field the agent filled always wins", () => {
  it("keeps the renter's own start date over the site's", () => {
    // "2 excavators at Qiddiya from Oct 1" — the agent read October.
    const { draft, agentOrigin } = draftWith({ timing: { ...blankDraft().project.timing, startDate: "2026-10-01" } });

    const { draft: next, filled } = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    expect(next.project.timing.startDate).toBe("2026-10-01");
    expect(filled).not.toContain("timing.start_date");
    // The site's end date was NOT stated, so it still fills — the rule is per field, not per block.
    expect(next.project.timing.endDate).toBe("2026-12-31");
    expect(filled).toContain("timing.end_date");
  });

  it("keeps a location the agent extracted from the text", () => {
    const base = blankDraft();
    const { draft, agentOrigin } = draftWith({ location: { ...base.project.location, label: "Jubail Industrial City" } });

    const { draft: next, filled } = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    expect(next.project.location.label).toBe("Jubail Industrial City");
    expect(filled).not.toContain("location.label");
    // Surfaced as a conflict by the caller, never resolved here — both values stay.
  });

  it("fills everything the agent was silent about", () => {
    const { draft, agentOrigin } = draftWith();

    const { draft: next, filled } = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    expect(next.project.location.label).toBe(SITE.label);
    expect(next.project.location.lat).toBe(24.6408);
    expect(next.project.timing.startDate).toBe("2026-09-01");
    expect(next.project.timing.endDate).toBe("2026-12-31");
    expect(next.project.timing.hoursPerDay).toBe(10);
    expect(next.project.timing.rentalBasis).toBe("monthly");
    expect(next.preferences.payment.terms).toBe("net-30");
    expect(filled).toContain("preferences.payment_terms");
  });

  it("writes nothing at all from an empty project", () => {
    const { draft, agentOrigin } = draftWith();
    const { draft: next } = applyProjectDefaults(draft, defaultProjectDefaults(), { label: "", lat: null, lng: null }, agentOrigin);

    expect(next.project.timing.startDate).toBeNull();
    expect(next.preferences.payment.terms).toBe(draft.preferences.payment.terms);
  });
});

/* ============================================================================================== *
 * It never writes back, and never mutates
 * ============================================================================================== */

describe("nothing is written back", () => {
  it("leaves the original draft untouched", () => {
    const { draft, agentOrigin } = draftWith();
    const before = JSON.stringify(draft);

    applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    // The pure-function guarantee. A merge that mutated would make the agent snapshot unreliable on
    // a second apply — the renter switching sites in the picker.
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("leaves the project's own defaults untouched", () => {
    const { draft, agentOrigin } = draftWith();
    const before = JSON.stringify(QIDDIYA);

    applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    // This is what lets a request and its site drift apart safely: the copy goes one way only.
    expect(JSON.stringify(QIDDIYA)).toBe(before);
  });

  it("applying twice lands on the same draft", () => {
    const { draft, agentOrigin } = draftWith();
    const once = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin).draft;
    const twice = applyProjectDefaults(once, QIDDIYA, SITE, agentOrigin).draft;

    expect(JSON.stringify(twice.project)).toBe(JSON.stringify(once.project));
  });
});

/* ============================================================================================== *
 * The confirmed flag, which a project must not grant
 * ============================================================================================== */

describe("a location still has to be confirmed", () => {
  it("does not confirm the site's own address on the renter's behalf", () => {
    const { draft, agentOrigin } = draftWith();
    const { draft: next } = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    // AC-16 stands whoever supplied the pin. A project that confirmed its own address would let a
    // stale site coordinate reach a supplier with nobody having looked at the map.
    expect(next.project.location.confirmed).toBe(draft.project.location.confirmed);
  });
});

/* ============================================================================================== *
 * Machine terms from a template
 * ============================================================================================== */

describe("machine terms", () => {
  const terms = {
    ...machineTermsOf(newManualItem("i1")),
    fuelType: "diesel" as const,
    deliveryOverride: "supplier" as const,
    returnOverride: "me" as const,
  };

  it("copies terms onto every line and never the equipment", () => {
    const base = blankDraft();
    const item = { ...newManualItem("i1"), quantity: 3, rawLabel: "Excavator 20t" } as EquipmentItem;
    const draft: RfqDraft = { ...base, items: [item] };

    const { draft: next } = applyMachineTerms(draft, terms, { project: base.project, items: [] });

    expect(next.items[0].deliveryOverride).toBe("supplier");
    expect(next.items[0].returnOverride).toBe("me");
    // The equipment always comes from the renter's own words, never from a template.
    expect(next.items[0].quantity).toBe(3);
    expect(next.items[0].rawLabel).toBe("Excavator 20t");
  });

  it("keeps what the agent read for a line, per line", () => {
    const base = blankDraft();
    const spoken = { ...newManualItem("i1"), operatorNeeded: "yes" as const };
    const silent = newManualItem("i2");
    const draft: RfqDraft = { ...base, items: [spoken, silent] };

    const { draft: next } = applyMachineTerms(draft, { ...terms, operatorNeeded: "no" }, {
      project: base.project,
      items: [spoken], // the agent spoke for the first line only
    });

    expect(next.items[0].operatorNeeded).toBe("yes");
    expect(next.items[1].operatorNeeded).toBe("no");
  });
});

/* ============================================================================================== *
 * What the canvas then says
 * ============================================================================================== */

describe("provenance", () => {
  const key = "timing.start_date";

  it("reads `project` for a value the site supplied", () => {
    const draft = { touchedFields: [], projectFields: [key] };
    expect(fieldSource({ current: "2026-09-01", key, draft })).toBe("project");
  });

  it("keeps the precedence renter > agent > project > default", () => {
    const projectFields = [key];

    // renter beats everything
    expect(fieldSource({ current: "2026-11-01", key, draft: { touchedFields: [key], projectFields } })).toBe("renter");

    // agent beats project — their words in THIS request outrank a standing site value
    expect(
      fieldSource({ current: "2026-10-01", agentOriginal: "2026-10-01", key, draft: { touchedFields: [], projectFields } }),
    ).toBe("agent");

    // project beats default — a stated fact beats a guess
    expect(fieldSource({ current: "2026-09-01", key, draft: { touchedFields: [], projectFields } })).toBe("project");

    // and without the project, the same value is just a default
    expect(fieldSource({ current: "2026-09-01", key, draft: { touchedFields: [], projectFields: [] } })).toBe("default");
  });

  it("stops claiming a project source once the field is emptied", () => {
    const draft = { touchedFields: [], projectFields: [key] };
    // Otherwise the note would sit under a control with nothing in it.
    expect(fieldSource({ current: "", key, draft })).toBe("empty");
    expect(fieldSource({ current: null, key, draft })).toBe("empty");
  });

  it("marks a project value as system-chosen, so it carries the note", () => {
    // The renter did choose it — but in March, for a different request. That is exactly the case
    // the mark exists for; only the wording differs.
    expect(isSystemChosen("project")).toBe(true);
    expect(isSystemChosen("renter")).toBe(false);
    expect(isSystemChosen("empty")).toBe(false);
  });

  it("every path `applyProjectDefaults` reports is one the canvas can resolve", () => {
    const { draft, agentOrigin } = draftWith();
    const { filled } = applyProjectDefaults(draft, QIDDIYA, SITE, agentOrigin);

    // A path in `filled` that no control looks up is a value silently marked as nothing.
    expect(filled.length).toBeGreaterThan(0);
    for (const path of filled) {
      expect(path).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
      expect(fieldSource({ current: "x", key: path, draft: { touchedFields: [], projectFields: filled } })).toBe("project");
    }
  });
});
