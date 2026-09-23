import { describe, expect, it } from "vitest";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import { quickItemsToDraft } from "@/lib/agent/quick-draft";

/**
 * What the agent DID read from the RFQ still arrives filled in (owner, 2026-09-08).
 *
 * The party fields stopped being seeded «me» the same day, and the two halves of that ruling have to
 * hold together: *"if detected by my agent in text it must be there, otherwise empty and the user
 * fills them if required"*. So this pins the FILLED half on both lanes — the full parse and the
 * project fast lane — beside `gates.test.ts`, which pins the empty half.
 */
const line = (over: Record<string, unknown> = {}) => ({
  input_equipment: "crawler excavator",
  category: "Earthmoving",
  subtype: "Crawler excavator",
  capacity: "20 ton",
  category_id: "cat-earth",
  subtype_id: "sub-crawler",
  capacity_id: "cap-20",
  quantity: 1,
  ...over,
});

describe("the full parse", () => {
  it("carries the sides the RFQ stated", () => {
    const draft = agentOutputToDraft({
      rfq_header: {},
      line_items: [line({ mobilization_by_rentee: false, demobilization_by_rentee: true, diesel_included: true })],
    } as never);
    const p = draft.project;
    // One item, so `reconcileRequestWide` lifts each agreed value to the shared control.
    expect(p.deliveryToSite).toBe("supplier"); // by_rentee false ⇒ the supplier brings it
    expect(p.returnFromSite).toBe("me");
    expect(p.fuelResponsibility).toBe("supplier"); // diesel_included true ⇒ the supplier pays
  });

  it("leaves them EMPTY when the RFQ said nothing — no seed steps in", () => {
    const draft = agentOutputToDraft({ rfq_header: {}, line_items: [line()] } as never);
    expect(draft.project.deliveryToSite).toBeNull();
    expect(draft.project.returnFromSite).toBeNull();
    expect(draft.project.fuelResponsibility).toBeNull();
    expect(draft.items[0].deliveryOverride).toBeNull();
  });

  it("keeps them PER ITEM when two lines disagree, and clears the shared control", () => {
    const draft = agentOutputToDraft({
      rfq_header: {},
      line_items: [line({ mobilization_by_rentee: false }), line({ mobilization_by_rentee: true })],
    } as never);
    expect(draft.project.deliveryToSite).toBeNull();
    expect(draft.items.map((i) => i.deliveryOverride)).toEqual(["supplier", "me"]);
  });
});

describe("the project fast lane", () => {
  it("carries what it was told, and nothing it was not", () => {
    const d = quickItemsToDraft(
      { line_items: [line({ mobilization_by_rentee: true, diesel_included: false })] } as never,
      null,
      "crawler excavator 20 ton",
    );
    const it0 = d.items[0];
    expect(it0.deliveryOverride).toBe("me");
    expect(it0.fuelResponsibilityOverride).toBe("me"); // diesel_included false ⇒ the renter pays
    expect(it0.returnOverride).toBeNull(); // not stated, so not answered
  });
});
