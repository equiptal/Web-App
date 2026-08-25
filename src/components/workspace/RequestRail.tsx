"use client";

import { useRef } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PAGE_X_BLEED } from "@/components/AppShell";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import type { RailTile } from "@/lib/contract/workspace";

/**
 * The rail at the top of the workspace — one circle per request, newest first, and a `New` tile that
 * starts another. Picking a circle is how the whole page changes subject.
 *
 * A closed request keeps its place in the rail rather than dropping out of it: its bids are still
 * worth reading, and a rail that silently loses rows teaches the renter not to trust it.
 *
 * **The ring is the state, and it is the only state.** Brand for the request being read, green for
 * one with bids waiting on it, grey for one that has closed — with the grey pair dimmed, so a live
 * request is the brightest thing on the row. It is the prototype's own rail (owner, 2026-08-25); the
 * ring carries what a second row of captions used to.
 */
export function RequestRail({
  tiles,
  activeKey,
  onPick,
  onShare,
}: {
  tiles: RailTile[];
  activeKey: string | null;
  onPick: (key: string) => void;
  /** Share the request the rail is showing — the badge on its own tile (owner's reference). */
  onShare?: (() => void) | null;
}) {
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);

  // Roughly three tiles a press — far enough to feel like progress, short enough to keep your place.
  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 300, behavior: "smooth" });

  // ── 76px, and every pixel of it is spoken for (owner, 2026-08-25) ──────────────────────────────
  // It was 96, then 80 — and 80 CLIPPED, because this row is `overflow-hidden` and a tile draws
  // taller than its circle, so the tops disappeared behind the header's rule. The lesson was not
  // "make it taller", it was "count it". The tallest tile needs
  //
  //     4  badge overhang above the ring (`-top-1` on the share control)
  //   +44  the circle
  //   + 4  the gap under it
  //   +13  the name
  //   + 2  the gap under that
  //   +10  «CLOSED», on the tiles that carry it
  //   = 77
  //
  // 76 holds it because the row centres its content and the last pixel is the caption's descender,
  // which has half a pixel of room at each end. If a tile ever gains a row, this number moves with
  // it — that is what the sum is here for.
  return (
    <div className={`flex h-[76px] flex-none items-center gap-4 overflow-hidden border-b border-border bg-surface3/60 ${PAGE_X_BLEED}`}>
      <Link href="/create" className="group flex flex-none flex-col items-center gap-1">
        <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-border text-muted transition group-hover:border-brand group-hover:text-brand">
          <Icon name="add" size={20} />
        </span>
        <span className="text-[11px] font-semibold leading-[13px] text-muted">{t.workspace.newRequest}</span>
      </Link>

      <div className="h-9 w-px flex-none bg-border/70" />

      <div
        ref={scroller}
        className="flex min-w-0 flex-1 items-start gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tiles.map((tile) => {
          const active = tile.key === activeKey;
          const img = publicTaxonomyUrl(tile.imageUrl);
          // Brand while it is the one being read, green while bids are waiting on it, grey once shut.
          const ring = active ? "bg-gradient-to-br from-brand to-brand/60" : tile.closed ? "bg-border" : tile.bids > 0 ? "bg-ok" : "bg-border";
          const dim = active ? "" : tile.closed ? "opacity-50" : "opacity-[.72]";
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onPick(tile.key)}
              aria-current={active ? "true" : undefined}
              title={tile.label}
              className={`flex max-w-[104px] flex-none flex-col items-center gap-1 text-center transition ${dim} hover:opacity-100`}
            >
              <span className={`grid h-11 w-11 place-items-center rounded-full p-[2px] ${ring}`}>
                <span className="relative h-full w-full rounded-full border-2 border-surface">
                  <span className={`grid h-full w-full place-items-center overflow-hidden rounded-full bg-surface3 ${tile.closed ? "grayscale" : ""}`}>
                    {img ? (
                      /* ── `contain`, not `cover` (owner, 2026-08-25: "the circles must fit any icon
                         + why some have floating icons") ──────────────────────────────────────────
                         The taxonomy artwork is not one kind of picture. Some files are photographs
                         that reach their own edges; others are drawings with transparent margins
                         built in. `cover` filled the circle with the first kind by cropping it and
                         left the second kind floating in the middle — one rule producing two
                         different results, which is exactly what the rail looked like.

                         `contain` shows every machine whole and inset the same way, so the circles
                         read as one set. A photograph gives up a little size for that; a drawing
                         stops rattling around inside its ring. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={img} alt="" className="h-full w-full object-contain p-[3px]" />
                    ) : (
                      <Icon name="precision_manufacturing" size={20} className="text-muted" />
                    )}
                  </span>
                  {/* One badge, and which one depends on what the tile has to say: bids that have
                      arrived outrank a unit count, because a bid is news and a count is not. */}
                  {/* ── Share, on the tile the page is showing (owner's reference, 2026-08-25) ──
                      One request is being read at a time, and the link that invites bids onto it is
                      about THAT request — so it rides its own circle rather than waiting inside the
                      drawer. It appears on the active tile only, for the same reason. */}
                  {active && onShare && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShare();
                      }}
                      aria-label={t.workspace.shareRequest}
                      title={t.workspace.shareRequest}
                      className="absolute -end-1 -top-1 grid h-5 w-5 place-items-center rounded-full border-2 border-surface bg-navy text-white transition hover:bg-navy-mid"
                    >
                      <Icon name="ios_share" size={11} />
                    </span>
                  )}
                  {tile.bids > 0 ? (
                    <span className="absolute -bottom-0.5 -end-0.5 flex items-center gap-[3px] rounded-full border-2 border-surface bg-navy px-1.5 py-[3px]">
                      <Icon name="description" size={8} className="text-white" />
                      <span className="text-[9.5px] font-extrabold leading-none text-white">{tile.bids}</span>
                    </span>
                  ) : tile.units > 1 ? (
                    <span className="absolute -bottom-px -end-px min-w-[19px] rounded-full border-2 border-surface bg-navy px-1 text-[10px] font-extrabold leading-[15px] text-white">
                      {t.workspace.unitsBadge.replace("{n}", String(tile.units))}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex flex-col items-center gap-0.5">
                <span className={`max-w-[104px] truncate text-[11px] leading-[13px] ${active ? "font-bold text-navy" : "font-semibold text-navy-mid"}`}>
                  {tile.label}
                </span>
                {tile.closed && (
                  <span className="text-[8px] font-bold uppercase leading-[10px] tracking-[.07em] text-muted">{t.workspace.closed}</span>
                )}
              </span>
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
        className="-mt-2 grid h-7 w-7 flex-none place-items-center self-center rounded-full border border-border bg-surface/60 text-muted transition hover:bg-surface"
      >
        <Icon name="chevron_right" size={16} className="rtl:scale-x-[-1]" />
      </button>
    </div>
  );
}
