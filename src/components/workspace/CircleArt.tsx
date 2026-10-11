"use client";

import { pin } from "@/lib/uiPins";
import { publicTaxonomyUrl } from "@/lib/contract/requests";
import type { RailMachine } from "@/lib/contract/workspace";
import { MachineGlyph } from "@/components/MachineGlyph";

/**
 * **A request's machines, drawn as the app's tiles inside a round hole.**
 *
 * Lifted out of `RequestRail.tsx` on 2026-09-22 (owner: *"for multi item, make sure all mutli items
 * requests are designed in this way and can show up to 3 equipments in the same background"*). It
 * was private to the rail, and the rail had stopped being the only thing that stands for a whole
 * request: the workspace's context bar draws the same group at 32px.
 *
 * ⚠️ It is SHARED now, so every ruling below reaches BOTH surfaces. Nothing here may be tuned
 * for one caller - the diameter is the only thing a caller decides, and the tiles are computed
 * from it.
 */

/**
 * How many machines one circle may show: FOUR, the app's own cap for a list thumbnail
 * (`equipment_collage.dart`, `maxPhotos: 4`), as 2 by 2 (owner, 2026-10-11, multi-item decision 1).
 * ~~3, «a fourth at 13px is a mark rather than a machine»~~ (2026-09-21): that was true of the
 * overlapping row, where four machines shared one 52px strip; in rows of tiles a fourth is a quarter.
 * The count badge still states how many lines the request really holds.
 */
export const MAX_IN_CIRCLE = 4;

/** Tiles per row for `n` machines: the app's `EquipmentCollage.rowsFor`, capped at {@link MAX_IN_CIRCLE}. */
export function rowsFor(n: number): number[] {
  if (n <= 2) return [n];
  if (n === 3) return [2, 1];
  return [2, 2];
}

/** One tile's box inside the disc, in px from the disc's top-left. */
export interface CircleTile { left: number; top: number; width: number; height: number; radius: number }

/**
 * **The app's rows, fitted INSIDE the circle** (owner, 2026-10-11, multi-item decision 1, option
 * R1). The app draws its collage in a rounded square; the web keeps the circle, so the same rows
 * (2 side by side, 2 on top and 1 centred below, 2 by 2) are laid out on a unit box and scaled until
 * the farthest tile corner sits `margin` inside the round edge. Nothing is cut by the circle; a thin
 * ring of the photo ground shows round the tiles.
 * ~~One overlapping row, each picture masked to fade into the next~~ (2026-09-22): the app tried the
 * same and dropped it on device, and none of the machines read whole.
 * ⚠️ Two machines take NO gap and no tile radius, as in the app: each is drawn whole (`contain`) in
 * its half. Three or more fill their tiles (`cover`) with a thin gap.
 */
export function circleTiles(n: number, size: number): CircleTile[] {
  const rows = rowsFor(Math.min(n, MAX_IN_CIRCLE));
  const per = Math.max(...rows);
  const unit = 100;
  const gap = n === 2 ? 0 : 2;
  const tw = (unit - gap * (per - 1)) / per;
  const th = (unit - gap * (rows.length - 1)) / rows.length;
  const boxes: [number, number, number, number][] = [];
  rows.forEach((count, ri) => {
    const rowW = count * tw + (count - 1) * gap;
    const left0 = (unit - rowW) / 2;
    for (let k = 0; k < count; k++) boxes.push([left0 + k * (tw + gap), ri * (th + gap), tw, th]);
  });
  let far = 0;
  for (const [x, y, w, h] of boxes) {
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      far = Math.max(far, Math.hypot(px - unit / 2, py - unit / 2));
    }
  }
  const r = size / 2;
  const margin = size >= 48 ? 2.5 : 1.5;
  const k = (r - margin) / far;
  return boxes.map(([x, y, w, h]) => ({
    left: r + (x - unit / 2) * k,
    top: r + (y - unit / 2) * k,
    width: w * k,
    height: h * k,
    radius: gap === 0 ? 0 : Math.max(2, Math.min(6, (h * k) / 6)),
  }));
}

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
 * **The circle draws the request's machines as the app's tiles** (owner, 2026-10-11, multi-item
 * decision 1: «same group rules as the app», kept round). See {@link circleTiles}.
 *
 * The disc is painted `--photo-ground`, the catalogue renders' own beige studio sweep (#e3ded7,
 * measured 2026-09-21), so the ring round the tiles and the halves of a pair read as one picture.
 *
 * **FOUR at most**, the app's list cap; how many lines the request really holds is the count
 * badge's job. ~~Three, side by side and fading into each other~~ (2026-09-21 / 22).
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
  const tiles = circleTiles(shown.length, size);
  return (
    <span
      {...pin("circle-art")}
      style={{ height: size, width: size }}
      className="relative block overflow-hidden rounded-full bg-photo-ground"
    >
      {shown.map((m, i) => {
        const t = tiles[i];
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={`${m.id}-${i}`}
            src={publicTaxonomyUrl(m.url) ?? ""}
            alt=""
            draggable={false}
            onError={(e) => { e.currentTarget.style.display = "none"; onBroken(m.url as string); }}
            className={`absolute ${shown.length === 2 ? "object-contain" : "object-cover"}`}
            style={{ left: t.left, top: t.top, width: t.width, height: t.height, borderRadius: t.radius }}
          />
        );
      })}
    </span>
  );
}
