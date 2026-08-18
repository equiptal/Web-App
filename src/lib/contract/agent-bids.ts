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
import type { BidCard, CertCode, TermRow } from "@/lib/contract/bids";

/** Map a free-text cert token from a parsed quote to a canonical code (mirrors link-bids toCertCode). */
function toCertCode(raw: string): CertCode | null {
  const u = (raw ?? "").toUpperCase();
  if (u.includes("TUV") || u.includes("TÜV")) return "TUV";
  if (u.includes("SPSP")) return "SPSP";
  if (u.includes("SASO")) return "SASO";
  if (u === "LC" || u.includes("LOCAL")) return "LC";
  return null;
}

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
  /** Whether the quoted prices EXCLUDE or INCLUDE 15% VAT, when the quote states it (the agent parses
   *  "Prices exclude 15% VAT" / "شامل ض.ق.م" etc. into this). null when unstated → the verify screen
   *  assumes `excl` and marks it for renter confirmation. */
  vat_mode?: "excl" | "incl" | null;
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
  /** Distance from the supplier to the project site, in km (the value the app shows as "Distance to
   *  site"). The agent ranks proximity + applies `max_distance_km` from this — null when not shared
   *  (e.g. off-platform link bids). Optional: parsed off-platform quotes don't carry it. */
  distance_km?: number | null;
  /** Extra ranking signals the web already has (the agent consumes what's present, ignores the rest). */
  supplier_verified?: boolean | null;
  supplier_rating?: number | null;
  units_offered?: number | null;
  /** Supplier compliance/identity pulled from the quote letterhead/footer (T1) — null when not found.
   *  Legal IDs are ALWAYS renter-verified before commit even when extracted. */
  supplier_cr?: string | null;
  supplier_vat?: string | null;
  supplier_national_address?: string | null;
  supplier_contact?: string | null;
  /** Any OTHER field/clause/fee/condition the quote contains that isn't one of the standard fields or
   *  the 9 canonical terms — the agent emits these (label + value) so NOTHING from the quote is dropped.
   *  Surfaced in the verify screen's "Additional info from the quote" section and carried into the
   *  committed bid. Empty/absent until the agent's /bids/transform populates it (see the handoff). */
  extra_terms?: { label: string; value: string }[];
}

/** The 9 verifiable Yes/No terms on the bid form (mirrors the shared bid form + BidFormDraft). */
export type BidTermKey = "operator" | "nationality" | "fatFood" | "fatTransport" | "fuel" | "fuelType" | "year" | "operatorCert" | "equipmentCert";

/** Per-term signal Mansour emits from /bids/transform: whether the quote satisfies the renter's want.
 *  `unknown` = the quote is silent (or the term has no structured bid field) → the renter must verify. */
export interface TermMatch {
  key: BidTermKey;
  renter_wants: string | null;
  satisfies: "yes" | "no" | "unknown";
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
  needs_confirmation: boolean; // any mismatch / needs_check → popup (still comparable)
  /** TYPE/SIZE mismatch = wrong equipment → popup + DO NOT add the bid (can't compare a forklift to an
   *  excavator). Location mismatch is advisory (popup, still added); dates are informational (never gate). */
  blocking?: boolean;
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
    // Preserve an uploaded quote's origin on the echo so Mansour can tell it apart from an in-app bid
    // when it re-ranks the bids[] we send back. A freshly parsed off-platform quote carries the
    // `upload:` id prefix (see normalizedBidToBidCard) until it's committed into a real bid.
    source: b.id.startsWith("upload:") ? "uploaded_quote" : "app",
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
    // Proximity + trust signals the app already displays → pass them so the agent can rank "closest"
    // and apply the max_distance_km hard filter (previously starved → "distance not shared").
    distance_km: b.distanceKm ?? null,
    supplier_verified: b.verified ?? null,
    supplier_rating: b.rating ?? null,
    units_offered: b.unitsOffered ?? null,
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
export function normalizedBidToBidCard(
  nb: NormalizedBid,
  ctx: { duration: number | null; units: number; reqMinYear?: number | null; requiredCerts?: CertCode[] },
): BidCard {
  const maint = nb.cost_responsibilities.maintenance;
  // Qualify the uploaded quote against the SAME request requirements the in-app bids use (passed in from
  // a reference bid): its declared certs vs the required set, and its year vs the request's minimum. An
  // uploaded file doesn't answer cost/operator terms, so those stay grey (unknown) — this only fills the
  // rows we can honestly derive from the parsed data.
  const certCodes = (nb.certificates ?? []).map(toCertCode).filter((c): c is CertCode => !!c);
  const reqMinYear = ctx.reqMinYear ?? null;
  const requiredCerts = ctx.requiredCerts ?? [];
  const yearTerm: TermRow[] =
    reqMinYear != null && nb.equipment_year != null
      ? [{ key: "year", labelEn: "Year of manufacture", labelAr: "سنة الصنع", state: nb.equipment_year < reqMinYear ? "conflict" : "matched" }]
      : [];
  return {
    id: nb.bid_id ?? `upload:${nb.source_file ?? nb.supplier_name ?? "quote"}`,
    status: "PENDING",
    supplierId: nb.supplier_user_id != null ? String(nb.supplier_user_id) : null,
    supplierCompanyId: null, // an uploaded quote carries no platform company — it groups by its own name
    supplierName: nb.supplier_name ?? "Uploaded quote",
    verified: false,
    rating: null,
    distanceKm: nb.distance_km ?? null,
    submittedAt: null,
    validUntil: nb.valid_until,
    price: nb.price_amount,
    mobPrice: nb.mobilization_amount,
    demobPrice: nb.demobilization_amount,
    priceUnit: nb.price_unit,
    duration: ctx.duration,
    numberOfUnits: ctx.units || 1,
    unitsOffered: ctx.units || 1, // uploaded quotes cover the full quantity

    reqMinYear,
    equipment: { id: null, make: null, model: nb.equipment_subtype, year: nb.equipment_year, imageUrl: null },
    eqVerified: false,
    compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
    matchCount: 0,
    conflictCount: 0,
    dealRoomId: null,
    expired: false,
    // Fold the free-text notes + any non-canonical extra_terms (agent-extracted clauses that don't map
    // to a table field) into one note, so the comparison's "Notes" row surfaces everything the quote had.
    note:
      [nb.notes, ...(nb.extra_terms ?? []).filter((e) => e?.label).map((e) => `${e.label}: ${e.value}`)]
        .filter((s) => s != null && String(s).trim())
        .join(" · ") || (nb.source_file ? `From uploaded file: ${nb.source_file}` : "From uploaded file"),
    requiredCerts,
    heldCertCodes: certCodes,
    equipmentCertCodes: certCodes,
    ownershipDocs: [],
    mobLeadTime: null,
    demobLeadTime: null,
    terms: { equipment: yearTerm, contract: [], supplier: [] },
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
    // An agent-sourced bid has no deal room, so nothing has countered and there is no opening to
    // measure from. Null rather than the bid price: a delta of zero is still a claim that a
    // negotiation happened.
    requestChangedAt: null,
    liveStatus: null,
    openingPrice: null,
    lastCounterBy: null,
    uiState: null,
  } as BidCard;
}
