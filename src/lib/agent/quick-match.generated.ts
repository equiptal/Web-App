/**
 * GENERATED — do not edit here.
 *
 * The Tier-0 equipment matcher, copied from the normalization agent so the browser runs exactly the
 * rules the server runs. Two implementations of these rules would drift, and the drift would be
 * silent: the browser and the server disagreeing about one sentence, with nothing in either log
 * saying why.
 *
 * Source:   Normalization-Agent/src/services/equipment-quick-match.ts
 * Refresh:  node scripts/export-matcher.js <this file>   (run in the agent repo)
 * Rules:    f9f8dd216761
 *
 * A test asserts that hash against this file's own contents, so editing the copy fails the build
 * rather than quietly forking the rules.
 */

export const MATCHER_RULES_HASH = 'f9f8dd216761';

/**
 * Tier 0 — the deterministic match (NA-T2 · renter-projects).
 *
 * `"2 excavators 20t"` is not a comprehension problem. It is a quantity, a name from a list of about
 * ninety, and a number with a unit. A model is the wrong instrument for it: it costs a second and a
 * half, some tokens, and a small chance of being creative about a job with exactly one right answer.
 *
 * ```
 *   "2 excavators 20t"
 *     → strip the leading quantity      → 2
 *     → keyword scan over the taxonomy  → Earthmoving · Excavator
 *     → number + unit → measurement     → 20 ton
 *     → nothing left over               → confident, ~50 ms, zero tokens
 * ```
 *
 * ── It refuses far more often than it matches, and that is the design ────────────────────────────
 *
 * **A wrong instant match is worse than a slow right one.** The renter is not reading carefully at
 * this point — they typed one line and expected it to be understood — so a confident wrong answer
 * goes to suppliers unread. Every refusal below is therefore a hard rule, not a heuristic, and each
 * one is a test:
 *
 *  - **no keyword, or more than one** — "excavator and a loader" is two machines, and this returns
 *    exactly one line or nothing at all;
 *  - **the size does not resolve, or resolves two ways** — a measurement name repeats across
 *    subtypes, so an ambiguous one is a refusal rather than a guess;
 *  - **words left over** — *"with a breaker"*, *"with operator"*, *"2021 or newer"* all mean the
 *    text said something this cannot represent, and dropping it silently is the worst outcome
 *    available here;
 *  - **Arabic** — until the Arabic index is proven at this same strictness. The alias map already
 *    holds Arabic, so this will lift; it is not lifted on a guess.
 *
 * Refusing costs one Tier-1 call, which is the path the request would have taken anyway.
 *
 * ── One implementation, two runtimes ─────────────────────────────────────────────────────────────
 *
 * The web runs this same matcher in the browser, where the taxonomy is already loaded for the
 * dropdowns, so the match costs no network at all. That is why this is a standalone module with no
 * imports from the service layer: two implementations of these rules would drift, and the drift
 * would show up as the browser and the server disagreeing about the same sentence.
 */

/**
 * The slice of the taxonomy this matcher reads — declared here rather than imported.
 *
 * `TaxonomyMap` has twelve fields; the rules need five. Declaring the five structurally does two
 * things: it says exactly what a caller must supply, and it leaves this file with **no imports at
 * all**, so the same source runs in a Lambda and in a browser without a build step between them.
 * `TaxonomyMap` satisfies it structurally, so the service passes its own map unchanged.
 */
export interface QuickTaxonomy {
  categories: Set<string>;
  subcategories: Record<string, Set<string>>;
  sizes: Record<string, Set<string>>;
  measurementByName: Map<string, { id: string; name?: string }>;
  nameAliasIndex: {
    category: Map<string, string>;
    subcategory: Map<string, string>;
  };
  sizeAlias?: Record<string, Map<string, string>>;
}

export interface QuickMatch {
  quantity: number;
  categoryId: string;
  subcategoryId: string;
  measurementId: string | null;
  /** Canonical English names, for display and for the corpus row. */
  categoryName: string;
  subcategoryName: string;
  measurementName: string | null;
}

export type QuickResult =
  | { matched: true; item: QuickMatch }
  | { matched: false; reason: QuickRefusal };

/** Why it fell through. Logged and counted — a shift in the mix is the first sign of a taxonomy change. */
export type QuickRefusal =
  | 'empty'
  | 'arabic'
  | 'no_keyword'
  | 'many_keywords'
  | 'ambiguous_size'
  | 'leftover_words';

const ARABIC = /[؀-ۿ]/;

/** Words that carry no meaning for a match and must not count as leftovers. */
const FILLER = new Set([
  'a', 'an', 'the', 'and', 'of', 'x', 'no', 'nos', 'pcs', 'pieces', 'unit', 'units', 'please', 'need',
  'i', 'we', 'want', 'require', 'required', 'looking', 'for',
]);

const lower = (s: string) => s.trim().toLowerCase();

/** Fold Arabic-Indic digits so "٢٠" and "20" are the same number. */
function foldDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * The units a size can be written in, and what the taxonomy calls them.
 *
 * Deliberately small and closed. An open-ended unit parser is how "20m" quietly becomes "20 ton" on
 * a machine measured in metres.
 */
const UNITS: Array<{ re: RegExp; canonical: string[] }> = [
  { re: /^(t|ton|tons|tonne|tonnes)$/, canonical: ['ton', 'tons', 'tonne'] },
  { re: /^(kg|kgs)$/, canonical: ['kg'] },
  { re: /^(m|meter|meters|metre|metres)$/, canonical: ['m', 'meter', 'metre'] },
  { re: /^(ft|foot|feet)$/, canonical: ['ft', 'foot', 'feet'] },
  { re: /^(kva)$/, canonical: ['kva'] },
  { re: /^(kw)$/, canonical: ['kw'] },
  { re: /^(cfm)$/, canonical: ['cfm'] },
  { re: /^(hp)$/, canonical: ['hp'] },
  { re: /^(l|ltr|litre|litres|liter|liters)$/, canonical: ['l', 'litre', 'liter'] },
];

/**
 * Match one line of text, or refuse.
 *
 * Pure: it reads the taxonomy and the string and touches nothing else, which is what lets the same
 * function run in a browser and in a Lambda.
 */
export function quickMatch(text: string, tax: QuickTaxonomy | null): QuickResult {
  const raw = (text ?? '').trim();
  if (!raw || !tax) return refuse('empty');

  // Arabic is refused wholesale rather than half-supported. The alias index already carries Arabic
  // names, so lifting this is a matter of proving it at this strictness — not of relaxing it.
  if (ARABIC.test(raw)) return refuse('arabic');

  const hay = foldDigits(lower(raw));

  /* ── The equipment ──
     Longest name first, so "mobile crane" is preferred over "crane" and the leftover check is not
     tripped by the very word that matched. */
  const names = candidateNames(tax);
  const hits: Array<{ name: string; category: string }> = [];
  for (const n of names) {
    if (hay.includes(n.name)) hits.push(n);
  }
  const kept = dropContained(hits);
  if (kept.length === 0) return refuse('no_keyword');
  if (kept.length > 1) return refuse('many_keywords'); // two machines is a Tier-1 job

  const hit = kept[0];
  const categoryId = tax.nameAliasIndex.category.get(hit.category) ?? null;
  const subcategoryId = tax.nameAliasIndex.subcategory.get(hit.name) ?? null;
  if (!categoryId || !subcategoryId) return refuse('no_keyword');

  /* ── The size, BEFORE the quantity ──
     Order matters here. "20t excavator" opens with a number that is a size, not a count, and a
     quantity rule that runs first eats it — producing an RFQ for twenty machines instead of one,
     with nothing on screen looking wrong. So the size is found first and the quantity is only
     read from what is left in front of it. */
  const sizes = tax.sizes[canonicalName(tax, hit.name)] ?? new Set<string>();
  const size = findSize(hay, hit.name, sizes, tax);
  if (size === 'ambiguous') return refuse('ambiguous_size');

  /* ── The quantity ──
     Only a leading number counts, and only when the size did not already claim it. A number after
     the machine is a size or a year, never a count. */
  const sizeAt = size ? hay.indexOf(size.text) : -1;
  const qtyMatch = sizeAt === 0 ? null : hay.match(/^(\d{1,3})\s*(?:x\s*)?/);
  const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  if (quantity < 1) return refuse('leftover_words');

  /* ── Anything left over means the model is needed ──
     Consume what was understood and look at the remainder. A word this cannot represent is a word
     that would be silently dropped, and a dropped "with operator" is a term the renter stated and
     the RFQ does not carry. */
  let rest = hay;
  if (qtyMatch) rest = rest.slice(qtyMatch[0].length);
  rest = rest.replace(hit.name, ' ');
  // Already narrowed by the refusal above — 'ambiguous' cannot reach here.
  if (size) rest = rest.replace(size.text, ' ');

  const leftovers = rest
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    // Plural of the matched name: "excavators" leaves an "s" behind.
    .filter((w) => w !== 's')
    .filter((w) => !FILLER.has(w));

  if (leftovers.length > 0) return refuse('leftover_words');

  return {
    matched: true,
    item: {
      quantity,
      categoryId,
      subcategoryId,
      measurementId: size ? size.id : null,
      categoryName: canonicalName(tax, hit.category),
      subcategoryName: canonicalName(tax, hit.name),
      measurementName: size ? size.name : null,
    },
  };
}

/* ----------------------------- Pieces ----------------------------- */

function refuse(reason: QuickRefusal): QuickResult {
  return { matched: false, reason };
}

/**
 * Every subcategory name worth scanning for, longest first.
 *
 * Names under four characters are skipped, as the few-shot keyword scan already does: "Winch" inside
 * "winchester" is a substring hit with no meaning, and a spurious match here is a wrong RFQ rather
 * than a slightly worse few-shot pick.
 */
function candidateNames(tax: QuickTaxonomy): Array<{ name: string; category: string }> {
  const out: Array<{ name: string; category: string }> = [];
  for (const [category, subs] of Object.entries(tax.subcategories)) {
    for (const s of subs) {
      const n = lower(s);
      if (n.length >= 4) out.push({ name: n, category: lower(category) });
    }
  }
  return out.sort((a, b) => b.name.length - a.name.length);
}

/** Drop a hit wholly inside a longer one — "crane" inside "mobile crane" is the same machine. */
function dropContained(hits: Array<{ name: string; category: string }>): Array<{ name: string; category: string }> {
  return hits.filter((h) => !hits.some((o) => o !== h && o.name.length > h.name.length && o.name.includes(h.name)));
}

/** The canonical (cased) taxonomy name for a lowercased one, for display and for the corpus. */
function canonicalName(tax: QuickTaxonomy, lowered: string): string {
  for (const c of tax.categories) if (lower(c) === lowered) return c;
  for (const subs of Object.values(tax.subcategories)) for (const s of subs) if (lower(s) === lowered) return s;
  return lowered;
}

type SizeHit = { id: string; name: string; text: string };

/**
 * The size, within this subtype's own measurements.
 *
 * Scoped to the subtype on purpose: "22 ton" exists under Dozer AND under Single Drum Roller, so the
 * global alias index would answer with whichever loaded last. Two measurements matching the same
 * text inside one subtype is a refusal — there is no basis to pick.
 */
function findSize(hay: string, subtypeLower: string, sizes: Set<string>, tax: QuickTaxonomy): SizeHit | 'ambiguous' | null {
  const num = hay.match(/(\d+(?:\.\d+)?)\s*([a-z]+)?/g);
  if (!num) return null;

  const hits: SizeHit[] = [];
  for (const name of sizes) {
    const n = lower(name);
    // The measurement's own text, e.g. "20 ton" → 20 and "ton".
    const parts = n.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!parts) continue;
    const [, value, unitWord] = parts;
    const unit = UNITS.find((u) => u.re.test(unitWord.trim()));

    // "20t", "20 t", "20 ton", "20ton" — the same measurement written four ways.
    const written = unit ? [unitWord.trim(), ...unit.canonical, unitWord.trim()[0]] : [unitWord.trim()];
    for (const w of new Set(written.filter(Boolean))) {
      const re = new RegExp(`\\b${escape(value)}\\s*${escape(w)}\\b`);
      const m = hay.match(re);
      if (m) {
        const id = resolveWithinSubtype(tax, subtypeLower, name);
        if (id) hits.push({ id, name, text: m[0] });
        break;
      }
    }
  }

  const unique = new Map(hits.map((h) => [h.id, h]));
  if (unique.size === 0) return null;
  if (unique.size > 1) return 'ambiguous';
  return [...unique.values()][0];
}

/** The measurement id under THIS subtype, never the global one. */
function resolveWithinSubtype(tax: QuickTaxonomy, subtypeLower: string, measurementName: string): string | null {
  const scoped = tax.sizeAlias?.[canonicalName(tax, subtypeLower)];
  if (scoped) {
    const canonical = scoped.get(lower(measurementName));
    if (canonical) {
      const node = tax.measurementByName.get(`${canonicalName(tax, subtypeLower)}::${canonical}`);
      if (node) return node.id;
    }
  }
  const node = tax.measurementByName.get(`${canonicalName(tax, subtypeLower)}::${measurementName}`);
  return node?.id ?? null;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
