import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * **A rail nobody opened shakes on the way out** (owner, 2026-09-09: *"if it is not open at all at
 * least once and user try to move to next step the closed pannel will shake too"*).
 *
 * The operator rail is the one panel on the canvas that can be walked past without a mark: it
 * collapses to a 72px strip, `operatorNeeded` defaults to «no», so nothing in it is required and no
 * gap names it. A renter can finish a machine having never seen what it holds — and an operator, his
 * food, his accommodation and his nationality are all priced by the supplier off that panel.
 *
 * The rule is the one the unseen where/when pass already follows (2026-09-02): **one pass.** The
 * strip shakes, the press does not go through, and the next press does — a refusal a renter cannot
 * clear is a dead end, and this one has nothing to clear because nothing is missing.
 *
 * ── The carve-out ───────────────────────────────────────────────────────────────────────────────
 * An item that ALREADY says «with an operator» opens the rail on mount, so it has been seen by
 * definition and never shakes. That is why the shared fixture (`makeItem`, `operatorNeeded: "yes"`)
 * does not have to know about any of this, and why every other canvas test is untouched.
 */

const answered = (ids: string[]) => (store: ReturnType<typeof import("@/lib/store/rfq-store").useRfq>) => {
  for (const id of ids) {
    store.actions.touchField(`line_items[${id}].equipment_year`);
    store.actions.touchField(`line_items[${id}].safety_certificates`);
  }
  store.actions.setChargedDaysUnderstood(true);
};

/** One machine, no operator asked for — so the rail mounts CLOSED and unseen. */
const noOperator = () =>
  makeAgentDraft({
    items: [makeItem({ id: "a0", operatorNeeded: "no" })],
    project: confirmedProject(),
  });

/** Two machines, neither asking for an operator: the «Next equipment» half of the same rule. */
const twoNoOperator = () =>
  makeAgentDraft({
    items: [
      makeItem({ id: "a0", operatorNeeded: "no" }),
      makeItem({ id: "a1", operatorNeeded: "no", ref: { categoryId: "cat-earth", subcategoryId: "sub-wheel", measurementId: "cap-3" } }),
    ],
    project: confirmedProject(),
  });

const strip = () => document.querySelector('[data-pin="18.4"]');
/** The rail once it is OPEN — a different element from the closed strip, and the one that shakes now. */
const panel = () => document.querySelector('[data-pin="18"]') ?? document.querySelector('[data-pin="18.1"]');
const press = (name: RegExp) => screen.getByText(name).closest("button")!;

describe("the operator rail, never opened", () => {
  it("does NOT hold «Review & send» any more, even unopened", async () => {
    /**
     * 🔴 **Withdrawn from this press** (owner, 2026-09-13: *"let the operator open and shake when
     * user try to click next without opening, not from the review and send but from the next of the
     * equipment"*). It stays on «Next equipment» — see the case below.
     *
     * 2026-09-09 put the pass on BOTH ways out of a machine. What that missed is where each press
     * LEAVES the renter: «Next equipment» keeps him on this canvas, so opening the rail puts the
     * panel in front of him; «Review & send» is the last press of the request, and refusing it to
     * open a panel nothing is missing from reads as a broken button.
     *
     * 🔴 **The cost, and it is real:** a ONE-equipment request has no «Next equipment», so nothing
     * forces the rail open on it at all. This case is that hole, pinned deliberately so the next
     * reader meets it as a decision rather than as a regression.
     */
    const handle = await renderCanvas(<Canvas />, { draft: noOperator(), prepare: answered(["a0"]) });

    expect(strip()).not.toBeNull();
    expect(strip()!.className).not.toContain("shake-error");

    // Straight through on the FIRST press: the last question before review is «anything else?».
    await handle.run(() => press(/Review & send/).click());
    expect(screen.getByText("Anything else on this request?")).toBeTruthy();
  });

  it("never shakes once the renter has opened it himself", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: noOperator(), prepare: answered(["a0"]) });

    // Opening the strip is the whole of what it asks for. It writes nothing — `operatorNeeded` is
    // still «no» — which is the 2026-08-19 ruling this test must not undo.
    await handle.run(() => (strip() as HTMLElement).click());
    expect(handle.store().state.draft!.items[0].operatorNeeded).toBe("no");

    await handle.run(() => press(/Review & send/).click());
    expect(screen.getByText("Anything else on this request?")).toBeTruthy();
  });

  it("holds «Next equipment», and OPENS the rail rather than only rattling it", async () => {
    /**
     * 🔴 **It opens now** (owner, 2026-09-13: *"can u let the operator open and shake"*). ~~The
     * closed 72px strip shook and stayed shut.~~ That asked the renter to work out that the shaking
     * thing was a button and press it — on the one panel the whole pass exists because he has never
     * pressed it. Opening it IS the look being demanded.
     */
    const handle = await renderCanvas(<Canvas />, { draft: twoNoOperator(), prepare: answered(["a0", "a1"]) });

    expect(strip()).not.toBeNull();

    await handle.run(() => press(/Next equipment/).click());
    // Refused: the travel is what «it went through» looks like since the carry-forward modal went
    // (2026-09-09), so the item index is the assertion.
    expect(handle.store().state.itemIndex).toBe(0);
    // ⚠️ The closed strip is GONE, because the refusal opened the panel it belongs to.
    expect(strip()).toBeNull();
    expect(panel()).not.toBeNull();

    await handle.run(() => press(/Next equipment/).click());
    expect(handle.store().state.itemIndex).toBe(1);
  });

  it("does not shake an item whose agent already asked for an operator", async () => {
    // The rail opens on mount for such an item, so it has been seen. The shared fixture is this
    // case, which is why the rest of the canvas suite never meets the pass at all.
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ id: "a0" })], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });

    expect(strip()).toBeNull(); // open, so there is no closed strip to shake
    await handle.run(() => press(/Review & send/).click());
    expect(screen.getByText("Anything else on this request?")).toBeTruthy();
  });
});
