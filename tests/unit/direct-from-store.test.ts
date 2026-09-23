import { describe, expect, it } from "vitest";
import { canSeedDirect, directRequestDraft } from "@/lib/agent/direct-draft";
import { initialState, reducer } from "@/lib/store/rfq-store";

/**
 * A request started from ONE supplier's listing opens on the FORM, not on the intake (app parity,
 * Epic 008).
 *
 * The web used to push the machine's name into the "describe your request" box and parse it, so the
 * renter was asked to write down the row he had just tapped and then wait for us to guess which
 * catalogue row he meant. The app has never done that: `public_equipment_detail_sheet.dart` builds
 * an `EquipmentPrefill` off the listing and opens its wizard with the equipment already chosen.
 */
const LISTING = {
  categoryId: "cat-earth",
  subtypeId: "sub-crawler",
  capacityId: "cap-30",
  label: "Crawler excavator 30 ton Caterpillar 320",
  fuel: "DIESEL",
  year: 2021,
};

describe("what can be seeded", () => {
  it("needs the WHOLE triple — one or two ids is a 422 on the wire", () => {
    expect(canSeedDirect(LISTING)).toBe(true);
    expect(canSeedDirect({ ...LISTING, capacityId: null })).toBe(false);
    expect(canSeedDirect({ ...LISTING, subtypeId: null })).toBe(false);
    expect(canSeedDirect({ categoryId: null, subtypeId: null, capacityId: null })).toBe(false);
    expect(canSeedDirect(null)).toBe(false);
  });
});

describe("the listing as a draft", () => {
  it("carries the machine by id, already answered", () => {
    const item = directRequestDraft(LISTING).items[0];
    expect(item.ref).toEqual({ categoryId: "cat-earth", subcategoryId: "sub-crawler", measurementId: "cap-30" });
    // Nothing to validate: these ids came off the row the renter chose, not out of a model.
    expect(item.verdict).toBe("confident");
    expect(item.resolved).toBe(true);
    expect(item.rawLabel).toBe("Crawler excavator 30 ton Caterpillar 320");
  });

  it("takes the listing's fuel, and its year as the MINIMUM the request accepts", () => {
    const item = directRequestDraft(LISTING).items[0];
    expect(item.fuelType).toBe("diesel");
    expect(item.equipmentYear).toBe("2021");
  });

  it("drops an implausible year rather than asking for it", () => {
    expect(directRequestDraft({ ...LISTING, year: 1849 }).items[0].equipmentYear).toBeNull();
    expect(directRequestDraft({ ...LISTING, year: null }).items[0].equipmentYear).toBeNull();
  });

  it("leaves the item's own fuel default alone when the listing states none", () => {
    expect(directRequestDraft({ ...LISTING, fuel: null }).items[0].fuelType).toBe("diesel");
  });

  it("states no price, make or model — a request says what the renter needs", () => {
    const draft = directRequestDraft(LISTING);
    const json = JSON.stringify(draft.items[0]);
    // The label is the only place the make appears, and it is display text under «YOU WROTE».
    expect(draft.items[0].additionalNotes).toBe("");
    expect(json).not.toContain("priceUnit");
  });
});

describe("where the renter lands", () => {
  it("opens the canvas, past the intake, with nothing marked as his own answer yet", () => {
    const after = reducer(initialState, { t: "PROCESS_SUCCESS", draft: directRequestDraft(LISTING) });
    expect(after.phase).toBe("wizard");
    expect(after.activeSection).toBe("equipment");
    expect(after.draft?.items).toHaveLength(1);
    // MREQ-AC-59: seeded, not typed — the canvas says so on each control.
    expect(after.draft?.touchedFields).toEqual([]);
    // And the origin snapshot exists, so an edit before submit still fires the web_review correction.
    expect(after.agentOrigin?.items[0].ref.subcategoryId).toBe("sub-crawler");
  });
});

/**
 * ── A SECOND direct press must answer the machine that was pressed (owner, 2026-09-10) ───────────
 * *"we have an issue in direct request, why does it take him to the intake UI"*.
 *
 * Two faults, both in guards written to stop the create page's effect re-dispatching on every
 * render, and both reproduced in a browser against staging before this was changed:
 *
 *  · The gate returned when `state.direct` already named the URL's supplier, so the second machine
 *    from one store seeded NOTHING — and the `prefill` fallback sits after the same return, so the
 *    renter met an empty intake with a direct ribbon over it.
 *  · The gate returned when a draft existed, so a press with one open kept the OLD machine: the URL
 *    said 500 ton and the canvas said 220.
 *
 * The store side of that is here: seeding a second machine must REPLACE the item, not append to it
 * and not be refused. The page's own guard (the machine's own key) is what decides when to call it.
 */
describe("a second machine from the same store", () => {
  const SECOND = { ...LISTING, capacityId: "cap-50", label: "Crawler excavator 50 ton" };

  it("replaces the machine on the draft rather than adding to it", () => {
    const first = reducer(initialState, { t: "PROCESS_SUCCESS", draft: directRequestDraft(LISTING) });
    expect(first.draft?.items).toHaveLength(1);
    expect(first.draft?.items[0].ref.measurementId).toBe("cap-30");

    const second = reducer(first, { t: "PROCESS_SUCCESS", draft: directRequestDraft(SECOND) });
    // ONE machine, and it is the one he just pressed. A renter pricing a 50 ton crane must never be
    // shown the 30 ton one he looked at a minute ago.
    expect(second.draft?.items).toHaveLength(1);
    expect(second.draft?.items[0].ref.measurementId).toBe("cap-50");
    expect(second.draft?.items[0].rawLabel).toBe("Crawler excavator 50 ton");
  });

  it("keeps the recipient across the swap — both presses are that store's", () => {
    const withDirect = reducer(initialState, { t: "SET_DIRECT", direct: { supplierId: "474", supplierName: "Arabian Cranes Co.", storeId: "st-1" } });
    const seeded = reducer(withDirect, { t: "PROCESS_SUCCESS", draft: directRequestDraft(SECOND) });
    expect(seeded.direct?.supplierId).toBe("474");
    // And the canvas is where he lands: a seeded direct request never sits on the intake screen.
    expect(seeded.phase).toBe("wizard");
  });
});
