import { describe, it, expect } from "vitest";
import { orderColumnsForExport, workspaceExportTotals } from "@/lib/contract/workspace-export";
import type { WorkspaceBid } from "@/lib/contract/workspace";
import type { BidCard } from "@/lib/contract/bids";
import type { BidColumn } from "@/lib/contract/comparison";

const bid = (id: string, p: Partial<BidCard> = {}): WorkspaceBid => ({
  source: "app",
  card: {
    id,
    price: 80210,
    priceUnit: "PER_MONTH",
    mobPrice: 0,
    demobPrice: 1500,
    unitsOffered: 1,
    numberOfUnits: 1,
    ...p,
  } as unknown as BidCard,
});

const REQUEST = { durationDays: 180, startDate: "2026-08-12" };

describe("workspaceExportTotals", () => {
  it("exports the whole rental, matching the matrix's duration column", () => {
    const t = workspaceExportTotals({ bids: [bid("a")], ...REQUEST });
    // (80,210 ÷ 26) × 154 billable days + 1,500 once, then VAT — 548,079.
    expect(Math.round(t.a.grandTotal!.value)).toBe(548079);
    expect(Math.round(t.a.rental!.value)).toBe(475090);
    expect(t.a.mobDemob!.value).toBe(1500);
  });

  it("falls back to the first cycle when the request states no duration", () => {
    const t = workspaceExportTotals({ bids: [bid("a")], durationDays: null, startDate: null });
    // One period plus both legs — the only total the matrix can honestly print without a duration.
    expect(Math.round(t.a.grandTotal!.value)).toBe(93967);
  });

  it("marks a price the bid never stated as unstated, not as zero", () => {
    const t = workspaceExportTotals({ bids: [bid("a", { price: null })], ...REQUEST });
    expect(t.a.grandTotal!.stated).toBe(false);
    expect(t.a.rental!.stated).toBe(false);
  });

  it("tells 'charges nothing to deliver' apart from 'never said'", () => {
    const free = workspaceExportTotals({ bids: [bid("a", { mobPrice: 0, demobPrice: 0 })], ...REQUEST });
    expect(free.a.mobDemob).toEqual({ value: 0, stated: true });

    const silent = workspaceExportTotals({ bids: [bid("b", { mobPrice: null, demobPrice: null })], ...REQUEST });
    expect(silent.b.mobDemob).toEqual({ value: 0, stated: false });
  });

  it("multiplies by the units offered", () => {
    const t = workspaceExportTotals({ bids: [bid("a", { unitsOffered: 2 })], ...REQUEST });
    expect(Math.round(t.a.rental!.value)).toBe(475090 * 2);
  });

  it("keys every bid it was given", () => {
    const t = workspaceExportTotals({ bids: [bid("a"), bid("b")], ...REQUEST });
    expect(Object.keys(t).sort()).toEqual(["a", "b"]);
  });
});

describe("orderColumnsForExport", () => {
  const col = (id: string) => ({ bid: { id } }) as BidColumn;

  it("puts the columns in the order the matrix shows them", () => {
    const out = orderColumnsForExport([col("a"), col("b"), col("c")], ["c", "a", "b"]);
    expect(out.map((c) => c.bid.id)).toEqual(["c", "a", "b"]);
  });

  it("carries a column the order does not mention rather than dropping it", () => {
    const out = orderColumnsForExport([col("a"), col("z")], ["a"]);
    expect(out.map((c) => c.bid.id)).toEqual(["a", "z"]);
  });

  it("does not mutate what it was given", () => {
    const cols = [col("a"), col("b")];
    orderColumnsForExport(cols, ["b", "a"]);
    expect(cols.map((c) => c.bid.id)).toEqual(["a", "b"]);
  });
});
