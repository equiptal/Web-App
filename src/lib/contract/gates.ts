/**
 * Advance-gate logic for the wizard. Pure functions over the draft, used to block forward
 * navigation (AC-12, AC-18, AC-19, AC-24, AC-26, AC-29, AC-44). Renters can always go *back*
 * freely (AC-44); these only gate going forward.
 */

import { EquipmentItem, ProjectDetails } from "./draft";
import { isCompleteRef } from "./taxonomy";

export interface GateResult {
  ok: boolean;
  /** i18n keys for each unmet requirement, surfaced to the renter. */
  reasons: string[];
}

/** AC-12/16: Step 1 needs the location confirmed and a rental basis chosen. Dates never block. */
export function gateStep1(project: ProjectDetails): GateResult {
  const reasons: string[] = [];
  if (!project.location.confirmed) reasons.push("gate.confirmLocation");
  if (!project.timing.rentalBasis) reasons.push("gate.chooseRentalBasis");
  if (project.location.conflict && !project.location.conflict.resolvedFrom) {
    reasons.push("gate.resolveLocationConflict"); // AC-47
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Whether a single item blocks advancing past the equipment step (AC-18/19/24/26/29).
 * Removed and no-match items don't block (no-match is excluded from the broadcast, AC-33).
 */
export function itemBlocksAdvance(item: EquipmentItem): boolean {
  if (item.removed || item.verdict === "no-match") return false;
  // A "Need OK" item with a complete taxonomy ref is auto-accepted as Matched (no explicit approve
  // step) — only a genuinely incomplete ref (missing category/subtype/size) still blocks advancing.
  if (!isCompleteRef(item.ref)) return true;
  // required per-item fields (AC-24 operator, AC-26 fuel type, AC-55 quantity ≥ 1)
  if (!item.operatorNeeded) return true;
  if (!item.fuelType) return true;
  if (!Number.isFinite(item.quantity) || item.quantity < 1) return true;
  return false;
}

/** AC-29: advancing to Step 3 is blocked until every live item is resolved/complete. */
export function gateStep2(items: EquipmentItem[]): GateResult {
  const blocking = items.filter(itemBlocksAdvance);
  return {
    ok: blocking.length === 0,
    reasons: blocking.length ? ["gate.resolveItems"] : [],
  };
}

/** Step 3 (Preferences) has no required gates — all preferences are optional. */
export function gateStep3(): GateResult {
  return { ok: true, reasons: [] };
}

/** Items that actually post (mapped, not removed, not no-match) — AC-33/34/43. */
export function postableItems(items: EquipmentItem[]): EquipmentItem[] {
  return items.filter((i) => !i.removed && i.verdict !== "no-match");
}
