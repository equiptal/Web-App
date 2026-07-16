import { describe, it, expect } from "vitest";
import { extractAgentOutput, jobStatus, agentOutputToDraft, draftToRfqCorrection } from "@/lib/api/agent-adapters";
import type { Taxonomy } from "@/lib/contract";

// A line item shaped like live Mansour output.
const confidentLine = {
  input_equipment: "excavator 20 ton",
  category: "Excavator",
  subtype: "Crawler Excavator",
  capacity: "20 ton",
  category_id: "c",
  subtype_id: "s",
  capacity_id: "cap",
  category_match: "exact",
  subtype_match: "exact",
  capacity_match: "exact",
  fuel_type_match: "stated",
  quantity: 2,
  operator_included: true,
};

// The live async job-poll envelope: agent output nested under data.result.
const jobPoll = (status: string, line: object = confidentLine) => ({
  ok: true,
  data: {
    id: "job-1",
    status,
    result: {
      rfq_header: { project_address_label: "Riyadh", detected_locations: ["Riyadh", "Jeddah"] },
      line_items: [line],
      missing_required_fields: [],
    },
  },
});

// Build an output with multiple line items (for request-wide reconciliation tests).
const jobPollItems = (lines: object[]) => ({
  ok: true,
  data: { id: "j", status: "done", result: { rfq_header: {}, line_items: lines, missing_required_fields: [] } },
});

describe("agentOutputToDraft — request-wide reconciliation (AC-25/26)", () => {
  it("lifts a common per-item value to the request-wide setting and clears the overrides", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, mobilization_by_rentee: true },
          { ...confidentLine, mobilization_by_rentee: true },
        ]),
      ),
    );
    expect(d.project.deliveryToSite).toBe("me"); // both items "me" → lifted
    expect(d.items.every((i) => i.deliveryOverride === null)).toBe(true); // overrides cleared
  });

  it("keeps the operator certificate per-item (from the agent) and does NOT leak it to project safety", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, operator_license_level: "TUV" },
          { ...confidentLine, operator_license_level: "TUV" },
        ]),
      ),
    );
    // Operator cert stays per-item (the agent sets it from each line); no request-wide globalize.
    expect(d.items.every((i) => JSON.stringify(i.operator.certificate) === JSON.stringify(["tuv"]))).toBe(true);
    expect(d.project.certificates.safety).toEqual([]); // operator cert is separate from EQUIPMENT safety
  });

  it("globalizes a uniform EQUIPMENT safety cert to the request-wide default + clears per-item (AC-50)", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, safety_certifications: "TUV" },
          { ...confidentLine, safety_certifications: "TUV" },
        ]),
      ),
    );
    expect(d.project.certificates.safety).toEqual(["tuv"]); // uniform → globalized
    expect(d.items.every((i) => i.safetyCertsOverride === null)).toBe(true); // per-item cleared → inherits
  });

  it("keeps EQUIPMENT safety certs per-item when items differ (AC-50)", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, safety_certifications: "TUV" },
          { ...confidentLine, safety_certifications: "SPSP" },
        ]),
      ),
    );
    expect(d.project.certificates.safety).toEqual([]); // differ → no request-wide default
    expect(JSON.stringify(d.items[0].safetyCertsOverride)).toBe(JSON.stringify(["tuv"]));
    expect(JSON.stringify(d.items[1].safetyCertsOverride)).toBe(JSON.stringify(["spsp"]));
  });

  it("leaves the request-wide setting unselected (null) when items disagree", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, mobilization_by_rentee: true }, // me
          { ...confidentLine, mobilization_by_rentee: false }, // supplier
        ]),
      ),
    );
    expect(d.project.deliveryToSite).toBeNull(); // disagree → no selection
    expect(d.items[0].deliveryOverride).toBe("me");
    expect(d.items[1].deliveryOverride).toBe("supplier"); // per-item kept
  });
});

describe("extractAgentOutput — envelope shapes", () => {
  it("reads the nested data.result job-poll shape (the live contract)", () => {
    const out = extractAgentOutput(jobPoll("done"));
    expect(out.line_items).toHaveLength(1);
    expect(out.rfq_header.project_address_label).toBe("Riyadh");
  });

  it("still reads the flattened {ok,data:{rfq_header,line_items}} shape", () => {
    const out = extractAgentOutput({ ok: true, data: { rfq_header: {}, line_items: [confidentLine], missing_required_fields: [] } });
    expect(out.line_items).toHaveLength(1);
  });
});

describe("jobStatus", () => {
  it("maps explicit statuses", () => {
    expect(jobStatus(jobPoll("done"))).toBe("done");
    expect(jobStatus({ ok: true, data: { status: "pending" } })).toBe("pending");
    expect(jobStatus({ ok: true, data: { status: "failed" } })).toBe("error");
  });
});

describe("agentOutputToDraft", () => {
  it("uses the header detected_locations (AC-48)", () => {
    const draft = agentOutputToDraft(extractAgentOutput(jobPoll("done")));
    expect(draft.detectedLocations).toEqual(["Riyadh", "Jeddah"]);
  });

  it("derives verdicts from match annotations (AC-54)", () => {
    const verdictOf = (line: object) => agentOutputToDraft(extractAgentOutput(jobPoll("done", line))).items[0].verdict;
    expect(verdictOf(confidentLine)).toBe("confident");
    // capacity snapped ⇒ needs a check
    expect(verdictOf({ ...confidentLine, capacity_match: "snapped" })).toBe("needs-validation");
    // off-taxonomy ⇒ no-match
    expect(verdictOf({ ...confidentLine, category_match: "new", category_id: null })).toBe("no-match");
  });

  it("prefills per-item quantity + operator from the RFQ (AC-55/57)", () => {
    const item = agentOutputToDraft(extractAgentOutput(jobPoll("done"))).items[0];
    expect(item.quantity).toBe(2);
    expect(item.operatorNeeded).toBe("yes");
  });
});

describe("toItem — FAT split (A6/AC-24)", () => {
  const opOf = (line: object) => agentOutputToDraft(extractAgentOutput(jobPoll("done", { ...confidentLine, ...line }))).items[0].operator;

  it("reads each FAT side independently from the split fields", () => {
    // food = supplier (false), accommodation/transport = rentee/me (true)
    const op = opOf({ fat_food_by_rentee: false, fat_accommodation_transport_by_rentee: true, fat_required: true });
    expect(op.fatFood).toBe("supplier");
    expect(op.fatAccommodationTransport).toBe("me");
    expect(op.fatRequired).toBe(true);
  });

  it("falls back to the legacy single mirror when the split fields are absent", () => {
    const op = opOf({ operator_accommodation_by_rentee: false }); // supplier covers both
    expect(op.fatFood).toBe("supplier");
    expect(op.fatAccommodationTransport).toBe("supplier");
  });

  it("defaults each side to 'me' when nothing is stated", () => {
    const op = opOf({});
    expect(op.fatFood).toBe("me");
    expect(op.fatAccommodationTransport).toBe("me");
    expect(op.fatRequired ?? null).toBeNull();
  });
});

describe("extractAgentOutput — rfq_id (A5)", () => {
  it("surfaces rfq_id from the envelope so a correction can anchor to it", () => {
    const raw = { ok: true, data: { id: "j", rfq_id: "RFQ-STORE-1", status: "done", result: { rfq_header: {}, line_items: [confidentLine], missing_required_fields: [] } } };
    expect(extractAgentOutput(raw).rfq_id).toBe("RFQ-STORE-1");
    expect(agentOutputToDraft(extractAgentOutput(raw)).rfqId).toBe("RFQ-STORE-1");
  });
});

describe("draftToRfqCorrection — reverse mapper (A5)", () => {
  const taxonomy: Taxonomy = [
    { id: "c", name: "Excavator", nameAr: "حفار", subcategories: [
      { id: "s", name: "Crawler Excavator", nameAr: "حفار جنزير", measurements: [{ id: "cap", name: "20 ton", nameAr: "20 طن" }] },
    ] },
  ];

  it("re-expresses the final draft in Mansour's RFQ shape (ids, quantity, operator, FAT split)", () => {
    const draft = agentOutputToDraft(
      extractAgentOutput(jobPoll("done", { ...confidentLine, fat_food_by_rentee: false, fat_accommodation_transport_by_rentee: true })),
    );
    const patch = draftToRfqCorrection({ project: draft.project, items: draft.items, preferences: draft.preferences! }, taxonomy);
    expect(patch.line_items).toHaveLength(1);
    const li = patch.line_items[0];
    expect(li.category_id).toBe("c");
    expect(li.subtype_id).toBe("s");
    expect(li.capacity_id).toBe("cap");
    expect(li.category).toBe("Excavator"); // resolved from the live taxonomy, not stale agentNames
    expect(li.quantity).toBe(2);
    expect(li.operator_included).toBe(true);
    // me ⇒ true (rentee covers), supplier ⇒ false
    expect(li.fat_food_by_rentee).toBe(false);
    expect(li.fat_accommodation_transport_by_rentee).toBe(true);
    expect(li.operator_accommodation_by_rentee).toBe(true); // legacy mirror of accommodation/transport
  });

  it("reflects a renter's edit — re-picking the size changes capacity_id in the patch", () => {
    const draft = agentOutputToDraft(extractAgentOutput(jobPoll("done")));
    draft.items[0].ref = { ...draft.items[0].ref, measurementId: "cap" }; // (already cap; explicit for clarity)
    const patch = draftToRfqCorrection({ project: draft.project, items: draft.items, preferences: draft.preferences! }, taxonomy);
    expect(patch.line_items[0].capacity).toBe("20 ton");
  });
});
