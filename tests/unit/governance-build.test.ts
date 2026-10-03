import { describe, expect, it } from "vitest";
import { buildGovernance, type GovernanceInput } from "@/lib/governance/build";
import type { RequestListItem } from "@/lib/contract/requests";
import type { BidCard } from "@/lib/contract/bids";

/**
 * The governance board holds no numbers of its own: every card, every figure and every drill-down
 * reads the object `buildGovernance` returns. So this file is the only place the arithmetic is
 * checked, and the cases below are the ones that actually went wrong in the prototype before the
 * fold was pulled out of the page.
 */

const bid = (over: Partial<BidCard> & Pick<BidCard, "supplierName">): BidCard =>
  ({
    id: "b-" + over.supplierName,
    status: "SUBMITTED",
    supplierId: "sup-" + over.supplierName,
    supplierCompanyId: "co-" + over.supplierName,
    supplierLogoUrl: null,
    verified: true,
    rating: null,
    distanceKm: null,
    submittedAt: "2026-09-07T10:20:00Z",
    validUntil: null,
    price: 1000,
    mobPrice: null,
    demobPrice: null,
    /* The backend sends `PER_DAY`, never `DAY`. The difference is not cosmetic: an unrecognized
       basis takes `computeRentalTotal`'s fallback, which bills every CALENDAR day including the
       Fridays, so a fixture saying "DAY" quietly priced a ten-day hire at ten days. */
    priceUnit: "PER_DAY",
    duration: null,
    numberOfUnits: 1,
    unitsOffered: 1,
    openingPrice: null,
    requestChangedAt: null,
    liveStatus: null,
    lastCounterBy: null,
    reqMinYear: null,
    equipment: null,
    eqVerified: true,
    compliance: {
      entityType: "company",
      activityLicense: true,
      taxNumber: true,
      nationalAddress: true,
      safety: true,
      saso: true,
      localContent: true,
    },
    matchCount: 6,
    conflictCount: 0,
    dealRoomId: null,
    dealRoomStatus: null,
    expired: false,
    note: null,
    ...over,
  }) as BidCard;

const request = (over: Partial<RequestListItem> = {}): RequestListItem =>
  ({
    id: "r1",
    requestGroupId: null,
    projectId: null,
    displayId: "r1",
    code: null,
    groupRef: "RFQ-1042",
    type: "BROADCAST",
    status: "ACCEPTED",
    urgency: null,
    rentalType: null,
    city: null,
    /* 1 to 10 Sep 2026: ten calendar days holding one Friday, the 4th. */
    startDate: "2026-09-01",
    endDate: "2026-09-10",
    durationDays: 10,
    createdAt: "2026-08-28T08:00:00Z",
    expiresAt: null,
    bidCount: 1,
    suppliersNotified: null,
    renteeEditUsed: false,
    requiredCerts: [],
    mobByRentee: null,
    demobByRentee: null,
    item: { name: "Crawler Excavator 20 ton", nameAr: "", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: "sub-exc" },
    ...over,
  }) as RequestListItem;

const input = (over: Partial<GovernanceInput> = {}): GovernanceInput => ({
  requests: [],
  bidsByRequest: {},
  sharesByRequest: {},
  heldByRequest: {},
  projectNames: {},
  registry: [],
  ...over,
});

describe("buildGovernance", () => {
  it("prices the hire with Fridays out, not rate times calendar days", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" })] },
      }),
    );
    const row = out.R.r1;
    // 10 calendar days, one Friday (4 Sep), so nine are billable.
    expect(row.days).toBe(10);
    expect(row.fri).toBe(1);
    expect(row.billable).toBe(9);
    expect(row.total).toBe("9,000");
  });

  it("keeps a request that has bids but no award, and marks it unawarded", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })],
          r2: [bid({ supplierName: "Nesma" })],
        },
      }),
    );
    /* Both rows survive. Who bid, by which route, whether they met the terms and what papers
       they carry are answerable the moment bids land — an account mid-flight is the normal case,
       and dropping it left the whole board empty for a renter who simply had not awarded yet. */
    expect(Object.keys(out.R).sort()).toEqual(["r1", "r2"]);
    expect(out.R.r1.awarded).toBe(true);
    expect(out.R.r2.awarded).toBe(false);
    /* No winner is named on the unawarded one, and it carries no money. */
    expect(out.R.r2.winner).toBeNull();
    expect(out.R.r2.total).toBe("0");
    expect(out.skipped).toEqual([]);
  });

  it("still drops a request that drew no bids at all", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {},
      }),
    );
    expect(out.R).toEqual({});
    expect(out.skipped).toEqual([{ ref: "RFQ-1042", why: "no bids received" }]);
  });

  it("drops a request with no dates rather than pricing it from a guess", () => {
    const out = buildGovernance(
      input({
        requests: [request({ startDate: null })],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })] },
      }),
    );
    expect(out.R).toEqual({});
    expect(out.skipped[0].why).toMatch(/cannot be priced/);
  });

  it("counts a survey-reported winner, not only a deal-room accept", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", wonViaSurvey: true })] },
      }),
    );
    expect(out.R.r1.winner?.name).toBe("Zahid");
    expect(out.R.r1.bids[0].won).toBe(1);
  });

  it("marks a bid non-compliant on any conflict, never a share of terms", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({ supplierName: "Cheap", price: 800, conflictCount: 1, matchCount: 5 }),
            bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" }),
          ],
        },
      }),
    );
    expect(out.R.r1.bids.find((b) => b.firm === "Cheap")?.ok).toBe(0);
    expect(out.R.r1.bids.find((b) => b.firm === "Zahid")?.ok).toBe(1);
  });

  it("reads marketplace reach off the dispatch count, and leaves it null when absent", () => {
    const out = buildGovernance(
      input({
        requests: [
          request({ suppliersNotified: 14 }),
          request({ id: "r2", groupRef: "RFQ-1051" }),
          request({ id: "r3", groupRef: "RFQ-1052" }),
        ],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })],
          r2: [bid({ supplierName: "Faisal", status: "ACCEPTED" })],
          r3: [bid({ supplierName: "Nesma", status: "ACCEPTED" })],
        },
        sharesByRequest: { r3: { sent: 5, opened: 2 } },
      }),
    );
    /* The backend has returned `suppliersNotified` on `my-requests` since 2026-09-24. The board
       printed "suppliers reached not stored" on every marketplace row for as long as nobody
       mapped it. */
    expect(out.R.r1.opened).toBe(14);
    expect(out.R.r1.reach).toBe("notified");
    /* A payload that predates the field stays NULL. A request nobody saw and a request everybody
       ignored are different answers, and a zero here says the first about both. */
    expect(out.R.r2.opened).toBeNull();
    expect(out.R.r2.reach).toBeNull();
    // A link share counts opens instead, and says so.
    expect(out.R.r3.opened).toBe(2);
    expect(out.R.r3.reach).toBe("opened");
    expect(out.R.r3.channel).toBe("Your own shared link");
  });

  it("calls a direct request what it is: one firm, reach of one", () => {
    const out = buildGovernance(
      input({
        requests: [request({ type: "DIRECT" })],
        bidsByRequest: { r1: [bid({ supplierName: "Al Faisal", status: "ACCEPTED" })] },
      }),
    );
    expect(out.R.r1.channel).toBe("Direct to one named firm");
    expect(out.R.r1.opened).toBe(1);
  });

  it("keeps a registration number a later thinner bid would have erased", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCrNumber: "1010223344" })],
          r2: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCrNumber: null })],
        },
      }),
    );
    expect(out.SUPMETA.Zahid.cr).toBe("1010223344");
  });

  it("reads the minimum-year term off the bid, where the legacy alias is already resolved", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({
              supplierName: "Zahid",
              status: "ACCEPTED",
              reqMinYear: 2018,
              equipment: { id: "e1", make: null, model: null, year: 2015, imageUrl: null },
            }),
          ],
        },
      }),
    );
    expect(out.R.r1.terms).toContainEqual(["Minimum year 2018", "2015", 0]);
  });

  it("treats a certificate that lapsed before the hire began as expired, and one after as expiring", () => {
    const unit = (expiry: string) => ({
      equipmentId: "e1",
      documentKeys: [{ type: "TUV", key: "k", url: null, verifyStatus: null, expiryDate: expiry }],
      photoKeys: [],
    });
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", offeredUnitsDetail: [unit("2026-08-20")] as never })],
          r2: [bid({ supplierName: "Nesma", status: "ACCEPTED", offeredUnitsDetail: [unit("2026-12-01")] as never })],
        },
      }),
    );
    expect(Object.values(out.CERT).find((c) => c.supplier === "Zahid")?.state).toBe("Expired");
    expect(Object.values(out.CERT).find((c) => c.supplier === "Nesma")?.state).toBe("Expiring");
  });

  it("takes the EARLIEST expiry across the units offered, not the latest", () => {
    const unit = (id: string, expiry: string) => ({
      equipmentId: id,
      documentKeys: [{ type: "TUV", key: "k", url: null, verifyStatus: null, expiryDate: expiry }],
      photoKeys: [],
    });
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", offeredUnitsDetail: [unit("e2", "2027-01-01"), unit("e1", "2026-08-20")] as never })],
        },
      }),
    );
    /* A fleet is covered only until its first lapse. Reporting the latest would call the hire
       covered on the strength of one machine while another sits on site uncertified. */
    expect(out.CERT["r1:TUV"].expiry).toBe("2026-08-20");
    expect(out.CERT["r1:TUV"].state).toBe("Expired");
  });

  it("lists a paper the platform holds but records no expiry for, rather than drawing nothing", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        /* No `offeredUnitsDetail` at all, which is every off-platform bid and plenty of in-app
           ones. The card used to read documents only, so this account drew an EMPTY papers card
           and read as a supplier holding no certificates. */
        bidsByRequest: {
          r1: [bid({ supplierName: "Faisal", status: "ACCEPTED", heldCertCodes: ["TUV"], companyCertCodes: ["SASO"], offeredUnitsDetail: undefined } as never)],
        },
      }),
    );
    expect(Object.keys(out.CERT).sort()).toEqual(["r1:SASO", "r1:TUV"]);
    expect(out.CERT["r1:TUV"].state).toBe("On file");
    expect(out.CERT["r1:TUV"].expiry).toBeNull();
    /* On file with no date is not a failure, so it is not flagged — but it is not silence either. */
    expect(out.CERT["r1:TUV"].bad).toBeUndefined();
    expect(out.CERT["r1:TUV"].note).toMatch(/no expiry date/);
  });

  it("raises a certificate the request asked for and the bid does not hold", () => {
    const out = buildGovernance(
      input({
        requests: [request({ requiredCerts: ["TUV", "SASO"] as never })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Faisal", status: "ACCEPTED", heldCertCodes: ["TUV"], offeredUnitsDetail: undefined } as never)],
        },
      }),
    );
    expect(out.CERT["r1:TUV"].state).toBe("On file");
    expect(out.CERT["r1:SASO"].state).toBe("Not held");
    expect(out.CERT["r1:SASO"].bad).toBe(1);
    expect(out.CERT["r1:SASO"].required).toBe(1);
  });

  it("carries the registry's own count of everything a firm has sent, across all time", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCompanyId: "co-z" })] },
        registry: [
          {
            supplierId: null, companyId: "co-z", crNumber: null, name: "Zahid",
            vendorRegistered: true, onMoedatech: true, groups: [],
            rollup: { bidsApp: 9, bidsLink: 2, awards: 3, rooms: 4, lastBidAt: "2026-09-07T10:20:00Z" },
          },
        ],
      }),
    );
    /* The board's own arithmetic sees one bid, because it folds one request. The registry has
       counted eleven. Both are true of different questions, and the card has to say which. */
    expect(out.R.r1.bids).toHaveLength(1);
    expect(out.SUPMETA.Zahid.rollup).toEqual({ bidsApp: 9, bidsLink: 2, awards: 3, rooms: 4, lastBidAt: "2026-09-07T10:20:00Z" });
  });

  it("reduces every rate to one day before comparing, so a weekly quote is not six times a daily one", () => {
    /* PER_WEEK divides by 6, which is the app's own divisor: a six-day billing week with Friday out. */
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({ supplierName: "Weekly", price: 6000, priceUnit: "PER_WEEK" }),
            bid({ supplierName: "Daily", price: 1100, status: "ACCEPTED" }),
          ],
        },
      }),
    );
    const weekly = out.R.r1.bids.find((b) => b.firm === "Weekly")!;
    expect(weekly.price).toBe(6000);
    expect(weekly.perDay).toBe(1000);
    /* And the headline is still shown as quoted, so the figure matches the supplier's own paper. */
    expect(weekly.unit).toBe("PER_WEEK");
  });

  it("takes the market band from the renter's own bids, and publishes none under three of them", () => {
    const out = buildGovernance(
      input({
        requests: [
          request(),
          request({ id: "r2", groupRef: "RFQ-1043" }),
          request({ id: "r3", groupRef: "RFQ-1044", item: { name: "Tower Crane", nameAr: "", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: "sub-crane" } }),
        ],
        bidsByRequest: {
          r1: [bid({ supplierName: "A", price: 900 }), bid({ supplierName: "B", price: 1000, status: "ACCEPTED" })],
          r2: [bid({ supplierName: "C", price: 1400 })],
          /* One machine type with a single bid: a band of one is not a market. */
          r3: [bid({ supplierName: "D", price: 7000, status: "ACCEPTED" })],
        },
      }),
    );
    // sub-exc saw three bids: 900, 1000, 1400 — median 1000, from three separate firms.
    expect(out.R.r1.market).toEqual({ med: 1000, n: 3, lo: 900, hi: 1400, firms: 3, source: "yours" });
    expect(out.R.r3.market).toBeNull();
  });

  it("counts three bids from one firm as one opinion, and says so", () => {
    const one = (price: number, name: string) =>
      bid({ supplierName: name, price, supplierCompanyId: "co-same" });
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: { r1: [one(900, "A"), one(1000, "B"), one(1100, "C")] },
      }),
    );
    expect(out.R.r1.market?.n).toBe(3);
    expect(out.R.r1.market?.firms).toBe(1);
  });

  it("reads the vendor tick off the registry, and matches a hand-typed row by name", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCompanyId: "co-zahid" }),
            bid({ supplierName: "Hand Typed Co", supplierId: null, supplierCompanyId: null }),
            bid({ supplierName: "Stranger" }),
          ],
        },
        registry: [
          { supplierId: null, companyId: "co-zahid", crNumber: null, name: "Zahid", vendorRegistered: true, onMoedatech: true, groups: ["Earthworks"], rollup: { bidsApp: 9, bidsLink: 2, awards: 3, rooms: 4, lastBidAt: "2026-09-07T10:20:00Z" } },
          /* No ids at all — the only key left is the name, and refusing to use it would report
             every manually added supplier as unregistered. */
          { supplierId: null, companyId: null, crNumber: null, name: "hand typed co", vendorRegistered: true, onMoedatech: false, groups: [], rollup: null },
        ],
      }),
    );
    expect(out.R.r1.bids.find((b) => b.firm === "Zahid")?.registered).toBe(1);
    expect(out.R.r1.bids.find((b) => b.firm === "Hand Typed Co")?.registered).toBe(1);
    expect(out.R.r1.bids.find((b) => b.firm === "Stranger")?.registered).toBe(0);
    expect(out.R.r1.winner?.reg).toBe("Yes");
    expect(out.SUPMETA.Zahid.groups).toEqual(["Earthworks"]);
  });

  it("names the terms a bid missed rather than only counting them", () => {
    const term = (key: string, labelEn: string, state: "matched" | "conflict") => ({ key, labelEn, labelAr: "", state });
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({
              supplierName: "Zahid",
              status: "ACCEPTED",
              conflictCount: 2,
              terms: {
                equipment: [term("year", "Minimum year", "conflict")],
                contract: [term("pay", "Payment terms", "conflict"), term("fuel", "Fuel on supplier", "matched")],
                supplier: [],
              } as never,
            }),
          ],
        },
      }),
    );
    const b = out.R.r1.bids[0];
    expect(b.ok).toBe(0);
    expect(b.missed).toEqual(["Minimum year", "Payment terms"]);
    expect(b.met).toEqual(["Fuel on supplier"]);
    /* And the request-level term list carries the named failures too, so the drill-down and the
       count on the row cannot disagree about which terms were at issue. */
    expect(out.R.r1.terms).toContainEqual(["Payment terms", "Not met", 0]);
  });

  it("prices every losing bid too, so a row can show what the other offers would have cost", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" }), bid({ supplierName: "Nesma", price: 800 })],
        },
      }),
    );
    expect(out.R.r1.total).toBe("9,000");
    expect(out.R.r1.bids.find((b) => b.firm === "Nesma")?.total).toBe(7200);
  });

  it("shows an opening price only when the room actually moved it", () => {
    const out = buildGovernance(
      input({
        requests: [request()],
        bidsByRequest: {
          r1: [
            bid({ supplierName: "Moved", price: 1000, openingPrice: 1200, status: "ACCEPTED" }),
            bid({ supplierName: "Never", price: 900, openingPrice: 900 }),
          ],
        },
      }),
    );
    expect(out.R.r1.bids.find((b) => b.firm === "Moved")?.from).toBe(1200);
    /* "From 900 to 900" reads as a negotiation that happened and achieved nothing. */
    expect(out.R.r1.bids.find((b) => b.firm === "Never")?.from).toBeNull();
  });

  it("carries the window and the route detail a drill-down needs without a second fetch", () => {
    const out = buildGovernance(
      input({
        requests: [request({ city: "Dammam", renteeEditUsed: true })],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", status: "ACCEPTED", supplierCity: "Jubail", supplierVatNumber: "300123456700003" })] },
        sharesByRequest: { r1: { sent: 8, opened: 3 } },
      }),
    );
    const r = out.R.r1;
    expect([r.start, r.end]).toEqual(["2026-09-01", "2026-09-10"]);
    expect(r.city).toBe("Dammam");
    expect(r.edited).toBe(true);
    expect([r.sent, r.opened]).toEqual([8, 3]);
    expect(r.winner?.vat).toBe("300123456700003");
    expect(out.SUPMETA.Zahid.city).toBe("Jubail");
  });

  it("reports on the LEADING bid when nothing has been awarded, and says which it is doing", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", price: 1000 }), bid({ supplierName: "Nesma", price: 900 })],
          r2: [bid({ supplierName: "Faisal", price: 1200 })],
        },
      }),
    );
    /* Twenty requests full of real bids and nothing accepted is the ordinary state of an account,
       and an award-only board drew a column of zeros beside all of them. */
    expect(out.basis).toBe("leading");
    /* The projection never becomes an award: no row is marked awarded and no supplier is credited
       with a win. Only the WORDING on the money cards changes. */
    expect(Object.values(out.R).every((r) => !r.awarded)).toBe(true);
    expect(Object.values(out.R).every((r) => r.winner === null)).toBe(true);
  });

  it("switches back to awards the moment there is even one", () => {
    const out = buildGovernance(
      input({
        requests: [request(), request({ id: "r2", groupRef: "RFQ-1043" })],
        bidsByRequest: {
          r1: [bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" })],
          r2: [bid({ supplierName: "Faisal", price: 1200 })],
        },
      }),
    );
    /* Mixing a projection into a board that has real awards would make the total unreconcilable
       with the award table beneath it. */
    expect(out.basis).toBe("awarded");
  });

  it("carries the deadline and the urgency the three timing checks read", () => {
    const out = buildGovernance(
      input({
        requests: [request({ expiresAt: "2026-08-29T17:00:00Z", urgency: "ASAP" as never })],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", submittedAt: "2026-08-29T23:20:00Z" })] },
      }),
    );
    /* All three were listed as needing fields the platform does not store. It stores all three:
       `expiresAt`, `createdAt` and `urgency` have been on the request list the whole time. */
    expect(out.R.r1.deadline).toBe("2026-08-29T17:00:00Z");
    expect(out.R.r1.created).toBe("2026-08-28T08:00:00Z");
    expect(out.R.r1.urgency).toBe("ASAP");
    // The bid landed after the close, which is what the late-bid check compares.
    expect(out.R.r1.bids[0].at > out.R.r1.deadline!).toBe(true);
  });

  it("falls back to the measured platform band, and never over his own bids", () => {
    /* A real subtype from `market-rates.ts`: 589 bids from 47 companies, median 1,385. */
    const SEEDED = "0f58872b-1bfa-4b84-86db-efe647390586";
    const item = { name: "Seeded type", nameAr: "", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: SEEDED };
    const out = buildGovernance(
      input({
        requests: [request({ item: item as never })],
        /* One bid, so there is no band of his own to compute. */
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", price: 1000, status: "ACCEPTED" })] },
      }),
    );
    expect(out.R.r1.market?.source).toBe("platform");
    expect(out.R.r1.market?.med).toBe(1385);
    expect(out.R.r1.market?.measured).toBe("2026-10-03");
  });

  it("prefers the renter's own bids over the seeded band when he has enough", () => {
    const SEEDED = "0f58872b-1bfa-4b84-86db-efe647390586";
    const item = { name: "Seeded type", nameAr: "", qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: SEEDED };
    const out = buildGovernance(
      input({
        requests: [request({ item: item as never })],
        bidsByRequest: {
          r1: [bid({ supplierName: "A", price: 900 }), bid({ supplierName: "B", price: 1000, status: "ACCEPTED" }), bid({ supplierName: "C", price: 1100 })],
        },
      }),
    );
    /* His three bids are specific to his dates, site and terms. The platform median is 1,385 and
       must not displace them. */
    expect(out.R.r1.market?.source).toBe("yours");
    expect(out.R.r1.market?.med).toBe(1000);
  });

  it("treats a zero dispatch count as NOT RECORDED, never as nobody reached", () => {
    const out = buildGovernance(
      input({
        requests: [request({ suppliersNotified: 0 })],
        bidsByRequest: { r1: [bid({ supplierName: "Zahid", status: "ACCEPTED" })] },
      }),
    );
    /* The backend derives this from a batched MatchEvent count and its own changelog says it is
       0 for any request older than match tracking. "0 suppliers were notified" and "nobody
       recorded who was notified" are different sentences. */
    expect(out.R.r1.opened).toBeNull();
    expect(out.R.r1.reach).toBeNull();
  });
});
