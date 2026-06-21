import { describe, it, expect } from "vitest";
import { buildItemComparison, daysPerPeriod, sortByPreset } from "@/lib/contract/comparison";
import type { BidCard, TermRow } from "@/lib/contract/bids";

const bc = (p: Partial<BidCard>): BidCard => ({
  id: "b", status: "PENDING", supplierId: null, supplierName: "S", verified: false, rating: null,
  distanceKm: null, submittedAt: null, validUntil: null, price: null, mobPrice: null, demobPrice: null,
  priceUnit: null, duration: null, numberOfUnits: 1, equipment: null, eqVerified: false,
  compliance: { entityType: "individual", activityLicense: false, taxNumber: false, nationalAddress: false, safety: false, saso: false, localContent: false },
  matchCount: 0, conflictCount: 0, dealRoomId: null, expired: false,
  note: null, requiredCerts: [], heldCertCodes: [], mobLeadTime: null, demobLeadTime: null,
  terms: { equipment: [], contract: [], supplier: [] },
  requestTerms: { operatorIncluded: null, operatorNationality: null, fuelType: null, paymentMethod: null, paymentTerms: null, breakdownResponseSla: null, overtimeRate: null, maintenanceResponsibility: null },
  lockedTerms: [], unreadTerms: [], progress: { agreed: 0, total: 0 }, lastEventAr: null, round: 1,
  uiState: null,
  ...p,
});
const term = (key: string, state: TermRow["state"]): TermRow => ({ key, labelEn: key, labelAr: key, state });

describe("daysPerPeriod", () => {
  it("maps the price unit to days (PER_JOB → 0)", () => {
    expect(daysPerPeriod("PER_DAY")).toBe(1);
    expect(daysPerPeriod("PER_WEEK")).toBe(7);
    expect(daysPerPeriod("PER_MONTH")).toBe(30);
    expect(daysPerPeriod("PER_JOB")).toBe(0);
    expect(daysPerPeriod(null)).toBe(1);
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
    // 700/week ÷ 7 × 14 days × 1 = 1,400
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 700, priceUnit: "PER_WEEK", duration: 14 })]);
    expect(columns[0].rental.value).toBe(1400);
  });

  it("PER_JOB is rate × units (no period)", () => {
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 5000, priceUnit: "PER_JOB", numberOfUnits: 3 })]);
    expect(columns[0].rental).toEqual({ value: 15000, stated: true });
  });

  it("a missing rate → all-in not stated (never 0)", () => {
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: null })]);
    expect(columns[0].allIn.stated).toBe(false);
  });

  it("open-ended (no duration) → rental not stated", () => {
    const { columns } = buildItemComparison([bc({ id: "a", supplierId: "1", price: 200, priceUnit: "PER_DAY", duration: null })]);
    expect(columns[0].rental.stated).toBe(false);
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
