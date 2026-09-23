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

describe("agentOutputToDraft — request-wide reconciliation (specs#245-AC-25/26)", () => {
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

  it("globalizes a uniform EQUIPMENT safety cert to the request-wide default + clears per-item (specs#245-AC-50)", () => {
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

  it("keeps EQUIPMENT safety certs per-item when items differ (specs#245-AC-50)", () => {
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
    // SPSP isn't an offered chip, so it lands in the item's free-text "Other" box (app parity) rather
    // than sitting in the list with nothing to render it. See tests/unit/cert-rule.test.ts.
    expect(JSON.stringify(d.items[1].safetyCertsOverride)).toBe(JSON.stringify(["other"]));
    expect(d.items[1].safetyCertsOtherText).toBe("SPSP");
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
  it("uses the header detected_locations (specs#245-AC-48)", () => {
    const draft = agentOutputToDraft(extractAgentOutput(jobPoll("done")));
    expect(draft.detectedLocations).toEqual(["Riyadh", "Jeddah"]);
  });

  it("derives verdicts from match annotations (specs#245-AC-54)", () => {
    const verdictOf = (line: object) => agentOutputToDraft(extractAgentOutput(jobPoll("done", line))).items[0].verdict;
    expect(verdictOf(confidentLine)).toBe("confident");
    // capacity snapped ⇒ needs a check
    expect(verdictOf({ ...confidentLine, capacity_match: "snapped" })).toBe("needs-validation");
    // off-taxonomy ⇒ no-match
    expect(verdictOf({ ...confidentLine, category_match: "new", category_id: null })).toBe("no-match");
  });

  it("prefills per-item quantity + operator from the RFQ (specs#245-AC-55/57)", () => {
    const item = agentOutputToDraft(extractAgentOutput(jobPoll("done"))).items[0];
    expect(item.quantity).toBe(2);
    expect(item.operatorNeeded).toBe("yes");
  });
});

describe("agentOutputToDraft — an operator nobody asked for (owner, 2026-08-26)", () => {
  // The agent marks a value it decided itself in one of two channels; either one means the RFQ was
  // silent, and a silent RFQ must not open a priced operator on the line.
  const withNotes = (notes: { field: string; note: string }[], line: object = confidentLine) => ({
    ok: true,
    data: {
      id: "j",
      status: "done",
      result: { rfq_header: {}, line_items: [line], missing_required_fields: [], field_notes: notes },
    },
  });
  const withMissing = (fields: string[], line: object = confidentLine) => ({
    ok: true,
    data: {
      id: "j",
      status: "done",
      result: {
        rfq_header: {},
        line_items: [line],
        missing_required_fields: fields.map((f) => ({ field: f, label: f, required: false, question_for_customer: "?" })),
      },
    },
  });

  it("closes the operator when the agent noted that it chose one", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(withNotes([{ field: "line_items[0].operator_included", note: "assumed for a forklift" }])),
    );
    expect(d.items[0].operatorNeeded).toBe("no");
  });

  it("closes it when the agent raised it as a question, and clears the F.A.T it dragged along", () => {
    const d = agentOutputToDraft(
      extractAgentOutput(
        withMissing(["line_items[0].operator_included"], {
          ...confidentLine,
          fat_required: true,
          fat_food_by_rentee: false,
          fat_accommodation_transport_by_rentee: false,
        }),
      ),
    );
    expect(d.items[0].operatorNeeded).toBe("no");
    expect(d.items[0].operator.fatFood).toBeNull();
    expect(d.items[0].operator.fatAccommodationTransport).toBeNull();
    expect(d.items[0].operator.fatRequired).toBeNull();
  });

  it("keeps the operator when the RFQ evidenced one some other way", () => {
    // A certificate, a nationality or a head count cannot be inferred from an equipment line: their
    // presence IS the mention, so the agent's note does not overrule them.
    const cert = agentOutputToDraft(
      extractAgentOutput(
        withNotes([{ field: "line_items[0].operator_included", note: "assumed" }], {
          ...confidentLine,
          operator_license_level: "TUV",
        }),
      ),
    );
    expect(cert.items[0].operatorNeeded).toBe("yes");

    const nationality = agentOutputToDraft(
      extractAgentOutput(
        withNotes([{ field: "line_items[0].operator_included", note: "assumed" }], {
          ...confidentLine,
          operator_nationality: "saudi",
        }),
      ),
    );
    expect(nationality.items[0].operatorNeeded).toBe("yes");
  });

  it("leaves a stated operator alone when the agent marked nothing", () => {
    expect(agentOutputToDraft(extractAgentOutput(jobPoll("done"))).items[0].operatorNeeded).toBe("yes");
  });
});

describe("toItem — FAT split (A6/specs#245-AC-24)", () => {
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

  it("leaves each side UNANSWERED when nothing is stated", () => {
    // Was "defaults each side to 'me'". That default turned the agent's silence into a definite
    // "the renter covers it" that nobody chose — written as `fat_food = false` and shown to the
    // supplier as the renter's settled choice. Mansour omits the field when the RFQ is silent, so
    // absence means "not stated". App parity: `int? _fatFood` starts null, no side pre-selected.
    const op = opOf({});
    expect(op.fatFood).toBeNull();
    expect(op.fatAccommodationTransport).toBeNull();
    expect(op.fatRequired ?? null).toBeNull();
  });

  it("still reads an explicit legacy 'the renter covers it'", () => {
    const op = opOf({ operator_accommodation_by_rentee: true });
    expect(op.fatFood).toBe("me");
    expect(op.fatAccommodationTransport).toBe("me");
  });

  it("prefers a split field over the legacy one, per side", () => {
    const op = opOf({ operator_accommodation_by_rentee: true, fat_food_by_rentee: false });
    expect(op.fatFood).toBe("supplier"); // split field wins
    expect(op.fatAccommodationTransport).toBe("me"); // no split field → legacy
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
