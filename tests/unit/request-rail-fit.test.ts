import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ── Every tile fills its circle (owner, 2026-09-12) ─────────────────────────────────────────────
 * *"make sure all photos fit well in the circle, as some have squared edges and some fit well."*
 *
 * **Measured on staging before touching anything**, which is what settled it: the request rail draws
 * three kinds of tile, and two of them were the same SHAPE and took different fits.
 *
 *   · a photograph — `.jpeg`, 1408×768, ratio 1.83 — on `object-cover`: scaled to 95px wide inside a
 *     52px circle, sides cropped, the machine filling the mask. This is the one that «fits well».
 *   · a taxonomy drawing — `spider-crane.png`, 1024×559, ratio **1.83, the same shape** — on
 *     `object-contain p-1`: drawn 52×28, a letterbox whose own straight top and bottom edge shows
 *     through a round hole. That edge is the «squared» one, and `p-1` shrank the box first.
 *   · no artwork at all — the `precision_manufacturing` icon. A different state, left alone.
 *
 * `object-cover` for the drawings was TRIED on the live rail and rejected: the crop cut the machine
 * into an unreadable jumble, exactly as the note in the component predicted. Scaling a `contain` fit
 * keeps the whole machine and still gives it the circle.
 *
 * ⚠️ jsdom lays out no images, so this reads the SOURCE. The fit is a rendered fact; what is
 * assertable here is that the two rules are the ones the live test chose.
 */
const SRC = readFileSync("src/components/workspace/RequestRail.tsx", "utf8");

/** The `className={…}` ternary that decides the fit, isolated from the rest of the file. */
const fitRule = (() => {
  const at = SRC.indexOf("tile.imageIsPhoto");
  return SRC.slice(at, SRC.indexOf("}", SRC.indexOf("object-contain", at)));
})();

describe("the request rail's tile artwork", () => {
  it("fills the circle for a photograph, by covering it", () => {
    expect(fitRule).toContain('"h-[52px] w-[52px] rounded-full object-cover"');
  });

  it("fills the circle for a DRAWING by scaling a contain fit, never by cropping it", () => {
    expect(fitRule).toContain("scale-[1.34]");
    expect(fitRule).toContain("object-contain");
    // The rejected candidate: one rule for both. It shreds a 1.83 drawing.
    expect(fitRule.match(/object-cover/g) ?? []).toHaveLength(1);
  });

  it("no longer shrinks the drawing before fitting it", () => {
    // `p-1` took 2px off a 52px box before `contain` had its say — the letterbox got smaller still.
    expect(fitRule).not.toContain("object-contain p-1");
  });

  it("keeps both fits inside a mask that clips them", () => {
    // Scaling past the box is only safe because the parent clips; without this the drawing would
    // spill over the tile's border and the count badge.
    expect(SRC).toContain("overflow-hidden rounded-full");
  });
});
