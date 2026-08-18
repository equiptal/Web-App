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
import { computeQuoteTotals, computeRentalTotal, rentalDivisor } from "@/lib/pricing/rental";

/** Working days in one billing period (month = 26, week = **6** — Friday is the weekend). PER_JOB → 0.
 *  Delegates to the shared pricing module: this used to return 7 for a week, so the same bid priced
 *  differently here than in the mobile app. @see src/lib/pricing/rental.ts */
export function daysPerPeriod(unit: string | null): number {
  return rentalDivisor(unit);
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
 * `durationDays` = the bid's own duration, else `fallbackDays`, else **one full period** — when the
 * duration is unknown we do NOT prorate (periods=1, rate shown as-is), so a monthly rate with no
 * duration reads "24,000/month × 1", not a misleading "× 0.04" (≈1 day ÷ 26).
 */
export interface BidQuote {
  units: number;
  days: number;
  periods: number;
  perUnitRental: number;
  /** Days actually charged (duration − Fridays) — the "(N days)" caption on the rental row. */
  billableDays: number;
  /** Proration landed exactly on the quoted rate. With a single unit the card drops its rental row:
   *  the headline already shows the real total, so the row would restate it. */
  rentalExact: boolean;
  rentalSubtotal: number;
  mobTotal: number;
  demobTotal: number;
  subtotalPreVat: number;
  vat: number;
  total: number;
  /**
   * The same money, PER UNIT — what the app's breakdown rows state (`price_expanded_breakdown.dart`).
   *
   * Every row above is all-units; every row the bid card draws is per-unit, and a multi-unit offer
   * states the all-units figure once, as its own "Overall total" line. Both were already computed
   * here — only the all-units half was returned, so the card had to divide back out or toggle between
   * two bases. Returning both is what lets the rows and the overall line be one calculation.
   */
  perUnit: { rental: number; mob: number; demob: number; subtotal: number; vat: number; total: number };
}
export function computeBidQuote(
  bid: BidCard,
  /** `startDate` is what lets the rental exclude Fridays (mobile parity). Without it the rental falls
   *  back to the raw rate rather than a Friday-blind proration that would overstate the total. */
  opts?: { fallbackDays?: number | null; units?: number; startDate?: string | null },
): BidQuote {
  const rate = num(bid.price) ?? 0;
  // Live deal-room rental count (app parity: v3_bid_card `_liveRentalUnits`) — the negotiated count wins
  // so the card price tracks the deal room; falls back to the offered/requested count. An explicit
  // opts.units (comparison unit toggle) still overrides.
  const liveUnits =
    (bid.agreedUnits != null && bid.agreedUnits > 0) ? bid.agreedUnits
    : (bid.currentRentalUnits != null && bid.currentRentalUnits > 0) ? bid.currentRentalUnits
    : (bid.unitsOffered && bid.unitsOffered > 0) ? bid.unitsOffered
    : (bid.numberOfUnits || 1);
  const units = opts?.units ?? liveUnits;
  const dpp = rentalDivisor(bid.priceUnit);
  const fb = num(opts?.fallbackDays);
  // No stated duration and no request fallback → ONE FULL PERIOD at exactly the quoted rate.
  // Never default to a single day: on a weekly/monthly bid that reads as a near-zero total.
  const stated = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
  const days = stated ?? (dpp || 1);
  // Friday-excluded proration, shared with the deal room and the quotation.
  //
  // `null`, NOT the synthesised one-period `days`, when no duration was stated: feeding the divisor back
  // in as a window makes the module strike that window's Fridays out of a period nobody booked, so a
  // monthly bid on an open request came back at 22⁄26 of its own rate. The app's open-deal branch
  // (`rentalLineTotal`, `durationDays == null`) returns the bare rate outright, and so must this.
  const rental = computeRentalTotal({ rate, priceUnit: bid.priceUnit, startDate: opts?.startDate, durationDays: stated });
  const perUnitRental = rental.total;
  // Periods are counted in BILLABLE days once proration ran, so the "× N periods" caption matches the
  // money beside it; an un-prorated (raw-rate) quote is one period by definition.
  const periods = dpp === 0 || rental.raw ? 1 : rental.billable / dpp;
  // Mob/demob carry their OWN counts + exclusion (app parity), capped ≤ rental.
  const t = computeQuoteTotals({
    perUnitRental,
    rentalUnits: units,
    mob: { amount: num(bid.mobPrice) ?? 0, units: bid.mobUnits, excluded: bid.mobExcluded },
    demob: { amount: num(bid.demobPrice) ?? 0, units: bid.demobUnits, excluded: bid.demobExcluded },
  });
  return {
    units, days, periods, perUnitRental,
    billableDays: rental.raw ? 0 : rental.billable,
    rentalExact: rental.exact,
    rentalSubtotal: t.overall.rental, mobTotal: t.overall.mob, demobTotal: t.overall.demob,
    subtotalPreVat: t.overall.subtotal, vat: t.overall.vat, total: t.overall.total,
    perUnit: t.perUnit,
  };
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
  const termRowOf = (keys: string[]): TermRow | undefined => {
    const all = [...bid.terms.contract, ...bid.terms.equipment, ...(bid.negotiableTerms ?? [])];
    return all.find((t) => keys.includes(t.key));
  };
  // A deal-room agreed VALUE tells us who ended up responsible — parse the settled value into a side
  // (e.g. "supplier"/"included"/"yes" → supplier; "rentee"/"excluded"/"no" → me). Null when unclear.
  const sideFromValue = (v: string | null | undefined): "supplier" | "me" | null => {
    if (!v) return null;
    const t = v.toLowerCase();
    if (/(supplier|مؤجّر|مورد|included|includes|provided|\byes\b)/.test(t)) return "supplier";
    if (/(rentee|renter|\bme\b|\byou\b|excluded|not included|\bno\b|self|أنت|مستأجر|عليك)/.test(t)) return "me";
    return null;
  };
  const sideFromTerm = (keys: string[], requestSide: "supplier" | "me" | null): "supplier" | "me" | null => {
    if (!requestSide) return null;
    const t = termRowOf(keys);
    const st = t?.state;
    // Agreed in the deal room: honor the SETTLED value (an accept can flip the side); fall back to the
    // request side only when the value doesn't clearly name a party.
    if (st === "agreed") return sideFromValue(t?.value) ?? requestSide;
    if (st === "matched") return requestSide;
    if (st === "conflict") return requestSide === "supplier" ? "me" : "supplier";
    return null;
  };
  // Maintenance request side: prefer the request-level assignment (opts), else the bid's own requestTerms.
  const rtMaint = bid.requestTerms.maintenanceResponsibility
    ? (/(supplier|مؤجّر)/i.test(bid.requestTerms.maintenanceResponsibility) ? "supplier" : "me")
    : null;
  const maintReqSide = (requestSides.maintenance ?? rtMaint) as "supplier" | "me" | null;
  const maintKeys = ["maintenance_responsibility", "maintenance"];
  const bidSides: Record<CostResponsibility["key"], "supplier" | "me" | null> = {
    fuel: sideFromTerm(["fuel_responsibility"], requestSides.fuel ?? null),
    // Maintenance is an acknowledge term (accepted by bidding) → mirror the request's assignment ONLY
    // when there is no negotiable maintenance term. If a term EXISTS but is unresolved
    // (negotiating/grey), keep it grey — never force green (B2: a disputed/pending term must not read
    // as agreed). `conflict` still flips → red, `agreed`/`matched` still resolve, via sideFromTerm.
    maintenance: sideFromTerm(maintKeys, maintReqSide) ?? (termRowOf(maintKeys) ? null : maintReqSide),
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
  /** The days `durationRental` was actually charged across — duration minus its Fridays. The caption
   *  beside that figure must use THIS, not the request's calendar duration, which counts days the
   *  total excludes. 0 whenever `durationRental` is null. */
  billableDays: number;
  /** durationRental ?? rentalForPeriod, + mobDemob. */
  subtotal: number;
  vat: number;
  total: number;
}

/**
 * Display figures for one bid under the chosen rate-period + prices-for basis (Week 6 / Month 26).
 *
 * The duration-based rental prorates through the shared module, so it excludes Fridays exactly like the
 * bid card, the deal room and the supplier's own form. It previously did a bare `perDay × durationDays`,
 * which charged the weekend back in and made the comparison's total disagree with the card it came from.
 */
export function displayQuote(
  bid: BidCard,
  period: RatePeriod,
  pricesFor: PricesFor,
  fallbackDays?: number | null,
  /** The request's start date — what lets the rental drop its Fridays. Without it the shared maths
   *  falls back to the raw rate rather than a Friday-blind proration that would overstate the total. */
  startDate?: string | null,
): DisplayQuote {
  const rate = num(bid.price) ?? 0;
  // "All units" basis = the units THIS supplier offered (unitsOffered), so every cost reflects his chosen
  // quantity (e.g. 5 units → ×5). "Per unit" = ×1. Falls back to the request's units when not stated.
  const units = pricesFor === "all" ? (bid.unitsOffered || bid.numberOfUnits || 1) : 1;
  const dppBid = daysPerPeriod(bid.priceUnit);
  const perDay = dppBid === 0 ? rate : rate / dppBid; // bid rate → per-day basis
  const ratePerPeriod = dppBid === 0 ? rate : perDay * daysPerPeriod(period); // → chosen display period
  const rentalForPeriod = ratePerPeriod * units;
  const fb = num(fallbackDays);
  const durDays = num(bid.duration) ?? (fb != null && fb > 0 ? fb : null);
  const rental = computeRentalTotal({ rate, priceUnit: bid.priceUnit, startDate, durationDays: durDays });
  // Null when there was nothing to prorate over — §6 shows the duration row only then, and with NO
  // duration the total keeps the bid's own quoted rate × units (NOT the toggle-converted
  // `rentalForPeriod`), so switching Day/Week/Month re-expresses only the displayed rate, never the total.
  const durationRental = rental.raw ? null : rental.total * units;
  // Legs default to the rental count (matching the prices-for basis) but now honour exclusion — an
  // excluded leg was still adding whatever price remained stored against it.
  const t = computeQuoteTotals({
    perUnitRental: rental.total,
    rentalUnits: units,
    mob: { amount: num(bid.mobPrice) ?? 0, excluded: bid.mobExcluded },
    demob: { amount: num(bid.demobPrice) ?? 0, excluded: bid.demobExcluded },
  });
  return {
    units, ratePerPeriod, rentalForPeriod,
    mobDemob: t.overall.mob + t.overall.demob,
    durationRental,
    billableDays: rental.raw ? 0 : rental.billable,
    subtotal: t.overall.subtotal, vat: t.overall.vat, total: t.overall.total,
  };
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
  // "Lowest cost" / "Best" rank by the all-in TOTAL. When the request has no duration the total isn't
  // computable ("rental not totaled — set a duration") — so fall back to whatever price IS available
  // (the bid's per-unit rate × units) so the sort still orders by cost instead of doing nothing. Only
  // fall back when NO column has a real total; if some do, unstated ones sort last (never falsely cheapest).
  const anyStated = cols.some((c) => c.allIn.stated);
  const rateProxy = (c: BidColumn) => { const r = num(c.bid.price); return r == null ? Number.POSITIVE_INFINITY : r * (c.bid.numberOfUnits || 1); };
  const allInOf = (c: BidColumn) => (c.allIn.stated ? c.allIn.value : anyStated ? Number.POSITIVE_INFINITY : rateProxy(c));
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
