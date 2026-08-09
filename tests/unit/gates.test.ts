import { describe, it, expect } from "vitest";
import { gateStep1, gateStep2, itemBlocksAdvance, postableItems, defaultProjectDetails, defaultOperatorDetails } from "@/lib/contract";
import type { EquipmentItem } from "@/lib/contract";

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

describe("gateStep1 (specs#245-AC-12/16)", () => {
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

describe("itemBlocksAdvance (specs#245-AC-18/19/29/33)", () => {
  it("auto-accepts a complete-ref needs-validation item (Need-OK → Matched, no approve step)", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "needs-validation", resolved: false }))).toBe(false);
  });
  it("still blocks a needs-validation item with an incomplete ref", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "needs-validation", resolved: false, ref: { categoryId: "c", subcategoryId: null, measurementId: null } }))).toBe(true);
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
    // Need-OK with a complete ref auto-passes; only an incomplete ref still blocks.
    expect(gateStep2([makeItem({ verdict: "needs-validation", resolved: false })]).ok).toBe(true);
    expect(gateStep2([makeItem({ ref: { categoryId: "c", subcategoryId: null, measurementId: null } })]).ok).toBe(false);
  });
});

describe("postableItems (specs#245-AC-33/34/43)", () => {
  it("keeps mapped items, drops no-match and removed", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b", verdict: "no-match" }), makeItem({ id: "c", removed: true })];
    expect(postableItems(items).map((i) => i.id)).toEqual(["a"]);
  });
  // specs#245-AC-31: "Provide it for me?" keeps the no-match row on screen (it used to delete it, so the item
  // vanished on return from WhatsApp). Staying visible must NOT make it postable or a blocker.
  it("drops a sourcing-requested no-match item, and it never blocks Step 2", () => {
    const sourcing = makeItem({ id: "b", verdict: "no-match", sourcingRequested: true });
    expect(postableItems([makeItem({ id: "a" }), sourcing]).map((i) => i.id)).toEqual(["a"]);
    expect(itemBlocksAdvance(sourcing)).toBe(false);
    expect(gateStep2([makeItem({ id: "a" }), sourcing]).ok).toBe(true);
  });
});
