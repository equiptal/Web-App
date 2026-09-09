import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The bids are a RAIL you travel sideways, and the COLUMN carries their height.**
 *
 * Two owner rulings, a day apart, and the second corrects the first:
 *
 *  · 2026-09-08 — *"when the browser is 100% or more the bid cards are not responsive, no page
 *    scrolling is shown. Make the page scrollable, not the container of the cards."* That was
 *    answered by wrapping the cards into an `auto-fill` grid.
 *  · 2026-09-09 — *"No, the bids card must be scrolled horizontally to show all of them, but I meant
 *    we might need vertical scrolling to show the height of the card in some cases only."*
 *
 * So the grid was the wrong half of the fix: the missing scroll was VERTICAL, and wrapping took the
 * sideways travel away to get it. What holds now, and what this file pins: the strip scrolls
 * horizontally, the cards keep their own 344px, and the one vertical scroller is the workspace
 * COLUMN — never a bar inside the white card, which is what he was looking at on 09-08.
 *
 * Asserted against the source, like `dashboard-spacing`: it fails silently. Nothing throws, no render
 * test notices, and it shows up only as a screenshot with a bar in the wrong place.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** The className strings only — both files discuss the old classes in their comments. Quoted,
 *  braced and back-ticked forms all count, since this repo writes all three. */
const classNames = (src: string): string[] =>
  [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`|\{[^}]*?"([^"]*)"[^}]*\})/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );

describe("the bid cards are a sideways rail", () => {
  const src = read("src/components/workspace/BidCards.tsx");
  const classes = classNames(src);

  it("lays the bids out as one row that scrolls horizontally", () => {
    const rail = classes.find((c) => c.includes("overflow-x-auto") && c.includes("flex"));
    expect(rail, "the cards container states a scrolling flex row").toBeTruthy();
    // ~~`grid-cols-[repeat(auto-fill,…)]`.~~ Withdrawn 2026-09-09: wrapping is what removed the
    // sideways travel the owner asked to have back.
    expect(rail).not.toContain("auto-fill");
    expect(rail).not.toContain("flex-wrap");
  });

  it("states BOTH overflow axes, so no phantom vertical bar appears inside the strip", () => {
    // CSS computes the unstated axis from `visible` to `auto` the moment one scrolls — the bid rail,
    // the compare matrix and the suppliers table have each been bitten by exactly this.
    const rail = classes.find((c) => c.includes("overflow-x-auto") && c.includes("flex"))!;
    expect(rail).toContain("overflow-y-clip");
  });

  it("gives the card its own width back, and the row's height", () => {
    const card = classes.find((c) => c.includes("rounded-lg border bg-surface transition"));
    expect(card, "the card root").toBeTruthy();
    // A rail is made of cards that keep their size; a bid drawn at 700px is a different card.
    expect(card).toContain("w-[344px]");
    expect(card).toContain("flex-none");
    // Still the tallest-in-the-row height the 2026-08-30 ruling asked for (`items-stretch` above).
    expect(card).toContain("h-full");
  });
});

describe("one vertical scroller, and it is the page column", () => {
  const src = read("src/components/workspace/RequestsWorkspace.tsx");
  const classes = classNames(src);

  it("scrolls the workspace column itself", () => {
    // The pinned root, not the loading skeleton beside it — both are `h-full min-h-0 flex-col`.
    const root = /pin\("requests-workspace"\)\}\s*className="([^"]*)"/.exec(src)?.[1];
    expect(root, "the workspace root").toBeTruthy();
    expect(root).toContain("overflow-y-auto");
  });

  it("leaves neither tab pane with a vertical scroller of its own", () => {
    /* This is the half of 09-08 that survives 09-09. A card taller than the viewport is read by
       scrolling the PAGE; a pane that scrolled itself would put a bar inside the white card, and a
       pane that clipped would cut the card off with no way to see the rest. */
    expect(classes.some((c) => c.trim() === "flex min-h-0 flex-1 flex-col overflow-y-auto")).toBe(false);
    expect(classes.filter((c) => c.includes("overflow-y-auto")).length).toBe(1);
  });
});
