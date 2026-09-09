import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The bids wrap, and the PAGE is what scrolls** (owner, 2026-09-08: *"UI bug: when the browser is
 * 100% or more the bid cards are not responsive, no page scrolling is shown. Make the page
 * scrollable, not the container of the cards."*).
 *
 * The cards were one flex line of fixed 344px tiles inside `overflow-x-auto`, and every band above
 * them was `flex-none` with the tab panel taking the rest — so at 100% zoom the fourth bid hung off
 * the edge, the only way to it was a scrollbar at the foot of a container, and the page itself never
 * scrolled at all.
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

describe("the bid cards wrap", () => {
  const src = read("src/components/workspace/BidCards.tsx");
  const classes = classNames(src);

  it("lays the bids out as a wrapping grid, never a sideways rail", () => {
    const rail = classes.find((c) => c.includes("auto-fill"));
    expect(rail, "the cards container states an auto-fill grid").toBeTruthy();
    expect(rail).toContain("grid-cols-[repeat(auto-fill,minmax(min(100%,320px),344px))]");
    expect(rail).not.toContain("overflow-x-auto");
  });

  it("gives the track its own floor, so a phone gets one column and not a track wider than itself", () => {
    // `min(100%, 320px)`: the 320 is the floor on a desktop, the 100% is the phone.
    expect(classes.some((c) => c.includes("minmax(min(100%,320px)"))).toBe(true);
  });

  it("leaves the card's width to the grid", () => {
    const card = classes.find((c) => c.includes("rounded-lg border bg-surface transition"));
    expect(card, "the card root").toBeTruthy();
    // A card that states its own width overflows the single column a phone gives it.
    expect(card).not.toContain("w-[344px]");
    expect(card).not.toContain("flex-none");
    // Still the tallest-in-the-row height the 2026-08-30 ruling asked for, in grid's own terms.
    expect(card).toContain("h-full");
  });
});

describe("one scroller, and it is the page column", () => {
  const src = read("src/components/workspace/RequestsWorkspace.tsx");
  const classes = classNames(src);

  it("scrolls the workspace column itself", () => {
    // The pinned root, not the loading skeleton beside it — both are `h-full min-h-0 flex-col`.
    const root = /pin\("requests-workspace"\)\}\s*className="([^"]*)"/.exec(src)?.[1];
    expect(root, "the workspace root").toBeTruthy();
    expect(root).toContain("overflow-y-auto");
  });

  it("leaves neither tab with a scroller of its own", () => {
    // Both `overflow-y-auto` (the comparison) and `overflow-hidden` (the cards) are gone from the
    // pane: a bar inside a box inside the page is the thing the owner was looking at.
    expect(classes.some((c) => c.trim() === "flex min-h-0 flex-1 flex-col overflow-y-auto")).toBe(false);
    expect(classes.filter((c) => c.includes("overflow-y-auto")).length).toBe(1);
  });
});
