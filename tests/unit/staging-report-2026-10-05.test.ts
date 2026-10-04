import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { certLabel } from "@/lib/contract/bids";
import { basisFromWire } from "@/lib/contract/project";

/**
 * The web-side fixes from the staging issues report of 2026-10-05 (W2, W3b, W4).
 */
const SRC = resolve(__dirname, "../../src");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");

describe("W2: the award's basis goes out in the awards endpoint's spelling", () => {
  it("reads the marketplace's MONTHLY as monthly", () => {
    expect(basisFromWire("MONTHLY")).toBe("monthly");
    expect(basisFromWire("WEEKLY")).toBe("weekly");
    expect(basisFromWire("monthly")).toBe("monthly");
  });

  it("is applied to the row's basis before the dialog sees it", () => {
    expect(read("components/projects/ProjectsSurface.tsx")).toContain("basisFromWire(awarding.group.when?.rentalBasis)");
  });
});

describe("W3b: a submission answering several machines shows only this machine's line", () => {
  it("filters the submission's lines by the item being viewed", () => {
    expect(read("components/workspace/RequestsWorkspace.tsx")).toContain(
      "sub.items.filter((it) => !it.requestId || it.requestId === itemId)",
    );
  });
});

describe("W4: certificate codes in the reader's language", () => {
  it("names the codes the backend sends", () => {
    expect(certLabel("aramco", "ar")).toBe("معتمد من أرامكو");
    expect(certLabel("aramco", "en")).toBe("Aramco Certified");
    expect(certLabel("tuv", "ar")).toBe("TÜV");
    expect(certLabel("tuv_saso", "en")).toBe("TÜV (SASO)");
  });

  it("returns null for a code it cannot name, so the caller keeps its own fallback", () => {
    expect(certLabel("something_else", "ar")).toBeNull();
  });
});
