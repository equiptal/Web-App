/**
 * The RFQ draft + broadcast request model — the editable state the wizard operates on, and the
 * payload posted to /api/requests. The agent (`/api/agent/process`, mocked) returns the project +
 * items portion as an {@link AgentDraft}; preferences are renter-set and default-initialized here.
 */

import { Verdict, Extracted, ValueConflict } from "./verdict";
import { TaxonomyRef, EMPTY_REF } from "./taxonomy";
import {
  RentalBasis,
  OvertimeRate,
  SafetyCertificate,
  OtherCertificate,
  Party,
  OperatorNeeded,
  OperatorCertificate,
  FuelType,
  PaymentTerm,
  PaymentMethod,
  MaintenanceResponsibility,
  MaintenanceSla,
  BidWindow,
} from "./options";

/* ----------------------------- Project (request-wide) ----------------------------- */

export interface ProjectLocation {
  label: string | null;
  lat?: number;
  lng?: number;
  /**
   * AC-16: always starts unconfirmed, even when extracted; the renter must confirm to advance.
   *
   * ⚠️ **One exception, ruled by the owner 2026-08-31: a location that came from a project arrives
   * confirmed.** The renter already dropped that pin and saved it, on the project, deliberately.
   * Asking them to confirm it again on every request for that site is asking them to re-answer a
   * question they answered once — which is the entire thing projects exist to stop.
   */
  confirmed: boolean;
  /**
   * Where the value came from, and therefore what label sits under it.
   *
   * `project` is not a synonym for `manual`: `Provenance` renders *From your project* for it and
   * nothing for a manual entry, because one is worth explaining and the other is the renter looking
   * at what they just typed.
   */
  source?: "agent" | "gps" | "manual" | "map" | "project";
  /** AC-47: text↔file disagreement on the location, if any. */
  conflict?: ValueConflict<string>;
}

export interface TimingHours {
  rentalBasis: RentalBasis | null; // AC-13 required to advance Step 1
  extendable: boolean; // AC-13 flag on the chosen basis
  startDate: string | null; // AC-14 optional, bypassable
  endDate: string | null; // AC-14 optional
  hoursPerDay: number; // AC-14 default 10
}

export interface AdvancedSettings {
  workingDaysPerWeek: number; // AC-15 stepper 1–7, default 6
  overtimeRate: OvertimeRate; // AC-15 default "without"
  equipmentYear: string | null; // AC-28 "any" | "2015+".."2022+" (matches app); optional
}

export interface Certificates {
  /** AC-50 — the request-wide EQUIPMENT cert ("settings for all items"). Every line with no per-item
   *  override inherits it, lifting included. It does NOT touch the operator certificate: a pick here
   *  used to stamp one on each item too (AC-24), which is part of the withdrawn cert rule. */
  safety: SafetyCertificate[];
  /** web-app/002: free-text name when "other" is selected in `safety` (optional). */
  safetyOther: string;
  other: OtherCertificate[]; // AC-50
}

export interface ProjectDetails {
  location: ProjectLocation;
  timing: TimingHours;
  advanced: AdvancedSettings;
  certificates: Certificates;
  // Request-wide, per-item overridable (AC-25/26). `null` = no selection: the agent found differing
  // per-item values (each item carries its own), or nothing chosen yet. A value applies to every
  // item without a per-item override.
  deliveryToSite: Party | null;
  returnFromSite: Party | null;
  fuelResponsibility: Party | null;
}

/* ----------------------------- Equipment item ----------------------------- */

export interface OperatorDetails {
  nightShift: boolean;
  nationality: string | null;
  /** Part 3: free-text nationalities the rentee allows — shown only when `nationality === "restricted"`.
   *  Sent as operatorNationalityCustom (≤100). */
  nationalityCustom?: string | null;
  certificate: OperatorCertificate[]; // multi-select; defaulted from project Safety certs (AC-24/50)
  /** Free-text operator certificate when "other" is selected — appended to operatorLicenseLevel (app parity). */
  certificateOther?: string | null;
  /** AC-50: true when the agent set the cert per-item from the RFQ — the project-level Safety cert
   *  then leaves it untouched (only fills items the agent didn't mention). */
  certByAgent?: boolean;
  /** AC-24: F.A.T split — who covers the operator's Food vs Accommodation & Transport (supplier / me).
   *  Per-item; both become negotiable deal-room terms. (Superseded the old single `fat` choice.) */
  fatFood: Party | null;
  fatAccommodationTransport: Party | null;
  /** AC-24: whether F.A.T applies at all (operator included) — the agent's explicit `fat_required`
   *  signal. null when unset; the submit falls back to deriving it from the two sides above. */
  fatRequired?: boolean | null;
}

/** AC-19/20: nearest-measurement + optional unit conversion the agent suggests. */
export interface MeasurementSuggestion {
  /** The taxonomy measurement id suggested as nearest. */
  measurementId: string;
  unitConversion?: {
    fromUnit: string;
    fromValue: number;
    toUnit: string;
    toValue: number;
  };
}

export interface EquipmentItem {
  id: string;
  /** Free-text label as it appeared in the RFQ (display aid). */
  rawLabel: string | null;
  /**
   * Verbatim capacity/size as stated in the RFQ (e.g. "30 ton", "2.5 m³"), kept even when it
   * doesn't resolve to a taxonomy measurement id. Display fallback so a stated-but-off-taxonomy
   * (or "Not Specified") size still shows instead of "—". null when the RFQ stated no size.
   */
  rawSize: string | null;
  ref: TaxonomyRef;
  /** The agent's CANONICAL match names (English + Arabic) — DISPLAY ONLY for "MATCHED TO", used as the
   *  Arabic source (and the fallback when an item didn't resolve to a taxonomy node). IDs/submit always
   *  use `ref`, never these. null for manually-added items (they resolve from the taxonomy). */
  agentNames?: { category: string; categoryAr: string | null; subtype: string; subtypeAr: string | null; capacity: string; capacityAr: string | null } | null;
  verdict: Verdict; // from the agent
  /** AC-19: nearest-measurement suggestion when the RFQ measurement isn't in the taxonomy. */
  suggestion?: MeasurementSuggestion;
  /** AC-19/20: free-text capacity advisory from the agent (unit mismatch / snap explanation). */
  advisory?: string | null;
  /** Agent's plain-language size guidance when the size is unresolved — the question/options it
   *  raised for this item's capacity (from missing_required_fields[line_items[i].capacity]). Shown
   *  beside "pick a size to approve" so the renter sees what the agent is asking. null when none. */
  sizeNote?: string | null;
  /**
   * AC-18/19/29: whether a needs-validation match or measurement suggestion has been resolved
   * (Approved or Edited). Confident/no-match items are not gated by this.
   */
  resolved: boolean;
  /** AC-30/32: a no-match item the renter removed/actioned is excluded from the broadcast (AC-33). */
  removed: boolean;
  /**
   * AC-31: the renter asked us to source this no-match item ("Provide it for me?" → WhatsApp). The row
   * STAYS visible in a pending state — deleting it on the hand-off (the original behaviour) made the
   * equipment vanish the moment the renter came back from WhatsApp, contradicting the message we
   * prefill ("…so it is added to my request"). Still never posted: `postableItems` drops every
   * no-match item regardless (AC-33), and `itemBlocksAdvance` lets it through.
   */
  sourcingRequested?: boolean;

  // Per-item options:
  quantity: number; // AC-55 default 1, min 1
  operatorNeeded: OperatorNeeded; // AC-24
  operator: OperatorDetails;
  fuelType: FuelType; // AC-26 default "diesel"
  /** Part 1: optional free-text "work type" — surfaced only for crane subtypes (mirrors mobile). ≤255. */
  workType?: string;
  additionalNotes: string; // AC-53 agent-extracted free-text qualifiers, editable

  // Per-item overrides of request-wide settings (AC-25/26):
  deliveryOverride: Party | null;
  returnOverride: Party | null;
  fuelResponsibilityOverride: Party | null;
  /** AC-50: per-item EQUIPMENT safety certs (TÜV/SPSP/SASO). null ⇒ inherit the request-wide
   *  `project.certificates.safety` (the "settings for all items" default), overridable per item —
   *  same globalize-with-override model as delivery/return/fuel. Distinct from the OPERATOR cert. */
  safetyCertsOverride?: SafetyCertificate[] | null;
  /** Free-text cert for this item, shown when its "Other" chip is on. App parity: the per-item "Other"
   *  safety-cert field in the app's Step 2 — a legacy/non-offered code (`spsp`, `saso-technical`) that
   *  arrives on an item is split into here by `splitSafetyCerts` so it stays visible and editable
   *  instead of riding along in the list with no chip to represent it. Distinct from the request-wide
   *  `project.certificates.safetyOther`. */
  safetyCertsOtherText?: string | null;
  /** AC-28: per-item equipment year override. null ⇒ inherit the request-wide year
   *  (`project.advanced.equipmentYear`). Value is "any" | a 4-digit year | "custom:<text>". */
  equipmentYear?: string | null;
  /** Per-item equipment attachments/accessories. `attachmentIds` are admin-defined SubtypeAttachment
   *  ids for this subtype; `customAttachments` are renter free-text additions. Stored on the request
   *  item as `attachment_ids` / `custom_attachments` (Json arrays). */
  attachmentIds?: string[];
  customAttachments?: string[];

  /** AC-57: confidence on agent-prefilled per-item fields (UI badges). */
  fieldConfidence?: {
    quantity?: Extracted<number>["confidence"];
    operator?: Extracted<number>["confidence"];
    fuelType?: Extracted<number>["confidence"];
  };
}

/* ----------------------------- Preferences (Step 3) ----------------------------- */

export interface Preferences {
  payment: { terms: PaymentTerm | null; method: PaymentMethod | null }; // AC-36
  maintenance: { responsibility: MaintenanceResponsibility; sla: MaintenanceSla | null }; // AC-37
  additionalNotes: string; // AC-38 (request-level; distinct from per-item notes AC-53)
  budgetSar: number | null; // AC-39 setting only
  supplierFilters: {
    verifiedOnly: boolean;
    sublettingAllowed: boolean;
    bidWindow: BidWindow | null;
  }; // AC-40
}

/* ----------------------------- Agent draft + full draft ----------------------------- */

/** What the agent (mock /api/agent/process) returns — the renter-observable draft. */
export interface AgentDraft {
  /** Mansour's stored RFQ id (when parsed by the real agent) — anchors the web_review correction fired
   *  at submit if the renter edited the draft. null for the mock/manual flow. */
  rfqId?: string | null;
  /**
   * The paths the AGENT filled from its own judgement rather than from the renter's text.
   *
   * ── Why this exists ─────────────────────────────────────────────────────────────────────────────
   *
   * `provenance.ts` states the rule: **renter > agent > project > default**, and it names delivery and
   * return as `default` values — *"both seed to «me», which assigns the renter both transport legs"*.
   *
   * The agent breaks that ordering from underneath. Its own instructions tell it to fill EVERY field
   * — *"null is the last resort"* — so a line that says nothing about haulage still comes back with
   * `mobilization_by_rentee: true`, and the draft cannot tell that from a renter who wrote *"we'll
   * collect it ourselves"*. A guess then reads as `agent`, which outranks the renter's own SITE.
   *
   * That is the wrong way round (owner, 2026-08-31): *"the agent only reads the text… he will not
   * send values other than the ones in the text"*. A project's standing answer must beat a guess.
   *
   * ── How the agent tells us ──────────────────────────────────────────────────────────────────────
   *
   * It says so itself, in the two channels it already has for *«I decided this, you did not»*: a
   * `field_notes` entry on the field, or a `missing_required_fields` entry raising it as a question.
   * `agent-adapters` already trusts exactly those two marks to un-assume an operator; this is the
   * same rule, written down once and applied to every field that has a project-supplied counterpart.
   *
   * The VALUE stays — clearing it would leave a required field unanswered, which is a worse answer
   * than a marked guess. What changes is who owns it: not the agent, so the project and the template
   * can fill over it, and the badge stops crediting the renter's own words for something they never
   * said.
   */
  assumedFields?: string[];

  project: ProjectDetails;
  items: EquipmentItem[];
  /** Step-3 preferences the agent inferred (payment/maintenance/budget/filters). Renter edits in Step 3. */
  preferences?: Preferences;
  /** AC-48: every distinct site the agent detected; >1 ⇒ prompt that others need separate requests. */
  detectedLocations: string[];
  /** AC-56: processing summary counts. */
  summary: ProcessingSummary;
  /** DEPRECATED flat notes (lumped Step-4 box). Prefer fieldNotes. */
  justifications?: string[];
  /** Field-keyed agent notes (dotted path → note), rendered inline beside each field. */
  fieldNotes?: Record<string, string>;
}

export interface ProcessingSummary {
  totalItems: number;
  needsValidation: number;
  notAvailable: number;
}

/** The full editable RFQ: agent-drafted project+items plus renter preferences. */
export interface RfqDraft {
  /** Mansour's stored RFQ id — see {@link AgentDraft.rfqId}. Persisted with the draft so a correction
   *  can be fired at submit even after a reload. */
  rfqId?: string | null;
  /** See {@link AgentDraft.assumedFields}. Persisted with the draft. */
  assumedFields?: string[];

  project: ProjectDetails;
  items: EquipmentItem[];
  preferences: Preferences;
  detectedLocations: string[];
  summary: ProcessingSummary;
  /** DEPRECATED flat notes (lumped Step-4 box). Prefer fieldNotes. */
  justifications?: string[];
  /** Field-keyed agent notes (dotted path → note), rendered inline beside each field. */
  fieldNotes?: Record<string, string>;
  /**
   * MREQ-AC-56/59/60 — dotted paths the renter has personally edited, in the same key vocabulary as
   * {@link AgentDraft.fieldNotes} (e.g. `line_items[m101].equipment_year`).
   *
   * **Web-only. Never sent to either backend.** It exists because three provenances collapse to the
   * same stored value: a field the agent filled, a field we defaulted, and a field the renter
   * deliberately set to the same thing are indistinguishable by value alone. `agentMatches` separates
   * agent from non-agent; this separates our default from the renter's own choice, which is what the
   * "Default" badge and the year/certificate gates both hang on.
   *
   * Persisted with the draft, so a control the renter already answered does not demand attention
   * again after a reload.
   */
  touchedFields?: string[];

  /**
   * PROJ - the dotted paths a PROJECT filled, so the canvas can say where a value came from.
   *
   * A fourth thing that is invisible in the value alone. `touchedFields` separates the renter from
   * us and `agentMatches` separates the agent from us; this separates a value the SITE supplied from
   * one we simply defaulted, which is the difference between *"Qiddiya runs 10-hour days"* and
   * *"we guessed 10"*. A renter who cannot tell those apart cannot know which one is worth checking.
   *
   * Written once by `applyProjectDefaults`, from the `filled` list it returns. Persisted with the
   * draft, and never read back by the project: the copy stands alone from the moment it is made.
   */
  projectFields?: string[];

  /**
   * PROJ - the site this draft is filed under, and the work order it was started from.
   *
   * Both are LABELS. Every value the site supplied was already copied into the fields above, so the
   * draft never reads its project again and a site edited next month cannot reach a request written
   * today. They ride to the backend on submit unchanged.
   */
  projectId?: string | null;
  workOrderGroupId?: string | null;
  /** Set when the flow was opened from a store — submits as DIRECT to that supplier alone. */
  direct?: DirectTarget | null;
}

/** Posted to /api/requests (AC-42/43). Mirrors the shared app request shape. */
/**
 * The single supplier a request is addressed to, when it was started from a store.
 *
 * The app has had this since Epic 008: opening the create flow from a store carries the supplier, and
 * the request is filed as DIRECT rather than broadcast — same form, same endpoint, one recipient. The
 * web now enters through the same door, so `supplierId` here is the app's integer user id, carried as
 * a string only because that is what the store payloads speak.
 */
export interface DirectTarget {
  supplierId: string;
  supplierName: string | null;
  /** The store the renter came from — provenance, and where «back to the store» returns to. */
  storeId: string | null;
}

export interface RfqRequestPayload {
  project: ProjectDetails;
  /** Excludes items flagged not-available / removed (AC-33/34). */
  items: EquipmentItem[];
  preferences: Preferences;
  /**
   * PROJ — the site this was filed under.
   *
   * A LABEL, nothing more. Every value above was already copied into this payload, so the request
   * never reads its project again and a project edit cannot reach it silently.
   *
   * There is no `projectVersion`: the copies ARE the record of what the site's terms were at submit,
   * held in full rather than by reference, so a version number would be a weaker second answer to a
   * question already answered here.
   *
   * `workOrderGroupId` is provenance only — set when the renter started from one — and changes no
   * rendering: a work order also posted as a request is deliberately two rows on the chart.
   */
  projectId?: string | null;
  workOrderGroupId?: string | null;
  /** Present when the flow was opened from a store — the adapter files it as DIRECT to this supplier. */
  direct?: DirectTarget | null;
}

/* ----------------------------- Defaults / factories ----------------------------- */

export function defaultProjectDetails(): ProjectDetails {
  return {
    location: { label: null, confirmed: false },
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null, hoursPerDay: 10 },
    advanced: {
      workingDaysPerWeek: 6,
      overtimeRate: "without",
      equipmentYear: null,
    },
    certificates: { safety: [], safetyOther: "", other: [] },
    deliveryToSite: "me",
    returnFromSite: "me",
    fuelResponsibility: "me",
  };
}

export function defaultPreferences(): Preferences {
  return {
    payment: { terms: null, method: null },
    maintenance: { responsibility: "supplier", sla: null }, // AC-37 default supplier
    additionalNotes: "",
    budgetSar: null,
    supplierFilters: { verifiedOnly: false, sublettingAllowed: false, bidWindow: null },
  };
}

export function defaultOperatorDetails(): OperatorDetails {
  // F.A.T starts UNSPECIFIED (null), not "me". Seeding "me" made every manually added item submit a
  // definite "the renter covers food / accommodation & transport" that the renter never chose — the
  // supplier then prices against a term nobody agreed, and a dispute surfaces after the bid is taken.
  // The app models this as a real third state (`int? _fatFood`, re-tapping a pill clears it) and
  // agent-parsed items here already arrive null; this brings manual items in line with both.
  return { nightShift: false, nationality: null, nationalityCustom: null, certificate: [], certificateOther: null, fatFood: null, fatAccommodationTransport: null };
}

/** Build a blank item (used when the renter adds a missed item — AC-22). */
export function newManualItem(id: string): EquipmentItem {
  return {
    id,
    rawLabel: null,
    rawSize: null,
    ref: { ...EMPTY_REF },
    // Manually added: starts unresolved (Need-OK) with an empty match so the renter picks
    // category → subtype → size; it auto-resolves to Matched once the ref is complete (AC-22).
    verdict: "needs-validation",
    resolved: false,
    removed: false,
    quantity: 1,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    equipmentYear: null, // inherit request-wide year unless overridden
    attachmentIds: [],
    customAttachments: [],
  };
}

/** Recompute the processing summary from the current item list (AC-56). */
export function computeSummary(items: EquipmentItem[]): ProcessingSummary {
  const live = items.filter((i) => !i.removed);
  return {
    totalItems: live.length,
    needsValidation: live.filter((i) => i.verdict === "needs-validation").length,
    notAvailable: live.filter((i) => i.verdict === "no-match").length,
  };
}
