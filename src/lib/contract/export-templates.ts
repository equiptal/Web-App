/**
 * Custom bid-comparison export templates — contract + payload builder.
 *
 * A renter uploads their company's own .xlsx comparison sheet once; from then on they can
 * export any comparison INTO that sheet. The backend maps the template with Claude ONCE at
 * upload (the user reviews the result), and every export after that is deterministic code.
 *
 * Backend: Moedatech-App `apps/backend/src/services/export-templates/`.
 * Design + handoff: docs/implementation-plans/web-export-templates/ in that repo.
 *
 * ── Why the WEB sends the figures ────────────────────────────────────────────────────
 * The comparison maths lives only here (`buildItemComparison`, `computeRental`, `allIn`,
 * `pctVsLowest`, the TermRow state machine). The backend has none of it. If it re-derived
 * them, the exported sheet could disagree with the screen the user just approved — the
 * worst failure this feature has. So: what the user SAW we send; what they did not see
 * (supplier/renter CR/VAT and other identity) the server resolves and we cannot override.
 */

import type { BidColumn, Money } from "./comparison";
import type { RecommendResult } from "./agent-bids";

/* ─────────────────────────────────────── types ─────────────────────────────────────── */

export type TemplateStatus = "mapping" | "needs_review" | "ready" | "failed";

export interface ExportTemplateSummaryRow {
  id: string;
  name: string;
  status: TemplateStatus;
  originalFileName: string;
  createdByUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExportTemplateList {
  templates: ExportTemplateSummaryRow[];
  /** Whether these are shared with the user's company or private to them. */
  scope: "company" | "personal";
}

/** One template cell the mapper could not fill, with its best candidate. */
export interface TheirsUnfilledRow {
  cell: string;
  theirLabel: string;
  candidate: string | null;
  candidateLabel: string | null;
  /** The transforms accepting this candidate will apply, in order. */
  candidateDerivations?: string[] | null;
  confidence: number;
  why: string;
  resolved: boolean;
}

/** One of our visible fields with no home in the template. */
export interface OursNoHomeRow {
  field: string;
  label: string;
  candidateCell: string | null;
  /**
   * The mapper's argument: the closest thing it found, and why that is not this field.
   *
   * Shown because "no place for this" without a reason is unarguable — the user cannot tell a
   * correct call from a lazy one. Null on templates mapped before the mapper was required to
   * justify itself, and on fields displaced by the user's own correction.
   */
  why?: string | null;
  resolved: boolean;
}

export interface ReconciliationView {
  templateId: string;
  name: string;
  status: TemplateStatus;
  sheet?: string;
  supplierCapacity?: number;
  theirsUnfilled: TheirsUnfilledRow[];
  oursNoHome: OursNoHomeRow[];
  unresolvedCount: number;
  mappingError?: string | null;
  /**
   * Fields this saved mapping points at that no longer exist. The template predates a change on
   * our side, and those cells will export blank until it is re-uploaded.
   */
  staleFields?: string[];
}

/**
 * How the user chose to fill a cell we could not.
 *
 * The agent PROPOSES a candidate; only the user applies it. A confident-but-wrong match
 * written straight into a procurement document is worse than a blank cell.
 */
export type UnfilledResolution =
  /**
   * `derivations` is an ordered CHAIN, matching the backend. A cell headed
   * "Rate/day (excl. VAT)" fed from a monthly VAT-inclusive quote needs
   * ["rate.perDay","vat.exclude"] — one transform could only ever do half of it.
   *
   * For `acceptCandidate` the backend prefers the chain the mapper already worked out
   * (`candidateDerivations` on the stored spec), so ["identity"] here is a safe default
   * rather than an override.
   */
  | { kind: "acceptCandidate"; derivations: string[] }
  | { kind: "mapTo"; field: string; derivations: string[] }
  | { kind: "constant"; value: string }
  | { kind: "promptAtExport"; label: string }
  | { kind: "notStated" }
  | { kind: "byHand" };

export type NoHomeResolution =
  | { kind: "drop" }
  | { kind: "mapToCell"; cell: string; derivations: string[] }
  | { kind: "overflow" };

/* ───────────────────────── the sheet view (the review grid) ────────────────────────── */

/**
 * One cell of the user's OWN template, annotated with what an export will do to it.
 *
 * Resolved server-side. Header cells are absolute, but supplier cells are offsets from an
 * anchor repeated on a stride — the same arithmetic the renderer does. A second copy of that
 * in the browser would be a second thing to keep correct, and when the two drift the review
 * shows one layout while the downloaded file contains another.
 */
export interface SheetCellView {
  ref: string;
  /** 1-based, so the grid lays out without re-parsing A1 refs. */
  r: number;
  c: number;
  /** Their text. Empty for a blank write target — which is most cells we fill. */
  value: string;
  bold?: boolean;
  /**
   * - `label`    — their own text; untouched.
   * - `filled`   — we write here on every export.
   * - `unfilled` — the mapper could not decide; needs an answer.
   * - `formula`  — theirs and protected; overwriting would break their totals.
   */
  kind: "label" | "filled" | "unfilled" | "formula";
  field?: string;
  fieldLabel?: string;
  derivations?: string[];
  /** Which column of the supplier repeat this is (0-based), when applicable. */
  supplierIndex?: number;
  /**
   * What an export of the CURRENT comparison actually writes here.
   *
   * Present only when a comparison was sent. `null` means we write nothing and their template
   * keeps what it had — which the grid must distinguish from "we never asked".
   */
  previewValue?: string | number | boolean | null;
  /**
   * For an answered cell: what it now does, in plain English — "Supplier name",
   * `always "N/A"`, "you fill this in". Named so the grid can say what the export will do
   * rather than merely that a question was closed.
   */
  resolvedAs?: string | null;
  unfilled?: {
    theirLabel: string;
    candidate: string | null;
    candidateLabel: string | null;
    candidateDerivations: string[] | null;
    confidence: number;
    why: string;
    resolved: boolean;
  };
}

export interface SheetView {
  sheet: string;
  rowCount: number;
  colCount: number;
  cells: SheetCellView[];
  /**
   * Merged ranges ("A19:B21"), drawn as one cell.
   *
   * exceljs reports a merge's value in EVERY cell it covers, so ignoring these renders
   * "Prepared By:" four times across two columns and three rows — the user's own template
   * looking like corrupted output.
   */
  merges?: string[];
  supplierBlock?: { anchor: string; axis: string; stride: number; sampleCount: number };
}

/**
 * A correction to a cell the mapper already filled. `field: null` clears it.
 *
 * Without this the review is only half a review: the user could answer what the mapper was
 * unsure about but not fix what it was confidently wrong about — and a wrong figure under
 * someone else's heading is worse than a blank, because nothing flags it.
 */
export interface MappedCorrection {
  field: string | null;
  derivations?: string[];
}

export interface BlankCell {
  cell: string;
  label: string;
  reason: "unresolved" | "notStated" | "byHand" | "noData" | "missingPromptValue";
}

/** What the pre-flight panel renders before the user commits to a download. */
export interface PreflightSummary {
  sheet: string;
  supplierColumns: number;
  templateCapacity: number;
  insertedColumns: number;
  omittedSuppliers: string[];
  filledCells: number;
  blankCells: BlankCell[];
  droppedFields: Array<{ field: string; label: string }>;
}

export interface ExportResult {
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
  summary: PreflightSummary;
}

export type RankingSource =
  | "agent"
  | "preset:best"
  | "preset:lowest"
  | "preset:newest"
  | "preset:trusted";

export interface ExportPayload {
  requestId: string;
  itemId?: string | null;
  header: Record<string, unknown>;
  suppliers: Array<{ bidId: string; fields: Record<string, unknown> }>;
  rankingSource: RankingSource;
  lang?: "en" | "ar";
  durationDays?: number | null;
  units?: number | null;
  promptValues?: Record<string, string>;
}

/* ──────────────────────────────── the payload builder ──────────────────────────────── */

/**
 * `Money` travels WITH its `stated` flag — never flattened to a number.
 *
 * `stated: false` means "the supplier didn't say" and its `value` is 0. Flattened, the sheet
 * prints SAR 0, which in a document going to finance reads as "this costs nothing" rather
 * than "unknown". The backend treats `stated: false` as unavailable and leaves the cell
 * blank. A genuinely stated zero (free delivery) still writes 0.
 */
function money(m: Money | null | undefined): Money | undefined {
  return m ? { value: m.value, stated: m.stated } : undefined;
}

/** The rate period this supplier quoted in — per supplier, not per export. */
function rateUnitOf(col: BidColumn): string | undefined {
  const unit = col.bid.priceUnit;
  if (!unit) return undefined;
  const u = String(unit).toUpperCase();
  if (u.includes("HOUR")) return "hour";
  if (u.includes("WEEK")) return "week";
  if (u.includes("MONTH")) return "month";
  if (u.includes("JOB")) return "job";
  return "day";
}

export interface BuildExportPayloadInput {
  requestId: string;
  itemId?: string | null;
  /** In the order shown on screen — the backend assigns `rank` from this order. */
  columns: BidColumn[];
  /** Totals as the workspace computed them, keyed by bid id. */
  totals: Record<string, { grandTotal?: Money; mobDemob?: Money }>;
  header: {
    requestDisplayId?: string | null;
    itemName?: string | null;
    location?: string | null;
    durationDays?: number | null;
    units?: number | null;
  };
  rankingSource: RankingSource;
  /** The agent's result, when one is live. Gates the recommendation — see below. */
  rec?: RecommendResult | null;
  /** True only when the agent is actually live (not merely present from an earlier run). */
  agentLive: boolean;
  lang: "en" | "ar";
  promptValues?: Record<string, string>;
}

/**
 * Decide whether we may claim a recommendation, and for whom.
 *
 * **Deliberately does NOT use `pickId`.** That variable falls back to `cols[0]` — the
 * top-ranked column — whenever the agent is offline, and the built-in export already renders
 * that as "★ AI pick". In our own sheet that is a cosmetic mislabel. Written into a customer
 * cell headed "Recommended quote" that goes to finance for sign-off, it asserts a
 * recommendation nobody made.
 *
 * `rank` is unaffected and always sent: rank is the displayed ORDER, which is honest under
 * any ranking source. "Recommended" is a CLAIM, and a claim needs a claimant.
 */
export function resolveRecommendation(
  columns: BidColumn[],
  rec: RecommendResult | null | undefined,
  agentLive: boolean
): { name: string; confidencePct: number | null; reasons: string[] } | null {
  if (!agentLive || !rec?.recommendation) return null;

  const pickId = rec.recommendation.pick_bid_id;
  if (pickId == null) return null;

  const col = columns.find((c) => String(c.bid.id) === String(pickId));
  if (!col) return null; // the pick is not among the bids being exported

  const raw = rec.recommendation.confidence;
  return {
    name: col.bid.supplierName,
    // The agent reports 0..1; the catalogue field is a percentage.
    confidencePct: typeof raw === "number" ? Math.round(raw * 100) : null,
    reasons: (rec.recommendation.reasons ?? []).map((r) => r.text).filter(Boolean),
  };
}

/**
 * Turn the on-screen comparison into the export payload.
 *
 * Only catalogue keys the backend knows are sent; anything else is dropped there anyway, and
 * a wrong-shaped value silently becomes a blank cell rather than a guess — so the shapes here
 * are deliberately exact.
 */
export function buildExportPayload(input: BuildExportPayloadInput): ExportPayload {
  const {
    requestId, itemId, columns, totals, header, rankingSource, rec, agentLive, lang, promptValues,
  } = input;

  const recommendation = resolveRecommendation(columns, rec, agentLive);

  const headerFields: Record<string, unknown> = {
    requestDisplayId: header.requestDisplayId ?? undefined,
    itemName: header.itemName ?? undefined,
    location: header.location ?? undefined,
    durationDays: header.durationDays ?? undefined,
    units: header.units ?? undefined,
    exportDate: new Date().toISOString(),
    // Omitted entirely when there is no live recommendation — the backend then leaves the
    // "Recommended quote" cell blank rather than naming the top-ranked bid.
    ...(recommendation
      ? {
          recommendedSupplierName: recommendation.name,
          recommendationConfidence: recommendation.confidencePct ?? undefined,
          recommendationReasons: recommendation.reasons,
        }
      : {}),
  };

  const suppliers = columns.map((col) => {
    const t = totals[String(col.bid.id)] ?? {};
    const k = col.bid.compliance;
    const companyDocs: string[] = [];
    if (k?.localContent) companyDocs.push("Local Content");
    if (k?.saso) companyDocs.push("SASO");
    if (k?.activityLicense) companyDocs.push("Activity license");
    if (k?.taxNumber) companyDocs.push("Tax number");
    if (k?.nationalAddress) companyDocs.push("National address");

    return {
      bidId: String(col.bid.id),
      fields: {
        supplierName: col.bid.supplierName,
        verified: Boolean(col.bid.verified),
        grandTotalInclVat: money(t.grandTotal),
        rentalRate: col.bid.price != null ? { value: col.bid.price, stated: true } : undefined,
        rateUnit: rateUnitOf(col),
        rentalTotal: money(col.rental),
        mobilizationTotal: money(col.mob),
        demobilizationTotal: money(col.demob),
        mobDemobTotal: money(t.mobDemob),
        allIn: money(col.allIn),
        cashUpfront: money(col.cashUpfront),
        pctVsLowest: col.pctVsLowest ?? undefined,
        isLowest: col.isLowest,
        // "label:side" pairs — the backend renders each side in the reader's language.
        costResponsibilities: (col.costResponsibilities ?? []).map(
          (r) => `${lang === "ar" ? r.labelAr : r.labelEn}:${r.bidSide}`
        ),
        equipmentYear: col.bid.equipment?.year ?? undefined,
        distanceKm: col.bid.distanceKm != null ? Math.round(col.bid.distanceKm) : undefined,
        equipmentCerts: col.bid.equipmentCertCodes ?? [],
        ownershipDocs: (col.bid.ownershipDocs ?? []).map((d) => (lang === "ar" ? d.labelAr : d.labelEn)),
        operatorCertDeclared: col.bid.operatorCertDeclared ?? undefined,
        companyDocs,
        docLocalContent: Boolean(k?.localContent),
        docSaso: Boolean(k?.saso),
        docActivityLicense: Boolean(k?.activityLicense),
        docTaxNumber: Boolean(k?.taxNumber),
        docNationalAddress: Boolean(k?.nationalAddress),
      },
    };
  });

  return {
    requestId,
    itemId: itemId ?? null,
    header: headerFields,
    suppliers,
    rankingSource,
    lang,
    durationDays: header.durationDays ?? null,
    units: header.units ?? null,
    promptValues,
  };
}

/**
 * The ranking source, derived the same way the workspace decides its order.
 *
 * `BidComparisonWorkspace` is explicit that the four presets are ALWAYS a deterministic web
 * sort, and the agent order applies ONLY when a free-text Ask-AI query is active. Reporting
 * this honestly matters: the sheet can then say "ranked by lowest total cost", which is
 * defensible in a way an unattributed ordering is not.
 */
export function rankingSourceOf(
  preset: string,
  freeApplied: string,
  agentLive: boolean,
  hasAgentRanking: boolean
): RankingSource {
  if (freeApplied && agentLive && hasAgentRanking) return "agent";
  const p = ["best", "lowest", "newest", "trusted"].includes(preset) ? preset : "best";
  return `preset:${p}` as RankingSource;
}
