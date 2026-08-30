import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import { termsFromWire, termsToWire, type MachineTerms, type WireTerms } from "@/lib/contract/work-order";
import { machineTermsOfRequestItem } from "@/lib/contract/project-apply";
import type { ProjectSummary } from "@/lib/contract/project";

/**
 * W-T9 — *Start from*.
 *
 * Two things carry the risk here, and neither is the dropdown.
 *
 *  1. **`terms` has two shapes.** The backend stores a compact blob; the merge writes the shape that
 *     mirrors a draft line. A translation that loses a key silently drops a term the renter set once
 *     and expects on every request at that site.
 *  2. **A template must copy how they HIRE, never what they are hiring.** Equipment always comes
 *     from the text the renter typed. A template that added a machine would post an RFQ for
 *     something nobody asked for.
 */

const QIDDIYA: ProjectSummary = {
  id: "p1",
  title: "Qiddiya Zone 4",
  location: { label: "Qiddiya Zone 4, Riyadh 13513", lat: 24.6, lng: 46.5 },
  defaults: {
    timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31" },
    paymentTerms: "net-30",
  },
  version: 1,
  awards: { requests: {}, workOrderItems: {} },
  ownerUserId: null,
  ownerName: null,
  createdAt: null,
  updatedAt: null,
  requestCount: 0,
  workOrderCount: 1,
  unitsAwarded: 0,
  firstStart: null,
  lastEnd: null,
};

/* ============================================================================================== *
 * The two shapes of `terms`
 * ============================================================================================== */

describe("the stored blob and the shape the merge uses", () => {
  const wire: WireTerms = {
    operator: "yes",
    nationality: "restricted",
    natCustom: "Saudi only",
    opCerts: ["spsp"],
    night: true,
    fatRequired: true,
    fatFood: "supplier",
    fatAT: "me",
    safety: ["aramco"],
    safetyOther: "site pass",
    delivery: "supplier",
    ret: "me",
    fuelResp: "me",
    year: "2021",
    fuelType: "diesel",
  };

  it("survives a round trip without losing a key", () => {
    // The point of having exactly two translation sites is that this holds. A dropped key here is a
    // term the renter set once and never sees again.
    const back = termsToWire(termsFromWire(wire));
    expect(back).toEqual(wire);
  });

  it("reads a blob that is missing keys rather than throwing", () => {
    // An older row, or one written before a field existed. A template is a convenience; it must not
    // be able to break the request form.
    const t = termsFromWire({ operator: "no" });
    expect(t.operatorNeeded).toBe("no");
    expect(t.fuelType).toBeNull();
    expect(t.operator.certificate).toEqual([]);
    expect(() => termsFromWire(null)).not.toThrow();
    expect(() => termsFromWire(undefined)).not.toThrow();
  });
});

/* ============================================================================================== *
 * A past request as a template
 * ============================================================================================== */

describe("lifting terms off a posted request", () => {
  it("turns the record's booleans back into a party", () => {
    // The stored request says WHO does it as a boolean; the draft says which party. Getting this
    // backwards assigns the renter a transport leg they never agreed to.
    const t = machineTermsOfRequestItem({
      operatorIncluded: "YES",
      mobilizationByRentee: true,
      demobilizationByRentee: false,
      dieselIncluded: true,
      fuelTypePreference: "diesel",
      maxEquipmentAge: 2021,
      safetyCertifications: ["aramco"],
    });

    expect(t.operatorNeeded).toBe("yes");
    expect(t.deliveryOverride).toBe("me");
    expect(t.returnOverride).toBe("supplier");
    expect(t.fuelResponsibilityOverride).toBe("supplier");
    expect(t.equipmentYear).toBe("2021");
    expect(t.safetyCertsOverride).toEqual(["aramco"]);
  });

  it("says nothing where the record said nothing", () => {
    const t = machineTermsOfRequestItem({});
    // null means "the template is silent", which the merge reads as leave-alone. A `false` here
    // would quietly assign every leg to the supplier.
    expect(t.deliveryOverride).toBeNull();
    expect(t.returnOverride).toBeNull();
    expect(t.fuelResponsibilityOverride).toBeNull();
    expect(t.operatorNeeded).toBeNull();
  });
});

/* ============================================================================================== *
 * Picking one
 * ============================================================================================== */

describe("picking a template", () => {
  const TERMS = termsFromWire({ operator: "no", delivery: "me", fuelType: "diesel" }) as MachineTerms;
  const pick = () => reducer(initialState, { t: "SELECT_PROJECT", project: QIDDIYA });

  it("holds the terms until the agent returns, and records the source", () => {
    const s = reducer(pick(), { t: "USE_TEMPLATE", terms: TERMS, groupId: "g1", when: null });
    expect(s.templateTerms?.deliveryOverride).toBe("me");
    expect(s.workOrderGroupId).toBe("g1");
  });

  it("takes the source's own period onto the pills, without marking them as the renter's", () => {
    const s = reducer(pick(), {
      t: "USE_TEMPLATE",
      terms: TERMS,
      groupId: "g1",
      when: { startDate: "2026-10-01", endDate: null },
    });

    expect(s.project?.defaults.timing.startDate).toBe("2026-10-01");
    // The end date was not overridden by the source, so the site's own stands.
    expect(s.project?.defaults.timing.endDate).toBe("2026-12-31");
    // Not dirty: the value came from inside the site, not from the renter answering a question.
    expect(s.projectDirty).toEqual([]);
  });

  it("drops the template when the site is deselected", () => {
    const used = reducer(pick(), { t: "USE_TEMPLATE", terms: TERMS, groupId: "g1", when: null });
    const cleared = reducer(used, { t: "CLEAR_PROJECT" });

    // It was a thing inside that project. Leaving its terms behind would carry values from a site
    // the renter just removed, with nothing on screen saying where they came from.
    expect(cleared.templateTerms).toBeNull();
    expect(cleared.workOrderGroupId).toBeNull();
  });
});
