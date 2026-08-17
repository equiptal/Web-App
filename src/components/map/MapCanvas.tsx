"use client";

/**
 * **V10 — the map** (spec 004 §6.8; RM3-AC-15, AC-19→22). The project pin, one marker per **offered**
 * machine, an availability label on each, a distance chip, and a dotted route back to the project.
 *
 * There are no supplier pins and no bid pins, ever (AC-72, AC-169, §6.2): supplier company coordinates
 * are not reliable enough to plot, and a pin in roughly the wrong place invites distance judgements
 * that are wrong. **Every marker on this canvas is one machine.**
 *
 * Three rules the marker set enforces, all of them "draw less" rules:
 *  - ~~**Offered machines only** (§6.8, V10)~~ — **withdrawn 2026-08-13** (AC-10). The fleet response
 *    also carries machines the supplier owns and did not put on the table. v2 drew them as a hollow
 *    dashed "you can request it" pin, v3 removed the variant outright, and the owner's ruling restores
 *    them as ordinary machines: *"all equipments will be shown."* They are not a fourth pin variant —
 *    they take the same pin every other machine takes, in **red**, and are told apart by colour alone
 *    (AC-19a). What made the absence untenable is that the panel read «٣ مسجّلة» above a list of one,
 *    with nothing to distinguish "he owns it" from "he offered it".
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
import { AVAILABILITY_COLOUR, MIN_PIN_GAP_PX, decollide, distanceDigits, isOutOfCity, type MapPoint } from "@/lib/contract/bid-map";
import { equipmentIcon } from "@/components/requests/EquipImg";
// Type-only: the canvas RENDERS this model and never builds one. The import is erased at compile time,
// which is the shape the dependency should have — the map has no business knowing how a card is made.
import type { EquipmentCardModel } from "@/components/map/equipment-card-model";
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
   *
   * **Three values since 2026-08-13.** The canvas now draws the supplier's whole matching fleet, so a
   * marker can be a machine he never offered (red) beside one he offered and has not placed (orange)
   * beside one he confirmed (green).
   */
  availability: "confirmed" | "unconfirmed";
  /** Distance to the project, for the chip riding this machine's route. Null → no chip, never a 0. */
  distanceKm: number | null;
  /**
   * **The fleet list card's own model for this machine** — the details box that opens on hover, and
   * nothing else (owner, 2026-08-11: *"hovering an equipment must show its details beside it"*).
   *
   * It is the CARD's model, `equipmentCardModel(machine, bid)`, built once by `BidMapWorkspace` and
   * handed down — never re-derived here. That is the whole design of the field: a hover box that
   * assembled its own title, its own chip, its own distance and its own certificate line would be a
   * fifth spelling of facts RM3-AC-19, RM3-AC-32 and the one-decimal ruling exist to keep single, and
   * it would be the spelling nobody looks at when the card is changed. The box states the card; if
   * they ever disagree it is because one of them stopped rendering the model, which is a visible bug
   * rather than a silent drift.
   *
   * Optional because a caller with no fleet in hand (a preview, a test) still gets markers — it simply
   * gets no hover box, which is the honest degradation: the machine is still pressable and its card
   * and its panel still carry every one of these facts.
   */
  card?: EquipmentCardModel;
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

/* The local `digits()` that used to sit here — a second copy of `toArabicIndic`, truncating — is gone
   (owner, 2026-08-11). It was the reason the chip could never have shown a decimal even once the model
   carried one, and it was the exact shape of the defect the one-decimal ruling is about: the same
   distance formatted by two functions in two files. `distanceDigits` is the one formatter now, shared
   with the card and the detail. */

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

/** The marker box AT REST, in CSS pixels — `design-v3.md` §4. Used by the `divIcon`, by the distance
 *  chip's clearance test and by the de-collision gap, so the three cannot drift apart. */
const PIN_W = 132;
const PIN_H = 124;

/**
 * The stage — the ground disc, the contact shadow and the machine object — exactly as
 * `map-proto.css` draws it (`.bm-pin-stage`, 96 × 78). Restated here because the zoom scale below is
 * applied TO the stage and the box has to be recomputed from it; the two values are bound by a comment
 * in each file rather than by a variable, for the same reason `PIN_W`/`PIN_H` already are — a `divIcon`
 * is an HTML string handed to Leaflet, so there is no layout to measure at the moment the box is
 * declared.
 */
const PIN_STAGE_W = 96;
const PIN_STAGE_H = 78;

/**
 * How wide the availability label actually draws — **the number the old 74 px gap ignored**.
 *
 * `.bm-pin-chip` is `white-space: nowrap` at 10 px / 800 with 10 px of padding a side, and the widest
 * string either locale puts in it is «Availability not confirmed yet» / «لم يؤكد توفرها بعد». It
 * therefore OVERFLOWS the 132 px box by design (it always has), which is why the marker's drawn width
 * is not `PIN_W` and why two markers separated by the box's width still overlapped where it counts.
 *
 * It is a constant rather than a measurement because a `divIcon` has no layout to measure at the
 * moment its geometry is decided, and because a per-marker measurement would make the fan depend on
 * which machine happened to be unconfirmed — the arrangement has to stay deterministic (`decollide`).
 */
const PIN_LABEL_W = 156;

/**
 * ── The machine grows as the renter zooms in (owner, 2026-08-11) ────────────────────────────────────
 * *"The equipment must scale up as I zoom, so a close view reads as a real machine and not the same
 * small sprite."*
 *
 * The curve, and why each end of it is where it is:
 *  - **No growth at or below `SITE_ZOOM`.** At city zoom the map's subject is *where the yards are*, and
 *    every marker on it is competing for the same tiles; a bigger sprite there buys nothing and costs
 *    the separation the fan has to pay for (see `pinGapPx`). `FitView` also lands exactly on
 *    `SITE_ZOOM`, so the view the renter arrives at is the marker at its documented 132 × 124.
 *  - **Linear in zoom LEVELS, not in scale.** A level is a doubling of the ground scale, so a machine
 *    drawn "to scale" would be 256× at the tile ceiling — nonsense on a canvas whose markers are
 *    symbols. 0.1 per level is a step the eye reads as growth across one wheel notch (0.05 at the
 *    surface's `zoomSnap: 0.5`) without ever being an animation.
 *  - **1.8 at the ceiling, and capped there.** `SITE_ZOOM` 11 → `maxZoom` 19 is eight levels, so the
 *    linear term reaches the cap exactly at the deepest tile CARTO serves: the marker grows all the way
 *    in and stops growing at the same moment the basemap does. 1.8 puts the 94 px object at 169 px —
 *    large enough to read as a machine, and small enough that four of them still fit a phone viewport.
 */
// `SITE_ZOOM` itself, not a copy of its value: the "no growth at city zoom" clause is a statement
// about the zoom `FitView` lands on, so if that ever moves the curve has to move with it.
const PIN_SCALE_FROM = SITE_ZOOM;
const PIN_SCALE_PER_LEVEL = 0.1;
const PIN_SCALE_MAX = 1.8;

function pinScale(zoom: number): number {
  return Math.min(PIN_SCALE_MAX, Math.max(1, 1 + (zoom - PIN_SCALE_FROM) * PIN_SCALE_PER_LEVEL));
}

/**
 * The marker's box at a given scale — the `divIcon`'s own size, and the thing everything else measures.
 *
 * Only the STAGE scales, so only the stage's contribution grows: the label strip under it keeps its
 * 46 px whatever the zoom, because the words in it are the same size at every zoom (a caption that grew
 * with the map would be a second, competing scale). The width follows the stage but never shrinks below
 * `PIN_W`, which is the box the label was always given room in.
 *
 * The box grows rather than letting the art overflow a fixed 132 × 124, because the box IS the hit
 * area: a machine drawn 169 px wide whose outer 20 px a side could not be pressed — or hovered, which
 * is now how the details box opens — would be a marker that lies about its own target.
 */
function pinBox(scale: number): { w: number; h: number } {
  return {
    w: Math.round(Math.max(PIN_W, PIN_STAGE_W * scale)),
    h: Math.round(PIN_H + PIN_STAGE_H * (scale - 1)),
  };
}

/**
 * **The de-collision gap, measured off what is actually DRAWN** (§6.2; owner, 2026-08-11).
 *
 * `MIN_PIN_GAP_PX` is 74 and the marker is 132 × 124 with a ~156 px label hanging off its bottom edge,
 * so the fan was separating markers by rather less than half their own size — which is why two machines
 * in one yard drew one legible machine and one behind it, with their labels stacked into an unreadable
 * pile. The owner's screenshot is that state at maximum zoom; it was the same state at city zoom.
 *
 * **The diagonal, and that is not belt-and-braces — it is the exact sufficient condition.** `decollide`
 * separates by EUCLIDEAN distance, and a Euclidean distance is not an axis clearance: two boxes offset
 * by (105, 105) are 148 px apart and still overlap in both axes. But if `dist ≥ hypot(W, H)` then
 * `|dx| ≥ W` **or** `|dy| ≥ H` — otherwise `dist < hypot(W, H)`, a contradiction — and either one puts
 * the boxes apart. So the diagonal is the smallest scalar that can be handed to a radial threshold and
 * still guarantee the labels clear, whichever way the fan happens to point.
 *
 * The width term takes the LABEL over the box: the label is what overlaps first, being the widest thing
 * the marker draws and the one thing two neighbours both draw at the same height.
 *
 * The cost is honest and is paid deliberately: markers fan further from their yards than they used to,
 * and every displaced one draws the leader line back to the true point that `decollide` already
 * returns. A marker 100 px from its yard with a line saying so is a smaller lie than two markers on top
 * of each other, neither of which can be read at all.
 */
function pinGapPx(scale: number): number {
  const box = pinBox(scale);
  return Math.max(MIN_PIN_GAP_PX, Math.hypot(Math.max(box.w, PIN_LABEL_W), box.h));
}

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
  onOpen,
  imageUrl,
  iconName,
}: {
  site: SitePoint | null;
  points: MachinePin[];
  selectedId: string | null;
  /** **Pressing a marker OPENS that machine** (owner, 2026-08-11), it does not merely ring it. Named
   *  for what it does rather than for what it used to do: `onSelect` described a marker that lit a
   *  card the renter then had to find and press a second time. */
  onOpen: (id: string) => void;
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
  /* How big every marker is being drawn at this zoom, decided once and used three times: the fan's
     threshold, the distance chip's clearance test, and the `divIcon` itself. Deriving it separately in
     any of the three is how a marker starts overlapping a chip that was measured against a smaller
     machine. */
  const scale = pinScale(zoom);
  const box = pinBox(scale);
  const placed = useMemo(
    () =>
      decollide<MachinePin>(
        points,
        (lat, lng) => map.project([lat, lng], zoom),
        // The gap the markers are actually DRAWN at, not the 74 px floor — see `pinGapPx`. It rises
        // with the zoom scale, so the machines that just grew do not grow into each other.
        pinGapPx(scale),
      ),
    // `points`/`zoom` are the only real inputs (`scale` is a pure function of `zoom`); `map` is stable
    // for the life of the container.
    [points, zoom, scale, map],
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

      // The chip rides the line, but every line ENDS inside the marker box (anchored bottom), so a
      // fixed fraction lands on the machine whenever the line is short. Walk back from the site end
      // until the point clears that box, then nudge perpendicular, then clear of other chips.
      //
      // Measured against the box AT THIS ZOOM, not against the resting 132×124: the machine grows as
      // the renter zooms in, and a clearance test frozen at the small size would park the chip on top
      // of the machine it is captioning at exactly the zoom he went in to read it.
      let chip: { at: L.LatLng; km: number; far: boolean } | null = null;
      if (p.point.distanceKm != null) {
        const clears = (x: number, y: number) =>
          Math.abs(x - b.x) >= box.w / 2 + 20 || b.y - y >= box.h + 12 || y - b.y >= 26;
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
          // One decimal, the SAME arithmetic `equipmentCardModel` does — a chip and its card must
          // not disagree about one machine by a rounding step (owner, 2026-08-11).
          km: Math.round(p.point.distanceKm * 10) / 10,
          // Read off the UNROUNDED distance, and off the same `isOutOfCity` the card's «· خارج
          // المدينة» reads — the pill and the card line are one fact stated twice.
          far: isOutOfCity(p.point.distanceKm),
        };
      }

      return { id: p.point.id, segments, chip };
    });
  }, [placed, site, map, zoom, box.w, box.h]);

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
              icon={machineIcon(pin, selected, src, iconName, t, ar, scale)}
              zIndexOffset={selected ? 900 : 760}
              riseOnHover
              eventHandlers={{ click: () => onOpen(pin.id) }}
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
      `<span><span dir="ltr">${esc(distanceDigits(km, ar))}</span> ${esc(unit)}</span>` +
      (far ? `<span class="bm-distfar">${esc(farLabel)}</span>` : "") +
      `</div>`,
  });
}

/**
 * **The details box that opens beside a marker on hover** (owner, 2026-08-11: *"hovering an equipment
 * on the map must show its details, the same ones the card shows"*).
 *
 * ── It is the CARD, rendered a second time — not a second description of the machine ──────────────
 * Every value in it comes off `pin.card`, the `EquipmentCardModel` `BidMapWorkspace` built with the
 * SAME `equipmentCardModel(machine, bid)` call the fleet list makes. Nothing is re-derived here: not
 * the availability (RM3-AC-19 — one derivation, four surfaces), not the distance (the one-decimal
 * ruling of 2026-08-11, formatted by the shared `distanceDigits` and never rounded again on the way
 * out), not the out-of-city qualifier, not which certificates are named. The box cannot start
 * disagreeing with the card, because there is no second answer for it to hold.
 *
 * ── Why it is CSS `:hover` on the marker's own markup, and not React state ────────────────────────
 * A `divIcon` is an HTML string with no React lifecycle, so the alternative was a hovered-id state on
 * this component plus a second `Marker` to carry the box. That would have given the canvas a piece of
 * state of its own — the one thing this file's header says it does not have — and would have rebuilt
 * every marker's icon on every mouse-over. The box therefore ships INSIDE the pin it belongs to,
 * hidden, and `.bm-pin:hover .bm-pinfo` reveals it. Leaflet's `riseOnHover` (already on the marker)
 * lifts the hovered pin above its neighbours, so the box is never drawn under another machine.
 *
 * ── The three constraints it is built under ──────────────────────────────────────────────────────
 *  1 · **It is not a click.** Pressing a marker still opens that machine's panel (owner, 2026-08-11)
 *      and that behaviour is untouched — this is a preview on the way to it, never a replacement.
 *  2 · **It is not the only path to any of it.** There is no hover on touch, so a hover-only fact
 *      would be a fact half the renters could not reach. Every line here is already on the card in
 *      the list beside the map and again in the machine's own panel; the box saves a press, and
 *      carries nothing that would be lost without it. It is `aria-hidden` and `pointer-events: none`
 *      for the same reason: duplicated content a reader is walked through twice is noise, and a box
 *      that could swallow the press meant for the marker under it would break rule 1.
 *  3 · **RTL is set from the LOCALE, not from the pin.** `.bm-pin` is hard-coded `dir="rtl"` because
 *      its one label is a chip whose direction cannot matter; four rows of text can, and English
 *      right-aligned under an Arabic container is the exact bug AC-30/AC-98 are about.
 *
 * ── What the screenshot asked for and this box does NOT carry, with the ruling that forbids each ──
 *  · **The plate / serial number.** RM3-AC-12: *no serial number and no load capacity on the card* —
 *    the serial identifies the machine to the SYSTEM, not to a renter. It is not on the card model at
 *    all, and `equipment-card.test.ts` sweeps that model's keys AND its values for one. A box built
 *    from the card cannot state what the card is forbidden to know, and re-deriving it here from the
 *    fleet row would be re-introducing, one surface over, exactly what the AC removed.
 *  · **«unit 1 of 2».** `design.md` §7 decision 3 / §6.3.3 ban the invented per-unit index outright:
 *    nothing links a bid to a numbered unit, so a renter asking *"what about unit 2?"* names something
 *    the supplier cannot resolve. The marker itself has carried that ban since v3.
 *  · **The supplier's company name.** Every marker on this canvas is the same supplier's (AC-75) and
 *    his name is already the panel header's first line; repeating it on each of a dozen markers states
 *    the one fact that cannot vary between them.
 *  · **The yard's name and city.** Not on the card model — it is the machine DETAIL's line
 *    (`EquipmentDetail`), which is one press away, and this surface's contract is that the box and the
 *    card are one model. Adding it would mean putting it on the card too, and the card is fixed at
 *    four rows by RM3-AC-32.
 */
function hoverBoxHtml(card: EquipmentCardModel, ar: boolean, scale: number, t: ReturnType<typeof useT>): string {
  // Clear of the machine's own silhouette at THIS zoom. The art grows out of the resting box, so a
  // fixed offset would have the box sitting on the machine at exactly the zoom it grew for.
  const clear = Math.round(Math.max(10, (PIN_STAGE_W * scale) / 2 - PIN_W / 2 + 12));
  const title = ar ? card.title.ar : card.title.en;
  const confirmed = card.chip.availability === "confirmed";

  return (
    `<div class="bm-pinfo" aria-hidden="true" dir="${ar ? "rtl" : "ltr"}" style="inset-inline-start:calc(100% + ${clear}px)">` +
    `<div class="bm-pinfo-t">${esc(title)}</div>` +
    // The card's ONE state chip (RM3-AC-32), in the card's own words and the model's own colour. Drawn
    // as ink and a keyline rather than as a fill: on a white box a solid availability panel would be
    // the loudest thing on the canvas, and the marker's own label already states this fact filled.
    `<div class="bm-pinfo-r">` +
    `<span class="bm-pinfo-chip" style="color:${card.chip.colour};border-color:${card.chip.colour}">` +
    // Two states, two SHAPES as well as two colours — the card's rule, for the same reader.
    `<span>${confirmed ? "✓" : "•"}</span>${esc(confirmed ? t.bidMap.eqChipConfirmed : t.bidMap.eqChipUnconfirmed)}` +
    `</span>` +
    (card.outOfCity ? `<span class="bm-pinfo-far">${esc(t.bidMap.eqOutOfCity)}</span>` : "") +
    `</div>` +
    // One decimal, always, through the one formatter (owner, 2026-08-11). An unknown distance is a
    // sentence and never a 0.
    `<div class="bm-pinfo-r bm-pinfo-km">` +
    (card.km != null
      ? `<span dir="ltr">${esc(distanceDigits(card.km, ar))}</span> ${esc(t.bidMap.eqDistanceUnit)}`
      : esc(t.bidMap.eqNoDistance)) +
    `</div>` +
    // The certificates the REQUEST asked for, held or missing — the card's row 4, verbatim. The mark
    // is not decoration: at this size the two fills are close enough that colour alone would decide it.
    `<div class="bm-pinfo-c">` +
    (card.certs.length > 0
      ? card.certs
          .map(
            (c) =>
              `<span class="bm-pinfo-cert ${c.held ? "held" : "missing"}">${c.held ? "✓" : "!"} ${esc(ar ? c.label.ar : c.label.en)}</span>`,
          )
          .join("")
      : `<span class="bm-pinfo-none">${esc(t.bidMap.eqNoCerts)}</span>`) +
    `</div>` +
    `</div>`
  );
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
 * ── The selected marker had to be LOUDER (owner, 2026-08-11: *"the selected equipment must be more
 * visible"*) ────────────────────────────────────────────────────────────────────────────────────
 * It was a 2 px halo, a 3 px disc ring and a tick — at 96 px of stage on a busy voyager basemap, with
 * a route, a distance chip and up to a dozen other machines around it, none of that survived a glance.
 * What it gained is **size and lift**, never a fill: `.bm-pin.is-on` scales the stage 1.14 from its
 * bottom edge (so the machine grows UPWARD and the ground point it marks does not move), the disc
 * takes a wider blue ring under a blue glow, a second static ring is drawn around it, and the
 * availability label scales and takes a white keyline so it reads off the tiles.
 *
 * **None of it is a colour** (AC-19). `ring` and `tint` are still `AVAILABILITY_COLOUR`'s and are
 * still the only fills on this marker; every selected-only value is either a geometry (a scale, a
 * width, a lift) or the surface's selection BLUE, which is what the tick and the disc ring already
 * wore. That distinction is the point: a selected machine must read as *the one being looked at*,
 * never as a third thing a machine can BE.
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
  /** The reader's script — for the hover box's four rows of text, and for its distance. The pin's own
   *  markup stays `dir="rtl"`; see `hoverBoxHtml` constraint 3. */
  ar: boolean,
  /** `pinScale(zoom)` — how big the machine is drawn at the zoom this render is at. */
  scale: number,
): L.DivIcon {
  const box = pinBox(scale);
  const ring = AVAILABILITY_COLOUR[pin.availability];
  // The disc's fill is the ring at low alpha — one value per state, kept beside the ring so a fourth
  // state cannot be added to one and forgotten in the other.
  const tint = {
    confirmed: "rgba(22,163,74,.34)",
    unconfirmed: "rgba(217,54,42,.32)",
  }[pin.availability];

  // «مؤكّد توفرها» / «لم يؤكد توفرها بعد». Both read as a STATE and neither carries a reason, a cause
  // or a location-source explanation (AC-20, AC-30).
  //
  // **No in-offer pin caption**, and that is a decision rather than an omission (app parity,
  // `bid_map_strings.dart:708`): membership is a badge on the CARD. A pin caption saying it too would
  // put a second answer on the surface for the reader to reconcile against the colour.
  const state = {
    confirmed: t.bidMap.pinAvailable,
    unconfirmed: t.bidMap.pinUnconfirmed,
  }[pin.availability];

  // The object's own motion and shadow, both prototype values. `drop-shadow`, not `box-shadow`: it has
  // to follow the machine's silhouette, which is the point of shadowing the art rather than a box.
  const art = selected
    ? "animation:dpLift .55s cubic-bezier(.34,1.4,.64,1) forwards;filter:drop-shadow(0 14px 12px rgba(15,34,56,.34))"
    : "transform:translateY(-4px);filter:drop-shadow(0 7px 7px rgba(15,34,56,.30))";

  return L.divIcon({
    className: "", // no Leaflet default box — the marker is entirely our own markup
    // The box GROWS with the machine, and the anchor grows with the box — see `pinBox`. `padding-top`
    // takes up the difference so the drawing keeps its exact place relative to the anchor: the content
    // is laid out from the top of the box, so a taller box would otherwise lift the ground disc off the
    // point it marks, which is the one thing the whole scaling design promised not to do.
    iconSize: [box.w, box.h],
    iconAnchor: [box.w / 2, box.h],
    html:
      // `is-on` carries the whole of the selected EMPHASIS — the scale, the glow, the label's
      // keyline. It is a class rather than more inline style because none of those values is
      // state-DEPENDENT in the way the colours are: they are one fixed treatment, switched on, and
      // the stylesheet is where a fixed treatment belongs (and where it can be swept for the
      // availability colours it must not contain).
      `<div class="bm-pin${selected ? " is-on" : ""}" dir="rtl" style="direction:rtl;width:${box.w}px;padding-top:${box.h - PIN_H}px">` +
      // The zoom LENS. A wrapper rather than a scale on the stage itself, because `.bm-pin.is-on
      // .bm-pin-stage` already owns that transform for the selection emphasis and a second one would
      // have replaced it — a selected machine would have stopped being bigger the moment it was zoomed
      // to. Nested, the two multiply, which is what "the selected one is 14% bigger than its
      // neighbours" has always meant. `transform-origin: bottom center` is in the stylesheet, for the
      // same reason the selected scale's is: the machine grows UPWARD out of the ground it stands on.
      `<div class="bm-pin-lens" style="transform:scale(${scale})">` +
      `<div class="bm-pin-stage">` +
      // A second, STATIC ring outside the breathing halo. The halo pulses to draw the eye and is
      // therefore absent for more than half of every cycle; this one never leaves, so the marker is
      // still unmistakable in the trough of the pulse and in a `prefers-reduced-motion` session
      // where the halo does not animate at all.
      (selected ? `<span class="bm-pin-ring"></span>` : "") +
      (selected ? `<span class="bm-pin-halo" style="border:2.5px solid ${ring}"></span>` : "") +
      `<span class="bm-pin-disc" style="background:${tint};border:2.5px solid ${ring}${selected ? ";box-shadow:0 0 0 4px rgba(37,99,235,.6),0 0 0 10px rgba(37,99,235,.16)" : ""}"></span>` +
      `<span class="bm-pin-shadow"></span>` +
      `<span class="bm-pin-art" style="${art}">` +
      `<span class="bm-pin-glyph material-icons-outlined">${esc(iconName)}</span>` +
      (src ? `<span class="bm-pin-img" style="background-image:url('${src}')"></span>` : "") +
      `</span>` +
      // A sibling of the object, not a child: the object carries a `filter`, which would make it the
      // containing block and drag the tick along with the lift.
      (selected ? `<span class="bm-pin-tick">✓</span>` : "") +
      `</div>` +
      `</div>` +
      // The hover preview, shipped hidden inside the pin and revealed by `.bm-pin:hover` — see
      // `hoverBoxHtml`. A machine with no card model (a preview, a test) simply has no box, which is
      // why this is a conditional and not an empty shell.
      (pin.card ? hoverBoxHtml(pin.card, ar, scale, t) : "") +
      // The label's own selected treatment — the scale and the white keyline — moved to `.bm-pin.is-on
      // .bm-pin-chip`. An inline `transform` here could not be combined with the shadow the emphasis
      // also wants, and would have overridden the stylesheet rather than joining it.
      `<div class="bm-pin-chip" style="background:${ring};border:1px solid ${ring}">${esc(state)}</div>` +
      /* Only the focused marker names itself — the map stays quiet until the renter has chosen
         (AC-34).

         The tag says «في هذا العرض», and since 2026-08-13 that is no longer true of every marker: the
         canvas draws the whole matching fleet, so a selected pin may be a machine the supplier never
         offered. It is therefore drawn only when the machine IS on the offer — and on those the chip
         above already says «في هذا العرض» in orange, so the tag would repeat it. Hence: on a CONFIRMED
         machine only, where the chip says «مؤكّد توفرها» and the commitment is the thing left unsaid. */
      (selected && pin.availability === "confirmed"
        ? `<div class="bm-pin-tag">${esc(t.bidMap.pinInOffer)}</div>`
        : "") +
      `</div>`,
  });
}

export default function MapCanvas({
  site,
  addressLabel,
  machines = [],
  selectedMachineId = null,
  onOpenMachine,
  itemImageUrl = null,
  itemName = null,
}: {
  site: SitePoint | null;
  addressLabel?: string | null;
  /** The bid's OFFERED, plottable machines. Empty for an off-platform bid and while the fleet loads. */
  machines?: MachinePin[];
  selectedMachineId?: string | null;
  /**
   * **Pressing a marker opens that machine's panel** (owner, 2026-08-11: *"clicking an equipment on
   * the map must open the panel of this selected equipment"*).
   *
   * ~~`onSelectMachine`.~~ Withdrawn with the behaviour it named: a marker press used to ring the
   * machine and light its card, leaving the renter who had already pointed at the machine to hunt
   * down that card and press it again to see anything. The canvas still does not decide what an
   * "open" means — the host routes it through `nextSelection(…, "open")`, so ONE selection value
   * still reaches this canvas and the list alike (AC-15) — but the name now says what a press does.
   */
  onOpenMachine?: (id: string) => void;
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
        // **19, the tile ceiling** (owner, 2026-08-11: *"I must be able to zoom in further"*). This was
        // 16 while the `TileLayer` below has always declared 19 — so the basemap served three levels of
        // detail the map refused to show, and a renter trying to see which corner of a yard a machine
        // is parked in hit a wall the tiles did not. 19 is CARTO voyager's own maximum: past it Leaflet
        // would upscale a level-19 raster and the map would go soft with no new information in it.
        // `minZoom`, `zoomSnap`, `zoomDelta`, `wheelPxPerZoomLevel` and `inertiaDeceleration` are the
        // prototype's and are untouched — the comment above records what each of them is for.
        maxZoom={19}
        wheelPxPerZoomLevel={90}
        // `inertiaDeceleration` is the one view option in §7b that is NOT already Leaflet's default.
        // Leaflet ships **3400** px/s² (`leaflet-src.js:13724` — its own doc comment above it says
        // 3000 and is wrong), so an unset map stopped a flick about a fifth harder than the
        // prototype, which coasts a pan across the country instead of parking it under the finger.
        // The rest of §7b's list — `inertia`, `doubleClickZoom`, `keyboard`, `worldCopyJump:false`,
        // `attributionControl` — was checked against that same source and does match, so those are
        // left unstated rather than restated.
        inertiaDeceleration={2800}
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
        {/* Opposite the bid panel, which sits on the inline-START edge (owner, 2026-08-10) — so the
            buttons are top-right in English and top-left in Arabic. Being opposite is the rule, not the
            side: T41 M11's second clause is "never underneath the panel", and the panel is what moved.

            The prototype has no zoom control at all. Kept anyway: it is the only pointer-and-keyboard
            zoom affordance on a surface whose whole subject is distance, and dropping it would leave a
            renter without a wheel or a trackpad with no way to change the view. `zoomControl: false`
            is ported exactly — it is what lets this one be placed rather than Leaflet's default. */}
        <ZoomControl position={dir === "rtl" ? "topleft" : "topright"} />
        {site && <Marker position={[site.lat, site.lng]} icon={icon} interactive={false} zIndexOffset={900} />}
        <FleetLayer
          site={site}
          points={machines}
          selectedId={selectedMachineId}
          onOpen={(id) => onOpenMachine?.(id)}
          imageUrl={itemImageUrl}
          iconName={iconName}
        />
        <FitView site={site} points={machines} />
      </MapContainer>
    </div>
  );
}
