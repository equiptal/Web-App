import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { GuestDashboardPreview, GuestRequestsPreview } from "@/components/common/GuestWall";

/**
 * ── The backdrop is a PAGE behind glass, not an empty screen (owner, 2026-09-12) ─────────────────
 *
 * *"show the backgroudn state too, it is totally blank now"*, on a shot of `/requests` signed out.
 * He was right: five circles, one bar and four blank rectangles at 60% opacity under a 3px blur came
 * out as a few grey ghosts, and the whole argument of this wall is the shape of the page behind it.
 *
 * ⚠️ **This REFINES the 2026-09-06 ruling, it does not reverse it.** That ruling is that the backdrop
 * is the page's own SKELETON and never invented data — *"rendering plausible-looking rows of
 * somebody's business behind a blur would be inventing a dashboard he does not have"* — and it
 * stands. What changed is DENSITY: the real bands, with the furniture that is inside them. Every
 * element is still a `Skeleton`, and the last two cases here are what keep it that way.
 *
 * ⚠️ jsdom lays out nothing and composites nothing, so the opacity is read off the SOURCE. What is
 * assertable is the rule that decides how much of the page comes through, never the picture.
 */
const SRC = readFileSync("src/components/common/GuestWall.tsx", "utf8");

afterEach(cleanup);

/** The glass: the one element the backdrop is drawn inside. */
const glass = (() => {
  const at = SRC.indexOf('aria-hidden="true"');
  return SRC.slice(SRC.lastIndexOf("<div", at), SRC.indexOf(">", at) + 1);
})();

describe("the glass softens the page rather than erasing it", () => {
  it("is no longer at 60%, which is what made it read as blank", () => {
    expect(glass).not.toMatch(/opacity-60/);
    expect(glass).toMatch(/opacity-\[0\.92\]/);
  });

  it("darkens the backdrop's skeletons one step, so they are a shape and not a ghost", () => {
    // `surface2` is 11 levels off white and vanishes under the blur; `surface3` is the next step on
    // the same ramp. The variant is on the GLASS, so the previews stay ordinary skeletons elsewhere.
    expect(glass).toMatch(/\[&_\.bg-surface2\]:bg-surface3/);
  });

  it("keeps the blur, which is what says «not yours yet»", () => {
    // Raising the blur to compensate for the opacity would put the emptiness back by another route.
    expect(glass).toMatch(/blur-\[3px\]/);
  });

  it("stays decoration: hidden from a reader, unreachable by a mouse", () => {
    expect(glass).toMatch(/aria-hidden="true"/);
    expect(glass).toMatch(/pointer-events-none/);
  });
});

describe("the requests backdrop mirrors the page's own bands", () => {
  const el = () => render(<GuestRequestsPreview />).container;

  it("draws the request rail with a tile per request, captioned", () => {
    // Read by CLASS through a filter, never `querySelector`: `bg-surface3/60` needs the slash
    // escaped for CSS and an unescaped one throws rather than missing, which reads as a real failure.
    const rail = [...el().querySelectorAll("div")].find((d) => /h-\[96px\]/.test(d.className));
    expect(rail).toBeTruthy();
    // The real rail is a 96px band on its own ground, full-bleed, with 56px circles in it.
    expect(rail!.className).toMatch(/bg-surface3\/60/);
    expect(rail!.querySelectorAll(".size-14.rounded-full").length).toBeGreaterThanOrEqual(5);
  });

  it("its tiles are CIRCLES, which they were not until `Skeleton` let a caller set the radius", () => {
    /**
     * 🔴 Tailwind emits `.rounded-sm` after `.rounded-full`, so `Skeleton`'s own base radius beat
     * every caller's and this rail drew six rounded SQUARES behind the glass. `Skeleton` withholds
     * its default when the caller names one now, which is why `rounded-sm` must be absent here.
     */
    const disc = el().querySelector(".size-14")!;
    expect(disc.className).toMatch(/rounded-full/);
    expect(disc.className).not.toMatch(/rounded-sm/);
  });

  it("draws bid cards at the card's OWN width, with their insides", () => {
    const cards = [...el().querySelectorAll("div")].filter((d) => /w-\[344px\]/.test(d.className));
    expect(cards.length).toBe(4);
    // A blank rectangle is what this replaces: the head, the rows and the two acts are most of what
    // makes the card recognisable at a glance.
    expect(cards[0].querySelectorAll(".border-t").length).toBeGreaterThanOrEqual(2);
    expect(cards[0].className).toMatch(/flex-col/);
  });
});

describe("the dashboard backdrop has furniture in its boxes too", () => {
  it("the CTA band and the three cards are no longer flat slabs", () => {
    const c = render(<GuestDashboardPreview />).container;
    const band = [...c.querySelectorAll("div")].find((d) => /h-\[132px\]/.test(d.className))!;
    expect(band.querySelectorAll("span, div").length).toBeGreaterThan(1);
    const cards = [...c.querySelectorAll("div")].filter((d) => /h-\[168px\]/.test(d.className));
    expect(cards.length).toBe(3);
    expect(cards[0].querySelectorAll(".rounded-full").length).toBe(3);
  });
});

describe("it is still a skeleton, which is the 2026-09-06 ruling", () => {
  it("carries no text at all — a guest's page has no names, prices or dates on it", () => {
    for (const c of [render(<GuestRequestsPreview />).container, render(<GuestDashboardPreview />).container]) {
      expect((c.textContent ?? "").trim()).toBe("");
    }
  });

  it("every leaf of the backdrop is a Skeleton, never a rendered row", () => {
    /**
     * The guard against the easy way to make this look better: reaching for `RequestRail` or
     * `BidCards` with invented data. Those draw text, and a leaf with no children and no skeleton
     * class would be the first sign of one arriving.
     */
    const c = render(<GuestRequestsPreview />).container;
    const leaves = [...c.querySelectorAll("*")].filter((n) => n.children.length === 0);
    expect(leaves.length).toBeGreaterThan(20);
    for (const leaf of leaves) expect(leaf.className).toMatch(/animate-pulse/);
  });
});
