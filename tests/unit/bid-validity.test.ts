import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bidValidityPassed } from "@/lib/contract/bids";

/**
 * A bid past the supplier's own validity date is not shown to the renter (owner, 2026-10-12: align
 * with the app). The app's offers list reads `activeBids` only; the backend sorts a bid into
 * `expiredBids` exactly when `validUntil < now`.
 */
describe("a bid past its validity date", () => {
  const now = Date.parse("2026-10-12T10:00:00Z");
  it("is past only when the supplier set a date and it has gone by", () => {
    expect(bidValidityPassed({ validUntil: "2026-10-11T00:00:00Z" }, now)).toBe(true);
    expect(bidValidityPassed({ validUntil: "2026-10-13T00:00:00Z" }, now)).toBe(false);
    expect(bidValidityPassed({ validUntil: null }, now)).toBe(false);
    expect(bidValidityPassed({ validUntil: "not a date" }, now)).toBe(false);
  });

  it("is dropped from the workspace's cards and from suppliers mode, never from the shared list parser", () => {
    expect(readFileSync("src/components/workspace/RequestsWorkspace.tsx", "utf8")).toContain("app.bids.filter((card) => !bidValidityPassed(card))");
    expect(readFileSync("src/components/workspace/SuppliersMode.tsx", "utf8")).toContain("!bidValidityPassed(c)");
    // The deal room finds its own bid through `mapBidList`, so the parser keeps every bid.
    const bids = readFileSync("src/lib/contract/bids.ts", "utf8");
    const parser = bids.slice(bids.indexOf("export function mapBidList"), bids.indexOf("export type BidSizeCounts"));
    expect(parser).not.toContain("bidValidityPassed");
  });
});
