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

describe("moving to the next equipment (MREQ-AC-39)", () => {
  /* ~~It raised the carry-forward modal: «Equipment #2», the site and schedule are locked, the other
     details were copied, Continue / Edit this item first.~~ **Removed** (owner, 2026-09-09: *"remove
     this modal no need. make the add and the next … smoother without it"*).

     What the modal said is on the screen instead — the locked strip states the site and the
     schedule, and the copied details ARE the card the renter lands on — so the press moves. The rule
     it enforced is untouched and is what these cases still pin: the move refuses while THIS
     equipment is unanswered (below, and in `canvas-gating`), and it lands with the equipment panel
     open rather than wherever the renter last was. */
  it("moves straight to equipment 2, with its panel open", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });

    expect(screen.getByText(/Next equipment/)).toBeTruthy();
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());

    expect(handle.store().state.itemIndex).toBe(1);
    expect(handle.store().state.activeSection).toBe("equipment");
    expect(screen.getByText("Equipment #2 of 2")).toBeTruthy();
    // The modal, gone: neither its title nor either of its two sentences.
    expect(screen.queryByText("Equipment #2")).toBeNull();
    expect(screen.queryByText(/site and schedule already apply/)).toBeNull();
  });

  it("goes back through the tab strip, not through a dialog", async () => {
    // The tabs are the new way BACK to an equipment already passed (owner, 2026-09-09).
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    expect(handle.store().state.itemIndex).toBe(1);

    const tabs = document.querySelectorAll('[data-pin="17.5"]');
    expect(tabs.length).toBe(2);
    await handle.run(() => (tabs[0] as HTMLElement).click());

    expect(handle.store().state.itemIndex).toBe(0);
    expect(handle.store().state.activeSection).toBe("equipment");
  });
});

describe("the site and schedule lock once they are answered (MREQ-AC-40, widened 2026-09-09)", () => {
  /* ~~Locked from equipment 2 onwards.~~ Widened on the owner's word: *"20.1 and 19.1 will be locked
     once they are selected in any of an equipment"*. The old rule was about which equipment the
     renter happened to be standing on, and these two panels belong to none of them — one address and
     one schedule for the whole request — so they lock on the ANSWER instead.

     With a way back, also his ruling: «Change for the request» reopens them, because a hard lock
     would trap a typed date on a one-equipment request. */
  it("shows them as settled rather than as editable panels", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        answered(["a0", "a1"])(store);
        store.actions.goItem(1);
      },
    });

    expect(screen.getByText("locked for the whole request")).toBeTruthy();
    // The panel HEADERS are gone: there is nothing to expand by accident while answering equipment.
    expect(screen.queryByRole("button", { name: /^Where it goes$/ })).toBeNull();
    expect(handle.store().state.itemIndex).toBe(1);
  });

  it("locks on the FIRST equipment too, the moment both are answered", async () => {
    // The whole of what changed: a one-equipment request used to keep both panels open for editing.
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });
    expect(screen.getByText("locked for the whole request")).toBeTruthy();
  });

  it("«Change for the request» hands the panel back, so a wrong date is not a dead end", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });

    await handle.run(() => screen.getByText(/Change for the request/).closest("button")!.click());

    expect(screen.queryByText("locked for the whole request")).toBeNull();
    expect(handle.store().state.activeSection).toBe("where");
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
    // The press asks before it commits — see the note in `canvas-gating`.
    expect(handle.store().state.readyToSend).toBe(false);
    await handle.run(() => screen.getAllByText(/Review & send/).at(-1)!.closest("button")!.click());
    expect(handle.store().state.readyToSend).toBe(true);
  });
});

/**
 * Adding a second machine, from the one place that offers it.
 *
 * ~~A standing «+ Add another equipment» beside the CTA on every screen.~~ Removed (owner,
 * 2026-09-01): it made two calls to action out of one moment and asked its question on items the
 * renter had not finished. It is now the secondary answer to the modal that a finished request
 * raises, which is the one point where it IS a question.
 */
describe("removing an equipment from its tab (owner, 2026-09-09)", () => {
  /* *"In the equipment tabs must have x button to remove it, also the x is always visible."*
     It asks first: the answers on that card go with it and `REMOVE_ITEM` is one-way. */
  const remove = () => document.querySelectorAll('[data-pin="17.7"]');

  it("asks, then removes, and lands on the equipment that took its place", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });

    expect(remove().length).toBe(2);
    await handle.run(() => (remove()[0] as HTMLElement).click());

    // Nothing gone yet — the question is the whole of what the press did.
    expect(handle.store().state.draft!.items.filter((i) => !i.removed).length).toBe(2);
    expect(screen.getByText("Remove this equipment from the request?")).toBeTruthy();

    await handle.run(() => screen.getByRole("button", { name: "Remove" }).click());

    const live = handle.store().state.draft!.items.filter((i) => !i.removed);
    expect(live.map((i) => i.id)).toEqual(["a1"]);
    // The open card was the one removed, so the index lands on what is left rather than off the end.
    expect(handle.store().state.itemIndex).toBe(0);
    expect(handle.store().state.activeSection).toBe("equipment");
  });

  it("«Keep it» changes nothing", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems(), prepare: answered(["a0", "a1"]) });
    await handle.run(() => (remove()[0] as HTMLElement).click());
    await handle.run(() => screen.getByRole("button", { name: "Keep it" }).click());

    expect(handle.store().state.draft!.items.filter((i) => !i.removed).length).toBe(2);
    expect(handle.store().state.itemIndex).toBe(0);
  });

  it("offers no ✕ on the only equipment — a request with none cannot be sent", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });
    expect(document.querySelector('[data-pin="17.7"]')).toBeNull();
    // …and the tab itself is still there: one equipment is still the request's equipment.
    expect(document.querySelectorAll('[data-pin="17.5"]').length).toBe(1);
  });
});

describe("adding equipment by hand", () => {
  it("appends and lands on it — from the finished-request prompt", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });

    await handle.run(() => screen.getByText(/Review & send/).closest("button")!.click());
    await handle.run(() => screen.getByText(/Add another equipment/).closest("button")!.click());

    /* ~~It staged the add behind the carry-forward modal and only appended on «Continue».~~ The
       modal is gone (owner, 2026-09-09), so the press appends, travels and opens the panel — the
       three acts the dialog used to sit between. */
    expect(handle.store().state.draft!.items.length).toBe(2);
    expect(handle.store().state.itemIndex).toBe(1);
    expect(handle.store().state.activeSection).toBe("equipment");
    /* ~~«N things need you».~~ Removed (owner, 2026-09-01): it counted gaps the cards below already
       mark one by one, in the place the renter has to act on them. The gap itself is what this pins
       now — the required dot the panel draws beside an unanswered field. */
    // A fresh item has no taxonomy yet, so it blocks — and the panel marks where. The DOT's glyph,
    // not a colour class: the missing-label orange merged with the chosen-for-you one on 2026-09-12.
    expect([...document.querySelectorAll("span")].filter((s) => s.textContent === "●").length).toBeGreaterThan(0);
  });

  it("adds from the tab strip's + as well, which is the same act", async () => {
    // The owner's second door (2026-09-09): *"with + at first card and it adds an equipment"*. One
    // implementation — `addMachine` — so the two cannot diverge on what adding means.
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: answered(["a0"]),
    });

    const add = document.querySelector('[data-pin="17.6"]') as HTMLElement;
    expect(add).not.toBeNull();
    await handle.run(() => add.click());

    expect(handle.store().state.draft!.items.length).toBe(2);
    expect(handle.store().state.itemIndex).toBe(1);
    expect(document.querySelectorAll('[data-pin="17.5"]').length).toBe(2);
  });

  it("will not add while this equipment is unanswered — from either door", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      // Year and certificate deliberately left open.
    });

    /* An unanswered equipment never reaches the prompt at all, which is the stronger form of the
       same rule: the old standing button offered to add a second one beside a first that was not
       finished. Now the press refuses on the gaps and the question is never put. */
    await handle.run(() => screen.getByText(/Review & send/).closest("button")!.click());
    expect(screen.queryByText(/Anything else on this request/)).toBeNull();
    expect(handle.store().state.draft!.items.length).toBe(1);

    // And the + is not even offered: a control that is going to refuse is better absent than lying.
    expect(document.querySelector('[data-pin="17.6"]')).toBeNull();
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
      // Only item 1 answered; item 2 deliberately left open. The schedule IS acknowledged, because
      // that is request-wide and gates every move (owner, 2026-09-06) — the point of this test is the
      // other machine's gaps, which must not block.
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
        store.actions.setChargedDaysUnderstood(true);
      },
    });
    expect(handle.store().state.draft!.touchedFields).not.toContain("line_items[a1].equipment_year");

    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    expect(handle.store().state.itemIndex).toBe(1);
  });

  /**
   * ── The site, the schedule and the charged days gate «Next equipment» as well ─────────────────
   *
   * Owner, 2026-09-06: *"In multi item I can click next equipment without filling location or date
   * or acknowledge — the rules of shaking when I click review and send must be the same behaviour
   * when I click next equipment."*
   *
   * They are one address, one schedule and one acknowledgement for the whole request, so they are
   * owed before the SECOND machine rather than after the last one — and the second machine's own
   * transport questions are decided by the site the renter has not named yet.
   */
  it("refuses the next machine while the request-wide schedule is unanswered", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      // This machine is finished; the charged days are NOT acknowledged.
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
      },
    });

    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());

    // No carry-forward prompt, no move: the same refusal «Review & send» gives, on the same panel.
    expect(screen.queryByText(/Anything else on this request/)).toBeNull();
    expect(handle.store().state.itemIndex).toBe(0);
    expect(handle.store().state.activeSection).toBe("when");
  });

  it("lets the same press through once the schedule is answered", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: twoItems(),
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
        store.actions.setChargedDaysUnderstood(true);
      },
    });

    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
    // «It went through» is the travel itself now, not a dialog appearing (owner, 2026-09-09).
    expect(handle.store().state.itemIndex).toBe(1);
  });

  it("still refuses the next equipment while THIS one is unanswered", async () => {
    const handle = await renderCanvas(<Canvas />, { draft: twoItems() });
    await handle.run(() => screen.getByText(/Next equipment/).closest("button")!.click());
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
    await handle.run(() => screen.getAllByText(/Review & send/).at(-1)!.closest("button")!.click());
    expect(handle.store().state.readyToSend).toBe(true);
  });
});
