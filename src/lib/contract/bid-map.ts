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
 * `confirmed` → green, `unconfirmed` → red, `absent` → not drawn and not coloured.
 *
 * ── TWO ring colours, and membership is a badge (aligned with the app, 2026-08-17) ──────────────
 * This asks exactly one question: **has the lessor named the yard this machine leaves from, for this
 * bid?** Green says yes, red says not yet. Nothing else changes it.
 *
 * ~~THREE states since 2026-08-13.~~ ~~`in_offer` — offered, no yard named — took orange, and a
 * machine he had NOT offered was forced to red whatever its yard said. The owner, on the web side:
 * *"all equipments will be shown, and if in the offer but not confirmed then this green will be
 * orange and called 'in this offer' … for red keep it not confirmed."*~~
 *
 * **Withdrawn 2026-08-17.** The app reached the opposite conclusion on the same day from the same
 * owner (`bid_map.dart:196`), and it is the one that stands: folding membership into the colour
 * *"made one level read two ways and left a machine standing in a named yard looking unconfirmed
 * because this bid had not offered it."* Both quotes are kept because a reader who cannot see that a
 * decision was reversed will reverse it again.
 *
 * Membership did not disappear — it moved. {@link isInOffer} answers it, and it is drawn as the
 * «ضمن العرض» badge in {@link IN_OFFER_BADGE_COLOUR}, which is deliberately NEITHER availability
 * colour: painting it as one would make it read as a third availability state and undo the split.
 *
 * `absent` is unchanged and still means "there is no machine here to colour".
 */
export type UnitAvailability = "confirmed" | "unconfirmed" | "absent";

/**
 * §6.3.1 / §6.3.2 fills. Kept next to the states they belong to so a surface cannot invent a fourth.
 *
 * **The prototype's pair, not §6.3.1's** (`design.md` §7 decision 1, settled 2026-08-06). The spec asks
 * for `var(--ok-deep)` / `var(--danger)` on the header chip while the prototype's pin, machine chip and composition
 * bar all use `var(--ok)` / `var(--danger)`. AC-168 requires all four surfaces to be the *same* red, so there
 * can only be one pair — and the prototype's is the one three of the four already draw.
 *
 * Two entries, not three: orange left this map on 2026-08-17 — see {@link IN_OFFER_BADGE_COLOUR}.
 */
export const AVAILABILITY_COLOUR: Record<"confirmed" | "unconfirmed", string> = {
  confirmed: "var(--ok)",
  unconfirmed: "var(--danger)",
};

/**
 * **The «ضمن العرض» badge's fill** — this surface's single accent orange.
 *
 * It is deliberately NEITHER availability colour. The badge answers a different question from the
 * ring, so painting it green or red would read as a third availability state and undo the whole point
 * of splitting them (`bid_map.dart:52`, app parity).
 *
 * Same hex as {@link SHORTFALL_COLOUR}, deliberately two constants over one value: the shortfall
 * answers "units were claimed with no machine behind them" and this answers "this machine is on the
 * offer". One surface, one orange — but if either ever wants its own tone, the other must not follow
 * it by accident.
 */
export const IN_OFFER_BADGE_COLOUR = "var(--brand)";

/**
 * **Is this machine in the offer?** — the second, INDEPENDENT flag, drawn as a badge rather than a
 * colour (app parity, `bid_map.dart:230`).
 *
 * It reads `inBid` and nothing else: whether this bid's `unitsOffered` names the machine. Deliberately
 * not folded into {@link unitAvailability} — one signal cannot answer two questions without lying
 * about one of them. A machine can be offered with no yard named yet, and a machine can stand in a
 * named yard without being offered at all. Two flags say both.
 *
 * `inBid` is absent on surfaces that only ever hold offered units (the bid list's `offeredUnitsDetail`
 * has no such field). Absent means "this caller has no non-offered machines to tell apart", so it
 * answers true and those surfaces read exactly as they did.
 */
export function isInOffer(unit: { inBid?: boolean }): boolean {
  return unit.inBid !== false;
}

/**
 * «خارج المدينة» — the distance past which a machine is no longer a same-city job.
 *
 * The prototype's own threshold (`CITY_KM()`, decoded line 344) and its own reading of it
 * (`outOfCity(u) = u.km > CITY_KM()`). It is a **presentation** rule and nothing else: it does not
 * filter, it does not sort, it does not colour a pin, and it never contradicts the distance beside
 * it. It says only that the yard is outside the request city's own radius, which is the fact that
 * turns a delivery into a mobilisation the renter should be asking about.
 *
 * A machine with **no** distance is never out of city — an unknown distance is not a far one, the same
 * rule `equipmentListView`'s distance bands already hold.
 */
export const OUT_OF_CITY_KM = 45;

/** True only for a machine with a real distance greater than {@link OUT_OF_CITY_KM}. */
export function isOutOfCity(distanceKm: number | null | undefined): boolean {
  return typeof distanceKm === "number" && Number.isFinite(distanceKm) && distanceKm > OUT_OF_CITY_KM;
}

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
export function unitAvailability(
  unit: Pick<OfferedUnitDetail, "locationSource"> & { inBid?: boolean },
): UnitAvailability {
  const source = reportedLocationSource(unit);

  /* ── It does NOT read `inBid` (app parity, 2026-08-17) ────────────────────────────────────────
     ~~`inBid === false` outranked the precedence entirely.~~ Withdrawn: that made one level read two
     ways and left a machine standing in a named yard looking unconfirmed because this bid had not
     offered it. Membership is {@link isInOffer} and is drawn as a badge.

     In practice a machine outside the bid still reads unconfirmed, because only an entry in this
     bid's `unitsOffered` can produce `unit_yard` — the backend hands the rest their listing yard. The
     difference is where the rule lives: in the data, not in a second reading of `inBid` here. */
  switch (source) {
    case "unit_yard":
      return "confirmed";
    // Precise coordinates with no per-unit commitment behind them. The yard for THIS bid is still
    // unnamed, which is the only question this function asks.
    case "bid_pin":
    case "bid_yard":
    case "listing_yard":
      return "unconfirmed";
    // A REGISTERED machine whose every location level is null (its yard was deleted — `bids.yard_id`
    // is ON DELETE SET NULL). The supplier never committed it to this bid from a named yard, so it is
    // `unconfirmed`, NOT `absent`: it still has photos and documents, so its readiness band is
    // meaningful and AC-58 strips indicators only for `unidentified`. It simply cannot be plotted —
    // that is `isPlottable`'s job, which reads coordinates and never this function.
    case "none":
      return "unconfirmed";
    // No machine at all — padding in `unitsOffered` beyond the machines named. Nothing to score, no
    // yard to confirm, never drawn (§6.2, §6.6, AC-58).
    case "unidentified":
      return "absent";
  }
}

/**
 * **The availability fact, resolved once, for every surface that draws it.**
 *
 * `unitAvailability` answers *what state is this machine in*; `AVAILABILITY_COLOUR` answers *what
 * colour does that state wear*. Every caller needed BOTH and every caller paired them itself — the
 * card chip, the card's photo hairline, the marker's disc and the marker's caption each wrote their
 * own `unitAvailability(m) === "confirmed" ? … : …`. Four spellings of one fact is exactly the shape
 * a disagreement arrives in, and RM3-AC-19 is the criterion that forbids it: the pin and the card
 * chip must be the same derivation, not two derivations that currently agree.
 *
 * **`absent` collapses to `unconfirmed` here, and that is deliberate.** Nothing that reaches a card or
 * a marker can be `absent` — `listedMachines` drops it before either — but the colour map has no key
 * for it, so the fall-through has to resolve somewhere, and it resolves to the state that claims LEAST.
 * A caller that needs the four-state answer calls `unitAvailability` directly; a caller that is about
 * to paint something calls this.
 *
 * **Two paintable states since 2026-08-17** — see {@link UnitAvailability}. Membership is not a
 * colour; it is {@link isInOffer}, drawn as a badge.
 *
 * **Never reads `yardConfirmed`** — `unitAvailability`'s doc block above records the full reason.
 */
export interface AvailabilityView {
  availability: "confirmed" | "unconfirmed";
  colour: string;
}

export function availabilityView(
  unit: Pick<OfferedUnitDetail, "locationSource"> & { inBid?: boolean },
): AvailabilityView {
  const state = unitAvailability(unit);
  const availability = state === "absent" ? "unconfirmed" : state;
  return { availability, colour: AVAILABILITY_COLOUR[availability] };
}

/**
 * **The blue every ask on this surface wears** (RM3-AC-33) — the card's «اطلب التأكيد» and the
 * shortfall alert's «اطلب إضافتها».
 *
 * Blue, **never navy**. Beside a red chip a navy control reads as disabled, and this is the one thing
 * on an unconfirmed card the renter is supposed to press. It is a constant rather than a CSS literal
 * so the rule is assertable: `map-proto.css` carries the same value, and a test binds the two.
 */
export const REQUEST_ACTION_COLOUR = "var(--action)";

/**
 * **The shortfall alert's one colour** (RM3-AC-06) — ORANGE, and never the availability RED.
 *
 * Red on this surface means availability and nothing else. A shortfall is an INCOMPLETE OFFER, not an
 * unavailable machine, and painting both red collapses two different problems into one signal. Stated
 * here rather than only in the stylesheet for the same reason as {@link REQUEST_ACTION_COLOUR}: a
 * colour rule that lives only in CSS cannot be asserted, and this one is a criterion.
 *
 * **Which orange, and why it moved.** This was `var(--warn)` until 2026-08-11. Both are orange and
 * RM3-AC-06 is untouched by the change — what was wrong is that the v3 palette carries TWO warm
 * tokens, `orange` `var(--brand)` and `amber` `var(--warn)` (decoded line 9 and line 12), and the prototype's
 * own shortfall alert is drawn in `orangeLt`/`orangeBd` (decoded 3778), as is the equipment card's
 * certificate chip beside it. Holding `amber` here while the alert was tinted from `orange` would
 * leave this constant naming a colour the surface paints nowhere — which defeats the only reason it
 * is a constant, since the test that binds it to `map-proto.css` is what makes the rule assertable.
 */
export const SHORTFALL_COLOUR = "var(--brand)";

/**
 * The shortfall alert, or null when there is no shortfall (§6.3, RM3-AC-05/06).
 *
 * **`claimed` — the DIFFERENCE — is the whole content of this model.** The alert says *"N units were
 * quoted with no machine behind them"*; it must never state the OFFERED total, which would read as
 * *"the whole offer is unbacked"* and is the larger, wrong number in every case where the two differ.
 * The offered count is deliberately not carried here at all, so the copy has nothing else to reach
 * for.
 *
 * It renders on `countCase === "short"` and on nothing else, so its ABSENCE reliably means nothing is
 * claimed (RM3-AC-05) — including for a one-unit offer, which is `single` however the arithmetic
 * lands.
 */
export interface ShortfallAlert {
  /** `offered − registered`, clamped — never `offered`. */
  claimed: number;
  /** Orange. Named on the model so a caller cannot reach for the availability red instead. */
  colour: string;
}

export function shortfallAlert(counts: Pick<UnitCounts, "offered" | "claimed">): ShortfallAlert | null {
  if (countCase(counts) !== "short") return null;
  return { claimed: counts.claimed, colour: SHORTFALL_COLOUR };
}

/**
 * **How long V6's landing attention cue runs before the card rests** (RM3-AC-35).
 *
 * 6 × 1.5s — the `bmCue` keyframes' own budget — plus a beat, so the class leaves the DOM after the
 * animation has already finished rather than cutting it short. **Finite, and a real number**: the cue
 * is an event that ends, and a cue that loops stops being a cue and becomes decoration.
 *
 * It lives here rather than in `BidMapWorkspace` so the constant is importable by a node test without
 * dragging React, Leaflet and a stylesheet in behind it.
 */
export const LANDING_CUE_MS = 9_400;

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
  /** What the supplier QUOTED for this bid — `unitsOffered.length`, already reduced to its length by
   *  `mapBid`. **Never `agreedUnits`** (RM3-AC-65/67): the pills describe the OFFER, and the price
   *  footer is the one surface that prices on what was agreed. A mid-negotiation
   *  `lastProposedRentalUnits` is an unapproved counter and must not rewrite what the offer says. */
  offered: number;
  /** Machines this bid actually names — fleet rows with `inBid === true`, and only those (004a §4.2).
   *  The fleet response also carries machines the supplier owns but did NOT offer, so counting every
   *  row here would understate every shortfall to zero. */
  registered: number;
  /** The shortfall: `offered − registered`, **clamped at 0** (RM3-AC-31). Units quoted as a count with
   *  no machine behind them — no location, no documents, no serial, and never drawn on the map. */
  claimed: number;
  /** How many QUALIFYING machines the supplier owns — the fleet response's row count (§7.1: *"the
   *  fleet total is this response's row count"*). Qualifying, not total inventory: `getMatchedFleet`
   *  filters by the request's subtype **and** capacity (004a §4.1), so copy built on this number must
   *  never imply the supplier's whole fleet. */
  owned: number;
}

/**
 * The three numbers the count pills and the shortfall alert are built from (§6.2, §6.3).
 *
 * **`claimed` is `offered − registered` and nothing else** (RM3-AC-31). Two wrong derivations were
 * available and both are excluded by construction: subtracting the fleet TOTAL (which counts machines
 * that were never offered, so a supplier with a big yard would never show a shortfall), and counting
 * `offeredUnitsDetail` (which the backend pads with the primary machine — `while (ids.length < count)
 * ids.add(primary)` — so a padded array reads as fully backed).
 *
 * The counts can MOVE while the renter is looking: until the deal room exists the supplier can still
 * add units, and `unitsOffered.length` is the offered count (004a §4.3). Nothing here caches, and no
 * copy built on it may imply the numbers are fixed.
 */
export function unitCounts(
  bid: Pick<BidCard, "unitsOffered">,
  // Structurally typed rather than importing `FleetMachine`, so this file stays free of the fetch
  // contract and its Dart port has nothing extra to carry.
  fleet: readonly { inBid: boolean }[],
): UnitCounts {
  // `mapBid` stores `unitsOffered` as the ARRAY'S LENGTH, not the array (`bids.ts` — the wire field is
  // `bid.units_offered: []`). So the offered count is read straight off the field.
  const offered = Math.max(0, finite(bid.unitsOffered) ?? 0);
  const registered = fleet.reduce((n, m) => (m.inBid === true ? n + 1 : n), 0);
  return { offered, registered, claimed: Math.max(0, offered - registered), owned: fleet.length };
}

/**
 * Which of §6.2's three cases these counts are — the one place the branch is decided, so the pills and
 * the alert can never disagree about which state they are rendering.
 *
 * `single` (offered ≤ 1) → the owned pill alone. `multi` → both pills, **no** alert (RM3-AC-04).
 * `short` → both pills **plus** the alert. The alert renders on `short` and on nothing else, so its
 * absence reliably means nothing is claimed (RM3-AC-05).
 */
export type CountCase = "single" | "multi" | "short";

export function countCase(counts: Pick<UnitCounts, "offered" | "claimed">): CountCase {
  if (counts.offered <= 1) return "single";
  return counts.claimed > 0 ? "short" : "multi";
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

/**
 * The minimum on-screen gap between two machine pins, in CSS pixels (§6.2) — and, since 2026-08-11, a
 * **FLOOR rather than the answer**.
 *
 * 74 was never the marker's size: the `divIcon` box is 132 × 124 and the availability label hangs off
 * its bottom edge, so two pins exactly 74 px apart drew two machines whose labels sat on top of each
 * other — the defect the owner reported at close zoom (*"the labels stack and I cannot read either"*),
 * and one that was equally present at city zoom where nobody had looked for it.
 *
 * The real separation is therefore computed by the DRAWING surface, which is the only place that knows
 * how big the marker is being drawn — `MapCanvas.pinGapPx()`, off the marker box, the label strip and
 * the zoom scale. This constant stays as the floor that surface clamps against and as the default for
 * a caller with no drawn size in hand (and for the unit tests, which assert the fan geometry rather
 * than the marker's dimensions).
 *
 * It is deliberately NOT raised here to the drawn size. `decollide` is portable, DOM-free and gets a
 * Dart port; the pixel dimensions of a web `divIcon` are not a fact this file can hold.
 */
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

/* ───────────────────────────────── unit count label ───────────────────────────────── */

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
  return `${Math.trunc(Math.abs(n))} وحدة`;
}

/**
 * The bare numeral for a pill whose noun comes from the taxonomy rather than from `unitCountLabel`'s
 * literal «وحدة». Same formatter, without the noun.
 *
 * ⚠️ **It no longer converts.** Digits are Latin app-wide, in Arabic too (owner, 2026-09-04: *"the
 * numbers should be in eng even in arabic"*, carried out across the app in `1aabf6db`). The name is
 * kept only so the ~15 call sites did not all have to move in one commit; it is the place to delete
 * once they read `String(n)` directly.
 *
 * **Counts only.** It TRUNCATES, which is right for a count — there is no such thing as 2.4 machines —
 * and silently wrong for anything measured. A distance goes through {@link distanceDigits} instead,
 * and that is the whole reason the two are separate functions.
 */
export function arabicIndicDigits(n: number): string {
  return String(Math.trunc(Math.abs(n)));
}

/**
 * **One distance, one decimal, in the reader's digits** (owner, 2026-08-11: *"do not round, always keep
 * one decimal"*).
 *
 * Every surface that says how far a machine is — the card, the marker's distance chip, the detail's own
 * line — comes through here, because the failure this exists to prevent is precisely two of them
 * disagreeing about one machine.
 *
 * **Whole kilometres were too coarse to be honest.** A supplier moved a machine to a genuinely nearer
 * yard and the fleet read went 8.2 → 7.5 km; under `Math.round` both rendered «8 km», so the move was
 * invisible — and since `Math.round(7.5)` is 8, a yard 700 m closer displayed as *the same distance*.
 * These machines are usually inside one city, where the differences that matter are hundreds of metres.
 *
 * **The trailing `.0` is kept**, always: `8.0` and `٨٫٠`, never `8`. A column of distances is read by
 * scanning down it, and one figure of a different shape is a figure the eye stops on for no reason.
 *
 * Callers keep the null case themselves — an unknown distance is a sentence, not a number, and must
 * never be allowed to become `0.0`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the locale no longer changes the answer
export function distanceDigits(km: number, _ar: boolean): string {
  // `_ar` is kept so no call site changes: the Arabic branch is gone, not the parameter. Digits are
  // Latin in both locales now, and with them the Arabic decimal separator «٫» — a distance that reads
  // «٨٫٢ كم» beside a price that reads «8,200» is the mismatch the ruling exists to end.
  return Math.abs(km).toFixed(1);
}

/**
 * **English only.** The count pill's type word has to agree in number with the count (RM3-AC-08), and
 * the type comes from the REQUEST's taxonomy — a plain noun phrase like `Forklift` or `Mobile crane`,
 * with the capacity (`3 ton`) carried as a separate field. So agreement is the last word's plural.
 *
 * Arabic gets **no** counterpart on purpose. Its counted-noun rule needs singular/dual/plural forms of
 * the taxonomy word, and the taxonomy stores exactly one form — deriving a broken plural from a name is
 * not a transformation this data supports. It therefore follows the same product decision
 * `unitCountLabel` records: **one literal form for every count**.
 */
export function englishTypePlural(name: string | null | undefined, n: number): string {
  const base = (name ?? "").trim();
  if (!base || n === 1) return base;
  const words = base.split(/\s+/);
  const last = words[words.length - 1];
  // Only inflect a word that is actually a word — a name ending in a number or a symbol (`3T`) has no
  // English plural to reach for, so it is left exactly as the taxonomy wrote it.
  if (!/^[A-Za-z]+$/.test(last)) return base;
  const lower = last.toLowerCase();
  let plural: string;
  if (/(s|x|z|ch|sh)$/.test(lower)) plural = `${last}es`;
  else if (/[^aeiou]y$/.test(lower)) plural = `${last.slice(0, -1)}ies`;
  else plural = `${last}s`;
  words[words.length - 1] = plural;
  return words.join(" ");
}

/**
 * The **request item's** four taxonomy fields, and nothing else — the only shape the count pills' type
 * word may be built from.
 *
 * Named `subtype*` / `capacity*` because that is what the REQUEST calls them. A fleet row calls the
 * same ideas `subcategoryName` and `measurementName`, so a machine handed to {@link requestTypeWord}
 * satisfies none of these fields and produces an empty word rather than a plausible wrong one. That
 * mismatch is the point of the type: the failure is loud instead of silent.
 */
export interface RequestTypeSource {
  subtypeName?: string | null;
  subtypeNameAr?: string | null;
  capacityName?: string | null;
  capacityNameAr?: string | null;
}

/**
 * **The count pills' type word — from the REQUEST's own type, never the machine's** (RM3-AC-08).
 *
 * The pills say *"N Forklifts 3 ton"*: the renter asked for forklifts, and the number counts what he
 * asked for. Reading the word off the machines instead would be wrong in the two cases that matter —
 * a supplier answering a forklift request with a machine the taxonomy files under a neighbouring
 * subtype would rename the renter's own request in front of him, and «٠ لدى المؤجّر» has no machine to
 * read a word off at all. The request always has one, and it is the one the renter recognises.
 *
 * Returns both locales; the caller picks, exactly as `certificateChips` does. English inflects the
 * subtype's head noun to agree with `n` ({@link englishTypePlural}); Arabic keeps one literal form,
 * the same product decision `unitCountLabel` records — the taxonomy stores a single form per node.
 * The capacity rides along unchanged in both: `3 ton` is a measurement, not a counted noun.
 */
export function requestTypeWord(item: RequestTypeSource | null | undefined, n: number): { en: string; ar: string } {
  const join = (head: string | null, capacity: string | null) => [head, capacity].filter(Boolean).join(" ").trim();
  const enSubtype = item?.subtypeName ?? item?.subtypeNameAr ?? null;
  const arSubtype = item?.subtypeNameAr ?? item?.subtypeName ?? null;
  return {
    en: join(englishTypePlural(enSubtype, n), item?.capacityName ?? item?.capacityNameAr ?? null),
    ar: join(arSubtype, item?.capacityNameAr ?? item?.capacityName ?? null),
  };
}
