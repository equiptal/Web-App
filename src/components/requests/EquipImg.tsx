"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

/** Legacy slug → icon (kept as a fallback for the few old categoryId slugs). */
const CATEGORY_ICON: Record<string, string> = {
  earthmoving: "agriculture",
  "cranes-lifting": "precision_manufacturing",
  power: "bolt",
  haulage: "local_shipping",
  access: "forklift",
  concrete: "foundation",
};

/**
 * Derive a Material icon from an equipment's taxonomy name (category / subtype). The backend has no
 * icon field — only names and the 7 category-group tags — so we keyword-match the name to a sensible
 * glyph. Covers the real taxonomy (37 categories) and degrades to a generic icon for anything new.
 */
export function equipmentIcon(name: string | null | undefined): string {
  const s = (name || "").toLowerCase();
  if (/crane/.test(s)) return "precision_manufacturing";
  if (/forklift|telehandler/.test(s)) return "forklift";
  if (/aerial|boom|scissor|mewp|platform|man.?lift/.test(s)) return "precision_manufacturing";
  if (/excavat|backhoe|digger|dozer|loader|skid|grader|scraper|trencher/.test(s)) return "agriculture";
  if (/truck|tanker|trailer|lowbed|haul|dump|transport/.test(s)) return "local_shipping";
  if (/generator|genset|light\s*tower|compressor|power|welder/.test(s)) return "bolt";
  if (/roller|compactor|paver|asphalt|road|grad(e|ing)/.test(s)) return "add_road";
  if (/pil(e|ing)|drill|bore|foundation|auger|rig/.test(s)) return "foundation";
  if (/crush|screen|demolit|breaker|hammer/.test(s)) return "hardware";
  if (/bmu|gondola|cradle/.test(s)) return "apartment";
  if (/concrete|mixer|batch|pump|mortar/.test(s)) return "foundation";
  return "construction";
}

/**
 * Equipment thumbnail: shows the taxonomy image when it loads, otherwise falls back to a Material
 * icon derived from the equipment's taxonomy name (or the legacy category slug). Backend taxonomy
 * image URLs often 404 in the web context, so the icon fallback is what's usually shown.
 */
export function EquipImg({
  src,
  categoryId,
  name,
  box = "grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-md border border-border bg-surface2",
  img = "h-9 w-9 object-contain",
  iconSize = 26,
}: {
  src: string | null;
  categoryId: string | null;
  /** Taxonomy name (category/subtype) — drives the icon when the image is missing. */
  name?: string | null;
  box?: string;
  img?: string;
  iconSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const icon = name ? equipmentIcon(name) : (categoryId && CATEGORY_ICON[categoryId]) || "construction";
  return (
    <span className={box}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={img} onError={() => setBroken(true)} />
      ) : (
        <Icon name={icon} size={iconSize} className="text-navy-mid" />
      )}
    </span>
  );
}
