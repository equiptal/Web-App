import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ── The CTA band: the agent speaks the headline, and the paragraph is gone ──────────────────────
 *
 * Owner, 2026-09-16: *"can u redesign the cta and remove its subtext and use this kit as mansour ai
 * agent design, make the cta professional catchy and hd"*.
 *
 * The headline has coloured one word since the comp landed and had nothing standing behind it. He
 * is the product's own face for that word - he writes the renter's equipment line on the intake and
 * holds the processing ring - and the band is the screen before both.
 *
 * ⚠️ These cases read the SOURCE. `CtaBanner` pulls the session, the router, an activity fetch and
 * a start-request gate, and what is under test is a layout and copy ruling: which elements exist,
 * which pose he holds, and that a deleted string is deleted in both languages.
 *
 * 🔴 **Three of these pin faults found in a BROWSER, not here.** Each one reads correctly in the
 * source and renders wrong, which is exactly why they are written down rather than trusted to a
 * comment: a display utility that loses to its own base class, a halo painted under the band's
 * overlays, and a halo collapsed to nothing by its parent's alignment.
 */
const CTA = readFileSync("src/components/home/CtaBanner.tsx", "utf8");
const MAN = readFileSync("src/components/Mansour.tsx", "utf8");
const EN = readFileSync("src/lib/i18n/en.ts", "utf8");
const AR = readFileSync("src/lib/i18n/ar.ts", "utf8");

/** The wrapper he is drawn inside: from the `<div` that opens it to the `<Mansour` itself. */
const agentBlock = () => {
  const at = CTA.indexOf("<Mansour");
  expect(at).toBeGreaterThan(-1);
  const raw = CTA.slice(CTA.lastIndexOf("<div", at), at);
  /**
   * 🔴 **The JSX comments are stripped, and that is not tidiness.** The note above the halo names
   * `-z-10` three times while saying it must never be used, so a `not.toMatch` over the raw slice
   * fails on its own explanation. This repo has hit that twice before (`basis-[34rem]`,
   * `object-contain`). Assert on the CODE; the prose is free to quote what it forbids.
   */
  return raw.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
};

describe("the subtext", () => {
  it("is not rendered, and the key is gone from BOTH dictionaries", () => {
    // `brand-spelling` walks the two in step, so a key removed from one and left in the other is a
    // parity failure waiting to happen. Both, or neither.
    expect(CTA).not.toMatch(/t\.home\.ctaSubtitle/);
    expect(EN).not.toMatch(/ctaSubtitle:/);
    expect(AR).not.toMatch(/ctaSubtitle:/);
  });

  it("the headline it restated is untouched, AI still its own token", () => {
    // What went is the paragraph, never the sentence: the coloured word is the whole argument of
    // this band, and it is what the agent in front of it now answers to.
    expect(CTA).toMatch(/\{t\.home\.ctaTitleBefore\}/);
    expect(CTA).toMatch(/<span className="text-brand">\{t\.home\.ctaTitleAi\}<\/span>/);
  });
});

describe("the agent", () => {
  it("is drawn on the band, at the band's own scale", () => {
    expect(CTA).toMatch(/import \{ Mansour \} from "@\/components\/Mansour";/);
    expect(CTA).toMatch(/<Mansour size=\{104\} pose="viewer" \/>/);
  });

  it("LEADS the sentence rather than standing beside the button", () => {
    /**
     * 🔴 He was first put between the copy and the button, and it was wrong - seen in the browser,
     * not argued. Out there the photograph is at its busiest, the ink gradient at its thinnest
     * (42% navy against 94% on the leading edge), and standing next to a control he does not belong
     * to he read as a stray grey icon. In front of the sentence he is its speaker, which is the
     * pattern the intake already uses (*"put mansour before the question"*, 2026-09-13).
     */
    expect(CTA.indexOf("<Mansour")).toBeLessThan(CTA.indexOf("t.home.ctaTitleBefore"));
  });

  it("holds the VIEWER pose, never `send`", () => {
    /**
     * 🔴 `send` is the kit's «looks down at a button» pose and is the obvious choice here. It is
     * wrong twice: the button is across the band, and that row MIRRORS in Arabic while the pose
     * matrices do not - he would meet it in English and stare into the margin in Arabic.
     */
    expect(CTA).not.toMatch(/pose="send"/);
  });

  it("is decoration, and stands down where the row has no room for it", () => {
    /**
     * 🔴 `hidden sm:block` would draw NOTHING at any width, which is the bug this band shipped with
     * for one pass: both are the `display` property, a media query adds no specificity, and Tailwind
     * emits `hidden` last, so the base class wins at every size. One variant over a plain block has
     * no ordering to lose.
     */
    const block = agentBlock();
    expect(block).toMatch(/aria-hidden="true"/);
    expect(block).toMatch(/max-sm:hidden/);
    expect(block).not.toMatch(/(^|\s)hidden\s[^"]*sm:(block|grid|flex)/);
  });

  it("its box does not ALIGN its children, or the halo collapses", () => {
    /**
     * 🔴 It was `grid place-items-center`, and the halo measured 0x0 in the browser:
     * `place-items-center` sets `justify-self` / `align-self` on every grid child INCLUDING an
     * absolutely-positioned one, which shrinks it to its own content - and a decorative span has
     * none. Nothing needs centring anyway; the box and he are the same 104px.
     */
    expect(agentBlock()).not.toMatch(/place-items-center/);
  });

  it("nothing around him clips the gear teeth", () => {
    /**
     * ⚠️ The kit keeps `overflow: visible` on the svg because the sway rotates the whole body and
     * the teeth leave the 120x120 box. The BAND is `overflow-hidden`, so he sits inside its reading
     * gutter; a wrapper of his own that clipped would take the teeth off on every sway.
     */
    expect(agentBlock()).not.toMatch(/overflow-hidden/);
  });

  it("the halo is the BAND's own orange, and is NOT pushed behind its overlays", () => {
    /**
     * He is grey by the kit's rule (*"grey on purpose so he sits on any brand colour"*), which on a
     * navy band leaves nothing separating him from the ink - so the halo is figure-and-ground, not
     * decoration, and it is the same orange as the word beside him and the button opposite.
     *
     * 🔴 It carried `-z-10` at first and was invisible: the band draws its two gradients and its
     * multiply at that exact depth, so the halo painted UNDER them. Nothing here needs a z-index -
     * the halo is absolute and he comes after it in source order.
     */
    const block = agentBlock();
    expect(block).toMatch(/radial-gradient\(circle, color-mix\(in srgb, var\(--brand\) 30%/);
    expect(block).not.toMatch(/-z-10/);
  });
});

describe("the poses are the kit's, to the digit", () => {
  it("`viewer` and `rest` are `mansour-poses.json` verbatim", () => {
    /**
     * ⚠️ Written out as literals because the kit lives OUTSIDE this repo
     * (`~/Desktop/Mansour Kit/mansour-poses.json`) and a test may not reach for it. There is no
     * formula to re-derive them from: a digit out puts his eyes somewhere on his cheek.
     */
    expect(MAN).toMatch(
      /viewer: \["matrix\(0\.964, 0, 0, 1, 49\.871, 70\)", "matrix\(0\.964, 0, 0, 1, 70\.129, 70\)"\]/,
    );
    expect(MAN).toMatch(/"matrix\(0\.887, -0\.318, 0\.42, 0\.855, 67\.182, 54\.457\)"/);
  });

  it("`rest` agrees with the SVG's own attributes, which the keyframes start from", () => {
    // Three copies of one pair: the JSON's `rest`, the two `transform` attributes, and the first
    // and last stops of `v4mGaze0` / `v4mGaze1`. If one moves, all three move or he jumps.
    expect(MAN).toMatch(/transform="matrix\(0\.887, -0\.318, 0\.42, 0\.855, 67\.182, 54\.457\)"/);
    expect(MAN).toMatch(/transform="matrix\(0\.664, -0\.063, 0\.42, 0\.855, 83\.49, 50\.456\)"/);
  });

  it("a held pose stops the idle wander as well as setting the transform", () => {
    /**
     * 🔴 Without `animation: none` the wander goes on running and overrides the inline transform on
     * its very next frame - he snaps to the pose and twitches straight back out of it, once every
     * nine seconds. The kit's own `look()` pauses the animation for exactly this reason.
     */
    expect(MAN).toMatch(/animation: "none" as const/);
    expect(MAN).toMatch(/style=\{held\(0\)\}/);
    expect(MAN).toMatch(/style=\{held\(1\)\}/);
  });

  it("the pose is a STYLE, so the rest attribute survives in the markup", () => {
    // A style beats a presentation attribute, which is what lets the markup keep the rest pose the
    // keyframes are written against. Swapping the attribute instead would break the idle loop for
    // every other caller.
    expect(MAN).not.toMatch(/transform=\{pose/);
  });
});

describe("the suite itself", () => {
  it("carries no control characters, so no assertion is silently vacuous", () => {
    /**
     * 🔴 This file shipped with two DEAD assertions for one pass. A word-boundary escape written
     * through an edit script landed as a literal BACKSPACE (0x08), so the pattern could never match
     * anything and both cases passed on a band that was drawing no agent at all. The repo has
     * recorded this exact trap before (2026-09-12, three source files); it is invisible in every
     * diff, in every editor and in `grep` output, because a backspace erases the character before it
     * on a terminal.
     *
     * ⚠️ The scan is written with `charCodeAt` and NO escape sequences on purpose. Writing the range
     * as a unicode escape in a regex literal is how a second copy of the same corruption gets in: the tools
     * that put this file on disk can expand those escapes into the very characters being hunted.
     */
    const self = readFileSync("tests/unit/cta-banner.test.ts", "utf8");
    const bad: string[] = [];
    for (let i = 0; i < self.length; i++) {
      const c = self.charCodeAt(i);
      // Tab, newline and carriage return are the three that belong in a source file.
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad.push("0x" + c.toString(16) + "@" + i);
    }
    expect(bad, "control characters in this file: " + bad.join(", ")).toEqual([]);
  });
});
