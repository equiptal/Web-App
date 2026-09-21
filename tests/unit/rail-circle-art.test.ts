import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **The rail's circle, when a request holds more than one machine.**
 *
 * Owner, 2026-09-21: *"for multi item requests we put the image of first item in the request in the
 * top circule, but cant we make the multi item take multi equipmet images small in this circule?
 * and clicking double on the circule open the circule image big on the screen (still take me to the
 * request clicked) but we will see the zoomed in image"*.
 *
 * ⚠️ Read from the SOURCE. The rail needs a signed-in renter with requests, and what is under test
 * is a set of rulings — which fit a 26px cell takes, that the double press does not replace the
 * single one, that a failed picture costs only itself. jsdom lays nothing out and would not catch
 * any of them.
 */

const SRC = resolve(__dirname, "../../src");
const rail = readFileSync(resolve(SRC, "components/workspace/RequestRail.tsx"), "utf8");
/** The component's code with its comments stripped — several rules below are NAMED in the prose
 *  that says they must not be used, which is how four assertions in this repo went vacuous. */
const code = rail.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const art = code.slice(code.indexOf("function CircleArt"), code.indexOf("function CircleZoom"));

describe("one machine or many, in one 52px circle", () => {
  it("Given fewer than two pictures, Then the circle is the single image it always was", () => {
    // A montage is worth its loss of size only when every cell carries a machine: a picture beside
    // a grey glyph is worse than the picture alone, and the count badge says how many lines there
    // are whatever this decides.
    expect(art).toContain("const art = machines.filter((m) => m.url);");
    expect(art).toContain("if (art.length < 2) {");
  });

  it("Given more than three, Then only three are drawn and nothing says «+N»", () => {
    /**
     * 🔴 His number (*"show 3 items at most in the circule"*). A fourth machine is 13px wide, which
     * is a mark rather than a machine — and the count badge already states how many lines the
     * request really holds, so an overflow marker inside the circle would say it twice.
     */
    expect(code).toContain("const MAX_IN_CIRCLE = 3;");
    expect(art).toContain("art.slice(0, MAX_IN_CIRCLE)");
    expect(art).not.toContain("+{extra}");
  });

  it("Given several machines, Then they sit in ONE row on ONE ground", () => {
    /**
     * 🔴 ~~A grid of cells with a hairline between them, each on its own grey tile.~~ (owner,
     * 2026-09-21: *"cant u merge their backgorudn like they sit on one background and zoom them
     * out?"*). Framed thumbnails in a 52px circle read as broken pictures rather than as one
     * request holding several machines.
     */
    expect(art).toContain("flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full");
    // No cell ground, no hairline, no grid.
    expect(art).not.toContain("bg-border");
    expect(art).not.toContain("gap-px");
    expect(art).not.toContain("row-span-2");
    // Each takes its share of the width, which is what «zoom them out» means here.
    expect(art).toContain("width: `${100 / shown.length}%`");
  });

  it("Given each picture, Then its own EDGE is masked away so the grounds merge", () => {
    /**
     * Owner, 2026-09-22, on the shipped montage: *"cant we merge them in one background? not shown
     * as 2 seperate imeages"*.
     *
     * The ground colour alone was not enough. Every render shares one beige sweep, which is what
     * `--photo-ground` matches, but each carries a VIGNETTE - measured on `taxonomy-icons`
     * spider-lift, corners #d8d4cd against a disc of #e3ded7, eleven levels darker. `object-contain`
     * draws the whole file, vignette included, so each machine sat inside a faintly darker rectangle
     * with hard edges, and two of those read as two pasted pictures.
     *
     * Compared at the real 52px, magnified 7x, against both alternatives: `object-cover` fills the
     * half and shreds the machine (2.7x crop, hard vertical seam where the two meet), and a
     * top-and-bottom fade leaves the left and right edges standing.
     */
    expect(code).toContain("const CELL_MASK =");
    expect(code).toContain("radial-gradient(ellipse 62% 62% at 50% 50%, black 55%, transparent 100%)");
    const rowImg = art.slice(art.indexOf("{shown.map("));
    expect(rowImg).toContain("maskImage: CELL_MASK");
    expect(rowImg).toContain("WebkitMaskImage: CELL_MASK");
    // ⚠️ Per CELL, never on the disc: the disc's own edge is the circle, and fading that greys the rim.
    const disc = art.slice(art.indexOf("flex h-[52px]"), art.indexOf("{shown.map("));
    expect(disc).not.toContain("maskImage");
  });

  it("Given the disc under them, Then it is the PHOTOGRAPHS' own ground", () => {
    /**
     * 🔴 This is what makes the merge seamless rather than merely tidy. The renders share one beige
     * studio sweep — measured across two assets, twelve samples, all within 4/255 of #e3ded7 — so
     * images laid edge to edge on a disc of that colour have no boundary at all. On `surface3` they
     * draw a rectangular beige band across a grey circle, which is the state this replaces. Seen at
     * 9× before choosing.
     *
     * ⚠️ The glyph fallback keeps `surface3`: a beige disc carrying a grey drawing reads as a
     * photograph that failed, which is the state it would be imitating.
     */
    expect(code).toContain('img ? "bg-photo-ground" : "bg-surface3"');
  });

  it("Given a machine in the row, Then the drawing is contained and NOT scaled", () => {
    /**
     * ⚠️ The single picture scales a drawing by 1.34 to hide its letterbox band against the round
     * edge. In the row the neighbours ARE the rest of the band, so scaling would crop each machine
     * to its middle third for nothing.
     */
    const rowImg = art.slice(art.indexOf("{shown.map("));
    expect(rowImg).toContain('m.isPhoto ? "object-cover" : "object-contain"');
    expect(rowImg).not.toContain("scale-[1.34]");
    // …and the single-picture path keeps it, so the two cases have not been collapsed.
    expect(code).toContain('const fitOf = (isPhoto: boolean) => (isPhoto ? "object-cover" : "scale-[1.34] object-contain");');
  });
});

describe("a double press opens the picture and still picks the request", () => {
  it("Given the tile, Then the single press is untouched and the double press only adds the view", () => {
    // `onClick` has already fired twice by the time `onDoubleClick` runs, and picking the same
    // request twice changes nothing — so the selection stays the single press's job.
    expect(code).toContain("onClick={() => onPick(tile.key)}");
    expect(code).toContain("onDoubleClick={() =>");
    expect(code).toContain("setZoom(tile)");
  });

  it("Given a group with no artwork at all, Then there is nothing to open", () => {
    // A dialog of grey glyphs is not a zoomed picture.
    expect(code).toContain("if (machines.some((m) => m.url)) setZoom(tile);");
  });

  it("Given the zoomed view, Then it names EVERY machine, artwork or not", () => {
    /**
     * ⚠️ A line whose picture never loaded is still part of the request and still has a name. A
     * zoomed view holding fewer machines than the ITEMS tabs would repeat the montage's own
     * compromise where there is room not to.
     */
    const zoom = code.slice(code.indexOf("function CircleZoom"), code.indexOf("export function RequestRail"));
    expect(zoom).toContain("machines.map((m, i) =>");
    expect(zoom).toContain("precision_manufacturing");
    expect(zoom).toContain("{m.name}");
    // ⚠️ No crop and no scale with room to spare: both exist to fill a 52px ROUND hole.
    expect(zoom).toContain('className="h-full w-full object-contain"');
    expect(zoom).not.toContain("object-cover");
  });

  it("Given the dialog, Then it is mounted OUTSIDE the scrolling strip", () => {
    // A dialog rendered inside a horizontally scrolling band travels with it.
    const scroller = code.indexOf("{tiles.map((tile)");
    expect(code.indexOf("{zoom && (")).toBeGreaterThan(scroller);
    expect(code.indexOf("<CircleZoom")).toBeGreaterThan(code.lastIndexOf("</button>"));
  });
});

describe("one machine's failure costs only that machine", () => {
  it("Given a 403, Then the broken set is keyed by URL and not by tile", () => {
    /**
     * 🔴 ~~Keyed by TILE.~~ True while a tile held one picture; a multi-item circle holds up to
     * four, and by-tile would blank every machine in the group because one of them 403'd. The
     * taxonomy objects are not public-read on staging, so this is the ordinary case, not the edge.
     */
    expect(code).toContain("new Set(b).add(url)");
    expect(code).not.toContain("new Set(b).add(tile.key)");
    expect(code).toContain("tile.imageUrl && broken.has(tile.imageUrl) ? null :");
    expect(code).toContain("m.url && broken.has(m.url) ? { ...m, url: null } : m");
  });
});
