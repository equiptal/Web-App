/**
 * Merging a PROJECT into a draft (web-app/007, PROJ · spec §11.1, §5.2).
 *
 * Three sources meet in the browser and nowhere else:
 *
 * ```
 *   your text  ──►  the agent  ──►  equipment · quantity · accessories · anything you stated
 *                                              │
 *   the project ────────────────────────────────┤──►  the draft the canvas renders
 *                                              │
 *   a template (a past request or work order) ──┘
 * ```
 *
 * **The agent is never sent a project value and never returns one.** That is not a prompt
 * instruction we hope holds — the merge simply happens after the parse, here, in a pure function.
 * Smaller input, smaller output, and a site's terms cannot come back altered by a language model
 * they never reached.
 *
 * ── Two rules this function must never break ────────────────────────────────────────────────────
 *
 * **1 · A field the agent filled wins.** If the renter wrote "from Oct 1" and the project says
 * 1 Sep, the request keeps October. A project that overwrites what someone actually typed is worse
 * than no project at all, and the disagreement is surfaced as a conflict rather than resolved.
 *
 * **2 · Machine terms copy uniformly.** Whether a given machine takes an operator at all is a
 * catalogue question the backend will answer separately (spec §7, deferred) — this function does not
 * try to guess it, and copies the operator policy for every line the same way.
 *
 * Everything it writes is marked `project` in the provenance, so the canvas can say where a value
 * came from. Nothing here is written back: the project and the template both stay exactly as they
 * were, which is what makes a request and its project able to drift apart safely.
 */

import type { RfqDraft, EquipmentItem, ProjectDetails } from "./draft";
import type { MachineTerms } from "./work-order";
import type { ProjectDefaults } from "./project";

/**
 * The untouched snapshot of what the agent returned — the same shape the store already keeps for the
 * AI markers (`RfqState.agentOrigin`). Where it holds a value, the agent spoke, and the project stays
 * out of the way.
 */
export type AgentSnapshot = { project: ProjectDetails; items: EquipmentItem[] } | null | undefined;

/**
 * True when the agent actually supplied this header value — in which case the project leaves it
 * alone. `null`, `""` and `[]` all count as "the agent said nothing".
 */
function agentSet(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length === 0 ? false : true;
  return true;
}

export interface ApplyProjectResult {
  draft: RfqDraft;
  /** Dotted paths this call wrote, for the `project` provenance source. */
  filled: string[];
}

/**
 * Fill a draft's header from a project, without disturbing anything the agent or the renter set.
 *
 * `agentOrigin` is the untouched snapshot of what the agent returned (the store already keeps one
 * for the AI markers). Where it holds a value, that value stands.
 */
export function applyProjectDefaults(
  draft: RfqDraft,
  defaults: ProjectDefaults,
  location: { label: string; lat: number | null; lng: number | null },
  agentOrigin: AgentSnapshot,
): ApplyProjectResult {
  const filled: string[] = [];
  const next: RfqDraft = {
    ...draft,
    project: { ...draft.project, timing: { ...draft.project.timing }, location: { ...draft.project.location } },
    preferences: { ...draft.preferences, payment: { ...draft.preferences.payment } },
  };

  const a = agentOrigin?.project;

  /* ── Where ──
     The label is what a renter reads; the pin is what the map drew. A location the agent extracted
     from the text stands, and the difference is raised as a conflict by the caller — never silently
     replaced here (spec §11.2). */
  if (!agentSet(a?.location?.label)) {
    next.project.location = {
      ...next.project.location,
      label: location.label,
      lat: location.lat ?? undefined,
      lng: location.lng ?? undefined,
      source: "manual",
      // AC-16 stands: a location still has to be confirmed, whoever supplied it.
      confirmed: next.project.location.confirmed,
    };
    filled.push("location.label");
  }

  /* ── When ── */
  const t = defaults.timing;
  if (!agentSet(a?.timing?.rentalBasis) && t.rentalBasis != null) {
    next.project.timing.rentalBasis = t.rentalBasis;
    filled.push("timing.rental_basis");
  }
  if (!agentSet(a?.timing?.startDate) && t.startDate) {
    next.project.timing.startDate = t.startDate;
    filled.push("timing.start_date");
  }
  if (!agentSet(a?.timing?.endDate) && t.endDate) {
    next.project.timing.endDate = t.endDate;
    filled.push("timing.end_date");
  }
  if (!agentSet(a?.timing?.hoursPerDay) && t.hoursPerDay) {
    next.project.timing.hoursPerDay = t.hoursPerDay;
    filled.push("timing.hours_per_day");
  }
  // `extendable` is a flag on the basis, so it follows the basis rather than standing alone.
  if (!agentSet(a?.timing?.rentalBasis)) {
    next.project.timing.extendable = t.extendable;
    filled.push("timing.extendable");
  }

  /* ── The one commercial term ──
     Payment terms come from a company's finance department and apply to every machine on every site.
     Method, maintenance, SLA, budget, supplier filters and the bid window are per request and are
     deliberately not here (spec §5.3). */
  if (!next.preferences.payment.terms && defaults.paymentTerms) {
    next.preferences.payment.terms = defaults.paymentTerms;
    filled.push("preferences.payment_terms");
  }

  return { draft: next, filled };
}

/* ----------------------------- Machine terms ----------------------------- */

/**
 * A TEMPLATE is any work order or past request already in the project. Picking one copies its
 * {@link MachineTerms} — how this renter hires machines at this site — and **never the equipment**.
 * Category, subtype, size, quantity and accessories always come from the text the renter typed.
 *
 * A one-time copy at creation. The source is never read again, so deleting it next month changes
 * nothing about the requests that started from it.
 */

/** Lift the machine terms off an item — what a template stores when a request becomes one. */
export function machineTermsOf(item: EquipmentItem): MachineTerms {
  return {
    operatorNeeded: item.operatorNeeded,
    operator: { ...item.operator },
    fuelType: item.fuelType,
    equipmentYear: item.equipmentYear ?? null,
    deliveryOverride: item.deliveryOverride,
    returnOverride: item.returnOverride,
    fuelResponsibilityOverride: item.fuelResponsibilityOverride,
    safetyCertsOverride: item.safetyCertsOverride ?? null,
    safetyCertsOtherText: item.safetyCertsOtherText ?? null,
  };
}

/**
 * Copy a template's machine terms onto the draft's items.
 *
 * Same rule as above: **the agent's own extraction wins.** A line whose text said "with operator"
 * keeps what the agent read; everything the agent was silent about takes the template's value.
 */
export function applyMachineTerms(
  draft: RfqDraft,
  terms: MachineTerms,
  agentOrigin: AgentSnapshot,
): ApplyProjectResult {
  const filled: string[] = [];
  const items = draft.items.map((item) => {
    const agentItem = agentOrigin?.items.find((i) => i.id === item.id);
    const next: EquipmentItem = { ...item, operator: { ...item.operator } };

    if (!agentSet(agentItem?.operatorNeeded)) {
      next.operatorNeeded = terms.operatorNeeded;
      filled.push(`line_items[${item.id}].operator_included`);
    }

    // The operator POLICY — nationality, certificates, night shift, F.A.T — is a site-wide habit, so
    // it fills wherever the agent did not speak for this line specifically.
    next.operator = {
      ...next.operator,
      nationality: agentSet(agentItem?.operator?.nationality) ? next.operator.nationality : terms.operator.nationality,
      nationalityCustom: agentSet(agentItem?.operator?.nationalityCustom)
        ? next.operator.nationalityCustom
        : terms.operator.nationalityCustom,
      certificate: agentItem?.operator?.certificate?.length ? next.operator.certificate : [...terms.operator.certificate],
      certificateOther: agentSet(agentItem?.operator?.certificateOther)
        ? next.operator.certificateOther
        : terms.operator.certificateOther,
      nightShift: agentSet(agentItem?.operator?.nightShift) ? next.operator.nightShift : terms.operator.nightShift,
      fatFood: agentSet(agentItem?.operator?.fatFood) ? next.operator.fatFood : terms.operator.fatFood,
      fatAccommodationTransport: agentSet(agentItem?.operator?.fatAccommodationTransport)
        ? next.operator.fatAccommodationTransport
        : terms.operator.fatAccommodationTransport,
    };
    filled.push(`line_items[${item.id}].operator`);

    if (!agentSet(agentItem?.fuelType)) {
      next.fuelType = terms.fuelType;
      filled.push(`line_items[${item.id}].fuel_type`);
    }
    if (!agentSet(agentItem?.equipmentYear) && terms.equipmentYear) {
      next.equipmentYear = terms.equipmentYear;
      filled.push(`line_items[${item.id}].equipment_year`);
    }
    if (next.deliveryOverride == null) next.deliveryOverride = terms.deliveryOverride;
    if (next.returnOverride == null) next.returnOverride = terms.returnOverride;
    if (next.fuelResponsibilityOverride == null) next.fuelResponsibilityOverride = terms.fuelResponsibilityOverride;
    if (next.safetyCertsOverride == null && terms.safetyCertsOverride) {
      next.safetyCertsOverride = [...terms.safetyCertsOverride];
      filled.push(`line_items[${item.id}].safety_certifications`);
    }
    if (!next.safetyCertsOtherText && terms.safetyCertsOtherText) {
      next.safetyCertsOtherText = terms.safetyCertsOtherText;
    }

    return next;
  });

  return { draft: { ...draft, items }, filled };
}
