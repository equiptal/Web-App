import { describe, it, expect } from "vitest";
import {
  NO_ONE,
  SOMEONE_ELSE,
  buildOutcomeResponse,
  isRenterSurvey,
  unitLabel,
} from "@/lib/contract/survey";

describe("unitLabel (§8 unit table)", () => {
  it("maps the various price-unit / rental-type forms (EN)", () => {
    expect(unitLabel("DAILY", false)).toBe("per day");
    expect(unitLabel("daily", false)).toBe("per day");
    expect(unitLabel("per_day", false)).toBe("per day");
    expect(unitLabel("WEEKLY", false)).toBe("per week");
    expect(unitLabel("monthly", false)).toBe("per month");
    expect(unitLabel("per job", false)).toBe("for the job");
    expect(unitLabel("LONG_TERM", false)).toBe("for the rental");
  });

  it("returns Arabic labels when ar=true", () => {
    expect(unitLabel("DAILY", true)).toBe("يوميًا");
    expect(unitLabel("monthly", true)).toBe("شهريًا");
  });

  it("returns empty string for unknown / missing units (no suffix)", () => {
    expect(unitLabel(null, false)).toBe("");
    expect(unitLabel("", false)).toBe("");
    expect(unitLabel("whatever", false)).toBe("");
  });
});

describe("buildOutcomeResponse (Q1 submit mapping — app parity)", () => {
  it("a chosen bidder → confirm with that winner + typed price", () => {
    expect(buildOutcomeResponse(42, "5000", "")).toEqual({
      action: "confirm",
      winners: [{ winnerSupplierId: 42, price: 5000 }],
    });
  });

  it("someone else → won_elsewhere with price + freeText", () => {
    expect(buildOutcomeResponse(SOMEONE_ELSE, "300", "found a cheaper one")).toEqual({
      action: "won_elsewhere",
      price: 300,
      freeText: "found a cheaper one",
    });
  });

  it("no one → no_winner with optional reason", () => {
    expect(buildOutcomeResponse(NO_ONE, "", "plans changed")).toEqual({
      action: "no_winner",
      freeText: "plans changed",
    });
  });

  it("blank price → price omitted (not 0)", () => {
    expect(buildOutcomeResponse(7, "", "")).toEqual({
      action: "confirm",
      winners: [{ winnerSupplierId: 7, price: undefined }],
    });
  });

  it("blank reason → freeText omitted", () => {
    const r = buildOutcomeResponse(NO_ONE, "", "   ");
    expect(r.freeText).toBeUndefined();
  });
});

describe("isRenterSurvey", () => {
  it("accepts the two renter flows, rejects the supplier flow", () => {
    expect(isRenterSurvey("RENTEE_OUTCOME")).toBe(true);
    expect(isRenterSurvey("RENTEE_NO_BIDS")).toBe(true);
    expect(isRenterSurvey("SUPPLIER_CONFIRM")).toBe(false);
  });
});
