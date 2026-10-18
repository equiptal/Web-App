import { describe, expect, it } from "vitest";
import { bidSizeNote } from "@/lib/contract/bids";

/** A bid list row as `GET /marketplace/requests/{id}/bids` sends it, cut to what the note reads. */
const row = (extra: Record<string, unknown>) => ({
  request: { equipmentItems: [{ capacityName: "20 ton", capacityNameAr: "20 طن" }] },
  offeredUnitsDetail: [
    { equipmentId: "a", measurementName: "20 ton", measurementNameAr: "20 طن" },
    { equipmentId: "b", measurementName: "30 ton", measurementNameAr: "30 طن" },
  ],
  ...extra,
});

describe("bidSizeNote: the app's size strips, read off the server", () => {
  it("says nothing when the size matches", () => {
    expect(bidSizeNote(row({ capacitySizeRelation: "exact", sizeMismatch: null }))).toBeNull();
    expect(bidSizeNote(row({}))).toBeNull();
  });

  it("names the first offered machine whose size differs, for larger and mixed", () => {
    expect(bidSizeNote(row({ capacitySizeRelation: "larger" }))).toEqual({
      kind: "larger",
      size: { en: "30 ton", ar: "30 طن" },
      kinds: ["larger"],
    });
    expect(bidSizeNote(row({ capacitySizeRelation: "mixed" }))?.kind).toBe("larger");
  });

  it("goes generic when no offered machine names a different size", () => {
    const n = bidSizeNote({ ...row({ capacitySizeRelation: "larger" }), offeredUnitsDetail: [] });
    expect(n?.size).toBeNull();
  });

  it("puts a mismatch first, and keeps larger beside it for the hover sentence", () => {
    const n = bidSizeNote(row({ capacitySizeRelation: "larger", sizeMismatch: "smaller" }));
    expect(n?.kind).toBe("smaller");
    expect(n?.kinds).toEqual(["smaller", "larger"]);
  });

  it("never names a size for unknown", () => {
    expect(bidSizeNote(row({ sizeMismatch: "unknown" }))).toEqual({ kind: "unknown", size: null, kinds: ["unknown"] });
  });
});
