"use client";

/**
 * The mark for «this firm is one of my vendors», everywhere it is said.
 *
 * The owner's own artwork (`public/vendor-mark.png`, 2026-09-03: *"use the same icon everywhere"*).
 * It replaces three different Material glyphs that had been standing in for this one idea — a
 * `verified` rosette on the filter, an `add` plus on the unset chip, a `verified` tick on the set
 * one — none of which is the mark he uses for a vendor, and two of which say «verified by
 * Moedatech», which this flag emphatically is not: it is the renter's own private label.
 *
 * A PNG rather than an SVG because that is what the artwork is. It is drawn at 14 to 16 CSS pixels
 * from a 512px source, so it stays crisp on any display.
 *
 * `currentColor` cannot reach it, so the chip's own colour does not tint the glyph. That is why it
 * is a flat black line drawing: on the soft-green chip it reads as ink, and on the dashed grey one
 * it reads the same, which is what a mark used in two states needs.
 */
export function VendorMark({ size = 14, className }: { size?: number; className?: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/vendor-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
