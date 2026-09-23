import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * ── The type is the token file's type, and it stays that way (owner, 2026-09-10) ────────────────
 * *"apply it, and make sure to register it as part of the web design system so any further changes
 * will follow and use it"*.
 *
 * `docs/design-tokens.md` names three faces — **Inter** (Latin), **Almarai** (Arabic), **JetBrains
 * Mono** (data codes only) — and `globals.css` binds them as `--font-sans` / `--font-arabic` /
 * `--font-mono` / `--font-mono-data`. Between 2026-09-04 and 2026-09-10 all of that was true and
 * NONE of it reached a screen: `body` went on declaring `"Segoe UI", system-ui, …`, which beats
 * anything preflight puts on `html`, so the app downloaded Inter on every load and rendered in the
 * system face anyway. Nothing failed. Nothing could — the colour guard next door reads colours.
 *
 * This is the guard that would have caught it, in two halves:
 *   1. `body` must resolve its face THROUGH the token, so the file is what decides it.
 *   2. No stylesheet may name a font family of its own, so a new screen inherits rather than picks.
 *
 * Sibling of `palette-drift.test.ts`, and it exempts the same shape of thing for the same reason:
 * a surface that renders where this app's `:root` does not exist.
 */

/** Everything the guard reads: the app's own stylesheets and the TS files that carry CSS. */
function sourceFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "src"], { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.(css|ts|tsx)$/.test(f));
  // A working-tree deletion is still in the index (the `palette-drift` trap, 2026-09-09).
  return out.filter((f) => existsSync(f));
}

/**
 * ── Exempt, each for a stated reason ────────────────────────────────────────────────────────────
 *
 * These four render where this app's `:root` DOES NOT EXIST, so `var(--font-sans)` there resolves to
 * nothing and the text falls to the browser's default — the very failure this guard exists to stop:
 *
 *  · `quotation/render.ts` — a standalone document written into a blank `window.open`, printed or
 *    saved. It carries `DS_ROOT_CSS` for colour, but the FONT variables point at `next/font` faces
 *    that only exist on this app's `<body>`; a blank window has neither the variable nor the file.
 *  · `export/compare-sheet.ts` — the printed comparison, same window, same reason.
 *  · `bidCardHtml.ts` / `inviteCardHtml.ts` / `copyShareMessage.ts` — pasted into Gmail, Outlook or
 *    Word, which supply their own document and will never have Inter.
 *
 * Each must still name a real system stack rather than one family, which the second case checks.
 */
const STANDALONE = [
  "src/lib/quotation/render.ts",
  "src/lib/export/compare-sheet.ts",
  "src/lib/bidCardHtml.ts",
  "src/lib/inviteCardHtml.ts",
  "src/lib/copyShareMessage.ts",
];

/** `globals.css` DEFINES the stacks, so it is the one file allowed to write a family name. */
const DEFINER = "src/app/globals.css";

/** Icon fonts are a glyph set, not a typeface: `Material Icons Outlined` is how the icon renders. */
const ICON_FAMILY = /material (icons|symbols)/i;

/** Strip comments so a family named inside one is not read as a declaration. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the Latin face is the token file's face, on every screen", () => {
  it("resolves `body`'s family THROUGH the token, never by naming a family", () => {
    const css = readFileSync(DEFINER, "utf8");
    const body = css.slice(css.indexOf("\nbody {"), css.indexOf("\nbody {") + 1400);
    expect(body).toContain("font-family: var(--font-sans)");
    // The exact declaration that made Inter a download nobody saw.
    expect(body).not.toMatch(/font-family:\s*"Segoe UI"/);
  });

  it("keeps the Arabic body rule pointing at Almarai, which never drifted", () => {
    const css = readFileSync(DEFINER, "utf8");
    expect(css).toMatch(/:lang\(ar\) body[\s\S]{0,120}var\(--font-almarai\)/);
  });

  it("defines all four stacks from the three faces the token file names", () => {
    const css = readFileSync(DEFINER, "utf8");
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    expect(css).toMatch(/--font-arabic:\s*var\(--font-almarai\)/);
    // «resolves to TEXT faces on purpose» — the token file's own words.
    expect(css).toMatch(/--font-mono:\s*var\(--font-inter\)/);
    expect(css).toMatch(/--font-mono-data:\s*var\(--font-jetbrains-mono\)/);
  });
});

describe("no screen picks a typeface of its own", () => {
  it("names no font family outside the file that defines them", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      if (file === DEFINER || STANDALONE.includes(file)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/font-family\s*:\s*([^;}\n]+)/g)) {
        const value = m[1].trim();
        if (value.includes("var(--font")) continue;
        if (value === "inherit") continue; // inherits the body's face, which is the token's
        if (ICON_FAMILY.test(value)) continue;
        offenders.push(`${file}: ${value}`);
      }
    }
    expect(offenders, `Use a token — var(--font-sans) / --font-arabic / --font-mono / --font-mono-data.\n${offenders.join("\n")}`).toEqual([]);
  });

  it("lets a STANDALONE document name families, because it renders where :root does not", () => {
    for (const file of STANDALONE) {
      const src = readFileSync(file, "utf8");
      const decls = [...src.matchAll(/font-family\s*:\s*([^;}\n"']*(?:["'][^"']*["'][^;}\n]*)*)/g)].map((m) => m[1]);
      if (decls.length === 0) continue;
      // A stack, never one family: the reader may have neither Inter nor Segoe UI.
      for (const d of decls) {
        if (ICON_FAMILY.test(d)) continue;
        expect(d, `${file} — a standalone document must name a STACK, not one family: ${d}`).toMatch(/,/);
      }
    }
  });
});
