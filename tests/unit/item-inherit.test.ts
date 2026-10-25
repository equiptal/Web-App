import { describe, expect, it } from "vitest";
import { defaultPreferences, defaultProjectDetails, newManualItem, type EquipmentItem, type RfqDraft } from "@/lib/contract/draft";
import { inheritFromFirstItem } from "@/lib/contract/item-inherit";

const machine = (id: string, categoryId: string, patch: Partial<EquipmentItem> = {}): EquipmentItem => ({
  ...newManualItem(id),
  ref: { categoryId, subcategoryId: null, measurementId: null },
  ...patch,
});

const draftOf = (items: EquipmentItem[], extra: Partial<RfqDraft> = {}): RfqDraft => ({
  project: defaultProjectDetails(),
  items,
  preferences: defaultPreferences(),
  detectedLocations: [],
  summary: { totalItems: items.length, needsValidation: 0, notAvailable: 0 },
  ...extra,
});

const key = (id: string, f: string) => `line_items[${id}].${f}`;

describe("machine 1's clicked answers reach the next machine, once", () => {
  it("carries what he clicked on machine 1 and marks it answered on machine 2", () => {
    const d = draftOf(
      [machine("m1", "exc", { deliveryOverride: "me", returnOverride: "me" }), machine("m2", "loader", { deliveryOverride: "supplier" })],
      { touchedFields: [key("m1", "delivery")] },
    );
    const out = inheritFromFirstItem(d, "m2");
    expect(out.items[1].deliveryOverride).toBe("me");
    // Not clicked on machine 1 (it was a default there), so not carried.
    expect(out.items[1].returnOverride).toBe(newManualItem("x").returnOverride);
    expect(out.touchedFields).toContain(key("m2", "delivery"));
    expect(out.inheritedItems).toEqual(["m2"]);
  });

  it("never overwrites what he already answered on machine 2", () => {
    const d = draftOf([machine("m1", "exc", { deliveryOverride: "me" }), machine("m2", "exc", { deliveryOverride: "supplier" })], {
      touchedFields: [key("m1", "delivery"), key("m2", "delivery")],
    });
    expect(inheritFromFirstItem(d, "m2").items[1].deliveryOverride).toBe("supplier");
  });

  it("keeps his own words about machine 2, but not the agent's guess", () => {
    const m2 = machine("m2", "loader", { operatorNeeded: "no", deliveryOverride: "supplier" });
    const d = draftOf([machine("m1", "exc", { operatorNeeded: "yes", deliveryOverride: "me" }), m2], {
      touchedFields: [key("m1", "operator_needed"), key("m1", "delivery")],
      // The agent marked its delivery value for m2 as a guess; «without operator» came from the text.
      assumedFields: [key("m2", "delivery")],
    });
    const out = inheritFromFirstItem(d, "m2", [m2]);
    expect(out.items[1].operatorNeeded).toBe("no");
    expect(out.items[1].deliveryOverride).toBe("me");
  });

  it("carries certificate and fuel type only within the same category", () => {
    const first = machine("m1", "exc", { safetyCertsOverride: ["tuv"], fuelType: "electric" } as Partial<EquipmentItem>);
    const touched = [key("m1", "safety_certificates"), key("m1", "fuel_type")];
    const other = inheritFromFirstItem(draftOf([first, machine("m2", "crane")], { touchedFields: touched }), "m2");
    expect(other.items[1].safetyCertsOverride ?? null).toBeNull();
    expect(other.items[1].fuelType).toBe("diesel");
    const same = inheritFromFirstItem(draftOf([first, machine("m2", "exc")], { touchedFields: touched }), "m2");
    expect(same.items[1].safetyCertsOverride).toEqual(["tuv"]);
    expect(same.items[1].fuelType).toBe("electric");
  });

  it("carries operator details only onto a machine that has an operator", () => {
    const first = machine("m1", "exc", { operatorNeeded: "yes" });
    first.operator = { ...first.operator, nightShift: true };
    const touched = [key("m1", "operator.night_shift")];
    const off = inheritFromFirstItem(draftOf([first, machine("m2", "exc", { operatorNeeded: "no" })], { touchedFields: touched }), "m2");
    expect(off.items[1].operator.nightShift).toBe(false);
    const on = inheritFromFirstItem(draftOf([first, machine("m2", "exc", { operatorNeeded: "yes" })], { touchedFields: touched }), "m2");
    expect(on.items[1].operator.nightShift).toBe(true);
  });

  it("happens once: a later change on machine 1 does not reach machine 2 again", () => {
    const d = draftOf([machine("m1", "exc", { deliveryOverride: "supplier" }), machine("m2", "exc", { deliveryOverride: "me" })], {
      touchedFields: [key("m1", "delivery")],
      inheritedItems: ["m2"],
    });
    expect(inheritFromFirstItem(d, "m2").items[1].deliveryOverride).toBe("me");
  });

  it("never copies the machine itself", () => {
    const d = draftOf([machine("m1", "exc", { quantity: 4, additionalNotes: "boom 6 m", targetPriceSar: 9000 }), machine("m2", "exc")], {
      touchedFields: [key("m1", "quantity")],
    });
    const out = inheritFromFirstItem(d, "m2");
    expect(out.items[1].quantity).toBe(1);
    expect(out.items[1].additionalNotes).toBe("");
    expect(out.items[1].targetPriceSar ?? null).toBeNull();
  });
});
