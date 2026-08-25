import { describe, it, expect } from "vitest";
import {
  defaultOperatorDetails,
  defaultPreferences,
  defaultProjectDetails,
  gateEquipment,
  gateWhen,
  gateWhere,
  itemAppGaps,
  itemBlocksAdvance,
  itemFieldKey,
  itemWebGaps,
  postableItems,
  requiredGaps,
  transportGaps,
} from "@/lib/contract";
import type { EquipmentItem, RfqDraft } from "@/lib/contract";

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "i1",
    rawLabel: null,
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

/** A draft whose year + certificate have been answered for every item it contains. */
function makeDraft(items: EquipmentItem[], over: Partial<RfqDraft> = {}): RfqDraft {
  return {
    project: defaultProjectDetails(),
    items,
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: { totalItems: items.length, needsValidation: 0, notAvailable: 0 },
    touchedFields: items.flatMap((i) => [itemFieldKey(i.id, "equipment_year"), itemFieldKey(i.id, "safety_certificates")]),
    ...over,
  };
}

/** A project that satisfies gateWhere. */
function confirmedProject() {
  const p = defaultProjectDetails();
  p.location = { label: "King Khalid International Airport", lat: 24.9576, lng: 46.6988, confirmed: true };
  p.timing.rentalBasis = "monthly";
  return p;
}

describe("itemAppGaps — the app's required set (MREQ-AC-09)", () => {
  it("passes a complete item", () => {
    expect(itemAppGaps(makeItem())).toEqual([]);
    expect(itemBlocksAdvance(makeItem())).toBe(false);
  });

  it("names the first missing taxonomy level, and only that one", () => {
    const noCategory = itemAppGaps(makeItem({ ref: { categoryId: null, subcategoryId: null, measurementId: null } }));
    expect(noCategory.map((g) => g.reason)).toEqual(["gate.categoryMissing"]);

    const noSubtype = itemAppGaps(makeItem({ ref: { categoryId: "c", subcategoryId: null, measurementId: null } }));
    expect(noSubtype.map((g) => g.reason)).toEqual(["gate.subtypeMissing"]);

    const noSize = itemAppGaps(makeItem({ ref: { categoryId: "c", subcategoryId: "s", measurementId: null } }));
    expect(noSize.map((g) => g.reason)).toEqual(["gate.capacityMissing"]);
  });

  it("requires a fuel type and a quantity of at least one", () => {
    expect(itemAppGaps(makeItem({ fuelType: null as never })).map((g) => g.reason)).toContain("gate.fuelMissing");
    expect(itemAppGaps(makeItem({ quantity: 0 })).map((g) => g.reason)).toContain("gate.quantityMissing");
  });

  // MREQ-AC-14 — a no-match item is dropped from the broadcast entirely, so gating on it would block
  // the renter over equipment that is never sent.
  it("ignores no-match and removed items", () => {
    expect(itemAppGaps(makeItem({ verdict: "no-match", ref: { categoryId: null, subcategoryId: null, measurementId: null } }))).toEqual([]);
    expect(itemAppGaps(makeItem({ removed: true, quantity: 0 }))).toEqual([]);
    expect(itemBlocksAdvance(makeItem({ verdict: "no-match" }))).toBe(false);
  });

  it("auto-accepts a needs-validation item whose ref is complete", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "needs-validation", resolved: false }))).toBe(false);
  });

  // The web-only gates must not leak into the app-level check, or every freshly parsed item would
  // read as incomplete by the platform's own standard.
  it("does not include the year or certificate gates", () => {
    expect(itemAppGaps(makeItem()).map((g) => g.field)).not.toContain("equipment_year");
    expect(itemAppGaps(makeItem()).map((g) => g.field)).not.toContain("safety_certificates");
  });
});

describe("itemWebGaps — year and certificate (MREQ-AC-54/55)", () => {
  it("accepts a value the RFQ named — that is already the renter's answer", () => {
    const item = makeItem({ equipmentYear: "2018+", safetyCertsOverride: ["tuv"] });
    expect(itemWebGaps(item, { touchedFields: [] })).toEqual([]);
  });

  it("blocks a value nobody supplied", () => {
    // Neither the RFQ nor the renter said anything: an empty cert list and a null year are the
    // form's silence, not an answer.
    const item = makeItem({ equipmentYear: null, safetyCertsOverride: [] });
    expect(itemWebGaps(item, { touchedFields: [] }).map((g) => g.field)).toEqual(["equipment_year", "safety_certificates"]);
  });

  it("is satisfied once each control is touched", () => {
    const item = makeItem();
    const touched = { touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")] };
    expect(itemWebGaps(item, touched)).toEqual([]);
  });

  // "Any year" and "No certificate" are answers, not omissions — the point of the gate is a decision,
  // not a value, so an explicitly empty answer clears it exactly like a populated one.
  it("accepts 'any' and an empty certificate list as real answers", () => {
    const item = makeItem({ equipmentYear: "any", safetyCertsOverride: [] });
    const touched = { touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")] };
    expect(itemWebGaps(item, touched)).toEqual([]);
  });
});

describe("transportGaps — delivery and return (MREQ-AC-53)", () => {
  it("passes with the seeded request-wide 'me', which is what the renter sees selected", () => {
    const project = defaultProjectDetails(); // seeds both to "me"
    expect(transportGaps([makeItem()], project)).toEqual([]);
  });

  it("blocks when the shared control is cleared and the item has no override", () => {
    const project = defaultProjectDetails();
    project.deliveryToSite = null;
    project.returnFromSite = null;
    expect(transportGaps([makeItem()], project).map((g) => g.reason)).toEqual(["gate.deliveryMissing", "gate.returnMissing"]);
  });

  it("reads the per-item override ahead of the shared value, exactly as submit does", () => {
    const project = defaultProjectDetails();
    project.deliveryToSite = null;
    project.returnFromSite = null;
    const item = makeItem({ deliveryOverride: "supplier", returnOverride: "supplier" });
    expect(transportGaps([item], project)).toEqual([]);
  });
});

describe("gateWhere (MREQ-AC-29/31)", () => {
  it("needs coordinates, a label and an explicit confirmation", () => {
    const p = defaultProjectDetails();
    expect(gateWhere(p).reasons).toContain("gate.locationMissing");

    p.location = { label: "Site", lat: 24.7, lng: 46.7, confirmed: false };
    expect(gateWhere(p).reasons).toEqual(["gate.confirmLocation"]);

    p.location.confirmed = true;
    expect(gateWhere(p).ok).toBe(true);
  });

  it("blocks on an unresolved text/file conflict", () => {
    const p = confirmedProject();
    p.location.conflict = { fromText: "Riyadh", fromFile: "Jeddah" };
    expect(gateWhere(p).reasons).toContain("gate.resolveLocationConflict");
    p.location.conflict.resolvedFrom = "text";
    expect(gateWhere(p).ok).toBe(true);
  });
});

describe("gateWhen (MREQ-AC-05/10)", () => {
  it("needs a rental basis and the charged-day acknowledgement", () => {
    const p = defaultProjectDetails();
    expect(gateWhen(p, false).reasons).toEqual(["gate.chooseRentalBasis", "gate.confirmChargedDays"]);
    p.timing.rentalBasis = "monthly";
    expect(gateWhen(p, false).reasons).toEqual(["gate.confirmChargedDays"]);
    expect(gateWhen(p, true).ok).toBe(true);
  });

  // MREQ-AC-10 — the deliberate divergence from the app, which requires a start date.
  it("never blocks on dates", () => {
    const p = confirmedProject();
    p.timing.startDate = null;
    p.timing.endDate = null;
    expect(gateWhen(p, true).ok).toBe(true);
  });
});

describe("requiredGaps — the 'N things need you' count (MREQ-AC-12)", () => {
  it("is zero for a complete draft", () => {
    const draft = makeDraft([makeItem()], { project: confirmedProject() });
    expect(requiredGaps(draft, true)).toEqual([]);
  });

  it("reports an empty request", () => {
    const draft = makeDraft([], { project: confirmedProject() });
    expect(requiredGaps(draft, true).map((g) => g.reason)).toEqual(["gate.noItems"]);
  });

  it("attributes each gap to the panel that can fix it", () => {
    const draft = makeDraft([makeItem({ fuelType: null as never })]);
    const gaps = requiredGaps(draft, false);
    expect(gaps.find((g) => g.reason === "gate.fuelMissing")?.panel).toBe("equipment");
    expect(gaps.find((g) => g.reason === "gate.locationMissing")?.panel).toBe("where");
    expect(gaps.find((g) => g.reason === "gate.confirmChargedDays")?.panel).toBe("when");
  });

  it("counts only live items", () => {
    const draft = makeDraft([makeItem({ id: "a" })], { project: confirmedProject() });
    draft.items.push(makeItem({ id: "b", verdict: "no-match", ref: { categoryId: null, subcategoryId: null, measurementId: null } }));
    expect(requiredGaps(draft, true)).toEqual([]);
  });
});

describe("gateEquipment — one item's panel", () => {
  it("combines the app gates, the web gates and transport", () => {
    const item = makeItem();
    const project = defaultProjectDetails();
    expect(gateEquipment(item, project, { touchedFields: [] }).ok).toBe(false);
    const touched = { touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")] };
    expect(gateEquipment(item, project, touched).ok).toBe(true);
  });
});

describe("postableItems (specs#245-AC-33/34/43)", () => {
  it("keeps mapped items, drops no-match and removed", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b", verdict: "no-match" }), makeItem({ id: "c", removed: true })];
    expect(postableItems(items).map((i) => i.id)).toEqual(["a"]);
  });

  // specs#245-AC-31: "Provide it for me?" keeps the no-match row on screen. Staying visible must NOT
  // make it postable or a blocker.
  it("drops a sourcing-requested no-match item, and it never blocks", () => {
    const sourcing = makeItem({ id: "b", verdict: "no-match", sourcingRequested: true });
    expect(postableItems([makeItem({ id: "a" }), sourcing]).map((i) => i.id)).toEqual(["a"]);
    expect(itemBlocksAdvance(sourcing)).toBe(false);
  });
});
