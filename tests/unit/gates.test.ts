import { describe, it, expect } from "vitest";
import {
  defaultOperatorDetails,
  defaultPreferences,
  defaultProjectDetails,
  gateEquipment,
  gateWhen,
  gateWhere,
  itemAppGaps,
  itemBlocksAdvance,
  itemFieldKey,
  itemWebGaps,
  postableItems,
  requiredGaps,
  transportGaps,
} from "@/lib/contract";
import type { EquipmentItem, RfqDraft } from "@/lib/contract";

function makeItem(over: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "i1",
    rawLabel: null,
    rawSize: null,
    ref: { categoryId: "cat", subcategoryId: "sub", measurementId: "cap" },
    verdict: "confident",
    resolved: true,
    removed: false,
    quantity: 1,
    operatorNeeded: "yes",
    operator: defaultOperatorDetails(),
    fuelType: "diesel",
    additionalNotes: "",
    deliveryOverride: null,
    returnOverride: null,
    fuelResponsibilityOverride: null,
    ...over,
  };
}

/** A draft whose year + certificate have been answered for every item it contains. */
function makeDraft(items: EquipmentItem[], over: Partial<RfqDraft> = {}): RfqDraft {
  return {
    project: defaultProjectDetails(),
    items,
    preferences: defaultPreferences(),
    detectedLocations: [],
    summary: { totalItems: items.length, needsValidation: 0, notAvailable: 0 },
    touchedFields: items.flatMap((i) => [itemFieldKey(i.id, "equipment_year"), itemFieldKey(i.id, "safety_certificates")]),
    ...over,
  };
}

/** A project that satisfies gateWhere. */
/**
 * A project with every REQUEST-WIDE answer given — the "everything but the equipment" baseline.
 *
 * The three party fields are set here because they are no longer seeded (2026-09-08): a fresh draft
 * leaves «who delivers / who returns / who pays for the fuel» unanswered on purpose, so a helper
 * that means "nothing is missing at request level" has to say so itself.
 */
function confirmedProject() {
  const p = defaultProjectDetails();
  p.location = { label: "King Khalid International Airport", lat: 24.9576, lng: 46.6988, confirmed: true };
  p.timing.rentalBasis = "monthly";
  p.deliveryToSite = "me";
  p.returnFromSite = "me";
  p.fuelResponsibility = "me";
  return p;
}

describe("itemAppGaps — the app's required set (MREQ-AC-09)", () => {
  it("passes a complete item", () => {
    expect(itemAppGaps(makeItem())).toEqual([]);
    expect(itemBlocksAdvance(makeItem())).toBe(false);
  });

  it("names the first missing taxonomy level, and only that one", () => {
    const noCategory = itemAppGaps(makeItem({ ref: { categoryId: null, subcategoryId: null, measurementId: null } }));
    expect(noCategory.map((g) => g.reason)).toEqual(["gate.categoryMissing"]);

    const noSubtype = itemAppGaps(makeItem({ ref: { categoryId: "c", subcategoryId: null, measurementId: null } }));
    expect(noSubtype.map((g) => g.reason)).toEqual(["gate.subtypeMissing"]);

    const noSize = itemAppGaps(makeItem({ ref: { categoryId: "c", subcategoryId: "s", measurementId: null } }));
    expect(noSize.map((g) => g.reason)).toEqual(["gate.capacityMissing"]);
  });

  it("requires a fuel type and a quantity of at least one", () => {
    expect(itemAppGaps(makeItem({ fuelType: null as never })).map((g) => g.reason)).toContain("gate.fuelMissing");
    expect(itemAppGaps(makeItem({ quantity: 0 })).map((g) => g.reason)).toContain("gate.quantityMissing");
  });

  // MREQ-AC-14 — a no-match item is dropped from the broadcast entirely, so gating on it would block
  // the renter over equipment that is never sent.
  it("ignores a removed item, and asks an off-catalogue one for its NAME instead of a taxonomy", () => {
    // Off-catalogue (no subtype, and the RFQ gave no words to seed the box): the name is the one
    // answer owed, and none of the three taxonomy gaps is raised — nothing in the catalogue could
    // satisfy them. See `custom-equipment.test.ts` for the whole rule.
    const offCatalogue = itemAppGaps(makeItem({ verdict: "no-match", ref: { categoryId: null, subcategoryId: null, measurementId: null } }));
    expect(offCatalogue.map((g) => g.reason)).toEqual(["gate.customEquipmentMissing"]);

    expect(itemAppGaps(makeItem({ removed: true, quantity: 0 }))).toEqual([]);
    // A no-match line the renter has already resolved to a subtype is an ordinary line again.
    expect(itemBlocksAdvance(makeItem({ verdict: "no-match" }))).toBe(false);
  });

  it("auto-accepts a needs-validation item whose ref is complete", () => {
    expect(itemBlocksAdvance(makeItem({ verdict: "needs-validation", resolved: false }))).toBe(false);
  });

  // The web-only gates must not leak into the app-level check, or every freshly parsed item would
  // read as incomplete by the platform's own standard.
  it("does not include the year or certificate gates", () => {
    expect(itemAppGaps(makeItem()).map((g) => g.field)).not.toContain("equipment_year");
    expect(itemAppGaps(makeItem()).map((g) => g.field)).not.toContain("safety_certificates");
  });
});

describe("itemWebGaps — year and certificate (MREQ-AC-54/55)", () => {
  /* ── The gate reads the RESOLVED value (owner, 2026-09-09) ────────────────────────────────────
     *"The certificate is shaking as required while it is selected, so whenever there is a value for
     cert don't shake it, it is navy blue and filled and allow moving on."*

     Both answers live at two levels — the item's own override, else the REQUEST-wide one — and the
     card resolves them that way. This gate read the override alone, so a certificate set at request
     level filled the pill and still counted as missing. Every case below therefore passes a project;
     `bare()` is the request-wide silence these gates were written against, and `withCerts` /
     `withYear` are the state that used to shake with an answer on screen. */
  const bare = () => ({ touchedFields: [] as string[], project: defaultProjectDetails() });
  const withRequestCerts = () => {
    const p = defaultProjectDetails();
    p.certificates.safety = ["tuv"];
    return { touchedFields: [] as string[], project: p };
  };
  const withRequestYear = () => {
    const p = defaultProjectDetails();
    p.advanced.equipmentYear = "2018+";
    return { touchedFields: [] as string[], project: p };
  };

  it("accepts a value the RFQ named — that is already the renter's answer", () => {
    const item = makeItem({ equipmentYear: "2018+", safetyCertsOverride: ["tuv"] });
    expect(itemWebGaps(item, bare())).toEqual([]);
  });

  it("blocks a value nobody supplied", () => {
    // Neither the RFQ nor the renter said anything: an empty cert list and a null year are the
    // form's silence, not an answer.
    const item = makeItem({ equipmentYear: null, safetyCertsOverride: [] });
    expect(itemWebGaps(item, bare()).map((g) => g.field)).toEqual(["equipment_year", "safety_certificates"]);
  });

  it("accepts a certificate set at REQUEST level, which is what the pill is showing", () => {
    // The reported bug: the chip drew «TÜV», navy and filled, and shook as required.
    const item = makeItem({ safetyCertsOverride: null, equipmentYear: "any" });
    expect(itemWebGaps(item, withRequestCerts()).map((g) => g.field)).not.toContain("safety_certificates");
  });

  it("accepts a YEAR set at request level too — the same hole, one line apart", () => {
    const item = makeItem({ equipmentYear: null, safetyCertsOverride: ["tuv"] });
    expect(itemWebGaps(item, withRequestYear()).map((g) => g.field)).not.toContain("equipment_year");
  });

  it("still blocks when the item CLEARS the request-wide answer", () => {
    /* An empty ARRAY on the item is «I have no certificate here», which is an answer only once the
       control has been touched — and `null` means «follow the request». The two must not be
       conflated, or clearing a cert on one machine would silently inherit the request's again. */
    const item = makeItem({ safetyCertsOverride: [], equipmentYear: "any" });
    expect(itemWebGaps(item, withRequestCerts()).map((g) => g.field)).toEqual(["safety_certificates"]);
  });

  it("is satisfied once each control is touched", () => {
    const item = makeItem();
    const touched = {
      touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")],
      project: defaultProjectDetails(),
    };
    expect(itemWebGaps(item, touched)).toEqual([]);
  });

  // "Any year" and "No certificate" are answers, not omissions — the point of the gate is a decision,
  // not a value, so an explicitly empty answer clears it exactly like a populated one.
  it("accepts 'any' and an empty certificate list as real answers", () => {
    const item = makeItem({ equipmentYear: "any", safetyCertsOverride: [] });
    const touched = {
      touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")],
      project: defaultProjectDetails(),
    };
    expect(itemWebGaps(item, touched)).toEqual([]);
  });
});

describe("transportGaps — delivery, return and who pays for the fuel (MREQ-AC-53)", () => {
  /**
   * ⚠️ These three start UNANSWERED since 2026-09-08. `defaultProjectDetails` used to seed «me» on
   * all three, which turned the agent's silence into three priced commitments — the renter collects
   * the machine, returns it, and buys the fuel — and made these very gates unreachable.
   */
  it("blocks a fresh draft on all three, because nobody has answered them", () => {
    expect(transportGaps([makeItem()], defaultProjectDetails()).map((g) => g.reason)).toEqual([
      "gate.deliveryMissing",
      "gate.returnMissing",
      "gate.fuelPartyMissing",
    ]);
  });

  it("passes once the shared controls carry an answer", () => {
    const project = defaultProjectDetails();
    project.deliveryToSite = "me";
    project.returnFromSite = "me";
    project.fuelResponsibility = "me";
    expect(transportGaps([makeItem()], project)).toEqual([]);
  });

  it("reads the per-item override ahead of the shared value, exactly as submit does", () => {
    const project = defaultProjectDetails();
    const item = makeItem({ deliveryOverride: "supplier", returnOverride: "supplier", fuelResponsibilityOverride: "supplier" });
    expect(transportGaps([item], project)).toEqual([]);
  });
});

describe("gateWhere (MREQ-AC-29/31)", () => {
  it("needs coordinates, a label and an explicit confirmation", () => {
    const p = defaultProjectDetails();
    expect(gateWhere(p).reasons).toContain("gate.locationMissing");

    p.location = { label: "Site", lat: 24.7, lng: 46.7, confirmed: false };
    expect(gateWhere(p).reasons).toEqual(["gate.confirmLocation"]);

    p.location.confirmed = true;
    expect(gateWhere(p).ok).toBe(true);
  });

  it("blocks on an unresolved text/file conflict", () => {
    const p = confirmedProject();
    p.location.conflict = { fromText: "Riyadh", fromFile: "Jeddah" };
    expect(gateWhere(p).reasons).toContain("gate.resolveLocationConflict");
    p.location.conflict.resolvedFrom = "text";
    expect(gateWhere(p).ok).toBe(true);
  });
});

describe("gateWhen (MREQ-AC-05/10)", () => {
  it("needs a rental basis and the charged-day acknowledgement", () => {
    const p = defaultProjectDetails();
    expect(gateWhen(p, false).reasons).toEqual(["gate.chooseRentalBasis", "gate.confirmChargedDays"]);
    p.timing.rentalBasis = "monthly";
    expect(gateWhen(p, false).reasons).toEqual(["gate.confirmChargedDays"]);
    expect(gateWhen(p, true).ok).toBe(true);
  });

  // MREQ-AC-10 — the deliberate divergence from the app, which requires a start date.
  it("never blocks on dates", () => {
    const p = confirmedProject();
    p.timing.startDate = null;
    p.timing.endDate = null;
    expect(gateWhen(p, true).ok).toBe(true);
  });
});

describe("requiredGaps — the 'N things need you' count (MREQ-AC-12)", () => {
  it("is zero for a complete draft", () => {
    const draft = makeDraft([makeItem()], { project: confirmedProject() });
    expect(requiredGaps(draft, true)).toEqual([]);
  });

  it("reports an empty request", () => {
    const draft = makeDraft([], { project: confirmedProject() });
    expect(requiredGaps(draft, true).map((g) => g.reason)).toEqual(["gate.noItems"]);
  });

  it("attributes each gap to the panel that can fix it", () => {
    const draft = makeDraft([makeItem({ fuelType: null as never })]);
    const gaps = requiredGaps(draft, false);
    expect(gaps.find((g) => g.reason === "gate.fuelMissing")?.panel).toBe("equipment");
    expect(gaps.find((g) => g.reason === "gate.locationMissing")?.panel).toBe("where");
    expect(gaps.find((g) => g.reason === "gate.confirmChargedDays")?.panel).toBe("when");
  });

  it("counts only live items, and an unnamed off-catalogue one is live", () => {
    const draft = makeDraft([makeItem({ id: "a" })], { project: confirmedProject() });
    draft.items.push(makeItem({ id: "b", verdict: "no-match", ref: { categoryId: null, subcategoryId: null, measurementId: null } }));
    /* The off-catalogue row now posts under the renter's own name, so it is counted like any other:
       the name in place of the taxonomy, plus the two web-only answers (year, certificate) that are
       posted for it and shown to the supplier on the bid form. */
    expect(requiredGaps(draft, true).map((g) => `${g.itemId}:${g.reason}`)).toEqual([
      "b:gate.customEquipmentMissing",
      "b:gate.yearMissing",
      "b:gate.certMissing",
    ]);

    // Named (here by the words the RFQ itself used) and answered, it asks for nothing.
    draft.items[1] = { ...draft.items[1], rawLabel: "floating crane barge" };
    draft.touchedFields = [
      ...(draft.touchedFields ?? []),
      itemFieldKey("b", "equipment_year"),
      itemFieldKey("b", "safety_certificates"),
    ];
    expect(requiredGaps(draft, true)).toEqual([]);
  });
});

describe("gateEquipment — one item's panel", () => {
  it("combines the app gates, the web gates and transport", () => {
    const item = makeItem();
    // `confirmedProject` because TRANSPORT is part of what this gate combines, and the three party
    // fields are unanswered on a fresh draft since 2026-09-08 — with `defaultProjectDetails` this
    // case would pass for the wrong reason, blocked on transport rather than on the web gates.
    const project = confirmedProject();
    expect(gateEquipment(item, project, { touchedFields: [] }).ok).toBe(false);
    const touched = { touchedFields: [itemFieldKey(item.id, "equipment_year"), itemFieldKey(item.id, "safety_certificates")] };
    expect(gateEquipment(item, project, touched).ok).toBe(true);

    // And it really does read transport: clear one party and the same answered item is blocked again.
    const noFuelParty = { ...project, fuelResponsibility: null };
    expect(gateEquipment(item, noFuelParty, touched).reasons).toContain("gate.fuelPartyMissing");
  });
});

describe("postableItems (specs#245-AC-33/34/43)", () => {
  it("keeps mapped items, drops no-match and removed", () => {
    const items = [makeItem({ id: "a" }), makeItem({ id: "b", verdict: "no-match" }), makeItem({ id: "c", removed: true })];
    expect(postableItems(items).map((i) => i.id)).toEqual(["a"]);
  });

  // specs#245-AC-31: "Provide it for me?" keeps the no-match row on screen. Staying visible must NOT
  // make it postable or a blocker.
  it("drops a sourcing-requested no-match item, and it never blocks", () => {
    const sourcing = makeItem({ id: "b", verdict: "no-match", sourcingRequested: true });
    expect(postableItems([makeItem({ id: "a" }), sourcing]).map((i) => i.id)).toEqual(["a"]);
    expect(itemBlocksAdvance(sourcing)).toBe(false);
  });
});

/**
 * The agent's SILENCE, end to end (owner, 2026-09-08).
 *
 * *"The agent now might send null values for many fields, so make sure web allows a non-selected
 * option — no need to auto-select everything. Even if required, just show it in red with «Required»
 * if the user tried to go next."*
 *
 * So: nothing is chosen on the renter's behalf, every unanswered required field raises its own gap,
 * and the gap is what the canvas paints red. These pin the FIRST half — that the gaps exist and are
 * addressed to the control that can satisfy them; `canvas-gating.test.tsx` pins the red mark itself.
 */
describe("a draft where the agent stated nothing", () => {
  const silent = () =>
    makeDraft([makeItem({ equipmentYear: null, safetyCertsOverride: [] })], {
      project: defaultProjectDetails(),
      touchedFields: [],
    });

  it("chooses nothing for the renter", () => {
    const p = defaultProjectDetails();
    expect(p.deliveryToSite).toBeNull();
    expect(p.returnFromSite).toBeNull();
    expect(p.fuelResponsibility).toBeNull();
    // Rental basis and the site were already unanswered; the year is «any» only when asked for.
    expect(p.timing.rentalBasis).toBeNull();
    expect(p.location.confirmed).toBe(false);
    expect(p.advanced.equipmentYear).toBeNull();
  });

  it("raises one gap per unanswered field, each addressed to its own control", () => {
    const fields = requiredGaps(silent(), true).map((g) => g.field);
    for (const f of ["delivery", "return", "fuel_responsibility", "equipment_year", "safety_certificates", "location", "rental_basis"]) {
      expect(fields, `missing a gap for ${f}`).toContain(f);
    }
  });

  it("clears each gap as its own answer arrives, and nothing else's", () => {
    const draft = silent();
    const only = (d: RfqDraft) => requiredGaps(d, true).map((g) => g.field);

    expect(only(draft)).toContain("fuel_responsibility");
    const answered = { ...draft, project: { ...draft.project, fuelResponsibility: "supplier" as const } };
    expect(only(answered)).not.toContain("fuel_responsibility");
    // The other two are untouched by that answer — no cascade, no guessing.
    expect(only(answered)).toContain("delivery");
    expect(only(answered)).toContain("return");
  });
});
