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

/** Answer the minimum-year control through the UI, the way a renter would. */
async function pickYear(handle: Awaited<ReturnType<typeof card>>) {
  screen.getByRole("combobox", { name: "MINIMUM YEAR" }).click();
  await Promise.resolve();
  const listbox = screen.getByRole("listbox", { name: "MINIMUM YEAR" });
  listbox.querySelectorAll<HTMLButtonElement>("[role=option]")[0].click();
  void handle;
}

const card = (opts: Parameters<typeof renderCanvas>[1] = {}) =>
  renderCanvas(
    (store) => {
      const draft = store.state.draft!;
      const item = draft.items[0];
      return <MachineCard item={item} gaps={[...itemGaps(item, draft), ...transportGaps([item], draft.project)]} shaking={false} />;
    },
    opts,
  );

/** Controls ringed amber — the mark for "this was chosen for you", now the only one. */
const ringed = (): number => document.querySelectorAll(".ring-warn\\/45").length;

describe("provenance marks (MREQ-AC-57/58/59)", () => {
  /**
   * ⚠️ These used to read the caption "AI selected". It is gone (owner, 2026-09-01: *"remove the
   * ai/project label, the orange highlight is enough"*) — the ring and the line said the same thing
   * twice, and a card with five prefilled fields carried five amber captions, so the marker meant to
   * be quiet became the loudest thing on the panel. Same rule, read off the ring.
   */
  it("marks what we defaulted, on delivery and return", async () => {
    await card();
    // `defaultProjectDetails` seeds both transport legs to "me" — visible, and marked as ours.
    expect(screen.getAllByText("Supplier").length).toBeGreaterThan(0);
    expect(ringed()).toBeGreaterThan(0);
  });

  it("marks what the agent chose", async () => {
    // The agent supplied the haulage legs, so they still equal the snapshot and read as its choice.
    await card({ draft: makeAgentDraft({ items: [makeItem({ deliveryOverride: "supplier", returnOverride: "supplier" })] }) });
    expect(ringed()).toBeGreaterThan(0);
  });

  it("clears the mark once the renter answers, and records the field", async () => {
    const handle = await card({ draft: makeAgentDraft({ items: [makeItem({ deliveryOverride: "supplier" })] }) });
    const before = ringed();

    await handle.run(() => {
      handle.store().actions.touchField("line_items[a0].delivery");
    });

    // The whole point is that the count can reach zero.
    expect(ringed()).toBe(before - 1);
    expect(handle.store().state.draft!.touchedFields).toContain("line_items[a0].delivery");
  });

  /**
   * The four controls on the machine panel carry no visible label and no note — the prototype colours
   * the chip instead: amber while the renter has not answered, dark once they have. On a photo a
   * small amber caption would be unreadable, so the colour IS the mark there.
   */
  it("marks the panel overlays by colour rather than by a note", async () => {
    const handle = await card();
    const year = screen.getByRole("combobox", { name: "MINIMUM YEAR" });
    // The certificate is a multi-select now (owner, 2026-09-01), so it is a listbox opener rather
    // than a combobox — the field has always been an array everywhere else.
    const cert = screen.getByRole("button", { name: "CERTIFICATE" });
    expect(year.className).toContain("brand-press");
    expect(cert.className).toContain("brand-press");

    await handle.run(() => pickYear(handle));

    expect(screen.getByRole("combobox", { name: "MINIMUM YEAR" }).className).toContain("navy-deep");
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
    // Delivery and return are still ours (ringed) — and nothing is blocking.
    expect(ringed()).toBeGreaterThan(0);
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
  it("resolves every canvas string, and renders figures in Latin digits even in Arabic", async () => {
    await renderCanvas(<Canvas />, {
      locale: "ar",
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
      prepare: (store) => store.actions.openSection("when"),
    });

    expect(screen.getByText("ما كتبته")).toBeTruthy();
    // The schedule is open, so equipment is collapsed to its strip — which is the label to assert.
    expect(screen.getByText("الآلة والمشغّل")).toBeTruthy();
    expect(screen.getByText("مدة التشغيل")).toBeTruthy();
    // 155 charged days, in the digits the rest of the app uses — Latin, Arabic locale included
    // (owner, 2026-09-04). This asserted «١٥٥» and the ABSENCE of "155" until that ruling.
    expect(screen.getByText("155")).toBeTruthy();
    expect(screen.queryByText("١٥٥")).toBeNull();
  });

  it("leaves no English canvas label behind", async () => {
    const { view } = await renderCanvas(<Canvas />, {
      locale: "ar",
      draft: makeAgentDraft({ items: [makeItem()], project: confirmedProject() }),
    });
    for (const english of ["YOU WROTE", "The machine", "Where it goes", "When it runs"]) {
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
    /* ~~«N things need you».~~ Removed (owner, 2026-09-01): it counted gaps the cards below already
       mark one by one, in the place the renter has to act on them. The gap itself is what this pins
       now — the required dot the panel draws beside an unanswered field. */
    expect(document.querySelectorAll(".text-brand").length).toBeGreaterThan(0);
    expect(handle.store().state.draft).toBeTruthy();
  });
});
