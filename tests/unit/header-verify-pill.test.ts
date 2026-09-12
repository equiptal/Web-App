import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ── «Verify» sits BESIDE the face, on one line (owner, 2026-09-12) ──────────────────────────────
 *
 * *"what is this ugly ui"*, on a shot of the orange pill hanging UNDER the avatar and cut in half by
 * the bottom of the 52px bar.
 *
 * 🔴 **A layout fault, not a taste one.** The avatar and the pill are siblings in one wrapper, and
 * that wrapper was `relative flex-none` — a BLOCK. Both children are block-level (the avatar button
 * is `display:flex`), so they stacked, and the bar clipped the second. The component's own comment
 * had been promising *"it sits BESIDE the avatar, not on it"* since the day it was written; the box
 * holding them never said so.
 *
 * The second half is the shouting: `uppercase` + `tracking-[0.05em]` on a solid brand ground, at
 * 11px, on a navy bar where every other mark is white at reduced strength. Sentence case says the
 * same word without reading as an alarm. The FILL stays — this is an action, and the outlined-white
 * treatment belongs to the marks that only state a fact.
 *
 * ⚠️ jsdom lays out nothing and the header needs a session, so this reads the SOURCE. What is
 * assertable is the rule that decides the row, never the row itself.
 */
const SRC = readFileSync("src/components/AppShell.tsx", "utf8");

/** The wrapper holding the avatar and the pill. */
const wrapper = (() => {
  const at = SRC.indexOf("ref={accountBox}");
  return SRC.slice(SRC.lastIndexOf("<div", at), SRC.indexOf(">", at) + 1);
})();

/**
 * The «Verify» button's own class list, and ONLY that.
 *
 * ⚠️ The slice is the quoted `className` VALUE, not the element. The comment above that line names
 * `uppercase` and `tracking-[0.05em]` as the things it removed, so a slice wide enough to take the
 * prose in would fail on its own explanation.
 */
const pill = (() => {
  const from = SRC.indexOf("className", SRC.indexOf("setVerifyOpen(true)"));
  const open = SRC.indexOf('"', from);
  return SRC.slice(open + 1, SRC.indexOf('"', open + 1));
})();

describe("the avatar and the Verify press share a line", () => {
  it("their wrapper is a flex ROW, so the pill cannot drop under the circle", () => {
    expect(wrapper).toMatch(/\bflex\b/);
    expect(wrapper).toMatch(/items-center/);
  });

  it("keeps `relative`, which the verified tick is positioned against", () => {
    // The green tick is `absolute -end-0.5 -bottom-0.5`; without a positioned ancestor it would
    // escape to the header and sit somewhere else entirely.
    expect(wrapper).toMatch(/relative/);
  });
});

describe("the pill is an offer, not an alarm", () => {
  it("does not shout: no uppercase, no extra tracking", () => {
    expect(pill).not.toMatch(/uppercase/);
    expect(pill).not.toMatch(/tracking-\[0\.05em\]/);
  });

  it("keeps the brand fill, because it is the thing to press", () => {
    // The outlined-white treatment is for the marks beside the wordmark, which state a fact and are
    // never pressed. Demoting this to one of those would hide the only route to the form.
    expect(pill).toMatch(/bg-brand\b/);
    expect(pill).toMatch(/hover:bg-brand-press/);
  });

  it("states its own height, so it cannot grow into the bar's edges", () => {
    expect(pill).toMatch(/h-\[22px\]/);
  });
});
