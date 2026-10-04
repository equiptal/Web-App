import { describe, it, expect } from "vitest";
import { normalizeSafetyCert, toggleSafetyCert, SAFETY_CERTIFICATES } from "@/lib/contract";
import { certHeldFor, toCertCodes } from "@/lib/contract/bids";
import { canonicalCertCode, computeUnitReadiness, docFamilyFor } from "@/lib/contract/bid-readiness";
import { certsInText } from "@/lib/agent/quick-certs";

/**
 * TÜV (SASO) — a TÜV certificate from a provider on SASO's list (owner, 2026-10-04).
 *
 * Given a renter picks it per machine
 * Then it is its own choice on the picker, exclusive with plain TÜV,
 * And it travels as `tuv_saso` (the app's code) and reads back as `tuv-saso`,
 * And a supplier's plain TÜV answers it (nothing checks the issuer yet), while a SASO inspection does not.
 */
describe("TÜV (SASO)", () => {
  it("is offered beside TÜV and Aramco", () => {
    expect(SAFETY_CERTIFICATES).toContain("tuv-saso");
  });

  it("is exclusive with plain TÜV on a picker; Aramco is untouched", () => {
    expect(toggleSafetyCert(["tuv"], "tuv-saso")).toEqual(["tuv-saso"]);
    expect(toggleSafetyCert(["tuv-saso", "aramco"], "tuv")).toEqual(["tuv", "aramco"]);
    expect(toggleSafetyCert(["tuv"], "aramco")).toEqual(["tuv", "aramco"]);
    expect(toggleSafetyCert(["tuv-saso"], "tuv-saso")).toEqual([]);
  });

  it("reads the stored `tuv_saso` back as the chip", () => {
    expect(normalizeSafetyCert("tuv_saso")).toBe("tuv-saso");
    expect(normalizeSafetyCert("TUV_SASO")).toBe("tuv-saso");
  });

  it("is its own code on the renter's bid views — NOT the SASO certificate", () => {
    expect(toCertCodes(["tuv_saso"])).toEqual(["TUV_SASO"]);
    expect(toCertCodes(["saso"])).toEqual(["SASO"]);
  });

  it("a held TÜV answers it; a SASO certificate does not", () => {
    expect(certHeldFor("TUV_SASO", ["TUV"])).toBe(true);
    expect(certHeldFor("TUV_SASO", ["SASO"])).toBe(false);
    expect(certHeldFor("TUV", ["TUV_SASO"])).toBe(false);
  });

  it("the browser's quick parser reads it from the renter's text, without a second plain TÜV", () => {
    expect(certsInText("crane 50 ton with tuv saso")).toEqual(["tuv-saso"]);
    expect(certsInText("excavator, SASO TÜV certified")).toEqual(["tuv-saso"]);
    expect(certsInText("crane with TUV (SASO) and aramco")).toEqual(["tuv-saso", "aramco"]);
    expect(certsInText("excavator with tuv")).toEqual(["tuv"]);
  });

  it("readiness: a TÜV paper on the machine turns it green, a SASO inspection does not", () => {
    expect(canonicalCertCode("tuv_saso")).toBe("tuv_saso");
    expect(docFamilyFor("tuv_saso")).toBe("tuv");
    const unit = (type: string) =>
      ({ documentKeys: [{ type, url: "https://x/doc.pdf" }], photoKeys: [] }) as never;
    const withTuv = computeUnitReadiness(unit("tuv"), ["tuv_saso"], [], null);
    const withSaso = computeUnitReadiness(unit("saso_technical_inspection"), ["tuv_saso"], [], null);
    expect(withTuv.equipmentCerts[0]).toMatchObject({ code: "tuv_saso", present: true, labelEn: "TÜV (SASO)" });
    expect(withSaso.equipmentCerts[0].present).toBe(false);
  });
});
