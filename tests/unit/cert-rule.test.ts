import { describe, it, expect } from "vitest";
import { reducer, initialState } from "@/lib/store/rfq-store";
import {
  defaultProjectDetails,
  defaultPreferences,
  newManualItem,
  normalizeSafetyCert,
  splitSafetyCerts,
} from "@/lib/contract";
import { agentOutputToDraft } from "@/lib/api/agent-adapters";
import { draftToCreateRequest } from "@/lib/api/app-adapters";
import type { EquipmentItem, RfqDraft, Taxonomy } from "@/lib/contract";
import { nodesToTree } from "@/lib/api/app-adapters";

/**
 * Certificates are the RENTER's choice, never the wizard's guess — for BOTH kinds.
 *
 * The 2026-07 cert rule used to seed each line automatically: the equipment cert by category (lifting /
 * cranes / aerial → ARAMCO, every other group → TÜV) and the operator cert as SPSP on every operator-on
 * line (mobile parity: `_withCertRule` / `kDefaultOperatorCertCode`). Both are withdrawn, in the app
 * first and mirrored here. A seeded cert is not cosmetic — it ships as a Level-3 term and as a document
 * demanded of every supplier who bids — so guessing one narrowed the renter's own bidder pool.
 *
 * What remains is inheritance, not seeding: a line with no per-item override reads the request-wide
 * step-1 pick, so one choice in step 1 reaches every line in step 2 — LIFTING INCLUDED, since no
 * category rule intercepts it any more. Pick nothing, and the request carries no cert requirement.
 *
 * The assertions below pin the absence of both seeds, so a re-introduced default fails loudly.
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

describe("cert defaults", () => {
  it("exposes NO cert default of either kind — nothing can be pre-checked", async () => {
    const contract = await import("@/lib/contract");
    // Equipment side (the category rule: lifting → Aramco, else TÜV).
    expect("equipmentCertDefault" in contract).toBe(false);
    // Operator side (SPSP on every operator-on line).
    expect("operatorCertDefault" in contract).toBe(false);
    expect("DEFAULT_OPERATOR_CERT" in contract).toBe(false);
  });

  it("keeps no lifting classifier either — the app deleted its counterpart outright", async () => {
    // `isLiftingEquipment` / `equipmentCertForLifting` / `kLiftingTagValues` are gone from
    // `localized_labels.dart` on main. A dead predicate here would read as a live rule.
    const contract = await import("@/lib/contract");
    expect("isLiftingCategory" in contract).toBe(false);
    expect("LIFTING_TAG_VALUES" in contract).toBe(false);
  });
});

describe("nodesToTree", () => {
  it("carries the category tag through to the UI taxonomy (and down to subcategories)", () => {
    const tree = nodesToTree([
      { id: "c1", level: "CATEGORY", name: "Cranes", name_ar: null, parent_id: null, aliases: [], tag: "Lifting, Cranes & Aerial" },
      { id: "s1", level: "SUBCATEGORY", name: "Mobile Cranes", name_ar: null, parent_id: "c1", aliases: [], tag: null },
    ]);
    // Display/grouping only now — the tag drives no cert default on either client.
    expect(tree[0].tag).toBe("Lifting, Cranes & Aerial");
    expect(tree[0].subcategories[0].tag).toBe("Lifting, Cranes & Aerial");
  });
});

describe("SET_ITEM_CATEGORY — picks a category, never a certificate", () => {
  it("leaves a lifting line BLANK — no Aramco, no operator cert", () => {
    const s = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    const it0 = s.draft!.items[0];
    expect(it0.safetyCertsOverride ?? null).toBeNull();
    expect(it0.operator.certificate).toEqual([]);
  });

  it("leaves a non-lifting line blank too — no TÜV", () => {
    const s = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.items[0].operator.certificate).toEqual([]);
  });

  it("leaves an operator cert the renter chose intact across a category change", () => {
    // The app's `_applyCertRule` used to clear and re-stamp SPSP here; we must not.
    const chosen = item("m1", { operator: { ...newManualItem("m1").operator, certificate: ["tuv"] } });
    const s = reducer(stateWith([chosen]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].operator.certificate).toEqual(["tuv"]);
  });

  it("a REAL category change clears the line's cert back to inheriting, without stamping one", () => {
    // A cert chosen for an excavator is not an answer about a crane — but the replacement is blank,
    // not a guess.
    const s0 = stateWith([item("m1", { ref: { categoryId: "cat-earth", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["tuv"] })]);
    const s = reducer(s0, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride).toBeNull();
  });

  it("leaves a renter's own cert edit alone when the category is re-picked unchanged", () => {
    const picked = reducer(stateWith([item("m1")]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    const edited = reducer(picked, { t: "PATCH_ITEM", id: "m1", patch: { safetyCertsOverride: ["aramco"] } });
    const rePicked = reducer(edited, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-earth" });
    expect(rePicked.draft!.items[0].safetyCertsOverride).toEqual(["aramco"]);
  });

  it("does not seed an operator cert whether or not the item includes an operator", () => {
    for (const operatorNeeded of ["yes", "no"] as const) {
      const s = reducer(stateWith([item("m1", { operatorNeeded })]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
      expect(s.draft!.items[0].operator.certificate).toEqual([]);
    }
  });

  it("does not 'rescue' an uncertified line on a no-op re-pick", () => {
    const uncertified = item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null } });
    const s = reducer(stateWith([uncertified]), { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
  });

  it("keeps a LIFTING line on the step-1 pick — the category rule no longer intercepts it", () => {
    // The headline of this change: pick TÜV once in step 1 and a crane line shows TÜV, not Aramco.
    const picked = reducer(stateWith([item("m1")]), { t: "SET_CERTIFICATES", patch: { safety: ["tuv"] } });
    const s = reducer(picked, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride).toBeNull(); // ⇒ inherits ["tuv"]
    expect(s.draft!.project.certificates.safety).toEqual(["tuv"]);
  });
});

describe("SET_ITEM_SUBCATEGORY", () => {
  it("never stamps a cert, even where the subcategory reveals the line is lifting", () => {
    // "Material Handling" alone doesn't read as lifting; "Forklifts" does — and it no longer matters.
    const s0 = stateWith([item("m1", { ref: { categoryId: "material-handling", subcategoryId: null, measurementId: null } })]);
    const s = reducer(s0, { t: "SET_ITEM_SUBCATEGORY", id: "m1", subcategoryId: "forklifts" });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
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
  it("resumes a blank line blank — a resumed draft is not a gap to fill", () => {
    // The seed used to re-run here, putting a requirement back that the renter had left blank on
    // purpose — at the one moment they can't see it happen.
    const saved = {
      phase: "wizard" as const,
      step: 2 as const,
      draft: draftWith([item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null } })]),
    };
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "HYDRATE", saved });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.items[0].operator.certificate).toEqual([]);
  });

  it("does not disturb a resumed draft that already carries certs", () => {
    const saved = {
      draft: draftWith([item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["tuv"] })]),
    };
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "HYDRATE", saved });
    expect(s.draft!.items[0].safetyCertsOverride).toEqual(["tuv"]);
  });

  it("leaves the agent snapshot identical to the draft, so resuming reads as no edit", () => {
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

  it("seeds no operator cert on operator-on items", () => {
    const s = reducer(stateWith([item("m1", { operatorNeeded: "yes" }), item("m2", { operatorNeeded: "no" })]), {
      t: "SET_CERTIFICATES",
      patch: { safety: ["aramco"] },
    });
    for (const i of s.draft!.items) expect(i.operator.certificate).toEqual([]);
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

  it("leaves items the agent found no cert for blank — the RFQ text named none", () => {
    const items = [
      item("a1", { ref: { categoryId: "cat-lift", subcategoryId: "sub-mc", measurementId: null } }),
      item("a2", { ref: { categoryId: "cat-earth", subcategoryId: "sub-exc", measurementId: null } }),
    ];
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft(items) });
    expect(s.draft!.items[0].safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.items[1].safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.items.every((i) => i.operator.certificate.length === 0)).toBe(true);
  });

  it("keeps an operator cert the agent DID extract from the RFQ text", () => {
    // The seed is gone, but a cert the renter actually named must still survive to submit.
    const items = [
      item("a1", {
        ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null },
        operator: { ...newManualItem("a1").operator, certificate: ["spsp"] },
      }),
    ];
    const s = reducer({ ...initialState, taxonomy: TAXONOMY }, { t: "PROCESS_SUCCESS", draft: agentDraft(items) });
    expect(s.draft!.items[0].operator.certificate).toEqual(["spsp"]);
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

  it("snapshots the items as the agent origin unchanged, so nothing reads as a renter edit", () => {
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

describe("Other text follows the cert list it belongs to", () => {
  it("a real category change drops the carried-over Other text along with the cert", () => {
    const s0 = stateWith([
      item("m1", { ref: { categoryId: "cat-earth", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["other"], safetyCertsOtherText: "spsp" }),
    ]);
    const s = reducer(s0, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" });
    expect(s.draft!.items[0].safetyCertsOverride).toBeNull();
    expect(s.draft!.items[0].safetyCertsOtherText).toBeNull();
  });

  it("a request-wide pick drops it too", () => {
    const s0 = stateWith([item("m1", { safetyCertsOverride: ["other"], safetyCertsOtherText: "spsp" })]);
    const s = reducer(s0, { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    expect(s.draft!.items[0].safetyCertsOtherText).toBeNull();
  });

  it("survives a no-op re-pick of the same category", () => {
    const s0 = stateWith([
      item("m1", { ref: { categoryId: "cat-lift", subcategoryId: null, measurementId: null }, safetyCertsOverride: ["other"], safetyCertsOtherText: "Client cert" }),
    ]);
    const s = reducer(s0, { t: "SET_ITEM_CATEGORY", id: "m1", categoryId: "cat-lift" }); // no-op re-pick
    expect(s.draft!.items[0].safetyCertsOtherText).toBe("Client cert");
  });
});

describe("ADD_ITEM", () => {
  it("arrives with NO certs of either kind, and nothing later fills them in", () => {
    const s = reducer(stateWith([]), { t: "ADD_ITEM" });
    const added = s.draft!.items[0];
    expect(added.operatorNeeded).toBe("yes"); // operator on by default (AC-24) …
    expect(added.operator.certificate).toEqual([]); // … but that is not a cert requirement
    expect(added.safetyCertsOverride ?? null).toBeNull();
  });

  it("inherits the request-wide cert picked earlier", () => {
    const picked = reducer(stateWith([]), { t: "SET_CERTIFICATES", patch: { safety: ["aramco"] } });
    const s = reducer(picked, { t: "ADD_ITEM" });
    const added = s.draft!.items[0];
    // override null ⇒ the item reads the request-wide value; the UI resolves `override ?? shared`.
    expect(added.safetyCertsOverride ?? null).toBeNull();
    expect(s.draft!.project.certificates.safety).toEqual(["aramco"]);
  });
});

describe("submitted payload — the actual regression", () => {
  it("a renter who touched NO certs submits neither an operator nor an equipment cert", () => {
    // The real wizard path: add a line (operator on by default), pick a category. This used to ship
    // `operatorLicenseLevel: "SPSP"` AND `safetyCertifications: ["aramco"]` on a request that asked
    // for neither — both of them requirements suppliers are then measured against.
    const added = reducer(stateWith([]), { t: "ADD_ITEM" });
    const s = reducer(added, { t: "SET_ITEM_CATEGORY", id: added.draft!.items[0].id, categoryId: "cat-lift" });
    const line = draftToCreateRequest(s.draft!, "46").equipmentItems[0];
    expect(line.operatorLicenseLevel).toBeUndefined();
    expect(line.safetyCertifications ?? []).toEqual([]);
  });

  it("carries a step-1 pick onto a LIFTING line — no Aramco substitution", () => {
    const added = reducer(stateWith([]), { t: "ADD_ITEM" });
    const id = added.draft!.items[0].id;
    const picked = reducer(added, { t: "SET_CERTIFICATES", patch: { safety: ["tuv"] } });
    const s = reducer(picked, { t: "SET_ITEM_CATEGORY", id, categoryId: "cat-lift" });
    expect(draftToCreateRequest(s.draft!, "46").equipmentItems[0].safetyCertifications).toEqual(["tuv"]);
  });

  it("still submits an operator cert the renter DID pick", () => {
    const added = reducer(stateWith([]), { t: "ADD_ITEM" });
    const id = added.draft!.items[0].id;
    const chosen = reducer(added, { t: "PATCH_ITEM_OPERATOR", id, patch: { certificate: ["tuv"] } });
    const s = reducer(chosen, { t: "SET_ITEM_CATEGORY", id, categoryId: "cat-lift" });
    expect(draftToCreateRequest(s.draft!, "46").equipmentItems[0].operatorLicenseLevel).toBe("TUV");
  });
});
