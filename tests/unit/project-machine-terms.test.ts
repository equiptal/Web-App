import { describe, it, expect } from "vitest";
import { blankTerms, countDifferences } from "@/components/projects/TermsFields";
import { workOrderPayload, blankMachine, type WorkOrderDraft } from "@/components/projects/WorkOrderForm";
import { EMPTY_WHEN, termsToWire } from "@/lib/contract/work-order";

/**
 * Machine terms (spec §5.2 · PROJ-AC-43, PROJ-AC-44).
 *
 * These two criteria went unchecked through a whole ticket. W-T17 shipped with the note *"the
 * per-machine terms editor is a stub"* in a commit body, which nothing reads afterwards — not the
 * ticket list, not the UAT script, not the owner, who found it by trying to use the form. So the
 * criteria are asserted here rather than trusted to a caveat.
 */

const draft = (over: Partial<WorkOrderDraft> = {}): WorkOrderDraft => ({
  title: "Own fleet — Qiddiya",
  when: { ...EMPTY_WHEN },
  machines: [blankMachine()],
  ...over,
});

describe("every machine states its own terms", () => {
  it("always sends them, so nothing depends on an order-level fallback", () => {
    /* The backend still has a fallback for a machine with an empty terms blob. It is left unused
       rather than relied on: a row that says what it means cannot be changed later by editing
       something else. */
    const rows = workOrderPayload(draft(), { create: true }).body.items as Record<string, unknown>[];
    expect("terms" in rows[0]).toBe(true);
  });

  it("gives a new machine the FIRST machine's terms, as a copy", () => {
    /* This is what replaced the shared block (owner, 2026-08-31). The renter answers once and the
       second machine arrives already answered — seeded, not linked, so editing one never edits the
       other. */
    const first = { ...blankTerms(), deliveryOverride: "supplier" as const };
    const second = blankMachine(first);

    expect(second.terms.deliveryOverride).toBe("supplier");

    second.terms.deliveryOverride = "me";
    expect(first.deliveryOverride, "the seed must not be shared by reference").toBe("supplier");
  });

  it("copies the nested operator block too, not just the flat fields", () => {
    // A shallow copy would leave two machines sharing one operator object and editing each other.
    const first = {
      ...blankTerms(),
      operator: { ...blankTerms().operator, fatFood: "supplier" } as ReturnType<typeof blankTerms>["operator"],
    };
    const second = blankMachine(first);

    expect(second.terms.operator?.fatFood).toBe("supplier");
    second.terms.operator!.fatFood = "me";
    expect(first.operator?.fatFood).toBe("supplier");
  });

  it("starts blank when there is nothing to seed from", () => {
    expect(blankMachine().terms).toEqual(blankTerms());
  });
});

describe("how many fields a machine states differently", () => {
  it("counts nothing when it follows the order", () => {
    expect(countDifferences(null, blankTerms())).toBe(0);
    expect(countDifferences(blankTerms(), blankTerms())).toBe(0);
  });

  it("counts each field that actually differs, so the card can say so (AC-43)", () => {
    const shared = blankTerms();
    const mine = { ...shared, deliveryOverride: "me" as const, equipmentYear: "2018" };
    expect(countDifferences(mine, shared)).toBe(2);
  });

  it("does not count an empty box against an unset one", () => {
    /* A renter who opened a field, typed, and cleared it again has changed nothing. Counting "" as
       different from null would mark the card and mean nothing by it. */
    const shared = blankTerms();
    const mine = { ...shared, safetyCertsOtherText: "" };
    expect(countDifferences(mine, shared)).toBe(0);
  });

  it("compares certificate sets by content, not by order", () => {
    const shared = { ...blankTerms(), safetyCertsOverride: ["tuv", "aramco"] as never };
    const mine = { ...blankTerms(), safetyCertsOverride: ["aramco", "tuv"] as never };
    expect(countDifferences(mine, shared)).toBe(0);

    const fewer = { ...blankTerms(), safetyCertsOverride: ["tuv"] as never };
    expect(countDifferences(fewer, shared)).toBe(1);
  });

  it("counts a nested operator field, which a shallow compare would miss", () => {
    /* `fatFood` rather than `nightShift`: night shift was removed from the form (owner,
       2026-08-31) and is no longer compared, because counting a field nobody can set would make the
       badge say 1 with nothing to point at. */
    const shared = blankTerms();
    const mine = {
      ...shared,
      operator: { ...shared.operator, fatFood: "supplier" } as typeof shared.operator,
    };
    expect(countDifferences(mine, shared)).toBe(1);
  });
});
