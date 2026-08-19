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

  it("F.A.T split: fatFood / fatAccommodationTransport encode the side (supplier⇒true / me⇒false), operator-only", () => {
    const item = (op: "yes" | "no", food: "me" | "supplier" | null, transport: "me" | "supplier" | null) =>
      draftToCreateRequest(
        makeDraft({ items: [makeItem({ operatorNeeded: op, operator: { ...defaultOperatorDetails(), fatFood: food, fatAccommodationTransport: transport } })] }),
        "46",
      ).equipmentItems[0];
    expect(item("yes", "supplier", "me").fatFood).toBe(true);
    expect(item("yes", "supplier", "me").fatAccommodationTransport).toBe(false);
    expect(item("yes", null, null).fatFood).toBeUndefined(); // side unset → no assumption
    expect(item("no", "supplier", "supplier").fatFood).toBeUndefined(); // no operator → omit
    // legacy back-compat flag: supplier covers any part ⇒ true
    expect(item("yes", "supplier", "me").fatRequired).toBe(true);
    expect(item("yes", "me", "me").fatRequired).toBe(false);
    expect(item("no", "supplier", "supplier").fatRequired).toBeUndefined();
  });

  it("Part 1/3: work type (crane free-text) and restricted-nationality custom text pass through", () => {
    const it1 = draftToCreateRequest(makeDraft({ items: [makeItem({ workType: "  tower assembly  " })] }), "46").equipmentItems[0];
    expect(it1.workType).toBe("tower assembly"); // trimmed
    const restricted = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), nationality: "restricted", nationalityCustom: "Saudi, Egyptian" } })] }),
      "46",
    ).equipmentItems[0];
    expect(restricted.operatorNationality).toBe("restricted");
    expect(restricted.operatorNationalityCustom).toBe("Saudi, Egyptian");
    // custom omitted unless nationality is "restricted"
    const any = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), nationality: "any", nationalityCustom: "ignored" } })] }),
      "46",
    ).equipmentItems[0];
    expect(any.operatorNationalityCustom).toBeUndefined();
  });

  it("operator certs → non-gating operatorLicenseLevel (TUV/SPSP); saso-technical operator pick → safetyCertifications", () => {
    // tuv/spsp operator certs → comma-joined operatorLicenseLevel, and NOT folded into safetyCertifications
    const a = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), certificate: ["tuv", "spsp"] } })] }),
      "46",
    ).equipmentItems[0];
    expect(a.operatorLicenseLevel).toBe("TUV,SPSP");
    expect(a.safetyCertifications).toBeUndefined(); // no project safety certs; operator certs not gating

    // operator-picked saso-technical has no license-level equivalent → routed to safety (canonical token)
    const b = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), certificate: ["saso-technical"] } })] }),
      "46",
    ).equipmentItems[0];
    expect(b.operatorLicenseLevel).toBeUndefined();
    expect(b.safetyCertifications).toEqual(["saso_technical_inspection"]);

    // no operator → no license level
    const c = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "no", operator: { ...defaultOperatorDetails(), certificate: ["tuv"] } })] }),
      "46",
    ).equipmentItems[0];
    expect(c.operatorLicenseLevel).toBeUndefined();
  });

  it("F.A.T untouched → nothing sent, not an invented 'renter covers it'", () => {
    // defaultOperatorDetails() used to seed "me" on both sides, so every manual item asserted that the
    // RENTER covers food + accommodation/transport. The supplier priced against a term nobody agreed.
    const a = draftToCreateRequest(makeDraft({ items: [makeItem({ operatorNeeded: "yes" })] }), "46").equipmentItems[0];
    expect(a.fatFood).toBeUndefined();
    expect(a.fatAccommodationTransport).toBeUndefined();
    // The deprecated rollup must stay off too — deriving `false` here would assert "renter covers F.A.T".
    expect(a.fatRequired).toBeUndefined();
  });

  it("F.A.T answered → sides sent, and fatRequired DERIVED from them (app parity)", () => {
    const at = (fatFood: "me" | "supplier" | null, fatAccommodationTransport: "me" | "supplier" | null) =>
      draftToCreateRequest(
        makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), fatFood, fatAccommodationTransport } })] }),
        "46",
      ).equipmentItems[0];

    // supplier covers food, renter covers accommodation → both sides sent, rollup true ("at least one")
    const split = at("supplier", "me");
    expect(split.fatFood).toBe(true);
    expect(split.fatAccommodationTransport).toBe(false);
    expect(split.fatRequired).toBe(true);

    // renter covers both → an explicit answer, so it IS sent; rollup false
    const renter = at("me", "me");
    expect(renter.fatFood).toBe(false);
    expect(renter.fatAccommodationTransport).toBe(false);
    expect(renter.fatRequired).toBe(false);

    // only one side answered → the other stays unspecified, never back-filled from the rollup
    const partial = at(null, "supplier");
    expect(partial.fatFood).toBeUndefined();
    expect(partial.fatAccommodationTransport).toBe(true);
    expect(partial.fatRequired).toBe(true);
  });

  it("the agent's fat_required can no longer bypass the two sides", () => {
    // This produced `fat_required = true` with BOTH split columns null — impossible under the split
    // model, and it reads as "F.A.T included" on the admin surfaces while the bid form shows nothing.
    const a = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), fatRequired: true } })] }),
      "46",
    ).equipmentItems[0];
    expect(a.fatRequired).toBeUndefined();
    expect(a.fatFood).toBeUndefined();
    expect(a.fatAccommodationTransport).toBeUndefined();
  });

  it("operator cert 'other' free-text → appended to operatorLicenseLevel (commas→spaces)", () => {
    const a = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), certificate: ["tuv", "other"], certificateOther: "Crane Op Level 3, IPAF" } })] }),
      "46",
    ).equipmentItems[0];
    expect(a.operatorLicenseLevel).toBe("TUV,Crane Op Level 3 IPAF");

    // "other" selected but blank text → nothing appended
    const b = draftToCreateRequest(
      makeDraft({ items: [makeItem({ operatorNeeded: "yes", operator: { ...defaultOperatorDetails(), certificate: ["other"], certificateOther: "  " } })] }),
      "46",
    ).equipmentItems[0];
    expect(b.operatorLicenseLevel).toBeUndefined();
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
    expect(p.workingHoursPerDay).toBe(10);
    expect(p.workingDaysPerWeek).toBe(6);
    expect(p.overtimeRate).toBe("0"); // default "without"
  });

  it("routes free-text 'other' cert to notes (never the gating cert list); maps fixed certs to canonical tokens", () => {
    const project = defaultProjectDetails();
    project.certificates.safety = ["tuv", "other"];
    project.certificates.safetyOther = "ISO 9001";
    const p = draftToCreateRequest(makeDraft({ project }), "46");
    // free text can never match an equipment doc type → carried as a note, not a (matchable) cert
    expect(p.equipmentItems[0].safetyCertifications).toEqual(["tuv"]);
    expect(p.additionalNotes).toContain("ISO 9001");
    // a blank "other" name adds neither a cert nor a note
    const p2 = defaultProjectDetails();
    p2.certificates.safety = ["other"];
    expect(draftToCreateRequest(makeDraft({ project: p2 }), "46").equipmentItems[0].safetyCertifications).toBeUndefined();
  });

  it("maps saso-technical to the canonical underscore token suppliers upload against", () => {
    const project = defaultProjectDetails();
    project.certificates.safety = ["saso-technical"];
    expect(draftToCreateRequest(makeDraft({ project }), "46").equipmentItems[0].safetyCertifications).toEqual(["saso_technical_inspection"]);
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
    expect(p.requiredCerts).toEqual(["saso_registration"]);
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

describe("draftToCreateRequest — postable items (specs#245-AC-33/43)", () => {
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
