/**
 * Tier 0 in the browser (web-app/007, W-T22).
 *
 * The create flow already holds the whole taxonomy — it draws the category, subtype and size
 * dropdowns from it — so matching `2 crawler excavators 20t` costs **no network at all**. Not a
 * fast request: no request. That is the floor this feature was reaching for.
 *
 * ── The rules are not written here ───────────────────────────────────────────────────────────────
 *
 * `quick-match.generated.ts` is a copy of the agent's own matcher, exported by
 * `scripts/export-matcher.js` in that repo. Two implementations of "is this an excavator" would
 * drift, and the drift would be silent — the browser and the server disagreeing about one sentence,
 * with nothing in either log saying why. This file only adapts the shape the matcher wants.
 *
 * ── What Tier 0 answers, and what it does not ────────────────────────────────────────────────────
 *
 * It answers the equipment. It says nothing about dates, operators, fuel or certificates, because
 * the renter said nothing about them — those come from the project, merged afterwards in
 * `applyProjectDefaults`, exactly as they are on the model path. A Tier-0 result that invented a
 * header would be indistinguishable, to the renter, from one the agent produced.
 */

import type { Taxonomy } from "@/lib/contract/taxonomy";
import { quickMatch, type QuickResult, type QuickTaxonomy } from "./quick-match.generated";

export { MATCHER_RULES_HASH } from "./quick-match.generated";
export type { QuickResult };

/**
 * The web's taxonomy tree → the index shape the matcher reads.
 *
 * Built once per taxonomy and memoised: it walks 58 subtypes and 315 capacities, which is nothing
 * on its own but is not worth repeating on every keystroke.
 */
let cachedFor: Taxonomy | null = null;
let cachedIndex: QuickTaxonomy | null = null;

export function toQuickTaxonomy(tree: Taxonomy): QuickTaxonomy {
  if (cachedFor === tree && cachedIndex) return cachedIndex;

  const categories = new Set<string>();
  const subcategories: Record<string, Set<string>> = {};
  const sizes: Record<string, Set<string>> = {};
  const measurementByName = new Map<string, { id: string; name?: string }>();
  const category = new Map<string, string>();
  const subcategory = new Map<string, string>();

  for (const c of tree) {
    categories.add(c.name);
    category.set(c.name.toLowerCase(), c.id);
    subcategories[c.name] ??= new Set<string>();

    for (const s of c.subcategories) {
      subcategories[c.name].add(s.name);
      subcategory.set(s.name.toLowerCase(), s.id);
      sizes[s.name] ??= new Set<string>();

      for (const m of s.measurements) {
        sizes[s.name].add(m.name);
        // Keyed by "SUBTYPE::MEASUREMENT" — the same scoping the agent uses, because a measurement
        // name repeats across subtypes and a global map answers with whichever loaded last.
        measurementByName.set(`${s.name}::${m.name}`, { id: m.id, name: m.name });
      }
    }
  }

  cachedFor = tree;
  cachedIndex = { categories, subcategories, sizes, measurementByName, nameAliasIndex: { category, subcategory } };
  return cachedIndex;
}

/** Match one line against the loaded catalogue, or refuse with a reason. */
export function matchInBrowser(text: string, tree: Taxonomy | null | undefined): QuickResult {
  if (!tree || tree.length === 0) return { matched: false, reason: "empty" };
  return quickMatch(text, toQuickTaxonomy(tree));
}
