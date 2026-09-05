import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmedProject, makeItem, TAXONOMY } from "../setup/canvas";
import { defaultPreferences } from "@/lib/contract";
import type { EquipmentItem } from "@/lib/contract";

/**
 * Off-catalogue equipment: a machine the catalogue cannot place, NAMED by the renter and posted.
 *
 * The old behaviour — the row is drawn, gates nothing and posts nothing — is
 * `canvas-no-match.test.tsx`, and it is still what ships until the backend accepts an item with no
 * taxonomy ids. Everything here is behind `NEXT_PUBLIC_CUSTOM_EQUIPMENT=1`, read at module load, so
 * each case re-imports the modules with the flag on.
 */
const FLAG = "NEXT_PUBLIC_CUSTOM_EQUIPMENT";
const REAL = process.env[FLAG];

async function withFlag() {
  vi.resetModules();
  process.env[FLAG] = "1";
  return {
    gates: await import("@/lib/contract/gates"),
    adapters: await import("@/lib/api/app-adapters"),
    draftBidForm: (await import("@/lib/draftBidForm")).draftBidForm,
  };
}

/** The renter's RFQ said "floating crane barge"; the agent placed nothing. */
const barge = (over: Partial<EquipmentItem> = {}): EquipmentItem =>
  makeItem({
    id: "nm1",
    rawLabel: "floating crane barge",
    rawSize: null,
    ref: { categoryId: null, subcategoryId: null, measurementId: null },
    verdict: "no-match",
    resolved: false,
    ...over,
  });

const payload = (items: EquipmentItem[]) => ({
  project: confirmedProject(),
  items,
  preferences: defaultPreferences(),
});

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (REAL === undefined) delete process.env[FLAG];
  else process.env[FLAG] = REAL;
  vi.resetModules();
});

describe("what makes a line off-catalogue", () => {
  it("is a no-match line with no subtype — and a picked subtype ends it", async () => {
    const { gates } = await withFlag();
    expect(gates.isCustomLine(barge())).toBe(true);
    // Mid-pick: the renter found his machine in the list. The line is ordinary from that moment, and
    // the payload must carry ids rather than a name — a partial triple is a 422 by design.
    expect(gates.isCustomLine(barge({ ref: { categoryId: "cat-earth", subcategoryId: "sub-crawler", measurementId: null } }))).toBe(false);
    expect(gates.isCustomLine(barge({ removed: true }))).toBe(false);
    expect(gates.isCustomLine(makeItem())).toBe(false);
  });

  it("is nobody's business with the flag off — the old behaviour, to the letter", async () => {
    vi.resetModules();
    delete process.env[FLAG];
    const gates = await import("@/lib/contract/gates");
    expect(gates.isCustomLine(barge())).toBe(false);
    expect(gates.postableItems([barge()])).toHaveLength(0);
    expect(gates.itemAppGaps(barge())).toEqual([]);
  });
});

describe("the name is the required answer, in place of the taxonomy", () => {
  it("seeds from the renter's own RFQ words, so an untouched line is already named", async () => {
    const { gates } = await withFlag();
    expect(gates.customName(barge())).toBe("floating crane barge");
    expect(gates.itemAppGaps(barge())).toEqual([]);
  });

  it("blocks when he clears the box — an empty string is an answer, not a missing one", async () => {
    const { gates } = await withFlag();
    const cleared = barge({ customEquipment: "" });
    expect(gates.customName(cleared)).toBe("");
    expect(gates.itemAppGaps(cleared).map((g) => g.field)).toEqual(["custom_equipment"]);
    // Whitespace is not a name either.
    expect(gates.customName(barge({ customEquipment: "   " }))).toBe("");
  });

  it("never asks for a category, a subtype or a size", async () => {
    const { gates } = await withFlag();
    const fields = gates.itemAppGaps(barge({ customEquipment: "" })).map((g) => g.field);
    expect(fields).not.toContain("category");
    expect(fields).not.toContain("subtype");
    expect(fields).not.toContain("capacity");
  });
});

describe("posting", () => {
  it("keeps a named line and drops an unnamed one", async () => {
    const { gates } = await withFlag();
    expect(gates.postableItems([barge()]).map((i) => i.id)).toEqual(["nm1"]);
    expect(gates.postableItems([barge({ customEquipment: "" })])).toHaveLength(0);
  });

  it("OMITS the three id keys and sends the name", async () => {
    const { adapters } = await withFlag();
    const body = adapters.draftToCreateRequest(payload([barge({ customEquipment: "floating crane barge" })]), "7");
    const item = body.equipmentItems[0] as unknown as Record<string, unknown>;

    // `in`, not `=== undefined`: a key that is present and null would pass the second and 422 on the
    // wire, because the backend's fields are `.optional()`, never `.nullable()`.
    expect("categoryId" in item).toBe(false);
    expect("subtypeId" in item).toBe(false);
    expect("capacityId" in item).toBe(false);
    expect(JSON.stringify(item)).not.toContain("categoryId");
    expect(item.customEquipmentName).toBe("floating crane barge");
  });

  it("leaves an ordinary line's payload exactly as it was", async () => {
    const { adapters } = await withFlag();
    const item = adapters.draftToCreateRequest(payload([makeItem()]), "7").equipmentItems[0] as unknown as Record<string, unknown>;
    expect(item.categoryId).toBe("cat-earth");
    expect(item.subtypeId).toBe("sub-crawler");
    expect(item.capacityId).toBe("cap-30");
    expect("customEquipmentName" in item).toBe(false);
  });

  it("sends no ids at all for a line the agent placed a CATEGORY on but no subtype", async () => {
    const { adapters } = await withFlag();
    // `deriveVerdict` returns no-match on a missing subtype even when the category resolved, and one
    // or two ids is a 422. All three go, or none do.
    const half = barge({ ref: { categoryId: "cat-lifting", subcategoryId: null, measurementId: null } });
    const item = adapters.draftToCreateRequest(payload([half]), "7").equipmentItems[0] as unknown as Record<string, unknown>;
    expect("categoryId" in item).toBe(false);
    expect(item.customEquipmentName).toBe("floating crane barge");
  });
});

describe("what the supplier reads", () => {
  it("names the machine on the Ready-to-send preview, with no size beside it", async () => {
    const { draftBidForm } = await withFlag();
    const form = draftBidForm(confirmedProject(), [barge({ customEquipment: "floating crane barge" })], TAXONOMY);
    expect(form?.items).toHaveLength(1);
    expect(form?.items[0].label).toBe("floating crane barge");
    // Both locales carry his words: he typed one language and we do not invent the other.
    expect(form?.items[0].labelAr).toBe("floating crane barge");
    expect(form?.items[0].size).toBeNull();
    expect(form?.items[0].sizeAr).toBeNull();
  });
});

describe("reading a posted request back", () => {
  it("prints the renter's words wherever the taxonomy name would go", async () => {
    const { itemName } = await import("@/lib/contract/requests");
    const raw = {
      // The backend returns the ids as the EMPTY STRING for such a line, and every name null.
      categoryId: "", subtypeId: "", capacityId: "",
      categoryName: null, categoryNameAr: null,
      subtypeName: null, subtypeNameAr: null,
      capacityName: null, capacityNameAr: null,
      subtypeImageUrl: null, subtypeEquipmentImageUrl: null, categoryImageUrl: null,
      numberOfUnits: 1, operatorIncluded: "YES" as const, fuelTypePreference: null,
      mobilizationByRentee: null, demobilizationByRentee: null, nightShiftRequired: null,
      operatorNationality: null,
      customEquipmentName: "floating crane barge",
      isUndefined: true,
    };
    expect(itemName(raw as never, false)).toBe("floating crane barge");
    expect(itemName(raw as never, true)).toBe("floating crane barge");
  });

  it("branches on isUndefined, never on the ids", async () => {
    const { itemName } = await import("@/lib/contract/requests");
    // A stray name on an ordinary line is ignored: the taxonomy wins, exactly as on the wire.
    const ordinary = {
      subtypeName: "Crawler excavator", subtypeNameAr: "حفارة زاحفة",
      capacityName: "20 ton", capacityNameAr: "٢٠ طن",
      categoryName: null, categoryNameAr: null,
      customEquipmentName: "floating crane barge", isUndefined: false,
    };
    expect(itemName(ordinary as never, false)).toBe("Crawler excavator · 20 ton");
  });
});
