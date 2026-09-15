import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The machine's picture on the workspace's context bar.
 *
 * Owner, 2026-09-15, on a shot of the navy bar reading «Riyadh — Al Olaya» over «Crawler Excavator ·
 * 20 ton ×2»: *"can u have the equipment image as circle on the left of this card"*.
 *
 * ⚠️ Read from the SOURCE. jsdom lays out no images and loads none, so neither the circle nor the fit
 * is measurable here — what is pinned is the ruling that decides them, and the two things that fail
 * SILENTLY if they are lost: the 403 fallback, and the clip that makes scaling past the box safe.
 */

const SRC = resolve(__dirname, "../../src");
const bar = readFileSync(resolve(SRC, "components/workspace/RequestContextBar.tsx"), "utf8");
const rail = readFileSync(resolve(SRC, "components/workspace/RequestRail.tsx"), "utf8");

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
  });

  it("Given no artwork in the catalogue, Then the glyph stands in and nothing is invented", () => {
    expect(bar).toContain('<Icon name="precision_manufacturing"');
  });
});

describe("the fit follows the rail's ruling, because it is the same asset in the same hole", () => {
  it("Given a photograph, Then it is cropped to fill the circle", () => {
    expect(bar).toContain('"h-8 w-8 rounded-full object-cover"');
  });

  it("Given a drawing, Then it is contained and scaled to the circle's diameter", () => {
    /**
     * 🔴 Cropping a drawing enlarges its transparent MARGIN rather than the machine — tried on the
     * live rail and rejected there (2026-09-12). `contain` keeps the whole machine; the scale gives
     * it the circle.
     */
    expect(bar).toContain('"h-8 w-8 scale-[1.34] object-contain"');
  });

  it("Given the scale, Then it is the same number the rail measured", () => {
    // One catalogue, one aspect ratio, one factor. Two different numbers here would be a bug in one.
    expect(rail).toContain("scale-[1.34]");
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
    expect(bar).toContain("onError={() => setBrokenArt(");
    expect(bar).toContain("const showArt = art && !brokenArt.includes(art) ? art : null;");
  });

  it("Given a different machine, Then the last one's failure does not follow it", () => {
    // Keyed by URL, never a bare boolean — the bar re-renders per item and a flag would carry over.
    expect(bar).toContain("useState<string[]>([])");
  });
});
