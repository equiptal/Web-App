import { describe, it, expect } from "vitest";
import {
  canSeeAnyDashboard,
  canSeeGovernanceDashboard,
  canSeeProcurementDashboard,
} from "@/lib/access/dashboard";
import type { RenterUser } from "@/lib/contract/auth";

const user = (phone: string): RenterUser => ({ id: 1, phone, tier: "verified" });

/**
 * STAGING build. The two demo boards are phone-gated here.
 *
 * ⚠️ THIS FILE INTENTIONALLY DIFFERS FROM `main`, exactly as `@/lib/access/dashboard` does. The
 * production version of this test asserts the opposite — that every account is denied — because in
 * production both demo phones belong to real, different people. On a staging→main promotion, KEEP
 * THE PRODUCTION VERSION of both files.
 *
 * 🔴 Both files were silently overwritten by the production copies before 2026-10-03, which is how
 * `/dashboard` became unreachable on staging while its own comment still described a phone gate.
 * If this test suddenly asserts `false` for everything, that has happened again.
 */
const CCC = "+966503695664";
const GOVERNANCE = "+966594433949";

describe("the procurement demo is gated to the CCC account", () => {
  it("allows that phone whatever shape it is written in", () => {
    expect(canSeeProcurementDashboard(user(CCC))).toBe(true);
    expect(canSeeProcurementDashboard(user("966503695664"))).toBe(true);
    expect(canSeeProcurementDashboard(user("0503695664"))).toBe(true);
  });

  it("denies everyone else, and nobody at all", () => {
    expect(canSeeProcurementDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeProcurementDashboard(user(GOVERNANCE))).toBe(false);
    expect(canSeeProcurementDashboard(null)).toBe(false);
    expect(canSeeProcurementDashboard(undefined)).toBe(false);
  });
});

describe("the governance board is gated to its own account", () => {
  it("allows the account its staging data was mirrored onto", () => {
    expect(canSeeGovernanceDashboard(user(GOVERNANCE))).toBe(true);
    expect(canSeeGovernanceDashboard(user("966594433949"))).toBe(true);
    expect(canSeeGovernanceDashboard(user("0594433949"))).toBe(true);
  });

  /* The CCC account keeps it too, so the one account already used for demos can compare the live
     board against the prototype side by side. */
  it("allows the CCC demo account as well", () => {
    expect(canSeeGovernanceDashboard(user(CCC))).toBe(true);
  });

  it("denies everyone else", () => {
    expect(canSeeGovernanceDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeGovernanceDashboard(null)).toBe(false);
    expect(canSeeGovernanceDashboard(undefined)).toBe(false);
  });
});

describe("the page gate and the nav read the same answer", () => {
  it("is true when either board is", () => {
    expect(canSeeAnyDashboard(user(CCC))).toBe(true);
    expect(canSeeAnyDashboard(user(GOVERNANCE))).toBe(true);
  });

  it("is false when neither is, so the route redirects rather than rendering an empty shell", () => {
    expect(canSeeAnyDashboard(user("+966500000000"))).toBe(false);
    expect(canSeeAnyDashboard(null)).toBe(false);
  });

  /* A near-miss must not pass. The gate compares the last nine digits, so a number that merely
     ends similarly has to be rejected or the gate is theatre. */
  it("does not match a different number that happens to share a tail", () => {
    expect(canSeeAnyDashboard(user("+9665944339"))).toBe(false);
    expect(canSeeAnyDashboard(user("594433940"))).toBe(false);
  });
});
