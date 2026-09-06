import { describe, expect, it } from "vitest";
import { termSides, type TermRow } from "@/lib/contract/bids";

/**
 * **A term has two sides, and only one of them is usually worth printing** (owner, 2026-09-06).
 *
 * `detail` is one sentence — «Renter: X · Supplier: Y» — built by two different mappers, and every
 * reader used to print it whole. On a refusal its second half repeats the state the row is already
 * painted in («Supplier: Not confirmed» beside a red «Conflict»); it earns its place only when the
 * supplier named something ELSE, which is the TÜV-versus-SPSP case.
 *
 * `offered: null` is the signal for "he named no alternative". These pin the ways a refusal can be
 * spelled, because both mappers and both locales phrase it differently.
 */
const row = (detail: { en: string; ar: string } | undefined, extra?: Partial<TermRow>): TermRow => ({
  key: "certs",
  labelEn: "Equipment certificate",
  labelAr: "شهادة المعدة",
  state: "conflict",
  detail,
  ...extra,
});

describe("the supplier's own value, when there is one", () => {
  it("reads both halves of an in-app conflict", () => {
    const sides = termSides(row({ en: "Renter: TÜV · Supplier: SPSP", ar: "المستأجر: TÜV · المؤجّر: SPSP" }), false);
    expect(sides).toEqual({ asked: "TÜV", offered: "SPSP" });
  });

  it("reads the Arabic sentence with the Arabic party words", () => {
    const sides = termSides(row({ en: "", ar: "المستأجر: TÜV · المؤجّر: SPSP" }), true);
    expect(sides).toEqual({ asked: "TÜV", offered: "SPSP" });
  });

  it("falls back to the row's own fields when there is no detail", () => {
    expect(termSides(row(undefined, { renteeValue: "net_30", value: "net_60" }), false)).toEqual({
      asked: "net_30",
      offered: "net_60",
    });
  });
});

describe("a refusal is not an offer", () => {
  it("returns no offer for «Not confirmed» — the off-platform spelling", () => {
    const sides = termSides(row({ en: "Renter: TÜV · Supplier: Not confirmed", ar: "المستأجر: TÜV · المؤجّر: غير مؤكد" }), false);
    expect(sides).toEqual({ asked: "TÜV", offered: null });
  });

  it("…in Arabic too", () => {
    const sides = termSides(row({ en: "", ar: "المستأجر: TÜV · المؤجّر: غير مؤكد" }), true);
    expect(sides.offered).toBeNull();
  });

  it("returns no offer for the older Yes/No spelling, or a dash", () => {
    expect(termSides(row({ en: "Renter: On supplier · Supplier: No", ar: "" }), false).offered).toBeNull();
    expect(termSides(row({ en: "Renter: 2018 · Supplier: —", ar: "" }), false).offered).toBeNull();
  });

  it("keeps a real value that merely looks short", () => {
    // The guard is on the words a refusal uses, not on length: «2019» and «SPSP» must survive.
    expect(termSides(row({ en: "Renter: 2018 · Supplier: 2019", ar: "" }), false).offered).toBe("2019");
  });
});

describe("a detail that is a sentence, not a pair", () => {
  it("reads as the supplier's side, which is the half every caller draws", () => {
    const sides = termSides(row({ en: "Operator required, none included", ar: "" }), false);
    expect(sides.offered).toBe("Operator required, none included");
    expect(sides.asked).toBeNull();
  });
});
