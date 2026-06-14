"use client";

// Ported from Moedatech-App apps/c-hub/components/shared/MapLocationPicker.tsx.
// react-leaflet + OpenStreetMap tiles + Nominatim geocoding (no API key). Adapted to this app's
// i18n (useT). Search is a type-ahead: as the renter types we show place suggestions (same shape as
// the app's picker) and selecting one sets the location with its full address as the label.

import { useState, useCallback, useRef, useEffect } from "react";
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

interface Suggestion {
  lat: number;
  lng: number;
  /** Full address line (what we show + store as the location label). */
  display: string;
  /** Short headline (first segment) for emphasis in the dropdown. */
  primary: string;
}

interface MapLocationPickerProps {
  value: { lat: number; lng: number } | null;
  /** Current confirmed/typed address label, shown as the chosen-location text. */
  label?: string | null;
  onChange: (lat: number, lng: number, address: string) => void;
  height?: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
      headers: { "Accept-Language": "en" },
    });
    const data = await res.json();
    return data.display_name || data.address?.city || data.address?.town || data.address?.village || "";
  } catch {
    return "";
  }
}

/** Type-ahead place search (multiple results), Saudi-scoped — the suggestions shown as you type. */
async function searchSuggestions(query: string): Promise<Suggestion[]> {
  try {
    const res = await fetch(
      `${NOMINATIM_URL}/search?format=json&q=${encodeURIComponent(query)}&limit=6&countrycodes=sa&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return data.map((d) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      display: d.display_name,
      primary: d.display_name.split(",")[0],
    }));
  } catch {
    return [];
  }
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapLocationPicker({ value, label, onChange, height = "300px" }: MapLocationPickerProps) {
  const t = useT();
  const mp = t.step1.location.mapPicker;
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const reqId = useRef(0); // guards against out-of-order autocomplete responses
  const [resolved, setResolved] = useState<string | null>(null); // reverse-geocoded address for the current coords
  const [resolving, setResolving] = useState(false);
  const resolvedKey = useRef("");

  // Reverse-geocode whatever coordinates are set so the displayed address ALWAYS matches the exact
  // point (numbers). The agent's label can be coarse (e.g. "Riyadh" for the city centroid) while the
  // point itself is a specific street — so the resolved address of the coords wins. While it resolves
  // we show a "locating" hint (not the coarse label) to avoid a text/number mismatch on first load.
  useEffect(() => {
    if (!value) {
      setResolved(null);
      setResolving(false);
      resolvedKey.current = "";
      return;
    }
    const key = `${value.lat.toFixed(6)},${value.lng.toFixed(6)}`;
    if (key === resolvedKey.current) return;
    resolvedKey.current = key;
    let alive = true;
    setResolved(null);
    setResolving(true);
    reverseGeocode(value.lat, value.lng).then((addr) => {
      if (!alive) return;
      setResolved(addr || null);
      setResolving(false);
    });
    return () => {
      alive = false;
    };
  }, [value]);

  const select = useCallback(
    (lat: number, lng: number, address: string) => {
      onChange(lat, lng, address);
      mapRef.current?.flyTo([lat, lng], 15);
      setOpen(false);
      setSuggestions([]);
      setSearchInput(""); // the chosen place is shown below the map, not left in the box
    },
    [onChange],
  );

  // Debounced type-ahead. Coordinate/Maps-link pastes skip suggestions (resolved on Enter instead).
  useEffect(() => {
    const q = searchInput.trim();
    if (q.length < 3 || parseCoordinatesFromInput(q)) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchSuggestions(q);
      if (id !== reqId.current) return; // a newer keystroke superseded this
      setSuggestions(results);
      setOpen(true);
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      const address = await reverseGeocode(lat, lng);
      onChange(lat, lng, address);
    },
    [onChange],
  );

  // Enter: resolve a pasted coordinate/link, else take the first suggestion.
  const handleEnter = useCallback(async () => {
    const q = searchInput.trim();
    if (!q) return;
    const parsed = parseCoordinatesFromInput(q);
    if (parsed) {
      const address = await reverseGeocode(parsed.lat, parsed.lng);
      select(parsed.lat, parsed.lng, address || q);
      return;
    }
    if (suggestions[0]) select(suggestions[0].lat, suggestions[0].lng, suggestions[0].display);
  }, [searchInput, suggestions, select]);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        onChange(latitude, longitude, address);
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
            className="w-full rounded-lg border border-border bg-surface ps-8 pe-8 py-2 text-sm outline-none focus:border-brand"
            placeholder={mp.searchPlaceholder}
            aria-label={mp.searchPlaceholder}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleEnter();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {searching && <Loader2 className="absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" />}

          {/* Type-ahead suggestions — clear, full address per row. */}
          {open && suggestions.length > 0 && (
            <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
              {suggestions.map((s, i) => (
                <li key={`${s.lat},${s.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => select(s.lat, s.lng, s.display)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-start text-sm hover:bg-surface2"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.primary}</span>
                      <span className="block truncate text-xs text-muted">{s.display}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

      {/* Chosen location as TEXT (the address), with coordinates as a secondary line. */}
      {value && (
        <div className="flex items-start gap-1.5 rounded-lg border border-border bg-surface2 px-3 py-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold leading-tight">
              {resolved || (resolving ? mp.locating : label?.trim() || mp.pinnedNoAddress)}
            </div>
            <div className="text-[11px] text-muted">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
