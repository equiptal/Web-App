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
 * The «Verify» button's whole ELEMENT, and the «Sign in» button beside it.
 *
 * ⚠️ This used to slice the quoted `className` VALUE, and that stopped working the day the button
 * took the design system's own control (2026-09-14): the first quote after `className` now opens
 * `btn("primary", …)`, so the slice returned the word «primary» and three assertions failed against
 * a string that was never the class list. Read the element.
 */
const elementAt = (needle: string) => {
  const at = SRC.indexOf(needle);
  /* ⚠️ Comments STRIPPED. The note above the class list names `h-[22px]` as the thing it removed,
     so an element wide enough to take the prose in fails on its own explanation — the same trap the
     old class-list slice was written to avoid, one level up. */
  return SRC.slice(at, SRC.indexOf("</button>", at)).replace(/\/\*[\s\S]*?\*\//g, "");
};
const pill = elementAt("setVerifyOpen(true)");
const signIn = elementAt("openAuth()");

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

/**
 * ── It is a BUTTON, and the same one as «Sign in» (owner, 2026-09-14) ────────────────────────────
 *
 * *"verify option is not clear as cta"*, then *"i dont want to change the word but the ui"*, then
 * *"even for sign in make it consistent"*.
 *
 * 🔴 It was a hand-rolled 22px pill at 11px type — which is exactly this bar's CHIP shape, and every
 * chip up there (the verified rosette, the tier marks) states a fact and is never pressed. Nothing
 * said «press me» except the colour. It takes the design system's own small primary pill now, which
 * is the control «Sign in» beside it has always used, so the two cannot drift apart again.
 */
describe("the Verify press is the same control as Sign in", () => {
  it("is the design system's button, not a class list of its own", () => {
    expect(pill).toContain('btn("primary", "sm"');
    expect(pill).toContain("pill: true");
  });

  it("wears none of the chip treatment it used to", () => {
    expect(pill).not.toContain("h-[22px]");
    expect(pill).not.toContain("uppercase");
    expect(pill).not.toContain("bg-brand ");
  });

  it("and Sign in asks for exactly the same thing", () => {
    const call = (src: string) => {
      const at = src.indexOf('btn("primary"');
      return src.slice(at, src.indexOf("}", at));
    };
    expect(call(pill).replace("flex-none ", "")).toBe(call(signIn).replace("flex-none ", ""));
  });

  it("carries a glyph, as Sign in does — a fill alone is only a colour", () => {
    expect(pill).toContain("<Icon");
    expect(signIn).toContain("<Icon");
  });
});
