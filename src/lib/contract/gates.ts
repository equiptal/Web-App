/**
 * Advance gates for the request canvas (MREQ-AC-09/10/11/14/54).
 *
 * Pure functions over the draft. The canvas locks its three panels in order — equipment → where →
 * when — and refuses a move rather than explaining it, so these decide what "complete" means for
 * each panel and what the "N things need you" counter counts.
 *
 * **The required set is the app's, not the web's.** `create_request_page.dart`
 * (`_missingPerStep` / `_validateEquipment`) is the authority: location, rental basis, and per item
 * category + subtype + capacity + fuel type + mobilization + demobilization. The four-step wizard
 * this replaced gated a different, narrower set — delivery and return were never checked, so an
 * unset pair fell through to `?? "me"` in `app-adapters.ts` and assigned both legs to the renter
 * without asking.
 *
 * Two deliberate departures, both recorded in `docs/specs/006-machine-request-canvas.md`:
 *
 *  - **`startDate` is NOT required here** (MREQ-AC-10), though the app requires it. Kept optional on
 *    the web; the schedule panel nudges instead.
 *  - **`equipmentYear` and the equipment certificate ARE required here** (MREQ-AC-54), though the app
 *    treats both as optional. Each offers an explicit "Any year" / "No certificate" answer, so the
 *    gate costs the renter a decision, not a value: both map to exactly the payload an unset field
 *    produces today. They are gated because a silent cert narrows the renter's own bidder pool (see
 *    the note in options.ts) and a silent year does the same.
 */

import { EquipmentItem, ProjectDetails, RfqDraft } from "./draft";
import { isCompleteRef } from "./taxonomy";
import { computeChargedDays } from "./charged-days";
import { CUSTOM_EQUIPMENT_ENABLED } from "@/lib/flags";

/**
 * An off-catalogue line: the agent could not place it, and the renter is allowed to NAME it instead
 * of picking a subtype. Such a line posts with `customEquipmentName` and no taxonomy ids.
 *
 * ⚠️ **A picked SUBTYPE ends it.** The trio stays on screen for a no-match line, so a renter who can
 * find his machine in the list still can; the moment he does, the line is an ordinary one and is
 * gated and posted like any other. The subtype is the test rather than the whole ref because a
 * no-match line can arrive with a category id and no subtype (see `deriveVerdict`), and a payload
 * carrying one or two ids is a 422 — the backend refuses a partial triple on purpose.
 *
 * ⚠️ Behind the flag on purpose. With the flag off this returns false for every line, so every
 * no-match line keeps its old treatment to the letter — never gated, never posted.
 */
export function isCustomLine(item: EquipmentItem): boolean {
  return CUSTOM_EQUIPMENT_ENABLED && !item.removed && item.verdict === "no-match" && !item.ref.subcategoryId;
}

/**
 * The name an off-catalogue line goes out under, trimmed. Empty string when there is none, which is
 * what blocks the line and keeps it out of the post.
 *
 * `rawLabel` is the seed, not a second answer: it is the renter's OWN words as they appeared in his
 * RFQ, so a line he never touched is already named by him and asking him to retype it would be
 * asking the same question twice. `??` and not `||` on purpose — clearing the box stores `""`, and
 * an empty string is an answer ("I have not named it"), not a missing one, so it must NOT fall back
 * to the seed and silently re-name the machine he just cleared.
 */
export function customName(item: EquipmentItem): string {
  return (item.customEquipment ?? item.rawLabel ?? "").trim();
}

export interface GateResult {
  ok: boolean;
  /** i18n keys for each unmet requirement, surfaced to the renter. */
  reasons: string[];
}

/** A single unmet requirement, addressed to the control that can satisfy it. */
export interface RequiredGap {
  /** Which panel owns it — drives the panel dot and which block shakes. */
  panel: "equipment" | "where" | "when";
  /** The item it belongs to, or null for a request-wide gap. */
  itemId: string | null;
  /** Stable field key, matching the `touchedFields` vocabulary where one applies. */
  field: string;
  /** i18n key for the renter-facing reason. */
  reason: string;
}

/** Dotted path for a per-item field, in the agent's `fieldNotes` vocabulary. */
export function itemFieldKey(itemId: string, field: string): string {
  return `line_items[${itemId}].${field}`;
}

/** True when the renter has personally answered this field (MREQ-AC-59). */
export function isTouched(draft: Pick<RfqDraft, "touchedFields">, key: string): boolean {
  return (draft.touchedFields ?? []).includes(key);
}

/**
 * Whether a single item blocks advancing (MREQ-AC-09/14).
 *
 * Removed items never block. Nor does a no-match line the renter cannot name — it is excluded from
 * the broadcast entirely (`postableItems`), so demanding he complete one would gate him on equipment
 * that is not going to be sent. An off-catalogue line he CAN name does block, on the name alone:
 * that line is going out.
 */
export function itemBlocksAdvance(item: EquipmentItem): boolean {
  return itemAppGaps(item).length > 0;
}

/**
 * The requirements the APP enforces on one item — taxonomy, fuel type, quantity.
 *
 * Kept separate from {@link itemWebGaps} so `itemBlocksAdvance` keeps meaning what it has always
 * meant: whether this item is incomplete by the platform's own standard. Folding the web-only year
 * and certificate gates in here would make every freshly parsed item "blocking", which is true of
 * the canvas but not of the item.
 */
export function itemAppGaps(item: EquipmentItem): RequiredGap[] {
  if (item.removed) return [];
  /**
   * Off-catalogue: the NAME replaces the taxonomy trio as this line's required answer.
   *
   * It blocks when it is blank, which a no-match line never did before. That is the point — the line
   * now posts, so an unnamed one would reach a supplier as an unnamed machine. A renter who does not
   * want to name it removes the row, which is the same door he had before.
   */
  if (isCustomLine(item)) {
    const gaps: RequiredGap[] = [];
    if (!customName(item)) {
      gaps.push({ panel: "equipment", itemId: item.id, field: "custom_equipment", reason: "gate.customEquipmentMissing" });
    }
    if (!Number.isFinite(item.quantity) || item.quantity < 1) {
      gaps.push({ panel: "equipment", itemId: item.id, field: "quantity", reason: "gate.quantityMissing" });
    }
    return gaps;
  }
  if (item.verdict === "no-match") return [];
  const gaps: RequiredGap[] = [];
  const at = (field: string, reason: string) => gaps.push({ panel: "equipment", itemId: item.id, field, reason });

  // Taxonomy — category, subtype and capacity, each named separately so the dot lands on the control
  // that is actually empty rather than on the whole card. Cascading, because a subtype cannot be
  // chosen before its category.
  if (!item.ref.categoryId) at("category", "gate.categoryMissing");
  else if (!item.ref.subcategoryId) at("subtype", "gate.subtypeMissing");
  else if (!item.ref.measurementId) at("capacity", "gate.capacityMissing");
  else if (!isCompleteRef(item.ref)) at("category", "gate.resolveItems");

  if (!item.fuelType) at("fuel_type", "gate.fuelMissing");
  if (!Number.isFinite(item.quantity) || item.quantity < 1) at("quantity", "gate.quantityMissing");
  return gaps;
}

/**
 * The two web-only gates (MREQ-AC-54): minimum year and equipment certificate.
 *
 * These ask whether the renter ANSWERED, not what the value is. The agent prefills both, and an
 * agent-prefilled value would otherwise satisfy a gate the renter never looked at — which is the
 * whole thing these exist to prevent.
 */
export function itemWebGaps(item: EquipmentItem, draft: Pick<RfqDraft, "touchedFields">): RequiredGap[] {
  if (item.removed) return [];
  // An off-catalogue line is gated like any other: both answers are posted for it and both are shown
  // to the supplier on the bid form. A no-match line that cannot be named keeps its early return.
  if (item.verdict === "no-match" && !isCustomLine(item)) return [];
  const gaps: RequiredGap[] = [];
  const at = (field: string, reason: string) => gaps.push({ panel: "equipment", itemId: item.id, field, reason });

  /**
   * Answered means: the RFQ named one, or the renter picked one.
   *
   * A value the agent extracted from the renter's own words is already their answer — they wrote
   * it — so demanding they re-pick it asks the same question twice. What must not pass is a value
   * nobody supplied. The touch flag carries the case where the renter's answer IS "nothing": both
   * "No certificate" and "Any year" store as absent, and only `touchedFields` tells that apart from
   * never having been asked.
   */
  const yearAnswered = item.equipmentYear != null || isTouched(draft, itemFieldKey(item.id, "equipment_year"));
  const certAnswered =
    (item.safetyCertsOverride ?? []).length > 0 || isTouched(draft, itemFieldKey(item.id, "safety_certificates"));

  if (!yearAnswered) at("equipment_year", "gate.yearMissing");
  if (!certAnswered) at("safety_certificates", "gate.certMissing");
  return gaps;
}

/** Every unmet requirement on one item, app and web alike. */
export function itemGaps(item: EquipmentItem, draft: Pick<RfqDraft, "touchedFields">): RequiredGap[] {
  return [...itemAppGaps(item), ...itemWebGaps(item, draft)];
}

/**
 * Delivery and return, read the way submit reads them: the per-item override, else the request-wide
 * value. `defaultProjectDetails()` seeds both to "me", so in practice these are answered from the
 * first render — the point of gating them is that the answer is VISIBLE (MREQ-AC-53), not that the
 * renter is likely to be missing one. They can still be genuinely null when the agent found items
 * that disagreed and `reconcileRequestWide` cleared the shared control.
 */
export function transportGaps(items: EquipmentItem[], project: ProjectDetails): RequiredGap[] {
  const gaps: RequiredGap[] = [];
  for (const item of items) {
    if (item.removed || (item.verdict === "no-match" && !isCustomLine(item))) continue;
    if ((item.deliveryOverride ?? project.deliveryToSite) == null) {
      gaps.push({ panel: "equipment", itemId: item.id, field: "delivery", reason: "gate.deliveryMissing" });
    }
    if ((item.returnOverride ?? project.returnFromSite) == null) {
      gaps.push({ panel: "equipment", itemId: item.id, field: "return", reason: "gate.returnMissing" });
    }
  }
  return gaps;
}

/** The equipment panel for ONE item — what the canvas gates on before opening *Where it goes*. */
export function gateEquipment(item: EquipmentItem, project: ProjectDetails, draft: Pick<RfqDraft, "touchedFields">): GateResult {
  const gaps = [...itemGaps(item, draft), ...transportGaps([item], project)];
  return { ok: gaps.length === 0, reasons: gaps.map((g) => g.reason) };
}

/**
 * *Where it goes* — coordinates, a label, an explicit confirmation, and no unresolved text↔file
 * disagreement. Mirrors the app's location group plus the web's own confirm step.
 */
export function gateWhere(project: ProjectDetails): GateResult {
  const reasons: string[] = [];
  const loc = project.location;
  if (loc.lat == null || loc.lng == null || !(loc.label ?? "").trim()) reasons.push("gate.locationMissing");
  else if (!loc.confirmed) reasons.push("gate.confirmLocation");
  if (loc.conflict && !loc.conflict.resolvedFrom) reasons.push("gate.resolveLocationConflict");
  return { ok: reasons.length === 0, reasons };
}

/**
 * *When it runs* — a rental basis, and the renter's acknowledgement of how many days they will
 * actually be charged for.
 *
 * Dates are NOT gated (MREQ-AC-10). The acknowledgement is still required without them, because the
 * thing being acknowledged changes rather than disappearing: with dates it names a day count, and
 * without them it says suppliers will price with no fixed end.
 */
export function gateWhen(project: ProjectDetails, chargedDaysUnderstood: boolean): GateResult {
  const reasons: string[] = [];
  if (!project.timing.rentalBasis) reasons.push("gate.chooseRentalBasis");
  // A window that runs backwards blocks the send (owner, 2026-08-25). The `min` on the end input
  // stops a PICKED date; this stops a typed or pasted one, and a draft restored from before the
  // input was constrained. See `computeChargedDays().reversed` for why nothing caught it before.
  if (computeChargedDays(project.timing).reversed) reasons.push("gate.datesReversed");
  if (!chargedDaysUnderstood) reasons.push("gate.confirmChargedDays");
  return { ok: reasons.length === 0, reasons };
}

/** Which field each `gateWhen` reason belongs to. Anything unlisted is a charged-days gap. */
const WHEN_GAP_FIELD: Record<string, string> = {
  "gate.chooseRentalBasis": "rental_basis",
  "gate.datesReversed": "dates",
};

/**
 * Every unmet requirement across the whole draft — the "N things need you" counter (MREQ-AC-12) and
 * the source of which blocks shake on a refused move (MREQ-AC-15).
 */
export function requiredGaps(draft: RfqDraft, chargedDaysUnderstood: boolean): RequiredGap[] {
  const live = draft.items.filter((i) => !i.removed && (i.verdict !== "no-match" || isCustomLine(i)));
  const gaps: RequiredGap[] = [];

  if (live.length === 0) {
    gaps.push({ panel: "equipment", itemId: null, field: "items", reason: "gate.noItems" });
  }
  for (const item of live) gaps.push(...itemGaps(item, draft));
  gaps.push(...transportGaps(live, draft.project));

  for (const r of gateWhere(draft.project).reasons) {
    gaps.push({ panel: "where", itemId: null, field: "location", reason: r });
  }
  for (const r of gateWhen(draft.project, chargedDaysUnderstood).reasons) {
    gaps.push({ panel: "when", itemId: null, field: WHEN_GAP_FIELD[r] ?? "charged_days", reason: r });
  }
  return gaps;
}

/** Gaps owned by one panel — drives that panel's dot colour (MREQ-AC-13). */
export function panelGaps(gaps: RequiredGap[], panel: RequiredGap["panel"]): RequiredGap[] {
  return gaps.filter((g) => g.panel === panel);
}

/**
 * Items that actually post (mapped, not removed) — AC-33/34/43.
 *
 * An off-catalogue line posts too, but only once the renter has NAMED it: the payload carries his
 * name and no taxonomy ids. Unnamed, it is dropped exactly as every no-match line was before.
 */
export function postableItems(items: EquipmentItem[]): EquipmentItem[] {
  return items.filter((i) => !i.removed && (i.verdict !== "no-match" || (isCustomLine(i) && customName(i) !== "")));
}
