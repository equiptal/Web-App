import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { budgetVerdict } from "@/lib/pricing/rental";
import { yourBudgetLabel } from "@/lib/contract/request-fields";

/**
 * Owner, 2026-09-28: *"for bids in requests i want u to show «your budget» in the navy card of the
 * request card, maybe another stuck card, and on each bid show arrow above or below the budget"*.
 */

const monthly = { amount: 7500, rentalType: "MONTHLY" };

describe("budgetVerdict: an offer against the budget", () => {
  it("is above, below or equal when both are for the SAME period", () => {
    expect(budgetVerdict(9000, "PER_MONTH", monthly)).toBe("above");
    expect(budgetVerdict(6000, "PER_MONTH", monthly)).toBe("below");
    expect(budgetVerdict(7500, "PER_MONTH", monthly)).toBe("equal");
    expect(budgetVerdict(300, "PER_DAY", { amount: 400, rentalType: "DAILY" })).toBe("below");
    expect(budgetVerdict(2000, "PER_WEEK", { amount: 1800, rentalType: "WEEKLY" })).toBe("above");
    expect(budgetVerdict(50000, "PER_JOB", { amount: 40000, rentalType: "PER_JOB" })).toBe("above");
  });

  it("says NOTHING when the periods differ, rather than inventing a conversion", () => {
    // 400/day against 7,500/month is neither above nor below without a guess at working days.
    expect(budgetVerdict(400, "PER_DAY", monthly)).toBeNull();
    expect(budgetVerdict(9000, "PER_MONTH", { amount: 7500, rentalType: "LONG_TERM" })).toBeNull();
    expect(budgetVerdict(9000, "PER_MONTH", { amount: 7500, rentalType: null })).toBeNull();
  });

  it("says nothing without a budget or without a price", () => {
    expect(budgetVerdict(9000, "PER_MONTH", null)).toBeNull();
    expect(budgetVerdict(9000, "PER_MONTH", { amount: 0, rentalType: "MONTHLY" })).toBeNull();
    expect(budgetVerdict(null, "PER_MONTH", monthly)).toBeNull();
    expect(budgetVerdict(0, "PER_MONTH", monthly)).toBeNull();
  });
});

describe("yourBudgetLabel", () => {
  const L = (en: string) => en;
  it("names the period", () => {
    expect(yourBudgetLabel("MONTHLY", L)).toBe("Your budget (per month)");
    expect(yourBudgetLabel("DAILY", L)).toBe("Your budget (per day)");
    expect(yourBudgetLabel("LONG_TERM", L)).toBe("Your budget");
  });
});

describe("the wiring (read from the source: jsdom cannot lay the row out)", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, "../../src", p), "utf8");
  const workspace = read("components/workspace/RequestsWorkspace.tsx");
  const bar = read("components/workspace/RequestContextBar.tsx");
  const cards = read("components/workspace/BidCards.tsx");

  it("reads the budget off the item's DETAIL record, every time, since the list has none", () => {
    expect(workspace).toContain("setItemBudget(amount > 0 ? { amount, rentalType: rec.rentalType ?? row.rentalType ?? null } : null)");
    // A Decimal arrives as a string, so it is read with Number.
    expect(workspace).toContain("const amount = Number(rec.budgetCeiling ?? NaN);");
    expect(workspace).toContain("budget={itemBudget}");
  });

  it("draws «Your budget» as the SAME card's light grey side section, only when there is one", () => {
    expect(bar).toContain("{budget && (");
    expect(bar).toContain('pin("request-budget")');
    expect(bar).toContain("yourBudgetLabel(budget.rentalType, L)");
    // One card: the navy part keeps the leading corners, the grey part the trailing ones.
    expect(bar).toContain('budget ? "rounded-s-md" : "rounded-md"');
    expect(bar).toContain("rounded-e-md border border-s-0 border-navy bg-surface2");
  });

  it("puts the arrow on each bid from the LIVE rate", () => {
    expect(cards).toContain("const verdict = budgetVerdict(card.price, card.priceUnit, budget);");
    expect(cards).toContain('verdict === "above" ? "arrow_upward"');
  });
});
