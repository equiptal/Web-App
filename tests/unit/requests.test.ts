import { describe, it, expect } from "vitest";
import { parseAddress, groupRequests, mapRequestListItem, publicTaxonomyUrl, type RequestListItem, type RequestRecord } from "@/lib/contract/requests";

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

  it("derives a single shared status, else MIXED", () => {
    const same = groupRequests([li({ requestGroupId: "g", status: "OPEN" }), li({ requestGroupId: "g", status: "OPEN" })]);
    expect(same[0].overallStatus).toBe("OPEN");
    const mixed = groupRequests([li({ requestGroupId: "g", status: "OPEN" }), li({ requestGroupId: "g", status: "ACTIVE" })]);
    expect(mixed[0].overallStatus).toBe("MIXED");
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
