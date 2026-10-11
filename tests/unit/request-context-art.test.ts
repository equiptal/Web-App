import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The machines' picture on the workspace's context bar.
 *
 * Owner, 2026-09-15, on a shot of the navy bar reading «Riyadh — Al Olaya» over «Crawler Excavator ·
 * 20 ton ×2»: *"can u have the equipment image as circle on the left of this card"*.
 *
 * 🔴 **And 2026-09-22, which changed WHOSE picture it is**: *"for multi item, make sure all mutli
 * items requests are designed in this way and can show up to 3 equipments in the same background"*,
 * then, asked where the rail's montage should reach, *"mak it also show the items name in the navy
 * card"*. ~~The ACTIVE item's one picture, and its name alone.~~ The bar stands for the REQUEST:
 * the montage, and the machines named beside it. Which line is being read is the ITEMS strip's job.
 *
 * ⚠️ Read from the SOURCE. jsdom lays out no images and loads none, so neither the circle nor the fit
 * is measurable here — what is pinned is the ruling that decides them, and the things that fail
 * SILENTLY if they are lost: the 403 fallback, the shared derivation, and the shared component.
 */

const SRC = resolve(__dirname, "../../src");
const bar = readFileSync(resolve(SRC, "components/workspace/RequestContextBar.tsx"), "utf8");
/** ⚠️ The bar's own prose NAMES `<img>` while explaining why there must not be one, so the
 *  no-private-artwork case has to read the code. Fifth time in this repo that a `not.toContain`
 *  failed on its own explanation. */
const barCode = bar.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const shared = readFileSync(resolve(SRC, "components/workspace/CircleArt.tsx"), "utf8");
const contract = readFileSync(resolve(SRC, "lib/contract/workspace.ts"), "utf8");

describe("the picture leads the bar", () => {
  it("Given the bar, Then the circle is drawn before the two lines of text", () => {
    /**
     * «Left» is the LEADING edge: being first in the flex row is what mirrors it in Arabic. A rule
     * placing it on the left would put it on the wrong side of an Arabic bar.
     */
    const art = bar.indexOf("rounded-full border border-white/15 bg-surface3");
    const lines = bar.indexOf('<span className="flex min-w-0 flex-1 flex-col justify-center gap-1">');
    expect(art).toBeGreaterThan(-1);
    expect(lines).toBeGreaterThan(art);
  });

  it("Given a 44px control, Then the circle is 32px so the row keeps its air", () => {
    expect(bar).toContain("grid h-8 w-8 flex-none place-items-center overflow-hidden rounded-full");
    // `control-lg` is the 44 the bar has carried since 2026-08-27; the circle must not have changed it.
    expect(bar).toContain("control-lg");
    // …and the component is TOLD that 32, rather than inheriting the rail's default of 52.
    expect(bar).toContain("size={32}");
  });

  it("Given no artwork in the catalogue, Then the glyph stands in and nothing is invented", () => {
    /* 🔴 The glyph is a DRAWN component now, not a name from the icon font (owner,
       2026-09-22: *"use nice icons not this"*). The RULE is unchanged - a machine with no
       picture still draws a stand-in rather than a broken image - and only its address moved. */
    expect(shared).toContain("<MachineGlyph");
  });
});

describe("the bar draws the REQUEST, not the line being read", () => {
  it("Given the bar, Then it draws the rail's own component rather than an `img` of its own", () => {
    /**
     * 🔴 The whole point of the change. A second `<img>` here is a second answer to which fit a
     * drawing takes, how far the pictures overlap and how many of them a circle admits — and the
     * two discs sit one row apart, so a disagreement is visible and nothing fails when it happens.
     */
    expect(bar).toContain('import { CircleArt } from "@/components/workspace/CircleArt";');
    expect(bar).toContain("<CircleArt");
    // No private copy of the artwork.
    expect(barCode).not.toContain("<img");
  });

  it("Given the group, Then its machines come from the RAIL's derivation", () => {
    /**
     * ⚠️ `railMachines` is shared with `railTiles`, which builds the tile above this bar. Two
     * answers to «which machines does this request hold» is how the two rows come to name different
     * machines for one request.
     */
    expect(bar).toContain("const machines = railMachines(group, ar);");
    expect(contract).toContain("export function railMachines(");
    expect(contract).toContain("machines: railMachines(g, ar),");
  });

  it("Given several machines, Then up to three TYPE names, each its own block, cut only at its own end", () => {
    /**
     * Owner, 2026-10-11, multi-item decision 2 (C2). ~~One sentence of every name and size, cut by
     * one `truncate` wherever the width ran out~~: it cut in the middle of a name.
     */
    expect(bar).toContain("const NAMES_SHOWN = 3;");
    expect(bar).toContain("const shownNames = live.slice(0, NAMES_SHOWN);");
    expect(bar).toContain('<span className="min-w-0 max-w-[150px] truncate">');
    expect(bar).toContain("{m.typeName}");
    // «×N» stays inside its name's own block.
    expect(bar).toContain('{m.qty > 1 && <span className="tabular text-white/45"> ×{m.qty}</span>}');
    // Plain text: no pill around a name.
    const names = bar.slice(bar.indexOf("shownNames.map("), bar.indexOf("{multi && restCount > 0 && ("));
    expect(names).not.toContain("rounded-full");
  });

  it("Given more than three, Then «+N more» in orange", () => {
    expect(bar).toContain("const restCount = live.length - shownNames.length;");
    expect(bar).toContain("{multi && restCount > 0 && (");
    expect(bar).toContain("font-extrabold text-brand");
    expect(bar).toContain('t.workspace.chipMore.replace("{n}", String(restCount))');
  });

  it("Given ONE machine, Then the row is exactly what it was: its name and its unit count", () => {
    expect(bar).toContain("const multi = machines.length > 1;");
    expect(bar).toContain('<span className="truncate">{label}</span>');
    expect(bar).toContain("{!multi && qty > 1 && (");
  });
});

describe("the fit follows the rail's ruling, because it is the same asset in the same hole", () => {
  it("Given a photograph, Then it is cropped to fill the circle", () => {
    expect(shared).toContain('isPhoto ? "object-cover"');
  });

  it("Given a drawing, Then it is contained and scaled to the circle's diameter", () => {
    /**
     * 🔴 Cropping a drawing enlarges its transparent MARGIN rather than the machine — tried on the
     * live rail and rejected there (2026-09-12). `contain` keeps the whole machine; the scale gives
     * it the circle.
     */
    expect(shared).toContain('"scale-[1.34] object-contain"');
  });

  it("Given the scale, Then there is exactly ONE of it", () => {
    // One catalogue, one aspect ratio, one factor — and now one file that states it.
    expect(bar).not.toContain("scale-[1.34]");
  });

  it("Given a picture scaled past its box, Then the box clips it", () => {
    // Without the clip a 1.34 drawing spills over the circle's own edge and the bar's rounded corner.
    const box = bar.slice(bar.indexOf("grid h-8 w-8 flex-none"), bar.indexOf("grid h-8 w-8 flex-none") + 160);
    expect(box).toContain("overflow-hidden");
    expect(box).toContain("rounded-full");
  });
});

describe("an unreadable object falls back to the glyph rather than to a broken image", () => {
  it("Given a 403, Then the URL is remembered as broken and the icon takes over", () => {
    /**
     * The taxonomy's objects are not public-read on staging, so a well-formed URL answers 403 and an
     * `<img>` absorbs that as «no artwork» — visible only as a broken-image glyph, which is worse
     * than the icon it replaced. `onError` is the only signal a client has.
     */
    expect(bar).toContain("onBroken={(url) => setBrokenArt(");
    expect(bar).toContain("const live = machines.map((m) => (m.url && brokenArt.includes(m.url) ? { ...m, url: null } : m));");
  });

  it("Given a 403 on ONE machine, Then the others in the group still draw", () => {
    /**
     * 🔴 Keyed by URL, never by tile or by a bare boolean. A group holds several pictures now, so a
     * flag would blank every machine in it on one failure — which is the rail's own ruling of
     * 2026-09-21, and it reaches here because the two read the same list.
     */
    expect(bar).toContain("useState<string[]>([])");
    expect(bar).toContain("b.includes(url) ? b : [...b, url]");
  });

  it("Given every picture broken, Then the fallback is a machine that still has one, or nothing", () => {
    // `lead` is the first machine with a live URL, which is exactly what `railTiles` puts on the
    // tile — so the montage and its fallback cannot describe different requests.
    expect(bar).toContain("const lead = live.find((m) => m.url) ?? null;");
    expect(bar).toContain("fallback={lead?.url ?? null}");
    expect(bar).toContain("fallbackIsPhoto={lead?.isPhoto ?? false}");
  });
});
