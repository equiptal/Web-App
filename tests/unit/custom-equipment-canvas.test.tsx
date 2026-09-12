import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

/**
 * The canvas with off-catalogue equipment ON (the default): the renter NAMES the machine the
 * catalogue could not place, and the row stops being a dead end.
 *
 * The flag is read at module load, so the component tree is imported inside each case, after the
 * environment is set. `canvas-no-match.test.tsx` is the same screen with the kill switch thrown.
 */
const FLAG = "NEXT_PUBLIC_CUSTOM_EQUIPMENT";
const REAL = process.env[FLAG];

async function withFlag() {
  vi.resetModules();
  delete process.env[FLAG]; // ON by default
  const setup = await import("../setup/canvas");
  const { Canvas } = await import("@/components/create/Canvas");
  const gates = await import("@/lib/contract/gates");
  return { ...setup, Canvas, gates };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (REAL === undefined) delete process.env[FLAG];
  else process.env[FLAG] = REAL;
  vi.resetModules();
});

describe("naming a machine the catalogue does not carry", () => {
  it("offers the name box, prefilled with the renter's own words, beside the type and size lists", async () => {
    const { Canvas, confirmedProject, makeAgentDraft, makeItem, renderCanvas } = await withFlag();
    const barge = makeItem({
      id: "nm1",
      rawLabel: "floating crane barge",
      rawSize: null,
      ref: { categoryId: null, subcategoryId: null, measurementId: null },
      verdict: "no-match",
      resolved: false,
    });
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [barge], project: confirmedProject() }),
      text: "floating crane barge for two weeks",
    });

    const box = screen.getByPlaceholderText("Name the equipment you need") as HTMLInputElement;
    expect(box.value).toBe("floating crane barge");
    /* The list is NOT taken away: a renter who can find his machine in it still can. And the name
       field sits in the SAME box as the list, under it, with the note after both (owner,
       2026-09-06): one question — which machine is this — answered two ways, then the sentence
       saying why the first way came up empty. Two separate cards read as two unrelated asks. */
    expect(screen.getAllByText("TYPE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SIZE").length).toBeGreaterThan(0);
    /* ── The NAME leads the box (owner, 2026-09-12) ────────────────────────────────────
       It stopped being a field that appears when the catalogue fails and became «what the renter
       calls this machine», on every line — so it sits ABOVE the two lists, with the note as its own
       hint. Reads: the box, its note, then TYPE and SIZE under them. */
    const order = ["Name the equipment you need", "This equipment type is not available", "TYPE"].map((needle) =>
      document.body.innerHTML.indexOf(needle),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    /* And the row says what will happen to it, in the owner’s own words (2026-09-06).

       ONE copy. It was two while the note was pinned to the label — a label row cannot wrap, so a
       phone needed its own copy underneath. In the hint slot the note wraps like any other line of
       guidance, and two copies to keep in step were two chances to drift. */
    expect(screen.getAllByText(/This equipment type is not available/i)).toHaveLength(1);
    expect(screen.getAllByText(/share the link with your suppliers/i)).toHaveLength(1);
    /* ~~«Message us», beside the sentence.~~ Removed the same day (owner). The note already tells
       the renter what to do — post it, share the link — and a control there sent him into another
       app in the middle of filling in a request. The sourcing ask survives only on the kill-switch
       row, where the machine really is dropped and there is nothing else to press. */
    expect(screen.queryByText(/^Message us$/)).toBeNull();
    expect(screen.queryByText(/We're looking for this one/i)).toBeNull();
  }, 20_000);

  it("blocks the send when he clears it, and the reason names the box", async () => {
    const { confirmedProject, makeAgentDraft, makeItem, gates } = await withFlag();
    const named = makeItem({ id: "nm1", rawLabel: "floating crane barge", ref: { categoryId: null, subcategoryId: null, measurementId: null }, verdict: "no-match", resolved: false });
    const draft = makeAgentDraft({ items: [named], project: confirmedProject() });

    // Named (by his own RFQ words): it posts, and nothing on the line is owed.
    expect(gates.postableItems(draft.items).map((i) => i.id)).toEqual(["nm1"]);
    expect(gates.itemAppGaps(draft.items[0])).toEqual([]);

    // Cleared: it neither posts nor passes, and the gap points at the box.
    const cleared = { ...draft.items[0], customEquipment: "" };
    expect(gates.postableItems([cleared])).toHaveLength(0);
    expect(gates.itemAppGaps(cleared).map((g) => g.reason)).toEqual(["gate.customEquipmentMissing"]);
  });

  it("types a new name into the box", async () => {
    const { Canvas, confirmedProject, makeAgentDraft, makeItem, renderCanvas } = await withFlag();
    const barge = makeItem({
      id: "nm1",
      rawLabel: "floating crane barge",
      rawSize: null,
      ref: { categoryId: null, subcategoryId: null, measurementId: null },
      verdict: "no-match",
      resolved: false,
    });
    await renderCanvas(<Canvas />, { draft: makeAgentDraft({ items: [barge], project: confirmedProject() }) });

    const box = screen.getByPlaceholderText("Name the equipment you need") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "split hopper barge" } });
    expect((screen.getByPlaceholderText("Name the equipment you need") as HTMLInputElement).value).toBe("split hopper barge");
  }, 20_000);

  /**
   * ⚠️ The row vanished under the renter's own hand (owner, 2026-09-06).
   *
   * Picking a subtype cleared `isCustomLine` — it reads the subtype — while the verdict stayed
   * `no-match`, so the card swapped the taxonomy trio he had just used back for the «not available»
   * panel, and the line still did not post. The pick now ends the off-catalogue state outright.
   */
  it("keeps the row when the renter finds his machine in the list after all", async () => {
    const { confirmedProject, makeAgentDraft, makeItem, gates } = await withFlag();
    const { reducer, initialState } = await import("@/lib/store/rfq-store");

    const barge = makeItem({
      id: "nm1",
      rawLabel: "jeep truck",
      rawSize: null,
      ref: { categoryId: null, subcategoryId: null, measurementId: null },
      verdict: "no-match",
      resolved: false,
    });
    // `makeAgentDraft` returns the AGENT's half of a draft (no preferences — the store seeds those),
    // which is the shape `PROCESS_SUCCESS` consumes; the reducer only reads `items` here.
    const before = {
      ...initialState,
      draft: makeAgentDraft({ items: [barge], project: confirmedProject() }),
    } as unknown as Parameters<typeof reducer>[0];
    expect(gates.isCustomLine(before.draft!.items[0])).toBe(true);

    // Both dispatches, in the card's own order: the picker sets the parent category from the chosen
    // subtype before setting the subtype itself.
    const withCat = reducer(before, { t: "SET_ITEM_CATEGORY", id: "nm1", categoryId: "cat-earth" });
    const after = reducer(withCat, { t: "SET_ITEM_SUBCATEGORY", id: "nm1", subcategoryId: "sub-crawler" });
    const item = after.draft!.items[0];

    // No longer off-catalogue in ANY of the three senses that decide what the card draws.
    expect(item.verdict).toBe("needs-validation");
    expect(gates.isCustomLine(item)).toBe(false);
    expect(item.customEquipment ?? null).toBeNull();
    // And it is a real line again: it posts, and it asks for the size like any other.
    expect(gates.postableItems([item]).map((i) => i.id)).toEqual(["nm1"]);
    expect(gates.itemAppGaps(item).map((g) => g.field)).toEqual(["capacity"]);
  });
});
