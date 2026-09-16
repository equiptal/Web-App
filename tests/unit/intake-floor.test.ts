import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * The floor of the intake box: his sites on one side, two round controls on the other.
 *
 * Owner, 2026-09-12, on a screenshot of the intake: *"remove the continue button, remove upload,
 * remove this «Add a description or a file». Instead I want a circle icon for + which will be for
 * upload and beside it a circle arrow to send, all on the right; and on the left on the same row the
 * project pills with the sentence «select your project» beside them."*
 *
 * ⚠️ Read from the SOURCE rather than rendered. `Intake` pulls the rfq store, the session, the
 * project list and a file input, and what is under test here is a layout ruling — which controls
 * exist, and where. A render test would mock five things to assert the same two facts.
 */

const SRC = resolve(__dirname, "../../src");
const intake = readFileSync(resolve(SRC, "components/screens/Intake.tsx"), "utf8");

describe("the two round controls replaced two rows", () => {
  it("Given the floor, Then the file button is a + and the send is an arrow", () => {
    // 🔴 Both are round, both are icon-only: what they do is the glyph, not a word beside it.
    expect(intake).toContain('name="add"');
    expect(intake).toContain('name={state.busy ? "hourglass_empty" : "arrow_forward"}');
    expect(intake).toMatch(/rounded-full[^"]*/);
  });

  it("Given the old controls, Then none of them is drawn any more", () => {
    /**
     * ~~«Upload RFQ» on the floor, and a «Continue» button in a row of its own underneath.~~ Two
     * rows for two presses, one of them a full-width word for the act every renter is already
     * reaching for.
     */
    /* ⚠️ As a CHILD, not as an attribute. That string is still `aria-label` and `title` on the
       round +, which is the 2026-09-12 ruling — *"the sentence that stood beside Continue is the
       arrow's own title"* — so a bare `toContain` matches the thing the rule KEPT and fails on it. */
    expect(intake).not.toMatch(/>\s*\{t\.intake\.uploadRfq\}/);
    expect(intake).not.toContain("t.intake.continueLabel}{\" \"}");
    // The `Button` component went with the Continue it drew.
    expect(intake).not.toMatch(/import \{[^}]*\bButton\b[^}]*\} from "@\/components\/ui"/);
  });

  it("Given a disabled send, Then the reason rides the button itself", () => {
    /**
     * ⚠️ The old Continue had a sentence beside it, because a disabled button with nothing near it
     * reads as broken. A round control has no room for one, so `addSomething` is its `title` and its
     * `aria-label` — which says the same thing to the renter who hovers and to a screen reader.
     */
    expect(intake).toContain("t.intake.addSomething");
    expect(intake).toContain("aria-label={canStart");
    expect(intake).toContain("title={canStart");
  });

  it("Given the file button, Then it is named for screen readers", () => {
    // ⚠️ Icon-only. Without this it is announced as «button» and nothing else.
    expect(intake).toContain("aria-label={t.intake.uploadRfq}");
  });
});

describe("the chip strip left the floor", () => {
  /**
   * 🔴 **REVERSES the whole of the 2026-09-12/13 floor** (owner, 2026-09-16, handing over
   * `prototypes/intake-side-panel-v1.html`): *"remove the pills and show a side panel of his
   * requests ... just clicking on a project or a request inside it will show a single pill showing
   * project-request in one line, no other pills, just the selected one"*.
   *
   * What those rulings protected is not lost, it MOVED: every site is still reachable, each with
   * what has already been hired at it, and the press still applies the project's defaults and the
   * template's terms. Only the place the picking happens changed.
   */
  it("Given the floor, Then no chip strip is drawn on it", () => {
    expect(intake).not.toContain("<ProjectChips");
    // The sentence that introduced the strip goes with the strip.
    expect(intake).not.toContain("t.projects.chips.pick");
    /* 🔴 `ProjectChips` is DELETED, not merely unused — `create-canvas-wiring` refuses a canvas
       component nothing imports, and it was right to: this floor was its only caller. Its three
       strings went with it; `label` and `ended` stay, read by the projects board and the move
       dialog. */
    expect("pick" in en.projects.chips).toBe(false);
    expect("pick" in ar.projects.chips).toBe(false);
  });

  it("Given a pick, Then the floor draws the project and its machines", () => {
    /* Owner, 2026-09-16: *"the row of project chips on the floor - but i want it on a project
       selection to appear"*. Nothing until a project is chosen; from then on its own chip with the
       ✕, and a chip per machine filed under it. The markup lives with the rail, because both draw
       the same list and one hook owns it. */
    expect(intake).toContain("<ProjectFloorChips rail={rail} />");
    const railSrc = readFileSync(resolve(SRC, "components/create/RequestsRail.tsx"), "utf8");
    expect(railSrc).toContain('pin("intake-pick-pill")');
    expect(railSrc).toContain("if (!project) return null;");
    expect(railSrc).toContain("rail.clear");
  });

  it("Given the row, Then it holds the pill and the two controls and cannot wrap", () => {
    /**
     * ⚠️ `items-center`, and NO `flex-wrap`. The row holds at most one pill and two 26px
     * controls, so there is nothing left to push onto a second line - and the pill truncates rather
     * than growing the row, which is why that can be promised. The old row wrapped because a strip
     * of eight chips could not do either.
     */
    const row = intake.slice(intake.indexOf('<div className="flex items-center gap-3 px-5 pb-4 pt-1">'));
    expect(row.slice(0, 80)).toContain("items-center");
    expect(intake).not.toContain('className="flex flex-wrap items-end gap-x-4 gap-y-3');
    expect(intake).not.toContain("basis-full");
  });
});

/**
 * ── The controls are a CHIP tall (owner, 2026-09-12) ──────────────────────────────────
 *
 * **26px, measured rather than chosen.** A chip is `px-3 py-1 text-label` inside a hairline:
 * 16.5px line box (11px × the body's 1.5) + 8px padding + 1.6px border = 26.1px — and the same in
 * Arabic, because that line box is a RATIO of the font size and not of the face.
 *
 * 🔴 **The cost is on the record: 26px is under the house's 44px target.**
 *
 * ⚠️ ~~`ms-auto` on the control group.~~ Gone with the strip: the pill's own group is `flex-1`
 * now, so it pushes the controls to the trailing edge by taking the room itself. `ms-auto` on top of
 * that would be a second answer to one question.
 */
describe("the floor's controls match the pills", () => {
  const controls = intake.slice(intake.indexOf('<span className="flex flex-none items-center gap-2">'));

  it("Given either control, Then it is 26px square — the chip's own height", () => {
    const sized = controls.match(/h-\[26px\] w-\[26px\]/g) ?? [];
    expect(sized).toHaveLength(2);
  });

  it("Given the 40px circles, Then neither survives", () => {
    expect(controls).not.toMatch(/h-10 w-10/);
  });

  it("Given a 26px box, Then the glyph inside it is small enough to fit", () => {
    // A 20px icon in a 26px circle leaves 3px a side and reads as a glyph in a collar.
    expect(controls).not.toMatch(/size=\{20\}/);
    expect(controls).toMatch(/size=\{15\}/);
  });

});
