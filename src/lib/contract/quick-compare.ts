/**
 * Deterministic comparison math for the guest quick-compare (public-web-auth-gate T9). Request-free:
 * with no request requirements every uploaded quote qualifies, so this only computes the money layer —
 * all-in total (stated price + mobilization + demobilization) and each quote's percent above the
 * lowest all-in in the set. Kept pure (no React/DOM) so it's unit-testable and reusable.
 */
import type { NormalizedBid, ComputedBid } from "./agent-bids";

/** A parsed quote that already carries a stable id (the UI assigns one per upload). */
export type IdentifiedBid = NormalizedBid & { bid_id: string };

/** Stated all-in for one quote: price + mobilization + demobilization (missing parts count as 0). */
export function allInTotal(b: Pick<NormalizedBid, "price_amount" | "mobilization_amount" | "demobilization_amount">): number {
  return (b.price_amount ?? 0) + (b.mobilization_amount ?? 0) + (b.demobilization_amount ?? 0);
}

/**
 * Build the agent's ComputedBid[] from parsed quotes. No request → all qualify, no conflicts. `all_in_total`
 * is null when a quote has no stated money; `percent_vs_lowest` is 0 for the cheapest and a rounded %
 * above it for the rest (null when a quote or the set has no comparable total).
 */
export function toComputedBids(bids: IdentifiedBid[]): ComputedBid[] {
  const totals = bids.map(allInTotal);
  const positives = totals.filter((t) => t > 0);
  const lowest = positives.length ? Math.min(...positives) : 0;
  return bids.map((b, i) => {
    const total = totals[i] > 0 ? totals[i] : null;
    return {
      ...b,
      all_in_total: total,
      qualified: true,
      requirement_conflicts: [],
      percent_vs_lowest: total && lowest ? Math.round(((total - lowest) / lowest) * 100) : null,
    };
  });
}
