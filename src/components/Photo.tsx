"use client";

import { useState } from "react";

/**
 * The app's one answer to a picture that is not there.
 *
 * Three things used to happen instead, on three screens: the browser's own broken glyph with the alt
 * text beside it (a store logo whose object 404s — 37 of 60 on staging), a sentence in a box («No
 * photo on this equipment's file»), and a coloured category icon standing in for a photograph. The
 * first reads as OUR bug, the second is a paragraph where a picture should be, and the third asserts
 * something the file does not say. This says the one true thing — there is no image here — in the
 * only register a missing image should use: quiet, grey, and the shape of a photograph.
 *
 * Drawn rather than fetched. A placeholder that is itself an HTTP request is a placeholder that can
 * fail, and the whole point is the case where a request already failed.
 */
export function PhotoPlaceholder({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`grid h-full w-full place-items-center bg-surface2 text-border-strong ${className}`}>
      <svg width={size} height={size * (44 / 56)} viewBox="0 0 56 44" fill="none" aria-hidden>
        <rect x="1.5" y="1.5" width="53" height="41" rx="5" stroke="currentColor" strokeWidth="3" />
        <circle cx="17" cy="15" r="5" fill="currentColor" />
        <path d="M8 36L22 20L34 34L40 27L48 36H8Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * An image that becomes {@link PhotoPlaceholder} when it is missing or fails to load.
 *
 * `src` null and `onError` are the same state deliberately: a row that names no photograph and a row
 * naming one the bucket does not hold are the same fact to a reader, and telling them apart on
 * screen would only invite the question of which is which.
 *
 * The BOX belongs to the caller — size, radius, overflow — because a thumbnail, a card's 16:11 tile
 * and a 420px gallery need different ones and none of them is this component's business. What it
 * guarantees is that both branches fill that box.
 */
export function Photo({
  src,
  alt,
  className = "h-full w-full object-cover",
  placeholderSize,
}: {
  src: string | null | undefined;
  alt: string;
  /** Classes for the `<img>` itself. Defaults to filling and cropping, which is what a tile wants. */
  className?: string;
  /** The glyph's width in px. Give a small box a small glyph — the default suits a card. */
  placeholderSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <PhotoPlaceholder size={placeholderSize} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}
