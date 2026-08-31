import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import type { RfqState } from "@/lib/store/rfq-store";
import { defaultProjectDetails, defaultPreferences, newManualItem } from "@/lib/contract";
import type { RfqDraft } from "@/lib/contract";
import { cityCentroid } from "@/lib/contract/saudi-cities";

/**
 * A request opened from a store belongs to that store.
 *
 * Two things have to hold, and the second is the one that bites: the recipient must survive the flow
 * (it rides in state and with the draft), and a draft written for someone ELSE must never be
 * re-addressed to this supplier behind the renter's back. The mobile app refuses to restore a stored
 * draft into a direct request for exactly that reason; these pin the same rule on the web.
 */

function draft(): RfqDraft {
  return {
    project: defaultProjectDetails(),
    items: [newManualItem("m1")],
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: { count: 1, categories: [] },
  } as unknown as RfqDraft;
}

const withDraft = (over: Partial<RfqState> = {}): RfqState => ({ ...initialState, phase: "wizard", draft: draft(), ...over });

describe("a request started from a store", () => {
  it("carries the supplier, the name and the store", () => {
    const s = reducer(initialState, { t: "SET_DIRECT", direct: { supplierId: "412", supplierName: "Zahid Tractor", storeId: "st-1" } });
    expect(s.direct).toEqual({ supplierId: "412", supplierName: "Zahid Tractor", storeId: "st-1" });
  });

  it("drops a draft written for the whole market rather than re-addressing it to one firm", () => {
    const before = withDraft();
    const after = reducer(before, { t: "SET_DIRECT", direct: { supplierId: "412", supplierName: "Zahid", storeId: null } });
    expect(after.draft).toBeNull();
    expect(after.phase).toBe("intake");
    expect(after.draftPrompt).toBe(false);
    expect(after.direct?.supplierId).toBe("412");
  });

  it("leaves the draft alone when the target has not changed — a reload is not a new request", () => {
    const target = { supplierId: "412", supplierName: "Zahid", storeId: "st-1" };
    const before = withDraft({ direct: target });
    const after = reducer(before, { t: "SET_DIRECT", direct: { ...target } });
    expect(after.draft).toBe(before.draft);
    expect(after.phase).toBe("wizard");
  });

  it("clears the recipient when the flow is opened again with no store — and clears the draft with it", () => {
    const before = withDraft({ direct: { supplierId: "412", supplierName: null, storeId: null } });
    const after = reducer(before, { t: "SET_DIRECT", direct: null });
    expect(after.direct).toBeNull();
    expect(after.draft).toBeNull();
  });
});

describe("where a machine is, when only its city is known", () => {
  it("answers the centre of a city it holds, in either language", () => {
    expect(cityCentroid("Riyadh")).toEqual({ lat: 24.7136, lng: 46.6753 });
    expect(cityCentroid("الرياض")).toEqual({ lat: 24.7136, lng: 46.6753 });
    expect(cityCentroid("  JEDDAH ")).toEqual({ lat: 21.4858, lng: 39.1925 });
  });

  it("reads a decorated city name — the payloads are not consistent about it", () => {
    expect(cityCentroid("Al Khobar - Eastern Province")).toEqual({ lat: 26.2794, lng: 50.2083 });
    expect(cityCentroid("Dammam, Saudi Arabia")).toEqual({ lat: 26.4207, lng: 50.0888 });
  });

  it("answers null for a city it does not hold — no map beats a map in the wrong place", () => {
    expect(cityCentroid("Atlantis")).toBeNull();
    expect(cityCentroid("")).toBeNull();
    expect(cityCentroid(null)).toBeNull();
  });
});
