import type { TaxonomyNode } from "@/lib/contract/stores";

/**
 * The catalogue's DRAWINGS, keyed by taxonomy id.
 *
 * ── Why this is not read off `/api/taxonomy` ────────────────────────────────────────────────────
 *
 * There are two taxonomy endpoints and only one of them carries artwork:
 *
 *  · `/api/taxonomy` — the AGENTS service, and the one the create flow's dropdowns are built from.
 *    It returns exactly one image field, `equipment_image_url`, a PHOTOGRAPH set per row from the
 *    admin panel. Measured against the live service on 2026-09-12: **1 row of 413 has one.**
 *  · `/api/stores/taxonomy` — the APP backend's tree, behind the browse filters since web-app/004.
 *    It carries `imageUrl` / `imageKey`, the flat ICON, on **92 of 412** nodes.
 *
 * 🔴 **The ids are the SAME in both**, which is what makes this work and was worth checking rather
 * than assuming: all 37 agent categories and all 58 agent subtypes resolve in the app tree, and
 * every one of those 58 ends up with a drawing — 55 of their own, 3 inherited from their category.
 * So a line the agent matched can be SHOWN, which is the whole point.
 *
 * ⚠️ A first pass reported that "the catalogue has one picture" and built the processing screen
 * around a glyph because of it. That was true of the field it looked at and false about the
 * product: the drawings the requests rail has always shown come from this tree, by way of the
 * REQUEST projection. Two endpoints, one word.
 *
 * ⚠️ The public twin (`/public/equipment/taxonomy`) serves the same tree with the same ids, so this
 * works signed out — which the create flow needs, because a guest can run the whole thing.
 */
export type TaxonomyIcons = Map<string, string>;

/** Flatten the app taxonomy tree into `id → drawing`, keeping only the nodes that have one. */
export function taxonomyIcons(tree: TaxonomyNode[]): TaxonomyIcons {
  const out: TaxonomyIcons = new Map();
  const walk = (nodes: TaxonomyNode[]) => {
    for (const n of nodes) {
      if (n.iconUrl) out.set(n.id, n.iconUrl);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * The drawing for one line: its subtype's, else its category's.
 *
 * Never the MEASUREMENT's — a size is a size of something and carries no artwork of its own, so
 * asking for it would only ever miss.
 */
export function iconForRef(
  icons: TaxonomyIcons,
  ref: { categoryId: string | null; subcategoryId: string | null },
): string | null {
  return (ref.subcategoryId && icons.get(ref.subcategoryId)) || (ref.categoryId && icons.get(ref.categoryId)) || null;
}

/**
 * A handful of drawings to flick through while the agent is still reading.
 *
 * ⚠️ **They are never NAMED, and that is the whole licence for showing them.** A picture on the
 * processing screen means «this is what the agent matched you to»; a reel of them with a caption
 * would be claiming matches that have not happened. Unnamed and moving, it reads as what it is —
 * the catalogue being searched — which is what the owner asked for (2026-09-13: *"it must show
 * equipment he is trying to map"*).
 *
 * Deterministic order, not shuffled: a different reel on every load is a different screen every
 * time, and there is nothing to gain from it.
 */
export function reelIcons(icons: TaxonomyIcons, n = 12): string[] {
  return [...icons.values()].slice(0, n);
}

/**
 * The drawing for a machine named in PROSE, rather than by its ids.
 *
 * A project TEMPLATE carries `ChartItem.label` - the category, subtype and size run into one string
 * - and no taxonomy ids at all, so `iconForRef` cannot help it. The rail still has to draw the
 * catalogue picture rather than a grey glyph (owner, 2026-09-17: *"use the taxonamy image not this
 * fallback icon"*), so the name is matched against the tree.
 *
 * The rule is TOKEN CONTAINMENT, not equality, and it has to be: the two sides compose the same
 * machine differently - `itemName` joins the subtype and the size with a middot, the chart runs the
 * category in front of both - so a string compare misses every time. A node matches when every word
 * of its own name appears in the line, and the LONGEST such node wins, so «Excavator» never beats
 * «Crawler Excavator» for a crawler.
 *
 * Deliberately one-directional: the line may say more than the node (a size, a category), never
 * less. Matching the other way round would let «Crane» answer for «Tower Crane».
 */
const words = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export interface NamedIcon {
  tokens: string[];
  url: string;
}

/** Every node that HAS a drawing, with its name broken into words. Built once per tree. */
export function namedIcons(tree: TaxonomyNode[]): NamedIcon[] {
  const out: NamedIcon[] = [];
  const walk = (nodes: TaxonomyNode[]) => {
    for (const n of nodes) {
      if (n.iconUrl) {
        for (const label of [n.name, n.nameAr]) {
          const tokens = words(label ?? "");
          if (tokens.length) out.push({ tokens, url: n.iconUrl });
        }
      }
      if (n.children?.length) walk(n.children);
    }
  };
  walk(tree);
  // Longest first, so the most specific node is the first one that can match.
  return out.sort((a, b) => b.tokens.length - a.tokens.length);
}

/** The drawing for one line of prose, or null when the catalogue has none for it. */
export function iconForName(named: NamedIcon[], line: string): string | null {
  const have = new Set(words(line));
  if (!have.size) return null;
  for (const n of named) {
    if (n.tokens.every((w) => have.has(w))) return n.url;
  }
  return null;
}
