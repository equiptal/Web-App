import { describe, it, expect } from "vitest";
import {
  bidCount,
  canBeEmailed,
  canBeInvited,
  groupsOf,
  hasUnparsed,
  groupsWithCounts,
  supplierTier,
  type RenterSupplier,
  isOnMoedatech,
  bidRateLabel,
} from "@/lib/contract/renter-suppliers";

const row = (over: Partial<RenterSupplier> = {}): RenterSupplier => ({
  id: "l1",
  kind: "platform",
  name: "Zahid Tractor",
  vendorRegistered: true,
  ...over,
});

describe("who can be reached, and how", () => {
  it("no email means no send — whitespace is not an address", () => {
    expect(canBeEmailed(row({ email: "tenders@zahidtractor.com" }))).toBe(true);
    expect(canBeEmailed(row({ email: null }))).toBe(false);
    expect(canBeEmailed(row({ email: "   " }))).toBe(false);
    expect(canBeEmailed(row())).toBe(false);
  });

  it("only an off-platform supplier can be invited to join", () => {
    // A firm that has bid in the app for a year must not be asked to sign up.
    expect(canBeInvited(row({ kind: "platform", email: "a@b.c" }))).toBe(false);
    expect(canBeInvited(row({ kind: "own", email: "a@b.c" }))).toBe(true);
    expect(canBeInvited(row({ kind: "own", email: null }))).toBe(false);
  });

  it("a platform row with no contact is not reachable — the fields may be absent", () => {
    // SUP-BE-20 is provisional and switched. Nothing may assume the contact is there.
    expect(canBeEmailed(row({ kind: "platform", vendorRegistered: true }))).toBe(false);
  });
});

describe("what the backend actually sends", () => {
  it("a supplier id arrives as a NUMBER — compare with String() on both sides", () => {
    // The backend serializes its own supplierUserId column, which is an integer. Typing it as a
    // string here would be a lie of exactly the kind agents-contract.test.ts exists to catch.
    const r = row({ supplierId: 882 });
    expect(String(r.supplierId)).toBe("882");
  });

  it("unparsed is present only when something was dropped", () => {
    expect(hasUnparsed(row())).toBe(false);
    expect(hasUnparsed(row({ unparsed: {} }))).toBe(false);
    // The key column stays null so no lookup is poisoned; the text survives so the renter can fix it.
    expect(hasUnparsed(row({ phone: null, unparsed: { phone: "call the office" } }))).toBe(true);
  });
});

describe("groups", () => {
  it("a row with no groups is ungrouped, not broken", () => {
    expect(groupsOf(row())).toEqual([]);
    expect(groupsOf(row({ groups: ["Earthmoving"] }))).toEqual(["Earthmoving"]);
  });

  it("counts every group across the list, in order", () => {
    expect(
      groupsWithCounts([
        row({ id: "a", groups: ["Riyadh", "Earthmoving"] }),
        row({ id: "b", groups: ["Earthmoving"] }),
        row({ id: "c" }),
      ]),
    ).toEqual([
      { name: "Earthmoving", count: 2 },
      { name: "Riyadh", count: 1 },
    ]);
  });
});

describe("the relationship, in one word", () => {
  const roll = (over: Partial<NonNullable<RenterSupplier["rollup"]>>) =>
    row({ rollup: { bidsApp: 0, bidsLink: 0, lastBidAt: null, rooms: 0, awards: 0, ...over } });

  const now = new Date("2026-08-31T09:00:00Z");

  it("no bid is New, whatever else is true", () => {
    expect(supplierTier(roll({ awards: 0 }), now).tier).toBe("new");
    expect(supplierTier(row(), now).tier).toBe("new");
  });

  it("bids with no award is Bidding", () => {
    expect(supplierTier(roll({ bidsApp: 3, lastBidAt: "2026-08-29" }), now).tier).toBe("bidding");
  });

  it("one award is Working, two or more is Core", () => {
    expect(supplierTier(roll({ bidsApp: 3, awards: 1, lastBidAt: "2026-08-29" }), now).tier).toBe("working");
    expect(supplierTier(roll({ bidsApp: 3, awards: 2, lastBidAt: "2026-08-29" }), now).tier).toBe("core");
  });

  it("silence dims the dots but never demotes the word", () => {
    const old = supplierTier(roll({ bidsApp: 4, awards: 2, lastBidAt: "2025-01-01" }), now);
    expect(old.tier).toBe("core"); // a core vendor gone quiet is still a core vendor
    expect(old.quiet).toBe(true);
    expect(old.dots).toBe(3);
  });

  it("counts both channels — an account holder can use the shared form too", () => {
    expect(bidCount(roll({ bidsApp: 3, bidsLink: 1 }))).toBe(4);
    expect(bidCount(row())).toBe(0);
  });
});

/* ============================================================================================== *
 * What the backend actually delivered (delivery note, 2026-09-01)
 * ============================================================================================== */

describe("onMoedatech, not kind", () => {
  it("Given a hand-typed row matched to an account, Then it is on Moedatech and cannot be invited", () => {
    // The row stays the renter's — his name, his flag, his groups — and the badge still tells the
    // truth about the firm. Reading `kind` for this offered an invite to an existing user.
    const s = { id: "1", kind: "own", name: "Najd", phone: "+966559031174", email: "a@b.sa", onMoedatech: true, matchedOn: "phone", vendorRegistered: true } as unknown as RenterSupplier;
    expect(isOnMoedatech(s)).toBe(true);
    expect(canBeInvited(s)).toBe(false);
  });

  it("Given a payload from before the field existed, Then a linked row still shows the badge", () => {
    const s = { id: "2", kind: "platform", name: "Zahid", vendorRegistered: true } as unknown as RenterSupplier;
    expect(isOnMoedatech(s)).toBe(true);
  });

  it("Given a firm with no account, Then it can be invited", () => {
    const s = { id: "3", kind: "own", name: "Yard", email: "y@x.sa", onMoedatech: false, vendorRegistered: true } as unknown as RenterSupplier;
    expect(canBeInvited(s)).toBe(true);
  });
});

describe("bidRateLabel", () => {
  it("Given a rate per month for three units, Then it says so and does not multiply", () => {
    // A total needs billable days, which is the request's business. A wrong total on a supplier's
    // history is worse than an honest rate.
    expect(bidRateLabel({ price: 8400, priceUnit: "PER_MONTH", units: 3 })).toBe("8,400 / month × 3");
  });

  it("Given one unit, Then the count is left off", () => {
    expect(bidRateLabel({ price: 300, priceUnit: "PER_DAY", units: 1 })).toBe("300 / day");
  });

  it("Given no period, Then the amount stands alone rather than claiming one", () => {
    expect(bidRateLabel({ price: 500, priceUnit: null, units: null })).toBe("500");
  });

  it("Given no price, Then there is nothing to render", () => {
    expect(bidRateLabel({ price: null, priceUnit: "PER_DAY", units: 2 })).toBeNull();
  });
});
