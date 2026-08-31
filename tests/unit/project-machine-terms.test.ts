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
  terms: blankTerms(),
  when: { ...EMPTY_WHEN },
  machines: [blankMachine()],
  ...over,
});

describe("a machine follows the order unless it says otherwise", () => {
  it("sends no terms of its own by default, which is what makes it inherit", () => {
    /* An absent key parses to an empty blob on the backend, and an empty blob is exactly the
       condition under which that row is given the ORDER's terms. Sending `{}` explicitly would work
       too; sending a copy would not — it would freeze today's shared answer onto the row. */
    const rows = workOrderPayload(draft(), { create: true }).body.items as Record<string, unknown>[];
    expect("terms" in rows[0]).toBe(false);
  });

  it("carries its own complete terms once it differs (AC-43)", () => {
    const own = { ...blankTerms(), deliveryOverride: "me" as const };
    const d = draft({
      terms: { ...blankTerms(), deliveryOverride: "supplier" },
      machines: [{ ...blankMachine(), rawLabel: "Crane 50t", offCatalogue: true, terms: own }],
    });

    const row = (workOrderPayload(d, { create: true }).body.items as Record<string, unknown>[])[0];
    const sent = row.terms as Record<string, unknown>;

    // COMPLETE, not a patch: the row states its own delivery outright rather than "shared, except".
    expect(sent.delivery).toBe("me");
    for (const [k, v] of Object.entries(termsToWire(own))) {
      if (v !== null) expect(sent[k], `missing ${k}`).toEqual(v);
    }

    /* And NOT ONE null. `workOrderTermsSchema` is `.partial().strict()`, where partial means
       optional rather than nullable, so a single null fails the whole save. It did: a work order
       with no suppliers on it at all was refused because the terms block travelled with fifteen
       nulls in it. */
    expect(Object.values(sent).filter((v) => v === null)).toEqual([]);

    // And the order still says what it says — one machine differing does not fork the order.
    expect((workOrderPayload(d, { create: true }).body.terms as Record<string, unknown>).delivery).toBe("supplier");
  });

  it("goes back to the shared terms when the override is cleared, with nothing stale left (AC-44)", () => {
    const d = draft({
      terms: { ...blankTerms(), deliveryOverride: "supplier" },
      machines: [{ ...blankMachine(), rawLabel: "Crane 50t", offCatalogue: true, terms: null }],
    });

    const row = (workOrderPayload(d, { create: true }).body.items as Record<string, unknown>[])[0];
    // Not `terms: {}` and not a copy of the old override — the key is simply gone.
    expect("terms" in row).toBe(false);
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
