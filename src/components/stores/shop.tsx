"use client";

import { useState } from "react";

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

/**
 * The page column: 1360 capped, a 24px gutter, 80px of foot.
 *
 * The TOP is the caller's, because the reference does not use one number: the directory opens at 36
 * and the two detail pages at 24 — a page that begins with a title needs more air over it than one
 * that begins with a back link.
 */
export const SHOP_PAGE = "mx-auto w-full max-w-[1360px] px-6 pb-20";

/**
 * A logo that steps aside when the object is not there.
 *
 * A signed S3 URL is not a promise that the file exists: on staging five stores' logos answer 404
 * (the row points at a key the bucket never received), and an `<img>` whose src 404s draws the
 * browser's own broken-glyph-and-alt-text — the worst possible answer, because it looks like OUR
 * bug on a card that is otherwise fine. The initials mark is what a store with no logo already gets,
 * so a logo that fails to load simply becomes a store with no logo.
 *
 * `object-contain`, never `cover`: a supplier's mark is a shape with its own proportions, and
 * cropping it to fill a square cuts the wordmark off half these logos.
 */
export function ShopLogo({
  src,
  name,
  className,
  initialClassName,
}: {
  src: string | null;
  name: string;
  /** The box. Size, radius and any ground colour belong here. */
  className: string;
  /** The same box when it has to draw a letter instead — it needs a text size and a ground. */
  initialClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} onError={() => setFailed(true)} className={`${className} object-contain`} />;
  }
  return <span className={initialClassName}>{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

/**
 * A photograph that leaves its ground showing when the object is missing.
 *
 * Same fault as above, different answer: a machine with no photograph is drawn as the grey ground
 * its card already has, so the caller renders this INSIDE that ground and gets the fallback for
 * free. `null` rather than a placeholder image, because the ground is the placeholder.
 */
export function ShopPhoto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={className ?? "h-full w-full object-cover"} />;
}

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

/** The price mark: a circled «i», because a price on request is a note rather than a number. */
export function PriceIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

/** The shop, on the button that opens one. */
export function StorefrontIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 10V20H20V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 10L4.5 4H19.5L21 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M3 10C3 11.4 4.1 12.5 5.5 12.5C6.9 12.5 8 11.4 8 10C8 11.4 9.1 12.5 10.5 12.5C11.9 12.5 13 11.4 13 10C13 11.4 14.1 12.5 15.5 12.5C16.9 12.5 18 11.4 18 10C18 11.4 19.1 12.5 20.5 12.5C21.4 12.5 22.2 12 22.6 11.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M10 20V15H14V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The camera, over a photo count. */
export function CameraIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/** The green disc with a white tick — 15px on the sheet, 17px beside a name, 22px over a photo. */
export function VerifiedDot({ size = 17 }: { size?: number }) {
  const inner = size >= 20 ? 12 : size <= 15 ? 9 : 10;
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
