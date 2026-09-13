import { describe, expect, it } from "vitest";
import { iconForRef, reelIcons, taxonomyIcons } from "@/lib/contract/taxonomy-icons";
import type { TaxonomyNode } from "@/lib/contract/stores";

/**
 * ── The catalogue's drawings, and which tree they come from (owner, 2026-09-13) ─────────────────
 *
 * *"didnt we say it must show equipment he is trying to map, the ui is so dull"*, on a processing
 * screen that was a spinner and a line.
 *
 * 🔴 **There are TWO taxonomy endpoints and only one carries artwork**, which is the whole reason
 * this module exists. Measured against both live services before building:
 *  · `/api/taxonomy` (AGENTS, and what the create flow's dropdowns are built from) — one image
 *    field, `equipment_image_url`, a photograph, on **1 row of 413**.
 *  · `/api/stores/taxonomy` (the APP backend's tree, behind the browse filters) — `imageUrl` /
 *    `imageKey`, the flat drawing, on **92 of 412**.
 *
 * The ids are the SAME in both — all 37 agent categories and all 58 agent subtypes resolve in the
 * app tree — so every line the agent can match has a drawing: 55 of their own, 3 inherited from a
 * category. A first pass read the agents field, found nothing, and drew a glyph; the artwork was
 * one endpoint away all along.
 */

const node = (id: string, iconUrl: string | null, children: TaxonomyNode[] = []): TaxonomyNode => ({
  id,
  name: id,
  nameAr: id,
  iconUrl,
  children,
});

const TREE: TaxonomyNode[] = [
  node("cat-lift", "icon/cat-lift.png", [
    node("sub-scissor", "icon/scissor.png", [node("m-12", null)]),
    // A subtype with NO drawing of its own — 3 of the 58 are like this.
    node("sub-boom", null, [node("m-20", null)]),
  ]),
  node("cat-earth", null, [node("sub-excavator", "icon/excavator.png")]),
];

describe("flattening the tree", () => {
  const icons = taxonomyIcons(TREE);

  it("keeps only the nodes that actually have a drawing", () => {
    expect([...icons.keys()].sort()).toEqual(["cat-lift", "sub-excavator", "sub-scissor"]);
  });

  it("walks to every depth, because a drawing can sit at any level", () => {
    expect(icons.get("sub-excavator")).toBe("icon/excavator.png");
  });
});

describe("the drawing for one line", () => {
  const icons = taxonomyIcons(TREE);

  it("is the SUBTYPE's when it has one", () => {
    expect(iconForRef(icons, { categoryId: "cat-lift", subcategoryId: "sub-scissor" })).toBe("icon/scissor.png");
  });

  it("falls back to the category's when it does not", () => {
    // 3 of the 58 agent subtypes land here. Without the fallback they would draw nothing.
    expect(iconForRef(icons, { categoryId: "cat-lift", subcategoryId: "sub-boom" })).toBe("icon/cat-lift.png");
  });

  it("is null when neither level has one", () => {
    expect(iconForRef(icons, { categoryId: "cat-earth", subcategoryId: null })).toBeNull();
  });

  it("is null for an OFF-CATALOGUE line, which carries no ref at all", () => {
    // Correct, not a gap: the catalogue has no drawing of a machine it does not carry, and the
    // screen puts the agent in the ring instead.
    expect(iconForRef(icons, { categoryId: null, subcategoryId: null })).toBeNull();
  });

  it("never asks the MEASUREMENT — a size is a size OF something and carries no artwork", () => {
    // `m-12` has no icon and is not consulted; asking for it could only ever miss.
    expect(iconForRef(icons, { categoryId: "cat-lift", subcategoryId: "sub-scissor" })).not.toBe(null);
    expect(icons.has("m-12")).toBe(false);
  });
});

describe("the reel shown while the agent is still reading", () => {
  it("takes a handful, in a DETERMINISTIC order", () => {
    // Not shuffled: a different reel on every load is a different screen every time, for nothing.
    const icons = taxonomyIcons(TREE);
    expect(reelIcons(icons, 2)).toEqual(["icon/cat-lift.png", "icon/scissor.png"]);
    expect(reelIcons(icons, 2)).toEqual(reelIcons(icons, 2));
  });

  it("is empty when the tree brought no drawings, and the screen must survive that", () => {
    expect(reelIcons(taxonomyIcons([]))).toEqual([]);
  });
});
