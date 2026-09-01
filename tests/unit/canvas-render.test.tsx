import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { requiredGaps } from "@/lib/contract";
import { Canvas } from "@/components/create/Canvas";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-01/10/13 — the canvas mounts, shows the renter their own words, and marks what is left.
 *
 * The four-step wizard shipped with no component test at all, which is how a screen reaches UAT
 * unlooked-at. These start at the cheapest useful question: does it render, and does it say the
 * right number.
 */
describe("the canvas renders (MREQ-AC-01)", () => {
  it("shows the renter's sentence and no step chrome", async () => {
    await renderCanvas(<Canvas />, { text: "1 x 30 ton digger with operator" });

    expect(screen.getByText("YOU WROTE")).toBeTruthy();
    expect(screen.getByText(/30 ton digger with operator/)).toBeTruthy();
    expect(screen.getByText("The machine")).toBeTruthy();
    expect(screen.getByText("Where it goes")).toBeTruthy();
    expect(screen.getByText("When it runs")).toBeTruthy();

    // No step numbers anywhere — the wizard's chip row is gone, not restyled.
    expect(screen.queryByText("Preferences")).toBeNull();
    for (const label of ["Project", "Equipment", "Preview"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("marks only the gaps that block, and marks none when there are none (MREQ-AC-12/13)", async () => {
    // A fully answered draft: site confirmed, basis chosen, year + cert touched, charged days accepted.
    const item = makeItem();
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [item], project: confirmedProject() }),
      prepare: (store) => {
        store.actions.touchField(`line_items[${item.id}].equipment_year`);
        store.actions.touchField(`line_items[${item.id}].safety_certificates`);
        store.actions.setChargedDaysUnderstood(true);
      },
    });

    /* ~~«N things need you».~~ The counter is gone (owner, 2026-09-01) — it counted gaps the cards
       below already mark one by one, in the place the renter has to act on them. The RULE it stood
       for is what matters and is what this pins now, read off the source the counter itself read:
       a fully answered draft has no gaps, and un-answering one control produces exactly one. */
    const gaps = () => {
      const st = handle.store().state;
      return requiredGaps(st.draft!, st.chargedDaysUnderstood).length;
    };

    expect(gaps()).toBe(0);

    await handle.run(() => {
      handle.store().actions.setChargedDaysUnderstood(false);
    });
    expect(gaps()).toBe(1);
  });

  it("names the item when there is more than one (MREQ-AC-38)", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({
        items: [makeItem({ id: "a0" }), makeItem({ id: "a1" })],
        project: confirmedProject(),
      }),
    });
    expect(screen.getByText("Equipment #1 of 2")).toBeTruthy();
    // No single/multi mode toggle — the agent's item count decides, not the renter.
    expect(screen.queryByText(/Single item|Multi item/)).toBeNull();
  });
});
