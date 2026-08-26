import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COLORS, CSS_VAR_NAME, DS_ROOT_CSS } from "@/lib/ds-colors";

/**
 * `globals.css` and `ds-colors.ts` hold the same palette twice — the first for the app, the second
 * for the three surfaces that never see a stylesheet (the OG image, the clipboard card, the printed
 * quotation). Duplication that nothing checks is duplication that drifts, so this checks it: change
 * a colour in one and this test names the other.
 */

const GLOBALS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Reads `--token: value;` out of the `:root` block, ignoring the `@theme` aliases below it. */
function rootValues(css: string): Record<string, string> {
  const root = css.slice(css.indexOf(":root {"), css.indexOf("@theme"));
  const out: Record<string, string> = {};
  for (const [, name, value] of root.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

describe("the palette is defined once, in two places that must agree", () => {
  const defined = rootValues(GLOBALS);

  it.each(Object.keys(COLORS) as (keyof typeof COLORS)[])(
    "%s matches its :root value in globals.css",
    (key) => {
      const varName = CSS_VAR_NAME[key];
      expect(defined, `${varName} is not defined in globals.css`).toHaveProperty(varName);
      expect(defined[varName].toLowerCase()).toBe(COLORS[key].toLowerCase());
    },
  );

  it("names every colour :root defines, so nothing is added to one and missed in the other", () => {
    // `:root` also carries sizes, the focus ring and the scrim, which are not colours.
    const colourVars = Object.entries(defined)
      .filter(([, v]) => /^#[0-9a-fA-F]{3,8}$/.test(v))
      .map(([k]) => k);
    const known = new Set(Object.values(CSS_VAR_NAME));
    expect(colourVars.filter((v) => !known.has(v))).toEqual([]);
  });

  it("builds a :root block a standalone document can use", () => {
    expect(DS_ROOT_CSS.startsWith(":root{")).toBe(true);
    expect(DS_ROOT_CSS).toContain("--navy:#1c3550;");
    expect(DS_ROOT_CSS).toContain("--warn:#ed6a5e;");
    // Every token, so a document that prepends this can use any of them.
    for (const varName of Object.values(CSS_VAR_NAME)) {
      expect(DS_ROOT_CSS).toContain(`${varName}:`);
    }
  });
});
