import { describe, it, expect } from "vitest";
import {
  parseAddress, groupRequests, mapRequestListItem, publicTaxonomyUrl, cappedFilled,
  isCancellable, cancellableItems, statusCounts, statusSummary, representativeStatus, cancelBlockedReason,
  REQUEST_STATUS, type RequestListItem, type RequestRecord,
} from "@/lib/contract/requests";

/* ------------------------------- cappedFilled (fulfillment math) ------------------------------- */

describe("cappedFilled", () => {
  it("sums on- + off-platform offered units (10 needed: 2 + 3 → 5)", () => {
    expect(cappedFilled(10, 2 + 3, 0)).toBe(5);
  });
  it("a 1-unit line with one bid is 1/1", () => {
    expect(cappedFilled(1, 1, 0)).toBe(1);
  });
  it("caps at the units needed (never over-fills)", () => {
    expect(cappedFilled(3, 5, 4)).toBe(3);
  });
  it("adds off-platform covered units", () => {
    expect(cappedFilled(10, 2, 3)).toBe(5);
  });
  it("is 0 when there are no bids", () => {
    expect(cappedFilled(10, 0, 0)).toBe(0);
  });
});

/* ------------------------------- publicTaxonomyUrl ------------------------------- */

describe("publicTaxonomyUrl", () => {
  it("rebuilds a backend env-bucket URL against the public taxonomy bucket (same key)", () => {
    const raw = "https://moedatech-staging-private.s3.eu-central-1.amazonaws.com/default/equipment-taxonomy/excavator.svg?X-Amz-Signature=abc";
    expect(publicTaxonomyUrl(raw)).toBe("https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment-taxonomy/excavator.svg");
  });

  it("prefixes a bare key (encoding spaces)", () => {
    expect(publicTaxonomyUrl("default/equipment-taxonomy/boom lift.jpg")).toBe(
      "https://moedatech-eu-storage.s3.eu-central-1.amazonaws.com/default/equipment-taxonomy/boom%20lift.jpg",
    );
  });

  it("returns null for missing input", () => {
    expect(publicTaxonomyUrl(null)).toBeNull();
    expect(publicTaxonomyUrl(undefined)).toBeNull();
  });
});

/* ---------------------------------- parseAddress ---------------------------------- */

describe("parseAddress", () => {
  it("parses a standard Saudi formatted address (drops country, strips postcode)", () => {
    expect(parseAddress("7194 Ibn Barakah, Al Olaya, Riyadh 12331, Saudi Arabia")).toEqual({
      city: "Riyadh",
      neighbourhood: "Al Olaya",
    });
  });

  it("handles a venue + city (two segments)", () => {
    expect(parseAddress("King Abdulaziz International Airport, Jeddah")).toEqual({
      city: "Jeddah",
      neighbourhood: "King Abdulaziz International Airport",
    });
  });

  it("strips a trailing postcode from the city segment", () => {
    expect(parseAddress("Al Olaya, Riyadh 12331").city).toBe("Riyadh");
  });

  it("returns the bare city with no neighbourhood", () => {
    expect(parseAddress("Riyadh")).toEqual({ city: "Riyadh", neighbourhood: null });
  });

  it("falls back to nulls for empty/missing input", () => {
    expect(parseAddress(null)).toEqual({ city: null, neighbourhood: null });
    expect(parseAddress("")).toEqual({ city: null, neighbourhood: null });
    expect(parseAddress("   ")).toEqual({ city: null, neighbourhood: null });
  });
});

/* ---------------------------------- groupRequests ---------------------------------- */

const li = (p: Partial<RequestListItem>): RequestListItem => ({
  id: "x",
  requestGroupId: null,
  groupRef: null,
  displayId: "REQ-1",
  type: "BROADCAST",
  status: "OPEN",
  urgency: null,
  rentalType: "DAILY",
  city: "Al Olaya, Riyadh 12331, Saudi Arabia",
  startDate: null,
  endDate: null,
  durationDays: null,
  createdAt: null,
  bidCount: 0,
  mobByRentee: null,
  demobByRentee: null,
  item: null,
  ...p,
});

describe("groupRequests", () => {
  it("clusters by requestGroupId, preserving first-appearance order", () => {
    const groups = groupRequests([
      li({ id: "a", requestGroupId: "g1" }),
      li({ id: "b", requestGroupId: "g2" }),
      li({ id: "c", requestGroupId: "g1" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("treats a null requestGroupId as a solo group keyed by the request id", () => {
    const groups = groupRequests([li({ id: "solo", requestGroupId: null })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("solo");
    expect(groups[0].items).toHaveLength(1);
  });

  it("sums bid counts and flags ASAP if any item is urgent", () => {
    const [g] = groupRequests([
      li({ requestGroupId: "g", bidCount: 3, urgency: "SOON" }),
      li({ requestGroupId: "g", bidCount: 2, urgency: "ASAP" }),
    ]);
    expect(g.totalBids).toBe(5);
    expect(g.asap).toBe(true);
  });

  it("derives the location label (City — Neighbourhood) from the address", () => {
    const [g] = groupRequests([li({ requestGroupId: "g", city: "Al Olaya, Riyadh 12331, Saudi Arabia" })]);
    expect(g.locationLabel).toBe("Riyadh — Al Olaya");
    expect(g.city).toBe("Riyadh");
    expect(g.neighbourhood).toBe("Al Olaya");
  });
});

/* ------------------------- cancellability (per item, never per group) ------------------------- */

describe("isCancellable", () => {
  it("allows exactly what the backend allows (OPEN / ACTIVE)", () => {
    expect(isCancellable("OPEN")).toBe(true);
    expect(isCancellable("ACTIVE")).toBe(true);
  });

  it("refuses every other status the renter can see", () => {
    for (const s of ["ACCEPTED", "PARTIALLY_ACCEPTED", "EXPIRED", "FORCE_EXPIRED", "CLOSED", "HUB_CLOSED", "CANCELLED", "ABANDONED"]) {
      expect(isCancellable(s)).toBe(false);
    }
    expect(isCancellable(null)).toBe(false);
    expect(isCancellable(undefined)).toBe(false);
    expect(isCancellable("SOMETHING_NEW")).toBe(false);
  });
});

describe("cancellableItems", () => {
  const items = [
    li({ id: "a", status: "OPEN" }),
    li({ id: "b", status: "ACCEPTED" }),
    li({ id: "c", status: "ACTIVE" }),
    li({ id: "d", status: "EXPIRED" }),
  ];

  it("keeps only the members the backend will accept a DELETE for", () => {
    expect(cancellableItems(items).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("is non-empty for a part-accepted RFQ — the bug: the old roll-up hid the ✕ for the whole group", () => {
    expect(cancellableItems([li({ status: "OPEN" }), li({ status: "ACCEPTED" })])).toHaveLength(1);
  });

  it("is empty when nothing is live, so the ✕ is correctly withheld", () => {
    expect(cancellableItems([li({ status: "ACCEPTED" }), li({ status: "EXPIRED" })])).toEqual([]);
    expect(cancellableItems([])).toEqual([]);
  });
});

/* ------------------------------- status roll-up (replaces "MIXED") ------------------------------- */

describe("statusCounts", () => {
  it("tallies distinct statuses, most-common first", () => {
    expect(statusCounts([li({ status: "OPEN" }), li({ status: "ACCEPTED" }), li({ status: "OPEN" })])).toEqual([
      { status: "OPEN", count: 2 },
      { status: "ACCEPTED", count: 1 },
    ]);
  });

  it("breaks count ties by first appearance (stable)", () => {
    expect(statusCounts([li({ status: "EXPIRED" }), li({ status: "OPEN" })]).map((c) => c.status)).toEqual(["EXPIRED", "OPEN"]);
  });

  it("is empty for no items", () => {
    expect(statusCounts([])).toEqual([]);
  });
});

describe("statusSummary", () => {
  it("reads as a plain status when every item agrees (no regression for uniform RFQs)", () => {
    const items = [li({ status: "OPEN" }), li({ status: "OPEN" })];
    expect(statusSummary(items, false)).toBe("Open");
    expect(statusSummary(items, true)).toBe("مفتوح");
  });

  it("spells out the split instead of the old opaque \"Mixed\"", () => {
    const items = [li({ status: "OPEN" }), li({ status: "ACCEPTED" }), li({ status: "OPEN" })];
    expect(statusSummary(items, false)).toBe("Open (2) · Accepted (1)");
    expect(statusSummary(items, true)).toBe("مفتوح (2) · مقبول (1)");
  });

  it("caps at two segments and counts the overflow", () => {
    const items = [li({ status: "OPEN" }), li({ status: "ACCEPTED" }), li({ status: "EXPIRED" }), li({ status: "CANCELLED" })];
    expect(statusSummary(items, false)).toBe("Open (1) · Accepted (1) · +2");
  });

  it("never renders the word \"Mixed\" — the label was removed", () => {
    expect(REQUEST_STATUS.MIXED).toBeUndefined();
    expect(statusSummary([li({ status: "OPEN" }), li({ status: "ACTIVE" })], false)).not.toContain("Mixed");
  });

  it("degrades to a dash for an empty group", () => {
    expect(statusSummary([], false)).toBe("—");
  });
});

describe("representativeStatus", () => {
  it("prefers a live status so the badge colour tracks what is still actionable", () => {
    expect(representativeStatus([li({ status: "ACCEPTED" }), li({ status: "ACCEPTED" }), li({ status: "OPEN" })])).toBe("OPEN");
  });

  it("falls back to the most common when nothing is live", () => {
    expect(representativeStatus([li({ status: "EXPIRED" }), li({ status: "ACCEPTED" }), li({ status: "ACCEPTED" })])).toBe("ACCEPTED");
  });

  it("is null for an empty group", () => {
    expect(representativeStatus([])).toBeNull();
  });
});

describe("cancelBlockedReason", () => {
  it("explains an accepted item in both languages", () => {
    expect(cancelBlockedReason("ACCEPTED", false)).toContain("accepted");
    expect(cancelBlockedReason("ACCEPTED", true)).toContain("قبول");
  });

  it("distinguishes expired and already-cancelled from accepted", () => {
    expect(cancelBlockedReason("EXPIRED", false)).toContain("expired");
    expect(cancelBlockedReason("CANCELLED", false)).toContain("already cancelled");
  });

  it("falls back to the status label for anything unmapped", () => {
    expect(cancelBlockedReason("HUB_CLOSED", false)).toContain("Closed");
    expect(cancelBlockedReason("WEIRD_NEW_STATUS", false)).toContain("WEIRD_NEW_STATUS");
  });
});

/* ---------------------------------- mapRequestListItem ---------------------------------- */

describe("mapRequestListItem", () => {
  it("surfaces requestGroupId from the raw record", () => {
    const rec = { id: "r1", requestGroupId: "g1", status: "OPEN", type: "BROADCAST", bidCount: 2, equipmentItems: [] } as unknown as RequestRecord;
    expect(mapRequestListItem(rec).requestGroupId).toBe("g1");
  });

  it("maps a null group id to null", () => {
    const rec = { id: "r1", status: "OPEN", type: "BROADCAST", equipmentItems: [] } as unknown as RequestRecord;
    expect(mapRequestListItem(rec).requestGroupId).toBeNull();
  });
});
