import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { Mansour } from "@/components/Mansour";

/**
 * ── Mansour, the agent, in this app (owner, 2026-09-13) ─────────────────────────────────────────
 *
 * *"can u use this mansour kit that represent the agent, use it in the processing and use it here
 * for typing when u select a project and it auto fills the equipment name, make it like this
 * mansour is writing it"*.
 *
 * He is a VENDORED rig: the SVG path and the stylesheet are the `Mansour Kit`'s, byte for byte,
 * and that kit is what runs on moedatech.net. So most of what is worth pinning here is not a
 * design decision of ours - it is the set of things that silently break him. Each case below is one
 * of the kit README's own rules.
 */
const SVG = readFileSync("src/components/Mansour.tsx", "utf8");
const CSS = readFileSync("src/components/mansour.css", "utf8");
const PROCESSING = readFileSync("src/components/screens/Processing.tsx", "utf8");
const INTAKE = readFileSync("src/components/screens/Intake.tsx", "utf8");
/* The typewriter moved to the RAIL with the site strip (owner, 2026-09-16); `ProjectChips`
   is deleted. Who raises the flag changed; the rule that it must be lowered did not. */
const CHIPS = readFileSync("src/components/create/RequestsRail.tsx", "utf8");

afterEach(cleanup);

const draw = (p: Parameters<typeof Mansour>[0] = {}) => render(<Mansour {...p} />).container;

describe("the rig's own rules, which are what break him", () => {
  it("the SVG is INLINE, never an <img>", () => {
    // The kit: an `<img>` sandboxes the document, so none of the CSS animations reach the eyes.
    const c = draw();
    expect(c.querySelector("svg")).toBeTruthy();
    expect(c.querySelector("img")).toBeNull();
  });

  it("wears the wrapper the stylesheet expects, with the `v4m-` prefix unrenamed", () => {
    // The prefix is shared by the markup and the stylesheet. Rename it in both or in neither.
    const c = draw();
    expect(c.querySelector(".v4m-man")).toBeTruthy();
    expect(c.querySelector(".v4m-man-in")).toBeTruthy();
    expect(c.querySelector(".v4m-man-svg")).toBeTruthy();
    expect(c.querySelector(".v4m-man-body")).toBeTruthy();
    expect(c.querySelectorAll(".v4m-eye").length).toBe(2);
    expect(c.querySelectorAll(".v4m-lid").length).toBe(2);
  });

  it("is hidden from a screen reader: he is decoration", () => {
    expect(draw().querySelector(".v4m-man")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps `overflow: visible` on the svg, or the gear teeth are clipped", () => {
    // The sway rotates the whole body and the teeth leave the 120x120 box.
    expect(CSS).toMatch(/\.v4m-man-svg\s*\{[^}]*overflow:\s*visible/);
  });

  it("keeps both `transform-box` lines, or the eyes rotate about the wrong point", () => {
    // Without these the origin is the bbox centre and every pose matrix stops meaning what the
    // SVG's own attribute meant.
    expect(CSS).toMatch(/\.v4m-eye\{transform-box:view-box;transform-origin:0 0\}/);
    expect(CSS).toMatch(/\.v4m-lid\{transform-box:fill-box;transform-origin:50% 50%\}/);
  });

  it("stops every animation under reduced motion", () => {
    expect(CSS).toMatch(/prefers-reduced-motion/);
  });

  it("the eyes' REST matrices are the ones the gaze keyframes start and end on", () => {
    /**
     * The markup sets the rest pose as a `transform` attribute and `v4mGaze0` / `v4mGaze1` open and
     * close on the same matrices. Change one and he jumps at the loop point, once every nine
     * seconds — which nobody would ever catch in review.
     */
    const eye0 = "matrix(0.887, -0.318, 0.42, 0.855, 67.182, 54.457)";
    const eye1 = "matrix(0.664, -0.063, 0.42, 0.855, 83.49, 50.456)";
    expect(SVG).toContain(eye0);
    expect(SVG).toContain(eye1);
    expect(CSS).toContain(`0%{transform:${eye0}}`);
    expect(CSS).toContain(`100%{transform:${eye0}}`);
    expect(CSS).toContain(`0%{transform:${eye1}}`);
    expect(CSS).toContain(`100%{transform:${eye1}}`);
  });
});

describe("his three states, and his size", () => {
  it("no state is the plain idle rig", () => {
    expect(draw().querySelector(".v4m-man")?.className).toBe("v4m-man");
  });

  it.each(["live", "waiting", "aiming"] as const)("`%s` becomes the class the stylesheet reads", (s) => {
    const c = draw({ state: s });
    expect(c.querySelector(".v4m-man")?.className).toContain(`is-${s}`);
    expect(CSS).toContain(`.v4m-man.is-${s}`);
  });

  it("is sized on the wrapper, which is what the stylesheet says to size", () => {
    const el = draw({ size: 56 }).querySelector<HTMLElement>(".v4m-man")!;
    expect(el.style.width).toBe("56px");
    expect(el.style.height).toBe("56px");
  });
});

describe("where he is used", () => {
  it("the processing screen falls back to HIM, never to a machine glyph", () => {
    /**
     * ~~`precision_manufacturing`.~~ A generic equipment icon on the one screen whose subject is the
     * AGENT: it said «equipment» where the honest word was «him».
     *
     * ⚠️ He is the FALLBACK now, not the default: since 2026-09-13 the ring holds the catalogue's
     * own drawing of a real machine, and he takes it only when there is no drawing to hold — an
     * off-catalogue line, or a taxonomy that failed to load.
     */
    expect(PROCESSING).toMatch(/<Mansour size=\{72\} state="live" \/>/);
    // ⚠️ The ELEMENT, not the word: the note above that line still names the glyph it replaced, so
    // a bare search would fail on the file's own explanation of itself.
    expect(PROCESSING).not.toMatch(/<Icon name="precision_manufacturing"/);
  });

  it("and keeps the corner whenever the ring holds a machine", () => {
    // The machine is the subject and he is the one who found it — the slot the old screen's «it is
    // running» dot used to hold, now saying WHO as well as whether.
    expect(PROCESSING).toMatch(/<Mansour size=\{30\} state="live" \/>/);
  });

  it("the intake seats him BEFORE the question, on the heading's own line", () => {
    /**
     * Owner, 2026-09-13: *"put mansour before the question"*. ~~On his own line above it~~, where he
     * was a mark floating over a page rather than the one asking. He is inside the `<h1>` now, so
     * the pair centres as one object and mirrors in Arabic for free - «before» is the leading edge,
     * which is the right in an RTL page.
     */
    const at = INTAKE.indexOf("t.intake.heading");
    const h1 = INTAKE.slice(INTAKE.lastIndexOf("<h1", at), at);
    expect(h1).toMatch(/<Mansour size=\{44\} state="waiting"/);
    // `flex-none` so he never squeezes when the question wraps on a phone.
    expect(h1).toMatch(/flex-none/);
  });

  /** The body of `place`, sliced once: four cases read it, and four `indexOf` calls is four
   *  chances for one of them to slice nothing and pass vacuously. */
  const placeBody = () => {
    const at = INTAKE.indexOf("const place = useCallback");
    expect(at).toBeGreaterThan(-1);
    const end = INTAKE.indexOf("}, [state.text]);", at);
    expect(end).toBeGreaterThan(at);
    return INTAKE.slice(at, end);
  };

  /* 🔴 HE IS THE CARET (owner, 2026-09-22: *"can u show this mansour icon as our cursor when typing
     in the text box"*). ~~A PERCH on the box's trailing corner, drawn only while `agentTyping`.~~ */
  it("rides the insertion point, for whoever is writing", () => {
    expect(INTAKE).toMatch(/\{caret && \(/);
    expect(INTAKE).toMatch(/<Mansour size=\{MANSOUR_CARET\} state="live" \/>/);
    expect(INTAKE).toMatch(/const MANSOUR_CARET = 22;/);
    // Not gated on the agent any more: the reference picture is a sentence the RENTER typed.
    const at = INTAKE.indexOf("{caret && (");
    expect(INTAKE.slice(at, at + 400)).not.toMatch(/agentTyping/);
  });

  /* 🔴 He stands BESIDE the character, never on it: centred on the insertion point his disc covered
     the character just typed, which is the one the renter is looking at.

     🔴 And the side is decided by the RUN, not by the page. ~~The container's `direction`.~~ An English
     sentence typed into the Arabic build is an LTR run inside an RTL box, and signing the gap by the
     box put him straight back on top of the last word - the same overlap from the other side. A
     NEUTRAL character carries no direction of its own, and that is the one case the container answers. */
  it("keeps clear of the letter just typed, in either script", () => {
    const body = placeBody();
    expect(body).toMatch(/const gap = MANSOUR_CARET \/ 2 \+ 3;/);
    expect(body).toMatch(/RTL_LETTER\.test\(ch\)/);
    expect(body).toMatch(/LTR_LETTER\.test\(ch\)/);
    // The container decides ONLY when the character is neutral - it is the fallback arm, never the test.
    expect(body).toMatch(/: getComputedStyle\(box\)\.direction === "rtl"/);
  });

  /* ⚠️ A caret that follows a SPACE is measured against the character AFTER it, so he stands in the
     gap between two words rather than on one - and so a SOFT WRAP puts him at the start of the new
     line instead of stranding him at the end of the line above. */
  it("stands in the space rather than on the word, and follows a wrap", () => {
    const body = placeBody();
    expect(body).toMatch(/const useNext = \(prev === "" \|\| \/\\s\/\.test\(prev\)\) && at < state\.text\.length;/);
  });

  /* ⚠️ His CENTRE lands on the measured point. Anchored by a corner he sits low and to the right of
     every letter, which reads as a mark that has not caught up - the kit's own «he drifted while you
     typed» complaint, arrived at by geometry instead of by lag. */
  it("centres on the caret rather than hanging off it", () => {
    const at = INTAKE.indexOf("{caret && (");
    expect(INTAKE.slice(at, at + 400)).toMatch(/translate\(-50%, -50%\)/);
  });

  /* 🔴 **The bar STANDS BESIDE him** (owner, 2026-09-22, reversing his own pick of that morning:
     *"i want it both the agent icon and the cursor beside each other"*). ~~`caret-transparent`, with
     him as the only insertion point.~~ A 22px mark cannot stand in a 4px word gap, so mid-sentence he
     covered the letter beside him and nothing said where the next character would land. The bar is
     the precise point, he is the agent standing at it, and `gap` is what holds them apart. */
  it("keeps the native caret, with him beside it", () => {
    /* ⚠️ The CLASS ATTRIBUTE, not the file: the strike-through above names the withdrawn class
       while saying it must not be there, and a bare `not.toMatch` fails on its own explanation.
       Sixth time in this repo. */
    const cls = INTAKE.slice(INTAKE.indexOf("${FIELD_TEXT} relative w-full"));
    expect(cls.slice(0, cls.indexOf("`}"))).toMatch(/caret-navy/);
    expect(cls.slice(0, cls.indexOf("`}"))).not.toMatch(/caret-transparent/);
    // The one number that keeps him off both the letter and the bar.
    expect(placeBody()).toMatch(/const gap = MANSOUR_CARET \/ 2 \+ 3;/);
  });

  /* ⚠️ Measured with a `Range` over the MIRROR, never with a span injected into it: the mirror wraps
     on `break-words`, and a zero-width inline-block between two letters is a break opportunity the
     textarea does not have - the two copies would then wrap differently, which is the double-vision
     this whole technique fails as. */
  it("measures the caret without adding anything to the mirror", () => {
    expect(INTAKE).toMatch(/document\.createRange\(\)/);
    expect(INTAKE).toMatch(/createTreeWalker/);
    const body = placeBody();
    expect(body).not.toMatch(/appendChild|insertBefore/);
  });

  /* ⚠️ `onSelect` fires for a caret MOVE, not only for a selection. Without it he follows typing and
     then stays behind the moment the renter goes back to fix a word. */
  it("follows the caret when it is moved rather than typed", () => {
    expect(INTAKE).toMatch(/onSelect=\{place\}/);
    expect(INTAKE).toMatch(/onFocus=\{place\}/);
  });

  /* A LAYOUT effect: he is placed in the same frame as the character that moved him. A passive one
     paints him a frame late, which is the drift by another name. */
  it("places him in the same frame, and never eases toward it", () => {
    expect(INTAKE).toMatch(/useLayoutEffect\(\(\) => \{\s*place\(\);/);
    const at = INTAKE.indexOf("{caret && (");
    expect(INTAKE.slice(at, at + 400)).not.toMatch(/transition/);
  });

  it("he cannot swallow a click on the field he stands over", () => {
    // He sits above a textarea the renter may be typing in. A decoration that eats the caret is
    // worse than no decoration.
    const at = INTAKE.indexOf("{caret && (");
    expect(INTAKE.slice(at, at + 400)).toMatch(/pointer-events-none/);
  });

  it("the typewriter raises and LOWERS the flag, whatever happens", () => {
    // In a `finally`: a throw mid-write must not leave him standing on the box forever.
    expect(CHIPS).toMatch(/setAgentTyping\(true\)/);
    expect(CHIPS).toMatch(/finally \{\s*actions\.setAgentTyping\(false\);/);
  });
});
