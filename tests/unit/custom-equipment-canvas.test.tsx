import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

/**
 * The canvas with `NEXT_PUBLIC_CUSTOM_EQUIPMENT=1`: the renter NAMES the machine the catalogue could
 * not place, and the row stops being a dead end.
 *
 * The flag is read at module load, so the component tree is imported inside each case, after the
 * environment is set. `canvas-no-match.test.tsx` is the same screen with the flag off.
 */
const FLAG = "NEXT_PUBLIC_CUSTOM_EQUIPMENT";
const REAL = process.env[FLAG];

async function withFlag() {
  vi.resetModules();
  process.env[FLAG] = "1";
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

    const box = screen.getByPlaceholderText("Name the machine you need") as HTMLInputElement;
    expect(box.value).toBe("floating crane barge");
    // The list is NOT taken away: a renter who can find his machine in it still can.
    expect(screen.getAllByText("TYPE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SIZE").length).toBeGreaterThan(0);
    // And the row says what will happen to it, including the one route to a supplier.
    expect(screen.getByText(/isn't available yet/i)).toBeTruthy();
    expect(screen.getByText(/share its link with your own suppliers/i)).toBeTruthy();
  });

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

    const box = screen.getByPlaceholderText("Name the machine you need") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "split hopper barge" } });
    expect((screen.getByPlaceholderText("Name the machine you need") as HTMLInputElement).value).toBe("split hopper barge");
  });
});
