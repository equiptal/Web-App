"use client";

import { useRef } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import type { RailTile } from "@/lib/contract/workspace";

/**
 * The rail at the top of the workspace — one circle per request, newest first, and a `New` tile that
 * starts another. Picking a circle is how the whole page changes subject.
 *
 * A closed request keeps its place in the rail rather than dropping out of it: its bids are still
 * worth reading, and a rail that silently loses rows teaches the renter not to trust it.
 */
export function RequestRail({
  tiles,
  activeKey,
  onPick,
}: {
  tiles: RailTile[];
  activeKey: string | null;
  onPick: (key: string) => void;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);

  // Roughly three tiles a press — far enough to feel like progress, short enough to keep your place.
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  return (
    <div className="relative flex items-center gap-2 border-b border-border bg-surface2 px-3 py-3 sm:px-5">
      <div ref={scroller} className="flex flex-1 items-start gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/create"
          className="group flex w-[74px] flex-none flex-col items-center gap-1.5 text-center"
        >
          <span className="grid h-[68px] w-[68px] place-items-center rounded-full border-2 border-dashed border-border text-muted transition group-hover:border-brand group-hover:text-brand">
            <Icon name="add" size={26} />
          </span>
          <span className="text-[11px] font-bold text-muted">{t.workspace.newRequest}</span>
        </Link>

        {tiles.map((tile) => {
          const active = tile.key === activeKey;
          const img = publicTaxonomyUrl(tile.imageUrl);
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onPick(tile.key)}
              aria-current={active ? "true" : undefined}
              title={tile.label}
              className="flex w-[74px] flex-none flex-col items-center gap-1.5 text-center"
            >
              <span
                className={`relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-full bg-surface3 ring-2 transition ${
                  active ? "ring-brand" : "ring-transparent hover:ring-border"
                } ${tile.closed ? "opacity-55 grayscale" : ""}`}
              >
                {img ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={img} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="precision_manufacturing" size={26} className="text-muted" />
                )}
                {/* Units only — the count the renter asked for. A single unit needs no badge; the
                    number is only interesting when there is more than one machine behind the tile. */}
                {tile.units > 1 && (
                  <span className="absolute bottom-0 end-0 rounded-full bg-navy px-1.5 py-0.5 text-[10px] font-extrabold text-white ring-2 ring-surface2">
                    {t.workspace.unitsBadge.replace("{n}", String(tile.units))}
                  </span>
                )}
              </span>
              <span className={`w-full truncate text-[11px] font-bold ${active ? "text-navy" : "text-navy-mid"}`}>{tile.label}</span>
              {tile.closed && <span className="text-[9.5px] font-bold uppercase tracking-wide text-muted">{t.workspace.closed}</span>}
            </button>
          );
        })}
      </div>

      {/* One control, pointing forward: the rail starts at its newest end, so "earlier" is the only
          direction there is to travel. It mirrors itself in Arabic with the rest of the row. */}
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label={t.workspace.railScrollNext}
        title={t.workspace.railScrollNext}
        className="grid h-8 w-8 flex-none place-items-center self-center rounded-full border border-border bg-surface text-navy-mid transition hover:bg-surface3"
      >
        <Icon name="chevron_right" size={18} className="rtl:scale-x-[-1]" />
      </button>
    </div>
  );
}
