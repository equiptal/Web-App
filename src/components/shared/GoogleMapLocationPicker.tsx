"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Google Maps JS location picker (web-app/002). Drop-in replacement for MapLocationPicker with the
// same props/contract — map render + click-to-pin + draggable marker + type-ahead search + reverse
// geocode, all client-side with NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
//
// Search uses the Geocoding API (forward geocode), NOT the Places Autocomplete widget: the app key
// allows Maps JS + Geocoding but blocks the Places API (ApiTargetBlockedMapError). If "Places API"
// is later enabled on the key, this can switch to google.maps.places.Autocomplete.

import { useEffect, useRef, useState, useCallback } from "react";
import { Search, MapPin, Loader2, Navigation } from "lucide-react";
import { parseCoordinatesFromInput } from "@/lib/parseMapUrl";
import { useT } from "@/lib/i18n";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const RIYADH = { lat: 24.7136, lng: 46.6753 };

/** Load the Maps JS script once. */
let mapsPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (!mapsPromise) {
    mapsPromise = new Promise<void>((resolve, reject) => {
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

interface Suggestion {
  lat: number;
  lng: number;
  display: string;
  primary: string;
}

interface MapLocationPickerProps {
  value: { lat: number; lng: number } | null;
  label?: string | null;
  onChange: (lat: number, lng: number, address: string) => void;
  height?: string;
  /**
   * Suppress the resolved-address line under the map.
   *
   * For a caller that needs the address on ONE row with a control of its own beside it. The line is
   * not moved into a slot here on purpose: this component is `next/dynamic` and renders as nothing until
   * it loads (and as nothing at all under jsdom), so anything gating a step must not live inside it.
   */
  hideAddress?: boolean;
}

export default function GoogleMapLocationPicker({ value, label, onChange, height = "300px", hideAddress }: MapLocationPickerProps) {
  const t = useT();
  const mp = t.step1.location.mapPicker;

  const mapDiv = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const marker = useRef<any>(null);
  const geocoder = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const reqId = useRef(0); // guards out-of-order search responses

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const reverseGeocode = useCallback((lat: number, lng: number): Promise<string> => {
    return new Promise((resolve) => {
      if (!geocoder.current) return resolve("");
      geocoder.current.geocode({ location: { lat, lng } }, (results: any, status: string) =>
        resolve(status === "OK" && results?.[0] ? results[0].formatted_address : ""),
      );
    });
  }, []);

  // Forward geocode (search): a place/address string → matching results (Saudi-scoped).
  const geocodeSearch = useCallback((query: string): Promise<Suggestion[]> => {
    return new Promise((resolve) => {
      if (!geocoder.current) return resolve([]);
      geocoder.current.geocode(
        { address: query, componentRestrictions: { country: "sa" } },
        (results: any[], status: string) => {
          if (status !== "OK" || !results) return resolve([]);
          resolve(
            results.slice(0, 6).map((r) => ({
              lat: r.geometry.location.lat(),
              lng: r.geometry.location.lng(),
              display: r.formatted_address,
              primary: r.formatted_address.split(",")[0],
            })),
          );
        },
      );
    });
  }, []);

  const placeMarker = useCallback(
    (lat: number, lng: number) => {
      const g = (window as any).google;
      if (!map.current || !g) return;
      if (!marker.current) {
        marker.current = new g.maps.Marker({ map: map.current, draggable: true, position: { lat, lng } });
        marker.current.addListener("dragend", async () => {
          const p = marker.current.getPosition();
          const la = p.lat();
          const ln = p.lng();
          onChangeRef.current(la, ln, await reverseGeocode(la, ln));
        });
      } else {
        marker.current.setPosition({ lat, lng });
      }
    },
    [reverseGeocode],
  );

  const select = useCallback(
    (lat: number, lng: number, address: string) => {
      placeMarker(lat, lng);
      map.current?.panTo({ lat, lng });
      map.current?.setZoom(15);
      onChangeRef.current(lat, lng, address);
      setOpen(false);
      setSuggestions([]);
      setSearchInput("");
    },
    [placeMarker],
  );

  // Initialise the map once the script is loaded.
  useEffect(() => {
    let alive = true;
    loadMaps()
      .then(() => {
        if (!alive || !mapDiv.current) return;
        const g = (window as any).google;
        geocoder.current = new g.maps.Geocoder();
        const center = value ?? RIYADH;
        map.current = new g.maps.Map(mapDiv.current, {
          center,
          zoom: value ? 15 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        if (value) placeMarker(value.lat, value.lng);
        map.current.addListener("click", async (e: any) => {
          const la = e.latLng.lat();
          const ln = e.latLng.lng();
          placeMarker(la, ln);
          onChangeRef.current(la, ln, await reverseGeocode(la, ln));
        });
        setReady(true);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external value changes (e.g. the agent-extracted location) onto the map.
  useEffect(() => {
    if (!ready || !value || !map.current) return;
    placeMarker(value.lat, value.lng);
    map.current.panTo(value);
  }, [ready, value, placeMarker]);

  // Reverse-geocode the current coords so the displayed address matches the exact pin.
  useEffect(() => {
    if (!ready || !value) {
      setResolved(null);
      setResolving(false);
      return;
    }
    let alive = true;
    setResolving(true);
    setResolved(null);
    reverseGeocode(value.lat, value.lng).then((addr) => {
      if (!alive) return;
      setResolved(addr || null);
      setResolving(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, value, reverseGeocode]);

  // Debounced type-ahead. Coordinate/Maps-link pastes skip suggestions (resolved on Enter instead).
  useEffect(() => {
    const q = searchInput.trim();
    if (!ready || q.length < 3 || parseCoordinatesFromInput(q)) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      const results = await geocodeSearch(q);
      if (id !== reqId.current) return;
      setSuggestions(results);
      setOpen(true);
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, ready, geocodeSearch]);

  // Enter: resolve a pasted coordinate/link, else take the first suggestion.
  const handleEnter = useCallback(async () => {
    const q = searchInput.trim();
    if (!q) return;
    const parsed = parseCoordinatesFromInput(q);
    if (parsed) {
      const addr = await reverseGeocode(parsed.lat, parsed.lng);
      select(parsed.lat, parsed.lng, addr || q);
      return;
    }
    if (suggestions[0]) select(suggestions[0].lat, suggestions[0].lng, suggestions[0].display);
  }, [searchInput, suggestions, select, reverseGeocode]);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        placeMarker(latitude, longitude);
        map.current?.panTo({ lat: latitude, lng: longitude });
        map.current?.setZoom(15);
        onChangeRef.current(latitude, longitude, await reverseGeocode(latitude, longitude));
      },
      () => {},
    );
  }, [placeMarker, reverseGeocode]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            className="w-full rounded-sm border border-border bg-surface ps-8 pe-8 py-2 text-body outline-none focus:border-brand"
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

          {open && suggestions.length > 0 && (
            <ul className="absolute z-[1000] mt-1 max-h-64 w-full overflow-auto rounded-sm border border-border bg-surface py-1">
              {suggestions.map((s, i) => (
                <li key={`${s.lat},${s.lng},${i}`}>
                  <button
                    type="button"
                    onClick={() => select(s.lat, s.lng, s.display)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-start text-body hover:bg-surface2"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{s.primary}</span>
                      <span className="block truncate text-label text-muted">{s.display}</span>
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
          className="flex items-center rounded-sm border border-border px-2.5 py-2 text-label hover:bg-surface2"
        >
          <Navigation className="h-3.5 w-3.5 text-muted" />
        </button>
      </div>

      <div style={{ height }} className="overflow-hidden rounded-sm border border-border">
        {error ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-label text-danger">
            Google Maps failed to load (check the API key / enabled APIs).
          </div>
        ) : (
          <div ref={mapDiv} style={{ height: "100%", width: "100%" }} />
        )}
      </div>

      {value && !hideAddress && (
        <div className="flex items-start gap-1.5 rounded-sm border border-border bg-surface2 px-3 py-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none text-brand" />
          <div className="min-w-0 flex-1 text-body">
            <div className="font-semibold leading-tight">
              {resolved || (resolving ? mp.locating : label?.trim() || mp.pinnedNoAddress)}
            </div>
            <div className="text-label text-muted">
              {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
