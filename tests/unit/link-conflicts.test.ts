import { describe, expect, it } from "vitest";
import { linkTermVerdict, linkConflictCount, linkTermsWereStated } from "@/lib/governance/link-conflicts";
import type { LinkBidItem } from "@/lib/contract/link-bids";

/**
 * `submissionToBidCard` returns `conflictCount: 0` for every shared-link submission, so the
 * governance board recorded every off-platform bid as having met every term. The answers were on
 * the form the whole time. These are the cases that decide whether reading them is safe.
 */

const item = (over: Partial<LinkBidItem> = {}): LinkBidItem =>
  ({ requestItemId: "i1", numberOfUnits: 1, ...over }) as LinkBidItem;

describe("linkTermVerdict", () => {
  it("counts a term the renter asked for and the supplier did not confirm", () => {
    const v = linkTermVerdict(
      item({
        requiredTerms: { operator: "Included", fuel: "On supplier", payment: "30 days" },
        confirmations: { operator: true, fuel: false, payment: true },
      } as never),
    );
    expect(v.missed).toEqual(["Fuel"]);
    expect(v.met).toEqual(["Operator included", "Payment terms"]);
    expect(linkConflictCount(item({ requiredTerms: { fuel: "On supplier" }, confirmations: { fuel: false } } as never))).toBe(1);
  });

  it("ignores a term the renter never asked for", () => {
    /* Counting an unanswered term nobody asked about would mark every supplier non-compliant
       against a bar that was never set. */
    const v = linkTermVerdict(
      item({ requiredTerms: { operator: "Included", nightShift: null, overtime: "" }, confirmations: { operator: true } } as never),
    );
    expect(v.missed).toEqual([]);
    expect(v.met).toEqual(["Operator included"]);
  });

  it("treats an unanswered question as a miss, not as silence", () => {
    /* `undefined` means the supplier was never shown the question even though the renter asked
       it. That is a gap in the answer, and it is not a pass. */
    const v = linkTermVerdict(item({ requiredTerms: { breakdownSla: "4 hours" }, confirmations: {} } as never));
    expect(v.missed).toEqual(["Breakdown response"]);
  });

  it("judges each certificate code on its own, and names which one is missing", () => {
    /* A cert term can list several codes and the form carries a per-code answer, so a supplier
       can hold TÜV and not SASO. "Failed the certificate term" does not tell a reader which. */
    const v = linkTermVerdict(
      item({
        requiredTerms: { equipmentCert: "TUV, SASO" },
        confirmations: { "equipmentCert::TUV": true, "equipmentCert::SASO": false },
      } as never),
    );
    expect(v.met).toEqual(["Equipment certificate: TÜV"]);
    expect(v.missed).toEqual(["Equipment certificate: SASO"]);
  });

  it("falls back to the aggregate answer on an older submission with no per-code answers", () => {
    const v = linkTermVerdict(
      item({ requiredTerms: { equipmentCert: "TUV, SASO" }, confirmations: { equipmentCert: true } } as never),
    );
    /* The aggregate is true only when every code is Yes, so both pass. */
    expect(v.missed).toEqual([]);
    expect(v.met).toHaveLength(2);
  });

  it("separates 'met everything' from 'was never judged'", () => {
    /* Both produce an empty `missed`, and they are completely different claims. A request that
       stated no terms leaves the bid UNJUDGED, and recording it as compliant is the whole bug. */
    const judged = item({ requiredTerms: { operator: "Included" }, confirmations: { operator: true } } as never);
    const unjudged = item({ requiredTerms: {}, confirmations: {} } as never);
    expect(linkTermVerdict(judged).missed).toEqual([]);
    expect(linkTermVerdict(unjudged).missed).toEqual([]);
    expect(linkTermsWereStated(judged)).toBe(true);
    expect(linkTermsWereStated(unjudged)).toBe(false);
  });

  it("survives a submission that carries neither block", () => {
    expect(linkTermVerdict(null)).toEqual({ missed: [], met: [] });
    expect(linkTermVerdict(item())).toEqual({ missed: [], met: [] });
    expect(linkTermsWereStated(undefined)).toBe(false);
  });
});
