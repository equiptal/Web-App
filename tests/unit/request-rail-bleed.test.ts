import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ── The rail is a band OF the screen, not a card ON it (owner, 2026-09-12) ──────────────────────
 *
 * *"can we make this header fit the whole screen no margin so like it is part of the screen not a
 * card"*.
 *
 * 🔴 **This reverses half of 2026-08-30** — *"make the bar same width and margin as the requests
 * parent card so all aligned"* — and it is worth being precise about which half, because the other
 * one still holds and a future reader will meet both rulings in the component's own comment.
 *
 *  · GONE: the card. The 1440 cap, the outer gutter, the radius and the all-round border, which
 *    together drew a slab floating over the page.
 *  · KEPT: the alignment. The gutter moved INSIDE the band, so the «New» circle still starts on the
 *    same vertical as the panel below it. That is what 08-30 was actually protecting — the pre-08-30
 *    fault was a full-bleed ground whose content sat somewhere else entirely.
 *
 * ⚠️ jsdom lays out nothing, so this reads the SOURCE. What is assertable is the rule that decides
 * the shape, never the shape itself.
 */
const SRC = readFileSync("src/components/workspace/RequestRail.tsx", "utf8");

/** The band's own element — the one carrying the 96px height. */
const band = (() => {
  const at = SRC.indexOf('h-[96px]');
  return SRC.slice(SRC.lastIndexOf("<div", at), SRC.indexOf(">", at) + 1);
})();

describe("the rail's ground reaches the window", () => {
  it("carries no cap, no outer gutter and no radius", () => {
    expect(band).not.toMatch(/max-w-\[1440px\]/);
    expect(band).not.toMatch(/mx-auto/);
    expect(band).not.toMatch(/rounded/);
  });

  it("has no all-round border — a band is edged where the page begins, and nowhere else", () => {
    // `border-b` is the hairline that keeps it from being a grey area with no edge; a bare `border`
    // is the card this ruling removes.
    expect(band).toMatch(/border-b border-border/);
    expect(band).not.toMatch(/\bborder border-border\b/);
  });

  it("still paints the same ground", () => {
    // Only the SHAPE changed. A different tone here would be a second, unasked-for decision.
    expect(band).toMatch(/bg-surface3\/60/);
  });
});

describe("the tiles still line up with the panel below", () => {
  it("the band carries the page's own gutter, so its content starts where the page does", () => {
    /**
     * The half of 2026-08-30 that survives. Without this the ground would reach the window while the
     * «New» circle sat hard against the glass, which is the disagreement that ruling was written to
     * end — and it would read as a worse fault than the card did.
     */
    expect(band).toMatch(/\$\{PAGE_X\}/);
    expect(SRC).toMatch(/import \{ PAGE_X \} from "@\/components\/AppShell"/);
  });

  it("is ONE element now, not three nested ones", () => {
    // The row's place in the column, and the band. The middle wrapper existed only to cap and
    // gutter the card; leaving it would put the outer margin back a layer down.
    const open = SRC.slice(SRC.indexOf('pin("request-rail")'), SRC.indexOf('h-[96px]'));
    expect(open).not.toMatch(/max-w-/);
  });
});
