import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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
    /**
     * 🔴 **Outlook's and Gmail's own compose chrome** (owner, 2026-09-06: *"use exactly as outlook
     * ui, same colors same icons same background same text etc"*). Twenty-two Microsoft and Google
     * values imitating a window the renter can no longer open. The file's own header already says
     * they must never reach `ds-colors.ts` or `globals.css`, and it carries an `eslint-disable` for
     * the same reason.
     *
     * ⚠️ Exempt as a FILE rather than by value, unlike `BRANDS`: this is a whole foreign palette,
     * not a mark. Twenty-two greys in an allowlist would start matching our own by coincidence.
     *
     * ⚠️ It surfaced on 2026-09-12, when the sweep below started working again — see the note on
     * the match. It was never a new violation; it was simply never looked at.
     */
    "src/components/share/mail-chrome.tsx",
    /**
     * **Mansour, the agent** (owner, 2026-09-13). Four colours: #9AA3AE gear, #6B737E gear edge,
     * #6E7075 body, #f3efea eyes. They are the `Mansour Kit`'s, copied byte for byte from the rig
     * that runs on moedatech.net, and they are deliberately outside this palette - the kit's own
     * README says he is *"grey on purpose so he sits on any brand colour"*.
     *
     * ⚠️ Exempt as a FILE, like the compose chrome and unlike `BRANDS`: he is a DRAWING, and the
     * four values only mean anything together. Tokenising any of them would make this app's agent a
     * different character from the one on the marketing site, and nothing else would say so.
     */
    "src/components/Mansour.tsx",
  ];
  /**
   * Third-party marks. Someone else's brand is not one of our states.
   *
   * ⚠️ The five after WhatsApp's green and the Google Play yellow are GMAIL's envelope, drawn as
   * inline SVG in `src/components/ChannelMark.tsx` (2026-09-12). Allowed BY VALUE rather than by
   * exempting that file, so a house colour smuggled into it still fails: the rule is «this exact
   * brand may paint itself», not «this file may paint anything».
   */
  const BRANDS = new Set(["#25d366", "#ffcd00", "#4285f4", "#34a853", "#fbbc04", "#ea4335", "#c5221f"]);

  /**
   * Black, which on these five lines is not a colour the app PAINTS.
   *
   * ⚠️ All five surfaced on 2026-09-12 when the sweep below started working again, and each is
   * black for a reason the palette has nothing to say about:
   *  · `AuthBrand` (×2) — inside a `mask-image` gradient, where the value is an ALPHA channel:
   *    `#000` there means «fully masked» and never renders as a colour at all.
   *  · `AuthPanel` — the last stop of a scrim ramp whose other four stops are `rgba(0,0,0,…)`,
   *    which this regex does not catch either. A dimming ramp is not a surface.
   *  · `bidFormStyles` — the Google Play badge, black by Google's own brand rules. Same category
   *    as the `#ffcd00` Play mark already above.
   *
   * 🔴 This is NOT a licence for black on a surface of ours. `--navy-deep` is the darkest ground
   * this app paints; a `#000` background on one of our own cards should be caught, and would be,
   * because it would not be one of these two spellings inside a mask, a ramp or a foreign badge.
   */
  const NOT_PAINT = new Set(["#000", "#000000"]);

  it("paints only in tokens", () => {
    const files = execSync('git ls-files "src/**/*.ts" "src/**/*.tsx" "src/**/*.css"', { cwd: ROOT })
      .toString()
      .split(String.fromCharCode(10))
      .map((f) => f.trim())
      .filter((f) => f && !EXEMPT.includes(f))
      /* `git ls-files` reads the INDEX, so a file deleted in the working tree is still listed until
         the deletion is staged — and this sweep then dies on `ENOENT` instead of reporting a colour
         (it did, on 2026-09-09, when `CarryForwardModal.tsx` was removed). Skipping what is not on
         disk keeps the failure about the palette; the deletion is staged either way. */
      .filter((f) => existsSync(resolve(ROOT, f)));
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      /**
       * 🔴 **This regex was DEAD, and took the whole case with it.** It read
       * `/#[0-9a-fA-F]{3,8}<BS>/g` — a literal BACKSPACE character where `\b` was meant — committed
       * in `5a428e61` and never noticed, because a regex that matches nothing makes every file
       * clean. From that commit until 2026-09-12 this case passed on ANY colour in ANY component,
       * so every «palette-drift green» recorded in the change log over that window is vacuous for
       * COMPONENTS. The stylesheet sweep above is a separate matcher and was always live.
       *
       * ⚠️ Repairing it surfaced six pre-existing hits and not one was drift: `mail-chrome.tsx`
       * (exempt above) and the five blacks in `NOT_PAINT`. That is the argument for the repair
       * rather than against it — the rule was right, it simply was not running.
       *
       * ⚠️ Same class as the `RED` → 🔴 corruption this repo already records: an escape written by
       * a script through a layer that interpreted it. Two more survive in the tree and are NOT
       * fixed here — `RequestDetailsModal.tsx:191` (a `\b` in a title-caser, so it title-cases
       * nothing) and `rentee-map-surface.test.ts:597` (a `\b` in a `.not.toMatch`, so that
       * assertion can never fail). Both reported to the owner on 2026-09-12.
       */
      for (const h of src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
        const v = h.toLowerCase();
        if (!BRANDS.has(v) && !NOT_PAINT.has(v)) offenders.push(`${f}: ${h}`);
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
