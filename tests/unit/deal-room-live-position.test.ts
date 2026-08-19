import { describe, expect, it } from "vitest";
import { liveRound, roundOverride, withOpeningRound, type DealRound } from "@/lib/contract/deal-rounds";
import { computeDealTotals } from "@/lib/contract/deal-room";

/**
 * **The room prices on the LIVE position, not on the last agreement** (app parity:
 * `resolveLivePosition`, whose ladder puts the latest round ahead of `agreedUnits`).
 *
 * The gap this closes: a supplier counters 3 units down to 2, and the bid card — which reads
 * `currentRentalUnits` — shows 2 while the room still priced 3 off `agreedUnits`. Worse, the price
 * bar's own source line said "Supplier's counter" over units from the last agreement.
 *
 * The ordering is the whole rule and is easy to reverse, so it is pinned here rather than left to a
 * comment.
 */

const round = (over: Partial<DealRound> = {}): DealRound => ({
  role: "supplier", at: null,
  rate: 1000, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0,
  rentalUnits: null, mobUnits: null, demobUnits: null,
  mobExcluded: false, demobExcluded: false,
  ...over,
} as DealRound);

const room = (over: Record<string, unknown> = {}) => ({
  rate: 1000, priceUnit: "PER_DAY", periods: null,
  agreedUnits: 3, numberOfUnits: 3, requestedUnits: 5,
  mobUnits: null, demobUnits: null, mobPrice: 0, demobPrice: 0,
  mobExcluded: false, demobExcluded: false,
  ...over,
}) as Parameters<typeof computeDealTotals>[0] & { requestedUnits: number };

describe("liveRound", () => {
  it("takes the latest round from EITHER side", () => {
    const rs = [round({ role: "supplier", rentalUnits: 3 }), round({ role: "rentee", rentalUnits: 2 })];
    expect(liveRound(rs)?.rentalUnits).toBe(2);
  });

  it("is null only for an empty list — which withOpeningRound prevents for a real room", () => {
    expect(liveRound([])).toBeNull();
    const seeded = withOpeningRound([], { rate: 900, priceUnit: "PER_DAY", mobPrice: 0, demobPrice: 0, rentalUnits: 3, mobUnits: null, demobUnits: null, mobExcluded: false, demobExcluded: false });
    expect(liveRound(seeded)?.rentalUnits).toBe(3);
  });
});

describe("roundOverride — the unit ladder", () => {
  it("prices the COUNTERED count, not the agreed one", () => {
    // The bug this fixes: agreed 3, countered down to 2, room kept charging for 3.
    const t = computeDealTotals(room({ agreedUnits: 3 }), roundOverride(room(), round({ rentalUnits: 2 })));
    expect(t.rentalUnits).toBe(2);
  });

  it("falls back to the room's own column when the round names no count", () => {
    // `latest?.rentalUnits ?? roomAgreedUnits ?? …` — expressed as a null passing through to
    // `computeDealTotals`, which then reads the room.
    expect(roundOverride(room(), round({ rentalUnits: null })).rentalUnits).toBeNull();
    const t = computeDealTotals(room({ agreedUnits: 3 }), roundOverride(room(), round({ rentalUnits: null })));
    expect(t.rentalUnits).toBe(3);
  });

  it("clamps to the requested count — a deal that cannot close is not a price", () => {
    // The backend enforces the same bound, so a count above it is a stale or malformed message.
    expect(roundOverride(room({ requestedUnits: 5 }), round({ rentalUnits: 9 })).rentalUnits).toBe(5);
    expect(roundOverride(room({ requestedUnits: 5 }), round({ rentalUnits: 0 })).rentalUnits).toBe(1);
    expect(roundOverride(room({ requestedUnits: 5 }), round({ rentalUnits: -2 })).rentalUnits).toBe(1);
  });

  it("imposes NO ceiling when the room does not know what was requested", () => {
    // `Math.max(1, requestedUnits)` would quietly shrink every counter to a single unit on exactly
    // the rooms whose payload is thinnest.
    expect(roundOverride({ requestedUnits: 0 }, round({ rentalUnits: 4 })).rentalUnits).toBe(4);
  });

  it("carries the rest of the round through, and leaves absent fields absent", () => {
    const o = roundOverride(room(), round({ rate: 750, mobPrice: 200, mobExcluded: true, mobUnits: 2 }));
    expect(o).toMatchObject({ rate: 750, mobPrice: 200, mobExcluded: true, mobUnits: 2, demobUnits: null });
  });
});

describe("a room nobody has countered in prices exactly as it always did", () => {
  it("resolves the synthetic opening round to the room's own columns", () => {
    // `withOpeningRound` seeds round 0 from the room, so the live path and the old
    // `computeDealTotals(room)` path must agree to the riyal on an untouched room.
    const r = room({ agreedUnits: 3, requestedUnits: 5 });
    const opening = withOpeningRound([], { rate: r.rate ?? 0, priceUnit: r.priceUnit ?? null, mobPrice: 0, demobPrice: 0, rentalUnits: r.agreedUnits ?? null, mobUnits: null, demobUnits: null, mobExcluded: false, demobExcluded: false });
    const live = computeDealTotals(r, roundOverride(r, liveRound(opening) as DealRound));
    const plain = computeDealTotals(r);
    expect(live.grand).toBe(plain.grand);
    expect(live.rentalUnits).toBe(plain.rentalUnits);
  });

  it("agrees on a CLOSED room, where the agreement IS the latest position", () => {
    // The quotation's final print depends on this: `agreedUnits` is set at close and the last round
    // carries the same count, so both paths land on the agreed figures.
    const r = room({ agreedUnits: 2, requestedUnits: 5 });
    const live = computeDealTotals(r, roundOverride(r, round({ rentalUnits: 2 })));
    expect(live.rentalUnits).toBe(computeDealTotals(r).rentalUnits);
  });
});

describe("the legs are clamped on the LIVE path only", () => {
  it("caps mob and demob at the rental count, as resolveLivePosition does", () => {
    // A leg count above the rental count is an illegal position the backend would refuse.
    const o = roundOverride(room({ requestedUnits: 5 }), round({ rentalUnits: 2, mobUnits: 4, demobUnits: 3 }));
    expect(o.mobUnits).toBe(2);
    expect(o.demobUnits).toBe(2);
  });

  it("leaves a leg the round did not name alone, so the room's own column still answers", () => {
    const o = roundOverride(room(), round({ rentalUnits: 2, mobUnits: null, demobUnits: null }));
    expect(o.mobUnits).toBeNull();
    expect(o.demobUnits).toBeNull();
  });

  it("never clamps the QUOTATION's legs — a frozen snapshot records what was agreed", () => {
    // The app's `QuotationModel.effectiveMobUnits` has no clamp, and this is why the rule lives on the
    // round rather than inside `computeDealTotals`: putting it there would rewrite signed snapshots.
    const t = computeDealTotals(room({ agreedUnits: 2, mobUnits: 4, mobPrice: 100 }));
    expect(t.mobUnitsN).toBe(4);
  });
});
