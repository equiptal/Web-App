import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import { quickResultToDraft } from "@/lib/agent/quick-draft";
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
