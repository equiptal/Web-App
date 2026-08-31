import { describe, it, expect } from "vitest";
import { sitesAt } from "@/components/projects/MoveDialog";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * W-T18 — leading with the sites at this row's own address.
 *
 * The whole dialog turns on one comparison. Too strict and it suggests nothing, so every renter
 * meets the dropdown and the feature may as well not exist; too loose and it offers the wrong site
 * first, which is worse than offering none — a renter who trusts the suggestion files a live request
 * under someone else's job.
 *
 * A site label is Google-formatted, so it carries a postcode and a city a renter would never type.
 * Comparing whole strings matches nothing at all; comparing the leading segment is what makes
 * *"Qiddiya Zone 4, Qiddiya City, Riyadh 13513"* and *"Qiddiya Zone 4, Riyadh"* the same place.
 */

const p = (id: string, label: string): ProjectSummary => ({
  id,
  title: null,
  location: { label, lat: null, lng: null },
  defaults: {
    timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null },
    paymentTerms: null,
  },
  version: 1,
  awards: { requests: {}, workOrderItems: {}, labels: {} },
  ownerUserId: null,
  ownerName: null,
  createdAt: null,
  updatedAt: null,
  requestCount: 0,
  workOrderCount: 0,
  unitsAwarded: 0,
  firstStart: null,
  lastEnd: null,
});

const PROJECTS = [
  p("qiddiya", "Qiddiya Zone 4, Qiddiya City, Riyadh 13513"),
  p("qiddiya2", "Qiddiya Zone 4, Riyadh"),
  p("neom", "Sector 3, The Line, NEOM 49643"),
  p("jubail", "Jubail Industrial City, Eastern Province"),
];

describe("which sites are at this address", () => {
  it("matches on the leading segment, past the postcode and the city", () => {
    const hits = sitesAt(PROJECTS, "Qiddiya Zone 4, Riyadh 13513").map((x) => x.id);
    // Both Qiddiya sites, and neither of the others.
    expect(hits).toEqual(["qiddiya", "qiddiya2"]);
  });

  it("ignores case, because one of these was typed and the other was geocoded", () => {
    expect(sitesAt(PROJECTS, "qiddiya zone 4").map((x) => x.id)).toEqual(["qiddiya", "qiddiya2"]);
  });

  it("does not match a different site in the same city", () => {
    // Riyadh is in three of these labels. Matching on it would offer the wrong project first, which
    // is worse than offering none.
    expect(sitesAt(PROJECTS, "Riyadh")).toEqual([]);
    expect(sitesAt(PROJECTS, "Al Malqa, Riyadh 13521")).toEqual([]);
  });

  it("suggests nothing rather than everything when there is no address", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(sitesAt(PROJECTS, empty)).toEqual([]);
    }
  });

  it("finds nothing when the renter has no site there yet — which the dialog says out loud", () => {
    expect(sitesAt(PROJECTS, "Yanbu Industrial City")).toEqual([]);
  });

  it("matches a single-segment label against itself", () => {
    expect(sitesAt([p("yard", "Dammam")], "Dammam").map((x) => x.id)).toEqual(["yard"]);
  });
});
