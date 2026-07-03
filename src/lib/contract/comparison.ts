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
  if (dpp === 0) return { value: rate * units, stated: true }; // PER_JOB (no duration concept)
  // The bid's own duration, else the duration the request asked for. With NEITHER we do NOT assume a
  // period — the rental is "not stated" so the UI shows the rate only (no fabricated 1-day total).
  const fb = num(fallbackDays);
  const days = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
  if (days == null) return { value: 0, stated: false };
  return { value: (rate / dpp) * days * units, stated: true };
}

/**
 * Canonical quote math shared by the comparison and the quotation so they never disagree.
 * Rental: PER_JOB → flat rate; else `rate / daysPerPeriod × durationDays` (weekly ÷7, monthly ÷26).
 * `periods` is the period multiplier shown in the breakdown (weeks/months/days; 1 for a job).
 * Mobilization/demobilization are **per-unit** (× units, app/backend parity). VAT 15%.
 * `durationDays` = the bid's own duration, else `fallbackDays`, else 1.
 */
export interface BidQuote {
  units: number;
  days: number;
  periods: number;
  perUnitRental: number;
  rentalSubtotal: number;
  mobTotal: number;
  demobTotal: number;
  subtotalPreVat: number;
  vat: number;
  total: number;
}
export function computeBidQuote(bid: BidCard, opts?: { fallbackDays?: number | null; units?: number }): BidQuote {
  const rate = num(bid.price) ?? 0;
  const units = opts?.units ?? (bid.numberOfUnits || 1);
  const dpp = daysPerPeriod(bid.priceUnit);
  const fb = num(opts?.fallbackDays);
  const days = num(bid.duration) ?? (fb != null && fb > 0 ? fb : 1);
  const periods = dpp === 0 ? 1 : days / dpp;
  const perUnitRental = dpp === 0 ? rate : (rate / dpp) * days;
  const rentalSubtotal = perUnitRental * units;
  const mobTotal = (num(bid.mobPrice) ?? 0) * units;
  const demobTotal = (num(bid.demobPrice) ?? 0) * units;
  const subtotalPreVat = rentalSubtotal + mobTotal + demobTotal;
  const vat = subtotalPreVat * 0.15;
  return { units, days, periods, perUnitRental, rentalSubtotal, mobTotal, demobTotal, subtotalPreVat, vat, total: subtotalPreVat + vat };
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
  // Drive every cost side from the NEGOTIABLE-TERM truth (in-app AND link), so a term the supplier
  // deviates on reads red and one they accept reads green — instead of grey. We read the term state
  // across all term sources (contract / equipment / negotiable) and translate it relative to what the
  // request asked: agreed → same side as the request; conflict → the OTHER side (→ state "red" below);
  // grey/negotiating/absent → not derivable (null).
  const termState = (keys: string[]): string | undefined => {
    const all = [...bid.terms.contract, ...bid.terms.equipment, ...(bid.negotiableTerms ?? [])];
    return all.find((t) => keys.includes(t.key))?.state;
  };
  const sideFromTerm = (keys: string[], requestSide: "supplier" | "me" | null): "supplier" | "me" | null => {
    if (!requestSide) return null;
    const st = termState(keys);
    if (st === "matched" || st === "agreed") return requestSide;
    if (st === "conflict") return requestSide === "supplier" ? "me" : "supplier";
    return null;
  };
  // Maintenance request side: prefer the request-level assignment (opts), else the bid's own requestTerms.
  const rtMaint = bid.requestTerms.maintenanceResponsibility
    ? (/(supplier|مؤجّر)/i.test(bid.requestTerms.maintenanceResponsibility) ? "supplier" : "me")
    : null;
  const maintReqSide = (requestSides.maintenance ?? rtMaint) as "supplier" | "me" | null;
  const bidSides: Record<CostResponsibility["key"], "supplier" | "me" | null> = {
    fuel: sideFromTerm(["fuel_responsibility"], requestSides.fuel ?? null),
    // Maintenance is an acknowledge term (accepted by bidding) → mirror the request's assignment.
    maintenance: sideFromTerm(["maintenance_responsibility", "maintenance"], maintReqSide) ?? maintReqSide,
    overtime: null,
    operator_food: sideFromTerm(["fat_food"], requestSides.operator_food ?? null),
    // in-app uses `fat_accommodation_transport`, link uses `fat_transport` — accept either spelling.
    operator_transport_accommodation: sideFromTerm(["fat_accommodation_transport", "fat_transport"], requestSides.operator_transport_accommodation ?? null),
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
    // AC-12: a renter-entered cost adjusts the comparable total unless the supplier already covers
    // that responsibility (supplier-covered costs aren't the renter's). Unknown/own → counted, so a
    // cost the renter explicitly adds always flows into the total — like the mob/demob estimate.
    const renterAdj = costResponsibilities.reduce((sum, cr) => {
      if (cr.renterCost == null) return sum;
      return cr.bidSide !== "supplier" ? sum + cr.renterCost : sum;
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

/* ---------------------------------------------------------------------------------------------- *
 * Bid-comparison redesign (§6) — display-only helpers. The deterministic quote engine above is
 * unchanged (Week = 7, Month = 26). These shape how a column is *shown* under the RATE-PERIOD and
 * PRICES-FOR toggles, the cost-responsibility chip tone, and per-row winners. No fabricated data.
 * ---------------------------------------------------------------------------------------------- */

/** RATE PERIOD toggle — re-expresses the bid's day-rate in the chosen period (display only). */
export type RatePeriod = "PER_DAY" | "PER_WEEK" | "PER_MONTH";
/** PRICES FOR toggle — show figures for one unit or all the units the supplier bid on. */
export type PricesFor = "unit" | "all";

/**
 * Cost-responsibility chip tone for the comparison (T11): GREEN = the term MATCHES what the request
 * asked (agreed by both), regardless of which side covers it — including a term on YOU. RED = a
 * disagreement. Grey = not provided/derivable. Blue is reserved for cert/ownership "extras" (T12/T13),
 * not cost terms (which are always request-assigned → match or conflict). The owner label (you /
 * supplier) is derived separately from `bidSide`, not from this tone.
 */
export function responsibilityTone(cr: CostResponsibility): "green" | "blue" | "red" | "grey" {
  if (cr.state === "red") return "red";
  if (cr.state === "green") return "green";
  return "grey";
}

export interface DisplayQuote {
  /** Units the figures are priced for (1 when prices-for = unit, else the bid's unit count). */
  units: number;
  /** The bid's day-rate re-expressed in the chosen RATE PERIOD (PER_JOB → flat rate, no conversion). */
  ratePerPeriod: number;
  /** ratePerPeriod × units — the headline "Rental cost" row. */
  rentalForPeriod: number;
  /** (mob + demob) × units. */
  mobDemob: number;
  /** Duration-based rental × units, or null when the request has no duration (§6: shown only then). */
  durationRental: number | null;
  /** durationRental ?? rentalForPeriod, + mobDemob. */
  subtotal: number;
  vat: number;
  total: number;
}

/** Display figures for one bid under the chosen rate-period + prices-for basis (Week 7 / Month 26). */
export function displayQuote(bid: BidCard, period: RatePeriod, pricesFor: PricesFor, fallbackDays?: number | null): DisplayQuote {
  const rate = num(bid.price) ?? 0;
  // "All units" basis = the units THIS supplier offered (unitsOffered), so every cost reflects his chosen
  // quantity (e.g. 5 units → ×5). "Per unit" = ×1. Falls back to the request's units when not stated.
  const units = pricesFor === "all" ? (bid.unitsOffered || bid.numberOfUnits || 1) : 1;
  const dppBid = daysPerPeriod(bid.priceUnit);
  const perDay = dppBid === 0 ? rate : rate / dppBid; // bid rate → per-day basis
  const ratePerPeriod = dppBid === 0 ? rate : perDay * daysPerPeriod(period); // → chosen display period
  const rentalForPeriod = ratePerPeriod * units;
  const mobDemob = ((num(bid.mobPrice) ?? 0) + (num(bid.demobPrice) ?? 0)) * units;
  const fb = num(fallbackDays);
  const durDays = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
  const durationRental = durDays != null && dppBid !== 0 ? perDay * durDays * units : null;
  const base = durationRental ?? rentalForPeriod;
  const subtotal = base + mobDemob;
  const vat = subtotal * 0.15;
  return { units, ratePerPeriod, rentalForPeriod, mobDemob, durationRental, subtotal, vat, total: subtotal + vat };
}

/**
 * Indices of the winning column(s) for a metric. dir "min" = lowest wins (cost/distance), "max" =
 * highest wins (units/year/rating). Nulls are ignored; a tie for the lead → no highlight (§6).
 */
export function rowWinners(values: (number | null | undefined)[], dir: "min" | "max"): Set<number> {
  const valid = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => typeof x.v === "number" && !Number.isNaN(x.v));
  if (valid.length < 2) return new Set();
  const best = dir === "min" ? Math.min(...valid.map((x) => x.v)) : Math.max(...valid.map((x) => x.v));
  const winners = valid.filter((x) => x.v === best);
  return winners.length === 1 ? new Set([winners[0].i]) : new Set(); // ties not highlighted
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
