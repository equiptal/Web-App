import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";

/**
 * The brand is «معداتك», and nothing else.
 *
 * Three ways it has gone wrong so far, each caught here, because none of them fails anything else:
 * they look like words, they render cleanly, and only a reader who knows the company sees them.
 *
 *  1. **«مويداتك»** — the LATIN name (Moeda-tech) transliterated back into Arabic. Twelve shipped
 *     strings plus a prototype and two plan documents (owner, 2026-09-08).
 *  2. **«مؤجّرتك»** — «your lessor», a TRANSLATION of the brand rather than the brand. One string,
 *     `guestWall.join`: «انضم إلى مؤجّرتك» where it should read «انضم إلى معداتك»
 *     (owner, 2026-09-10).
 *  3. **A DIACRITISED spelling** — «مُعِدّاتك» and its variants, 32 of them across the dictionary and
 *     the invite card, found by the same report. Same letters, so it looks right at a glance, but the
 *     vowels change what it says (مُعِدّات reads «preparers», not «equipment») and it is a second
 *     spelling of a name that may only have one. Nothing matched it, because a search for «معداتك»
 *     does not find it.
 *
 * Latin «Moedatech» is correct and untouched — this is about the Arabic spelling only — and it is
 * still the right thing inside a KEY NAME (`onMoedatech`, `verifiedByMoedatech`), which no reader
 * sees.
 */
const RIGHT = "معداتك"; // معداتك
const TRANSLITERATED = "مويداتك"; // مويداتك
const TRANSLATED = "مؤج"; // مؤج… — «lessor» where the brand belongs

/** Every Arabic mark that can hide inside the brand's letters: fatha … sukun, plus the dagger alif. */
const DIACRITIC = "[ً-ْٰ]";
/** The brand's six letters with any number of marks between them — the plain form included. */
const ANY_SPELLING = new RegExp([..."معداتك"].join(`${DIACRITIC}*`), "g");

const ROOTS = ["src", "prototypes", "docs"];
const EXT = /\.(ts|tsx|js|jsx|md|html|json)$/;

/**
 * ⚠️ The decoded PROTOTYPES under `docs/implementation-plans/**` are a captured copy of somebody
 * else's build, kept as the reference the map and deal room were drawn from. They carry the
 * diacritised spelling and are not ours to correct: editing them would make the reference disagree
 * with the artefact it records. Our own plan documents are NOT exempt and were fixed on 2026-09-08.
 */
const EXEMPT = /docs[\\/]implementation-plans[\\/].*[\\/]prototype/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

function files(): string[] {
  const all: string[] = [];
  for (const root of ROOTS) {
    try {
      all.push(...walk(root));
    } catch {
      /* a root that is not checked out is not a failure */
    }
  }
  return all.filter((f) => !EXEMPT.test(f));
}

/** Walk two dictionaries in step, visiting every leaf string by its dotted path. */
function pairs(a: unknown, b: unknown, path: string, out: [string, string, string][]): void {
  if (typeof a === "string") {
    if (typeof b === "string") out.push([path, a, b]);
    return;
  }
  if (a && typeof a === "object") {
    for (const k of Object.keys(a as object)) {
      pairs((a as Record<string, unknown>)[k], (b as Record<string, unknown> | undefined)?.[k], path ? `${path}.${k}` : k, out);
    }
  }
}

describe("the Arabic brand name", () => {
  it("is never the Latin name transliterated back («مويداتك»)", () => {
    const offenders = files()
      .map((f) => [f, readFileSync(f, "utf8")] as const)
      .filter(([, t]) => t.includes(TRANSLITERATED))
      .map(([f, t]) => `${f}:${t.split("\n").findIndex((l) => l.includes(TRANSLITERATED)) + 1}`);
    expect(offenders, `use ${RIGHT}, not ${TRANSLITERATED}`).toEqual([]);
  });

  it("is never TRANSLATED («مؤجّرتك» — «your lessor» — where the brand belongs)", () => {
    // Narrow on purpose: «المؤجّر» is the ordinary word for the supplier and is correct in dozens of
    // strings. What is wrong is the brand rendered as a possessive lessor, which is this shape.
    const offenders: string[] = [];
    for (const f of files()) {
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        if (/مؤج[ً-ْٰ]*ر[ً-ْٰ]*(ة|ت)[ً-ْٰ]*ك/.test(line)) {
          offenders.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(offenders, `the brand is ${RIGHT}; ${TRANSLATED}… is the word for a lessor`).toEqual([]);
  });

  it("is written PLAIN — one spelling, with no vowel marks inside it", () => {
    /* «مُعِدّاتك» renders as the same six letters and reads as a different word. A reader skims past
       it; a search for the brand never finds it. So the brand has exactly one spelling. */
    const offenders: string[] = [];
    for (const f of files()) {
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(ANY_SPELLING)) {
          if (m[0] !== RIGHT) offenders.push(`${f}:${i + 1} — ${m[0]}`);
        }
      });
    }
    expect(offenders, `write ${RIGHT} with no diacritics`).toEqual([]);
  });
});

describe("the two dictionaries agree about the brand", () => {
  /**
   * The rule the owner asked for on 2026-09-10: *"make sure all moedatech word in english is معداتك
   * in arabic"*. This is the half that keeps it true for strings written LATER — a new English line
   * naming Moedatech whose Arabic twin quietly drops it, or names it some other way, fails here.
   */
  const leaves: [string, string, string][] = [];
  pairs(en, ar, "", leaves);

  it("has an Arabic twin naming the brand wherever the English one does", () => {
    const offenders = leaves
      // A KEY may say Moedatech; this is about the VALUE the reader sees.
      .filter(([, e, a]) => /moedatech/i.test(e) && !a.includes(RIGHT))
      .map(([k, e, a]) => `${k}\n    EN: ${e}\n    AR: ${a}`);
    expect(offenders, `these Arabic strings must name ${RIGHT}`).toEqual([]);
  });

  it("never leaves the Latin name inside an Arabic sentence", () => {
    const offenders = leaves.filter(([, , a]) => /moedatech/i.test(a)).map(([k, , a]) => `${k}: ${a}`);
    expect(offenders, `write ${RIGHT}, not the Latin name, in Arabic copy`).toEqual([]);
  });

  it("is present in the Arabic dictionary at all — so a rename cannot empty it silently", () => {
    expect(readFileSync(join("src", "lib", "i18n", "ar.ts"), "utf8").includes(RIGHT)).toBe(true);
  });
});
