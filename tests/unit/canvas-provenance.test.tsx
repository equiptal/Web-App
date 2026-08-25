import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { MachineCard } from "@/components/create/MachineCard";
import { DRAFT_STORAGE_KEY } from "@/lib/store/rfq-store";
import { itemGaps, transportGaps } from "@/lib/contract";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/**
 * MREQ-TC-33/34/37/38 — the marks, the Arabic screen, resilience, and what survives a reload.
 *
 * The provenance badges are the honest half of a form that pre-answers most of itself. A renter shown
 * a finished page cannot tell which answers were theirs, and they own the result either way — so a
 * badge that silently stops rendering is a real regression with no other symptom.
 */

const card = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(
    (store) => {
      const draft = store.state.draft!;
      const item = draft.items[0];
      return <MachineCard item={item} gaps={[...itemGaps(item, draft), ...transportGaps([item], draft.project)]} shaking={false} />;
    },
    opts,
  );

describe("provenance badges (MREQ-AC-57/58/59)", () => {
  it("marks what we defaulted, and says so on delivery and return", async () => {
    await card();
    // `defaultProjectDetails` seeds both transport legs to "me" — visible, and labelled as ours.
    expect(screen.getByText("We collect")).toBeTruthy();
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
  });

  it("marks what the agent chose", async () => {
    // The agent supplied a year, so it still equals the snapshot and reads as the agent's.
    await card({ draft: makeAgentDraft({ items: [makeItem({ equipmentYear: "2018+" })] }) });
    expect(screen.getAllByText("AI selected").length).toBeGreaterThan(0);
  });

  it("clears the mark once the renter answers, and records the field", async () => {
    const handle = await card({ draft: makeAgentDraft({ items: [makeItem({ equipmentYear: "2018+" })] }) });
    const before = screen.getAllByText("AI selected").length;

    await handle.run(() => {
      handle.store().actions.touchField("line_items[a0].equipment_year");
    });

    expect(screen.getAllByText("AI selected").length).toBe(before - 1);
    expect(handle.store().state.draft!.touchedFields).toContain("line_items[a0].equipment_year");
  });

  it("never blocks on its own (MREQ-AC-61)", async () => {
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ equipmentYear: "2018+" })], project: confirmedProject() }),
      prepare: (store) => {
        store.actions.touchField("line_items[a0].equipment_year");
        store.actions.touchField("line_items[a0].safety_certificates");
        store.actions.setChargedDaysUnderstood(true);
      },
    });
    // Delivery and return are still ours (badged "Default") — and nothing is blocking.
    expect(screen.getAllByText("Default").length).toBeGreaterThan(0);
    expect(screen.queryByText(/things need you|thing needs you/)).toBeNull();
  });
});

describe("what survives a reload (MREQ-AC-56/60)", () => {
  it("persists touchedFields with the draft", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.touchField("line_items[a0].equipment_year"),
    });

    const saved = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(saved.draft.touchedFields).toContain("line_items[a0].equipment_year");
    expect(handle.store().state.draft!.touchedFields).toContain("line_items[a0].equipment_year");
  });

  it("does NOT persist the charged-day acknowledgement", async () => {
    // It accepts a figure. On a fresh visit the renter should meet that figure again rather than
    // find it pre-accepted on their behalf.
    await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.setChargedDaysUnderstood(true),
    });
    const saved = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY)!);
    expect(saved.chargedDaysUnderstood).toBeUndefined();
  });
});

describe("Arabic (MREQ-AC-51)", () => {
  it("resolves every canvas string and renders figures in Arabic-Indic digits", async () => {
    await renderCanvas(<Canvas />, {
      locale: "ar",
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.openSection("when"),
    });

    expect(screen.getByText("ما كتبته")).toBeTruthy();
    expect(screen.getByText("الآلة")).toBeTruthy();
    expect(screen.getByText("مدة التشغيل")).toBeTruthy();
    // 155 charged days, in the digits the rest of the app uses.
    expect(screen.getByText("١٥٥")).toBeTruthy();
    expect(screen.queryByText("155")).toBeNull();
  });

  it("leaves no English canvas label behind", async () => {
    const { view } = await renderCanvas(<Canvas />, {
      locale: "ar",
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });
    for (const english of ["YOU WROTE", "The machine", "Where it goes", "When it runs", "We collect", "Default"]) {
      expect(view.container.textContent).not.toContain(english);
    }
  });
});

describe("when the catalogue is unreachable (MREQ-AC-52)", () => {
  it("renders an empty control rather than throwing, and the rest stays usable", async () => {
    // The attachments endpoint returns [] on failure (the hook swallows), and an empty taxonomy
    // leaves the pickers with nothing to offer — neither may take the page down.
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ ref: { categoryId: null, subcategoryId: null, measurementId: null } })], project: confirmedProject() }),
    });

    expect(screen.getByText("The machine")).toBeTruthy();
    expect(screen.getByText("Where it goes")).toBeTruthy();
    // The item is incomplete, so the counter says so rather than the screen breaking.
    expect(screen.getByText(/things need you/)).toBeTruthy();
    expect(handle.store().state.draft).toBeTruthy();
  });
});
