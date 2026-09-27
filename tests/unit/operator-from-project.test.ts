import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import { quickItemsToDraft, quickResultToDraft } from "@/lib/agent/quick-draft";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import { blankTerms } from "@/lib/contract/work-order";

/**
 * **The project's operator answer reaches a line the renter said nothing about** (owner, 2026-09-26:
 * *"if the project has no operator then why it is opened always?"*).
 *
 * A project routes a short line to the fast lane, and Tier 0 builds its item from `newManualItem`,
 * which seeds `operatorNeeded: "yes"` (the app's default for a line added BY HAND). That seed sat in
 * the agent snapshot, `applyMachineTerms` read it as the renter's own statement, and the project's
 * «no operator» never landed: the rail opened on every request with a project.
 */
const match = {
  categoryId: "cat-earth",
  subcategoryId: "sub-exc",
  measurementId: "cap-20",
  subcategoryName: "Excavator",
  measurementName: "20 Ton",
  quantity: 1,
} as Parameters<typeof quickResultToDraft>[0];

const withTerms = (operatorNeeded: "yes" | "no") =>
  reducer(
    { ...initialState, templateTerms: { ...blankTerms(), operatorNeeded } },
    { t: "PROCESS_SUCCESS", draft: quickResultToDraft(match, null, "excavator 20 ton") },
  );

describe("the project's operator answer on a Tier-0 line", () => {
  it("takes the project's «no operator»", () => {
    expect(withTerms("no").draft!.items[0].operatorNeeded).toBe("no");
  });

  it("takes the project's «with operator»", () => {
    expect(withTerms("yes").draft!.items[0].operatorNeeded).toBe("yes");
  });

  it("reads silence as «no» when the project has no operator term at all", () => {
    const s = reducer(initialState, {
      t: "PROCESS_SUCCESS",
      draft: quickResultToDraft(match, null, "excavator 20 ton"),
    });
    expect(s.draft!.items[0].operatorNeeded).toBe("no");
  });
});

/**
 * Owner, 2026-09-27: *"the project says no for operator but the request open it and send it with
 * operator !! it is critical"*. Two more ways the project's «no» was lost, both reproduced first.
 */
describe("the project's «no operator» survives the other lanes and a type change", () => {
  const noOp = { ...initialState, templateTerms: { ...blankTerms(), operatorNeeded: "no" as const } };
  const line = { subtype_id: "s", category_id: "c", capacity_id: "m", quantity: 1 };

  it("tier 1, agent silent: no", () => {
    const d = quickItemsToDraft({ line_items: [line] } as never, null, "excavator");
    expect(reducer(noOp, { t: "PROCESS_SUCCESS", draft: d }).draft!.items[0].operatorNeeded).toBe("no");
  });

  it("tier 1, agent GUESSED an operator (marked in field_notes): the project's no wins", () => {
    const d = quickItemsToDraft(
      { line_items: [{ ...line, operator_included: true }], field_notes: [{ field: "line_items[0].operator_included", note: "assumed" }] } as never,
      null,
      "excavator",
    );
    expect(reducer(noOp, { t: "PROCESS_SUCCESS", draft: d }).draft!.items[0].operatorNeeded).toBe("no");
  });

  it("tier 1, agent read an operator with NO guess mark: the text wins over the project", () => {
    const d = quickItemsToDraft({ line_items: [{ ...line, operator_included: true }] } as never, null, "excavator with operator");
    expect(reducer(noOp, { t: "PROCESS_SUCCESS", draft: d }).draft!.items[0].operatorNeeded).toBe("yes");
  });

  it("tier 2, agent silent: no", () => {
    const d = agentOutputToDraft({ rfq_header: {}, line_items: [{ ...line, operator_included: null }] } as never);
    expect(reducer(noOp, { t: "PROCESS_SUCCESS", draft: d }).draft!.items[0].operatorNeeded).toBe("no");
  });

  it("changing the machine type keeps the project's no, not the app default", () => {
    let s = reducer(noOp, { t: "PROCESS_SUCCESS", draft: quickResultToDraft(match, null, "excavator 20 ton") });
    s = reducer(s, { t: "SET_ITEM_SUBCATEGORY", id: s.draft!.items[0].id, subcategoryId: "s2" });
    expect(s.draft!.items[0].operatorNeeded).toBe("no");
  });

  it("with no project answer, a type change still takes the app default (AC-24)", () => {
    let s = reducer(initialState, { t: "PROCESS_SUCCESS", draft: quickResultToDraft(match, null, "excavator 20 ton") });
    s = reducer(s, { t: "SET_ITEM_SUBCATEGORY", id: s.draft!.items[0].id, subcategoryId: "s2" });
    expect(s.draft!.items[0].operatorNeeded).toBe("yes");
  });
});
