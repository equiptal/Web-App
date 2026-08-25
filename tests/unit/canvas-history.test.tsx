import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { CreateSurface } from "@/components/CreateSurface";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-05/06 — the browser Back button.
 *
 * The wizard mapped one history entry per step, so Back walked 4 → 3 → 2 → 1. The canvas has no steps
 * to walk, and its panels are accordions: pushing an entry when one opens would make Back close a
 * panel instead of leaving the page — and under the gating, Back could land somewhere Forward cannot
 * return to. So the chain is exactly intake → canvas → ready-to-send.
 */

const answered = (store: ReturnType<typeof import("@/lib/store/rfq-store").useRfq>) => {
  store.actions.touchField("line_items[a0].equipment_year");
  store.actions.touchField("line_items[a0].safety_certificates");
  store.actions.setChargedDaysUnderstood(true);
};

const surface = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(<CreateSurface />, {
    draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    ...opts,
  });

/** Fire a popstate at a given rung of the chain, the way the browser would. */
async function pop(handle: Awaited<ReturnType<typeof surface>>, rfqOrd: number) {
  await handle.run(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: { rfqOrd } }));
  });
}

describe("the history chain has three stops (MREQ-AC-06/07)", () => {
  it("opening and closing panels pushes nothing", async () => {
    const handle = await surface({ prepare: answered });
    const before = window.history.length;

    await handle.run(() => handle.store().actions.openSection("where"));
    await handle.run(() => handle.store().actions.openSection("when"));
    await handle.run(() => handle.store().actions.openSection(null));

    expect(window.history.length).toBe(before);
  });

  it("Back from the canvas returns to intake with the draft intact", async () => {
    const handle = await surface({ prepare: answered });
    expect(handle.store().state.phase).toBe("wizard");

    await pop(handle, 0);

    expect(handle.store().state.phase).toBe("intake");
    expect(handle.store().state.draft).toBeTruthy(); // the draft is not discarded
  });

  it("Back from ready-to-send returns to the canvas, not to intake", async () => {
    const handle = await surface({ prepare: answered });
    await handle.run(() => handle.store().actions.setReadyToSend(true));
    expect(screen.getByText("Ready to send")).toBeTruthy();

    await pop(handle, 1);

    expect(handle.store().state.phase).toBe("wizard");
    expect(handle.store().state.readyToSend).toBe(false);
    expect(screen.getByText("The machine")).toBeTruthy();
  });

  it("Forward from intake lands back on the canvas", async () => {
    const handle = await surface({ prepare: answered });
    await pop(handle, 0);
    expect(handle.store().state.phase).toBe("intake");

    await pop(handle, 1);
    expect(handle.store().state.phase).toBe("wizard");
    expect(handle.store().state.readyToSend).toBe(false);
  });
});

describe("the canvas is what the wizard phase now renders (MREQ-AC-01)", () => {
  it("shows the canvas, and the review screen once ready", async () => {
    const handle = await surface({ prepare: answered });
    expect(screen.getByText("The machine")).toBeTruthy();
    expect(screen.queryByText("Ready to send")).toBeNull();

    await handle.run(() => handle.store().actions.setReadyToSend(true));
    expect(screen.getByText("Ready to send")).toBeTruthy();
    expect(screen.queryByText("The machine")).toBeNull();
  });
});

describe("start over (MREQ-AC-08)", () => {
  it("asks first, and clears the draft on confirm", async () => {
    const handle = await surface({ prepare: answered });

    await handle.run(() => screen.getByText("Start over").closest("button")!.click());
    // Cancel leaves everything alone.
    await handle.run(() => screen.getByRole("button", { name: "Cancel" }).click());
    expect(handle.store().state.draft).toBeTruthy();

    await handle.run(() => screen.getByText("Start over").closest("button")!.click());
    await handle.run(() => screen.getAllByRole("button", { name: "Start over" }).at(-1)!.click());

    expect(handle.store().state.draft).toBeNull();
    expect(handle.store().state.phase).toBe("intake");
  });
});
