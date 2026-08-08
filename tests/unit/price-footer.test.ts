import { describe, it, expect } from "vitest";
import { computeDealTotals } from "@/lib/contract/deal-room";
import { priceFooterModel, type PriceFooterBid } from "@/lib/contract/price-footer";

/**
 * **V12 — the price footer's figures** (spec 004 §6.10, 004a §4a.1 + §4a.4; RM3-AC-24, AC-65…67).
 *
 * The footer shows figures and hands off; it never edits one and never re-implements negotiation. So
 * what is asserted here is arithmetic and precedence — that the numbers come from the SAME
 * `computeDealTotals` the deal-room bar, the quotation and the signed PDF price from, and that the
 * offered count and the agreed count each stay on their own surface.
 */

const bid = (over: Partial<PriceFooterBid> = {}): PriceFooterBid => ({
  price: 1000,
  priceUnit: "PER_DAY",
  unitsOffered: 3,
  agreedUnits: null,
  mobPrice: 500,
  demobPrice: 400,
  mobUnits: null,
  demobUnits: null,
  mobExcluded: false,
  demobExcluded: false,
  dealRoomId: null,
  ...over,
});

describe("priceFooterModel — the same arithmetic as the deal-room bar (RM3-AC-24)", () => {
  it("produces exactly what computeDealTotals produces for the same basis", () => {
    const model = priceFooterModel(bid(), 10);
    expect(model.totals).toEqual(
      computeDealTotals({
        rate: 1000, priceUnit: "PER_DAY", periods: 10, agreedUnits: null, numberOfUnits: 3,
        mobUnits: null, demobUnits: null, mobPrice: 500, demobPrice: 400,
        mobExcluded: false, demobExcluded: false,
      }),
    );
  });

  it("breaks the total into the lines the expansion renders, VAT at 15%", () => {
    const { totals } = priceFooterModel(bid(), 10);
    expect(totals.rentalTotal).toBe(30000); // 1000/day × 10 days × 3 units
    expect(totals.mobTotal).toBe(1500); // mob units default to the rental count
    expect(totals.demobTotal).toBe(1200);
    expect(totals.subtotal).toBe(32700);
    expect(totals.vat).toBe(Math.round(32700 * 0.15));
    expect(totals.grand).toBe(totals.subtotal + totals.vat);
  });

  it("honours an excluded leg — an excluded leg is zero, not absent", () => {
    const { totals } = priceFooterModel(bid({ mobExcluded: true }), 10);
    expect(totals.mobTotal).toBe(0);
    expect(totals.demobTotal).toBe(1200);
  });

  it("covers ONE full period when the request carries no duration", () => {
    const { totals } = priceFooterModel(bid({ priceUnit: "PER_WEEK" }), null);
    expect(totals.hasDuration).toBe(false);
    expect(totals.rentalTotal).toBe(3000); // one week × 3 units
  });
});

describe("counts vs agreed — two numbers, both correct (004a §4a.4)", () => {
  it("prices on the OFFERED count when nothing was agreed", () => {
    const model = priceFooterModel(bid({ agreedUnits: null }), 10);
    expect(model.pricedUnits).toBe(3);
    expect(model.offeredUnits).toBe(3);
    expect(model.unitsDiffer).toBe(false);
  });

  it("prices on `agreedUnits` once a negotiation set one (RM3-AC-65)", () => {
    const model = priceFooterModel(bid({ agreedUnits: 2, dealRoomId: "dr-1" }), 10);
    expect(model.pricedUnits).toBe(2);
    expect(model.totals.rentalTotal).toBe(20000);
    // The pills keep describing the OFFER; this is only restated so the footer can explain itself.
    expect(model.offeredUnits).toBe(3);
  });

  it("flags the difference so it is stated ONCE, here, and nowhere else (RM3-AC-66)", () => {
    expect(priceFooterModel(bid({ agreedUnits: 2 }), 10).unitsDiffer).toBe(true);
    expect(priceFooterModel(bid({ agreedUnits: 3 }), 10).unitsDiffer).toBe(false);
  });

  it("NEVER follows an unapproved counter (RM3-AC-67)", () => {
    // `currentRentalUnits` is the backend's `lastProposedRentalUnits`. It is not in `PriceFooterBid`
    // at all, so the module cannot read it — this asserts the property rather than the discipline.
    const withCounter = { ...bid({ agreedUnits: null }), currentRentalUnits: 1 } as PriceFooterBid;
    expect(priceFooterModel(withCounter, 10).pricedUnits).toBe(3);
    expect("currentRentalUnits" in ({} as PriceFooterBid)).toBe(false);
  });
});

describe("the no-room case — the common one", () => {
  it("reads as an opening offer with no room", () => {
    const model = priceFooterModel(bid({ dealRoomId: null }), 10);
    expect(model.hasRoom).toBe(false);
    expect(model.source).toBe("opening_offer");
  });

  it("still reads as the opening offer inside a room nothing has moved", () => {
    // A room exists because someone sent a message; that alone does not renegotiate the price.
    expect(priceFooterModel(bid({ dealRoomId: "dr-1", agreedUnits: null }), 10).source).toBe("opening_offer");
  });

  it("credits the deal room once a count was agreed there", () => {
    expect(priceFooterModel(bid({ dealRoomId: "dr-1", agreedUnits: 2 }), 10).source).toBe("deal_room");
  });

  it("never prices on zero units, however the bid was projected", () => {
    expect(priceFooterModel(bid({ unitsOffered: 0 }), 10).pricedUnits).toBe(1);
  });
});
