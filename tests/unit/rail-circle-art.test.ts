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

  it("Given more than four, Then three are drawn and the rest are a number", () => {
    // A fifth 26px cell says less than «+2» does.
    expect(art).toContain("art.slice(0, art.length > 4 ? 3 : 4)");
    expect(art).toContain("+{extra}");
  });

  it("Given exactly three, Then the first takes the whole leading column", () => {
    // Otherwise a 2×2 grid leaves one empty quarter, which reads as a picture that failed.
    expect(art).toContain('shown.length === 3 && extra === 0 && i === 0 ? "row-span-2" : ""');
  });

  it("Given a CELL, Then the drawing is contained and NOT scaled", () => {
    /**
     * 🔴 The whole circle scales a drawing by 1.34 to hide its letterbox band against the round
     * edge. A cell's neighbour is a hairline and another machine, so the band costs almost nothing
     * while the crop costs the machine — at 26px a scaled excavator is its own middle third and
     * reads as a smudge. Looked at both ways at the real size before choosing.
     */
    const cellImg = art.slice(art.indexOf("{shown.map("));
    expect(cellImg).toContain('m.isPhoto ? "object-cover" : "object-contain"');
    expect(cellImg).not.toContain("scale-[1.34]");
    // …and the single-picture path keeps it, so the two cases have not been collapsed.
    expect(code).toContain('const fitOf = (isPhoto: boolean) => (isPhoto ? "object-cover" : "scale-[1.34] object-contain");');
  });

  it("Given the cells, Then the hairline between them is the grid's own ground", () => {
    // A border on each cell would be drawn inside the round clip on the outer ones too, ringing
    // the circle.
    expect(art).toContain("gap-px overflow-hidden rounded-full bg-border");
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
