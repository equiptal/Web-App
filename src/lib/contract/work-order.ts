/**
 * The WORK ORDER — a machine on the site that did not come from our marketplace (PROJ, spec §4).
 *
 * The renter's own fleet, or a vendor they have used for years. **Private: no supplier ever sees it,
 * and it is never dispatched anywhere.** It exists because most of the equipment standing on a real
 * site never came through us, so without it our page shows a renter a fraction of their own job.
 *
 * It does a second job for free: it is a **template**. Its machine terms are what a later marketplace
 * request starts from, so the terms a renter sets once here are the terms their next request carries.
 *
 * **It is awarded the moment it exists** — there was never anything to award. Saving one writes its
 * machines and one award per supplier line.
 *
 * ── There is no work-order row ───────────────────────────────────────────────────────────────────
 *
 * A work order is **a group id shared by its machines**, exactly as a multi-item RFQ is a
 * `requestGroupId` shared by its fanned-out `EquipmentRequest` rows — one UUID minted per submission,
 * no `request_groups` table, and the header (dates, rental type, payment terms, the project pin)
 * duplicated on every row. This follows that pattern rather than inventing a second one.
 *
 * Two things fall out of it, and both are improvements:
 *
 *  - **A machine's terms are its own, complete.** With a parent row they were a shared blob plus a
 *    sparse `itemTerms` patch, so every read had to overlay one on the other — a merge each surface
 *    had to remember to do identically, and one of them eventually would not. Now the welder you
 *    collect yourself simply has `delivery: "me"`. It is not an override of anything.
 *  - **`projectId` lives in one place.** With a parent it sat on both the order and its items and the
 *    two had to be kept in step.
 *
 * The cost is that nothing in the database enforces that rows in a group agree about the title or the
 * period. That is survivable because the renter cannot cause it — the form writes every row together
 * — but it makes one rule non-negotiable: **every header write goes through one helper that updates
 * the whole group in a transaction.** Five write paths touch a header (create, edit, move, unfile,
 * delete) and all five must use it.
 */

import type { EquipmentItem, TimingHours } from "./draft";
import type { RentalBasis } from "./options";
import type { TaxonomyRef } from "./taxonomy";

/* ----------------------------- Machine terms ----------------------------- */

/**
 * How this renter hires this machine: who supplies the operator and on what certificate, who
 * delivers, who returns it, who pays for the fuel, how old it may be.
 *
 * **Complete on every machine**, not a patch over a shared blob. The form still shows one shared
 * block — that is a convenience for typing, which writes the same values to every row — and
 * *Different terms for this machine* simply writes different values to one row.
 *
 * **This is exactly what a template copies.** Never the equipment: category, subtype, size, quantity
 * and accessories always come from the text the renter typed. And never the budget, because a ceiling
 * is a number about one machine and a stale one filters out every real bid with no error shown.
 */
export interface MachineTerms {
  operatorNeeded: EquipmentItem["operatorNeeded"];
  operator: EquipmentItem["operator"];
  fuelType: EquipmentItem["fuelType"];
  equipmentYear: EquipmentItem["equipmentYear"];
  deliveryOverride: EquipmentItem["deliveryOverride"];
  returnOverride: EquipmentItem["returnOverride"];
  fuelResponsibilityOverride: EquipmentItem["fuelResponsibilityOverride"];
  safetyCertsOverride: EquipmentItem["safetyCertsOverride"];
  safetyCertsOtherText: EquipmentItem["safetyCertsOtherText"];
}

/* ----------------------------- The wire shape ----------------------------- */

/**
 * `terms` **as the backend stores it** — a compact, closed key set, validated on write.
 *
 * It is deliberately not {@link MachineTerms}. The stored blob is terse and stable; the in-app
 * shape mirrors `EquipmentItem` so the merge can write straight onto a draft line. Two names for
 * one thing is a cost, but the alternative is worse in both directions: storing the app's shape
 * makes the column follow every rename in `draft.ts`, and using the stored shape in the app makes
 * every consumer translate it inline, differently, until one of them gets it wrong.
 *
 * So the translation happens exactly twice, here, and nowhere else.
 */
export interface WireTerms {
  operator: "yes" | "no" | "optional" | null;
  nationality: string | null;
  natCustom: string;
  opCerts: string[];
  night: boolean;
  fatRequired: boolean;
  fatFood: string | null;
  fatAT: string | null;
  safety: string[] | null;
  safetyOther: string;
  delivery: string | null;
  ret: string | null;
  fuelResp: string | null;
  year: string | null;
  fuelType: string | null;
}

type Op = MachineTerms["operator"];

/** Stored blob → the shape the merge writes onto a draft line. Tolerant: a missing key is absent. */
export function termsFromWire(raw: unknown): MachineTerms {
  const w = (raw ?? {}) as Partial<WireTerms>;
  const operator = {
    nationality: (w.nationality ?? null) as Op["nationality"],
    nationalityCustom: w.natCustom ?? "",
    certificate: (w.opCerts ?? []) as Op["certificate"],
    certificateOther: "",
    nightShift: w.night === true,
    fatFood: (w.fatFood ?? null) as Op["fatFood"],
    fatAccommodationTransport: (w.fatAT ?? null) as Op["fatAccommodationTransport"],
  } as Op;
  return {
    operatorNeeded: (w.operator ?? null) as MachineTerms["operatorNeeded"],
    operator,
    fuelType: (w.fuelType ?? null) as MachineTerms["fuelType"],
    equipmentYear: (w.year ?? null) as MachineTerms["equipmentYear"],
    deliveryOverride: (w.delivery ?? null) as MachineTerms["deliveryOverride"],
    returnOverride: (w.ret ?? null) as MachineTerms["returnOverride"],
    fuelResponsibilityOverride: (w.fuelResp ?? null) as MachineTerms["fuelResponsibilityOverride"],
    safetyCertsOverride: (w.safety ?? null) as MachineTerms["safetyCertsOverride"],
    safetyCertsOtherText: w.safetyOther ?? null,
  };
}

/** The shape the merge uses → the stored blob. The only place that writes the wire's key names. */
export function termsToWire(t: MachineTerms): WireTerms {
  return {
    operator: (t.operatorNeeded ?? null) as WireTerms["operator"],
    nationality: (t.operator?.nationality ?? null) as string | null,
    natCustom: t.operator?.nationalityCustom ?? "",
    opCerts: (t.operator?.certificate ?? []) as string[],
    night: t.operator?.nightShift === true,
    fatRequired: Boolean(t.operator?.fatFood || t.operator?.fatAccommodationTransport),
    fatFood: (t.operator?.fatFood ?? null) as string | null,
    fatAT: (t.operator?.fatAccommodationTransport ?? null) as string | null,
    safety: (t.safetyCertsOverride ?? null) as string[] | null,
    safetyOther: t.safetyCertsOtherText ?? "",
    delivery: (t.deliveryOverride ?? null) as string | null,
    ret: (t.returnOverride ?? null) as string | null,
    fuelResp: (t.fuelResponsibilityOverride ?? null) as string | null,
    year: (t.equipmentYear ?? null) as string | null,
    fuelType: (t.fuelType ?? null) as string | null,
  };
}

/* ----------------------------- The period ----------------------------- */

/**
 * A work order's own period, duplicated across its machines.
 *
 * **Every field is nullable, and `null` means INHERIT THE PROJECT** — not "unset". That distinction is
 * why these are columns rather than a blob: the chart's *differs from the project* chip is literally
 * "did this set an end date of its own?", which a blob cannot answer.
 *
 * A work order may differ from its project's period and keep the difference. It may **not** differ on
 * location — that is locked from the project — so a work order can only ever conflict on time.
 *
 * The columns sit on each machine, so a machine *could* carry its own dates. **The form does not offer
 * that**, and rows in a group hold the same period: a machine that genuinely runs to a different
 * schedule shows it through its award's **marks** — mobilized 5 Oct rather than 1 Sep. Two levels of
 * date is answerable; three is not.
 */
export interface WorkOrderWhen {
  rentalBasis: RentalBasis | null;
  extendable: boolean | null;
  startDate: string | null;
  endDate: string | null;
  hoursPerDay: number | null;
}

export const EMPTY_WHEN: WorkOrderWhen = {
  rentalBasis: null,
  extendable: null,
  startDate: null,
  endDate: null,
  hoursPerDay: null,
};

/* ----------------------------- The machine ----------------------------- */

/** One machine. The header fields are the same on every machine sharing `workOrderGroupId`. */
export interface WorkOrderItem {
  id: string;
  /** The work order. A bare UUID minted per order — there is no row it points at. */
  workOrderGroupId: string;
  /** Keeps machines in the order the renter added them, and picks the row a header is read from. */
  sortOrder: number;

  /* ── header, duplicated across the group ── */
  projectId: string | null;
  title: string | null;
  when: WorkOrderWhen;
  /** True once the renter was shown that this period differs from the project's and kept it. */
  whenConflictAck: boolean;

  /* ── this machine ── */
  /**
   * The catalogue match — **optional here and nowhere else**. A renter's own yard holds machines we
   * never listed, and a work order goes to nobody, so it needs no id to bid against. A marketplace
   * request still requires a complete ref: suppliers bid against ids, and an unmatched machine has
   * nothing to bid on.
   */
  ref: TaxonomyRef;
  /** The typed name, used when `ref` is empty. One of the two is always present. */
  rawLabel: string | null;
  rawSize: string | null;
  quantity: number;
  attachmentIds: string[];
  customAttachments: string[];
  /** This machine's own terms, complete. */
  terms: MachineTerms;
  notes: string | null;
}

/**
 * A work order as every surface reads it: the machines sharing one group id, plus the header taken
 * from the first of them. Derived, never stored — the same shape `groupRequests()` derives for a
 * fanned-out RFQ.
 */
export interface WorkOrderGroup {
  id: string;
  projectId: string | null;
  title: string | null;
  when: WorkOrderWhen;
  whenConflictAck: boolean;
  items: WorkOrderItem[];
}

/* ----------------------------- Grouping ----------------------------- */

/**
 * Bucket machines into their work orders, preserving the order they arrive in.
 *
 * The header is read from the **lowest `sortOrder`** rather than "whichever came back first", so a
 * display can never flicker between two values if rows ever disagree — which they should not, but a
 * deterministic read costs nothing and removes a whole class of "it looked different last time".
 */
export function groupWorkOrderItems(items: WorkOrderItem[]): WorkOrderGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, WorkOrderItem[]>();

  for (const item of items) {
    if (!buckets.has(item.workOrderGroupId)) {
      buckets.set(item.workOrderGroupId, []);
      order.push(item.workOrderGroupId);
    }
    buckets.get(item.workOrderGroupId)!.push(item);
  }

  return order.map((id) => {
    const rows = buckets.get(id)!.slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const head = rows[0];
    return {
      id,
      projectId: head.projectId,
      title: head.title,
      when: head.when,
      whenConflictAck: head.whenConflictAck,
      items: rows,
    };
  });
}

/* ----------------------------- Helpers ----------------------------- */

/** A machine's display name: its catalogue names when matched, else what the renter typed. */
export function machineLabel(
  item: Pick<WorkOrderItem, "rawLabel" | "rawSize">,
  resolved?: { subtype?: string; capacity?: string },
): string {
  const fromCatalogue = [resolved?.subtype, resolved?.capacity].filter(Boolean).join(" ").trim();
  if (fromCatalogue) return fromCatalogue;
  return [item.rawLabel, item.rawSize].filter(Boolean).join(" ").trim();
}

/** Ready to save: a complete catalogue match, or a typed name. Never half of each. */
export function machineIsNamed(item: Pick<WorkOrderItem, "ref" | "rawLabel">): boolean {
  const matched = Boolean(item.ref.categoryId && item.ref.subcategoryId && item.ref.measurementId);
  return matched || Boolean((item.rawLabel ?? "").trim());
}

/** A work order's title, falling back to its first machine's name. Never empty. */
export function workOrderTitle(
  group: Pick<WorkOrderGroup, "title" | "items">,
  resolve?: (item: WorkOrderItem) => { subtype?: string; capacity?: string },
): string {
  const own = (group.title ?? "").trim();
  if (own) return own;
  const first = group.items[0];
  return first ? machineLabel(first, resolve?.(first)) : "";
}

/**
 * Which of a work order's period fields differ from its project's — the *differs from the project*
 * chip, and the list the keep-or-match dialog shows.
 *
 * Empty when the order inherits, which is the common case. **A difference is shown, never resolved**:
 * both values stay, and matching the project is an ordinary edit the renter asks for.
 */
export function whenDiffers(when: WorkOrderWhen, project: TimingHours): Array<keyof WorkOrderWhen> {
  const out: Array<keyof WorkOrderWhen> = [];
  if (when.rentalBasis != null && when.rentalBasis !== project.rentalBasis) out.push("rentalBasis");
  if (when.startDate != null && when.startDate !== project.startDate) out.push("startDate");
  if (when.endDate != null && when.endDate !== project.endDate) out.push("endDate");
  if (when.hoursPerDay != null && when.hoursPerDay !== project.hoursPerDay) out.push("hoursPerDay");
  if (when.extendable != null && when.extendable !== project.extendable) out.push("extendable");
  return out;
}

/** The period a row actually draws with: its own where set, else the project's. */
export function effectiveWhen(when: WorkOrderWhen | null, project: TimingHours): TimingHours {
  return {
    rentalBasis: when?.rentalBasis ?? project.rentalBasis,
    extendable: when?.extendable ?? project.extendable,
    startDate: when?.startDate ?? project.startDate,
    endDate: when?.endDate ?? project.endDate,
    hoursPerDay: when?.hoursPerDay ?? project.hoursPerDay,
  };
}

/**
 * The header fields a change to "the work order" writes to **every** row in the group.
 *
 * Exported as one list so the five write paths — create, edit, move, unfile, delete — cannot each
 * decide for themselves what counts as a header field. Nothing in the database enforces that a group
 * agrees; this is what does.
 */
export const WORK_ORDER_HEADER_FIELDS = [
  "projectId",
  "title",
  "when",
  "whenConflictAck",
] as const satisfies readonly (keyof WorkOrderItem)[];

/** Nothing answered. The two non-nullable fields take the app's own defaults, not a lie about null. */
export function blankTerms(): MachineTerms {
  return {
    /* ~~"yes"~~ — **off by default** (owner, 2026-08-31). It is the question most often answered
       *no*, and a toggle that starts on asks a renter hiring a generator to turn something off
       before they can move past four fields about operator nationality. Starting off means the four
       appear only for the renter who actually wants them. */
    operatorNeeded: "no",
    operator: {
      nationality: null,
      nationalityCustom: "",
      certificate: [],
      certificateOther: "",
      nightShift: false,
      fatFood: null,
      fatAccommodationTransport: null,
    } as MachineTerms["operator"],
    /* Not asked any more (owner, 2026-08-31: *"also remove fuel"*). Diesel is the app's own
       default and the type does not admit null, so it is seeded and left alone rather than deleted
       from the shape — which would move a backend contract for a field nobody is arguing about.
       `night shift` went the same way: the key stays `false` and no control offers it. */
    fuelType: "diesel",
    equipmentYear: null,
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    safetyCertsOverride: null,
    safetyCertsOtherText: null,
  };
}
