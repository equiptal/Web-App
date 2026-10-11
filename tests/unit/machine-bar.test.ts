import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { showsMachineBar, supplierMachines } from "@/lib/contract/machine-bar";
import type { InboxBid } from "@/lib/contract/inbox";
import type { RequestListItem } from "@/lib/contract/requests";

/**
 * The bid map's machine bar (owner, 2026-10-11, multi-item decision 6, M1): every machine of the
 * request in the renter's order, with THIS supplier's bid on each, or none.
 */

const item = (id: string, name: string): RequestListItem =>
  ({ id, displayId: id, item: { name, nameAr: name, qty: 1, imageUrl: null, imageIsPhoto: false, categoryId: null } }) as unknown as RequestListItem;
const bid = (bidId: string, supplier: string, requestId: string, price: number): InboxBid =>
  ({ bidId, supplierName: supplier, supplierId: supplier, supplierCompanyId: null, currentPrice: price, priceUnit: "PER_DAY", request: { id: requestId } }) as unknown as InboxBid;

const items = [item("crane", "All-Terrain Crane"), item("sl", "Spider Lift"), item("ex", "Crawler Excavator")];
const received = [bid("b1", "AF", "sl", 1600), bid("b2", "AF", "ex", 2100), bid("b3", "AD", "crane", 3800)];
const current = { bidId: "b1", supplierCompanyId: null, supplierId: "AF", supplierName: "AF" };

describe("the machine bar", () => {
  it("lists every machine in the request's order, with his bid or none", () => {
    const m = supplierMachines(items, received, current);
    expect(m.map((x) => x.itemId)).toEqual(["crane", "sl", "ex"]);
    expect(m.map((x) => x.bidId)).toEqual([null, "b1", "b2"]);
    expect(m[1].price).toBe(1600);
  });

  it("never shows another supplier's bid", () => {
    expect(supplierMachines(items, received, current)[0].bidId).toBeNull();
  });

  it("shows only on a multi-item request where he has two or more bids", () => {
    expect(showsMachineBar(supplierMachines(items, received, current))).toBe(true);
    expect(showsMachineBar(supplierMachines(items, [received[0]], current))).toBe(false);
    expect(showsMachineBar(supplierMachines([items[1]], received, current))).toBe(false);
  });
});

describe("the bar draws only the machines he bid on (owner, 2026-10-12)", () => {
  const src = readFileSync("src/components/map/MachineBar.tsx", "utf8");
  it("filters out a machine with no bid from him, and never says «No bid from him»", () => {
    expect(src).toContain("machines.filter((m) => m.bidId != null).map(");
    expect(src).not.toContain('L("No bid from him"');
    expect(src).not.toContain("border-dashed");
  });
  it("still needs two of his bids for the bar to show at all", () => {
    expect(showsMachineBar(supplierMachines(items, received, current))).toBe(true);
    expect(showsMachineBar(supplierMachines(items, [bid("b1", "AF", "sl", 1600)], current))).toBe(false);
  });
});
