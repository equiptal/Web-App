/**
 * The workspace's export — the figures it hands to the existing export machinery.
 *
 * Export is not rebuilt here. `buildExportPayload` and the template dialog are the same ones the old
 * comparison workspace used, and the server-side template render is untouched; this only assembles
 * what the workspace is showing into the shape they already take.
 *
 * **The totals are the ones on screen, not a second opinion.** `BuildExportPayloadInput.totals`
 * exists precisely because a sheet that recomputes independently ends up printing "no data" under a
 * row the renter can see filled in. So the grand total here is the matrix's duration column — what
 * the whole rental costs — with its rental and transport parts stated separately, all three from the
 * one `computeCycleTotals` call the matrix itself renders from.
 *
 * **NO React, NO DOM, NO i18n.**
 */

import type { BidColumn, Money } from "./comparison";
import { computeCycleTotals } from "./cycle-totals";
import type { WorkspaceBid } from "./workspace";

export interface WorkspaceTotalsInput {
  bids: WorkspaceBid[];
  durationDays: number | null;
  startDate: string | null;
}

/**
 * Totals keyed by bid id, in the shape the export payload wants.
 *
 * `stated` is not decoration: it is how the sheet tells "this supplier charges nothing to deliver"
 * apart from "this supplier never said". A figure the bid does not carry is marked unstated even
 * though the arithmetic produced a zero for it.
 */
export function workspaceExportTotals(
  input: WorkspaceTotalsInput,
): Record<string, { grandTotal?: Money; mobDemob?: Money; rental?: Money }> {
  const out: Record<string, { grandTotal?: Money; mobDemob?: Money; rental?: Money }> = {};
  for (const b of input.bids) {
    const card = b.card;
    const totals = computeCycleTotals({
      rate: card.price,
      priceUnit: card.priceUnit,
      mob: { amount: card.mobPrice, excluded: card.mobExcluded },
      demob: { amount: card.demobPrice, excluded: card.demobExcluded },
      durationDays: input.durationDays,
      startDate: input.startDate,
      units: card.unitsOffered > 0 ? card.unitsOffered : card.numberOfUnits,
    });
    // The duration column where the request has one; the first cycle where it does not — which is
    // exactly what the matrix shows in that case, and the only total it can honestly print.
    const whole = totals.duration ?? totals.firstCycle;
    const legsStated = card.mobPrice != null || card.demobPrice != null;
    out[card.id] = {
      grandTotal: { value: whole.total, stated: card.price != null },
      mobDemob: { value: whole.oneOff, stated: legsStated },
      rental: { value: whole.rental, stated: card.price != null },
    };
  }
  return out;
}

/** The columns the export ranks, in the order the matrix shows them. */
export function orderColumnsForExport(columns: BidColumn[], order: string[]): BidColumn[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  // A column the order does not mention sorts to the end rather than being dropped: the sheet must
  // carry every bid the renter was comparing, even one the ordering could not place.
  return [...columns].sort((a, b) => (rank.get(a.bid.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.bid.id) ?? Number.MAX_SAFE_INTEGER));
}
