import { describe, it, expect } from "vitest";
import { supplierStatusToVerification } from "@/lib/contract/onboarding";

describe("supplierStatusToVerification (specs#268 AC-13/16/17/19/20)", () => {
  it.each([
    [1, "pending"],
    [2, "verified"],
    [3, "rejected"],
    [0, "none"],
    [null, "none"],
    [undefined, "none"],
  ])("supplierStatus %s → %s", (s, expected) => {
    expect(supplierStatusToVerification(s as number | null | undefined)).toBe(expected);
  });
});
