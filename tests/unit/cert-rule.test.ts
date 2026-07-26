import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import {
  defaultProjectDetails,
  defaultPreferences,
  equipmentCertDefault,
  isLiftingCategory,
  newManualItem,
  normalizeSafetyCert,
  operatorCertDefault,
  splitSafetyCerts,
} from "@/lib/contract";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import type { EquipmentItem, RfqDraft, Taxonomy } from "@/lib/contract";
import { nodesToTree } from "@/lib/api/app-adapters";

/**
 * 2026-07 certificate rule — parity with the mobile create-request flow:
 *   lifting / cranes / aerial → equipment ARAMCO + operator SPSP
 *   every other group         → equipment TÜV    + operator SPSP
 * plus the request-wide ("settings for all items") picker fanning onto every item.
 */

// Tagged taxonomy, as the live backend returns it (tag on the CATEGORY row).
const TAXONOMY: Taxonomy = [
  { id: "cat-earth", name: "Earthmoving", nameAr: "أعمال الحفر", tag: "Earthmoving", subcategories: [{ id: "sub-exc", name: "Excavators", measurements: [] }] },
  { id: "cat-lift", name: "Cranes", nameAr: "رافعات", tag: "Lifting, Cranes & Aerial", subcategories: [{ id: "sub-mc", name: "Mobile Cranes", measurements: [] }] },
  // Untagged (fixture / pre-reorg data) → falls back to the name hints.
  { id: "material-handling", name: "Material Handling", subcategories: [{ id: "forklifts", name: "Forklifts", measurements: [] }] },
  { id: "power", name: "Power & Lighting", subcategories: [{ id: "generators", name: "Generators", measurements: [] }] },
];

function draftWith(items: EquipmentItem[]): RfqDraft {
  return {
    project: defaultProjectDetails(),
    items,
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: { totalItems: items.length, needsValidation: 0, notAvailable: 0 },
  };
}

function stateWith(items: EquipmentItem[]) {
  return { ...initialState, taxonomy: TAXONOMY, phase: "wizard" as const, draft: draftWith(items) };
}

function item(id: string, patch: Partial<EquipmentItem> = {}): EquipmentItem {
  return { ...newManualItem(id), ...patch };
}

describe("isLiftingCategory", () => {
  it("uses the taxonomy tag as the authoritative signal", () => {
    expect(isLiftingCategory({ categoryId: "cat-lift" }, TAXONOMY)).toBe(true);
    expect(isLiftingCategory({ categoryId: "cat-earth" }, TAXONOMY)).toBe(false);
  });

  it("does not mis-classify a tagged non-lifting category whose name reads like lifting", () => {
    // A BMU "Basket Crane" carries a non-lifting tag; the tag wins over the name hint.
    const tax: Taxonomy = [{ id: "bmu", name: "Basket Crane (BMU)", tag: "Access & Scaffolding", subcategories: [] }];
    expect(isLiftingCategory({ categoryId: "bmu" }, tax)).toBe(false);
  });

  it("falls back to English name hints when no tag is present", () => {
    // Neither the id nor the category name contains "lifting" — the subcategory hint resolves it.
    expect(isLiftingCategory({ categoryId: "material-handling", subcategoryId: "forklifts" }, TAXONOMY)).toBe(true);
    expect(isLiftingCategory({ categoryId: "power", subcategoryId: "generators" }, TAXONOMY)).toBe(false);
  });

  it("falls back to Arabic name hints", () => {
    const tax: Taxonomy = [{ id: "x", name: "Unknown", nameAr: "معدات رفع", subcategories: [] }];
    expect(isLiftingCategory({ categoryId: "x" }, tax)).toBe(true);
  });

  it("treats an unknown category as non-lifting", () => {
    expect(isLiftingCategory({ categoryId: null }, TAXONOMY)).toBe(false);
    expect(isLiftingCategory({ categoryId: "nope" }, TAXONOMY)).toBe(false);
  });
});

describe("cert defaults", () => {
  it("maps lifting to Aramco and everything else to TÜV", () => {
    expect(equipmentCertDefault(true)).toBe("aramco");
    expect(equipmentCertDefault(false)).toBe("tuv");
  });

  it("seeds SPSP as the operator cert for every group (Aramco is equipment-only)", () => {
    expect(operatorCertDefault()).toBe("spsp");
  });
});

describe("nodesToTree", () => {
  it("carries the category tag through to the UI taxonomy (and down to subcategories)", () => {
    const tree = nodesToTree([
      { id: "c1", level: "CATEGORY", name: "Cranes", name_ar: null, parent_id: null, aliases: [], tag: "Lifting, Cranes & Aerial" },
      { id: "s1", level: "SUBCATEGORY", name: "Mobile Cranes", name_ar: null, parent_id: "c1", aliases: [], tag: null },
    ]);
    expect(tree[0].tag).toBe("Lifting, Cranes & Aerial");
    expect(tree[0].subcategories[0].tag).toBe("Lifting, Cranes & Aerial");
    expect(isLiftingCategory({ categoryId: "c1" }, tree)).toBe(true);
  });
});

describe("SET_ITEM_CATEGORY — per-item seed", () => {
  it("seeds Aramco + SPSP when the picked category is lifting", () => {
    const s = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    const it0 = s.draft!.items[0];
    expect(it0.safetyCertsOverride).toEqual(["aramco"]);
    expect(it0.operator.certificate).toEqual(["spsp"]);
  });

  it("seeds TÜV + SPSP for a non-lifting category", () => {
    const s = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
    expect(s.draft!.items[0].operator.certificate).toEqual(["spsp"]);
  });

  it("re-seeds on a real category change, replacing the previous cert", () => {
    const s1 = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    const s2 = reducer(s1, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s2.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("leaves a renter's own cert edit alone when the category is re-picked unchanged", () => {
    const seeded = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    const edited = reducer(seeded, { t: "PATCH_ITEM", id: "m1", patch: { safetyCertsOverride: ["aramco"] } });
    const rePicked = reducer(edited, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    expect(rePicked.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("does not seed an operator cert on an item with no operator", () => {
    const s = reducer(stateWith([item("m1", { operatorNeeded: "no" })]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].operator.certificate).toEqual([]);
  });

  it("rescues an uncertified line even when the category is re-picked unchanged", () => {
    // App parity: the re-seed fires on `categoryChanged || no cert yet`.
    const uncertified = item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null } });
    const s = reducer(stateWith([uncertified]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("does not stamp an override on a line that inherits the request-wide cert", () => {
    const picked = reducer(stateWith([item("m1")]), { t: "SET_CERTIFICATES", patch: { safety: ["tuv"] } });
    const s = reducer(picked, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    // categoryChanged still re-seeds (app parity) — but a NO-OP re-pick must leave inheritance intact.
    const noop = reducer(s, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(noop.draft!.items[0].safetyCertsOverride).toEqual(s.draft!.items[0].safetyCertsOverride);
  });
});

describe("SET_ITEM_SUBCATEGORY", () => {
  it("seeds an uncertified line, refining lifting detection on an untagged taxonomy", () => {
    // "Material Handling" alone doesn't read as lifting; "Forklifts" does.
    const s0 = stateWith([item("m1", { ref: { categoryId: "material-handling", subcategoryId: null, measurementId: null } })]);
    const s = reducer(s0, { t: "SET_ITEM_SUBCATEGORY", id: "m1", subcategoryId: "forklifts" });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("leaves a line that already has a cert alone", () => {
    const s0 = stateWith([
      item("m1", { ref: { categoryId: "material-handling", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["tuv"] }),
    ]);
    const s = reducer(s0, { t: "SET_ITEM_SUBCATEGORY", id: "m1", subcategoryId: "forklifts" });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });
});

describe("HYDRATE — resumed draft", () => {
  it("seeds a draft saved before the cert rule shipped", () => {
    const saved = {
      phase: "wizard" as const,
      step: 2 as const,
      draft: draftWith([item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null } })]),
    };
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "HYDRATE", saved });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
    expect(s.draft!.items[0].operator.certificate).toEqual(["spsp"]);
  });

  it("does not disturb a resumed draft that already carries certs", () => {
    const saved = {
      draft: draftWith([item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["tuv"] })]),
    };
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "HYDRATE", saved });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });

  it("seeds the agent snapshot too, so resuming does not read as a renter edit", () => {
    const items = [item("m1", { ref: { categoryId: "cat-earth", subcategoryId: null, measurementId: null } })];
    const saved = {
      draft: draftWith(items),
      agentOrigin: { project: defaultProjectDetails(), items },
    };
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "HYDRATE", saved });
    expect(JSON.stringify(s.agentOrigin!.items)).toBe(JSON.stringify(s.draft!.items));
  });
});

describe("SET_CERTIFICATES — request-wide pick", () => {
  it("applies to every item by clearing the per-item overrides", () => {
    const withOverrides = stateWith([
      item("m1", { safetyCertsOverride: ["tuv"] }),
      item("m2", { safetyCertsOverride: ["other"] }),
    ]);
    const s = reducer(withOverrides, { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    expect(s.draft!.project.certificates.safety).toEqual(["aramco"]);
    // Effective per-item cert = override ?? request-wide → every item now reads Aramco.
    for (const i of s.draft!.items) expect(i.safetyCertsOverride).toBeNull();
  });

  it("seeds SPSP on operator-on items that have no operator cert yet", () => {
    const s = reducer(stateWith([item("m1", { operatorNeeded: "yes" }), item("m2", { operatorNeeded: "no" })]), {
      t: "SET_CERTIFICATES",
      patch: { safety: ["aramco"] },
    });
    expect(s.draft!.items[0].operator.certificate).toEqual(["spsp"]);
    expect(s.draft!.items[1].operator.certificate).toEqual([]);
  });

  it("never overwrites an operator cert the renter already chose", () => {
    const chosen = item("m1", { operatorNeeded: "yes", operator: { ...newManualItem("m1").operator, certificate: ["tuv"] } });
    const s = reducer(stateWith([chosen]), { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    expect(s.draft!.items[0].operator.certificate).toEqual(["tuv"]);
  });

  it("leaves items untouched when only the free-text/other certs change", () => {
    const s = reducer(stateWith([item("m1", { safetyCertsOverride: ["tuv"] })]), {
      t: "SET_CERTIFICATES",
      patch: { safetyOther: "Client-specific cert" },
    });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });
});

describe("PROCESS_SUCCESS — agent-parsed items", () => {
  const agentDraft = (items: EquipmentItem[]) => ({
    project: defaultProjectDetails(),
    items,
    detectedLocations: [],
    summary: { totalItems: items.length, needsValidation: 0, notAvailable: 0 },
  });

  it("seeds the category-based cert on items the agent left without one", () => {
    const items = [
      item("a1", { ref: { categoryId: "cat-lift", subcategoryId: "sub-mc", measurementId: null } }),
      item("a2", { ref: { categoryId: "cat-earth", subcategoryId: "sub-exc", measurementId: null } }),
    ];
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft(items) });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
    expect(s.draft!.items[1].safetyCertsOverride).toEqual(["tuv"]);
    expect(s.draft!.items.every((i) => i.operator.certificate[0] === "spsp")).toBe(true);
  });

  it("keeps a cert the agent did extract", () => {
    const items = [item("a1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["tuv"] })];
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft(items) });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });

  it("does not seed an item that has no category to classify", () => {
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft([item("a1")]) });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
  });

  it("snapshots the seeded items as the agent origin, so the seed is not read as a renter edit", () => {
    const items = [item("a1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null } })];
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft(items) });
    expect(JSON.stringify(s.agentOrigin!.items)).toBe(JSON.stringify(s.draft!.items));
  });
});

describe("splitSafetyCerts — non-offered codes go to the per-item 'Other' box", () => {
  it("keeps the offered chips as chips", () => {
    expect(splitSafetyCerts(["tuv", "aramco"])).toEqual({ chips: ["tuv", "aramco"], otherText: "" });
  });

  it("routes a legacy code the chip row cannot render into the Other text", () => {
    expect(splitSafetyCerts(["spsp"])).toEqual({ chips: ["other"], otherText: "spsp" });
    expect(splitSafetyCerts(["tuv", "saso-technical"])).toEqual({ chips: ["tuv", "other"], otherText: "saso-technical" });
  });

  it("routes genuinely custom text into the Other box", () => {
    expect(splitSafetyCerts(["Client-specific cert"])).toEqual({ chips: ["other"], otherText: "Client-specific cert" });
  });

  it("normalizes casing / spacing / legacy display labels", () => {
    expect(normalizeSafetyCert(" TUV Inspection ")).toBe("tuv");
    expect(normalizeSafetyCert("ARAMCO_CERTIFIED")).toBe("aramco");
    expect(normalizeSafetyCert("SASO Technical Inspection")).toBe("saso-technical");
    expect(splitSafetyCerts(["ARAMCO"])).toEqual({ chips: ["aramco"], otherText: "" });
  });

  it("keeps only the first non-offered value, like the app's single Other field", () => {
    expect(splitSafetyCerts(["spsp", "custom one"])).toEqual({ chips: ["other"], otherText: "spsp" });
  });

  it("drops blanks and de-duplicates", () => {
    expect(splitSafetyCerts(["tuv", " ", "TUV"])).toEqual({ chips: ["tuv"], otherText: "" });
  });
});

describe("agent items with a non-offered cert", () => {
  it("splits the agent's spsp into the Other chip + text instead of an invisible cert", () => {
    const out = {
      rfq_header: {},
      line_items: [{ input_equipment: "crane", category_id: "cat-lift", safety_certifications: ["SPSP"] }],
      missing_required_fields: [],
    } as never;
    const draft = agentOutputToDraft(out);
    expect(draft.items[0].safetyCertsOverride).toEqual(["other"]);
    expect(draft.items[0].safetyCertsOtherText).toBe("SPSP");
  });

  it("does not globalize a cert set that carries per-item Other text", () => {
    const line = (cert: string) => ({ input_equipment: "crane", category_id: "cat-lift", safety_certifications: [cert] });
    const draft = agentOutputToDraft({ rfq_header: {}, line_items: [line("SPSP"), line("SPSP")], missing_required_fields: [] } as never);
    expect(draft.project.certificates.safety).toEqual([]);
    for (const i of draft.items) expect(i.safetyCertsOtherText).toBe("SPSP");
  });
});

describe("Other text is cleared when the rule replaces the cert list", () => {
  it("a category change drops the carried-over Other text", () => {
    const s0 = stateWith([
      item("m1", { ref: { categoryId: "cat-earth", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["other"], safetyCertsOtherText: "spsp" }),
    ]);
    const s = reducer(s0, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
    expect(s.draft!.items[0].safetyCertsOtherText).toBeNull();
  });

  it("a request-wide pick drops it too", () => {
    const s0 = stateWith([item("m1", { safetyCertsOverride: ["other"], safetyCertsOtherText: "spsp" })]);
    const s = reducer(s0, { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    expect(s.draft!.items[0].safetyCertsOtherText).toBeNull();
  });

  it("an item whose only cert is Other text counts as certified (no re-seed over it)", () => {
    const s0 = stateWith([
      item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["other"], safetyCertsOtherText: "Client cert" }),
    ]);
    const s = reducer(s0, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" }); // no-op re-pick
    expect(s.draft!.items[0].safetyCertsOtherText).toBe("Client cert");
  });
});

describe("ADD_ITEM", () => {
  it("arrives with the SPSP operator cert and no equipment cert until a category is picked", () => {
    const s = reducer(stateWith([]), { t: "ADD_ITEM" });
    const added = s.draft!.items[0];
    expect(added.operator.certificate).toEqual(["spsp"]);
    expect(added.safetyCertsOverride ?? null).toBeNull();
  });

  it("inherits the request-wide cert picked earlier (unlike the app, where a later line falls back to the rule)", () => {
    const picked = reducer(stateWith([]), { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    const s = reducer(picked, { t: "ADD_ITEM" });
    const added = s.draft!.items[0];
    // override null ⇒ the item reads the request-wide value; the UI resolves `override ?? shared`.
    expect(added.safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.project.certificates.safety).toEqual(["aramco"]);
  });
});
