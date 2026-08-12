import { describe, it, expect } from "vitest";
import { buildItemComparison, computeBidQuote, daysPerPeriod, sortByPreset, displayQuote, responsibilityTone, rowWinners, type CostResponsibility } from "@/lib/contract/comparison";
import type { BidCard, TermRow } from "@/lib/contract/bids";

const bc = (p: Partial<BidCard>): BidCard => ({
  id: "b", status: "PENDING", supplierId: null, supplierName: "S", verified: false, rating: null,
  distanceKm: null, submittedAt: null, validUntil: null, price: null, mobPrice: null, demobPrice: null,
  priceUnit: null, duration: null, numberOfUnits: 1, unitsOffered: 1, reqMinYear: null, equipment: null, eqVerified: false,
  compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
  matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
  note: null, requiredCerts: [], heldCertCodes: [], ownershipDocs: [], mobLeadTime: null, demobLeadTime: null,
  terms: { equipment: [], contract: [], supplier: [] },
  requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
  lockedTerms: [], unreadTerms: [], progress: { agreed: 0, total: 0 }, lastEventAr: null, round: 1,
  uiState: null,
  ...p,
});
const term = (key: string, state: TermRow["state"]): TermRow => ({ key, labelEn: key, labelAr: key, state });

/** A Sunday, so each window's Friday count is easy to follow. Real requests always carry a start date
 *  (`equipment_requests.start_date` is NOT NULL); a quote built without one prices at the bare rate. */
const SUNDAY = "2026-08-09T00:00:00.000Z";

describe("daysPerPeriod", () => {
  it("maps the price unit to BILLABLE days (week = 6, PER_JOB → 0)", () => {
    expect(daysPerPeriod("PER_DAY")).toBe(1);
    // 6, not 7: Friday is the weekend, so a working week is six days (mobile parity — this returned 7
    // until the pricing module landed, which is why the app and the web disagreed on every weekly bid).
    expect(daysPerPeriod("PER_WEEK")).toBe(6);
    expect(daysPerPeriod("PER_MONTH")).toBe(26); // 26 working days per month, not 30 calendar
    expect(daysPerPeriod("PER_JOB")).toBe(0);
    expect(daysPerPeriod(null)).toBe(1);
  });
});

describe("computeBidQuote (shared quote math — comparison ↔ quotation parity)", () => {
  // `unitsOffered` is set alongside `numberOfUnits` in these cases on purpose: the supplier's OFFERED
  // count is what the quote scales by (see the precedence test below), and the shared `bc()` fixture
  // defaults it to 1. Leaving it out silently priced every case at one unit.
  it("weekly rate ÷6 × BILLABLE days × units", () => {
    // 14 days from a Sunday contains 2 Fridays → 12 billable days, so 700 ÷ 6 × 12.
    const q = computeBidQuote(bc({ price: 700, priceUnit: "PER_WEEK", duration: 14, numberOfUnits: 2, unitsOffered: 2 }), { startDate: SUNDAY });
    expect(q.perUnitRental).toBe(1400);
    expect(q.rentalSubtotal).toBe(2800); // × 2 units
  });

  it("exposes the billable-day count and the exact-period flag the card renders from", () => {
    // 14 days from a Sunday → 12 billable. The card captions the rental row "· 12 days".
    const q = computeBidQuote(bc({ price: 700, priceUnit: "PER_WEEK", duration: 14, unitsOffered: 1 }), { startDate: SUNDAY });
    expect(q.billableDays).toBe(12);
    expect(q.rentalExact).toBe(false);
  });

  it("flags an exact period, which is what lets a single-unit card drop its rental row", () => {
    // 7 days from a Sunday → 6 billable → ÷6 × 6 lands exactly on the quoted rate, so the row would
    // only restate the headline.
    const q = computeBidQuote(bc({ price: 700, priceUnit: "PER_WEEK", duration: 7, unitsOffered: 1 }), { startDate: SUNDAY });
    expect(q.perUnitRental).toBe(700);
    expect(q.rentalExact).toBe(true);
  });

  it("reports no billable days when the rental never prorated, so no day caption is shown", () => {
    const q = computeBidQuote(bc({ price: 700, priceUnit: "PER_WEEK", duration: 14, unitsOffered: 1 }));
    expect(q.billableDays).toBe(0); // no startDate → bare rate → nothing to caption
  });

  it("without a startDate the rental is the bare rate — Fridays can't be located (mobile §3)", () => {
    const q = computeBidQuote(bc({ price: 700, priceUnit: "PER_WEEK", duration: 14, numberOfUnits: 1, unitsOffered: 1 }));
    expect(q.perUnitRental).toBe(700);
  });

  it("an open-ended bid is the bare rate, even when a start date could locate Fridays", () => {
    // App parity (`rentalLineTotal`, open mode): no duration → `rate × units`. This used to fall back to
    // ONE FULL PERIOD (26 days for a monthly rate) and hand that to the shared module as if it were a
    // booked window, which then struck out its Fridays — 30,000/month came back at 22⁄26 of itself.
    // An open request has nothing to prorate over; the quoted rate IS the period.
    const q = computeBidQuote(
      bc({ price: 30_000, priceUnit: "PER_MONTH", duration: null, numberOfUnits: 2, unitsOffered: 2 }),
      { startDate: SUNDAY },
    );
    expect(q.perUnitRental).toBe(30_000);
    expect(q.rentalSubtotal).toBe(60_000);
    expect(q.billableDays).toBe(0);
    expect(q.periods).toBe(1);
  });

  it("monthly rate uses 26 working days", () => {
    const q = computeBidQuote(bc({ price: 2600, priceUnit: "PER_MONTH", duration: 26, numberOfUnits: 1 }));
    expect(q.perUnitRental).toBe(2600); // 2600 / 26 × 26
  });

  it("PER_JOB is a flat rate (no duration), × units", () => {
    const q = computeBidQuote(bc({ price: 5000, priceUnit: "PER_JOB", duration: 30, numberOfUnits: 2, unitsOffered: 2 }));
    expect(q.perUnitRental).toBe(5000);
    expect(q.rentalSubtotal).toBe(10000);
  });

  it("mobilization/demobilization are per-unit (× units); VAT is 15% of the pre-VAT subtotal", () => {
    const q = computeBidQuote(
      bc({ price: 100, priceUnit: "PER_DAY", duration: 10, numberOfUnits: 2, unitsOffered: 2, mobPrice: 800, demobPrice: 800 }),
      { startDate: SUNDAY },
    );
    expect(q.rentalSubtotal).toBe(1800); // 100 × 9 billable days (10 less one Friday) × 2
    expect(q.mobTotal).toBe(1600); // 800 × 2 — transport doesn't prorate
    expect(q.demobTotal).toBe(1600);
    expect(q.subtotalPreVat).toBe(5000);
    expect(q.vat).toBeCloseTo(750); // 15%
    expect(q.total).toBeCloseTo(5750);
  });

  // The guard that was missing. When the live-unit price landed (6a5890e) the resolution order changed
  // and nothing pinned it, so the three cases above quietly halved instead of failing loudly on the
  // real change. Assert the ORDER itself, not just one arm of it.
  it("resolves units by precedence: agreedUnits → currentRentalUnits → unitsOffered → numberOfUnits", () => {
    const base = { price: 100, priceUnit: "PER_DAY" as const, duration: 1 };
    // Nothing negotiated and nothing offered → fall back to the requested count.
    expect(computeBidQuote(bc({ ...base, numberOfUnits: 9, unitsOffered: 0 })).units).toBe(9);
    // An offered count beats the requested count.
    expect(computeBidQuote(bc({ ...base, numberOfUnits: 9, unitsOffered: 4 })).units).toBe(4);
    // A mid-negotiation deal-room count beats the offered count.
    expect(computeBidQuote(bc({ ...base, numberOfUnits: 9, unitsOffered: 4, currentRentalUnits: 3 })).units).toBe(3);
    // An agreed count beats everything derived from the bid.
    expect(computeBidQuote(bc({ ...base, numberOfUnits: 9, unitsOffered: 4, currentRentalUnits: 3, agreedUnits: 2 })).units).toBe(2);
    // ...but the comparison's own unit toggle still overrides all of them.
    expect(computeBidQuote(bc({ ...base, numberOfUnits: 9, unitsOffered: 4, agreedUnits: 2 }), { units: 1 }).units).toBe(1);
  });

  it("a units override and a duration fallback are honored", () => {
    const q = computeBidQuote(bc({ price: 100, priceUnit: "PER_DAY", duration: null, numberOfUnits: 5 }), { units: 1, fallbackDays: 7, startDate: SUNDAY });
    expect(q.units).toBe(1); // override beats numberOfUnits
    expect(q.days).toBe(7); // fallback used when the bid states no duration
    expect(q.rentalSubtotal).toBe(600); // 100 × 6 billable days (7 less one Friday) × 1
  });
});

describe("buildItemComparison — all-in (AC-09/10/35)", () => {
  it("normalizes rate to the period × duration × units + stated mob/demob", () => {
    // 200/day · 30 days · 2 units = 12,000 + 800 mob + 800 demob = 13,600
    const { columns } = buildItemComparison([
      bc({ id: "a", supplierId: "1", price: 200, priceUnit: "PER_DAY", duration: 30, numberOfUnits: 2, mobPrice: 800, demobPrice: 800 }),
    ]);
    expect(columns[0].rental).toEqual({ value: 12000, stated: true });
    expect(columns[0].allIn).toEqual({ value: 13600, stated: true });
  });

  it("normalizes a per-week rate to per-day before totaling", () => {
    // 700/week ÷ 6 billable days × 14 days × 1 (no startDate here, so no Fridays are dropped)
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 700, priceUnit: "PER_WEEK", duration: 14 })]);
    expect(columns[0].rental.value).toBeCloseTo((700 / 6) * 14, 6);
  });

  it("PER_JOB is rate × units (no period)", () => {
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 5000, priceUnit: "PER_JOB", numberOfUnits: 3 })]);
    expect(columns[0].rental).toEqual({ value: 15000, stated: true });
  });

  it("a missing rate → all-in not stated (never 0)", () => {
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: null })]);
    expect(columns[0].allIn.stated).toBe(false);
  });

  it("open-ended (no duration) → rental NOT stated (show the rate only, no assumed 1-day total)", () => {
    // PER_DAY, no duration anywhere → don't fabricate a 1-period total; the UI shows just the rate.
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 200, priceUnit: "PER_DAY", duration: null })]);
    expect(columns[0].rental).toEqual({ value: 0, stated: false });
  });

  it("monthly rate is prorated over 26 working days, not raw calendar days", () => {
    // 17,000/month over 22 days · 1 unit = (17000/26)*22 ≈ 14,385 (a month = 26 working days, NOT 30).
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 17000, priceUnit: "PER_MONTH", duration: 22 })]);
    expect(Math.round(columns[0].rental.value)).toBe(14385);
  });

  it("falls back to the request duration when the bid omits its own", () => {
    // 200/day · (request) 30 days · 1 unit = 6,000 — the bid carries no duration of its own.
    const { columns } = buildItemComparison(
      [bc({ id: "a", supplierId: "1", price: 200, priceUnit: "PER_DAY", duration: null })],
      { requestDurationDays: 30 },
    );
    expect(columns[0].rental).toEqual({ value: 6000, stated: true });
  });
});

describe("buildItemComparison — +X% vs lowest (AC-09)", () => {
  it("flags the lowest and computes the premium for the rest", () => {
    const { columns } = buildItemComparison([
      bc({ id: "a", supplierId: "1", price: 100, priceUnit: "PER_DAY", duration: 10 }), // 1000
      bc({ id: "b", supplierId: "2", price: 120, priceUnit: "PER_DAY", duration: 10 }), // 1200 (+20%)
    ]);
    const a = columns.find((c) => c.bid.id === "a")!;
    const b = columns.find((c) => c.bid.id === "b")!;
    expect(a.isLowest).toBe(true);
    expect(a.pctVsLowest).toBe(0);
    expect(b.pctVsLowest).toBe(20);
  });
});

describe("buildItemComparison — latest live round per supplier (AC-38)", () => {
  it("keeps only the latest round and drops expired/withdrawn", () => {
    const { columns } = buildItemComparison([
      bc({ id: "r1", supplierId: "1", price: 100, priceUnit: "PER_DAY", duration: 1, round: 1 }),
      bc({ id: "r2", supplierId: "1", price: 90, priceUnit: "PER_DAY", duration: 1, round: 2 }),
      bc({ id: "exp", supplierId: "2", status: "EXPIRED", price: 50 }),
    ]);
    expect(columns).toHaveLength(1);
    expect(columns[0].bid.id).toBe("r2"); // latest round of supplier 1; expired supplier 2 dropped
  });
});

describe("buildItemComparison — qualification + excluded (AC-08/16/33)", () => {
  it("counts conflicts and excludes a bid that fails every requirement", () => {
    const { columns, excluded } = buildItemComparison([
      bc({ id: "ok", supplierId: "1", price: 100, priceUnit: "PER_DAY", duration: 1, terms: { equipment: [term("year", "matched")], contract: [], supplier: [] } }),
      bc({ id: "bad", supplierId: "2", price: 100, priceUnit: "PER_DAY", duration: 1, terms: { equipment: [term("year", "conflict"), term("certs", "conflict")], contract: [], supplier: [] } }),
    ]);
    expect(columns.map((c) => c.bid.id)).toEqual(["ok"]);
    expect(excluded.map((c) => c.bid.id)).toEqual(["bad"]);
    expect(excluded[0].conflicts).toBe(2);
  });
});

describe("renter-entered cost (AC-12)", () => {
  const rt = (maint: string) => ({ operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: maint });
  it("adds the renter cost only where the responsibility lands on the renter", () => {
    // maintenance on the renter ("renter" → bidSide "me") → +500
    const onMe = buildItemComparison([bc({ id: "a", supplierId: "1", price: 100, priceUnit: "PER_DAY", duration: 10, requestTerms: rt("renter") })], { renterCosts: { maintenance: 500 } });
    expect(onMe.columns[0].allIn.value).toBe(1500);
    // maintenance on the supplier → renter cost NOT added
    const onSupplier = buildItemComparison([bc({ id: "b", supplierId: "2", price: 100, priceUnit: "PER_DAY", duration: 10, requestTerms: rt("supplier") })], { renterCosts: { maintenance: 500 } });
    expect(onSupplier.columns[0].allIn.value).toBe(1000);
  });
});

describe("sortByPreset (AC-20 web side)", () => {
  it("lowest sorts by all-in ascending", () => {
    const { columns } = buildItemComparison([
      bc({ id: "hi", supplierId: "1", price: 300, priceUnit: "PER_DAY", duration: 1 }),
      bc({ id: "lo", supplierId: "2", price: 100, priceUnit: "PER_DAY", duration: 1 }),
    ]);
    expect(sortByPreset(columns, "lowest").map((c) => c.bid.id)).toEqual(["lo", "hi"]);
  });
});

/* ---------------------------- §6 redesign display helpers ---------------------------- */

describe("displayQuote (RATE PERIOD + PRICES FOR toggles)", () => {
  // "All units" multiplies by the units THIS supplier OFFERED (unitsOffered), not the request's needed count.
  it("re-expresses a day-rate into week (×6 billable days) and month (×26) for all units", () => {
    const b = bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 3, unitsOffered: 3 });
    expect(displayQuote(b, "PER_DAY", "all").ratePerPeriod).toBe(445);
    // A week bills 6 days, not 7 — the toggle must quote what a week actually costs to rent.
    expect(displayQuote(b, "PER_WEEK", "all").ratePerPeriod).toBe(445 * 6);
    expect(displayQuote(b, "PER_MONTH", "all").ratePerPeriod).toBe(445 * 26);
    expect(displayQuote(b, "PER_DAY", "all").rentalForPeriod).toBe(445 * 3); // × units offered
  });
  it("PRICES FOR = unit prices one unit; mob+demob scale with the offered units", () => {
    const b = bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 3, unitsOffered: 3, mobPrice: 100, demobPrice: 50 });
    expect(displayQuote(b, "PER_DAY", "unit").rentalForPeriod).toBe(445); // 1 unit
    expect(displayQuote(b, "PER_DAY", "unit").mobDemob).toBe(150);
    expect(displayQuote(b, "PER_DAY", "all").mobDemob).toBe(150 * 3);
  });
  it("scales every cost by the supplier's offered units (e.g. 5 units → ×5)", () => {
    const five = bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 3, unitsOffered: 5, mobPrice: 100, demobPrice: 50 });
    expect(displayQuote(five, "PER_DAY", "all").rentalForPeriod).toBe(445 * 5);
    expect(displayQuote(five, "PER_DAY", "all").mobDemob).toBe(150 * 5);
    // 10 days from a Sunday bills 9 — the Friday comes out, exactly as it does on the bid card.
    expect(displayQuote(five, "PER_DAY", "all", 10, SUNDAY).durationRental).toBe(445 * 9 * 5);
  });
  it("duration-based rental shows only when there is a period to prorate (else null)", () => {
    const noDur = bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 1, unitsOffered: 1 });
    expect(displayQuote(noDur, "PER_DAY", "all").durationRental).toBeNull();
    const withDur = displayQuote(bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 2, unitsOffered: 2 }), "PER_DAY", "all", 10, SUNDAY);
    expect(withDur.durationRental).toBe(445 * 9 * 2);
  });
  it("a duration with NO start date prorates nothing — the row hides rather than charging Fridays", () => {
    // Mobile §3: without the start date the Fridays can't be located, so the shared maths returns the
    // bare rate. Unreachable on real data (`start_date` is NOT NULL) — pinned so a caller that forgets
    // to thread the date fails loudly here instead of quietly overstating the total by ~17%.
    const q = displayQuote(bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 2, unitsOffered: 2 }), "PER_DAY", "all", 10);
    expect(q.durationRental).toBeNull();
    expect(q.subtotal).toBe(445 * 2); // the quoted rate × units, never rate × 10 days
  });
  it("an excluded leg contributes nothing, however much price is still stored on it", () => {
    const b = bc({ price: 445, priceUnit: "PER_DAY", numberOfUnits: 1, unitsOffered: 1, mobPrice: 100, demobPrice: 50, mobExcluded: true });
    expect(displayQuote(b, "PER_DAY", "all").mobDemob).toBe(50);
  });
  it("PER_JOB is a flat rate — no period conversion", () => {
    const q = displayQuote(bc({ price: 5000, priceUnit: "PER_JOB", numberOfUnits: 2, unitsOffered: 2 }), "PER_WEEK", "all");
    expect(q.ratePerPeriod).toBe(5000);
    expect(q.durationRental).toBeNull();
  });
});

describe("responsibilityTone (T11: green=matches request incl. 'you' / red=conflict / grey=n/a)", () => {
  const cr = (p: Partial<CostResponsibility>): CostResponsibility => ({ key: "fuel", labelEn: "Fuel", labelAr: "وقود", bidSide: null, requestSide: null, state: "grey", ...p });
  it("supplier-covered, matched → green", () => expect(responsibilityTone(cr({ bidSide: "supplier", requestSide: "supplier", state: "green" }))).toBe("green"));
  it("renter-handled, matched → green (T11: 'on you' that matches the request is green, not blue)", () => expect(responsibilityTone(cr({ bidSide: "me", requestSide: "me", state: "green" }))).toBe("green"));
  it("conflict → red", () => expect(responsibilityTone(cr({ bidSide: "me", requestSide: "supplier", state: "red" }))).toBe("red"));
  it("not provided → grey", () => expect(responsibilityTone(cr({}))).toBe("grey"));
});

describe("rowWinners (lowest/highest, ties not highlighted)", () => {
  it("flags the single lowest", () => expect([...rowWinners([300, 100, 200], "min")]).toEqual([1]));
  it("flags the single highest", () => expect([...rowWinners([2, 5, 3], "max")]).toEqual([1]));
  it("ignores nulls", () => expect([...rowWinners([null, 100, 200], "min")]).toEqual([1]));
  it("no highlight on a tie", () => expect(rowWinners([100, 100, 200], "min").size).toBe(0));
  it("no highlight with <2 comparable values", () => expect(rowWinners([null, 100], "min").size).toBe(0));
});
