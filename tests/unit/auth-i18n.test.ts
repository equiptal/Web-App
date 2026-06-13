import { describe, it, expect } from "vitest";
import { detectLocale, isLocale } from "@/lib/i18n/config";
import { normalizeTier } from "@/lib/contract/auth";

describe("detectLocale — browser-locale default (AC-21)", () => {
  it("Arabic browser locales → ar", () => {
    expect(detectLocale("ar")).toBe("ar");
    expect(detectLocale("ar-SA")).toBe("ar");
    expect(detectLocale("AR-sa")).toBe("ar");
  });
  it("anything else → en default", () => {
    expect(detectLocale("en-US")).toBe("en");
    expect(detectLocale("fr")).toBe("en");
    expect(detectLocale(undefined)).toBe("en");
    expect(detectLocale("")).toBe("en");
  });
});

describe("isLocale", () => {
  it("recognises en/ar only", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });
});

describe("normalizeTier — tier carry-over (AC-04/05)", () => {
  it("passes known tiers through", () => {
    expect(normalizeTier("guest")).toBe("guest");
    expect(normalizeTier("basic")).toBe("basic");
    expect(normalizeTier("verified")).toBe("verified");
  });
  it("defaults unknown/missing to guest", () => {
    expect(normalizeTier("admin")).toBe("guest");
    expect(normalizeTier(undefined)).toBe("guest");
    expect(normalizeTier(null)).toBe("guest");
    expect(normalizeTier(123)).toBe("guest");
  });
});
