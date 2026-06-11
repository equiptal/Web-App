import { describe, it, expect } from "vitest";
import { gateStep1, gateStep2, itemBlocksAdvance, postableItems, defaultProjectDetails, defaultOperatorDetails } from "@/lib/contract";
import type { EquipmentItem } from "@/lib/contract";

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "i1",
    rawLabel: null,
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

describe("gateStep1 (AC-12/16)", () => {
  it("blocks until location confirmed AND rental basis chosen", () => {
    const project = defaultProjectDetails(); // unconfirmed, no basis
    const blocked = gateStep1(project);
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons).toContain("gate.confirmLocation");
    expect(blocked.reasons).toContain("gate.chooseRentalBasis");

    project.location.confirmed = true;
    project.timing.rentalBasis = "daily";
    expect(gateStep1(project).ok).toBe(true);
  });
});

describe("itemBlocksAdvance (AC-18/19/29/33)", () => {
  it("blocks an unresolved needs-validation item", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "needs-validation", resolved: false }))).toBe(true);
  });
  it("does not block a no-match item (excluded from broadcast)", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "no-match" }))).toBe(false);
  });
  it("blocks an item with an incomplete taxonomy ref", () => {
    expect(itemBlocksAdvance(makeItem({ ref: { categoryId: "c", subcategoryId: null, measurementId: null } }))).toBe(true);
  });
  it("passes a complete confident item", () => {
    expect(itemBlocksAdvance(makeItem())).toBe(false);
  });
  it("gateStep2 ok only when no item blocks", () => {
    expect(gateStep2([makeItem(), makeItem({ id: "i2" })]).ok).toBe(true);
    expect(gateStep2([makeItem({ verdict: "needs-validation", resolved: false })]).ok).toBe(false);
  });
});

describe("postableItems (AC-33/34/43)", () => {
  it("keeps mapped items, drops no-match and removed", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b", verdict: "no-match" }), makeItem({ id: "c", removed: true })];
    expect(postableItems(items).map((i) => i.id)).toEqual(["a"]);
  });
});
