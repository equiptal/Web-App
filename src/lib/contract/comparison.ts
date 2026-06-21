/**
 * web-app/007 — Bid-comparison procurement workspace: the DETERMINISTIC comparison engine.
 *
 * Turns the bids on one equipment item into comparable columns: an all-in cost built ONLY from the
 * bid's stated data (rate normalized to the rental period + stated mob/demob), requirement
 * qualification (red where a bid conflicts with a request requirement, green where it matches), the
 * five cost-responsibility alignments, an at-a-glance verdict, and the excluded/not-stated/edge
 * flags. No agent scoring, no fabricated values — every number here is stated data or deterministic
 * math on it (AC-09/10/11/12/13/35). The Mansour judgement layer (pick/chat/learning) is deferred.
 */
import type { BidCard, TermRow } from "@/lib/contract/bids";

/** Working days in one billing period for the bid's price unit (a month = 26 working days, not 30
 *  calendar days). PER_JOB → 0 (a single job, no period count). */
export function daysPerPeriod(unit: string | null): number {
  switch ((unit ?? "PER_DAY").toUpperCase()) {
    case "PER_WEEK": return 7;
    case "PER_MONTH": return 26;
    case "PER_JOB": return 0;
    default: return 1; // PER_DAY
  }
}

/** A cost figure that may be unknown — distinguishes a real 0 from "the bid didn't state it" (AC-10). */
export type Money = { value: number; stated: boolean };

/** One of the five cost-responsibility items (AC-11). */
export interface CostResponsibility {
  key: "fuel" | "maintenance" | "overtime" | "operator_food" | "operator_transport_accommodation";
  labelEn: string;
  labelAr: string;
  /** "supplier" | "me" | null (not provided). The bid's stated side. */
  bidSide: "supplier" | "me" | null;
  /** What the request assigned, when known. */
  requestSide: "supplier" | "me" | null;
  /** green = aligned, red = conflict either way, grey = not provided / unknown. */
  state: "green" | "red" | "grey";
  /** A renter-entered expected cost when this responsibility lands on the renter (AC-12). */
  renterCost?: number;
}

export interface BidColumn {
  bid: BidCard;
  /** All-in built from stated data: rate normalized to the period + stated mob/demob (AC-09). */
  allIn: Money;
  /** rental portion only (normalized rate × periods × units), for the line breakdown. */
  rental: Money;
  mob: Money;
  demob: Money;
  /** Cash due upfront, derived from payment terms + stated data (AC-09). */
  cashUpfront: Money;
  /** +X% vs the lowest all-in in the item (0 for the lowest). null when no comparable total. */
  pctVsLowest: number | null;
  isLowest: boolean;
  /** Per-cell qualification rows (red/green/grey), grouped Cost / Equipment / Trust (AC-05/08). */
  cost: TermRow[];
  equipment: TermRow[];
  trust: TermRow[];
  costResponsibilities: CostResponsibility[];
  /** Conflict count → the at-a-glance verdict (AC-06). */
  conflicts: number;
  /** Fails EVERY requirement the request set → excluded chip (AC-16/33). */
  excluded: boolean;
  /** Edge warnings (AC-36/39): "type/size needs check", "no longer active". */
  warnings: { typeSizeCheck: boolean; listingInactive: boolean };
}

const REQ_CONFLICT: TermRow["state"][] = ["conflict"];
const REQ_DECLARED: TermRow["state"][] = ["matched", "conflict", "agreed", "negotiating"];

/** A row counts as a *requirement the renter set* when it's declared (not grey). */
function isRequirement(r: TermRow): boolean {
  return REQ_DECLARED.includes(r.state);
}

const num = (v: number | null | undefined): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

/**
 * Normalized rental for a bid: per-unit rate brought to a per-day basis, × duration days × units.
 * PER_JOB (dpp 0) is the rate × units (one job). When duration is unknown the rental is "not stated"
 * (the UI shows the per-unit rate + a prompt instead — AC-35).
 */
function computeRental(bid: BidCard, fallbackDays?: number | null): Money {
  const rate = num(bid.price);
  const units = bid.numberOfUnits || 1;
  if (rate == null) return { value: 0, stated: false };
  const dpp = daysPerPeriod(bid.priceUnit);
  if (dpp === 0) return { value: rate * units, stated: true }; // PER_JOB
  // The bid's own duration, else the duration the request asked for; if neither, default to ONE rental
  // period (rate × units) — same fallback as the deal room (periods ?? 1) so the totals stay consistent.
  const fb = num(fallbackDays);
  const days = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null) ?? dpp;
  return { value: (rate / dpp) * days * units, stated: true };
}

/** Cash due upfront from the bid's payment terms + stated data (deterministic, AC-09). */
function computeCashUpfront(bid: BidCard, rental: Money, mob: Money): Money {
  const terms = (bid.requestTerms.paymentTerms ?? "").toLowerCase();
  const rate = num(bid.price);
  const units = bid.numberOfUnits || 1;
  const mobV = mob.stated ? mob.value : 0;
  if (terms.includes("upfront")) {
    // whole rental + mob due upfront
    return rental.stated ? { value: rental.value + mobV, stated: true } : { value: 0, stated: false };
  }
  if (terms.includes("per_day") || terms.includes("daily")) {
    // mobilization + the first billing period
    return rate == null ? { value: 0, stated: false } : { value: mobV + rate * units, stated: true };
  }
  // net_30 / net_60 / end_of_job → only mobilization is due upfront
  return mob.stated ? { value: mobV, stated: true } : { value: 0, stated: false };
}

/** The five cost-responsibility alignments, from the bid's request-terms vs the request assignment. */
function buildCostResponsibilities(bid: BidCard, requestSides: Partial<Record<CostResponsibility["key"], "supplier" | "me">>): CostResponsibility[] {
  const rt = bid.requestTerms;
  // Where derivable from BidCard; otherwise null (not provided — no fabrication).
  const bidSides: Record<CostResponsibility["key"], "supplier" | "me" | null> = {
    fuel: null, // fuel responsibility isn't on the bid card today → not provided
    maintenance: rt.maintenanceResponsibility ? (/(supplier|مؤجّر)/i.test(rt.maintenanceResponsibility) ? "supplier" : "me") : null,
    overtime: null,
    operator_food: null,
    operator_transport_accommodation: null,
  };
  const meta: { key: CostResponsibility["key"]; en: string; ar: string }[] = [
    { key: "fuel", en: "Fuel", ar: "الوقود" },
    { key: "maintenance", en: "Maintenance", ar: "الصيانة" },
    { key: "overtime", en: "Overtime", ar: "العمل الإضافي" },
    { key: "operator_food", en: "Operator food", ar: "طعام المشغّل" },
    { key: "operator_transport_accommodation", en: "Operator transport & accommodation", ar: "تنقّل وسكن المشغّل" },
  ];
  return meta.map((m) => {
    const bidSide = bidSides[m.key];
    const requestSide = requestSides[m.key] ?? null;
    let state: CostResponsibility["state"] = "grey";
    if (bidSide && requestSide) state = bidSide === requestSide ? "green" : "red";
    return { key: m.key, labelEn: m.en, labelAr: m.ar, bidSide, requestSide, state };
  });
}

/** Is the listing no longer active? (AC-39) — bid lifecycle terminal states stand in until the API flags it. */
function isListingInactive(bid: BidCard): boolean {
  return bid.status === "WITHDRAWN" || bid.expired === true;
}

export interface BuildOptions {
  /** Renter-entered expected costs for responsibilities that land on them (AC-12), keyed by responsibility. */
  renterCosts?: Partial<Record<CostResponsibility["key"], number>>;
  /** The request's cost-responsibility assignments, when known. */
  requestResponsibilities?: Partial<Record<CostResponsibility["key"], "supplier" | "me">>;
  /** The rental duration the request asked for (days) — used when a bid omits its own duration. */
  requestDurationDays?: number | null;
}

/**
 * Build the comparison for ONE item from its bids. Filters to the latest live round per supplier
 * (AC-38), computes each column, the lowest-cost baseline + +X% (AC-09), and the excluded set (AC-16).
 */
export function buildItemComparison(rawBids: BidCard[], opts: BuildOptions = {}): { columns: BidColumn[]; excluded: BidColumn[] } {
  // AC-38: only live (pending/negotiating) bids; one row per supplier = its latest round.
  const live = rawBids.filter((b) => b.status !== "EXPIRED" && b.status !== "WITHDRAWN" && !b.expired);
  const latestBySupplier = new Map<string, BidCard>();
  for (const b of live) {
    const key = b.supplierId ?? b.supplierName;
    const prev = latestBySupplier.get(key);
    if (!prev || (b.round ?? 1) >= (prev.round ?? 1)) latestBySupplier.set(key, b);
  }
  const bids = [...latestBySupplier.values()];

  const columns: BidColumn[] = bids.map((bid) => {
    const rental = computeRental(bid, opts.requestDurationDays);
    const mob: Money = { value: num(bid.mobPrice) ?? 0, stated: num(bid.mobPrice) != null };
    const demob: Money = { value: num(bid.demobPrice) ?? 0, stated: num(bid.demobPrice) != null };
    const allInStated = rental.stated; // mob/demob optional; a missing rental means no full total
    const allInValue = (rental.stated ? rental.value : 0) + (mob.stated ? mob.value : 0) + (demob.stated ? demob.value : 0);
    const allIn: Money = { value: allInValue, stated: allInStated };
    const cashUpfront = computeCashUpfront(bid, rental, mob);

    const costResponsibilities = buildCostResponsibilities(bid, opts.requestResponsibilities ?? {}).map((cr) => {
      const renterCost = opts.renterCosts?.[cr.key];
      return renterCost != null ? { ...cr, renterCost } : cr;
    });
    // AC-12: a renter-entered cost adjusts the comparable total ONLY for a responsibility that lands
    // on the renter for this bid (supplier-covered responsibilities aren't the renter's cost).
    const renterAdj = costResponsibilities.reduce((sum, cr) => {
      if (cr.renterCost == null) return sum;
      const onRenter = cr.bidSide === "me" || (cr.bidSide == null && cr.requestSide === "me");
      return onRenter ? sum + cr.renterCost : sum;
    }, 0);
    if (renterAdj > 0 && allIn.stated) allIn.value += renterAdj;

    const cost = bid.terms.contract; // payment/sla/overtime/maintenance compare rows
    const equipment = bid.terms.equipment; // measurement/certs/year/fuel/operator/attachments
    const trust = bid.terms.supplier; // CR/VAT/national-address docs
    const allRows = [...cost, ...equipment, ...trust];
    const conflicts = allRows.filter((r) => REQ_CONFLICT.includes(r.state)).length +
      costResponsibilities.filter((c) => c.state === "red").length;
    const requirements = allRows.filter(isRequirement);
    const excludedFlag = requirements.length > 0 && requirements.every((r) => r.state === "conflict");

    return {
      bid,
      allIn,
      rental,
      mob,
      demob,
      cashUpfront,
      pctVsLowest: null, // filled below once the baseline is known
      isLowest: false,
      cost,
      equipment,
      trust,
      costResponsibilities,
      conflicts,
      excluded: excludedFlag,
      warnings: {
        // type/size "needs check": measurement row is grey (can't verify) — display only, never auto-excluded (AC-36 display side)
        typeSizeCheck: equipment.some((r) => r.key === "measurement" && r.state === "grey"),
        listingInactive: isListingInactive(bid),
      },
    };
  });

  // +X% vs lowest among columns with a stated all-in (AC-09). Excluded bids don't set the baseline.
  const totals = columns.filter((c) => !c.excluded && c.allIn.stated).map((c) => c.allIn.value);
  const lowest = totals.length ? Math.min(...totals) : null;
  for (const c of columns) {
    if (lowest != null && c.allIn.stated && !c.excluded) {
      c.isLowest = c.allIn.value === lowest;
      c.pctVsLowest = lowest > 0 ? Math.round(((c.allIn.value - lowest) / lowest) * 100) : 0;
    }
  }

  return {
    columns: columns.filter((c) => !c.excluded),
    excluded: columns.filter((c) => c.excluded),
  };
}

/** The at-a-glance verdict label inputs (AC-06) — the UI renders the string with its own i18n. */
export function verdictConflicts(col: BidColumn): number {
  return col.conflicts;
}

/** Deterministic preset sort (AC-20 web side) — no agent scoring. */
export type Preset = "best" | "lowest" | "newest" | "trusted";
export function sortByPreset(cols: BidColumn[], preset: Preset): BidColumn[] {
  const out = [...cols];
  const allInOf = (c: BidColumn) => (c.allIn.stated ? c.allIn.value : Number.POSITIVE_INFINITY);
  const yearOf = (c: BidColumn) => c.bid.equipment?.year ?? 0;
  const trustOf = (c: BidColumn) => (c.bid.verified ? 1000 : 0) + (c.bid.rating ?? 0);
  switch (preset) {
    case "lowest": out.sort((a, b) => allInOf(a) - allInOf(b)); break;
    case "newest": out.sort((a, b) => yearOf(b) - yearOf(a)); break;
    case "trusted": out.sort((a, b) => trustOf(b) - trustOf(a)); break;
    case "best":
      // composite: fewest conflicts, then lowest all-in (deterministic; no agent weighting)
      out.sort((a, b) => a.conflicts - b.conflicts || allInOf(a) - allInOf(b));
      break;
  }
  return out;
}
