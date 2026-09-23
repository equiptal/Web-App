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

  it("Given more than three, Then only three are drawn and nothing says «+N»", () => {
    /**
     * 🔴 His number (*"show 3 items at most in the circule"*). A fourth machine is 13px wide, which
     * is a mark rather than a machine — and the count badge already states how many lines the
     * request really holds, so an overflow marker inside the circle would say it twice.
     */
    expect(shared).toContain("export const MAX_IN_CIRCLE = 3;");
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
    /* ⚠️ The disc's DIAMETER is the caller's (52 on the rail, 32 on the context bar), so what
       is pinned is its shape and its clip - a fixed 52 here would fail on the bar for being right. */
    expect(art).toContain('className="flex items-center justify-center overflow-hidden rounded-full"');
    expect(art).toContain("style={{ height: size, width: size }}");
    // No cell ground, no hairline, no grid.
    expect(art).not.toContain("bg-border");
    expect(art).not.toContain("gap-px");
    expect(art).not.toContain("row-span-2");
    // Each is drawn off its share of the width, which is what «zoom them out» means here.
    expect(art).toContain("width: `${SPREAD / shown.length}%`");
  });

  it("Given the row, Then each machine is BIGGER than its share and overlaps the next", () => {
    /**
     * Owner, 2026-09-22: *"u can make them a little bigger and closer"*.
     *
     * ⚠️ The two numbers are ONE decision and the test says so rather than restating them: the
     * row's total width is `SPREAD - OVERLAP` at ANY count, because the boost is `SPREAD / n` and
     * the pull-back `OVERLAP / (n - 1)`. Two machines at 66% overlap by 16 and three at 44% by 8,
     * and either way the row oversails the disc by the same amount, which the round clip takes.
     * Pinning «66» and «16» instead would go stale the first time the cap moved.
     */
    expect(shared).toContain("const SPREAD = 132;");
    expect(shared).toContain("const OVERLAP = 16;");
    expect(art).toContain("marginInlineStart: `-${OVERLAP / (shown.length - 1)}%`");
    // ⚠️ Only AFTER the first, or the row is pushed off its own leading edge.
    expect(art).toContain("...(i > 0 ?");
    /* 🔴 `flex-none` is what makes the boost survive: the row is deliberately wider than the
       disc, and a flex item that may shrink is shrunk straight back to fit. */
    const rowImg = art.slice(art.indexOf("{shown.map("));
    expect(rowImg).toContain("flex-none");
    // ⚠️ LOGICAL, never `marginLeft`: the rail mirrors whole under `dir="rtl"`.
    expect(art).not.toContain("marginLeft");
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
    expect(shared).toContain("const CELL_MASK =");
    /* 🔴 `closest-side`, and the element must BE the picture - see the case below. An
       ellipse sized in PERCENTAGES is sized to the BOX, and with a box taller than the picture the
       solid core swallowed it whole and faded nothing. */
    expect(shared).toContain("radial-gradient(closest-side, black 68%, transparent 100%)");
    const rowImg = art.slice(art.indexOf("{shown.map("));
    expect(rowImg).toContain("maskImage: CELL_MASK");
    expect(rowImg).toContain("WebkitMaskImage: CELL_MASK");
    // ⚠️ Per CELL, never on the disc: the disc's own edge is the circle, and fading that greys the rim.
    const disc = art.slice(art.indexOf("flex items-center justify-center"), art.indexOf("{shown.map("));
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

  it("Given a machine in the row, Then the ELEMENT IS THE PICTURE, and is not scaled", () => {
    /**
     * 🔴 `h-auto` is load-bearing, not tidiness: a CSS mask is sized to the ELEMENT BOX, never
     * to the picture inside it. With `h-full` the box was 26x52 while `contain` drew the picture
     * 26x19.4, so the mask's solid core spanned +/-17.9px and the picture only +/-9.7px - every
     * pixel of it inside the solid part, horizontal edges untouched, rectangle intact. Measured in
     * a browser; the source reads as though it is fading something.
     *
     * ⚠️ No `object-fit` follows from it: at its own aspect there is nothing to fit. And no
     * scale, unlike the single picture - the 1.34 exists to hide one drawing's letterbox band
     * against the round edge, and here the neighbours are the rest of the band.
     */
    const rowImg = art.slice(art.indexOf("{shown.map("));
    expect(rowImg).toContain('className="h-auto flex-none"');
    expect(rowImg).not.toContain("object-contain");
    expect(rowImg).not.toContain("object-cover");
    expect(rowImg).not.toContain("scale-[1.34]");
    // …and the single-picture path keeps it, so the two cases have not been collapsed.
    expect(shared).toContain('const fitOf = (isPhoto: boolean) => (isPhoto ? "object-cover" : "scale-[1.34] object-contain");');
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
    expect(zoom).toContain("const title = machines.map((m) => m.name).join(");
    expect(zoom).toContain("title={title}");
    expect(code).not.toContain("title={zoom.label}");
    // ⚠️ The Arabic list separator, or the names read with a Latin comma inside an RTL block.
    expect(zoom).toContain('locale === "ar" ? "، " : ", "');
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
