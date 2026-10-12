import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_IN_CIRCLE, circleTiles, rowsFor } from "@/components/workspace/CircleArt";

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
/** Comments stripped — several rules below are NAMED in the prose that says they must not be used,
 *  which is how four assertions in this repo went vacuous. */
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/**
 * 🔴 **The montage lives in its OWN module now** (2026-09-22): the workspace's context bar draws
 * the same request at 32px, so `CircleArt` stopped being the rail's private business. Every rule
 * below is unchanged and only its address moved — which is why this file reads two sources rather
 * than relaxing what it asks. A rule asserted against the wrong file passes on nothing.
 */
const code = strip(readFileSync(resolve(SRC, "components/workspace/RequestRail.tsx"), "utf8"));
const shared = strip(readFileSync(resolve(SRC, "components/workspace/CircleArt.tsx"), "utf8"));
const art = shared.slice(shared.indexOf("export function CircleArt"));

describe("one machine or many, in one 52px circle", () => {
  it("Given fewer than two pictures, Then the circle is the single image it always was", () => {
    // A montage is worth its loss of size only when every cell carries a machine: a picture beside
    // a grey glyph is worse than the picture alone, and the count badge says how many lines there
    // are whatever this decides.
    expect(art).toContain("const art = machines.filter((m) => m.url);");
    expect(art).toContain("if (art.length < 2) {");
  });

  it("Given more than four, Then four are drawn, as the app's list thumbnail", () => {
    /**
     * 🔴 Owner, 2026-10-11, multi-item decision 1: the app's group rules, kept round.
     * ~~Three, side by side, masked to fade into each other~~ (2026-09-21 / 22): the app tried
     * the overlapping row and dropped it on device. Its list cap is four, as 2 by 2.
     */
    expect(MAX_IN_CIRCLE).toBe(4);
    expect(art).toContain("art.slice(0, MAX_IN_CIRCLE)");
    expect(art).not.toContain("+{extra}");
  });

  it("Given 2, 3 or 4 machines, Then the rows are the app's: side by side, 2 + 1, 2 by 2", () => {
    expect(rowsFor(2)).toEqual([2]);
    expect(rowsFor(3)).toEqual([2, 1]);
    expect(rowsFor(4)).toEqual([2, 2]);
    expect(rowsFor(7)).toEqual([2, 2]);
  });

  it("Given any count at the rail's and the card's sizes, Then every tile sits INSIDE the circle", () => {
    for (const size of [52, 32]) {
      for (const n of [2, 3, 4]) {
        const r = size / 2;
        for (const t of circleTiles(n, size)) {
          for (const [x, y] of [[t.left, t.top], [t.left + t.width, t.top], [t.left, t.top + t.height], [t.left + t.width, t.top + t.height]]) {
            expect(Math.hypot(x - r, y - r)).toBeLessThanOrEqual(r);
          }
        }
      }
    }
  });

  it("Given two machines, Then they sit side by side with no gap, in tiles of the artwork's shape", () => {
    const [a, b2] = circleTiles(2, 52);
    expect(a.left + a.width).toBeCloseTo(b2.left, 5);
    expect(a.radius).toBe(0);
    // Owner, 2026-10-12: «too zoomed out, especially in 2 items». ~~Two tall halves, `contain`~~.
    expect(a.width / a.height).toBeCloseTo(1.34, 5);
    expect(art).toContain("transform: `scale(${TILE_ZOOM})`");
    // The second row of three is centred under the first.
    const three = circleTiles(3, 52);
    expect(three[2].left + three[2].width / 2).toBeCloseTo(26, 5);
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
    /* 🔴 The glyph is a DRAWN component now, not a name from the icon font (owner,
       2026-09-22: *"use nice icons not this"*). The RULE is unchanged - a machine with no
       picture still draws a stand-in rather than a broken image - and only its address moved. */
    expect(zoom).toContain("<MachineGlyph");
    expect(zoom).toContain("{m.name}");
  });

  it("Given the zoomed view, Then the MACHINES name it and the RFQ code does not", () => {
    /**
     * Owner, 2026-09-22: *"show their names at top instead of the rfq"*. He opened it by pressing
     * a picture, so the reference answered a question he had not asked.
     *
     * ⚠️ The caller therefore hands it `machines` ALONE. Leaving `title` on the props and simply
     * not rendering it is how a dialog quietly goes back to showing the code.
     */
    const zoom = code.slice(code.indexOf("function CircleZoom"), code.indexOf("export function RequestRail"));
    expect(zoom).toContain("title={title}");
    expect(code).not.toContain("title={zoom.label}");
    // Owner, 2026-10-12: type names with a dot between them. ~~Full names joined by commas~~, which
    // were lost among each name's own «·» before its size.
    expect(zoom).toContain('const title = machines.map((m) => m.typeName || m.name).join(" · ");');
  });

  it("Given a zoomed picture, Then it sits on the circle's own ground with no band", () => {
    /**
     * Owner, same note: *"the images must show like in the circule with the merged background"*.
     *
     * 🔴 ~~A square `surface2` tile with the picture contained inside it.~~ That drew grey bands
     * above and below every machine and a hard edge where the picture's own beige met them, which
     * is the circle's own fault on a bigger canvas. The tile IS the picture now: `--photo-ground`
     * under it and the height its own, so there is nothing left to band.
     *
     * ⚠️ `aspect-square` survives on the GLYPH arm alone - a fallback has no picture to take its
     * height from, and a 1px tall grey box is not a tile.
     */
    const zoom = code.slice(code.indexOf("function CircleZoom"), code.indexOf("export function RequestRail"));
    expect(zoom).toContain('m.url ? "bg-photo-ground" : "aspect-square bg-surface2"');
    expect(zoom).toContain('className="h-auto w-full"');
    expect(zoom).not.toContain("object-cover");
    expect(zoom).not.toContain("object-contain");
    expect(zoom).not.toContain("scale-[1.34]");
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

describe("the same request, drawn the same way wherever it stands for itself", () => {
  /**
   * Owner, 2026-09-22: *"for multi item, make sure all mutli items requests are designed in this
   * way and can show up to 3 equipments in the same background"*.
   *
   * 🔴 So `CircleArt` is SHARED. These cases exist because a copy of it would look right in review
   * and drift silently: the rail and the context bar sit one row apart, and nothing fails when two
   * discs fit one asset differently.
   */
  const bar = strip(readFileSync(resolve(SRC, "components/workspace/RequestContextBar.tsx"), "utf8"));
  const details = strip(readFileSync(resolve(SRC, "components/workspace/RequestDetailsModal.tsx"), "utf8"));

  it("Given the context bar, Then it draws this component and holds no artwork of its own", () => {
    expect(bar).toContain("<CircleArt");
    expect(bar).not.toContain("<img");
    expect(bar).not.toContain("scale-[1.34]");
  });

  it("Given a caller, Then the DIAMETER is all it decides", () => {
    // Everything else - the fit, the spread, the mask, the cap - stays in one place, and a second
    // `size`-like escape hatch is how the rail and the bar start disagreeing again.
    expect(art).toContain("size = 52,");
    expect(bar).toContain("size={32}");
    const props = art.slice(art.indexOf("export function CircleArt"), art.indexOf("const art = machines.filter"));
    expect(props).not.toContain("SPREAD");
    expect(props).not.toContain("max");
  });

  it("Given the details modal's rows, Then a DRAWING is contained and only a photograph is cropped", () => {
    /**
     * 🔴 ~~`object-cover` for both.~~ Every row of a multi-item request cropped its drawing to a
     * 56x44 box, which enlarges the artwork's own transparent margin and cuts the machine - the
     * rail's ruling of 2026-09-12, three surfaces along and never applied here.
     *
     * ⚠️ NO scale, unlike the circle: the 1.34 exists to fill a ROUND hole whose curve shows a
     * drawing's letterbox edge, and this box is a rectangle of nearly the artwork's own aspect.
     */
    expect(details).toContain("it.item?.imageIsPhoto");
    expect(details).toContain('"h-full w-full object-contain"');
    expect(details).not.toContain("scale-[1.34]");
  });
});
