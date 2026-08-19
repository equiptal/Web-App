/**
 * **The sentence a bid owes the reader when its counts disagree.**
 *
 * A mechanical port of the app's `unit_count_notes.dart`, which the web never had. A bid carries
 * three counts and only one of them prices anything:
 *
 *  · **machines named** — the distinct `equipmentId`s on `unitsOffered`. Real machines the supplier
 *    picked. Prices nothing.
 *  · **offered** — `unitsOffered.length`. What the bid claims, padded with repeats of the first
 *    machine when the supplier commits to more units than he holds machines for. Prices nothing; it
 *    is what every "offered N" badge shows.
 *  · **priced** — `agreedUnits ?? currentRentalUnits ?? offered`. What the money is built on.
 *
 * When all three agree the card says nothing. When they diverge it owes up to two sentences, and
 * which one is owed is decided here rather than in a component, so a card cannot state one and a
 * comparison row the other.
 *
 * **NO React, NO DOM, NO i18n imports.** The wording is the caller's; this decides only whether a
 * sentence is owed and what the numbers in it are.
 */

/** How the priced count relates to the offer. */
export type PricedVsOffered =
  /** The two agree — no sentence is owed. */
  | "same"
  /** Fewer priced than offered: a partial acceptance, or a counter that stepped the count down. */
  | "below"
  /**
   * MORE priced than offered — a counter stepped the count up, which is legal for both parties: the
   * stepper caps at the REQUESTED count, not at the offer.
   */
  | "above";

export interface UnitCountNotes {
  /** The count the money is built on. */
  priced: number;
  /** The count the bid claims. */
  offered: number;
  /**
   * Distinct machines behind the offer. Zero when the payload does not carry the offered entries at
   * all (a legacy bid) — and then `claimedUnits` is zero too, because an unknown must never be
   * reported as a shortfall.
   */
  machinesNamed: number;
  relation: PricedVsOffered;
  /**
   * Units being **priced** with no registered machine behind them.
   *
   * Measured against `priced`, not `offered`: what the renter is paying for is what he is owed
   * machines for. A counter that steps 2 machines up to 4 owes two machines, not zero.
   */
  claimedUnits: number;
  /** The count sentence is owed. */
  hasPricedNote: boolean;
  /** The machines sentence is owed. */
  hasClaimedNote: boolean;
  /** Neither is owed — the card says nothing about counts. */
  isEmpty: boolean;
}

/**
 * Derive both notes from one bid's counts.
 *
 * `machinesNamed` is the DISTINCT machine count — pass null or 0 when the caller cannot know it, and
 * no shortfall is claimed. Counting the raw entry list instead would always equal `offered` and
 * report a shortfall of zero on exactly the bids that have one, because the padding entries repeat a
 * machine.
 */
export function unitCountNotes(input: {
  priced: number;
  offered: number;
  machinesNamed?: number | null;
}): UnitCountNotes {
  const priced = Math.max(0, Math.trunc(input.priced));
  const offered = Math.max(0, Math.trunc(input.offered));
  const named = Math.max(0, Math.trunc(input.machinesNamed ?? 0));
  const relation: PricedVsOffered = priced === offered ? "same" : priced > offered ? "above" : "below";
  // A bid whose entries we cannot see claims nothing: `named === 0` means "not known", not "no
  // machines". Reporting `priced` units short there would put a shortfall on every legacy bid.
  const claimedUnits = named <= 0 ? 0 : Math.min(priced, Math.max(0, priced - named));
  const hasPricedNote = relation !== "same";
  const hasClaimedNote = claimedUnits > 0;
  return {
    priced, offered, machinesNamed: named, relation, claimedUnits,
    hasPricedNote, hasClaimedNote, isEmpty: !hasPricedNote && !hasClaimedNote,
  };
}

/**
 * Distinct machines behind an offer, from the typed `offeredUnitsDetail` entries.
 *
 * ⚠ **Not the array's length.** The array holds ONE ENTRY PER OFFERED UNIT and repeats a machine to
 * make up a claimed count — `[A, B, A]` is three units backed by two machines. Length is the offer;
 * this is the fleet behind it, and the gap between them is the whole point of the shortfall note.
 */
export function distinctMachinesOffered(units: readonly { equipmentId?: string | null }[] | null | undefined): number {
  const ids = new Set<string>();
  for (const u of units ?? []) {
    const id = (u?.equipmentId ?? "").trim();
    if (id) ids.add(id);
  }
  return ids.size;
}
