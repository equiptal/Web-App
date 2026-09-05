"use client";

import { useState } from "react";

/**
 * The app's one answer to a picture that is not there, and it is the platform's OWN artwork.
 *
 * `public/equipment-no-photo.png` is the file the backend already stores on listings whose supplier
 * has not sent a photograph — the Moedatech mark, a struck-through camera, «No Equipment Photo
 * Available / Photo pending from supplier». It was pulled from the staging bucket
 * (`1784579218099-stock-no-equipment-photo.png`) and committed here so the web draws the same thing.
 *
 * ~~A grey SVG frame drawn in code.~~ Withdrawn 2026-09-04: it meant a renter saw TWO different
 * "no photo" states side by side on one row of cards — ours where the row named no photograph, and
 * the backend's where somebody had uploaded this file as the photograph. Same fact, two faces, and
 * neither one wrong on its own. One face now, and it is the one the data already speaks.
 *
 * ⚠️ **It is a request, and a request can fail.** That is the trade this replaces a drawn glyph
 * with: a local `/public` asset is served by the app itself rather than by S3, so it fails only if
 * the app itself is unreachable, in which case the card is not being drawn either. The `onError`
 * below is the last resort, and it falls back to the flat ground rather than to a broken icon.
 */
const NO_PHOTO_SRC = "/equipment-no-photo.png";

export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`block h-full w-full bg-surface2 ${className}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={NO_PHOTO_SRC}
      alt=""
      onError={() => setFailed(true)}
      /* `contain` on the app's ground, never `cover`: the artwork carries words, and cropping them
         is how a placeholder starts looking like a broken photograph. */
      className={`h-full w-full bg-surface2 object-contain ${className}`}
    />
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
}: {
  src: string | null | undefined;
  alt: string;
  /** Classes for the `<img>` itself. Defaults to filling and cropping, which is what a tile wants. */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <PhotoPlaceholder />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setFailed(true)} className={className} />;
}
