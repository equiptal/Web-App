import { describe, it, expect } from "vitest";
import { itemDetailRows, requestDetailRows } from "@/lib/contract/request-fields";
import type { RequestItem, RequestRecord } from "@/lib/contract/requests";

/**
 * The request details modal has to show EVERY parameter the request stores (owner, 2026-08-29).
 *
 * That is a claim about coverage, so the test that matters is the one that fails when the backend
 * grows a field nobody wired up. `every stored field reaches a row` below is that test: it lists the
 * request-level fields by hand and asserts each one appears, so adding a field to `RequestRecord`
 * without adding it here is the moment to decide whether the renter should see it.
 *
 * The rest pin the two rules the rows are built on: a value that is absent is DROPPED rather than
 * printed as a dash, and a boolean whose meaning lives in its field name is stated in words.
 */

const L = (en: string) => en;

/** Every request-level parameter, all set, so nothing can pass by being null. */
const FULL: RequestRecord = {
  id: "r1",
  type: "EQUIPMENT_RENTAL" as RequestRecord["type"],
  status: "OPEN" as RequestRecord["status"],
  rentalType: "MONTHLY",
  urgency: "ASAP" as RequestRecord["urgency"],
  estimatedDurationDays: 30,
  workingHoursPerDay: 10,
  workingDaysPerWeek: 6,
  jobEstimatedHours: 240,
  overtimeRate: "1.5X",
  terrainType: "ROCKY",
  fulfillmentType: "DIRECT",
  paymentTerms: "NET-30",
  paymentMethod: "BANK_TRANSFER",
  breakdownResponseSla: "TWENTY_FOUR_HR",
  maintenanceResponsibility: "SUPPLIER",
  budgetCeiling: 120000,
  minimumSupplierRating: 4.5,
  deliveryLeadTime: "THREE_DAYS",
  offerDuration: "48H",
  verifiedSuppliersOnly: true,
  equipmentStorageOnSite: false,
  subletting: true,
  localContent: true,
  extendable: true,
  equipmentItems: [],
};

/** The label each field is expected to arrive under. */
const EXPECTED: Record<string, string> = {
  rentalType: "Rental basis",
  urgency: "Urgency",
  workingHoursPerDay: "Working hours",
  workingDaysPerWeek: "Working days / week",
  jobEstimatedHours: "Estimated job hours",
  overtimeRate: "Overtime rate",
  terrainType: "Terrain",
  fulfillmentType: "Fulfillment",
  paymentTerms: "Payment terms",
  paymentMethod: "Payment method",
  breakdownResponseSla: "Breakdown response",
  maintenanceResponsibility: "Maintenance",
  budgetCeiling: "Budget",
  minimumSupplierRating: "Min. supplier rating",
  deliveryLeadTime: "Delivery lead time",
  offerDuration: "Offer duration",
  verifiedSuppliersOnly: "Verified suppliers only",
  equipmentStorageOnSite: "On-site storage",
  subletting: "Subletting allowed",
  localContent: "Local content",
  extendable: "Extendable",
};

describe("every stored field reaches a row", () => {
  const labels = requestDetailRows(FULL, false, L).map(([k]) => k);

  it.each(Object.entries(EXPECTED))("%s is shown as «%s»", (_field, label) => {
    expect(labels).toContain(label);
  });

  it("shows nothing beyond the fields named above", () => {
    // Duration and the certificate list are deliberately absent: both have a home of their own in
    // the modal, and a field printed twice makes a reader ask which one is authoritative.
    expect(labels.sort()).toEqual(Object.values(EXPECTED).sort());
    expect(labels).not.toContain("Duration");
    expect(labels).not.toContain("Required certificates");
  });
});

describe("a value that is not there", () => {
  it("is dropped, not printed as a dash", () => {
    const rows = requestDetailRows({ ...FULL, budgetCeiling: null, terrainType: null }, false, L);
    const labels = rows.map(([k]) => k);
    expect(labels).not.toContain("Budget");
    expect(labels).not.toContain("Terrain");
    expect(rows.every(([, v]) => v !== "" && v !== "—")).toBe(true);
  });

  it("leaves a request that set none of them with an empty list, not a page of dashes", () => {
    const bare = { id: "r", type: FULL.type, status: FULL.status, equipmentItems: [] } as RequestRecord;
    expect(requestDetailRows(bare, false, L)).toEqual([]);
  });

  it("keeps a FALSE boolean, which is an answer", () => {
    const rows = requestDetailRows(FULL, false, L);
    expect(rows).toContainEqual(["On-site storage", "No"]);
  });
});

describe("reading the values", () => {
  const rows = requestDetailRows(FULL, false, L);
  const get = (label: string) => rows.find(([k]) => k === label)?.[1];

  it("names a mapped enum", () => {
    expect(get("Rental basis")).toBe("Monthly");
    expect(get("Breakdown response")).toBe("24 hours");
    expect(get("Offer duration")).toBe("48 hours");
  });

  it("prettifies an enum it has no map for, rather than hiding it", () => {
    expect(get("Terrain")).toBe("Rocky");
    expect(get("Delivery lead time")).toBe("Three Days");
    expect(get("Payment method")).toBe("Bank Transfer");
  });

  it("carries the unit with the number", () => {
    expect(get("Working hours")).toBe("10 hrs/day");
    expect(get("Estimated job hours")).toBe("240 hrs");
    expect(get("Budget")).toBe("120,000 SAR");
  });

  it("answers in Arabic when asked in Arabic", () => {
    const ar = requestDetailRows(FULL, true, (_en, a) => a);
    expect(ar.find(([k]) => k === "أساس الإيجار")?.[1]).toBe("شهري");
  });
});

const ITEM: RequestItem = {
  categoryId: "c", subtypeId: "s", capacityId: "cap",
  categoryName: "Excavator", categoryNameAr: null,
  subtypeName: "Crawler Excavator", subtypeNameAr: null,
  capacityName: "30 ton", capacityNameAr: null,
  subtypeImageUrl: null, categoryImageUrl: null,
  numberOfUnits: 2,
  operatorIncluded: "YES",
  fuelTypePreference: "DIESEL",
  mobilizationByRentee: true,
  demobilizationByRentee: false,
  nightShiftRequired: true,
  operatorNationality: "Saudi",
  maxEquipmentAge: 5,
  dieselIncluded: true,
  fatRequired: true,
  safetyCertifications: ["SCE", "OSHA"],
  additionalNotes: "Needs a hydraulic breaker attachment.",
};

describe("a machine's own terms", () => {
  const rows = itemDetailRows(ITEM, false, L);
  const get = (label: string) => rows.find(([k]) => k === label)?.[1];

  /**
   * `mobilizationByRentee: true` means the RENTER carries it. The field name is the only thing that
   * says which way the boolean points, and the renter is not reading field names — so "Yes" here
   * would be read by half of them as the opposite of what it means.
   */
  it("says who bears a cost instead of yes or no", () => {
    expect(get("Delivery to site")).toBe("Me");
    expect(get("Return from site")).toBe("Supplier");
    expect(get("Food & accommodation")).toBe("Supplier"); // fatRequired = the supplier provides it
  });

  it("carries the rest of the machine's parameters", () => {
    expect(get("Units")).toBe("2");
    expect(get("Operator")).toBe("Included");
    expect(get("Operator nationality")).toBe("Saudi");
    expect(get("Fuel")).toBe("Diesel");
    expect(get("Night shift")).toBe("Yes");
    expect(get("Max equipment age")).toBe("5 years");
    expect(get("Safety certificates")).toBe("SCE · OSHA");
    expect(get("Notes")).toBe("Needs a hydraulic breaker attachment.");
  });

  it("drops what the item left unset", () => {
    const sparse = { ...ITEM, operatorNationality: null, maxEquipmentAge: null, safetyCertifications: [], additionalNotes: null };
    const labels = itemDetailRows(sparse, false, L).map(([k]) => k);
    expect(labels).not.toContain("Operator nationality");
    expect(labels).not.toContain("Max equipment age");
    expect(labels).not.toContain("Safety certificates");
    expect(labels).not.toContain("Notes");
  });
});
