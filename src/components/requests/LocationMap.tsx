"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef } from "react";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** Load the Maps JS script once (same pattern as the location picker). */
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise<void>((resolve, reject) => {
      const existing = document.getElementById("gmaps-js");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        return;
      }
      const s = document.createElement("script");
      s.id = "gmaps-js";
      s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&language=en`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Google Maps failed to load"));
      document.head.appendChild(s);
    });
  }
  return mapsPromise;
}

/** Read-only map preview pinned at the project location — mirrors the app's location card. */
export function LocationMap({ lat, lng, height = 160 }: { lat: number; lng: number; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        const g = (window as any).google;
        const center = { lat, lng };
        const map = new g.maps.Map(ref.current, {
          center,
          zoom: 13,
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
        });
        new g.maps.Marker({ position: center, map });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);
  if (!KEY) return null;
  return <div ref={ref} style={{ height, width: "100%" }} />;
}
