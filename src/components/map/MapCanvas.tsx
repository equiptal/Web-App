"use client";

/**
 * RMAP T12 + T16 — the map itself: the project-location pin, and the selected bid's supplier fleet.
 *
 * There are no supplier pins and no bid pins, ever (AC-72, AC-169, §6.2): supplier company coordinates
 * are not reliable enough to plot, and a pin in roughly the wrong place invites distance judgements
 * that are wrong. **Every pin on this canvas is one machine.**
 *
 * Three rules the pin set enforces, all of them "draw less" rules:
 *  - **Only the selected bid's supplier's machines** (AC-75). The fleet endpoint is bid-scoped and this
 *    component is handed one list, so there is no state in which two suppliers' machines coexist.
 *  - **Claimed units are never drawn** (AC-77, §6.2). A quoted count with no registered machine has no
 *    equipment record, therefore no yard and no coordinates; the prototype's `ghostIcon` asserted a
 *    position that does not exist and is deliberately not ported. The shortfall is stated in words by
 *    `BidMapWorkspace` instead.
 *  - **A machine with no usable coordinates is not plotted** (AC-19). `isPlottable` decides that, and it
 *    reads coordinates only — never the availability, and never `yardConfirmed`.
 *
 * Leaflet renders its own LTR canvas, so every pin's CONTENT sets `direction: rtl` explicitly rather
 * than inheriting the shell's (AC-30, AC-98), and the numerals inside a chip are wrapped `dir="ltr"`.
 *
 * SSR: `leaflet` touches `window` at import time, so this module is only ever reached through
 * `dynamic(..., { ssr: false })` in `BidMapWorkspace` — the same handling `MapLocationPicker` needed.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AVAILABILITY_COLOUR, MIN_PIN_GAP_PX, decollide, type MapPoint } from "@/lib/contract/bid-map";
import type { ReadinessBand } from "@/lib/contract/bid-readiness";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { useLocale, useT } from "@/lib/i18n";

export interface SitePoint {
  lat: number;
  lng: number;
}

/**
 * One machine, reduced to exactly what a pin draws. Assembled by `BidMapWorkspace` from the fleet rows
 * plus `unitAvailability` and `computeUnitReadiness` — this component derives no state of its own, so
 * the pin, the panel chip and the composition bar cannot start disagreeing (the whole point of
 * `bid-map.ts`).
 */
export interface MachinePin extends MapPoint {
  /** `equipmentId` — the selection key and the de-collision key. */
  id: string;
  lat: number;
  lng: number;
  /**
   * **The only source of the pin's colour** (AC-18, §6.9.1), straight from `unitAvailability`. Never
   * from the `yardConfirmed` boolean, which is true for every readiness-written entry and so would
   * paint the whole map green — `bid-map.ts` records the full reason.
   */
  availability: "confirmed" | "unconfirmed";
  /** This bid offered this machine. False → the supplier owns it but did not put it on the table. */
  inBid: boolean;
  /** Readiness band for the bar's filled segments; null when there is nothing to score. */
  band: ReadinessBand | null;
  /** Documents held / required, for the bar's segment count and the chip's «N/M مستند». */
  done: number;
  total: number;
}

/** Saudi Arabia, roughly — the fallback view for a request with no project location (AC-21). The map
 *  still renders; it simply has nothing to centre on, and the panel's distances read «—». */
const FALLBACK_CENTRE: [number, number] = [24.0, 45.0];
const FALLBACK_ZOOM = 5;
const SITE_ZOOM = 11;

/** §5 tokens. The readiness band is a SECOND, independent channel from availability (AC-55→58): a
 *  machine can be fully documented with no confirmed yard, and neither signal may mask the other. */
const BAND_COLOUR: Record<ReadinessBand, string> = { green: "#16A34A", yellow: "#D4780A", red: "#D9362A" };
const EMPTY_SEGMENT = "rgba(15,34,56,.14)";

/** The site label is i18n copy plus, optionally, the request's own address string — which is user
 *  data going into `divIcon`'s HTML. Escape it rather than trusting it. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** A taxonomy image URL is interpolated into a CSS `url()`, so anything that is not a plain http(s)
 *  link is refused outright — the pin then shows its icon fallback, which is the point of the chain. */
function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url.replace(/["'\\)(\s]/g, (c) => encodeURIComponent(c));
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const digits = (n: number, ar: boolean): string =>
  ar ? String(Math.trunc(Math.abs(n))).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)]) : String(Math.trunc(Math.abs(n)));

/** Fit the view to everything that is drawn. One point → a centre + a sensible zoom; a fleet → a bounds
 *  fit over the site AND the machines, because a yard 200 km from the site would otherwise be plotted
 *  off-screen and the map would read as empty. */
function FitView({ site, points }: { site: SitePoint | null; points: MachinePin[] }) {
  const map = useMap();
  // Fit on the SET of plotted machines, not on every render: re-fitting when only the selection
  // changed would yank the view out from under a renter who had panned to a pin.
  const key = points.map((p) => p.id).sort().join(",");
  useEffect(() => {
    if (points.length && site) {
      map.fitBounds(L.latLngBounds([[site.lat, site.lng], ...points.map((p) => [p.lat, p.lng] as [number, number])]), {
        padding: [80, 80],
        maxZoom: SITE_ZOOM,
        animate: false,
      });
      return;
    }
    if (points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [80, 80], maxZoom: SITE_ZOOM, animate: false });
      return;
    }
    if (site) map.setView([site.lat, site.lng], SITE_ZOOM, { animate: false });
    else map.setView(FALLBACK_CENTRE, FALLBACK_ZOOM, { animate: false });
    // `key` stands in for `points`; adding the array itself would re-fit on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lng, key, map]);
  return null;
}

/**
 * The fleet layer: de-collided machine pins plus a leader line back to the true yard for any pin that
 * had to move.
 *
 * **De-collision is screen-space, not coordinate-space** (`decollide`, §6.2). Two machines parked in
 * one yard are metres apart in the data — never equal — and still land on the same 44 px circle, so the
 * threshold is a projected-pixel distance. `map.project(latlng, zoom)` is used rather than
 * `latLngToContainerPoint` on purpose: absolute layer pixels are independent of the pan, so the fan is
 * a pure function of the ZOOM and the memo below is exact rather than merely cheap. Panning cannot
 * change which pins overlap; zooming can, and does — pins that touch at city zoom separate on their own
 * as the renter zooms in.
 */
function FleetLayer({
  points,
  selectedId,
  onSelect,
  imageUrl,
  iconName,
}: {
  points: MachinePin[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  imageUrl: string | null;
  iconName: string;
}) {
  const map = useMap();
  const t = useT();
  const { locale } = useLocale();
  const ar = locale === "ar";
  // Re-reads the zoom below whenever the view settles; the memo then recomputes only if it changed.
  useMapTick();

  const zoom = map.getZoom();
  const placed = useMemo(
    () =>
      decollide<MachinePin>(
        points,
        (lat, lng) => map.project([lat, lng], zoom),
        MIN_PIN_GAP_PX,
      ),
    // `points`/`zoom` are the only inputs; `map` is stable for the life of the container.
    [points, zoom, map],
  );

  const src = safeImageUrl(imageUrl);

  return (
    <>
      {placed.map((p) => {
        const pin = p.point;
        const at = map.unproject([p.x, p.y], zoom);
        const selected = selectedId === pin.id;
        return (
          // A Fragment, not a wrapper element: react-leaflet children attach to the map through
          // context, and a real <div> here would be mounted inside the Leaflet pane.
          <Fragment key={pin.id}>
            {/* The leader line is drawn only when the pin actually moved — `decollide` returns the
                anchor equal to the position otherwise, so this is a real displacement, not a
                zero-length hairline. It is tinted with the machine's own availability colour so the
                line cannot suggest a different state from the pin it belongs to. */}
            {p.displaced && (
              <Polyline
                positions={[[pin.lat, pin.lng], [at.lat, at.lng]]}
                pathOptions={{ color: AVAILABILITY_COLOUR[pin.availability], weight: 1.5, opacity: 0.7 }}
                interactive={false}
              />
            )}
            <Marker
              position={at}
              icon={machineIcon(pin, selected, src, iconName, ar, t)}
              zIndexOffset={selected ? 900 : 700}
              riseOnHover
              eventHandlers={{ click: () => onSelect(pin.id) }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Re-render the fleet layer when the view settles. The de-collision depends on the ZOOM only (layer
 * pixels are pan-independent), but `moveend` fires for the pan that ends a double-click zoom and
 * `resize` for a viewport change, and both cost exactly one memo lookup when the zoom did not move.
 */
function useMapTick(): number {
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  useMapEvents({ zoomend: bump, moveend: bump, resize: bump });
  return tick;
}

/**
 * The machine pin — `design.md` §4.2, value for value.
 *
 * Everything static (the 132×86 box, the 44 px circle, the bar's 66 px width and 2 px gap, the chip's
 * padding and weight) lives in `map-proto.css`; only genuinely state-dependent values — the colour, the
 * border style, the halo, a segment's fill — are inline, which is this repo's `*-proto.css` convention.
 *
 * **No numeric index badge.** The prototype draws one (`AR(idx+1)` at `bottom:-6px`); `design.md` §7
 * decision 3 drops it, because §6.3.3 banned exactly this invented per-unit index — nothing links a bid
 * to a numbered unit, so a renter asking "what about unit 2?" names something the supplier cannot
 * resolve.
 *
 * **No emoji.** The prototype puts the request item's taxonomy emoji in the circle; §7 decision 4 makes
 * it the request item's taxonomy IMAGE, falling back to the category image, then a generic icon, and
 * never a broken image (AC-80). A `divIcon` renders an HTML string with no React lifecycle, so the
 * `onError` swap `EquipImg` uses is not available — instead the icon glyph is always in the DOM and the
 * image is painted OVER it as a background. A URL that 404s simply never paints and the glyph shows
 * through, which is the same fallback chain with no failure mode.
 */
function machineIcon(
  pin: MachinePin,
  selected: boolean,
  src: string | null,
  iconName: string,
  ar: boolean,
  t: ReturnType<typeof useT>,
): L.DivIcon {
  const ring = AVAILABILITY_COLOUR[pin.availability];
  const alt = !pin.inBid;
  const halo = selected
    ? "0 0 0 4px rgba(37,99,235,.35), 0 6px 16px rgba(15,34,56,.32)"
    : "0 5px 14px rgba(15,34,56,.3)";
  const circle = [
    `background:${alt ? "#fff" : ring}`,
    `border:3px ${alt ? "dashed" : "solid"} ${alt ? ring : "#fff"}`,
    `box-shadow:${halo}`,
  ].join(";");

  const segments = Math.max(0, Math.trunc(pin.total));
  const fill = pin.band ? BAND_COLOUR[pin.band] : EMPTY_SEGMENT;
  let bar = "";
  for (let i = 0; i < segments; i++) {
    bar += `<span class="bm-pin-seg" style="background:${i < pin.done ? fill : EMPTY_SEGMENT}"></span>`;
  }

  // «يمكنك طلبها» (not offered) · «متاحة» (confirmed) · «غير مؤكّدة» — the SHORT wording, which
  // coexists with the panel chip's longer «التوفّر مؤكّد» by decision (§7 decision 2): one fact, two
  // lengths, because 9 px inside a 132 px marker cannot carry the explicit phrasing.
  const state = alt ? t.bidMap.pinRequestable : pin.availability === "confirmed" ? t.bidMap.pinAvailable : t.bidMap.pinUnconfirmed;
  const docs = `<span dir="ltr">${esc(digits(pin.done, ar))}/${esc(digits(segments, ar))}</span> ${esc(t.bidMap.pinDocs)}`;

  const content = alt
    ? `<span class="bm-pin-plus" style="color:${ring}">+</span>`
    : `<span class="bm-pin-glyph material-icons-outlined">${esc(iconName)}</span>` +
      (src ? `<span class="bm-pin-img" style="background-image:url('${src}')"></span>` : "");

  return L.divIcon({
    className: "", // no Leaflet default box — the pin is entirely our own markup
    iconSize: [132, 86],
    iconAnchor: [66, 86],
    html:
      `<div class="bm-pin" dir="rtl" style="direction:rtl">` +
      `<div class="bm-pin-c" style="${circle}">` +
      content +
      (selected ? `<span class="bm-pin-tick">✓</span>` : "") +
      `</div>` +
      (segments > 0 ? `<div class="bm-pin-bar">${bar}</div>` : "") +
      `<div class="bm-pin-chip" style="border:1px ${alt ? "dashed" : "solid"} ${ring}">${esc(state)} · ${docs}</div>` +
      `</div>`,
  });
}

export default function MapCanvas({
  site,
  addressLabel,
  machines = [],
  selectedMachineId = null,
  onSelectMachine,
  itemImageUrl = null,
  itemName = null,
}: {
  site: SitePoint | null;
  addressLabel?: string | null;
  /** The selected bid's plottable machines. Empty in state 1, and empty for an off-platform bid. */
  machines?: MachinePin[];
  selectedMachineId?: string | null;
  onSelectMachine?: (id: string) => void;
  /** The REQUEST ITEM's taxonomy image (subtype → category), per AC-80 decision 4. */
  itemImageUrl?: string | null;
  /** The item's taxonomy name — drives the icon fallback when no image loads. */
  itemName?: string | null;
}) {
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

  const iconName = useMemo(() => equipmentIcon(itemName), [itemName]);

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
        <FleetLayer
          points={machines}
          selectedId={selectedMachineId}
          onSelect={(id) => onSelectMachine?.(id)}
          imageUrl={itemImageUrl}
          iconName={iconName}
        />
        <FitView site={site} points={machines} />
      </MapContainer>
    </div>
  );
}
