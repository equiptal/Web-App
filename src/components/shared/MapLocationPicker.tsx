"use client";

// Ported from Moedatech-App apps/c-hub/components/shared/MapLocationPicker.tsx.
// react-leaflet + OpenStreetMap tiles + Nominatim geocoding (no API key). Adapted to this app's
// i18n (useT) — behavior otherwise identical to the admin panel's create-request picker.

import { useState, useCallback, useRef } from "react";
import { Search, MapPin, Loader2, Navigation } from "lucide-react";
import { parseCoordinatesFromInput } from "@/lib/parseMapUrl";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useT } from "@/lib/i18n";

// Fix default marker icon (leaflet + bundler issue)
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const RIYADH = { lat: 24.7136, lng: 46.6753 };
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

interface MapLocationPickerProps {
  value: { lat: number; lng: number } | null;
  onChange: (lat: number, lng: number, city: string) => void;
  height?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`, {
      headers: { "Accept-Language": "en" },
    });
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || data.address?.state || "";
  } catch {
    return "";
  }
}

async function forwardGeocode(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const res = await fetch(`${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=sa`, {
      headers: { "Accept-Language": "en" },
    });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
    }
  } catch {
    // ignore
  }
  return null;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapLocationPicker({ value, onChange, height = "300px" }: MapLocationPickerProps) {
  const t = useT();
  const mp = t.step1.location.mapPicker;
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      const city = await reverseGeocode(lat, lng);
      onChange(lat, lng, city);
    },
    [onChange],
  );

  const handleSearch = useCallback(async () => {
    if (!searchInput.trim()) return;
    setSearching(true);
    try {
      const parsed = parseCoordinatesFromInput(searchInput);
      if (parsed) {
        const city = await reverseGeocode(parsed.lat, parsed.lng);
        onChange(parsed.lat, parsed.lng, city);
        mapRef.current?.flyTo([parsed.lat, parsed.lng], 15);
        setSearchInput("");
        return;
      }
      const result = await forwardGeocode(searchInput);
      if (result) {
        const city = await reverseGeocode(result.lat, result.lng);
        onChange(result.lat, result.lng, city);
        mapRef.current?.flyTo([result.lat, result.lng], 15);
        setSearchInput("");
      }
    } finally {
      setSearching(false);
    }
  }, [searchInput, onChange]);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const city = await reverseGeocode(latitude, longitude);
        onChange(latitude, longitude, city);
        mapRef.current?.flyTo([latitude, longitude], 15);
      },
      () => {},
    );
  }, [onChange]);

  const center = value ?? RIYADH;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-surface ps-8 pe-3 py-2 text-sm outline-none focus:border-brand"
            placeholder={mp.searchPlaceholder}
            aria-label={mp.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching || !searchInput.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-navy px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {mp.search}
        </button>
        <button
          type="button"
          onClick={handleMyLocation}
          title={mp.useMyLocation}
          aria-label={mp.useMyLocation}
          className="flex items-center rounded-lg border border-border px-2.5 py-2 text-xs hover:bg-background"
        >
          <Navigation className="h-3.5 w-3.5 text-muted" />
        </button>
      </div>

      <div style={{ height }} className="overflow-hidden rounded-lg border border-border">
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 15 : 12} style={{ height: "100%", width: "100%" }} ref={mapRef}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              ref={markerRef}
              eventHandlers={{
                dragend: () => {
                  const marker = markerRef.current;
                  if (marker) {
                    const pos = marker.getLatLng();
                    handleMapClick(pos.lat, pos.lng);
                  }
                },
              }}
            />
          )}
          <MapClickHandler onClick={handleMapClick} />
        </MapContainer>
      </div>

      {value && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <MapPin className="h-3 w-3" />
          {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
        </div>
      )}
    </div>
  );
}
