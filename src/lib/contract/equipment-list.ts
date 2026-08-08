/**
 * **V5 + V6 + V17** — which machines the equipment list shows, in what order, which one is already
 * selected when the renter arrives, and **which of them a filter is letting through**
 * (spec 004 §6.4, §6.4a; RM3-AC-09, AC-10, AC-28, AC-34).
 *
 * **NO React, NO DOM, NO Leaflet, NO i18n imports** — the same rule `bid-map.ts` states and for the
 * same reason: the rentee mobile surface gets a mechanical Dart port of these rules, and anything that
 * reaches for a component or a locale belongs in the caller. Labels are returned as `{ en, ar }` pairs
 * and the caller picks one, exactly as `certificateChips` already does: returning both is not reaching
 * for a locale.
 *
 * Why the ordering and the pre-selection live together: they are the same list read twice. The landing
 * selection falls back to *the first confirmed machine*, and "first" is only meaningful once the sort
 * is fixed — deriving the order in the component and the fallback in a hook is how the accent lands on
 * one card while the pulse lands on another. The filter joins them for the same reason and one more:
 * the map draws the list's own output (§6.8, AC-15), so a filter applied in the component would leave
 * the marker set arguing with the cards about what the lessor offered.
 */

import { arabicIndicDigits, unitAvailability } from "./bid-map";
import { computeUnitReadiness, readinessInputsFor, type UnitReadiness } from "./bid-readiness";
import type { FleetMachine } from "./fleet";

/**
 * The list, exactly (§6.4, AC-09/AC-10).
 *
 * **Two filters, then one sort.**
 *  - `inBid === true` — **offered machines only**. The fleet response also carries machines the
 *    supplier owns and did *not* put on the table; §6.4 is explicit that they are *"not a second list
 *    to scan"* but one request («اطلب معدّة أخرى»), so they are not represented here at all.
 *  - availability is not `absent`. `unitAvailability` returns `absent` for `unidentified` — a quoted
 *    count with no machine behind it — which has no serial, no documents and no location, so there is
 *    nothing for a card to state. This also makes the list and the pin set the SAME set modulo
 *    coordinates, which is what keeps AC-15's card↔marker focus in step by construction rather than by
 *    two filters that have to be kept equal by hand.
 *
 * **Nearest first**, by `distanceKm`. A machine with no distance sorts **last**, never first: a null
 * read as 0 would put the one machine whose location is unknown at the top of a list ordered by how
 * close it is. `Array.prototype.sort` is stable, so machines at equal distance keep the order the fleet
 * response gave them.
 *
 * Returns a new array — the caller's `FleetMachine[]` is never reordered in place.
 */
export function offeredMachines(fleet: readonly FleetMachine[]): FleetMachine[] {
  return fleet
    .filter((m) => m.inBid === true && unitAvailability(m) !== "absent")
    .slice()
    .sort((a, b) => distanceRank(a) - distanceRank(b));
}

/** `distanceKm` for sorting, with a missing distance pushed past every real one. */
function distanceRank(m: Pick<FleetMachine, "distanceKm">): number {
  const km = m.distanceKm;
  return typeof km === "number" && Number.isFinite(km) ? km : Number.POSITIVE_INFINITY;
}

/**
 * The machine that is already selected on arrival (§6.4 landing pre-selection, AC-34).
 *
 * **The bid's primary machine wins** — `Bid.equipmentId`, which is what the supplier actually
 * committed and what the deal room is about. It is preferred over "the first confirmed machine"
 * because the offer names it: a renter who arrives at a three-machine offer should land on the machine
 * the offer is built around, not on whichever of the three happens to be nearest and confirmed.
 *
 * **The confirmed-machine fallback applies only when the primary is not in the list** — it was not
 * offered on this bid, it is `absent`, or the fleet response never carried it. Then the first
 * confirmed machine in list order is selected, because a confirmed machine is the one the renter can
 * read a complete answer about.
 *
 * **Null is a real answer.** No primary and nothing confirmed → nothing is selected. Selecting an
 * arbitrary unconfirmed machine would put an accent and a nine-second pulse on a card for no stated
 * reason, and the renter would read the emphasis as a recommendation.
 *
 * `listed` must already be `offeredMachines(...)` output — the fallback says *first*, and first is
 * only defined against that order.
 */
export function landingSelectionId(
  primaryEquipmentId: string | null | undefined,
  listed: readonly FleetMachine[],
): string | null {
  const primary = (primaryEquipmentId ?? "").trim();
  if (primary && listed.some((m) => m.equipmentId === primary)) return primary;
  return listed.find((m) => unitAvailability(m) === "confirmed")?.equipmentId ?? null;
}

/* ══════════════════════════════ V17 · the list's filters (§6.4a) ══════════════════════════════
   **Filters select for what a machine HAS**, never for what it lacks — «لديها TÜV» narrows the list
   to the machines carrying a TÜV. The renter is deciding what he can accept, not assembling a
   chase-list; a "missing TÜV" chip would turn a verification surface into an accusation surface.

   Four rules govern the whole of it, and all four are decided here rather than painted:

   1. **Only criteria the request asked for.** No certificate was named ⇒ there is no certificate
      filter. This is the rule the rest of the surface already obeys — `matchGrid` greys a cell
      *"nobody asked about"*, and a not-required document does not render at all — and breaking it
      here would hold the lessor to a standard he was never given.
   2. **A control appears only when it would actually split the list** — `splits()` below. Every
      machine confirmed ⇒ no availability chip. A row of controls that all do nothing is worse than
      no row, and on this surface it is worse still: a chip that hides nothing invites the renter to
      believe he has checked something.
   3. **The count states the whole** — `shown` of `total`, and `total` is always the unfiltered offer.
      A hidden machine must never be able to read as an offer smaller than it is.
   4. **The map follows** (AC-15). The pin set is derived from `machines` below, so a filtered-out
      machine leaves the map with its card and the two surfaces cannot disagree.

   **AND between groups, OR within one:** distance ≤50 km AND year ≥ 2020 AND (TÜV OR SPSP). */

/** Copy in both locales; the caller picks. Structurally identical to the panel's own `Bilingual`. */
export interface Bilingual {
  en: string;
  ar: string;
}

export type EquipmentFilterKind = "distance" | "availability" | "year" | "attachments" | "certificate";

/** One chip. `id` is the selection key, stable across renders and safe to persist. */
export interface EquipmentFilterOption {
  id: string;
  kind: EquipmentFilterKind;
  label: Bilingual;
  /** How many of the **offered** machines this chip alone keeps — the numerator rule 2 is tested on. */
  matches: number;
}

/** One row of chips. Options inside a group are OR-ed. */
export interface EquipmentFilterGroup {
  kind: EquipmentFilterKind;
  label: Bilingual;
  options: EquipmentFilterOption[];
  /**
   * `distance` only — true when at least one listed machine has no distance and is therefore kept by
   * every band. The caller must SAY so; see `distanceOptions` for why it is kept rather than hidden.
   */
  keepsUnknownDistance?: boolean;
}

/**
 * The request-side asks the filters are built from — the same five fields the match grid reads, and a
 * `BidCard` satisfies it structurally, so the caller passes the bid straight through.
 */
export interface EquipmentFilterRequest {
  /** Raw requested equipment-cert codes (lowercase, e.g. `["aramco","tuv"]`). */
  reqEquipmentCerts?: string[] | null;
  /** The renter's required operator licence level — one comma-joined field of request codes. */
  operatorCertReq?: string | null;
  /** The raw equipment-year requirement: a min year like 2020, or an age. */
  reqMinYear?: number | null;
  /** Admin-defined attachment ids the request item asked for (`attachment_ids`). */
  attachmentIds?: string[] | null;
  /** Renter free-text attachments not in the admin list (`custom_attachments`). */
  customAttachments?: string[] | null;
}

/** Everything the list and the map need for one render. */
export interface EquipmentListView {
  /** The chips to draw, in §6.4a's order. **Empty ⇒ no filter bar at all**, not an empty bar. */
  groups: EquipmentFilterGroup[];
  /**
   * The selection, reduced to options that exist in `groups` right now. A stale id — from a previous
   * bid, or from a band that stopped splitting after a refetch — can therefore never hide a machine,
   * and never appears in the empty state's reason either.
   */
  active: EquipmentFilterOption[];
  /** What the list renders, and what the marker set is derived from (AC-15). */
  machines: FleetMachine[];
  /** Rule 3 — «٣ من ٨». `total` is the whole offer and is NEVER the filtered figure. */
  shown: number;
  total: number;
  /**
   * A filter is active and it left nothing. **Distinct from AC-26's "no machine is registered"**: that
   * is a fact about the lessor, this is a fact about the chips the renter pressed, and the two must
   * never be mistakable for each other. `total === 0` is AC-26; this is `total > 0 && shown === 0`.
   */
  emptiedByFilter: boolean;
}

/**
 * **الكل · ≤ ٥٠ · ≤ ١٠٠ · ≤ ٢٠٠ كم** — v2's own bands, reused rather than reinvented (spec
 * `001-deal-room-rentee-map-v2.md` §6.10). «الكل» is not a chip: it is the cleared state, and clearing
 * is one press (`onClear`), because a filter the renter cannot find his way out of is worse than none.
 */
export const DISTANCE_BANDS_KM = [50, 100, 200] as const;

const GROUP_LABEL: Record<EquipmentFilterKind, Bilingual> = {
  distance: { en: "Distance", ar: "المسافة" },
  availability: { en: "Availability", ar: "التوفّر" },
  year: { en: "Year", ar: "السنة" },
  attachments: { en: "Attachments", ar: "الملحقات" },
  certificate: { en: "Certificates", ar: "الشهادات" },
};

/** An option plus the predicate behind it. The predicate never leaves this module. */
interface BuiltOption {
  option: EquipmentFilterOption;
  keep: (m: FleetMachine) => boolean;
}

interface BuiltGroup {
  kind: EquipmentFilterKind;
  label: Bilingual;
  built: BuiltOption[];
  keepsUnknownDistance?: boolean;
}

/**
 * **Rule 2, in one line.** An option survives only when it keeps at least one machine *and* hides at
 * least one. Keeping none would empty the list on a press; hiding none is a control that does nothing.
 */
const splits = (matches: number, total: number): boolean => matches > 0 && matches < total;
/* One consequence worth naming: because no option that keeps nothing ever becomes an option, a SINGLE
   chip can never empty the list. Only a combination can — which is why `emptiedByFilter`'s copy names
   every active chip rather than the last one pressed. */

const finiteKm = (m: FleetMachine): number | null =>
  typeof m.distanceKm === "number" && Number.isFinite(m.distanceKm) ? m.distanceKm : null;

/**
 * **المسافة.** This reverses RM3-AC-28, which forbade a distance filter — see §6.4a and AC-28's own
 * rewrite for why the v3 argument no longer holds.
 *
 * **A machine with no distance is kept by every band, never hidden.** `locationSource: 'none'` means
 * *unknown*, not *far*: hiding it would silently delete a real offered machine on the strength of a
 * fact nobody has. It is also the rule v2 wrote for exactly this control, and it is the only reading
 * consistent with `offeredMachines`, which sorts a null LAST without ever calling it distant. Because
 * that is invisible from the chips alone, the group reports `keepsUnknownDistance` so the caller can
 * say it out loud.
 *
 * The bands are cumulative and therefore often redundant — with machines at 10, 30 and 500 km all
 * three bands keep the same two — so **bands producing an identical set collapse to the tightest one**.
 * Three chips that do the same thing are rule 2's failure mode wearing a different hat.
 */
function distanceGroup(listed: readonly FleetMachine[]): BuiltGroup | null {
  const total = listed.length;
  const seenSignature = new Set<string>();
  const built: BuiltOption[] = [];
  for (const band of DISTANCE_BANDS_KM) {
    const keep = (m: FleetMachine): boolean => {
      const km = finiteKm(m);
      return km == null || km <= band;
    };
    const kept = listed.filter(keep);
    if (!splits(kept.length, total)) continue;
    const signature = kept.map((m) => m.equipmentId).join(" ");
    if (seenSignature.has(signature)) continue; // a wider band that hides exactly the same machines
    seenSignature.add(signature);
    built.push({
      option: {
        id: `distance:${band}`,
        kind: "distance",
        label: { en: `≤ ${band} km`, ar: `≤ ${arabicIndicDigits(band)} كم` },
        matches: kept.length,
      },
      keep,
    });
  }
  if (built.length === 0) return null;
  return {
    kind: "distance",
    label: GROUP_LABEL.distance,
    built,
    keepsUnknownDistance: listed.some((m) => finiteKm(m) == null),
  };
}

/** **التوفّر.** One chip, and it selects for the machine the lessor has confirmed — `unitAvailability`
 *  and nothing else, never `yardConfirmed` (AC-19). Rule 2 removes it the moment the list stops mixing
 *  the two states, which is the whole of "renders only when the list mixes confirmed and unconfirmed". */
function availabilityGroup(listed: readonly FleetMachine[]): BuiltGroup | null {
  const keep = (m: FleetMachine): boolean => unitAvailability(m) === "confirmed";
  const matches = listed.filter(keep).length;
  if (!splits(matches, listed.length)) return null;
  return {
    kind: "availability",
    label: GROUP_LABEL.availability,
    built: [
      {
        option: {
          id: "availability:confirmed",
          kind: "availability",
          label: { en: "Availability confirmed", ar: "مؤكّد توفرها" },
          matches,
        },
        keep,
      },
    ],
  };
}

/**
 * **السنة.** Renders only when the request asked for a minimum year — rule 1.
 *
 * The ask is read off `computeUnitReadiness`'s own `reqMinYear`, which is non-null only when the raw
 * request value clearly reads as a YEAR rather than an age. Re-deriving that test here would be the
 * second scorer `bid-readiness.ts` refuses to be, and the two would eventually disagree about whether
 * `reqMinYear: 5` meant 5 years old or the year 5.
 *
 * **A machine with no year on file is filtered out**, because the chip selects for a machine that HAS
 * the year and that machine does not demonstrably have it. This is not a new judgement: the match grid
 * already reads a missing year RED against a year ask (*"year not on the file · you asked for 2020 or
 * newer"*), so the filter and the grid agree about the same machine.
 */
function yearGroup(listed: readonly FleetMachine[], scored: ReadonlyMap<string, UnitReadiness>): BuiltGroup | null {
  const minYear = listed.map((m) => scored.get(m.equipmentId)?.reqMinYear ?? null).find((y) => y != null) ?? null;
  if (minYear == null) return null;
  const keep = (m: FleetMachine): boolean => {
    const r = scored.get(m.equipmentId);
    return !!r && r.year != null && !r.yearConflict;
  };
  const matches = listed.filter(keep).length;
  if (!splits(matches, listed.length)) return null;
  return {
    kind: "year",
    label: GROUP_LABEL.year,
    built: [
      {
        option: {
          id: `year:${minYear}`,
          kind: "year",
          label: { en: `${minYear} or newer`, ar: `${arabicIndicDigits(minYear)} أو أحدث` },
          matches,
        },
        keep,
      },
    ],
  };
}

/**
 * **الملحقات** — specified, built, and **suppressed by rule 2 on every offer that exists today.**
 *
 * The request can ask for attachments (`attachment_ids` / `custom_attachments`), so rule 1 is
 * satisfiable. The machine's side is not: `FleetMachine` extends `OfferedUnitDetail`, and neither
 * carries an attachments field — the fleet row records what the machine IS, never what it comes with.
 * So no machine can be shown to have them, `matches` is 0, and `splits()` drops the group before it
 * ever reaches a chip.
 *
 * That is the correct answer rather than a gap: `attachmentsCell` refuses to colour the same fact for
 * the same reason (*"colouring this red would tell the renter the supplier failed a check the platform
 * never ran"*). A chip offered here would be worse — pressing it would empty the list and read as
 * "not one of his machines has what you asked for", which is a claim about the lessor drawn entirely
 * from our own missing column.
 *
 * `recordsAttachments` is the one line to change when the wire grows the field; the group comes alive
 * on its own the moment a machine can answer.
 */
function attachmentsGroup(listed: readonly FleetMachine[], request: EquipmentFilterRequest): BuiltGroup | null {
  const asked = [...(request.attachmentIds ?? []), ...(request.customAttachments ?? [])].filter(
    (x) => String(x ?? "").trim() !== "",
  ).length;
  if (asked === 0) return null; // rule 1 — nothing was asked for
  const keep = recordsAttachments;
  const matches = listed.filter(keep).length;
  if (!splits(matches, listed.length)) return null; // rule 2 — and today this is always the exit
  return {
    kind: "attachments",
    label: GROUP_LABEL.attachments,
    built: [
      {
        option: {
          id: "attachments:recorded",
          kind: "attachments",
          label: { en: "Attachments recorded", ar: "الملحقات مسجّلة" },
          matches,
        },
        keep,
      },
    ],
  };
}

/** Whether a machine's file records the attachments it comes with. **No fleet row can today** — the
 *  field does not exist on `OfferedUnitDetail`, which is why this takes no machine to answer. Stated as
 *  a function rather than a literal `false` so the reason has somewhere to live and the fix — reading
 *  the field, once the wire carries it — has one place to land. */
function recordsAttachments(): boolean {
  return false;
}

/**
 * **الشهادات** — one chip per certificate **the request named**, and none for a certificate it did not
 * (rule 1). Both families are offered and they are matched the way the one scorer matches them: an
 * equipment cert by canonical family, an operator cert by the exact document kind its request code
 * stands for. Reusing `computeUnitReadiness` is what stops a chip from disagreeing with the document
 * row and the match grid about whether the same machine holds the same paper.
 *
 * Equipment certs come first, in the request's own order, then the operator's — the order the detail
 * already reads them in.
 */
function certificateGroup(listed: readonly FleetMachine[], scored: ReadonlyMap<string, UnitReadiness>): BuiltGroup | null {
  const first = listed.map((m) => scored.get(m.equipmentId)).find((r): r is UnitReadiness => !!r);
  if (!first) return null;
  const asks = [
    ...first.equipmentCerts.map((c) => ({ family: "equipment" as const, code: c.code, labelEn: c.labelEn, labelAr: c.labelAr })),
    ...first.operatorCerts.map((c) => ({ family: "operator" as const, code: c.code, labelEn: c.labelEn, labelAr: c.labelAr })),
  ];
  const built: BuiltOption[] = [];
  for (const ask of asks) {
    const keep = (m: FleetMachine): boolean => {
      const r = scored.get(m.equipmentId);
      if (!r) return false;
      const certs = ask.family === "equipment" ? r.equipmentCerts : r.operatorCerts;
      return certs.some((c) => c.code === ask.code && c.present);
    };
    const matches = listed.filter(keep).length;
    if (!splits(matches, listed.length)) continue;
    built.push({
      option: {
        id: `cert:${ask.family}:${ask.code}`,
        kind: "certificate",
        label: { en: ask.labelEn, ar: ask.labelAr },
        matches,
      },
      keep,
    });
  }
  if (built.length === 0) return null;
  return { kind: "certificate", label: GROUP_LABEL.certificate, built };
}

/**
 * Every group, in §6.4a's order, already reduced to the ones that render.
 *
 * `listed` must be `offeredMachines(...)` output: every count here is stated against the offer, and an
 * unfiltered fleet would put machines the supplier never put on the table into the denominator.
 */
function buildGroups(listed: readonly FleetMachine[], request: EquipmentFilterRequest | null | undefined): BuiltGroup[] {
  if (listed.length === 0) return [];
  const req = request ?? {};
  const asks = readinessInputsFor(req);
  // One scoring pass, shared by the year and the certificate groups and by every predicate they hand
  // back — so a machine is never scored twice and can never be scored two ways.
  const scored = new Map<string, UnitReadiness>(
    listed.map((m) => [m.equipmentId, computeUnitReadiness(m, asks.equipCerts, asks.operatorCerts, asks.minYear)]),
  );
  return [
    distanceGroup(listed),
    availabilityGroup(listed),
    yearGroup(listed, scored),
    attachmentsGroup(listed, req),
    certificateGroup(listed, scored),
  ].filter((g): g is BuiltGroup => g != null);
}

/** The chips to draw. Public because the control row is the model's decision, not the component's. */
export function equipmentFilters(
  listed: readonly FleetMachine[],
  request: EquipmentFilterRequest | null | undefined,
): EquipmentFilterGroup[] {
  return buildGroups(listed, request).map((g) => ({
    kind: g.kind,
    label: g.label,
    options: g.built.map((b) => b.option),
    ...(g.keepsUnknownDistance == null ? {} : { keepsUnknownDistance: g.keepsUnknownDistance }),
  }));
}

/**
 * The predicate: **AND between groups, OR within one.**
 *
 * A group with nothing selected imposes nothing — it is not an implicit "none of these". An id that
 * names no rendered option is ignored rather than treated as an empty group, which is what keeps a
 * selection carried over from another bid from hiding machines it was never about.
 */
export function filterMachines(
  listed: readonly FleetMachine[],
  request: EquipmentFilterRequest | null | undefined,
  selection: readonly string[] | null | undefined,
): FleetMachine[] {
  const chosen = new Set(selection ?? []);
  if (chosen.size === 0) return listed.slice();
  const perGroup = buildGroups(listed, request)
    .map((g) => g.built.filter((b) => chosen.has(b.option.id)))
    .filter((built) => built.length > 0);
  if (perGroup.length === 0) return listed.slice();
  return listed.filter((m) => perGroup.every((built) => built.some((b) => b.keep(m))));
}

/**
 * One call for one render: the chips, the surviving selection, the machines, and the two figures the
 * count is made of.
 *
 * The caller derives the marker set from `machines` and nothing else — that is rule 4, and it is why
 * this returns the list rather than a set of ids for the component to re-filter.
 */
export function equipmentListView(
  listed: readonly FleetMachine[],
  request: EquipmentFilterRequest | null | undefined,
  selection: readonly string[] | null | undefined,
): EquipmentListView {
  const groups = equipmentFilters(listed, request);
  const known = new Map(groups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
  const active = (selection ?? []).map((id) => known.get(id)).filter((o): o is EquipmentFilterOption => !!o);
  const machines = active.length === 0 ? listed.slice() : filterMachines(listed, request, active.map((o) => o.id));
  return {
    groups,
    active,
    machines,
    shown: machines.length,
    total: listed.length,
    emptiedByFilter: active.length > 0 && machines.length === 0 && listed.length > 0,
  };
}
