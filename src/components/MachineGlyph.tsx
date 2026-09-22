/**
 * **The machine that stands in when the catalogue has no picture** (owner, 2026-09-22, on a rail
 * tile drawing the grey robot arm: *"use nice icons not this"*, choosing a drawn SVG over another
 * Material glyph).
 *
 * 🔴 ~~`precision_manufacturing`~~, Material's articulated ROBOT ARM. It is a factory machine and
 * this product rents earthmoving plant, so it answered a different question — and `RequestCard.tsx`
 * has carried a note about exactly this since 2026-08-11: *"a robot arm on an excavator"*.
 *
 * ⚠️ **It stands in for a TAXONOMY DRAWING, so it is drawn like one.** Those assets are flat,
 * SIDE-ON machine renders; a three-quarter view, or a badge in a box, would read as a different
 * product the moment one row has a picture and the row under it does not.
 *
 * ⚠️ **Filled shapes plus TWO thick strokes, never a thin line drawing.** It is asked for at 14px
 * (the item tier), 16px (the machine card's row), 20px (the details modal and inside the rail's
 * 52px disc) and 64px (the zoomed view). A 1px-stroke drawing survives the last and turns to mush at
 * the first, so nothing here is under 2.2 units of a 24 grid — 1.3px at the smallest call.
 *
 * ⚠️ **`currentColor`, never a token and never a hex.** Every call site already paints it
 * (`text-muted`, `text-muted-light`), a colour named here is one `palette-drift` would have to be
 * told about, and it would be one no caller could override.
 *
 * ⚠️ **No shadow, no glow, no ring** — the standing rule of 2026-09-17.
 *
 * ⚠️ **SEEN RENDERED before it shipped**, at all five sizes and inside the real 52px disc at 1x, 3x
 * and 6x. Two things were fixed by looking rather than by reasoning: the boom did not touch the
 * house, and the bucket floated clear of the dipper — at 6x it read as three parts, not a machine.
 */
export function MachineGlyph({
  size = 24,
  className,
}: {
  /** Drawn square at this many px. The call site decides it, exactly as it did for the glyph. */
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* The tracks: one chunky round-capped bar, and the widest thing on the machine. That is what
          makes the silhouette read as PLANT rather than as a vehicle. */}
      <path d="M3.6 20.2h8.8" strokeWidth="3.2" strokeLinecap="round" />
      {/* The house, then the cab stepped up on its leading edge. Filled rather than outlined: at
          14px a box this size closes up into a solid anyway, and the outline only muddies it. */}
      <path d="M3.4 12.4h8a1.2 1.2 0 0 1 1.2 1.2v4H2.2v-4a1.2 1.2 0 0 1 1.2-1.2Z" fill="currentColor" stroke="none" />
      <path d="M4 8.4h3.8a1.2 1.2 0 0 1 1.2 1.2v2.8H2.8V9.6A1.2 1.2 0 0 1 4 8.4Z" fill="currentColor" stroke="none" />
      {/* Boom and dipper, one folded stroke STARTING INSIDE THE HOUSE. This diagonal is the whole
          identification: it is the only part of the silhouette no other machine in the catalogue
          has, and a version that began at the house's edge left a visible gap at 6x. */}
      <path d="M11.6 12.6 16.8 6.6l3.9 5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* The bucket, OVERLAPPING the dipper's round cap. Hung a unit lower it floated, and the
          machine read as three separate marks. */}
      <path d="M19 12.3h3.6l-1 3.5h-1.7Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
