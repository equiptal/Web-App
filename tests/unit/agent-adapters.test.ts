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
