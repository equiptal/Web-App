"use client";

import { useState } from "react";

import { Photo } from "@/components/Photo";

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
 * A supplier's mark, in a box the caller sizes.
 *
 * A signed S3 URL is not a promise that the file exists: 37 of 60 stores on staging answer 404,
 * because the row points at a key the bucket never received. `Photo` turns that into the app's one
 * placeholder (owner, 2026-09-02: *"use it all for any missing image in the system"*) instead of the
 * browser's broken glyph, and instead of the initials mark this carried for a day — one answer
 * everywhere beats a different one per surface.
 *
 * `object-contain`, never `cover`: a mark is a shape with its own proportions, and cropping it to
 * fill a square cuts the company name off half of these.
 *
 */
export function ShopLogo({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  /** The box. Size, radius and any ground colour belong here. */
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <span className={`${className} grid place-items-center overflow-hidden`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} onError={() => setFailed(true)} className="h-full w-full object-contain" />
      </span>
    );
  }
  /* ⚠️ **A missing LOGO is not a missing photograph.** The app's placeholder is the platform's own
     artwork and it reads «No Equipment Photo Available» — true on a machine's tile, false and
     confusing in a 24px chip beside a supplier's name. A mark we do not have becomes the store's
     own initial, which at least says WHICH supplier is missing one. */
  return (
    <span className={`${className} grid place-items-center overflow-hidden bg-shop-fill font-shop-bold text-shop-ink`}>
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/** A machine's photograph, in a box the caller sizes. The same placeholder answers for all of them. */
export function ShopPhoto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return <Photo src={src} alt={alt} className={className ?? "h-full w-full object-cover"} />;
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

/** Two corners pulling apart — the control that opens the map full size. */
export function ExpandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 9V4H9M20 15V20H15M20 9V4H15M4 15V20H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** An arrow leaving its box — a link that opens somewhere that is not this app. */
export function ExternalIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="rtl:scale-x-[-1]">
      <path d="M14 4H20V10M20 4L11 13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 15V19C18 19.6 17.6 20 17 20H5C4.4 20 4 19.6 4 19V7C4 6.4 4.4 6 5 6H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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
