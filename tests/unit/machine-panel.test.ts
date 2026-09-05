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
 *
 * **One section at the foot reads SOURCE rather than calling a function** — the four findings of the
 * owner's UAT of 2026-08-11 that are rendering rules (the tab's name, the frame's removed X, the cell
 * that presses, the row's removed arrow). They have no model to interrogate, and each is the other half
 * of a model rule asserted above; the technique is `availability-chip.test.ts`'s.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapFleet, type FleetMachine } from "@/lib/contract/fleet";
import { computeUnitReadiness, readinessInputsFor } from "@/lib/contract/bid-readiness";
// The company panel's *decisions* are pure functions exported beside the component — which rows may be
// ticked, what a batch covers, what each saved file is called. Imported as a namespace as well, because
// "this module exports no request path" is itself one of the claims (RM3-AC-72).
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
  companyInitials,
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
  type MatchCell,
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

describe("matchGrid — six cells, in the spec's order (RM3-AC-36)", () => {
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

  it("every cell states an actual finding — never a bare tick (RM3-AC-37)", () => {
    for (const c of matchGrid(machine({ photos: ALL_FOUR }), { reqEquipmentCerts: ["tuv"] })) {
      expect(c.finding.en.trim().length).toBeGreaterThan(3);
      expect(c.finding.ar.trim().length).toBeGreaterThan(3);
      expect(["green", "grey", "red"]).toContain(c.state);
    }
  });
});

/* ─── ONE SENTENCE SHAPE PER CASE (owner, UAT of 2026-08-11) ───────────────────────────────────────
 *
 * *"Some use 'no year asked for' while some 'none requested' or '1 asked for' — use consistent
 * wording."* Every phrase was already the app's; the SHAPE each cell wrapped them in was not shared, so
 * six cells answered one question six ways. Four shapes now, and every cell builds its finding out of
 * them:
 *
 *   1 · asked + held (green)      `{thing} — on the unit's file`
 *   2 · asked + missing (red)     `Missing {thing}`   (+ ` — {what the file holds}`, the year only)
 *   3 · not asked, but a fact     `{thing} — not requested`
 *   4 · nothing asked at all      `none requested`
 *
 * The block below is the shape's own test — it walks the whole grid over several machines and requests
 * and refuses any finding that is not one of the four. It is what catches a seventh phrasing arriving
 * in a cell somebody edited in isolation, which is exactly how the six grew apart.
 */
describe("every finding on the grid is one of four shapes", () => {
  const SHAPES = [
    /^.+ — on the unit's file$/, // 1
    /^Missing(?: .+)?$/, //         2
    /^.+ — not requested$/, //      3
    /^none requested$/, //          4
    // The `{thing}` is dropped when the cell's LABEL already names it — proof of ownership, in both
    // states (`Missing` alone is already shape 2's optional half).
    /^on the unit's file$/,
    // The attachments cell is shape 1 carrying the one verdict it can give: the platform records no
    // attachment, so it says so rather than pretending to have checked. See `attachmentsCell`.
    /^\d+ requested — not recorded on the unit's file$/,
  ];
  const AR_SHAPES = [
    /^.+ — موجودة في ملف الوحدة$/,
    /^مفقود(?:: .+)?$/,
    /^.+ — لم يُطلب$/,
    /^لم يُطلب شيء$/,
    /^موجودة في ملف الوحدة$/,
    /^[0-9]+ مطلوبة — غير مسجّلة في ملف الوحدة$/,
  ];
  const machines = [
    machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }),
    machine({ photos: [{ slot: "front" }], docs: [] }),
    machine({ photos: [], docs: [], year: null, manufacturer: null }),
  ];
  const requests: MatchRequest[] = [
    {},
    { reqMinYear: 2020, reqEquipmentCerts: ["tuv", "spsp"], operatorCertReq: "tuv", attachmentIds: ["a1"] },
    { reqMinYear: 2020, reqEquipmentCerts: ["tuv"], operatorCertReq: "tuv" },
  ];

  it("matches one of the four in English, on every cell of every combination", () => {
    for (const m of machines) {
      for (const r of requests) {
        for (const c of matchGrid(m, r)) {
          expect(SHAPES.some((s) => s.test(c.finding.en))).toBe(true);
        }
      }
    }
  });

  it("matches one of the four in Arabic too — the shape is not an English-only tidy-up", () => {
    for (const m of machines) {
      for (const r of requests) {
        for (const c of matchGrid(m, r)) {
          expect(AR_SHAPES.some((s) => s.test(c.finding.ar))).toBe(true);
        }
      }
    }
  });

  /** The symptom in the owner's own words: three ways to say "nobody asked", on one screen. */
  it("says «nobody asked» exactly one way across the whole grid", () => {
    const findings = matchGrid(machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }] }), {}).map((c) => c.finding);
    for (const gone of ["no year asked for", "no attachments required", "asked for", "not required"]) {
      expect(findings.filter((f) => f.en.includes(gone))).toEqual([]);
    }
    // What survives is «not requested» for a cell with a fact, «none requested» for a whole category.
    expect(findings.filter((f) => /not requested$/.test(f.en)).length).toBeGreaterThan(0);
    expect(findings.filter((f) => f.en === "none requested").length).toBeGreaterThan(0);
  });

  /** *"For TÜV or any field that doesn't match your request and is red, show wording like 'Missing
   *  TUV' instead of the current sentence."* — applied to EVERY red cell, not only the certificates. */
  it("leads every red cell with «Missing», whichever cell it is", () => {
    const m = machine({ photos: [], docs: [], year: 2016 });
    const red = matchGrid(m, { reqMinYear: 2020, reqEquipmentCerts: ["tuv"], operatorCertReq: "spsp" }).filter(
      (c) => c.state === "red",
    );
    // The year, the photos, the ownership, both cert cells — five reds, and not one of them says «not
    // on the unit's file» first.
    expect(red.map((c) => c.key)).toEqual(["year_make", "photos", "ownership", "equipment_cert", "operator_cert"]);
    for (const c of red) {
      expect(c.finding.en.startsWith("Missing")).toBe(true);
      expect(c.finding.ar.startsWith("مفقود")).toBe(true);
    }
  });
});

describe("year & manufacturer", () => {
  it("greys when the request asked for no year — a cell nobody asked about cannot fail", () => {
    const c = cellsBy(machine({ year: 2011 }), {}).year_make;
    expect(c.state).toBe("grey");
    // ~~"no year asked for"~~ — one of the three spellings of "nobody asked" the owner read side by
    // side on 2026-08-11. Shape 3, which is now the only way this grid says it about one thing.
    expect(c.en).toBe("2011 · Caterpillar — not requested");
    expect(c.ar).toBe("2011 · Caterpillar — لم يُطلب");
  });

  it("still states what the file holds when nobody asked — a grey cell must not waste the row", () => {
    const c = cellsBy(machine({ year: null, manufacturer: null }), {}).year_make;
    expect(c.state).toBe("grey");
    // Nothing on the file and nothing asked: the app's absence phrase as the subject, shape 3's tail.
    expect(c.en).toBe("not on the unit's file — not requested");
  });

  it("greens when the machine meets the asked-for year, and names the year and the maker", () => {
    const c = cellsBy(machine({ year: 2022 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("green");
    expect(c.en).toContain("2022");
    expect(c.en).toContain("Caterpillar");
  });

  // ~~The conflict clause is the APP's, `bidReadinessYearConflict` — "Below the required year {min}" /
  // «أقدم من الحد الأدنى المطلوب {min}» (app_en.arb:5295 · app_ar.arb:3613).~~ Superseded by the UAT of
  // 2026-08-11: it was the one finding on the grid that stated a MISMATCH rather than an absence, so it
  // could not lead with «Missing» like every other red. The required year is not lost — it is what red
  // now names as missing, and the unit's own year follows it as shape 2's tail.
  it("reds when the machine is older than the asked-for year, and says what was asked AND what it is", () => {
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    expect(c.en).toBe("Missing 2020 or newer — 2016 · Caterpillar");
    expect(c.ar).toBe("مفقود: 2020 أو أحدث — 2016 · Caterpillar");
  });

  it("reds when a year was asked for and the machine's file carries none", () => {
    const c = cellsBy(machine({ year: null }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("red");
    // Same head, and the tail is `bidReadinessDocMissing` (app_en.arb:5436 · app_ar.arb:3642) — the
    // app's one phrase for a file that holds nothing.
    expect(c.en).toBe("Missing 2020 or newer — not on the unit's file");
  });

  // The app's satisfied cell is `'${year} · $make'` and stops there (`bid_readiness_sheets.dart:1128`)
  // — there is no "· meets 2020 or newer" in it, and the ✓ is what says the check passed. The verdict
  // clause the UAT added is not a clause of approval: it is shape 1's tail, which every green cell on
  // the grid now carries, and it says where the fact came from rather than that it passed.
  it("states the bare fact when the year is met — no clause of approval", () => {
    const c = cellsBy(machine({ year: 2022 }), { reqMinYear: 2020 }).year_make;
    expect(c.state).toBe("green");
    expect(c.en).toBe("2022 · Caterpillar — on the unit's file");
    expect(c.en).not.toContain("meets");
  });

  it("does not treat an AGE requirement as a year — `computeUnitReadiness` already ruled on that", () => {
    // reqMinYear can be a max-age (e.g. 5). It must not read as "built in year 5".
    const c = cellsBy(machine({ year: 2016 }), { reqMinYear: 5 }).year_make;
    expect(c.state).toBe("grey");
  });
});

describe("attachments — grey by decision, never red", () => {
  // ~~The phrase is the app's `bidReadinessNoAttachmentsRequired` (app_en.arb:5304 · app_ar.arb:3614) —
  // the ONLY thing the app's attachments cell ever prints.~~ Replaced by the grid's shared shape 4 on
  // 2026-08-11: it is the app's phrase too (`bidReadinessNoneRequested`), and this cell saying
  // "no attachments required" while the cert cell beside it said "none requested" is half of what the
  // owner was reading. The colour still differs from the app's: it bands this green, this grid keeps
  // grey, deliberately (see `MatchCellState`).
  it("greys with the grid's one «nothing was asked» phrase when the request asked for none", () => {
    const c = cellsBy(machine(), {}).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toBe("none requested");
    expect(c.ar).toBe("لم يُطلب شيء");
  });

  it("stays grey when the request DID ask, because a fleet row carries no attachment record", () => {
    // Red here would mark every machine on the platform as failing a check that was never run —
    // `FleetMachine` has no attachments field, and `bids.ts` hard-codes the same term grey. The owner
    // confirmed the colour on the same screenshot: *"1 asked but in grey, which is correct."*
    const c = cellsBy(machine(), { attachmentIds: ["a1", "a2"], customAttachments: ["ripper"] }).attachments;
    expect(c.state).toBe("grey");
    expect(c.en).toBe("3 requested — not recorded on the unit's file");
    expect(c.ar).toBe("3 مطلوبة — غير مسجّلة في ملف الوحدة");
    // Grey never says «Missing»: a cell the platform did not score cannot report a gap.
    expect(c.en).not.toContain("Missing");
  });

  it("ignores blank attachment entries when counting", () => {
    const c = cellsBy(machine(), { attachmentIds: ["a1", "  "], customAttachments: [""] }).attachments;
    expect(c.en).toContain("1 requested");
  });
});

// Scored on the REQUIRED slots — front + plate — since the owner ruled on 2026-08-08 that this cell
// follows the documents group. Before that, a machine carrying both mandatory shots and no meter photo
// read "nothing outstanding" in the documents tab and red "2 of 4 uploaded" here, on one screen.
describe("equipment photos — the fraction, over the slots the lessor is actually held to", () => {
  it("greens on the two REQUIRED slots, whether or not the optional two were uploaded", () => {
    const both = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }] }), {}).photos;
    expect(both.state).toBe("green");
    // The count, in shape 1 — the cell the owner pointed at when he asked for a cell to open its
    // evidence: *"clicking on any document field here, like '2 of 2 unit photos'"*.
    expect(both.en).toBe("2 of 2 — on the unit's file");
    expect(both.ar).toBe("2 من 2 — موجودة في ملف الوحدة");
    // All four reads the same: the optional shots are not a higher score, they are simply optional.
    const all = cellsBy(machine({ photos: ALL_FOUR }), {}).photos;
    expect(all.state).toBe("green");
    expect(all.en).toBe("2 of 2 — on the unit's file");
  });

  it("does not fail a machine for a shot nobody requires", () => {
    // front + plate + side, no meter. The old rule called this "3 of 4" and red.
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "serial" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("green");
  });

  // ~~"says which fraction is short"~~ — it names the SHOT now (owner, UAT of 2026-08-11). A count in
  // a red cell left the renter to work out which of the two shots was the missing one by opening the
  // other tab; the slot's own name is the answer, and it is the same `PHOTO_LABEL` that heads the row
  // over there. The fraction is what green states.
  it("reds when a REQUIRED shot is missing, and NAMES the shot", () => {
    const c = cellsBy(machine({ photos: [{ slot: "front" }, { slot: "equipment" }] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("Missing Plate / serial");
    expect(c.ar).toBe("مفقود: اللوحة والرقم التسلسلي");
  });

  it("reds at none, and names both rather than omitting the cell", () => {
    const c = cellsBy(machine({ photos: [] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.en).toBe("Missing Front · Plate / serial");
    expect(c.ar).toBe("مفقود: أمامية · اللوحة والرقم التسلسلي");
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
    // `bidReadinessDocOnFile` (app_en.arb:8719 · app_ar.arb:6236) — the app's noun is the UNIT's file.
    expect(c.en).toBe("on the unit's file");
    expect(c.ar).toBe("موجودة في ملف الوحدة");
  });

  it("reds when it does not — the paper reaches the renter now, so an absence is a real gap", () => {
    // An earlier revision made this grey, on the premise that `RENTEE_HIDDEN_DOC_TYPES` strips
    // ownership papers before they reach this client. That filter guards the BID's projection only —
    // the map's fleet rows this panel reads carry the papers unstripped (owner's ruling 2026-08-10) —
    // so a missing one is the supplier's omission: actionable, and requestable from the documents tab.
    // (`bid-readiness.ts` still excludes it from the readiness SCORE; a band, not visibility.)
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), {}).ownership;
    expect(c.state).toBe("red");
    // ~~`bidReadinessDocMissing`, plus the one clause the app has no equivalent for — the renter can ask
    // for it from here.~~ Both withdrawn by the UAT of 2026-08-11: the absence leads, and no other red
    // cell ends in an instruction. The act is still one press away, on the documents tab.
    //
    // **The `{thing}` is dropped here and only here** — the cell's label IS the paper's name, so
    // «Missing Proof of Ownership» under a heading reading "Proof of Ownership" prints it twice. It
    // therefore says exactly what the documents tab's row says about the same absence.
    expect(c.en).toBe("Missing");
    expect(c.ar).toBe("مفقود");
    expect(c.en).not.toContain("you can ask");
  });
});

describe("certificates — grey when unasked, red when asked and missing", () => {
  it("greys the equipment cert when the request asked for none", () => {
    const c = cellsBy(machine(), {}).equipment_cert;
    expect(c.state).toBe("grey");
    // `bidReadinessNoneRequested` (app_en.arb:5312 · app_ar.arb:3616) — the app's phrase for a category
    // nobody asked about. (The app bands it green; this grid keeps grey — see `MatchCellState`.)
    expect(c.en).toBe("none requested");
    expect(c.ar).toBe("لم يُطلب شيء");
  });

  it("greens when every asked-for equipment cert is on the file", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }, { type: "spsp" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("green");
    expect(c.en).toContain("on the unit's file");
    expect(c.ar).toContain("موجودة في ملف الوحدة");
  });

  it("reds and names ONLY the missing one", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(c.state).toBe("red");
    // The owner's own example of the red shape (UAT of 2026-08-11): «TÜV — غير موجودة في ملف الوحدة»
    // became «مفقود: TÜV». A cell that also listed the certificate the file DOES hold would bury the gap
    // it exists to report, which is why only the missing one is named — that half is unchanged.
    expect(c.en).toBe("Missing SPSP");
    expect(c.ar).toBe("مفقود: SPSP");
    expect(c.en).not.toContain("TÜV");
  });

  it("greys operator certs when the request declared no operator licence level", () => {
    expect(cellsBy(machine(), { operatorCertReq: null }).operator_cert.state).toBe("grey");
  });

  it("reds operator certs the request asked for and the machine does not hold", () => {
    const c = cellsBy(machine({ docs: [{ type: "tuv" }] }), { operatorCertReq: "spsp" }).operator_cert;
    expect(c.state).toBe("red");
  });
});

/* ─── a cell opens its evidence (owner, UAT of 2026-08-11) ────────────────────────────────────────
 *
 * *"Clicking on any document field here, like '2 of 2 unit photos', will take them to the document."*
 * The model resolves WHICH document, out of the documents tab's own rows; `EquipmentDetail` puts it in
 * the frame. The rule that matters is the negative one — **only a green cell carries evidence** — since
 * that is what keeps a red cell from opening some other paper of the same family as if it were the one
 * the finding named, and what keeps a cell with nothing to show from being a dead control.
 */
describe("only a green cell opens its evidence", () => {
  const cellsOf = (m: FleetMachine, r: MatchRequest) =>
    Object.fromEntries(matchGrid(m, r).map((c) => [c.key, c])) as Record<MatchCellKey, MatchCell>;

  it("hands the photos cell the front shot, as a PHOTO", () => {
    const c = cellsOf(machine({ photos: [{ slot: "front" }, { slot: "serial" }] }), {}).photos;
    expect(c.state).toBe("green");
    expect(c.evidence).toEqual({
      key: "photo:front",
      label: { en: "Front", ar: "أمامية" },
      url: "https://x/front",
      kind: "photo",
    });
  });

  it("hands the ownership and certificate cells their paper, as a PAPER", () => {
    const cells = cellsOf(machine({ docs: [{ type: "istimara" }, { type: "tuv" }] }), { reqEquipmentCerts: ["tuv"] });
    // The ownership cell's evidence is the first of the FOUR ownership rows that holds a file (owner,
    // 2026-08-12 — one row per paper, one point in the fraction). Here that is the istimara.
    expect(cells.ownership.evidence).toMatchObject({
      key: "doc:ownership:istimara",
      url: "https://x/istimara",
      kind: "paper",
    });
    expect(cells.equipment_cert.evidence).toMatchObject({ key: "doc:equipment_cert:tuv", kind: "paper" });
  });

  /** The frame marks the row the renter would have pressed on the other tab, so the two surfaces cannot
   *  disagree about which paper a finding stands for. That is one key, resolved once. */
  it("names the DOCUMENTS TAB's own row, key for key", () => {
    const m = machine({ photos: [{ slot: "front" }, { slot: "serial" }], docs: [{ type: "istimara" }] });
    const rowKeys = equipmentDocGroups(m, {}).flatMap((g) => g.rows.map((r) => r.key));
    for (const c of matchGrid(m, {})) {
      if (c.evidence) expect(rowKeys).toContain(c.evidence.key);
    }
  });

  it("gives a RED cell none — a finding about an absence has nothing to open", () => {
    // Front is on the file and the plate shot is not, so this cell is red WITH a real photo behind it:
    // the case where opening "the first file of the family" would show evidence for a sentence the cell
    // did not write.
    const c = cellsOf(machine({ photos: [{ slot: "front" }] }), {}).photos;
    expect(c.state).toBe("red");
    expect(c.evidence).toBeNull();
    // Same for a half-held certificate cell: TÜV is on the file, the finding is about the SPSP.
    const cert = cellsOf(machine({ docs: [{ type: "tuv" }] }), { reqEquipmentCerts: ["tuv", "spsp"] }).equipment_cert;
    expect(cert.state).toBe("red");
    expect(cert.evidence).toBeNull();
  });

  it("gives a GREY cell none — nothing was scored, so nothing was read", () => {
    // The machine holds a TÜV; the request asked for no certificate at all.
    const cells = cellsOf(machine({ docs: [{ type: "tuv" }], year: 2011 }), {});
    expect(cells.equipment_cert.state).toBe("grey");
    expect(cells.equipment_cert.evidence).toBeNull();
    expect(cells.year_make.evidence).toBeNull();
    expect(cells.attachments.evidence).toBeNull();
  });

  it("gives a green cell none when the projection carried the paper but not its link", () => {
    // A real state (`url: null`) and the one that would produce a control opening nothing.
    const c = cellsOf(machine({ docs: [{ type: "istimara", url: null }] }), {}).ownership;
    expect(c.state).toBe("green");
    expect(c.evidence).toBeNull();
  });

  it("never points at a file the documents tab does not offer", () => {
    // An operator paper is the family with no file by ruling; it must not reach the frame through a
    // cell either. Nothing on this grid may resolve to a url no row on the other tab exposes.
    const m = machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "operator_tuv" }] });
    const request = asking(["tuv"], "tuv");
    const rowUrls = equipmentDocGroups(m, request).flatMap((g) => g.rows.flatMap((r) => r.files.map((f) => f.url)));
    for (const c of matchGrid(m, request)) {
      if (c.evidence) expect(rowUrls).toContain(c.evidence.url);
    }
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

/* ────────────── V8 — the document groups (§6.6, RM3-AC-38, RM3-AC-39, RM3-AC-42) ──────────────
 *
 * The platform's one rule (owner, 2026-08-08), applied to photos, ownership and equipment certs alike —
 * and since the owner's UAT of 2026-08-11 there is nothing else on this tab for it to be applied to:
 *
 *   required + held    → shown, green, openable
 *   required + absent  → RED, counted, requestable
 *   not required + held→ shown, openable, NO verdict, NOT counted, NOT requestable
 *   not required + absent → no row at all
 *
 * Required = front photo · plate/serial photo · proof of ownership (all three from the supplier's own
 * scorer, `bid_readiness.dart`) + every cert THIS request asked for.
 *
 * **The operator's group is gone** — *"operator will not be viewed in the document section at all —
 * only in the equipment field, as its cert exists or not."* It kept its own describe blocks here for
 * every act it refused to take part in; they are now one block asserting that no operator row reaches
 * this tab by any door, plus the match-grid cell that carries the surviving statement.
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

/* The papers, read as one set.

   The tab carries TWO paper groups since 2026-08-17 — «إثبات الملكية» and «الشهادات», app parity. The
   split changed which HEADING a row sits under; it did not change which rows exist, nor how many of
   them need action. So assertions about rows read both groups as one, and the split itself is pinned
   by its own tests above rather than by rewriting twenty-five row lookups into whichever group each
   happens to land in. */
const papers = (g: Record<string, DocGroup>): DocRow[] => [...(g.ownership?.rows ?? []), ...(g.certificates?.rows ?? [])];
const paperAttention = (g: Record<string, DocGroup>): number =>
  (g.ownership?.attention ?? 0) + (g.certificates?.attention ?? 0);

describe("equipmentDocGroups — the groups, and each one's own attention count (RM3-AC-42)", () => {
  it("splits photos, ownership and certificates, and never merges the counts", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    /* THREE groups, all the machine's (app parity, 2026-08-17). ~~TWO.~~ Ownership left the single
       "Equipment documents" heading: it is what the platform requires of every machine and answers
       "is this really his to rent", which is a different question from "does it carry the
       certificates this request asked for".

       The operator's group is still gone — it left on 2026-08-11 — and the `operator_tuv` this
       machine holds raises no row in any of the three that remain. */
    expect(groups.map((g) => g.key)).toEqual(["photos", "ownership", "certificates"]);
  });

  it("files each paper under the heading it belongs to", () => {
    const g = groupBy(
      machine({ docs: [{ type: "istimara" }, { type: "tuv" }, { type: "spec_sheet" }] }),
      asking(["tuv"]),
    );
    // Ownership rows are the four the platform names, plus any ownership paper naming none of them.
    expect(g.ownership.rows.every((r) => r.key.startsWith("doc:ownership"))).toBe(true);
    // Certificates carry the asked-for certs AND the papers that belong to no named row — the app
    // files both under one heading rather than inventing a third for the leftovers.
    expect(g.certificates.rows.map((r) => r.key)).toContain("doc:equipment_cert:tuv");
    expect(g.certificates.rows.map((r) => r.key)).toContain("doc:other:spec_sheet");
  });

  it("counts each group's own attention separately, so one heading cannot hide the other's gap", () => {
    // Every ownership paper missing, the asked-for certificate on the file.
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv"]));
    expect(g.ownership.attention).toBe(1);
    expect(g.certificates.attention).toBe(0);
  });

  it("counts ROWS NEEDING ACTION, never totals", () => {
    const g = groupBy(machine({ photos: [{ slot: "front" }], docs: [{ type: "tuv" }] }), asking(["tuv"], "spsp"));
    expect(g.photos.attention).toBe(1); // the plate shot, and nothing else — meter and side are not required
    expect(paperAttention(g)).toBe(1); // ownership; the asked-for TÜV is on the file
    // The asked-for operator SPSP is missing and is counted NOWHERE here — it is the match grid's
    // operator cell that reports it, which is the whole of the 2026-08-11 ruling.
    expect(groupBy(machine({ photos: [{ slot: "front" }], docs: [{ type: "tuv" }] }), asking(["tuv"], "spsp")).operator).toBeUndefined();
  });

  it("reports zero attention when everything required is on the file", () => {
    const groups = equipmentDocGroups(
      machine({ photos: ALL_FOUR, docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv"),
    );
    // Two counts, both numbers. ~~`[0, 0, null]`~~ — the `null` was the operator's group saying "I make
    // no attention claim", and there is no group left that can say it.
    expect(groups.map((g) => g.attention)).toEqual([0, 0, 0]);
  });

  it("does not call a spec sheet an equipment safety certificate — it calls it a spec sheet", () => {
    const g = groupBy(machine({ docs: [{ type: "spec_sheet" }, { type: "other" }] }), asking(["tuv"]));
    const cert = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(cert.status).toBe("missing");
    expect(papers(g).find((r) => r.key === "doc:other:spec_sheet")?.label.en).toBe("Spec sheet");
  });

  it("shows PRESENCE ONLY — never a verification badge or an expiry (RM3-AC-39, §6.6)", () => {
    // The wire carries both fields. Nothing may render them here: a badge invites the renter to judge
    // a supplier on a state the platform sets.
    const groups = equipmentDocGroups(
      machine({ docs: [{ type: "tuv", verifyStatus: "verified", expiryDate: "2027-03-12" }] }),
      asking(["tuv"]),
    );
    const row = groups.flatMap((g) => g.rows).find((r) => r.key === "doc:equipment_cert:tuv");
    expect(row?.statusLine.en).toBe("on the unit's file");
    const text = JSON.stringify(groups);
    for (const leak of ["verified", "failed", "2027", "expiry", "valid until"]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  // The vocabulary is the APP's for what is HELD — `bidReadinessDocOnFile`, which is what `_rowShell`
  // (`bid_readiness_sheets.dart:2681-2684`) says for a photo row and a certificate row alike. What is
  // ABSENT says «مفقود», the match grid's word for the same absence (owner, UAT of 2026-08-11: *"same
  // wording as the equipment tab for a missing document"*), where it used to say the app's
  // `bidReadinessDocMissing`. The "· not requested" tail is the one thing here the app has no word for:
  // it renders no unrequested row at all.
  it("uses ONE vocabulary, and it is the match grid's", () => {
    const groups = equipmentDocGroups(machine({ photos: ALL_FOUR, docs: [{ type: "tuv" }] }), NO_ASKS);
    for (const line of groups.flatMap((g) => g.rows.map((r) => r.statusLine.en))) {
      expect(["on the unit's file", "Missing", "on the unit's file · not requested"]).toContain(line);
    }
    for (const line of groups.flatMap((g) => g.rows.map((r) => r.statusLine.ar))) {
      expect(["موجودة في ملف الوحدة", "مفقود", "موجودة في ملف الوحدة · لم يُطلب"]).toContain(line);
    }
  });

  /**
   * Given the request asked for a TÜV and the machine's file carries none, When the renter reads the
   * documents tab and then the equipment tab, Then both describe the absence with the same word.
   *
   * The owner's UAT of 2026-08-11: *"same wording as the equipment tab for a missing document."* The
   * two are not the same STRING — the row's own title already names the paper six pixels above its
   * status line, and the cell has no title of its own to lean on — so the row says «مفقود» and the cell
   * says «مفقود: TÜV». What must never differ again is the word.
   */
  it("says the same word about one absence on both tabs", () => {
    const m = machine({ photos: ALL_FOUR, docs: [] });
    const row = equipmentDocGroups(m, asking(["tuv"]))
      .flatMap((g) => g.rows)
      .find((r) => r.key === "doc:equipment_cert:tuv")!;
    const cell = cellsBy(m, asking(["tuv"])).equipment_cert;
    expect(row.statusLine.en).toBe("Missing");
    expect(cell.en).toBe("Missing TÜV");
    expect(cell.en.startsWith(row.statusLine.en)).toBe(true);
    expect(row.statusLine.ar).toBe("مفقود");
    expect(cell.ar).toBe("مفقود: TÜV");
    expect(cell.ar.startsWith(row.statusLine.ar)).toBe(true);
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
    // Only proof of ownership, which is required of every lessor regardless of the request — and since
    // the owner's ruling of 2026-08-12 that is FOUR rows, one per paper, all four rendered whether held
    // or not so the renter can choose which proof he asks for. Ownership is the one family exempt from
    // the rule this describe block states; nothing else absent-and-unrequested is a row.
    expect(papers(g).map((r) => r.key)).toEqual([
      "doc:ownership:istimara",
      "doc:ownership:customs",
      "doc:ownership:sale_contract",
      "doc:ownership:saso_registration",
    ]);
    expect(g.operator).toBeUndefined();
  });

  it("each ownership row asks for the paper it NAMES — never an istimara by default", () => {
    // The bug this replaced: one any-of row whose ask was hard-coded `askType: "istimara"`, so a
    // supplier holding a sale contract had a green row and an ask demanding a paper he does not have,
    // to prove something already proven (owner, 2026-08-12 — spec §5.4).
    const g = groupBy(machine({ docs: [] }), NO_ASKS);
    expect(papers(g).map((r) => r.docTypes)).toEqual([
      ["istimara"],
      ["customs"],
      ["sale_contract"],
      ["saso_registration"],
    ]);
    for (const row of papers(g)) expect(row.requestable).toBe(true);
  });

  it("holding ONE ownership paper leaves the other three askable and the count at one", () => {
    const g = groupBy(machine({ docs: [{ type: "sale_contract" }] }), NO_ASKS);
    const byKey = new Map(papers(g).map((r) => [r.key, r]));
    expect(byKey.get("doc:ownership:sale_contract")!.status).toBe("present");
    expect(byKey.get("doc:ownership:sale_contract")!.requestable).toBe(false);
    for (const key of ["doc:ownership:istimara", "doc:ownership:customs", "doc:ownership:saso_registration"]) {
      expect(byKey.get(key)!.status).toBe("missing");
      expect(byKey.get(key)!.requestable).toBe(true);
    }
    // ⚠ The rows are four; the gap is one, and here it is CLOSED. A badge reading "3 need attention"
    // beside a machine whose ownership is proven — and whose percentage is therefore complete — would
    // be the surface contradicting its own number.
    expect(paperAttention(g)).toBe(0);
  });

  it("holding NONE of them is ONE gap, not four", () => {
    const g = groupBy(machine({ docs: [] }), NO_ASKS);
    expect(papers(g).filter((r) => r.status === "missing")).toHaveLength(4);
    expect(paperAttention(g)).toBe(1);
  });

  it("an ownership paper that names none of the four is still shown, under its own name", () => {
    // `title_deed` is in the display allow-list but not in the four (nor in the scorer's
    // `OWNERSHIP_DOC_TYPES`). It is on the machine's file, so it is visible; nothing requires it, so it
    // is never red and never asked for. Filing it under the istimara row would claim an istimara.
    const g = groupBy(machine({ docs: [{ type: "title_deed" }] }), NO_ASKS);
    const extra = papers(g).find((r) => r.key === "doc:ownership_other:title_deed")!;
    expect([extra.status, extra.requestable]).toEqual(["on_file", false]);
    expect(papers(g).find((r) => r.key === "doc:ownership:istimara")!.status).toBe("missing");
  });

  it("an unrequested cert the machine DOES hold is shown, openable, and carries no verdict", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), NO_ASKS);
    const row = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.status).toBe("on_file"); // not "present" — nothing was passed, because nothing was asked
    expect(row.statusLine.en).toBe("on the unit's file · not requested");
    expect(docRowActions(row).map((a) => a.kind)).toEqual(["view"]);
    // Not requestable, and yet tickable — for the OTHER batch. Being on the file is what makes it
    // downloadable, which is the 2026-08-08 mode split seen from the not-required row.
    expect(docRowMode(row)).toBe("download");
  });

  it("a held-but-unrequested row raises NOBODY's attention count", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    expect(paperAttention(g)).toBe(0);
    // The held `operator_tuv` raises no count either, because it raises no row: there is no operator
    // group to hold it and `isOperatorDoc` keeps it out of the equipment's papers.
    expect(g.operator).toBeUndefined();
  });

  it("a held-but-unrequested row cannot be ticked — there is nothing to chase", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }, { type: "operator_tuv" }] }), NO_ASKS);
    // Ownership is required of every lessor and this machine holds none, so its four rows are the
    // askable ones — the held TÜV is not, and the held `operator_tuv` is not even a row.
    for (const row of papers(g)) expect(row.requestable).toBe(row.key.startsWith("doc:ownership:"));
  });
});

/* ───────────── ruling 2 — you can only ask for what is not there (owner, 2026-08-08) ───────────── */

describe("a document already on the file is never requestable", () => {
  it("a requested cert is askable when it is ABSENT and not when it is HELD", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const held = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    const gap = papers(g).find((r) => r.key === "doc:equipment_cert:spsp")!;
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
   * `requestable: true`. **Deleted, not inverted** (owner, 2026-08-08): that family was outside the rule
   * rather than a case of it. Since the UAT of 2026-08-11 it is not on this tab at all, and what
   * replaces both is "the operator's documents leave this tab entirely" below. */

  it("makes requestable and missing the SAME set, in EVERY group", () => {
    const g = equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv, spsp"),
    );
    // ~~`g.filter((x) => x.key !== "operator")`~~ — no group is excluded any more, which is the shape of
    // the ruling: one rule, and nothing on this tab standing outside it.
    for (const group of g) {
      for (const row of group.rows) expect(row.requestable).toBe(row.status === "missing");
    }
  });

  it("a group with nothing missing offers nothing to tick", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }] }), asking(["tuv"]));
    expect(paperAttention(g)).toBe(0);
    // ~~`…filter((r) => r.requestable)` is empty~~ — the three unheld ownership rows ARE requestable
    // since 2026-08-12, and deliberately: the renter may ask for a customs card even from a machine
    // whose ownership an istimara has already proven. What "nothing missing" now means is that nothing
    // needs attention — the ownership gap is closed and the requested TÜV is on the file.
    expect(papers(g).filter((r) => r.requestable).map((r) => r.key)).toEqual([
      "doc:ownership:customs",
      "doc:ownership:sale_contract",
      "doc:ownership:saso_registration",
    ]);
  });
});

/* ── the operator's documents leave this tab entirely (owner, UAT of 2026-08-11) ────────────────────
 *
 * *"Operator will not be viewed in the document section at all — only in the equipment field, as its
 * cert exists or not."* This supersedes the part of RM3-AC-75 that described an operator GROUP of
 * status-only rows; the checklist records what it changed to.
 *
 * Six describe blocks used to assert what that group refused to do — no url, no tick, no ask, no count,
 * no place in either batch. They are one block now, and it asserts something stronger and shorter: no
 * operator row exists on this tab **by any door**, whatever the request asks and whatever the lessor
 * holds. The two facts worth keeping from the deleted blocks are kept — the British spelling of the
 * licence, and the machine's own held operator papers — because both are ways an operator paper could
 * come back as an openable, tickable equipment row now that no group of its own would catch it. */
describe("the operator's documents leave this tab entirely", () => {
  /** Every request shape that used to raise an operator group, and every spelling the wire uses. */
  const asks = ["TUV", "SPSP", "CERTIFIED", "SAFETY_CERT", "SAFETY", "TUV, SPSP, CERTIFIED"];
  const holds = ["operator_tuv", "operator_spsp", "operating_license", "operating_licence", "operator_licence"];

  it("raises no operator group, whatever the request asks of him", () => {
    for (const operator of asks) {
      expect(groupBy(machine({ photos: ALL_FOUR, docs: [] }), asking([], operator)).operator).toBeUndefined();
    }
  });

  it("raises no operator ROW anywhere — not in photos, not in documents", () => {
    for (const operator of asks) {
      for (const held of holds) {
        const rows = equipmentDocGroups(machine({ photos: ALL_FOUR, docs: [{ type: held }] }), asking(["tuv"], operator))
          .flatMap((g) => g.rows);
        expect(rows.filter((r) => r.key.startsWith("doc:operator:"))).toEqual([]);
      }
    }
  });

  /**
   * Given a machine holds an operator paper — including `operating_licence`, the British spelling —
   * When the panel groups its papers, Then it is not an openable row under **Documents**.
   *
   * This is the assertion that must never go green by accident. `operating_licence` fails BOTH halves of
   * `isOperatorDoc` unless the set lists it — it does not start with `operator` — and with the operator
   * group gone there is no longer a second home for it to land in instead: it either falls into
   * Documents with a live url, a tickable checkbox and a place in `docDownloadBatch`, or it is nowhere.
   */
  it("never falls back into Documents — no url, no tick, no batch", () => {
    for (const held of holds) {
      const m = machine({ photos: ALL_FOUR, docs: [{ type: held }] });
      for (const request of [NO_ASKS, asking([], "CERTIFIED"), asking(["tuv"], "TUV")]) {
        const groups = equipmentDocGroups(m, request);
        const rows = groups.flatMap((g) => g.rows);
        // Not a row of any kind, and in particular not a `doc:other:*` one.
        expect(rows.some((r) => r.key.includes("licence") || r.key.includes("license"))).toBe(false);
        expect(rows.some((r) => r.key.startsWith("doc:other:"))).toBe(false);
        // …and its url reaches nothing: not a row's `files`, not the download batch, not the ask.
        expect(JSON.stringify(groups)).not.toContain(`https://x/${held}`);
        const everything = new Set(rows.map((r) => r.key));
        expect(docDownloadBatch(rows, everything).map((t) => t.url)).not.toContain(`https://x/${held}`);
        expect(JSON.stringify(batchDocumentRequest("eq-1", rows, everything) ?? {})).not.toContain("operator");
      }
    }
  });

  /**
   * Given the request asks for an operator certificate the machine does not hold, When the renter reads
   * the panel, Then the **match grid** says so — that is where the statement moved, and the ruling is
   * only half kept if it vanished from the documents tab and nowhere reported it.
   */
  it("still says whether the operator's certificate exists — in the equipment field", () => {
    const gap = cellsBy(machine({ docs: [] }), asking([], "TUV")).operator_cert;
    expect(gap.state).toBe("red");
    expect(gap.en).toContain("Missing");
    const held = cellsBy(machine({ docs: [{ type: "operator_tuv" }] }), asking([], "TUV")).operator_cert;
    expect(held.state).toBe("green");
    expect(held.en).toContain("on the unit's file");
  });

  /** …and it opens nothing. The cell presses only when there is a file to show, and an operator paper
   *  is never one: nothing validates it on upload (RM3-AC-75's surviving half). */
  it("gives the operator cell no evidence to open, held or not", () => {
    for (const m of [machine({ docs: [] }), machine({ docs: [{ type: "operator_tuv" }] })]) {
      const cell = matchGrid(m, asking([], "TUV")).find((c) => c.key === "operator_cert")!;
      expect(cell.evidence).toBeNull();
    }
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
      // A photo row is not worded differently from a paper row — the app files both through one
      // `_rowShell`, which says only `bidReadinessDocOnFile`. ~~«· not required»~~ — the tail moved onto
      // the grid's «not requested» in the UAT of 2026-08-11, so one tab cannot say "required" where the
      // other says "requested" about the same paper.
      "on the unit's file · not requested",
      false,
    ]);
    expect(g.photos.attention).toBe(0);
  });
});

describe("a row holding several files exposes EVERY one of them", () => {
  /* ~~"OWNERSHIP had the bug — an istimara AND a customs card both reach the renter"~~ — the bug and
     its fix are both still real, but ownership is no longer the example. Since the owner's ruling of
     2026-08-12 an istimara and a customs card are TWO rows, one file each, so they can no longer
     demonstrate one row holding two files. The multi-file rule is unchanged and is asserted below on
     the families that still produce it: two spellings of one ownership paper, and two TÜV uploads. */

  it("OWNERSHIP still holds several — two spellings of one paper are one row and two files", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "istimarah", url: "https://x/ist2" },
        ],
      }),
      NO_ASKS,
    );
    const row = papers(g).find((r) => r.key === "doc:ownership:istimara")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/ist", "https://x/ist2"]);
    expect(docRowActions(row).map((a) => a.href)).toEqual(["https://x/ist", "https://x/ist2"]);
    // The invariant survives the second file: exactly one primary, and it is the first file's view.
    expect(docRowActions(row).filter((a) => a.primary)).toHaveLength(1);
    expect(docRowActions(row).filter((a) => a.primary)[0]).toMatchObject({ kind: "view", href: "https://x/ist" });
  });

  it("an istimara and a customs card are TWO rows now, each reaching its own file", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "customs_card", url: "https://x/cus" },
        ],
      }),
      NO_ASKS,
    );
    const byKey = new Map(papers(g).map((r) => [r.key, r]));
    expect(byKey.get("doc:ownership:istimara")!.files.map((f) => f.url)).toEqual(["https://x/ist"]);
    expect(byKey.get("doc:ownership:customs")!.files.map((f) => f.url)).toEqual(["https://x/cus"]);
    // Neither paper is lost and neither is duplicated: `customs_card` is the customs row's spelling.
    expect(byKey.get("doc:ownership:sale_contract")!.files).toEqual([]);
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
    const row = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(row.files.map((f) => f.url)).toEqual(["https://x/tuv-a", "https://x/tuv-b"]);
    expect(docRowActions(row)).toHaveLength(2);
  });

  it("names each file after its own type, so two controls are never two unlabelled twins", () => {
    const g = groupBy(
      machine({
        docs: [
          { type: "tuv", url: "https://x/tuv-a" },
          { type: "tüv", url: "https://x/tuv-b" },
        ],
      }),
      asking(["tuv"]),
    );
    const row = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    // `tüv` is not in `DOC_TYPE_LABEL`, so it humanises to its own spelling — which is the point: each
    // file is named after ITS type, not after the row's.
    expect(row.files.map((f) => f.label.en)).toEqual(["TÜV certificate", "Tüv"]);
    expect(row.files.map((f) => f.label.ar)).toEqual(["شهادة TÜV", "Tüv"]);
  });

  it("a file with no url is not a control — it cannot become a link to nowhere", () => {
    const g = groupBy(
      machine({ docs: [{ type: "istimara", url: null }, { type: "istimarah", url: "https://x/ist2" }] }),
      NO_ASKS,
    );
    const row = papers(g).find((r) => r.key === "doc:ownership:istimara")!;
    expect(row.status).toBe("present"); // the paper IS on the file; only its link is absent
    expect(docRowActions(row).map((a) => a.href)).toEqual(["https://x/ist2"]);
  });
});

describe("the batch ask raised from the equipment's papers (RM3-AC-38)", () => {
  /* A test here asserted the batch ask raised FROM the operator's section — that ticking its rows
   * composed a draft naming `operator_safety_certificate`. **Deleted rather than inverted** (owner,
   * 2026-08-08): *"operator docs cannot be viewed or requested and are not part of docs."* There is no
   * such ask to describe, so the assertion belongs with the group's inertness, not here. What replaces
   * it is stronger — that no operator row can reach the composer however the selection was arrived at —
   * and it lives in "the operator's group participates in nothing" below. */

  it("names the PAPER the renter ticked, not the category it belongs to", () => {
    /**
     * Owner, 2026-09-05: *"When the renter asks about a specific document of the equipment, it is
     * sent as a general safety document — the card in the chat must mention exactly the requested
     * document name."*
     *
     * ~~Only TÜV and SPSP went out precisely; SASO and the insurance went out as
     * `equipment_safety_certificate`, which the supplier read as «Safety certificate».~~ Every
     * certificate the platform can store on a machine is named now — the backend judges an ask
     * against the listing vocabulary as well as the catalogue (`ASKABLE_DOCUMENT_TYPES`).
     */
    const g = groupBy(machine({ docs: [] }), asking(["tuv", "spsp", "saso", "insurance"]));
    const rows = papers(g).filter((r) => r.key.startsWith("doc:equipment_cert:"));
    const draft = batchDocumentRequest("eq-1", rows, new Set(rows.map((r) => r.key)));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["tuv", "spsp", "saso", "insurance"]);
  });

  it("still asks coarsely for a certificate the platform cannot file", () => {
    // An Aramco certificate can be REQUIRED by a request and stored nowhere: it is in neither the
    // listing enum nor the seeded catalogue, so naming it would 400 the whole ask. It goes out as the
    // category until the backend has a row for it — the one case where the supplier still reads
    // «Safety certificate», and the reason the fallback survives.
    const g = groupBy(machine({ docs: [] }), asking(["aramco"]));
    const rows = papers(g).filter((r) => r.key.startsWith("doc:equipment_cert:"));
    const draft = batchDocumentRequest("eq-1", rows, new Set(rows.map((r) => r.key)));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual(["equipment_safety_certificate"]);
  });

  it("asks for the paper, not for a second copy of one already on the file", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }, { type: "tuv" }] }), asking(["tuv"]));
    // The held istimara and the held TÜV are both dropped — that is the rule, and it is what this
    // asserts. ~~"the batch is null"~~: it is not null any more, because the three ownership papers
    // this machine does NOT hold are rows now (owner, 2026-08-12) and each is legitimately askable.
    const draft = batchDocumentRequest("eq-1", papers(g), new Set(papers(g).map((r) => r.key)));
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual([
      "customs",
      "sale_contract",
      "saso_registration",
    ]);
  });

  it("drops a held row from the ask even when it was somehow ticked", () => {
    const g = groupBy(machine({ docs: [{ type: "tuv" }] }), asking(["tuv", "spsp"]));
    const draft = batchDocumentRequest("eq-1", papers(g), new Set(papers(g).map((r) => r.key)));
    // All four ownership papers and the SPSP are missing; the held TÜV is not in the payload however
    // the set was arrived at. Each ownership type names itself — the whole of the 2026-08-12 ruling.
    expect(draft && draft.kind === "document" && draft.docTypes).toEqual([
      "istimara",
      "customs",
      "sale_contract",
      "saso_registration",
      "spsp",
    ]);
  });
});

/* ───── ~~ruling 1 — the operator's documents are a STATUS, not a document list~~ (owner, 2026-08-08),
 * ~~narrowed the same day to a group that participates in nothing~~ ─────────────────────────────────
 *
 * Two describe blocks stood here — one asserting what the operator's rows SAID, one asserting the long
 * list of things they refused to do. **Both are answered by the group's absence** (owner, UAT of
 * 2026-08-11), and by the block above, which walks every request code and every wire spelling and finds
 * no operator row on this tab at all: a row that does not exist cannot be ticked, asked for, opened,
 * counted or batched, and the assertion is stronger for being about existence rather than about six
 * mechanisms declining one row.
 *
 * What did NOT come from the group's own rendering is kept, and it is the part that outlives it — the
 * scorer's translation of a request CODE into the paper a lessor actually files. It is now read where
 * the operator's one surviving statement is made: the match grid. */
describe("what the operator's cell inherits from the scorer", () => {
  it("reads the SCORER's `present`, so the panel and the readiness card cannot disagree", () => {
    // The scorer translates the request code `CERTIFIED` into the kind a machine actually carries
    // (`operating_license`) — the app's table. Bucketing `documentKeys` a second time here is exactly
    // the second opinion this avoids, so the panel inherits that translation rather than repeating it.
    // A prefix test alone would read a held `operating_license` as missing and print red over a machine
    // whose licence is on the file.
    const c = cellsBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "CERTIFIED")).operator_cert;
    expect(c.state).toBe("green");
    expect(c.en).toContain("on the unit's file");
  });

  it("scores NO code that names no document — never a permanently red cell", () => {
    // A code outside the app's table (`GRADE-1`, free text, a paper the platform does not carry) names
    // nothing a lessor could upload. The scorer drops it, so the renter is not shown a gap the supplier
    // can never close. The licence asked for alongside it is still scored.
    const c = cellsBy(machine({ docs: [{ type: "operating_license" }] }), asking([], "GRADE-1, CERTIFIED")).operator_cert;
    expect(c.state).toBe("green");
  });

  it("folds the three spellings of the licence into one finding, not three", () => {
    const c = cellsBy(machine({ docs: [] }), asking([], "CERTIFIED, SAFETY_CERT, SAFETY")).operator_cert;
    expect(c.state).toBe("red");
    // One name after «Missing», not the same paper listed three times.
    expect(c.en.split(" · ")).toHaveLength(1);
  });

  it("the tab's attention badge counts the two groups that remain, and nothing else", () => {
    const groups = equipmentDocGroups(
      machine({ photos: [{ slot: "front" }], docs: [{ type: "istimara" }, { type: "operator_tuv" }] }),
      asking(["tuv"], "tuv, spsp"),
    );
    // `EquipmentDetail` sums `g.attention`. The plate photo and the missing TÜV are the whole badge; the
    // missing operator SPSP is the grid's to report and is counted nowhere here.
    expect(groups.reduce((n, g) => n + g.attention, 0)).toBe(2);
    expect(groups.every((g) => typeof g.attention === "number")).toBe(true);
  });
});

/* ──────────── V15 — every document is VIEWABLE (004a §7, RM3-AC-69, narrowed 2026-08-08) ────────────
 *
 * The per-row **download** is withdrawn by the owner's UI design of 2026-08-08: downloading is the batch
 * action now, so a row keeps exactly one control — view — and RM3-AC-69 is narrowed to match rather than
 * left contradicting the code. The second clause is untouched: a row with no url exposes NOTHING.
 */

describe("docRowActions — view, and neither a download glyph nor a dead button (RM3-AC-69)", () => {
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

describe("every document family on this surface is openable (RM3-AC-69)", () => {
  it("equipment PAPERS — a held paper gets view, an absent one gets nothing", () => {
    const g = groupBy(machine({ docs: [{ type: "istimara" }] }), asking(["tuv"], "tuv"));
    const ownership = papers(g).find((r) => r.key === "doc:ownership:istimara")!;
    const cert = papers(g).find((r) => r.key === "doc:equipment_cert:tuv")!;
    expect(docRowActions(ownership).map((a) => a.kind)).toEqual(["view"]);
    expect(docRowActions(cert)).toEqual([]);
    // ~~The operator's rows are the deliberate exception — never openable, held or not.~~ There is no
    // exception left to state: every row on this tab is one of the machine's own papers or photos.
    expect(g.operator).toBeUndefined();
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
        "on the unit's file",
        "Missing",
        "on the unit's file · not requested",
      ]).toContain(row.statusLine.en);
      // The row's whole shape, so a verify badge or an expiry cannot arrive by accident. `anyOfGroup`
      // joined it on 2026-08-12 and is present ONLY on the four ownership rows — it says which rows are
      // alternatives to one another, which is a fact about counting, not about verification.
      const shape = ["docTypes", "downloadUrl", "files", "key", "label", "requestable", "status", "statusLine", "thumbUrl"];
      expect(Object.keys(row).sort()).toEqual(
        row.key.startsWith("doc:ownership:") ? ["anyOfGroup", ...shape].sort() : shape,
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
  const HELD_PAPER = "doc:ownership:istimara";
  const MISSING_PAPER = "doc:equipment_cert:tuv";
  /**
   * The three ownership papers this machine does NOT hold, in row order.
   *
   * They are new to every enumeration in this block, and they are not noise: since the owner's ruling
   * of 2026-08-12 all four ownership rows render whether held or not, so a machine proven by an
   * istimara still offers the other three to ask for. They behave exactly like any other missing row —
   * `request` mode, tickable at neutral, dropped while `download` holds — which is the point of listing
   * them rather than filtering them out.
   */
  const UNHELD_OWNERSHIP = [
    "doc:ownership:customs",
    "doc:ownership:sale_contract",
    "doc:ownership:saso_registration",
  ];

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
    expect(selectableKeys(rows, null)).toEqual([
      HELD_PHOTO,
      MISSING_PHOTO,
      HELD_PAPER,
      ...UNHELD_OWNERSHIP,
      MISSING_PAPER,
    ]);
  });

  it("while DOWNLOAD holds, the missing rows stop responding", () => {
    const rows = mixed();
    const mode = selectionModeOf(rows, new Set([HELD_PHOTO]));
    expect(selectableKeys(rows, mode)).toEqual([HELD_PHOTO, HELD_PAPER]);
    expect(docRowSelectable(rowAt(rows, MISSING_PAPER), mode)).toBe(false);
    // The three unheld ownership rows are missing rows like any other, so download mode drops them too.
    for (const key of UNHELD_OWNERSHIP) expect(docRowSelectable(rowAt(rows, key), mode)).toBe(false);
  });

  it("while REQUEST holds, the held rows stop responding", () => {
    const rows = mixed();
    const mode = selectionModeOf(rows, new Set([MISSING_PAPER]));
    expect(selectableKeys(rows, mode)).toEqual([MISSING_PHOTO, ...UNHELD_OWNERSHIP, MISSING_PAPER]);
    expect(docRowSelectable(rowAt(rows, HELD_PAPER), mode)).toBe(false);
  });

  it("clearing the last tick returns to neutral and re-enables everything", () => {
    const rows = mixed();
    const held = new Set([MISSING_PAPER]);
    expect(selectionModeOf(rows, held)).toBe("request");
    held.delete(MISSING_PAPER);
    // Neutral is not a reset somebody has to remember — the mode is derived, so it falls out.
    expect(selectionModeOf(rows, held)).toBeNull();
    expect(selectableKeys(rows, selectionModeOf(rows, held))).toHaveLength(4 + UNHELD_OWNERSHIP.length);
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

  /* ~~"the operator's certificates tick in NEITHER mode — held or absent"~~ — the rows those two
   * assertions were made about are not built any more (owner, UAT of 2026-08-11), and a test of
   * `docRowMode` over a hand-made operator row would be a test of a fixture. The `null` mode itself is
   * still exercised, one test above, by the row that actually produces it now: a held paper whose link
   * the projection did not carry. */

  it("select-all is per mode: each list holds only the rows that mode can act on", () => {
    const rows = mixed();
    // «حدّد كل المتاح» and «حدّد كل الناقص» are these two lists; neither can reach the other's rows.
    const available = rows.filter((r) => docRowMode(r) === "download").map((r) => r.key);
    const missing = rows.filter((r) => docRowMode(r) === "request").map((r) => r.key);
    expect(available).toEqual([HELD_PHOTO, HELD_PAPER]);
    expect(missing).toEqual([MISSING_PHOTO, ...UNHELD_OWNERSHIP, MISSING_PAPER]);
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
    // Two spellings of ONE paper, because an istimara and a customs card are two rows since
    // 2026-08-12. The rule under test is untouched: one row, two files, two separately named targets.
    const rows = equipmentDocGroups(
      machine({
        docs: [
          { type: "istimara", url: "https://x/ist" },
          { type: "istimarah", url: "https://x/ist2" },
        ],
      }),
      NO_ASKS,
    ).flatMap((g) => g.rows);
    const batch = docDownloadBatch(rows, new Set([HELD_PAPER]));
    expect(batch.map((t) => t.url)).toEqual(["https://x/ist", "https://x/ist2"]);
    // Two files of one row would otherwise land on disk under one name.
    expect(batch.map((t) => t.label.en)).toEqual(["Registration (Istimara) 1", "Registration (Istimara) 2"]);
    expect(batch.map((t) => t.label.ar)).toEqual(["الاستمارة 1", "الاستمارة 2"]);
  });

  it("a single-file row keeps the ROW's own name — nothing is numbered that has no sibling", () => {
    const rows = mixed();
    // And the row's own name is the PAPER's name now, not the group heading «إثبات الملكية / التسجيل» —
    // the ruling of 2026-08-12 read off the download batch.
    expect(docDownloadBatch(rows, new Set([HELD_PAPER])).map((t) => t.label.en)).toEqual([
      "Registration (Istimara)",
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
    expect(draft.labels.map((l) => l.en)).toEqual([
      "Plate / serial",
      // The three ownership papers this machine does not hold. Each names itself — the point of the
      // 2026-08-12 split — so an ask raised over all of them says customs card, sale contract and SASO
      // registration rather than three copies of "istimara".
      "Customs card",
      "Sale contract",
      "SASO registration",
      "TÜV certificate",
    ]);
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

  /* Rows that are ALTERNATIVES count once (owner, 2026-08-12). Ownership is the only such group: four
     rows, one question, one point in the fraction — so one item of attention at most. */
  it("counts a set of alternatives ONCE while none of them is answered", () => {
    expect(
      attentionCount([
        { status: "missing", anyOfGroup: "ownership" },
        { status: "missing", anyOfGroup: "ownership" },
        { status: "missing", anyOfGroup: "ownership" },
        { status: "missing", anyOfGroup: "ownership" },
      ]),
    ).toBe(1);
  });

  it("counts a set of alternatives at ZERO once ANY of them is answered", () => {
    expect(
      attentionCount([
        { status: "missing", anyOfGroup: "ownership" },
        { status: "present", anyOfGroup: "ownership" },
        { status: "missing", anyOfGroup: "ownership" },
      ]),
    ).toBe(0);
  });

  it("still counts every ungrouped row on its own, beside a group", () => {
    expect(
      attentionCount([
        { status: "missing" },
        { status: "missing", anyOfGroup: "ownership" },
        { status: "missing", anyOfGroup: "ownership" },
        { status: "missing" },
      ]),
    ).toBe(3);
  });
});

describe("batchDocumentRequest — one request naming several types (RM3-AC-38)", () => {
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
   * for a batch **download**, not an ask (RM3-AC-72) — and are covered at the bottom of this file; nothing
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

describe("companyInitials — the header's tile", () => {
  it("takes the first letter of each of the first two words, in either script", () => {
    expect(companyInitials("Al Rajhi Equipment")).toBe("AR");
    expect(companyInitials("شركة الراجحي للمعدّات")).toBe("شا");
  });

  it("takes what there is when there is only one word", () => {
    expect(companyInitials("Rajhi")).toBe("R");
  });

  it("is empty for an empty or blank name, so the component can render NO tile", () => {
    // An empty 40 px box is furniture. The panel checks the string rather than being handed a
    // placeholder letter it would then have to explain.
    for (const name of ["", "   ", null, undefined]) expect(companyInitials(name)).toBe("");
  });

  it("does not read past the first two words, however long the legal name is", () => {
    expect(companyInitials("A B C D E")).toBe("AB");
  });
});

describe("companyDocRows — verification AND expiry, unlike the equipment rows (RM3-AC-40)", () => {
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

  it("carries NO IBAN row — the product owner removed it, so the spec (§6.1 / RM3-AC-41) is now wrong", () => {
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

/* ───────── the company panel's selection — ticks that DOWNLOAD, never ask (RM3-AC-72) ───────── */

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
describe("the company panel's batch — download, and only over rows with a file (RM3-AC-69, RM3-AC-72)", () => {
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

/* ───────── SASO: the registration proves OWNERSHIP, it does not certify the machine ─────────
 *
 * Owner's ruling, 2026-08-09: *"`saso_registration` is PROOF OF OWNERSHIP. `saso_technical_inspection`
 * is the CERTIFICATE."*
 *
 * The panel's own vocabulary was already right — `saso_registration` sits in `OWNERSHIP_TYPES` and is
 * deliberately absent from the `EQUIPMENT_CERT_TYPES` allow-list, so its rows never called the
 * registration a certificate. The SCORER did not agree: `canonicalCertCode` folded every `saso*` token
 * into the `saso` family, so on a legacy SASO request the panel showed a **missing, requestable**
 * certificate row while the readiness bar over it read 100% green off the very same paper. These pin
 * both halves and, above all, that they now say the same thing.
 *
 * (SASO is no longer offerable as an ask on either client, so the fixtures are legacy requests.)
 */
describe("SASO — registration vs. certificate on the machine panel (owner's ruling, 2026-08-09)", () => {
  const SASO_ASK = asking(["saso"]);
  const rowsOf = (m: FleetMachine) => papers(groupBy(m, SASO_ASK));
  const find = (m: FleetMachine, key: string) => rowsOf(m).find((r) => r.key === key)!;

  it("saso_registration satisfies PROOF OF OWNERSHIP — it is a real paper and it counts as one", () => {
    const m = machine({ docs: [{ type: "saso_registration" }] });
    // Its own row since 2026-08-12, named after the paper — an ask raised here says
    // `saso_registration`, not `istimara`.
    const ownership = find(m, "doc:ownership:saso_registration");
    expect(ownership.status).toBe("present");
    expect(ownership.requestable).toBe(false); // nothing left to chase
    expect(ownership.docTypes).toEqual(["saso_registration"]);
    expect(cellsBy(m, SASO_ASK).ownership.state).toBe("green");
  });

  it("…and the SASO CERTIFICATE is still missing, and still offered to be asked for", () => {
    const m = machine({ docs: [{ type: "saso_registration" }] });
    const cert = find(m, "doc:equipment_cert:saso");
    expect(cert.status).toBe("missing");
    // The load-bearing one: the path to fixing the gap must survive the gap.
    expect(cert.requestable).toBe(true);
    expect(cellsBy(m, SASO_ASK).equipment_cert.state).toBe("red");
  });

  it("the row and the readiness bar agree — pre-fix the row read missing while the bar read 100%", () => {
    const m = machine({ photos: ALL_FOUR, docs: [{ type: "saso_registration" }] });
    const inputs = readinessInputsFor(SASO_ASK);
    const r = computeUnitReadiness(m, inputs.equipCerts, inputs.operatorCerts, inputs.minYear);
    expect(r.equipmentCerts.map((c) => c.code)).toEqual(["saso"]);
    expect(r.equipmentCerts[0].present).toBe(false);
    expect(r.percent).not.toBe(100);
    expect(find(m, "doc:equipment_cert:saso").status).toBe("missing");
  });

  it("saso_technical_inspection satisfies the CERTIFICATE and is not an ownership paper", () => {
    const m = machine({ docs: [{ type: "saso_technical_inspection" }] });
    expect(find(m, "doc:equipment_cert:saso").status).toBe("present");
    // No ownership row is satisfied by it — all four are still missing and all four askable.
    for (const code of ["istimara", "customs", "sale_contract", "saso_registration"]) {
      expect(find(m, `doc:ownership:${code}`).status).toBe("missing");
      expect(find(m, `doc:ownership:${code}`).requestable).toBe(true);
    }
  });

  it("holding BOTH clears both — one ownership row, one certificate row, each satisfied once", () => {
    const m = machine({ docs: [{ type: "saso_registration" }, { type: "saso_technical_inspection" }] });
    expect(rowsOf(m).filter((r) => r.key.startsWith("doc:equipment_cert:"))).toHaveLength(1);
    expect(find(m, "doc:ownership:saso_registration").status).toBe("present");
    expect(find(m, "doc:equipment_cert:saso").status).toBe("present");
    // The registration is not ALSO filed as a stray `doc:other:*` row.
    expect(rowsOf(m).some((r) => r.key.startsWith("doc:other:"))).toBe(false);
  });
});

/**
 * A requested certificate outside the five mapped codes used to fall through to `docTypeLabel`,
 * which is locale-independent by design and returns humanised English for BOTH locales. Correct for
 * an arbitrary wire type; wrong for a certificate, because the code arrived through the request's
 * own `reqEquipmentCerts` and is therefore known to BE one. An Arabic panel rendered a row headed
 * "Certified".
 */
describe("an unmapped equipment certificate still gets an Arabic heading", () => {
  const rowFor = (cert: string, machine = { documentKeys: [], photoKeys: [] }) =>
    equipmentDocGroups(machine as never, { reqEquipmentCerts: [cert] } as never)
      .flatMap((g) => g.rows as { key: string; label: { en: string; ar: string } }[])
      .find((r) => r.key.startsWith("doc:equipment_cert:"));

  it("translates the category and leaves the NAME alone", () => {
    const row = rowFor("certified");
    expect(row?.label.en).toBe("CERTIFIED certificate");
    // The Arabic must not be the English string. The name stays Latin — as TÜV and SPSP already do,
    // because a certificate's name is a proper noun.
    expect(row?.label.ar).not.toBe(row?.label.en);
    expect(row?.label.ar).toContain("CERTIFIED");
  });

  it("upper-cases the name so it reads as a name beside TÜV, not as a stray word", () => {
    expect(rowFor("safety_cert")?.label.en).toBe("SAFETY CERT certificate");
  });

  it("leaves the five mapped codes exactly as they were", () => {
    expect(rowFor("tuv")?.label.en).toBe("TÜV certificate");
    expect(rowFor("insurance")?.label.en).toBe("Equipment insurance");
  });
});

/* ══════════════ the UAT of 2026-08-11, where it is a RENDERING rule ══════════════
 *
 * Four of the owner's findings are not decisions the model can hold — they are about what the panel
 * draws. This file has no component harness (see its head), so they are asserted the way
 * `availability-chip.test.ts` asserts its own negatives: against the source, with the commentary
 * stripped, because these files explain at length using the very words the rules withdraw.
 *
 * They are here rather than in a file of their own because each one is the other half of a model rule
 * above — the frame the evidence goes into, the row the «مفقود» is printed on.
 */
const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

describe("the equipment tab is called Equipment, in both locales", () => {
  it("names the tab with the word the rest of the surface uses", () => {
    const code = stripComments(src("src/components/map/panel/EquipmentDetail.tsx"));
    expect(code).toContain('L("Equipment", "المعدّة")');
    // ~~«The machine»~~ — the owner's *"for the machine tab call it Equipment"*.
    expect(code).not.toContain('"The machine"');
  });
});

describe("the frame carries no X, and renders the document (owner, UAT of 2026-08-11)", () => {
  const detail = () => stripComments(src("src/components/map/panel/EquipmentDetail.tsx"));

  it("has no close control and no glyph to draw one with", () => {
    const code = detail();
    // The path pair that drew it, and the label it carried. Neither may come back quietly.
    expect(code).not.toContain("M6 6l12 12");
    expect(code).not.toContain("GLYPH.close");
  });

  it("still has a way back to the machine's photograph — the press that opened the paper", () => {
    // Removing the X without this would strand the last paper the renter opened in the frame until he
    // left the machine entirely. The toggle is the replacement, and it is what makes the X removable.
    expect(detail()).toContain("cur?.key === subject.key ? null : subject");
  });

  it("draws a file the <img> could not, rather than a message about it", () => {
    const code = detail();
    expect(code).toContain("<object");
    expect(code).toContain("mp-frame-doc");
    // The message survives as the object's FALLBACK — the browser paints it only when it has nothing
    // else to paint, so a DWG still lands somewhere honest.
    expect(code).toContain("Open it in a new tab");
  });

  it("gives the frame a size for a document", () => {
    // The `<object>` is a new element in an old frame; if the stylesheet did not carry it, a PDF would
    // render at its intrinsic size inside a 268 px box.
    expect(src("src/components/map/panel/panel-proto.css")).toContain(".mp-frame-doc {");
  });
});

describe("a match cell that opens its evidence is a control, and only then", () => {
  const detail = () => stripComments(src("src/components/map/panel/EquipmentDetail.tsx"));

  it("renders a button when there is evidence and a plain block when there is not", () => {
    const code = detail();
    expect(code).toContain("`mp-cell ${c.state} press");
    // The negative arm: `!ev` draws the same two lines with no control around them.
    expect(code).toContain("if (!ev)");
  });

  it("says which cell the frame is holding in words, not only in colour", () => {
    expect(detail()).toContain('aria-current={framedHere ? "true" : undefined}');
  });
});

describe("no per-row arrow where the row itself opens the paper", () => {
  const list = () => stripComments(src("src/components/map/panel/DocRowList.tsx"));

  it("drops the arrow for the file the press already frames", () => {
    expect(list()).toContain("if (openable && i === 0) return null;");
  });

  it("keeps the actions cell only where a row still has an arrow to draw", () => {
    const code = list();
    // Otherwise every row on the equipment tab would hold 34 px of empty gutter for a control none of
    // them has — and the question has to be asked of the LIST, or the column would zig-zag.
    expect(code).toContain("const arrowsShown = rows.some(");
    expect(code).toContain("{arrowsShown && (");
  });

  it("leaves a list with no viewer — the company panel — every one of its arrows", () => {
    // `onView` is what says "this list has a frame to press into". Without it the arrow is the only way
    // to read a paper, and AC-69 requires one.
    expect(list()).toContain("docRowActions(r).length > (onView ? 1 : 0)");
  });
});

describe("one selection colour on this surface (owner, UAT of 2026-08-11)", () => {
  /** Every rule in the panel's stylesheet whose selector is about being selected, picked or framed. */
  const selectionRules = () => {
    const css = src("src/components/map/panel/panel-proto.css").replace(/\/\*[\s\S]*?\*\//g, " ");
    return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .map((m) => ({ selector: m[1].trim(), body: m[2] }))
      .filter((r) => /\.(picked|open)\b|\.mp-tick\.on\b/.test(r.selector));
  };

  it("paints every selected, picked or framed thing the same navy", () => {
    const rules = selectionRules();
    // The fixture must actually cover the family — a ticked row, a ticked box, a framed row, a framed
    // cell — or "they all agree" is trivially true of an empty list.
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const rule of rules) {
      expect(rule.body.toLowerCase()).toContain("#16304f");
      // `var(--info)` is this surface's ACTION colour (AC-33), never a state. A selection wearing it reads
      // as something still to be pressed.
      expect(rule.body.toLowerCase()).not.toContain("var(--info)");
    }
  });

  it("covers the match cell, which is the newest thing that can be selected", () => {
    expect(selectionRules().some((r) => r.selector.includes(".mp-cell"))).toBe(true);
  });
});
