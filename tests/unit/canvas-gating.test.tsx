import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";
import type { EquipmentItem } from "@/lib/contract/draft";
import { EMPTY_REF } from "@/lib/contract/taxonomy";

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
  // It used to re-open EQUIPMENT, which sent the renter backwards: tick «I understand», land on the
  // machine, press «Review & send», and — with another machine unanswered — be sent to the machine
  // panel again. A finished panel now collapses, and a request with nothing left collapses to none.
  it("collapses the canvas when the request is answered", async () => {
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

    expect(handle.store().state.activeSection).toBeNull();
  });

  it("opens the panel that owns the next gap when one is left", async () => {
    // Nothing answers the machine here, so the schedule hands the renter to it rather than to nothing.
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.openSection("when"),
    });

    await handle.run(() => {
      handle.store().actions.setChargedDaysUnderstood(true);
    });

    expect(handle.store().state.activeSection).toBe("equipment");
  });
});

describe("the primary button refuses with gaps (MREQ-AC-15)", () => {
  /* ~~Owner, 2026-08-26: it is DISABLED while anything is owed rather than live-then-shaking. A
     button that looks ready and then refuses teaches the renter that the page is broken.~~
     Reversed by the owner on 2026-09-01, for the reason the first ruling missed: a disabled button
     cannot say WHY. *"He doesn't know what is blocking him"* — so it presses, and the press answers:
     the red list of what is missing shakes, and the panel that owes it opens.

     What AC-15 actually protects is unchanged and is what this still pins: a request with gaps
     cannot reach the review screen. */
  it("refuses the review screen, and marks the REQUEST's own required field", async () => {
    /* Nothing names the machine, so the blocking gap is the taxonomy — which the request genuinely
       requires, and which therefore carries the word. */
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ ref: EMPTY_REF })], project: confirmedProject() }),
    });

    /* ~~A red list of everything missing, drawn above the button.~~ Removed on 2026-09-02: it named
       the gaps in a second place, away from the fields that own them. The refusal now walks the
       renter to the field itself and marks it «* Required» there. */
    expect(screen.queryByText("Before this can be sent")).toBeNull();

    const button = screen.getByText(/Review & send/).closest("button")! as HTMLButtonElement;
    await handle.run(() => button.click());

    expect(handle.store().state.readyToSend).toBe(false);
    // The mark is on the field, and it is the same word wherever a field is owed.
    expect(screen.getAllByText("* Required").length).toBeGreaterThan(0);
  });

  /**
   * The two web-only gates say NOTHING in words (owner, 2026-09-03).
   *
   * *"This isn't originally required by the request (year and certificate), so only shake it if not
   * set, don't say required in red."* They still block — MREQ-AC-54 is unchanged, and each has an
   * explicit «Any year» / «No certificate» answer — but the canvas may not tell a renter the REQUEST
   * demands something the request never asked for.
   */
  it("shakes the year and the certificate without ever calling them required", async () => {
    const handle = await renderCanvas(<Canvas />, {
      // A complete machine on a complete site: the year and the certificate are the only gaps.
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });

    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(handle.store().state.readyToSend).toBe(false);
    expect(shaken(handle.view.container)).toBeGreaterThan(0);
    // Neither the word nor the standing star: the request did not ask for either field.
    expect(screen.queryByText("* Required")).toBeNull();
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

    /* It ASKS first (owner, 2026-09-01). A finished request is the one moment "is there another
       machine?" is a real question, so the press that used to go straight through now raises it —
       and going on is the modal's own primary. Nothing is committed by the press itself. */
    expect(handle.store().state.readyToSend).toBe(false);
    expect(screen.getByText(/Anything else on this job/)).toBeTruthy();

    await handle.run(() => {
      screen.getAllByText(/Review & send/).at(-1)!.closest("button")!.click();
    });
    expect(handle.store().state.readyToSend).toBe(true);
  });
});

/**
 * A refusal opens the panel that OWES the answer, and no other (owner, 2026-09-02).
 *
 * ⚠️ It opened the equipment panel for a SCHEDULE gap. `shakeNow` took «fields» or «where», so a
 * schedule refusal was passed as «fields» — and «fields» force-opens the machine and scrolls to it.
 * The renter pressed *Review & send* with the charged-day acknowledgement unticked and was shown a
 * finished machine, the panel that owed the answer having just been closed again: *"random panels
 * open and there is nothing I can do with them"*.
 */
describe("a refusal opens the panel that owes the answer", () => {
  it("opens the SCHEDULE for a schedule gap, and marks the field", async () => {
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      // The machine is complete; the charged-day acknowledgement is the only thing left.
      prepare: answerYearAndCert(item.id),
    });

    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(handle.store().state.activeSection).toBe("when");
    expect(screen.getAllByText("* Required").length).toBeGreaterThan(0);
  });

  it("marks FUEL, which is one of the app's own gates and had no mark at all", async () => {
    /* `EquipmentItem.fuelType` is typed non-null, and `itemAppGaps` checks it anyway: the draft
       arrives from the agent, so the gate does not trust the type. The cast reproduces exactly what
       that gate is guarding against. */
    const item = makeItem({ fuelType: null as unknown as EquipmentItem["fuelType"] });
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      prepare: answerYearAndCert(item.id),
    });

    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(handle.store().state.activeSection).toBe("equipment");
    // The chip has no visible label of its own, so the mark brings the field's NAME with it.
    expect(screen.getAllByText("FUEL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("* Required").length).toBeGreaterThan(0);
  });
});

/**
 * The standing star, before anybody has been refused (owner, 2026-09-03).
 *
 * *"At first all these fields will show a red star so the user knows he must fill them, and if he
 * tries to move on and one is blocking him then it will shake and show the word Required, not only
 * a star."*
 */
describe("what a required field says before the first refusal", () => {
  it("stars the request's own required fields, and says the word to nobody", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });

    // TYPE, SIZE, DELIVERY TO SITE and RETURN FROM SITE, each starred on its own label.
    expect(screen.getAllByText("*").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("* Required")).toBeNull();
  });
});

describe("a panel closes only once it is answered (owner, 2026-08-26)", () => {
  it("lets an ANSWERED panel close, whatever is owed elsewhere", async () => {
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

  it("refuses to close one that still owes an answer, and shakes instead", async () => {
    // The machine is unanswered, so its «collapse» cannot put it away: that is how a renter used to
    // end up with three shut panels, an empty machine among them, and a button that would not fire.
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });

    await handle.run(() => {
      screen.getByText(/collapse/i).closest("button")!.click();
    });

    expect(handle.store().state.activeSection).toBe("equipment");
    expect(shaken(handle.view.container)).toBeGreaterThan(0);
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
