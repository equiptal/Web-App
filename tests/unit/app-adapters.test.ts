import { describe, it, expect } from "vitest";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import { defaultProjectDetails, defaultPreferences, defaultOperatorDetails } from "@/lib/contract";
import type { RfqRequestPayload, EquipmentItem, ProjectDetails, Preferences } from "@/lib/contract";

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "i1",
    rawLabel: "excavator",
    rawSize: null,
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
  it("rule 2: urgency derived from start date (mobile CR-017 parity)", () => {
    const at = (days: number | null) => {
      const project = defaultProjectDetails();
      project.timing.startDate = days == null ? null : new Date(Date.now() + days * 86_400_000).toISOString();
      return draftToCreateRequest(makeDraft({ project }), "46").urgency;
    };
    expect(at(null)).toBe("FAR_FUTURE"); // no date
    expect(at(1)).toBe("ASAP"); // < 2 days
    expect(at(7)).toBe("SOON"); // 2–14 days
    expect(at(40)).toBe("FAR_FUTURE"); // 14+ days
  });

  it("rule 3: omits startDate when unset; sends it (ISO) when set", () => {
    expect(draftToCreateRequest(makeDraft(), "46").startDate).toBeUndefined();
    const project = defaultProjectDetails();
    project.timing.startDate = "2026-07-01";
    expect(draftToCreateRequest(makeDraft({ project }), "46").startDate).toContain("2026-07-01");
  });

  it("rule 4: maxEquipmentAge stores the YEAR (any⇒omit, '2020+' chip parsed)", () => {
    const year = (ey: string | null) => {
      const project = defaultProjectDetails();
      project.advanced.equipmentYear = ey;
      return draftToCreateRequest(makeDraft({ project }), "46").equipmentItems[0].maxEquipmentAge;
    };
    expect(year("2020+")).toBe(2020);
    expect(year("2015+")).toBe(2015);
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

  it("rule 4: fatRequired = F.A.T side (supplier⇒true / me⇒false), only when operator included; omitted when unset", () => {
    const fat = (op: "yes" | "no", who: "me" | "supplier" | null) =>
      draftToCreateRequest(makeDraft({ items: [makeItem({ operatorNeeded: op, operator: { ...defaultOperatorDetails(), fat: who } })] }), "46")
        .equipmentItems[0].fatRequired;
    expect(fat("yes", "supplier")).toBe(true);
    expect(fat("yes", "me")).toBe(false);
    expect(fat("yes", null)).toBeUndefined(); // side unset → no assumption
    expect(fat("no", "supplier")).toBeUndefined(); // no operator → omit
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

  it("maps safety cert 'other' to its free-text name; drops blank", () => {
    const project = defaultProjectDetails();
    project.certificates.safety = ["tuv", "other"];
    project.certificates.safetyOther = "ISO 9001";
    expect(draftToCreateRequest(makeDraft({ project }), "46").equipmentItems[0].safetyCertifications).toEqual(["tuv", "ISO 9001"]);
    // a blank "other" name is dropped (optional)
    const p2 = defaultProjectDetails();
    p2.certificates.safety = ["other"];
    expect(draftToCreateRequest(makeDraft({ project: p2 }), "46").equipmentItems[0].safetyCertifications).toBeUndefined();
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

  it("maps SLA enum (4h/8h/24h/48h/72h — matches the app)", () => {
    const sla = (v: Preferences["maintenance"]["sla"]) => {
      const prefs = defaultPreferences();
      prefs.maintenance.sla = v;
      return draftToCreateRequest(makeDraft({ preferences: prefs }), "46").breakdownResponseSla;
    };
    expect(sla("4h")).toBe("FOUR_HR");
    expect(sla("24h")).toBe("TWENTY_FOUR_HR");
    expect(sla("48h")).toBe("FORTY_EIGHT_HR");
    expect(sla("72h")).toBe("SEVENTY_TWO_HR");
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
