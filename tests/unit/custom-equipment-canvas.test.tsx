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
    /* ⚠️ Both halves still in ONE sentence, and the sentence is short because it may not wrap now
       (owner, 2026-09-13: *"make sure use shorter sentences to fit"*) — it is `sm:truncate` in a
       two-column cell, so a longer one would not wrap, it would disappear. */
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

/**
 * ── The row offers the door the renter is NOT standing in (owner, 2026-09-13) ────────────────────
 * *"if it is clicked then in its place, with no taxonomy selected, we will write «select from our
 * list»"*.
 *
 * One control, two labels. On a matched line it takes the taxonomy off; on an off-catalogue line it
 * is the way back into the catalogue — and it OPENS the type list, because the lists are still on
 * screen above it and a row that merely points at them is a caption.
 */
describe("the way back into the catalogue", () => {
  it("replaces the «send it with your own name» offer once the line is off-catalogue", async () => {
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

    expect(screen.getByRole("button", { name: /Select from our list/i })).toBeTruthy();
    // The two never stand together: one line cannot be offered both doors at once.
    expect(screen.queryByRole("button", { name: /Use your own name/i })).toBeNull();
  }, 20_000);

  it("points at what the press changed — the name box and its new note pulse together", async () => {
    const { Canvas, confirmedProject, makeAgentDraft, makeItem, renderCanvas, TAXONOMY } = await withFlag();
    // A MATCHED line: it is the one that still carries the way out of the catalogue.
    const matched = makeItem({ id: "m1" });
    await renderCanvas(<Canvas />, { draft: makeAgentDraft({ items: [matched], project: confirmedProject() }) });
    expect(TAXONOMY).toBeTruthy();

    expect(document.querySelector(".attn-pulse")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Use your own name/i }));

    /* The press empties the taxonomy, stars the name box and raises the note. The pulse wraps the
       ROW, so what is outlined is the name box together with the note beside it — the pair the press
       created. The control itself now sits in the row BELOW, under the two lists it emptied
       (owner, 2026-09-13). */
    const pulsed = document.querySelector(".attn-pulse");
    expect(pulsed).toBeTruthy();
    expect(pulsed!.textContent).toContain("reach Moedatech suppliers");
  }, 20_000);

  it("is the SAME control, so it cannot drift into two rows", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/create/MachineCard.tsx"), "utf8");
    /* 🔴 **One control again** (owner, 2026-09-13: *"i want this note inlined with the size-type
       row"*). They were split apart earlier the same day — the way OUT beside the NAME box, the way
       BACK under the LISTS — and both are about the two lists, so both belong under them. One cell,
       one skin, a ternary for the label and another for the press. */
    expect(src).toContain("const ESCAPE_ROW =");
    expect(src.match(/className={ESCAPE_ROW}/g)?.length).toBe(1);
    expect(src).toContain("t.create.machineCard.selectFromList");
    expect(src).toContain("t.create.machineCard.useMyOwnName");
    /* The press opens the list by REMOUNTING the control with `defaultOpen`, which is what that
       prop's own note prescribes — it is read once at mount, so a caller wanting it open again
       remounts with a `key`. Without the key the counter would change and nothing would open. */
    expect(src).toContain("key={`type-${openTypeAt}`}");
    expect(src).toContain("defaultOpen={openTypeAt > 0}");
    /* The pulse is cleared on a TIMER, and deliberately not on the animation ending: that event
       never fires under `prefers-reduced-motion`, where the rule draws a standing outline and no
       animation at all, so the outline would stay on the card for the rest of the session.
       ⚠️ The card DOES use `onAnimationEnd` elsewhere — that is the shake's own reset — which is why
       this reads the pulse's own line rather than sweeping the file for the word. */
    expect(src).toContain("setTimeout(() => setPulseName(false), 1500)");
  });
});
