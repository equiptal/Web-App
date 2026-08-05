/**
 * Deal-room rentee map — every rule the map, the bid list and the machine panel share, as pure
 * functions. Spec: `docs/specs/001-deal-room-rentee-map.md` §6.2, §6.3.2, §6.6, §6.9, §6.11.
 *
 * **NO React, NO DOM, NO Leaflet, NO i18n imports.** This file gets a mechanical Dart port when the
 * rentee mobile surface follows, exactly as `bid-readiness.ts` and `apps/mobile/.../bid_readiness.dart`
 * are the same rules written twice. Anything that reaches for a component, a locale or a map library
 * belongs in the caller — the price of parity-by-duplication is that this half stays portable.
 *
 * Why these live together rather than inside the components that draw them: the colour on a pin, the
 * colour on the panel's header chip, the dot on a machine chip and the segments of the composition bar
 * are the SAME fact rendered four times. When each surface derived it for itself they disagreed — a
 * tinted amber chip above a red pin describing one machine is the defect AC-167/168 exist to prevent.
 * One function, four callers, no possible disagreement.
 */

import type { ReadinessBand, UnitReadiness } from "./bid-readiness";
import type { BidCard, OfferedUnitDetail, UnitLocationSource } from "./bids";

/* ────────────────────────────────── availability — the one colour ────────────────────────────────── */

/**
 * `confirmed` → green, `unconfirmed` → red, `absent` → not drawn and not coloured at all.
 * There is no fourth state and there is no amber (AC-129/130/167/168).
 */
export type UnitAvailability = "confirmed" | "unconfirmed" | "absent";

/** §6.3.1 / §6.3.2 fills. Kept next to the states they belong to so a surface cannot invent a third. */
export const AVAILABILITY_COLOUR: Record<"confirmed" | "unconfirmed", string> = {
  confirmed: "#12904A",
  unconfirmed: "#C62A2A",
};

/**
 * The reported §7.3 precedence level, with the one tolerant default this contract allows.
 *
 * A unit with no `locationSource` is a pre-T1 payload (the backend field does not exist yet) or an
 * older client's. It defaults to `listing_yard` — the WEAKEST inferred level — because that is the
 * safe direction to be wrong in: it reads as "not confirmed", so a missing field can never turn a pin
 * green and can never claim a commitment the supplier did not make.
 */
function reportedLocationSource(unit: Pick<OfferedUnitDetail, "locationSource">): UnitLocationSource {
  return unit.locationSource ?? "listing_yard";
}

/**
 * **The single source of the map's colour** (AC-18, §6.9.1). The pin fill, the panel's header chip, the
 * machine chip's dot and the composition bar's solid segments all resolve through here.
 *
 * The question it answers is *"did the supplier commit this machine to THIS bid?"* — which is why only
 * `unit_yard` is confirmed. That level is reachable only through the readiness card, where the supplier
 * names the yard this machine leaves from for this offer. `bid_pin` / `bid_yard` / `listing_yard` are
 * inferred from something he did for the bid as a whole or when he first registered the machine, so
 * they are precise coordinates with no per-unit commitment behind them (§7.3: *"Only level 1 counts as
 * confirmed; 2–4 are inferred"*).
 *
 * **Never read the `yardConfirmed` boolean for colour.** Supplier-side it is derived from
 * `yardId != null` (`bid_readiness_bloc.dart:442`, with `:245` pre-filling the yard from the machine's
 * registered one), the yard sheet never demands an answer, and the readiness gap ladder ignores it — so
 * it is true for every readiness-written entry and carries no information the precedence does not.
 * It is reported verbatim where §7.7 / AC-10 require and rendered nowhere.
 *
 * `unidentified` (a claimed count with no machine) and `none` (a machine with no resolvable location)
 * both give `absent`: neither can be drawn, so neither can carry a colour. They stay distinct on the
 * unit itself because the renter's exposure differs — see `UnitLocationSource`.
 */
export function unitAvailability(unit: Pick<OfferedUnitDetail, "locationSource">): UnitAvailability {
  switch (reportedLocationSource(unit)) {
    case "unit_yard":
      return "confirmed";
    case "bid_pin":
    case "bid_yard":
    case "listing_yard":
      return "unconfirmed";
    case "unidentified":
    case "none":
      return "absent";
  }
}

/* ─────────────────────────────────────── position ─────────────────────────────────────── */

export interface UnitLocation {
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  locationSource: UnitLocationSource;
}

const finite = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Normalise a unit's position for plotting. Tolerant of partial data, and deliberately separate from
 * `unitAvailability`: *where is it* and *did he commit it* are different questions, and a unit can
 * answer one without the other.
 *
 * Two rules it enforces so no caller has to:
 *  - **Never a half-resolved point** (AC-06). One missing side voids both and downgrades the level to
 *    `none` — a point at `(lat, 0)` is somewhere in the Gulf of Guinea, which is worse than no point.
 *  - **`unidentified` keeps its level** even though it has no coordinates. Collapsing it into `none`
 *    would tell the renter a machine exists whose location is unknown, when no machine exists at all.
 */
export function resolveUnitLocation(unit: Pick<OfferedUnitDetail, "lat" | "lng" | "distanceKm" | "locationSource">): UnitLocation {
  const source = reportedLocationSource(unit);
  if (source === "unidentified") return { lat: null, lng: null, distanceKm: null, locationSource: "unidentified" };

  const lat = finite(unit.lat);
  const lng = finite(unit.lng);
  if (lat == null || lng == null) return { lat: null, lng: null, distanceKm: null, locationSource: "none" };

  return { lat, lng, distanceKm: finite(unit.distanceKm), locationSource: source };
}

/** True when this unit can be drawn on the map at all — the pin-set filter (§6.2, AC-19). */
export function isPlottable(unit: Pick<OfferedUnitDetail, "lat" | "lng" | "locationSource">): boolean {
  const at = resolveUnitLocation(unit);
  return at.lat != null && at.lng != null;
}

/* ─────────────────────────────────────── counts ─────────────────────────────────────── */

export interface UnitCounts {
  /** What the supplier QUOTED — `unitsOffered.length`, already reduced to its length by `mapBid`. */
  offered: number;
  /** How many distinct machines he actually named — the deduped `offeredUnitsDetail` length. */
  identified: number;
  /** The gap. Claimed units with no machine behind them. Never negative. */
  unidentified: number;
}

/** Distinct `equipmentId`s in a detail list. The backend dedupes already (padding is genuinely the same
 *  machine — `while (ids.length < count) ids.add(primary)`), but a count that silently double-counts a
 *  padded array would be a lie, so this never trusts the payload for it. */
function distinctUnits(detail: OfferedUnitDetail[] | undefined): OfferedUnitDetail[] {
  const seen = new Set<string>();
  const out: OfferedUnitDetail[] = [];
  for (const u of detail ?? []) {
    const id = u.equipmentId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(u);
  }
  return out;
}

/**
 * The two coverage numbers, **deliberately not reconciled** (§6.12, AC-37, AC-184).
 *
 * `offered` is commercial coverage — what the supplier quoted. `identified` is verifiable substance —
 * what the renter can actually inspect. They differ whenever a supplier quotes a count above the
 * machines he registered, or (after the T2 ownership fix) names a machine he does not own. **That
 * difference is information, not an error**: it is precisely the gap the composition bar exists to
 * expose, so nothing here may clamp one to the other. No surface may present `offered` as a number of
 * machines.
 */
export function unitCounts(bid: Pick<BidCard, "unitsOffered" | "offeredUnitsDetail">): UnitCounts {
  // `mapBid` stores `unitsOffered` as the ARRAY'S LENGTH, not the array (`bids.ts` — the wire field is
  // `bid.units_offered: []`). So the offered count is read straight off the field.
  const offered = Math.max(0, finite(bid.unitsOffered) ?? 0);
  const identified = distinctUnits(bid.offeredUnitsDetail).length;
  return { offered, identified, unidentified: Math.max(0, offered - identified) };
}

/* ─────────────────────────────── composition bar (§6.3.2) ─────────────────────────────── */

/**
 * The four states of a quoted unit, in bar order.
 *  - `ready` — a registered machine whose yard the supplier confirmed for this bid. Solid green.
 *  - `unconfirmed` — a registered machine he did not confirm. Solid red.
 *  - `unregistered` — count-only padding: no machine, no serial, no documents, no location. **Hatched**,
 *    never a transparent outline: an earlier draft drew the single most important fact on the card as
 *    the least visible thing on it. A hatch says *present but not the same kind of thing*.
 *  - `offPlatform` — evidence WITHOUT a listing: photos and documents exist, nothing is registered
 *    (§6.13.5, AC-198). A fourth state on purpose — drawing it as a hole understates it badly.
 */
export type CompositionKind = "ready" | "unconfirmed" | "unregistered" | "offPlatform";

export interface CompositionBucket {
  kind: CompositionKind;
  count: number;
}

/** Bar order, logical (highest substance first). RTL rendering reverses it visually; the order here is
 *  the contract, so the legend and the segments can never disagree about which bucket is which. */
const COMPOSITION_ORDER: CompositionKind[] = ["ready", "unconfirmed", "unregistered", "offPlatform"];

/**
 * The composition bar's segments (AC-143/144/145).
 *
 * **Zero-count buckets are omitted entirely** — not emitted as a zero-width or empty segment. A zero
 * segment is noise, and a zero-width one is a rendering artefact the renter reads as a hairline.
 *
 * Segments are keyed off `unitAvailability` so the bar can never disagree with the pins above it
 * (AC-168). Everything registered-but-not-confirmed lands in `unconfirmed`, including a `none` unit: it
 * IS a registered machine the supplier did not confirm (§6.3.2's own definition of the bucket), it just
 * has no pin to compare against.
 */
export function compositionBuckets(
  bid: Pick<BidCard, "unitsOffered" | "offeredUnitsDetail" | "viaSharedLink">,
): CompositionBucket[] {
  const { offered, unidentified } = unitCounts(bid);
  const counts: Record<CompositionKind, number> = { ready: 0, unconfirmed: 0, unregistered: 0, offPlatform: 0 };

  if (bid.viaSharedLink === true) {
    // An off-platform submission has no listings at all, so every quoted unit is evidence-without-listing.
    // `converted` bids are NOT routed here: a converted submission is a real bid with real registered
    // machines, and only its LABELLING stays off-platform (AC-203).
    counts.offPlatform = offered;
  } else {
    for (const u of distinctUnits(bid.offeredUnitsDetail)) {
      // A detail row that reports itself `unidentified` has no machine behind it, so it belongs to the
      // hatch and not to a colour. The backend does not emit one today (padding is deduped away before
      // it becomes a row); handling it here means the bar's segments still sum to the quoted count if it
      // ever does, instead of colouring a unit that does not exist.
      if (reportedLocationSource(u) === "unidentified") counts.unregistered += 1;
      else if (unitAvailability(u) === "confirmed") counts.ready += 1;
      else counts.unconfirmed += 1;
    }
    counts.unregistered += unidentified;
  }

  return COMPOSITION_ORDER.filter((k) => counts[k] > 0).map((kind) => ({ kind, count: counts[kind] }));
}

/* ─────────────────────────────────────── sorting ─────────────────────────────────────── */

/** The only two sorts that exist (AC-24). **Rating is retired**, and there is no distance FILTER — §6.10
 *  was withdrawn 2026-08-06 because a bid 185 km away can own a machine 12 km from the site, so a band
 *  would have hidden exactly the machine the renter wanted. */
export type BidSortKey = "price" | "nearest";

/**
 * Sort a bid list. Returns a NEW array — the caller's order is a render input and re-sorting it in
 * place makes an arriving bid appear to move rows that did not change (§6.11's re-sort is normative,
 * but it must be a re-sort of a fresh list).
 *
 * **Nulls always sort LAST, never first** (AC-24). A missing rate or a missing distance is unknown, and
 * `null → 0` would rank the least-known offer as the best one. `price` is measured on the bid's rate and
 * is therefore untouched by a null distance; `nearest` is measured on the BID's `distanceKm` (D-D), not
 * on its nearest qualifying machine — ranking a supplier for a machine that is not on the table would
 * mislead, and it would force loading every bid's fleet at mount.
 *
 * With no project location every distance is null, so `nearest` returns the input order unchanged
 * rather than an arbitrary one (AC-21 — the caller disables the control).
 */
export function sortBids<T extends Pick<BidCard, "price" | "distanceKm">>(bids: readonly T[], key: BidSortKey): T[] {
  const value = (b: T): number | null => (key === "price" ? finite(b.price) : finite(b.distanceKm));
  // Decorate with the original index so the sort is stable across engines: an unstable sort would
  // reshuffle equal-priced rows on every refetch and read as movement that did not happen.
  return bids
    .map((bid, index) => ({ bid, index, v: value(bid) }))
    .sort((a, b) => {
      if (a.v == null && b.v == null) return a.index - b.index;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      return a.v !== b.v ? a.v - b.v : a.index - b.index;
    })
    .map((x) => x.bid);
}

/* ────────────────────────────── per-unit indicators (§6.6) ────────────────────────────── */

export interface UnitIndicators {
  /** *Does this machine hold what the request asks for?* — from `computeBidReadiness`. Null when there
   *  is nothing to score. **Never `red` for an absence** (AC-59): an off-platform bid has no
   *  `offeredUnitsDetail`, so readiness is unavailable, not failing. */
  readinessBand: ReadinessBand | null;
  /** *Did the supplier commit this machine to this bid?* — `unitAvailability`. */
  availability: UnitAvailability;
}

/**
 * The two signals a unit carries, as **two independent channels** (AC-55→58).
 *
 * They must never be merged into one colour, because a unit can be fully documented with no confirmed
 * yard, or sit in a confirmed yard with no paperwork at all — and when they disagree, that disagreement
 * is the information. Neither may mask the other (AC-57).
 *
 * **Both render for a single-unit bid too** (AC-56). There is no "only when multi-unit" condition
 * anywhere in this function — a lone machine still has a readiness band and a yard state.
 *
 * **A unit with no location gets neither** (AC-58). No machine means no documents to score and no yard
 * to confirm; a red readiness badge would wrongly imply a machine exists and is failing. This applies
 * to `none` as well as `unidentified`: both are undrawable, so there is no pin to decorate and no
 * availability colour to pair a band with. (§6.6 names only `unidentified`; extending it to `none`
 * keeps this function consistent with `unitAvailability`, which cannot colour either one.)
 */
export function unitIndicators(
  unit: Pick<OfferedUnitDetail, "locationSource">,
  readiness?: UnitReadiness | null,
): UnitIndicators {
  const availability = unitAvailability(unit);
  if (availability === "absent") return { readinessBand: null, availability };
  return { readinessBand: readiness?.band ?? null, availability };
}

/* ──────────────────────────── pin de-collision in screen space ──────────────────────────── */

/** The minimum on-screen gap between two machine pins, in CSS pixels (§6.2). */
export const MIN_PIN_GAP_PX = 74;

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
}

export interface PlacedPoint<T extends MapPoint = MapPoint> {
  point: T;
  /** Where to DRAW the marker, in screen pixels. */
  x: number;
  y: number;
  /** Where the machine actually is, in screen pixels — the far end of the leader line. Equal to
   *  `{x, y}` when the pin was not moved, so a caller can draw the line unconditionally and get a
   *  zero-length one it can skip. */
  anchorX: number;
  anchorY: number;
  /** True when this pin was moved off its yard to clear a collision — the caller draws a leader line. */
  displaced: boolean;
}

/**
 * Fan out pins that would overlap on screen, returning both the displaced position and an anchor back
 * to the true yard so the caller can draw a leader line (§6.2).
 *
 * **Screen space, not coordinate space.** Comparing coordinates for equality is not enough: two
 * machines parked in one yard are metres apart in the data — never equal — and still land on the same
 * 40 px pin. The threshold is a projected-pixel distance, so it also behaves correctly as the renter
 * zooms: pins that overlap at city zoom separate on their own when he zooms in.
 *
 * `project` is INJECTED (`(lat, lng) => {x, y}`) rather than imported, which is the whole reason this
 * function can live in a Leaflet-free file and be unit-tested without a map, a DOM or a viewport.
 *
 * Clustering is single-linkage: a chain of pins each within `minPx` of the next is one cluster, so a
 * row of machines along a road fans as one group instead of leaving a pair still touching. Members are
 * placed on a circle whose radius is chosen to make ADJACENT members exactly `minPx` apart
 * (`minPx / (2·sin(π/n))`), starting at 12 o'clock and going clockwise, which keeps the arrangement
 * deterministic — the same fleet must fan the same way on every render.
 */
export function decollide<T extends MapPoint>(
  points: readonly T[],
  project: (lat: number, lng: number) => { x: number; y: number },
  minPx: number = MIN_PIN_GAP_PX,
): PlacedPoint<T>[] {
  const projected = points.map((point) => {
    const { x, y } = project(point.lat, point.lng);
    return { point, x, y };
  });

  const clusters = clusterByProximity(projected, minPx);
  const out: PlacedPoint<T>[] = [];

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const only = cluster[0];
      out.push({ point: only.point, x: only.x, y: only.y, anchorX: only.x, anchorY: only.y, displaced: false });
      continue;
    }
    // Fan around the cluster's centroid rather than around its first member, so no one machine keeps
    // the "real" position while its neighbours all appear to have moved.
    const cx = cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length;
    const cy = cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length;
    const radius = minPx / (2 * Math.sin(Math.PI / cluster.length));
    cluster.forEach((p, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / cluster.length;
      out.push({
        point: p.point,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        anchorX: p.x,
        anchorY: p.y,
        displaced: true,
      });
    });
  }

  // Restore the caller's order: the pin list is also the panel's machine list, and reordering it would
  // reorder the chips.
  const rank = new Map(points.map((p, i) => [p.id, i]));
  return out.sort((a, b) => (rank.get(a.point.id) ?? 0) - (rank.get(b.point.id) ?? 0));
}

/** Single-linkage grouping of projected points: every point within `minPx` of any cluster member joins
 *  that cluster. Fleet sizes here are tens of machines, so the O(n²) sweep is deliberate — it is exact,
 *  and a grid index would add a bucket-size parameter to get wrong. */
function clusterByProximity<P extends { x: number; y: number }>(projected: readonly P[], minPx: number): P[][] {
  const unvisited = new Set(projected.keys());
  const clusters: P[][] = [];

  for (const seed of projected.keys()) {
    if (!unvisited.has(seed)) continue;
    unvisited.delete(seed);
    const cluster: P[] = [projected[seed]];
    const queue = [seed];
    while (queue.length) {
      const i = queue.shift() as number;
      for (const j of [...unvisited]) {
        const dx = projected[i].x - projected[j].x;
        const dy = projected[i].y - projected[j].y;
        if (Math.hypot(dx, dy) < minPx) {
          unvisited.delete(j);
          cluster.push(projected[j]);
          queue.push(j);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

/* ───────────────────────────────── colour key (§6.9) ───────────────────────────────── */

/** A machine-readable meaning token, NOT display copy — this file holds no i18n. The caller maps each
 *  token to a locale string; keeping them enumerable is what lets a test prove no meaning appears twice. */
export type ColourMeaning = "confirmed" | "not_confirmed";

export interface ColourKeyEntry {
  availability: "confirmed" | "unconfirmed";
  meaning: ColourMeaning;
  colour: string;
}

export interface ColourKeyScale {
  /** There is exactly one scale and its subject is a MACHINE — every pin is a machine (§6.9.1). */
  subject: "machine";
  entries: ColourKeyEntry[];
}

export interface ColourKeyModel {
  scales: ColourKeyScale[];
}

/**
 * **Exactly ONE scale: green confirmed, red not confirmed** (AC-129/130/167/168).
 *
 * Two earlier mistakes this shape exists to make unrepresentable:
 *  1. **A second, supplier-level scale** (green all / grey some / red none). It described dots that no
 *     longer exist — the map stopped plotting suppliers when this feature became project-pin-only — so
 *     it explained nothing on screen. `scales` is returned as a list only so a test can assert its
 *     length is 1; nothing may append to it.
 *  2. **Red and amber for the same idea.** The pre-selection legend taught green/red while the
 *     post-selection one used amber for "not confirmed", so the renter learned red and then met amber.
 *     There is no amber here and `ColourMeaning` has no third member to give one to.
 *
 * The key's COPY is the caller's (§6.9.3), but one clause of it is load-bearing and must not be
 * dropped: *«غير مؤكّدة» does not mean unavailable.* Red is a strong signal, and without that sentence
 * an unconfirmed machine reads as rejected and the renter discards a supplier who never declined
 * anything.
 */
export function colourKeyModel(): ColourKeyModel {
  return {
    scales: [
      {
        subject: "machine",
        entries: [
          { availability: "confirmed", meaning: "confirmed", colour: AVAILABILITY_COLOUR.confirmed },
          { availability: "unconfirmed", meaning: "not_confirmed", colour: AVAILABILITY_COLOUR.unconfirmed },
        ],
      },
    ],
  };
}

/* ───────────────────────────────── unit count label ───────────────────────────────── */

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** Western digits → Arabic-Indic, per digit. */
function toArabicIndic(n: number): string {
  return String(Math.trunc(Math.abs(n))).replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)]);
}

/**
 * `١ وحدة` · `٢ وحدة` · `١١ وحدة` — **one literal form for every count** (AC-146).
 *
 * No grammatical pluralisation: no `وحدتين` for two and no `وحدات` for many. That is a product
 * decision taken by the owner over correct Arabic dual/plural forms, which is exactly why it lives in
 * one helper — if it is ever revisited it changes here and nowhere else.
 *
 * The one string this file is allowed to hold. It is a pure formatter with no locale switch: the count
 * form is the same everywhere the Arabic surface renders, so there is nothing for i18n to decide.
 */
export function unitCountLabel(n: number): string {
  return `${toArabicIndic(n)} وحدة`;
}
