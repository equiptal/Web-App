import { describe, expect, it } from "vitest";
import { supplierEntries, supplierRuns } from "@/lib/contract/suppliers-view";
import type { InboxBid } from "@/lib/contract/inbox";
import type { RequestGroup } from "@/lib/contract/requests";

/**
 * Suppliers mode (owner, 2026-10-11, multi-item decisions 4 and 5): one supplier at a time, newest
 * bidder first; his bids on one submission together, in the request's own machine order.
 */

const bid = (bidId: string, supplier: string, requestId: string, createdAt: string): InboxBid =>
  ({
    bidId,
    supplierName: supplier,
    supplierId: supplier,
    supplierCompanyId: null,
    supplierLogoUrl: null,
    createdAt,
    request: { id: requestId, displayId: null, shortCode: null, equipmentSummary: null, groupId: null, location: null },
  }) as unknown as InboxBid;

const group = (id: string, itemIds: string[]): RequestGroup =>
  ({ id, items: itemIds.map((i) => ({ id: i })), locationLabel: id }) as unknown as RequestGroup;

describe("the suppliers row", () => {
  it("puts the newest bidder first and counts his bids and requests", () => {
    const list = supplierEntries([
      bid("b1", "AF", "r1", "2026-10-01"),
      bid("b2", "AD", "r2", "2026-10-05"),
      bid("b3", "AF", "r2", "2026-10-03"),
    ]);
    expect(list.map((s) => s.key)).toEqual(["AD", "AF"]);
    expect(list[1].bids.length).toBe(2);
    expect(list[1].requestCount).toBe(2);
  });
});

describe("his bids in runs", () => {
  it("groups one submission's machines together, in the request's order, newest submission first", () => {
    const [af] = supplierEntries([
      bid("b1", "AF", "ex", "2026-10-01"),
      bid("b2", "AF", "sl", "2026-10-02"),
      bid("b3", "AF", "crane", "2026-10-06"),
    ]);
    const runs = supplierRuns(af, [group("g1", ["sl", "ex"]), group("g2", ["crane"])]);
    expect(runs.map((r) => r.key)).toEqual(["g2", "g1"]);
    expect(runs[1].bids.map((b) => b.bidId)).toEqual(["b2", "b1"]);
  });

  it("keeps a bid whose request is not in the list, as its own run", () => {
    const [af] = supplierEntries([bid("b1", "AF", "gone", "2026-10-01")]);
    const runs = supplierRuns(af, []);
    expect(runs).toHaveLength(1);
    expect(runs[0].group).toBeNull();
  });
});
