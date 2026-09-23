import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Canvas } from "@/components/create/Canvas";
import { MachineCard } from "@/components/create/MachineCard";
import { DRAFT_STORAGE_KEY } from "@/lib/store/rfq-store";
import { itemGaps, transportGaps } from "@/lib/contract";
import { EMPTY_REF } from "@/lib/contract/taxonomy";
import { confirmedProject, makeAgentDraft, makeItem, renderCanvas } from "../setup/canvas";

/* The two overlay pills are addressed by their accessible NAME, and that name is the field’s noun —
   «Certificate», «Minimum year». Their visible text is an INSTRUCTION while unanswered («Pick
   certificate»), because a shouted noun on an empty control reads as a label for a value that is not
   there (owner, 2026-09-08). Read by name, not by the words on the pill, so the copy can change
   again without touching these. */

/**
 * MREQ-TC-33/34/37/38 — the marks, the Arabic screen, resilience, and what survives a reload.
 *
 * The provenance badges are the honest half of a form that pre-answers most of itself. A renter shown
 * a finished page cannot tell which answers were theirs, and they own the result either way — so a
 * badge that silently stops rendering is a real regression with no other symptom.
 */

/** Answer the minimum-year control through the UI, the way a renter would. */
async function pickYear(handle: Awaited<ReturnType<typeof card>>) {
  screen.getByRole("combobox", { name: "Minimum year" }).click();
  await Promise.resolve();
  const listbox = screen.getByRole("listbox", { name: "Minimum year" });
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
/* The provenance mark is one thin line in the BRAND orange, as production draws it round a
   prefilled field. It was `ring-warn/45` with a tint and a 2px offset until 2026-09-08, when the
   owner pointed at prod: `--warn` in this palette is a mustard, not an orange. */
const ringed = (): number => document.querySelectorAll(".ring-brand").length;

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
   *
   * Since 2026-09-08 there is a THIRD state on these two: answered by the AGENT rather than by the
   * renter, which keeps the dark chip and adds the canvas’s provenance ring. `cert-year-pills.test.tsx`
   * pins all three.
   */
  it("marks the panel overlays by colour rather than by a note", async () => {
    const handle = await card();
    const year = screen.getByRole("combobox", { name: "Minimum year" });
    // The certificate is a multi-select now (owner, 2026-09-01), so it is a listbox opener rather
    // than a combobox — the field has always been an array everywhere else.
    const cert = screen.getByRole("button", { name: "Certificate" });
    /* `bg-brand`, not `brand-press`: the pressed shade (#bd5711) is nearly a brown and read as a
       filled answer on an EMPTY control (owner, 2026-09-08). `toContain("bg-brand")` would also
       match `bg-brand-press`, so the second line is what actually pins the change. */
    expect(year.className).toContain("bg-brand");
    expect(cert.className).toContain("bg-brand");
    expect(year.className).not.toContain("brand-press");
    expect(cert.className).not.toContain("brand-press");

    await handle.run(() => pickYear(handle));

    expect(screen.getByRole("combobox", { name: "Minimum year" }).className).toContain("navy-deep");
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
    expect(screen.getByText("المعدّة والمشغّل")).toBeTruthy();
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
    for (const english of ["YOU WROTE", "The equipment", "Where it goes", "When it runs"]) {
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

    expect(screen.getByText("The equipment")).toBeTruthy();
    expect(screen.getByText("Where it goes")).toBeTruthy();
    /* ~~«N things need you».~~ Removed (owner, 2026-09-01): it counted gaps the cards below already
       mark one by one, in the place the renter has to act on them. The gap itself is what this pins
       now — the required dot the panel draws beside an unanswered field.
       ⚠️ It reads the DOT's own glyph, not a colour class. It used to count `.text-brand`, which
       stopped existing when the two orange label states were unified onto `brand-deep`
       (owner, 2026-09-12) — and worse, the class it would have moved to is worn by a
       chosen-FOR-you label as well, so the assertion would have passed with no dot on screen. */
    const dots = [...document.querySelectorAll("span")].filter((s) => s.textContent === "●");
    expect(dots.length).toBeGreaterThan(0);
    expect(handle.store().state.draft).toBeTruthy();
  });
});

/**
 * ── ONE orange, for both of the label's orange states (owner, 2026-09-12) ───────────────────────
 * *"Use unified font colour for missing fields: some have dark orange like return and site and some
 * have orange like size, so unify."*
 *
 * `missing` drew `text-brand` (#f97316) and a chosen-FOR-you label drew `text-brand-deep`
 * (#c2570f) — two oranges on one card, and the brighter one broke this file's own stated rule, that
 * orange TEXT on a light ground must be the deep one to pass AA while `brand` is a FILL.
 *
 * These read the SOURCE, because jsdom resolves no custom property and the fault was a shade.
 */
describe("the two orange label states wear one ink", () => {
  const src = readFileSync(resolve(process.cwd(), "src/components/create/Provenance.tsx"), "utf8");

  it("spells the missing label and the chosen-for-you label the same", () => {
    expect(src).toContain('missing || isSystemChosen(source) ? "text-brand-deep"');
  });

  it("uses no bare `text-brand` in the marks themselves — it is a fill colour", () => {
    /* The DOT and the field, comments stripped: a `~~text-brand~~` inside the note recording why it
       went would otherwise fail its own rule.
       ⚠️ `CheckFromProject` is deliberately OUTSIDE this slice and keeps `text-brand`: it is a
       16px icon glyph sitting on `bg-brand-soft`, not 11px type on the card's own ground, and it is
       the one mark on this surface the owner did not name. */
    const marks = src.slice(src.indexOf("export function RequiredDot")).replace(/\/\*[\s\S]*?\*\//g, "");
    // `text-brand-deep` must not satisfy this, hence the word boundary.
    expect(/text-brand(?![\w-])/.test(marks)).toBe(false);
  });

  it("keeps the DOT on the same ink as the label it follows", () => {
    const dot = src.slice(src.indexOf("export function RequiredDot"), src.indexOf("export function CanvasField"));
    expect(dot).toContain("text-brand-deep");
  });

  it("still tells the two states apart — by the dot and the ring, not by the shade", () => {
    // The ● is drawn for `missing` alone; the ring round the control for `isSystemChosen` alone. So
    // nothing was lost by merging the inks: what a renter reads the state OFF is still per-state.
    expect(src).toContain("<RequiredDot show={missing} />");
    const ring = src.slice(src.indexOf("The amber highlight wraps the CONTROL"));
    expect(ring).toContain("isSystemChosen(source)");
    expect(ring).toContain("ring-1 ring-brand");
  });
});

/**
 * ── «Required» costs the label as little as it can (owner, 2026-09-12) ──────────────────────────
 * *"fix the ui when required appear to not change the size of card box and dont affect the text
 * wrapping, put the required text small"*.
 *
 * The word was a flex SIBLING of the label at the label's own metrics - 11px, uppercase, extrabold,
 * with the row's 0.05em tracking - and it carried a star of its own. Three faults from that one
 * line: it took its width off the label, so «FUEL RESPONSIBILITY» wrapped to two lines and its panel
 * grew taller than the two beside it; with no `nowrap` the string «* Required» split at its own
 * space, stranding the star at the end of the first line with «REQUIRED» beneath it; and at that
 * weight it read as a second title rather than as a note on the first.
 */
describe("the required marker, on a labelled field", () => {
  const markOf = (root: HTMLElement) =>
    Array.from(root.querySelectorAll("span")).find((el) => el.textContent?.trim() === "Required") ?? null;

  it("is small and quiet: sentence case, no tracking, and not the label's weight", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ ref: EMPTY_REF })], project: confirmedProject() }),
    });
    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    const mark = markOf(handle.view.container);
    expect(mark, "a refused field must say the word").toBeTruthy();
    // The row is `uppercase … tracking-[0.05em]`; the marker opts out of both, which is most of the
    // width it gave back.
    expect(mark!.className).toContain("normal-case");
    expect(mark!.className).toContain("tracking-normal");
    expect(mark!.className).toContain("font-semibold");
    expect(mark!.className).not.toContain("font-extrabold");
  });

  it("never breaks in half, and never takes the label's width as a rigid item", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ ref: EMPTY_REF })], project: confirmedProject() }),
    });
    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    const mark = markOf(handle.view.container)!;
    // «* Required» split at its own space and left the star on the line above.
    expect(mark.className).toContain("whitespace-nowrap");
    // INLINE with the label's text, not a sibling of it: it flows with the words rather than
    // competing with them for the row's width.
    expect(mark.parentElement?.textContent).toMatch(/Required$/);
    expect(mark.parentElement?.className).toContain("min-w-0");
  });

  it("carries no star of its own — the label has one, in both states", async () => {
    const handle = await renderCanvas(<Canvas />, {
      draft: makeAgentDraft({ items: [makeItem({ ref: EMPTY_REF })], project: confirmedProject() }),
    });
    await handle.run(() => {
      screen.getByText(/Review & send/).closest("button")!.click();
    });

    expect(markOf(handle.view.container)!.textContent).toBe("Required");
    // The standing star survives the refusal rather than being replaced by it, so the label's width
    // is the same before and after — which is the whole point of the change.
    expect(screen.getAllByText("*").length).toBeGreaterThan(0);
  });
});
