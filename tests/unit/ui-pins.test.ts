/**
 * **The pin registry, the code and the two tables cannot drift** (owner, 2026-09-08: *"make sure the
 * pins are detailed and fined not general and make sure all new elements created on web are added
 * with pins"*).
 *
 * Pins are how a note becomes an edit: «thinner on 48.2» names one element in one file, where "the
 * price footer link" names a search. That only holds while three things agree — the registry, the
 * components that spread `pin()`, and `docs/ui-pins.md` / `docs/ui-surface-map.md`. Nothing checked
 * that before, and all three had drifted: the doc said its table was generated and no script
 * generated it.
 *
 * Five rules, and each of them is a mistake that has already happened somewhere in this repo:
 *
 *  1. **Every registry entry is actually spread on an element.** A pin nobody uses is a number the
 *     overlay never draws, so a note quoting it points at nothing.
 *  2. **Numbers are unique.** Two entries on one number means the reverse lookup (`PIN_BY_NUMBER`)
 *     silently keeps one of them.
 *  3. **A part's parent exists.** `47.3` with no `47` is a number with no surface to hang on.
 *  4. **At most two levels.** Level 3 is found by walking the DOM at read time (see
 *     `docs/ui-pins.md`); a written `47.3.2` would be a DOM position frozen into a registry.
 *  5. **The tables are current.** Enforced by running the generator in `--check` mode, so the test
 *     and the script cannot disagree about what "current" means.
 *
 * It does NOT try to prove that every surface in the app has a pin — that is not decidable from the
 * source, and a test that guessed would fail on every fragment-rooted component. What keeps that
 * honest is the rule in `/web:change`: a batch that adds an element adds its pin, and this file is
 * what catches the half-done version of that.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PIN_REGISTRY, pinDepth, pinOrder } from "@/lib/uiPins";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const entries = Object.entries(PIN_REGISTRY).map(([id, e]) => ({ id, ...e }));

/** Every `.tsx` under `src/`, read once — the sweep below asks the same question of all of them. */
const sources = (() => {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readDir(dir)) {
      const full = `${dir}/${name}`;
      if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push({ path: full, text: read(full) });
      else if (!name.includes(".")) walk(full);
    }
  };
  walk("src");
  return out;
})();

function readDir(dir: string): string[] {
  // `node:fs` only — the repo has no glob dependency and this walk is 40 lines cheaper than one.
  return readdirSync(resolve(ROOT, dir));
}

describe("every pin in the registry is really on an element", () => {
  it("finds a `pin(\"id\")` — or a hand-written registry read — for each one", () => {
    const unused = entries
      .filter((e) => {
        const needle = `pin("${e.id}")`;
        // The marker writes its attribute by hand from the registry: a Leaflet `divIcon` is an HTML
        // string, so there is no element to spread onto (`MapCanvas`).
        const byHand = `PIN_REGISTRY["${e.id}"]`;
        return !sources.some((s) => s.text.includes(needle) || s.text.includes(byHand));
      })
      .map((e) => `${e.n} ${e.id}`);
    expect(unused, "registry entries nothing spreads — delete them or pin the element").toEqual([]);
  });

  it("names a file that exists, and the pin is IN that file", () => {
    const wrong: string[] = [];
    for (const e of entries) {
      const text = sources.find((s) => s.path === e.file)?.text;
      if (text == null) { wrong.push(`${e.n} → missing file ${e.file}`); continue; }
      if (!text.includes(`pin("${e.id}")`) && !text.includes(`PIN_REGISTRY["${e.id}"]`)) {
        wrong.push(`${e.n} ${e.id} → not in ${e.file}`);
      }
    }
    // The `file` column is what a note is resolved through. A row pointing at the wrong file sends
    // the next reader to the wrong place, which is worse than no row at all.
    expect(wrong).toEqual([]);
  });
});

describe("the numbers themselves", () => {
  it("are unique", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const e of entries) {
      const prev = seen.get(e.n);
      if (prev) clashes.push(`${e.n}: ${prev} and ${e.id}`);
      else seen.set(e.n, e.id);
    }
    expect(clashes).toEqual([]);
  });

  it("never go past two levels — level 3 is a DOM position, not a name", () => {
    expect(entries.filter((e) => pinDepth(e.n) > 2).map((e) => String(e.n))).toEqual([]);
  });

  it("hang a part under a surface that exists", () => {
    const numbers = new Set<string>(entries.map((e) => e.n));
    const orphans = entries
      .filter((e) => pinDepth(e.n) === 2 && !numbers.has(e.n.split(".")[0]))
      .map((e) => `${e.n} (${e.id})`);
    expect(orphans, "a part number with no parent surface").toEqual([]);
  });

  it("sort segment by segment, so 47.10 comes after 47.9", () => {
    // The overlay lists pins in this order; string order puts "47.10" before "47.9".
    // The literals are cast because `pinOrder` takes a NUMBER off the registry's own union, and
    // "47.10" is deliberately not in it — the point is that the comparator handles a number the
    // registry does not have yet.
    expect(pinOrder("47.10" as never, "47.9" as never)).toBeGreaterThan(0);
    expect(pinOrder("47" as never, "47.1" as never)).toBeLessThan(0);
  });
});

describe("the generated tables are current", () => {
  it("matches `docs/ui-pins.md` and `docs/ui-surface-map.md`", () => {
    /* Runs the generator rather than re-implementing it: a test with its own copy of the format is a
       second answer to "what should the table say", and the two drift the moment either changes.
       The failure message names the command that fixes it. */
    let out = "";
    try {
      out = execFileSync(process.execPath, ["scripts/ui-pins-doc.mjs", "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(`${e.stderr ?? ""}${e.stdout ?? ""}`.trim() || String(err));
    }
    expect(out).toContain("both tables current");
  });
});
