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
