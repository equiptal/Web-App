import { describe, it, expect } from "vitest";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";
import type { RenterUser } from "@/lib/contract/auth";

const user = (phone: string): RenterUser => ({ id: 1, phone, tier: "verified" });

// STAGING build: the procurement dashboard is phone-gated to the CCC demo account. Production has its
// own version of BOTH this test and `src/lib/access/dashboard.ts`, where the dashboard is off for every
// account. Neither side may overwrite the other — see the docblock in dashboard.ts. If you are reading
// this on `main`, the staging version has leaked into production; restore the always-false pair.
describe("canSeeProcurementDashboard — CCC mock account only", () => {
  it("allows the CCC account regardless of phone formatting", () => {
    expect(canSeeProcurementDashboard(user("+966503695664"))).toBe(true);
    expect(canSeeProcurementDashboard(user("966503695664"))).toBe(true);
    expect(canSeeProcurementDashboard(user("+966 50 369 5664"))).toBe(true);
  });

  it("denies any other account, and null/anon", () => {
    expect(canSeeProcurementDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeProcurementDashboard(user(""))).toBe(false);
    expect(canSeeProcurementDashboard(null)).toBe(false);
    expect(canSeeProcurementDashboard(undefined)).toBe(false);
  });
});
