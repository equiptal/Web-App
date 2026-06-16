import { describe, it, expect } from "vitest";
import { quotationFileTitle, groupIdFromFileName, normalizeComparisonCode, itemCodesFromFileName } from "@/lib/compare/quotation-token";

const GID = "9ed26539-d7e0-4c25-8ee0-551059177ebc";

describe("quotation token (stamp ↔ recognize)", () => {
  it("round-trips: stamped title → filename → group id", () => {
    const title = quotationFileTitle(GID);
    expect(title).toBe(`moedatech-quotation-${GID}`);
    expect(groupIdFromFileName(`${title}.pdf`)).toBe(GID);
  });

  it("recovers the id from a browser-suffixed copy", () => {
    expect(groupIdFromFileName(`moedatech-quotation-${GID} (1).pdf`)).toBe(GID);
  });

  it("recovers the id from a renamed file that still contains the code", () => {
    expect(groupIdFromFileName(`procurement quote ${GID}.pdf`)).toBe(GID);
  });

  it("returns null for an unrelated file", () => {
    expect(groupIdFromFileName("some-other-document.pdf")).toBeNull();
  });

  it("normalizes a pasted comparison code (trims, extracts the UUID)", () => {
    expect(normalizeComparisonCode(`  ${GID}  `)).toBe(GID);
    expect(normalizeComparisonCode(`moedatech-quotation-${GID}.pdf`)).toBe(GID);
    expect(normalizeComparisonCode("")).toBeNull();
  });

  it("stamps + recovers the covered request codes (scope the comparison to the uploaded items)", () => {
    const title = quotationFileTitle(GID, ["REQ-00132", "REQ-00134"]);
    expect(title).toBe(`moedatech-quotation-${GID}__items__REQ-00132__REQ-00134`);
    // group id still recovers, plus the scoped item codes
    expect(groupIdFromFileName(`${title}.pdf`)).toBe(GID);
    expect(itemCodesFromFileName(`${title}.pdf`)).toEqual(["REQ-00132", "REQ-00134"]);
    // de-dupes and ignores empties
    expect(quotationFileTitle(GID, ["REQ-1", "REQ-1"])).toBe(`moedatech-quotation-${GID}__items__REQ-1`);
  });

  it("returns no item codes for an unstamped (older) quotation file", () => {
    expect(itemCodesFromFileName(`moedatech-quotation-${GID}.pdf`)).toEqual([]);
  });
});
