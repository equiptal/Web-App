import { describe, it, expect } from "vitest";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import { defaultProjectDetails, defaultPreferences, defaultOperatorDetails } from "@/lib/contract";
import type { RfqRequestPayload, EquipmentItem, ProjectDetails, Preferences } from "@/lib/contract";

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "i1",
    rawLabel: "excavator",
    ref: { categoryId: "cat", subcategoryId: "sub", measurementId: "cap" },
    verdict: "confident",
    resolved: true,
    removed: false,
    quantity: 1,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    ...over,
  };
}

function makeDraft(p?: Partial<{ project: ProjectDetails; items: EquipmentItem[]; preferences: Preferences }>): RfqRequestPayload {
  return {
    project: p?.project ?? defaultProjectDetails(),
    items: p?.items ?? [makeItem()],
    preferences: p?.preferences ?? defaultPreferences(),
  };
}

describe("draftToCreateRequest — ALIGNMENT rules", () => {
  it("rule 2: never sends urgency", () => {
    const p = draftToCreateRequest(makeDraft(), "46");
    expect(p).not.toHaveProperty("urgency");
  });

  it("rule 3: omits startDate when unset; sends it (ISO) when set", () => {
    expect(draftToCreateRequest(makeDraft(), "46").startDate).toBeUndefined();
    const project = defaultProjectDetails();
    project.timing.startDate = "2026-07-01";
    expect(draftToCreateRequest(makeDraft({ project }), "46").startDate).toContain("2026-07-01");
  });

  it("rule 4: maxEquipmentAge stores the YEAR (any⇒omit, custom:<y> parsed)", () => {
    const year = (ey: string | null) => {
      const project = defaultProjectDetails();
      project.advanced.equipmentYear = ey;
      return draftToCreateRequest(makeDraft({ project }), "46").equipmentItems[0].maxEquipmentAge;
    };
    expect(year("2024")).toBe(2024);
    expect(year("custom:2019")).toBe(2019);
    expect(year("any")).toBeUndefined();
    expect(year(null)).toBeUndefined();
  });

  it("rule 4: dieselIncluded supplier⇒true / me⇒false; omitted for electric", () => {
    const di = (party: "me" | "supplier", fuel: EquipmentItem["fuelType"]) => {
      const project = defaultProjectDetails();
      project.fuelResponsibility = party;
      return draftToCreateRequest(makeDraft({ project, items: [makeItem({ fuelType: fuel })] }), "46").equipmentItems[0].dieselIncluded;
    };
    expect(di("supplier", "diesel")).toBe(true);
    expect(di("me", "diesel")).toBe(false);
    expect(di("supplier", "electric")).toBeUndefined();
  });

  it("rule 4: fatRequired = operator transfer, only when operator included", () => {
    const fat = (op: "yes" | "no", transfer: boolean) =>
      draftToCreateRequest(makeDraft({ items: [makeItem({ operatorNeeded: op, operator: { ...defaultOperatorDetails(), transfer } })] }), "46")
        .equipmentItems[0].fatRequired;
    expect(fat("yes", true)).toBe(true);
    expect(fat("yes", false)).toBe(false);
    expect(fat("no", true)).toBe(false);
  });

  it("rule 6: sends extendable + per-item additionalNotes", () => {
    const project = defaultProjectDetails();
    project.timing.extendable = true;
    const p = draftToCreateRequest(makeDraft({ project, items: [makeItem({ additionalNotes: "silent" })] }), "46");
    expect(p.extendable).toBe(true);
    expect(p.equipmentItems[0].additionalNotes).toBe("silent");
    // empty per-item notes are omitted
    expect(draftToCreateRequest(makeDraft(), "46").equipmentItems[0].additionalNotes).toBeUndefined();
  });

  it("per-item override beats request-wide delivery/return", () => {
    const p = draftToCreateRequest(makeDraft({ items: [makeItem({ deliveryOverride: "supplier" })] }), "46");
    // default deliveryToSite is "me" ⇒ true; override "supplier" ⇒ false
    expect(p.equipmentItems[0].mobilizationByRentee).toBe(false);
  });
});

describe("draftToCreateRequest — §4.2 fields", () => {
  it("maps hours/days/overtime with the enum", () => {
    const p = draftToCreateRequest(makeDraft(), "46");
    expect(p.workingHoursPerDay).toBe(8);
    expect(p.workingDaysPerWeek).toBe(6);
    expect(p.overtimeRate).toBe("0"); // default "without"
  });

  it("joins site access restrictions into one string; omits when empty", () => {
    expect(draftToCreateRequest(makeDraft(), "46").siteAccessRestrictions).toBeUndefined();
    const project = defaultProjectDetails();
    project.advanced.siteAccessRestrictions = ["weight-limit", "height-limit"];
    expect(draftToCreateRequest(makeDraft({ project }), "46").siteAccessRestrictions).toBe("weight-limit, height-limit");
  });

  it("budgetCeiling only when > 0", () => {
    const prefs = defaultPreferences();
    prefs.budgetSar = 5000;
    expect(draftToCreateRequest(makeDraft({ preferences: prefs }), "46").budgetCeiling).toBe(5000);
    expect(draftToCreateRequest(makeDraft(), "46").budgetCeiling).toBeUndefined();
  });

  it("splits local-content out of Other certs; fans Safety per-item", () => {
    const project = defaultProjectDetails();
    project.certificates.other = ["local-content", "saso-registration"];
    project.certificates.safety = ["tuv", "spsp"];
    const p = draftToCreateRequest(makeDraft({ project }), "46");
    expect(p.localContent).toBe(true);
    expect(p.requiredCerts).toEqual(["saso-registration"]);
    expect(p.equipmentItems[0].safetyCertifications).toEqual(["tuv", "spsp"]);
  });

  it("maps SLA enum and omits 'custom'", () => {
    const sla = (v: Preferences["maintenance"]["sla"]) => {
      const prefs = defaultPreferences();
      prefs.maintenance.sla = v;
      return draftToCreateRequest(makeDraft({ preferences: prefs }), "46").breakdownResponseSla;
    };
    expect(sla("4h")).toBe("FOUR_HR");
    expect(sla("24h")).toBe("TWENTY_FOUR_HR");
    expect(sla("custom")).toBeUndefined();
  });
});

describe("draftToCreateRequest — postable items (AC-33/43)", () => {
  it("excludes no-match and removed items", () => {
    const items = [
      makeItem({ id: "ok" }),
      makeItem({ id: "nomatch", verdict: "no-match" }),
      makeItem({ id: "removed", removed: true }),
    ];
    const p = draftToCreateRequest(makeDraft({ items }), "46");
    expect(p.equipmentItems).toHaveLength(1);
    expect(p.type).toBe("BROADCAST");
  });
});
