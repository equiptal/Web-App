import { describe, it, expect } from "vitest";
import { quotationFileTitle, groupIdFromFileName, normalizeComparisonCode } from "@/lib/compare/quotation-token";

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
});
