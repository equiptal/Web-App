import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeDealTotals, mapDealRoom } from "@/lib/contract/deal-room";
import { unitCounts } from "@/lib/contract/bid-map";
import { priceFooterModel, type PriceFooterBid } from "@/lib/contract/price-footer";

/**
 * **V12 — the price footer's figures** (spec 004 §6.10, 004a §4a.1 + §4a.4; RM3-AC-24, RM3-AC-65…67).
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

/** A Sunday, so the Friday count in every window below is easy to reason about. Real requests always
 *  carry a start date (`equipment_requests.start_date` is NOT NULL), so fixtures must supply one — a
 *  dateless fixture prices at the raw rate and tests nothing about proration. */
const SUNDAY = "2026-08-09T00:00:00.000Z";

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
    const { totals } = priceFooterModel(bid(), 10, SUNDAY);
    // 10 days from a Sunday contains ONE Friday → 9 billable days, not 10. Friday-off applies to
    // PER_DAY too, so this is 1000 × 9 × 3, not 1000 × 10 × 3.
    expect(totals.rentalTotal).toBe(27000);
    expect(totals.mobTotal).toBe(1500); // mob units default to the rental count
    expect(totals.demobTotal).toBe(1200);
    expect(totals.subtotal).toBe(29700);
    expect(totals.vat).toBe(Math.round(29700 * 0.15));
    expect(totals.grand).toBe(totals.subtotal + totals.vat);
  });

  it("carries the billable-day count the basis line has to state", () => {
    // The basis line under "Rental" reads "{rate}/{unit} × {days} billable days × {n} units", and the
    // days it names must be the days `rentalTotal` was built from. It used to name the calendar span —
    // an arithmetic that never reached the figure beside it, off by exactly the Fridays.
    const { totals } = priceFooterModel(bid(), 10, SUNDAY);
    expect(totals.billableDays).toBe(9);
    expect(totals.rentalRaw).toBe(false);
    expect(totals.rate * totals.billableDays * totals.rentalUnits).toBe(totals.rentalTotal);
    // Period count follows the billable days too — 9 days of a daily rate is 9 periods, not 10.
    expect(totals.periodCount).toBe(9);
  });

  it("prices an open deal at the bare rate, even with a start date to count Fridays from", () => {
    // App parity (`rentalLineTotal`, open mode): `durationDays == null` → `rate × units`, full stop.
    // This used to substitute one full period (26 days for a monthly rate) and hand THAT to the shared
    // module, which then struck out the Fridays of a window nobody had booked — 30,000/month over two
    // units came back 53,077 where the app said 60,000. A request with no end date has nothing to
    // prorate over; the rate is the period.
    const { totals } = priceFooterModel(bid({ priceUnit: "PER_MONTH", price: 30_000 }), null, SUNDAY);
    expect(totals.hasDuration).toBe(false);
    expect(totals.rentalRaw).toBe(true);
    expect(totals.billableDays).toBe(0);
    expect(totals.rentalTotal).toBe(30_000 * totals.rentalUnits);
    expect(totals.periodCount).toBe(1); // one full period, not 22⁄26 of one
  });

  it("names no day count when nothing prorated — there is no arithmetic to show", () => {
    // No start date: the Fridays can't be located, so the rental falls back to one full period at the
    // quoted rate. A "× N billable days" line here would be inventing a window.
    const { totals } = priceFooterModel(bid({ priceUnit: "PER_MONTH" }), 10);
    expect(totals.rentalRaw).toBe(true);
    expect(totals.billableDays).toBe(0);
    expect(totals.rentalTotal).toBe(totals.rate * totals.rentalUnits);
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
    const model = priceFooterModel(bid({ agreedUnits: 2, dealRoomId: "dr-1" }), 10, SUNDAY);
    expect(model.pricedUnits).toBe(2);
    expect(model.totals.rentalTotal).toBe(18000); // 1000 × 9 billable days × 2 agreed units
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   RM3-AC-24 · THE INPUTS, NOT ONLY THE ARITHMETIC

   The first suite in this file hand-feeds `priceFooterModel` and `computeDealTotals` the same numbers
   and asserts they agree. That proves the arithmetic is deterministic — which it would be even if the
   footer read entirely the wrong fields off the bid. RM3-AC-24's claim is about the INPUTS: that the
   footer reads the price basis through the same accessors `mapDealRoom` reads them through, so two
   surfaces over ONE room cannot state two different totals.

   Two accessors carry the whole risk:
     · the unit count — `agreedUnits ?? unitsOffered.length`, NOT the RFQ's `numberOfUnits`;
     · the duration  — the request's `estimatedDurationDays`, and no other duration-shaped field.

   So this drives BOTH from a single raw deal-room payload, with three DIFFERENT plausible counts on
   it (agreed 2 · offered 3 · requested 7) and a decoy duration, and asserts they land on the same
   figures. Reading any one of them wrongly moves a number.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

describe("the footer reads the same inputs as `mapDealRoom`, not merely the same formula (RM3-AC-24)", () => {
  /** One room, as the deal-room endpoint delivers it. */
  const RAW = {
    id: "dr-1",
    status: "NEGOTIATING",
    // Real rooms always carry one (the column is NOT NULL) and the rental maths anchors its Friday
    // count to it. Without it every total below collapses to the raw rate and proves nothing.
    startDate: SUNDAY,
    // The negotiation agreed TWO units. The lessor had offered three. The RFQ asked for seven.
    agreedUnits: 2,
    mobUnits: null,
    demobUnits: null,
    mobExcluded: false,
    demobExcluded: false,
    bid: {
      priceAmount: 1000,
      priceUnit: "PER_DAY",
      unitsOffered: ["u1", "u2", "u3"],
      mobPrice: 500,
      demobPrice: 400,
    },
    request: {
      // The rental maths anchors its Friday count here. Real requests always carry one
      // (`equipment_requests.start_date` is NOT NULL); without it every total below is the bare rate.
      startDate: SUNDAY,
      estimatedDurationDays: 10,
      // Decoys. Both are duration-shaped, both are plausible, and reading either would change the
      // rental total by a factor of three. `mapDealRoom` reads `estimatedDurationDays` and so must
      // the footer.
      durationDays: 30,
      estimatedDuration: 30,
      equipmentItems: [{ numberOfUnits: 7 }],
    },
  };

  const view = mapDealRoom(RAW);

  /** The same room as the bid list projects it — `unitsOffered` is the ARRAY'S LENGTH (`mapBid`). */
  const footerBid: PriceFooterBid = {
    price: RAW.bid.priceAmount,
    priceUnit: RAW.bid.priceUnit,
    unitsOffered: RAW.bid.unitsOffered.length,
    agreedUnits: RAW.agreedUnits,
    mobPrice: RAW.bid.mobPrice,
    demobPrice: RAW.bid.demobPrice,
    mobUnits: RAW.mobUnits,
    demobUnits: RAW.demobUnits,
    mobExcluded: RAW.mobExcluded,
    demobExcluded: RAW.demobExcluded,
    dealRoomId: RAW.id,
  };

  it("the fixture actually distinguishes the three counts and the two durations", () => {
    // Without this the parity below could hold by coincidence rather than by agreement.
    expect([RAW.agreedUnits, RAW.bid.unitsOffered.length, RAW.request.equipmentItems[0].numberOfUnits])
      .toEqual([2, 3, 7]);
    expect(RAW.request.estimatedDurationDays).not.toBe(RAW.request.durationDays);
  });

  it("prices on the count `mapDealRoom` prices on — `agreedUnits`, not the offer and not the RFQ", () => {
    const model = priceFooterModel(footerBid, RAW.request.estimatedDurationDays, view.details.startDate);
    // `numberOfUnits` on the view IS `mapDealRoom`'s `priceUnits`: agreedUnits → unitsOffered.length
    // → request numberOfUnits. The footer must land on the same rung of that ladder.
    expect(view.numberOfUnits).toBe(2);
    expect(model.pricedUnits).toBe(view.numberOfUnits);
    // And it is the AGREED count, not either of the other two on the same payload.
    expect(model.pricedUnits).not.toBe(RAW.bid.unitsOffered.length);
    expect(model.pricedUnits).not.toBe(view.requestedUnits);
  });

  it("falls back down the SAME ladder when nothing was agreed — to the offer, never to the RFQ", () => {
    const unagreed = mapDealRoom({ ...RAW, agreedUnits: null });
    const model = priceFooterModel({ ...footerBid, agreedUnits: null }, RAW.request.estimatedDurationDays, view.details.startDate);
    expect(unagreed.numberOfUnits).toBe(3); // `unitsOffered.length`, not the requested 7
    expect(model.pricedUnits).toBe(unagreed.numberOfUnits);
    expect(model.pricedUnits).not.toBe(unagreed.requestedUnits);
  });

  it("prices over the duration `mapDealRoom` reads — `estimatedDurationDays`, past two decoys", () => {
    const model = priceFooterModel(footerBid, RAW.request.estimatedDurationDays, view.details.startDate);
    expect(view.periods).toBe(10);
    expect(model.totals.periods).toBe(view.periods);
    // The decoy is not merely unequal — it would visibly change the money, which is what makes the
    // assertion above load-bearing rather than cosmetic.
    const onDecoy = priceFooterModel(footerBid, RAW.request.durationDays, view.details.startDate);
    expect(onDecoy.totals.rentalTotal).not.toBe(model.totals.rentalTotal);
  });

  it("produces EVERY figure the deal-room bar produces for this room, from the room's own fields", () => {
    const model = priceFooterModel(footerBid, RAW.request.estimatedDurationDays, view.details.startDate);
    // Fed from the VIEW — i.e. from what the deal room itself computed off the raw payload. If the
    // footer had reached for a different field on the bid, this is where the two would part.
    expect(model.totals).toEqual(
      computeDealTotals({
        rate: view.rate,
        priceUnit: view.priceUnit,
        periods: view.periods,
        startDate: view.details.startDate,
        agreedUnits: view.agreedUnits,
        numberOfUnits: view.numberOfUnits,
        mobUnits: view.mobUnits,
        demobUnits: view.demobUnits,
        mobPrice: view.mobPrice,
        demobPrice: view.demobPrice,
        mobExcluded: view.mobExcluded,
        demobExcluded: view.demobExcluded,
      }),
    );
    // 1000/day × 9 BILLABLE days (10 less the one Friday) × 2 agreed units — stated outright so a
    // change of basis cannot hide inside a deep-equal that moved on both sides at once.
    expect(model.totals.rentalTotal).toBe(18000);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   RM3-AC-66 · THE DIFFERENCE IS STATED **ONCE**

   The existing test proves `unitsDiffer` is computed correctly. The AC's other half — *and nowhere
   else* — was unasserted, and it is the half that fails in practice: two unexplained unit figures on
   one screen is the defect the rule exists to stop, and it arrives when a SECOND surface starts
   reading `agreedUnits`.
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */

const MAP_DIR = resolve(process.cwd(), "src/components/map");

/** Comments removed — these files discuss `agreedUnits` at length precisely to explain why they do
 *  not read it, and a rule stated in prose must not fail its own test. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function mapFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...mapFiles(p));
    else if (/\.tsx?$/.test(name)) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

describe("the difference between offered and agreed is stated ONCE (RM3-AC-66)", () => {
  const files = mapFiles(MAP_DIR);

  it("found the surface it is sweeping", () => {
    expect(files.some((f) => f.endsWith("/PriceFooter.tsx"))).toBe(true);
    expect(files.length).toBeGreaterThan(8);
  });

  it("is derived by ONE component, and by no other — `unitsDiffer` has a single reader", () => {
    const readers = files.filter((f) =>
      /\bunitsDiffer\b|\bpricedUnits\b/.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(readers.map((f) => f.split("/").pop())).toEqual(["PriceFooter.tsx"]);
  });

  it("is not even NAMED by any other component — `agreedUnits` reaches no other surface", () => {
    // Stronger than expected, and worth stating: after comments are stripped, NO component under the
    // map tree references `agreedUnits` at all. `BidMapWorkspace` and `bid-map.ts` both discuss it —
    // to record that they must not read it — and neither does. The count pills reach their figure
    // through `unitsOffered` alone, so there is no second place a difference could be computed.
    const namers = files.filter((f) => /\bagreedUnits\b/.test(stripComments(readFileSync(f, "utf8"))));
    expect(namers.map((f) => f.split("/").pop())).toEqual([]);
    const pillModel = stripComments(readFileSync(resolve(process.cwd(), "src/lib/contract/bid-map.ts"), "utf8"));
    expect(pillModel).not.toMatch(/\bagreedUnits\b/);
  });

  it("is RENDERED in exactly one place, from one flag", () => {
    const footer = readFileSync(resolve(MAP_DIR, "PriceFooter.tsx"), "utf8");
    expect(footer.match(/model\.unitsDiffer/g) ?? []).toHaveLength(1);
    // And the sentence itself exists in exactly one copy key per locale.
    for (const locale of ["src/lib/i18n/en.ts", "src/lib/i18n/ar.ts"]) {
      const dict = readFileSync(resolve(process.cwd(), locale), "utf8");
      expect(dict.match(/\n\s*unitsDiffer\s*:/g) ?? []).toHaveLength(1);
    }
  });

  it("cannot be stated by the count pills — their model has no agreed count to state it from", () => {
    // The structural half, and the red-able one: `unitCounts` takes `Pick<BidCard,"unitsOffered">`.
    // Handing it a bid whose negotiation agreed a DIFFERENT count changes nothing, because there is
    // no accessor for it. A pill that started reading `agreedUnits` would move `offered` to 2.
    const fleet = [{ inBid: true }, { inBid: true }, { inBid: false }];
    const plain = unitCounts({ unitsOffered: 5 }, fleet);
    const negotiated = unitCounts({ unitsOffered: 5, agreedUnits: 2 } as Parameters<typeof unitCounts>[0], fleet);
    expect(plain.offered).toBe(5);
    expect(negotiated).toEqual(plain);
    expect(Object.keys(plain).sort()).toEqual(["claimed", "offered", "owned", "registered"]);
    for (const forbidden of ["agreedUnits", "unitsDiffer", "pricedUnits"]) expect(forbidden in plain).toBe(false);
  });

  it("says nothing when there is nothing to say — no room, no agreement, no second figure", () => {
    // The common case. A footer that stated a difference here would be stating it about an offer
    // nobody has negotiated.
    expect(priceFooterModel(bid({ agreedUnits: null }), 10).unitsDiffer).toBe(false);
  });
});
