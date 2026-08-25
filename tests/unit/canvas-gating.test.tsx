import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-02/03/04/05/15 — the locks, and the shake that is the whole of their explanation.
 *
 * The canvas refuses a move without saying why: the panel simply does not open, and the blocking
 * blocks shake. That makes the shake load-bearing rather than decorative, and it is invisible to a
 * type-check — a refactor that stopped applying the class would look like nothing happened until a
 * renter clicked a header that silently did nothing.
 */

/** Answer the two web-only gates for an item, leaving the app gates as they are. */
const answerYearAndCert = (id: string) => (store: ReturnType<typeof import("@/lib/store/rfq-store").useRfq>) => {
  store.actions.touchField(`line_items[${id}].equipment_year`);
  store.actions.touchField(`line_items[${id}].safety_certificates`);
};

const shaken = (container: HTMLElement) => container.querySelectorAll(".shake-error").length;

describe("the equipment panel gates the other two (MREQ-AC-02)", () => {
  it("refuses to open Where while a required field is unanswered, and shakes", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      // Year + certificate deliberately left unanswered.
    });

    expect(shaken(handle.view.container)).toBe(0);

    await handle.run(() => {
      screen.getByText("Where it goes").closest("button")!.click();
    });

    // The panel did not open — its confirm button is the tell, and it is absent.
    expect(screen.queryByText("This is the right spot")).toBeNull();
    expect(handle.store().state.activeSection).toBe("equipment");
    expect(shaken(handle.view.container)).toBeGreaterThan(0);
  });

  it("opens Where once the equipment panel is complete", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject({ location: { label: "Site", lat: 24.7, lng: 46.7, confirmed: false } }) }),
      prepare: answerYearAndCert(item.id),
    });

    await handle.run(() => {
      screen.getByText("Where it goes").closest("button")!.click();
    });

    expect(handle.store().state.activeSection).toBe("where");
    expect(shaken(handle.view.container)).toBe(0);
  });
});

describe("the location gates the schedule (MREQ-AC-03/04)", () => {
  it("refuses to open When while the site is unconfirmed, and points at the confirm button", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({
        items: [item],
        project: confirmedProject({ location: { label: "Site", lat: 24.7, lng: 46.7, confirmed: false } }),
      }),
      prepare: answerYearAndCert(item.id),
    });

    await handle.run(() => {
      screen.getByText("When it runs").closest("button")!.click();
    });

    // It opened WHERE instead — the renter is sent to the thing that unblocks them.
    expect(handle.store().state.activeSection).toBe("where");
    expect(shaken(handle.view.container)).toBeGreaterThan(0);
  });

  it("confirming the location opens the schedule by itself", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({
        items: [item],
        project: confirmedProject({ location: { label: "Site", lat: 24.7, lng: 46.7, confirmed: false } }),
      }),
      prepare: (store) => {
        answerYearAndCert(item.id)(store);
        store.actions.openSection("where");
      },
    });

    await handle.run(() => {
      handle.store().actions.confirmLocation();
    });

    expect(handle.store().state.draft!.project.location.confirmed).toBe(true);
    expect(handle.store().state.activeSection).toBe("when");
  });
});

describe("accepting the charged days closes the schedule (MREQ-AC-05)", () => {
  it("returns to the equipment panel", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      prepare: (store) => {
        answerYearAndCert(item.id)(store);
        store.actions.openSection("when");
      },
    });

    await handle.run(() => {
      handle.store().actions.setChargedDaysUnderstood(true);
    });

    expect(handle.store().state.activeSection).toBe("equipment");
  });
});

describe("the primary button refuses with gaps (MREQ-AC-15)", () => {
  it("shakes instead of advancing, and does not reach the review screen", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });

    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(handle.store().state.readyToSend).toBe(false);
    expect(shaken(handle.view.container)).toBeGreaterThan(0);
  });

  it("advances to the review screen when nothing is left", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      prepare: (store) => {
        answerYearAndCert(item.id)(store);
        store.actions.setChargedDaysUnderstood(true);
      },
    });

    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(handle.store().state.readyToSend).toBe(true);
  });
});

describe("collapsing is always free", () => {
  // Closing a panel is not advancing past it, so it must never be refused — otherwise a renter with
  // an incomplete item cannot collapse the panel they are already looking at.
  it("lets an open panel close even with gaps elsewhere", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      prepare: (store) => {
        answerYearAndCert(item.id)(store);
        store.actions.openSection("where");
      },
    });

    await handle.run(() => {
      screen.getByText("Where it goes").closest("button")!.click();
    });

    expect(handle.store().state.activeSection).toBeNull();
  });
});

/**
 * MREQ — one panel open at a time.
 *
 * `activeSection` is a single value, so Where and When could never both be open; the equipment block
 * used to render unconditionally alongside them, which left two panels expanded and the page twice
 * as long as it needed to be.
 */
describe("the canvas is an accordion", () => {
  const complete = (store: ReturnType<typeof import("@/lib/store/rfq-store").useRfq>) => {
    store.actions.touchField("line_items[a0].equipment_year");
    store.actions.touchField("line_items[a0].safety_certificates");
    store.actions.setChargedDaysUnderstood(true);
  };

  it("collapses equipment to a strip when another panel opens", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: complete,
    });
    // Equipment starts open: its controls are on screen.
    expect(screen.getByText("CATEGORY")).toBeTruthy();

    await handle.run(() => screen.getByText("Where it goes").closest("button")!.click());

    expect(handle.store().state.activeSection).toBe("where");
    expect(screen.queryByText("CATEGORY")).toBeNull();
    // And it says what it holds, so the renter need not open it to check.
    expect(screen.getByText("The machine & operator")).toBeTruthy();
    expect(screen.getByText(/Crawler excavator/)).toBeTruthy();
  });

  it("reopens from the strip, which closes whichever was open", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: complete,
    });
    // Opened in its own step: batching it with setChargedDaysUnderstood lets the auto-return effect
    // (accepting the figure sends you back to equipment) fire and undo it.
    await handle.run(() => handle.store().actions.openSection("when"));
    expect(screen.queryByText("CATEGORY")).toBeNull();

    await handle.run(() => screen.getByText("The machine & operator").closest("button")!.click());

    expect(handle.store().state.activeSection).toBe("equipment");
    expect(screen.getByText("CATEGORY")).toBeTruthy();
  });

  // A refusal shakes the blocking fields, which cannot happen while they are unmounted.
  it("opens equipment before shaking it, even when collapsed", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.openSection("when"),
    });
    expect(screen.queryByText("CATEGORY")).toBeNull();

    await handle.run(() => screen.getByText("Where it goes").closest("button")!.click());

    expect(handle.store().state.activeSection).toBe("equipment");
    expect(screen.getByText("CATEGORY")).toBeTruthy();
  });
});
