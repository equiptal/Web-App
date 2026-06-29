/**
 * web-app/007 — the Mansour (agent) judgement layer contract, web side.
 *
 * Mirrors the canonical types in Normalization-Agent `src/types/bid.types.ts` on the
 * `web-app/007-bid-comparison` branch. BOUNDARY: the WEB computes the deterministic comparison
 * (all-in, qualification, +X% — see comparison.ts) and sends `ComputedBid[]`; Mansour adds
 * JUDGEMENT only (rank, pick, tagged reasons, learning). Mansour NEVER returns a money value.
 *
 * Keep these shapes in sync with the agent branch. The BFF (`/api/me/bids/*`) is the transport;
 * `bidColumnToComputed` is the mapper from our engine's BidColumn to the agent's ComputedBid.
 */
import type { BidColumn } from "@/lib/contract/comparison";
import type { BidCard, CertCode } from "@/lib/contract/bids";

export type BidPriceUnit = "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_JOB";
export type BidSource = "app" | "uploaded_quote" | "shared_link";
export type CostParty = "supplier" | "rentee";
export type CostResponsibilityItem = "fuel" | "maintenance" | "overtime" | "operator_food" | "operator_transport_accommodation";
export type TypeSizeMatch = "exact" | "needs_check";

/** One supplier bid, normalized to comparable fields. Monetary fields are STATED only (AC-13). */
export interface NormalizedBid {
  bid_id: string | null;
  source: BidSource;
  supplier_name: string | null;
  supplier_user_id: number | string | null;
  price_amount: number | null;
  price_unit: BidPriceUnit | null;
  mobilization_amount: number | null;
  demobilization_amount: number | null;
  currency: string | null;
  cost_responsibilities: Partial<Record<CostResponsibilityItem, CostParty>>;
  equipment_subtype: string | null;
  equipment_capacity: string | null;
  equipment_year: number | null;
  equipment_condition: string | null;
  fuel_type: string | null;
  certificates: string[];
  type_size_match: TypeSizeMatch;
  type_size_note: string | null;
  valid_until: string | null;
  source_file: string | null;
  notes: string | null;
}

/** A bid AFTER the web computed the deterministic layer — what /bids/recommend consumes. */
export interface ComputedBid extends NormalizedBid {
  all_in_total: number | null;
  qualified: boolean;
  requirement_conflicts: string[];
  percent_vs_lowest: number | null;
}

export type PreferencePreset = "best_overall" | "lowest_cost" | "newest_machine" | "most_trusted";
export interface RankingPreference {
  preset?: PreferencePreset | null;
  free_text?: string | null;
}

export type ReasonTag = "fit" | "cost-shift" | "recency" | "trust" | "history" | "profile";
export interface RecommendationReason {
  tag: ReasonTag;
  text: string;
}
export interface RankedBid {
  bid_id: string | null;
  rank: number;
  recognition: string | null;
}
export interface BidRecommendation {
  pick_bid_id: string | null;
  confidence: number; // 0..1
  reasons: RecommendationReason[];
  cost_shift_flags: string[];
}
export interface RankingMove {
  bid_id: string | null;
  from: number;
  to: number;
}
export interface RankingChange {
  pick_changed: boolean;
  summary: string;
  moves: RankingMove[];
}
/** A context-aware what-if chip Mansour offers for THIS comparison. `message` is sent to /bids/ask;
 * `icon` is a semantic hint (fuel | maintenance | overtime | food | transport | recency | shield | help). */
export interface SuggestedWhatIf {
  label: string;
  message: string;
  icon: string;
}

export interface RecommendResult {
  ranking: RankedBid[];
  recommendation: BidRecommendation;
  interpretation: string | null;
  changes: RankingChange | null;
  suggestions?: SuggestedWhatIf[];
}

/** POST /bids/ask — conversational reply + the (possibly re-ranked) ranking so the web re-renders. */
export interface BidAskResult {
  reply: string;
  ranking: RankedBid[];
  pick_bid_id: string | null;
  confidence: number;
  interpretation: string | null;
  changes: RankingChange | null;
  suggestions?: SuggestedWhatIf[];
}

/**
 * Whether an uploaded quote matches the item + project it's compared against. `needs_confirmation`
 * true → the web shows a confirmation popup listing `warnings`; the bid is surfaced only on confirm.
 */
export interface QuoteMatchCheck {
  type_size: TypeSizeMatch; // exact | needs_check (vs the request item)
  location: "match" | "mismatch" | "unknown"; // vs the request project location
  dates: "match" | "mismatch" | "unknown"; // vs the request rental window
  needs_confirmation: boolean; // any mismatch / needs_check → popup
  warnings: string[]; // human-readable, for the popup body
}

/** parse-failure adds NO bid (AC-27). `match` is present only when there's something to confirm. */
export type BidParseResult = { ok: true; bid: NormalizedBid; match?: QuoteMatchCheck } | { ok: false; reason: string; source_file: string | null };

/** Post-award default-preference nudge (AC-24). */
export interface AwardNudgeResult {
  preset: PreferencePreset;
  message: string;
  support?: number;
  total?: number;
}

/** Behavioral events captured on the comparison page (feeds learning). */
export type BidEventType = "award" | "choice" | "chat_message";
export type BidChoiceKind = "preset" | "rerank" | "hide" | "restore" | "compare" | "negotiate";
export interface BidEventInput {
  event_type: BidEventType;
  request_id?: string | null;
  bid_id?: string | null;
  supplier_id?: string | number | null;
  payload?: Record<string, unknown>;
  session_id?: string | null;
  client_ts?: string | null;
}

/* ----------------------------------- maps ----------------------------------- */

/** Our deterministic preset ↔ the agent's preset enum. */
const PRESET_TO_AGENT: Record<string, PreferencePreset> = {
  best: "best_overall",
  lowest: "lowest_cost",
  newest: "newest_machine",
  trusted: "most_trusted",
};
export function presetToAgent(p: string | null | undefined): PreferencePreset | null {
  return p ? PRESET_TO_AGENT[p] ?? null : null;
}

/** Conflict labels for the agent's reasons — derived from the engine's red rows (stated, no fabrication). */
function conflictLabels(col: BidColumn): string[] {
  const rows = [...col.cost, ...col.equipment, ...col.trust].filter((r) => r.state === "conflict").map((r) => r.labelEn);
  const resp = col.costResponsibilities
    .filter((c) => c.state === "red")
    .map((c) => `${c.labelEn}: request=${c.requestSide === "me" ? "rentee" : c.requestSide}, bid=${c.bidSide === "me" ? "rentee" : c.bidSide}`);
  return [...rows, ...resp];
}

/**
 * Map one engine BidColumn → the agent's ComputedBid. The web owns every monetary/qualification
 * field here; Mansour reads them and never recomputes (AC-13).
 */
export function bidColumnToComputed(col: BidColumn): ComputedBid {
  const b = col.bid;
  const cost_responsibilities: Partial<Record<CostResponsibilityItem, CostParty>> = {};
  for (const cr of col.costResponsibilities) {
    if (cr.bidSide) cost_responsibilities[cr.key] = cr.bidSide === "me" ? "rentee" : "supplier";
  }
  return {
    bid_id: b.id,
    source: "app",
    supplier_name: b.supplierName,
    supplier_user_id: b.supplierId,
    price_amount: b.price,
    price_unit: (b.priceUnit as BidPriceUnit) ?? null,
    mobilization_amount: b.mobPrice,
    demobilization_amount: b.demobPrice,
    currency: "SAR",
    cost_responsibilities,
    equipment_subtype: b.equipment?.model ?? null,
    equipment_capacity: null,
    equipment_year: b.equipment?.year ?? null,
    equipment_condition: null,
    fuel_type: b.requestTerms.fuelType ?? null,
    certificates: b.heldCertCodes,
    type_size_match: col.warnings.typeSizeCheck ? "needs_check" : "exact",
    type_size_note: null,
    valid_until: b.validUntil,
    source_file: null,
    notes: b.note,
    all_in_total: col.allIn.stated ? col.allIn.value : null,
    qualified: col.conflicts === 0,
    requirement_conflicts: conflictLabels(col),
    percent_vs_lowest: col.pctVsLowest,
  };
}

/**
 * Inverse: a parsed off-platform quote (NormalizedBid) → a synthetic BidCard so it flows through the
 * SAME deterministic engine + matrix as app bids (AC-26). Duration/units come from the request item so
 * its all-in is comparable. It carries no request-qualification (terms left empty → grey, not excluded);
 * `source: "uploaded_quote"` is preserved via the id prefix + note so the UI can tag it.
 */
export function normalizedBidToBidCard(nb: NormalizedBid, ctx: { duration: number | null; units: number }): BidCard {
  const maint = nb.cost_responsibilities.maintenance;
  return {
    id: nb.bid_id ?? `upload:${nb.source_file ?? nb.supplier_name ?? "quote"}`,
    status: "PENDING",
    supplierId: nb.supplier_user_id != null ? String(nb.supplier_user_id) : null,
    supplierName: nb.supplier_name ?? "Uploaded quote",
    verified: false,
    rating: null,
    distanceKm: null,
    submittedAt: null,
    validUntil: nb.valid_until,
    price: nb.price_amount,
    mobPrice: nb.mobilization_amount,
    demobPrice: nb.demobilization_amount,
    priceUnit: nb.price_unit,
    duration: ctx.duration,
    numberOfUnits: ctx.units || 1,
    unitsOffered: ctx.units || 1, // uploaded quotes cover the full quantity

    reqMinYear: null,
    equipment: { id: null, make: null, model: nb.equipment_subtype, year: nb.equipment_year, imageUrl: null },
    eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0,
    conflictCount: 0,
    dealRoomId: null,
    expired: false,
    note: nb.notes ?? (nb.source_file ? `From uploaded file: ${nb.source_file}` : "From uploaded file"),
    requiredCerts: [],
    heldCertCodes: nb.certificates as unknown as CertCode[],
    ownershipDocs: [],
    mobLeadTime: null,
    demobLeadTime: null,
    terms: { equipment: [], contract: [], supplier: [] },
    requestTerms: {
      operatorIncluded: null,
      operatorNationality: null,
      fuelType: nb.fuel_type,
      paymentMethod: null,
      paymentTerms: null,
      breakdownResponseSla: null,
      overtimeRate: null,
      maintenanceResponsibility: maint ? (maint === "supplier" ? "supplier" : "renter") : null,
    },
    lockedTerms: [],
    unreadTerms: [],
    progress: { agreed: 0, total: 0 },
    lastEventAr: null,
    round: 1,
    uiState: null,
  } as BidCard;
}
