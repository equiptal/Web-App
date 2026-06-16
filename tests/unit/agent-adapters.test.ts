import { describe, it, expect } from "vitest";
import { extractAgentOutput, jobStatus, agentOutputToDraft } from "@/lib/api/agent-adapters";

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

  it("reflects a common agent operator certificate at the project Safety level (AC-50)", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, operator_license_level: "TUV" },
          { ...confidentLine, operator_license_level: "TUV" },
        ]),
      ),
    );
    expect(d.project.certificates.safety).toEqual(["tuv"]); // checked at project level
    expect(d.items.every((i) => JSON.stringify(i.operator.certificate) === JSON.stringify(["tuv"]))).toBe(true);
  });

  it("lifts the common cert even when a no-operator item has none (AC-50)", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        jobPollItems([
          { ...confidentLine, operator_license_level: "TUV" },
          { ...confidentLine, operator_included: false }, // e.g. a generator — no cert
        ]),
      ),
    );
    expect(d.project.certificates.safety).toEqual(["tuv"]); // no-operator item doesn't block the lift
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
