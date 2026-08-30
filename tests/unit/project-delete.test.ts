import { describe, it, expect } from "vitest";
import { projectIsEmpty } from "@/components/projects/ProjectDelete";
import { projectEnded, endedLast } from "@/lib/contract/project";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * W-T12 — when delete is offered at all, and the state that replaces an archive.
 *
 * `projectIsEmpty` decides whether a renter is shown a destructive action. Getting it wrong in the
 * generous direction offers *Delete* on a site holding requests suppliers have bid on and purchase
 * orders against them — so it is deliberately conservative: three counts, all zero, or no.
 */

const p = (over: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: "p1",
  title: null,
  location: { label: "Qiddiya Zone 4, Riyadh 13513", lat: null, lng: null },
  defaults: {
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null },
    paymentTerms: null,
  },
  version: 1,
  awards: { requests: {}, workOrderItems: {} },
  ownerUserId: null,
  ownerName: null,
  createdAt: null,
  updatedAt: null,
  requestCount: 0,
  workOrderCount: 0,
  unitsAwarded: 0,
  firstStart: null,
  lastEnd: null,
  ...over,
});

describe("when delete may be offered", () => {
  it("only on a site with nothing filed and nothing awarded", () => {
    expect(projectIsEmpty(p())).toBe(true);
  });

  it("never once anything is under it", () => {
    expect(projectIsEmpty(p({ requestCount: 1 }))).toBe(false);
    expect(projectIsEmpty(p({ workOrderCount: 1 }))).toBe(false);
    // The one that is easy to miss: an award can outlive the row it hung on, and it carries the
    // renter's marks and their purchase orders.
    expect(projectIsEmpty(p({ unitsAwarded: 1 }))).toBe(false);
  });
});

/**
 * There is no archive, and this is why: *ended* is arithmetic, not a state anyone sets. Asking a
 * renter to tell us a site is finished is asking them to do our subtraction.
 */
describe("ended, in place of an archive", () => {
  const TODAY = "2026-08-30";

  it("reads as ended once the last date under it has passed", () => {
    expect(projectEnded(p({ lastEnd: "2026-07-31" }), TODAY)).toBe(true);
    expect(projectEnded(p({ lastEnd: "2026-12-31" }), TODAY)).toBe(false);
  });

  it("falls back to the site's own end date while nothing is filed yet", () => {
    const noRows = p({
      lastEnd: null,
      defaults: { timing: { rentalBasis: null, extendable: false, startDate: null, endDate: "2026-01-01" }, paymentTerms: null },
    });
    expect(projectEnded(noRows, TODAY)).toBe(true);
  });

  it("never ends an open-ended site", () => {
    // No date at all means running until someone says otherwise, not finished.
    expect(projectEnded(p({ lastEnd: null }), TODAY)).toBe(false);
  });

  it("sorts ended sites last without dropping them", () => {
    const live = p({ id: "live", lastEnd: "2026-12-31" });
    const done = p({ id: "done", lastEnd: "2026-01-31" });
    const order = endedLast([done, live], TODAY).map((x) => x.id);

    expect(order).toEqual(["live", "done"]);
    // Not hidden. A renter who extended the hire verbally would otherwise lose their site with no
    // explanation and no way to ask for it back.
    expect(order).toHaveLength(2);
  });
});
