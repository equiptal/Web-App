"use client";

/**
 * **V10 — the map** (spec 004 §6.8; RM3-AC-15, AC-19→22). The project pin, one marker per **offered**
 * machine, an availability label on each, a distance chip, and a dotted route back to the project.
 *
 * There are no supplier pins and no bid pins, ever (AC-72, AC-169, §6.2): supplier company coordinates
 * are not reliable enough to plot, and a pin in roughly the wrong place invites distance judgements
 * that are wrong. **Every marker on this canvas is one machine.**
 *
 * Four rules the marker set enforces, all of them "draw less" rules:
 *  - **Offered machines only** (§6.8, V10). The fleet response also carries machines the supplier owns
 *    and did not put on the table; v2 drew them as a hollow dashed "you can request it" pin and v3
 *    removes the variant outright — they are one request, not a second thing to read off the map.
 *  - **Only this bid's supplier's machines** (AC-75). The fleet endpoint is bid-scoped and this
 *    component is handed one list, so there is no state in which two suppliers' machines coexist.
 *  - **An `absent` unit is not drawn** (AC-22). A claimed count (`unidentified`) has no equipment
 *    record, therefore no yard and no coordinates; the prototype's `ghostIcon` asserted a position that
 *    does not exist and is deliberately not ported. The shortfall is stated in words by
 *    `BidMapWorkspace` instead.
 *  - **A machine with no usable coordinates is not plotted** (AC-19). `isPlottable` decides that, and it
 *    reads coordinates only — never the availability, and never `yardConfirmed`.
 *
 * **The colour is `unitAvailability`'s, resolved by the caller** (AC-19). The marker and the card chip
 * are the same fact rendered twice, so the derivation happens once, in `BidMapWorkspace`, and arrives
 * here already decided. Copy reads *unanswered*, never refused or unavailable (AC-20).
 *
 * Leaflet renders its own LTR canvas, so every marker's CONTENT sets `direction: rtl` explicitly rather
 * than inheriting the shell's (AC-30, AC-98), and the numerals inside a chip are wrapped `dir="ltr"`.
 *
 * SSR: `leaflet` touches `window` at import time, so this module is only ever reached through
 * `dynamic(..., { ssr: false })` in `BidMapWorkspace` — the same handling `MapLocationPicker` needed.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AVAILABILITY_COLOUR, MIN_PIN_GAP_PX, decollide, isOutOfCity, type MapPoint } from "@/lib/contract/bid-map";
import { equipmentIcon } from "@/components/requests/EquipImg";
import { useLocale, useT } from "@/lib/i18n";

export interface SitePoint {
  lat: number;
  lng: number;
}

/**
 * One offered machine, reduced to exactly what a marker draws. Assembled by `BidMapWorkspace` from the
 * fleet rows plus `unitAvailability` — this component derives no state of its own, so the marker and
 * the panel chip cannot start disagreeing (the whole point of `bid-map.ts`).
 *
 * **There is no `inBid` here.** The pin set is offered-only by construction, so "not in this offer" is
 * not a state this type can represent — which is stronger than a branch that happens never to be taken.
 * There is no readiness band either: v3 moved the bar and the document count into the machine's detail,
 * because *"a pin on a simple map says what it is and nothing else"*.
 */
export interface MachinePin extends MapPoint {
  /** `equipmentId` — the selection key and the de-collision key. */
  id: string;
  lat: number;
  lng: number;
  /**
   * **The only source of the marker's colour** (AC-19, §6.8), straight from `unitAvailability`. Never
   * from the `yardConfirmed` boolean, which is true for every readiness-written entry and so would
   * paint the whole map green — `bid-map.ts` records the full reason.
   */
  availability: "confirmed" | "unconfirmed";
  /** Distance to the project, for the chip riding this machine's route. Null → no chip, never a 0. */
  distanceKm: number | null;
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

/** A taxonomy image URL is interpolated into a CSS `url()`, so anything that is not a plain http(s)
 *  link is refused outright — the marker then shows its icon fallback, which is the point of the chain. */
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
  // changed would yank the view out from under a renter who had panned to a marker.
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

/** The marker box, in CSS pixels — `design-v3.md` §4. Used both by the `divIcon` and by the distance
 *  chip's clearance test, so the two cannot drift apart. */
const PIN_W = 132;
const PIN_H = 124;

/** Route geometry, `design-v3.md` §6, verbatim: the bow is capped at 56 px, it is 16% of the chord, and
 *  it alternates side by index so two machines in the same direction bow apart rather than laying
 *  parallel tracks. The three segments fade toward the machine — that fade is what keeps the line off
 *  the marker. */
const ROUTE_BOW_MAX = 56;
const ROUTE_BOW_RATIO = 0.16;
const ROUTE_SEGMENTS: [number, number, number][] = [
  [0, 0.42, 0.8],
  [0.42, 0.76, 0.55],
  [0.76, 1, 0.3],
];
const ROUTE_SAMPLES = 10;

/**
 * The fleet layer: de-collided machine markers, a dotted route from each back to the project, the
 * distance chip riding that route, and a leader line back to the true yard for any marker that had to
 * move.
 *
 * **De-collision is screen-space, not coordinate-space** (`decollide`, §6.2). Two machines parked in
 * one yard are metres apart in the data — never equal — and still land on the same marker, so the
 * threshold is a projected-pixel distance. `map.project(latlng, zoom)` is used rather than
 * `latLngToContainerPoint` on purpose: absolute layer pixels are independent of the pan, so the fan is
 * a pure function of the ZOOM and the memo below is exact rather than merely cheap. Panning cannot
 * change which markers overlap; zooming can, and does — markers that touch at city zoom separate on
 * their own as the renter zooms in.
 */
function FleetLayer({
  site,
  points,
  selectedId,
  onSelect,
  imageUrl,
  iconName,
}: {
  site: SitePoint | null;
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

  /* ── the route and its chip ──────────────────────────────────────────────────────────────────
     Both are pure geometry over the SAME layer pixels the de-collision used, so the line ends where
     the marker actually stands rather than where the machine is. Recomputed on zoom because layer
     pixels are zoom-dependent; the pan does not enter it. */
  const routes = useMemo(() => {
    if (!site) return [];
    const s = map.project([site.lat, site.lng], zoom);
    // Chips already laid down this pass — a second machine in the same direction must not stack its
    // chip on the first one's.
    const taken: { x: number; y: number }[] = [];

    return placed.map((p, i) => {
      const b = { x: p.x, y: p.y };
      const vx = b.x - s.x;
      const vy = b.y - s.y;
      const len = Math.hypot(vx, vy) || 1;
      const bow = Math.min(ROUTE_BOW_MAX, len * ROUTE_BOW_RATIO) * (i % 2 ? -1 : 1);
      const cx = (s.x + b.x) / 2 + (-vy / len) * bow;
      const cy = (s.y + b.y) / 2 + (vx / len) * bow;
      const at = (tt: number): [number, number] => {
        const k = 1 - tt;
        return [k * k * s.x + 2 * k * tt * cx + tt * tt * b.x, k * k * s.y + 2 * k * tt * cy + tt * tt * b.y];
      };

      const segments = ROUTE_SEGMENTS.map(([from, to, opacity]) => {
        const pts: L.LatLng[] = [];
        for (let n = 0; n <= ROUTE_SAMPLES; n++) {
          const [x, y] = at(from + (to - from) * (n / ROUTE_SAMPLES));
          pts.push(map.unproject([x, y], zoom));
        }
        return { pts, opacity };
      });

      // The chip rides the line, but every line ENDS inside the marker box (132×124, anchored bottom),
      // so a fixed fraction lands on the machine whenever the line is short. Walk back from the site
      // end until the point clears that box, then nudge perpendicular, then clear of other chips.
      let chip: { at: L.LatLng; km: number; far: boolean } | null = null;
      if (p.point.distanceKm != null) {
        const clears = (x: number, y: number) =>
          Math.abs(x - b.x) >= PIN_W / 2 + 20 || b.y - y >= PIN_H + 12 || y - b.y >= 26;
        let tt = 0.62;
        let x = s.x + vx * tt;
        let y = s.y + vy * tt;
        for (let n = 0; n < 9 && !clears(x, y); n++) {
          tt = Math.max(0.18, tt - 0.07);
          x = s.x + vx * tt;
          y = s.y + vy * tt;
          if (tt === 0.18) break;
        }
        if (!clears(x, y)) {
          x += (-vy / len) * 30;
          y += (vx / len) * 30;
        }
        for (let g = 0; g < 6 && taken.some((q) => Math.abs(q.x - x) < 58 && Math.abs(q.y - y) < 24); g++) {
          const off = (g % 2 ? -1 : 1) * (26 + 13 * Math.floor(g / 2));
          x = s.x + vx * tt + (-vy / len) * off;
          y = s.y + vy * tt + (vx / len) * off;
        }
        taken.push({ x, y });
        chip = {
          at: map.unproject([x, y], zoom),
          km: Math.round(p.point.distanceKm),
          // Read off the UNROUNDED distance, and off the same `isOutOfCity` the card's «· خارج
          // المدينة» reads — the pill and the card line are one fact stated twice.
          far: isOutOfCity(p.point.distanceKm),
        };
      }

      return { id: p.point.id, segments, chip };
    });
  }, [placed, site, map, zoom]);

  const src = safeImageUrl(imageUrl);

  return (
    <>
      {/* The routes are drawn FIRST so every marker sits above every line — a route crossing the
          machine it belongs to would read as pointing somewhere else. */}
      {routes.map((r) => (
        <Fragment key={`route-${r.id}`}>
          {r.segments.map((seg, n) => (
            <Polyline
              key={n}
              positions={seg.pts}
              // `className` carries the travelling dash; the dash pattern itself is a Leaflet path
              // option, not CSS, so it stays here.
              className="bm-flow"
              pathOptions={{ color: "#6E869C", weight: 3, opacity: seg.opacity, dashArray: "1 9", lineCap: "round" }}
              interactive={false}
            />
          ))}
          {r.chip && (
            <Marker
              position={r.chip.at}
              icon={distanceIcon(r.chip.km, r.chip.far, ar, t.bidMap.km, t.bidMap.mapOutOfCity)}
              interactive={false}
              // 700, the prototype's. Above the routes and the leader lines it rides, below the
              // machines at 760 — a chip is a caption on a line, and it must never cover a marker.
              zIndexOffset={700}
            />
          )}
        </Fragment>
      ))}

      {placed.map((p) => {
        const pin = p.point;
        const at = map.unproject([p.x, p.y], zoom);
        const selected = selectedId === pin.id;
        return (
          // A Fragment, not a wrapper element: react-leaflet children attach to the map through
          // context, and a real <div> here would be mounted inside the Leaflet pane.
          <Fragment key={pin.id}>
            {/* The leader line is drawn only when the marker actually moved — `decollide` returns the
                anchor equal to the position otherwise, so this is a real displacement, not a
                zero-length hairline. */}
            {p.displaced && (
              <Polyline
                positions={[[pin.lat, pin.lng], [at.lat, at.lng]]}
                pathOptions={{ color: "#A9BCCC", weight: 1, opacity: 0.8 }}
                interactive={false}
              />
            )}
            <Marker
              position={at}
              icon={machineIcon(pin, selected, src, iconName, t)}
              zIndexOffset={selected ? 900 : 760}
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
 * The distance chip riding a route (§6.8). Non-interactive, and never a 0: a machine with no distance
 * gets no chip at all rather than a chip claiming it is at the project.
 *
 * **A second pill rides beside it when the yard is out of city** (decoded 701–705). That flag was
 * missing here entirely, and it is the one thing the number alone cannot say: 95 km reads as a
 * distance, «خارج المدينة» reads as a mobilisation to negotiate. Amber, never red — red on this canvas
 * is availability's and nothing else's, and a distant yard is not an unavailable machine.
 */
function distanceIcon(km: number, far: boolean, ar: boolean, unit: string, farLabel: string): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [150, 26],
    iconAnchor: [75, 13],
    html:
      `<div class="bm-distchip" dir="rtl">` +
      `<span><span dir="ltr">${esc(digits(km, ar))}</span> ${esc(unit)}</span>` +
      (far ? `<span class="bm-distfar">${esc(farLabel)}</span>` : "") +
      `</div>`,
  });
}

/**
 * The machine marker — the decoded v3 prototype's `unitIcon`, value for value.
 *
 * Everything static (the 132×124 box, the 96×78 stage, the 62 px ground disc, the 94×74 object, the
 * label's padding and weight) lives in `map-proto.css`; only genuinely state-dependent values — the
 * availability colour, the halo, the lift, the two drop-shadows — are inline, which is this repo's
 * `*-proto.css` convention.
 *
 * ── The machine is a FREE-STANDING OBJECT (owner's ruling, 2026-08-08) ────────────────────────────
 * The prototype draws it as `machineArt(u)` at **94 × 74, `object-fit: contain`, with no container,
 * no fill and no ring**: it rests `translateY(-4px)` under `drop-shadow(0 7px 7px rgba(15,34,56,.30))`
 * and, when selected, lifts on `dpLift .55s cubic-bezier(.34,1.4,.64,1) forwards` under
 * `drop-shadow(0 14px 12px rgba(15,34,56,.34))`.
 *
 * This drew a **44 px circle filled with the availability colour**, white-ringed, holding a Material
 * glyph with the taxonomy image painted over it at 62 %. The justification cited here was
 * *"`design.md` §7 decision 4 — taxonomy image, not emoji"*, **and that citation was invalid**:
 * decision 4 was written against the **v2** prototype, whose pin held an emoji. v3's pin holds a PNG
 * and has no badge at all. The decision authorises *an image instead of an emoji*; it never
 * authorised *a small filled badge instead of a large free-standing object*.
 *
 * Everything around the object was already right and is untouched: the ground disc carrying the
 * availability colour, the selected halo, the contact shadow, the availability label and the selected
 * name tag. The disc (62 px) and the shadow (44 px) were always sized for the wider object.
 *
 * **Selection is a blue ring on the disc, a lift and a tick — never a new colour.** The only two
 * colours on this canvas are availability's.
 *
 * **No numeric index badge** (`design.md` §7 decision 3): §6.3.3 banned exactly this invented per-unit
 * index, because nothing links a bid to a numbered unit and a renter asking "what about unit 2?" names
 * something the supplier cannot resolve.
 *
 * **The fallback chain is unchanged** (AC-80): the request item's taxonomy IMAGE, falling back to the
 * category image, then a generic icon, and never a broken image. A `divIcon` renders an HTML string
 * with no React lifecycle, so `EquipImg`'s `onError` swap is unavailable — the icon is therefore
 * always in the DOM and the image is painted OVER it as a background, so a URL that 404s simply never
 * paints and the icon shows through. The icon is muted slate rather than the availability colour,
 * because a fallback is not a statement about availability; `map-proto.css` records the one residual.
 */
function machineIcon(
  pin: MachinePin,
  selected: boolean,
  src: string | null,
  iconName: string,
  t: ReturnType<typeof useT>,
): L.DivIcon {
  const ring = AVAILABILITY_COLOUR[pin.availability];
  const tint = pin.availability === "confirmed" ? "rgba(22,163,74,.34)" : "rgba(217,54,42,.32)";

  // «مؤكّد توفرها» / «لم يؤكد توفرها بعد». "Not confirmed" reads as UNANSWERED — the label carries no
  // reason, no cause and no location-source explanation (AC-20, AC-30).
  const state = pin.availability === "confirmed" ? t.bidMap.pinAvailable : t.bidMap.pinUnconfirmed;

  // The object's own motion and shadow, both prototype values. `drop-shadow`, not `box-shadow`: it has
  // to follow the machine's silhouette, which is the point of shadowing the art rather than a box.
  const art = selected
    ? "animation:dpLift .55s cubic-bezier(.34,1.4,.64,1) forwards;filter:drop-shadow(0 14px 12px rgba(15,34,56,.34))"
    : "transform:translateY(-4px);filter:drop-shadow(0 7px 7px rgba(15,34,56,.30))";

  return L.divIcon({
    className: "", // no Leaflet default box — the marker is entirely our own markup
    iconSize: [PIN_W, PIN_H],
    iconAnchor: [PIN_W / 2, PIN_H],
    html:
      `<div class="bm-pin" dir="rtl" style="direction:rtl">` +
      `<div class="bm-pin-stage">` +
      (selected ? `<span class="bm-pin-halo" style="border:2px solid ${ring}"></span>` : "") +
      `<span class="bm-pin-disc" style="background:${tint};border:2.5px solid ${ring}${selected ? ";box-shadow:0 0 0 3px rgba(37,99,235,.55)" : ""}"></span>` +
      `<span class="bm-pin-shadow"></span>` +
      `<span class="bm-pin-art" style="${art}">` +
      `<span class="bm-pin-glyph material-icons-outlined">${esc(iconName)}</span>` +
      (src ? `<span class="bm-pin-img" style="background-image:url('${src}')"></span>` : "") +
      `</span>` +
      // A sibling of the object, not a child: the object carries a `filter`, which would make it the
      // containing block and drag the tick along with the lift.
      (selected ? `<span class="bm-pin-tick">✓</span>` : "") +
      `</div>` +
      `<div class="bm-pin-chip" style="background:${ring};border:1px solid ${ring}${selected ? ";transform:scale(1.06)" : ""}">${esc(state)}</div>` +
      // Only the focused marker names itself — the map stays quiet until the renter has chosen (AC-34).
      (selected ? `<div class="bm-pin-tag">${esc(t.bidMap.pinInOffer)}</div>` : "") +
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
  /** The bid's OFFERED, plottable machines. Empty for an off-platform bid and while the fleet loads. */
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

  /* The project pin — `siteIcon()`, decoded lines 262–265, value for value. `[40,52]` with the anchor
     at `[20,40]`, which is the teardrop's point rather than its centre: the pin marks the spot it
     touches. The label overflows the 40 px box symmetrically, which is what the prototype does too.

     The glyph is a location mark inside a shape that is itself a location mark. That doubling is the
     prototype's (it uses 📍); kept, with a Material glyph rather than an emoji so the surface has one
     icon family. */
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "", // no Leaflet default box — the pin is entirely our own markup
        iconSize: [40, 52],
        iconAnchor: [20, 40],
        html:
          `<div class="bm-sitepin" dir="rtl" style="direction:rtl">` +
          `<span class="bm-sitedot"><span class="bm-siteglyph material-icons-outlined">place</span></span>` +
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
        // Leaflet's own control is off so ours can be placed clear of the panel — see below.
        zoomControl={false}
        scrollWheelZoom
        // The prototype's view options, value for value. Half-steps rather than whole ones, because a
        // yard 12 km out and a yard 95 km out are one zoom step apart on a whole-step map; a wheel
        // budget of 90 px per level so a single scroll does not jump three; and a floor and ceiling so
        // the renter can neither zoom past the country nor into a tile the basemap does not hold.
        zoomSnap={0.5}
        zoomDelta={0.5}
        minZoom={5}
        maxZoom={16}
        wheelPxPerZoomLevel={90}
        style={{ height: "100%", width: "100%" }}
      >
        {/* CARTO **voyager**, not OpenStreetMap standard (`baseUrl('voyager')`, decoded 3840). Not a
            taste choice: every colour on this canvas was judged against voyager's pale ground — the
            `#6E869C` route, the `#A9BCCC` leader line, the white chips and the white pin tag. On OSM
            standard's saturated green-and-buff they all lose contrast, and the route in particular
            disappears into the road network it is drawn over.

            The attribution carries BOTH credits because voyager's terms require both: the data is
            OpenStreetMap's, the rendering is CARTO's. */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={19}
        />
        {/* Opposite the bid panel, which sits on the inline-end edge — otherwise the zoom buttons land
            underneath it in Arabic, where inline-end is the physical left.

            The prototype has no zoom control at all. Kept anyway: it is the only pointer-and-keyboard
            zoom affordance on a surface whose whole subject is distance, and dropping it would leave a
            renter without a wheel or a trackpad with no way to change the view. `zoomControl: false`
            is ported exactly — it is what lets this one be placed rather than Leaflet's default. */}
        <ZoomControl position={dir === "rtl" ? "topright" : "topleft"} />
        {site && <Marker position={[site.lat, site.lng]} icon={icon} interactive={false} zIndexOffset={900} />}
        <FleetLayer
          site={site}
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
