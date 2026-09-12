import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmedProject, makeItem } from "../setup/canvas";
import { defaultPreferences } from "@/lib/contract";
import { itemName } from "@/lib/contract/requests";
import { itemDisplayName } from "@/lib/contract/request-fields";
import { reducer, initialState } from "@/lib/store/rfq-store";
import type { EquipmentItem } from "@/lib/contract";

/**
 * **The renter's own words, on every line** (owner, 2026-09-12).
 *
 * The field stopped meaning «the name of a machine we do not carry» and became «what the renter calls
 * this machine». Two rules follow, and they are separate:
 *
 *  1. **Reading**: the taxonomy whenever the line has one — hidden included — and his words only when
 *     it has none. *"If null taxonomy then read from the user words, otherwise use taxonomy even if
 *     hidden."*
 *  2. **Sending**: whatever the line holds. One of the two must be present; both may be.
 *
 * The wire half is behind `EQUIPMENT_NAME_ON_EVERY_LINE`, which waits on backend-agents B1 — see the
 * flag's own note for what ships early otherwise (every bid link loses its QR).
 */
const FLAG = "NEXT_PUBLIC_EQUIPMENT_NAME_EVERY_LINE";
const REAL = process.env[FLAG];

const payload = (items: EquipmentItem[]) => ({ project: confirmedProject(), items, preferences: defaultPreferences() });

async function adapters(on: boolean) {
  vi.resetModules();
  if (on) process.env[FLAG] = "1";
  else delete process.env[FLAG];
  return import("@/lib/api/app-adapters");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  if (REAL === undefined) delete process.env[FLAG];
  else process.env[FLAG] = REAL;
  vi.resetModules();
});

describe("reading: the taxonomy first, his words only without one", () => {
  const line = (over: Record<string, unknown>) =>
    ({
      categoryId: "", subtypeId: "", capacityId: "",
      categoryName: null, categoryNameAr: null, subtypeName: null, subtypeNameAr: null,
      capacityName: null, capacityNameAr: null,
      subtypeImageUrl: null, subtypeEquipmentImageUrl: null, categoryImageUrl: null,
      numberOfUnits: 1, operatorIncluded: "YES", fuelTypePreference: null,
      mobilizationByRentee: null, demobilizationByRentee: null, nightShiftRequired: null,
      operatorNationality: null,
      ...over,
    }) as never;

  it("a matched line reads by the CATALOGUE, even though it now carries his words", () => {
    const it0 = line({
      subtypeName: "Water truck", capacityName: "20,000 L",
      subtypeNameAr: "شاحنة مياه", capacityNameAr: "٢٠٬٠٠٠ لتر",
      customEquipmentName: "water tanker", isUndefined: false,
    });
    expect(itemName(it0, false)).toBe("Water truck · 20,000 L");
    expect(itemDisplayName(it0, false)).toBe("Water truck · 20,000 L");
  });

  /**
   * ⚠️ The case the old code got wrong. A HIDDEN line is `isUndefined: true` — no dispatch, no deal
   * room, no QR — and it still has a catalogue name, which is what the renter must read it by. A
   * reader keyed on `isUndefined` printed his words here.
   */
  it("a HIDDEN line is undefined for BEHAVIOUR and still reads by its catalogue name", () => {
    const it0 = line({
      subtypeName: "Light tower", capacityName: "9 m",
      customEquipmentName: "light tower", isUndefined: true,
    });
    expect(itemName(it0, false)).toBe("Light tower · 9 m");
  });

  it("a line with no taxonomy at all reads by his words, in both languages", () => {
    const it0 = line({ customEquipmentName: "floating crane barge", isUndefined: true });
    expect(itemName(it0, false)).toBe("floating crane barge");
    expect(itemName(it0, true)).toBe("floating crane barge");
  });

  it("and «—» when there is neither", () => {
    expect(itemName(line({ isUndefined: true }), false)).toBe("—");
  });
});

describe("his words survive the round trip through the taxonomy", () => {
  const stateWith = (over: Partial<EquipmentItem> = {}) =>
    ({
      ...initialState,
      draft: { project: confirmedProject(), items: [makeItem({ id: "a0", ...over })], preferences: defaultPreferences(), touchedFields: [] },
    }) as unknown as Parameters<typeof reducer>[0];

  it("picking a type keeps them — a match does not make his words untrue", () => {
    const off = reducer(stateWith(), { t: "SET_ITEM_OFF_CATALOGUE", id: "a0", name: "water tanker" });
    const back = reducer(off, { t: "SET_ITEM_SUBCATEGORY", id: "a0", subcategoryId: "sub-crawler" });
    expect(back.draft!.items[0].customEquipment).toBe("water tanker");
    expect(back.draft!.items[0].ref.subcategoryId).toBe("sub-crawler");
  });

  it("and pressing «use my own name» carries whatever the box held into the off-catalogue state", () => {
    const before = stateWith({ customEquipment: "water tanker" });
    const off = reducer(before, { t: "SET_ITEM_OFF_CATALOGUE", id: "a0", name: "water tanker" });
    expect(off.draft!.items[0].customEquipment).toBe("water tanker");
    expect(off.draft!.items[0].ref.subcategoryId).toBeNull();
    expect(off.draft!.items[0].verdict).toBe("no-match");
  });
});

describe("sending, behind the switch", () => {
  it("OFF: today's shape — the ids alone on a matched line", async () => {
    const { draftToCreateRequest } = await adapters(false);
    const item = draftToCreateRequest(payload([makeItem({ customEquipment: "water tanker" })]), "7")
      .equipmentItems[0] as unknown as Record<string, unknown>;
    expect(item.subtypeId).toBe("sub-crawler");
    expect("customEquipmentName" in item).toBe(false);
  });

  it("ON: the ids AND his words, because the backend stores them in separate columns", async () => {
    const { draftToCreateRequest } = await adapters(true);
    const item = draftToCreateRequest(payload([makeItem({ customEquipment: "water tanker" })]), "7")
      .equipmentItems[0] as unknown as Record<string, unknown>;
    expect(item.subtypeId).toBe("sub-crawler");
    expect(item.customEquipmentName).toBe("water tanker");
  });

  it("ON: an empty box OMITS the key — `min(1)` on the backend would 422 an empty string", async () => {
    const { draftToCreateRequest } = await adapters(true);
    const item = draftToCreateRequest(payload([makeItem({ customEquipment: "   ", rawLabel: null })]), "7")
      .equipmentItems[0] as unknown as Record<string, unknown>;
    expect("customEquipmentName" in item).toBe(false);
    expect(item.subtypeId).toBe("sub-crawler");
  });

  it("ON: his RFQ words are the fallback when he typed nothing into the box", async () => {
    const { draftToCreateRequest } = await adapters(true);
    const item = draftToCreateRequest(payload([makeItem({ customEquipment: null, rawLabel: "30 ton digger" })]), "7")
      .equipmentItems[0] as unknown as Record<string, unknown>;
    expect(item.customEquipmentName).toBe("30 ton digger");
  });
});
