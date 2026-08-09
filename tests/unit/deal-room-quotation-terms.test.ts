import { describe, it, expect } from "vitest";
import { mapQuotation, isHiddenDealRoomTermKey } from "@/lib/contract/deal-room";

/** A Quotation snapshot from a deal closed BEFORE the two terms were retired. The row is frozen at
 *  close and never rewritten, so it still carries `operator_nationality` and `safety_certifications`
 *  in its JSON long after both were retired from the deal-room surface. That is the real shape the
 *  filter exists for — not a hypothetical one. */
const staleSnapshot = () =>
  mapQuotation({
    id: "q-1",
    agreedRate: 30_000,
    priceUnit: "PER_MONTH",
    contractType: "RENTAL",
    agreedTerms: [
      { key: "payment_terms", label: "Payment terms", labelAr: "شروط الدفع", value: "NET_30" },
      { key: "operator_nationality", label: "Operator nationality", labelAr: "جنسية المشغل", value: "SA" },
      { key: "safety_certifications", label: "Safety certifications", labelAr: "شهادات السلامة", value: "SPSP" },
      { key: "PRICE", label: "Price", labelAr: "السعر", value: 30_000 },
    ],
  });

describe("terms the app retired are stripped from the snapshot too", () => {
  it("filters the hidden keys at parse, the way the app does", () => {
    expect(staleSnapshot().agreedTerms.map((t) => t.key)).toEqual(["payment_terms"]);
  });

  it("prints neither retired term for a deal closed BEFORE the retirement", () => {
    // One contract, two documents was the bug: the snapshot still carried both, so the web printed
    // them on the quotation and the app printed neither.
    const labels = staleSnapshot().agreedTerms.map((t) => `${t.label} ${t.labelAr}`).join(" ");
    expect(labels).not.toMatch(/operator nationality/i);
    expect(labels).not.toMatch(/safety certifications/i);
  });

  it("keeps the terms that are NOT retired", () => {
    const [term] = staleSnapshot().agreedTerms;
    expect(term).toMatchObject({ key: "payment_terms", label: "Payment terms", value: "NET_30" });
  });

  it("matches keys case-insensitively, so a recased payload cannot smuggle one onto the paper", () => {
    expect(isHiddenDealRoomTermKey("operator_nationality")).toBe(true);
    expect(isHiddenDealRoomTermKey("Safety_Certifications")).toBe(true); // app parity
    expect(isHiddenDealRoomTermKey("payment_terms")).toBe(false);
  });

  it("survives a snapshot with no terms at all", () => {
    expect(mapQuotation({ id: "q-2" }).agreedTerms).toEqual([]);
  });
});
