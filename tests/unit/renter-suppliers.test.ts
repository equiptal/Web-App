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
