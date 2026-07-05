import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { canSeeProcurementDashboard } from "@/lib/access/dashboard";
import type { RenterUser } from "@/lib/contract/auth";

const user = (phone: string): RenterUser => ({ id: 1, phone, tier: "verified" });
const FLAG = "NEXT_PUBLIC_DASHBOARD_ENABLED";

/* Flag ON (staging): CCC mock account only. */
describe("canSeeProcurementDashboard — flag ON, CCC mock account only", () => {
  beforeEach(() => { process.env[FLAG] = "1"; });
  afterEach(() => { delete process.env[FLAG]; });

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

/* Flag OFF (default → production): the dashboard is off for EVERY account, including the CCC phone. */
describe("canSeeProcurementDashboard — flag OFF (prod), off for everyone", () => {
  beforeEach(() => { delete process.env[FLAG]; });

  it("denies the CCC account too when the flag is unset", () => {
    expect(canSeeProcurementDashboard(user("+966503695664"))).toBe(false);
    expect(canSeeProcurementDashboard(user("966503695664"))).toBe(false);
    expect(canSeeProcurementDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeProcurementDashboard(null)).toBe(false);
  });
});
