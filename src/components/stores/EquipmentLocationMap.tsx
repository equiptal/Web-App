"use client";

/**
 * The map beside an equipment's gallery, and the same map full-size in a dialog.
 *
 * It is a REAL map now (owner, 2026-09-03): drag, zoom, double-click, the zoom control and OSM's
 * attribution are all on. It was frozen — every interaction disabled — on the theory that a small
 * panel is a picture of a place rather than a place. That is wrong in the one case the panel exists
 * for: a renter asking *where is this, exactly* wants to pull the map about and see what is around
 * it, and a map that refuses is furniture.
 *
 * **Scroll-wheel zoom stays off** and is the one exception, because it is the one interaction the
 * renter does not ask for: a wheel over a map inside a scrolling page swallows the page's scroll and
 * the reader loses their place. `Ctrl`/`⌘` + wheel still zooms (leaflet's own behaviour), the ± are
 * always there, and the expand control opens a map where the wheel is free.
 *
 * `leaflet` touches `window` at import time, so the page reaches this module through
 * `dynamic(..., { ssr: false })`, the same handling `MapCanvas` and `MapLocationPicker` need.
 */

import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default marker icon (leaflet + bundler issue) — same fix, same CDN paths, as MapLocationPicker.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function EquipmentLocationMap({
  lat,
  lng,
  label,
  /** Yard coordinates get a close view; a city centroid gets a city-wide one — the zoom states which. */
  precise,
  /** The expanded copy: the wheel zooms, and the attribution has room to sit. */
  expanded = false,
}: {
  lat: number;
  lng: number;
  label: string | null;
  precise: boolean;
  expanded?: boolean;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={precise ? 14 : 10}
      style={{ height: "100%", width: "100%" }}
      zoomControl
      scrollWheelZoom={expanded}
      dragging
      doubleClickZoom
      keyboard
      attributionControl={expanded}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        {label && (
          <Tooltip direction="top" offset={[0, -34]} permanent>
            {label}
          </Tooltip>
        )}
      </Marker>
    </MapContainer>
  );
}
