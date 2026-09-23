import { describe, expect, it } from "vitest";
import { taxTag, taxName } from "@/lib/contract/taxonomy";

/**
 * **The category box reads in the renter's language** (owner, 2026-09-08: *"Category Arabic missing,
 * always shows in English"*).
 *
 * `GET /equipment/taxonomy` carries `nameAr` for every node but no `tagAr`, and the CATEGORY box
 * shows the TAG — the canonical grouping — not the node's name. So an Arabic renter picked
 * «رافعة شوكية» for the type and read «Lifting, Cranes & Aerial» in the box above it.
 *
 * The seven values are the backend's own vocabulary, checked against staging on 2026-09-08.
 */
describe("a taxonomy tag speaks the reader's language", () => {
  it("translates every tag the taxonomy actually uses", () => {
    const live = [
      "BMU",
      "Demolition, Crushing & Screening",
      "Drilling & Foundation",
      "Earthmoving & Excavation",
      "Lifting, Cranes & Aerial",
      "Light Construction & Support",
      "Road Construction & Paving",
    ];
    for (const tag of live) {
      const ar = taxTag(tag, "ar");
      expect(ar, tag).not.toBe(tag);
      // Arabic, not a transliteration: at least one Arabic-script character.
      expect(/[؀-ۿ]/.test(ar), tag).toBe(true);
    }
  });

  it("leaves English alone", () => {
    expect(taxTag("Lifting, Cranes & Aerial", "en")).toBe("Lifting, Cranes & Aerial");
  });

  it("passes an unknown tag through rather than guessing", () => {
    // A group added upstream shows in English until it is added to the map — visibly wrong, which
    // is the point: a guessed translation would be quietly wrong instead.
    expect(taxTag("Marine & Dredging", "ar")).toBe("Marine & Dredging");
  });

  it("says nothing for nothing", () => {
    expect(taxTag(null, "ar")).toBe("");
    expect(taxTag(undefined, "en")).toBe("");
  });

  it("still prefers a node's own Arabic name where one exists", () => {
    // `taxName` is untouched — the two answer different questions: the node, and its group.
    expect(taxName({ name: "Articulating Boom Lift", nameAr: "رافعة بذراع مفصلي" }, "ar")).toBe("رافعة بذراع مفصلي");
    expect(taxName({ name: "Articulating Boom Lift", nameAr: null }, "ar")).toBe("Articulating Boom Lift");
  });
});
