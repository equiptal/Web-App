import { describe, it, expect } from "vitest";
import { itemDetailRows, requestDetailRows } from "@/lib/contract/request-fields";
import type { RequestItem, RequestRecord } from "@/lib/contract/requests";

/**
 * ~~The request details modal has to show EVERY parameter the request stores (owner, 2026-08-29).~~
 * **Narrowed 2026-09-01:** *"It has toooo much info — I want to show him the request fields that are
 * part of the create request experience, not system fields."*
 *
 * So the claim is no longer coverage, it is MEMBERSHIP: a row appears iff the renter could have set
 * it in the create flow. `SHOWN` and `HIDDEN` below are the two halves of that, and the test that
 * matters is still the one that fails when the backend grows a field nobody has ruled on — every
 * request-level field is named in one list or the other, so adding one to `RequestRecord` without
 * adding it here is the moment to decide which side it belongs on.
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

/** Set in the create flow, so the renter reads it back — and the label it arrives under. */
const SHOWN: Record<string, string> = {
  rentalType: "Rental basis",
  workingHoursPerDay: "Working hours",
  workingDaysPerWeek: "Working days / week",
  overtimeRate: "Overtime rate",
  paymentTerms: "Payment terms",
  paymentMethod: "Payment method",
  breakdownResponseSla: "Breakdown response",
  maintenanceResponsibility: "Maintenance",
  budgetCeiling: "Budget",
  offerDuration: "Offer duration",
  verifiedSuppliersOnly: "Verified suppliers only",
  subletting: "Subletting allowed",
  localContent: "Local content",
  extendable: "Extendable",
};

/**
 * Stored, but never asked in the create flow — so never printed as one of the renter's answers.
 *
 * `urgency` is the sharpest of them: it is COMPUTED from the start date (`computeUrgency`), so
 * showing it invites the renter to wonder where he set it. The rest are backend columns a mobile
 * build or an older web form can fill; a request that has one is not lying, it is simply not part of
 * the conversation this page is having.
 */
const HIDDEN: Record<string, string> = {
  urgency: "Urgency",
  jobEstimatedHours: "Estimated job hours",
  terrainType: "Terrain",
  fulfillmentType: "Fulfillment",
  minimumSupplierRating: "Min. supplier rating",
  deliveryLeadTime: "Delivery lead time",
  equipmentStorageOnSite: "On-site storage",
};

describe("every field the RENTER set reaches a row", () => {
  const labels = requestDetailRows(FULL, false, L).map(([k]) => k);

  it.each(Object.entries(SHOWN))("%s is shown as «%s»", (_field, label) => {
    expect(labels).toContain(label);
  });

  it.each(Object.entries(HIDDEN))("%s is NOT shown, though it is stored", (field, label) => {
    // FULL sets every one of these, so a row appearing here is the field leaking back in.
    expect(FULL[field as keyof RequestRecord]).not.toBeUndefined();
    expect(labels).not.toContain(label);
  });

  it("shows nothing beyond the fields named above", () => {
    // Duration and the certificate list are deliberately absent for a different reason: both have a
    // home of their own in the modal, and a field printed twice makes a reader ask which is
    // authoritative.
    expect(labels.sort()).toEqual(Object.values(SHOWN).sort());
    expect(labels).not.toContain("Duration");
    expect(labels).not.toContain("Required certificates");
  });
});

describe("a value that is not there", () => {
  it("is dropped, not printed as a dash", () => {
    const rows = requestDetailRows({ ...FULL, budgetCeiling: null, offerDuration: null }, false, L);
    const labels = rows.map(([k]) => k);
    expect(labels).not.toContain("Budget");
    expect(labels).not.toContain("Offer duration");
    expect(rows.every(([, v]) => v !== "" && v !== "—")).toBe(true);
  });

  it("leaves a request that set none of them with an empty list, not a page of dashes", () => {
    const bare = { id: "r", type: FULL.type, status: FULL.status, equipmentItems: [] } as RequestRecord;
    expect(requestDetailRows(bare, false, L)).toEqual([]);
  });

  it("keeps a FALSE boolean, which is an answer", () => {
    const rows = requestDetailRows({ ...FULL, subletting: false }, false, L);
    expect(rows).toContainEqual(["Subletting allowed", "No"]);
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
    expect(get("Payment method")).toBe("Bank Transfer");
  });

  it("carries the unit with the number", () => {
    expect(get("Working hours")).toBe("10 hrs/day");
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
  subtypeImageUrl: null, subtypeEquipmentImageUrl: null, categoryImageUrl: null,
  numberOfUnits: 2,
  operatorIncluded: "YES",
  fuelTypePreference: "DIESEL",
  mobilizationByRentee: true,
  demobilizationByRentee: false,
  nightShiftRequired: true,
  operatorNationality: "Saudi",
  /* The LIVE wire's field. `maxEquipmentAge` is the deprecated alias the web still POSTS under and
     the backend never sends back — which is exactly why the row was blank until 2026-09-01. */
  minimumEquipmentYear: 2020,
  maxEquipmentAge: null,
  dieselIncluded: true,
  fatRequired: true,
  fatFood: true,
  fatAccommodationTransport: false,
  workType: "Tower lift",
  attachmentIds: [],
  customAttachments: [],
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
    /* A minimum manufacture YEAR, read through `requestedMinYear` and stated as one. It used to read
       the alias alone and print an age, so a renter who had just set 2020 saw no row at all. */
    expect(get("Equipment year")).toBe("2020 or newer");
    expect(get("Safety certificates")).toBe("SCE · OSHA");
    expect(get("Notes")).toBe("Needs a hydraulic breaker attachment.");
  });

  it("drops what the item left unset", () => {
    const sparse = { ...ITEM, operatorNationality: null, minimumEquipmentYear: null, safetyCertifications: [], additionalNotes: null };
    const labels = itemDetailRows(sparse, false, L).map(([k]) => k);
    expect(labels).not.toContain("Operator nationality");
    expect(labels).not.toContain("Equipment year");
    expect(labels).not.toContain("Safety certificates");
    expect(labels).not.toContain("Notes");
  });
});
