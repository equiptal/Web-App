import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-25 — walking several machines.
 *
 * Two things happen when the renter moves to the next item and only one is reversible: the site and
 * schedule are request-wide and simply apply, while the other details are copied and can be changed.
 * A renter who has those the wrong way round either re-enters everything by hand or sets a second
 * site that never takes. Hence the modal, and hence the locked strip from item 2 onwards.
 */

const answered = (ids: string[]) => (store: ReturnType<typeof import("@/lib/store/rfq-store").useRfq>) => {
  for (const id of ids) {
    store.actions.touchField(`line_items[${id}].equipment_year`);
    store.actions.touchField(`line_items[${id}].safety_certificates`);
  }
  store.actions.setChargedDaysUnderstood(true);
};

const twoItems = () =>
  makeAgentDraft({
    items: [makeItem({ id: "a0" }), makeItem({ id: "a1", ref: { categoryId: "cat-earth", subcategoryId: "sub-wheel", measurementId: "cap-3" } })],
    project: confirmedProject(),
  });

describe("moving to the next machine (MREQ-AC-39)", () => {
  it("raises the carry-forward modal rather than jumping", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });

    expect(screen.getByText(/Next equipment/)).toBeTruthy();
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());

    expect(screen.getByText("Equipment #2")).toBeTruthy();
    expect(screen.getByText(/site and schedule already apply to your whole request/)).toBeTruthy();
    expect(screen.getByText(/start out matching this equipment/)).toBeTruthy();
    // Still on item 1 until the renter continues.
    expect(handle.store().state.itemIndex).toBe(0);
  });

  it("lets the renter go back and edit this item first", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    await handle.run(() => screen.getByRole("button", { name: "Edit this item first" }).click());

    expect(screen.queryByText("Equipment #2")).toBeNull();
    expect(handle.store().state.itemIndex).toBe(0);
  });

  it("continues to item 2 and opens its equipment panel", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    await handle.run(() => screen.getByRole("button", { name: "Continue" }).click());

    expect(handle.store().state.itemIndex).toBe(1);
    expect(handle.store().state.activeSection).toBe("equipment");
    expect(screen.getByText("Equipment #2 of 2")).toBeTruthy();
  });
});

describe("the site and schedule are locked from item 2 (MREQ-AC-40)", () => {
  it("shows them as settled, not as editable panels", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        answered(["a0", "a1"])(store);
        store.actions.goItem(1);
      },
    });

    expect(screen.getByText("locked for the whole request")).toBeTruthy();
    // The panel headers are gone — there is nothing to expand, so nothing can be changed here.
    expect(screen.queryByRole("button", { name: /Where it goes/ })).toBeNull();
    expect(handle.store().state.itemIndex).toBe(1);
  });

  it("returns to the previous item with its edits intact", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        answered(["a0", "a1"])(store);
        store.actions.patchItem("a0", { quantity: 4 });
        store.actions.goItem(1);
      },
    });

    await handle.run(() => screen.getByText(/Previous equipment/).closest("button")!.click());

    expect(handle.store().state.itemIndex).toBe(0);
    expect(handle.store().state.draft!.items[0].quantity).toBe(4);
  });

  it("offers no Previous link on the first item", async () => {
    await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });
    expect(screen.queryByText(/Previous equipment/)).toBeNull();
  });
});

describe("the last item reviews instead of advancing", () => {
  it("switches the primary action on the final machine", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        answered(["a0", "a1"])(store);
        store.actions.goItem(1);
      },
    });
    expect(screen.getByText(/Review & send/)).toBeTruthy();
    expect(screen.queryByText(/Next equipment/)).toBeNull();

    await handle.run(() => screen.getByText(/Review & send/).closest("button")!.click());
    expect(handle.store().state.readyToSend).toBe(true);
  });
});

describe("adding a machine by hand", () => {
  it("asks first, then appends and moves to it", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });

    await handle.run(() => screen.getByText(/Add another machine/).closest("button")!.click());

    // The same modal as moving between parsed items — the site and schedule apply to this one too.
    expect(screen.getByText("Equipment #2")).toBeTruthy();
    expect(screen.getByText(/site and schedule already apply/)).toBeTruthy();
    // But a hand-added machine starts blank, so it must NOT claim the details are inherited.
    expect(screen.queryByText(/start out matching this equipment/)).toBeNull();
    // Nothing added until the renter continues.
    expect(handle.store().state.draft!.items.length).toBe(1);

    await handle.run(() => screen.getByRole("button", { name: "Continue" }).click());

    expect(handle.store().state.draft!.items.length).toBe(2);
    expect(handle.store().state.itemIndex).toBe(1);
    /* ~~«N things need you».~~ Removed (owner, 2026-09-01): it counted gaps the cards below already
       mark one by one, in the place the renter has to act on them. The gap itself is what this pins
       now — the required dot the panel draws beside an unanswered field. */
    // A fresh item has no taxonomy yet, so it blocks — and the panel marks where.
    expect(document.querySelectorAll(".text-brand").length).toBeGreaterThan(0);
  });

  it("will not add while this machine is unanswered", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      // Year and certificate deliberately left open.
    });

    await handle.run(() => screen.getByText(/Add another machine/).closest("button")!.click());

    expect(screen.queryByText("Equipment #2")).toBeNull();
    expect(handle.store().state.draft!.items.length).toBe(1);
  });
});

/**
 * Reaching the NEXT machine and reaching REVIEW are different bars.
 *
 * They used to be the same one — the whole draft had to be complete — which deadlocked a multi-item
 * request outright: only one machine is editable at a time, so with five parsed items, finishing
 * item 1 still left item 2-5's gaps blocking the only button that could reach them.
 */
describe("the bar for the next machine is this machine", () => {
  it("moves on with the current machine done, even while later ones are not", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      // Only item 1 answered; item 2 deliberately left open.
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
      },
    });
    expect(handle.store().state.draft!.touchedFields).not.toContain("line_items[a1].equipment_year");

    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    expect(screen.getByText("Equipment #2")).toBeTruthy();

    await handle.run(() => screen.getByRole("button", { name: "Continue" }).click());
    expect(handle.store().state.itemIndex).toBe(1);
  });

  it("still refuses the next machine while THIS one is unanswered", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems() });
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    expect(screen.queryByText("Equipment #2")).toBeNull();
    expect(handle.store().state.itemIndex).toBe(0);
  });

  // Review is the point where the whole request has to hold together.
  it("holds the review screen until every machine is done", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
        store.actions.setChargedDaysUnderstood(true);
        store.actions.goItem(1);
      },
    });

    // On the last item, so the button reads Review & send — but item 2 is unanswered.
    await handle.run(() => screen.getByText(/Review & send/).closest("button")!.click());
    expect(handle.store().state.readyToSend).toBe(false);

    await handle.run(() => {
      handle.store().actions.touchField("line_items[a1].equipment_year");
      handle.store().actions.touchField("line_items[a1].safety_certificates");
    });
    await handle.run(() => screen.getByText(/Review & send/).closest("button")!.click());
    expect(handle.store().state.readyToSend).toBe(true);
  });
});
