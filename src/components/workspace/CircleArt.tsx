"use client";

import { pin } from "@/lib/uiPins";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import type { RailMachine } from "@/lib/contract/workspace";
import { MachineGlyph } from "@/components/MachineGlyph";

/**
 * **A request's machines, drawn on ONE ground inside a round hole.**
 *
 * Lifted out of `RequestRail.tsx` on 2026-09-22 (owner: *"for multi item, make sure all mutli items
 * requests are designed in this way and can show up to 3 equipments in the same background"*). It
 * was private to the rail, and the rail had stopped being the only thing that stands for a whole
 * request: the workspace's context bar draws the same group at 32px.
 *
 * ⚠️ It is SHARED now, so every ruling below reaches BOTH surfaces. Nothing here may be tuned
 * for one caller - the diameter is the only thing a caller decides, and the montage's own widths
 * are percentages so they follow it.
 */

/**
 * How many machines one circle may show (owner, 2026-09-21: *"show 3 items at most"*).
 *
 * ⚠️ At the rail's 52px a fourth is 13px wide, which is a mark rather than a machine - and the
 * count badge already states how many lines the request really holds, so nothing is hidden by
 * stopping here.
 *
 * 🔴 **It is a COUNT, not a size, so a smaller caller pays the same three ways.** The context
 * bar's disc is 32px, where three machines are ~12px each - which reads as a montage rather than
 * as three machines. That is the cost of the owner's own instruction (2026-09-22, on the bar:
 * *"mak it also show the items name in the navy card"*), and the lever if it grates is the DISC,
 * one number at that call site - never a second cap here. Two rules for one question is how the
 * rail and the bar come to disagree about what a request holds.
 */
export const MAX_IN_CIRCLE = 3;

/**
 * **How much bigger than its share each machine is drawn, and how far the next one is pulled back
 * over it** (owner, 2026-09-22: *"u can make them a little bigger and closer"*).
 *
 * At an even share the machines were small and stood apart, because each asset is shot with its own
 * margin either side - so half a circle of picture is rather less than half a circle of machine.
 * Drawing each at 132/n of the width and pulling the next back closes that gap from both ends.
 *
 * ⚠️ The two numbers are ONE decision: `SPREAD - OVERLAP` is the row's total width, 116%, at any
 * count - the boost is `SPREAD / n` and the pull-back `OVERLAP / (n - 1)`, so two machines at 66%
 * overlap by 16 and three at 44% by 8. The row therefore always oversails the disc by the same 8%
 * a side, which the round clip takes and the mask has already faded.
 *
 * ⚠️ Chosen at the real 52px, magnified 6x, against an even share and against 72/22: the wider
 * pair pushes the outer machines into the rim and the deeper overlap eats the excavator's bucket.
 */
const SPREAD = 132;
const OVERLAP = 16;

/**
 * How a machine's picture fills its hole - the rail's own ruling, in one place now that three
 * surfaces in this file draw one.
 *
 * ⚠️ A PHOTOGRAPH reaches its own edges and takes the crop; a taxonomy DRAWING carries its own
 * transparent margin, so cropping it enlarges the margin rather than the machine. 1.34 is
 * arithmetic, not taste: `contain` draws the catalogue's 1.34:1 artwork at 1/1.34 of the box's
 * height, and this puts it back. At a SQUARE source it becomes 1 - see the long note below.
 */
const fitOf = (isPhoto: boolean) => (isPhoto ? "object-cover" : "scale-[1.34] object-contain");

/**
 * **What dissolves one picture's edge into the next** (owner, 2026-09-22, twice: *"cant we merge
 * them in one background? not shown as 2 seperate imeages"*, and then *"still in the images the
 * same"* against the first attempt).
 *
 * 🔴 Matching the disc to the assets' ground was not enough, and the reason took two goes to
 * find. Every render shares one beige sweep - `--photo-ground` is its measured value - but the
 * sweep is not FLAT: it is dark at the very edge and lighter through the middle. Measured on
 * `taxonomy-icons/spider-lift`: corners #d8d4cd, mid-edge #e6e1da, centre #ddd9d2, against a disc
 * of #e3ded7. `object-contain` draws the whole file, so each machine arrived inside a rectangle
 * whose middle is paler than the disc around it - and two of those read as two pasted pictures.
 *
 * 🔴 **The first mask did nothing to the top and bottom, and that is the trap worth naming.** A
 * CSS mask is sized to the ELEMENT BOX, not to the picture inside it. With `height: 100%` the box
 * was 26x52 while `contain` drew the picture 26x19.4, so the mask's solid core spanned +/-17.9px
 * vertically and the picture only +/-9.7px: every pixel of it sat inside the solid part and its
 * horizontal edges were never touched. Measured in a browser, which is the only way to see it -
 * the source reads as though it is fading something.
 *
 * So the element must BE the picture: `height: auto` makes the box 26x19.4, and `closest-side`
 * then puts the gradient's end exactly on the picture's own edges whatever its aspect. Solid to
 * 68%, gone at the edge.
 *
 * ⚠️ **68 was chosen against 40 and 55 at the real size, magnified 9x.** All three remove the
 * rectangle; the lower two also fade the machine's extremities - the crawler's counterweight, the
 * spider lift's outriggers - for nothing.
 *
 * ⚠️ **Compared against the two alternatives at 14x** before taking the mask at all.
 * `object-cover` fills each half and so has no rectangle, at the cost of a 2.7x crop that leaves a
 * fragment of each machine and a hard vertical seam where the two meet. A top-and-bottom fade
 * closes the horizontal edges and leaves the vertical ones standing.
 *
 * ⚠️ `black` rather than a hex: a mask reads ALPHA and never hue, so the colour is arbitrary -
 * and a hex here would be a paint value to `palette-drift` that paints nothing.
 */
const CELL_MASK = "radial-gradient(closest-side, black 68%, transparent 100%)";

/**
 * **The circle draws the request's machines on ONE ground** (owner, 2026-09-21: *"cant u merge
 * their backgorudn like they sit on one background and zoom them out? show 3 items at most in the
 * circule"*).
 *
 * 🔴 ~~A grid of cells with a hairline between them and each on its own grey tile.~~ That was
 * the first cut, hours earlier, and he is right about it: four framed thumbnails in a 52px circle
 * read as four broken pictures rather than as one request holding four machines. The machines now
 * stand side by side on a single continuous ground, each whole and each at its own aspect - which
 * is what «zoom them out» asks for. How WIDE each is drawn is {@link SPREAD}'s decision.
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
export function CircleArt({
  machines,
  fallback,
  fallbackIsPhoto,
  onBroken,
  size = 52,
}: {
  machines: RailMachine[];
  fallback: string | null;
  fallbackIsPhoto: boolean;
  onBroken: (url: string) => void;
  /** The disc's diameter in px. Defaults to the rail's, which is where this began. */
  size?: number;
}) {
  const art = machines.filter((m) => m.url);
  if (art.length < 2) {
    /* The glyph follows the disc rather than the rail's own 20: at 32px a 20px icon fills the
       circle to its rim and reads as a button. 0.38 is the rail's own ratio, 20 / 52. */
    if (!fallback)
      return <MachineGlyph size={Math.round(size * 0.38)} className="text-muted" />;
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={fallback}
        alt=""
        draggable={false}
        onError={(e) => { e.currentTarget.style.display = "none"; onBroken(fallback); }}
        style={{ height: size, width: size }}
        className={`${fitOf(fallbackIsPhoto)} ${fallbackIsPhoto ? "rounded-full" : ""}`}
      />
    );
  }
  const shown = art.slice(0, MAX_IN_CIRCLE);
  return (
    /* ⚠️ `flex-none` on each picture below: the row is deliberately WIDER than the disc
       (see {@link SPREAD}), and without it flexbox would shrink every machine back to fit. */
    <span
      {...pin("circle-art")}
      style={{ height: size, width: size }}
      className="flex items-center justify-center overflow-hidden rounded-full"
    >
      {shown.map((m, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${m.id}-${i}`}
          src={publicTaxonomyUrl(m.url) ?? ""}
          alt=""
          draggable={false}
          onError={(e) => { e.currentTarget.style.display = "none"; onBroken(m.url as string); }}
          /* ⚠️ **`h-auto`, so the ELEMENT IS THE PICTURE** - which is what makes the mask work at
             all (see {@link CELL_MASK}) and is why there is no `object-fit` here: at its own aspect
             there is nothing to fit. NO scale either, unlike the single picture: the 1.34 exists to
             hide one drawing's letterbox band against the round edge, and here the neighbours are
             the rest of the band.
             ⚠️ The mask is per CELL and never on the disc: the disc's own edge is the circle,
             which is already a clean shape, and fading that would grey the rim. */
          className="h-auto flex-none"
          style={{
            width: `${SPREAD / shown.length}%`,
            ...(i > 0 ? { marginInlineStart: `-${OVERLAP / (shown.length - 1)}%` } : null),
            maskImage: CELL_MASK,
            WebkitMaskImage: CELL_MASK,
          }}
        />
      ))}
    </span>
  );
}
