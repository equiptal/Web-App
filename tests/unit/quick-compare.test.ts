import { describe, it, expect } from "vitest";
import { allInTotal, toComputedBids, type IdentifiedBid } from "@/lib/contract/quick-compare";
import type { NormalizedBid } from "@/lib/contract/agent-bids";

// A minimal parsed quote with just the fields the money layer reads; the rest are irrelevant here.
function quote(id: string, price: number | null, mob = 0, demob = 0): IdentifiedBid {
  return {
    bid_id: id,
    source: "uploaded_quote",
    supplier_name: id,
    supplier_user_id: null,
    price_amount: price,
    price_unit: "PER_DAY",
    mobilization_amount: mob,
    demobilization_amount: demob,
    currency: "SAR",
    cost_responsibilities: {},
    equipment_subtype: null,
    equipment_capacity: null,
    equipment_year: null,
    equipment_condition: null,
    fuel_type: null,
    certificates: [],
    type_size_match: "exact",
    type_size_note: null,
    valid_until: null,
    source_file: null,
    notes: null,
  } satisfies NormalizedBid & { bid_id: string };
}

describe("quick-compare money math (T9)", () => {
  it("all-in sums price + mobilization + demobilization (missing parts = 0)", () => {
    expect(allInTotal(quote("a", 1000, 200, 100))).toBe(1300);
    expect(allInTotal(quote("b", 500))).toBe(500);
    expect(allInTotal(quote("c", null))).toBe(0);
  });

  it("marks every quote qualified with no conflicts (no request requirements)", () => {
    const out = toComputedBids([quote("a", 1000), quote("b", 2000)]);
    expect(out.every((b) => b.qualified)).toBe(true);
    expect(out.every((b) => b.requirement_conflicts.length === 0)).toBe(true);
  });

  it("computes percent-vs-lowest: cheapest is 0, others rounded % above it", () => {
    const out = toComputedBids([quote("a", 1000), quote("b", 1500), quote("c", 1250)]);
    const byId = Object.fromEntries(out.map((b) => [b.bid_id, b]));
    expect(byId.a.percent_vs_lowest).toBe(0); // lowest all-in
    expect(byId.b.percent_vs_lowest).toBe(50); // 1500 vs 1000
    expect(byId.c.percent_vs_lowest).toBe(25); // 1250 vs 1000
  });

  it("all-in includes mobilization when finding the lowest", () => {
    // b's base price is lower, but its mobilization makes its all-in higher than a.
    const out = toComputedBids([quote("a", 1000, 0), quote("b", 900, 500)]);
    const byId = Object.fromEntries(out.map((b) => [b.bid_id, b]));
    expect(byId.a.all_in_total).toBe(1000);
    expect(byId.b.all_in_total).toBe(1400);
    expect(byId.a.percent_vs_lowest).toBe(0); // a is cheapest all-in
    expect(byId.b.percent_vs_lowest).toBe(40);
  });

  it("quotes with no stated money get null totals and null percent", () => {
    const out = toComputedBids([quote("a", null), quote("b", 1000)]);
    const byId = Object.fromEntries(out.map((b) => [b.bid_id, b]));
    expect(byId.a.all_in_total).toBeNull();
    expect(byId.a.percent_vs_lowest).toBeNull();
    expect(byId.b.all_in_total).toBe(1000);
    expect(byId.b.percent_vs_lowest).toBe(0);
  });
});
