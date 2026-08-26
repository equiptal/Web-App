"use client";

import { useRef } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PAGE_X_BLEED } from "@/components/AppShell";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import type { RailTile } from "@/lib/contract/workspace";
import { pin } from "@/lib/uiPins";

/**
 * The rail at the top of the workspace — one circle per request, newest first, and a `New` tile that
 * starts another. Picking a circle is how the whole page changes subject.
 *
 * A closed request keeps its place in the rail rather than dropping out of it: its bids are still
 * worth reading, and a rail that silently loses rows teaches the renter not to trust it.
 *
 * **The ring says one thing: whether the request is shut** (owner, 2026-08-27). Grey for closed and
 * dimmed with it; nothing at all otherwise. ~~Brand for the request being read, green for one with
 * bids waiting.~~ Three colours on a row of circles, and two of them competed — an active request
 * with bids waiting could not show both, so the orange won and the green news was lost on the one
 * tile the renter was looking at. Which tile is being read is carried by its full opacity and its
 * navy caption, which is what carried it alongside the ring anyway.
 *
 * A closed request keeps its place until the renter takes it off himself — the × on its circle hides
 * it on this device and touches nothing else.
 */
export function RequestRail({
  tiles,
  activeKey,
  onPick,
  onShare,
  onHide,
}: {
  tiles: RailTile[];
  activeKey: string | null;
  onPick: (key: string) => void;
  /** Share the request the rail is showing — the badge on its own tile (owner's reference). */
  onShare?: (() => void) | null;
  /** Take a CLOSED request's circle off this device's rail. Absent → no × is drawn. */
  onHide?: ((key: string) => void) | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
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
  //     2  the share badge's overhang above the circle
  //   +56  the circle
  //   + 4  the gap under it
  //   +13  the name
  //   + 9  «CLOSED», on the tiles that carry it — 7px caps, tight against the name
  //   = 84
  //
  // «CLOSED» came down from 8px on 10 with a 2px gap over it (owner, 2026-08-25: "for closed make
  // it small so this header of circles has a little more space"). It is a footnote on a request
  // nobody is bidding on any more, and it was spending 12px of a row that needed the air more.
  //
  // ── The circle went 44 → 56 (owner, 2026-08-27: "i feel it small and some space are wasted") ──
  // Both halves of that were true. 88 held 72 of content, so 16px of the row was air, and the
  // circle — the thing the rail IS — was the smaller half of what a tile spent its height on.
  //
  // 96 now holds 84, so it leaves 6px clear above the badge and 6 below the caption. The row grew
  // 8px and the header opposite it lost 10 in the same pass, so the chrome above a page is 2px
  // shorter than it was while the circles are a quarter larger.
  //
  // The flow height is 82 of that 84 — the badge hangs out of it absolutely — which is the number
  // the margins further down are cut from: a tile's gap and label are 4 + 22 = 26, so the divider
  // and the chevron take `mb-[26px]` to sit on the circles' line. That was `mb-7`, which is 28, and
  // put both of them 2px low. Change any line above and every figure here moves with it; that is
  // the point of writing the sum down.
  return (
    <div {...pin("request-rail")} className={`flex h-[96px] flex-none select-none items-center gap-4 overflow-hidden border-b border-border bg-surface3/60 ${PAGE_X_BLEED}`}>
      <Link {...pin("rail-create-tile")} href="/create" className="group flex flex-none flex-col items-center gap-1">
        <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-border text-muted transition group-hover:border-brand group-hover:text-brand">
          <Icon name="add" size={20} />
        </span>
        <span className="flex h-[22px] flex-col items-center text-label font-semibold leading-[13px] text-muted">{t.workspace.newRequest}</span>
      </Link>

      {/* ── The 26px under this rule, and under the chevron at the far end (owner, 2026-08-25) ─────
          A tile is 82px of flow in a 96px row — a 56px circle, a 4px gap, a 22px label block — so
          the row centres the TILE, which leaves the circle above the row's own middle. Anything
          centred on the row itself misses the circles; the chevron used to pay for that with a
          `-mt-2` that got it roughly half way. Borrowing the tile's own 4 + 22 as a bottom margin
          gives these two a tile's column height, so one `items-center` lands all three on the
          circles' line. */}
      <div className="mb-[26px] h-11 w-px flex-none bg-border/70" />

      <div {...pin("rail-tiles")}
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
          /* ── There is no ring (owner, 2026-08-27: "remove all outlines even grey") ───────────────
             It was three colours — brand for the one being read, green for one with bids waiting,
             grey for closed. Then it was grey alone. Now it is nothing: a row of pictures rather
             than a row of framed pictures.

             What the ring used to say is still said. **Closed** is the picture in greyscale, the
             tile at half opacity, and «CLOSED» under the name. **Being read** is full opacity and a
             navy semibold caption where the others are muted. Neither ever depended on the ring —
             it was the third way of saying two things. */
          const dim = active ? "" : tile.closed ? "opacity-50" : "opacity-[.72]";
          const raised = fmtRaised(tile.createdAt, ar);
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onPick(tile.key)}
              aria-current={active ? "true" : undefined}
              title={raised ? `${tile.label} · ${raised}` : tile.label}
              className={`flex max-w-[104px] flex-none flex-col items-center gap-1 text-center transition ${dim}`}
            >
              {/* ── Pixels, not percentages of percentages (owner, 2026-08-25) ────────────────────
                  One machine kept drawing at about twice its circle, over its own caption, on one
                  tile out of eighteen — while the other seventeen sat correctly inside the same
                  markup. Padding was not what did it, and neither was `contain`: a 36px box with
                  `overflow-hidden rounded-full` over it cannot leak at all. What CAN fail is the
                  chain that produced the 36 — `h-full` inside `h-full` inside a `p-1` grid
                  area, three percentage heights deep, each one relying on the box above it being
                  resolvable. Where that chain gives out the boxes fall back to the picture's own
                  size, the clip grows to fit rather than cropping, and a portrait rig runs the
                  height of the rail.
                  44 / 40 / 36 are the numbers the percentages were computing anyway. Stated
                  outright there is nothing left to resolve, so the clip is 36px on every tile and
                  every machine, whatever its shape. */}
              {/* ── The disc keeps its padding (owner, 2026-08-27) ────────────────────────────────
                  Taking the ring off, I took the band under it off too, reasoning that with nothing
                  to separate from it would become the outline in the ring's place. That was wrong,
                  and the owner is the one who saw it: the band was not a frame, it was the disc's
                  PADDING. Without it a photograph — and much of this artwork reaches its own edges —
                  sits as a bare rectangle inside a round clip with nothing holding it.

                  The padding is back and there is still no ring, because the pad and the clip share
                  one background: no edge is drawn between them. One 56px tinted circle, with the
                  picture inset inside it. */}
              <span className="relative grid h-14 w-14 flex-none place-items-center rounded-full bg-surface p-1">
                <span className="relative h-12 w-12 rounded-full">
                  <span className={`grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-surface3 ${tile.closed ? "grayscale" : ""}`}>
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
                      <img src={img} alt="" draggable={false} className="h-12 w-12 object-contain p-1" />
                    ) : (
                      <Icon name="precision_manufacturing" size={20} className="text-muted" />
                    )}
                  </span>
                  {/* ── The unit count, and nothing else (owner, 2026-08-25) ─────────────────────
                      A bid count used to sit here and outrank the units, on the reasoning that a
                      bid is news and a count is not. The ring already carries that news: green
                      means bids are waiting. Printing the number as well spent the tile's one badge
                      slot on something said twice, and it hid the count of machines — which the
                      ring cannot say and nothing else on the rail does. */}
                  {/* ── Share, on the tile the page is showing (owner's reference, 2026-08-25) ──
                      One request is being read at a time, and the link that invites bids onto it is
                      about THAT request — so it rides its own circle rather than waiting inside the
                      drawer. It appears on the active tile only, for the same reason. */}
                  {/* ── Taking a finished request off the rail (owner, 2026-08-27) ──────────────
                      A closed or expired request has nothing left to do but take up a circle. The ×
                      hides it on this device — the request is untouched, nothing is told to the
                      backend, and another member of the firm still sees it.

                      **Only on a closed tile.** A live request that could be dismissed would be a
                      request the renter cannot get back to, and there is no undo in the rail.

                      It takes the place the share badge holds on the active tile, and the two can
                      never both apply: sharing invites bids, which a shut request cannot take. */}
                  {tile.closed && onHide && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onHide(tile.key);
                      }}
                      aria-label={t.workspace.hideRequest}
                      title={t.workspace.hideRequest}
                      className="absolute -end-1 -top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full border-2 border-surface bg-muted text-white transition hover:bg-navy"
                    >
                      <Icon name="close" size={11} />
                    </span>
                  )}
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
                  {/* ── Several MACHINES, or several of ONE (owner, 2026-08-26) ──────────────────
                      «×3» answered only the second, and answered it for both: a request for an
                      excavator, a loader and a crane summed to «×3» and read as three of something.
                      They are different facts and the tile now draws them differently — a stack for
                      a request carrying more than one line item, «×N» for one machine asked for
                      more than once.

                      The stack wins where a request is both, because its unit total is a sum across
                      unlike machines and «×5» would then describe a request nobody made. The tooltip
                      carries the words, since neither badge is large enough to say them. */}
                  {tile.items > 1 ? (
                    <span
                      className="absolute -bottom-px -end-px flex items-center gap-1 rounded-full border-2 border-surface bg-brand px-1 py-[1px] text-label font-extrabold leading-[13px] text-brand-fg"
                      title={t.workspace.itemsBadge.replace("{n}", String(tile.items))}
                    >
                      <Icon name="layers" size={9} />
                      {tile.items}
                    </span>
                  ) : tile.units > 1 ? (
                    <span
                      className="absolute -bottom-px -end-px min-w-[19px] rounded-full border-2 border-surface bg-navy px-1 text-label font-extrabold leading-[15px] text-white"
                      title={t.workspace.unitsTitle.replace("{n}", String(tile.units))}
                    >
                      {t.workspace.unitsBadge.replace("{n}", String(tile.units))}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex h-[22px] flex-col items-center">
                {/* The DATE it was raised, not the code (owner, 2026-08-27). A row of circles is read
                    in time order — the rail is newest-first — so the caption that helps is the one
                    that places the request in that order. The code is what the tile answers to on
                    hover, where it is there when it is wanted and takes no room when it is not. */}
                <span className={`max-w-[104px] truncate text-label leading-[13px] ${active ? "font-semibold text-navy" : "font-semibold text-navy-mid"}`}>
                  {raised ?? tile.label}
                </span>
                {tile.closed && (
                  <span className="text-label font-semibold uppercase leading-[9px] tracking-[.07em] text-muted">{t.workspace.closed}</span>
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
  );}

/**
 * The day a request was raised, short. «14 Aug» inside the current year, «14 Aug 24» outside it —
 * a caption on a 104px circle has room for one of those and not for both.
 */
function fmtRaised(iso: string | null, ar: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}
