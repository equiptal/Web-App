"use client";

/**
 * The little map beside an equipment's gallery — one pin, no controls worth speaking of, no route.
 *
 * It answers "roughly where is this machine" and nothing else, so it is deliberately not `MapCanvas`:
 * that canvas is a bid workspace (machine pins, availability colours, distance chips, a dotted route
 * to the project) and every one of those facts is absent here. Dragging, scroll-zoom and the keyboard
 * pan are off — the pin is the content, and a small map that swallows the page's scroll is a bug the
 * renter cannot name.
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
}: {
  lat: number;
  lng: number;
  label: string | null;
  precise: boolean;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={precise ? 13 : 10}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      keyboard={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
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
