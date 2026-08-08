/**
 * V7 / V8 / V9 — the machine panel's pure model (spec 004 v3 §6.1, §6.5, §6.6).
 *
 * Everything the detail, the documents tab and the company panel *decide* lives in
 * `machine-panel-model.ts`, so it is testable in this repo's `node` vitest env with no component
 * harness. The components paint what these functions return and decide nothing of their own.
 *
 * Fixtures go through `mapFleet` rather than being hand-built `FleetMachine` literals: the parser is
 * the only thing that ever produces one in production, so a test that skipped it could pass on a shape
 * the wire cannot make.
 */

import { describe, expect, it } from "vitest";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
// The company panel's *decisions* are pure functions exported beside the component — which rows may be
// ticked, what a batch covers, what each saved file is called. Imported as a namespace as well, because
// "this module exports no request path" is itself one of the claims (AC-72).
import * as companyPanelModule from "@/components/map/panel/CompanyPanel";
import {
  companyDownloadBatch,
  companyDownloadFileName,
  companySelectableKeys,
} from "@/components/map/panel/CompanyPanel";
import {
  attentionCount,
  batchDocumentRequest,
  companyDocRows,
  COMPANY_DOC_KEYS,
  distanceBandLabel,
  docDownloadBatch,
  docRowActions,
  docRowMode,
  docRowSelectable,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
  photoSlotOf,
  presentPhotoSlots,
  selectionModeOf,
  type CompanyDocKey,
  type DocGroup,
  type DocRow,
  type MatchCellKey,
  type MatchCellState,
  type MatchRequest,
  type SelectionMode,
} from "@/components/map/panel/machine-panel-model";

/* ─────────────────────────────────── fixtures ─────────────────────────────────── */

interface RawMachine {
  photos?: { slot: string; url?: string | null }[];
  docs?: { type: string; url?: string | null; verifyStatus?: string | null; expiryDate?: string | null }[];
  year?: number | null;
  manufacturer?: string | null;
}

const machine = (raw: RawMachine = {}): FleetMachine =>
  mapFleet([
    {
      equipmentId: "eq-1",
      manufacturer: raw.manufacturer === undefined ? "Caterpillar" : raw.manufacturer,
      modelName: "320D",
      year: raw.year === undefined ? 2022 : raw.year,
      locationSource: "unit_yard",
      distanceKm: 12,
      photoKeys: (raw.photos ?? []).map((p, i) => ({ slot: p.slot, key: `k${i}`, url: p.url ?? `https://x/${p.slot}` })),
      documentKeys: (raw.docs ?? []).map((d, i) => ({
        type: d.type,
        key: `d${i}`,
        // `undefined` takes the default url; an explicit `null` means a paper on the file whose link
        // the projection did not carry — a real state, and one the row model has to survive.
        url: d.url === undefined ? `https://x/${d.type}` : d.url,
        verifyStatus: d.verifyStatus ?? null,
        expiryDate: d.expiryDate ?? null,
      })),
      inBid: true,
    },
  ])[0];

/** A `DocFile` as a row carries one — enough shape for `docRowActions` / `docRowMode` to read. */
const file = (type: string, url: string) => ({ type, label: { en: type, ar: type }, url });

/** The four slots as the BACKEND spells them — front · serial · equipment · operating_hours. */
const ALL_FOUR = [{ slot: "front" }, { slot: "serial" }, { slot: "operating_hours" }, { slot: "equipment" }];

const cellsBy = (m: FleetMachine, r: MatchRequest): Record<MatchCellKey, { state: MatchCellState; en: string; ar: string }> => {
  const out = {} as Record<MatchCellKey, { state: MatchCellState; en: string; ar: string }>;
  for (const c of matchGrid(m, r)) out[c.key] = { state: c.state, en: c.finding.en, ar: c.finding.ar };
  return out;
};

/* ────────────────────────────── the six match cells (V7) ────────────────────────────── */

describe("matchGrid — six cells, in the spec's order (AC-36)", () => {
  it("returns exactly the six §6.5 cells and nothing descriptive", () => {
    const cells = matchGrid(machine({ photos: ALL_FOUR }), {});
    expect(cells.map((c) => c.key)).toEqual([
      "year_make",
      "attachments",
      "photos",
      "ownership",
      "equipment_cert",
      "operator_cert",
    ]);
  });

  it("every cell states an actual finding — never a bare tick (AC-37)", () => {
    for (const c of matchGrid(machine({ photos: ALL_FOUR }), { reqEquipmentCerts: ["tuv"] })) {
      expect(c.finding.en.trim().length).toBeGreaterThan(3);
      expect(c.finding.ar.trim().length).toBeGreaterThan(3);
      expect(["green", "grey", "red"]).toContain(c.state);
    }
  });
});

describe("year & manufacturer", () => {
  it("greys when the request asked for no year — a cell nobody asked about cannot fail", () => {
    const c = cellsBy(machine({ year: 2011 }), {}).year_make;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("no year asked for");
  });

  it("greens when the machine meets the asked-for year, and names the year and the maker", () => {
    const c = cellsBy(machine({ year: 2022 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("green");
    expect(c.en).toContain("2022");
    expect(c.en).toContain("Caterpillar");
  });

  it("reds when the machine is older than the asked-for year, and says what was asked", () => {
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    expect(c.en).toContain("2020 or newer");
  });

  it("reds when a year was asked for and the machine's file carries none", () => {
    const c = cellsBy(machine({ year: null }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    expect(c.en).toContain("not on the file");
  });

  it("does not treat an AGE requirement as a year — `computeUnitReadiness` already ruled on that", () => {
    // reqMinYear can be a max-age (e.g. 5). It must not read as "built in year 5".
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 5 }).year_make;
    expect(c.state).toBe("grey");
  });
});

describe("attachments — grey by decision, never red", () => {
  it("greys with 'none asked for' when the request asked for none", () => {
    const c = cellsBy(machine(), {}).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("none asked for");
  });

  it("stays grey when the request DID ask, because a fleet row carries no attachment record", () => {
    // Red here would mark every machine on the platform as failing a check that was never run —
    // `FleetMachine` has no attachments field, and `bids.ts` hard-codes the same term grey.
    const c = cellsBy(machine(), { attachmentIds: ["a1", "a2"], customAttachments: ["ripper"] }).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toContain("3 asked for");
  });

  it("ignores blank attachment entries when counting", () => {
    const c = cellsBy(machine(), { attachmentIds: ["a1", "  "], customAttachments: [""] }).attachments;
    expect(c.en).toContain("1 asked for");
  });
});

// Scored on the REQUIRED slots — front + plate — since the owner ruled on 2026-08-08 that this cell
// follows the documents group. Before that, a machine carrying both mandatory shots and no meter photo
// read "nothing outstanding" in the documents tab and red "2 of 4 uploaded" here, on one screen.
describe("equipment photos — the fraction, over the slots the lessor is actually held to", () => {
  it("greens on the two REQUIRED slots, whether or not the optional two were uploaded", () => {
    const both = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }] }), {}).photos;
    expect(both.state).toBe("green");
    expect(both.en).toBe("2 of 2 uploaded");
    // All four reads the same: the optional shots are not a higher score, they are simply optional.
    const all = cellsBy(machine({ photos: ALL_FOUR }), {}).photos;
    expect(all.state).toBe("green");
    expect(all.en).toBe("2 of 2 uploaded");
  });

  it("does not fail a machine for a shot nobody requires", () => {
    // front + plate + side, no meter. The old rule called this "3 of 4" and red.
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("green");
  });

  it("reds when a REQUIRED shot is missing, and says which fraction is short", () => {
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("1 of 2 uploaded");
  });

  it("reds at none, and reports zero rather than omitting the cell", () => {
    const c = cellsBy(machine({ photos: [] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("0 of 2 uploaded");
  });

  it("folds the wire's slot vocabulary onto the four the renter is shown", () => {
    // The backend stores front · serial · equipment · operating_hours. Matching the spec's words
    // ("plate", "meter", "side") literally would leave three rows permanently empty.
    expect(photoSlotOf("front")).toBe("front");
    expect(photoSlotOf("serial")).toBe("plate");
    expect(photoSlotOf("operating_hours")).toBe("meter");
    expect(photoSlotOf("equipment")).toBe("side");
    expect(photoSlotOf("OTHER")).toBeNull();
    expect(photoSlotOf("")).toBeNull();
  });

  it("counts a slot once however many photos sit in it", () => {
    const m = machine({ photos: [{ slot: "front" }, { slot: "front" }, { slot: "serial" }] });
    expect(presentPhotoSlots(m)).toEqual(["front", "plate"]);
  });
});

describe("proof of ownership — green when held, RED when absent", () => {
  it("greens when the machine's file carries one", () => {
    const c = cellsBy(machine({ docs: [{ type: "istimara" }] }), {}).ownership;
    expect(c.state).toBe("green");
    expect(c.en).toBe("on the machine's file");
  });

  it("reds when it does not — the paper reaches the renter now, so an absence is a real gap", () => {
    // An earlier revision made this grey, on the premise that `RENTEE_HIDDEN_DOC_TYPES` strips
    // ownership papers before they reach this client. That filter was DELETED when ownership documents
    // became renter-visible with usable urls, so a missing one is the supplier's omission — actionable,
    // and requestable from the documents tab. (`bid-readiness.ts` still excludes it from the readiness
    // SCORE; that is about a band, not about visibility.)
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), {}).ownership;
    expect(c.state).toBe("red");
    expect(c.en).toContain("not on the file");
  });
});

describe("certificates — grey when unasked, red when asked and missing", () => {
  it("greys the equipment cert when the request asked for none", () => {
    expect(cellsBy(machine(), {}).equipment_cert.state).toBe("grey");
  });

  it("greens when every asked-for equipment cert is on the file", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }, { type: "spsp" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("green");
    expect(c.en).toContain("on the machine's file");
  });

  it("reds and names ONLY the missing one", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("red");
    expect(c.en).toContain("SPSP");
    expect(c.en).not.toContain("TÜV");
    expect(c.en).toContain("not on the file");
  });

  it("greys operator certs when the request declared no operator licence level", () => {
    expect(cellsBy(machine(), { operatorCertReq: null }).operator_cert.state).toBe("grey");
  });

  it("reds operator certs the request asked for and the machine does not hold", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { operatorCertReq: "spsp" }).operator_cert;
    expect(c.state).toBe("red");
  });
});

describe("heroPhotoUrl", () => {
  it("prefers the front shot", () => {
    expect(heroPhotoUrl(machine({ photos: [{ slot: "serial" }, { slot: "front" }] }))).toBe("https://x/front");
  });
  it("falls back to any photo, and to null when there are none", () => {
    expect(heroPhotoUrl(machine({ photos: [{ slot: "serial" }] }))).toBe("https://x/serial");
    expect(heroPhotoUrl(machine({ photos: [] }))).toBeNull();
  });
});

/**
 * The word after the kilometres on the detail's availability line — the prototype's own `distBand`,
 * ported with its own thresholds rather than derived from the LIST's filter bands.
 */
describe("distanceBandLabel", () => {
  it("is قريب to 30 km, متوسط to 120, and بعيد past it — the prototype's thresholds, at the boundaries", () => {
    expect([0, 30].map((km) => distanceBandLabel(km)?.ar)).toEqual(["قريب", "قريب"]);
    expect([30.5, 120].map((km) => distanceBandLabel(km)?.ar)).toEqual(["متوسط", "متوسط"]);
    expect([120.5, 900].map((km) => distanceBandLabel(km)?.ar)).toEqual(["بعيد", "بعيد"]);
  });

  it("**an unknown distance gets no word** — «غير معروفة» is not «بعيدة»", () => {
    // The same rule the list's distance bands hold. A band word on a machine with no distance would
    // be a claim about where it is, made from the absence of any claim about where it is.
    for (const km of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(distanceBandLabel(km)).toBeNull();
    }
  });

  it("does not follow the LIST's filter bands, which are a different question", () => {
    // `DISTANCE_BANDS_KM` is ≤50 · ≤100 · ≤200. A machine at 50 km is inside the list's first band
    // and is already «متوسط» here, and that is not a bug to be reconciled: one answers "hide the rest
    // of them", the other answers "how far is this one".
    expect(distanceBandLabel(50)?.ar).toBe("متوسط");
  });
});

/* ────────────────────────── equipment documents (V8) ────────────────────────── */

/* ────────────── V8 — the document groups (§6.6, AC-38, AC-39, AC-42) ──────────────
 *
 * The platform's one rule (owner, 2026-08-08), applied to photos, ownership, equipment certs and
 * operator papers alike:
 *
 *   required + held    → shown, green, openable
 *   required + absent  → RED, counted, requestable
 *   not required + held→ shown, openable, NO verdict, NOT counted, NOT requestable
 *   not required + absent → no row at all
 *
 * Required = front photo · plate/serial photo · proof of ownership (all three from the supplier's own
 * scorer, `bid_readiness.dart`) + every cert THIS request asked for.
 */

/** A request that asks for nothing — the no-operator, no-cert job. */
const NO_ASKS: MatchRequest = {};
/** A request naming equipment certs and/or the operator licence level the renter requires. */
const asking = (equip: string[] = [], operator = ""): MatchRequest => ({
  reqEquipmentCerts: equip,
  operatorCertReq: operator || null,
});
const groupBy = (m: FleetMachine, r: MatchRequest) =>
  Object.fromEntries(equipmentDocGroups(m, r).map((g) => [g.key, g]));

describe("equipmentDocGroups — the groups, and each one's own attention count (AC-42)", () => {
  it("splits photos from documents from the OPERATOR's documents, and never merges the counts", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    expect(groups.map((g) => g.key)).toEqual(["photos", "documents", "operator"]);
    // The operator is a SECTION now, not one row buried in the equipment's papers.
    expect(groups[2].rows.map((r) => r.key)).toEqual(["doc:operator:tuv"]);
  });

  it("counts ROWS NEEDING ACTION, never totals", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }], docs: [{ type: "tuv" }] }), asking(["tuv"], "spsp"));
    expect(g.photos.attention).toBe(1); // the plate shot, and nothing else — meter and side are not required
    expect(g.documents.attention).toBe(1); // ownership; the asked-for TÜV is on the file
    // The operator's group makes NO claim (owner, 2026-08-08) — its missing SPSP is red on the row and
    // counted nowhere, because the count promises an action and this group offers none.
    expect(g.operator.attention).toBeNull();
  });

  it("reports zero attention when everything required is on the file", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    // The operator's group is `null` even here, where every certificate it names IS on the file — the
    // group never makes a claim, rather than making one that happens to be zero.
    expect(groups.map((g) => g.attention)).toEqual([0, 0, null]);
  });

  it("answers an asked-for licence with a held `operating_license` — it carries no `operator_` prefix", () => {
    // `CERTIFIED` is the request code; `operating_license` is the paper it stands for (the app's table).
    const g = groupBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "CERTIFIED"));
    expect(g.operator.rows.map((r) => r.key)).toEqual(["doc:operator:operating_license"]);
    expect(g.operator.rows[0].label.en).toBe("Operator licence");
    expect(g.operator.rows[0].status).toBe("present"); // the prefix test alone would have read it missing
    // …and it is NOT also a row under the equipment's papers, which hold only the ownership row here.
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
  });

  it("folds the three request codes for the operator's licence into ONE row", () => {
    const g = groupBy(machine({ docs: [] }), asking([], "CERTIFIED, SAFETY_CERT, SAFETY"));
    expect(g.operator.rows.map((r) => r.key)).toEqual(["doc:operator:operating_license"]);
  });

  it("keeps every operator paper a request can actually ask for as a row of its own", () => {
    // The ask vocabulary is the app's table — TUV · SPSP · CERTIFIED/SAFETY_CERT/SAFETY — and it reaches
    // exactly three of the backend's operator papers (web-handoff.md:16). `operator_id` and
    // `operator_insurance` are held but never requested, so they are not rows.
    const g = groupBy(machine({ docs: [] }), asking([], "TUV, SPSP, CERTIFIED"));
    expect(g.operator.rows.map((r) => r.key)).toEqual([
      "doc:operator:tuv",
      "doc:operator:spsp",
      "doc:operator:operating_license",
    ]);
    expect(g.operator.rows.map((r) => r.label.en)).toEqual([
      "Operator TÜV",
      "Operator SPSP",
      "Operator licence",
    ]);
  });

  it("does not call a spec sheet an equipment safety certificate — it calls it a spec sheet", () => {
    const g = groupBy(machine({ docs: [{ type: "spec_sheet" }, { type: "other" }] }), asking(["tuv"]));
    const cert = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(cert.status).toBe("missing");
    expect(g.documents.rows.find((r) => r.key === "doc:other:spec_sheet")?.label.en).toBe("Spec sheet");
  });

  it("shows PRESENCE ONLY — never a verification badge or an expiry (AC-39, §6.6)", () => {
    // The wire carries both fields. Nothing may render them here: a badge invites the renter to judge
    // a supplier on a state the platform sets.
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "tuv", verifyStatus: "verified", expiryDate: "2027-03-12" }] }),
      asking(["tuv"]),
    );
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "doc:equipment_cert:tuv");
    expect(row?.statusLine.en).toBe("on the machine's file");
    const text = JSON.stringify(groups);
    for (const leak of ["verified", "failed", "2027", "expiry", "valid until"]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("uses the presence vocabulary the spec names, and no other", () => {
    const groups = equipmentDocGroups(machine({ photos: ALL_FOUR, docs: [{ type: "tuv" }] }), NO_ASKS);
    for (const line of groups.flatMap((g) => g.rows.map((r) => r.statusLine.en))) {
      expect([
        "uploaded",
        "not uploaded",
        "uploaded · not required",
        "on the machine's file",
        "no document yet",
        "on the machine's file · not required",
      ]).toContain(line);
    }
  });

  it("gives every row a download link when it holds a file, and none when it does not", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    expect(g.photos.rows[0].downloadUrl).toBe("https://x/front");
    expect(g.photos.rows[1].downloadUrl).toBeNull();
  });
});

describe("a document nobody asked for is never shown as missing (owner, 2026-08-08)", () => {
  it("an unrequested cert the machine does NOT hold is not a row at all", () => {
    const g = groupBy(machine({ docs: [] }), NO_ASKS);
    // Only proof of ownership, which is required of every lessor regardless of the request.
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
    expect(g.operator).toBeUndefined();
  });

  it("an unrequested cert the machine DOES hold is shown, openable, and carries no verdict", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), NO_ASKS);
    const row = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.status).toBe("on_file"); // not "present" — nothing was passed, because nothing was asked
    expect(row.statusLine.en).toBe("on the machine's file · not required");
    expect(docRowActions(row).map((a) => a.kind)).toEqual(["view"]);
    // Not requestable, and yet tickable — for the OTHER batch. Being on the file is what makes it
    // downloadable, which is the 2026-08-08 mode split seen from the not-required row.
    expect(docRowMode(row)).toBe("download");
  });

  it("a held-but-unrequested row raises NOBODY's attention count", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    expect(g.documents.attention).toBe(0);
    // Nothing was asked of the operator, so he has no section to raise a count in.
    expect(g.operator).toBeUndefined();
  });

  it("a held-but-unrequested row cannot be ticked — there is nothing to chase", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    // Ownership is required of every lessor and this machine holds none, so it is the one askable row.
    for (const row of g.documents.rows) expect(row.requestable).toBe(row.key === "doc:ownership");
  });
});

/* ───────────── ruling 2 — you can only ask for what is not there (owner, 2026-08-08) ───────────── */

describe("a document already on the file is never requestable", () => {
  it("a requested cert is askable when it is ABSENT and not when it is HELD", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const held = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    const gap = g.documents.rows.find((r) => r.key === "doc:equipment_cert:spsp")!;
    // The earlier rule made a held-and-required row askable too, so a renter could chase a legible
    // re-scan. Withdrawn: an ask naming a paper the lessor can see on his own file has one possible
    // answer — "it is already there".
    expect([held.status, held.requestable]).toEqual(["present", false]);
    expect([gap.status, gap.requestable]).toEqual(["missing", true]);
  });

  it("holds for photos too — an uploaded shot is not a shot to ask for", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    const front = g.photos.rows.find((r) => r.key === "photo:front")!;
    const plate = g.photos.rows.find((r) => r.key === "photo:plate")!;
    expect([front.status, front.requestable]).toEqual(["present", false]);
    expect([plate.status, plate.requestable]).toEqual(["missing", true]);
  });

  /* A test here asserted that the operator's certificates follow this rule too — a missing one being
   * `requestable: true`. **Deleted, not inverted** (owner, 2026-08-08): that family is outside the rule
   * rather than a case of it, and the assertion that replaces it lives with the rest of the group's
   * inertness below ("the operator's group participates in nothing"). Inverting it here would have left
   * the operator inside a describe block about what may be asked for. */

  it("makes requestable and missing the SAME set, in every group that can be asked of", () => {
    const g = equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv, spsp"),
    );
    // The operator's group is excluded BY NAME rather than by a filter that happens to skip it, so the
    // exception stays visible: it is not asked for at all, in either state.
    for (const group of g.filter((x) => x.key !== "operator")) {
      for (const row of group.rows) expect(row.requestable).toBe(row.status === "missing");
    }
  });

  it("a group with nothing missing offers nothing to tick", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }] }), asking(["tuv"]));
    expect(g.documents.attention).toBe(0);
    expect(g.documents.rows.filter((r) => r.requestable)).toEqual([]);
  });
});

describe("the operator's section on a job with NO operator", () => {
  it("does not exist when nothing was asked for and nothing is held", () => {
    expect(groupBy(machine({ docs: [{ type: "tuv" }] }), NO_ASKS).operator).toBeUndefined();
  });

  it("never shows a missing operator paper on a job that asked for no operator", () => {
    const rows = equipmentDocGroups(machine({ docs: [] }), NO_ASKS).flatMap((g) => g.rows);
    expect(rows.filter((r) => r.key.startsWith("doc:operator:"))).toEqual([]);
  });

  it("raises no row for an operator paper the lessor happens to hold, either", () => {
    // The group is a STATUS of what THIS request asked of the operator. With nothing asked there is
    // nothing to state — and a row carrying no verdict, no count and (per ruling 1) no file would be a
    // line of text with nothing to say.
    expect(groupBy(machine({ docs: [{ type: "operator_tuv" }] }), NO_ASKS).operator).toBeUndefined();
  });

  it("turns red only once the request asks for the operator's papers", () => {
    const g = groupBy(machine({ docs: [] }), asking([], "TUV,SPSP"));
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([
      ["doc:operator:tuv", "missing"],
      ["doc:operator:spsp", "missing"],
    ]);
    // Red on the rows, and no count — the group states a fact and offers no act (owner, 2026-08-08).
    expect(g.operator.attention).toBeNull();
  });
});

describe("photos follow the same rule as the papers", () => {
  it("front and plate are required of every lessor — absent, they are red and counted", () => {
    const g = groupBy(machine({ photos: [] }), NO_ASKS);
    expect(g.photos.rows.map((r) => [r.key, r.status])).toEqual([
      ["photo:front", "missing"],
      ["photo:plate", "missing"],
    ]);
    expect(g.photos.attention).toBe(2);
  });

  it("meter and side are required nowhere — absent, they are NOT rows", () => {
    const g = groupBy(machine({ photos: ALL_FOUR.filter((p) => p.slot === "front" || p.slot === "serial") }), NO_ASKS);
    expect(g.photos.rows.map((r) => r.key)).toEqual(["photo:front", "photo:plate"]);
    expect(g.photos.attention).toBe(0);
  });

  it("meter and side DO show when uploaded, with no verdict and no tick", () => {
    const g = groupBy(machine({ photos: ALL_FOUR }), NO_ASKS);
    const meter = g.photos.rows.find((r) => r.key === "photo:meter")!;
    expect([meter.status, meter.statusLine.en, meter.requestable]).toEqual([
      "on_file",
      "uploaded · not required",
      false,
    ]);
    expect(g.photos.attention).toBe(0);
  });
});

describe("a row holding several files exposes EVERY one of them", () => {
  it("OWNERSHIP had the bug — an istimara AND a customs card both reach the renter, not just the first", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/ist", "https://x/cus"]);
    expect(docRowActions(row).map((a) => a.href)).toEqual(["https://x/ist", "https://x/cus"]);
    // The invariant survives the second file: exactly one primary, and it is the first file's view.
    expect(docRowActions(row).filter((a) => a.primary)).toHaveLength(1);
    expect(docRowActions(row).filter((a) => a.primary)[0]).toMatchObject({ kind: "view", href: "https://x/ist" });
  });

  it("the EQUIPMENT CERTIFICATE row too — two TÜV uploads are two openable files", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "tuv", url: "https://x/tuv-a" },
          { type: "tüv", url: "https://x/tuv-b" },
        ],
      }),
      asking(["tuv"]),
    );
    const row = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/tuv-a", "https://x/tuv-b"]);
    expect(docRowActions(row)).toHaveLength(2);
  });

  it("names each file after its own type, so two controls are never two unlabelled twins", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.files.map((f) => f.label.en)).toEqual(["Registration (Istimara)", "Customs card"]);
    expect(row.files.map((f) => f.label.ar)).toEqual(["الاستمارة", "البطاقة الجمركية"]);
  });

  it("a file with no url is not a control — it cannot become a link to nowhere", () => {
    const g = groupBy(
      machine({ docs: [{ type: "istimara", url: null }, { type: "customs_card", url: "https://x/cus" }] }),
      NO_ASKS,
    );
    const row = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    expect(row.status).toBe("present"); // the paper IS on the file; only its link is absent
    expect(docRowActions(row).map((a) => a.href)).toEqual(["https://x/cus"]);
  });
});

describe("the batch ask raised from the equipment's papers (AC-38)", () => {
  /* A test here asserted the batch ask raised FROM the operator's section — that ticking its rows
   * composed a draft naming `operator_safety_certificate`. **Deleted rather than inverted** (owner,
   * 2026-08-08): *"operator docs cannot be viewed or requested and are not part of docs."* There is no
   * such ask to describe, so the assertion belongs with the group's inertness, not here. What replaces
   * it is stronger — that no operator row can reach the composer however the selection was arrived at —
   * and it lives in "the operator's group participates in nothing" below. */

  it("an equipment ask names the precise cert where the catalogue is known to accept it", () => {
    const g = groupBy(machine({ docs: [] }), asking(["tuv", "spsp", "aramco"]));
    const rows = g.documents.rows.filter((r) => r.key.startsWith("doc:equipment_cert:"));
    const draft = batchDocumentRequest("eq-1", rows, new Set(rows.map((r) => r.key)));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual([
      "tuv",
      "spsp",
      "equipment_safety_certificate",
    ]);
  });

  it("asks for the paper, not for a second copy of one already on the file", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }] }), asking(["tuv"]));
    // Every required paper is on the file, so nothing here is askable: the batch is null and the send
    // control disables itself from the same value it would have sent.
    expect(batchDocumentRequest("eq-1", g.documents.rows, new Set(g.documents.rows.map((r) => r.key)))).toBeNull();
  });

  it("drops a held row from the ask even when it was somehow ticked", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const draft = batchDocumentRequest("eq-1", g.documents.rows, new Set(g.documents.rows.map((r) => r.key)));
    // Ownership and SPSP are missing; the held TÜV is not in the payload however the set was arrived at.
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["istimara", "spsp"]);
  });
});

/* ───── ruling 1 — the operator's documents are a STATUS, not a document list (owner, 2026-08-08) ───── */

describe("the operator's certificates say present or absent, and expose no file", () => {
  const held = () => groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv, spsp")).operator;

  it("states presence, green or red, and makes no attention claim at all", () => {
    const g = held();
    expect(g.rows.map((r) => [r.key, r.status, r.statusLine.en])).toEqual([
      ["doc:operator:tuv", "present", "on the machine's file"],
      ["doc:operator:spsp", "missing", "no document yet"],
    ]);
    // ~~`attention` was 1 here~~ — withdrawn 2026-08-08 with the group's requestability. The count reads
    // "N rows need action from you", and there is no action on this group; `null` is the component's
    // instruction to render no pill, which is not the same as a green «لا ينقص شيء» over a red row.
    expect(g.attention).toBeNull();
  });

  it("exposes NO url — not on the held row, and not on the missing one", () => {
    // Nothing validates an operator document on upload, so a file the renter can open would present an
    // unchecked upload as verified evidence. Presence is a fact the platform can stand behind.
    for (const row of held().rows) {
      expect(row.downloadUrl).toBeNull();
      expect(row.files).toEqual([]);
      expect(row.thumbUrl).toBeNull();
    }
  });

  it("offers NO view and NO download control — the withdrawn behaviour cannot come back by accident", () => {
    for (const row of held().rows) expect(docRowActions(row)).toEqual([]);
  });

  it("carries no url even when the lessor filed several copies", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "operator_tuv", url: "https://x/op-1" },
          { type: "operator_tuv", url: "https://x/op-2" },
        ],
      }),
      asking([], "tuv"),
    );
    expect(g.operator.rows[0].status).toBe("present");
    expect(JSON.stringify(g.operator)).not.toContain("https://x/op-");
  });

  it("reads the SCORER's `present`, so the panel and the readiness card cannot disagree", () => {
    // The scorer translates the request code `CERTIFIED` into the kind a machine actually carries
    // (`operating_license`) — the app's table. Bucketing `documentKeys` a second time here is exactly
    // the second opinion this avoids, so the panel inherits that translation rather than repeating it.
    const g = groupBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "CERTIFIED"));
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([["doc:operator:operating_license", "present"]]);
  });

  it("raises NO row for an operator code that names no document — never a permanently red one", () => {
    // A code outside the app's table (`GRADE-1`, free text, a paper the platform does not carry) names
    // nothing a lessor could upload. The scorer drops it, so the renter is not shown a red row the
    // supplier can never clear. The licence asked for alongside it still gets its row.
    const g = groupBy(
      machine({ docs: [{ type: "operating_license" }] }),
      asking([], "GRADE-1, CERTIFIED"),
    );
    expect(g.operator.rows.map((r) => [r.key, r.status])).toEqual([["doc:operator:operating_license", "present"]]);
  });

  it("keeps a held operator paper out of the equipment's papers — no url through the other door", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv"));
    expect(g.documents.rows.map((r) => r.key)).toEqual(["doc:ownership"]);
    expect(JSON.stringify(g.documents)).not.toContain("operator_tuv");
  });
});

/* ─── the same ruling, narrowed the same day: the group is a STATUS and NOTHING ELSE (owner) ───
 *
 * *"Operator docs cannot be viewed or requested and are not part of docs — they are just a view of what
 * the supplier has."* The rows had kept a checkbox while missing and composed into the batch ask. That is
 * withdrawn, and what these assert is the negative that follows: **a group that renders must participate
 * in nothing.** Not "is usually skipped" — unreachable from every mechanism on the tab, however the
 * selection was arrived at.
 */
describe("the operator's group participates in nothing", () => {
  /** Two operator certs asked for, one held; alongside a machine with a real mix of tickable rows, so a
   *  selection built over EVERYTHING has both modes available to it. */
  const mixedWithOperator = () =>
    equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv, spsp"),
    );
  const operatorKeys = (groups: DocGroup[]) =>
    groups.flatMap((g) => g.rows).filter((r) => r.key.startsWith("doc:operator:")).map((r) => r.key);

  it("no operator row is requestable, in either state", () => {
    const rows = mixedWithOperator().find((g) => g.key === "operator")!.rows;
    expect(rows.map((r) => [r.status, r.requestable])).toEqual([
      ["present", false],
      ["missing", false],
    ]);
  });

  it("no operator row is selectable, in any mode — neutral, download or request", () => {
    const groups = mixedWithOperator();
    const rows = groups.flatMap((g) => g.rows);
    for (const mode of [null, "download", "request"] as const) {
      const selectable = rows.filter((r) => docRowSelectable(r, mode)).map((r) => r.key);
      expect(selectable.filter((k) => k.startsWith("doc:operator:"))).toEqual([]);
    }
  });

  it("neither select-all key list can reach one", () => {
    const rows = mixedWithOperator().flatMap((g) => g.rows);
    // The two lists the select-all link is built from — `DocRowList` filters on exactly this.
    const available = rows.filter((r) => docRowMode(r) === "download").map((r) => r.key);
    const missing = rows.filter((r) => docRowMode(r) === "request").map((r) => r.key);
    expect([...available, ...missing].filter((k) => k.startsWith("doc:operator:"))).toEqual([]);
    // And a select-all run cannot pull one in as a side effect: the operator's own keys select nothing.
    expect(operatorKeys(mixedWithOperator())).not.toEqual([]);
  });

  it("the batch composer names none of them, even with every row on the tab ticked", () => {
    const groups = mixedWithOperator();
    const rows = groups.flatMap((g) => g.rows);
    const draft = batchDocumentRequest("eq-1", rows, new Set(rows.map((r) => r.key)));
    // The plate photo and the asked-for TÜV are missing and go in; the two operator rows do not, and the
    // withdrawn `operator_safety_certificate` cannot appear from any row.
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["plate", "tuv"]);
    expect(JSON.stringify(draft)).not.toContain("operator");
  });

  it("ticking ONLY the operator's rows composes nothing at all — no ask and no download", () => {
    const groups = mixedWithOperator();
    const rows = groups.flatMap((g) => g.rows);
    const ticked = new Set(operatorKeys(groups));
    expect(batchDocumentRequest("eq-1", rows, ticked)).toBeNull();
    expect(docDownloadBatch(rows, ticked)).toEqual([]);
    // It cannot even put the tab into a mode, so it can never dim the rows that DO act.
    expect(selectionModeOf(rows, ticked)).toBeNull();
  });

  it("carries no doc type to ask with — there is no payload waiting for a caller", () => {
    for (const row of mixedWithOperator().find((g) => g.key === "operator")!.rows) {
      expect(row.docTypes).toEqual([]);
    }
  });

  it("adds nothing to the tab's attention badge, which sums the groups", () => {
    const groups = mixedWithOperator();
    // `EquipmentDetail` sums `g.attention ?? 0`. The plate photo and the missing TÜV are the whole badge;
    // the missing operator SPSP is red on its row and counted nowhere.
    expect(groups.reduce((n, g) => n + (g.attention ?? 0), 0)).toBe(2);
    expect(groups.find((g) => g.key === "operator")!.attention).toBeNull();
    expect(groups.filter((g) => g.attention === null).map((g) => g.key)).toEqual(["operator"]);
  });
});

/* ──────────── V15 — every document is VIEWABLE (004a §7, RM3-AC-69, narrowed 2026-08-08) ────────────
 *
 * The per-row **download** is withdrawn by the owner's UI design of 2026-08-08: downloading is the batch
 * action now, so a row keeps exactly one control — view — and AC-69 is narrowed to match rather than
 * left contradicting the code. The second clause is untouched: a row with no url exposes NOTHING.
 */

describe("docRowActions — view, and neither a download glyph nor a dead button (AC-69)", () => {
  it("a row WITH a url exposes exactly one control, and it is view", () => {
    const actions = docRowActions({ downloadUrl: "https://x/cr.pdf" });
    expect(actions.map((a) => a.kind)).toEqual(["view"]);
    expect(actions[0].href).toBe("https://x/cr.pdf");
  });

  it("carries NO per-row download — the withdrawn control cannot come back by accident", () => {
    const row = { downloadUrl: "https://x/a.pdf", files: [file("istimara", "https://x/a.pdf")] };
    expect(docRowActions(row).map((a) => a.kind)).toEqual(["view"]);
    // The `download` flag went with the control; nothing on an action can ask a browser to save.
    for (const a of docRowActions(row)) expect(a).not.toHaveProperty("download");
  });

  it("view is the ONLY primary", () => {
    const actions = docRowActions({ downloadUrl: "https://x/cr.pdf" });
    expect(actions.filter((a) => a.primary).map((a) => a.kind)).toEqual(["view"]);
  });

  it("a row WITHOUT a url exposes NO control — never a dead button", () => {
    expect(docRowActions({ downloadUrl: null })).toEqual([]);
  });

  it("an empty-string url is an absent url, not a link to nowhere", () => {
    expect(docRowActions({ downloadUrl: "" })).toEqual([]);
  });
});

describe("every document family on this surface is openable (AC-69)", () => {
  it("equipment PAPERS — a held paper gets view, an absent one gets nothing", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }] }), asking(["tuv"], "tuv"));
    const ownership = g.documents.rows.find((r) => r.key === "doc:ownership")!;
    const cert = g.documents.rows.find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(docRowActions(ownership).map((a) => a.kind)).toEqual(["view"]);
    expect(docRowActions(cert)).toEqual([]);
    // The operator's rows are the deliberate exception — never openable, held or not (ruling 1).
    expect(g.operator.rows.flatMap((r) => docRowActions(r))).toEqual([]);
  });

  it("equipment PHOTOS — a separate group, and just as openable as a paper", () => {
    const [photos] = equipmentDocGroups(machine({ photos: [{ slot: "front" }] }), NO_ASKS);
    const front = photos.rows.find((r) => r.key === "photo:front")!;
    expect(docRowActions(front).map((a) => a.kind)).toEqual(["view"]);
    expect(docRowActions(front)[0].href).toBe("https://x/front");
    // The three slots the machine has no photo for stay unopenable rather than dead.
    for (const row of photos.rows.filter((r) => r.key !== "photo:front")) expect(docRowActions(row)).toEqual([]);
  });

  it("COMPANY papers — same control, and a row with no url still has nothing to press", () => {
    const rows = companyDocRows({
      verified: true,
      docs: { cr: { present: true, downloadUrl: "https://x/cr.pdf" }, vat: { present: true } },
    });
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(docRowActions(by("cr")).map((a) => a.kind)).toEqual(["view"]);
    // Present but with no url, and absent entirely, come out the same way: nothing to press.
    expect(docRowActions(by("vat"))).toEqual([]);
    expect(docRowActions(by("national_address"))).toEqual([]);
  });

  it("SASO — the fifth company row, openable on exactly the same terms", () => {
    const withUrl = companyDocRows({
      verified: true,
      docs: { saso: { present: true, downloadUrl: "https://x/saso.pdf" } },
    }).find((r) => r.key === "saso")!;
    expect(docRowActions(withUrl).map((a) => a.kind)).toEqual(["view"]);
    expect(docRowActions(withUrl)[0].href).toBe("https://x/saso.pdf");

    const absent = companyDocRows({ verified: true, docs: {} }).find((r) => r.key === "saso")!;
    expect(absent.statusLine.en).toBe("no document yet");
    expect(docRowActions(absent)).toEqual([]);
  });

  it("EVERY company key the panel lists is covered — the list cannot grow past these assertions", () => {
    const docs = Object.fromEntries(
      COMPANY_DOC_KEYS.map((k) => [k, { present: true, downloadUrl: `https://x/${k}.pdf` }]),
    );
    for (const row of companyDocRows({ verified: true, docs })) {
      expect(docRowActions(row).map((a) => a.kind)).toEqual(["view"]);
    }
    for (const row of companyDocRows({ verified: true, docs: {} })) {
      expect(docRowActions(row)).toEqual([]);
    }
  });

  it("being openable adds NO verification state to an equipment row (§6.6, §7.2)", () => {
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "istimara", verifyStatus: "verified", expiryDate: "2030-01-01" }] }),
      asking(["tuv"], "tuv"),
    );
    for (const row of groups.flatMap((g) => g.rows)) {
      expect(["present", "on_file", "missing"]).toContain(row.status);
      expect([
        "uploaded",
        "not uploaded",
        "uploaded · not required",
        "on the machine's file",
        "no document yet",
        "on the machine's file · not required",
      ]).toContain(row.statusLine.en);
      // The row's whole shape, so a verify badge or an expiry cannot arrive by accident.
      expect(Object.keys(row).sort()).toEqual(
        ["docTypes", "downloadUrl", "files", "key", "label", "requestable", "status", "statusLine", "thumbUrl"],
      );
    }
  });
});

/* ───── V16 — one checkbox column, two mutually exclusive modes (owner's UI design, 2026-08-08) ───── */

/**
 * Selection stopped being one thing. **One checkbox column, meaning set by the first tick:** a **held**
 * row ticks for *download*, a **missing** row ticks for *request*, and the other kind goes inert so the
 * two can never mix.
 *
 * The whole of it is pure and lives in the model, which is why it is asserted here and not through a
 * component harness (this repo's vitest env is `node`). The components paint what these four functions
 * return: `docRowMode` (which batch a row's tick would feed), `selectionModeOf` (which mode the ticked
 * set is in), `docRowSelectable` (may this row be ticked *right now*) and `docDownloadBatch` (what the
 * live «تنزيل» would actually save).
 *
 * **The rule from `850401f` survives untouched** and is re-asserted at the end: a request draft still
 * names only rows that are **missing**.
 */
describe("selection is a MODE, inferred from the first tick", () => {
  /** front photo held · plate photo missing · ownership held · TÜV asked for and missing. */
  const mixed = () =>
    equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }] }),
      asking(["tuv"]),
    ).flatMap((g) => g.rows);

  const HELD_PHOTO = "photo:front";
  const MISSING_PHOTO = "photo:plate";
  const HELD_PAPER = "doc:ownership";
  const MISSING_PAPER = "doc:equipment_cert:tuv";

  const rowAt = (rows: DocRow[], key: string) => rows.find((r) => r.key === key)!;
  const selectableKeys = (rows: DocRow[], mode: SelectionMode | null) =>
    rows.filter((r) => docRowSelectable(r, mode)).map((r) => r.key);
  /** The draft, narrowed — `PanelRequestDraft` is a union and only its `document` arm names papers. */
  const docDraft = (rows: DocRow[], selected: ReadonlySet<string>) => {
    const draft = batchDocumentRequest("eq-1", rows, selected);
    if (draft?.kind !== "document") throw new Error("expected a document draft");
    return draft;
  };

  it("a HELD row ticks for download, a MISSING row ticks for request", () => {
    const rows = mixed();
    expect(docRowMode(rowAt(rows, HELD_PHOTO))).toBe("download");
    expect(docRowMode(rowAt(rows, HELD_PAPER))).toBe("download");
    expect(docRowMode(rowAt(rows, MISSING_PHOTO))).toBe("request");
    expect(docRowMode(rowAt(rows, MISSING_PAPER))).toBe("request");
  });

  it("the mode is the FIRST tick's kind, whichever kind that was", () => {
    const rows = mixed();
    expect(selectionModeOf(rows, new Set([HELD_PAPER]))).toBe("download");
    expect(selectionModeOf(rows, new Set([MISSING_PAPER]))).toBe("request");
  });

  it("nothing ticked is NEUTRAL, and every row that any batch can answer is tickable", () => {
    const rows = mixed();
    expect(selectionModeOf(rows, new Set())).toBeNull();
    expect(selectableKeys(rows, null)).toEqual([HELD_PHOTO, MISSING_PHOTO, HELD_PAPER, MISSING_PAPER]);
  });

  it("while DOWNLOAD holds, the missing rows stop responding", () => {
    const rows = mixed();
    const mode = selectionModeOf(rows, new Set([HELD_PHOTO]));
    expect(selectableKeys(rows, mode)).toEqual([HELD_PHOTO, HELD_PAPER]);
    expect(docRowSelectable(rowAt(rows, MISSING_PAPER), mode)).toBe(false);
  });

  it("while REQUEST holds, the held rows stop responding", () => {
    const rows = mixed();
    const mode = selectionModeOf(rows, new Set([MISSING_PAPER]));
    expect(selectableKeys(rows, mode)).toEqual([MISSING_PHOTO, MISSING_PAPER]);
    expect(docRowSelectable(rowAt(rows, HELD_PAPER), mode)).toBe(false);
  });

  it("clearing the last tick returns to neutral and re-enables everything", () => {
    const rows = mixed();
    const held = new Set([MISSING_PAPER]);
    expect(selectionModeOf(rows, held)).toBe("request");
    held.delete(MISSING_PAPER);
    // Neutral is not a reset somebody has to remember — the mode is derived, so it falls out.
    expect(selectionModeOf(rows, held)).toBeNull();
    expect(selectableKeys(rows, selectionModeOf(rows, held))).toHaveLength(4);
  });

  it("a HELD row with NO url is tickable in NEITHER mode — nothing to save and nothing to ask", () => {
    const rows = equipmentDocGroups(machine({ docs: [{ type: "istimara", url: null }] }), NO_ASKS).flatMap(
      (g) => g.rows,
    );
    const ownership = rowAt(rows, HELD_PAPER);
    expect([ownership.status, ownership.requestable]).toEqual(["present", false]);
    expect(docRowMode(ownership)).toBeNull();
    for (const mode of [null, "download", "request"] as const) {
      expect(docRowSelectable(ownership, mode)).toBe(false);
    }
  });

  it("the operator's certificates tick in NEITHER mode — held or absent", () => {
    const g = groupBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "tuv, spsp"));
    const [held, gap] = g.operator.rows;
    expect(docRowMode(held)).toBeNull(); // present, and deliberately unopenable (AC-75)
    // ~~`docRowMode(gap)` was `"request"` — absent, so still askable~~. Withdrawn 2026-08-08: this family
    // is not asked for at all, so the absent row is `null` for the same reason the held one is.
    expect(docRowMode(gap)).toBeNull();
    for (const mode of [null, "download", "request"] as const) {
      for (const row of g.operator.rows) expect(docRowSelectable(row, mode)).toBe(false);
    }
  });

  it("select-all is per mode: each list holds only the rows that mode can act on", () => {
    const rows = mixed();
    // «حدّد كل المتاح» and «حدّد كل الناقص» are these two lists; neither can reach the other's rows.
    const available = rows.filter((r) => docRowMode(r) === "download").map((r) => r.key);
    const missing = rows.filter((r) => docRowMode(r) === "request").map((r) => r.key);
    expect(available).toEqual([HELD_PHOTO, HELD_PAPER]);
    expect(missing).toEqual([MISSING_PHOTO, MISSING_PAPER]);
    expect(available.filter((k) => missing.includes(k))).toEqual([]);

    // Select-all over one of them leaves the OTHER list entirely untickable, so the control that is
    // most likely to mix a selection is the one that provably cannot.
    const mode = selectionModeOf(rows, new Set(available));
    for (const key of missing) expect(docRowSelectable(rowAt(rows, key), mode)).toBe(false);
  });

  it("the count follows the LIVE button — each batch is empty for the other mode's selection", () => {
    const rows = mixed();

    const saving = new Set([HELD_PHOTO, HELD_PAPER]);
    expect(docDownloadBatch(rows, saving).map((t) => t.url)).toEqual(["https://x/front", "https://x/istimara"]);
    expect(batchDocumentRequest("eq-1", rows, saving)).toBeNull();

    const asking_ = new Set([MISSING_PHOTO, MISSING_PAPER]);
    expect(docDownloadBatch(rows, asking_)).toEqual([]);
    expect(docDraft(rows, asking_).labels).toHaveLength(2);
  });

  it("a row holding SEVERAL files contributes one target each, named apart", () => {
    const rows = equipmentDocGroups(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    ).flatMap((g) => g.rows);
    const batch = docDownloadBatch(rows, new Set([HELD_PAPER]));
    expect(batch.map((t) => t.url)).toEqual(["https://x/ist", "https://x/cus"]);
    // Two files of one row would otherwise land on disk under one name.
    expect(batch.map((t) => t.label.en)).toEqual(["Registration (Istimara) 1", "Customs card 2"]);
    expect(batch.map((t) => t.label.ar)).toEqual(["الاستمارة ١", "البطاقة الجمركية ٢"]);
  });

  it("a single-file row keeps the ROW's own name — nothing is numbered that has no sibling", () => {
    const rows = mixed();
    expect(docDownloadBatch(rows, new Set([HELD_PAPER])).map((t) => t.label.en)).toEqual([
      "Proof of ownership / registration",
    ]);
  });

  it("the download batch drops a ticked row that has no file, so its count cannot overstate", () => {
    const rows = equipmentDocGroups(machine({ docs: [{ type: "istimara", url: null }] }), NO_ASKS).flatMap(
      (g) => g.rows,
    );
    expect(docDownloadBatch(rows, new Set([HELD_PAPER]))).toEqual([]);
  });

  /* The rule from 850401f, re-asserted from the mode's side: it must not regress. */
  it("a request draft still names ONLY missing rows, however the selection was arrived at", () => {
    const rows = mixed();
    // Every row ticked at once — a state the UI refuses, which is exactly why the model is asked.
    const draft = docDraft(rows, new Set(rows.map((r) => r.key)));
    expect(draft.labels.map((l) => l.en)).toEqual(["Plate / serial", "TÜV certificate"]);
    for (const label of draft.labels) {
      expect(rows.filter((r) => r.label.en === label.en).every((r) => r.status === "missing")).toBe(true);
    }
  });
});

describe("attentionCount", () => {
  it("counts only rows whose status is missing", () => {
    expect(
      attentionCount([{ status: "present" }, { status: "missing" }, { status: "verified" }, { status: "on_file" }, { status: "missing" }]),
    ).toBe(2);
  });
});

describe("batchDocumentRequest — one request naming several types (AC-38)", () => {
  // `requestable` is not optional: the composer will not take a row that has not said whether it may be
  // asked for, which is what keeps the tick and the ask from being two rules (owner, 2026-08-08).
  const rows = [
    { key: "a", label: { en: "A", ar: "أ" }, docTypes: ["tuv"], requestable: true },
    { key: "b", label: { en: "B", ar: "ب" }, docTypes: ["istimara"], requestable: true },
    { key: "c", label: { en: "C", ar: "ج" }, docTypes: ["tuv"], requestable: true },
  ];

  it("is null when nothing is ticked, so the send control has one source of truth", () => {
    expect(batchDocumentRequest("eq-1", rows, new Set())).toBeNull();
  });

  it("emits ONE draft carrying every ticked type, deduped", () => {
    const draft = batchDocumentRequest("eq-1", rows, new Set(["a", "b", "c"]));
    expect(draft).toEqual({
      kind: "document",
      equipmentId: "eq-1",
      docTypes: ["tuv", "istimara"],
      labels: [rows[0].label, rows[1].label, rows[2].label],
    });
  });

  /* A test here asserted that a `"company"` scope nulled the equipmentId, because company papers
   * belong to the firm. The product owner withdrew the company-scope document request on 2026-08-08 —
   * a document request names a machine — so the `scope` parameter is gone, the id is non-nullable, and
   * the test is deleted rather than inverted. The company panel's ticks came back later the same day —
   * for a batch **download**, not an ask (AC-72) — and are covered at the bottom of this file; nothing
   * about the composer changed with them. See `CompanyPanel.tsx`. */

  it("never emits the retired `add_to_offer` kind", () => {
    const draft = batchDocumentRequest("eq-1", rows, new Set(["a"]));
    expect(draft?.kind).toBe("document");
  });

  it("drops a ticked row that is not requestable — the tick and the ask cannot disagree", () => {
    const mixed = [{ ...rows[0], requestable: false }, { ...rows[1], requestable: true }];
    const draft = batchDocumentRequest("eq-1", mixed, new Set(["a", "b"]));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["istimara"]);
  });

  it("is null when every ticked row is unrequestable, so an empty ask cannot be composed", () => {
    const none = rows.map((r) => ({ ...r, requestable: false }));
    expect(batchDocumentRequest("eq-1", none, new Set(["a", "b", "c"]))).toBeNull();
  });
});

/* ────────────────────────── company documents (V9) ────────────────────────── */

describe("companyDocRows — verification AND expiry, unlike the equipment rows (AC-40)", () => {
  it("carries CR, VAT, national address, local content and SASO", () => {
    expect(COMPANY_DOC_KEYS).toEqual(["cr", "vat", "national_address", "local_content", "saso"]);
  });

  // `local_content` and `saso` are HELD CERTS, not catalogue documents — the reason a renter's
  // request naming either was refused until V14 gave them catalogue keys. A renter verifying a firm
  // does not care which table a paper is stored in, so both belong in this list.
  it("lists the two held certs beside the three catalogue papers", () => {
    expect(COMPANY_DOC_KEYS).toContain("local_content");
    expect(COMPANY_DOC_KEYS).toContain("saso");
  });

  it("labels SASO with the backend's own Arabic — one paper must not read as two", () => {
    const saso = companyDocRows({ verified: true, docs: {} }).find((r) => r.key === "saso")!;
    expect(saso.label.en).toBe("SASO registration");
    expect(saso.label.ar).toBe("تسجيل ساسو");
  });

  it("carries NO IBAN row — the product owner removed it, so the spec (§6.1 / AC-41) is now wrong", () => {
    const rows = companyDocRows({ verified: true, docs: { cr: { present: true } } });
    const text = JSON.stringify(rows).toLowerCase();
    expect(text).not.toContain("iban");
    expect(text).not.toContain("bank");
    expect(COMPANY_DOC_KEYS).not.toContain("iban" as never);
  });

  it("reads a missing paper as needing action, with 'no document yet'", () => {
    const rows = companyDocRows({ verified: true, docs: {} });
    expect(rows.every((r) => r.status === "missing")).toBe(true);
    expect(rows[0].statusLine.en).toBe("no document yet");
    // Reads the array's length rather than a literal, so a sixth paper does not fail an unrelated
    // assertion — the claim is "every missing paper needs action", not "there are five of them".
    expect(attentionCount(rows)).toBe(COMPANY_DOC_KEYS.length);
  });

  it("says VERIFIED for a paper on a verified firm's file, and 'on file' otherwise", () => {
    expect(companyDocRows({ verified: true, docs: { cr: { present: true } } })[0].statusLine.en).toBe("verified");
    expect(companyDocRows({ verified: false, docs: { cr: { present: true } } })[0].statusLine.en).toBe("on file");
  });

  it("renders an expiry when one is known", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: "2027-03-12" } } })[0];
    expect(row.statusLine.en).toContain("valid until");
    expect(row.statusLine.en).toContain("2027");
  });

  it("renders 'renews annually' instead when the paper has no fixed expiry", () => {
    const rows = companyDocRows({ verified: true, docs: { vat: { present: true, renewsAnnually: true } } });
    expect(rows.find((r) => r.key === "vat")?.statusLine.en).toBe("verified · renews annually");
  });

  it("prints no expiry clause at all when the payload carries none — never 'valid until null'", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: null } } })[0];
    expect(row.statusLine.en).toBe("verified");
  });

  it("ignores an unparseable expiry rather than printing it raw", () => {
    const row = companyDocRows({ verified: true, docs: { cr: { present: true, expiryDate: "not-a-date" } } })[0];
    expect(row.statusLine.en).toBe("verified");
  });
});

/* ───────── the company panel's selection — ticks that DOWNLOAD, never ask (AC-72) ───────── */

/**
 * The panel lost its ticks on 2026-08-08 with the company-scope request, and got them back the same day
 * for a different verb: a renter wants a firm's CR **and** its VAT certificate, and select-all is the
 * thing that stops him clicking five rows one at a time.
 *
 * The two claims below are the whole of it. **What the batch covers** — the ticked rows that have a url,
 * never one more — because a control that saves four of the five files it counted is the failure a batch
 * "view" would have been (five `window.open`s, four blocked). And **no request control**, which is the
 * half that did not come back: `CompanyPanel` has no `onRequest` prop, and a company row still carries
 * no requestable document types for one to name.
 */
describe("the company panel's batch — download, and only over rows with a file (AC-69, AC-72)", () => {
  const withUrls = (keys: CompanyDocKey[]) =>
    companyDocRows({
      verified: true,
      docs: Object.fromEntries(
        COMPANY_DOC_KEYS.map((k) => [k, { present: keys.includes(k), downloadUrl: keys.includes(k) ? `https://x/${k}.pdf` : null }]),
      ),
    });

  it("supplies selection: every row carrying a url may be ticked", () => {
    const rows = withUrls([...COMPANY_DOC_KEYS]);
    expect(companySelectableKeys(rows)).toEqual(COMPANY_DOC_KEYS);
  });

  it("a row with NO url is not selectable — a tick that saves nothing is a dead control", () => {
    const rows = withUrls(["cr", "vat"]);
    expect(companySelectableKeys(rows)).toEqual(["cr", "vat"]);
    // The three papers the firm has not filed are still LISTED — they are just not tickable.
    expect(rows).toHaveLength(COMPANY_DOC_KEYS.length);
    expect(rows.filter((r) => !r.downloadUrl).map((r) => r.key)).toEqual(["national_address", "local_content", "saso"]);
  });

  it("a paper present but url-less (an unsigned key) is listed and still not selectable", () => {
    const rows = companyDocRows({ verified: true, docs: { cr: { present: true } } });
    expect(rows.find((r) => r.key === "cr")?.statusLine.en).toBe("verified");
    expect(companySelectableKeys(rows)).toEqual([]);
  });

  it("the batch covers EXACTLY the selected rows that have urls — in the list's order", () => {
    const rows = withUrls(["cr", "vat", "saso"]);
    const batch = companyDownloadBatch(rows, new Set(["saso", "cr", "national_address"]));
    expect(batch.map((t) => t.key)).toEqual(["cr", "saso"]);
    expect(batch.map((t) => t.url)).toEqual(["https://x/cr.pdf", "https://x/saso.pdf"]);
    expect(batch.map((t) => t.label.en)).toEqual(["Commercial registration", "SASO registration"]);
  });

  it("a tick that survived a row losing its url drops out of the batch, so the count cannot overstate", () => {
    const before = withUrls(["cr", "vat"]);
    const selected = new Set(companySelectableKeys(before));
    expect(companyDownloadBatch(before, selected)).toHaveLength(2);
    // Same selection, a payload where VAT is no longer signed: the batch shrinks with it.
    expect(companyDownloadBatch(withUrls(["cr"]), selected).map((t) => t.key)).toEqual(["cr"]);
  });

  it("selecting nothing yields an empty batch, so the send control has one source of truth", () => {
    expect(companyDownloadBatch(withUrls([...COMPANY_DOC_KEYS]), new Set())).toEqual([]);
  });

  it("names each saved file after the row the renter read, keeping the url's extension", () => {
    expect(companyDownloadFileName("Commercial registration", "https://s3/x/abc-123.pdf?sig=1")).toBe(
      "Commercial registration.pdf",
    );
    expect(companyDownloadFileName("السجل التجاري", "https://s3/x/abc-123.PNG")).toBe("السجل التجاري.png");
  });

  it("omits the extension rather than guessing one — a wrong extension opens the wrong app", () => {
    expect(companyDownloadFileName("VAT certificate", "https://s3/x/abc-123?sig=1")).toBe("VAT certificate");
  });

  it("never lets a label become a path — a batch writes files, and '/' is not a name", () => {
    expect(companyDownloadFileName("CR / VAT", "https://s3/x/a.pdf")).toBe("CR VAT.pdf");
  });

  /* The load-bearing half of the reversal, unchanged: the ticks are back, the ASK is not. */
  it("carries NO request control: no company row names a requestable document type", () => {
    for (const row of companyDocRows({ verified: true, docs: { cr: { present: true, downloadUrl: "https://x/cr.pdf" } } })) {
      expect(row).not.toHaveProperty("docTypes");
    }
  });

  it("exports a download path and no request path — a tick feeds nothing else", () => {
    expect(Object.keys(companyDownloadBatch(withUrls(["cr"]), new Set(["cr"]))[0]).sort()).toEqual([
      "key",
      "label",
      "url",
    ]);
    const exported = Object.keys(companyPanelModule);
    expect(exported).toContain("CompanyPanel");
    // V8 takes an `onRequest` and composes a `PanelRequestDraft`; V9 has no such thing to export, and
    // this is the assertion that fails the day somebody re-adds one.
    expect(exported.filter((n) => /request|ask|compose/i.test(n))).toEqual([]);
  });
});
