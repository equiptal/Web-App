import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { postableItems, requiredGaps } from "@/lib/contract";
import type { RfqDraft } from "@/lib/contract";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * A machine the catalogue does not carry is SHOWN, and never sent (AC-30/31/33).
 *
 * It used to be neither: the canvas drew `postableItems`, which drops a no-match row along with a
 * removed one, so the renter's own words vanished off the screen. Typed alone, the whole machine
 * panel disappeared and the page asked them to "add at least one machine" about the machine they
 * had just described — with no control anywhere to add one. `UnavailableCard`, written for exactly
 * this state, sat behind a verdict the panel could never receive.
 *
 * These pin both halves, because fixing one by breaking the other is the easy mistake: the row is on
 * screen with its sourcing offer, AND nothing about it reaches a supplier.
 */
const barge = () =>
  makeItem({
    id: "nm1",
    rawLabel: "floating crane barge",
    rawSize: null,
    ref: { categoryId: null, subcategoryId: null, measurementId: null },
    verdict: "no-match",
    resolved: false,
  });

describe("a no-match machine is drawn, with a way to ask us for it", () => {
  it("shows the row and its sourcing offer when it is the only machine", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [barge()], project: confirmedProject() }),
      text: "floating crane barge for two weeks",
    });

    // The panel is there at all — this is the regression, in one assertion.
    expect(screen.getByText("The machine")).toBeTruthy();
    // And it says what happened, in the renter's own words, with the way out beside it.
    expect(screen.getByText(/couldn't find this in our catalogue/i)).toBeTruthy();
    // Twice on purpose: once in «YOU WROTE», once on the card that says we cannot place it.
    expect(screen.getAllByText(/floating crane barge/i).length).toBeGreaterThan(0);
  });

  it("still refuses to post it — the gate counts postable rows, not drawn ones (AC-33)", () => {
    const draft = { ...makeAgentDraft({ items: [barge()], project: confirmedProject() }), touchedFields: [] } as unknown as RfqDraft;
    expect(postableItems(draft.items)).toHaveLength(0);
    // `gate.noItems` is what stops the send; the row being visible does not satisfy it.
    expect(requiredGaps(draft, true).some((g) => g.reason === "gate.noItems")).toBe(true);
  });

  it("does not gate the renter on a machine nobody can supply", () => {
    const draft = { ...makeAgentDraft({ items: [barge(), makeItem()], project: confirmedProject() }), touchedFields: [] } as unknown as RfqDraft;
    const gaps = requiredGaps(draft, true);
    // Every gap belongs to the machine that CAN be supplied; the barge asks nothing of anyone.
    expect(gaps.filter((g) => g.itemId === "nm1")).toEqual([]);
    expect(postableItems(draft.items).map((i) => i.id)).toEqual(["a0"]);
  });

  it("counts the drawn rows in «machine n of m», because that is what the renter can page through", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem(), barge()], project: confirmedProject() }),
    });
    expect(screen.getByText(/Equipment #1 of 2/i)).toBeTruthy();
  });
});
