"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";
import { PAGE_X } from "@/components/AppShell";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import { Dialog } from "@/components/Dialog";
import type { RailMachine, RailTile } from "@/lib/contract/workspace";
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
/**
 * How a machine's picture fills its hole - the rail's own ruling, in one place now that three
 * surfaces in this file draw one.
 *
 * ⚠️ A PHOTOGRAPH reaches its own edges and takes the crop; a taxonomy DRAWING carries its own
 * transparent margin, so cropping it enlarges the margin rather than the machine. 1.34 is
 * arithmetic, not taste: `contain` draws the catalogue's 1.34:1 artwork at 1/1.34 of the box's
 * height, and this puts it back. At a SQUARE source it becomes 1 - see the long note below.
 */
/**
 * How many machines a 52px circle may show (owner, 2026-09-21: *"show 3 items at most"*).
 *
 * ⚠️ A fourth is 13px wide, which is a mark rather than a machine - and the count badge already
 * states how many lines the request really holds, so nothing is hidden by stopping here.
 */
const MAX_IN_CIRCLE = 3;

const fitOf = (isPhoto: boolean) => (isPhoto ? "object-cover" : "scale-[1.34] object-contain");

/**
 * **The circle draws the request's machines on ONE ground** (owner, 2026-09-21: *"cant u merge
 * their backgorudn like they sit on one background and zoom them out? show 3 items at most in the
 * circule"*).
 *
 * 🔴 ~~A grid of cells with a hairline between them and each on its own grey tile.~~ That was
 * the first cut, hours earlier, and he is right about it: four framed thumbnails in a 52px circle
 * read as four broken pictures rather than as one request holding four machines. The machines now
 * stand side by side on a single continuous ground, each contained and scaled to its share of the
 * width - which is what «zoom them out» asks for, and what makes each one whole.
 *
 * 🔴 **The ground is `--photo-ground`, and that is what makes the merge SEAMLESS rather than
 * merely tidy.** These renders are all shot on one beige studio sweep - measured earlier today
 * across two assets, twelve samples, all within 4/255 of #e3ded7 - so images laid edge to edge on
 * a disc painted that colour have no boundary at all. Painted `surface3` instead, the pictures'
 * own beige draws a visible rectangular band across a grey circle, which is the state this
 * replaces. Seen at 9x before choosing.
 *
 * **THREE at most** (his number). A fourth machine at 13px is not a machine, and how many lines the
 * request really holds is the count badge's job, on every tile whatever this shows.
 *
 * ⚠️ It still draws only what it CAN draw: with fewer than two pictures the circle is the single
 * image it always was, because one picture beside a grey glyph is worse than the picture alone.
 */
function CircleArt({
  machines,
  fallback,
  fallbackIsPhoto,
  onBroken,
}: {
  machines: RailMachine[];
  fallback: string | null;
  fallbackIsPhoto: boolean;
  onBroken: (url: string) => void;
}) {
  const art = machines.filter((m) => m.url);
  if (art.length < 2) {
    if (!fallback) return <Icon name="precision_manufacturing" size={20} className="text-muted" />;
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={fallback}
        alt=""
        draggable={false}
        onError={(e) => { e.currentTarget.style.display = "none"; onBroken(fallback); }}
        className={`h-[52px] w-[52px] ${fitOf(fallbackIsPhoto)} ${fallbackIsPhoto ? "rounded-full" : ""}`}
      />
    );
  }
  const shown = art.slice(0, MAX_IN_CIRCLE);
  return (
    <span className="flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full">
      {shown.map((m, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${m.id}-${i}`}
          src={publicTaxonomyUrl(m.url) ?? ""}
          alt=""
          draggable={false}
          onError={(e) => { e.currentTarget.style.display = "none"; onBroken(m.url as string); }}
          /* ⚠️ `contain` and NO scale, unlike the single picture. The 1.34 exists to hide one
             drawing's letterbox band against the round edge; here the neighbours ARE the rest of the
             band, and scaling would crop each machine to its middle third for nothing. */
          className={`h-full ${m.isPhoto ? "object-cover" : "object-contain"}`}
          style={{ width: `${100 / shown.length}%` }}
        />
      ))}
    </span>
  );
}

/**
 * **The circle, big** (owner, 2026-09-21: *"clicking double on the circule open the circule image
 * big on the screen (still take me to the request clicked) but we will see the zoomed in image"*).
 *
 * ⚠️ It lists EVERY machine, including one whose picture never loaded: that line is still part
 * of the request and still has a name, and a zoomed view holding fewer machines than the ITEMS tabs
 * would repeat the montage's own compromise where there is room not to.
 *
 * ⚠️ `object-contain` and NO scale here, whatever kind of picture it is. The crop and the 1.34
 * both exist to fill a 52px ROUND hole; in a square box with room to spare they would only throw
 * the machine's edges away again.
 */
function CircleZoom({ title, machines, onClose }: { title: string; machines: RailMachine[]; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} size={machines.length > 1 ? "lg" : "md"} title={title}>
      <div className={`grid gap-4 ${machines.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {machines.map((m, i) => (
          <figure key={`${m.id}-${i}`} className="m-0">
            <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-md bg-surface2">
              {m.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={publicTaxonomyUrl(m.url) ?? ""} alt="" className="h-full w-full object-contain" />
              ) : (
                <Icon name="precision_manufacturing" size={64} className="text-muted" />
              )}
            </span>
            <figcaption className="mt-2 text-body font-semibold text-navy">
              {m.qty > 1 && <span className="tabular text-muted-dark">{m.qty} × </span>}
              {m.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </Dialog>
  );
}

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
  /** Tiles whose artwork failed to load — see the note on the `<img>` below. */
  /**
   * Artwork that answered an error, so the next render draws the glyph instead.
 *
   * 🔴 **Keyed by URL.** ~~By TILE, "because the same subtype can appear on several rows and they
   * fail together".~~ True while a tile held one picture; from 2026-09-21 a multi-item circle holds up
   * to four, and by-tile would blank every machine in the group because one of them 403'd. By URL the
   * same subtype failing on five rows still only costs that subtype - which is what the old note was
   * really after - and it is the ruling the workspace's context bar and the dashboard's bid rail both
   * already take.
   */
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  /** The circle a double-press opened, drawn large. Null when none is. */
  const [zoom, setZoom] = useState<RailTile | null>(null);

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
    /* ── The band is the SCREEN's, not a card on it (owner, 2026-09-12) ──────────────────────────
       *"can we make this header fit the whole screen no margin so like it is part of the screen not
       a card"*.

       🔴 **This reverses 2026-08-30** (*"make the bar same width and margin as the requests parent
       card so all aligned"*), and only half of it. What that ruling was really about is the
       ALIGNMENT, and that survives: the ground now reaches both window edges — no cap, no outer
       gutter, no radius, no border — while the tiles inside it keep the page's own gutter, so the
       «New» circle still starts on the same vertical as the panel below. What goes is the card:
       a bordered, rounded slab floating over the page read as a thing ON the screen rather than a
       band OF it.

       ⚠️ The bottom hairline is what stops it becoming a grey area with no edge. A band of chrome
       needs a line where the page begins; a card had a border on all four sides to do that job.

       Two elements now, not three: the row's place in the column, and the band itself carrying the
       gutter its content sits on. */
    <div {...pin("request-rail")} className="flex-none">
    <div className={`flex h-[96px] select-none items-center gap-4 overflow-hidden border-b border-border bg-surface3/60 ${PAGE_X}`}>
      <Link {...pin("rail-create-tile")} href="/create" className="group flex flex-none flex-col items-center gap-1">
        {/* The same hairline the real circles wear now, dashed — a 2px dash beside 1px solids read
            as a different control rather than an empty slot in the same set. */}
        <span className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-border text-muted transition group-hover:border-brand group-hover:text-brand">
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
          /* Both the single picture and the montage drop what has already failed, and they drop
             it by URL - see the note on `broken`. */
          const img = tile.imageUrl && broken.has(tile.imageUrl) ? null : publicTaxonomyUrl(tile.imageUrl);
          const machines = tile.machines.map((m) => (m.url && broken.has(m.url) ? { ...m, url: null } : m));
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
              /* 🔴 **A double press opens the picture AND still picks the request** (owner,
                 2026-09-21: *"still take me to the request clicked"*). `onClick` has already fired
                 twice by the time this runs, and picking the same request twice changes nothing -
                 so the selection is the single press's job and this only adds the view.
                 ⚠️ Withheld when there is nothing to enlarge: a group whose every line lost its
                 artwork would open a dialog of grey glyphs. */
              onDoubleClick={() => { if (machines.some((m) => m.url)) setZoom(tile); }}
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
              {/* ── A HAIRLINE, not a white band (owner, 2026-08-31) ──────────────────────────────
                  *"Remove the white outlines, they are too thick — keep a very thin border."*

                  The band was never a ring: it was the disc's own 4px padding, kept on 2026-08-27
                  because a photograph that reaches its own edges needs something holding it inside
                  the round clip. Both things are true, and 4px of white was the wrong amount of the
                  right idea — on a rail of eighteen circles it read as eighteen thick outlines with
                  the machines shrinking behind them.

                  1px of padding and a 1px border in the app's own border colour: the picture is held,
                  the circle has an edge, and the edge is a line rather than a band. The clip grows
                  from 48 to 52 with the space that frees, so the machines got BIGGER as the outline
                  got thinner. */}
              <span className="relative grid h-14 w-14 flex-none place-items-center rounded-full border border-border bg-surface p-px">
                <span className="relative h-[52px] w-[52px] rounded-full">
                  {/* 🔴 **The disc is painted the PHOTOGRAPHS own ground when it holds one**
                      (owner, 2026-09-21). That is what lets several machines merge into one
                      picture: these renders share a single beige studio sweep, so images laid edge
                      to edge on a disc of that colour have no boundary. On `surface3` they draw a
                      rectangular beige band across a grey circle instead - seen at 9x, and it is
                      the thing he was looking at.
                      ⚠️ The glyph fallback keeps `surface3`: a beige disc carrying a grey drawing
                      reads as a photograph that failed, which is the state it would be imitating.
                      ⚠️ `--photo-ground` is measured off the assets and is a fact about that render
                      batch rather than a colour of ours - see its note in `globals.css`. */}
                  <span className={`grid h-[52px] w-[52px] place-items-center overflow-hidden rounded-full ${img ? "bg-photo-ground" : "bg-surface3"} ${tile.closed ? "grayscale" : ""}`}>
                    {/* ── The picture, or the pictures (owner, 2026-08-25 → 2026-09-21) ─────────────
                        The markup moved into {@link CircleArt}, which is where the one-or-many
                        decision now lives. Nothing about the FIT changed and the reasoning behind
                        it is worth keeping here, because it is the thing most likely to be
                        "simplified" back into one rule:

                        ── Which fit, decided by which PICTURE it is (owner, 2026-08-31) ──────────
                        *"I want it zoomed in so it fits in a circle."* A photograph reaches its own
                        edges, so `contain` left it as a 3:2 band across a round hole with tinted
                        crescents above and below. `cover` fills the mask and crops the sides, which
                        is what a photograph wants. An ICON is a drawing carrying its own transparent
                        margin, and cropping one enlarges the margin rather than the machine - so
                        each takes the fit it needs instead of one rule being wrong for half the
                        catalogue. `imageIsPhoto` is what tells them apart.

                        ── The DRAWING fills its circle too (owner, 2026-09-12) ───────────────
                        *"make sure all photos fit well in the circle, as some have squared edges and
                        some fit well."* The drawings are WIDE, so `contain` in a 52px box drew them
                        52×28 - a letterbox whose straight top and bottom edge showed through the
                        round hole. That edge is the «squared» one. `p-1` made it worse by shrinking
                        the box first; the padding is gone and the drawing is scaled to the circle's
                        diameter.

                        ⚠️ **RE-MEASURED 2026-09-14: the whole catalogue is 2400×1792 (1.34:1)** - all
                        94 illustrated nodes, one size, checked against the live tree. 1.34 survives
                        by arithmetic rather than by luck: `contain` draws a 1.34:1 picture 52×38.8
                        in this box, and 52 ÷ 38.8 = 1.34. Anyone re-cutting the assets must
                        recompute it; at a SQUARE source it is 1.
                        ⚠️ 2400×1792 for a 52px circle is ~2,100× the pixels this tile can show. The
                        ideal source here is **square, 104×104** (52 at 2×).
                        ⚠️ It is NOT switched to `object-cover` for drawings: tried on the live rail
                        and the crop cut the machine into an unreadable jumble.

                        ⚠️ `onError` is the only signal available and it is load-bearing, not
                        defensive: the taxonomy objects are not public-read on staging, so a
                        well-formed URL answers 403 and an `<img>` absorbs that as «no artwork» -
                        drawing a broken-image glyph, which is worse than the icon it replaced. */}
                    <CircleArt
                      machines={machines}
                      fallback={img}
                      fallbackIsPhoto={tile.imageIsPhoto}
                      onBroken={(url) => setBroken((b) => new Set(b).add(url))}
                    />
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
                      never both apply: sharing invites bids, which a shut request cannot take.

                      ~~That last sentence was a claim, not a rule.~~ Both badges sat at the same
                      `-end-1 -top-1`, so on a tile that was BOTH active and closed they stacked and
                      share painted over the ✕ — the owner's screenshot, 2026-08-31: a request reading
                      «Closed» offering to be shared for bids it can no longer receive. The share badge
                      now carries `!tile.closed` so the rule is enforced where it is stated. */}
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
                      className="absolute -end-1 -top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-full border border-surface bg-muted text-white transition hover:bg-navy"
                    >
                      <Icon name="close" size={11} />
                    </span>
                  )}
                  {active && !tile.closed && onShare && (
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShare();
                      }}
                      aria-label={t.workspace.shareRequest}
                      title={t.workspace.shareRequest}
                      /* A hairline collar, like the circle's own edge — `border-2` put a 2px white
                         ring on a 20px badge, which is a tenth of it. */
                      className="absolute -end-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-surface bg-navy text-white transition hover:bg-navy-mid"
                    >
                      <Icon name="ios_share" size={12} className="font-normal" />
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
                      /* `font-semibold`, not `font-extrabold` (owner, 2026-08-31: *"the font for the
                         unit or multi-item badge is thick, make it thinner"*). At 10px on a coloured
                         pill, 800 renders as a blob; 600 is legible and stops shouting. */
                      className="absolute -bottom-px -end-px flex items-center gap-1 rounded-full border border-surface bg-brand px-1 py-[1px] text-label font-semibold leading-[13px] text-brand-fg"
                      title={t.workspace.itemsBadge.replace("{n}", String(tile.items))}
                    >
                      <Icon name="layers" size={9} />
                      {tile.items}
                    </span>
                  ) : tile.units > 1 ? (
                    <span
                      className="absolute -bottom-px -end-px min-w-[19px] rounded-full border border-surface bg-navy px-1 text-label font-semibold leading-[15px] text-white"
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
                  /* Sentence case (owner, 2026-08-30: *"make closed smaller and not capitalized"*).
                       Dropping the caps and the letter-spacing IS the reduction: `text-label` is the
                       smallest of the scale's six steps, so there is no smaller size to take, and a
                       lowercase word at 11px reads markedly smaller than the same word in tracked
                       caps. The caps came with the token, which is a SECTION label — this is a
                       footnote on a request nobody is bidding on. `leading-[9px]` is
                       untouched on purpose: the label block is a fixed 13 + 9 = 22px so that every
                       tile is the same height and one `items-center` lands every circle on the same
                       line. Change the leading and the circles stop agreeing with each other. */
                  <span className="text-label font-semibold leading-[9px] text-muted">{t.workspace.closed}</span>
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
    {/* ⚠️ Mounted at the rail's ROOT, outside the scroller and outside the 96px band. That band is
        `overflow-hidden`; a `position: fixed` layer escapes an overflow clip (only a transformed
        or filtered ancestor would trap it, and this one has neither), but a dialog rendered inside
        a horizontally scrolling strip would also travel with it, which is the real reason. */}
    {zoom && (
      <CircleZoom
        title={zoom.label}
        machines={zoom.machines.map((m) => (m.url && broken.has(m.url) ? { ...m, url: null } : m))}
        onClose={() => setZoom(null)}
      />
    )}
    </div>
  );
}

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
