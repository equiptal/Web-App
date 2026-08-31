"use client";

/**
 * The storefront's own furniture: the page column, and the five glyphs the prototype draws.
 *
 * **Why not `Icon`.** The app's glyphs are Material Icons Outlined, a font. The prototype draws its
 * own paths at its own stroke weights — a 1.7px pin, a 2.6px check inside a document chip, a 3px
 * check inside a 17px circle — and a font glyph cannot be asked for those. Matching the reference
 * exactly means carrying the paths, so they live here once rather than five times across three
 * screens. `currentColor` on every stroke, so a glyph takes its colour from the text it sits in.
 *
 * These are decoration beside text that already says the thing, so each is `aria-hidden`.
 */

/** The page column: 1360 capped, 24px gutter, 24 over and 80 under (prototype geometry). */
export const SHOP_PAGE = "mx-auto w-full max-w-[1360px] px-6 pt-6 pb-20";

export function BackArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="rtl:scale-x-[-1]">
      <path d="M19 12H5M11 6L5 12L11 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PinIcon({ size = 14, strokeWidth = 1.7 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21C16 17 19 13.4 19 9.5C19 5.9 15.9 3 12 3C8.1 3 5 5.9 5 9.5C5 13.4 8 17 12 21Z" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="12" cy="9.5" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function EyeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12C3.6 7.6 7.4 5 12 5C16.6 5 20.4 7.6 22 12C20.4 16.4 16.6 19 12 19C7.4 19 3.6 16.4 2 12Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function DocIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3H15L19 7V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 12H15M9 16H15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** The tick. Three weights in the prototype: 3 in the name badge, 2.4 on a photo, 2.6 in a chip. */
export function CheckIcon({ size = 10, strokeWidth = 3 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12.5L9.5 17L19 6.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The green disc with a white tick — 17px beside a name, 22px over a photo. */
export function VerifiedDot({ size = 17 }: { size?: number }) {
  const inner = size >= 20 ? 12 : 10;
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-full bg-shop-ok text-white"
      style={{ width: size, height: size }}
    >
      <CheckIcon size={inner} strokeWidth={size >= 20 ? 2.4 : 3} />
    </span>
  );
}

/** The dark pill on a photo's bottom-left, naming the city. */
export function CityTag({ city }: { city: string }) {
  return (
    <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 rounded-shop-pill bg-shop-tag px-[9px] py-1 text-shop-tag font-extrabold text-white">
      <PinIcon size={11} strokeWidth={1.8} /> {city}
    </span>
  );
}
