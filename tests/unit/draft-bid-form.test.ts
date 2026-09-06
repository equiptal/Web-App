import { describe, it, expect } from "vitest";
import { draftBidForm } from "@/lib/draftBidForm";
import { bidCardModel } from "@/lib/bidCardModel";
import type { EquipmentItem, ProjectDetails } from "@/lib/contract/draft";
import type { Taxonomy } from "@/lib/contract/taxonomy";

/**
 * The preview a renter reads BEFORE he posts.
 *
 * It used to be an empty frame with "fills in once the request is posted" under it — the renter was
 * asked to approve a message he could not see, and his only chance to change his mind came once the
 * request was already live. The draft in hand holds every value that card draws.
 */

const TAXONOMY: Taxonomy = [
  {
    id: "earth",
    name: "Earthmoving",
    nameAr: "أعمال الحفر",
    tag: "Earthmoving",
    subcategories: [
      {
        id: "exc",
        name: "Crawler Excavator",
        nameAr: "حفارة زاحفة",
        measurements: [{ id: "20t", name: "20 ton", nameAr: "20 طن" }],
      },
    ],
  },
] as unknown as Taxonomy;

const project = (over: Partial<ProjectDetails> = {}): ProjectDetails =>
  ({
    location: { label: "4816, 6254, Riyadh 12541, Saudi Arabia", confirmed: true },
    timing: { rentalBasis: "monthly", extendable: true, startDate: "2026-09-01", endDate: "2026-12-31", hoursPerDay: 10 },
    advanced: { workingDaysPerWeek: 6, overtimeRate: "without", equipmentYear: "any" },
    certificates: { safety: ["tuv"], safetyOther: "", other: [] },
    deliveryToSite: "me",
    returnFromSite: "supplier",
    fuelResponsibility: "me",
    ...over,
  }) as unknown as ProjectDetails;

const item = (over: Partial<EquipmentItem> = {}): EquipmentItem =>
  ({
    id: "m101",
    rawLabel: "excavator",
    rawSize: null,
    ref: { categoryId: "earth", subcategoryId: "exc", measurementId: "20t" },
    verdict: "confident",
    resolved: true,
    removed: false,
    quantity: 2,
    operatorNeeded: "yes",
    operator: { nightShift: false, nationality: null, certificate: [], fatFood: "me", fatAccommodationTransport: "supplier" },
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    ...over,
  }) as unknown as EquipmentItem;

describe("draftBidForm", () => {
  it("Given a draft, Then the card reads the same as it will once posted", () => {
    const form = draftBidForm(project(), [item()], TAXONOMY)!;
    const m = bidCardModel(null, { title: "", description: "" }, "en", form);

    // The machine, its size, its count and the operator — everything a supplier scans for.
    expect(m.cardTitle).toBe("Crawler Excavator 20 ton · with operator 2 units");
    expect(m.where).toContain("Riyadh");
    // `extendable` is drawn only when the renter said yes, and he did.
    expect(m.where).toContain("extendable");
    expect(m.accepting).toBe(true);
  });

  it("Given the draft says the renter delivers, Then the card does not tell the supplier he does", () => {
    /**
     * ⚠️ The draft spells the renter `"me"`; `party()` in the card reads `ME` as the SUPPLIER,
     * because that is what it means on a bid. Left untranslated, a card tells the supplier he is
     * delivering the machine the renter is delivering — and he prices a mobilization nobody asked for.
     */
    const m = bidCardModel(null, { title: "", description: "" }, "en", draftBidForm(project(), [item()], TAXONOMY)!);
    const rows = Object.fromEntries(m.terms.map((r) => [r.label, r.value]));

    expect(rows["Mobilization"]).toBe("Renter");
    expect(rows["Demobilization"]).toBe("Supplier");
    expect(rows["Fuel"]).toBe("Renter · diesel");
  });

  it("Given no equipment yet, Then it answers null rather than a card with nothing on it", () => {
    // `bidCardModel` falls back to its two-string path on an empty form, and that path with no
    // strings draws an empty card. Null lets the panel say the request has no machines yet.
    expect(draftBidForm(project(), [], TAXONOMY)).toBeNull();
    expect(draftBidForm(project(), [item({ removed: true })], TAXONOMY)).toBeNull();
    expect(draftBidForm(null, [item()], TAXONOMY)).toBeNull();
  });

  it("Given a no-match line, Then it is left out — it is never posted either", () => {
    const form = draftBidForm(project(), [item(), item({ id: "m2", verdict: "no-match" })], TAXONOMY)!;
    expect(form.items).toHaveLength(1);
  });

  it("Given the request is a draft, Then it carries no reference and no link", () => {
    // Both are minted by the backend on create. Everything else is the renter's own writing.
    const form = draftBidForm(project(), [item()], TAXONOMY)!;
    expect(form.token).toBe("");
    expect(bidCardModel(null, { title: "", description: "" }, "en", form).ref).toBeNull();
  });
});
