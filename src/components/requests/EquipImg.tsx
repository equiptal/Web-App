"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

/** Category → representative Material icon, used when there's no taxonomy image (or it fails to load). */
const CATEGORY_ICON: Record<string, string> = {
  earthmoving: "construction",
  "cranes-lifting": "precision_manufacturing",
  power: "bolt",
  haulage: "local_shipping",
  access: "forklift",
  concrete: "foundation",
};

/**
 * Equipment thumbnail: shows the taxonomy image when it loads, otherwise falls back to a
 * category-specific Material icon. The backend's taxonomy image URLs often 404 in the web context,
 * so the onError fallback is what keeps a meaningful icon on every card.
 */
export function EquipImg({
  src,
  categoryId,
  box = "grid h-[54px] w-[54px] flex-none place-items-center overflow-hidden rounded-xl border border-border bg-surface2",
  img = "h-9 w-9 object-contain",
  iconSize = 26,
}: {
  src: string | null;
  categoryId: string | null;
  box?: string;
  img?: string;
  iconSize?: number;
}) {
  const [broken, setBroken] = useState(false);
  const icon = (categoryId && CATEGORY_ICON[categoryId]) || "construction";
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
