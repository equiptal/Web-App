/**
 * **Machine 1's answers, carried to the next machine** (owner, 2026-10-23: *"prefilled of items from
 * the first item set in case of multi item request ... user clicked mebo on him then next item will
 * show the same answer prefilled"*).
 *
 * `ADD_ITEM` already seeds a machine the renter ADDS from machine 1 (owner, 2026-08-31). A machine
 * the AGENT created from the text did not get it: it kept what the agent, the project or our defaults
 * gave it, so a renter who set delivery to «me» on the excavator answered it again on the loader.
 *
 * The owner's rulings for this one, 2026-10-23:
 *
 *  1. **Only what he CLICKED on machine 1 travels** (`touchedFields`). A value the agent read from his
 *     words about machine 1 is about machine 1.
 *  2. **His own words about THIS machine win** over machine 1's click: «loader without operator»
 *     keeps the loader without one. An agent GUESS (`assumedFields`) is not his words and gives way.
 *     A project or default value gives way too (his 2026-08-31 rule: what he selected in the request
 *     beats the project).
 *  3. **Once, the first time the machine is opened** (`inheritedItems`). A later change on machine 1
 *     does not reach it.
 *  4. **No label.** A carried answer reads as his own on this machine; it is recorded in
 *     `touchedFields` for that reason, which is also what keeps it from amber «default» marking.
 *  5. The operator rail still has to be opened once on this machine (the 2026-09-09 gate is the
 *     rail's own memory, untouched here).
 *
 * Two existing rules decide what fits: a category change clears a machine's certificate (*"a cert
 * chosen for an excavator is not an answer about a crane"*) and resets its fuel type, so those two
 * travel only between machines of the SAME category. Operator details travel only when this machine
 * ends up with an operator. The machine itself (type, size, count, attachments, target price, work
 * type, notes) never travels.
 *
 * **NO React, NO DOM.** Pure, so the precedence is testable without a store.
 */
import { agentFilled } from "./provenance";
import type { EquipmentItem, OperatorDetails, RfqDraft } from "./draft";
import { itemFieldKey } from "./gates";

/** One answer the canvas records under `field`, and the item properties it writes. */
interface Carried {
  field: string;
  sameCategoryOnly?: boolean;
  operatorDetail?: boolean;
  read: (i: EquipmentItem) => unknown;
  write: (i: EquipmentItem, from: EquipmentItem) => EquipmentItem;
}

const op = (patch: (o: OperatorDetails, f: OperatorDetails) => Partial<OperatorDetails>) =>
  (i: EquipmentItem, from: EquipmentItem): EquipmentItem => ({ ...i, operator: { ...i.operator, ...patch(i.operator, from.operator) } });

const CARRIED: Carried[] = [
  { field: "delivery", read: (i) => i.deliveryOverride, write: (i, f) => ({ ...i, deliveryOverride: f.deliveryOverride }) },
  { field: "return", read: (i) => i.returnOverride, write: (i, f) => ({ ...i, returnOverride: f.returnOverride }) },
  { field: "fuel_responsibility", read: (i) => i.fuelResponsibilityOverride, write: (i, f) => ({ ...i, fuelResponsibilityOverride: f.fuelResponsibilityOverride }) },
  { field: "equipment_year", read: (i) => i.equipmentYear ?? null, write: (i, f) => ({ ...i, equipmentYear: f.equipmentYear ?? null }) },
  {
    field: "safety_certificates",
    sameCategoryOnly: true,
    read: (i) => i.safetyCertsOverride ?? null,
    write: (i, f) => ({ ...i, safetyCertsOverride: f.safetyCertsOverride ? [...f.safetyCertsOverride] : null, safetyCertsOtherText: f.safetyCertsOtherText ?? null }),
  },
  { field: "fuel_type", sameCategoryOnly: true, read: (i) => i.fuelType, write: (i, f) => ({ ...i, fuelType: f.fuelType }) },
  { field: "operator_needed", read: (i) => i.operatorNeeded, write: (i, f) => ({ ...i, operatorNeeded: f.operatorNeeded }) },
  { field: "operator.fat_food", operatorDetail: true, read: (i) => i.operator.fatFood, write: op((_, f) => ({ fatFood: f.fatFood })) },
  { field: "operator.fat_accommodation", operatorDetail: true, read: (i) => i.operator.fatAccommodationTransport, write: op((_, f) => ({ fatAccommodationTransport: f.fatAccommodationTransport })) },
  { field: "operator.certificate", operatorDetail: true, read: (i) => i.operator.certificate, write: op((_, f) => ({ certificate: [...f.certificate], certificateOther: f.certificateOther ?? null })) },
  { field: "operator.nationality", operatorDetail: true, read: (i) => i.operator.nationality, write: op((_, f) => ({ nationality: f.nationality, nationalityCustom: f.nationalityCustom ?? null })) },
  { field: "operator.night_shift", operatorDetail: true, read: (i) => i.operator.nightShift, write: op((_, f) => ({ nightShift: f.nightShift })) },
];

/**
 * Carry machine 1's clicked answers onto `targetId`, once. Returns the draft unchanged when there is
 * nothing to do: the target IS machine 1, it was already offered the copy, or it is not live.
 *
 * `agentItems` is the store's untouched agent snapshot (`agentOrigin.items`), the only way to tell
 * «the agent read this from his words» from any other value that happens to be equal.
 */
export function inheritFromFirstItem(draft: RfqDraft, targetId: string, agentItems: readonly EquipmentItem[] = []): RfqDraft {
  const live = draft.items.filter((i) => !i.removed);
  const first = live[0];
  const target = live.find((i) => i.id === targetId);
  if (!first || !target || target.id === first.id) return draft;
  if ((draft.inheritedItems ?? []).includes(target.id)) return draft;

  const touched = new Set(draft.touchedFields ?? []);
  const assumed = new Set(draft.assumedFields ?? []);
  const agentTarget = agentItems.find((i) => i.id === target.id);
  const sameCategory = !!first.ref.categoryId && first.ref.categoryId === target.ref.categoryId;

  /** His own words about THIS machine: the agent filled it from the text and did not mark a guess. */
  const fromHisWords = (c: Carried, item: EquipmentItem): boolean => {
    if (!agentTarget) return false;
    if (assumed.has(itemFieldKey(target.id, c.field))) return false;
    return agentFilled(c.read(item), c.read(agentTarget));
  };

  let next = target;
  const copied: string[] = [];
  const offer = (c: Carried) => {
    if (!touched.has(itemFieldKey(first.id, c.field))) return; // he did not click it on machine 1
    if (touched.has(itemFieldKey(target.id, c.field))) return; // he answered it here already
    if (c.sameCategoryOnly && !sameCategory) return;
    if (fromHisWords(c, next)) return;
    next = c.write(next, first);
    copied.push(itemFieldKey(target.id, c.field));
  };

  for (const c of CARRIED) if (!c.operatorDetail) offer(c);
  // Operator details only onto a machine that ends up with an operator.
  if (next.operatorNeeded === "yes") for (const c of CARRIED) if (c.operatorDetail) offer(c);

  return {
    ...draft,
    items: draft.items.map((i) => (i.id === target.id ? next : i)),
    touchedFields: copied.length ? [...(draft.touchedFields ?? []), ...copied] : draft.touchedFields,
    inheritedItems: [...(draft.inheritedItems ?? []), target.id],
  };
}
