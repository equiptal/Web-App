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
    const order = ["Name the equipment you need", "reach Moedatech suppliers", "TYPE"].map((needle) =>
      document.body.innerHTML.indexOf(needle),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    /* And the row says what will happen to it, in the owner’s own words (2026-09-06).

       ONE copy. It was two while the note was pinned to the label — a label row cannot wrap, so a
       phone needed its own copy underneath. In the hint slot the note wraps like any other line of
       guidance, and two copies to keep in step were two chances to drift. */
    expect(screen.getAllByText(/reach Moedatech suppliers/i)).toHaveLength(1);
    /* ⚠️ Both halves still in ONE sentence, and it stays short - but it WRAPS rather than clipping
       (owner, 2026-09-13, an hour after asking for one line: *"the note beside the equipment name is
       wrapped so make it 2 lines fine"*). Clipping a warning is the one thing it must never do. */
    expect(screen.getAllByText(/Share the link yourself/i)).toHaveLength(1);
    /* ── It must NOT claim the catalogue lacks the machine (owner, 2026-09-12) ──────────────────
       *"it is not the case always that this equipment is not available, like what the note says"*.
       Since the renter can take a line off-catalogue himself, the type he rejected is often sitting
       in the list directly above this sentence. The note states what FOLLOWS, not what we stock. */
    expect(document.body.innerHTML).not.toContain("is not available");
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

  it("refuses the keystroke and points at the escape instead", async () => {
    /**
     * 🔴 The box is READ-ONLY (owner, 2026-09-13/14): the name is the agent's output until he
     * rejects the match, and *"if he tries to write then shake the question note - i actually want
     * it read so he understands its use by confirming that he is using his own words"*.
     * The gesture he will make — click, type — changes nothing in the box and moves the one row that
     * can change it. A field that simply does nothing teaches nothing.
     */
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
    expect(box.readOnly).toBe(true);
    fireEvent.keyDown(box, { key: "x" });
    expect(box.value).toBe("floating crane barge");
    expect(document.querySelector(".shake-error")).toBeTruthy();
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

/**
 * ── One escape, one panel, two doors (owner, 2026-09-13/14) ──────────────────────────────────────
 *
 * Planned against his supervisor's prototype and cut down from it: four states became two, three
 * doors became two, and «describe it yourself» became a CONFIRMATION, because he described the
 * machine at the intake and *"i dont want the user to write anything more here"*.
 */
describe("the escape, and the panel behind it", () => {
  const open = async () => {
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
    return screen.getByRole("button", { name: /find the equipment you want/i });
  };

  it("stays on screen while its own panel is open", async () => {
    const row = await open();
    fireEvent.click(row);
    // 🔴 It does NOT disappear behind its panel (owner: *"keep them shown as the prototype"*).
    expect(screen.getByRole("button", { name: /find the equipment you want/i })).toBeTruthy();
    expect(screen.getByText("Widen the search")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Search our catalogue/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Keep my own words/i })).toBeTruthy();
  }, 20_000);

  it("hands him his own words, already written, in a field he may change", async () => {
    /**
     * 🔴 Reversed on 2026-09-14 (owner: *"the text must be editable, why not? it must be from
     * here"*). ~~A read-only confirmation.~~ The box on the CARD stays the agent's output; THIS is
     * where the words become his, and it opens seeded with what he already wrote — so the ordinary
     * case is still one press and nothing retyped.
     */
    const row = await open();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /Keep my own words/i }));

    expect(screen.getByText("THE REQUEST WILL SAY")).toBeTruthy();
    const fields = screen.getAllByPlaceholderText("Name the equipment you need") as HTMLInputElement[];
    // Two boxes share that placeholder: the card's, which is read-only, and this one, which is not.
    const editable = fields.find((f) => !f.readOnly)!;
    expect(editable).toBeTruthy();
    expect(editable.value).toBe("floating crane barge");
    expect(screen.getByRole("button", { name: /Keep my name/i })).toBeTruthy();
  }, 20_000);

  it("asks for the SIZE on the row rather than choosing one for him", async () => {
    const row = await open();
    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: /Search our catalogue/i }));
    /* Sizes differ per type, so picking the first for him is the wrong auto-fill this panel exists
       to avoid. With no category resolved the list opens wide, so every type is offered. */
    fireEvent.click(screen.getAllByRole("button", { name: /Use this/i })[0]);
    expect(screen.getByText("WHICH SIZE?")).toBeTruthy();
  }, 20_000);
});
