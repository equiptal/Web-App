"use client";

/**
 * RMAP T12 — the map itself. **State 1 only: the project-location pin and nothing else.**
 *
 * There are no supplier pins and no bid pins, ever (AC-72, §6.2): supplier company coordinates are not
 * reliable enough to plot, and a pin in roughly the wrong place invites distance judgements that are
 * wrong. Machine pins arrive on supplier selection in T16, which needs the §7.12 fleet endpoint that
 * has not shipped — so this file draws one marker and deliberately stops there.
 *
 * Leaflet renders its own LTR canvas, so every pin's CONTENT sets `direction: rtl` explicitly rather
 * than inheriting the shell's (AC-30, AC-98) — see `.bm-sitepin` in `map-proto.css`.
 *
 * SSR: `leaflet` touches `window` at import time, so this module is only ever reached through
 * `dynamic(..., { ssr: false })` in `BidMapWorkspace` — the same handling `MapLocationPicker` needed.
 */

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocale, useT } from "@/lib/i18n";

export interface SitePoint {
  lat: number;
  lng: number;
}

/** Saudi Arabia, roughly — the fallback view for a request with no project location (AC-21). The map
 *  still renders; it simply has nothing to centre on, and the panel's distances read «—». */
const FALLBACK_CENTRE: [number, number] = [24.0, 45.0];
const FALLBACK_ZOOM = 5;
const SITE_ZOOM = 11;

/** The site label is i18n copy plus, optionally, the request's own address string — which is user
 *  data going into `divIcon`'s HTML. Escape it rather than trusting it. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Fit the view to the site. One point, so this is a centre + a sensible zoom rather than a bounds fit;
 *  when fleet pins land (T16) this becomes `fitBounds` over the site plus the plotted machines. */
function FitSite({ site }: { site: SitePoint | null }) {
  const map = useMap();
  useEffect(() => {
    if (site) map.setView([site.lat, site.lng], SITE_ZOOM, { animate: false });
    else map.setView(FALLBACK_CENTRE, FALLBACK_ZOOM, { animate: false });
  }, [site, map]);
  return null;
}

export default function MapCanvas({ site, addressLabel }: { site: SitePoint | null; addressLabel?: string | null }) {
  const t = useT();
  const { dir } = useLocale();

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "", // no Leaflet default box — the pin is entirely our own markup
        iconSize: [140, 46],
        iconAnchor: [70, 18],
        html:
          `<div class="bm-sitepin" dir="rtl" style="direction:rtl">` +
          `<span class="bm-sitedot"></span>` +
          `<span class="bm-sitelabel">${esc(t.bidMap.yourSite)}${addressLabel ? ` · ${esc(addressLabel)}` : ""}</span>` +
          `</div>`,
      }),
    [t.bidMap.yourSite, addressLabel],
  );

  return (
    <div className="bm-leaflet">
      <MapContainer
        center={site ? [site.lat, site.lng] : FALLBACK_CENTRE}
        zoom={site ? SITE_ZOOM : FALLBACK_ZOOM}
        zoomControl={false}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Opposite the bid panel, which sits on the inline-end edge — otherwise the zoom buttons land
            underneath it in Arabic, where inline-end is the physical left. */}
        <ZoomControl position={dir === "rtl" ? "topright" : "topleft"} />
        {site && <Marker position={[site.lat, site.lng]} icon={icon} interactive={false} />}
        <FitSite site={site} />
      </MapContainer>
    </div>
  );
}
