import { describe, expect, it } from "vitest";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import {
  defaultOperatorDetails,
  defaultPreferences,
  defaultProjectDetails,
  type EquipmentItem,
  type RfqRequestPayload,
} from "@/lib/contract";

/**
 * MREQ-TC-27/29/35 — what actually leaves the browser.
 *
 * The canvas can show whatever it likes; these assert the payload. Two of the three are about a
 * value the renter never chose reaching a supplier: an agent-inferred payment method with no control
 * behind it, and the `?? "me"` transport fallback that used to assign both haulage legs silently.
 */

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "a0",
    rawLabel: "30 ton digger",
    rawSize: "30 ton",
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
    equipmentYear: null,
    attachmentIds: [],
    customAttachments: [],
    ...over,
  };
}

function payload(over: Partial<RfqRequestPayload> = {}) {
  const draft: RfqRequestPayload = {
    project: defaultProjectDetails(),
    items: [makeItem()],
    preferences: defaultPreferences(),
    ...over,
  };
  return draftToCreateRequest(draft, "user-1");
}

describe("payment method is never sent (MREQ-AC-44)", () => {
  it("is absent from the payload when nothing set it", () => {
    expect(payload().paymentMethod).toBeUndefined();
  });

  // The canvas offers no control for it, so reading the agent's guess would submit a payment method
  // the renter never saw and cannot change.
  it("is not read from the agent's header", () => {
    const draft = agentOutputToDraft({
      rfq_header: { payment_method: "CASH", payment_terms: "NET_30" } as never,
      line_items: [],
      missing_required_fields: [],
      justifications: [],
      field_notes: [],
    });
    expect(draft.preferences?.payment.method).toBeNull();
    // Terms still come through — only the method was dropped.
    expect(draft.preferences?.payment.terms).toBe("net-30");
  });
});

describe("the transport legs reflect a shown choice (MREQ-AC-53)", () => {
  it("sends 'renter' for the seeded default, which the canvas renders as selected", () => {
    // `defaultProjectDetails` seeds both to "me"; the canvas shows "We collect" / "We return"
    // selected with a Default badge, so the payload and the screen agree.
    const p = payload();
    expect(p.equipmentItems[0].mobilizationByRentee).toBe(true);
    expect(p.equipmentItems[0].demobilizationByRentee).toBe(true);
  });

  it("follows the per-item override ahead of the request-wide value", () => {
    const project = defaultProjectDetails(); // both "me"
    const p = payload({ project, items: [makeItem({ deliveryOverride: "supplier", returnOverride: "supplier" })] });
    expect(p.equipmentItems[0].mobilizationByRentee).toBe(false);
    expect(p.equipmentItems[0].demobilizationByRentee).toBe(false);
  });

  it("follows a request-wide supplier choice", () => {
    const project = defaultProjectDetails();
    project.deliveryToSite = "supplier";
    project.returnFromSite = "supplier";
    const p = payload({ project });
    expect(p.equipmentItems[0].mobilizationByRentee).toBe(false);
    expect(p.equipmentItems[0].demobilizationByRentee).toBe(false);
  });
});

describe("working days per week (MREQ-AC-35)", () => {
  it("submits the contract default of 6, since the canvas offers no control", () => {
    const project = defaultProjectDetails();
    expect(project.advanced.workingDaysPerWeek).toBe(6);
    // Friday-off is the platform's billing rule, and 6 working days a week is what that means.
  });
});

describe("equipment certificates globalize (MREQ-AC-46)", () => {
  it("lifts a uniform set to the request and nulls the per-item overrides", () => {
    const draft = agentOutputToDraft({
      rfq_header: {} as never,
      line_items: [
        { input_equipment: "digger", safety_certifications: ["TUV"] },
        { input_equipment: "loader", safety_certifications: ["TUV"] },
      ] as never,
      missing_required_fields: [],
      justifications: [],
      field_notes: [],
    });

    expect(draft.project.certificates.safety).toEqual(["tuv"]);
    for (const item of draft.items) expect(item.safetyCertsOverride).toBeNull();
  });

  it("keeps per-item overrides when the items disagree", () => {
    const draft = agentOutputToDraft({
      rfq_header: {} as never,
      line_items: [
        { input_equipment: "digger", safety_certifications: ["TUV"] },
        { input_equipment: "crane", safety_certifications: ["ARAMCO"] },
      ] as never,
      missing_required_fields: [],
      justifications: [],
      field_notes: [],
    });

    expect(draft.project.certificates.safety).toEqual([]);
    expect(draft.items.map((i) => i.safetyCertsOverride)).toEqual([["tuv"], ["aramco"]]);
  });
});

describe("an explicit 'nothing' answer is the same payload as unset (MREQ-AC-55)", () => {
  // The UI year becomes the backend's maxEquipmentAge; "any" and unset both drop the key entirely.
  it("maps 'any' year to no year at all", () => {
    const explicit = payload({ items: [makeItem({ equipmentYear: "any" })] });
    const unset = payload({ items: [makeItem({ equipmentYear: null })] });
    expect(explicit.equipmentItems[0].maxEquipmentAge).toBeUndefined();
    expect(explicit.equipmentItems[0].maxEquipmentAge).toBe(unset.equipmentItems[0].maxEquipmentAge);
  });

  it("maps an empty certificate list to no certificate requirement", () => {
    const explicit = payload({ items: [makeItem({ safetyCertsOverride: [] })] });
    const unset = payload({ items: [makeItem({ safetyCertsOverride: null })] });
    expect(explicit.equipmentItems[0].safetyCertifications).toEqual(unset.equipmentItems[0].safetyCertifications);
  });
});

describe("the agent's silence on the operator is not a yes", () => {
  const parse = (line: Record<string, unknown>) =>
    agentOutputToDraft({
      rfq_header: {} as never,
      line_items: [line] as never,
      missing_required_fields: [],
      justifications: [],
      field_notes: [],
    });

  /**
   * The normalization agent returns `operator_included: null` deliberately — its prompt says "never
   * auto-fill — operator demand is a commercial choice, unlike fuel". The web used to overwrite that
   * with the app's hand-built-line default, which is "yes" for everything but generators, compressors
   * and light towers. That turned a non-answer into a demand for an operator, which is a priced line,
   * and opened the operator rail as though the renter had asked for one.
   */
  it("leaves the operator off when the RFQ said nothing", () => {
    const draft = parse({ input_equipment: "4 forklifts" });
    expect(draft.items[0].operatorNeeded).toBe("no");
  });

  it("still honours an operator the RFQ did ask for", () => {
    expect(parse({ input_equipment: "digger with operator", operator_included: true }).items[0].operatorNeeded).toBe("yes");
    expect(parse({ input_equipment: "digger, we drive it", operator_included: false }).items[0].operatorNeeded).toBe("no");
  });

  it("does not send an operator the renter never asked for", () => {
    // Real taxonomy ids, or the mapper has no line to emit.
    const draft = parse({ input_equipment: "4 forklifts", category_id: "cat", subtype_id: "sub", capacity_id: "cap" });
    const p = draftToCreateRequest({ project: defaultProjectDetails(), items: draft.items, preferences: defaultPreferences() }, "user-1");
    expect(p.equipmentItems[0].operatorIncluded).toBe("NO");
  });
});
