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
const CHIPS = readFileSync("src/components/create/ProjectChips.tsx", "utf8");

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
  it("the processing screen draws HIM, not a machine glyph", () => {
    /**
     * ~~`precision_manufacturing`.~~ A generic equipment icon on the one screen whose subject is the
     * AGENT: it said «equipment» where the honest word was «him».
     */
    expect(PROCESSING).toMatch(/<Mansour size=\{56\} state="live" \/>/);
    // ⚠️ The ELEMENT, not the word: the note above that line still names the glyph it replaced, so
    // a bare search would fail on the file's own explanation of itself.
    expect(PROCESSING).not.toMatch(/<Icon name="precision_manufacturing"/);
  });

  it("and keeps the corner once a machine has a picture", () => {
    // The machine becomes the subject and he becomes the one who found it — the slot the old
    // screen's «it is running» dot used to hold, now saying WHO as well as whether.
    expect(PROCESSING).toMatch(/<Mansour size=\{26\} state="live" \/>/);
  });

  it("the intake perches him on the box while the template is being written", () => {
    expect(INTAKE).toMatch(/state\.agentTyping/);
    expect(INTAKE).toMatch(/<Mansour size=\{34\} state="live" \/>/);
  });

  it("he cannot swallow a click on the field he stands over", () => {
    // He sits above a textarea the renter may be typing in. A decoration that eats the caret is
    // worse than no decoration.
    const at = INTAKE.indexOf("state.agentTyping");
    expect(INTAKE.slice(at, at + 260)).toMatch(/pointer-events-none/);
  });

  it("the typewriter raises and LOWERS the flag, whatever happens", () => {
    // In a `finally`: a throw mid-write must not leave him standing on the box forever.
    expect(CHIPS).toMatch(/setAgentTyping\(true\)/);
    expect(CHIPS).toMatch(/finally \{\s*actions\.setAgentTyping\(false\);/);
  });
});
