import { describe, it, expect } from "vitest";
import { cityLabel, urgencyLabel, rentalTypeLabel, fulfillmentLabel, slaLabel, responsibilityLabel, termValueLabel, partyToken } from "@/lib/contract/labels";
import { mapDealRoom, buildDealRoomQuotationDoc } from "@/lib/contract/deal-room";

/**
 * **Backend enums, as a person reads them.**
 *
 * The web printed these codes verbatim, quotation included — the document a renter and a supplier
 * hold each other to read «الأولوية: FAR_FUTURE». What is guarded here is the vocabulary itself, the
 * fallback (an unmet code prints as it arrived, never blank and never guessed), and the one rule with
 * any real logic in it: a location is usually a city plus a site the renter typed, and only the city
 * half may be translated.
 */

const en = (e: string, _a: string) => e;
const ar = (_e: string, a: string) => a;

describe("enum vocabularies", () => {
  it("reads urgency the way the app reads it — FAR_FUTURE is Flexible, not Later", () => {
    // The web briefly had its own copy calling this "Later". FAR_FUTURE describes a renter who is
    // relaxed about the start, not one who has scheduled it far out.
    expect(urgencyLabel("FAR_FUTURE", en)).toBe("Flexible");
    expect(urgencyLabel("FAR_FUTURE", ar)).toBe("مرن");
    expect(urgencyLabel("ASAP", en)).toBe("ASAP");
    expect(urgencyLabel("SOON", ar)).toBe("قريباً");
  });

  it("reads the rental types, including the two that are not durations", () => {
    expect(rentalTypeLabel("PER_JOB", en)).toBe("Per Job");
    expect(rentalTypeLabel("LONG_TERM", en)).toBe("Long Term");
    expect(rentalTypeLabel("MONTHLY", ar)).toBe("شهري");
  });

  it("accepts every spelling of fulfillment the backend has emitted", () => {
    for (const v of ["SINGLE", "SINGLE_SUPPLIER"]) expect(fulfillmentLabel(v, en)).toBe("Single Supplier");
    for (const v of ["MULTI", "MULTIPLE", "MULTIPLE_SUPPLIERS"]) expect(fulfillmentLabel(v, en)).toBe("Multiple Suppliers");
  });

  it("reads an SLA from either the enum name or the bare hour count", () => {
    expect(slaLabel("FOUR_HR", en)).toBe("4 hours");
    expect(slaLabel("4", en)).toBe("4 hours");
    expect(slaLabel("TWENTY_FOUR_HR", ar)).toBe("24 ساعة");
  });

  it("reads a responsibility, including the renter's two names for himself", () => {
    expect(responsibilityLabel("RENTEE", en)).toBe("Rentee");
    expect(responsibilityLabel("RENTER", en)).toBe("Rentee");
    expect(responsibilityLabel("SHARED", ar)).toBe("مشتركة");
  });

  it("is case-insensitive and tolerates surrounding space", () => {
    expect(urgencyLabel(" asap ", en)).toBe("ASAP");
    expect(rentalTypeLabel("Monthly", en)).toBe("Monthly");
  });

  it("prints an unmet code as it arrived, rather than blanking it", () => {
    // A code this file has not met is still information. A blank says nothing AND hides that
    // anything was there.
    expect(urgencyLabel("NEXT_QUARTER", en)).toBe("NEXT_QUARTER");
    expect(slaLabel("NINETY_HR", ar)).toBe("NINETY_HR");
    expect(fulfillmentLabel("", en)).toBe("");
  });
});

describe("cityLabel", () => {
  it("translates a known city, in every spelling the backend uses", () => {
    expect(cityLabel("Riyadh", ar)).toBe("الرياض");
    expect(cityLabel("RIYADH", ar)).toBe("الرياض");
    expect(cityLabel("al-khobar", ar)).toBe("الخبر");
    expect(cityLabel("Al Jubail", ar)).toBe("الجبيل");
    expect(cityLabel("Makkah", en)).toBe("Mecca");
  });

  it("translates only the CITY half of 'city — site', leaving the renter's own words alone", () => {
    // The site name is his. Translating half a phrase he typed would read worse than leaving it.
    expect(cityLabel("Riyadh — King Fahd Rd site", ar)).toBe("الرياض — King Fahd Rd site");
    expect(cityLabel("Dammam - Industrial City 2", ar)).toBe("الدمام - Industrial City 2");
  });

  it("leaves a location it does not recognise entirely alone", () => {
    expect(cityLabel("Wadi Ad-Dawasir", ar)).toBe("Wadi Ad-Dawasir");
    expect(cityLabel("Site B — north gate", ar)).toBe("Site B — north gate");
  });
});

describe("termValueLabel", () => {
  it("picks the vocabulary from the KEY — the value alone cannot say which it is", () => {
    expect(termValueLabel("breakdown_response_sla", "FOUR_HR", en)).toBe("4 hours");
    expect(termValueLabel("maintenance_responsibility", "SUPPLIER", ar)).toBe("المؤجر");
    expect(termValueLabel("fulfillment_type", "SINGLE", en)).toBe("Single Supplier");
  });

  it("returns null for a key it does not own, so the caller keeps its own formatting", () => {
    // Most of the catalogue is free-text and numbers. Claiming those would replace working output
    // with a worse guess.
    expect(termValueLabel("additional_notes", "no smoking on site", en)).toBeNull();
    expect(termValueLabel("working_hours", "10", en)).toBeNull();
  });

  it("returns null for a non-string or empty value", () => {
    expect(termValueLabel("urgency", true, en)).toBeNull();
    expect(termValueLabel("urgency", null, en)).toBeNull();
    expect(termValueLabel("urgency", "  ", en)).toBeNull();
  });
});

describe("the quotation prints words, not codes", () => {
  const room = mapDealRoom({
    id: "dr_1",
    status: "CLOSED",
    supplier: { name: "Gulf Cranes", isVerified: true },
    request: {
      equipmentItems: [{
        numberOfUnits: 1, location: "Riyadh", rentalType: "PER_JOB",
        urgency: "FAR_FUTURE", fulfillmentType: "SINGLE_SUPPLIER",
      }],
    },
    terms: [
      { key: "breakdown_response_sla", label: "Breakdown response", labelAr: "الاستجابة للأعطال", state: "agreed", value: "FOUR_HR" },
      { key: "maintenance_responsibility", label: "Maintenance", labelAr: "الصيانة", state: "agreed", value: "SUPPLIER" },
    ],
  });

  const doc = (L: (e: string, a: string) => string, isAr: boolean) =>
    buildDealRoomQuotationDoc(room, null, { name: "Yara" }, isAr, L);

  it("states the request's enums as words in English", () => {
    const values = doc(en, false).cards.flatMap((c) => c.rows.map((r) => r.value));
    expect(values).toContain("Flexible");
    expect(values).toContain("Per Job");
    expect(values).toContain("Single Supplier");
    expect(values).toContain("4 hours");
  });

  it("states them in Arabic on an Arabic quotation, city included", () => {
    const values = doc(ar, true).cards.flatMap((c) => c.rows.map((r) => r.value));
    expect(values).toContain("مرن");
    expect(values).toContain("الرياض");
    expect(values).toContain("المؤجر");
  });

  it("prints no raw enum anywhere on the paper", () => {
    for (const isAr of [false, true]) {
      const values = doc(isAr ? ar : en, isAr).cards.flatMap((c) => c.rows.map((r) => r.value));
      for (const v of values) expect(v, `raw code on the quotation: ${v}`).not.toMatch(/^[A-Z][A-Z_]{3,}$/);
    }
  });
});

describe("partyToken — the bid form's \"On \" prefix", () => {
  /**
   * `GET /public/bid-form/{token}` began sending `"On Supplier"` / `"On Renter"` on 2026-09-02 where
   * it had sent `"Supplier"` / `"Renter"`. Readers that compared the two old words exactly fell
   * through to the branch meaning the OTHER party, which on the public form took the delivery price
   * input away from the supplier who owns the leg and submitted 0 for it.
   */
  it("reads both spellings as the same party", () => {
    expect(partyToken("On Supplier").toLowerCase()).toBe("supplier");
    expect(partyToken("On Renter").toLowerCase()).toBe("renter");
    expect(partyToken("Supplier").toLowerCase()).toBe("supplier");
    expect(partyToken("Renter").toLowerCase()).toBe("renter");
  });

  it("keeps the older bare tokens working, prefix or not", () => {
    expect(partyToken("SUPPLIER")).toBe("SUPPLIER");
    expect(partyToken("RENTER")).toBe("RENTER");
    expect(partyToken("  on supplier ").toLowerCase()).toBe("supplier");
  });

  it("strips only a leading On, never a word that merely starts with it", () => {
    expect(partyToken("Onsite crew")).toBe("Onsite crew");
    expect(partyToken("Owner")).toBe("Owner");
  });

  it("answers an empty string for nothing, so a caller can compare without a null check", () => {
    expect(partyToken(null)).toBe("");
    expect(partyToken(undefined)).toBe("");
    expect(partyToken("   ")).toBe("");
  });

  it("labels a prefixed responsibility instead of printing it raw", () => {
    expect(responsibilityLabel("On Supplier", en)).toBe("Supplier");
    expect(responsibilityLabel("On Renter", ar)).toBe("المستأجر");
  });
});
