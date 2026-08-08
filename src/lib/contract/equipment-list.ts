/**
 * **V5 + V6** — which machines the equipment list shows, in what order, and which one is already
 * selected when the renter arrives (spec 004 §6.4; RM3-AC-09, AC-10, AC-34).
 *
 * **NO React, NO DOM, NO Leaflet, NO i18n imports** — the same rule `bid-map.ts` states and for the
 * same reason: the rentee mobile surface gets a mechanical Dart port of these rules, and anything that
 * reaches for a component or a locale belongs in the caller.
 *
 * Why the ordering and the pre-selection live together: they are the same list read twice. The landing
 * selection falls back to *the first confirmed machine*, and "first" is only meaningful once the sort
 * is fixed — deriving the order in the component and the fallback in a hook is how the accent lands on
 * one card while the pulse lands on another.
 */

import { unitAvailability } from "./bid-map";
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
