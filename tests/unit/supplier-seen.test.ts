/**
 * @vitest-environment jsdom
 *
 * `.ts`, so the suite defaults to node — and this module reads `window.localStorage`. Declared per
 * file rather than renaming to `.tsx`, which would claim a React component that is not here.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { hasUnseenBid, loadSeen, markSeen } from "@/lib/supplierSeen";

/**
 * The unseen dot — deliberately local.
 *
 * The backend has no per-user seen state and will not add one: a write on every tap, for a dot
 * (delivery note §3.2). So the cut-off lives in `localStorage`, exactly like a dismissed suggestion.
 *
 * The dot and `rollup.newBids` answer DIFFERENT questions and are meant to disagree: the count is the
 * last 24 hours and is the same number for everyone in the firm, the dot is since this reader last
 * looked. A renter who reads a bid and comes back an hour later loses the dot and keeps the badge.
 */

beforeEach(() => window.localStorage.clear());

describe("hasUnseenBid", () => {
  it("Given a bid newer than the last look, Then the dot shows", () => {
    expect(hasUnseenBid("2026-09-01T10:00:00Z", "2026-08-31T10:00:00Z")).toBe(true);
  });

  it("Given the row was opened after the bid, Then it does not", () => {
    expect(hasUnseenBid("2026-08-31T10:00:00Z", "2026-09-01T10:00:00Z")).toBe(false);
  });

  it("Given a row this reader has never opened, Then there is no dot", () => {
    // Otherwise the list arrives covered in dots on a first visit, which teaches him to ignore all of
    // them. `newBids` is what speaks for a firm he has never opened.
    expect(hasUnseenBid("2026-09-01T10:00:00Z", undefined)).toBe(false);
  });

  it("Given a supplier who never bid, Then there is nothing to have missed", () => {
    expect(hasUnseenBid(null, "2026-08-31T10:00:00Z")).toBe(false);
  });
});

describe("markSeen", () => {
  it("Given a row is opened, Then the stamp survives a reload and clears that row's dot", () => {
    markSeen("row-1");
    const seen = loadSeen();

    expect(typeof seen["row-1"]).toBe("string");
    // A bid from before this moment is now read; one from after is not.
    expect(hasUnseenBid("2020-01-01T00:00:00Z", seen["row-1"])).toBe(false);
    expect(hasUnseenBid("2999-01-01T00:00:00Z", seen["row-1"])).toBe(true);
  });

  it("Given one row is opened, Then the others keep their dots", () => {
    markSeen("row-1");
    expect(loadSeen()["row-2"]).toBeUndefined();
  });

  it("Given storage holds something that is not a map, Then it reads as empty rather than throwing", () => {
    window.localStorage.setItem("moedatech.suppliers.seen.v1", "not json");
    expect(loadSeen()).toEqual({});
  });
});
