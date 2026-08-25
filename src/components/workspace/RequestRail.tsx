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

  // ── 88px, and every pixel of it is spoken for (owner, 2026-08-25) ──────────────────────────────
  // It was 96, then 80, then 76 — and each of those CLIPPED, because this row is `overflow-hidden`
  // and a tile draws taller than its circle. The count that produced 76 was wrong twice: it charged
  // 4px for the share badge's overhang when the real figure is 2 (the badge's `-top-1` is measured
  // from a span already inset 2px by the ring's padding), and it then declared 76 sufficient for a
  // 77 it had just added up. So the circles sat against the header's rule with the badge half
  // behind it — which is exactly what the owner is looking at.
  //
  // What a tile actually occupies, from its highest ink to its lowest:
  //
  //     2  the share badge's overhang above the ring
  //   +44  the circle
  //   + 4  the gap under it
  //   +13  the name
  //   + 9  «CLOSED», on the tiles that carry it — 7px caps, tight against the name
  //   = 72
  //
  // «CLOSED» came down from 8px on 10 with a 2px gap over it (owner, 2026-08-25: "for closed make
  // it small so this header of circles has a little more space"). It is a footnote on a request
  // nobody is bidding on any more, and it was spending 12px of a row that needed the air more.
  //
  // 88 now leaves 7px clear above the badge and 9 below the caption. The flow height is 70 of that
  // 72 — the badge hangs out of it absolutely — which is the number the margins further down are
  // cut from. Change any line above and both figures move with it; that is the point of the sum.
  return (
    <div className={`flex h-[88px] flex-none select-none items-center gap-4 overflow-hidden border-b border-border bg-surface3/60 ${PAGE_X_BLEED}`}>
      <Link href="/create" className="group flex flex-none flex-col items-center gap-1">
        <span className="grid h-11 w-11 place-items-center rounded-full border-2 border-dashed border-border text-muted transition group-hover:border-brand group-hover:text-brand">
          <Icon name="add" size={20} />
        </span>
        <span className="flex h-[22px] flex-col items-center text-[11px] font-semibold leading-[13px] text-muted">{t.workspace.newRequest}</span>
      </Link>

      {/* ── The 26px under this rule, and under the chevron at the far end (owner, 2026-08-25) ─────
          A tile is 70px of flow in an 88px row — a 44px circle, a 4px gap, a 22px label block — so
          the row centres the TILE, which leaves the circle above the row's own middle. Anything
          centred on the row itself misses the circles; the chevron used to pay for that with a
          `-mt-2` that got it roughly half way. Borrowing the tile's own 4 + 22 as a bottom margin
          gives these two a tile's column height, so one `items-center` lands all three on the
          circles' line. */}
      <div className="mb-[26px] h-9 w-px flex-none bg-border/70" />

      <div
        ref={scroller}
        /* Every circle on one line, `New` included (owner, 2026-08-25).

           The scroller was `items-start` while `New` was centred by the rail, so the two aligned to
           different things: tiles hung from the top of the scroller, `New` sat in the middle of the
           row, and the circles missed each other. Centring both is not enough on its own —
           `CLOSED` gives some tiles a second label line, so their columns are taller and centring
           would push their circles UP relative to the rest. The label block therefore has a fixed
           height (13px name + 9px CLOSED) whether or not the second line is present, so
           every tile is the same height and one `items-center` lands every circle on the same line. */
        className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              {/* ── Pixels, not percentages of percentages (owner, 2026-08-25) ────────────────────
                  One machine kept drawing at about twice its circle, over its own caption, on one
                  tile out of eighteen — while the other seventeen sat correctly inside the same
                  markup. Padding was not what did it, and neither was `contain`: a 36px box with
                  `overflow-hidden rounded-full` over it cannot leak at all. What CAN fail is the
                  chain that produced the 36 — `h-full` inside `h-full` inside a `p-[2px]` grid
                  area, three percentage heights deep, each one relying on the box above it being
                  resolvable. Where that chain gives out the boxes fall back to the picture's own
                  size, the clip grows to fit rather than cropping, and a portrait rig runs the
                  height of the rail.
                  44 / 40 / 36 are the numbers the percentages were computing anyway. Stated
                  outright there is nothing left to resolve, so the clip is 36px on every tile and
                  every machine, whatever its shape. */}
              <span className={`grid h-11 w-11 flex-none place-items-center rounded-full p-[2px] ${ring}`}>
                <span className="relative h-10 w-10 rounded-full border-2 border-surface">
                  <span className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-surface3 ${tile.closed ? "grayscale" : ""}`}>
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
                         stops rattling around inside its ring.

                         The 3px inset is geometry, not taste — do not take it out again. `contain`
                         fits the picture inside its BOX; the mask over it is a CIRCLE, and a
                         rectangle that fits the box still pokes out of the circle. Most of this
                         artwork is landscape, so scaled to the full 36px width it stands about 24
                         tall — and a 36px circle is only 27 wide at that height, so its left and
                         right tips get cut by the round mask. That is the machine the owner saw
                         crossing the ring (2026-08-25), and it appeared the moment the inset was
                         removed in the name of filling more of the circle.

                         Inscribing a 3:2 rectangle in a circle of radius 18 gives 30 × 20, which is
                         what a 36px box less 3px a side is. So 3 is the largest inset that shows
                         every machine whole. Reaching further needs a bigger circle, not less
                         padding. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={img} alt="" draggable={false} className="h-9 w-9 object-contain p-[3px]" />
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
              <span className="flex h-[22px] flex-col items-center">
                <span className={`max-w-[104px] truncate text-[11px] leading-[13px] ${active ? "font-bold text-navy" : "font-semibold text-navy-mid"}`}>
                  {tile.label}
                </span>
                {tile.closed && (
                  <span className="text-[7px] font-bold uppercase leading-[9px] tracking-[.07em] text-muted">{t.workspace.closed}</span>
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
        className="mb-[26px] grid h-7 w-7 flex-none place-items-center rounded-full border border-border bg-surface/60 text-muted transition hover:bg-surface"
      >
        <Icon name="chevron_right" size={16} className="rtl:scale-x-[-1]" />
      </button>
    </div>
  );
}
