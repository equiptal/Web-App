import { describe, it, expect } from "vitest";
import { endBeforeStart } from "@/lib/contract/date-range";

/**
 * One rule for "these two dates are the wrong way round", read by the project, the work order and
 * the request. Each used to answer differently: the request's inputs carried `min`/`max` so the
 * picker refused it silently, and the other two accepted it and let the backend answer a 400 that
 * named no field.
 */
describe("endBeforeStart", () => {
  it("Given an end before the start, Then it is refused", () => {
    expect(endBeforeStart("2026-09-10", "2026-09-01")).toBe(true);
  });

  it("Given a normal window, Then it is fine", () => {
    expect(endBeforeStart("2026-09-01", "2026-09-10")).toBe(false);
  });

  it("Given the same day at both ends, Then it is fine — a one-day hire is a real hire", () => {
    // Refusing this would refuse half the day-rate work on the platform.
    expect(endBeforeStart("2026-09-01", "2026-09-01")).toBe(false);
  });

  it("Given either date unset, Then there is nothing to be wrong about yet", () => {
    // A form the renter has not finished is not a form he got wrong, and marking it red before he
    // has answered teaches him to ignore the colour.
    expect(endBeforeStart(null, "2026-09-01")).toBe(false);
    expect(endBeforeStart("2026-09-01", null)).toBe(false);
    expect(endBeforeStart(null, null)).toBe(false);
    expect(endBeforeStart("", "")).toBe(false);
  });

  it("Given dates across a year boundary, Then the string comparison still holds", () => {
    // ISO `YYYY-MM-DD` sorts lexicographically, which is why no Date parser — and no timezone — is
    // given a chance to move a date across midnight.
    expect(endBeforeStart("2026-12-31", "2027-01-01")).toBe(false);
    expect(endBeforeStart("2027-01-01", "2026-12-31")).toBe(true);
  });
});
