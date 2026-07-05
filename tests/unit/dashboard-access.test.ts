import { describe, it, expect } from "vitest";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";
import type { RenterUser } from "@/lib/contract/auth";

const user = (phone: string): RenterUser => ({ id: 1, phone, tier: "verified" });

// PRODUCTION build: the procurement dashboard is excluded — off for EVERY account (the staging demo
// phone belongs to a real different user in prod). Staging has its own phone-gated version of this test.
describe("canSeeProcurementDashboard — excluded from production (off for everyone)", () => {
  it("denies every account, including the CCC demo phone", () => {
    expect(canSeeProcurementDashboard(user("+966503695664"))).toBe(false);
    expect(canSeeProcurementDashboard(user("966503695664"))).toBe(false);
    expect(canSeeProcurementDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeProcurementDashboard(null)).toBe(false);
    expect(canSeeProcurementDashboard(undefined)).toBe(false);
  });
});
