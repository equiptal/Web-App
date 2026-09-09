import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The brand is «معداتك», and nothing else.
 *
 * ⚠️ «مويداتك» is a transliteration of the LATIN name (Moeda-tech) back into Arabic, and it had
 * reached twelve shipped strings — «على مويداتك», «موثّق من مويداتك», the deal-room "no account"
 * line, the invite body — plus a prototype and two plan documents (owner, 2026-09-08). It is the kind
 * of error nothing catches: it looks like a word, it renders cleanly, and only a reader who knows the
 * company sees it. So it is a test rather than a sweep.
 *
 * Latin «Moedatech» is correct and untouched: this is about the Arabic spelling only.
 */
const WRONG = "\u0645\u0648\u064a\u062f\u0627\u062a\u0643"; // مويداتك
const RIGHT = "\u0645\u0639\u062f\u0627\u062a\u0643"; // معداتك

const ROOTS = ["src", "prototypes", "docs"];
const EXT = /\.(ts|tsx|js|jsx|md|html|json)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

describe("the Arabic brand name", () => {
  it("is spelled معداتك everywhere, and مويداتك nowhere", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      let files: string[] = [];
      try { files = walk(root); } catch { continue; }
      for (const f of files) {
        const text = readFileSync(f, "utf8");
        if (!text.includes(WRONG)) continue;
        const line = text.split("\n").findIndex((l) => l.includes(WRONG)) + 1;
        offenders.push(`${f}:${line}`);
      }
    }
    expect(offenders, `use ${RIGHT}, not ${WRONG}`).toEqual([]);
  });

  it("is present in the Arabic dictionary at all — so a rename cannot empty it silently", () => {
    const ar = readFileSync(join("src", "lib", "i18n", "ar.ts"), "utf8");
    expect(ar.includes(RIGHT)).toBe(true);
  });
});
