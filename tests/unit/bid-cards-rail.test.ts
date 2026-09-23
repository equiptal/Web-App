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

  it("starts the strip at the READING START, and never centres it", () => {
    /**
     * 🔴 **WITHDRAWN** (owner, 2026-09-21: *"why this cewntered? revert it back"*). It was centred
     * two days earlier on his own pick from four options — *«why margin from left not equal to
     * right»*, on a 1920 screen holding one bid — and the measurement behind that is still true and
     * worth keeping, because somebody will reach for it again: the gutters WERE equal (37px left,
     * 39px right); the CARD was not, 344px against the leading gutter with ~1480px of white after
     * it, because `PAGE_MAX` went `max-w-none` the same day and this container grew 1360 → 1840.
     * He has now looked at the centred strip and taken it off. A lone bid begins where every other
     * band on the page begins, and has white after it.
     *
     * ⚠️ **If it is ever centred again it must be `center-safe`.** This is an `overflow-x-auto`
     * scroller, and plain centring overflows at BOTH ends — the overflow past the start edge cannot
     * be scrolled to, so on a request with six bids the first one becomes unreachable. The rule is
     * asserted here rather than only in prose, so a bare `justify-center` cannot come back quietly.
     */
    const rail = classes.find((c) => c.includes("overflow-x-auto") && c.includes("flex"))!;
    expect(rail).not.toContain("justify-center");
    expect(rail).not.toContain("justify-center-safe");
    expect(rail).not.toMatch(/\bmx-auto\b/);
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

/**
 * 🔴 **The subtext is the CITY and what the bid covers** (owner, 2026-09-23, on «Supplier ·
 * Riyadh · 8 km»: *"make it, only city and offers x units if multi unit instead of this 2 units
 * badge"*).
 *
 * ~~«Supplier», the city, the distance — and a units BADGE in the pill column beneath the chat
 * control.~~ Every row in that strip is a supplier, so the word captioned the obvious; the distance
 * is the YARD's, which the equipment map states per machine with a «not confirmed» qualifier, so one
 * rounded figure here claimed a precision that surface spends itself refusing.
 *
 * ⚠️ The count moved rather than being dropped, so the card says it ONCE - and the accepted
 * shape came with it, because «2 of 3 units accepted» is a partial award and the green band says
 * only THAT a bid was accepted, never how much of it.
 */
describe("the bid card's subtext", () => {
  const CARD = readFileSync("src/components/workspace/BidCards.tsx", "utf8");
  /* Comments stripped: the notes above NAME what they removed, so a bare sweep fails on its own
     explanation - the tenth time this repo has recorded that. */
  const CODE = CARD.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("names the city and the units, and nothing else", () => {
    expect(CODE).toContain('{[card.supplierCity || null, unitsLine].filter(Boolean).join(" · ")}');
  });

  it("drops the «Supplier» caption and the yard's distance", () => {
    expect(CODE).not.toContain('L("Supplier", "مؤجّر")');
    expect(CODE).not.toContain("Math.round(card.distanceKm)");
  });

  /* The app's own gate: on a single-unit request every bid covers all of it, so the line would be
     stating nothing. */
  it("states the count only on a multi-unit request, and reads the OFFERED one", () => {
    expect(CODE).toMatch(/const unitsLine =[\s\S]{0,40}card\.numberOfUnits > 1/);
    expect(CODE).toContain("fmt(t.workspace.offersUnits, { n: String(unitsOffered) })");
    expect(CODE).toContain("fmt(t.workspace.acceptedUnits, { accepted: String(acceptedUnits), offered: String(unitsOffered) })");
  });

  /* Deleted, not left unrendered: a component nothing imports is one edit away from coming back
     beside the line that replaced it, and then the card states its count twice. */
  it("has no units badge left to come back", () => {
    expect(CODE).not.toContain("OffersUnitsBadge");
  });
});
