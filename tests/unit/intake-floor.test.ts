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
    expect(intake).not.toContain("{t.intake.uploadRfq}\n");
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

describe("the sites are named on the same row", () => {
  it("Given the strip, Then the sentence sits beside the pills", () => {
    expect(intake).toContain("t.projects.chips.pick");
    const sentence = intake.indexOf("t.projects.chips.pick");
    const pills = intake.indexOf("<ProjectChips />");
    // 🔴 Beside them, and BEFORE them: it is the question the pills answer.
    expect(sentence).toBeGreaterThan(-1);
    expect(pills).toBeGreaterThan(sentence);
  });

  it("Given both locales, Then the sentence exists in each", () => {
    expect(en.projects.chips.pick).toBeTruthy();
    expect(ar.projects.chips.pick).toBeTruthy();
    expect(ar.projects.chips.pick).not.toBe(en.projects.chips.pick);
  });

  it("Given the row, Then the controls are pushed to the trailing edge", () => {
    // ⚠️ `ms-auto`, not `ml-auto`: this screen mirrors, and the controls belong on the side the
    // renter reads to, which is the right in English and the left in Arabic.
    expect(intake).toContain('className="ms-auto flex flex-none items-center gap-2"');
  });
});

/**
 * ── The controls are a CHIP tall, and they ride the last row (owner, 2026-09-12) ────────────────
 *
 * *"make the buttons on the same size of the project pills … also consider if many projects exist,
 * how the ui will be? the buttons must be on the last row always"*.
 *
 * **26px, measured rather than chosen.** A chip is `px-3 py-1 text-label` inside a hairline:
 * 16.5px line box (11px × the body's 1.5) + 8px padding + 1.6px border = 26.1px — and the same in
 * Arabic, because that line box is a RATIO of the font size and not of the face. Verified in a
 * browser at both locales before the number was written down. The circles had been 40px, half again
 * as tall as the row they sit on.
 *
 * 🔴 **The cost is on the record: 26px is under the house's 44px target**, the same fault logged
 * against a dozen icon-only controls on 2026-09-08. «The same size as the pills» is what was asked
 * for, and the alternative is the 40px circle beside a 26px chip that was reported.
 */
describe("the floor's controls match the pills", () => {
  const controls = intake.slice(intake.indexOf('className="ms-auto'));

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

  it("Given many sites, Then the wrapper keeps the controls on the LAST row", () => {
    /**
     * `items-end` is the whole mechanism, and it is what makes this hold as the strip grows: the
     * chips wrap inside their own `flex-1` group, the group gets taller, and the two controls stay
     * pinned to its bottom edge instead of climbing back beside the first row.
     *
     * Checked with twelve sites patched into the live DOM: three rows of chips, both controls on
     * the third, their bottom edge level with the group's to the pixel.
     */
    const row = intake.slice(intake.indexOf("<div className=\"flex flex-wrap items-end"));
    expect(row.slice(0, 120)).toContain("items-end");
    // `flex-none` beside a `min-w-0 flex-1` group is what stops them being pushed to a row of their
    // own while there is still width for them.
    expect(intake).toContain('className="flex min-w-0 flex-1 flex-wrap items-center');
  });

  it("Given the sentence, Then it offers A project rather than claiming one is HIS", () => {
    expect(en.projects.chips.pick).toBe("Select a project");
    expect(en.projects.chips.pick).not.toMatch(/your/i);
  });
});
