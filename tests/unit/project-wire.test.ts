import { describe, it, expect } from "vitest";
import { projectToPayload, mapProject, basisToWire, basisFromWire } from "@/lib/contract/project";

/**
 * The wire shape of a project (reported 2026-08-30: every save returned 422).
 *
 * The backend's `defaults` is FLAT and its schema is `.strict()` — an unknown key is a 422, not a
 * dropped field. This app groups the four period values under `timing`, which is its own convenience
 * and must never cross the wire. Two shapes, one boundary, and these tests are the boundary.
 *
 * The basis is the second half of the same mismatch: the wire uses the `RentalType` enum that
 * `equipment_requests` already stores, because a site default that could not be expressed as a
 * request would be a default nothing can use.
 */

const form = {
  title: "Qiddiya Zone 4",
  location: { label: "Qiddiya Zone 4, Riyadh 13513", lat: 24.6, lng: 46.5 },
  defaults: {
    timing: { rentalBasis: "monthly" as const, extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
    paymentTerms: "net-30" as const,
  },
};

describe("what we send", () => {
  it("sends defaults FLAT — a nested `timing` is what the 422 was", () => {
    const body = projectToPayload(form);
    const defaults = body.defaults as Record<string, unknown>;

    expect(defaults.timing).toBeUndefined();
    expect(Object.keys(defaults).sort()).toEqual(["endDate", "extendable", "paymentTerms", "rentalBasis", "startDate"]);
  });

  it("sends the basis as the request enum, not this app's word", () => {
    expect((projectToPayload(form).defaults as Record<string, unknown>).rentalBasis).toBe("MONTHLY");
  });

  it("omits a value rather than sending null — `.strict()` rejects the wrong type too", () => {
    const empty = projectToPayload({
      title: null,
      location: { label: "Dammam", lat: null, lng: null },
      defaults: { timing: { rentalBasis: null, extendable: false, startDate: null, endDate: null }, paymentTerms: null },
    });
    const defaults = empty.defaults as Record<string, unknown>;

    // Omitting is how "not set" is said on this wire. `extendable: false` is a real answer and stays.
    expect(Object.keys(defaults)).toEqual(["extendable"]);
    expect(defaults.extendable).toBe(false);
  });

  it("never sends hoursPerDay — the project does not hold one", () => {
    expect((projectToPayload(form).defaults as Record<string, unknown>).hoursPerDay).toBeUndefined();
  });
});

describe("what we read back", () => {
  it("reads the flat shape into this app's grouping", () => {
    const p = mapProject({
      id: "p1",
      title: null,
      locationLabel: "Qiddiya Zone 4, Riyadh 13513",
      defaults: { rentalBasis: "MONTHLY", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31", paymentTerms: "net-30" },
      version: 3,
    });

    expect(p.defaults.timing.rentalBasis).toBe("monthly");
    expect(p.defaults.timing.startDate).toBe("2026-09-01");
    expect(p.defaults.paymentTerms).toBe("net-30");
    expect(p.version).toBe(3);
  });

  it("survives a project the backend wrote with no defaults at all", () => {
    const p = mapProject({ id: "p1", locationLabel: "Dammam" });
    expect(p.defaults.timing.rentalBasis).toBeNull();
    expect(p.defaults.timing.startDate).toBeNull();
  });

  it("round-trips", () => {
    const p = mapProject({
      id: "p1",
      locationLabel: form.location.label,
      defaults: projectToPayload(form).defaults as Record<string, unknown>,
    });
    expect(p.defaults.timing).toEqual(form.defaults.timing);
    expect(p.defaults.paymentTerms).toBe("net-30");
  });
});

describe("the basis enum", () => {
  it("maps both ways", () => {
    expect(basisToWire("monthly")).toBe("MONTHLY");
    expect(basisFromWire("MONTHLY")).toBe("monthly");
  });

  it("reads an enum this app has no control for as unset", () => {
    // PER_JOB and LONG_TERM are valid on a request and have no dropdown here. Showing a value no
    // control can display would leave the renter unable to change it.
    expect(basisFromWire("PER_JOB")).toBeNull();
    expect(basisFromWire("LONG_TERM")).toBeNull();
  });

  it("sends nothing rather than a guess for an unmapped word", () => {
    expect(basisToWire(null)).toBeNull();
    expect(basisToWire("fortnightly")).toBeNull();
  });
});
