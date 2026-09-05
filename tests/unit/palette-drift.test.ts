import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * **One palette, and no stylesheet keeps a second one** (owner, 2026-09-06: *"I gave you these
 * tokens — why is the web different? Use them for the web design system."*).
 *
 * The tokens had been written into `globals.css` on 2026-09-04 and every hex in `docs/design-tokens.md`
 * was there — yet the app still did not look like Supplier OS, because six prototype stylesheets,
 * written before the token system, carried **330 raw colours of their own**: a different navy
 * (`#16304f` against the token's `#22384e`), a blue (`#2563eb`) the OS palette does not contain at
 * all, and a bluish grey ramp where the OS has a neutral one. A token file cannot be the source of
 * truth while a stylesheet holds its own copy of the answer.
 *
 * This is the guard for that. It reads the stylesheets rather than the rendered page because that is
 * where the drift lives, and because the failure is invisible: nothing throws, no test notices, the
 * screen is merely the wrong colour.
 */

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Every stylesheet that paints a surface. `globals.css` is the palette itself and is exempt. */
const SHEETS = [
  "src/components/map/map-proto.css",
  "src/components/map/panel/panel-proto.css",
  "src/components/map/request-card.css",
  "src/components/deal-room/deal-room-proto.css",
  "src/components/requests/requests-proto.css",
  "src/components/compare/compare-proto.css",
];

/**
 * Colours that are somebody else's property, not a UI state of ours.
 *
 * `#25d366` is WhatsApp's green, on the button that opens WhatsApp. Painting it `--ok` would make it
 * our success green, which is a different claim and a wrong one — the same reason `--gold` (the
 * mark's own colour) is exempt from the palette in `globals.css`.
 */
const ALLOWED = new Set(["#25d366"]);

const hexes = (src: string): string[] =>
  (src.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());

describe("the stylesheets read the palette; they do not carry one", () => {
  for (const sheet of SHEETS) {
    it(`${sheet} names no colour of its own`, () => {
      const own = hexes(read(sheet)).filter((h) => !ALLOWED.has(h));
      expect(own, `${sheet} should use var(--token), not a raw hex`).toEqual([]);
    });
  }

  it("keeps the ask's blue as the ask's blue", () => {
    // RM3-AC-33: the ask is blue and NEVER navy. The OS palette has no true blue — its `info` is a
    // slate in the ink family — so the ask keeps its own token rather than being folded into `--info`
    // by this sweep. If a future tidy-up points `--action` at the slate, this fails first.
    const css = read("src/app/globals.css");
    const action = /--action:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1]?.toLowerCase();
    expect(action).toBe("#1a7ec8");
    expect(read("src/components/map/request-card.css")).toContain("var(--action)");
  });
});

/**
 * The same rule, one layer out: no COMPONENT names a colour either.
 *
 * A stylesheet is the obvious place to keep a private palette; an inline `style={{ color: "#16304f" }}`
 * or a `bg-[#16304f]` is the quiet one. Comments are stripped before the search — half this repo's
 * colour history is written in its comments, and a note about the shade something USED to be is not
 * a shade the app paints.
 */
describe("no component names a colour either", () => {
  const EXEMPT = [
    "src/app/globals.css", // the palette itself
    "src/lib/ds-colors.ts", // the palette, mirrored as literals for the three surfaces with no stylesheet
    "src/components/dev/UiPins.tsx", // a staging-only developer instrument, deliberately anti-palette
  ];
  /** Third-party marks. Someone else's brand is not one of our states. */
  const BRANDS = new Set(["#25d366", "#ffcd00"]);

  it("paints only in tokens", () => {
    const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "src/**/*.css"', { cwd: ROOT })
      .toString()
      .split(String.fromCharCode(10))
      .map((f) => f.trim())
      .filter((f) => f && !EXEMPT.includes(f));
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const h of src.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
        if (!BRANDS.has(h.toLowerCase())) offenders.push(`${f}: ${h}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("every hex the token file states is in the palette", () => {
  it("globals.css carries them all", () => {
    // The doc is the source; `globals.css` is where it binds. A value that drifts here is the whole
    // failure this suite exists for, one level up from the stylesheets.
    const doc = read("docs/design-tokens.md");
    const root = read("src/app/globals.css");
    const stated = [...doc.matchAll(/\|\s*`--color-[a-z0-9-]+`[^|]*\|\s*`?(#[0-9a-fA-F]{6})`?/g)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(stated.length).toBeGreaterThan(60);
    // `--color-ok #15803d` is the OS's own LEGACY alias, and this app's `--ok` takes the current
    // success green instead. It is the one documented value the palette deliberately does not carry.
    const missing = [...new Set(stated)].filter((h) => !root.toLowerCase().includes(h) && h !== "#15803d");
    expect(missing).toEqual([]);
  });
});
