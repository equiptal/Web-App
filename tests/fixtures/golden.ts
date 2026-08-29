/**
 * The ruled answers, as fixtures.
 *
 * **Every number in this file was computed independently of the implementation** — from the rulings in
 * `RULINGS.md` and a calendar, not by running the code and recording what came back. That is the whole
 * point: a test whose expected value came from the implementation pins whatever the implementation
 * does, bug included, and turns green over it. These are the outside answer the suite is measured
 * against.
 *
 * Change a number here only when a ruling changes, and record the ruling first.
 *
 * ## The window every scenario uses
 *
 * 15 Aug 2026 (Saturday) → 15 Oct 2026 (Thursday).
 *
 *  - **62** calendar days, both ends inclusive (S-03)
 *  - **8** Fridays inside it
 *  - **54** billable days — this platform does not bill Fridays (S-02)
 *
 * Counted from a calendar. If `durationDaysBetween` or `countFridays` ever disagrees with 62 or 8,
 * the implementation is wrong, not this file.
 */

import type { BidCard } from "@/lib/contract/bids";

export const WINDOW = {
  start: "2026-08-15",
  end: "2026-10-15",
  /** Inclusive of both ends — S-03. */
  days: 62,
  fridays: 8,
  /** S-02: Friday-off applies to every price unit. */
  billable: 54,
} as const;

/** S-01. A week is six days; Friday is the weekend. */
export const DIVISOR = { PER_DAY: 1, PER_WEEK: 6, PER_MONTH: 26 } as const;

/** S-13 / R-01. Saudi VAT, and it is always a multiply — never `total − subtotal`. */
export const VAT = 0.15;

/**
 * Rental for one unit over the window, by unit and rate. `(rate ÷ divisor) × 54` — S-05.
 *
 * Written as the arithmetic rather than the literal so a reader can check it against the ruling
 * without a calculator, and so a changed window does not silently leave stale constants behind.
 */
export const perUnitRental = (rate: number, unit: keyof typeof DIVISOR): number =>
  (rate / DIVISOR[unit]) * WINDOW.billable;

/** The eight ruled scenarios. `rental` is per unit; `total` includes units, legs and VAT. */
export const GOLDEN = {
  /** G-1 · One unit, daily. 500 ÷ 1 × 54. */
  dailySingle: {
    rate: 500,
    unit: "PER_DAY" as const,
    units: 1,
    rental: 27_000,
  },

  /** G-2 · One unit, monthly. 16,000 ÷ 26 × 54. The figure the duration column must show. */
  monthlySingle: {
    rate: 16_000,
    unit: "PER_MONTH" as const,
    units: 1,
    rental: 33_230.769_230_769_23,
  },

  /**
   * G-3 · Three units, weekly. 3,000 ÷ 6 × 54 = 27,000 per unit, × 3.
   *
   * The unit count multiplies the rental and nothing else — S-10: only the **priced** count prices.
   */
  weeklyMultiUnit: {
    rate: 3_000,
    unit: "PER_WEEK" as const,
    units: 3,
    perUnit: 27_000,
    rental: 81_000,
  },

  /**
   * G-4 · Legs at their own counts — S-08.
   *
   * Three machines rented, but five mobilization trips and three demobilization trips were settled in
   * the deal room. The legs bill at 5 and 3, **not** at the rental's 3. This is the bug that made one
   * bid read 1,661,779 in the comparison against 1,666,379 on its own card.
   */
  legsOwnCounts: {
    rate: 3_000,
    unit: "PER_WEEK" as const,
    units: 3,
    mob: { amount: 500, units: 5 },
    demob: { amount: 400, units: 3 },
    rental: 81_000,
    /** 500 × 5 + 400 × 3 — not × 3 for both. */
    oneOff: 3_700,
    subtotal: 84_700,
    vat: 12_705,
    total: 97_405,
  },

  /**
   * G-5 · Multi-item. Two excavators monthly, one loader weekly.
   *
   * Items are priced independently and summed. A unit count belongs to its item, never to the request.
   */
  multiItem: {
    items: [
      { rate: 16_000, unit: "PER_MONTH" as const, units: 2, rental: 66_461.538_461_538_46 },
      { rate: 3_000, unit: "PER_WEEK" as const, units: 1, rental: 27_000 },
    ],
    rental: 93_461.538_461_538_46,
  },

  /**
   * G-6 · Priced below offered — S-10.
   *
   * Offered 5, priced 3. The money is built on **3**. `offered` prices nothing; it is only what the
   * "offered N" badge shows, and the card owes the reader a sentence about the gap.
   */
  pricedBelowOffered: {
    rate: 3_000,
    unit: "PER_WEEK" as const,
    requested: 5,
    offered: 5,
    priced: 3,
    /** 27,000 × 3, not × 5. */
    rental: 81_000,
  },

  /**
   * G-7 · Mobilization excluded in the deal room.
   *
   * An excluded leg bills nothing, whatever count is still recorded against it. Demobilization is
   * untouched. The quotation must not re-add the excluded leg — that was the exact defect
   * `quotation-unified.test.ts` was written to pin.
   */
  mobExcluded: {
    rate: 3_000,
    unit: "PER_WEEK" as const,
    units: 3,
    mob: { amount: 500, units: 5, excluded: true },
    demob: { amount: 400, units: 3 },
    rental: 81_000,
    /** Mob contributes 0. 400 × 3 only. */
    oneOff: 1_200,
    subtotal: 82_200,
    vat: 12_330,
    total: 94_530,
  },

  /**
   * G-8 · VAT-inclusive shared-link submission — R-01b, ruled by the owner.
   *
   * The supplier priced VAT-inclusive, so 4,600 gross is stored as 4,000 net (S-13). The breakdown
   * then **multiplies**, exactly like every other surface — it does not derive VAT from the stored
   * gross. Where the stored gross was rounded differently the rows sit a riyal off what the supplier
   * sent, and that was accepted as the cost of one rule.
   */
  vatInclusiveSubmission: {
    enteredGross: 4_600,
    net: 4_000,
    subtotal: 4_000,
    /** 4,000 × 0.15 — not 4,600 − 4,000. */
    vat: 600,
    total: 4_600,
  },

  /**
   * G-8b · The case that tells the two VAT rules apart.
   *
   * On clean numbers `4,600 − 4,000` and `4,000 × 0.15` both give 600, so G-8 passes whichever rule
   * is in force and proves nothing. Here the stored gross was rounded to 4,600.01 while the net
   * components sum to 4,000, and the two rules separate:
   *
   *  - **multiply** (ruled) → VAT 600.00, total 4,600.00
   *  - derive → VAT 600.01, total 4,600.01
   *
   * The renter sees 4,600.00 against the 4,600.01 the supplier sent. That riyal was accepted as the
   * price of one rule across the platform.
   */
  vatStoredGrossDisagrees: {
    storedGross: 4_600.01,
    subtotal: 4_000,
    /** Multiply, per R-01b. Deriving would give 600.01. */
    vat: 600,
    total: 4_600,
  },
} as const;

/**
 * A `BidCard` with every field present, overridable per test.
 *
 * Fully populated on purpose: a partial fixture lets a test pass because a field was absent rather
 * than because the logic was right.
 */
export const goldenBid = (p: Partial<BidCard> = {}): BidCard => ({
  id: "gold-1",
  status: "PENDING",
  supplierId: "sup-1",
  supplierCompanyId: "co-1",
  supplierName: "Acme Cranes",
  verified: true,
  rating: null,
  distanceKm: null,
  submittedAt: null,
  validUntil: null,
  price: 3_000,
  mobPrice: 500,
  demobPrice: 400,
  priceUnit: "PER_WEEK",
  duration: WINDOW.days,
  numberOfUnits: 3,
  unitsOffered: 3,
  openingPrice: null,
  lastCounterBy: null,
  requestChangedAt: null,
  liveStatus: null,
  reqMinYear: null,
  equipment: { id: "e1", make: "Cat", model: "320", year: 2022, imageUrl: null },
  eqVerified: true,
  compliance: {
    entityType: "company",
    activityLicense: true,
    taxNumber: true,
    nationalAddress: true,
    safety: true,
    saso: false,
    localContent: false,
  },
  matchCount: 0,
  conflictCount: 0,
  dealRoomId: null,
  expired: false,
  note: null,
  requiredCerts: [],
  heldCertCodes: [],
  ownershipDocs: [],
  mobLeadTime: null,
  demobLeadTime: null,
  terms: { equipment: [], contract: [], supplier: [] },
  requestTerms: {
    operatorIncluded: null,
    operatorNationality: null,
    fuelType: null,
    paymentMethod: null,
    paymentTerms: "NET-30",
    breakdownResponseSla: null,
    overtimeRate: null,
    maintenanceResponsibility: null,
  },
  lockedTerms: [],
  unreadTerms: [],
  progress: { agreed: 0, total: 0 },
  lastEventAr: null,
  round: 1,
  uiState: null,
  ...p,
});

/** Two decimal places, for comparing money without inheriting float noise into the assertion. */
export const money = (v: number): number => Math.round(v * 100) / 100;
