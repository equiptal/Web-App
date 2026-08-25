import { describe, expect, it } from "vitest";
import { computeChargedDays } from "@/lib/contract";
import { billableDays, countFridays, durationDaysBetween } from "@/lib/pricing/rental";

describe("computeChargedDays (MREQ-AC-32/33)", () => {
  // The prototype's own worked example. It showed 180 / 154 because it dropped the inclusive `+ 1`
  // that the backend, the app and `durationDaysBetween` all apply.
  it("prices 12 Aug 2026 → 8 Feb 2027 as 181 days, 26 Fridays, 155 charged", () => {
    const r = computeChargedDays({ startDate: "2026-08-12", endDate: "2027-02-08", rentalBasis: "monthly" });
    expect(r).toMatchObject({ known: true, totalDays: 181, fridays: 26, chargedDays: 155, missing: "none" });
  });

  it("counts both ends — a single-day rental is one day, not zero", () => {
    const r = computeChargedDays({ startDate: "2026-08-10", endDate: "2026-08-10", rentalBasis: "daily" });
    expect(r.totalDays).toBe(1);
  });

  // The figure the canvas shows must be the figure the bid form, deal room and quotation price
  // against. Deriving it independently is exactly how two surfaces come to disagree about one job.
  it("delegates entirely to the shared pricing helpers", () => {
    const start = "2026-03-01";
    const end = "2026-05-31";
    const r = computeChargedDays({ startDate: start, endDate: end, rentalBasis: "monthly" });
    const total = durationDaysBetween(start, end) as number;
    expect(r.totalDays).toBe(total);
    expect(r.fridays).toBe(countFridays(start, total));
    expect(r.chargedDays).toBe(billableDays(start, total));
  });

  // Reading the dates locally shifts the weekday west of UTC, silently changing which days are
  // Fridays and therefore what the renter is charged.
  it("reads dates as UTC calendar days", () => {
    const a = computeChargedDays({ startDate: "2026-08-14", endDate: "2026-08-14", rentalBasis: "daily" });
    expect(a.fridays).toBe(1); // 14 Aug 2026 is a Friday in UTC
    expect(a.chargedDays).toBe(0);
  });
});

describe("computeChargedDays — missing dates (MREQ-AC-34)", () => {
  it("withholds the figure rather than reporting zero", () => {
    const r = computeChargedDays({ startDate: null, endDate: null, rentalBasis: "monthly" });
    expect(r.known).toBe(false);
    expect(r.missing).toBe("both");
    expect(r.tooShort).toBeNull();
  });

  it("names which end is missing, including the start-only case", () => {
    expect(computeChargedDays({ startDate: null, endDate: "2026-09-01", rentalBasis: null }).missing).toBe("start");
    expect(computeChargedDays({ startDate: "2026-09-01", endDate: null, rentalBasis: null }).missing).toBe("end");
  });
});

describe("computeChargedDays — basis too short (MREQ-AC-36/37)", () => {
  // The prototype computed `Math.floor(days / 30)` inside a branch that only ran below 30, so its
  // warning could only ever read "0 months".
  it("reports monthly shortfalls in days, never months", () => {
    const r = computeChargedDays({ startDate: "2026-08-01", endDate: "2026-08-12", rentalBasis: "monthly" });
    expect(r.tooShort).toEqual({ basis: "monthly", days: 12, needs: 30 });
  });

  it("applies the same rule to weekly under seven days", () => {
    const r = computeChargedDays({ startDate: "2026-08-01", endDate: "2026-08-04", rentalBasis: "weekly" });
    expect(r.tooShort).toEqual({ basis: "weekly", days: 4, needs: 7 });
  });

  it("stays silent when the window is long enough, and for daily billing", () => {
    expect(computeChargedDays({ startDate: "2026-08-01", endDate: "2026-09-30", rentalBasis: "monthly" }).tooShort).toBeNull();
    expect(computeChargedDays({ startDate: "2026-08-01", endDate: "2026-08-02", rentalBasis: "daily" }).tooShort).toBeNull();
  });
});
